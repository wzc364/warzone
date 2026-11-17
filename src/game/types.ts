export type FactionSide = 'blue' | 'red';

export type FactionId =
  | 'usa'
  | 'china'
  | 'russia'
  | 'indonesia'
  | 'japan'
  | 'ukraine'
  | 'uk'
  | 'south_korea';

export type MapId =
  | 'iron_valley'
  | 'storm_delta'
  | 'frost_ridge'
  | 'scorched_canyon'
  | 'obsidian_caldera'
  | 'emerald_archipelago';

export type WeatherType = 'clear' | 'dusk' | 'rainstorm' | 'fog_night' | 'snow_squall';

export type CoverType = 'none' | 'light_forest' | 'heavy_trench';

export type SquadStance = 'aggressive' | 'hold' | 'dispersed';

export type SquadFormation = 'line' | 'wedge' | 'loose';

export type UnitTypeId =
  | 'rifle_squad'
  | 'heavy_mg'
  | 'recon_sniper'
  | 'battle_tank'
  | 'rocket_artillery'
  | 'engineer_harvester'
  | 'apc_ifv'
  | 'anti_air_tank'
  | 'heavy_siege_tank'
  | 'attack_helicopter'
  | 'strike_fighter';

export type BuildingTypeId =
  | 'hq'
  | 'refinery'
  | 'power_plant'
  | 'barracks'
  | 'factory'
  | 'tech_lab'
  | 'watchtower'
  | 'airfield'
  | 'faction_special';

export type AbilityId = 'artillery_strike' | 'recon_scan' | 'supply_drop';

export type RankTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Grandmaster';

export type PortraitId = 'vanguard' | 'sentinel' | 'spectre';

export type AiDifficulty = 'rekrut' | 'taktis' | 'komandan';

export type GameMode = 'skirmish' | 'ranked_1v1' | 'custom_1v1';

export type BiomeId = 'temperate' | 'delta' | 'alpine' | 'desert' | 'volcanic' | 'jungle';

export interface TerrainZone {
  id: string;
  kind: 'plateau' | 'forest' | 'trench' | 'river' | 'pond' | 'bridge' | 'ford' | 'road' | 'tree' | 'rock';
  x: number;
  y: number;
  w: number;
  h: number;
  elevation: 0 | 1 | 2;
  rotation?: number;
}

export interface ResourceNode {
  id: string;
  kind: 'alloy' | 'energy';
  x: number;
  y: number;
  amount: number;
  maxAmount: number;
}

export interface CaptureSector {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  owner: FactionSide | 'neutral';
  capturingSide: FactionSide | null;
  progress: number; // -100 (red) to +100 (blue), 0 neutral
  alloyBonus: number;
  supplyBonus: number;
}

export interface GameMapSpec {
  id: MapId;
  name: string;
  subtitle: string;
  description: string;
  width: number;
  height: number;
  biome: BiomeId;
  previewImage: string;
  weatherCycle: WeatherType[];
  zones: TerrainZone[];
  nodes: Omit<ResourceNode, 'amount'>[];
  sectors: Omit<CaptureSector, 'owner' | 'capturingSide' | 'progress'>[];
  blueSpawn: { x: number; y: number };
  redSpawn: { x: number; y: number };
}

export interface UnitSpec {
  id: UnitTypeId;
  name: string;
  role: string;
  hotkey: string;
  alloyCost: number;
  energyCost: number;
  supplyCost: number;
  trainTime: number;
  techTier: 1 | 2 | 3;
  producedAt: 'hq' | 'barracks' | 'factory' | 'airfield';
  memberCount: number;
  hpPerMember: number;
  speed: number;
  range: number;
  vision: number;
  damage: number;
  reloadTime: number;
  suppressionPower: number;
  armorClass: 'infantry' | 'light' | 'heavy';
  antiArmorMult: number;
  splashRadius: number;
  isVehicle: boolean;
  isAir?: boolean;
  canCapture: boolean;
  canHarvest: boolean;
  canRepair: boolean;
}

export interface BuildingSpec {
  id: BuildingTypeId;
  name: string;
  role: string;
  hotkey: string;
  alloyCost: number;
  energyCost: number;
  powerOutput: number; // positive produces, negative consumes
  supplyBonus: number;
  maxHp: number;
  radius: number;
  vision: number;
  buildTime: number;
  techTier: 1 | 2 | 3;
  attackRange?: number;
  attackDamage?: number;
}

export interface SoldierMember {
  offsetX: number;
  offsetY: number;
  hp: number;
  maxHp: number;
  recoil: number;
  flashTimer: number;
  gaitPhase: number;
}

