import { ABILITY_SPECS, BUILDING_SPECS, FACTION_SPECS, MAPS, UNIT_SPECS } from './catalog';
import {
  calculateCombatDamage,
  calculatePowerEfficiency,
  clampReplayEvents,
  getTerrainAt,
  getWeatherModifiers,
  isTerrainPassableForGround,
  pointInZone,
} from './rules';
import {
  AbilityId,
  AiDifficulty,
  Building,
  BuildingTypeId,
  CaptureSector,
  CraterDecal,
  FactionId,
  FactionSide,
  GameMapSpec,
  GameMode,
  MapId,
  MatchSummaryStats,
  MultiplayerCommand,
  Projectile,
  ReplayEvent,
  ResourceNode,
  SideEconomy,
  SoldierMember,
  Squad,
  SquadFormation,
  SquadStance,
  TreadMark,
  UnitTypeId,
  WeatherType,
} from './types';
import { tacticalAudio } from './audio';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'spark' | 'smoke' | 'ring' | 'text';
  text?: string;
}

export interface ReconPing {
  x: number;
  y: number;
  radius: number;
  timer: number;
  side: FactionSide;
}

const PARTICLE_POOL_SIZE = 320;
const FOG_CELL_SIZE = 25;

export class RtsEngine {
  public map: GameMapSpec;
  public mode: GameMode;
  public difficulty: AiDifficulty;
  public localSide: FactionSide;
  public factions: Record<FactionSide, FactionId>;
  public playerTracerColor: string;
  public playerCamo: string;
  public playerBuildingTheme: string;
  public playerVisorColor: string;
  public playerArmorStyle: string;
  public playerBannerEmblem: string;

  public squads: Squad[] = [];
  public buildings: Building[] = [];
  public projectiles: Projectile[] = [];
  public craters: CraterDecal[] = [];
  public treadMarks: TreadMark[] = [];
  public nodes: ResourceNode[] = [];
  public sectors: CaptureSector[] = [];
  public reconPings: ReconPing[] = [];

  // Pre-allocated zero-GC particle ring buffer
  public particles: Particle[];
  private particleCursor = 0;

  public economy: Record<FactionSide, SideEconomy>;
  public weather: WeatherType = 'clear';
  public weatherTimer = 0;
  public weatherIndex = 0;

  public elapsed = 0;
  public hitstopTimer = 0;
  public cameraTrauma = 0;
  public winner: FactionSide | null = null;

  // Fog of War grid (0 = unexplored, 1 = explored, 2 = visible)
  public fogCols: number;
  public fogRows: number;
  public fogGrid: Uint8Array;
  public fogVersion = 1;
  private fogUpdateTimer = 0;

  // Match telemetry & replay recorder
  public stats = {
    unitsTrained: 0,
    enemiesEliminated: 0,
    sectorsCaptured: 0,
    alloyHarvested: 0,
    damageDealt: 0,
    tanksDeployed: 0,
  };
  public replayEvents: ReplayEvent[] = [];
  private lastSnapshotTime = -10;
  private aiDecisionTimer = 1.5;
  private idCounter = 1;
  private onCommandEmit?: (cmd: MultiplayerCommand) => void;

