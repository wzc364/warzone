import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { fetchLeaderboard, LeaderboardRow } from '../services/profileService';
import { BannerEmblemSvg, RankInsignia } from './EmblemSvg';

export const LeaderboardPanel: React.FC<{ currentUid: string }> = ({ currentUid }) => {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-[#12171e] border border-slate-800 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Trophy className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-100">Peringkat Komandan Global</h2>
            <p className="text-xs text-slate-400">Klasemen MMR kompetitif lintas platform tersinkronisasi Firebase.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Memuat papan peringkat...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-2.5 px-3 font-medium">Peringkat</th>
                <th className="py-2.5 px-3 font-medium">Komandan</th>
                <th className="py-2.5 px-3 font-medium">Divisi</th>
                <th className="py-2.5 px-3 font-medium text-right">MMR</th>
                <th className="py-2.5 px-3 font-medium text-right">M / K</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-sm">
              {rows.map((row, idx) => {
                const isSelf = row.uid === currentUid;
                return (
                  <tr key={row.uid} className={isSelf ? 'bg-amber-500/10' : 'hover:bg-slate-900/40'}>
                    <td className="py-3 px-3 font-mono-tabular text-slate-300">#{idx + 1}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <BannerEmblemSvg emblem={row.bannerEmblem} size={20} />
                        <span className="font-medium text-slate-100">{row.commanderName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-200">
                        <RankInsignia tier={row.rankTier} size={16} />
                        <span>{row.rankTier}</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono-tabular font-semibold text-amber-300">
                      {row.mmr}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-tabular text-xs text-slate-400">
                      {row.wins}M · {row.losses}K
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
