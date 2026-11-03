/**
 * 신도교회 — 메인 클라이언트
 * 진입 → 3D 예배당 + WebSocket 실시간 동기화 + 패널(예배/묵상/기도/나눔/안내)
 */
import * as THREE from '/vendor/three/three.module.js';
import { buildSanctuary } from './sanctuary.js';
import { createAvatar } from './avatars.js';
import { renderPanel, PANEL_TITLES } from './panels.js';
import { createTouchControls, bindTap } from './touch-controls.js';

const AVATAR_COLORS = ['#7fb3ff', '#f2a9a9', '#9fd6a8', '#f5d78e', '#c9a8f0', '#8fd6d0', '#e8b4d9', '#b8c4d6'];
const LS = { name: 'light-sanctuary:name', color: 'light-sanctuary:color' };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ============ 확대 게시판 ============ */
const bulletinViewer = $('#bulletinViewer');
const bulletinCards = $('#bulletinCards');
const bulletinClose = $('#bulletinClose');
const bulletinTabs = $$('.bulletin-tab');
let bulletinOpen = false;
let bulletinKind = 'notice';
let bulletinPreviousFocus = null;

function groupFor(kind) {
  return (frontNews.groups ?? []).find((g) => g.key === kind) ?? { key: kind, items: [] };
}
function setBulletinTab(kind) {
  bulletinKind = kind;
  bulletinTabs.forEach((tab) => {
    const on = tab.dataset.kind === kind;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on) bulletinCards.setAttribute('aria-labelledby', tab.id);
  });
}
function openBulletin(kind = 'notice') {
  bulletinPreviousFocus = document.activeElement;
  document.activeElement?.blur();
  keys.clear();
  bulletinOpen = true;
  updateInputAvailability();
  setBulletinTab(kind);
  bulletinViewer.classList.remove('hidden');
  bulletinClose.focus();
  $('#interactHint').classList.add('hidden');
  // frontNews는 3D 게시판 초기화 때 로드되며, 비어 있으면 fetch 재시도
  if ((frontNews.groups ?? []).some((g) => g.items?.length)) {
    renderBulletinCards();
    return;
  }
  bulletinCards.innerHTML = '<p class="bulletin-loading">게시물을 불러오는 중…</p>';
  fetch('/api/news')
    .then((res) => res.ok ? res.json() : null)
    .then((data) => {
      if (data?.groups) frontNews = data;
      renderBulletinCards();
    })
    .catch(() => {
      bulletinCards.innerHTML = '<p class="bulletin-loading">소식을 불러오지 못했습니다. 공식 페이지를 확인해 주세요.</p>';
    });
}
function closeBulletin() {
  bulletinOpen = false;
  bulletinViewer.classList.add('hidden');
  bulletinPreviousFocus?.focus();
  updateInputAvailability();
}
bulletinClose?.addEventListener('click', closeBulletin);
bulletinTabs.forEach((tab) => tab.addEventListener('click', () => {
  setBulletinTab(tab.dataset.kind);
  renderBulletinCards();
}));
bulletinTabs.forEach((tab, index) => tab.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.code)) return;
  e.preventDefault();
  const next = e.code === 'Home' ? 0 : e.code === 'End' ? bulletinTabs.length - 1
    : (index + (e.code === 'ArrowRight' ? 1 : -1) + bulletinTabs.length) % bulletinTabs.length;
  bulletinTabs[next].click();
  bulletinTabs[next].focus();
}));
bulletinViewer.addEventListener('keydown', (e) => {
  if (e.code !== 'Tab') return;
  const focusable = [...bulletinViewer.querySelectorAll('button:not([tabindex="-1"]), a[href]')];
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
bulletinViewer?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget || e.target === bulletinViewer.querySelector('.bulletin-viewer__backdrop')) closeBulletin();
});
bulletinCards?.addEventListener('click', (e) => {
  const card = e.target.closest('.bulletin-card');
  const url = card?.dataset?.url;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
});
function renderBulletinCards() {
  const group = groupFor(bulletinKind);
  const items = (group.items ?? []).slice(0, 9);
  if (!items.length) {
    bulletinCards.innerHTML = '<p class="bulletin-loading">표시할 소식을 가져오지 못했습니다. 공식 페이지를 확인해 주세요.</p>';
    return;
  }
  const note = group.error ? `<p class="bulletin-loading">${escapeText(group.error)} ${group.stale ? '마지막으로 불러온 목록을 표시합니다.' : '공식 목록을 확인해 주세요.'}</p>` : '';
  bulletinCards.innerHTML = note + items.map((it, i) => `
    <button class="bulletin-card" data-url="${escapeAttr(it.url)}" aria-label="${escapeAttr(it.title)} 보기">
      <div class="bulletin-card__date">${escapeText(it.date)}</div>
      <h3>${escapeText(it.title)}</h3>
      <div class="bulletin-card__foot"><span>#${String(i + 1).padStart(2, '0')}</span><span>공식 글 보기 ↗</span></div>
    </button>`).join('');
}
function escapeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function escapeAttr(s) { return escapeText(s); }

