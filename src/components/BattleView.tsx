import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Hammer,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Shield,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { ABILITY_SPECS, BUILDING_SPECS, FACTION_SPECS, UNIT_SPECS } from '../game/catalog';
import { tacticalAudio } from '../game/audio';
import { RtsEngine } from '../game/engine';
import { CameraState, PlacementGhost, RtsRenderer, SelectionBox } from '../game/renderer';
import { getWeatherModifiers } from '../game/rules';
import {
  AbilityId,
  AiDifficulty,
  BuildingTypeId,
  FactionId,
  FactionSide,
  GameMode,
  MapId,
  MatchSummaryStats,
  MultiplayerCommand,
  ReplayEvent,
  SquadStance,
  UnitTypeId,
  UserProfile,
} from '../game/types';
import { multiplayerClient } from '../services/multiplayerClient';
import { FactionFlag } from './EmblemSvg';

interface BattleViewProps {
  mapId: MapId;
  mode: GameMode;
  difficulty: AiDifficulty;
  localSide: FactionSide;
  factionId?: FactionId;
  opponentName: string;
  opponentMmr: number;
  profile: UserProfile;
  onExitToTitle: () => void;
  onMatchRecorded: (params: {
    won: boolean;
    ranked: boolean;
    opponentMmr: number;
    sectorsCaptured: number;
    tanksDeployed: number;
  }) => Promise<{ mmrDelta: number; creditsEarned: number }>;
  onShareReplay: (params: {
    title: string;
    mapId: MapId;
    mode: 'skirmish' | 'ranked_1v1';
    summaryStats: MatchSummaryStats;
    timelineEvents: ReplayEvent[];
  }) => Promise<void>;
}

interface HudSnapshot {
  alloy: number;
  alloyRate: number;
  energyProduced: number;
  energyDemand: number;
  powerEfficiency: number;
  supplyUsed: number;
  supplyCap: number;
  techTier: 1 | 2 | 3;
  techUpgrading: boolean;
  techProgress: number;
  weatherLabel: string;
  elapsed: number;
  blueSectors: number;
  redSectors: number;
  totalSectors: number;
  cooldowns: Record<AbilityId, number>;
  selectedSquads: Array<{
    id: string;
    type: UnitTypeId;
    hp: number;
    maxHp: number;
    suppression: number;
    stance: SquadStance;
    cover: string;
    elevation: number;
  }>;
  hasBarracks: boolean;
  hasFactory: boolean;
  hasTechLab: boolean;
  hasAirfield: boolean;
  hasFactionSpecial: boolean;
  specialActionCooldown: number;
  winner: FactionSide | null;
}

