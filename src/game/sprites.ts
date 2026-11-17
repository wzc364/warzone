import { BiomeId, BuildingTypeId, FactionId, UnitTypeId } from './types';

export const TERRAIN_TEXTURES: Record<BiomeId, string> = {
  temperate: '/src/assets/images/terrain_temperate_1794837247673.jpg',
  delta: '/src/assets/images/terrain_delta_1794837247577.jpg',
  alpine: '/src/assets/images/terrain_alpine_1794837248011.jpg',
  desert: '/src/assets/images/terrain_desert_1794842501112.jpg',
  volcanic: '/src/assets/images/terrain_volcanic_1794842508359.jpg',
  jungle: '/src/assets/images/terrain_jungle_1794842501490.jpg',
};

export const BUILDING_SPRITE_URLS: Record<BuildingTypeId, string> = {
  hq: '/src/assets/images/modern_bld_hq_1794902988596.jpg',
  barracks: '/src/assets/images/modern_bld_barracks_1794902506886.jpg',
  factory: '/src/assets/images/modern_bld_factory_1794902507225.jpg',
  power_plant: '/src/assets/images/modern_bld_power_1794902987417.jpg',
  refinery: '/src/assets/images/modern_bld_refinery_1794902990157.jpg',
  tech_lab: '/src/assets/images/modern_bld_techlab_1794903016244.jpg',
  watchtower: '/src/assets/images/modern_bld_watchtower_1794902990215.jpg',
  airfield: '/src/assets/images/modern_bld_airfield_1794902506062.jpg',
  faction_special: '/src/assets/images/modern_bld_special_1794902991006.jpg',
};

export const BUILDING_THEME_HQ_URLS: Record<string, string> = {
  standard: '/src/assets/images/modern_bld_hq_1794902988596.jpg',
  bastion: '/src/assets/images/skin_bld_bastion_1794837256000.jpg',
  obsidian: '/src/assets/images/skin_bld_obsidian_1794837257042.jpg',
  arctic: '/src/assets/images/skin_bld_arctic_1794837256910.jpg',
};

export const UNIT_SPRITE_URLS: Record<UnitTypeId, string> = {
  battle_tank: '/src/assets/images/faction_tank_nato_1794903016755.jpg',
  rocket_artillery: '/src/assets/images/modern_artillery_1794902992605.jpg',
  engineer_harvester: '/src/assets/images/modern_harvester_1794902993245.jpg',
  rifle_squad: '/src/assets/images/modern_soldier_single_1794902992693.jpg',
  heavy_mg: '/src/assets/images/modern_heavy_mg_single_1794903016106.jpg',
  recon_sniper: '/src/assets/images/modern_sniper_single_1794903016273.jpg',
  apc_ifv: '/src/assets/images/modern_apc_ifv_1794902505749.jpg',
  anti_air_tank: '/src/assets/images/modern_anti_air_1794902505370.jpg',
  heavy_siege_tank: '/src/assets/images/modern_heavy_tank_1794902505406.jpg',
  attack_helicopter: '/src/assets/images/modern_helicopter_1794902506586.jpg',
  strike_fighter: '/src/assets/images/modern_jet_fighter_1794902506159.jpg',
};

export const FACTION_TANK_URLS: Record<FactionId, string> = {
  usa: '/src/assets/images/faction_tank_nato_1794903016755.jpg',
  uk: '/src/assets/images/faction_tank_nato_1794903016755.jpg',
  russia: '/src/assets/images/faction_tank_east_1794903016649.jpg',
  ukraine: '/src/assets/images/faction_tank_east_1794903016649.jpg',
  china: '/src/assets/images/faction_tank_east_1794903016649.jpg',
  indonesia: '/src/assets/images/faction_tank_asia_1794903017185.jpg',
  japan: '/src/assets/images/faction_tank_asia_1794903017185.jpg',
  south_korea: '/src/assets/images/faction_tank_asia_1794903017185.jpg',
};