/* ============ 입장 화면 ============ */
const entrySection = $('#entry');
const entryForm = $('#entryForm');
const nameInput = $('#nameInput');
const swatchRow = $('#colorSwatches');
const officialLinkEntry = $('#officialLinkEntry');

let chosenColor = localStorage.getItem(LS.color) || AVATAR_COLORS[0];
nameInput.value = localStorage.getItem(LS.name) || '';

AVATAR_COLORS.forEach((hex) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'swatch';
  btn.style.background = `radial-gradient(circle at 35% 30%, #ffffff88, ${hex} 45%, #00000055 130%)`;
  btn.style.backgroundColor = hex;
  btn.setAttribute('role', 'radio');
  btn.setAttribute('aria-checked', String(hex === chosenColor));
  btn.setAttribute('aria-label', `아바타 색상 ${hex}`);
  btn.addEventListener('click', () => {
    chosenColor = hex;
    $$('.swatch', swatchRow).forEach((s) => s.setAttribute('aria-checked', String(s === btn)));
  });
  swatchRow.appendChild(btn);
});

/* ============ 공유 상태 ============ */
let three = null;          // { renderer, scene, camera, clock, sanctuary, player }
let ws = null;
let myId = null;
let frontNews = { groups: [], items: [], fetchedAt: 0 };
let mySeat = null;
const remotePlayers = new Map(); // id → { group, targetX, targetZ, targetRot, targetY, seat, moving }
const candles = [];              // { flame }
let crossLight = null;
let playerName = '성도';
let reconnectAttempts = 0;
let posSendTimer = 0;

const toastEl = $('#toast');
let toastTimer = null;
function toast(msg, ms = 3400) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

const connBadge = $('#connBadge');
function setConn(state) {
  connBadge.classList.remove('ok', 'bad');
  if (state === 'ok') { connBadge.textContent = '실시간 연결됨'; connBadge.classList.add('ok'); }
  else if (state === 'bad') { connBadge.textContent = '연결 끊김 — 재연결 중…'; connBadge.classList.add('bad'); }
  else { connBadge.textContent = '연결 중…'; }
}

/* ============ WebSocket ============ */
function connectWS() {
  setConn('connecting');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.addEventListener('open', () => {
    reconnectAttempts = 0;
    setConn('ok');
    ws.send(JSON.stringify({ t: 'join', name: playerName, color: chosenColor }));
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handleServerMessage(msg);
  });

  ws.addEventListener('close', () => {
    setConn('bad');
    if (reconnectAttempts < 6) {
      reconnectAttempts += 1;
      setTimeout(connectWS, Math.min(1000 * 2 ** reconnectAttempts, 15000));
    }
  });
  ws.addEventListener('error', () => ws.close());
}

