import * as THREE from '/vendor/three/three.module.js';

/**
 * 빛의 성전 — 3D 예배당(대성전) 빌더
 * 여의도순복음교회 "테마"의 오리지널 저폴리 해석입니다.
 * (공식 로고/건축물을 그대로 복제하지 않고, 빛·성전·십자가 모티프로 재해석)
 */

const W = 56;   // x 폭
const D = 38;   // z 깊이
const H = 15;   // 층고
const FRONT = 9; // 예배당 앞 마당/게시판 구역 깊이

/* ---------- 캔버스 텍스처 헬퍼 ---------- */
function makeCanvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}
function canvasTexture(canvas, repeat) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  return tex;
}

/** 스테인드글라스 색유리 패턴 */
function stainedGlassTexture() {
  return canvasTexture(makeCanvas(256, (ctx, s) => {
    const palette = ['#c9363c', '#2f6db5', '#d8b45a', '#3f9e63', '#7a4fb0', '#e07a5f', '#f2e6c8'];
    ctx.fillStyle = '#1b2a44'; ctx.fillRect(0, 0, s, s);
    // 아치형 창틀
    ctx.beginPath();
    ctx.moveTo(24, s - 20);
    ctx.lineTo(24, 90);
    ctx.quadraticCurveTo(s / 2, -40, s - 24, 90);
    ctx.lineTo(s - 24, s - 20);
    ctx.closePath();
    ctx.save(); ctx.clip();
    // 기하학 유리片
    const cell = 32;
    for (let y = -20; y < s + 20; y += cell) {
      for (let x = -20; x < s + 20; x += cell) {
        ctx.fillStyle = palette[(Math.random() * palette.length) | 0];
        ctx.beginPath();
        ctx.moveTo(x + cell / 2, y);
        ctx.lineTo(x + cell, y + cell / 2);
        ctx.lineTo(x + cell / 2, y + cell);
        ctx.lineTo(x, y + cell / 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,28,44,0.9)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    // 중앙 십자가 모티프
    ctx.fillStyle = 'rgba(253,248,231,0.92)';
    ctx.fillRect(s / 2 - 7, 60, 14, 110);
    ctx.fillRect(s / 2 - 38, 92, 76, 14);
    ctx.restore();
    // 창틀 테두리
    ctx.strokeStyle = '#0e1a2b'; ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(24, s - 20); ctx.lineTo(24, 90);
    ctx.quadraticCurveTo(s / 2, -40, s - 24, 90);
    ctx.lineTo(s - 24, s - 20); ctx.closePath(); ctx.stroke();
  }));
}

/** 카펫(짙은 네이비) + 회랑(골드 러너) */
function carpetTexture() {
  return canvasTexture(makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = '#1d2a47'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(216,180,90,0.10)';
    ctx.lineWidth = 2;
    for (let i = -s; i < s * 2; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + s, s); ctx.stroke();
    }
  }), [6, 4]);
}
function runnerTexture() {
  return canvasTexture(makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = '#5b1f24'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#d8b45a'; ctx.lineWidth = 6;
    ctx.strokeRect(14, -4, s - 28, s + 8);
    ctx.fillStyle = 'rgba(216,180,90,0.55)';
    for (let y = 22; y < s; y += 64) {
      ctx.beginPath(); ctx.arc(s / 2, y, 9, 0, Math.PI * 2); ctx.fill();
    }
  }), [1, 8]);
}

/** 대형 스크린용 슬라이드 */
function slideTexture(lines, accent = '#d8b45a') {
  const c = makeCanvas(512, (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#0e1a2b'); grad.addColorStop(1, '#16263d');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = accent; ctx.lineWidth = 6;
    ctx.strokeRect(18, 18, s - 36, s - 36);
    ctx.fillStyle = '#faf6ec';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((line, i) => {
      ctx.font = `${i === 0 ? '700' : '400'} ${i === 0 ? 54 : 34}px 'Nanum Myeongjo', serif`;
      ctx.fillStyle = i === 0 ? accent : '#faf6ec';
      ctx.fillText(line, s / 2, s * ((i + 1) / (n + 1)));
    });
  });
  return canvasTexture(c);
}

