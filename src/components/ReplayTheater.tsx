import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, FastForward, Pause, Play } from 'lucide-react';
import { BUILDING_SPECS, MAPS, UNIT_SPECS } from '../game/catalog';
import { getWeatherModifiers } from '../game/rules';
import {
  BUILDING_SPRITE_URLS,
  PROP_SPRITE_URLS,
  spriteStore,
  TERRAIN_TEXTURES,
  UNIT_SPRITE_URLS,
} from '../game/sprites';
import { CommunityReplayDoc } from '../game/types';

interface ReplayTheaterProps {
  replay: CommunityReplayDoc;
  onClose: () => void;
}

export const ReplayTheater: React.FC<ReplayTheaterProps> = ({ replay, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [observerAll, setObserverAll] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [spriteVersion, setSpriteVersion] = useState(0);

  const map = MAPS[replay.mapId] ?? MAPS.iron_valley;
  const maxDuration = Math.max(
    replay.durationSec,
    replay.timelineEvents[replay.timelineEvents.length - 1]?.t ?? 60
  );

  useEffect(() => {
    spriteStore.preloadBattle(map.biome, 'standard');
    return spriteStore.subscribe(() => setSpriteVersion((v) => v + 1));
  }, [map.biome]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.25 * speed;
        if (next >= maxDuration) {
          setPlaying(false);
          return maxDuration;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing, speed, maxDuration]);

  // Active snapshot interpolation
  const eventsWithSnaps = replay.timelineEvents.filter((e) => e.snapshot);
  let activeEvent = eventsWithSnaps[0];
  for (const ev of eventsWithSnaps) {
    if (ev.t <= currentTime) activeEvent = ev;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeEvent?.snapshot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const sx = w / map.width;
    const sy = h / map.height;

    const terrainImg = spriteStore.getRawImage(TERRAIN_TEXTURES[map.biome]);
    if (terrainImg) {
      const tileW = 230;
      const tileH = 230;
      for (let ty = 0; ty < h; ty += tileH) {
        for (let tx = 0; tx < w; tx += tileW) {
          ctx.drawImage(terrainImg, tx, ty, tileW, tileH);
        }
      }
      ctx.fillStyle = 'rgba(10, 14, 18, 0.22)';
      ctx.fillRect(0, 0, w, h);
    } else {
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 40, w * 0.5, h * 0.5, w * 0.7);
      grad.addColorStop(0, map.biome === 'alpine' ? '#26303c' : map.biome === 'delta' ? '#1b261f' : '#232b20');
      grad.addColorStop(1, '#12161c');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // Roads & Rivers
    for (const z of map.zones) {
      if (z.kind === 'road') {
        ctx.fillStyle = 'rgba(54, 50, 44, 0.85)';
        ctx.fillRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy);
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.3)';
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(z.x * sx, (z.y + z.h / 2) * sy);
        ctx.lineTo((z.x + z.w) * sx, (z.y + z.h / 2) * sy);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (z.kind === 'river') {
        ctx.fillStyle = 'rgba(17, 46, 66, 0.9)';
        ctx.fillRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy);
      } else if (z.kind === 'ford') {
        ctx.fillStyle = 'rgba(43, 77, 89, 0.85)';
        ctx.fillRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy);
      }
    }

    // Plateaus, Forests (with Tree cutouts), Trenches, Bridges
    const treeSprite = spriteStore.getCutoutSprite(PROP_SPRITE_URLS.tree, 96);
    for (const z of map.zones) {
      if (z.kind === 'plateau') {
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect((z.x + 10) * sx, (z.y + 10) * sy, z.w * sx, z.h * sy);
        ctx.fillStyle = 'rgba(72, 82, 94, 0.72)';
        ctx.fillRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy);
      } else if (z.kind === 'forest') {
        ctx.fillStyle = 'rgba(15, 34, 20, 0.45)';
        ctx.beginPath();
        ctx.roundRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy, 10);
        ctx.fill();
        for (let ty = z.y + 24; ty < z.y + z.h - 14; ty += 40) {
          for (let tx = z.x + 24; tx < z.x + z.w - 14; tx += 40) {
            if (treeSprite) {
              ctx.drawImage(treeSprite, tx * sx - 9, ty * sy - 9, 18, 18);
            } else {
              ctx.fillStyle = '#244d2e';
              ctx.beginPath();
              ctx.arc(tx * sx, ty * sy, 5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      } else if (z.kind === 'trench') {
        ctx.fillStyle = '#1d2228';
        ctx.fillRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy);
        ctx.strokeStyle = '#78716c';
        ctx.lineWidth = 2;
        ctx.strokeRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy);
      } else if (z.kind === 'bridge') {
        ctx.fillStyle = '#475569';
        ctx.fillRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy);
      }
    }

    // Resource Nodes (Ore & Geothermal Cutouts)
    const oreSprite = spriteStore.getCutoutSprite(PROP_SPRITE_URLS.ore, 96);
    const geoSprite = spriteStore.getCutoutSprite(PROP_SPRITE_URLS.geothermal, 96);
    for (const n of map.nodes) {
      const sprite = n.kind === 'alloy' ? oreSprite : geoSprite;
      if (sprite) {
        ctx.drawImage(sprite, n.x * sx - 10, n.y * sy - 10, 20, 20);
      } else {
        ctx.fillStyle = n.kind === 'alloy' ? '#f59e0b' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(n.x * sx, n.y * sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const snap = activeEvent.snapshot;

    // Sectors
    for (const sec of map.sectors) {
      const sState = snap.sectors.find((s) => s.id === sec.id);
      const owner = sState?.o ?? 'neutral';
      const color = owner === 'blue' ? '#3b82f6' : owner === 'red' ? '#ef4444' : '#94a3b8';
      ctx.fillStyle =
        owner === 'blue' ? 'rgba(59,130,246,0.16)' : owner === 'red' ? 'rgba(239,68,68,0.16)' : 'rgba(148,163,184,0.08)';
      ctx.beginPath();
      ctx.arc(sec.x * sx, sec.y * sy, sec.radius * sx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sec.name, sec.x * sx, sec.y * sy + 4);
    }

    // Buildings (Photorealistic Cutout Sprites)
    for (const b of snap.buildings) {
      if (b.hpPct <= 0) continue;
      if (!observerAll && b.s === 'red') continue;
      const spec = BUILDING_SPECS[b.tp];
      const bx = b.x * sx;
      const by = b.y * sy;
      const tint = b.s === 'blue' ? '#3b82f6' : '#ef4444';
      const bSprite = spriteStore.getTintedCutoutSprite(BUILDING_SPRITE_URLS[b.tp], tint, 0.2, 140);
      const size = b.tp === 'hq' ? 38 : 28;
      if (bSprite) {
        ctx.drawImage(bSprite, bx - size / 2, by - size / 2, size, size);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = tint;
        ctx.lineWidth = 2;
        ctx.fillRect(bx - 11, by - 11, 22, 22);
        ctx.strokeRect(bx - 11, by - 11, 22, 22);
      }
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(spec.name.split(' ')[0], bx, by - size / 2 - 4);
    }

    // Units (Photorealistic Cutout Sprites)
    for (const u of snap.units) {
      if (!observerAll && u.s === 'red') continue;
      const spec = UNIT_SPECS[u.tp];
      const ux = u.x * sx;
      const uy = u.y * sy;
      const tint = u.s === 'blue' ? '#3b82f6' : '#ef4444';
      const uSprite = spriteStore.getTintedCutoutSprite(UNIT_SPRITE_URLS[u.tp], tint, 0.22, 120);
      if (uSprite) {
        const size = spec.isVehicle ? 24 : 17;
        ctx.drawImage(uSprite, ux - size / 2, uy - size / 2, size, size);
      } else {
        ctx.fillStyle = u.s === 'blue' ? '#60a5fa' : '#f87171';
        ctx.beginPath();
        ctx.arc(ux, uy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const wMod = getWeatherModifiers(snap.weather);
    if (wMod.ambientDarkness > 0) {
      ctx.fillStyle = `rgba(8, 14, 24, ${wMod.ambientDarkness * 0.7})`;
      ctx.fillRect(0, 0, w, h);
    }
  }, [activeEvent, map, observerAll, spriteVersion]);

  return (
    <div className="min-h-screen bg-[#0b0e12] text-slate-100 p-4 sm:p-6 flex flex-col gap-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#12171e] border border-slate-800 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali</span>
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold leading-none">{replay.title}</h1>
            <p className="text-xs text-slate-400 mt-1">
              {replay.authorName} · {map.name} · {replay.summaryStats.enemiesEliminated} Unit Hancur
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setObserverAll((v) => !v)}
          className="px-3.5 py-2 bg-[#0b0e12] hover:bg-slate-800 border border-slate-700 rounded-md text-xs font-medium flex items-center gap-2 cursor-pointer"
        >
          {observerAll ? <Eye className="w-4 h-4 text-amber-400" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
          <span>{observerAll ? 'Mode Pengamat: Semua Tim' : 'Mode Pengamat: Tim Biru'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-9 bg-[#12171e] border border-slate-800 rounded-lg p-3 flex flex-col gap-3">
          <canvas
            ref={canvasRef}
            width={920}
            height={580}
            className="w-full h-auto rounded bg-[#0b0e12] border border-slate-800"
          />

          {/* Scrubber & Playback Controls */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs rounded-md flex items-center gap-1.5 cursor-pointer"
            >
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{playing ? 'Jeda' : 'Putar'}</span>
            </button>

            <button
              type="button"
              onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono-tabular text-xs rounded-md flex items-center gap-1.5 cursor-pointer"
            >
              <FastForward className="w-3.5 h-3.5 text-amber-400" />
              <span>{speed}x</span>
            </button>

            <input
              type="range"
              min={0}
              max={maxDuration}
              step={1}
              value={Math.floor(currentTime)}
              onChange={(e) => setCurrentTime(Number(e.target.value))}
              aria-label="Lini Masa Replay"
              className="flex-1 accent-amber-500 cursor-pointer"
            />

            <span className="font-mono-tabular text-xs text-slate-300">
              {Math.floor(currentTime)}d / {maxDuration}d
            </span>
          </div>
        </div>

        {/* Tactical Timeline Events Log */}
        <div className="lg:col-span-3 bg-[#12171e] border border-slate-800 rounded-lg p-4 flex flex-col gap-3 max-h-[640px] overflow-y-auto">
          <h2 className="text-sm font-semibold text-slate-200">Lini Masa Pertempuran</h2>
          <div className="space-y-2">
            {replay.timelineEvents.map((ev, idx) => {
              const isPast = ev.t <= currentTime;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentTime(ev.t)}
                  className={`w-full text-left p-2.5 rounded border text-xs transition-colors cursor-pointer ${
                    isPast
                      ? 'bg-[#0b0e12] border-amber-500/40 text-slate-100'
                      : 'bg-[#0b0e12]/50 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="font-mono-tabular text-[11px] text-amber-400">{ev.t}d</div>
                  <div className="mt-0.5 leading-snug">{ev.summary}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