function handleServerMessage(msg) {
  switch (msg.t) {
    case 'welcome': {
      myId = msg.you.id;
      msg.players.forEach(upsertRemotePlayer);
      updateOnlineCount();
      seedCandles(msg.candleCount ?? 0);
      break;
    }
    case 'join':
      upsertRemotePlayer(msg.player);
      updateOnlineCount();
      toast(`${msg.player.name} 님이 입장하셨습니다 ✨`);
      break;
    case 'leave': {
      removeRemotePlayer(msg.id);
      updateOnlineCount();
      toast(`${msg.name ?? '어떤 성도'} 님이 퇴장하셨습니다`);
      break;
    }
    case 'pos': {
      const p = remotePlayers.get(msg.id);
      if (!p) return;
      p.targetX = msg.x; p.targetZ = msg.z; p.targetRot = msg.rot; p.moving = msg.moving;
      p.targetY = Number.isFinite(msg.y) ? msg.y : 0;
      p.seat = Number.isInteger(msg.seat) ? msg.seat : null;
      p.group.userData.setMoving(msg.moving);
      break;
    }
    case 'chat': {
      const p = remotePlayers.get(msg.id);
      if (p) p.group.userData.setBubble(msg.text);
      if (msg.id !== myId) toast(`💬 ${msg.name}: ${msg.text.slice(0, 60)}`, 2600);
      break;
    }
    case 'candle': {
      addCandle();
      toast(`🕯️ ${msg.candle?.name ?? '누군가'} 님이 촛불을 켰습니다`);
      break;
    }
    case 'error':
      toast(`⚠️ ${msg.message}`);
      break;
  }
}

function upsertRemotePlayer(p) {
  if (remotePlayers.has(p.id)) return;
  const group = createAvatar({ color: p.color, name: p.name });
  group.position.set(p.x, Number.isFinite(p.y) ? p.y : 0, p.z);
  group.rotation.y = p.rot ?? 0;
  three?.scene.add(group);
  remotePlayers.set(p.id, {
    group,
    targetX: p.x, targetZ: p.z, targetRot: p.rot ?? 0,
    targetY: Number.isFinite(p.y) ? p.y : 0,
    seat: Number.isInteger(p.seat) ? p.seat : null,
    moving: false,
  });
}

function removeRemotePlayer(id) {
  const p = remotePlayers.get(id);
  if (!p) return;
  three?.scene.remove(p.group);
  remotePlayers.delete(id);
}

function updateOnlineCount() {
  $('#onlineCount').textContent = `${remotePlayers.size + 1}명이 함께 예배하는 중`;
}

/* ============ 촛불 ============ */
function candlePosition(i) {
  const area = three.sanctuary.candleArea;
  const rand = mulberry32(1234 + i * 77);
  return { x: area.x0 + rand() * (area.x1 - area.x0), z: area.z0 + rand() * (area.z1 - area.z0) };
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function addCandleAt(x, z) {
  const area = three.sanctuary.candleArea;
  const g = new THREE.Group();
  const wax = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.06, 0.16 + Math.random() * 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0xf6efdd, roughness: 0.6 })
  );
  wax.position.y = 0.08;
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc86e })
  );
  flame.position.y = 0.24;
  flame.scale.set(0.7, 1.4, 0.7);
  g.add(wax, flame);
  g.position.set(x, area.y, z);
  three.scene.add(g);
  candles.push({ flame });
  if (candles.length > 80) {
    const old = candles.shift();
    old.flame.parent?.removeFromParent();
  }
}
const addCandle = () => {
  if (!three) return;
  const area = three.sanctuary.candleArea;
  addCandleAt(area.x0 + Math.random() * (area.x1 - area.x0), area.z0 + Math.random() * (area.z1 - area.z0));
};
function seedCandles(n) {
  const count = Math.min(n, 40);
  for (let i = 0; i < count; i++) {
    const { x, z } = candlePosition(i);
    addCandleAt(x, z);
  }
}

