import React, { useState } from 'react';
import { PortraitId, RankTier } from '../game/types';

export const PORTRAIT_IMAGES: Record<PortraitId, { src: string; label: string; specialty: string }> = {
  vanguard: {
    src: '/src/assets/images/commander_vanguard_1794834096668.jpg',
    label: 'Komandan Vanguard',
    specialty: 'Serbuan Cepat & Manuver Lapis Baja',
  },
  sentinel: {
    src: '/src/assets/images/commander_sentinel_1794834098183.jpg',
    label: 'Komandan Sentinel',
    specialty: 'Benteng Pertahanan & Artileri Berat',
  },
  spectre: {
    src: '/src/assets/images/commander_spectre_1794834098068.jpg',
    label: 'Komandan Spectre',
    specialty: 'Pengintaian Hutan & Serangan Presisi',
  },
};

export function CommanderAvatar({
  portraitId,
  visorColor,
  sizeClass = 'w-14 h-14',
}: {
  portraitId: PortraitId;
  visorColor?: string;
  sizeClass?: string;
}) {
  const [failed, setFailed] = useState(false);
  const info = PORTRAIT_IMAGES[portraitId] ?? PORTRAIT_IMAGES.vanguard;

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-[#161c24] border border-slate-700/80 shrink-0 ${sizeClass}`}
    >
      {!failed ? (
        <img
          src={info.src}
          alt={info.label}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400 font-display text-lg">
          {info.label.slice(0, 2).toUpperCase()}
        </div>
      )}
      {visorColor && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-sm border border-black/60"
          style={{ backgroundColor: visorColor }}
        />
      )}
    </div>
  );
}

const EMBLEM_IMAGES: Record<string, string> = {
  chevron: '/src/assets/images/cosmetic_emblem_chevron_1794837259331.jpg',
  bastion: '/src/assets/images/cosmetic_emblem_bastion_1794837259018.jpg',
  falcon: '/src/assets/images/cosmetic_emblem_falcon_1794837259992.jpg',
};

