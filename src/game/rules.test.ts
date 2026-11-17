import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETIC_CATALOG, FACTION_SPECS, MAPS, UNIT_SPECS } from './catalog';
import {
  calculateCombatDamage,
  calculateMmrDelta,
  calculatePowerEfficiency,
  clampReplayEvents,
  getRankTierFromMmr,
  getTerrainAt,
  getWeatherModifiers,
  isTerrainPassableForGround,
} from './rules';
import {
  BUILDING_SPRITE_URLS,
  computeDarkMatteAlpha,
  FACTION_JET_URLS,
  FACTION_TANK_URLS,
  UNIT_SPRITE_URLS,
} from './sprites';

test('getTerrainAt detects river impassability and bridge/ford crossings', () => {
  const map = MAPS.iron_valley;
  // Middle of river north
  const river = getTerrainAt(map, 1050, 100);
  assert.equal(river.isWater, true);
  assert.equal(river.isBridge, false);
  assert.equal(isTerrainPassableForGround(map, 1050, 100), false);

  // Steel bridge crossing over river
  const bridge = getTerrainAt(map, 1220, 830);
  assert.equal(bridge.isWater, false);
  assert.equal(bridge.isBridge, true);
  assert.ok(bridge.speedMultiplier > 1);
  assert.equal(isTerrainPassableForGround(map, 1220, 830), true);

  // Shallow ford slows units but is passable
  const ford = getTerrainAt(map, 1050, 320);
  assert.equal(ford.isWater, false);
  assert.equal(ford.isFord, true);
  assert.ok(ford.speedMultiplier < 1);
  assert.equal(isTerrainPassableForGround(map, 1050, 320), true);
});

test('isTerrainPassableForGround blocks pond, 3D tree, and 3D rock obstacles', () => {
  const map = MAPS.iron_valley;
  // Pond (iv_pond1: x 1620..1810, y 310..450)
  const pondSample = getTerrainAt(map, 1700, 380);
  assert.equal(pondSample.isWater, true);
  assert.equal(isTerrainPassableForGround(map, 1700, 380), false);

  // 3D Tree obstacle (iv_t1: x 560..608, y 740..788)
  assert.equal(isTerrainPassableForGround(map, 580, 760), false);

  // 3D Rock boulder (iv_rk1: x 460..518, y 600..652)
  assert.equal(isTerrainPassableForGround(map, 485, 625), false);

  // Open ground near spawn is passable
  assert.equal(isTerrainPassableForGround(map, 260, 1500), true);
});

test('all 6 maps have valid biomes and at least one impassable obstacle (pond/tree/rock)', () => {
  const mapList = Object.values(MAPS);
  assert.equal(mapList.length, 6);
  const expectedBiomes = new Set(['temperate', 'delta', 'alpine', 'desert', 'volcanic', 'jungle']);
  for (const map of mapList) {
    assert.ok(expectedBiomes.has(map.biome), `Invalid biome on ${map.id}`);
    const obstacles = map.zones.filter(
      (z) => z.kind === 'pond' || z.kind === 'tree' || z.kind === 'rock'
    );
    assert.ok(obstacles.length >= 1, `Map ${map.id} missing impassable obstacles`);
  }
});

test('all 8 national factions have distinct special buildings/actions and modern military sprites', () => {
  const factions = Object.values(FACTION_SPECS);
  assert.equal(factions.length, 8);

  const buildingNames = new Set(factions.map((f) => f.specialBuildingName));
  const actionKinds = new Set(factions.map((f) => f.specialActionKind));
  assert.equal(buildingNames.size, 8);
  assert.equal(actionKinds.size, 8);

  for (const [id, url] of Object.entries(BUILDING_SPRITE_URLS)) {
    assert.ok(url.includes('/modern_bld_'), `Building ${id} must use modern sprite: ${url}`);
  }
  for (const [id, url] of Object.entries(UNIT_SPRITE_URLS)) {
    assert.ok(
      url.includes('/modern_') || url.includes('/faction_'),
      `Unit ${id} must use modern/faction sprite: ${url}`
    );
  }
  for (const f of factions) {
    assert.ok(FACTION_TANK_URLS[f.id].includes('/faction_tank_'));
    assert.ok(
      FACTION_JET_URLS[f.id].includes('/modern_jet_') || FACTION_JET_URLS[f.id].includes('/faction_jet_')
    );
  }
});