/* ============ 앞마당 게시판 소식 ============ */
const interactHint = $('#interactHint');
function setHint(text) {
  if (!text) {
    interactHint.classList.add('hidden');
    return;
  }
  if (interactHint.textContent !== text) interactHint.textContent = text;
  interactHint.classList.remove('hidden');
}
async function loadFrontNews(sanctuary) {
  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error(`소식 ${res.status}`);
    const data = await res.json();
    frontNews = data;
    sanctuary.bulletin?.draw(data);
  } catch (e) {
    console.warn('공식 소식 갱신 실패:', e.message);
  }
}
function dist2d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function findNearestSeat(position) {
  if (!three) return null;
  let best = null, bestDist = Infinity, blockedBy = null;
  for (const seat of three.sanctuary.seats) {
    const d = dist2d(position, seat);
    if (d > 2.1) continue;
    const occupied = (mySeat === seat.id) || [...remotePlayers.values()].some((p) => p.seat === seat.id);
    if (occupied) { if (!blockedBy || d < blockedBy.d) blockedBy = { seat, d }; continue; }
    if (d < bestDist) { bestDist = d; best = seat; }
  }
  return { seat: best, blockedBy };
}
function canStandUp() {
  return mySeat !== null;
}
function interact() {
  if (!three || worldInputBlocked()) return;
  resetWorldInput();
  if (canStandUp()) return standUp();
  if (isNearBulletin(three?.player?.position)) {
    openBulletin();
    return;
  }
  const nearest = findNearestSeat(three.player.position);
  if (!nearest?.seat) return;
  const seat = nearest.seat;
  mySeat = seat.id;
  three.player.position.set(seat.x, 0.28, seat.z);
  three.player.rotation.y = Math.PI;
  toast('하나님의 은혜를 받으세요 🙏');
  sendPositionNow();
}
function standUp() {
  const side = Math.sign(three?.player?.position.x) || 1;
  mySeat = null;
  three.player.position.y = 0;
  three.player.position.x = side * 2.5;
  three.player.rotation.y = Math.PI;
  toast('자리에서 일어났습니다.');
  sendPositionNow();
}
function isNearBulletin(pos) {
  if (!three || !pos) return false;
  const b = three.sanctuary.bulletinArea;
  return dist2d(pos, b) <= b.radius;
}
function sendPositionNow() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !three) return;
  ws.send(JSON.stringify({
    t: 'pos',
    x: round2(three.player.position.x),
    z: round2(three.player.position.z),
    rot: round2(three.player.rotation.y),
    moving: false,
    y: round2(three.player.position.y),
    seat: mySeat,
  }));
}

/* ============ 3D 초기화 ============ */
const canvas = $('#scene');
const keys = new Set();

function initThree() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060c16);
  scene.fog = new THREE.Fog(0x060c16, 30, 78);

  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 120);
  camera.position.set(0, 4, 22);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const sanctuary = buildSanctuary(scene);

  // 내 아바타
  const player = createAvatar({ color: chosenColor, name: playerName });
  player.position.copy(sanctuary.spawn);
  player.rotation.y = Math.PI; // 십자가를 바라보며 시작
  scene.add(player);

  crossLight = scene.children.find((c) => c.isPointLight && c.color?.getHex() === 0xffd98a) ?? null;

  loadFrontNews(sanctuary);

  three = { renderer, scene, camera, clock: new THREE.Clock(), sanctuary, player };
  addEventListener('resize', onResize);
}

function onResize() {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty('--app-height', `${viewport?.height ?? innerHeight}px`);
  document.documentElement.style.setProperty('--app-top', `${viewport?.offsetTop ?? 0}px`);
  resetWorldInput();
  if (!three) return;
  const { width, height } = $('#app').getBoundingClientRect();
  three.camera.aspect = width / height;
  three.camera.updateProjectionMatrix();
  three.renderer.setSize(width, height);
}

