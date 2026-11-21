// KOTA MENTARI — combat.js
// Tempur: tinju (F / tombol 1) jarak dekat, tembak pistol (klik mouse /
// tombol 2) proyektil lurus. Musuh misi 4 punya nyawa sendiri; kalahkan
// ketiganya untuk memajukan misi 4. Tembak di dekat polisi menaikkan wanted.

export function createCombatState() {
  return {
    weapon: 1,
    bullets: [],
    punchCooldown: 0,
    shootCooldown: 0,
    attackCooldown: 0,
    kills: 0,
    enemiesDefeated: 0,
    shotsFired: 0,
    punchesThrown: 0,
  };
}

function getAttackers(ctx) {
  if (!ctx) return [];
  if (Array.isArray(ctx.attackers)) return ctx.attackers;
  if (ctx.missionState && Array.isArray(ctx.missionState.attackers)) {
    return ctx.missionState.attackers;
  }
  return [];
}

function getPoliceUnits(ctx) {
  if (!ctx) return [];
  if (ctx.policeState && Array.isArray(ctx.policeState.units)) {
    return ctx.policeState.units;
  }
  if (ctx.policeState && Array.isArray(ctx.policeState.police)) {
    return ctx.policeState.police;
  }
  if (Array.isArray(ctx.policeUnits)) return ctx.policeUnits;
  return [];
}

function getPedestrians(ctx) {
  if (!ctx) return [];
  if (ctx.world && Array.isArray(ctx.world.pedestrians)) return ctx.world.pedestrians;
  if (Array.isArray(ctx.pedestrians)) return ctx.pedestrians;
  return [];
}

function raiseWanted(ctx, amount) {
  if (!ctx) return;
  try {
    if (typeof ctx.addWanted === 'function' && ctx.policeState) {
      ctx.addWanted(ctx.policeState, amount, ctx);
      return;
    }
  } catch (e) {
    // lanjut ke fallback langsung
  }
  if (ctx.policeState && typeof ctx.policeState.wanted === 'number') {
    ctx.policeState.wanted = Math.min(5, ctx.policeState.wanted + amount);
  }
}

function keyPressed(input, codes) {
  if (!input) return false;
  if (input.pressed && typeof input.pressed.has === 'function') {
    return codes.some((c) => input.pressed.has(c));
  }
  return false;
}

function defeatAttacker(state, attacker, ctx) {
  if (!attacker || attacker.alive === false) return;
  attacker.alive = false;
  attacker.health = 0;
  state.enemiesDefeated += 1;
  state.kills += 1;
  if (ctx && typeof ctx.showToast === 'function') {
    ctx.showToast('Penyerang dilumpuhkan!');
  }
  try {
    if (ctx && typeof ctx.onEnemyDefeated === 'function') {
      ctx.onEnemyDefeated(attacker, ctx);
    }
  } catch (e) {
    // misi tetap maju lewat penghitung enemiesDefeated di loop utama
  }
}

function damageTarget(state, target, amount, ctx, isAttacker) {
  if (!target) return;
  target.health = (typeof target.health === 'number' ? target.health : 100) - amount;
  if (target.health <= 0) {
    target.health = 0;
    if (isAttacker) {
      defeatAttacker(state, target, ctx);
    } else {
      target.alive = false;
    }
  }
}

function doPunch(state, dt, ctx) {
  const player = ctx ? ctx.player : null;
  if (!player) return;
  state.punchCooldown = 0.45;
  state.punchesThrown += 1;
  const px = player.x || 0;
  const pz = player.z || 0;
  const fx = Math.sin(player.angle || 0);
  const fz = Math.cos(player.angle || 0);
  const range = 2.4;
  let hitAnything = false;
  const tryHit = (target, radius, isAttacker) => {
    if (!target || target.alive === false) return;
    const dx = (target.x || 0) - px;
    const dz = (target.z || 0) - pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > range + radius) return;
    const dot = dist > 0.01 ? (dx * fx + dz * fz) / dist : 1;
    if (dot < 0.2) return;
    damageTarget(state, target, 30, ctx, isAttacker);
    hitAnything = true;
  };
  for (const a of getAttackers(ctx)) tryHit(a, 1, true);
  for (const p of getPedestrians(ctx)) tryHit(p, 0.8, false);
  for (const u of getPoliceUnits(ctx)) {
    const before = u.health;
    tryHit(u, 1, false);
    if (hitAnything && u.health !== before) raiseWanted(ctx, 1);
  }
  if (ctx && ctx.audio && typeof ctx.audio.play === 'function') {
    try {
      ctx.audio.play('punch');
    } catch (e) {
      // audio opsional
    }
  }
}

