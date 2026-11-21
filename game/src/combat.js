// KOTA MENTARI — modul tempur: pukul dan tembak.
// Pukul F jarak dekat, tembak klik mouse ke musuh terdekat dalam
// kerucut depan. Tembak polisi menaikkan wanted +1.
// Ganti senjata 1 tinju, 2 pistol. Hadiah misi ditambah ke uang PEMAIN.

import * as ConfigMod from './config.js';
import { isPressed, isMouseClicked } from './input.js';

function cfgVal(names, fallback) {
  const sources = [ConfigMod, ConfigMod.default, ConfigMod.CONFIG, ConfigMod.GameConfig];
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const name of names) {
      const value = src[name];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
  }
  return fallback;
}

const PUNCH_DAMAGE = cfgVal(['PUNCH_DAMAGE', 'punchDamage'], 25);
const PUNCH_RANGE = cfgVal(['PUNCH_RANGE', 'punchRange'], 2.4);
const PUNCH_COOLDOWN = cfgVal(['PUNCH_COOLDOWN', 'punchCooldown'], 0.45);
const PUNCH_ARC = cfgVal(['PUNCH_ARC', 'punchArc'], 1.2);
const SHOOT_DAMAGE = cfgVal(['SHOOT_DAMAGE', 'shootDamage'], 34);
const SHOOT_RANGE = cfgVal(['SHOOT_RANGE', 'shootRange'], 60);
const SHOOT_COOLDOWN = cfgVal(['SHOOT_COOLDOWN', 'shootCooldown'], 0.28);
const SHOOT_ARC = cfgVal(['SHOOT_ARC', 'shootArc'], 0.45);

export function createCombatState() {
  return {
    weapon: 'Tinju',
    punchTimer: 0,
    shootTimer: 0,
    punchesThrown: 0,
    shotsFired: 0,
    kills: 0,
  };
}

export function setWeapon(state, player, weapon) {
  if (!state) return weapon;
  const value = weapon === 'Pistol' ? 'Pistol' : 'Tinju';
  state.weapon = value;
  if (player) player.weapon = value;
  return value;
}

export function getWeapon(state) {
  if (!state) return 'Tinju';
  return state.weapon || 'Tinju';
}

export function addMissionReward(player, amount) {
  if (!player) return 0;
  const value = typeof amount === 'number' ? amount : 0;
  player.uang += value;
  return player.uang;
}

function normAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function nearestInCone(player, targets, range, arc) {
  if (!player || !Array.isArray(targets)) return null;
  let best = null;
  let bestDist = range;
  for (const target of targets) {
    if (!target || target.dead) continue;
    const tx = typeof target.x === 'number' ? target.x : 0;
    const tz = typeof target.z === 'number' ? target.z : 0;
    const dx = tx - player.x;
    const dz = tz - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range) continue;
    if (dist > 0.01) {
      const angleTo = Math.atan2(dx, dz);
      const diff = Math.abs(normAngle(angleTo - player.angle));
      if (diff > arc) continue;
    }
    if (dist <= bestDist) {
      bestDist = dist;
      best = target;
    }
  }
  return best;
}

function raiseWantedOnce(ctx, amount) {
  if (!ctx || typeof ctx.addWanted !== 'function') return;
  try {
    ctx.addWanted(amount || 1);
  } catch (err) {
    // Wanted gagal naik tidak boleh mematikan tempur.
  }
}

export function damageEnemy(enemy, amount, ctx) {
  if (!enemy || enemy.dead) return false;
  const value = typeof amount === 'number' ? amount : 0;
  const health = typeof enemy.health === 'number' ? enemy.health : 100;
  enemy.health = health - value;
  if (enemy.health > 0) return false;
  enemy.health = 0;
  enemy.dead = true;
  if (ctx && typeof ctx.onEnemyDefeated === 'function') {
    try {
      ctx.onEnemyDefeated(enemy);
    } catch (err) {
      // Penanda kalah tetap tercatat; handler misi tidak boleh mematikan tempur.
    }
  }
  return true;
}