/* ---------- 카메라(뒤에서 바라보는 3인칭; 횡단 드래그로 방향 전환) ---------- */
let orbitPitch = 0.46;
const touchInput = createTouchControls({
  root: $('#touchControls'), canvas,
  onLook(dx, dy) {
    if (!three || mySeat !== null || worldInputBlocked()) return;
    orbitPitch = THREE.MathUtils.clamp(orbitPitch + dy * 0.004, 0.18, 1.15);
    three.player.rotation.y -= dx * 0.0052;
    updateHeading();
  },
  onInteract: interact,
});
const touchLayout = matchMedia('(any-pointer: coarse), (max-width: 760px)');
function resetWorldInput() { keys.clear(); touchInput.reset(); }
function worldInputBlocked() {
  return !three || bulletinOpen || currentPanel !== null || document.hidden
    || TYPING_TAGS.has(document.activeElement?.tagName);
}
function updateInputAvailability() {
  const blocked = worldInputBlocked();
  if (blocked) keys.clear();
  touchInput.setPaused(blocked);
  $('#app').classList.toggle('controls-paused', blocked);
}
function updateTouchLayout() {
  resetWorldInput();
  $('#app').classList.toggle('touch-mode', touchLayout.matches);
}
touchLayout.addEventListener('change', updateTouchLayout);
updateTouchLayout();
window.visualViewport?.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('scroll', onResize);
document.addEventListener('focusin', updateInputAvailability);
document.addEventListener('focusout', () => queueMicrotask(updateInputAvailability));
document.addEventListener('visibilitychange', () => { resetWorldInput(); updateInputAvailability(); });
addEventListener('blur', resetWorldInput);
addEventListener('orientationchange', resetWorldInput);

/* ============ 현재 방향 표시 ============ */
const headingHud = $('#headingHud');
const headingArrow = $('#headingArrow');
const headingText = $('#headingText');
const RAD_TO_DEG = 180 / Math.PI;
function normalizeYaw(rad) {
  let d = (rad + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
}
function updateHeading() {
  if (!three) return;
  const delta = normalizeYaw(three.player.rotation.y - Math.PI);
  const deg = Math.abs(Math.round(delta * RAD_TO_DEG));
  const sign = delta >= 0 ? '←' : (delta < 0 ? '→' : '');
  const label = deg <= 35 ? '성소 향함' : deg <= 145 ? '측면' : '후면';
  headingText.textContent = `${label} · ${deg}° ${sign}`;
  headingArrow.style.transform = `rotate(${-delta * RAD_TO_DEG}deg)`;
}

/* ============ 키보드 ============ */
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && e.repeat) return;
  if (TYPING_TAGS.has(document.activeElement?.tagName)) {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }
  if (bulletinOpen) {
    if (e.code === 'Escape' || e.code === 'KeyF') { e.preventDefault(); closeBulletin(); }
    return;
  }
  if (currentPanel !== null) {
    if (e.code === 'Escape') closePanel();
    return;
  }
  keys.add(e.code);
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF'].includes(e.code)) {
    e.preventDefault();
  }
  if (e.code === 'Enter') { e.preventDefault(); $('#chatInput').focus(); }
  if (e.code === 'KeyF') interact();
  if (e.code === 'Escape') closePanel();
});
addEventListener('keyup', (e) => keys.delete(e.code));

/* ---------- 충돌(원 vs AABB) ---------- */
const PLAYER_RADIUS = 0.55;
function resolveCollisions(pos) {
  const { obstacles, bounds } = three.sanctuary;
  for (const o of obstacles) {
    const cx = THREE.MathUtils.clamp(pos.x, o.minX, o.maxX);
    const cz = THREE.MathUtils.clamp(pos.z, o.minZ, o.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
      if (distSq === 0) { // 내부에 갇힌 경우 — 가장 가까운 면으로 밀어냄
        const pushLeft = pos.x - o.minX, pushRight = o.maxX - pos.x;
        const pushBack = pos.z - o.minZ, pushFront = o.maxZ - pos.z;
        const m = Math.min(pushLeft, pushRight, pushBack, pushFront);
        if (m === pushLeft) pos.x = o.minX - PLAYER_RADIUS;
        else if (m === pushRight) pos.x = o.maxX + PLAYER_RADIUS;
        else if (m === pushBack) pos.z = o.minZ - PLAYER_RADIUS;
        else pos.z = o.maxZ + PLAYER_RADIUS;
      } else {
        const dist = Math.sqrt(distSq);
        pos.x = cx + (dx / dist) * PLAYER_RADIUS;
        pos.z = cz + (dz / dist) * PLAYER_RADIUS;
      }
    }
  }
  pos.x = THREE.MathUtils.clamp(pos.x, bounds.minX, bounds.maxX);
  pos.z = THREE.MathUtils.clamp(pos.z, bounds.minZ, bounds.maxZ);
}