function doShoot(state, ctx) {
  const player = ctx ? ctx.player : null;
  if (!player) return;
  state.shootCooldown = 0.28;
  state.shotsFired += 1;
  const angle = player.angle || 0;
  state.bullets.push({
    x: (player.x || 0) + Math.sin(angle) * 1.2,
    z: (player.z || 0) + Math.cos(angle) * 1.2,
    angle,
    speed: 70,
    life: 1.2,
    damage: 34,
  });
  const units = getPoliceUnits(ctx);
  for (const u of units) {
    const dx = (u.x || 0) - (player.x || 0);
    const dz = (u.z || 0) - (player.z || 0);
    if (Math.sqrt(dx * dx + dz * dz) < 35) {
      raiseWanted(ctx, 1);
      break;
    }
  }
  if (ctx && ctx.audio && typeof ctx.audio.play === 'function') {
    try {
      ctx.audio.play('shoot');
    } catch (e) {
      // audio opsional
    }
  }
}

function updateBullets(state, dt, ctx) {
  const bullets = state.bullets;
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.x += Math.sin(b.angle) * b.speed * dt;
    b.z += Math.cos(b.angle) * b.speed * dt;
    b.life -= dt;
    let consumed = b.life <= 0;
    if (!consumed) {
      const hitLists = [
        { list: getAttackers(ctx), radius: 1.4, isAttacker: true },
        { list: getPoliceUnits(ctx), radius: 1.6, isAttacker: false },
        { list: getPedestrians(ctx), radius: 1.2, isAttacker: false },
      ];
      for (const entry of hitLists) {
        for (const target of entry.list) {
          if (!target || target.alive === false) continue;
          const dx = (target.x || 0) - b.x;
          const dz = (target.z || 0) - b.z;
          if (Math.sqrt(dx * dx + dz * dz) < entry.radius) {
            const wasPolice = entry.list === getPoliceUnits(ctx);
            damageTarget(state, target, b.damage, ctx, entry.isAttacker);
            if (wasPolice) raiseWanted(ctx, 1);
            consumed = true;
            break;
          }
        }
        if (consumed) break;
      }
    }
    if (consumed) bullets.splice(i, 1);
  }
}

function updateAttackerMelee(state, dt, ctx) {
  const player = ctx ? ctx.player : null;
  if (!player || player.dead) return;
  state.attackCooldown -= dt;
  for (const a of getAttackers(ctx)) {
    if (!a || a.alive === false) continue;
    const dx = (player.x || 0) - (a.x || 0);
    const dz = (player.z || 0) - (a.z || 0);
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 2.2 && state.attackCooldown <= 0) {
      state.attackCooldown = 1.0;
      player.health = Math.max(0, (player.health || 100) - 8);
      player.lastDamageAt = Date.now();
      if (player.health <= 0) player.dead = true;
    }
  }
}

export function updateCombat(state, dt, ctx) {
  if (!state) return;
  const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.05) : 1 / 60;
  const input = ctx ? ctx.inputState : null;
  state.punchCooldown = Math.max(0, (state.punchCooldown || 0) - step);
  state.shootCooldown = Math.max(0, (state.shootCooldown || 0) - step);
  if (!ctx || !ctx.player || ctx.player.dead) {
    updateBullets(state, step, ctx);
    return;
  }
  if (input) {
    if (keyPressed(input, ['Digit1'])) state.weapon = 1;
    if (keyPressed(input, ['Digit2'])) state.weapon = 2;
    if ((keyPressed(input, ['KeyF']) || state.weapon === 1) && keyPressed(input, ['KeyF'])) {
      if (state.punchCooldown <= 0) doPunch(state, step, ctx);
    }
    const wantShoot =
      (input.mouseClicked === true || input.mouseDown === true) &&
      state.weapon === 2;
    if (wantShoot && state.shootCooldown <= 0) doShoot(state, ctx);
  }
  updateBullets(state, step, ctx);
  updateAttackerMelee(state, step, ctx);
}

export function getCombatState(state) {
  if (!state) return null;
  return {
    weapon: state.weapon,
    bullets: (state.bullets || []).length,
    kills: state.kills || 0,
    enemiesDefeated: state.enemiesDefeated || 0,
    shotsFired: state.shotsFired || 0,
  };
}
