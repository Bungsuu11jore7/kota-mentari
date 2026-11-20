// KOTA MENTARI — sistem combat: pistol, tinju, dan AI Geng Ombak.
// Musuh adalah figur kotak orisinal (badan + kepala + senjata) berjaket
// ungu/merah, dengan health bar sprite di atas kepala. Semua kode orisinal.
//
// Kontrak: createCombat(scene) -> {
//   enemies, spawnEnemy(x, z, opts), shoot(origin, dir), punch(playerPos, playerHeading),
//   damagePlayer(n), update(dt, playerPos), getEnemies(),
//   onPlayerHit, onEnemyKilled, playerHealth, isPlayerDead, aliveCount()
// }
// - Pistol: raycast THREE.Raycaster, jangkauan 60 unit, damage 34 (3 hit mati).
// - Tinju: musuh dalam 2,2 unit di depan pemain, damage 20 + knockback.
// - AI: dekati pemain bila jarak < 25, pukul bila < 2 (8 damage / 1 dtk),
//   lari bila health < 25. Mati = jatuh (rotasi) lalu hilang setelah 2 dtk.

import * as THREE from 'three';

const PISTOL_RANGE = 60;
const PISTOL_DAMAGE = 34;
const PUNCH_RANGE = 2.2;
const PUNCH_DAMAGE = 20;
const PUNCH_ARC = 0.3; // cos sudut depan yang masih kena tinju
const ENEMY_MAX_HEALTH = 100;
const ENEMY_AGGRO_RANGE = 25;
const ENEMY_ATTACK_RANGE = 2;
const ENEMY_ATTACK_DAMAGE = 8;
const ENEMY_ATTACK_INTERVAL = 1;
const ENEMY_FLEE_HEALTH = 25;
const ENEMY_CHASE_SPEED = 3.5;
const ENEMY_FLEE_SPEED = 4.5;
const DEAD_REMOVE_AFTER = 2;

const JACKETS = {
  purple: 0x7b2fbe,
  red: 0xc22e2e,
};

function makeHealthBar() {
  // Dua sprite yang selalu menghadap kamera: latar gelap + bilah hijau.
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x1a1a1a, depthWrite: false,
  }));
  bg.scale.set(1.3, 0.16, 1);
  bg.position.y = 2.35;

  const fg = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x39d353, depthWrite: false,
  }));
  fg.scale.set(1.2, 0.1, 1);
  fg.position.y = 2.35;
  fg.center.set(0, 0.5); // skala menyusut dari kiri (ujung kiri tetap)
  fg.position.x = -0.6;

  return { bg, fg };
}

function makeEnemyFigure(jacketColor) {
  const group = new THREE.Group();

  const jacket = new THREE.MeshLambertMaterial({ color: jacketColor });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const steel = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });

  // Badan (jaket) + kepala + kaki.
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.5), jacket);
  body.position.y = 1.15;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 2.0;
  group.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.56), dark);
  cap.position.y = 2.28;
  group.add(cap);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.4), dark);
  legL.position.set(-0.22, 0.28, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.4), dark);
  legR.position.set(0.22, 0.28, 0);
  group.add(legR);

  // Lengan kanan memegang pipa besi (senjata tumpul Geng Ombak).
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.26), jacket);
  arm.position.set(0.58, 1.25, 0.1);
  arm.rotation.z = -0.25;
  group.add(arm);
  const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), steel);
  pipe.position.set(0.72, 0.9, 0.25);
  pipe.rotation.x = 0.5;
  group.add(pipe);

  return { group, body, head };
}