/* ---------- 프레임 루프 ---------- */
const camOffset = new THREE.Vector3();
const moveVec = new THREE.Vector3();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(three.clock.getDelta(), 0.05);
  const t = three.clock.elapsedTime;
  const { camera, renderer, scene, player, sanctuary } = three;
  updateInputAvailability();
  const canMove = !worldInputBlocked() && mySeat === null;
  touchInput.setMovementEnabled(mySeat === null);

  /* 방향 전환 + 앞으로 이동 (이동은 바라보는 방향으로만, 좌우는 회전) */
  const TURN_SPEED = 2.4;
  if (canMove) {
    if (keys.has('ArrowLeft') || keys.has('KeyA') || touchInput.has('left')) player.rotation.y += TURN_SPEED * dt;
    if (keys.has('ArrowRight') || keys.has('KeyD') || touchInput.has('right')) player.rotation.y -= TURN_SPEED * dt;
  }
  const yaw = player.rotation.y;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  moveVec.set(0, 0, 0);
  if (canMove) {
    if (keys.has('KeyW') || keys.has('ArrowUp') || touchInput.has('forward')) moveVec.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown') || touchInput.has('backward')) moveVec.sub(forward);
  }

  const moving = moveVec.lengthSq() > 0;
  if (moving) {
    moveVec.normalize();
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchInput.has('run') ? 8.2 : 5.8;
    player.position.x += moveVec.x * speed * dt;
    player.position.z += moveVec.z * speed * dt;
    resolveCollisions(player.position);
  }
  player.userData.setMoving(moving);
  player.userData.tick(t);

  /* 위치 동기화 (12Hz) */
  posSendTimer += dt;
  if (posSendTimer > 0.085 && ws?.readyState === WebSocket.OPEN) {
    posSendTimer = 0;
    ws.send(JSON.stringify({ t: 'pos', x: round2(player.position.x), z: round2(player.position.z), rot: round2(player.rotation.y), moving, y: round2(player.position.y), seat: mySeat }));
  }

  /* 카메라 추종 */
  const dist = 7.4 * Math.cos(orbitPitch);
  const height = 1.0 + 7.4 * Math.sin(orbitPitch);
  camOffset.set(-Math.sin(yaw) * dist, height, -Math.cos(yaw) * dist);
  camera.position.copy(player.position).add(camOffset);
  // 카메라가 벽/천장 밖으로 나가지 않도록 실내에 가둠
  const { dims } = sanctuary;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -dims.W / 2 + 0.4, dims.W / 2 - 0.4);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -dims.D / 2 + 0.4, dims.D / 2 + (dims.FRONT ?? 0) + 4.5);
  camera.position.y = Math.min(camera.position.y, dims.H - 0.4);
  camera.lookAt(player.position.x, player.position.y + 2.35, player.position.z);

  /* 원격 플레이어 보간 */
  for (const p of remotePlayers.values()) {
    const k = 1 - Math.exp(-10 * dt);
    p.group.position.x += (p.targetX - p.group.position.x) * k;
    p.group.position.z += (p.targetZ - p.group.position.z) * k;
    p.group.position.y += (p.targetY - p.group.position.y) * k;
    p.group.rotation.y = lerpAngle(p.group.rotation.y, p.targetRot, k);
    p.group.userData.setMoving(p.moving && p.seat == null);
    p.group.userData.tick(t);
  }

  /* 촛불 흔들림 */
  for (const c of candles) {
    const s = 1 + Math.sin(t * 11 + c.flame.id) * 0.22;
    c.flame.scale.set(0.7 * s, 1.4 * (2 - s) * 0.8, 0.7 * s);
  }

  /* 십자가 빛 맥동 */
  if (crossLight) crossLight.intensity = 55 + Math.sin(t * 0.9) * 14;

  /* 상호작용 힌트 */
  updateInteractHint(player.position);
  updateHeading();

  renderer.render(scene, camera);
}
function updateInteractHint(pos) {
  if (!three || !pos) return;
  if (worldInputBlocked()) { setHint(null); touchInput.setInteraction(null); return; }
  if (mySeat !== null) {
    setHint('F · 자리에서 일어서기');
    touchInput.setInteraction('일어서기');
    return;
  }
  if (isNearBulletin(pos)) {
    setHint('F · 게시판 확대 열기');
    touchInput.setInteraction('게시판 열기');
    return;
  }
  const nearest = findNearestSeat(pos);
  if (nearest?.seat) {
    setHint('F · 이 자리에 앉기');
    touchInput.setInteraction('앉기');
    return;
  }
  if (nearest?.blockedBy) {
    setHint('자리가 찼습니다');
    touchInput.setInteraction(null);
    return;
  }
  setHint(null);
  touchInput.setInteraction(null);
}

