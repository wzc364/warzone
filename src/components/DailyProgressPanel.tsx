import React, { useState } from 'react';
import { CalendarCheck, CheckCircle2, Coins, Gift } from 'lucide-react';
import { STREAK_REWARDS } from '../game/catalog';
import { UserProfile } from '../game/types';
import { getTodayKey } from '../services/profileService';

interface DailyProgressPanelProps {
  profile: UserProfile;
  onClaimStreak: () => Promise<void>;
  onClaimMission: (missionId: string) => Promise<void>;
}

export const DailyProgressPanel: React.FC<DailyProgressPanelProps> = ({
  profile,
  onClaimStreak,
  onClaimMission,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const todayKey = getTodayKey();
  const streakClaimedToday = profile.lastClaimDayKey === todayKey;
  const nextClaimDay = profile.streakDay >= 7 ? 1 : profile.streakDay + 1;

  const handleStreak = async () => {
    setBusy('streak');
    try {
      await onClaimStreak();
    } finally {
      setBusy(null);
    }
  };

  const handleMission = async (id: string) => {
    setBusy(id);
    try {
      await onClaimMission(id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 7-Day Login Streak */}
      <div className="bg-[#12171e] border border-slate-800 rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-100">Loyalitas &amp; Absensi Harian 7 Hari</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Klaim pasokan Kredit Komando setiap hari untuk mempercepat pembukaan kosmetik elit.
            </p>
          </div>
          <button
            type="button"
            disabled={streakClaimedToday || busy === 'streak'}
            onClick={handleStreak}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
              streakClaimedToday
                ? 'bg-slate-800 text-slate-400 cursor-default'
                : 'bg-amber-600 hover:bg-amber-500 text-slate-950 cursor-pointer'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>{streakClaimedToday ? 'Sudah Diklaim Hari Ini' : `Klaim Hadiah Hari ${nextClaimDay}`}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {STREAK_REWARDS.map((sr) => {
            const done = sr.day <= profile.streakDay;
            const isNext = !streakClaimedToday && sr.day === nextClaimDay;
            return (
              <div
                key={sr.day}
                className={`p-3 rounded-md border flex flex-col justify-between gap-2 ${
                  isNext
                    ? 'bg-amber-500/10 border-amber-500'
                    : done
                    ? 'bg-emerald-950/30 border-emerald-800/70'
                    : 'bg-[#0b0e12] border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{sr.label}</span>
                  {done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <div className="flex items-center gap-1.5 font-mono-tabular text-sm font-semibold text-amber-300">
                  <Coins className="w-3.5 h-3.5" />
                  <span>+{sr.credits}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily Missions */}
      <div className="bg-[#12171e] border border-slate-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <CalendarCheck className="w-5 h-5 text-amber-400" />
            <h2 className="font-display text-2xl font-bold text-slate-100">Misi Operasi Harian</h2>
          </div>
          <span className="font-mono-tabular text-xs text-slate-400">
            {profile.dailyMissions.filter((m) => m.claimed).length} / {profile.dailyMissions.length} Selesai
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {profile.dailyMissions.map((m) => {
            const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
            const ready = m.progress >= m.target && !m.claimed;
            return (
              <div
                key={m.id}
                className="bg-[#0b0e12] border border-slate-800 rounded-md p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{m.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{m.description}</p>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-amber-300 shrink-0">
                    +{m.rewardCredits} Kredit
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono-tabular">
                    <span>Progres</span>
                    <span>
                      {m.progress} / {m.target}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-sm overflow-hidden">
                    <div className="h-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!ready || busy === m.id}
                    onClick={() => handleMission(m.id)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      m.claimed
                        ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300 cursor-default'
                        : ready
                        ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {m.claimed ? 'Hadiah Diklaim' : ready ? 'Klaim Kredit' : 'Belum Selesai'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
