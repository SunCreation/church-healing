import * as THREE from '/vendor/three/three.module.js';

/**
 * 저폴리 아바타 — 캡슐 몸체 + 구체 머리 + 이름표 스프라이트
 */

function nameSprite(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const ctx = c.getContext('2d');
  const text = String(name).slice(0, 12);
  ctx.font = "700 30px 'Noto Sans KR', sans-serif";
  const w = Math.min(244, ctx.measureText(text).width + 36);
  const x = (c.width - w) / 2;
  ctx.fillStyle = 'rgba(10, 20, 32, 0.72)';
  ctx.beginPath();
  ctx.roundRect(x, 10, w, 48, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(216, 180, 90, 0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#faf6ec';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(2.3, 0.65, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * @param {{ color?: string, name?: string }} opts
 * @returns {THREE.Group} userData: { setMoving(bool), setBubble(text|null), bodyMat }
 */
export function createAvatar({ color = '#7fb3ff', name = '성도' } = {}) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x2d211a, roughness: 0.85 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.75, 6, 14), bodyMat);
  body.position.y = 1.02;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 18, 14), skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.325, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.set(0, 1.82, -0.02);
  group.add(hair);

  // 촛불 느낌의 작은 가슴 브로치 (힐링 모티프)
  const brooch = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb84d, emissiveIntensity: 1.6 })
  );
  brooch.position.set(0, 1.28, 0.40);
  group.add(brooch);

  const label = nameSprite(name);
  label.position.y = 2.42;
  group.add(label);

  // 말풍선 (채팅 시 잠깐 표시)
  let bubble = null;
  let bubbleTimer = null;
  function setBubble(text) {
    if (bubble) { group.remove(bubble); bubble.material.map?.dispose(); bubble.material.dispose(); bubble = null; }
    clearTimeout(bubbleTimer);
    if (!text) return;
    bubble = bubbleSprite(text);
    bubble.position.y = 2.95;
    group.add(bubble);
    bubbleTimer = setTimeout(() => setBubble(null), 4200);
  }

  // 걷는 흔들림용 상태
  let moving = false;
  const phase = Math.random() * Math.PI * 2;

  group.userData = {
    setMoving(v) { moving = Boolean(v); },
    setBubble,
    tick(t) {
      if (moving) {
        body.position.y = 1.02 + Math.abs(Math.sin(t * 9 + phase)) * 0.07;
        head.position.y = 1.78 + Math.abs(Math.sin(t * 9 + phase)) * 0.07;
      } else {
        body.position.y = 1.02 + Math.sin(t * 1.6 + phase) * 0.025; // 숨 쉬는 느낌
        head.position.y = 1.78 + Math.sin(t * 1.6 + phase) * 0.025;
      }
    },
  };
  return group;
}

function bubbleSprite(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  const t = String(text).slice(0, 40);
  ctx.font = "500 34px 'Noto Sans KR', sans-serif";
  const w = Math.min(490, ctx.measureText(t).width + 56);
  const x = (c.width - w) / 2;
  ctx.fillStyle = 'rgba(250, 246, 236, 0.96)';
  ctx.beginPath();
  ctx.roundRect(x, 14, w, 78, 20);
  ctx.fill();
  ctx.beginPath(); // 꼬리
  ctx.moveTo(c.width / 2 - 16, 90);
  ctx.lineTo(c.width / 2 + 16, 90);
  ctx.lineTo(c.width / 2, 114);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1d2a47';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(t, c.width / 2, 54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(3.6, 0.9, 1);
  sprite.renderOrder = 11;
  return sprite;
}
