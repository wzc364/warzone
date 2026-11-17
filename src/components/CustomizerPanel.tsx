import React, { useEffect, useRef, useState } from 'react';
import { Check, Save } from 'lucide-react';
import { COSMETIC_CATALOG } from '../game/catalog';
import {
  BUILDING_THEME_HQ_URLS,
  spriteStore,
  TERRAIN_TEXTURES,
  UNIT_SPRITE_URLS,
} from '../game/sprites';
import { CommanderLoadout, PortraitId, UserProfile } from '../game/types';
import { BannerEmblemSvg, CommanderAvatar, PORTRAIT_IMAGES } from './EmblemSvg';

interface CustomizerPanelProps {
  profile: UserProfile;
  onSave: (loadout: CommanderLoadout) => Promise<void>;
}

const CAMO_TINT_HEX: Record<string, { tint: string; alpha: number }> = {
  cobalt: { tint: '#3b82f6', alpha: 0.14 },
  olive: { tint: '#65a30d', alpha: 0.2 },
  obsidian: { tint: '#18181b', alpha: 0.34 },
  glacier: { tint: '#cbd5e1', alpha: 0.24 },
};

export const CustomizerPanel: React.FC<CustomizerPanelProps> = ({ profile, onSave }) => {
  const [draft, setDraft] = useState<CommanderLoadout>({
    commanderName: profile.commanderName,
    portraitId: profile.portraitId,
    armorStyle: profile.armorStyle,
    visorColor: profile.visorColor,
    camoPalette: profile.camoPalette,
    buildingTheme: profile.buildingTheme || 'standard',
    bannerEmblem: profile.bannerEmblem,
    tracerColor: profile.tracerColor,
    victoryEmote: profile.victoryEmote,
  });
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const dioramaCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const isOwned = (id: string) => profile.unlockedCosmetics.includes(id);

  const buildingThemes = COSMETIC_CATALOG.filter((c) => c.category === 'buildingTheme');
  const armors = COSMETIC_CATALOG.filter((c) => c.category === 'armorStyle');
  const visors = COSMETIC_CATALOG.filter((c) => c.category === 'visorColor');
  const camos = COSMETIC_CATALOG.filter((c) => c.category === 'camoPalette');
  const emblems = COSMETIC_CATALOG.filter((c) => c.category === 'bannerEmblem');
  const tracers = COSMETIC_CATALOG.filter((c) => c.category === 'tracerColor');
  const emotes = COSMETIC_CATALOG.filter((c) => c.category === 'victoryEmote');

  const activeCamo = camos.find((c) => c.value === draft.camoPalette) ?? camos[0];
  const activeBuilding = buildingThemes.find((b) => b.value === draft.buildingTheme) ?? buildingThemes[0];

  // Animated 60fps Tactical Hangar & Battlefield Diorama Canvas (Photorealistic Cutouts)
  useEffect(() => {
    spriteStore.preloadDiorama(draft.buildingTheme);
    let rafId = 0;
    const startMs = performance.now();

    const drawRotatedCutout = (
      ctx: CanvasRenderingContext2D,
      sprite: HTMLCanvasElement,
      x: number,
      y: number,
      angleRad: number,
      targetW: number,
      targetH: number
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angleRad);
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 5;
      ctx.drawImage(sprite, -targetW / 2, -targetH / 2, targetW, targetH);
      ctx.restore();
    };

    const renderFrame = (now: number) => {
      const canvas = dioramaCanvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const t = (now - startMs) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      // 1. Photorealistic satellite terrain backdrop
      const terrainImg = spriteStore.getRawImage(TERRAIN_TEXTURES.temperate);
      if (terrainImg) {
        ctx.drawImage(terrainImg, 0, 0, w, h);
        ctx.fillStyle = 'rgba(10, 14, 19, 0.42)';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = '#121820';
        ctx.fillRect(0, 0, w, h);
      }

      // Concrete tactical apron strip
      ctx.fillStyle = 'rgba(30, 38, 48, 0.65)';
      ctx.fillRect(24, 24, w - 48, h - 48);
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(24, 24, w - 48, h - 48);

      const tintSpec = CAMO_TINT_HEX[draft.camoPalette] ?? CAMO_TINT_HEX.cobalt;

      // 2. Selected Headquarters Architecture Cutout Sprite
      const hqUrl = BUILDING_THEME_HQ_URLS[draft.buildingTheme] ?? BUILDING_THEME_HQ_URLS.standard;
      const hqSprite = spriteStore.getCutoutSprite(hqUrl, 240);
      const hqX = 115;
      const hqY = h * 0.52;
      if (hqSprite) {
        drawRotatedCutout(ctx, hqSprite, hqX, hqY, 0, 134, 134);
      }
      // Animated HQ radar dish & pulsing landing pad beacon
      ctx.save();
      ctx.translate(hqX - 24, hqY - 22);
      ctx.rotate(t * 2.1);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      ctx.restore();

      const beaconAlpha = 0.4 + 0.55 * Math.sin(t * 4);
      ctx.fillStyle = `rgba(245, 158, 11, ${beaconAlpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(hqX + 34, hqY + 26, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // 3. Battle Tank + Rocket Artillery + Infantry Cutout Sprites
      const cycle = t % 1.8;
      const firing = cycle < 0.22;
      const recoil = firing ? (1 - cycle / 0.22) * 5 : 0;

      const tankSprite = spriteStore.getTintedCutoutSprite(
        UNIT_SPRITE_URLS.battle_tank,
        tintSpec.tint,
        tintSpec.alpha,
        200
      );
      const tankX = 278 - recoil;
      const tankY = h * 0.48 + Math.sin(t * 1.4) * 2;
      if (tankSprite) {
        drawRotatedCutout(ctx, tankSprite, tankX, tankY, 0, 92, 64);
      }

      // Armor badge aura cue if ERA / Stealth equipped
      if (draft.armorStyle === 'reactive') {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tankX - 36, tankY - 24, 72, 48);
      } else if (draft.armorStyle === 'stealth') {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(tankX - 36, tankY - 24, 72, 48);
        ctx.setLineDash([]);
      }

      // Infantry squad members flanking the tank
      const rifleSprite = spriteStore.getTintedCutoutSprite(
        UNIT_SPRITE_URLS.rifle_squad,
        tintSpec.tint,
        tintSpec.alpha,
        150
      );
      const heavySprite = spriteStore.getTintedCutoutSprite(
        UNIT_SPRITE_URLS.heavy_mg,
        tintSpec.tint,
        tintSpec.alpha,
        150
      );
      const infPositions = [
        { x: 356, y: h * 0.28, sprite: rifleSprite, phase: 0 },
        { x: 374, y: h * 0.56, sprite: heavySprite ?? rifleSprite, phase: 1.5 },
        { x: 348, y: h * 0.77, sprite: rifleSprite, phase: 3.0 },
      ];
      for (const inf of infPositions) {
        const bob = Math.sin(t * 4.5 + inf.phase) * 1.5;
        if (inf.sprite) {
          drawRotatedCutout(ctx, inf.sprite, inf.x + bob, inf.y, 0, 34, 34);
        }
        // Visor glint in selected visorColor
        ctx.fillStyle = draft.visorColor;
        ctx.beginPath();
        ctx.arc(inf.x + bob + 5, inf.y - 2, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Live Muzzle Flash + Tracer Ordnance Streaks
      if (firing) {
        const flashR = 14 * (1 - cycle / 0.22) + 4;
        const grad = ctx.createRadialGradient(tankX + 46, tankY, 1, tankX + 46, tankY, flashR);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, draft.tracerColor);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(tankX + 46, tankY, flashR, 0, Math.PI * 2);
        ctx.fill();
      }

      const tracerProgress = (t * 2.2) % 1;
      const startX = tankX + 44;
      const endX = w - 28;
      const currX = startX + (endX - startX) * tracerProgress;
      ctx.strokeStyle = draft.tracerColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(Math.max(startX, currX - 38), tankY);
      ctx.lineTo(currX, tankY);
      ctx.stroke();

      // Secondary infantry tracer stream
      const infProgress = (t * 3.1 + 0.4) % 1;
      const iCurrX = 392 + (w - 420) * infProgress;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(Math.max(392, iCurrX - 24), h * 0.28);
      ctx.lineTo(iCurrX, h * 0.28);
      ctx.stroke();

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [draft.buildingTheme, draft.camoPalette, draft.tracerColor, draft.visorColor, draft.armorStyle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2200);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Live Animated Tactical Diorama Preview */}
      <div className="lg:col-span-5 bg-[#12171e] border border-slate-800 rounded-lg p-6 space-y-5 lg:sticky lg:top-6">
        <div className="flex items-center gap-4">
          <CommanderAvatar portraitId={draft.portraitId} visorColor={draft.visorColor} sizeClass="w-20 h-20" />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <BannerEmblemSvg emblem={draft.bannerEmblem} color={activeCamo?.swatchHex} size={30} />
              <h2 className="font-display text-2xl font-bold text-slate-100 truncate">
                {draft.commanderName || 'Komandan'}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {PORTRAIT_IMAGES[draft.portraitId].label} · {activeBuilding?.name}
            </p>
            <p className="text-xs text-amber-400 mt-1">
              {activeCamo?.name} · Selebrasi: {draft.victoryEmote}
            </p>
          </div>
        </div>

        {/* Live Animated Canvas Diorama (Markas + Tank + Skuad + Peluru) */}
        <div className="bg-[#0b0e12] border border-slate-800 rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Simulasi Pangkalan &amp; Skuad Langsung</span>
            <span className="font-mono-tabular text-amber-300">{activeCamo?.name}</span>
          </div>
          <canvas
            ref={dioramaCanvasRef}
            width={560}
            height={230}
            aria-label="Simulasi Markas dan Skuad Langsung"
            className="w-full h-auto rounded border border-slate-800/80 bg-[#090d12]"
          />
          <p className="text-[11px] text-slate-500">
            Pratinjau langsung sprite markas, tank lapis baja, infanteri, lensa optik, dan tembakan peluru jejak.
          </p>
        </div>

        <div>
          <label htmlFor="commander-name-input" className="block text-xs font-medium text-slate-300 mb-1.5">
            Nama Komandan
          </label>
          <input
            id="commander-name-input"
            type="text"
            minLength={2}
            maxLength={32}
            required
            value={draft.commanderName}
            onChange={(e) => setDraft({ ...draft, commanderName: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-[#0b0e12] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-amber-500"
            placeholder="Nama komandan Anda"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {savedNotice ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Menyimpan...' : savedNotice ? 'Konfigurasi Tersimpan' : 'Simpan Kustomisasi'}</span>
        </button>
      </div>

      {/* Right: Realistic Photo-Backed Customization Sections */}
      <div className="lg:col-span-7 bg-[#12171e] border border-slate-800 rounded-lg p-6 space-y-6">
        {/* Commander Portrait */}
        <div>
          <h3 className="text-sm font-semibold text-slate-200 mb-2.5">Arketipe &amp; Potret Komandan</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['vanguard', 'sentinel', 'spectre'] as PortraitId[]).map((pid) => {
              const active = draft.portraitId === pid;
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setDraft({ ...draft, portraitId: pid })}
                  className={`p-3 rounded-md border text-left transition-colors cursor-pointer flex items-center gap-3 ${
                    active
                      ? 'bg-amber-500/10 border-amber-500 text-slate-100'
                      : 'bg-[#0b0e12] border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <CommanderAvatar portraitId={pid} sizeClass="w-12 h-12" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{PORTRAIT_IMAGES[pid].label}</div>
                    <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                      {PORTRAIT_IMAGES[pid].specialty}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Building Architectural Themes */}
        <div>
          <h3 className="text-sm font-semibold text-slate-200 mb-2.5">Arsitektur Markas &amp; Bangunan</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {buildingThemes.map((item) => {
              const owned = isOwned(item.id);
              const active = draft.buildingTheme === item.value;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!owned}
                  onClick={() => setDraft({ ...draft, buildingTheme: item.value })}
                  className={`rounded-md border overflow-hidden text-left transition-colors ${
                    !owned
                      ? 'opacity-45 cursor-not-allowed bg-[#0b0e12] border-slate-800'
                      : active
                      ? 'bg-amber-500/10 border-amber-500 cursor-pointer'
                      : 'bg-[#0b0e12] border-slate-800 hover:border-slate-600 cursor-pointer'
                  }`}
                >
                  <img
                    src={item.previewImage}
                    alt={item.name}
                    referrerPolicy="no-referrer"
loading="lazy"
decoding="async"
                    className="w-full h-24 object-cover border-b border-slate-800"
                  />
                  <div className="p-2.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-200 truncate">{item.name}</span>
                    <span className="text-[11px] text-amber-400 shrink-0">
                      {owned ? (active ? 'Aktif' : 'Pilih') : 'Toko'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Squad & Tank Regiment Skins */}
        <div>
          <h3 className="text-sm font-semibold text-slate-200 mb-2.5">Resimen Pasukan &amp; Lapis Baja</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {camos.map((item) => {
              const owned = isOwned(item.id);
              const active = draft.camoPalette === item.value;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!owned}
                  onClick={() => setDraft({ ...draft, camoPalette: item.value })}
                  className={`rounded-md border overflow-hidden text-left transition-colors ${
                    !owned
                      ? 'opacity-45 cursor-not-allowed bg-[#0b0e12] border-slate-800'
                      : active
                      ? 'bg-amber-500/10 border-amber-500 cursor-pointer'
                      : 'bg-[#0b0e12] border-slate-800 hover:border-slate-600 cursor-pointer'
                  }`}
                >
                  <img
                    src={item.previewImage}
                    alt={item.name}
                    referrerPolicy="no-referrer"
loading="lazy"
decoding="async"
                    className="w-full h-24 object-cover border-b border-slate-800"
                  />
                  <div className="p-2.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-200 truncate">{item.name}</span>
                    <span className="text-[11px] text-amber-400 shrink-0">
                      {owned ? (active ? 'Aktif' : 'Pilih') : 'Toko'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Armor & Metallic Emblems */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2.5">Model Zirah Tempur</h3>
            <div className="space-y-2">
              {armors.map((item) => {
                const owned = isOwned(item.id);
                const active = draft.armorStyle === item.value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!owned}
                    onClick={() => setDraft({ ...draft, armorStyle: item.value })}
                    className={`w-full p-2 rounded-md border text-left text-xs flex items-center gap-3 ${
                      !owned
                        ? 'opacity-45 cursor-not-allowed bg-[#0b0e12] border-slate-800'
                        : active
                        ? 'bg-amber-500/10 border-amber-500 text-slate-100 cursor-pointer'
                        : 'bg-[#0b0e12] border-slate-800 text-slate-300 hover:border-slate-600 cursor-pointer'
                    }`}
                  >
                    <img
                      src={item.previewImage}
                      alt={item.name}
                      referrerPolicy="no-referrer"
loading="lazy"
decoding="async"
                      className="w-12 h-10 rounded object-cover border border-slate-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.name}</div>
                      <div className="text-[11px] text-slate-400">{owned ? (active ? 'Aktif' : 'Pilih') : 'Toko'}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2.5">Lencana Logam Komando</h3>
            <div className="space-y-2">
              {emblems.map((item) => {
                const owned = isOwned(item.id);
                const active = draft.bannerEmblem === item.value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!owned}
                    onClick={() => setDraft({ ...draft, bannerEmblem: item.value })}
                    className={`w-full p-2 rounded-md border text-left text-xs flex items-center gap-3 ${
                      !owned
                        ? 'opacity-45 cursor-not-allowed bg-[#0b0e12] border-slate-800'
                        : active
                        ? 'bg-amber-500/10 border-amber-500 text-slate-100 cursor-pointer'
                        : 'bg-[#0b0e12] border-slate-800 text-slate-300 hover:border-slate-600 cursor-pointer'
                    }`}
                  >
                    <img
                      src={item.previewImage}
                      alt={item.name}
                      referrerPolicy="no-referrer"
loading="lazy"
decoding="async"
                      className="w-12 h-10 rounded object-cover border border-slate-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.name}</div>
                      <div className="text-[11px] text-slate-400">{owned ? (active ? 'Aktif' : 'Pilih') : 'Toko'}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Visor Optics, Tracers & Victory Celebration */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <h3 className="text-xs font-semibold text-slate-300 mb-2">Optik &amp; Visor</h3>
            <div className="space-y-2">
              {visors.map((item) => {
                const owned = isOwned(item.id);
                const active = draft.visorColor === item.value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!owned}
                    onClick={() => setDraft({ ...draft, visorColor: item.value })}
                    className={`w-full p-2 rounded border text-xs flex items-center gap-2.5 ${
                      !owned
                        ? 'opacity-45 cursor-not-allowed bg-[#0b0e12] border-slate-800'
                        : active
                        ? 'bg-amber-500/10 border-amber-500 text-slate-100 cursor-pointer'
                        : 'bg-[#0b0e12] border-slate-800 text-slate-300 cursor-pointer'
                    }`}
                  >
                    <div className="relative w-10 h-9 rounded overflow-hidden border border-slate-700 shrink-0">
                      <img
                        src={item.previewImage}
                        alt={item.name}
                        referrerPolicy="no-referrer"
loading="lazy"
decoding="async"
                        className="w-full h-full object-cover"
                      />
                      <span
                        className="absolute bottom-0 inset-x-0 h-1"
                        style={{ backgroundColor: item.swatchHex }}
                      />
                    </div>
                    <span className="truncate text-left">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-300 mb-2">Amunisi Jejak</h3>
            <div className="space-y-2">
              {tracers.map((item) => {
                const owned = isOwned(item.id);
                const active = draft.tracerColor === item.value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!owned}
                    onClick={() => setDraft({ ...draft, tracerColor: item.value })}
                    className={`w-full p-2 rounded border text-xs flex items-center gap-2.5 ${
                      !owned
                        ? 'opacity-45 cursor-not-allowed bg-[#0b0e12] border-slate-800'
                        : active
                        ? 'bg-amber-500/10 border-amber-500 text-slate-100 cursor-pointer'
                        : 'bg-[#0b0e12] border-slate-800 text-slate-300 cursor-pointer'
                    }`}
                  >
                    <div className="relative w-10 h-9 rounded overflow-hidden border border-slate-700 shrink-0">
                      <img
                        src={item.previewImage}
                        alt={item.name}
                        referrerPolicy="no-referrer"
loading="lazy"
decoding="async"
                        className="w-full h-full object-cover"
                      />
                      <span
                        className="absolute bottom-0 inset-x-0 h-1"
                        style={{ backgroundColor: item.swatchHex }}
                      />
                    </div>
                    <span className="truncate text-left">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-300 mb-2">Selebrasi Kemenangan</h3>
            <div className="space-y-2">
              {emotes.map((item) => {
                const owned = isOwned(item.id);
                const active = draft.victoryEmote === item.value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!owned}
                    onClick={() => setDraft({ ...draft, victoryEmote: item.value })}
                    className={`w-full p-2 rounded border text-xs flex items-center gap-2.5 ${
                      !owned
                        ? 'opacity-45 cursor-not-allowed bg-[#0b0e12] border-slate-800'
                        : active
                        ? 'bg-amber-500/10 border-amber-500 text-slate-100 cursor-pointer'
                        : 'bg-[#0b0e12] border-slate-800 text-slate-300 cursor-pointer'
                    }`}
                  >
                    <img
                      src={item.previewImage}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-9 rounded object-cover border border-slate-700 shrink-0"
                    />
                    <span className="truncate text-left">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
