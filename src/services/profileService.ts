import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  COSMETIC_CATALOG,
  DEFAULT_DAILY_MISSIONS,
  FEATURED_REPLAYS,
  SEED_LEADERBOARD,
  STREAK_REWARDS,
} from '../game/catalog';
import {
  calculateMmrDelta,
  clampReplayEvents,
  getRankTierFromMmr,
  sanitizeCommanderName,
} from '../game/rules';
import {
  CommanderLoadout,
  CommunityReplayDoc,
  CosmeticItem,
  DailyMissionItem,
  MapId,
  MatchSummaryStats,
  RankTier,
  ReplayEvent,
  UserProfile,
} from '../game/types';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';

const LOCAL_PROFILE_KEY = 'ironfront_local_profile_v1';
const LOCAL_REPLAYS_KEY = 'ironfront_local_replays_v1';

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createDefaultProfile(uid = 'local_guest', name = 'Komandan Baru'): UserProfile {
  const now = new Date().toISOString();
  const defaultUnlocked = COSMETIC_CATALOG.filter((c) => c.price === 0).map((c) => c.id);
  return {
    uid,
    commanderName: sanitizeCommanderName(name),
    portraitId: 'vanguard',
    armorStyle: 'standard',
    visorColor: '#f59e0b',
    camoPalette: 'cobalt',
    buildingTheme: 'standard',
    bannerEmblem: 'chevron',
    tracerColor: '#fbbf24',
    victoryEmote: 'Hormat Komando',
    rankTier: 'Silver',
    mmr: 1200,
    wins: 0,
    losses: 0,
    credits: 650,
    streakDay: 0,
    lastClaimDayKey: '',
    unlockedCosmetics: defaultUnlocked,
    dailyMissions: DEFAULT_DAILY_MISSIONS.map((m) => ({ ...m })),
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeProfile(raw: Partial<UserProfile> & { uid: string }): UserProfile {
  const base = createDefaultProfile(raw.uid, raw.commanderName || 'Komandan Baru');
  const mergedUnlocked = Array.from(new Set([...base.unlockedCosmetics, ...(raw.unlockedCosmetics ?? [])]));
  return {
    ...base,
    ...raw,
    buildingTheme: raw.buildingTheme || 'standard',
    unlockedCosmetics: mergedUnlocked,
    dailyMissions: Array.isArray(raw.dailyMissions) && raw.dailyMissions.length > 0 ? raw.dailyMissions : base.dailyMissions,
  };
}

export function loadLocalProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UserProfile;
      if (parsed && parsed.uid && Array.isArray(parsed.dailyMissions)) {
        return normalizeProfile(parsed);
      }
    }
  } catch {
    // Ignore parse error
  }
  const fresh = createDefaultProfile();
  saveLocalProfile(fresh);
  return fresh;
}

export function saveLocalProfile(profile: UserProfile) {
  try {
    localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage error
  }
}