export interface Squad {
  id: string;
  side: FactionSide;
  type: UnitTypeId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  turretHeading: number;
  targetX: number | null;
  targetY: number | null;
  attackMoveTarget: { x: number; y: number } | null;
  focusTargetId: string | null;
  stance: SquadStance;
  formation: SquadFormation;
  members: SoldierMember[];
  hp: number;
  maxHp: number;
  suppression: number; // 0..100
  morale: number; // 0..100
  reloadTimer: number;
  controlGroup: number | null;
  retreating: boolean;
  harvestTargetId: string | null;
  harvestCargo: number;
  coverState: CoverType;
  elevationState: number;
  concealed: boolean;
  killCount: number;
  veterancy: number;
  koTimer: number; // >0 while playing KO dissolve
  recoilTimer?: number;
  repairTargetId?: string | null;
  trackDistance?: number;
}

export interface Building {
  id: string;
  side: FactionSide;
  type: BuildingTypeId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  buildProgress: number; // 0..1
  rallyX: number;
  rallyY: number;
  queue: { unitType: UnitTypeId; remaining: number; total: number }[];
  attackTimer: number;
  flashTimer: number;
}

export interface Projectile {
  id: string;
  side: FactionSide;
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
  damage: number;
  suppression: number;
  splashRadius: number;
  antiArmorMult: number;
  isArtillery: boolean;
  color: string;
}

export interface CraterDecal {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

export interface TreadMark {
  x: number;
  y: number;
  heading: number;
  alpha: number;
  width: number;
}

export interface SideEconomy {
  alloy: number;
  energyProduced: number;
  energyDemand: number;
  powerEfficiency: number; // 0.4..1.0
  supplyUsed: number;
  supplyCap: number;
  techTier: 1 | 2 | 3;
  techProgress: number;
  techUpgrading: boolean;
  alloyRate: number;
  abilityCooldowns: Record<AbilityId, number>;
  specialActionCooldown: number;
}

export interface ReplayEvent {
  t: number; // match seconds
  kind: 'spawn' | 'move' | 'build' | 'capture' | 'combat' | 'weather' | 'strike' | 'end';
  side?: FactionSide;
  summary: string;
  x?: number;
  y?: number;
  snapshot?: {
    blueUnits: number;
    redUnits: number;
    blueAlloy: number;
    blueSectors: number;
    redSectors: number;
    weather: WeatherType;
    units: Array<{
      id: string;
      s: FactionSide;
      tp: UnitTypeId;
      x: number;
      y: number;
      hpPct: number;
    }>;
    buildings: Array<{
      id: string;
      s: FactionSide;
      tp: BuildingTypeId;
      x: number;
      y: number;
      hpPct: number;
    }>;
    sectors: Array<{
      id: string;
      o: FactionSide | 'neutral';
      p: number;
    }>;
  };
}

export interface MatchSummaryStats {
  durationSec: number;
  winnerSide: FactionSide;
  unitsTrained: number;
  enemiesEliminated: number;
  sectorsCaptured: number;
  alloyHarvested: number;
  damageDealt: number;
  mmrDelta: number;
  creditsEarned: number;
}

export interface CommunityReplayDoc {
  replayId: string;
  authorUid: string;
  authorName: string;
  authorRankTier: RankTier;
  title: string;
  mapId: MapId;
  mode: 'skirmish' | 'ranked_1v1';
  durationSec: number;
  winnerSide: FactionSide;
  likesCount: number;
  timelineEvents: ReplayEvent[];
  summaryStats: MatchSummaryStats;
  createdAt: string;
  isFeatured?: boolean;
}

export interface CommanderLoadout {
  commanderName: string;
  portraitId: PortraitId;
  buildingTheme: string;
  armorStyle: string;
  visorColor: string;
  camoPalette: string;
  bannerEmblem: string;
  tracerColor: string;
  victoryEmote: string;
}

export interface DailyMissionItem {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardCredits: number;
  claimed: boolean;
  metric: 'matches_played' | 'wins' | 'sectors_captured' | 'tanks_deployed';
}

export interface UserProfile {
  uid: string;
  commanderName: string;
  portraitId: PortraitId;
  buildingTheme: string;
  armorStyle: string;
  visorColor: string;
  camoPalette: string;
  bannerEmblem: string;
  tracerColor: string;
  victoryEmote: string;
  rankTier: RankTier;
  mmr: number;
  wins: number;
  losses: number;
  credits: number;
  streakDay: number;
  lastClaimDayKey: string;
  unlockedCosmetics: string[];
  dailyMissions: DailyMissionItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CosmeticItem {
  id: string;
  category:
    | 'buildingTheme'
    | 'armorStyle'
    | 'visorColor'
    | 'camoPalette'
    | 'bannerEmblem'
    | 'tracerColor'
    | 'victoryEmote';
  name: string;
  description: string;
  price: number;
  value: string;
  previewImage: string;
  swatchHex?: string;
  secondaryHex?: string;
}

export interface MultiplayerCommand {
  kind:
    | 'move'
    | 'attackMove'
    | 'stance'
    | 'retreat'
    | 'build'
    | 'train'
    | 'upgradeTech'
    | 'ability'
    | 'factionSpecial';
  payload: Record<string, unknown>;
}
