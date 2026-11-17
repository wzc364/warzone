import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { BattleView } from './components/BattleView';
import { ReplayTheater } from './components/ReplayTheater';
import { TitleHub } from './components/TitleHub';
import {
  AiDifficulty,
  CommanderLoadout,
  CommunityReplayDoc,
  CosmeticItem,
  FactionSide,
  FactionId,
  GameMode,
  MapId,
  MatchSummaryStats,
  ReplayEvent,
  UserProfile,
} from './game/types';
import { auth } from './services/firebase';
import { MatchedGameInfo, multiplayerClient, ServerStats } from './services/multiplayerClient';
import {
  claimDailyMissionReward,
  claimDailyStreakReward,
  ensureFirestoreUserProfile,
  loadLocalProfile,
  publishCommunityReplay,
  purchaseCosmeticItem,
  recordMatchCompletion,
  saveCommanderCustomization,
  signInWithGoogle,
  signOutAccount,
  subscribeUserProfile,
} from './services/profileService';

type ScreenState =
  | { kind: 'title' }
  | {
      kind: 'battle';
      mapId: MapId;
      mode: GameMode;
      difficulty: AiDifficulty;
      localSide: FactionSide;
      factionId: FactionId;
      opponentName: string;
      opponentMmr: number;
    }
  | { kind: 'replay'; replay: CommunityReplayDoc };

