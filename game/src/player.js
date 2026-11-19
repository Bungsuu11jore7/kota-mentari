// Raka Pratama — protagonis jalan kaki + mengemudi, kamera third-person follow.
// Gerak: W maju / S mundur searah heading, A/D putar badan, Shift lari.
// E masuk/keluar mobil bila ada mobil dekat (< 4 unit). Gedung tidak bisa ditembus.
import * as THREE from 'three';

const WALK_SPEED = 6;
const RUN_SPEED = 10;
const TURN_SPEED = 2.4;
const PLAYER_RADIUS = 0.6;
const CAM_DIST_FOOT = 8;
const CAM_HEIGHT_FOOT = 4;
const CAM_DIST_CAR = 11;
const CAM_HEIGHT_CAR = 5;

function buildMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xe8590c });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc68e5e });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), jacket);
  torso.position.y = 1.05;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
  head.position.y = 1.62;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), dark);
  cap.position.y = 1.82;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), dark);
  legL.position.set(-0.17, 0.35, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), jacket);
  armL.position.set(-0.41, 1.05, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.41;
  group.add(armR);
  return group;
}

export function createPlayer(scene, spawn = { x: 0, z: 50 }) {
  const group = buildMesh();
  group.position.set(spawn.x, 0, spawn.z);
  scene.add(group);

  const player = {
    group,
    mesh: group,
    pos: group.position, // THREE.Vector3, y selalu 0 di jalan kaki
    heading: Math.PI, // menghadap -Z di awal (ke pusat kota)
    health: 100,
    money: 0,
    inCar: false,
    car: null,
    weapon: 'fists', // 'fists' | 'pistol'
    _camPos: new THREE.Vector3(spawn.x, CAM_HEIGHT_FOOT + 2, spawn.z + CAM_DIST_FOOT),
    _camReady: false,
  };

  function blocked(world, x, z) {
    if (!world) return false;
    if (typeof world.isBlocked === 'function') return world.isBlocked(x, z, PLAYER_RADIUS);
    // Fallback: tetap di dalam grid dunia.
    const half = 400;
    return x < -half || x > half || z < -half || z > half;
  }

  // Coba geser ke (nx, nz); kalau terhalang, coba geser per sumbu (sliding di dinding).
  function tryMove(world, nx, nz) {
    if (!blocked(world, nx, nz)) {
      player.pos.x = nx;
      player.pos.z = nz;
      return;
    }
    if (!blocked(world, nx, player.pos.z)) player.pos.x = nx;
    else if (!blocked(world, player.pos.x, nz)) player.pos.z = nz;
  }

  function nearestCar(cars, maxDist) {
    if (!cars) return null;
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (!car || !car.pos) continue;
      const dx = car.pos.x - player.pos.x;
      const dz = car.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function update(dt, input, world, vehicles, actions, cars) {
    const act = actions || (input && typeof input.takeActions === 'function' ? input.takeActions() : null);

    if (act && act.weapon1) player.weapon = 'fists';
    if (act && act.weapon2) player.weapon = 'pistol';

    // Masuk / keluar mobil.
    if (act && act.enterCar) {
      if (player.inCar) {
        if (vehicles && typeof vehicles.exitCar === 'function') vehicles.exitCar(player, player.car);
        player.inCar = false;
        player.car = null;
        player.pos.y = 0;
        group.visible = true;
      } else {
        const list = cars || (vehicles && vehicles.cars) || null;
        const car = nearestCar(list, 4);
        if (car) {
          if (vehicles && typeof vehicles.enterCar === 'function') vehicles.enterCar(player, car);
          player.inCar = true;
          player.car = car;
          group.visible = false;
        }
      }
    }

    if (player.inCar && player.car) {
      const throttle = (input.keys.has('KeyW') ? 1 : 0) + (input.keys.has('KeyS') ? -1 : 0);
      const steer = (input.keys.has('KeyA') ? 1 : 0) + (input.keys.has('KeyD') ? -1 : 0);
      const brake = input.keys.has('Space');
      if (vehicles && typeof vehicles.updateCar === 'function') {
        vehicles.updateCar(player.car, { throttle, steer, brake }, dt, world);
      }
      if (player.car.pos) {
        player.pos.copy(player.car.pos);
        player.heading = player.car.heading;
      }
      return;
    }

    // Jalan kaki.
    const running = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const speed = running ? RUN_SPEED : WALK_SPEED;
    if (input.keys.has('KeyA')) player.heading += TURN_SPEED * dt;
    if (input.keys.has('KeyD')) player.heading -= TURN_SPEED * dt;
    let move = 0;
    if (input.keys.has('KeyW')) move += 1;
    if (input.keys.has('KeyS')) move -= 0.55;
    if (move !== 0) {
      const fx = Math.sin(player.heading);
      const fz = Math.cos(player.heading);
      tryMove(world, player.pos.x + fx * move * speed * dt, player.pos.z + fz * move * speed * dt);
    }
    group.rotation.y = player.heading;
    // Ayunan kaki sederhana saat berjalan.
    const walking = move !== 0;
    const t = performance.now() / 1000;
    group.children.forEach((child, i) => {
      // children: 0 torso, 1 head, 2 cap, 3 legL, 4 legR, 5 armL, 6 armR.
      if (i === 3 || i === 4) child.rotation.x = walking ? Math.sin(t * (running ? 13 : 9) + i * Math.PI) * 0.55 : 0;
    });
  }

  function updateCamera(camera, dt) {
    const inCar = player.inCar && player.car;
    const dist = inCar ? CAM_DIST_CAR : CAM_DIST_FOOT;
    const height = inCar ? CAM_HEIGHT_CAR : CAM_HEIGHT_FOOT;
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    const target = new THREE.Vector3(
      player.pos.x - fx * dist,
      player.pos.y + height,
      player.pos.z - fz * dist,
    );
    if (!player._camReady) {
      player._camPos.copy(target);
      player._camReady = true;
    } else {
      const k = 1 - Math.exp(-dt * 4.5);
      player._camPos.lerp(target, k);
    }
    camera.position.copy(player._camPos);
    camera.lookAt(player.pos.x + fx * 2.5, player.pos.y + 1.6, player.pos.z + fz * 2.5);
  }

  function damage(amount) {
    player.health = Math.max(0, player.health - amount);
    return player.health <= 0;
  }

  function heal(amount) {
    player.health = Math.min(100, player.health + amount);
  }

  function addMoney(amount) {
    player.money += amount;
  }

  function reset(spawnPos) {
    const s = spawnPos || { x: 0, z: 50 };
    player.pos.set(s.x, 0, s.z);
    player.heading = Math.PI;
    player.health = 100;
    player.inCar = false;
    player.car = null;
    group.visible = true;
    group.rotation.y = player.heading;
    player._camReady = false;
  }

  player.update = update;
  player.updateCamera = updateCamera;
  player.damage = damage;
  player.heal = heal;
  player.addMoney = addMoney;
  player.reset = reset;
  return player;
}
