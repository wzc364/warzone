import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  LogIn,
  LogOut,
  Play,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Users,
} from 'lucide-react';
import { COSMETIC_CATALOG, FACTION_SPECS, MAPS } from '../game/catalog';
import { FACTION_JET_URLS, FACTION_TANK_URLS } from '../game/sprites';
import {
  AiDifficulty,
  CommanderLoadout,
  CommunityReplayDoc,
  CosmeticItem,
  FactionId,
  MapId,
  UserProfile,
} from '../game/types';
import { MatchedGameInfo, ServerStats } from '../services/multiplayerClient';
import { CustomizerPanel } from './CustomizerPanel';
import { DailyProgressPanel } from './DailyProgressPanel';
import { CommanderAvatar, FactionFlag, RankInsignia, TitleBrandEmblem } from './EmblemSvg';
import { LeaderboardPanel } from './LeaderboardPanel';
import { ReplayCommunityPanel } from './ReplayCommunityPanel';
import { ShopPanel } from './ShopPanel';

export type HubTab = 'play' | 'customize' | 'shop' | 'missions' | 'replays' | 'leaderboard';

interface TitleHubProps {
  profile: UserProfile;
  isFirebaseAuthed: boolean;
  authBusy: boolean;
  wsConnected: boolean;
  wsStats: ServerStats;
  wsLatency: number | null;
  queueStatus: 'idle' | 'searching';
  createdRoomCode: string | null;
  roomError: string | null;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onStartSkirmish: (mapId: MapId, difficulty: AiDifficulty, factionId: FactionId) => void;
  onJoinRankedQueue: (mapId: MapId) => void;
  onLeaveRankedQueue: () => void;
  onCreateCustomRoom: (mapId: MapId) => void;
  onJoinCustomRoom: (code: string) => void;
  onSaveCustomization: (loadout: CommanderLoadout) => Promise<void>;
  onPurchaseCosmetic: (item: CosmeticItem) => Promise<void>;
  onEquipCosmetic: (item: CosmeticItem) => Promise<void>;
  onClaimStreak: () => Promise<void>;
  onClaimMission: (missionId: string) => Promise<void>;
  onWatchReplay: (replay: CommunityReplayDoc) => void;
  matchedInfo: MatchedGameInfo | null;
}

