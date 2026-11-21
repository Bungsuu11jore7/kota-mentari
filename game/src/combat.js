// KOTA MENTARI — modul tempur: pukul (F), tembak (klik mouse),
// ganti senjata (1 tinju, 2 pistol), kerusakan musuh dan polisi.
// Hadiah selalu ditambah ke uang PEMAIN, bukan ke konteks.

import * as configMod from './config.js';
import { isPressed, consumeClick } from './input.js';

function cfgValue(names, fallback) {
  for (const name of names) {
    if (configMod && typeof configMod[name] !== 'undefined') return configMod[name];
    if (configMod && configMod.default && typeof configMod.default[name] !== 'undefined') {
      return configMod.default[name];
    }
  }
  return fallback;
}

const PUNCH_DAMAGE = cfgValue(['PUNCH_DAMAGE', 'punchDamage'], 25);
const PUNCH_RANGE = cfgValue(['PUNCH_RANGE', 'punchRange'], 2.4);
const PUNCH_ARC = cfgValue(['PUNCH_ARC', 'punchArc'], 0.6);
const PUNCH_COOLDOWN = cfgValue(['PUNCH_COOLDOWN', 'punchCooldown'], 0.45);
const SHOOT_DAMAGE = cfgValue(['SHOOT_DAMAGE', 'shootDamage'], 34);
const SHOOT_RANGE = cfgValue(['SHOOT_RANGE', 'shootRange'], 70);
const SHOOT_ARC = cfgValue(['SHOOT_ARC', 'shootArc'], 0.35);
const SHOOT_COOLDOWN = cfgValue(['SHOOT_COOLDOWN', 'shootCooldown'], 0.28);

// Keadaan tempur baru (pewaktu pukul dan tembak).
export function createCombatState() {
  return { punchCooldown: 0, shootCooldown: 0 };
}

const defaultCombat = createCombatState();

function playSound(ctx, name) {
  if (ctx && typeof ctx.playSound === 'function') ctx.playSound(name);
}

function addWanted(ctx, amount) {
  if (ctx && typeof ctx.addWanted === 'function') ctx.addWanted(amount);
}

// Selisih sudut absolut antara arah hadap dan arah ke target (0..PI).
function angleDifference(fromAngle, targetAngle) {
  let diff = targetAngle - fromAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

// Target tempur yang tersedia: penyerang misi + unit polisi.
function collectTargets(ctx) {
  const enemies = [];
  if (ctx) {
    if (Array.isArray(ctx.enemies)) enemies.push(...ctx.enemies);
    if (Array.isArray(ctx.attackers)) {
      for (const attacker of ctx.attackers) {
        if (!enemies.includes(attacker)) enemies.push(attacker);
      }
    }
  }
  let policeUnits = [];
  if (ctx) {
    if (ctx.policeState && Array.isArray(ctx.policeState.units)) {
      policeUnits = ctx.policeState.units;
    } else if (Array.isArray(ctx.police)) {
      policeUnits = ctx.police;
    }
  }
  return { enemies, policeUnits };
}

// Cari target hidup terdekat di dalam kerucut depan pemain.
function nearestInCone(player, candidates, range, arc) {
  let best = null;
  let bestDist = range;
  for (const target of candidates) {
    if (!target || target.dead || target.disabled) continue;
    const health = typeof target.health === 'number' ? target.health : 100;
    if (health <= 0) continue;
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > bestDist) continue;
    const targetAngle = Math.atan2(dx, dz);
    if (angleDifference(player.angle, targetAngle) > arc) continue;
    bestDist = dist;
    best = target;
  }
  return best;
}