export default function App() {
  const autostart =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autostart') === '1';

  const [screen, setScreen] = useState<ScreenState>(
    autostart
      ? {
          kind: 'battle',
          mapId: 'iron_valley',
          mode: 'skirmish',
          difficulty: 'taktis',
          localSide: 'blue',
          factionId: 'indonesia',
          opponentName: 'Komandan AI',
          opponentMmr: 1200,
        }
      : { kind: 'title' }
  );

  const [profile, setProfile] = useState<UserProfile>(() => loadLocalProfile());
  const [isFirebaseAuthed, setIsFirebaseAuthed] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const [wsConnected, setWsConnected] = useState(false);
  const [wsStats, setWsStats] = useState<ServerStats>({ onlineCount: 1, queuedCount: 0, activeRooms: 0 });
  const [wsLatency, setWsLatency] = useState<number | null>(null);
  const [queueStatus, setQueueStatus] = useState<'idle' | 'searching'>('idle');
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [matchedInfo, setMatchedInfo] = useState<MatchedGameInfo | null>(null);

  // Sync body state for title & replay (BattleView handles playing/paused/gameover)
  useEffect(() => {
    if (screen.kind === 'title') {
      document.body.dataset.state = 'title';
    } else if (screen.kind === 'replay') {
      document.body.dataset.state = 'replay';
    }
  }, [screen]);

  // Firebase Auth + Real-Time Firestore Profile Listener
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      if (user) {
        setIsFirebaseAuthed(true);
        try {
          const loaded = await ensureFirestoreUserProfile(user.uid, user.displayName, user.email);
          setProfile(loaded);
          unsubProfile = subscribeUserProfile(user.uid, (next) => {
            setProfile(next);
          });
        } catch {
          // Keep local profile fallback on permission or transient network errors
        }
      } else {
        setIsFirebaseAuthed(false);
        setProfile(loadLocalProfile());
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // Connect WebSocket multiplayer client
  useEffect(() => {
    multiplayerClient.connect({
      onConnect: setWsConnected,
      onStats: setWsStats,
      onLatency: setWsLatency,
      onQueueStatus: setQueueStatus,
      onRoomCreated: (roomId) => {
        setRoomError(null);
        setCreatedRoomCode(roomId);
      },
      onRoomError: (msg) => setRoomError(msg),
      onMatchFound: (info) => {
        setQueueStatus('idle');
        setCreatedRoomCode(null);
        setRoomError(null);
        setMatchedInfo(info);
        setScreen({
          kind: 'battle',
          mapId: info.mapId,
          mode: info.mode,
          difficulty: 'taktis',
          localSide: info.side,
          factionId: 'indonesia',
          opponentName: info.opponent.commanderName,
          opponentMmr: info.opponent.mmr,
        });
      },
    });
  }, []);

  // Re-identify on WebSocket whenever profile updates
  useEffect(() => {
    if (!wsConnected) return;
    multiplayerClient.identify(profile.uid, profile.commanderName, profile.mmr, profile.rankTier, {
      camoPalette: profile.camoPalette,
      bannerEmblem: profile.bannerEmblem,
      tracerColor: profile.tracerColor,
    });
  }, [wsConnected, profile]);

  const handleSignInGoogle = async () => {
    setAuthBusy(true);
    try {
      await signInWithGoogle();
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutAccount();
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveCustomization = async (loadout: CommanderLoadout) => {
    const next = await saveCommanderCustomization(profile, loadout, isFirebaseAuthed);
    setProfile(next);
  };

  const handlePurchaseCosmetic = async (item: CosmeticItem) => {
    const next = await purchaseCosmeticItem(profile, item, isFirebaseAuthed);
    setProfile(next);
  };

  const handleEquipCosmetic = async (item: CosmeticItem) => {
    const loadout: CommanderLoadout = {
      commanderName: profile.commanderName,
      portraitId: profile.portraitId,
      armorStyle: profile.armorStyle,
      visorColor: profile.visorColor,
      camoPalette: profile.camoPalette,
      buildingTheme: profile.buildingTheme,
      bannerEmblem: profile.bannerEmblem,
      tracerColor: profile.tracerColor,
      victoryEmote: profile.victoryEmote,
      [item.category]: item.value,
    };
    await handleSaveCustomization(loadout);
  };

  const handleClaimStreak = async () => {
    const next = await claimDailyStreakReward(profile, isFirebaseAuthed);
    setProfile(next);
  };

  const handleClaimMission = async (missionId: string) => {
    const next = await claimDailyMissionReward(profile, missionId, isFirebaseAuthed);
    setProfile(next);
  };

  const handleMatchRecorded = async (params: {
    won: boolean;
    ranked: boolean;
    opponentMmr: number;
    sectorsCaptured: number;
    tanksDeployed: number;
  }) => {
    const res = await recordMatchCompletion(profile, params, isFirebaseAuthed);
    setProfile(res.profile);
    return { mmrDelta: res.mmrDelta, creditsEarned: res.creditsEarned };
  };

  const handleShareReplay = async (params: {
    title: string;
    mapId: MapId;
    mode: 'skirmish' | 'ranked_1v1';
    summaryStats: MatchSummaryStats;
    timelineEvents: ReplayEvent[];
  }) => {
    await publishCommunityReplay(profile, params, isFirebaseAuthed);
  };

  if (screen.kind === 'battle') {
    return (
      <BattleView
        mapId={screen.mapId}
        mode={screen.mode}
        difficulty={screen.difficulty}
        localSide={screen.localSide}
        factionId={screen.factionId}
        opponentName={screen.opponentName}
        opponentMmr={screen.opponentMmr}
        profile={profile}
        onExitToTitle={() => setScreen({ kind: 'title' })}
        onMatchRecorded={handleMatchRecorded}
        onShareReplay={handleShareReplay}
      />
    );
  }

  if (screen.kind === 'replay') {
    return <ReplayTheater replay={screen.replay} onClose={() => setScreen({ kind: 'title' })} />;
  }

  return (
    <TitleHub
      profile={profile}
      isFirebaseAuthed={isFirebaseAuthed}
      authBusy={authBusy}
      wsConnected={wsConnected}
      wsStats={wsStats}
      wsLatency={wsLatency}
      queueStatus={queueStatus}
      createdRoomCode={createdRoomCode}
      roomError={roomError}
      matchedInfo={matchedInfo}
      onSignInGoogle={handleSignInGoogle}
      onSignOut={handleSignOut}
      onStartSkirmish={(mapId, difficulty, factionId) =>
        setScreen({
          kind: 'battle',
          mapId,
          mode: 'skirmish',
          difficulty,
          localSide: 'blue',
          factionId,
          opponentName: `Komandan AI (${difficulty})`,
          opponentMmr: difficulty === 'komandan' ? 1450 : difficulty === 'taktis' ? 1200 : 950,
        })
      }
      onJoinRankedQueue={(mapId) => multiplayerClient.joinRankedQueue(mapId)}
      onLeaveRankedQueue={() => multiplayerClient.leaveRankedQueue()}
      onCreateCustomRoom={(mapId) => multiplayerClient.createCustomRoom(mapId)}
      onJoinCustomRoom={(code) => multiplayerClient.joinCustomRoom(code)}
      onSaveCustomization={handleSaveCustomization}
      onPurchaseCosmetic={handlePurchaseCosmetic}
      onEquipCosmetic={handleEquipCosmetic}
      onClaimStreak={handleClaimStreak}
      onClaimMission={handleClaimMission}
      onWatchReplay={(replay) => setScreen({ kind: 'replay', replay })}
    />
  );
}