export function BannerEmblemSvg({
  emblem,
  color = '#f59e0b',
  size = 28,
}: {
  emblem: string;
  color?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = EMBLEM_IMAGES[emblem] ?? EMBLEM_IMAGES.chevron;

  return (
    <div
      className="relative overflow-hidden rounded-md bg-[#11161d] border shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, borderColor: color }}
    >
      {!failed ? (
        <img
          src={src}
          alt={`Lencana ${emblem}`}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="font-display text-xs font-bold text-amber-400">
          {emblem.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function RankInsignia({ tier, size = 20 }: { tier: RankTier; size?: number }) {
  const palette: Record<RankTier, string> = {
    Bronze: '#cd7f32',
    Silver: '#cbd5e1',
    Gold: '#fbbf24',
    Platinum: '#2dd4bf',
    Diamond: '#38bdf8',
    Grandmaster: '#f97316',
  };
  const stroke = palette[tier] ?? '#cbd5e1';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon points="12,2 21,7 19,17 12,22 5,17 3,7" fill="#131820" stroke={stroke} strokeWidth="1.8" />
      <polygon points="12,6 16,12 12,18 8,12" fill={stroke} />
    </svg>
  );
}

export function TitleBrandEmblem() {
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex items-center gap-4">
      <div className="w-14 h-14 rounded-lg overflow-hidden border-2 border-amber-500/80 bg-[#12171f] shadow-lg shrink-0 flex items-center justify-center">
        {!failed ? (
          <img
            src="/src/assets/images/cosmetic_emblem_bastion_1794837259018.jpg"
            alt="Lambang Ironfront"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-display text-xl font-bold text-amber-400">IF</span>
        )}
      </div>
      <div>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-100 leading-none">
          IRONFRONT: DOMINION
        </h1>
        <p className="text-sm text-slate-400 mt-1.5">
          Komando Taktis Real-Time · Ekonomi Tiga Sumber · Skuad &amp; Peringkat Global
        </p>
      </div>
    </div>
  );
}

export function FactionFlag({
  factionId,
  className = 'w-12 h-8',
}: {
  factionId: string;
  className?: string;
}) {
  const renderFlagSvg = () => {
    switch (factionId) {
      case 'indonesia':
        return (
          <svg viewBox="0 0 60 40" className="w-full h-full" aria-label="Bendera Indonesia">
            <rect width="60" height="20" y="0" fill="#CE1126" />
            <rect width="60" height="20" y="20" fill="#FFFFFF" />
          </svg>
        );
      case 'japan':
        return (
          <svg viewBox="0 0 60 40" className="w-full h-full" aria-label="Bendera Jepang">
            <rect width="60" height="40" fill="#FFFFFF" />
            <circle cx="30" cy="20" r="11" fill="#BC002D" />
          </svg>
        );
      case 'ukraine':
        return (
          <svg viewBox="0 0 60 40" className="w-full h-full" aria-label="Bendera Ukraina">
            <rect width="60" height="20" y="0" fill="#005BBB" />
            <rect width="60" height="20" y="20" fill="#FFD500" />
          </svg>
        );
      case 'russia':
        return (
          <svg viewBox="0 0 60 40" className="w-full h-full" aria-label="Bendera Rusia">
            <rect width="60" height="13.4" y="0" fill="#FFFFFF" />
            <rect width="60" height="13.4" y="13.3" fill="#0039A6" />
            <rect width="60" height="13.4" y="26.6" fill="#D52B1E" />
          </svg>
        );
      case 'china':
        return (
          <svg viewBox="0 0 60 40" className="w-full h-full" aria-label="Bendera Tiongkok">
            <rect width="60" height="40" fill="#DE2910" />
            <polygon points="11,5 12.6,9.8 17.6,9.8 13.5,12.7 15.1,17.5 11,14.5 6.9,17.5 8.5,12.7 4.4,9.8 9.4,9.8" fill="#FFDE00" />
            <circle cx="21" cy="6" r="1.4" fill="#FFDE00" />
            <circle cx="24" cy="10" r="1.4" fill="#FFDE00" />
            <circle cx="24" cy="15" r="1.4" fill="#FFDE00" />
            <circle cx="21" cy="19" r="1.4" fill="#FFDE00" />
          </svg>
        );
      case 'usa':
        return (
          <svg viewBox="0 0 60 40" className="w-full h-full" aria-label="Bendera Amerika Serikat">
            <rect width="60" height="40" fill="#FFFFFF" />
            {[0, 2, 4, 6, 8, 10, 12].map((i) => (
              <rect key={i} width="60" height={40 / 13} y={(i * 40) / 13} fill="#B22234" />
            ))}
            <rect width="26" height={(40 * 7) / 13} fill="#3C3B6E" />
            {[4, 10, 16, 22].map((cx) =>
              [4, 10, 16].map((cy) => <circle key={`${cx}_${cy}`} cx={cx} cy={cy} r="1" fill="#FFFFFF" />)
            )}
          </svg>
        );
      case 'uk':
        return (
          <svg viewBox="0 0 60 40" className="w-full h-full" aria-label="Bendera Inggris">
            <rect width="60" height="40" fill="#012169" />
            <path d="M0,0 L60,40 M60,0 L0,40" stroke="#FFFFFF" strokeWidth="7" />
            <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="3.2" />
            <path d="M30,0 V40 M0,20 H60" stroke="#FFFFFF" strokeWidth="10" />
            <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="6" />
          </svg>
        );
      case 'south_korea':
      default:
        return (
          <svg viewBox="0 0 60 40" className="w-full h-full" aria-label="Bendera Korea Selatan">
            <rect width="60" height="40" fill="#FFFFFF" />
            <path d="M30,11 A9,9 0 0,1 30,29 A4.5,4.5 0 0,1 30,20 A4.5,4.5 0 0,0 30,11 Z" fill="#CD2E3A" />
            <path d="M30,29 A9,9 0 0,1 30,11 A4.5,4.5 0 0,1 30,20 A4.5,4.5 0 0,0 30,29 Z" fill="#0047A0" />
            <g stroke="#111827" strokeWidth="1.7" strokeLinecap="butt">
              <line x1="11" y1="11" x2="17" y2="7" />
              <line x1="12.5" y1="13.3" x2="18.5" y2="9.3" />
              <line x1="14" y1="15.6" x2="20" y2="11.6" />
              <line x1="43" y1="7" x2="49" y2="11" />
              <line x1="41.5" y1="9.3" x2="47.5" y2="13.3" />
              <line x1="40" y1="11.6" x2="46" y2="15.6" />
              <line x1="11" y1="29" x2="17" y2="33" />
              <line x1="12.5" y1="26.7" x2="18.5" y2="30.7" />
              <line x1="43" y1="33" x2="49" y2="29" />
              <line x1="41.5" y1="30.7" x2="47.5" y2="26.7" />
            </g>
          </svg>
        );
    }
  };

  return (
    <div className={`overflow-hidden rounded-sm border border-slate-600/90 shadow-sm bg-slate-900 shrink-0 ${className}`}>
      {renderFlagSvg()}
    </div>
  );
}

