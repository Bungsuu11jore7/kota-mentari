// HUD DOM Kota Mentari: wanted, health, uang, objektif, speed, minimap, overlay.
// Elemen dicari di index.html berdasarkan id; bila belum ada, dibuat sebagai fallback
// supaya HUD tetap jalan saat dipanggil dari konteks lain.
export function createHUD() {
  // Rentang minimap: x -420..560 (dermaga pelabuhan x=470 harus masuk),
  // z -420..420. Dunia inti 800x800 berpusat (0,0).
  const MAP_X_MIN = -420;
  const MAP_X_MAX = 560;
  const MAP_Z_MIN = -420;
  const MAP_Z_MAX = 420;
  const MAP_SIZE = 200;

  function el(id, tag, parent, className) {
    let node = document.getElementById(id);
    if (node) return node;
    node = document.createElement(tag);
    node.id = id;
    if (className) node.className = className;
    (parent || document.body).appendChild(node);
    return node;
  }

  const root = el('hud', 'div', document.body);
  const topLeft = el('hud-top-left', 'div', root);
  const healthBar = el('health-bar', 'div', topLeft);
  const healthFill = el('health-fill', 'div', healthBar);
  const healthText = el('health-text', 'span', topLeft);
  const moneyText = el('money-text', 'div', topLeft);
  const wantedBox = el('hud-wanted', 'div', root);
  const stars = [];
  for (let i = 0; i < 5; i += 1) {
    const star = el(`wanted-star-${i}`, 'span', wantedBox, 'star');
    star.textContent = '★';
    stars.push(star);
  }
  const objectiveBox = el('hud-objective', 'div', root);
  const objectiveText = el('objective-text', 'div', objectiveBox);
  const speedBox = el('hud-speed', 'div', root);
  const speedValue = el('speed-value', 'span', speedBox);
  const mapBox = el('hud-minimap', 'div', root);
  const minimap = el('minimap', 'canvas', mapBox);
  minimap.width = MAP_SIZE;
  minimap.height = MAP_SIZE;
  const mapCtx = minimap.getContext('2d');
  const messageToast = el('hud-message', 'div', root);
  const weaponText = el('weapon-text', 'div', topLeft);

  // Overlay.
  const overlayStart = el('overlay-start', 'div', document.body, 'overlay');
  const overlayPause = el('overlay-pause', 'div', document.body, 'overlay');
  const overlayOver = el('overlay-over', 'div', document.body, 'overlay');
  const overlayBusted = el('overlay-busted', 'div', document.body, 'overlay');
  const overlayComplete = el('overlay-complete', 'div', document.body, 'overlay');
  const overlays = {
    title: overlayStart,
    paused: overlayPause,
    over: overlayOver,
    busted: overlayBusted,
    complete: overlayComplete,
    play: null,
  };
  const btnContinue = document.getElementById('btn-continue');
  const btnNew = document.getElementById('btn-new');
  const btnResume = document.getElementById('btn-resume');
  const btnRestart = document.getElementById('btn-restart');
  const btnRestartBusted = document.getElementById('btn-restart-busted');
  const btnNextMission = document.getElementById('btn-next-mission');
  const completeTitle = document.getElementById('complete-title');
  const completeReward = document.getElementById('complete-reward');
  const overReason = document.getElementById('over-reason');

  let messageTimer = 0;
  let roads = null; // { avenues:[x], streets:[z] } dari world, diset main.js via setWorld
  const handlers = { onNew: null, onContinue: null, onResume: null, onRestart: null, onNext: null };

  function showScreen(name) {
    for (const key of Object.keys(overlays)) {
      const node = overlays[key];
      if (node) node.classList.toggle('hidden', key !== name);
    }
    root.classList.toggle('hidden', name === 'title');
  }

  function setStart(hasSave) {
    if (btnContinue) btnContinue.classList.toggle('hidden', !hasSave);
    showScreen('title');
  }

  function showMessage(text) {
    messageToast.textContent = text;
    messageToast.classList.remove('hidden');
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => messageToast.classList.add('hidden'), 2600);
  }

  function showObjective(text) {
    objectiveText.textContent = text;
  }

  function showComplete(title, reward) {
    if (completeTitle) completeTitle.textContent = title || 'MISI SELESAI';
    if (completeReward) completeReward.textContent = reward ? `Hadiah: $${reward}` : '';
    showScreen('complete');
  }

  function showOver(reason) {
    if (overReason) overReason.textContent = reason || '';
    showScreen('over');
  }

  function showBusted() {
    showScreen('busted');
  }

  function toMap(x, z) {
    return [
      ((x - MAP_X_MIN) / (MAP_X_MAX - MAP_X_MIN)) * MAP_SIZE,
      ((z - MAP_Z_MIN) / (MAP_Z_MAX - MAP_Z_MIN)) * MAP_SIZE,
    ];
  }

  function drawMinimap(state) {
    if (!mapCtx) return;
    mapCtx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    mapCtx.fillStyle = 'rgba(8, 18, 24, 0.85)';
    mapCtx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Jalan.
    mapCtx.strokeStyle = '#5b6b7a';
    mapCtx.lineWidth = 3;
    const avenues = (roads && roads.avenues) || [-300, -200, -100, 0, 100, 200, 300];
    const streets = (roads && roads.streets) || [-300, -200, -100, 0, 100, 200, 300];
    for (const x of avenues) {
      const [mx] = toMap(x, 0);
      mapCtx.beginPath();
      mapCtx.moveTo(mx, 0);
      mapCtx.lineTo(mx, MAP_SIZE);
      mapCtx.stroke();
    }
    for (const z of streets) {
      const [, mz] = toMap(0, z);
      mapCtx.beginPath();
      mapCtx.moveTo(0, mz);
      mapCtx.lineTo(MAP_SIZE, mz);
      mapCtx.stroke();
    }
    // Marker misi (kuning).
    if (state.marker) {
      const [mx, mz] = toMap(state.marker.x, state.marker.z);
      mapCtx.fillStyle = '#ffd43b';
      mapCtx.beginPath();
      mapCtx.moveTo(mx, mz - 7);
      mapCtx.lineTo(mx + 6, mz);
      mapCtx.lineTo(mx, mz + 7);
      mapCtx.lineTo(mx - 6, mz);
      mapCtx.closePath();
      mapCtx.fill();
    }
    // Polisi (merah).
    if (state.cops) {
      mapCtx.fillStyle = '#ff4d4d';
      for (const cop of state.cops) {
        const [mx, mz] = toMap(cop.x, cop.z);
        mapCtx.beginPath();
        mapCtx.arc(mx, mz, 3.5, 0, Math.PI * 2);
        mapCtx.fill();
      }
    }
    // Pemain: panah putih searah heading.
    if (state.playerPos) {
      const [mx, mz] = toMap(state.playerPos.x, state.playerPos.z);
      const a = state.playerHeading || 0;
      mapCtx.save();
      mapCtx.translate(mx, mz);
      mapCtx.rotate(Math.atan2(Math.sin(a), -Math.cos(a)) + Math.PI);
      mapCtx.fillStyle = '#ffffff';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -7);
      mapCtx.lineTo(5, 6);
      mapCtx.lineTo(-5, 6);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    }
    // Utara.
    mapCtx.fillStyle = '#ffffff';
    mapCtx.font = 'bold 11px system-ui, sans-serif';
    mapCtx.fillText('N', 6, 14);
  }

  function update(state) {
    const health = Math.max(0, Math.min(100, state.health ?? 100));
    healthFill.style.width = `${health}%`;
    healthFill.style.background = health > 50 ? '#4ade80' : health > 25 ? '#facc15' : '#ef4444';
    healthText.textContent = `❤ ${Math.round(health)}`;
    moneyText.textContent = `$${Math.floor(state.money ?? 0)}`;
    const wanted = Math.max(0, Math.min(5, state.wanted ?? 0));
    stars.forEach((star, i) => star.classList.toggle('active', i < wanted));
    if (state.objective) objectiveText.textContent = state.objective;
    if (state.inCar) {
      speedBox.classList.remove('hidden');
      speedValue.textContent = `${Math.round(Math.abs(state.speed || 0) * 3.6)} km/h`;
    } else {
      speedBox.classList.add('hidden');
    }
    weaponText.textContent = state.weapon === 'pistol' ? '🔫 Pistol [2]' : '✊ Tinju [1]';
    drawMinimap(state);
  }

  function setWorld(world) {
    if (world && world.roads) roads = world.roads;
  }

  // Tombol overlay -> callback yang dipasang main.js.
  if (btnNew) btnNew.addEventListener('click', () => handlers.onNew && handlers.onNew());
  if (btnContinue) btnContinue.addEventListener('click', () => handlers.onContinue && handlers.onContinue());
  if (btnResume) btnResume.addEventListener('click', () => handlers.onResume && handlers.onResume());
  if (btnRestart) btnRestart.addEventListener('click', () => handlers.onRestart && handlers.onRestart());
  if (btnRestartBusted) btnRestartBusted.addEventListener('click', () => handlers.onRestart && handlers.onRestart());
  if (btnNextMission) btnNextMission.addEventListener('click', () => handlers.onNext && handlers.onNext());

  return {
    update,
    showMessage,
    showObjective,
    showScreen,
    setStart,
    showComplete,
    showOver,
    showBusted,
    setWorld,
    handlers,
  };
}
