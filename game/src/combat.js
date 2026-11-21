// KOTA MENTARI — tempur: pukul (F), tembak (klik mouse), ganti senjata
// (1 tinju, 2 pistol), kerusakan musuh/polisi, hadiah misi ke uang pemain.
import { isKeyPressed, consumeClick } from './input.js';
import { addUang } from './player.js';

const PUNCH_RANGE = 2.6;
const PUNCH_DAMAGE = 25;
const SHOT_RANGE = 48;
const SHOT_DAMAGE = 34;
const SHOT_CONE = 0.75;

export function createCombatState() {
  return {
    weapon: 'fists',
    lastPunchAt: -10,
    lastShotAt: -10,
    punchCooldown: 0.45,
    shotCooldown: 0.32,
  };
}

export function setWeapon(state, weapon) {
  if (weapon === 'fists' || weapon === 'pistol') state.weapon = weapon;
  return state.weapon;
}

export function getWeapon(state) {
  return state.weapon;
}

function nowSec() {
  if (typeof performance !== 'undefined') return performance.now() / 1000;
  return Date.now() / 1000;
}

function enemiesOf(ctx) {
  if (ctx && typeof ctx.getEnemies === 'function') {
    try {
      const list = ctx.getEnemies();
      if (Array.isArray(list)) return list;
    } catch (err) { /* abaikan */ }
  }
  return [];
}

// Musuh terdekat di dalam kerucut depan pemain. Arah maju: x dari sinus
// sudut, z dari kosinus sudut.
function nearestInCone(player, list, maxDist, minDot) {
  let best = null;
  let bestD = Infinity;
  const fx = Math.sin(player.angle);
  const fz = Math.cos(player.angle);
  for (const e of list) {
    if (!e || e.dead) continue;
    const dx = e.x - player.x;
    const dz = e.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > maxDist || d < 0.01) continue;
    const dot = (dx * fx + dz * fz) / d;
    if (dot < minDot) continue;
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function playSound(ctx, name) {
  if (!ctx || typeof ctx.playSound !== 'function') return;
  try { ctx.playSound(name); } catch (err) { /* abaikan */ }
}

function raiseWanted(ctx, amount) {
  if (!ctx || typeof ctx.addWanted !== 'function') return;
  try { ctx.addWanted(amount); } catch (err) { /* abaikan */ }
}

export function tryPunch(state, player, ctx) {
  const now = nowSec();
  if (now - state.lastPunchAt < state.punchCooldown) return false;
  state.lastPunchAt = now;
  const target = nearestInCone(player, enemiesOf(ctx), PUNCH_RANGE, 0.2);
  if (!target) {
    playSound(ctx, 'swing');
    return false;
  }
  damageEnemy(target, PUNCH_DAMAGE, ctx);
  if (target.kind === 'police') raiseWanted(ctx, 1);
  playSound(ctx, 'punch');
  return true;
}

export function tryShoot(state, player, ctx) {
  if (state.weapon !== 'pistol') return false;
  const now = nowSec();
  if (now - state.lastShotAt < state.shotCooldown) return false;
  state.lastShotAt = now;
  playSound(ctx, 'shoot');
  const target = nearestInCone(player, enemiesOf(ctx), SHOT_RANGE, SHOT_CONE);
  if (!target) return false;
  damageEnemy(target, SHOT_DAMAGE, ctx);
  if (target.kind === 'police') raiseWanted(ctx, 1);
  return true;
}

export function updateCombat(state, player, dt, ctx) {
  if (!player || player.health <= 0) return;
  if (isKeyPressed('Digit1')) setWeapon(state, 'fists');
  if (isKeyPressed('Digit2')) setWeapon(state, 'pistol');
  if (isKeyPressed('KeyF')) tryPunch(state, player, ctx);
  const click = consumeClick();
  if (click) tryShoot(state, player, ctx);
}

export function damageEnemy(enemy, amount, ctx) {
  if (!enemy || enemy.dead) return false;
  enemy.health = (typeof enemy.health === 'number' ? enemy.health : 100) - amount;
  if (enemy.ref) enemy.ref.health = enemy.health;
  if (enemy.health <= 0) {
    enemy.health = 0;
    enemy.dead = true;
    if (enemy.ref) enemy.ref.dead = true;
    if (enemy.kind === 'attacker' && ctx && typeof ctx.onEnemyDefeated === 'function') {
      try { ctx.onEnemyDefeated(enemy); } catch (err) { /* abaikan */ }
    }
  }
  return true;
}

export function damagePolice(unit, amount, ctx) {
  if (!unit) return false;
  const wrapped = {
    kind: 'police',
    x: unit.x,
    z: unit.z,
    health: unit.health,
    ref: unit,
  };
  return damageEnemy(wrapped, amount, ctx);
}

export function damagePlayer(player, amount) {
  if (!player) return 0;
  player.health = Math.max(0, (player.health ?? 100) - amount);
  return player.health;
}

// Hadiah misi SELALU masuk ke uang PEMAIN, bukan ke konteks.
export function addReward(player, amount) {
  return addUang(player, amount);
}