// Beri kerusakan pada musuh; bila mati, keluarkan dari daftar konteks.
export function damageEnemy(enemy, amount, ctx) {
  if (!enemy) return false;
  enemy.health = (typeof enemy.health === 'number' ? enemy.health : 100) - amount;
  if (enemy.health <= 0) {
    enemy.health = 0;
    enemy.dead = true;
    // Beri tahu modul misi (Misi 4 menghitung onEnemyDefeated); hook
    // dijaga di missions.js (hanya berlaku saat misi aktif adalah Misi 4).
    if (ctx && typeof ctx.onEnemyDefeated === 'function') {
      ctx.onEnemyDefeated(enemy);
    }
    if (ctx) {
      if (Array.isArray(ctx.enemies)) {
        const index = ctx.enemies.indexOf(enemy);
        if (index >= 0) ctx.enemies.splice(index, 1);
      }
      if (Array.isArray(ctx.attackers)) {
        const index = ctx.attackers.indexOf(enemy);
        if (index >= 0) ctx.attackers.splice(index, 1);
      }
      if (ctx.scene && enemy.mesh) ctx.scene.remove(enemy.mesh);
    }
    return true;
  }
  return false;
}

// Beri kerusakan pada unit polisi; bila roboh, tandai disabled (tanpa mesh).
export function damagePolice(unit, amount, ctx) {
  if (!unit) return false;
  unit.health = (typeof unit.health === 'number' ? unit.health : 100) - amount;
  if (unit.health <= 0) {
    unit.health = 0;
    unit.disabled = true;
    unit.down = true;
    return true;
  }
  return false;
}

// Pukul: musuh/polisi terdekat dalam jarak dekat di depan pemain.
export function tryPunch(player, ctx, combat) {
  const state = combat || defaultCombat;
  if (!player || state.punchCooldown > 0) return false;
  state.punchCooldown = PUNCH_COOLDOWN;
  playSound(ctx, 'punch');
  const { enemies, policeUnits } = collectTargets(ctx);
  const enemy = nearestInCone(player, enemies, PUNCH_RANGE, PUNCH_ARC);
  if (enemy) {
    damageEnemy(enemy, PUNCH_DAMAGE, ctx);
    return true;
  }
  const officer = nearestInCone(player, policeUnits, PUNCH_RANGE, PUNCH_ARC);
  if (officer) {
    damagePolice(officer, PUNCH_DAMAGE, ctx);
    addWanted(ctx, 1);
    return true;
  }
  return false;
}

// Tembak: musuh/polisi terdekat dalam kerucut depan (hanya bila pistol).
export function tryShoot(player, ctx, combat) {
  const state = combat || defaultCombat;
  if (!player || state.shootCooldown > 0) return false;
  if (player.weapon !== 'pistol') return false;
  state.shootCooldown = SHOOT_COOLDOWN;
  playSound(ctx, 'shoot');
  const { enemies, policeUnits } = collectTargets(ctx);
  const enemy = nearestInCone(player, enemies, SHOOT_RANGE, SHOOT_ARC);
  if (enemy) {
    damageEnemy(enemy, SHOOT_DAMAGE, ctx);
    return true;
  }
  const officer = nearestInCone(player, policeUnits, SHOOT_RANGE, SHOOT_ARC);
  if (officer) {
    damagePolice(officer, SHOOT_DAMAGE, ctx);
    addWanted(ctx, 1);
    return true;
  }
  return false;
}

// Ganti senjata aktif pemain ('fists' atau 'pistol').
export function setWeapon(player, weapon, ctx) {
  if (!player) return;
  if (weapon !== 'fists' && weapon !== 'pistol') return;
  player.weapon = weapon;
  if (ctx && typeof ctx.showToast === 'function') {
    ctx.showToast(weapon === 'pistol' ? 'Pistol siap.' : 'Tinju siap.');
  }
}

// Tambah hadiah ke uang PEMAIN (bukan ke konteks).
export function addPlayerReward(player, amount) {
  if (!player) return 0;
  player.uang = (player.uang || 0) + amount;
  return player.uang;
}

// Perbarui tempur tiap frame: ganti senjata, pukul, tembak.
export function updateCombat(combat, player, dt, ctx) {
  const state = combat || defaultCombat;
  if (state.punchCooldown > 0) state.punchCooldown -= dt;
  if (state.shootCooldown > 0) state.shootCooldown -= dt;
  if (!player) return;
  if (isPressed('Digit1')) setWeapon(player, 'fists', ctx);
  if (isPressed('Digit2')) setWeapon(player, 'pistol', ctx);
  if (isPressed('KeyF')) tryPunch(player, ctx, state);
  const click = consumeClick();
  if (click && player.weapon === 'pistol') {
    tryShoot(player, ctx, state);
  }
}