export const FACTION_JET_URLS: Record<FactionId, string> = {
  usa: '/src/assets/images/modern_jet_fighter_1794902506159.jpg',
  japan: '/src/assets/images/modern_jet_fighter_1794902506159.jpg',
  south_korea: '/src/assets/images/modern_jet_fighter_1794902506159.jpg',
  russia: '/src/assets/images/faction_jet_rus_1794903017488.jpg',
  ukraine: '/src/assets/images/faction_jet_rus_1794903017488.jpg',
  uk: '/src/assets/images/faction_jet_delta_1794903018622.jpg',
  china: '/src/assets/images/faction_jet_delta_1794903018622.jpg',
  indonesia: '/src/assets/images/faction_jet_delta_1794903018622.jpg',
};

export const FACTION_TINTS: Record<FactionId, { soldierTint: string; vehicleTint: string; buildingTint: string }> = {
  usa: { soldierTint: '#84a98c', vehicleTint: '#b7a98a', buildingTint: '#64748b' },
  china: { soldierTint: '#4d7c0f', vehicleTint: '#3f6212', buildingTint: '#475569' },
  russia: { soldierTint: '#365314', vehicleTint: '#2f4f2f', buildingTint: '#57534e' },
  indonesia: { soldierTint: '#15803d', vehicleTint: '#3b6e3b', buildingTint: '#78716c' },
  japan: { soldierTint: '#4b5563', vehicleTint: '#52606d', buildingTint: '#334155' },
  ukraine: { soldierTint: '#65a30d', vehicleTint: '#848c4a', buildingTint: '#0369a1' },
  uk: { soldierTint: '#6b705c', vehicleTint: '#8c8369', buildingTint: '#1e3a8a' },
  south_korea: { soldierTint: '#475569', vehicleTint: '#5c6b57', buildingTint: '#0f766e' },
};

export function getFactionUnitSpriteUrl(factionId: FactionId, unitType: UnitTypeId): string {
  if (unitType === 'battle_tank') return FACTION_TANK_URLS[factionId] ?? UNIT_SPRITE_URLS.battle_tank;
  if (unitType === 'strike_fighter') return FACTION_JET_URLS[factionId] ?? UNIT_SPRITE_URLS.strike_fighter;
  return UNIT_SPRITE_URLS[unitType];
}

/**
 * Rotation offsets (radians) so sprite nose/barrel aligns with engine heading (0 = facing right).
 * Up-facing top-down sprites require +PI/2; down-facing requires -PI/2; right-facing requires 0.
 */
export const UNIT_SPRITE_ROTATION_OFFSET: Record<UnitTypeId, number> = {
  battle_tank: Math.PI / 2,
  rocket_artillery: Math.PI / 2,
  engineer_harvester: Math.PI / 2,
  apc_ifv: Math.PI / 2,
  heavy_siege_tank: -Math.PI / 2,
  attack_helicopter: Math.PI / 2,
  strike_fighter: Math.PI / 2,
  anti_air_tank: 0, // Side profile: flipped horizontally rather than full 360 rotation
  rifle_squad: 0,
  heavy_mg: 0,
  recon_sniper: 0,
};

export const PROP_SPRITE_URLS = {
  tree: '/src/assets/images/prop_tree_1794837254208.jpg',
  ore: '/src/assets/images/prop_ore_1794837255165.jpg',
  geothermal: '/src/assets/images/prop_geothermal_1794837280153.jpg',
};

/**
 * Pure helper to determine target alpha (0..255) for a border-connected
 * dark-matte background pixel, preserving crisp anti-aliased silhouettes.
 */
export function computeDarkMatteAlpha(r: number, g: number, b: number, isBorderBg: boolean): number {
  if (!isBorderBg) return 255;
  const lum = Math.max(r, g, b);
  if (lum <= 18) return 0;
  if (lum >= 46) return 255;
  return Math.round(((lum - 18) / (46 - 18)) * 255);
}