/** 앞마당 석재 바닥 */
function stoneTexture() {
  return canvasTexture(makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = '#8e8f8d'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(45,45,45,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= s; i += 42) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
    }
    for (let j = 0; j <= s; j += 30) {
      ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(s, j); ctx.stroke();
    }
    // 무작위 얼룩(석재 질감)
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${100 + Math.random() * 80},${100 + Math.random() * 80},${100 + Math.random() * 80},0.22)`;
      const r = 2 + Math.random() * 8;
      ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2); ctx.fill();
    }
  }), [8, 3]);
}

/** 게시판 캔버스 (실제 공식 소식을 런타임에 그려 넣는다) */
const BOARD = { w: 1024, h: 640 };
function drawBulletinBoard(ctx, w, h, items = []) {
  // 배경: 나무 게시판
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#5b3b23');
  grad.addColorStop(1, '#3a2414');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d8b45a'; ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  // 제목
  ctx.fillStyle = '#f2e6c8';
  ctx.font = "800 58px 'Nanum Myeongjo', serif";
  ctx.textAlign = 'center';
  ctx.fillText('순복음소식', w / 2, 78);
  ctx.fillStyle = '#d8b45a';
  ctx.fillRect(w / 2 - 130, 100, 260, 4);
  ctx.font = "400 20px 'Noto Sans KR', sans-serif";
  ctx.fillStyle = '#cbb98a';
  ctx.fillText('공식 교회소식', w / 2, 132);
  // 목록
  ctx.textAlign = 'left';
  const startY = 175, lineH = 82;
  if (!items.length) {
    ctx.font = "400 28px 'Noto Sans KR', sans-serif";
    ctx.fillStyle = '#e9e2d3';
    ctx.fillText('소식을 불러오는 중입니다…', 70, startY + 20);
    return;
  }
  items.slice(0, 5).forEach((item, i) => {
    const y = startY + i * lineH;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(46, y, w - 92, lineH - 8);
    ctx.strokeStyle = 'rgba(216,180,90,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(46, y, w - 92, lineH - 8);
    ctx.font = "700 25px 'Noto Sans KR', sans-serif";
    ctx.fillStyle = '#f5f0df';
    const title = item.title.length > 52 ? item.title.slice(0, 52) + '…' : item.title;
    ctx.fillText(title, 70, y + 34);
    ctx.font = "400 19px 'Noto Sans KR', sans-serif";
    ctx.fillStyle = '#cbb98a';
    ctx.fillText(item.date, 70, y + 62);
  });
}

/** 벽면 상단 골드 레터링 */
function wallTextTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 192;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = "800 104px 'Nanum Myeongjo', serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(216,180,90,0.8)'; ctx.shadowBlur = 26;
  ctx.fillStyle = '#e9cd8a';
  ctx.fillText(text, c.width / 2, c.height / 2 + 4);
  return canvasTexture(c);
}

/* ---------- 재질 ---------- */
const MAT = {
  wall:   new THREE.MeshStandardMaterial({ color: 0xe6dfc9, roughness: 0.95 }),
  wallLow:new THREE.MeshStandardMaterial({ color: 0xcabf9f, roughness: 0.9 }),
  ceiling:new THREE.MeshStandardMaterial({ color: 0xd9d2bd, roughness: 1 }),
  wood:   new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.65, metalness: 0.05 }),
  woodDark:new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.7 }),
  gold:   new THREE.MeshStandardMaterial({ color: 0xd8b45a, roughness: 0.28, metalness: 0.85, emissive: 0x4a3410, emissiveIntensity: 0.6 }),
  goldGlow:new THREE.MeshStandardMaterial({ color: 0xf0d789, emissive: 0xffc85e, emissiveIntensity: 2.4, roughness: 0.4 }),
  marble: new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.35, metalness: 0.05 }),
  stageTop:new THREE.MeshStandardMaterial({ color: 0x54401f, roughness: 0.5 }),
  leaf:   new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.9 }),
};

function box(w, h, d, mat, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  return m;
}

/* ---------- 메인 빌더 ---------- */
export function buildSanctuary(scene) {
  const obstacles = []; // {minX,maxX,minZ,maxZ}
  const root = new THREE.Group();
  scene.add(root);

  /* 바닥: 카펫 + 중앙 회랑 */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: carpetTexture(), roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, D - 4),
    new THREE.MeshStandardMaterial({ map: runnerTexture(), roughness: 0.95 })
  );
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, 0.02, 1);
  runner.receiveShadow = true;
  root.add(runner);

  /* 벽 (6면) — 입구 쪽(z=+D/2)에는 앞마당으로 이어지는 포털 */
  const wallT = 0.6;
  const frontZ = D / 2 + wallT / 2;
  const openingHalf = 3.0;
  // 남쪽(십자가 벽) / 좌우 벽
  root.add(box(W + wallT * 2, H, wallT, MAT.wall, 0, H / 2, -D / 2 - wallT / 2, { shadow: false }));
  root.add(box(wallT, H, D, MAT.wall, -W / 2 - wallT / 2, H / 2, 0, { shadow: false }));
  root.add(box(wallT, H, D, MAT.wall,  W / 2 + wallT / 2, H / 2, 0, { shadow: false }));
  // 입구 벽: 중앙 포털 아치(좌/우 벽 + 상단 보)
  const sideW = (W - openingHalf * 2) / 2 + wallT; // 양쪽 각각 (벽이 살짝 겹침)
  const leftW = W / 2 - openingHalf + wallT;
  root.add(box(leftW, H, wallT, MAT.wall, -(openingHalf + leftW / 2), H / 2, frontZ, { shadow: false }));
  root.add(box(leftW, H, wallT, MAT.wall,  (openingHalf + leftW / 2), H / 2, frontZ, { shadow: false }));
  root.add(box(openingHalf * 2 + wallT * 2, H - 6.2, wallT, MAT.wall, 0, (H + 6.2) / 2, frontZ, { shadow: false }));
  // 포털 기둥(기하화) + 상인방
  for (const x of [-openingHalf - 0.55, openingHalf + 0.55]) {
    root.add(box(1.2, 7.2, 1.2, MAT.marble, x, 3.6, frontZ - 0.2, { shadow: false }));
    root.add(box(1.4, 0.35, 1.4, MAT.gold, x, 7.25, frontZ - 0.2, { shadow: false }));
  }
  // 포털 좌우 충돌체 — 가운데(-3..3)만 통과 가능
  obstacles.push({ minX: -W / 2 - 1, maxX: -openingHalf, minZ: D / 2 - 0.4, maxZ: D / 2 + 0.5 });
  obstacles.push({ minX:  openingHalf, maxX:  W / 2 + 1, minZ: D / 2 - 0.4, maxZ: D / 2 + 0.5 });
  /* 웨인스코팅 — 입구 포털 구간은 제외 */
  const wains = (x, z, w, d) => root.add(box(w, 1.6, d, MAT.woodDark, x, 0.8, z, { shadow: false }));
  wains(0, -D / 2 + 0.05, W, 0.15);
  wains(-W / 2 + openingHalf / 2 + 1.4, D / 2 - 0.05, W / 2 - openingHalf - 2.8, 0.15);
  wains( W / 2 - openingHalf / 2 - 1.4, D / 2 - 0.05, W / 2 - openingHalf - 2.8, 0.15);
  wains(-W / 2 + 0.05, 0, 0.15, D);
  wains( W / 2 - 0.05, 0, 0.15, D);

  /* ========== 앞마당 (예배당 외부) ========== */
  // 석재 바닥
  const frontFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, FRONT),
    new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9 })
  );
  frontFloor.rotation.x = -Math.PI / 2;
  frontFloor.position.set(0, 0, D / 2 + FRONT / 2);
  frontFloor.receiveShadow = true;
  root.add(frontFloor);

  // 마당 좌우 담장/경계 + 중앙 회랑
  for (let i = 0; i < Math.ceil(FRONT / 1.2); i++) {
    const z = D / 2 + 0.6 + i * 1.2;
    root.add(box(0.6, 1.1, 1.0, MAT.wallLow, -W / 2 + 0.3, 0.55, z, { shadow: false }));
    root.add(box(0.6, 1.1, 1.0, MAT.wallLow,  W / 2 - 0.3, 0.55, z, { shadow: false }));
  }

  // 담장 앞 티크 석재 담장 기둥
  for (let z = D / 2 + 1.8; z < D / 2 + FRONT; z += 3.6) {
    root.add(box(1.0, 2.0, 1.0, MAT.marble, -W / 2 + 0.5, 1.0, z, { shadow: false }));
    root.add(box(1.0, 2.0, 1.0, MAT.marble,  W / 2 - 0.5, 1.0, z, { shadow: false }));
  }

  // 포털 상단 십자가(외부에서도 보이게)
  const facadeCross = new THREE.Group();
  facadeCross.position.set(0, 10.7, frontZ + 0.35);
  const fcV = box(0.9, 4.6, 0.35, MAT.goldGlow, 0, 0, 0);
  const fcH = box(3.1, 0.9, 0.35, MAT.goldGlow, 0, 0.7, 0);
  facadeCross.add(fcV, fcH);
  root.add(facadeCross);

  // 정면 교회 이름 레터링(외부)
  const facadeText = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 2.6),
    new THREE.MeshBasicMaterial({ map: wallTextTexture('여의도순복음교회'), transparent: true, depthWrite: false })
  );
  facadeText.position.set(0, 13.3, frontZ + 0.33);
  root.add(facadeText);

  // 입구 아치 내부 회백가리개(따뜻한 톤)
  const entryGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 6.2),
    new THREE.MeshBasicMaterial({ map: canvasTexture(makeCanvas(64, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,240,200,0.85)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    })), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  entryGlow.position.set(0, 5.2, frontZ - 0.28);
  root.add(entryGlow);

  /* 게시판 상단 표지(외부) + 실내 안내문 */
  const boardSign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.6, 1.35),
    new THREE.MeshBasicMaterial({ map: wallTextTexture('공식 소식 게시판'), transparent: true, depthWrite: false })
  );
  boardSign.position.set(-10.4, 5.05, D / 2 + 0.34);
  root.add(boardSign);
  const insideSign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.8, 1.1),
    new THREE.MeshBasicMaterial({ map: wallTextTexture('← 공식 소식'), transparent: true, depthWrite: false })
  );
  insideSign.position.set(-5.3, 6.8, D / 2 - 0.1);
  insideSign.rotation.y = Math.PI;
  root.add(insideSign);

  /* ========== 공식 소식 게시판 (마당 왼쪽) ========== */
  const boardBacking = box(7.8, 4.7, 0.25, MAT.woodDark, -10.4, 2.15, D / 2 + 0.38, { shadow: true });
  root.add(boardBacking);
  // 실제 소식은 런타임에 drawBulletinBoard로 갱신
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = BOARD.w; boardCanvas.height = BOARD.h;
  drawBulletinBoard(boardCanvas.getContext('2d'), BOARD.w, BOARD.h, []);
  const boardTexture = new THREE.CanvasTexture(boardCanvas);
  boardTexture.colorSpace = THREE.SRGBColorSpace;
  boardTexture.anisotropy = 8;
  const boardMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(7.0, 4.1),
    new THREE.MeshBasicMaterial({ map: boardTexture })
  );
  boardMesh.position.set(-10.4, 2.15, D / 2 + 0.53);
  root.add(boardMesh);
  // 게시판 하단 받침/난간
  root.add(box(8.6, 0.22, 0.5, MAT.marble, -10.4, -0.05, D / 2 + 0.42, { shadow: false }));
  // 작은 화분 2개
  for (const x of [-14.4, -6.4]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 0.8, 10), MAT.woodDark);
    pot.position.set(x, 0.4, D / 2 + 1.0);
    pot.castShadow = true;
    root.add(pot);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.5, 6), MAT.leaf);
      const a = i * 1.57 + 0.4;
      leaf.position.set(x + Math.cos(a) * 0.24, 1.25, D / 2 + 1.0 + Math.sin(a) * 0.24);
      leaf.rotation.x = Math.sin(a) * 0.3;
      leaf.rotation.z = Math.cos(a) * 0.3;
      root.add(leaf);
    }
  }
  // 게시판 영역(상호작용 범위) — 사용자는 z = D/2+1.2 근처에서 F로 열 수 있음
  const bulletinArea = { x: -10.4, z: D / 2 + 0.6, radius: 2.6 };

  /* 천장 + 보 */
  root.add(box(W + wallT * 2, 0.6, D + wallT * 2, MAT.ceiling, 0, H + 0.3, 0, { shadow: false }));
  for (let z = -14; z <= 14; z += 7) {
    root.add(box(W, 0.7, 0.9, MAT.woodDark, 0, H - 0.35, z, { shadow: false }));
  }

  /* 스테인드글라스 창 (좌우 벽, 각 5개) */
  const glassTex = stainedGlassTexture();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = -12 + i * 6.2;
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 5.6),
        new THREE.MeshBasicMaterial({ map: glassTex })
      );
      win.position.set(side * (W / 2 - 0.02), 8.2, z);
      win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      root.add(win);
      // 창틀 월넛 프레임
      const frame = box(0.25, 6.0, 3.8, MAT.woodDark, side * (W / 2 - 0.12), 8.2, z, { shadow: false });
      root.add(frame);
      win.position.x = side * (W / 2 - 0.26);
    }
  }

  /* 기둥 (측면 2열) */
  for (const side of [-1, 1]) {
    for (const z of [-11, -3.5, 4, 11.5]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, H - 1.2, 18), MAT.marble);
      col.position.set(side * 16.5, (H - 1.2) / 2, z);
      col.castShadow = true; col.receiveShadow = true;
      root.add(col);
      root.add(box(2.3, 0.5, 2.3, MAT.gold, side * 16.5, H - 1.35, z, { shadow: false }));
      obstacles.push({ minX: side * 16.5 - 1.1, maxX: side * 16.5 + 1.1, minZ: z - 1.1, maxZ: z + 1.1 });
    }
  }

  /* ========== 성소(무대) ========== */
  const stageH = 1.15;
  const stage = box(30, stageH, 7.6, MAT.stageTop, 0, stageH / 2, -14.2);
  stage.receiveShadow = true;
  root.add(stage);
  obstacles.push({ minX: -15, maxX: 15, minZ: -18.1, maxZ: -10.4 });
  // 무대 계단 (중앙)
  root.add(box(4.4, 0.4, 1.2, MAT.marble, 0, 0.2, -9.9));
  root.add(box(4.4, 0.75, 0.7, MAT.marble, 0, 0.375, -10.35));

  /* 강대상 + 비둘기 조형(단순화) */
  const pulpit = new THREE.Group();
  pulpit.position.set(0, stageH, -14.6);
  const pBody = box(2.0, 1.7, 1.15, MAT.woodDark, 0, 0.85, 0);
  const pTop = box(2.3, 0.14, 1.3, MAT.gold, 0, 1.75, 0);
  pulpit.add(pBody, pTop);
  root.add(pulpit);
  // 열린 성경(책) — 두 개의 기울어진 판
  const bookL = box(0.78, 0.05, 0.62, MAT.marble, -0.33, stageH + 1.86, -14.6, { ry: 0 });
  bookL.rotation.z = 0.16;
  const bookR = box(0.78, 0.05, 0.62, MAT.marble, 0.33, stageH + 1.86, -14.6);
  bookR.rotation.z = -0.16;
  root.add(bookL, bookR);

  /* 대형 십자가 — 빛나는 중심 */
  const crossGroup = new THREE.Group();
  crossGroup.position.set(0, 8.7, -D / 2 + 0.35);
  const vBeam = box(1.25, 6.4, 0.5, MAT.goldGlow, 0, 0, 0);
  const hBeam = box(4.3, 1.2, 0.5, MAT.goldGlow, 0, 0.95, 0);
  crossGroup.add(vBeam, hBeam);
  root.add(crossGroup);
  // 십자가 후광(발광 평면)
  const haloTex = canvasTexture(makeCanvas(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,232,160,0.95)');
    g.addColorStop(0.4, 'rgba(255,210,120,0.35)');
    g.addColorStop(1, 'rgba(255,210,120,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }));
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 13),
    new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  halo.position.set(0, 8.7, -D / 2 + 0.7);
  root.add(halo);

  /* 십자가 빛줄기 (콘) */
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(6.2, 12, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  beam.position.set(0, 5.4, -D / 2 + 2.6);
  root.add(beam);

  /* 양옆 대형 스크린 */
  const leftScreen = slideTexture(['여의도순복음교회', '신령과 진정으로 예배할 때', '요한복음 4:23']);
  const rightScreen = slideTexture(['오중복음 삼중축복', '순복음의 심장, 성령 충만'], '#a9cdfd');
  for (const [tex, x] of [[leftScreen, -11.5], [rightScreen, 11.5]]) {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 7.6), new THREE.MeshBasicMaterial({ map: tex }));
    scr.position.set(x, 8.6, -D / 2 + 0.32);
    root.add(scr);
    root.add(box(8.1, 8.1, 0.15, MAT.woodDark, x, 8.6, -D / 2 + 0.2, { shadow: false }));
  }

  /* 벽면 성구 레터링 */
  const wallText = new THREE.Mesh(
    new THREE.PlaneGeometry(17, 3.2),
    new THREE.MeshBasicMaterial({ map: wallTextTexture('신령과 진정으로 예배하라'), transparent: true, depthWrite: false })
  );
  wallText.position.set(0, 13.1, -D / 2 + 0.33);
  root.add(wallText);

  /* ========== 장의자(페우) — 중앙 회랑 양쪽 ========== */
  const pewGeoSeat = new THREE.BoxGeometry(9.6, 0.22, 0.62);
  const pewGeoBase = new THREE.BoxGeometry(9.6, 0.5, 0.34);
  const pewGeoBack = new THREE.BoxGeometry(9.6, 0.85, 0.18);
  const pewGeoEnd  = new THREE.BoxGeometry(0.28, 1.25, 1.0);
  // 페우 좌석 목록 — 개별 지정석: 좌측/우측 각 8열 × 9석 = 144석
  const seats = [];
  let seatId = 0;
  // 좌석 간격을 넓혀 앞뒤로 이동 가능하게: 5.0m부터 2.0m 간격, 단계적으로 착석 구간 확장
  const pewStart = 5.0;
  const pewStep = 2.0;
  const pewDepth = 0.8;
  for (const side of [-1, 1]) {
    const cx = side * 8.2;
    for (let row = 0; row < 8; row++) {
      const z = pewStart - row * pewStep;
      for (let col = 0; col < 9; col++) {
        seats.push({ id: seatId++, side, row, col, x: cx + (-3.84 + col * 0.96), y: 0.74, z, face: Math.PI });
      }
    }
  }
  for (const side of [-1, 1]) {
    const cx = side * 8.2;
    for (let row = 0; row < 8; row++) {
      const z = 5.0 - row * 2.0;
      const y = 0.62;
      const seat = new THREE.Mesh(pewGeoSeat, MAT.wood); seat.position.set(cx, y, z);
      const base = new THREE.Mesh(pewGeoBase, MAT.woodDark); base.position.set(cx, 0.28, z + 0.08);
      const back = new THREE.Mesh(pewGeoBack, MAT.wood); back.position.set(cx, 1.12, z + 0.33);
      const endL = new THREE.Mesh(pewGeoEnd, MAT.woodDark); endL.position.set(cx - 4.85, 0.72, z);
      const endR = new THREE.Mesh(pewGeoEnd, MAT.woodDark); endR.position.set(cx + 4.85, 0.72, z);
      for (const m of [seat, base, back, endL, endR]) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
      // 좌석 열 단위 충돌체 — 열 사이 통로는 비워둠
      obstacles.push({ minX: cx - 5.1, maxX: cx + 5.1, minZ: z - 0.45, maxZ: z + 0.45 });
    }
  }

  /* ========== 찬양대석(무대 뒤 계단식) ========== */
  for (let i = 0; i < 3; i++) {
    root.add(box(26 - i * 2, 0.35, 1.1, MAT.woodDark, 0, stageH + 0.18 + i * 0.36, -16.6 + i * 1.15, { shadow: false }));
  }

  /* ========== 샹들리에 ========== */
  const chandelierPositions = [-8, 0, 8];
  for (const [i, z] of chandelierPositions.entries()) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5 - i * 0.15, 0.16, 10, 40), MAT.gold);
    ring.rotation.x = Math.PI / 2;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, H - 10.6, 6), MAT.woodDark);
    cable.position.y = (H - 10.6) / 2 + 0.4;
    g.add(ring, cable);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.4, 8), MAT.marble);
      candle.position.set(Math.cos(a) * (1.5 - i * 0.15), 0.25, Math.sin(a) * (1.5 - i * 0.15));
      g.add(candle);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), MAT.goldGlow);
      flame.position.set(Math.cos(a) * (1.5 - i * 0.15), 0.52, Math.sin(a) * (1.5 - i * 0.15));
      g.add(flame);
    }
    g.position.set(0, 10.4, z);
    root.add(g);
  }

  /* ========== 입구 문 (열린 채로 둔다) ========== */
  for (const side of [-1, 1]) {
    // 양쪽으로 활짝 열린 대문
    const door = box(3.6, 5.8, 0.18, MAT.woodDark, side * 4.9, 2.9, D / 2 - 0.35);
    door.rotation.y = side * 0.55;
    door.castShadow = true;
    root.add(door);
    const a = box(3.0, 5.2, 0.1, new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.38, metalness: 0.55 }), side * 4.55, 2.8, D / 2 - 0.02);
    a.rotation.y = side * 0.85;
    root.add(a);
  }

  /* ========== 기도 촛불 테이블 (입구 우측) ========== */
  const table = new THREE.Group();
  table.position.set(9.5, 0, 14.2);
  table.add(box(3.0, 0.18, 1.5, MAT.marble, 0, 1.02, 0));
  for (const [lx, lz] of [[-1.3, -0.55], [1.3, -0.55], [-1.3, 0.55], [1.3, 0.55]]) {
    table.add(box(0.18, 1.0, 0.18, MAT.gold, lx, 0.5, lz));
  }
  root.add(table);
  obstacles.push({ minX: 7.8, maxX: 11.2, minZ: 13.3, maxZ: 15.1 });
  // 촛불이 놓일 영역 (월드 좌표)
  const candleArea = { x0: 8.5, x1: 10.5, z0: 13.8, z1: 14.7, y: 1.11 };

  /* 화분 (무대 양쪽) */
  for (const x of [-13.2, 13.2]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.45, 0.9, 12), MAT.woodDark);
    pot.position.set(x, 0.45, -9.0);
    pot.castShadow = true;
    root.add(pot);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.3, 6), MAT.leaf);
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 0.3, 1.9, -9.0 + Math.sin(a) * 0.3);
      leaf.rotation.z = Math.cos(a) * 0.28;
      leaf.rotation.x = Math.sin(a) * 0.28;
      leaf.castShadow = true;
      root.add(leaf);
    }
  }

  /* 조명 (성능 고려해 최소화) */
  scene.add(new THREE.HemisphereLight(0xfff6dd, 0x1a2438, 0.95));
  const key = new THREE.DirectionalLight(0xfff2cc, 1.35);
  key.position.set(12, 16, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30; key.shadow.camera.right = 30;
  key.shadow.camera.top = 25; key.shadow.camera.bottom = -25;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const crossLight = new THREE.PointLight(0xffd98a, 60, 30, 2);
  crossLight.position.set(0, 8.7, -D / 2 + 2.2);
  scene.add(crossLight);
  const fill = new THREE.PointLight(0x8fb4ff, 25, 45, 2);
  fill.position.set(0, 12, 10);
  scene.add(fill);

  return {
    obstacles,
    bounds: { minX: -W / 2 + 1.1, maxX: W / 2 - 1.1, minZ: -D / 2 + 1.1, maxZ: D / 2 + FRONT - 1.0 },
    candleArea,
    spawn: new THREE.Vector3(0, 0, 10.5), // 예배당 안에서 시작
    crossPosition: new THREE.Vector3(0, 8.7, -D / 2 + 0.35),
    bulletinArea,
    bulletin: {
      mesh: boardMesh,
      canvas: boardCanvas,
      texture: boardTexture,
      draw(items) {
        drawBulletinBoard(boardCanvas.getContext('2d'), BOARD.w, BOARD.h, items ?? []);
        boardTexture.needsUpdate = true;
      },
    },
    seats,
    dims: { W, D, H, FRONT },
  };
}