test('getTerrainAt identifies elevation plateaus, forest cover, and concrete trenches', () => {
  const map = MAPS.iron_valley;
  const plateau = getTerrainAt(map, 600, 400);
  assert.equal(plateau.elevation, 2);

  const forest = getTerrainAt(map, 650, 850);
  assert.equal(forest.coverType, 'light_forest');
  assert.equal(forest.concealment, true);
  assert.equal(forest.defenseBonus, 0.35);

  const trench = getTerrainAt(map, 950, 820);
  assert.equal(trench.coverType, 'heavy_trench');
  assert.equal(trench.defenseBonus, 0.5);
});

test('calculateCombatDamage applies high ground bonus, cover reduction, and suppression penalty', () => {
  const rifle = UNIT_SPECS.rifle_squad;
  const base = calculateCombatDamage({
    spec: rifle,
    targetArmorClass: 'infantry',
    attackerElevation: 1,
    defenderElevation: 1,
    defenderCover: 'none',
    attackerSuppression: 0,
    attackerVeterancy: 0,
  });
  const highGround = calculateCombatDamage({
    spec: rifle,
    targetArmorClass: 'infantry',
    attackerElevation: 2,
    defenderElevation: 1,
    defenderCover: 'none',
    attackerSuppression: 0,
    attackerVeterancy: 0,
  });
  const inTrench = calculateCombatDamage({
    spec: rifle,
    targetArmorClass: 'infantry',
    attackerElevation: 1,
    defenderElevation: 1,
    defenderCover: 'heavy_trench',
    attackerSuppression: 0,
    attackerVeterancy: 0,
  });
  const suppressed = calculateCombatDamage({
    spec: rifle,
    targetArmorClass: 'infantry',
    attackerElevation: 1,
    defenderElevation: 1,
    defenderCover: 'none',
    attackerSuppression: 80,
    attackerVeterancy: 0,
  });

  assert.equal(highGround.highGroundBonus, true);
  assert.equal(highGround.effectiveRangeMult, 1.2);
  assert.ok(highGround.damage > base.damage);
  assert.ok(inTrench.damage < base.damage);
  assert.ok(suppressed.damage < base.damage);
});

test('economy power efficiency scales down cleanly when demand exceeds output', () => {
  assert.equal(calculatePowerEfficiency(20, 15), 1.0);
  assert.equal(calculatePowerEfficiency(10, 20), 0.5);
  assert.equal(calculatePowerEfficiency(0, 25), 0.4);
});

test('MMR ELO & rank tier transitions work accurately', () => {
  assert.equal(getRankTierFromMmr(950), 'Bronze');
  assert.equal(getRankTierFromMmr(1200), 'Silver');
  assert.equal(getRankTierFromMmr(1450), 'Gold');
  assert.equal(getRankTierFromMmr(1650), 'Platinum');
  assert.equal(getRankTierFromMmr(1820), 'Diamond');
  assert.equal(getRankTierFromMmr(2100), 'Grandmaster');

  const upset = calculateMmrDelta(1100, 1500);
  const expected = calculateMmrDelta(1500, 1100);
  assert.ok(upset.winnerGain > expected.winnerGain);
});

test('weather modifiers & replay event clamping respect bounds', () => {
  const rain = getWeatherModifiers('rainstorm');
  assert.ok(rain.visionMult < 1);
  assert.ok(rain.vehicleSpeedMult < 1);

  const huge = Array.from({ length: 1000 }, (_, i) => ({ t: i }));
  const clamped = clampReplayEvents(huge);
  assert.ok(clamped.length <= 400);
  assert.equal(clamped[clamped.length - 1].t, 999);
});

test('computeDarkMatteAlpha strips studio black background while preserving interior shadows', () => {
  assert.equal(computeDarkMatteAlpha(4, 5, 6, true), 0);
  assert.equal(computeDarkMatteAlpha(0, 0, 0, false), 255);
  assert.equal(computeDarkMatteAlpha(80, 90, 100, true), 255);
  const mid = computeDarkMatteAlpha(32, 32, 32, true);
  assert.ok(mid > 0 && mid < 255);
});

test('COSMETIC_CATALOG includes realistic image previews and building themes', () => {
  const buildingThemes = COSMETIC_CATALOG.filter((c) => c.category === 'buildingTheme');
  assert.ok(buildingThemes.length >= 4);
  for (const item of COSMETIC_CATALOG) {
    assert.ok(item.previewImage.startsWith('/src/assets/images/'), `Missing previewImage on ${item.id}`);
  }
});
