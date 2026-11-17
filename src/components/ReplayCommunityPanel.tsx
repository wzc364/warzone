import React, { useEffect, useState } from 'react';
import { Film, Play, ThumbsUp } from 'lucide-react';
import { MAPS } from '../game/catalog';
import { CommunityReplayDoc } from '../game/types';
import { fetchCommunityReplays, likeCommunityReplay } from '../services/profileService';
import { RankInsignia } from './EmblemSvg';

interface ReplayCommunityPanelProps {
  isFirebaseAuthed: boolean;
  onWatchReplay: (replay: CommunityReplayDoc) => void;
}

export const ReplayCommunityPanel: React.FC<ReplayCommunityPanelProps> = ({
  isFirebaseAuthed,
  onWatchReplay,
}) => {
  const [replays, setReplays] = useState<CommunityReplayDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapFilter, setMapFilter] = useState<string>('all');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await fetchCommunityReplays();
      setReplays(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleLike = async (replay: CommunityReplayDoc) => {
    setStatusMsg(null);
    if (replay.isFeatured) {
      setReplays((prev) =>
        prev.map((r) => (r.replayId === replay.replayId ? { ...r, likesCount: r.likesCount + 1 } : r))
      );
      return;
    }
    if (!isFirebaseAuthed) {
      setStatusMsg('Masuk dengan Google di sudut atas untuk menyukai replay komunitas di server Firebase.');
      return;
    }
    try {
      await likeCommunityReplay(replay.replayId);
      await load();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Gagal memberi suka.');
    }
  };

  const filtered = replays.filter((r) => mapFilter === 'all' || r.mapId === mapFilter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#12171e] border border-slate-800 rounded-lg p-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-100">Pusat Replay &amp; Komunitas Global</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Tonton ulang momen taktis dari medan perang atau bagikan rekaman pertandingan terbaik Anda ke komunitas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-[#0b0e12] border border-slate-800 p-1 rounded-md">
          {[
            { id: 'all', label: 'Semua Peta' },
            { id: 'iron_valley', label: 'Lembah Besi' },
            { id: 'storm_delta', label: 'Delta Badai' },
            { id: 'frost_ridge', label: 'Puncak Kaca' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setMapFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mapFilter === f.id ? 'bg-amber-600 text-slate-950 font-semibold' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div className="bg-amber-950/60 border border-amber-700 text-amber-200 text-xs px-4 py-2.5 rounded-md">
          {statusMsg}
        </div>
      )}

      {loading ? (
        <div className="bg-[#12171e] border border-slate-800 rounded-lg p-8 text-center text-sm text-slate-400">
          Memuat arsip replay global...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#12171e] border border-slate-800 rounded-lg p-8 text-center text-sm text-slate-400">
          Belum ada replay untuk peta ini. Selesaikan pertempuran untuk merekam replay pertama Anda!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((r) => {
            const mapName = MAPS[r.mapId]?.name ?? r.mapId;
            return (
              <div
                key={r.replayId}
                className="bg-[#12171e] border border-slate-800 rounded-lg p-4 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <RankInsignia tier={r.authorRankTier} size={16} />
                      <span className="font-medium text-slate-200">{r.authorName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{r.authorRankTier}</span>
                    </span>
                    <span className="font-mono-tabular">
                      {mapName} · {Math.floor(r.durationSec / 60)}m {r.durationSec % 60}d
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-slate-100 mt-2">{r.title}</h3>
                  <div className="text-xs text-slate-400 mt-1 font-mono-tabular">
                    Mode: {r.mode === 'ranked_1v1' ? 'Ranked 1v1' : 'Skirmish'} · Pemenang:{' '}
                    {r.winnerSide === 'blue' ? 'Tim Biru' : 'Tim Merah'} · Unit Dihancurkan:{' '}
                    {r.summaryStats.enemiesEliminated}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => handleLike(r)}
                    className="px-3 py-1.5 text-xs bg-[#0b0e12] hover:bg-slate-800 border border-slate-700 rounded-md text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ThumbsUp className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-mono-tabular">{r.likesCount}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onWatchReplay(r)}
                    className="px-4 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Putar Replay</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Film className="w-4 h-4" />
        <span>Setiap pertandingan otomatis merekam snapshot lini masa yang dapat diputar ulang dan dibagikan.</span>
      </div>
    </div>
  );
};