export const TitleHub: React.FC<TitleHubProps> = ({
  profile,
  isFirebaseAuthed,
  authBusy,
  wsConnected,
  wsStats,
  wsLatency,
  queueStatus,
  createdRoomCode,
  roomError,
  onSignInGoogle,
  onSignOut,
  onStartSkirmish,
  onJoinRankedQueue,
  onLeaveRankedQueue,
  onCreateCustomRoom,
  onJoinCustomRoom,
  onSaveCustomization,
  onPurchaseCosmetic,
  onEquipCosmetic,
  onClaimStreak,
  onClaimMission,
  onWatchReplay,
}) => {
  const [activeTab, setActiveTab] = useState<HubTab>('play');
  const [selectionStep, setSelectionStep] = useState<'faction' | 'map'>('faction');
  const [selectedMap, setSelectedMap] = useState<MapId>('iron_valley');
  const [selectedFaction, setSelectedFaction] = useState<FactionId>('indonesia');
  const [difficulty, setDifficulty] = useState<AiDifficulty>('taktis');
  const [playMode, setPlayMode] = useState<'skirmish' | 'multiplayer'>('skirmish');
  const [joinCode, setJoinCode] = useState('');
  const [backdropFailed, setBackdropFailed] = useState(false);

  const emberCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pre-warm Shop, Map, and Faction thumbnails immediately on hub mount so tabs switch instantaneously
  useEffect(() => {
    const urls = new Set<string>([
      ...COSMETIC_CATALOG.map((c) => c.previewImage),
      ...Object.values(MAPS).map((m) => m.previewImage),
      ...Object.values(FACTION_TANK_URLS),
      ...Object.values(FACTION_JET_URLS),
    ]);
    urls.forEach((src) => {
      if (!src) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    });
  }, []);

  // Subtle ambient battlefield ember sparks on animated landing key-art
  useEffect(() => {
    if (activeTab !== 'play') return;
    const canvas = emberCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const sparks = Array.from({ length: 34 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: 14 + Math.random() * 24,
      vy: -(12 + Math.random() * 26),
      size: 1.2 + Math.random() * 2.2,
      alpha: 0.25 + Math.random() * 0.5,
    }));

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const s of sparks) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.y < -10) s.y = canvas.height + 10;
        if (s.x > canvas.width + 10) s.x = -10;
        ctx.fillStyle = `rgba(251, 146, 60, ${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [activeTab]);

  // Enter / Space advances to Map step or starts Skirmish directly
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'play' || playMode !== 'skirmish') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement) {
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (selectionStep === 'faction') {
          setSelectionStep('map');
        } else {
          onStartSkirmish(selectedMap, difficulty, selectedFaction);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, playMode, selectionStep, selectedMap, difficulty, selectedFaction, onStartSkirmish]);

  const mapSpec = MAPS[selectedMap];
  const factionSpec = FACTION_SPECS[selectedFaction];

  const tabs: Array<{ id: HubTab; label: string }> = [
    { id: 'play', label: 'Pertempuran' },
    { id: 'customize', label: 'Kustomisasi' },
    { id: 'shop', label: 'Toko' },
    { id: 'missions', label: 'Misi Harian' },
    { id: 'replays', label: 'Replay' },
    { id: 'leaderboard', label: 'Peringkat' },
  ];

  return (
    <div className="min-h-screen w-full bg-[#0b0e12] text-slate-100 flex flex-col relative overflow-x-hidden">
      {/* Animated Battlefield Key-Art Backdrop on Landing View */}
      {activeTab === 'play' && !backdropFailed && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <img
            src="/src/assets/images/title_backdrop_1794834096288.jpg"
            alt="Medan Pertempuran Ironfront"
            fetchPriority="high"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setBackdropFailed(true)}
            className="w-full h-full object-cover opacity-60 animate-kenburns"
          />
          <canvas ref={emberCanvasRef} className="absolute inset-0 w-full h-full opacity-75" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b0e12] via-[#0b0e12]/85 to-[#0b0e12]/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0e12] via-transparent to-[#0b0e12]/70" />
        </div>
      )}

      {/* Command Hub Navigation Strip */}
      <nav
        aria-label="Menu Utama Game"
        className="relative z-10 w-full border-b border-slate-800/90 bg-[#0b0e12]/85 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-6 overflow-x-auto">
          <span className="font-display text-xl font-bold tracking-tight text-amber-400 whitespace-nowrap shrink-0">
            IRONFRONT
          </span>

          <div className="flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === t.id
                    ? 'bg-amber-600 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Commander Summary & Firebase Auth Action */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-mono-tabular text-amber-300">
              <Coins className="w-3.5 h-3.5" />
              <span>{profile.credits}</span>
            </span>
            <span className="text-slate-600" aria-hidden="true">/</span>
            <span className="flex items-center gap-1.5 text-slate-200 font-medium">
              <RankInsignia tier={profile.rankTier} size={16} />
              <span className="font-mono-tabular">{profile.mmr} MMR</span>
            </span>
          </div>

          {isFirebaseAuthed ? (
            <div className="flex items-center gap-2.5">
              <CommanderAvatar portraitId={profile.portraitId} visorColor={profile.visorColor} sizeClass="w-8 h-8" />
              <span className="text-xs font-medium text-slate-200 hidden md:inline max-w-[120px] truncate">
                {profile.commanderName}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                disabled={authBusy}
                className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignInGoogle}
              disabled={authBusy}
              className="px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md text-slate-100 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-amber-400" />
              <span>{authBusy ? 'Menghubungkan...' : 'Masuk Google · Sync Firebase'}</span>
            </button>
          )}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8 flex flex-col justify-between">
        {activeTab === 'play' && (
          <div className="flex-1 flex flex-col justify-between gap-5">
            {/* Top Step Breadcrumb Bar: Step 1 Faction -> Step 2 Map */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#12171e]/95 border border-slate-800 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectionStep('faction')}
                  className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors ${
                    selectionStep === 'faction'
                      ? 'bg-amber-600 text-slate-950'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
                  }`}
                >
                  <span className="font-mono-tabular">1</span>
                  <span>Pilih Fraksi (Negara)</span>
                </button>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                <button
                  type="button"
                  onClick={() => setSelectionStep('map')}
                  className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors ${
                    selectionStep === 'map'
                      ? 'bg-amber-600 text-slate-950'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
                  }`}
                >
                  <span className="font-mono-tabular">2</span>
                  <span>Pilih Medan Pertempuran</span>
                </button>
              </div>

              <div className="flex items-center gap-2.5 text-xs">
                <FactionFlag factionId={selectedFaction} className="w-8 h-5" />
                <span className="font-semibold text-slate-100">{factionSpec.shortName}</span>
                <span className="text-slate-500">·</span>
                <span className="text-amber-400 font-medium">{mapSpec.name}</span>
              </div>
            </div>

            {selectionStep === 'faction' ? (
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: 8 Country Cards with National Flags Only */}
                <div className="lg:col-span-7 bg-[#12171e]/95 border border-slate-800 rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-100">
                        Langkah 1: Pilih Fraksi &amp; Negara
                      </h1>
                      <p className="text-xs text-slate-400 mt-1">
                        Setiap negara memiliki tank, pesawat tempur, markas khusus, dan aksi taktis unik militer modern.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(Object.keys(FACTION_SPECS) as FactionId[]).map((fId) => {
                      const f = FACTION_SPECS[fId];
                      const active = selectedFaction === fId;
                      return (
                        <button
                          key={fId}
                          type="button"
                          onClick={() => setSelectedFaction(fId)}
                          className={`p-3 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center gap-2.5 ${
                            active
                              ? 'bg-amber-500/20 border-amber-500 text-white shadow-lg ring-1 ring-amber-500/50'
                              : 'bg-[#0b0e12] border-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-900'
                          }`}
                        >
                          <FactionFlag factionId={fId} className="w-16 h-10" />
                          <div className="min-w-0 w-full">
                            <div className="text-xs font-bold truncate text-slate-100">{f.shortName}</div>
                            <div className="text-[10px] text-amber-400 font-mono-tabular truncate">{f.countryCode}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Selected Nation Military Dossier + Next Step CTA */}
                <div className="lg:col-span-5 bg-[#12171e]/95 border border-slate-800 rounded-lg p-5 space-y-4">
                  <div className="flex items-center gap-3.5 pb-3 border-b border-slate-800">
                    <FactionFlag factionId={selectedFaction} className="w-16 h-11" />
                    <div className="min-w-0">
                      <h2 className="font-display text-xl font-bold text-slate-100 truncate">{factionSpec.name}</h2>
                      <div className="text-xs text-amber-400 italic">&ldquo;{factionSpec.motto}&rdquo;</div>
                    </div>
                  </div>

                  {/* Distinct AI Equipment Sprites */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0b0e12] border border-slate-800 rounded-md p-2.5 flex items-center gap-2.5">
                      <img
                        src={FACTION_TANK_URLS[selectedFaction]}
                        alt={factionSpec.primaryTank}
                        loading="eager"
                        decoding="async"
                        className="w-12 h-12 rounded object-cover bg-black border border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[10px] text-slate-400 uppercase">Tank Utama</div>
                        <div className="text-xs font-semibold text-slate-100 leading-tight mt-0.5">
                          {factionSpec.primaryTank}
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#0b0e12] border border-slate-800 rounded-md p-2.5 flex items-center gap-2.5">
                      <img
                        src={FACTION_JET_URLS[selectedFaction]}
                        alt={factionSpec.fighterJet}
                        loading="eager"
                        decoding="async"
                        className="w-12 h-12 rounded object-cover bg-black border border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[10px] text-slate-400 uppercase">Jet Tempur</div>
                        <div className="text-xs font-semibold text-slate-100 leading-tight mt-0.5">
                          {factionSpec.fighterJet}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Infantry & Unique Special Building / Action */}
                  <div className="space-y-2.5">
                    <div className="bg-[#0b0e12] border border-slate-800 rounded-md p-3">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Pasukan Darat</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-100 mt-1">{factionSpec.infantryName}</div>
                    </div>

                    <div className="bg-[#0b0e12] border border-amber-500/35 rounded-md p-3 space-y-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Bangunan Khusus: {factionSpec.specialBuildingName}</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{factionSpec.specialBuildingDesc}</p>
                      <div className="pt-1.5 border-t border-slate-800 text-xs">
                        <span className="font-semibold text-sky-300">Aksi Khusus: {factionSpec.specialActionName}</span>
                        <span className="text-slate-400"> ({factionSpec.specialActionCost} Logam) — {factionSpec.specialActionDesc}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectionStep('map')}
                    className="w-full py-3 px-5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-sm rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    <span>Lanjut: Pilih Medan Pertempuran</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                {/* Left Hero & Mode Controls */}
                <div className="lg:col-span-6 space-y-5">
                  <div className="flex items-center justify-between gap-3 bg-[#12171e]/95 border border-slate-800 rounded-lg px-4 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <FactionFlag factionId={selectedFaction} className="w-10 h-7" />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase text-slate-400">Fraksi Dipilih</div>
                        <div className="text-xs font-bold text-slate-100 truncate">{factionSpec.name}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectionStep('faction')}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-200 flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Ganti Fraksi</span>
                    </button>
                  </div>

                  <TitleBrandEmblem />

                  {/* Mode Switch */}
                  <div className="inline-flex items-center gap-1 p-1 bg-[#12171e] border border-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPlayMode('skirmish')}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                        playMode === 'skirmish'
                          ? 'bg-amber-600 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Swords className="w-3.5 h-3.5" />
                      <span>Skirmish Taktis</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlayMode('multiplayer')}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                        playMode === 'multiplayer'
                          ? 'bg-amber-600 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Multiplayer Ranked 1v1</span>
                    </button>
                  </div>

                  {playMode === 'skirmish' ? (
                    <div className="space-y-4 max-w-lg">
                      <div>
                        <div className="text-xs font-medium text-slate-300 mb-2">Tingkat Kecerdasan Lawan</div>
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              { id: 'rekrut', label: 'Rekrut' },
                              { id: 'taktis', label: 'Taktis' },
                              { id: 'komandan', label: 'Komandan' },
                            ] as const
                          ).map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => setDifficulty(d.id)}
                              className={`py-2 px-3 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                                difficulty === d.id
                                  ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                                  : 'bg-[#12171e] border-slate-800 text-slate-300 hover:border-slate-600'
                              }`}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        data-start="true"
                        onClick={() => onStartSkirmish(selectedMap, difficulty, selectedFaction)}
                        className="w-full sm:w-auto px-8 py-3.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-base rounded-md transition-colors flex items-center justify-center gap-2.5 cursor-pointer shadow-lg"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        <span>Mulai Pertempuran</span>
                      </button>
                    </div>
                  ) : (
                    <div className="bg-[#12171e]/95 border border-slate-800 rounded-lg p-5 space-y-4 max-w-lg">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Radio className={`w-3.5 h-3.5 ${wsConnected ? 'text-emerald-400' : 'text-red-400'}`} />
                          <span>{wsConnected ? 'Server Pertandingan Terhubung' : 'Menghubungkan ke Server...'}</span>
                        </span>
                        <span className="font-mono-tabular">
                          {wsStats.onlineCount} Online · {wsStats.queuedCount} Antre
                          {wsLatency !== null ? ` · ${wsLatency}ms` : ''}
                        </span>
                      </div>

                      <div className="flex items-center justify-between bg-[#0b0e12] border border-slate-800 rounded-md p-3">
                        <div className="flex items-center gap-2.5">
                          <RankInsignia tier={profile.rankTier} size={24} />
                          <div>
                            <div className="text-xs font-semibold text-slate-100">{profile.rankTier} Division</div>
                            <div className="font-mono-tabular text-[11px] text-amber-300">{profile.mmr} MMR Kompetitif</div>
                          </div>
                        </div>
                        {queueStatus === 'searching' ? (
                          <button
                            type="button"
                            onClick={onLeaveRankedQueue}
                            className="px-4 py-2 text-xs font-semibold bg-red-900/70 hover:bg-red-800 border border-red-700 text-red-100 rounded-md cursor-pointer"
                          >
                            Batalkan Pencarian
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!wsConnected}
                            onClick={() => onJoinRankedQueue(selectedMap)}
                            className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            <Search className="w-3.5 h-3.5" />
                            <span>Cari Lawan Ranked</span>
                          </button>
                        )}
                      </div>

                      {queueStatus === 'searching' && (
                        <div className="text-xs text-amber-300 font-mono-tabular">
                          Mencari komandan dengan MMR setara di peta {mapSpec.name}...
                        </div>
                      )}

                      {/* Custom Room Invite Code */}
                      <div className="pt-3 border-t border-slate-800 space-y-2.5">
                        <div className="text-xs font-medium text-slate-300">Ruang Kustom 1v1 (Kode Undangan)</div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!wsConnected}
                            onClick={() => onCreateCustomRoom(selectedMap)}
                            className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-100 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            Buat Ruang Baru
                          </button>
                          <input
                            type="text"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            placeholder="Kode Ruang (mis. AB12CD)"
                            maxLength={8}
                            className="flex-1 min-w-[140px] px-3 py-2 text-xs bg-[#0b0e12] border border-slate-700 rounded-md text-slate-100 font-mono-tabular uppercase"
                          />
                          <button
                            type="button"
                            disabled={!wsConnected || joinCode.trim().length < 4}
                            onClick={() => onJoinCustomRoom(joinCode)}
                            className="px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-md cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            Gabung
                          </button>
                        </div>
                        {createdRoomCode && (
                          <div className="text-xs text-emerald-300 font-mono-tabular bg-emerald-950/40 border border-emerald-800 px-3 py-2 rounded">
                            Kode Ruang Aktif: <strong>{createdRoomCode}</strong> — Bagikan ke lawan untuk memulai.
                          </div>
                        )}
                        {roomError && (
                          <div className="text-xs text-red-300 bg-red-950/40 border border-red-800 px-3 py-2 rounded">
                            {roomError}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Map Selector Card */}
                <div className="lg:col-span-6 bg-[#12171e]/95 border border-slate-800 rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-2xl font-bold text-slate-100">Langkah 2: Pilih Medan Pertempuran</h2>
                    <span className="font-mono-tabular text-xs text-slate-400">
                      {mapSpec.width} × {mapSpec.height} Sektor
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {(Object.keys(MAPS) as MapId[]).map((mId) => {
                      const m = MAPS[mId];
                      const active = selectedMap === mId;
                      return (
                        <button
                          key={mId}
                          type="button"
                          onClick={() => setSelectedMap(mId)}
                          className={`p-2 rounded-md border text-left transition-colors cursor-pointer flex items-center gap-2 ${
                            active
                              ? 'bg-amber-500/15 border-amber-500 text-slate-100'
                              : 'bg-[#0b0e12] border-slate-800 text-slate-300 hover:border-slate-600'
                          }`}
                        >
                          <img
                            src={m.previewImage}
                            alt={m.name}
                            loading="eager"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="w-10 h-8 rounded object-cover border border-slate-700/80 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{m.name}</div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5 capitalize">{m.biome}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative rounded-md overflow-hidden border border-slate-800 bg-[#0b0e12]">
                    <img
                      src={mapSpec.previewImage}
                      alt={`Peta ${mapSpec.name}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-44 object-cover opacity-85"
                    />
                    <div className="p-3.5 bg-[#0b0e12] border-t border-slate-800 space-y-1">
                      <div className="text-sm font-semibold text-slate-100">{mapSpec.name}</div>
                      <div className="text-xs text-amber-400">{mapSpec.subtitle}</div>
                      <p className="text-xs text-slate-400 leading-relaxed">{mapSpec.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Flat Borderless Control Hint Line */}
            <div className="text-center text-xs text-slate-400 pt-2">
              Seret Kotak: Pilih Skuad · Klik Kanan: Gerak &amp; Serang · WASD: Geser Kamera · Q: Serbu · R: Mundur · P: Jeda
            </div>
          </div>
        )}

        {activeTab === 'customize' && (
          <CustomizerPanel profile={profile} onSave={onSaveCustomization} />
        )}

        {activeTab === 'shop' && (
          <ShopPanel profile={profile} onPurchase={onPurchaseCosmetic} onEquip={onEquipCosmetic} />
        )}

        {activeTab === 'missions' && (
          <DailyProgressPanel
            profile={profile}
            onClaimStreak={onClaimStreak}
            onClaimMission={onClaimMission}
          />
        )}

        {activeTab === 'replays' && (
          <ReplayCommunityPanel isFirebaseAuthed={isFirebaseAuthed} onWatchReplay={onWatchReplay} />
        )}

        {activeTab === 'leaderboard' && <LeaderboardPanel currentUid={profile.uid} />}
      </main>
    </div>
  );
};