const round2 = (n) => Math.round(n * 100) / 100;
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/* ============ 패널(사이드) ============ */
const sidePanel = $('#sidePanel');
const panelScrim = $('#panelScrim');
const panelBody = $('#panelBody');
const panelTitle = $('#panelTitle');
let currentPanel = null;

function openPanel(name) {
  currentPanel = name;
  updateInputAvailability();
  panelTitle.textContent = PANEL_TITLES[name] ?? name;
  sidePanel.classList.add('open');
  sidePanel.setAttribute('aria-hidden', 'false');
  panelScrim.classList.remove('hidden');
  $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
  renderPanel(name, panelBody, { name: playerName, toast });
}
function closePanel() {
  currentPanel = null;
  sidePanel.classList.remove('open');
  sidePanel.setAttribute('aria-hidden', 'true');
  panelScrim.classList.add('hidden');
  $$('.tab-btn').forEach((b) => b.classList.remove('active'));
  updateInputAvailability();
}
$$('.tab-btn').forEach((btn) => bindTap(btn, () => {
  const name = btn.dataset.panel;
  if (name === 'news') { openBulletin(); return; }
  if (currentPanel === name) closePanel();
  else openPanel(name);
}));
$('#panelClose').addEventListener('click', closePanel);
panelScrim.addEventListener('click', closePanel);

/* ============ 채팅 ============ */
const chatForm = $('#chatForm');
const chatInput = $('#chatInput');
$('#chatNameTag').textContent = '';
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ t: 'chat', text }));
    three?.player.userData.setBubble(text); // 내 말풍선은 즉시 표시
    chatInput.value = '';
    chatInput.blur();
  } else {
    toast('연결이 끊어졌습니다. 잠시 후 다시 시도해 주세요.');
  }
});

/* ============ 입장 ============ */
entryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  document.activeElement?.blur();
  playerName = (nameInput.value.trim() || '신도성도').slice(0, 20);
  localStorage.setItem(LS.name, playerName);
  localStorage.setItem(LS.color, chosenColor);
  $('#chatNameTag').textContent = playerName;

  entrySection.classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#app').setAttribute('aria-hidden', 'false');

  try {
    initThree();
  } catch (err) {
    console.error(err);
    toast('3D를 초기화하지 못했습니다. WebGL을 지원하는 브라우저에서 열어주세요.');
    return;
  }
  connectWS();
  onResize();
  tick();
  toast(`${playerName} 님, 신도교회 3D 힐링 공간에 오신 것을 환영합니다 ✝ · 입구로 나가면 공식 소식 게시판이 있습니다`);
});