  constructor(options: {
    mapId: MapId;
    mode: GameMode;
    difficulty: AiDifficulty;
    localSide?: FactionSide;
    localFaction?: FactionId;
    enemyFaction?: FactionId;
    playerTracerColor?: string;
    playerCamo?: string;
    playerBuildingTheme?: string;
    playerVisorColor?: string;
    playerArmorStyle?: string;
    playerBannerEmblem?: string;
    onCommandEmit?: (cmd: MultiplayerCommand) => void;
  }) {
    this.map = MAPS[options.mapId];
    this.mode = options.mode;
    this.difficulty = options.difficulty;
    this.localSide = options.localSide ?? 'blue';
    const localFac: FactionId = options.localFaction ?? 'indonesia';
    const fallbackEnemy: FactionId = localFac === 'russia' ? 'usa' : 'russia';
    const enemyFac: FactionId = options.enemyFaction ?? fallbackEnemy;
    this.factions =
      this.localSide === 'blue'
        ? { blue: localFac, red: enemyFac }
        : { blue: enemyFac, red: localFac };
    this.playerTracerColor = options.playerTracerColor ?? '#fbbf24';
    this.playerCamo = options.playerCamo ?? 'cobalt';
    this.playerBuildingTheme = options.playerBuildingTheme ?? 'standard';
    this.playerVisorColor = options.playerVisorColor ?? '#f59e0b';
    this.playerArmorStyle = options.playerArmorStyle ?? 'standard';
    this.playerBannerEmblem = options.playerBannerEmblem ?? 'chevron';
    this.onCommandEmit = options.onCommandEmit;

    this.particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 2,
      color: '#fff',
      kind: 'spark',
    }));

    this.fogCols = Math.ceil(this.map.width / FOG_CELL_SIZE);
    this.fogRows = Math.ceil(this.map.height / FOG_CELL_SIZE);
    this.fogGrid = new Uint8Array(this.fogCols * this.fogRows);

    this.economy = {
      blue: this.createInitialEconomy(),
      red: this.createInitialEconomy(),
    };

    this.weather = this.map.weatherCycle[0] ?? 'clear';
    this.initializeMapState();
    this.updateFogOfWar();
    this.recordSnapshot('spawn', this.localSide, 'Pasukan garis depan dikerahkan ke sektor awal.');
  }

  private createInitialEconomy(): SideEconomy {
    return {
      alloy: 460,
      energyProduced: 12,
      energyDemand: 0,
      powerEfficiency: 1,
      supplyUsed: 0,
      supplyCap: 20,
      techTier: 1,
      techProgress: 0,
      techUpgrading: false,
      alloyRate: 4,
      abilityCooldowns: {
        recon_scan: 0,
        supply_drop: 0,
        artillery_strike: 0,
      },
      specialActionCooldown: 0,
    };
  }

  private nextId(prefix: string): string {
    return `${prefix}_${this.idCounter++}`;
  }

  private initializeMapState() {
    this.nodes = this.map.nodes.map((n) => ({ ...n, amount: n.maxAmount }));
    this.sectors = this.map.sectors.map((s) => ({
      ...s,
      owner: 'neutral',
      capturingSide: null,
      progress: 0,
    }));

    // Blue starting base & forces
    const b = this.map.blueSpawn;
    this.spawnBuilding('blue', 'hq', b.x, b.y, true);
    this.spawnSquad('blue', 'rifle_squad', b.x + 120, b.y - 70);
    this.spawnSquad('blue', 'rifle_squad', b.x + 150, b.y + 40);
    this.spawnSquad('blue', 'engineer_harvester', b.x - 40, b.y - 110);

    // Red starting base & forces
    const r = this.map.redSpawn;
    this.spawnBuilding('red', 'hq', r.x, r.y, true);
    this.spawnSquad('red', 'rifle_squad', r.x - 120, r.y + 70);
    this.spawnSquad('red', 'rifle_squad', r.x - 150, r.y - 40);
    this.spawnSquad('red', 'engineer_harvester', r.x + 40, r.y + 110);

    this.recomputeEconomyStats('blue');
    this.recomputeEconomyStats('red');
  }

  public spawnBuilding(side: FactionSide, type: BuildingTypeId, x: number, y: number, instant = false): Building {
    const spec = BUILDING_SPECS[type];
    const dir = side === 'blue' ? 1 : -1;
    const b: Building = {
      id: this.nextId('bld'),
      side,
      type,
      x,
      y,
      hp: instant ? spec.maxHp : Math.round(spec.maxHp * 0.25),
      maxHp: spec.maxHp,
      buildProgress: instant ? 1 : 0.05,
      rallyX: Math.max(80, Math.min(this.map.width - 80, x + dir * 110)),
      rallyY: Math.max(80, Math.min(this.map.height - 80, y - dir * 50)),
      queue: [],
      attackTimer: 0,
      flashTimer: 0,
    };
    this.buildings.push(b);
    this.recomputeEconomyStats(side);
    return b;
  }

  private createMembers(count: number, hpPerMember: number, formation: SquadFormation): SoldierMember[] {
    const members: SoldierMember[] = [];
    for (let i = 0; i < count; i++) {
      const { ox, oy } = this.getFormationOffset(i, count, formation);
      members.push({
        offsetX: ox,
        offsetY: oy,
        hp: hpPerMember,
        maxHp: hpPerMember,
        recoil: 0,
        flashTimer: 0,
        gaitPhase: i * 1.1,
      });
    }
    return members;
  }

  private getFormationOffset(index: number, total: number, formation: SquadFormation): { ox: number; oy: number } {
    if (total <= 1) return { ox: 0, oy: 0 };
    const spread = formation === 'loose' ? 24 : 16;
    if (formation === 'line') {
      const mid = (total - 1) / 2;
      return { ox: (index - mid) * spread, oy: (index % 2 === 0 ? -4 : 4) };
    }
    if (formation === 'wedge') {
      const row = Math.ceil(index / 2);
      const side = index % 2 === 0 ? -1 : 1;
      return { ox: index === 0 ? 0 : side * row * spread * 0.85, oy: index === 0 ? -12 : row * 12 };
    }
    const angle = (index / total) * Math.PI * 2;
    return { ox: Math.cos(angle) * spread, oy: Math.sin(angle) * spread };
  }

  public spawnSquad(side: FactionSide, type: UnitTypeId, x: number, y: number): Squad {
    const spec = UNIT_SPECS[type];
    const formation: SquadFormation = spec.isVehicle ? 'line' : 'wedge';
    const members = this.createMembers(spec.memberCount, spec.hpPerMember, formation);
    const totalHp = spec.memberCount * spec.hpPerMember;
    const sq: Squad = {
      id: this.nextId('sq'),
      side,
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      heading: side === 'blue' ? -Math.PI / 4 : (Math.PI * 3) / 4,
      turretHeading: side === 'blue' ? -Math.PI / 4 : (Math.PI * 3) / 4,
      targetX: null,
      targetY: null,
      attackMoveTarget: null,
      focusTargetId: null,
      stance: 'aggressive',
      formation,
      members,
      hp: totalHp,
      maxHp: totalHp,
      suppression: 0,
      morale: 100,
      reloadTimer: 0,
      controlGroup: null,
      retreating: false,
      harvestTargetId: null,
      harvestCargo: 0,
      coverState: 'none',
      elevationState: 1,
      concealed: false,
      killCount: 0,
      veterancy: 0,
      koTimer: 0,
      recoilTimer: 0,
      repairTargetId: null,
      trackDistance: 0,
    };

    if (spec.canHarvest) {
      sq.harvestTargetId = this.findNearestNodeId(x, y, 'alloy');
    }

    this.squads.push(sq);
    this.recomputeEconomyStats(side);
    return sq;
  }

  private findNearestNodeId(x: number, y: number, kind: 'alloy' | 'energy'): string | null {
    let best: ResourceNode | null = null;
    let bestDist = Infinity;
    for (const n of this.nodes) {
      if (n.kind !== kind || n.amount <= 0) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best?.id ?? null;
  }

  public recomputeEconomyStats(side: FactionSide) {
    const econ = this.economy[side];
    let energyProduced = 0;
    let energyDemand = 0;
    let supplyCap = 0;
    let alloyRate = 3.5;

    for (const b of this.buildings) {
      if (b.side !== side || b.hp <= 0 || b.buildProgress < 1) continue;
      const spec = BUILDING_SPECS[b.type];
      if (spec.powerOutput >= 0) energyProduced += spec.powerOutput;
      else energyDemand += Math.abs(spec.powerOutput);
      supplyCap += spec.supplyBonus;
      if (b.type === 'refinery') alloyRate += 4.5;
    }

    for (const sec of this.sectors) {
      if (sec.owner === side) {
        alloyRate += sec.alloyBonus;
        supplyCap += sec.supplyBonus;
      }
    }

    let supplyUsed = 0;
    for (const sq of this.squads) {
      if (sq.side !== side || sq.hp <= 0) continue;
      supplyUsed += UNIT_SPECS[sq.type].supplyCost;
    }

    econ.energyProduced = energyProduced;
    econ.energyDemand = energyDemand;
    econ.powerEfficiency = calculatePowerEfficiency(energyProduced, energyDemand);
    econ.supplyUsed = supplyUsed;
    econ.supplyCap = supplyCap;
    econ.alloyRate = Number(alloyRate.toFixed(1));
  }

  public spawnParticle(p: Omit<Particle, 'active'>) {
    const slot = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
    slot.active = true;
    slot.x = p.x;
    slot.y = p.y;
    slot.vx = p.vx;
    slot.vy = p.vy;
    slot.life = p.life;
    slot.maxLife = p.maxLife;
    slot.size = p.size;
    slot.color = p.color;
    slot.kind = p.kind;
    slot.text = p.text;
  }

  // ---- PLAYER / MULTIPLAYER COMMANDS ----

  public issueMoveOrder(squadIds: string[], x: number, y: number, attackMove = false, fromRemote = false) {
    const clampedX = Math.max(36, Math.min(this.map.width - 36, x));
    const clampedY = Math.max(36, Math.min(this.map.height - 36, y));
    const matching = this.squads.filter((s) => squadIds.includes(s.id) && s.hp > 0);
    if (matching.length === 0) return;

    const cols = Math.ceil(Math.sqrt(matching.length));
    matching.forEach((sq, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const offsetX = (col - (cols - 1) / 2) * 52;
      const offsetY = (row - (Math.ceil(matching.length / cols) - 1) / 2) * 52;
      const tx = Math.max(36, Math.min(this.map.width - 36, clampedX + offsetX));
      const ty = Math.max(36, Math.min(this.map.height - 36, clampedY + offsetY));
      sq.targetX = tx;
      sq.targetY = ty;
      sq.retreating = false;
      sq.focusTargetId = null;
      sq.attackMoveTarget = attackMove ? { x: tx, y: ty } : null;
      if (UNIT_SPECS[sq.type].canHarvest) {
        const nearNode = this.nodes.find((n) => n.kind === 'alloy' && Math.hypot(n.x - tx, n.y - ty) < 75);
        if (nearNode) sq.harvestTargetId = nearNode.id;
      }
    });

    if (!fromRemote && matching[0].side === this.localSide) {
      tacticalAudio.playOrder();
      this.onCommandEmit?.({
        kind: attackMove ? 'attackMove' : 'move',
        payload: { squadIds, x: clampedX, y: clampedY },
      });
    }
  }

  public issueFocusTarget(squadIds: string[], targetId: string, fromRemote = false) {
    const matching = this.squads.filter((s) => squadIds.includes(s.id) && s.hp > 0);
    for (const sq of matching) {
      sq.focusTargetId = targetId;
      sq.retreating = false;
      sq.attackMoveTarget = null;
    }
    if (!fromRemote && matching[0]?.side === this.localSide) {
      tacticalAudio.playOrder();
    }
  }

  public setSquadStance(squadIds: string[], stance: SquadStance, fromRemote = false) {
    const matching = this.squads.filter((s) => squadIds.includes(s.id) && s.hp > 0);
    for (const sq of matching) {
      sq.stance = stance;
      sq.formation = stance === 'dispersed' ? 'loose' : stance === 'hold' ? 'line' : 'wedge';
      sq.members.forEach((m, idx) => {
        const off = this.getFormationOffset(idx, sq.members.length, sq.formation);
        m.offsetX = off.ox;
        m.offsetY = off.oy;
      });
    }
    if (!fromRemote && matching[0]?.side === this.localSide) {
      tacticalAudio.playSelect();
      this.onCommandEmit?.({ kind: 'stance', payload: { squadIds, stance } });
    }
  }

  public retreatSquads(squadIds: string[], fromRemote = false) {
    const matching = this.squads.filter((s) => squadIds.includes(s.id) && s.hp > 0);
    for (const sq of matching) {
      const hq = this.buildings.find((b) => b.side === sq.side && b.type === 'hq' && b.hp > 0);
      if (!hq) continue;
      sq.retreating = true;
      sq.focusTargetId = null;
      sq.attackMoveTarget = null;
      sq.targetX = hq.x + (sq.side === 'blue' ? 90 : -90);
      sq.targetY = hq.y + (sq.side === 'blue' ? -60 : 60);
    }
    if (!fromRemote && matching[0]?.side === this.localSide) {
      tacticalAudio.playOrder();
      this.onCommandEmit?.({ kind: 'retreat', payload: { squadIds } });
    }
  }

  public canPlaceBuilding(side: FactionSide, type: BuildingTypeId, x: number, y: number): { ok: boolean; reason?: string } {
    const spec = BUILDING_SPECS[type];
    const econ = this.economy[side];
    if (econ.techTier < spec.techTier) return { ok: false, reason: `Butuh Era ${spec.techTier}` };
    if (econ.alloy < spec.alloyCost) return { ok: false, reason: 'Logam tidak cukup' };
    if (x < 70 || x > this.map.width - 70 || y < 70 || y > this.map.height - 70) {
      return { ok: false, reason: 'Di luar batas peta' };
    }
    const terrain = getTerrainAt(this.map, x, y);
    if (terrain.isBridge || !isTerrainPassableForGround(this.map, x, y)) {
      return { ok: false, reason: 'Terhalang air/pohon/batu' };
    }
    for (const b of this.buildings) {
      if (b.hp <= 0) continue;
      if (Math.hypot(b.x - x, b.y - y) < BUILDING_SPECS[b.type].radius + spec.radius + 14) {
        return { ok: false, reason: 'Terlalu dekat bangunan lain' };
      }
    }
    return { ok: true };
  }

  public placeBuilding(side: FactionSide, type: BuildingTypeId, x: number, y: number, fromRemote = false): boolean {
    const check = this.canPlaceBuilding(side, type, x, y);
    if (!check.ok) return false;
    const spec = BUILDING_SPECS[type];
    this.economy[side].alloy -= spec.alloyCost;
    this.spawnBuilding(side, type, x, y, false);
    if (side === this.localSide) {
      this.recordSnapshot('build', side, `Membangun ${spec.name}`);
      if (!fromRemote) {
        tacticalAudio.playOrder();
        this.onCommandEmit?.({ kind: 'build', payload: { side, type, x, y } });
      }
    }
    return true;
  }

  public queueUnit(side: FactionSide, unitType: UnitTypeId, fromRemote = false): boolean {
    const spec = UNIT_SPECS[unitType];
    const econ = this.economy[side];
    if (econ.techTier < spec.techTier) return false;
    if (econ.alloy < spec.alloyCost) return false;
    if (econ.supplyUsed + spec.supplyCost > econ.supplyCap) return false;

    const producer = this.buildings.find(
      (b) => b.side === side && b.type === spec.producedAt && b.hp > 0 && b.buildProgress >= 1 && b.queue.length < 5
    );
    if (!producer) return false;

    econ.alloy -= spec.alloyCost;
    producer.queue.push({ unitType, remaining: spec.trainTime, total: spec.trainTime });

    if (!fromRemote && side === this.localSide) {
      tacticalAudio.playSelect();
      this.onCommandEmit?.({ kind: 'train', payload: { side, unitType } });
    }
    return true;
  }

  public upgradeTech(side: FactionSide, fromRemote = false): boolean {
    const econ = this.economy[side];
    if (econ.techTier >= 3 || econ.techUpgrading) return false;
    const hasLab = this.buildings.some((b) => b.side === side && b.type === 'tech_lab' && b.buildProgress >= 1 && b.hp > 0);
    if (!hasLab) return false;
    const cost = econ.techTier === 1 ? 220 : 340;
    if (econ.alloy < cost) return false;
    econ.alloy -= cost;
    econ.techUpgrading = true;
    econ.techProgress = 0;

    if (!fromRemote && side === this.localSide) {
      tacticalAudio.playOrder();
      this.onCommandEmit?.({ kind: 'upgradeTech', payload: { side } });
    }
    return true;
  }

  public useAbility(side: FactionSide, abilityId: AbilityId, x: number, y: number, fromRemote = false): boolean {
    const spec = ABILITY_SPECS[abilityId];
    const econ = this.economy[side];
    if (econ.techTier < spec.techTier) return false;
    if (econ.abilityCooldowns[abilityId] > 0) return false;
    if (econ.alloy < spec.alloyCost) return false;

    econ.alloy -= spec.alloyCost;
    econ.abilityCooldowns[abilityId] = spec.cooldown;

    if (abilityId === 'supply_drop') {
      econ.alloy += 140;
      const hq = this.buildings.find((b) => b.side === side && b.type === 'hq');
      if (hq) {
        this.spawnParticle({
          x: hq.x,
          y: hq.y - 30,
          vx: 0,
          vy: -24,
          life: 1.4,
          maxLife: 1.4,
          size: 14,
          color: '#fbbf24',
          kind: 'text',
          text: '+140 Logam',
        });
      }
    } else if (abilityId === 'recon_scan') {
      this.reconPings.push({ x, y, radius: 420, timer: 8.5, side });
      this.spawnParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        life: 1.1,
        maxLife: 1.1,
        size: 380,
        color: '#38bdf8',
        kind: 'ring',
      });
    } else if (abilityId === 'artillery_strike') {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 25 + Math.random() * 95;
        const tx = Math.max(40, Math.min(this.map.width - 40, x + Math.cos(angle) * dist));
        const ty = Math.max(40, Math.min(this.map.height - 40, y + Math.sin(angle) * dist));
        this.projectiles.push({
          id: this.nextId('prj'),
          side,
          x: side === 'blue' ? Math.max(40, tx - 380) : Math.min(this.map.width - 40, tx + 380),
          y: Math.max(40, ty - 280),
          startX: tx - 260,
          startY: ty - 260,
          targetX: tx,
          targetY: ty,
          progress: -i * 0.14,
          speed: 1.5,
          damage: 95,
          suppression: 42,
          splashRadius: 85,
          antiArmorMult: 1.3,
          isArtillery: true,
          color: side === this.localSide ? this.playerTracerColor : '#ef4444',
        });
      }
    }

    if (side === this.localSide) {
      this.recordSnapshot('strike', side, `Serangan Komandan: ${spec.name}`, x, y);
      if (!fromRemote) {
        tacticalAudio.playCapture();
        this.onCommandEmit?.({ kind: 'ability', payload: { side, abilityId, x, y } });
      }
    }
    return true;
  }

  public useFactionSpecial(side: FactionSide, x: number, y: number, fromRemote = false): boolean {
    const fSpec = FACTION_SPECS[this.factions[side]];
    const econ = this.economy[side];
    const hasSpecialBld = this.buildings.some(
      (b) => b.side === side && b.type === 'faction_special' && b.buildProgress >= 1 && b.hp > 0
    );
    if (!hasSpecialBld) return false;
    if (econ.specialActionCooldown > 0) return false;
    if (econ.alloy < fSpec.specialActionCost) return false;

    econ.alloy -= fSpec.specialActionCost;
    econ.specialActionCooldown = fSpec.specialActionCooldown;
    const tracer = side === this.localSide ? this.playerTracerColor : '#ef4444';

    const fireSalvo = (count: number, damage: number, splashRadius: number, speed: number, spread: number) => {
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const d = 14 + Math.random() * spread;
        const tx = Math.max(40, Math.min(this.map.width - 40, x + Math.cos(ang) * d));
        const ty = Math.max(40, Math.min(this.map.height - 40, y + Math.sin(ang) * d));
        this.projectiles.push({
          id: this.nextId('prj'),
          side,
          x: side === 'blue' ? Math.max(40, tx - 380) : Math.min(this.map.width - 40, tx + 380),
          y: Math.max(40, ty - 280),
          startX: tx + (side === 'blue' ? -280 : 280),
          startY: Math.max(40, ty - 280),
          targetX: tx,
          targetY: ty,
          progress: -i * 0.1,
          speed,
          damage,
          suppression: 48,
          splashRadius,
          antiArmorMult: 1.45,
          isArtillery: true,
          color: tracer,
        });
      }
    };

    const findPassableDrop = (px: number, py: number): { x: number; y: number } => {
      if (!this.isPositionBlocked(px, py, false)) return { x: px, y: py };
      for (let rad = 35; rad <= 180; rad += 35) {
        for (let a = 0; a < 8; a++) {
          const candX = Math.max(40, Math.min(this.map.width - 40, px + Math.cos((a / 8) * Math.PI * 2) * rad));
          const candY = Math.max(40, Math.min(this.map.height - 40, py + Math.sin((a / 8) * Math.PI * 2) * rad));
          if (!this.isPositionBlocked(candX, candY, false)) return { x: candX, y: candY };
        }
      }
      const hq = this.buildings.find((b) => b.side === side && b.type === 'hq');
      return hq ? { x: hq.x + (side === 'blue' ? 70 : -70), y: hq.y } : { x: px, y: py };
    };

    switch (fSpec.specialActionKind) {
      case 'himars_precision':
        this.reconPings.push({ x, y, radius: 420, timer: 8, side });
        fireSalvo(6, 118, 82, 1.85, 78);
        break;
      case 'ecm_armor_boost':
        for (const sq of this.squads) {
          if (sq.side !== side || sq.hp <= 0) continue;
          if (UNIT_SPECS[sq.type].isVehicle) {
            sq.hp = Math.min(sq.maxHp, sq.hp + 85);
            if (sq.members[0]) sq.members[0].hp = sq.hp;
            this.spawnParticle({ x: sq.x, y: sq.y, vx: 0, vy: 0, life: 0.7, maxLife: 0.7, size: 48, color: '#34d399', kind: 'ring' });
          }
          this.reconPings.push({ x: sq.x, y: sq.y, radius: 340, timer: 6, side });
        }
        break;
      case 'thermobaric_salvo':
        fireSalvo(8, 108, 98, 1.5, 110);
        break;
      case 'kopassus_airdrop': {
        const drop1 = findPassableDrop(x - 24, y);
        const drop2 = findPassableDrop(x + 24, y + 18);
        this.spawnSquad(side, 'rifle_squad', drop1.x, drop1.y);
        this.spawnSquad(side, 'heavy_mg', drop2.x, drop2.y);
        econ.alloy += 90;
        this.spawnParticle({ x: drop1.x, y: drop1.y, vx: 0, vy: 0, life: 0.9, maxLife: 0.9, size: 80, color: '#ef4444', kind: 'ring' });
        this.spawnParticle({ x: drop1.x, y: drop1.y - 24, vx: 0, vy: -22, life: 1.4, maxLife: 1.4, size: 13, color: '#fbbf24', kind: 'text', text: 'KOPASSUS +90L' });
        break;
      }
      case 'aegis_dome_heal':
        for (const sq of this.squads) {
          if (sq.side !== side || sq.hp <= 0) continue;
          sq.hp = Math.min(sq.maxHp, sq.hp + 120);
          sq.suppression = 0;
          for (const m of sq.members) if (m.hp > 0) m.hp = Math.min(m.maxHp, m.hp + 45);
          this.spawnParticle({ x: sq.x, y: sq.y, vx: 0, vy: 0, life: 0.7, maxLife: 0.7, size: 42, color: '#38bdf8', kind: 'ring' });
        }
        for (const b of this.buildings) {
          if (b.side !== side || b.hp <= 0) continue;
          b.hp = Math.min(b.maxHp, b.hp + 160);
          this.reconPings.push({ x: b.x, y: b.y, radius: 480, timer: 7, side });
        }
        break;
      case 'fpv_drone_swarm': {
        this.reconPings.push({ x, y, radius: 360, timer: 7, side });
        const targets = this.squads
          .filter((s) => s.side !== side && s.hp > 0)
          .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
          .slice(0, 7);
        for (let i = 0; i < 7; i++) {
          const tgt = targets[i % Math.max(1, targets.length)];
          const tx = tgt ? tgt.x : x + (Math.random() - 0.5) * 90;
          const ty = tgt ? tgt.y : y + (Math.random() - 0.5) * 90;
          this.projectiles.push({
            id: this.nextId('prj'),
            side,
            x: tx,
            y: Math.max(20, ty - 180),
            startX: tx + (Math.random() - 0.5) * 140,
            startY: Math.max(20, ty - 220),
            targetX: tx,
            targetY: ty,
            progress: -i * 0.11,
            speed: 2.3,
            damage: 112,
            suppression: 35,
            splashRadius: 46,
            antiArmorMult: 1.85,
            isArtillery: true,
            color: '#38bdf8',
          });
        }
        break;
      }
      case 'sas_artillery_combo': {
        const drop = findPassableDrop(x - 32, y + 24);
        this.spawnSquad(side, 'recon_sniper', drop.x, drop.y);
        fireSalvo(4, 102, 74, 1.9, 64);
        this.spawnParticle({ x: drop.x, y: drop.y, vx: 0, vy: 0, life: 0.9, maxLife: 0.9, size: 70, color: '#60a5fa', kind: 'ring' });
        break;
      }
      case 'k9_rapid_barrage':
        this.reconPings.push({ x, y, radius: 340, timer: 6, side });
        fireSalvo(8, 92, 70, 2.35, 86);
        break;
    }

    if (side === this.localSide) {
      this.recordSnapshot('strike', side, `Aksi Fraksi: ${fSpec.specialActionName}`, x, y);
      if (!fromRemote) {
        tacticalAudio.playCapture();
        this.onCommandEmit?.({ kind: 'factionSpecial', payload: { side, x, y } });
      }
    }
    return true;
  }

  public applyRemoteCommand(cmd: MultiplayerCommand) {
    const p = cmd.payload;
    switch (cmd.kind) {
      case 'move':
        this.issueMoveOrder(p.squadIds as string[], Number(p.x), Number(p.y), false, true);
        break;
      case 'attackMove':
        this.issueMoveOrder(p.squadIds as string[], Number(p.x), Number(p.y), true, true);
        break;
      case 'stance':
        this.setSquadStance(p.squadIds as string[], p.stance as SquadStance, true);
        break;
      case 'retreat':
        this.retreatSquads(p.squadIds as string[], true);
        break;
      case 'build':
        this.placeBuilding(p.side as FactionSide, p.type as BuildingTypeId, Number(p.x), Number(p.y), true);
        break;
      case 'train':
        this.queueUnit(p.side as FactionSide, p.unitType as UnitTypeId, true);
        break;
      case 'upgradeTech':
        this.upgradeTech(p.side as FactionSide, true);
        break;
      case 'ability':
        this.useAbility(p.side as FactionSide, p.abilityId as AbilityId, Number(p.x), Number(p.y), true);
        break;
      case 'factionSpecial':
        this.useFactionSpecial(p.side as FactionSide, Number(p.x), Number(p.y), true);
        break;
    }
  }

  // ---- MAIN SIMULATION STEP ----

  public step(rawDt: number) {
    const dt = Math.min(rawDt, 0.05);
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.4);

    // Particles tick in real dt even during hitstop
    this.updateParticles(dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    if (this.winner) return;

    this.elapsed += dt;

    // Dynamic weather cycle every 55s
    this.weatherTimer += dt;
    if (this.weatherTimer >= 55) {
      this.weatherTimer = 0;
      this.weatherIndex = (this.weatherIndex + 1) % this.map.weatherCycle.length;
      this.weather = this.map.weatherCycle[this.weatherIndex];
      this.recordSnapshot('weather', undefined, `Perubahan cuaca: ${getWeatherModifiers(this.weather).label}`);
    }

    // Update recon pings
    for (let i = this.reconPings.length - 1; i >= 0; i--) {
      this.reconPings[i].timer -= dt;
      if (this.reconPings[i].timer <= 0) this.reconPings.splice(i, 1);
    }

    this.updateEconomy(dt);
    this.updateBuildings(dt);
    this.updateSectors(dt);
    this.updateSquads(dt);
    this.updateProjectiles(dt);
    this.updateTreadMarks(dt);
    this.fogUpdateTimer += dt;
    if (this.fogUpdateTimer >= 0.1) {
      this.fogUpdateTimer = 0;
      this.updateFogOfWar();
    }

    if (this.mode === 'skirmish') {
      this.aiDecisionTimer -= dt;
      if (this.aiDecisionTimer <= 0) {
        this.runAiCommander();
        this.aiDecisionTimer = this.difficulty === 'komandan' ? 1.8 : this.difficulty === 'taktis' ? 2.8 : 4.2;
      }
    }

    if (this.elapsed - this.lastSnapshotTime >= 2.2) {
      this.lastSnapshotTime = this.elapsed;
      this.recordSnapshot('combat', undefined, 'Pembaruan garis depan');
    }

    this.checkVictoryCondition();
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') {
        p.size += dt * 10;
      }
    }
  }

  private updateEconomy(dt: number) {
    (['blue', 'red'] as FactionSide[]).forEach((side) => {
      const econ = this.economy[side];
      this.recomputeEconomyStats(side);
      econ.alloy += econ.alloyRate * dt;

      (['recon_scan', 'supply_drop', 'artillery_strike'] as AbilityId[]).forEach((ab) => {
        if (econ.abilityCooldowns[ab] > 0) {
          econ.abilityCooldowns[ab] = Math.max(0, econ.abilityCooldowns[ab] - dt);
        }
      });
      if (econ.specialActionCooldown > 0) {
        econ.specialActionCooldown = Math.max(0, econ.specialActionCooldown - dt);
      }

      if (econ.techUpgrading) {
        econ.techProgress += dt * (1 / (econ.techTier === 1 ? 14 : 18)) * econ.powerEfficiency;
        if (econ.techProgress >= 1) {
          econ.techTier = (econ.techTier + 1) as 2 | 3;
          econ.techUpgrading = false;
          econ.techProgress = 0;
          if (side === this.localSide) {
            tacticalAudio.playCapture();
            this.recordSnapshot('build', side, `Riset selesai: Era ${econ.techTier} terbuka!`);
          }
        }
      }
    });
  }

  private updateBuildings(dt: number) {
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      if (b.hp <= 0) {
        this.spawnExplosion(b.x, b.y, 44);
        this.buildings.splice(i, 1);
        this.recomputeEconomyStats(b.side);
        continue;
      }
      if (b.flashTimer > 0) b.flashTimer = Math.max(0, b.flashTimer - dt);

      const spec = BUILDING_SPECS[b.type];
      const econ = this.economy[b.side];

      if (b.buildProgress < 1) {
        const buildSpeed = spec.buildTime > 0 ? 1 / spec.buildTime : 1;
        b.buildProgress = Math.min(1, b.buildProgress + dt * buildSpeed);
        b.hp = Math.min(b.maxHp, b.hp + dt * (b.maxHp * 0.75 * buildSpeed));
        if (b.buildProgress >= 1) {
          this.recomputeEconomyStats(b.side);
          if (b.side === this.localSide) tacticalAudio.playSelect();
        }
        continue;
      }

      // Training queue
      if (b.queue.length > 0) {
        const item = b.queue[0];
        item.remaining -= dt * econ.powerEfficiency;
        if (item.remaining <= 0) {
          b.queue.shift();
          const unitSpec = UNIT_SPECS[item.unitType];
          const spawnSq = this.spawnSquad(b.side, item.unitType, b.x + (b.side === 'blue' ? 54 : -54), b.y + 18);
          if (b.side === this.localSide) {
            this.stats.unitsTrained += 1;
            if (item.unitType === 'battle_tank' || item.unitType === 'rocket_artillery') {
              this.stats.tanksDeployed += 1;
            }
          }
          if (!unitSpec.canHarvest) {
            this.issueMoveOrder([spawnSq.id], b.rallyX, b.rallyY, false, true);
          }
        }
      }

      // Automated turrets on HQ & Watchtower
      if (spec.attackRange && spec.attackDamage) {
        b.attackTimer = Math.max(0, b.attackTimer - dt);
        if (b.attackTimer <= 0 && (b.type === 'hq' || econ.powerEfficiency >= 0.5)) {
          const target = this.findNearestEnemySquad(b.side, b.x, b.y, spec.attackRange);
          if (target) {
            b.attackTimer = 1.05;
            this.projectiles.push({
              id: this.nextId('prj'),
              side: b.side,
              x: b.x,
              y: b.y - 16,
              startX: b.x,
              startY: b.y - 16,
              targetX: target.x,
              targetY: target.y,
              progress: 0,
              speed: 3.8,
              damage: spec.attackDamage,
              suppression: 6,
              splashRadius: 0,
              antiArmorMult: 1.0,
              isArtillery: false,
              color: b.side === this.localSide ? this.playerTracerColor : '#ef4444',
            });
          }
        }
      }
    }
  }

  private updateSectors(dt: number) {
    for (const sec of this.sectors) {
      let blueWeight = 0;
      let redWeight = 0;
      for (const sq of this.squads) {
        if (sq.hp <= 0 || !UNIT_SPECS[sq.type].canCapture) continue;
        if (Math.hypot(sq.x - sec.x, sq.y - sec.y) <= sec.radius) {
          if (sq.side === 'blue') blueWeight += 1;
          else redWeight += 1;
        }
      }

      if (blueWeight > redWeight) {
        sec.capturingSide = 'blue';
        const prev = sec.owner;
        sec.progress = Math.min(100, sec.progress + dt * (16 + blueWeight * 5));
        if (sec.progress >= 100 && prev !== 'blue') {
          sec.owner = 'blue';
          this.recomputeEconomyStats('blue');
          this.recomputeEconomyStats('red');
          if (this.localSide === 'blue') {
            this.stats.sectorsCaptured += 1;
            tacticalAudio.playCapture();
            this.recordSnapshot('capture', 'blue', `Menguasai sektor ${sec.name}`);
          }
        } else if (sec.progress > -20 && prev === 'red') {
          sec.owner = 'neutral';
        }
      } else if (redWeight > blueWeight) {
        sec.capturingSide = 'red';
        const prev = sec.owner;
        sec.progress = Math.max(-100, sec.progress - dt * (16 + redWeight * 5));
        if (sec.progress <= -100 && prev !== 'red') {
          sec.owner = 'red';
          this.recomputeEconomyStats('blue');
          this.recomputeEconomyStats('red');
          if (this.localSide === 'red') {
            this.stats.sectorsCaptured += 1;
            tacticalAudio.playCapture();
          }
        } else if (sec.progress < 20 && prev === 'blue') {
          sec.owner = 'neutral';
        }
      } else {
        sec.capturingSide = null;
      }
    }
  }

  private updateSquads(dt: number) {
    const weatherMod = getWeatherModifiers(this.weather);

    for (let i = this.squads.length - 1; i >= 0; i--) {
      const sq = this.squads[i];
      if (sq.hp <= 0) {
        if (sq.koTimer > 0) {
          sq.koTimer -= dt;
          if (sq.koTimer <= 0) {
            this.squads.splice(i, 1);
            this.recomputeEconomyStats(sq.side);
          }
        } else {
          this.squads.splice(i, 1);
          this.recomputeEconomyStats(sq.side);
        }
        continue;
      }

      const spec = UNIT_SPECS[sq.type];
      const terrain = getTerrainAt(this.map, sq.x, sq.y);
      sq.coverState = terrain.coverType;
      sq.elevationState = terrain.elevation;
      sq.concealed = terrain.concealment && sq.reloadTimer <= 0.1 && !spec.isVehicle;

      // Suppression decay
      sq.suppression = Math.max(0, sq.suppression - dt * (sq.coverState !== 'none' ? 14 : 8));
      sq.morale = Math.max(15, 100 - sq.suppression * 0.75);
      sq.reloadTimer = Math.max(0, sq.reloadTimer - dt);
      if (sq.recoilTimer && sq.recoilTimer > 0) sq.recoilTimer = Math.max(0, sq.recoilTimer - dt);
      sq.repairTargetId = null;

      for (const m of sq.members) {
        if (m.recoil > 0) m.recoil = Math.max(0, m.recoil - dt * 4);
        if (m.flashTimer > 0) m.flashTimer = Math.max(0, m.flashTimer - dt);
      }

      // Harvester & Repair logic
      if (spec.canHarvest && !sq.targetX && !sq.targetY) {
        this.updateHarvesterBehavior(sq, dt);
      }

      // Movement logic
      let moveDestX = sq.targetX;
      let moveDestY = sq.targetY;

      if (sq.focusTargetId) {
        const enemySq = this.squads.find((e) => e.id === sq.focusTargetId && e.hp > 0);
        const enemyBld = !enemySq ? this.buildings.find((b) => b.id === sq.focusTargetId && b.hp > 0) : null;
        const tTarget = enemySq || enemyBld;
        if (!tTarget) {
          sq.focusTargetId = null;
        } else {
          const dist = Math.hypot(tTarget.x - sq.x, tTarget.y - sq.y);
          const effRange = spec.range * (sq.elevationState >= 2 ? 1.2 : 1.0);
          if (dist > effRange * 0.9) {
            moveDestX = tTarget.x;
            moveDestY = tTarget.y;
          } else {
            moveDestX = null;
            moveDestY = null;
          }
        }
      }

      if (moveDestX !== null && moveDestY !== null) {
        const dx = moveDestX - sq.x;
        const dy = moveDestY - sq.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 14) {
          sq.targetX = null;
          sq.targetY = null;
          sq.attackMoveTarget = null;
          sq.retreating = false;
          sq.vx = 0;
          sq.vy = 0;
        } else {
          let speed = spec.speed * (spec.isAir ? 1 : terrain.speedMultiplier);
          if (spec.isVehicle) speed *= weatherMod.vehicleSpeedMult;
          if (sq.retreating) speed *= 1.32;
          else if (sq.suppression >= 70) speed *= 0.42;
          else if (sq.suppression >= 35) speed *= 0.72;

          const stepped = this.computeSteeredStep(sq.x, sq.y, moveDestX, moveDestY, speed, dt, spec.isAir);
          const prevX = sq.x;
          const prevY = sq.y;
          sq.vx = (stepped.nx - sq.x) / dt;
          sq.vy = (stepped.ny - sq.y) / dt;
          sq.x = Math.max(28, Math.min(this.map.width - 28, stepped.nx));
          sq.y = Math.max(28, Math.min(this.map.height - 28, stepped.ny));
          if (Math.hypot(sq.vx, sq.vy) > 1) {
            sq.heading = Math.atan2(sq.vy, sq.vx);
            if (!spec.isVehicle) sq.turretHeading = sq.heading;
          }

          if (spec.isVehicle && !spec.isAir) {
            this.recordVehicleTrack(sq, Math.hypot(sq.x - prevX, sq.y - prevY));
          }

          for (const m of sq.members) {
            m.gaitPhase += dt * (speed * 0.14);
          }
        }
      } else {
        sq.vx = 0;
        sq.vy = 0;
        // Dispersed stance seeks nearby cover within 70px
        if (sq.stance === 'dispersed' && sq.coverState === 'none' && !spec.isVehicle) {
          const coverSpot = this.findNearbyCover(sq.x, sq.y, 90);
          if (coverSpot) {
            sq.targetX = coverSpot.x;
            sq.targetY = coverSpot.y;
          }
        }
      }

      // Combat engagement
      if (!sq.retreating && sq.reloadTimer <= 0) {
        const effRange = spec.range * (sq.elevationState >= 2 ? 1.2 : 1.0);
        const enemyUnit = this.findBestTargetUnit(sq, effRange);
        const enemyBuilding = !enemyUnit ? this.findNearestEnemyBuilding(sq.side, sq.x, sq.y, effRange) : null;
        const target = enemyUnit || enemyBuilding;

        if (target) {
          // Stop attack-move while firing
          if (sq.attackMoveTarget) {
            sq.targetX = null;
            sq.targetY = null;
          }

          const angleToTarget = Math.atan2(target.y - sq.y, target.x - sq.x);
          sq.turretHeading = angleToTarget;
          if (!spec.isVehicle) sq.heading = angleToTarget;

          sq.reloadTimer = spec.reloadTime * (sq.suppression >= 70 ? 1.45 : 1);
          const defTerrain = getTerrainAt(this.map, target.x, target.y);

          const calc = calculateCombatDamage({
            spec,
            targetArmorClass: enemyUnit ? UNIT_SPECS[enemyUnit.type].armorClass : 'building',
            attackerElevation: sq.elevationState,
            defenderElevation: defTerrain.elevation,
            defenderCover: defTerrain.coverType,
            attackerSuppression: sq.suppression,
            attackerVeterancy: sq.veterancy,
          });

          const aliveMembers = sq.members.filter((m) => m.hp > 0);
          const memberScale = aliveMembers.length / Math.max(1, spec.memberCount);
          const finalDmg = Math.max(1, Math.round(calc.damage * memberScale));

          aliveMembers.forEach((m) => {
            m.recoil = 1;
            m.flashTimer = 0.08;
          });
          if (spec.isVehicle) {
            sq.recoilTimer = 0.22;
          }

          this.projectiles.push({
            id: this.nextId('prj'),
            side: sq.side,
            x: sq.x,
            y: sq.y,
            startX: sq.x,
            startY: sq.y,
            targetX: target.x + (Math.random() - 0.5) * 14,
            targetY: target.y + (Math.random() - 0.5) * 14,
            progress: 0,
            speed: spec.id === 'rocket_artillery' ? 1.65 : spec.isVehicle ? 3.4 : 5.2,
            damage: finalDmg,
            suppression: spec.suppressionPower,
            splashRadius: spec.splashRadius,
            antiArmorMult: spec.antiArmorMult,
            isArtillery: spec.id === 'rocket_artillery',
            color: sq.side === this.localSide ? this.playerTracerColor : '#ef4444',
          });

          if (sq.side === this.localSide || this.isVisibleToLocal(sq.x, sq.y)) {
            tacticalAudio.playShot(spec.isVehicle);
          }
        } else if (sq.attackMoveTarget && sq.targetX === null) {
          sq.targetX = sq.attackMoveTarget.x;
          sq.targetY = sq.attackMoveTarget.y;
        }
      }
    }
  }

  private updateHarvesterBehavior(sq: Squad, dt: number) {
    // Repair nearby damaged friendly vehicles/buildings first if standing near them
    const damagedAlly = this.squads.find(
      (o) => o.id !== sq.id && o.side === sq.side && o.hp > 0 && o.hp < o.maxHp && UNIT_SPECS[o.type].isVehicle && Math.hypot(o.x - sq.x, o.y - sq.y) < 120
    );
    if (damagedAlly) {
      sq.repairTargetId = damagedAlly.id;
      sq.turretHeading = Math.atan2(damagedAlly.y - sq.y, damagedAlly.x - sq.x);
      damagedAlly.hp = Math.min(damagedAlly.maxHp, damagedAlly.hp + dt * 22);
      if (damagedAlly.members[0]) damagedAlly.members[0].hp = damagedAlly.hp;
      return;
    }

    const node = this.nodes.find((n) => n.id === sq.harvestTargetId && n.amount > 0);
    if (!node) {
      sq.harvestTargetId = this.findNearestNodeId(sq.x, sq.y, 'alloy');
      return;
    }

    const dropoff = this.buildings
      .filter((b) => b.side === sq.side && (b.type === 'refinery' || b.type === 'hq') && b.hp > 0 && b.buildProgress >= 1)
      .sort((a, b) => Math.hypot(a.x - sq.x, a.y - sq.y) - Math.hypot(b.x - sq.x, b.y - sq.y))[0];
    if (!dropoff) return;

    if (sq.harvestCargo >= 60) {
      const dist = Math.hypot(dropoff.x - sq.x, dropoff.y - sq.y);
      if (dist > 72) {
        const stepped = this.computeSteeredStep(sq.x, sq.y, dropoff.x, dropoff.y, 76, dt, false);
        const stepDist = Math.hypot(stepped.nx - sq.x, stepped.ny - sq.y);
        if (stepDist > 0.05) {
          sq.heading = Math.atan2(stepped.ny - sq.y, stepped.nx - sq.x);
          sq.turretHeading = sq.heading;
          sq.x = stepped.nx;
          sq.y = stepped.ny;
          this.recordVehicleTrack(sq, stepDist);
        }
      } else {
        this.economy[sq.side].alloy += sq.harvestCargo;
        if (sq.side === this.localSide) {
          this.stats.alloyHarvested += sq.harvestCargo;
          this.spawnParticle({
            x: dropoff.x,
            y: dropoff.y - 26,
            vx: 0,
            vy: -20,
            life: 1.1,
            maxLife: 1.1,
            size: 12,
            color: '#fbbf24',
            kind: 'text',
            text: `+${Math.round(sq.harvestCargo)}`,
          });
        }
        sq.harvestCargo = 0;
      }
    } else {
      const dist = Math.hypot(node.x - sq.x, node.y - sq.y);
      if (dist > 56) {
        const stepped = this.computeSteeredStep(sq.x, sq.y, node.x, node.y, 76, dt, false);
        const stepDist = Math.hypot(stepped.nx - sq.x, stepped.ny - sq.y);
        if (stepDist > 0.05) {
          sq.heading = Math.atan2(stepped.ny - sq.y, stepped.nx - sq.x);
          sq.turretHeading = sq.heading;
          sq.x = stepped.nx;
          sq.y = stepped.ny;
          this.recordVehicleTrack(sq, stepDist);
        }
      } else {
        const mined = Math.min(node.amount, dt * 18, 60 - sq.harvestCargo);
        node.amount -= mined;
        sq.harvestCargo += mined;
      }
    }
  }

  private recordVehicleTrack(sq: Squad, movedDist: number) {
    sq.trackDistance = (sq.trackDistance ?? 0) + movedDist;
    if (sq.members[0]) sq.members[0].gaitPhase += movedDist * 0.25;
    if (sq.trackDistance >= 14) {
      sq.trackDistance = 0;
      this.treadMarks.push({
        x: sq.x,
        y: sq.y,
        heading: sq.heading,
        alpha: 0.36,
        width: sq.type === 'engineer_harvester' ? 16 : 20,
      });
      if (this.treadMarks.length > 180) {
        this.treadMarks.shift();
      }
    }
  }

  private updateTreadMarks(dt: number) {
    for (let i = this.treadMarks.length - 1; i >= 0; i--) {
      this.treadMarks[i].alpha -= dt * 0.025;
      if (this.treadMarks[i].alpha <= 0.02) {
        this.treadMarks.splice(i, 1);
      }
    }
  }

  private findNearestCrossing(sx: number, sy: number, tx: number, ty: number): { x: number; y: number } | null {
    const crossings = this.map.zones.filter((z) => z.kind === 'bridge' || z.kind === 'ford');
    let best: { x: number; y: number; score: number } | null = null;
    for (const c of crossings) {
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      const score = Math.hypot(cx - sx, cy - sy) + Math.hypot(tx - cx, ty - cy);
      if (!best || score < best.score) best = { x: cx, y: cy, score };
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  private findNearbyCover(x: number, y: number, radius: number): { x: number; y: number } | null {
    for (const z of this.map.zones) {
      if (z.kind !== 'forest' && z.kind !== 'trench') continue;
      const cx = z.x + z.w / 2;
      const cy = z.y + z.h / 2;
      if (Math.hypot(cx - x, cy - y) <= radius + Math.max(z.w, z.h) / 2) {
        return { x: Math.max(z.x + 20, Math.min(z.x + z.w - 20, x)), y: Math.max(z.y + 20, Math.min(z.y + z.h - 20, y)) };
      }
    }
    return null;
  }

  private findBestTargetUnit(attacker: Squad, range: number): Squad | null {
    if (attacker.focusTargetId) {
      const focused = this.squads.find((s) => s.id === attacker.focusTargetId && s.hp > 0);
      if (focused && Math.hypot(focused.x - attacker.x, focused.y - attacker.y) <= range) return focused;
    }
    let best: Squad | null = null;
    let bestDist = range;
    for (const other of this.squads) {
      if (other.side === attacker.side || other.hp <= 0) continue;
      const d = Math.hypot(other.x - attacker.x, other.y - attacker.y);
      if (other.concealed && d > 140 && attacker.type !== 'recon_sniper') continue;
      if (d <= bestDist) {
        bestDist = d;
        best = other;
      }
    }
    return best;
  }

  private findNearestEnemySquad(side: FactionSide, x: number, y: number, range: number): Squad | null {
    let best: Squad | null = null;
    let bestDist = range;
    for (const s of this.squads) {
      if (s.side === side || s.hp <= 0) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  private findNearestEnemyBuilding(side: FactionSide, x: number, y: number, range: number): Building | null {
    let best: Building | null = null;
    let bestDist = range;
    for (const b of this.buildings) {
      if (b.side === side || b.hp <= 0) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d <= bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const prj = this.projectiles[i];
      prj.progress += dt * prj.speed;
      if (prj.progress < 0) continue;

      if (prj.progress >= 1) {
        this.resolveProjectileImpact(prj);
        this.projectiles.splice(i, 1);
      } else {
        prj.x = prj.startX + (prj.targetX - prj.startX) * prj.progress;
        prj.y = prj.startY + (prj.targetY - prj.startY) * prj.progress;
        if (prj.isArtillery) {
          prj.y -= Math.sin(prj.progress * Math.PI) * 58;
        }
      }
    }
  }

  private resolveProjectileImpact(prj: Projectile) {
    if (prj.isArtillery || prj.splashRadius > 20) {
      this.spawnExplosion(prj.targetX, prj.targetY, prj.isArtillery ? 36 : 18);
      if (prj.isArtillery) {
        this.craters.push({ x: prj.targetX, y: prj.targetY, radius: 22 + Math.random() * 14, alpha: 0.72 });
        if (this.craters.length > 75) this.craters.shift();
        this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.35);
        this.hitstopTimer = Math.max(this.hitstopTimer, 0.032);
        tacticalAudio.playExplosion();
      }
    } else {
      for (let k = 0; k < 4; k++) {
        this.spawnParticle({
          x: prj.targetX,
          y: prj.targetY,
          vx: (Math.random() - 0.5) * 90,
          vy: (Math.random() - 0.5) * 90,
          life: 0.22,
          maxLife: 0.22,
          size: 2.2,
          color: prj.color,
          kind: 'spark',
        });
      }
    }

    const hitRadius = Math.max(26, prj.splashRadius);
    for (const sq of this.squads) {
      if (sq.side === prj.side || sq.hp <= 0) continue;
      const dist = Math.hypot(sq.x - prj.targetX, sq.y - prj.targetY);
      if (dist <= hitRadius) {
        const falloff = prj.splashRadius > 0 ? Math.max(0.45, 1 - dist / (hitRadius * 1.25)) : 1;
        const dmg = Math.round(prj.damage * falloff);
        this.applyDamageToSquad(sq, dmg, prj.suppression * falloff, prj.side);
      }
    }

    for (const b of this.buildings) {
      if (b.side === prj.side || b.hp <= 0) continue;
      const bRad = BUILDING_SPECS[b.type].radius + hitRadius * 0.5;
      if (Math.hypot(b.x - prj.targetX, b.y - prj.targetY) <= bRad) {
        b.hp -= prj.damage;
        b.flashTimer = 0.06;
        if (prj.side === this.localSide) this.stats.damageDealt += prj.damage;
      }
    }
  }

  private applyDamageToSquad(sq: Squad, dmg: number, supp: number, attackerSide: FactionSide) {
    sq.hp = Math.max(0, sq.hp - dmg);
    sq.suppression = Math.min(100, sq.suppression + supp);

    // Distribute HP across alive soldiers cleanly
    const alive = sq.members.filter((m) => m.hp > 0);
    if (alive.length > 0) {
      let rem = dmg;
      for (const m of alive) {
        if (rem <= 0) break;
        const take = Math.min(m.hp, rem);
        m.hp -= take;
        rem -= take;
      }
    }

    if (attackerSide === this.localSide) {
      this.stats.damageDealt += dmg;
    }

    if (sq.hp <= 0) {
      sq.koTimer = 0.35;
      this.spawnExplosion(sq.x, sq.y, UNIT_SPECS[sq.type].isVehicle ? 32 : 16);
      if (sq.side !== this.localSide) {
        this.stats.enemiesEliminated += 1;
      }
    }
  }

  private spawnExplosion(x: number, y: number, radius: number) {
    this.spawnParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.32,
      maxLife: 0.32,
      size: radius * 1.35,
      color: '#f59e0b',
      kind: 'ring',
    });
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 25 + Math.random() * 110;
      this.spawnParticle({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        size: 3 + Math.random() * 5,
        color: i % 2 === 0 ? '#fb923c' : '#52525b',
        kind: i % 2 === 0 ? 'spark' : 'smoke',
      });
    }
  }

  private updateFogOfWar() {
    for (let i = 0; i < this.fogGrid.length; i++) {
      if (this.fogGrid[i] === 2) this.fogGrid[i] = 1;
    }
    const weatherMod = getWeatherModifiers(this.weather);

    const revealCircle = (wx: number, wy: number, radius: number) => {
      const minC = Math.max(0, Math.floor((wx - radius) / FOG_CELL_SIZE));
      const maxC = Math.min(this.fogCols - 1, Math.floor((wx + radius) / FOG_CELL_SIZE));
      const minR = Math.max(0, Math.floor((wy - radius) / FOG_CELL_SIZE));
      const maxR = Math.min(this.fogRows - 1, Math.floor((wy + radius) / FOG_CELL_SIZE));
      const rSq = radius * radius;
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          const cx = (c + 0.5) * FOG_CELL_SIZE;
          const cy = (r + 0.5) * FOG_CELL_SIZE;
          const dx = cx - wx;
          const dy = cy - wy;
          if (dx * dx + dy * dy <= rSq) {
            this.fogGrid[r * this.fogCols + c] = 2;
          }
        }
      }
    };

    for (const b of this.buildings) {
      if (b.side !== this.localSide || b.hp <= 0) continue;
      revealCircle(b.x, b.y, BUILDING_SPECS[b.type].vision * weatherMod.visionMult);
    }
    for (const sq of this.squads) {
      if (sq.side !== this.localSide || sq.hp <= 0) continue;
      const highBonus = sq.elevationState >= 2 ? 1.18 : 1.0;
      revealCircle(sq.x, sq.y, UNIT_SPECS[sq.type].vision * highBonus * weatherMod.visionMult);
    }
    for (const ping of this.reconPings) {
      if (ping.side === this.localSide) revealCircle(ping.x, ping.y, ping.radius);
    }
    this.fogVersion += 1;
  }

  public isVisibleToLocal(x: number, y: number): boolean {
    const c = Math.max(0, Math.min(this.fogCols - 1, Math.floor(x / FOG_CELL_SIZE)));
    const r = Math.max(0, Math.min(this.fogRows - 1, Math.floor(y / FOG_CELL_SIZE)));
    return this.fogGrid[r * this.fogCols + c] === 2;
  }

  // ---- TACTICAL AI COMMANDER ----

  private runAiCommander() {
    const aiSide: FactionSide = this.localSide === 'blue' ? 'red' : 'blue';
    const aiHq = this.buildings.find((b) => b.side === aiSide && b.type === 'hq' && b.hp > 0);
    if (!aiHq) return;

    const econ = this.economy[aiSide];
    const aiBuildings = this.buildings.filter((b) => b.side === aiSide && b.hp > 0);
    const hasPower = aiBuildings.some((b) => b.type === 'power_plant');
    const hasBarracks = aiBuildings.some((b) => b.type === 'barracks');
    const hasRefinery = aiBuildings.some((b) => b.type === 'refinery');
    const hasLab = aiBuildings.some((b) => b.type === 'tech_lab');
    const hasFactory = aiBuildings.some((b) => b.type === 'factory');
    const hasAirfield = aiBuildings.some((b) => b.type === 'airfield');
    const hasSpecial = aiBuildings.some((b) => b.type === 'faction_special');

    if (econ.powerEfficiency < 0.85 || !hasPower) {
      this.placeBuilding(aiSide, 'power_plant', aiHq.x - 120, aiHq.y + 110, true);
    }
    if (!hasBarracks && econ.alloy >= 130) {
      this.placeBuilding(aiSide, 'barracks', aiHq.x - 140, aiHq.y - 30, true);
    }
    if (!hasRefinery && econ.alloy >= 140) {
      const ore = this.nodes.find((n) => n.kind === 'alloy' && Math.hypot(n.x - aiHq.x, n.y - aiHq.y) < 420);
      if (ore) this.placeBuilding(aiSide, 'refinery', ore.x - 60, ore.y + 40, true);
    }
    if (!hasLab && hasBarracks && econ.alloy >= 175) {
      this.placeBuilding(aiSide, 'tech_lab', aiHq.x - 50, aiHq.y + 140, true);
    }
    if (hasLab && econ.techTier < 2 && !econ.techUpgrading && econ.alloy >= 220) {
      this.upgradeTech(aiSide, true);
    }
    if (!hasFactory && econ.techTier >= 2 && econ.alloy >= 210) {
      this.placeBuilding(aiSide, 'factory', aiHq.x - 190, aiHq.y + 70, true);
    }
    if (!hasAirfield && econ.techTier >= 2 && econ.alloy >= 240) {
      this.placeBuilding(aiSide, 'airfield', aiHq.x - 170, aiHq.y - 120, true);
    }
    if (!hasSpecial && econ.techTier >= 2 && econ.alloy >= 260) {
      this.placeBuilding(aiSide, 'faction_special', aiHq.x - 70, aiHq.y - 130, true);
    }

    // Train squads (including air force & varied armored units)
    const aiUnits = this.squads.filter((s) => s.side === aiSide && s.hp > 0);
    if (aiUnits.length < (this.difficulty === 'komandan' ? 12 : this.difficulty === 'taktis' ? 9 : 6)) {
      if (econ.techTier >= 2 && hasAirfield && econ.alloy >= 270 && Math.random() > 0.55) {
        this.queueUnit(aiSide, econ.techTier >= 3 && Math.random() > 0.5 ? 'strike_fighter' : 'attack_helicopter', true);
      } else if (econ.techTier >= 2 && hasFactory && econ.alloy >= 240) {
        const r = Math.random();
        this.queueUnit(aiSide, r > 0.65 ? 'apc_ifv' : r > 0.3 ? 'battle_tank' : 'anti_air_tank', true);
      } else if (hasBarracks) {
        this.queueUnit(aiSide, Math.random() > 0.45 ? 'rifle_squad' : 'heavy_mg', true);
      }
    }

    // Trigger AI Faction Special when enemies are engaged
    if (hasSpecial && econ.specialActionCooldown <= 0) {
      const fSpec = FACTION_SPECS[this.factions[aiSide]];
      if (econ.alloy >= fSpec.specialActionCost) {
        const playerSquad = this.squads.find((s) => s.side === this.localSide && s.hp > 0);
        if (playerSquad) {
          this.useFactionSpecial(aiSide, playerSquad.x, playerSquad.y, true);
        }
      }
    }

    // Tactical squad orders: contest sectors or attack player
    const combatUnits = aiUnits.filter((s) => !UNIT_SPECS[s.type].canHarvest && s.targetX === null);
    if (combatUnits.length >= 2) {
      const unownedSector = this.sectors.find((s) => s.owner !== aiSide);
      if (unownedSector && Math.random() > 0.35) {
        this.issueMoveOrder(
          combatUnits.slice(0, 3).map((u) => u.id),
          unownedSector.x,
          unownedSector.y,
          true,
          true
        );
      } else {
        const playerHq = this.buildings.find((b) => b.side === this.localSide && b.type === 'hq');
        if (playerHq && combatUnits.length >= 4) {
          this.issueMoveOrder(
            combatUnits.map((u) => u.id),
            playerHq.x,
            playerHq.y,
            true,
            true
          );
        }
      }
    }
  }

  private checkVictoryCondition() {
    const blueHq = this.buildings.some((b) => b.side === 'blue' && b.type === 'hq' && b.hp > 0);
    const redHq = this.buildings.some((b) => b.side === 'red' && b.type === 'hq' && b.hp > 0);
    if (!blueHq) {
      this.winner = 'red';
      this.recordSnapshot('end', 'red', 'Markas Komando Biru hancur!');
      tacticalAudio.playMatchEnd(this.localSide === 'red');
    } else if (!redHq) {
      this.winner = 'blue';
      this.recordSnapshot('end', 'blue', 'Markas Komando Merah hancur!');
      tacticalAudio.playMatchEnd(this.localSide === 'blue');
    }
  }

  public recordSnapshot(kind: ReplayEvent['kind'], side: FactionSide | undefined, summary: string, x?: number, y?: number) {
    if (this.replayEvents.length >= 360) return;
    this.replayEvents.push({
      t: Math.round(this.elapsed),
      kind,
      side,
      summary,
      x,
      y,
      snapshot: {
        blueUnits: this.squads.filter((s) => s.side === 'blue' && s.hp > 0).length,
        redUnits: this.squads.filter((s) => s.side === 'red' && s.hp > 0).length,
        blueAlloy: Math.round(this.economy.blue.alloy),
        blueSectors: this.sectors.filter((s) => s.owner === 'blue').length,
        redSectors: this.sectors.filter((s) => s.owner === 'red').length,
        weather: this.weather,
        units: this.squads
          .filter((s) => s.hp > 0)
          .slice(0, 40)
          .map((s) => ({
            id: s.id,
            s: s.side,
            tp: s.type,
            x: Math.round(s.x),
            y: Math.round(s.y),
            hpPct: Number((s.hp / s.maxHp).toFixed(2)),
          })),
        buildings: this.buildings
          .filter((b) => b.hp > 0)
          .map((b) => ({
            id: b.id,
            s: b.side,
            tp: b.type,
            x: Math.round(b.x),
            y: Math.round(b.y),
            hpPct: Number((b.hp / b.maxHp).toFixed(2)),
          })),
        sectors: this.sectors.map((sec) => ({
          id: sec.id,
          o: sec.owner,
          p: Math.round(sec.progress),
        })),
      },
    });
  }

  public buildSummaryStats(mmrDelta: number, creditsEarned: number): MatchSummaryStats {
    return {
      durationSec: Math.max(1, Math.round(this.elapsed)),
      winnerSide: this.winner ?? this.localSide,
      unitsTrained: this.stats.unitsTrained,
      enemiesEliminated: this.stats.enemiesEliminated,
      sectorsCaptured: this.stats.sectorsCaptured,
      alloyHarvested: Math.round(this.stats.alloyHarvested),
      damageDealt: Math.round(this.stats.damageDealt),
      mmrDelta,
      creditsEarned,
    };
  }

  public getExportedReplayEvents(): ReplayEvent[] {
    return clampReplayEvents(this.replayEvents);
  }

  private computeSteeredStep(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    speed: number,
    dt: number,
    isAir?: boolean
  ): { nx: number; ny: number } {
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy) || 1;
    let baseAngle = Math.atan2(dy, dx);

    const step = speed * dt;
    const candX = sx + Math.cos(baseAngle) * step;
    const candY = sy + Math.sin(baseAngle) * step;

    if (isAir) {
      return { nx: candX, ny: candY };
    }

    // If heading directly into a river (or long water), steer toward nearest bridge/ford
    const nextTerrain = getTerrainAt(this.map, candX, candY);
    if (nextTerrain.isWater && !nextTerrain.isBridge && !nextTerrain.isFord) {
      const isRiver = this.map.zones.some((z) => z.kind === 'river' && pointInZone(candX, candY, z));
      if (isRiver) {
        const crossing = this.findNearestCrossing(sx, sy, tx, ty);
        if (crossing) {
          const ca = Math.atan2(crossing.y - sy, crossing.x - sx);
          const cx = sx + Math.cos(ca) * step;
          const cy = sy + Math.sin(ca) * step;
          if (!this.isPositionBlocked(cx, cy, false)) {
            return { nx: cx, ny: cy };
          }
          baseAngle = ca;
        }
      }
    }

    if (!this.isPositionBlocked(candX, candY, false)) {
      return { nx: candX, ny: candY };
    }

    // Try steering detours around trees, rocks, and ponds
    const offsets = [0.52, -0.52, 0.96, -0.96, 1.45, -1.45];
    for (const off of offsets) {
      const a = baseAngle + off;
      const ax = sx + Math.cos(a) * step;
      const ay = sy + Math.sin(a) * step;
      if (!this.isPositionBlocked(ax, ay, false)) {
        return { nx: ax, ny: ay };
      }
    }

    // Also try slightly bigger lookahead check in case edge-clipped
    if (dist > step * 2) {
      const ax = sx + Math.cos(baseAngle + Math.PI / 2) * step;
      const ay = sy + Math.sin(baseAngle + Math.PI / 2) * step;
      if (!this.isPositionBlocked(ax, ay, false)) return { nx: ax, ny: ay };
    }

    return { nx: sx, ny: sy };
  }

  public isPositionBlocked(x: number, y: number, isAir?: boolean): boolean {
    if (isAir) return false;
    if (!isTerrainPassableForGround(this.map, x, y)) return true;
    for (const b of this.buildings) {
      if (b.hp > 0 && Math.hypot(b.x - x, b.y - y) <= BUILDING_SPECS[b.type].radius + 8) {
        return true;
      }
    }
    return false;
  }
}