export function loadLocalReplays(): CommunityReplayDoc[] {
  try {
    const raw = localStorage.getItem(LOCAL_REPLAYS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CommunityReplayDoc[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore
  }
  return [];
}

export function saveLocalReplay(replay: CommunityReplayDoc) {
  const existing = loadLocalReplays();
  const updated = [replay, ...existing.filter((r) => r.replayId !== replay.replayId)].slice(0, 15);
  try {
    localStorage.setItem(LOCAL_REPLAYS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore
  }
}

function serializeTimestamp(val: unknown): string {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, googleProvider);
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

export async function ensureFirestoreUserProfile(
  uid: string,
  displayName: string | null,
  email: string | null
): Promise<UserProfile> {
  const userRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const base = createDefaultProfile(uid, displayName || 'Komandan Baru');
      await setDoc(userRef, {
        ...base,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (email) {
        const privRef = doc(db, 'users', uid, 'private', 'account');
        await setDoc(privRef, {
          uid,
          email: email.slice(0, 160),
          updatedAt: serverTimestamp(),
        });
      }
      return base;
    }
    const data = snap.data();
    return normalizeProfile({
      ...(data as UserProfile),
      uid,
      createdAt: serializeTimestamp(data.createdAt),
      updatedAt: serializeTimestamp(data.updatedAt),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile) => void
): () => void {
  const userRef = doc(db, 'users', uid);
  return onSnapshot(
    userRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      onData(
        normalizeProfile({
          ...(data as UserProfile),
          uid,
          createdAt: serializeTimestamp(data.createdAt),
          updatedAt: serializeTimestamp(data.updatedAt),
        })
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    }
  );
}

export async function saveCommanderCustomization(
  profile: UserProfile,
  loadout: CommanderLoadout,
  isFirebaseAuthed: boolean
): Promise<UserProfile> {
  const sanitized: CommanderLoadout = {
    commanderName: sanitizeCommanderName(loadout.commanderName),
    portraitId: loadout.portraitId,
    armorStyle: loadout.armorStyle.slice(0, 32),
    visorColor: loadout.visorColor.slice(0, 16),
    camoPalette: loadout.camoPalette.slice(0, 32),
    buildingTheme: (loadout.buildingTheme || 'standard').slice(0, 32),
    bannerEmblem: loadout.bannerEmblem.slice(0, 32),
    tracerColor: loadout.tracerColor.slice(0, 16),
    victoryEmote: loadout.victoryEmote.slice(0, 40),
  };

  const next: UserProfile = {
    ...profile,
    ...sanitized,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseAuthed && auth.currentUser) {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    try {
      await updateDoc(userRef, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  } else {
    saveLocalProfile(next);
  }
  return next;
}

export async function purchaseCosmeticItem(
  profile: UserProfile,
  item: CosmeticItem,
  isFirebaseAuthed: boolean
): Promise<UserProfile> {
  if (profile.unlockedCosmetics.includes(item.id)) return profile;
  if (profile.credits < item.price) throw new Error('Kredit Komando tidak mencukupi.');

  const unlockedCosmetics = [...profile.unlockedCosmetics, item.id].slice(0, 100);
  const credits = profile.credits - item.price;

  const next: UserProfile = {
    ...profile,
    credits,
    unlockedCosmetics,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseAuthed && auth.currentUser) {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    try {
      await updateDoc(userRef, {
        credits,
        unlockedCosmetics,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  } else {
    saveLocalProfile(next);
  }
  return next;
}

export async function claimDailyStreakReward(
  profile: UserProfile,
  isFirebaseAuthed: boolean
): Promise<UserProfile> {
  const today = getTodayKey();
  if (profile.lastClaimDayKey === today) return profile;

  const nextDay = profile.streakDay >= 7 ? 1 : profile.streakDay + 1;
  const reward = STREAK_REWARDS.find((s) => s.day === nextDay)?.credits ?? 150;
  const credits = profile.credits + reward;

  const next: UserProfile = {
    ...profile,
    credits,
    streakDay: nextDay,
    lastClaimDayKey: today,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseAuthed && auth.currentUser) {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    try {
      await updateDoc(userRef, {
        credits,
        streakDay: nextDay,
        lastClaimDayKey: today,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  } else {
    saveLocalProfile(next);
  }
  return next;
}

export async function claimDailyMissionReward(
  profile: UserProfile,
  missionId: string,
  isFirebaseAuthed: boolean
): Promise<UserProfile> {
  const targetMission = profile.dailyMissions.find((m) => m.id === missionId);
  if (!targetMission || targetMission.claimed || targetMission.progress < targetMission.target) {
    return profile;
  }

  const dailyMissions: DailyMissionItem[] = profile.dailyMissions.map((m) =>
    m.id === missionId ? { ...m, claimed: true } : m
  );
  const credits = profile.credits + targetMission.rewardCredits;

  const next: UserProfile = {
    ...profile,
    credits,
    dailyMissions,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseAuthed && auth.currentUser) {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    try {
      await updateDoc(userRef, {
        credits,
        dailyMissions,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  } else {
    saveLocalProfile(next);
  }
  return next;
}

export async function recordMatchCompletion(
  profile: UserProfile,
  params: {
    won: boolean;
    ranked: boolean;
    opponentMmr: number;
    sectorsCaptured: number;
    tanksDeployed: number;
  },
  isFirebaseAuthed: boolean
): Promise<{ profile: UserProfile; mmrDelta: number; creditsEarned: number }> {
  const elo = calculateMmrDelta(
    params.won ? profile.mmr : params.opponentMmr,
    params.won ? params.opponentMmr : profile.mmr
  );
  const mmrDelta = params.ranked ? (params.won ? elo.winnerGain : -elo.loserLoss) : params.won ? 10 : 0;
  const mmr = Math.max(400, profile.mmr + mmrDelta);
  const rankTier = getRankTierFromMmr(mmr);
  const creditsEarned = (params.won ? 240 : 110) + params.sectorsCaptured * 25;
  const credits = profile.credits + creditsEarned;
  const wins = profile.wins + (params.won ? 1 : 0);
  const losses = profile.losses + (params.won ? 0 : 1);

  const dailyMissions = profile.dailyMissions.map((m) => {
    let add = 0;
    if (m.metric === 'matches_played') add = 1;
    if (m.metric === 'wins' && params.won) add = 1;
    if (m.metric === 'sectors_captured') add = params.sectorsCaptured;
    if (m.metric === 'tanks_deployed') add = params.tanksDeployed;
    return { ...m, progress: Math.min(m.target, m.progress + add) };
  });

  const next: UserProfile = {
    ...profile,
    mmr,
    rankTier,
    credits,
    wins,
    losses,
    dailyMissions,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseAuthed && auth.currentUser) {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    try {
      await updateDoc(userRef, {
        mmr,
        rankTier,
        credits,
        wins,
        losses,
        dailyMissions,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  } else {
    saveLocalProfile(next);
  }

  return { profile: next, mmrDelta, creditsEarned };
}

export async function publishCommunityReplay(
  profile: UserProfile,
  params: {
    title: string;
    mapId: MapId;
    mode: 'skirmish' | 'ranked_1v1';
    summaryStats: MatchSummaryStats;
    timelineEvents: ReplayEvent[];
  },
  isFirebaseAuthed: boolean
): Promise<CommunityReplayDoc> {
  const replayId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const cleanTitle = params.title.trim().slice(0, 80) || 'Pertempuran Taktis Ironfront';
  const clampedEvents = clampReplayEvents(params.timelineEvents);

  const docData: CommunityReplayDoc = {
    replayId,
    authorUid: isFirebaseAuthed && auth.currentUser ? auth.currentUser.uid : profile.uid,
    authorName: sanitizeCommanderName(profile.commanderName),
    authorRankTier: profile.rankTier,
    title: cleanTitle.length >= 3 ? cleanTitle : 'Pertempuran Taktis',
    mapId: params.mapId,
    mode: params.mode,
    durationSec: Math.max(1, Math.round(params.summaryStats.durationSec)),
    winnerSide: params.summaryStats.winnerSide,
    likesCount: 0,
    timelineEvents: clampedEvents,
    summaryStats: params.summaryStats,
    createdAt: new Date().toISOString(),
  };

  saveLocalReplay(docData);

  if (isFirebaseAuthed && auth.currentUser) {
    const replayRef = doc(db, 'communityReplays', replayId);
    try {
      await setDoc(replayRef, {
        ...docData,
        authorUid: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `communityReplays/${replayId}`);
    }
  }

  return docData;
}

export async function likeCommunityReplay(replayId: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Masuk dengan Google untuk menyukai replay komunitas.');
  const uid = auth.currentUser.uid;
  const likeRef = doc(db, 'communityReplays', replayId, 'likes', uid);
  const replayRef = doc(db, 'communityReplays', replayId);

  try {
    const existingLike = await getDoc(likeRef);
    if (existingLike.exists()) return;
    const batch = writeBatch(db);
    batch.set(likeRef, {
      userId: uid,
      replayId,
      createdAt: serverTimestamp(),
    });
    batch.update(replayRef, {
      likesCount: increment(1),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `communityReplays/${replayId}/likes/${uid}`);
  }
}

export async function fetchCommunityReplays(): Promise<CommunityReplayDoc[]> {
  const local = loadLocalReplays();
  try {
    const q = query(collection(db, 'communityReplays'), orderBy('likesCount', 'desc'), limit(20));
    const snap = await getDocs(q);
    const remote: CommunityReplayDoc[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        ...(data as CommunityReplayDoc),
        createdAt: serializeTimestamp(data.createdAt),
      };
    });
    const merged = [...remote];
    for (const item of [...local, ...FEATURED_REPLAYS]) {
      if (!merged.some((r) => r.replayId === item.replayId)) merged.push(item);
    }
    return merged;
  } catch {
    const merged = [...local];
    for (const feat of FEATURED_REPLAYS) {
      if (!merged.some((r) => r.replayId === feat.replayId)) merged.push(feat);
    }
    return merged;
  }
}

export interface LeaderboardRow {
  uid: string;
  commanderName: string;
  rankTier: RankTier;
  mmr: number;
  wins: number;
  losses: number;
  bannerEmblem: string;
  camoPalette: string;
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  try {
    const q = query(collection(db, 'users'), orderBy('mmr', 'desc'), limit(20));
    const snap = await getDocs(q);
    const rows: LeaderboardRow[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: data.uid,
        commanderName: data.commanderName,
        rankTier: data.rankTier,
        mmr: data.mmr,
        wins: data.wins,
        losses: data.losses,
        bannerEmblem: data.bannerEmblem,
        camoPalette: data.camoPalette,
      };
    });
    for (const s of SEED_LEADERBOARD) {
      if (!rows.some((r) => r.uid === s.uid)) rows.push(s);
    }
    return rows.sort((a, b) => b.mmr - a.mmr);
  } catch {
    return [...SEED_LEADERBOARD].sort((a, b) => b.mmr - a.mmr);
  }
}