export const BattleView: React.FC<BattleViewProps> = ({
  mapId,
  mode,
  difficulty,
  localSide,
  factionId = 'indonesia',
  opponentName,
  opponentMmr,
  profile,
  onExitToTitle,
  onMatchRecorded,
  onShareReplay,
}) => {
  const fSpec = FACTION_SPECS[factionId];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RtsEngine | null>(null);
  const rendererRef = useRef<RtsRenderer | null>(null);

  const cameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1.0 });
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const selectionBoxRef = useRef<SelectionBox | null>(null);
  const placementTypeRef = useRef<BuildingTypeId | null>(null);
  const abilityTargetRef = useRef<AbilityId | null>(null);
  const specialTargetRef = useRef(false);
  const attackMoveArmedRef = useRef(false);
  const keysPressedRef = useRef<Set<string>>(new Set());
  const pausedRef = useRef(false);
  const matchEndedHandledRef = useRef(false);

  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(tacticalAudio.muted);
  const [dockTab, setDockTab] = useState<'squad' | 'train' | 'build'>('train');
  const [activePlacement, setActivePlacement] = useState<BuildingTypeId | null>(null);
  const [activeAbility, setActiveAbility] = useState<AbilityId | null>(null);
  const [activeSpecialArmed, setActiveSpecialArmed] = useState(false);
  const [attackMoveArmed, setAttackMoveArmed] = useState(false);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [endStats, setEndStats] = useState<MatchSummaryStats | null>(null);
  const [replayTitle, setReplayTitle] = useState('Kemenangan Taktis Ironfront');
  const [replayShared, setReplayShared] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [matchKey, setMatchKey] = useState(0);

  // Sync body dataset state
  useEffect(() => {
    if (endStats) document.body.dataset.state = 'gameover';
    else if (paused) document.body.dataset.state = 'paused';
    else document.body.dataset.state = 'playing';
  }, [paused, endStats]);

  // Wire WebSocket remote commands for multiplayer
  useEffect(() => {
    if (mode === 'skirmish') return;
    multiplayerClient.updateListeners({
      onRemoteCommand: (cmd: MultiplayerCommand) => {
        engineRef.current?.applyRemoteCommand(cmd);
      },
      onOpponentExit: () => {
        if (engineRef.current && !engineRef.current.winner) {
          engineRef.current.winner = localSide;
        }
      },
    });
  }, [mode, localSide]);

  // Mount simulation & canvas loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new RtsEngine({
      mapId,
      mode,
      difficulty,
      localSide,
      localFaction: factionId,
      playerTracerColor: profile.tracerColor,
      playerCamo: profile.camoPalette,
      playerBuildingTheme: profile.buildingTheme,
      playerVisorColor: profile.visorColor,
      playerArmorStyle: profile.armorStyle,
      playerBannerEmblem: profile.bannerEmblem,
      onCommandEmit: mode !== 'skirmish' ? (cmd) => multiplayerClient.emitCommand(cmd) : undefined,
    });
    const renderer = new RtsRenderer();
    engineRef.current = engine;
    rendererRef.current = renderer;
    matchEndedHandledRef.current = false;
    setEndStats(null);
    setReplayShared(false);
    setPaused(false);
    pausedRef.current = false;

    // Initial camera centered on player's spawn (showing HQ, squads, harvester & nearby ore/forest)
    const spawn = localSide === 'blue' ? engine.map.blueSpawn : engine.map.redSpawn;
    const rect = canvas.getBoundingClientRect();
    const viewW = rect.width || window.innerWidth;
    const viewH = rect.height || window.innerHeight;
    const initZoom = 1.0;
    cameraRef.current = {
      x: Math.max(0, Math.min(engine.map.width - viewW / initZoom, spawn.x - viewW * 0.42)),
      y: Math.max(0, Math.min(engine.map.height - viewH / initZoom, spawn.y - viewH * 0.56)),
      zoom: initZoom,
    };

    // Select starting rifle squads immediately
    const initialSquads = engine.squads.filter((s) => s.side === localSide && s.type === 'rifle_squad');
    selectedIdsRef.current = new Set(initialSquads.map((s) => s.id));

    const buildHudSnapshot = (): HudSnapshot => {
      const econ = engine.economy[localSide];
      const selectedSquads = engine.squads
        .filter((s) => selectedIdsRef.current.has(s.id) && s.hp > 0)
        .map((s) => ({
          id: s.id,
          type: s.type,
          hp: Math.round(s.hp),
          maxHp: Math.round(s.maxHp),
          suppression: Math.round(s.suppression),
          stance: s.stance,
          cover:
            s.coverState === 'heavy_trench'
              ? 'Parit (-50%)'
              : s.coverState === 'light_forest'
              ? 'Hutan (-35%)'
              : 'Terbuka',
          elevation: s.elevationState,
        }));

      return {
        alloy: Math.round(econ.alloy),
        alloyRate: econ.alloyRate,
        energyProduced: econ.energyProduced,
        energyDemand: econ.energyDemand,
        powerEfficiency: econ.powerEfficiency,
        supplyUsed: econ.supplyUsed,
        supplyCap: econ.supplyCap,
        techTier: econ.techTier,
        techUpgrading: econ.techUpgrading,
        techProgress: econ.techProgress,
        weatherLabel: getWeatherModifiers(engine.weather).label,
        elapsed: Math.floor(engine.elapsed),
        blueSectors: engine.sectors.filter((s) => s.owner === 'blue').length,
        redSectors: engine.sectors.filter((s) => s.owner === 'red').length,
        totalSectors: engine.sectors.length,
        cooldowns: { ...econ.abilityCooldowns },
        selectedSquads,
        hasBarracks: engine.buildings.some((b) => b.side === localSide && b.type === 'barracks' && b.buildProgress >= 1 && b.hp > 0),
        hasFactory: engine.buildings.some((b) => b.side === localSide && b.type === 'factory' && b.buildProgress >= 1 && b.hp > 0),
        hasTechLab: engine.buildings.some((b) => b.side === localSide && b.type === 'tech_lab' && b.buildProgress >= 1 && b.hp > 0),
        hasAirfield: engine.buildings.some((b) => b.side === localSide && b.type === 'airfield' && b.buildProgress >= 1 && b.hp > 0),
        hasFactionSpecial: engine.buildings.some((b) => b.side === localSide && b.type === 'faction_special' && b.buildProgress >= 1 && b.hp > 0),
        specialActionCooldown: econ.specialActionCooldown,
        winner: engine.winner,
      };
    };
    setHud(buildHudSnapshot());

    const handleResize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width));
      canvas.height = Math.max(1, Math.floor(r.height));
    };
    handleResize();
    const ro = new ResizeObserver(handleResize);
    ro.observe(canvas);

    let lastMouseWorld = { x: spawn.x, y: spawn.y };
    let isPanning = false;
    let panLast = { x: 0, y: 0 };
    let isDraggingBox = false;

    const screenToWorld = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      const cam = cameraRef.current;
      return {
        sx: clientX - r.left,
        sy: clientY - r.top,
        wx: (clientX - r.left) / cam.zoom + cam.x,
        wy: (clientY - r.top) / cam.zoom + cam.y,
      };
    };

    const onPointerDown = (e: MouseEvent) => {
      const pt = screenToWorld(e.clientX, e.clientY);
      lastMouseWorld = { x: pt.wx, y: pt.wy };

      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isPanning = true;
        panLast = { x: e.clientX, y: e.clientY };
        return;
      }

      if (e.button === 0) {
        if (placementTypeRef.current) {
          const placed = engine.placeBuilding(localSide, placementTypeRef.current, pt.wx, pt.wy);
          if (placed) {
            placementTypeRef.current = null;
            setActivePlacement(null);
          }
          return;
        }
        if (abilityTargetRef.current) {
          const used = engine.useAbility(localSide, abilityTargetRef.current, pt.wx, pt.wy);
          if (used) {
            abilityTargetRef.current = null;
            setActiveAbility(null);
          }
          return;
        }
        if (specialTargetRef.current) {
          const used = engine.useFactionSpecial(localSide, pt.wx, pt.wy);
          if (used) {
            specialTargetRef.current = false;
            setActiveSpecialArmed(false);
          }
          return;
        }
        if (attackMoveArmedRef.current) {
          const ids = Array.from(selectedIdsRef.current);
          if (ids.length > 0) engine.issueMoveOrder(ids, pt.wx, pt.wy, true);
          attackMoveArmedRef.current = false;
          setAttackMoveArmed(false);
          return;
        }

        isDraggingBox = true;
        selectionBoxRef.current = { startX: pt.sx, startY: pt.sy, endX: pt.sx, endY: pt.sy };
      } else if (e.button === 2) {
        if (placementTypeRef.current || abilityTargetRef.current || specialTargetRef.current || attackMoveArmedRef.current) {
          placementTypeRef.current = null;
          abilityTargetRef.current = null;
          specialTargetRef.current = false;
          attackMoveArmedRef.current = false;
          setActivePlacement(null);
          setActiveAbility(null);
          setActiveSpecialArmed(false);
          setAttackMoveArmed(false);
          return;
        }

        const ids = Array.from(selectedIdsRef.current);
        if (ids.length === 0) return;

        // Check if right-clicked an enemy unit or building
        const enemyUnit = engine.squads.find(
          (s) => s.side !== localSide && s.hp > 0 && Math.hypot(s.x - pt.wx, s.y - pt.wy) <= 30
        );
        const enemyBuilding = !enemyUnit
          ? engine.buildings.find((b) => b.side !== localSide && b.hp > 0 && Math.hypot(b.x - pt.wx, b.y - pt.wy) <= 46)
          : null;

        if (enemyUnit || enemyBuilding) {
          engine.issueFocusTarget(ids, (enemyUnit || enemyBuilding)!.id);
        } else {
          engine.issueMoveOrder(ids, pt.wx, pt.wy, false);
        }
      }
    };

    const onPointerMove = (e: MouseEvent) => {
      const pt = screenToWorld(e.clientX, e.clientY);
      lastMouseWorld = { x: pt.wx, y: pt.wy };

      if (isPanning) {
        const dx = (e.clientX - panLast.x) / cameraRef.current.zoom;
        const dy = (e.clientY - panLast.y) / cameraRef.current.zoom;
        panLast = { x: e.clientX, y: e.clientY };
        const r = canvas.getBoundingClientRect();
        cameraRef.current.x = Math.max(0, Math.min(engine.map.width - r.width / cameraRef.current.zoom, cameraRef.current.x - dx));
        cameraRef.current.y = Math.max(0, Math.min(engine.map.height - r.height / cameraRef.current.zoom, cameraRef.current.y - dy));
        return;
      }

      if (isDraggingBox && selectionBoxRef.current) {
        selectionBoxRef.current.endX = pt.sx;
        selectionBoxRef.current.endY = pt.sy;
      }
    };

    const onPointerUp = (e: MouseEvent) => {
      if (isPanning) {
        isPanning = false;
        return;
      }
      if (!isDraggingBox || !selectionBoxRef.current) return;
      isDraggingBox = false;
      const box = selectionBoxRef.current;
      selectionBoxRef.current = null;

      const cam = cameraRef.current;
      const minSx = Math.min(box.startX, box.endX);
      const maxSx = Math.max(box.startX, box.endX);
      const minSy = Math.min(box.startY, box.endY);
      const maxSy = Math.max(box.startY, box.endY);
      const isClick = Math.hypot(maxSx - minSx, maxSy - minSy) < 8;

      const minWx = minSx / cam.zoom + cam.x;
      const maxWx = maxSx / cam.zoom + cam.x;
      const minWy = minSy / cam.zoom + cam.y;
      const maxWy = maxSy / cam.zoom + cam.y;

      const nextSet = e.shiftKey ? new Set(selectedIdsRef.current) : new Set<string>();
      if (isClick) {
        const clicked = engine.squads.find(
          (s) => s.side === localSide && s.hp > 0 && Math.hypot(s.x - minWx, s.y - minWy) <= 32
        );
        if (clicked) {
          if (e.shiftKey && nextSet.has(clicked.id)) nextSet.delete(clicked.id);
          else nextSet.add(clicked.id);
        }
      } else {
        for (const sq of engine.squads) {
          if (sq.side === localSide && sq.hp > 0 && sq.x >= minWx && sq.x <= maxWx && sq.y >= minWy && sq.y <= maxWy) {
            nextSet.add(sq.id);
          }
        }
      }
      selectedIdsRef.current = nextSet;
      if (nextSet.size > 0) tacticalAudio.playSelect();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const nextZoom = Math.max(0.55, Math.min(1.4, cameraRef.current.zoom * zoomFactor));
      cameraRef.current.zoom = nextZoom;
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      keysPressedRef.current.add(key);

      if (key === 'escape' || key === 'p') {
        if (placementTypeRef.current || abilityTargetRef.current || specialTargetRef.current) {
          placementTypeRef.current = null;
          abilityTargetRef.current = null;
          specialTargetRef.current = false;
          setActivePlacement(null);
          setActiveAbility(null);
          setActiveSpecialArmed(false);
          return;
        }
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
      } else if (key === 'm') {
        tacticalAudio.muted = !tacticalAudio.muted;
        setMuted(tacticalAudio.muted);
      } else if (key === 'q') {
        attackMoveArmedRef.current = !attackMoveArmedRef.current;
        setAttackMoveArmed(attackMoveArmedRef.current);
      } else if (key === 'r') {
        const ids = Array.from(selectedIdsRef.current);
        if (ids.length > 0) engine.retreatSquads(ids);
      } else if (['1', '2', '3', '4'].includes(key)) {
        const grp = Number(key);
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          for (const sq of engine.squads) {
            if (sq.controlGroup === grp) sq.controlGroup = null;
            if (selectedIdsRef.current.has(sq.id)) sq.controlGroup = grp;
          }
        } else {
          const matching = engine.squads.filter((s) => s.side === localSide && s.hp > 0 && s.controlGroup === grp);
          if (matching.length > 0) {
            selectedIdsRef.current = new Set(matching.map((s) => s.id));
            tacticalAudio.playSelect();
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.key.toLowerCase());
    };

    const clearInputs = () => {
      keysPressedRef.current.clear();
      isDraggingBox = false;
      isPanning = false;
    };

    canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);

    let rafId = 0;
    let lastTime = performance.now();
    let hudTimer = 0.25;
    let lastHudJson = '';

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      // Smooth keyboard camera panning
      const panSpeed = 620 / cameraRef.current.zoom;
      const keys = keysPressedRef.current;
      let camDx = 0;
      let camDy = 0;
      if (keys.has('w') || keys.has('arrowup')) camDy -= panSpeed * dt;
      if (keys.has('s') || keys.has('arrowdown')) camDy += panSpeed * dt;
      if (keys.has('a') || keys.has('arrowleft')) camDx -= panSpeed * dt;
      if (keys.has('d') || keys.has('arrowright')) camDx += panSpeed * dt;

      const r = canvas.getBoundingClientRect();
      if (camDx !== 0 || camDy !== 0) {
        cameraRef.current.x = Math.max(
          0,
          Math.min(engine.map.width - r.width / cameraRef.current.zoom, cameraRef.current.x + camDx)
        );
        cameraRef.current.y = Math.max(
          0,
          Math.min(engine.map.height - r.height / cameraRef.current.zoom, cameraRef.current.y + camDy)
        );
      }

      if (pausedRef.current && camDx === 0 && camDy === 0) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      const frameStart = performance.now();
      if (!pausedRef.current) {
        engine.step(dt);
      }

      // Render main battlefield
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        const ghost: PlacementGhost | null = placementTypeRef.current
          ? {
              type: placementTypeRef.current,
              worldX: lastMouseWorld.x,
              worldY: lastMouseWorld.y,
              valid: engine.canPlaceBuilding(localSide, placementTypeRef.current, lastMouseWorld.x, lastMouseWorld.y).ok,
            }
          : null;
        renderer.render(
          ctx,
          engine,
          cameraRef.current,
          r.width,
          r.height,
          selectedIdsRef.current,
          selectionBoxRef.current,
          ghost,
          dt
        );
        ctx.restore();
      }

      // Check match end once
      if (engine.winner && !matchEndedHandledRef.current) {
        matchEndedHandledRef.current = true;
        const won = engine.winner === localSide;
        if (mode !== 'skirmish') {
          multiplayerClient.finishMatch('completed');
        }
        onMatchRecorded({
          won,
          ranked: mode === 'ranked_1v1',
          opponentMmr,
          sectorsCaptured: engine.stats.sectorsCaptured,
          tanksDeployed: engine.stats.tanksDeployed,
        })
          .then(({ mmrDelta, creditsEarned }) => {
            setEndStats(engine.buildSummaryStats(mmrDelta, creditsEarned));
          })
          .catch(() => {
            setEndStats(engine.buildSummaryStats(0, won ? 200 : 100));
          });
      }

      // Throttled HUD & minimap update (~4Hz)
      hudTimer += dt;
      if (hudTimer >= 0.25) {
        hudTimer = 0;
        const miniCanvas = minimapRef.current;
        if (miniCanvas) {
          const mctx = miniCanvas.getContext('2d');
          if (mctx) {
            renderer.renderMinimap(
              mctx,
              engine,
              cameraRef.current,
              r.width,
              r.height,
              miniCanvas.width,
              miniCanvas.height
            );
          }
        }
        const nextHud = buildHudSnapshot();
        const nextJson = JSON.stringify(nextHud);
        if (nextJson !== lastHudJson) {
          lastHudJson = nextJson;
          setHud(nextHud);
        }
      }

      const frameElapsed = performance.now() - frameStart;
      if (frameElapsed > 22) {
        timeoutId = window.setTimeout(() => {
          rafId = requestAnimationFrame(loop);
        }, 12);
      } else {
        rafId = requestAnimationFrame(loop);
      }
    };

    let timeoutId = 0;
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      ro.disconnect();
      canvas.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
    };
  }, [
    mapId,
    mode,
    difficulty,
    localSide,
    factionId,
    opponentMmr,
    profile.camoPalette,
    profile.tracerColor,
    profile.visorColor,
    profile.armorStyle,
    profile.bannerEmblem,
    matchKey,
  ]);

  const handleMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mini = minimapRef.current;
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!mini || !engine || !canvas) return;
    const rect = mini.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const crect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const wx = rx * engine.map.width - crect.width / (2 * cam.zoom);
    const wy = ry * engine.map.height - crect.height / (2 * cam.zoom);
    cam.x = Math.max(0, Math.min(engine.map.width - crect.width / cam.zoom, wx));
    cam.y = Math.max(0, Math.min(engine.map.height - crect.height / cam.zoom, wy));
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleShareMatchReplay = async () => {
    if (!engineRef.current || !endStats || replayShared) return;
    setSharingBusy(true);
    try {
      await onShareReplay({
        title: replayTitle,
        mapId,
        mode: mode === 'ranked_1v1' ? 'ranked_1v1' : 'skirmish',
        summaryStats: endStats,
        timelineEvents: engineRef.current.getExportedReplayEvents(),
      });
      setReplayShared(true);
    } finally {
      setSharingBusy(false);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#090c10] select-none">
      {/* Live RTS Battlefield Canvas */}
      <canvas
        ref={canvasRef}
        data-testid="rts-canvas"
        className={`w-full h-full block ${
          activePlacement || activeAbility || activeSpecialArmed || attackMoveArmed ? 'cursor-crosshair' : 'cursor-default'
        }`}
      />

      {/* World-Matched Perimeter HUD (Pointer Pass-Through) */}
      <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-4">
        {/* Top Row: Left Economy & Weather | Right Strikes & Controls */}
        <div className="flex items-start justify-between gap-3">
          {/* Top-Left Tactical Economy & Faction Flag Readout */}
          {hud && (
            <div className="pointer-events-auto bg-[#0b0e12]/90 border border-slate-700/80 rounded-md px-3.5 py-2 flex flex-wrap items-center gap-4 shadow-lg">
              <div className="flex items-center gap-2 pr-1">
                <FactionFlag factionId={factionId} className="w-8 h-5" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">{fSpec.countryCode}</div>
                  <div className="text-xs font-bold text-slate-100 leading-tight">{fSpec.shortName}</div>
                </div>
              </div>
              <div className="h-7 w-px bg-slate-800" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Logam</div>
                <div className="font-mono-tabular text-lg font-bold text-amber-300 leading-tight">
                  {hud.alloy}{' '}
                  <span className="text-[11px] font-normal text-amber-500">+{hud.alloyRate}</span>
                </div>
              </div>
              <div className="h-7 w-px bg-slate-800" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Energi</div>
                <div
                  className={`font-mono-tabular text-lg font-bold leading-tight ${
                    hud.powerEfficiency < 1 ? 'text-red-400' : 'text-sky-300'
                  }`}
                >
                  {hud.energyProduced}/{hud.energyDemand}{' '}
                  <span className="text-[11px] font-normal">
                    {Math.round(hud.powerEfficiency * 100)}%
                  </span>
                </div>
              </div>
              <div className="h-7 w-px bg-slate-800" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Suplai</div>
                <div className="font-mono-tabular text-lg font-bold text-slate-100 leading-tight">
                  {hud.supplyUsed}/{hud.supplyCap}
                </div>
              </div>
              <div className="h-7 w-px bg-slate-800 hidden sm:block" />
              <div className="hidden sm:block">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Era {hud.techTier} · Sektor {localSide === 'blue' ? hud.blueSectors : hud.redSectors}/{hud.totalSectors}
                </div>
                <div className="font-mono-tabular text-xs font-medium text-slate-300 mt-0.5">
                  {hud.weatherLabel} · {formatTimer(hud.elapsed)}
                </div>
              </div>
            </div>
          )}

          {/* Top-Right Tactical Strikes + Faction Special Action + Utility Buttons */}
          <div className="pointer-events-auto flex items-center gap-2">
            {hud && (
              <div className="hidden md:flex items-center gap-1.5 bg-[#0b0e12]/90 border border-slate-700/80 rounded-md p-1.5 shadow-lg">
                {(Object.keys(ABILITY_SPECS) as AbilityId[]).map((abId) => {
                  const ab = ABILITY_SPECS[abId];
                  const cd = Math.ceil(hud.cooldowns[abId]);
                  const locked = hud.techTier < ab.techTier;
                  const armed = activeAbility === abId;
                  return (
                    <button
                      key={abId}
                      type="button"
                      disabled={locked || cd > 0 || hud.alloy < ab.alloyCost}
                      title={`${ab.name} (${ab.alloyCost} Logam) — ${ab.description}`}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        if (abId === 'supply_drop') {
                          engineRef.current?.useAbility(localSide, 'supply_drop', 0, 0);
                        } else {
                          const next = armed ? null : abId;
                          abilityTargetRef.current = next;
                          setActiveAbility(next);
                          specialTargetRef.current = false;
                          setActiveSpecialArmed(false);
                          placementTypeRef.current = null;
                          setActivePlacement(null);
                        }
                      }}
                      className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        armed
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : locked || cd > 0 || hud.alloy < ab.alloyCost
                          ? 'bg-slate-900 text-slate-500 cursor-not-allowed'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                      }`}
                    >
                      {ab.name} {cd > 0 ? `(${cd}d)` : ab.alloyCost > 0 ? `· ${ab.alloyCost}` : ''}
                    </button>
                  );
                })}

                {/* Unique Faction Special Action Button */}
                {(() => {
                  const spCd = Math.ceil(hud.specialActionCooldown);
                  const spDisabled = !hud.hasFactionSpecial || spCd > 0 || hud.alloy < fSpec.specialActionCost;
                  return (
                    <button
                      type="button"
                      disabled={spDisabled}
                      title={`${fSpec.specialActionName} (${fSpec.specialActionCost} Logam) — ${
                        hud.hasFactionSpecial ? fSpec.specialActionDesc : `Bangun ${fSpec.specialBuildingName} terlebih dahulu`
                      }`}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        if (!fSpec.specialActionNeedsTarget) {
                          engineRef.current?.useFactionSpecial(localSide, 0, 0);
                        } else {
                          const next = !activeSpecialArmed;
                          specialTargetRef.current = next;
                          setActiveSpecialArmed(next);
                          abilityTargetRef.current = null;
                          setActiveAbility(null);
                          placementTypeRef.current = null;
                          setActivePlacement(null);
                        }
                      }}
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                        activeSpecialArmed
                          ? 'bg-sky-500 border-sky-400 text-slate-950'
                          : spDisabled
                          ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                          : 'bg-sky-900/70 hover:bg-sky-800 border-sky-600/80 text-sky-100'
                      }`}
                    >
                      ★ {fSpec.specialActionName} {spCd > 0 ? `(${spCd}d)` : !hud.hasFactionSpecial ? '(Terkunci)' : `· ${fSpec.specialActionCost}`}
                    </button>
                  );
                })()}
              </div>
            )}

            <div className="flex items-center gap-1.5 bg-[#0b0e12]/90 border border-slate-700/80 rounded-md p-1.5 shadow-lg">
              <button
                type="button"
                aria-label={muted ? 'Aktifkan Suara' : 'Bisukan Suara'}
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  tacticalAudio.muted = !tacticalAudio.muted;
                  setMuted(tacticalAudio.muted);
                }}
                className="w-9 h-9 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                aria-label="Jeda Pertempuran"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  pausedRef.current = !pausedRef.current;
                  setPaused(pausedRef.current);
                }}
                className="w-9 h-9 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
              >
                <Pause className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Row: Left Minimap | Right Unified Command Dock */}
        <div className="flex items-end justify-between gap-3">
          {/* Interactive Minimap */}
          <div className="pointer-events-auto bg-[#0b0e12]/92 border border-slate-700/80 rounded-md p-2 shadow-lg hidden sm:block">
            <canvas
              ref={minimapRef}
              width={210}
              height={145}
              onClick={handleMinimapClick}
              className="rounded-sm cursor-pointer block border border-slate-800"
            />
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 px-0.5">
              <span>Radar Taktis</span>
              <span>Lawan: {opponentName}</span>
            </div>
          </div>

          {/* Unified Command Dock */}
          <div className="pointer-events-auto bg-[#0b0e12]/92 border border-slate-700/80 rounded-md p-2.5 shadow-lg w-full sm:w-auto sm:min-w-[560px] max-w-[780px]">
            <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDockTab('train')}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                    dockTab === 'train' ? 'bg-amber-600 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Pasukan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDockTab('build')}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                    dockTab === 'build' ? 'bg-amber-600 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Hammer className="w-3.5 h-3.5" />
                  <span>Konstruksi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDockTab('squad')}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                    dockTab === 'squad' ? 'bg-amber-600 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Skuad ({hud?.selectedSquads.length ?? 0})</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    attackMoveArmedRef.current = !attackMoveArmedRef.current;
                    setAttackMoveArmed(attackMoveArmedRef.current);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer flex items-center gap-1 ${
                    attackMoveArmed
                      ? 'bg-red-600 border-red-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <Crosshair className="w-3 h-3" />
                  <span>Serbu [Q]</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ids = Array.from(selectedIdsRef.current);
                    if (ids.length > 0) engineRef.current?.retreatSquads(ids);
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium rounded bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  Mundur [R]
                </button>
              </div>
            </div>

            {dockTab === 'train' && hud && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-64 overflow-y-auto pr-0.5">
                {(Object.keys(UNIT_SPECS) as UnitTypeId[]).map((uId) => {
                  const u = UNIT_SPECS[uId];
                  const hasProducer =
                    u.producedAt === 'hq' ||
                    (u.producedAt === 'barracks' && hud.hasBarracks) ||
                    (u.producedAt === 'factory' && hud.hasFactory) ||
                    (u.producedAt === 'airfield' && hud.hasAirfield);
                  const tierOk = hud.techTier >= u.techTier;
                  const canAfford = hud.alloy >= u.alloyCost && hud.supplyUsed + u.supplyCost <= hud.supplyCap;
                  const enabled = hasProducer && tierOk && canAfford;
                  const displayName =
                    uId === 'battle_tank'
                      ? fSpec.primaryTank
                      : uId === 'strike_fighter'
                      ? fSpec.fighterJet
                      : u.name;

                  return (
                    <button
                      key={uId}
                      type="button"
                      disabled={!enabled}
                      title={`${displayName} — ${u.role} (${u.alloyCost} Logam, ${u.supplyCost} Suplai)`}
                      onClick={() => engineRef.current?.queueUnit(localSide, uId)}
                      className={`p-2 rounded border text-left transition-colors ${
                        enabled
                          ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100 cursor-pointer'
                          : 'bg-slate-950/60 border-slate-800/80 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono-tabular">
                        <span className={u.isAir ? 'text-sky-400' : 'text-amber-400'}>
                          {u.isAir ? 'Udara' : u.isVehicle ? 'Baja' : 'Skuad'}
                        </span>
                        <span>{u.alloyCost}L</span>
                      </div>
                      <div className="text-[11px] font-semibold leading-tight line-clamp-2 mt-1">{displayName}</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {!tierOk
                          ? `Butuh Era ${u.techTier}`
                          : !hasProducer
                          ? u.producedAt === 'barracks'
                            ? 'Butuh Barak'
                            : u.producedAt === 'airfield'
                            ? 'Butuh Bandara'
                            : 'Butuh Pabrik'
                          : `${u.supplyCost} Suplai`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {dockTab === 'build' && hud && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(
                    [
                      'power_plant',
                      'refinery',
                      'barracks',
                      'tech_lab',
                      'factory',
                      'airfield',
                      'watchtower',
                      'faction_special',
                    ] as BuildingTypeId[]
                  ).map((bId) => {
                    const b = BUILDING_SPECS[bId];
                    const tierOk = hud.techTier >= b.techTier;
                    const canAfford = hud.alloy >= b.alloyCost;
                    const selected = activePlacement === bId;
                    const displayName = bId === 'faction_special' ? fSpec.specialBuildingName : b.name;
                    const displayRole = bId === 'faction_special' ? fSpec.specialBuildingDesc : b.role;

                    return (
                      <button
                        key={bId}
                        type="button"
                        disabled={!tierOk || !canAfford}
                        title={`${displayName} — ${displayRole}`}
                        onClick={() => {
                          const next = selected ? null : bId;
                          placementTypeRef.current = next;
                          setActivePlacement(next);
                          abilityTargetRef.current = null;
                          setActiveAbility(null);
                          specialTargetRef.current = false;
                          setActiveSpecialArmed(false);
                        }}
                        className={`p-2 rounded border text-left transition-colors ${
                          selected
                            ? 'bg-amber-500/20 border-amber-500 text-amber-200 cursor-pointer'
                            : tierOk && canAfford
                            ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100 cursor-pointer'
                            : 'bg-slate-950/60 border-slate-800/80 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono-tabular">
                          <span className={bId === 'faction_special' ? 'text-sky-400' : 'text-amber-400'}>
                            Era {b.techTier}
                          </span>
                          <span>{b.alloyCost}L</span>
                        </div>
                        <div className="text-[11px] font-semibold leading-tight line-clamp-2 mt-1">{displayName}</div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {!tierOk ? `Butuh Era ${b.techTier}` : b.powerOutput > 0 ? `+${b.powerOutput}E` : `${b.powerOutput}E`}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {hud.hasTechLab && hud.techTier < 3 && (
                  <button
                    type="button"
                    disabled={hud.techUpgrading || hud.alloy < (hud.techTier === 1 ? 220 : 340)}
                    onClick={() => engineRef.current?.upgradeTech(localSide)}
                    className="w-full py-1.5 px-3 rounded bg-sky-900/50 hover:bg-sky-800/60 border border-sky-700 text-xs font-semibold text-sky-200 flex items-center justify-between cursor-pointer disabled:opacity-50"
                  >
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>
                        {hud.techUpgrading
                          ? `Meneliti Era ${hud.techTier + 1}... ${Math.round(hud.techProgress * 100)}%`
                          : `Tingkatkan ke Era ${hud.techTier + 1}`}
                      </span>
                    </span>
                    <span className="font-mono-tabular">{hud.techTier === 1 ? 220 : 340} Logam</span>
                  </button>
                )}
              </div>
            )}

            {dockTab === 'squad' && hud && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                {hud.selectedSquads.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">
                    Seret kotak di medan perang untuk memilih skuad, atau klik kanan untuk bergerak dan menyerang.
                  </p>
                ) : (
                  <>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-slate-100">
                        {hud.selectedSquads.length} Skuad Dipilih · {UNIT_SPECS[hud.selectedSquads[0].type].name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono-tabular">
                        HP {hud.selectedSquads[0].hp}/{hud.selectedSquads[0].maxHp} · Perlindungan:{' '}
                        {hud.selectedSquads[0].cover} · Elevasi {hud.selectedSquads[0].elevation}
                        {hud.selectedSquads[0].suppression >= 35 ? ' · TERTEKAN' : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          { id: 'aggressive', label: 'Agresif' },
                          { id: 'hold', label: 'Bertahan' },
                          { id: 'dispersed', label: 'Pencar' },
                        ] as const
                      ).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => {
                            const ids = Array.from(selectedIdsRef.current);
                            engineRef.current?.setSquadStance(ids, st.id);
                          }}
                          className={`px-2.5 py-1.5 text-xs rounded border cursor-pointer ${
                            hud.selectedSquads[0].stance === st.id
                              ? 'bg-amber-600 border-amber-500 text-slate-950 font-semibold'
                              : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pause Modal */}
      {paused && !endStats && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#12171e] border border-slate-700 rounded-lg p-6 w-full max-w-sm space-y-5 shadow-2xl">
            <div>
              <h2 className="font-display text-3xl font-bold text-slate-100">Pertempuran Dijeda</h2>
              <p className="text-xs text-slate-400 mt-1">
                Tekan P atau Escape untuk melanjutkan komando di medan perang.
              </p>
            </div>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  pausedRef.current = false;
                  setPaused(false);
                }}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm rounded-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>Lanjutkan Pertempuran</span>
              </button>
              <button
                type="button"
                onClick={() => setMatchKey((k) => k + 1)}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm rounded-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Mulai Ulang Peta</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mode !== 'skirmish') multiplayerClient.finishMatch('surrender');
                  onExitToTitle();
                }}
                className="w-full py-2.5 px-4 bg-red-950/60 hover:bg-red-900/70 border border-red-800 text-red-200 font-medium text-sm rounded-md cursor-pointer"
              >
                Keluar ke Menu Utama
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Victory / Defeat Modal */}
      {endStats && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#12171e] border border-slate-700 rounded-lg p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div>
              <div className="text-xs font-mono-tabular text-amber-400">
                {endStats.winnerSide === localSide ? 'OPERASI BERHASIL' : 'MARKAS JATUH'} ·{' '}
                {profile.victoryEmote}
              </div>
              <h2 className="font-display text-4xl font-bold text-slate-100 mt-1">
                {endStats.winnerSide === localSide ? 'KEMENANGAN MUTLAK' : 'KEKALAHAN TAKTIS'}
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-[#0b0e12] border border-slate-800 rounded p-3">
                <div className="text-[11px] text-slate-400">Durasi</div>
                <div className="font-mono-tabular text-lg font-bold text-slate-100">
                  {formatTimer(endStats.durationSec)}
                </div>
              </div>
              <div className="bg-[#0b0e12] border border-slate-800 rounded p-3">
                <div className="text-[11px] text-slate-400">Kredit</div>
                <div className="font-mono-tabular text-lg font-bold text-amber-300">
                  +{endStats.creditsEarned}
                </div>
              </div>
              <div className="bg-[#0b0e12] border border-slate-800 rounded p-3">
                <div className="text-[11px] text-slate-400">Perubahan MMR</div>
                <div
                  className={`font-mono-tabular text-lg font-bold ${
                    endStats.mmrDelta >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {endStats.mmrDelta >= 0 ? `+${endStats.mmrDelta}` : endStats.mmrDelta}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-300 font-mono-tabular flex items-center justify-between bg-[#0b0e12] border border-slate-800 rounded px-3.5 py-2.5">
              <span>Unit Musuh Hancur: {endStats.enemiesEliminated}</span>
              <span>Sektor Direbut: {endStats.sectorsCaptured}</span>
            </div>

            {/* Share Replay to Community */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label htmlFor="replay-title-input" className="block text-xs text-slate-300">
                Judul Replay untuk Komunitas Global
              </label>
              <div className="flex gap-2">
                <input
                  id="replay-title-input"
                  type="text"
                  maxLength={80}
                  value={replayTitle}
                  onChange={(e) => setReplayTitle(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs bg-[#0b0e12] border border-slate-700 rounded text-slate-100"
                />
                <button
                  type="button"
                  disabled={replayShared || sharingBusy}
                  onClick={handleShareMatchReplay}
                  className="px-3.5 py-2 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Share2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>{replayShared ? 'Dibagikan' : sharingBusy ? 'Menyimpan...' : 'Bagikan Replay'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                data-start="true"
                onClick={() => setMatchKey((k) => k + 1)}
                className="flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm rounded-md cursor-pointer"
              >
                Main Lagi
              </button>
              <button
                type="button"
                onClick={onExitToTitle}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm rounded-md cursor-pointer"
              >
                Menu Utama
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
