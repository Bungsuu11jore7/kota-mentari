// Modul combat — pukulan, tembakan, dan penanganan kerusakan.
// Pukul: tombol F, jarak dekat, kerusakan, jeda singkat.
// Tembak: klik mouse, musuh terdekat dalam kerucut depan, kerusakan.
// Menembak polisi menaikkan wanted +1. Ganti senjata: tombol 1 tinju,
// tombol 2 pistol. Modul ini dipakai modul utama tiap frame dan modul
// misi saat penyerang misi 4 dikalahkan.

import * as Config from './config.js';
import { justPressed, consumeClick } from './input.js';

// Jarak pukul (satuan) dan kerusakan tiap pukulan.
const PUNCH_RANGE = Config.PUNCH_RANGE ?? 2.6;
const PUNCH_DAMAGE = Config.PUNCH_DAMAGE ?? 25;
// Jeda antar pukulan dalam detik.
const PUNCH_COOLDOWN = Config.PUNCH_COOLDOWN ?? 0.45;
// Pukulan hanya mengenai sasaran di depan pemain (setengah lingkaran).
const PUNCH_MIN_DOT = 0.0;

// Jarak tembak, kerusakan tiap peluru, dan jeda antar tembakan.
const GUN_RANGE = Config.GUN_RANGE ?? 70;
const GUN_DAMAGE = Config.GUN_DAMAGE ?? 34;
const GUN_COOLDOWN = Config.GUN_COOLDOWN ?? 0.25;
// Kerucut bidik: sasaran harus cukup lurus di depan pemain.
// Nilai dot 0.88 kira-kira sama dengan sudut 28 derajat dari tengah.
const GUN_MIN_DOT = 0.88;

// Nyawa awal sasaran yang tidak membawa angka nyawa sendiri.
const DEFAULT_TARGET_HEALTH = 100;

// Sisa waktu jeda pukul dan tembak.
let punchTimer = 0;
let gunTimer = 0;

// Ambil posisi {x, z} dari sasaran apa pun bentuknya: vektor tiga
// dimensi, objek polos {x, z}, atau objek dengan mesh.
export function targetPosition(target) {
  if (!target) return null;
  if (target.position && typeof target.position.x === 'number') {
    return { x: target.position.x, z: target.position.z };
  }
  if (typeof target.x === 'number' && typeof target.z === 'number') {
    return { x: target.x, z: target.z };
  }
  if (target.mesh && target.mesh.position) {
    return { x: target.mesh.position.x, z: target.mesh.position.z };
  }
  return null;
}

// True bila sasaran masih hidup: belum ditandai mati dan nyawanya di
// atas nol.
export function isAlive(target) {
  if (!target) return false;
  if (target.alive === false) return false;
  if (typeof target.health === 'number' && target.health <= 0) return false;
  return true;
}

// Arah hadap pemain sebagai vektor datar.
function playerForward(player) {
  const heading = player.heading || 0;
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

// Cari sasaran hidup terdekat dalam jangkauan dan dalam kerucut depan.
// minDot 1 berarti tepat di depan; 0 berarti di mana saja di depan;
// -1 berarti segala arah. Kembalikan sasaran atau null.
export function nearestInCone(player, targets, range, minDot) {
  if (!player || !Array.isArray(targets) || targets.length === 0) return null;
  const fwd = playerForward(player);
  let best = null;
  let bestDistance = range;
  for (const target of targets) {
    if (!isAlive(target)) continue;
    const pos = targetPosition(target);
    if (!pos) continue;
    const dx = pos.x - player.position.x;
    const dz = pos.z - player.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > bestDistance) continue;
    if (distance > 0.001) {
      const dot = (dx / distance) * fwd.x + (dz / distance) * fwd.z;
      if (dot < minDot) continue;
    }
    bestDistance = distance;
    best = target;
  }
  return best;
}

// Beri kerusakan pada satu sasaran. Sasaran mati ditandai alive=false
// dan meshnya disembunyikan bila ada. Kembalikan true bila sasaran
// terkena (mati atau tidak).
export function applyDamage(target, amount) {
  if (!target || typeof amount !== 'number' || amount <= 0) return false;
  if (!isAlive(target)) return false;
  if (typeof target.health !== 'number') target.health = DEFAULT_TARGET_HEALTH;
  target.health -= amount;
  if (target.health <= 0) {
    target.health = 0;
    target.alive = false;
    if (target.mesh) target.mesh.visible = false;
  }
  return true;
}

// Penanganan kerusakan pada musuh (misalnya penyerang misi 4).
export function damageEnemy(enemy, amount) {
  return applyDamage(enemy, amount);
}

// Penanganan kerusakan pada polisi.
export function damagePolice(officer, amount) {
  return applyDamage(officer, amount);
}

// True bila sasaran adalah polisi (dipakai untuk menaikkan wanted).
function isPoliceTarget(target) {
  if (!target) return false;
  if (target.isPolice === true) return true;
  if (target.type === 'police') return true;
  if (typeof target.kind === 'string' && target.kind.toLowerCase() === 'police') return true;
  return false;
}