const MAX_CONCURRENT_LOADS = 6;

class SpriteAssetStore {
  private rawImages = new Map<string, HTMLImageElement>();
  private loadingUrls = new Set<string>();
  private pendingQueue: string[] = [];
  private activeLoads = 0;
  private cutoutCache = new Map<string, HTMLCanvasElement>();
  private tintedCache = new Map<string, HTMLCanvasElement>();
  private listeners = new Set<(url: string) => void>();

  public subscribe(cb: (url: string) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(url: string) {
    for (const cb of this.listeners) cb(url);
  }

  /** Preload only assets needed for the active battle map, player HQ theme & active factions */
  public preloadBattle(biome: BiomeId, buildingTheme: string, factionIds: FactionId[] = []) {
    const hqUrl = BUILDING_THEME_HQ_URLS[buildingTheme] ?? BUILDING_THEME_HQ_URLS.standard;
    const factionUrls = factionIds.flatMap((fid) => [FACTION_TANK_URLS[fid], FACTION_JET_URLS[fid]]);
    const urls = [
      TERRAIN_TEXTURES[biome],
      hqUrl,
      ...Object.values(BUILDING_SPRITE_URLS),
      ...Object.values(UNIT_SPRITE_URLS),
      ...Object.values(PROP_SPRITE_URLS),
      ...factionUrls,
    ];
    for (const url of urls) {
      if (url) this.requestRaw(url);
    }
  }

  /** Preload only the 5 sprites required for Customizer diorama */
  public preloadDiorama(buildingTheme: string) {
    const hqUrl = BUILDING_THEME_HQ_URLS[buildingTheme] ?? BUILDING_THEME_HQ_URLS.standard;
    const urls = [
      TERRAIN_TEXTURES.temperate,
      hqUrl,
      UNIT_SPRITE_URLS.battle_tank,
      UNIT_SPRITE_URLS.rifle_squad,
      UNIT_SPRITE_URLS.heavy_mg,
    ];
    for (const url of urls) {
      this.requestRaw(url);
    }
  }

  public preloadAll() {
    const urls = [
      ...Object.values(TERRAIN_TEXTURES),
      ...Object.values(BUILDING_SPRITE_URLS),
      ...Object.values(BUILDING_THEME_HQ_URLS),
      ...Object.values(UNIT_SPRITE_URLS),
      ...Object.values(FACTION_TANK_URLS),
      ...Object.values(FACTION_JET_URLS),
      ...Object.values(PROP_SPRITE_URLS),
    ];
    for (const url of urls) {
      this.requestRaw(url);
    }
  }

  public getRawImage(url: string): HTMLImageElement | null {
    const img = this.rawImages.get(url);
    if (img && img.complete && img.naturalWidth > 0) return img;
    this.requestRaw(url);
    return null;
  }

  private requestRaw(url: string) {
    if (typeof Image === 'undefined') return;
    if (this.rawImages.has(url) || this.loadingUrls.has(url)) return;
    if (this.pendingQueue.includes(url)) return;
    this.pendingQueue.push(url);
    this.pumpQueue();
  }

  private pumpQueue() {
    while (this.activeLoads < MAX_CONCURRENT_LOADS && this.pendingQueue.length > 0) {
      const url = this.pendingQueue.shift()!;
      if (this.rawImages.has(url) || this.loadingUrls.has(url)) continue;
      this.loadingUrls.add(url);
      this.activeLoads += 1;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      const finish = (ok: boolean) => {
        this.loadingUrls.delete(url);
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        if (ok) {
          this.rawImages.set(url, img);
          this.notify(url);
        }
        this.pumpQueue();
      };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.src = url;
    }
  }

  /**
   * Returns a cached offscreen HTMLCanvasElement with the pure black studio background
   * flood-filled out from edges & tight-cropped to the opaque silhouette.
   */
  public getCutoutSprite(url: string, targetSize = 180): HTMLCanvasElement | null {
    const img = this.getRawImage(url);
    if (!img || typeof document === 'undefined') return null;

    const size = Math.min(targetSize, Math.max(64, img.naturalWidth || targetSize));
    const key = `${url}::${size}`;
    const cached = this.cutoutCache.get(key);
    if (cached) return cached;

    const work = document.createElement('canvas');
    work.width = size;
    work.height = size;
    const wctx = work.getContext('2d', { willReadFrequently: true });
    if (!wctx) return null;

    wctx.drawImage(img, 0, 0, size, size);
    const imgData = wctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    const total = size * size;
    const visited = new Uint8Array(total);
    const isBorderBg = new Uint8Array(total);

    // BFS flood-fill starting along all 4 image edges on dark pixels (lum < 44)
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const tryPush = (idx: number) => {
      if (visited[idx]) return;
      const p = idx * 4;
      const lum = Math.max(data[p], data[p + 1], data[p + 2]);
      if (lum < 44) {
        visited[idx] = 1;
        isBorderBg[idx] = 1;
        queue[tail++] = idx;
      }
    };

    for (let x = 0; x < size; x++) {
      tryPush(x);
      tryPush((size - 1) * size + x);
    }
    for (let y = 0; y < size; y++) {
      tryPush(y * size);
      tryPush(y * size + (size - 1));
    }

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % size;
      const y = (idx / size) | 0;
      if (x > 0) tryPush(idx - 1);
      if (x < size - 1) tryPush(idx + 1);
      if (y > 0) tryPush(idx - size);
      if (y < size - 1) tryPush(idx + size);
    }

    // Apply edge transparency + compute tight crop bounds
    let minX = size;
    let minY = size;
    let maxX = -1;
    let maxY = -1;

    for (let i = 0; i < total; i++) {
      const p = i * 4;
      const alpha = computeDarkMatteAlpha(data[p], data[p + 1], data[p + 2], isBorderBg[i] === 1);
      data[p + 3] = alpha;
      if (alpha > 20) {
        const x = i % size;
        const y = (i / size) | 0;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    wctx.putImageData(imgData, 0, 0);

    if (maxX <= minX || maxY <= minY) {
      this.cutoutCache.set(key, work);
      return work;
    }

    const pad = 2;
    const cx = Math.max(0, minX - pad);
    const cy = Math.max(0, minY - pad);
    const cw = Math.min(size - cx, maxX - minX + 1 + pad * 2);
    const ch = Math.min(size - cy, maxY - minY + 1 + pad * 2);

    const cropped = document.createElement('canvas');
    cropped.width = cw;
    cropped.height = ch;
    const cctx = cropped.getContext('2d');
    if (cctx) {
      cctx.drawImage(work, cx, cy, cw, ch, 0, 0, cw, ch);
    }

    this.cutoutCache.set(key, cropped);
    return cropped;
  }

  /**
   * Returns a subtly faction/camo-tinted cutout sprite so units & buildings
   * preserve photorealistic PBR shading while clearly reading player/enemy/skin colors.
   */
  public getTintedCutoutSprite(
    url: string,
    tintHex: string | null,
    tintAlpha = 0.24,
    targetSize = 180
  ): HTMLCanvasElement | null {
    const base = this.getCutoutSprite(url, targetSize);
    if (!base) return null;
    if (!tintHex || tintAlpha <= 0) return base;

    const key = `${url}::${targetSize}::${tintHex}::${tintAlpha.toFixed(2)}`;
    const existing = this.tintedCache.get(key);
    if (existing) return existing;

    const out = document.createElement('canvas');
    out.width = base.width;
    out.height = base.height;
    const ctx = out.getContext('2d');
    if (!ctx) return base;

    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = tintAlpha;
    ctx.fillStyle = tintHex;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    this.tintedCache.set(key, out);
    return out;
  }
}

export const spriteStore = new SpriteAssetStore();
