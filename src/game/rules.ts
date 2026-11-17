import {
  CoverType,
  GameMapSpec,
  RankTier,
  TerrainZone,
  UnitSpec,
  WeatherType,
} from './types';

export interface TerrainSample {
  elevation: 0 | 1 | 2;
  coverType: CoverType;
  isWater: boolean;
  isBridge: boolean;
  isFord: boolean;
  isRoad: boolean;
  speedMultiplier: number;
  defenseBonus: number; // 0..0.5 damage reduction
  concealment: boolean;
}

export function pointInZone(x: number, y: number, z: TerrainZone): boolean {
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
}

export function getTerrainAt(map: GameMapSpec, x: number, y: number): TerrainSample {
  let elevation: 0 | 1 | 2 = 1;
  let coverType: CoverType = 'none';
  let isWater = false;
  let isBridge = false;
  let isFord = false;
  let isRoad = false;

  for (const z of map.zones) {
    if (!pointInZone(x, y, z)) continue;
    if (z.kind === 'river' || z.kind === 'pond') {
      isWater = true;
      elevation = 0;
    } else if (z.kind === 'bridge') {
      isBridge = true;
      isRoad = true;
      elevation = 1;
    } else if (z.kind === 'ford') {
      isFord = true;
      elevation = 0;
    } else if (z.kind === 'plateau') {
      elevation = 2;
    } else if (z.kind === 'forest') {
      coverType = coverType === 'heavy_trench' ? 'heavy_trench' : 'light_forest';
    } else if (z.kind === 'trench') {
      coverType = 'heavy_trench';
    } else if (z.kind === 'road') {
      isRoad = true;
    }
  }

  // Bridges and fords cross over river rectangles
  if (isBridge || isFord) {
    isWater = false;
  }

  let speedMultiplier = 1.0;
  if (isRoad || isBridge) speedMultiplier = 1.22;
  else if (isFord) speedMultiplier = 0.65;
  else if (coverType === 'light_forest') speedMultiplier = 0.88;

  let defenseBonus = 0;
  if (coverType === 'light_forest') defenseBonus = 0.35;
  if (coverType === 'heavy_trench') defenseBonus = 0.5;

  return {
    elevation,
    coverType,
    isWater,
    isBridge,
    isFord,
    isRoad,
    speedMultiplier,
    defenseBonus,
    concealment: coverType === 'light_forest',
  };
}

export function isTerrainPassableForGround(map: GameMapSpec, x: number, y: number): boolean {
  const terrain = getTerrainAt(map, x, y);
  if (terrain.isWater && !terrain.isBridge && !terrain.isFord) return false;
  for (const z of map.zones) {
    if ((z.kind === 'tree' || z.kind === 'rock' || z.kind === 'plateau') && pointInZone(x, y, z)) {
      if (terrain.isRoad || terrain.isBridge || terrain.isFord) continue;
      return false;
    }
  }
  return true;
}

export interface WeatherModifiers {
  visionMult: number;
  vehicleSpeedMult: number;
  ambientDarkness: number; // 0..0.45
  label: string;
}

export function getWeatherModifiers(weather: WeatherType): WeatherModifiers {
  switch (weather) {
    case 'clear':
      return { visionMult: 1.0, vehicleSpeedMult: 1.0, ambientDarkness: 0, label: 'Cerah · Siang' };
    case 'dusk':
      return { visionMult: 0.92, vehicleSpeedMult: 1.0, ambientDarkness: 0.16, label: 'Senja Taktis' };
    case 'rainstorm':
      return { visionMult: 0.78, vehicleSpeedMult: 0.86, ambientDarkness: 0.25, label: 'Hujan Badai' };
    case 'fog_night':
      return { visionMult: 0.7, vehicleSpeedMult: 0.94, ambientDarkness: 0.36, label: 'Kabut Malam' };
    case 'snow_squall':
      return { visionMult: 0.75, vehicleSpeedMult: 0.84, ambientDarkness: 0.18, label: 'Badai Salju' };
  }
}

export interface CombatCalculationInput {
  spec: UnitSpec;
  targetArmorClass: UnitSpec['armorClass'] | 'building';
  attackerElevation: number;
  defenderElevation: number;
  defenderCover: CoverType;
  attackerSuppression: number;
  attackerVeterancy: number;
}

export function calculateCombatDamage(input: CombatCalculationInput): {
  damage: number;
  effectiveRangeMult: number;
  highGroundBonus: boolean;
} {
  const {
    spec,
    targetArmorClass,
    attackerElevation,
    defenderElevation,
    defenderCover,
    attackerSuppression,
    attackerVeterancy,
  } = input;

  let mult = 1.0;

  // Armor vs weapon effectiveness
  if (targetArmorClass === 'heavy') {
    mult *= spec.antiArmorMult;
  } else if (targetArmorClass === 'light') {
    mult *= Math.max(0.75, spec.antiArmorMult * 0.95);
  } else if (targetArmorClass === 'building') {
    mult *= spec.isVehicle ? 1.15 : 0.75;
  }

  // Elevation high-ground tactical advantage
  const highGroundBonus = attackerElevation > defenderElevation;
  const effectiveRangeMult = highGroundBonus ? 1.2 : 1.0;
  if (highGroundBonus) {
    mult *= 1.15;
  }

  // Cover reduction applies mostly to infantry
  if (targetArmorClass === 'infantry') {
    if (defenderCover === 'light_forest') mult *= 0.65;
    if (defenderCover === 'heavy_trench') mult *= 0.5;
  }

  // Suppression degrades attacker fire effectiveness
  if (attackerSuppression >= 70) {
    mult *= 0.55;
  } else if (attackerSuppression >= 35) {
    mult *= 0.8;
  }

  // Veterancy bonus (+8% per level up to 3)
  mult *= 1 + Math.min(3, attackerVeterancy) * 0.08;

  return {
    damage: Math.max(1, Math.round(spec.damage * mult)),
    effectiveRangeMult,
    highGroundBonus,
  };
}

export function calculatePowerEfficiency(energyProduced: number, energyDemand: number): number {
  if (energyDemand <= 0 || energyProduced >= energyDemand) return 1.0;
  return Math.max(0.4, Number((energyProduced / energyDemand).toFixed(2)));
}

export function getRankTierFromMmr(mmr: number): RankTier {
  if (mmr >= 2000) return 'Grandmaster';
  if (mmr >= 1750) return 'Diamond';
  if (mmr >= 1500) return 'Platinum';
  if (mmr >= 1300) return 'Gold';
  if (mmr >= 1100) return 'Silver';
  return 'Bronze';
}

export function calculateMmrDelta(winnerMmr: number, loserMmr: number): { winnerGain: number; loserLoss: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserMmr - winnerMmr) / 400));
  const kFactor = 32;
  const winnerGain = Math.max(8, Math.round(kFactor * (1 - expectedWinner)));
  const loserLoss = Math.max(6, Math.round(winnerGain * 0.85));
  return { winnerGain, loserLoss };
}

export function sanitizeCommanderName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, 32);
  return cleaned.length >= 2 ? cleaned : 'Komandan Baru';
}

export function clampReplayEvents<T>(events: T[]): T[] {
  if (events.length <= 380) return events;
  const step = Math.ceil(events.length / 380);
  const reduced: T[] = [];
  for (let i = 0; i < events.length; i += step) {
    reduced.push(events[i]);
  }
  const last = events[events.length - 1];
  if (reduced[reduced.length - 1] !== last && reduced.length < 400) {
    reduced.push(last);
  }
  return reduced.slice(0, 400);
}