export function damagePolice(unit, amount, ctx) {
  if (!unit || unit.dead) return false;
  const value = typeof amount === 'number' ? amount : 0;
  const health = typeof unit.health === 'number' ? unit.health : 100;
  unit.health = health - value;
  if (unit.health > 0) return false;
  unit.health = 0;
  unit.dead = true;
  if (ctx && typeof ctx.onPoliceDown === 'function') {
    try {
      ctx.onPoliceDown(unit);
    } catch (err) {
      // Abaikan.
    }
  }
  return true;
}

export function tryPunch(state, player, enemies, policeUnits, ctx) {
  if (!state || !player) return false;
  if (state.punchTimer > 0) return false;
  state.punchTimer = PUNCH_COOLDOWN;
  state.punchesThrown += 1;
  const enemy = nearestInCone(player, enemies, PUNCH_RANGE, PUNCH_ARC);
  if (enemy) {
    const killed = damageEnemy(enemy, PUNCH_DAMAGE, ctx);
    if (killed) state.kills += 1;
    if (ctx && typeof ctx.playPunch === 'function') {
      try {
        ctx.playPunch();
      } catch (err) {
        // Abaikan.
      }
    }
    return true;
  }
  const officer = nearestInCone(player, policeUnits, PUNCH_RANGE, PUNCH_ARC);
  if (officer) {
    const killed = damagePolice(officer, PUNCH_DAMAGE, ctx);
    if (killed) state.kills += 1;
    raiseWantedOnce(ctx, 1);
    if (ctx && typeof ctx.playPunch === 'function') {
      try {
        ctx.playPunch();
      } catch (err) {
        // Abaikan.
      }
    }
    return true;
  }
  if (ctx && typeof ctx.playPunch === 'function') {
    try {
      ctx.playPunch();
    } catch (err) {
      // Abaikan.
    }
  }
  return false;
}

export function tryShoot(state, player, enemies, policeUnits, ctx) {
  if (!state || !player) return false;
  if (state.shootTimer > 0) return false;
  state.shootTimer = SHOOT_COOLDOWN;
  state.shotsFired += 1;
  if (ctx && typeof ctx.playShoot === 'function') {
    try {
      ctx.playShoot();
    } catch (err) {
      // Abaikan.
    }
  }
  const enemy = nearestInCone(player, enemies, SHOOT_RANGE, SHOOT_ARC);
  if (enemy) {
    const killed = damageEnemy(enemy, SHOOT_DAMAGE, ctx);
    if (killed) state.kills += 1;
    return true;
  }
  const officer = nearestInCone(player, policeUnits, SHOOT_RANGE, SHOOT_ARC);
  if (officer) {
    const killed = damagePolice(officer, SHOOT_DAMAGE, ctx);
    if (killed) state.kills += 1;
    raiseWantedOnce(ctx, 1);
    return true;
  }
  return false;
}

export function updateCombat(state, dt, player, ctx) {
  if (!state || !player) return state;
  if (typeof dt === 'number' && dt > 0) {
    if (state.punchTimer > 0) state.punchTimer -= dt;
    if (state.shootTimer > 0) state.shootTimer -= dt;
  }
  if (isPressed('Digit1')) setWeapon(state, player, 'Tinju');
  if (isPressed('Digit2')) setWeapon(state, player, 'Pistol');
  const enemies = (ctx && Array.isArray(ctx.enemies)) ? ctx.enemies : [];
  const policeUnits = (ctx && Array.isArray(ctx.police)) ? ctx.police : [];
  if (isPressed('KeyF')) {
    tryPunch(state, player, enemies, policeUnits, ctx);
  }
  if (isMouseClicked() && state.weapon === 'Pistol') {
    tryShoot(state, player, enemies, policeUnits, ctx);
  }
  if (player.weapon !== state.weapon) player.weapon = state.weapon;
  return state;
}