// Naikkan wanted lewat modul polisi yang diberikan, bila ada.
function raiseWanted(police, amount) {
  if (!police) return;
  if (typeof police.addWanted === 'function') police.addWanted(amount);
  else if (typeof police.increaseWanted === 'function') police.increaseWanted(amount);
  else if (typeof police.wanted === 'number') {
    police.wanted = Math.min(5, police.wanted + amount);
  }
}

// Mainkan bunyi lewat modul audio yang diberikan, bila ada.
function playSound(audio, method) {
  if (!audio || typeof audio[method] !== 'function') return;
  try {
    audio[method]();
  } catch (err) {
    // Suara tidak boleh menggagalkan tempur.
  }
}

// Pukulan (tombol F): sasaran hidup terdekat di depan dalam jarak pukul
// menerima kerusakan. Memukul polisi menaikkan wanted +1. Menghormati
// jeda antar pukulan. Kembalikan sasaran yang terkena, atau null.
export function punch(player, context) {
  if (!player || player.health <= 0) return null;
  if (!player.onFoot) return null;
  if (punchTimer > 0) return null;
  const ctx = context || {};
  const targets = [];
  if (Array.isArray(ctx.enemies)) targets.push(...ctx.enemies);
  if (Array.isArray(ctx.policeUnits)) targets.push(...ctx.policeUnits);
  if (Array.isArray(ctx.targets)) targets.push(...ctx.targets);
  const hit = nearestInCone(player, targets, PUNCH_RANGE, PUNCH_MIN_DOT);
  punchTimer = PUNCH_COOLDOWN;
  playSound(ctx.audio, 'playPunch');
  if (!hit) return null;
  applyDamage(hit, PUNCH_DAMAGE);
  if (isPoliceTarget(hit)) raiseWanted(ctx.police, 1);
  return hit;
}

// Tembakan (klik mouse): dengan pistol, musuh atau polisi terdekat dalam
// kerucut depan dan jangkauan menerima kerusakan. Menembak polisi
// menaikkan wanted +1. Kembalikan sasaran yang terkena, atau null.
// Tanpa pistol (tinju aktif), klik tidak menembak.
export function shoot(player, context) {
  if (!player || player.health <= 0) return null;
  if (player.weapon !== 'pistol') return null;
  if (gunTimer > 0) return null;
  const ctx = context || {};
  const targets = [];
  if (Array.isArray(ctx.enemies)) targets.push(...ctx.enemies);
  if (Array.isArray(ctx.policeUnits)) targets.push(...ctx.policeUnits);
  if (Array.isArray(ctx.targets)) targets.push(...ctx.targets);
  gunTimer = GUN_COOLDOWN;
  playSound(ctx.audio, 'playShot');
  const hit = nearestInCone(player, targets, GUN_RANGE, GUN_MIN_DOT);
  if (!hit) return null;
  applyDamage(hit, GUN_DAMAGE);
  if (isPoliceTarget(hit)) raiseWanted(ctx.police, 1);
  return hit;
}

// Ganti senjata aktif pemain: 'fists' (tinju) atau 'pistol'.
export function switchWeapon(player, name) {
  if (!player) return null;
  if (name !== 'fists' && name !== 'pistol') return player.weapon;
  if (typeof player.setWeapon === 'function') return player.setWeapon(name);
  player.weapon = name;
  return player.weapon;
}

// Alihkan senjata berdasarkan tombol angka yang ditekan.
function handleWeaponKeys(player) {
  if (justPressed('1')) switchWeapon(player, 'fists');
  if (justPressed('2')) switchWeapon(player, 'pistol');
}

// Update tempur tiap frame. Dipanggil modul utama saat keadaan bermain.
// Menangani timer jeda, tombol F (pukul), klik mouse (tembak), dan
// tombol 1/2 (ganti senjata). Konteks berisi daftar musuh, daftar
// polisi, modul audio, dan modul polisi.
export function updateCombat(dt, player, context) {
  const step = typeof dt === 'number' && dt > 0 ? dt : 0;
  if (punchTimer > 0) punchTimer = Math.max(0, punchTimer - step);
  if (gunTimer > 0) gunTimer = Math.max(0, gunTimer - step);
  if (!player || player.health <= 0) return;
  handleWeaponKeys(player);
  if (justPressed('f')) punch(player, context);
  const click = consumeClick();
  if (click && click.button === 0) shoot(player, context);
}

// Kembalikan timer jeda ke nol (misalnya saat misi baru dimulai).
export function resetCombat() {
  punchTimer = 0;
  gunTimer = 0;
}

// Baca sisa jeda pukul / tembak (untuk debug).
export function getCooldowns() {
  return { punch: punchTimer, gun: gunTimer };
}

// Keadaan tempur untuk debug.
export function getCombatState() {
  return {
    punchCooldown: punchTimer,
    gunCooldown: gunTimer,
    punchRange: PUNCH_RANGE,
    punchDamage: PUNCH_DAMAGE,
    gunRange: GUN_RANGE,
    gunDamage: GUN_DAMAGE,
  };
}
