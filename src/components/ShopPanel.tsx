import React, { useEffect, useState } from 'react';
import { Check, Coins, Sparkles } from 'lucide-react';
import { COSMETIC_CATALOG } from '../game/catalog';
import { CosmeticItem, UserProfile } from '../game/types';

interface ShopPanelProps {
  profile: UserProfile;
  onPurchase: (item: CosmeticItem) => Promise<void>;
  onEquip: (item: CosmeticItem) => Promise<void>;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Semua Item',
  buildingTheme: 'Bangunan & Markas',
  camoPalette: 'Pasukan & Tank',
  armorStyle: 'Zirah Tempur',
  bannerEmblem: 'Lencana Logam',
  visorColor: 'Optik & Visor',
  tracerColor: 'Amunisi Jejak',
  victoryEmote: 'Selebrasi',
};

export const ShopPanel: React.FC<ShopPanelProps> = ({ profile, onPurchase, onEquip }) => {
  const [filter, setFilter] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    for (const item of COSMETIC_CATALOG) {
      if (item.previewImage) {
        const img = new Image();
        img.src = item.previewImage;
      }
    }
  }, []);

  const items = COSMETIC_CATALOG.filter(
    (item) => item.price > 0 && (filter === 'all' || item.category === filter)
  );

  const isEquipped = (item: CosmeticItem) => {
    const map: Record<CosmeticItem['category'], string> = {
      buildingTheme: profile.buildingTheme,
      armorStyle: profile.armorStyle,
      visorColor: profile.visorColor,
      camoPalette: profile.camoPalette,
      bannerEmblem: profile.bannerEmblem,
      tracerColor: profile.tracerColor,
      victoryEmote: profile.victoryEmote,
    };
    return map[item.category] === item.value;
  };

  const handleBuy = async (item: CosmeticItem) => {
    setErrorMsg(null);
    setBusyId(item.id);
    try {
      await onPurchase(item);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membeli item.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#12171e] border border-slate-800 rounded-lg p-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-100">
            Gudang Persenjataan &amp; Kosmetik Realistis
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Tingkatkan tampilan arsitektur markas, resimen tank &amp; infanteri, zirah reaktif, lencana logam, hingga amunisi plasma.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[#0b0e12] border border-amber-500/40 px-4 py-2 rounded-md">
          <Coins className="w-4 h-4 text-amber-400" />
          <span className="font-mono-tabular text-base font-semibold text-amber-300">{profile.credits}</span>
          <span className="text-xs text-slate-400">Kredit Komando</span>
        </div>
      </div>

      {/* Category Filter Buttons */}
      <div className="flex flex-wrap items-center gap-1.5 bg-[#12171e] border border-slate-800 p-1.5 rounded-lg">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filter === key
                ? 'bg-amber-600 text-slate-950 font-semibold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="bg-red-950/60 border border-red-700 text-red-200 text-xs px-4 py-2.5 rounded-md">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((item) => {
          const owned = profile.unlockedCosmetics.includes(item.id);
          const equipped = isEquipped(item);
          const canAfford = profile.credits >= item.price;
          const imgFailed = failedImages[item.id];

          return (
            <div
              key={item.id}
              className={`bg-[#12171e] border rounded-lg overflow-hidden flex flex-col justify-between transition-colors ${
                equipped
                  ? 'border-emerald-600/80 shadow-lg shadow-emerald-950/20'
                  : 'border-slate-800 hover:border-slate-600'
              }`}
            >
              {/* Photorealistic Showcase Visual */}
              <div>
                <div className="relative h-44 w-full bg-[#090c10] overflow-hidden border-b border-slate-800 group">
                  {!imgFailed ? (
                    <img
                      src={item.previewImage}
                      alt={item.name}
                      loading="eager"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={() => setFailedImages((prev) => ({ ...prev, [item.id]: true }))}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                      {item.name}
                    </div>
                  )}

                  {/* Subtle cinematic vignette */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#12171e] via-transparent to-black/35 pointer-events-none" />

                  {/* Category label over top-left */}
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded bg-[#0b0e12]/85 border border-slate-700/80 text-[11px] font-medium text-slate-200">
                    {CATEGORY_LABELS[item.category]}
                  </div>

                  {/* Signature optic/tracer light glow accent bar for optics & ammo */}
                  {item.swatchHex && (
                    <div
                      aria-hidden="true"
                      className="absolute bottom-0 inset-x-0 h-1.5"
                      style={{
                        background: item.secondaryHex
                          ? `linear-gradient(90deg, ${item.secondaryHex}, ${item.swatchHex})`
                          : `linear-gradient(90deg, transparent, ${item.swatchHex}, transparent)`,
                        boxShadow: `0 0 14px ${item.swatchHex}`,
                      }}
                    />
                  )}
                </div>

                <div className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-100 leading-snug">{item.name}</h3>
                    {item.swatchHex && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-mono-tabular px-2 py-0.5 rounded border border-slate-700 bg-[#0b0e12] text-slate-200 shrink-0"
                        title="Spektrum Optik / Balistik"
                      >
                        <Sparkles className="w-2.5 h-2.5" style={{ color: item.swatchHex }} />
                        <span>Spektrum</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{item.description}</p>
                </div>
              </div>

              <div className="px-4 py-3 mt-2 bg-[#0e1319] border-t border-slate-800/80 flex items-center justify-between">
                <span className="font-mono-tabular text-sm font-semibold text-amber-300">
                  {owned ? 'Sudah Dimiliki' : `${item.price} Kredit`}
                </span>
                {owned ? (
                  <button
                    type="button"
                    disabled={equipped}
                    onClick={() => onEquip(item)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      equipped
                        ? 'bg-emerald-950/70 border border-emerald-700 text-emerald-300 cursor-default'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer'
                    }`}
                  >
                    {equipped && <Check className="w-3.5 h-3.5" />}
                    <span>{equipped ? 'Terpasang' : 'Pasang'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canAfford || busyId === item.id}
                    onClick={() => handleBuy(item)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      canAfford
                        ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {busyId === item.id ? 'Memproses...' : 'Beli Paket'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