export function createCombat(scene) {
  const enemies = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = PISTOL_RANGE;
  const tracers = []; // {line, life}

  const combat = {
    enemies,
    onPlayerHit: () => {},
    onEnemyKilled: () => {},
    playerHealth: 100,
    get isPlayerDead() { return combat.playerHealth <= 0; },
  };

  function hitMeshes() {
    const meshes = [];
    for (const e of enemies) {
      if (!e.alive) continue;
      meshes.push(e.body, e.head);
    }
    return meshes;
  }

  combat.spawnEnemy = function spawnEnemy(x, z, opts) {
    const o = opts || {};
    const jacketKey = JACKETS[o.jacket] !== undefined ? o.jacket : 'purple';
    const { group, body, head } = makeEnemyFigure(JACKETS[jacketKey]);
    group.position.set(x, 0, z);

    const bar = makeHealthBar();
    group.add(bar.bg);
    group.add(bar.fg);

    const enemy = {
      group, body, head, bar,
      pos: group.position, // Vector3, dibagikan dengan group.position
      health: typeof o.health === 'number' ? o.health : ENEMY_MAX_HEALTH,
      maxHealth: ENEMY_MAX_HEALTH,
      alive: true,
      attackTimer: 0,
      fallTimer: 0,
      fallTarget: -Math.PI / 2,
      name: o.name || 'Geng Ombak',
      jacket: jacketKey,
    };
    body.userData.enemy = enemy;
    head.userData.enemy = enemy;

    scene.add(group);
    enemies.push(enemy);
    return enemy;
  };

  function removeEnemy(enemy) {
    scene.remove(enemy.group);
    const i = enemies.indexOf(enemy);
    if (i >= 0) enemies.splice(i, 1);
  }

  function setHealthBar(enemy) {
    const frac = Math.max(0, enemy.health / enemy.maxHealth);
    enemy.bar.fg.scale.x = 1.2 * frac;
    enemy.bar.fg.material.color.setHex(frac > 0.5 ? 0x39d353 : frac > 0.25 ? 0xffb020 : 0xe5484d);
    enemy.bar.bg.visible = enemy.alive && enemy.health < enemy.maxHealth;
    enemy.bar.fg.visible = enemy.alive && enemy.health > 0;
  }

  function killEnemy(enemy) {
    enemy.alive = false;
    enemy.health = 0;
    enemy.fallTimer = 0;
    enemy.bar.bg.visible = false;
    enemy.bar.fg.visible = false;
    if (typeof combat.onEnemyKilled === 'function') combat.onEnemyKilled(enemy);
  }

  function damageEnemy(enemy, amount) {
    if (!enemy.alive) return false;
    enemy.health -= amount;
    setHealthBar(enemy);
    if (enemy.health <= 0) {
      killEnemy(enemy);
      return true; // mati
    }
    return false;
  }

  function addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe066, transparent: true, opacity: 0.9,
    }));
    scene.add(line);
    tracers.push({ line, life: 0.06 });
  }

  // Tembak pistol: raycast dari origin searah dir (ternormalisasi).
  // Return { hit, enemy, killed, point } atau { hit: false, point }.
  combat.shoot = function shoot(origin, dir) {
    if (!origin || !dir) return { hit: false };
    const direction = dir.clone().normalize();
    raycaster.set(origin.clone(), direction);
    const hits = raycaster.intersectObjects(hitMeshes(), false);
    const end = origin.clone().addScaledVector(direction, PISTOL_RANGE);
    if (hits.length === 0) {
      addTracer(origin, end);
      return { hit: false, point: end };
    }
    const hit = hits[0];
    const enemy = hit.object.userData.enemy;
    addTracer(origin, hit.point);
    if (!enemy || !enemy.alive) return { hit: true, point: hit.point };
    const killed = damageEnemy(enemy, PISTOL_DAMAGE);
    return { hit: true, enemy, killed, point: hit.point };
  };

  // Tinju: musuh dalam 2,2 unit DAN di depan pemain (berdasar heading).
  // Return musuh yang kena (yang terdekat) atau null. Knockback menjauhi pemain.
  combat.punch = function punch(playerPos, playerHeading) {
    if (!playerPos) return null;
    const heading = typeof playerHeading === 'number' ? playerHeading : 0;
    // M-3 (v2): vektor depan HARUS sama dengan player.js — maju =
    // (sin h, cos h). Heading 0 = menghadap +Z (bukan -Z); rumus lama
    // (sin h, -cos h) membalik depan/belakang sehingga tinju hanya kena
    // musuh di belakang pemain.
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - playerPos.x;
      const dz = e.pos.z - playerPos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > PUNCH_RANGE || d >= bestD) continue;
      const dot = d > 0.001 ? (dx * fx + dz * fz) / d : 1;
      if (dot < PUNCH_ARC) continue; // di belakang / samping, bukan di depan
      best = e;
      bestD = d;
    }
    if (!best) return null;
    const killed = damageEnemy(best, PUNCH_DAMAGE);
    // Knockback: dorong musuh menjauhi pemain.
    const dx = best.pos.x - playerPos.x;
    const dz = best.pos.z - playerPos.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    best.pos.x += (dx / len) * 1.5;
    best.pos.z += (dz / len) * 1.5;
    return { enemy: best, killed };
  };

  // Kurangi health pemain; panggil onPlayerHit(health, n).
  combat.damagePlayer = function damagePlayer(n) {
    if (combat.playerHealth <= 0) return combat.playerHealth;
    combat.playerHealth = Math.max(0, combat.playerHealth - n);
    if (typeof combat.onPlayerHit === 'function') combat.onPlayerHit(combat.playerHealth, n);
    return combat.playerHealth;
  };

  combat.healPlayer = function healPlayer(n) {
    combat.playerHealth = Math.min(100, combat.playerHealth + n);
    return combat.playerHealth;
  };

  combat.getEnemies = function getEnemies() {
    return enemies.slice();
  };

  combat.aliveCount = function aliveCount() {
    let n = 0;
    for (const e of enemies) if (e.alive) n += 1;
    return n;
  };

  combat.clearAll = function clearAll() {
    for (const e of enemies.slice()) removeEnemy(e);
  };

  combat.update = function update(dt, playerPos) {
    // Tracer peluru memudar cepat.
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const t = tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        tracers.splice(i, 1);
      }
    }

    for (const e of enemies.slice()) {
      if (!e.alive) {
        // Mati: jatuh (rotasi ke -90 derajat) lalu hilang setelah 2 detik.
        e.fallTimer += dt;
        const k = Math.min(1, e.fallTimer * 4);
        e.group.rotation.x = e.fallTarget * k;
        e.group.position.y = -0.1 * k;
        if (e.fallTimer >= DEAD_REMOVE_AFTER) removeEnemy(e);
        continue;
      }
      if (!playerPos) continue;

      const dx = playerPos.x - e.pos.x;
      const dz = playerPos.z - e.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const nx = d > 0.001 ? dx / d : 0;
      const nz = d > 0.001 ? dz / d : 0;

      // Hadap pemain (rotation.y = atan2(dx, dz) membuat sumbu +Z figur
      // menghadap pemain — konsisten dengan konvensi heading player.js,
      // maju = (sin h, cos h)).
      e.group.rotation.y = Math.atan2(dx, dz);

      if (e.health < ENEMY_FLEE_HEALTH) {
        // Panik: lari menjauhi pemain.
        e.pos.x -= nx * ENEMY_FLEE_SPEED * dt;
        e.pos.z -= nz * ENEMY_FLEE_SPEED * dt;
      } else if (d < ENEMY_AGGRO_RANGE) {
        if (d > ENEMY_ATTACK_RANGE) {
          // Dekati pemain.
          e.pos.x += nx * ENEMY_CHASE_SPEED * dt;
          e.pos.z += nz * ENEMY_CHASE_SPEED * dt;
        } else {
          // Dalam jangkauan: pukul tiap 1 detik, 8 damage.
          e.attackTimer -= dt;
          if (e.attackTimer <= 0) {
            e.attackTimer = ENEMY_ATTACK_INTERVAL;
            combat.damagePlayer(ENEMY_ATTACK_DAMAGE);
          }
        }
      }
      // Di luar 25 unit: diam di tempat (jaga wilayah).
    }
  };

  return combat;
}
