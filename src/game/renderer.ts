import { BUILDING_SPECS, COSMETIC_CATALOG, UNIT_SPECS } from './catalog';
import { RtsEngine } from './engine';
import { getWeatherModifiers } from './rules';
import {
  BUILDING_SPRITE_URLS,
  BUILDING_THEME_HQ_URLS,
  FACTION_TINTS,
  PROP_SPRITE_URLS,
  TERRAIN_TEXTURES,
  UNIT_SPRITE_ROTATION_OFFSET,
  getFactionUnitSpriteUrl,
  spriteStore,
} from './sprites';
import { Building, BuildingTypeId, FactionId, FactionSide, GameMapSpec, Squad, TerrainZone } from './types';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface PlacementGhost {
  type: BuildingTypeId;
  worldX: number;
  worldY: number;
  valid: boolean;
}

export function getCamoColors(camoId: string): { primary: string; secondary: string } {
  const found = COSMETIC_CATALOG.find((c) => c.category === 'camoPalette' && c.value === camoId);
  return {
    primary: found?.swatchHex ?? '#3b82f6',
    secondary: found?.secondaryHex ?? '#1e3a8a',
  };
}

export function getBuildingThemeTint(themeId: string): { primary: string; tint: string; tintAlpha: number } {
  if (themeId === 'bastion') return { primary: '#f59e0b', tint: '#78716c', tintAlpha: 0.14 };
  if (themeId === 'obsidian') return { primary: '#eab308', tint: '#18181b', tintAlpha: 0.28 };
  if (themeId === 'arctic') return { primary: '#38bdf8', tint: '#e2e8f0', tintAlpha: 0.22 };
  return { primary: '#3b82f6', tint: '#1e3a8a', tintAlpha: 0.1 };
}

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class RtsRenderer {
  private terrainCache: HTMLCanvasElement | null = null;
  private cachedMapId: string | null = null;
  private terrainCacheDirty = true;
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogImageData: ImageData | null = null;
  private lastFogVersion = -1;
  private rainDrops: Array<{ x: number; y: number; len: number; spd: number }> = [];

  private activeTerrainUrl: string | null = null;
  private preloadedKey: string | null = null;

  constructor() {
    spriteStore.subscribe((url) => {
      if (url === this.activeTerrainUrl || url === PROP_SPRITE_URLS.tree) {
        this.terrainCacheDirty = true;
      }
    });
    for (let i = 0; i < 140; i++) {
      this.rainDrops.push({
        x: Math.random() * 1600,
        y: Math.random() * 1000,
        len: 14 + Math.random() * 18,
        spd: 520 + Math.random() * 240,
      });
    }
  }

  private ensureTerrainCache(map: GameMapSpec) {
    this.activeTerrainUrl = TERRAIN_TEXTURES[map.biome];
    if (this.terrainCache && this.cachedMapId === map.id && !this.terrainCacheDirty) return;
    this.cachedMapId = map.id;
    this.terrainCacheDirty = false;
    const canvas = document.createElement('canvas');
    canvas.width = map.width;
    canvas.height = map.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette =
      map.biome === 'alpine'
        ? {
            bg: '#262f3b',
            bgDark: '#1c242e',
            patchA: '#323f4d',
            patchB: '#445466',
            snow: 'rgba(226, 232, 240, 0.14)',
            grid: 'rgba(203, 213, 225, 0.06)',
            plateau: '#4b5766',
            plateauRim: '#94a3b8',
            cliff: '#252c35',
            forestFloor: 'rgba(16, 36, 34, 0.52)',
            treeDark: '#132a26',
            treeMid: '#1e423a',
            treeLight: '#336154',
            treeCap: 'rgba(226, 232, 240, 0.25)',
            shore: '#525f69',
            rock: '#64748b',
            waterDeep: '#0b202e',
            waterMid: '#133144',
            waterShallow: '#224557',
          }
        : map.biome === 'desert'
        ? {
            bg: '#4b3b28',
            bgDark: '#36291a',
            patchA: '#5e4931',
            patchB: '#6e573b',
            snow: 'rgba(251, 191, 36, 0.08)',
            grid: 'rgba(251, 191, 36, 0.05)',
            plateau: '#7c5836',
            plateauRim: '#b88655',
            cliff: '#422c19',
            forestFloor: 'rgba(61, 56, 30, 0.45)',
            treeDark: '#36411b',
            treeMid: '#4d5d27',
            treeLight: '#6b7e38',
            treeCap: 'rgba(217, 119, 6, 0.12)',
            shore: '#8a7250',
            rock: '#8b5e3c',
            waterDeep: '#0d3b42',
            waterMid: '#155059',
            waterShallow: '#276d73',
          }
        : map.biome === 'volcanic'
        ? {
            bg: '#1c191a',
            bgDark: '#110f10',
            patchA: '#292224',
            patchB: '#382a29',
            snow: 'rgba(249, 115, 22, 0.08)',
            grid: 'rgba(248, 113, 113, 0.05)',
            plateau: '#382f30',
            plateauRim: '#785a53',
            cliff: '#1a1515',
            forestFloor: 'rgba(38, 28, 26, 0.56)',
            treeDark: '#261e1b',
            treeMid: '#3d2c26',
            treeLight: '#593b30',
            treeCap: 'rgba(249, 115, 22, 0.14)',
            shore: '#443532',
            rock: '#574c4a',
            waterDeep: '#b91c1c',
            waterMid: '#ea580c',
            waterShallow: '#f97316',
          }
        : map.biome === 'jungle'
        ? {
            bg: '#16281c',
            bgDark: '#0f1c13',
            patchA: '#1d3625',
            patchB: '#28452e',
            snow: 'rgba(74, 222, 128, 0.07)',
            grid: 'rgba(134, 239, 172, 0.05)',
            plateau: '#364a35',
            plateauRim: '#6d8a64',
            cliff: '#1c291b',
            forestFloor: 'rgba(12, 38, 20, 0.62)',
            treeDark: '#0d2b16',
            treeMid: '#164725',
            treeLight: '#246b38',
            treeCap: 'rgba(134, 239, 172, 0.16)',
            shore: '#5c583e',
            rock: '#57594e',
            waterDeep: '#09313d',
            waterMid: '#0e4754',
            waterShallow: '#1b6470',
          }
        : map.biome === 'delta'
        ? {
            bg: '#1c261f',
            bgDark: '#131b15',
            patchA: '#243328',
            patchB: '#2d3b2b',
            snow: 'rgba(132, 204, 22, 0.06)',
            grid: 'rgba(148, 163, 184, 0.05)',
            plateau: '#3b4235',
            plateauRim: '#7c8570',
            cliff: '#21241c',
            forestFloor: 'rgba(14, 34, 18, 0.56)',
            treeDark: '#102917',
            treeMid: '#194024',
            treeLight: '#2b5e36',
            treeCap: 'rgba(134, 239, 172, 0.12)',
            shore: '#4e543e',
            rock: '#57534e',
            waterDeep: '#0b202e',
            waterMid: '#102838',
            waterShallow: '#224557',
          }
        : {
            bg: '#232a20',
            bgDark: '#191f17',
            patchA: '#2d3728',
            patchB: '#3a392c',
            snow: 'rgba(217, 198, 155, 0.07)',
            grid: 'rgba(217, 198, 155, 0.055)',
            plateau: '#4d4a3f',
            plateauRim: '#8b836f',
            cliff: '#292722',
            forestFloor: 'rgba(16, 33, 18, 0.52)',
            treeDark: '#142a17',
            treeMid: '#214526',
            treeLight: '#36693a',
            treeCap: 'rgba(190, 242, 100, 0.1)',
            shore: '#575344',
            rock: '#6b6659',
            waterDeep: '#0b202e',
            waterMid: '#102838',
            waterShallow: '#224557',
          };

    // 1. Photorealistic AI satellite terrain texture tiled across the whole battlefield
    const terrainImg = spriteStore.getRawImage(TERRAIN_TEXTURES[map.biome]);
    if (terrainImg) {
      const tileSize = 650;
      for (let ty = 0; ty < map.height; ty += tileSize) {
        for (let tx = 0; tx < map.width; tx += tileSize) {
          ctx.drawImage(terrainImg, tx, ty, tileSize, tileSize);
        }
      }
      // Subtle atmospheric cohesion tint so tactical units & projectiles pop crisply
      ctx.fillStyle = 'rgba(10, 14, 18, 0.28)';
      ctx.fillRect(0, 0, map.width, map.height);
    } else {
      const bgGrad = ctx.createRadialGradient(
        map.width * 0.5,
        map.height * 0.5,
        120,
        map.width * 0.5,
        map.height * 0.5,
        map.width * 0.72
      );
      bgGrad.addColorStop(0, palette.bg);
      bgGrad.addColorStop(1, palette.bgDark);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, map.width, map.height);
    }

    // 2. Soft organic soil/moisture shadow washes for depth variation
    for (let i = 0; i < 90; i++) {
      const px = hash2d(i, 1.3) * map.width;
      const py = hash2d(i, 4.7) * map.height;
      const rad = 140 + hash2d(i, 9.1) * 220;
      const rGrad = ctx.createRadialGradient(px, py, rad * 0.1, px, py, rad);
      rGrad.addColorStop(0, i % 2 === 0 ? 'rgba(0,0,0,0.22)' : palette.snow);
      rGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = rGrad;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Micro-terrain props: pebbles, scrub grass tufts & scattered field boulders
    for (let i = 0; i < 620; i++) {
      const px = hash2d(i, 21.1) * map.width;
      const py = hash2d(i, 33.7) * map.height;
      if (i % 4 === 0) {
        // Small field stone cluster
        const r = 3 + hash2d(i, 41.2) * 5;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.beginPath();
        ctx.ellipse(px + 2, py + 2.5, r, r * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.rock;
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.beginPath();
        ctx.arc(px - r * 0.25, py - r * 0.2, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Fine grass/gravel tuft
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.06)' : 'rgba(10, 14, 12, 0.22)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(px - 3, py + 2);
        ctx.lineTo(px - 1, py - 3);
        ctx.moveTo(px, py + 2);
        ctx.lineTo(px + 1, py - 4);
        ctx.moveTo(px + 3, py + 2);
        ctx.lineTo(px + 5, py - 2);
        ctx.stroke();
      }
    }

    // 4. Subtle military sector coordinate grid
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(203, 213, 225, 0.12)';
    for (let gx = 0, col = 0; gx <= map.width; gx += 160, col++) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, map.height);
      ctx.stroke();
      if (col < letters.length) {
        ctx.fillText(`${letters[col]}1`, gx + 6, 14);
      }
    }
    for (let gy = 0, row = 1; gy <= map.height; gy += 160, row++) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(map.width, gy);
      ctx.stroke();
      ctx.fillText(`A${row}`, 6, gy + 14);
    }

    // 5. Base deployment concrete pads around Blue & Red spawns
    [
      { pt: map.blueSpawn, accent: 'rgba(59, 130, 246, 0.28)' },
      { pt: map.redSpawn, accent: 'rgba(239, 68, 68, 0.28)' },
    ].forEach(({ pt, accent }) => {
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.fillStyle = 'rgba(30, 36, 44, 0.65)';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const rad = 148;
        if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
        else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner tactical deck & corner chevrons
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, 118, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });

    // 6. Supply Roads (Gravel berms, tire ruts, convoy centerline, mileposts)
    for (const z of map.zones) {
      if (z.kind !== 'road') continue;
      // Gravel shoulder berm
      ctx.fillStyle = '#2d2a24';
      ctx.fillRect(z.x - 6, z.y - 8, z.w + 12, z.h + 16);
      // Main asphalt / compacted earth bed
      const rGrad = ctx.createLinearGradient(z.x, z.y, z.x, z.y + z.h);
      rGrad.addColorStop(0, '#36332e');
      rGrad.addColorStop(0.5, '#433f38');
      rGrad.addColorStop(1, '#36332e');
      ctx.fillStyle = rGrad;
      ctx.fillRect(z.x, z.y, z.w, z.h);
      // Tire track wear lines
      ctx.strokeStyle = 'rgba(20, 18, 16, 0.42)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(z.x, z.y + z.h * 0.3);
      ctx.lineTo(z.x + z.w, z.y + z.h * 0.3);
      ctx.moveTo(z.x, z.y + z.h * 0.7);
      ctx.lineTo(z.x + z.w, z.y + z.h * 0.7);
      ctx.stroke();
      // Dashed tactical lane marker
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.32)';
      ctx.setLineDash([20, 18]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(z.x, z.y + z.h / 2);
      ctx.lineTo(z.x + z.w, z.y + z.h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Concrete road bollards
      ctx.fillStyle = '#94a3b8';
      for (let bx = z.x + 40; bx < z.x + z.w - 30; bx += 140) {
        ctx.fillRect(bx, z.y - 5, 5, 5);
        ctx.fillRect(bx, z.y + z.h, 5, 5);
      }
    }

    // 7. Rivers & Ponds (Layered shorelines, shallows, deep channel/pool, magma in volcanic)
    for (const z of map.zones) {
      if (z.kind !== 'river') continue;
      ctx.fillStyle = palette.shore;
      ctx.fillRect(z.x - 10, z.y, z.w + 20, z.h);
      ctx.fillStyle = palette.waterShallow;
      ctx.fillRect(z.x - 3, z.y, z.w + 6, z.h);
      const grad = ctx.createLinearGradient(z.x, z.y, z.x + z.w, z.y);
      grad.addColorStop(0, palette.waterMid);
      grad.addColorStop(0.5, palette.waterDeep);
      grad.addColorStop(1, palette.waterMid);
      ctx.fillStyle = grad;
      ctx.fillRect(z.x + 6, z.y, Math.max(10, z.w - 12), z.h);

      for (let ry = z.y + 18; ry < z.y + z.h - 18; ry += 36) {
        const jL = (hash2d(z.x, ry) - 0.5) * 8;
        const jR = (hash2d(z.x + z.w, ry) - 0.5) * 8;
        ctx.fillStyle = palette.rock;
        ctx.beginPath();
        ctx.arc(z.x - 4 + jL, ry, 4 + hash2d(ry, 2) * 4, 0, Math.PI * 2);
        ctx.arc(z.x + z.w + 4 + jR, ry + 12, 3.5 + hash2d(ry, 5) * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 7b. Impassable Ponds / Water Basins
    for (const z of map.zones) {
      if (z.kind !== 'pond') continue;
      const cx = z.x + z.w / 2;
      const cy = z.y + z.h / 2;
      const rx = z.w / 2;
      const ry = z.h / 2;

      // Muddy/rocky outer rim
      ctx.fillStyle = palette.shore;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx + 8, ry + 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Shallow water shelf
      ctx.fillStyle = palette.waterShallow;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx + 2, ry + 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Deep radial basin
      const pGrad = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.15, cx, cy, Math.max(rx, ry));
      pGrad.addColorStop(0, palette.waterDeep);
      pGrad.addColorStop(0.75, palette.waterMid);
      pGrad.addColorStop(1, palette.waterShallow);
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx - 4, ry - 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bank stones & reeds
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * Math.PI * 2 + hash2d(z.x, k) * 0.4;
        const bx = cx + Math.cos(ang) * (rx + 4);
        const by = cy + Math.sin(ang) * (ry + 4);
        ctx.fillStyle = palette.rock;
        ctx.beginPath();
        ctx.arc(bx, by, 4 + hash2d(k, z.y) * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 8. Shallow Fords (Gravel shoals, stepping rocks, depth stakes)
    for (const z of map.zones) {
      if (z.kind !== 'ford') continue;
      const fGrad = ctx.createLinearGradient(z.x, z.y, z.x + z.w, z.y);
      fGrad.addColorStop(0, '#465852');
      fGrad.addColorStop(0.5, '#2b4d59');
      fGrad.addColorStop(1, '#465852');
      ctx.fillStyle = fGrad;
      ctx.fillRect(z.x, z.y, z.w, z.h);

      // Stepping gravel shoals & foam rings
      for (let k = 0; k < 38; k++) {
        const sx = z.x + 12 + hash2d(k, z.x) * Math.max(20, z.w - 24);
        const sy = z.y + 10 + hash2d(k, z.y) * Math.max(20, z.h - 20);
        const rad = 3.5 + hash2d(k, 8.2) * 5;
        ctx.fillStyle = 'rgba(226, 232, 240, 0.16)';
        ctx.beginPath();
        ctx.arc(sx, sy, rad + 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#78716c';
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Crossing guide stakes
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(z.x + 8, z.y + 6, 4, 12);
      ctx.fillRect(z.x + z.w - 12, z.y + 6, 4, 12);
      ctx.fillRect(z.x + 8, z.y + z.h - 18, 4, 12);
      ctx.fillRect(z.x + z.w - 12, z.y + z.h - 18, 4, 12);
    }

    // 9. Steel Truss Bridges (Abutments, cast shadow, steel deck, caution stripes, X-truss)
    for (const z of map.zones) {
      if (z.kind !== 'bridge') continue;
      // Drop shadow onto river below
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(z.x + 8, z.y + 12, z.w, z.h + 4);

      // Concrete bank abutments
      ctx.fillStyle = '#525866';
      ctx.fillRect(z.x - 10, z.y - 6, 24, z.h + 12);
      ctx.fillRect(z.x + z.w - 14, z.y - 6, 24, z.h + 12);

      // Main armored road deck
      const deckGrad = ctx.createLinearGradient(z.x, z.y, z.x, z.y + z.h);
      deckGrad.addColorStop(0, '#334155');
      deckGrad.addColorStop(0.15, '#475569');
      deckGrad.addColorStop(0.85, '#475569');
      deckGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = deckGrad;
      ctx.fillRect(z.x, z.y, z.w, z.h);

      // Steel deck rib joints & tire lanes
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.lineWidth = 2;
      for (let bx = z.x + 20; bx < z.x + z.w; bx += 22) {
        ctx.beginPath();
        ctx.moveTo(bx, z.y + 8);
        ctx.lineTo(bx, z.y + z.h - 8);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
      ctx.fillRect(z.x, z.y + z.h * 0.25, z.w, 12);
      ctx.fillRect(z.x, z.y + z.h * 0.65, z.w, 12);

      // Hazard caution stripes at bridge approaches
      for (let sy = z.y + 6; sy < z.y + z.h - 10; sy += 16) {
        ctx.fillStyle = (Math.floor(sy / 16) % 2 === 0) ? '#f59e0b' : '#18181b';
        ctx.fillRect(z.x + 2, sy, 8, 12);
        ctx.fillRect(z.x + z.w - 10, sy, 8, 12);
      }

      // Steel side girders & riveted X-truss crossbeams
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(z.x, z.y + 3);
      ctx.lineTo(z.x + z.w, z.y + 3);
      ctx.moveTo(z.x, z.y + z.h - 3);
      ctx.lineTo(z.x + z.w, z.y + z.h - 3);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 2.5;
      for (let bx = z.x + 12; bx < z.x + z.w - 32; bx += 36) {
        ctx.beginPath();
        ctx.moveTo(bx, z.y + 5);
        ctx.lineTo(bx + 32, z.y + z.h - 5);
        ctx.moveTo(bx + 32, z.y + 5);
        ctx.lineTo(bx, z.y + z.h - 5);
        ctx.stroke();
        // Rivet nodes
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(bx, z.y + 4, 2.2, 0, Math.PI * 2);
        ctx.arc(bx, z.y + z.h - 4, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 10. Highland Plateaus (Cast shadows, rugged cliff strata, access ramps, contour rings)
    for (const z of map.zones) {
      if (z.kind !== 'plateau') continue;
      // Deep drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.roundRect(z.x + 14, z.y + 16, z.w, z.h, 14);
      ctx.fill();

      // Cliff skirt base
      ctx.fillStyle = palette.cliff;
      ctx.beginPath();
      ctx.roundRect(z.x, z.y, z.w, z.h, 12);
      ctx.fill();

      // Vertical rock strata fissures around cliff skirt
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 2;
      for (let rx = z.x + 18; rx < z.x + z.w - 18; rx += 22) {
        ctx.beginPath();
        ctx.moveTo(rx, z.y + z.h - 16);
        ctx.lineTo(rx + (hash2d(rx, z.y) - 0.5) * 6, z.y + z.h);
        ctx.moveTo(rx, z.y);
        ctx.lineTo(rx + (hash2d(rx, 3) - 0.5) * 5, z.y + 12);
        ctx.stroke();
      }

      // Elevated plateau top surface textured with AI terrain image
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(z.x + 12, z.y + 10, z.w - 24, z.h - 26, 8);
      ctx.clip();
      const plateauTex = spriteStore.getRawImage(this.activeTerrainUrl ?? TERRAIN_TEXTURES.temperate);
      if (plateauTex) {
        ctx.drawImage(plateauTex, z.x, z.y, z.w, z.h);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
        ctx.fillRect(z.x, z.y, z.w, z.h);
      } else {
        ctx.fillStyle = palette.plateau;
        ctx.fillRect(z.x, z.y, z.w, z.h);
      }
      ctx.restore();

      // Top-left sunlit cliff rim
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(z.x + 14, z.y + z.h - 18);
      ctx.lineTo(z.x + 14, z.y + 12);
      ctx.lineTo(z.x + z.w - 14, z.y + 12);
      ctx.stroke();

      // Stone access ramps on left & right sides
      const rampH = 54;
      const rampY = z.y + z.h / 2 - rampH / 2;
      ctx.fillStyle = '#57534e';
      ctx.fillRect(z.x - 4, rampY, 24, rampH);
      ctx.fillRect(z.x + z.w - 20, rampY, 24, rampH);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.5;
      for (let s = 4; s <= 16; s += 6) {
        ctx.beginPath();
        ctx.moveTo(z.x - 2 + s, rampY + 4);
        ctx.lineTo(z.x - 2 + s, rampY + rampH - 4);
        ctx.moveTo(z.x + z.w - 18 + s, rampY + 4);
        ctx.lineTo(z.x + z.w - 18 + s, rampY + rampH - 4);
        ctx.stroke();
      }

      // Inner elevation contour lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(z.x + 28, z.y + 24, z.w - 56, z.h - 54);

      ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.fillText('▲ DATARAN TINGGI (+20% JARAK)', z.x + 34, z.y + 42);
    }

    // 11. Concrete Trenches (Excavated pit, duckboards, brick sandbags, barbed wire, pillboxes)
    for (const z of map.zones) {
      if (z.kind !== 'trench') continue;
      // Outer coiled barbed wire zone
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.38)';
      ctx.lineWidth = 1.2;
      for (let wy = z.y + 8; wy < z.y + z.h - 6; wy += 14) {
        ctx.beginPath();
        ctx.arc(z.x - 6, wy, 5, 0, Math.PI * 2);
        ctx.arc(z.x + z.w + 6, wy, 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Excavated dark mud pit
      ctx.fillStyle = '#17191c';
      ctx.fillRect(z.x, z.y, z.w, z.h);

      // Wooden duckboard walkways inside trench
      ctx.fillStyle = '#4b3b2b';
      for (let dy = z.y + 10; dy < z.y + z.h - 10; dy += 12) {
        ctx.fillRect(z.x + 18, dy, z.w - 36, 7);
      }

      // Concrete retaining wall
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 4;
      ctx.strokeRect(z.x + 5, z.y + 5, z.w - 10, z.h - 10);

      // Individual staggered sandbags along trench parapets
      for (let sy = z.y + 10; sy < z.y + z.h - 14; sy += 13) {
        ctx.fillStyle = (Math.floor(sy) % 2 === 0) ? '#857d6e' : '#71695b';
        ctx.fillRect(z.x + 6, sy, 13, 9);
        ctx.fillRect(z.x + z.w - 19, sy, 13, 9);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(z.x + 6, sy, 13, 9);
        ctx.strokeRect(z.x + z.w - 19, sy, 13, 9);
      }

      // Corner pillboxes
      [
        [z.x + 2, z.y + 2],
        [z.x + z.w - 18, z.y + 2],
        [z.x + 2, z.y + z.h - 18],
        [z.x + z.w - 18, z.y + z.h - 18],
      ].forEach(([px, py]) => {
        ctx.fillStyle = '#475569';
        ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(px + 3, py + 6, 10, 3);
      });
    }

    // 12. Tactical Forest Cover Floors (mossy ground & low brush so 3D tree obstacles stand out distinctly)
    for (const z of map.zones) {
      if (z.kind !== 'forest') continue;
      const fGrad = ctx.createRadialGradient(
        z.x + z.w / 2,
        z.y + z.h / 2,
        20,
        z.x + z.w / 2,
        z.y + z.h / 2,
        Math.max(z.w, z.h) * 0.62
      );
      fGrad.addColorStop(0, palette.forestFloor);
      fGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fGrad;
      ctx.fillRect(z.x - 12, z.y - 12, z.w + 24, z.h + 24);

      const shrubCount = Math.floor((z.w * z.h) / 1450);
      for (let i = 0; i < shrubCount; i++) {
        const rx = hash2d(i * 1.7 + z.x, z.y * 0.3);
        const ry = hash2d(i * 2.9 + z.y, z.x * 0.7);
        const sx = z.x + 16 + rx * Math.max(20, z.w - 32);
        const sy = z.y + 16 + ry * Math.max(20, z.h - 32);
        const rad = 8 + hash2d(sx, sy) * 7;
        ctx.fillStyle = palette.treeDark;
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.treeMid;
        ctx.beginPath();
        ctx.arc(sx - 1.5, sy - 1.5, rad * 0.72, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    this.terrainCache = canvas;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    engine: RtsEngine,
    camera: CameraState,
    viewportW: number,
    viewportH: number,
    selectedIds: Set<string>,
    selectionBox: SelectionBox | null,
    placementGhost: PlacementGhost | null,
    dt: number,
    observerRevealAll = false
  ) {
    const factionValues = Object.values(engine.factions).join(',');
    const preloadKey = `${engine.map.biome}::${engine.playerBuildingTheme}::${factionValues}`;
    if (this.preloadedKey !== preloadKey) {
      this.preloadedKey = preloadKey;
      spriteStore.preloadBattle(engine.map.biome, engine.playerBuildingTheme, Object.values(engine.factions));
    }
    this.ensureTerrainCache(engine.map);

    ctx.save();
    ctx.fillStyle = '#090c10';
    ctx.fillRect(0, 0, viewportW, viewportH);

    // Camera trauma shake
    const shake = engine.cameraTrauma * engine.cameraTrauma;
    const shakeX = shake > 0.001 ? (Math.random() - 0.5) * 16 * shake : 0;
    const shakeY = shake > 0.001 ? (Math.random() - 0.5) * 16 * shake : 0;

    ctx.translate(shakeX, shakeY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    const viewMinX = camera.x;
    const viewMinY = camera.y;
    const viewMaxX = camera.x + viewportW / camera.zoom;
    const viewMaxY = camera.y + viewportH / camera.zoom;

    // 1. Pre-baked terrain (only blit visible camera slice for high FPS)
    if (this.terrainCache) {
      const sx = Math.max(0, Math.floor(camera.x));
      const sy = Math.max(0, Math.floor(camera.y));
      const sw = Math.min(engine.map.width - sx, Math.ceil(viewportW / camera.zoom) + 2);
      const sh = Math.min(engine.map.height - sy, Math.ceil(viewportH / camera.zoom) + 2);
      if (sw > 0 && sh > 0) {
        ctx.drawImage(this.terrainCache, sx, sy, sw, sh, sx, sy, sw, sh);
      }
    }

    // 1b. Animated water/magma ripples inside visible rivers and ponds
    const isVolcanic = engine.map.biome === 'volcanic';
    ctx.strokeStyle = isVolcanic ? 'rgba(253, 186, 116, 0.32)' : 'rgba(125, 211, 252, 0.18)';
    ctx.lineWidth = 1.6;
    const flowOffset = (engine.elapsed * 32) % 64;
    for (const z of engine.map.zones) {
      if (z.kind === 'river') {
        if (z.x + z.w < viewMinX || z.x > viewMaxX || z.y + z.h < viewMinY || z.y > viewMaxY) continue;
        const startY = Math.max(z.y + 12, Math.floor(viewMinY / 64) * 64 + flowOffset);
        const endY = Math.min(z.y + z.h - 12, viewMaxY);
        for (let ry = startY; ry < endY; ry += 64) {
          const rx = z.x + z.w * 0.5 + Math.sin(ry * 0.03) * (z.w * 0.18);
          ctx.beginPath();
          ctx.moveTo(rx - 14, ry - 6);
          ctx.lineTo(rx, ry + 6);
          ctx.lineTo(rx + 14, ry - 6);
          ctx.stroke();
        }
      } else if (z.kind === 'pond') {
        if (z.x + z.w < viewMinX || z.x > viewMaxX || z.y + z.h < viewMinY || z.y > viewMaxY) continue;
        const cx = z.x + z.w / 2;
        const cy = z.y + z.h / 2;
        const phase = (engine.elapsed * 0.65 + z.x * 0.01) % 1;
        ctx.save();
        ctx.globalAlpha = (1 - phase) * 0.35;
        ctx.beginPath();
        ctx.ellipse(cx, cy, (z.w * 0.34) * (0.4 + phase * 0.6), (z.h * 0.32) * (0.4 + phase * 0.6), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2. Vehicle tread marks & multi-ring blast craters
    for (const tm of engine.treadMarks) {
      if (tm.x < viewMinX - 30 || tm.x > viewMaxX + 30 || tm.y < viewMinY - 30 || tm.y > viewMaxY + 30) continue;
      ctx.save();
      ctx.translate(tm.x, tm.y);
      ctx.rotate(tm.heading);
      ctx.fillStyle = `rgba(12, 10, 9, ${tm.alpha})`;
      ctx.fillRect(-5, -tm.width / 2, 10, 4);
      ctx.fillRect(-5, tm.width / 2 - 4, 10, 4);
      ctx.restore();
    }

    for (const c of engine.craters) {
      ctx.fillStyle = `rgba(15, 13, 12, ${c.alpha})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(5, 5, 5, ${c.alpha * 0.85})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(87, 83, 78, ${c.alpha * 0.65})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Photorealistic Resource Nodes (Alloy Ore Quarries & Geothermal Energy Vents)
    const oreSprite = spriteStore.getCutoutSprite(PROP_SPRITE_URLS.ore, 160);
    const geoSprite = spriteStore.getCutoutSprite(PROP_SPRITE_URLS.geothermal, 160);
    for (const n of engine.nodes) {
      if (n.amount <= 0) continue;
      if (n.x < viewMinX - 60 || n.x > viewMaxX + 60 || n.y < viewMinY - 60 || n.y > viewMaxY + 60) continue;
      if (n.kind === 'alloy') {
        if (oreSprite) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.beginPath();
          ctx.arc(n.x + 3, n.y + 4, 28, 0, Math.PI * 2);
          ctx.fill();
          ctx.drawImage(oreSprite, n.x - 30, n.y - 30, 60, 60);
        } else {
          ctx.fillStyle = '#b45309';
          ctx.beginPath();
          ctx.arc(n.x, n.y, 20, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const pulse = 0.75 + Math.sin(engine.elapsed * 3.4 + n.x) * 0.25;
        if (geoSprite) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.beginPath();
          ctx.arc(n.x + 3, n.y + 4, 29, 0, Math.PI * 2);
          ctx.fill();
          ctx.drawImage(geoSprite, n.x - 29, n.y - 29, 58, 58);
          ctx.fillStyle = `rgba(56, 189, 248, ${0.22 * pulse})`;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 13, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#082f49';
          ctx.beginPath();
          ctx.arc(n.x, n.y, 20, 0, Math.PI * 2);
          ctx.fill();
        }
        // Animated rising geothermal steam
        const steamCycle = (engine.elapsed * 0.8 + n.x * 0.01) % 1;
        ctx.fillStyle = `rgba(224, 242, 254, ${(1 - steamCycle) * 0.3})`;
        ctx.beginPath();
        ctx.arc(n.x + Math.sin(engine.elapsed * 2) * 3, n.y - 8 - steamCycle * 22, 5 + steamCycle * 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. Strategic Capture Sectors (Octagonal Command Plaza, Radar Mast, Waving Pennant)
    for (const sec of engine.sectors) {
      const color =
        sec.owner === 'blue' ? '#3b82f6' : sec.owner === 'red' ? '#ef4444' : '#94a3b8';
      const darkColor =
        sec.owner === 'blue' ? 'rgba(37, 99, 235, 0.14)' : sec.owner === 'red' ? 'rgba(220, 38, 38, 0.14)' : 'rgba(148, 163, 184, 0.08)';

      // Perimeter zone fill & dashed border
      ctx.fillStyle = darkColor;
      ctx.beginPath();
      ctx.arc(sec.x, sec.y, sec.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.arc(sec.x, sec.y, sec.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Inner octagonal concrete command plinth
      ctx.fillStyle = '#1e242d';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const px = sec.x + Math.cos(a) * 26;
        const py = sec.y + Math.sin(a) * 26;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Capture progress arc with radial tick gauge
      if (Math.abs(sec.progress) > 2) {
        ctx.strokeStyle = sec.progress > 0 ? '#60a5fa' : '#f87171';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(
          sec.x,
          sec.y,
          sec.radius - 7,
          -Math.PI / 2,
          -Math.PI / 2 + (Math.abs(sec.progress) / 100) * Math.PI * 2
        );
        ctx.stroke();
      }

      // Communications tower mast + guy-wires
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sec.x, sec.y - 34);
      ctx.lineTo(sec.x - 16, sec.y + 8);
      ctx.moveTo(sec.x, sec.y - 34);
      ctx.lineTo(sec.x + 16, sec.y + 8);
      ctx.stroke();

      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(sec.x - 2, sec.y - 36, 4, 36);

      // Waving faction banner
      const wave = Math.sin(engine.elapsed * 5 + sec.x) * 2.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(sec.x + 2, sec.y - 35);
      ctx.lineTo(sec.x + 26, sec.y - 29 + wave);
      ctx.lineTo(sec.x + 2, sec.y - 21);
      ctx.closePath();
      ctx.fill();

      // Military nameplate
      ctx.fillStyle = 'rgba(11, 14, 18, 0.88)';
      ctx.fillRect(sec.x - 74, sec.y + 12, 148, 20);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sec.x - 74, sec.y + 12, 148, 20);
      ctx.fillStyle = '#f1f5f9';
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sec.name, sec.x, sec.y + 26);
    }

    // 5. Selected unit rally lines & range indicators (drawn on ground plane)
    for (const sq of engine.squads) {
      if (!selectedIds.has(sq.id) || sq.hp <= 0) continue;
      if (sq.targetX !== null && sq.targetY !== null) {
        ctx.strokeStyle = sq.attackMoveTarget ? '#ef4444' : '#fbbf24';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(sq.x, sq.y);
        ctx.lineTo(sq.targetX, sq.targetY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = sq.attackMoveTarget ? '#ef4444' : '#fbbf24';
        ctx.beginPath();
        ctx.arc(sq.targetX, sq.targetY, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sq.x, sq.y, UNIT_SPECS[sq.type].range * (sq.elevationState >= 2 ? 1.2 : 1), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 6. 2.5D Y-Sorted Draw Queue: 3D Trees, 3D Rocks, 3D Buildings, and Ground Squads
    type SortableEntity =
      | { sortY: number; kind: 'tree'; zone: TerrainZone }
      | { sortY: number; kind: 'rock'; zone: TerrainZone }
      | { sortY: number; kind: 'building'; b: Building }
      | { sortY: number; kind: 'squad'; sq: Squad };

    const groundEntities: SortableEntity[] = [];

    for (const z of engine.map.zones) {
      if (z.kind !== 'tree' && z.kind !== 'rock') continue;
      if (z.x + z.w < viewMinX - 80 || z.x > viewMaxX + 80 || z.y + z.h < viewMinY - 80 || z.y > viewMaxY + 80) continue;
      groundEntities.push({ sortY: z.y + z.h, kind: z.kind, zone: z });
    }

    for (const b of engine.buildings) {
      if (!observerRevealAll && b.side !== engine.localSide && !engine.isVisibleToLocal(b.x, b.y)) continue;
      const br = BUILDING_SPECS[b.type].radius;
      groundEntities.push({ sortY: b.y + br * 0.7, kind: 'building', b });
    }

    const airSquads: Squad[] = [];
    for (const sq of engine.squads) {
      const visible = observerRevealAll || sq.side === engine.localSide || engine.isVisibleToLocal(sq.x, sq.y);
      if (!visible) continue;
      if (sq.side !== engine.localSide && sq.concealed) continue;
      if (UNIT_SPECS[sq.type].isAir) {
        airSquads.push(sq);
      } else {
        groundEntities.push({ sortY: sq.y + 8, kind: 'squad', sq });
      }
    }

    groundEntities.sort((a, b) => a.sortY - b.sortY);

    for (const item of groundEntities) {
      if (item.kind === 'tree') {
        this.draw3DTreeObstacle(ctx, item.zone, engine.map.biome, engine.elapsed);
      } else if (item.kind === 'rock') {
        this.draw3DRockObstacle(ctx, item.zone, engine.map.biome);
      } else if (item.kind === 'building') {
        this.drawBuilding(ctx, item.b, engine);
      } else {
        const sq = item.sq;
        if (sq.repairTargetId) {
          const ally = engine.squads.find((o) => o.id === sq.repairTargetId && o.hp > 0);
          if (ally) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(sq.x + Math.cos(sq.turretHeading) * 14, sq.y + Math.sin(sq.turretHeading) * 14);
            ctx.lineTo(
              (sq.x + ally.x) / 2 + (Math.random() - 0.5) * 8,
              (sq.y + ally.y) / 2 + (Math.random() - 0.5) * 8
            );
            ctx.lineTo(ally.x, ally.y);
            ctx.stroke();
            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(ally.x, ally.y, 4 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        this.drawSquad(ctx, sq, selectedIds.has(sq.id), engine);
      }
    }

    // 7. Air Force Layer (Helicopters & Fighter Jets fly overhead above trees/buildings)
    for (const sq of airSquads) {
      this.drawSquad(ctx, sq, selectedIds.has(sq.id), engine);
    }

    // 8. Projectiles (AP tank shells, smoking artillery rockets, ballistic tracers)
    for (const prj of engine.projectiles) {
      if (prj.progress < 0) continue;
      const dx = prj.targetX - prj.startX;
      const dy = prj.targetY - prj.startY;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      if (prj.isArtillery) {
        // Rocket body + flame plume + smoke tail
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.38)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(prj.x - ux * 26, prj.y - uy * 26);
        ctx.lineTo(prj.x, prj.y);
        ctx.stroke();

        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(prj.x - ux * 11, prj.y - uy * 11);
        ctx.lineTo(prj.x, prj.y);
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(prj.x, prj.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // High-velocity shell / tracer
        const tailLen = prj.splashRadius > 0 ? 18 : 13;
        ctx.strokeStyle = prj.color;
        ctx.lineWidth = prj.splashRadius > 0 ? 2.8 : 1.8;
        ctx.beginPath();
        ctx.moveTo(prj.x - ux * tailLen, prj.y - uy * tailLen);
        ctx.lineTo(prj.x, prj.y);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(prj.x, prj.y, prj.splashRadius > 0 ? 2.2 : 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 9. Pooled Particles
    for (const p of engine.particles) {
      if (!p.active) continue;
      const alpha = Math.max(0, p.life / p.maxLife);
      if (p.kind === 'ring') {
        const curR = p.size * (1 - alpha * 0.85);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, curR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'text' && p.text) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.font = '700 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // 10. Placement ghost preview
    if (placementGhost) {
      const spec = BUILDING_SPECS[placementGhost.type];
      ctx.fillStyle = placementGhost.valid ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
      ctx.strokeStyle = placementGhost.valid ? '#10b981' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(placementGhost.worldX, placementGhost.worldY, spec.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 11. Fog of War overlay (single fast ImageData drawImage call)
    if (!observerRevealAll) {
      if (!this.fogCanvas || this.fogCanvas.width !== engine.fogCols || this.fogCanvas.height !== engine.fogRows) {
        this.fogCanvas = document.createElement('canvas');
        this.fogCanvas.width = engine.fogCols;
        this.fogCanvas.height = engine.fogRows;
        const fctx = this.fogCanvas.getContext('2d');
        if (fctx) {
          this.fogImageData = fctx.createImageData(engine.fogCols, engine.fogRows);
        }
      }
      const fctx = this.fogCanvas.getContext('2d');
      if (fctx && this.fogImageData) {
        if (this.lastFogVersion !== engine.fogVersion) {
          this.lastFogVersion = engine.fogVersion;
          const pixels = this.fogImageData.data;
          const len = engine.fogGrid.length;
          for (let i = 0; i < len; i++) {
            const state = engine.fogGrid[i];
            const p = i * 4;
            pixels[p] = 8;
            pixels[p + 1] = 11;
            pixels[p + 2] = 15;
            pixels[p + 3] = state === 2 ? 0 : state === 1 ? 94 : 172;
          }
          fctx.putImageData(this.fogImageData, 0, 0);
        }
        const sx = Math.max(0, Math.floor(camera.x));
        const sy = Math.max(0, Math.floor(camera.y));
        const sw = Math.min(engine.map.width - sx, Math.ceil(viewportW / camera.zoom) + 2);
        const sh = Math.min(engine.map.height - sy, Math.ceil(viewportH / camera.zoom) + 2);
        const fx = (sx / engine.map.width) * engine.fogCols;
        const fy = (sy / engine.map.height) * engine.fogRows;
        const fw = (sw / engine.map.width) * engine.fogCols;
        const fh = (sh / engine.map.height) * engine.fogRows;
        if (sw > 0 && sh > 0) {
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(this.fogCanvas, fx, fy, fw, fh, sx, sy, sw, sh);
          ctx.restore();
        }
      }
    }

    ctx.restore();

    // 12. Weather & Time-of-Day screen-space atmospheric pass
    const weatherMod = getWeatherModifiers(engine.weather);
    if (weatherMod.ambientDarkness > 0) {
      ctx.fillStyle = `rgba(8, 14, 24, ${weatherMod.ambientDarkness})`;
      ctx.fillRect(0, 0, viewportW, viewportH);
    }

    if (engine.weather === 'rainstorm' || engine.weather === 'snow_squall') {
      const isSnow = engine.weather === 'snow_squall';
      ctx.strokeStyle = isSnow ? 'rgba(241, 245, 249, 0.5)' : 'rgba(148, 187, 233, 0.35)';
      ctx.lineWidth = isSnow ? 2 : 1.2;
      for (const drop of this.rainDrops) {
        drop.y += (isSnow ? drop.spd * 0.25 : drop.spd) * dt;
        drop.x -= (isSnow ? 45 : 140) * dt;
        if (drop.y > viewportH) {
          drop.y = -20;
          drop.x = Math.random() * (viewportW + 200);
        }
        if (drop.x < 0) drop.x += viewportW;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - (isSnow ? 3 : 8), drop.y + (isSnow ? 4 : drop.len));
        ctx.stroke();
      }
    }

    // 13. Selection marquee box in screen space
    if (selectionBox) {
      const sx = Math.min(selectionBox.startX, selectionBox.endX);
      const sy = Math.min(selectionBox.startY, selectionBox.endY);
      const sw = Math.abs(selectionBox.endX - selectionBox.startX);
      const sh = Math.abs(selectionBox.endY - selectionBox.startY);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
    }
  }

  private draw3DTreeObstacle(ctx: CanvasRenderingContext2D, z: TerrainZone, biome: string, elapsed: number) {
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    const r = Math.max(20, Math.min(z.w, z.h) * 0.52);
    const sway = Math.sin(elapsed * 1.6 + cx * 0.03) * 1.4;

    ctx.save();
    // 1. Cast ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.44)';
    ctx.beginPath();
    ctx.ellipse(cx + 8, cy + 10, r * 1.08, r * 0.72, 0.25, 0, Math.PI * 2);
    ctx.fill();

    // 2. 3D Wooden Trunk Base & Exposed Roots
    ctx.fillStyle = '#452c1a';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.24, cy + r * 0.45);
    ctx.lineTo(cx - r * 0.16, cy - r * 0.35);
    ctx.lineTo(cx + r * 0.16, cy - r * 0.35);
    ctx.lineTo(cx + r * 0.24, cy + r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#634128';
    ctx.fillRect(cx - r * 0.12, cy - r * 0.32, r * 0.1, r * 0.72);

    // 3. Multi-tiered 3D foliage canopy (elevated above trunk)
    const canopyY = cy - r * 0.52;
    const treeSprite = spriteStore.getCutoutSprite(PROP_SPRITE_URLS.tree, 140);
    if (treeSprite) {
      const sz = r * 2.3;
      ctx.drawImage(treeSprite, cx + sway - sz / 2, canopyY - sz / 2, sz, sz);
    } else {
      const cDark = biome === 'alpine' ? '#132a26' : biome === 'desert' ? '#36411b' : '#12351b';
      const cMid = biome === 'alpine' ? '#204a42' : biome === 'desert' ? '#516129' : '#1d542b';
      const cLight = biome === 'alpine' ? '#387064' : biome === 'desert' ? '#6c8037' : '#317843';

      ctx.fillStyle = cDark;
      ctx.beginPath();
      ctx.arc(cx + sway, canopyY + 4, r * 0.96, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cMid;
      ctx.beginPath();
      ctx.arc(cx + sway - 2, canopyY - 2, r * 0.78, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cLight;
      ctx.beginPath();
      ctx.arc(cx + sway - 4, canopyY - 7, r * 0.48, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private draw3DRockObstacle(ctx: CanvasRenderingContext2D, z: TerrainZone, biome: string) {
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    const r = Math.max(20, Math.min(z.w, z.h) * 0.52);

    ctx.save();
    // Cast ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.beginPath();
    ctx.ellipse(cx + 6, cy + 8, r * 1.05, r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();

    const rockSprite = spriteStore.getCutoutSprite(PROP_SPRITE_URLS.ore, 140);
    if (rockSprite) {
      const sz = r * 2.2;
      ctx.drawImage(rockSprite, cx - sz / 2, cy - sz / 2, sz, sz);
    } else {
      const baseCol = biome === 'desert' ? '#6e472b' : biome === 'volcanic' ? '#2d2626' : '#475569';
      ctx.fillStyle = baseCol;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawMiniFlag(ctx: CanvasRenderingContext2D, factionId: FactionId, x: number, y: number, w = 18, h = 12) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    switch (factionId) {
      case 'indonesia':
        ctx.fillStyle = '#ce1126';
        ctx.fillRect(0, 0, w, h / 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, h / 2, w, h / 2);
        break;
      case 'japan':
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#bc002d';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ukraine':
        ctx.fillStyle = '#005bbb';
        ctx.fillRect(0, 0, w, h / 2);
        ctx.fillStyle = '#ffd500';
        ctx.fillRect(0, h / 2, w, h / 2);
        break;
      case 'russia':
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h / 3);
        ctx.fillStyle = '#0039a6';
        ctx.fillRect(0, h / 3, w, h / 3);
        ctx.fillStyle = '#d52b1e';
        ctx.fillRect(0, (h * 2) / 3, w, h / 3);
        break;
      case 'china':
        ctx.fillStyle = '#de2910';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffde00';
        ctx.beginPath();
        ctx.arc(w * 0.24, h * 0.34, 2.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'usa':
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#b22234';
        for (let i = 0; i < 4; i++) ctx.fillRect(0, (i * h) / 3.5, w, h / 7);
        ctx.fillStyle = '#3c3b6e';
        ctx.fillRect(0, 0, w * 0.45, h * 0.55);
        break;
      case 'uk':
        ctx.fillStyle = '#012169';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(w * 0.42, 0, w * 0.16, h);
        ctx.fillRect(0, h * 0.38, w, h * 0.24);
        ctx.fillStyle = '#c8102e';
        ctx.fillRect(w * 0.45, 0, w * 0.1, h);
        ctx.fillRect(0, h * 0.43, w, h * 0.14);
        break;
      case 'south_korea':
      default:
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#cd2e3a';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, h * 0.26, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#0047a0';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, h * 0.26, 0, Math.PI);
        ctx.fill();
        break;
    }
    ctx.strokeRect(0, 0, w, h);
    ctx.restore();
  }

  private drawBuilding(ctx: CanvasRenderingContext2D, b: Building, engine: RtsEngine) {
    const spec = BUILDING_SPECS[b.type];
    const r = spec.radius;
    const isLocal = b.side === engine.localSide;
    const factionId = engine.factions[b.side];
    const factionTint = FACTION_TINTS[factionId];
    const theme = isLocal ? getBuildingThemeTint(engine.playerBuildingTheme) : { primary: '#ef4444', tint: '#991b1b', tintAlpha: 0.24 };
    const camo = isLocal ? getCamoColors(engine.playerCamo) : { primary: '#ef4444', secondary: '#7f1d1d' };
    const opticColor = isLocal ? engine.playerVisorColor : '#ef4444';
    const t = engine.elapsed;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.globalAlpha = b.buildProgress < 1 ? 0.62 + b.buildProgress * 0.38 : 1;

    // 1. Directional ground shadow & 3D extruded reinforced concrete plinth
    ctx.fillStyle = 'rgba(0, 0, 0, 0.54)';
    ctx.beginPath();
    ctx.ellipse(6, 12, r * 1.08, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3D base wall extrusion under building
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.roundRect(-r * 0.88, -r * 0.45, r * 1.76, r * 1.05, 8);
    ctx.fill();
    ctx.strokeStyle = isLocal ? theme.primary : '#ef4444';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 2. Photorealistic 2.5D Modern AI Building Sprite (elevated -8px for 3D depth)
    const spriteUrl =
      b.type === 'hq' && isLocal
        ? BUILDING_THEME_HQ_URLS[engine.playerBuildingTheme] ?? BUILDING_SPRITE_URLS.hq
        : BUILDING_SPRITE_URLS[b.type];

    const tintColor = isLocal ? (engine.playerBuildingTheme === 'standard' ? factionTint.buildingTint : theme.tint) : '#dc2626';
    const tintAmt = isLocal ? theme.tintAlpha : 0.22;
    const spriteCanvas = spriteStore.getTintedCutoutSprite(spriteUrl, tintColor, tintAmt, 240);

    if (spriteCanvas) {
      const drawDim = r * 2.28;
      const aspect = spriteCanvas.width / Math.max(1, spriteCanvas.height);
      const drawW = aspect >= 1 ? drawDim : drawDim * aspect;
      const drawH = aspect >= 1 ? drawDim / aspect : drawDim;
      ctx.drawImage(spriteCanvas, -drawW / 2, -drawH / 2 - 8, drawW, drawH);

      if (b.flashTimer > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.arc(0, -8, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = camo.secondary;
      ctx.strokeStyle = camo.primary;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-r * 0.82, -r * 0.82 - 8, r * 1.64, r * 1.64, 8);
      ctx.fill();
      ctx.stroke();
    }

    // 3. Live mechanical overlays (radar sweep, airfield beacons, power glow, chimney smoke)
    if (b.type === 'hq' || b.type === 'tech_lab' || b.type === 'faction_special') {
      ctx.save();
      ctx.translate(0, -8);
      ctx.rotate(t * (engine.economy[b.side].techUpgrading ? 4.2 : 1.7));
      ctx.strokeStyle = b.type === 'tech_lab' ? 'rgba(56, 189, 248, 0.7)' : opticColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.34, -0.5, 0.5);
      ctx.stroke();
      ctx.restore();

      // Waving National Flag over HQ & Faction Special facility
      if ((b.type === 'hq' || b.type === 'faction_special') && b.buildProgress >= 1) {
        const wave = Math.sin(t * 5 + b.x) * 1.4;
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(r * 0.56, -10);
        ctx.lineTo(r * 0.56, -r * 0.92);
        ctx.stroke();
        this.drawMiniFlag(ctx, factionId, r * 0.56 + 1, -r * 0.92 + wave * 0.35, 20, 13);
      }
    } else if (b.type === 'airfield' && b.buildProgress >= 1) {
      // Runway approach beacons blinking along airfield perimeter
      const blink = Math.sin(t * 6) > 0;
      ctx.fillStyle = blink ? '#f59e0b' : '#78350f';
      [-r * 0.7, 0, r * 0.7].forEach((bx) => {
        ctx.beginPath();
        ctx.arc(bx, -r * 0.46, 2.3, 0, Math.PI * 2);
        ctx.arc(bx, r * 0.28, 2.3, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (b.type === 'power_plant') {
      const glow = 0.35 + Math.sin(t * 4 + b.x) * 0.25;
      ctx.fillStyle = `rgba(56, 189, 248, ${glow})`;
      ctx.beginPath();
      ctx.arc(0, -4, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if ((b.type === 'refinery' || b.type === 'factory') && b.buildProgress >= 1) {
      const smokePhase = (t * 0.7 + b.x * 0.02) % 1;
      ctx.fillStyle = `rgba(203, 213, 225, ${(1 - smokePhase) * 0.25})`;
      ctx.beginPath();
      ctx.arc(r * 0.25, -r * 0.35 - 8 - smokePhase * 18, 4 + smokePhase * 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.type === 'watchtower' && b.buildProgress >= 1) {
      ctx.save();
      ctx.translate(0, -8);
      ctx.rotate(Math.sin(t * 1.4 + b.x) * 0.65);
      ctx.fillStyle = opticColor;
      ctx.beginPath();
      ctx.arc(10, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Construction scaffolding overlay if under construction
    if (b.buildProgress < 1) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(-r + 2, -r - 4, r * 2 - 4, r * 2 - 4);
      ctx.setLineDash([]);
      ctx.fillStyle = '#0b0e12';
      ctx.fillRect(-r, r + 4, r * 2, 5);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-r, r + 4, r * 2 * b.buildProgress, 5);
    }

    // 5. Training queue progress bar
    if (b.queue.length > 0 && b.buildProgress >= 1) {
      const q = b.queue[0];
      const qPct = Math.max(0, Math.min(1, 1 - q.remaining / Math.max(0.1, q.total)));
      ctx.fillStyle = '#0b0e12';
      ctx.fillRect(-r, r + 4, r * 2, 4);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-r, r + 4, r * 2 * qPct, 4);
    }

    // 6. Crisp HP bar
    const hpPct = Math.max(0, b.hp / b.maxHp);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-r, -r - 20, r * 2, 5);
    ctx.fillStyle = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(-r, -r - 20, r * 2 * hpPct, 5);

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawSquad(ctx: CanvasRenderingContext2D, sq: Squad, selected: boolean, engine: RtsEngine) {
    const spec = UNIT_SPECS[sq.type];
    const isLocal = sq.side === engine.localSide;
    const factionId = engine.factions[sq.side];
    const factionTint = FACTION_TINTS[factionId];
    const camo = isLocal ? getCamoColors(engine.playerCamo) : { primary: '#ef4444', secondary: '#991b1b' };
    const visorColor = isLocal ? engine.playerVisorColor : '#ef4444';
    const armorStyle = isLocal ? engine.playerArmorStyle : 'standard';
    const isAir = Boolean(spec.isAir);
    const drawY = isAir ? sq.y - 18 : sq.y;

    ctx.save();
    if (sq.hp <= 0 && sq.koTimer > 0) {
      ctx.globalAlpha = Math.max(0, sq.koTimer / 0.35);
    } else if (sq.concealed && isLocal) {
      ctx.globalAlpha = 0.72;
    }

    // Selection tactical bracket ring
    if (selected) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sq.x, drawY, isAir ? 34 : spec.isVehicle ? 28 : 31, 0, Math.PI * 2);
      ctx.stroke();
    }

    const spriteUrl = getFactionUnitSpriteUrl(factionId, sq.type);
    const rotOffset = UNIT_SPRITE_ROTATION_OFFSET[sq.type] ?? 0;
    const tintHex = isLocal
      ? spec.isVehicle
        ? factionTint.vehicleTint
        : factionTint.soldierTint
      : '#ef4444';
    const tintAlpha = isLocal ? (armorStyle === 'stealth' ? 0.1 : 0.16) : 0.24;
    const unitSprite = spriteStore.getTintedCutoutSprite(spriteUrl, tintHex, tintAlpha, 160);

    if (spec.isVehicle) {
      const recoilKick = sq.recoilTimer ? (sq.recoilTimer / 0.22) * 5 : 0;
      const targetSize =
        sq.type === 'heavy_siege_tank'
          ? 62
          : sq.type === 'strike_fighter'
          ? 64
          : sq.type === 'attack_helicopter'
          ? 60
          : sq.type === 'battle_tank'
          ? 56
          : sq.type === 'rocket_artillery'
          ? 52
          : 50;

      // Ground contact shadow (air units cast distant shadow far below!)
      ctx.fillStyle = isAir ? 'rgba(0, 0, 0, 0.32)' : 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(
        sq.x + (isAir ? 16 : 3),
        sq.y + (isAir ? 24 : 4),
        targetSize * (isAir ? 0.38 : 0.46),
        targetSize * (isAir ? 0.24 : 0.32),
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      const aimAngle = sq.type === 'battle_tank' || sq.type === 'heavy_siege_tank' ? sq.turretHeading : sq.heading;
      ctx.save();
      ctx.translate(sq.x, drawY);

      if (sq.type === 'anti_air_tank') {
        // Side-profile SAM sprite: flip horizontally for facing right vs left instead of rotating upside down
        if (Math.cos(aimAngle) > 0) {
          ctx.scale(-1, 1);
        }
        ctx.rotate(Math.sin(aimAngle) * 0.12);
      } else {
        ctx.rotate(aimAngle + rotOffset);
      }

      // Faction / armor perimeter ring indicator
      if (armorStyle === 'reactive' && !isAir) {
        ctx.strokeStyle = camo.primary;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(-targetSize * 0.36, -targetSize * 0.26, targetSize * 0.72, targetSize * 0.52);
      }

      if (unitSprite) {
        const aspect = unitSprite.width / Math.max(1, unitSprite.height);
        const drawW = aspect >= 1 ? targetSize : targetSize * aspect;
        const drawH = aspect >= 1 ? targetSize / aspect : targetSize;
        ctx.drawImage(unitSprite, -drawW / 2 - recoilKick, -drawH / 2, drawW, drawH);
      } else {
        ctx.fillStyle = camo.secondary;
        ctx.strokeStyle = camo.primary;
        ctx.lineWidth = 2;
        ctx.fillRect(-20 - recoilKick, -13, 40, 26);
        ctx.strokeRect(-20 - recoilKick, -13, 40, 26);
      }

      // Helicopter spinning rotor blades overlay
      if (sq.type === 'attack_helicopter') {
        ctx.save();
        ctx.rotate(engine.elapsed * 22);
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-targetSize * 0.48, 0);
        ctx.lineTo(targetSize * 0.48, 0);
        ctx.moveTo(0, -targetSize * 0.48);
        ctx.lineTo(0, targetSize * 0.48);
        ctx.stroke();
        ctx.restore();
      }

      // Harvester ore cargo bar + beacon light
      if (sq.type === 'engineer_harvester') {
        const fillRatio = Math.min(1, sq.harvestCargo / 60);
        if (fillRatio > 0.02) {
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(-16, -5, 11 * fillRatio, 10);
        }
        const beaconOn = Math.sin(engine.elapsed * 8) > 0;
        ctx.fillStyle = beaconOn ? '#fbbf24' : '#78350f';
        ctx.beginPath();
        ctx.arc(4, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Optic sensor pinpoint
      ctx.fillStyle = visorColor;
      ctx.beginPath();
      ctx.arc(0, -4, 2.0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    } else {
      // Multi-soldier realistic modern infantry sprites in formation
      const isMoving = Math.hypot(sq.vx, sq.vy) > 5;
      const soldierSize = sq.type === 'heavy_mg' ? 24 : 21;

      sq.members.forEach((m) => {
        if (m.hp <= 0) return;
        const bob = isMoving ? Math.sin(m.gaitPhase) * 1.8 : 0;
        const stride = isMoving ? Math.sin(m.gaitPhase) * 0.08 : 0;
        const mx = sq.x + m.offsetX;
        const my = sq.y + m.offsetY + bob;

        ctx.save();
        ctx.translate(mx, my);

        // Ground shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.beginPath();
        ctx.arc(2, 3, 7, 0, Math.PI * 2);
        ctx.fill();

        if (Math.cos(sq.turretHeading) < 0) {
          ctx.scale(-1, 1);
          ctx.rotate(-(stride));
        } else {
          ctx.rotate(stride);
        }

        if (unitSprite) {
          const aspect = unitSprite.width / Math.max(1, unitSprite.height);
          const drawW = aspect >= 1 ? soldierSize : soldierSize * aspect;
          const drawH = aspect >= 1 ? soldierSize / aspect : soldierSize;
          ctx.drawImage(unitSprite, -drawW / 2, -drawH / 2, drawW, drawH);
        } else {
          ctx.fillStyle = camo.secondary;
          ctx.strokeStyle = camo.primary;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        // Glowing tactical visor pinpoint & muzzle flash burst
        ctx.fillStyle = visorColor;
        ctx.beginPath();
        ctx.arc(2.5, -0.5, 1.8, 0, Math.PI * 2);
        ctx.fill();

        if (m.flashTimer > 0) {
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(17, -3.5);
          ctx.lineTo(15, 0);
          ctx.lineTo(17, 3.5);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });
    }

    // Squad overhead tactical bar (HP + Cover badge + Suppression)
    const barW = 36;
    const barY = drawY - (isAir ? 36 : spec.isVehicle ? 28 : 32);
    const hpPct = Math.max(0, sq.hp / sq.maxHp);
    ctx.fillStyle = 'rgba(11, 14, 18, 0.88)';
    ctx.fillRect(sq.x - barW / 2 - 1, barY - 1, barW + 2, 6);
    ctx.fillStyle = isLocal ? '#38bdf8' : '#ef4444';
    ctx.fillRect(sq.x - barW / 2, barY, barW * hpPct, 4);

    if (sq.suppression >= 35) {
      ctx.fillStyle = sq.suppression >= 70 ? '#ef4444' : '#f59e0b';
      ctx.fillRect(sq.x - barW / 2, barY + 5, barW * (sq.suppression / 100), 2);
    }

    if (sq.coverState !== 'none' && !isAir) {
      ctx.fillStyle = sq.coverState === 'heavy_trench' ? '#22c55e' : '#eab308';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(sq.coverState === 'heavy_trench' ? '⛨' : '♣', sq.x + barW / 2 + 8, barY + 5);
    }

    ctx.restore();
  }

  public renderMinimap(
    ctx: CanvasRenderingContext2D,
    engine: RtsEngine,
    camera: CameraState,
    viewportW: number,
    viewportH: number,
    miniW: number,
    miniH: number
  ) {
    ctx.clearRect(0, 0, miniW, miniH);
    ctx.fillStyle = '#11161d';
    ctx.fillRect(0, 0, miniW, miniH);
    if (this.terrainCache) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.terrainCache, 0, 0, miniW, miniH);
      ctx.restore();
    }

    const sx = miniW / engine.map.width;
    const sy = miniH / engine.map.height;

    // Terrain zones
    for (const z of engine.map.zones) {
      if (z.kind === 'river' || z.kind === 'pond') ctx.fillStyle = engine.map.biome === 'volcanic' ? '#b91c1c' : '#1e3a5f';
      else if (z.kind === 'plateau') ctx.fillStyle = '#475569';
      else if (z.kind === 'forest' || z.kind === 'tree') ctx.fillStyle = '#1e3f2b';
      else if (z.kind === 'rock') ctx.fillStyle = '#64748b';
      else if (z.kind === 'bridge') ctx.fillStyle = '#94a3b8';
      else if (z.kind === 'road') ctx.fillStyle = '#44403c';
      else continue;
      ctx.fillRect(z.x * sx, z.y * sy, Math.max(2, z.w * sx), Math.max(2, z.h * sy));
    }

    // Sectors
    for (const sec of engine.sectors) {
      ctx.strokeStyle = sec.owner === 'blue' ? '#3b82f6' : sec.owner === 'red' ? '#ef4444' : '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sec.x * sx, sec.y * sy, 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Buildings & Squads
    for (const b of engine.buildings) {
      if (b.side !== engine.localSide && !engine.isVisibleToLocal(b.x, b.y)) continue;
      ctx.fillStyle = b.side === engine.localSide ? '#38bdf8' : '#ef4444';
      ctx.fillRect(b.x * sx - 2.5, b.y * sy - 2.5, 5, 5);
    }
    for (const sq of engine.squads) {
      if (sq.hp <= 0) continue;
      if (sq.side !== engine.localSide && !engine.isVisibleToLocal(sq.x, sq.y)) continue;
      ctx.fillStyle = sq.side === engine.localSide ? '#93c5fd' : '#fca5a5';
      ctx.fillRect(sq.x * sx - 1.5, sq.y * sy - 1.5, 3, 3);
    }

    // Camera viewport rect
    const viewWorldW = viewportW / camera.zoom;
    const viewWorldH = viewportH / camera.zoom;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(camera.x * sx, camera.y * sy, viewWorldW * sx, viewWorldH * sy);
  }
}
