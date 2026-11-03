/**
 * 빛의 성전 — 서버
 * - Express: 정적 파일 + REST API (묵상 말씀 / 커뮤니티 / 기도요청 / 촛불)
 * - WebSocket(`/ws`): 3D 공간 실시간 아바타 위치 동기화 + 채팅 + 촛불 브로드캐스트
 *
 * 실행: npm start  → http://localhost:8787
 */
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { load, save } = require('./db');

const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, '..');

const db = load();
let candleCount = 0;
let saveTimer = null;
/** 변경 시 500ms 디바운스로 디스크에 저장 */
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(db), 500);
}

// ---------- Express ----------
const app = express();
app.use(express.json({ limit: '256kb' }));

// three.js 모듈을 번들러 없이 브라우저에 제공
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules', 'three', 'build')));
app.use(express.static(path.join(ROOT, 'public')));

const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const clampStr = (s, max) => String(s ?? '').trim().slice(0, max);

/** 오늘의 말씀 (날짜 기반 로테이션) */
const VERSES = [
  { text: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라.', ref: '빌립보서 4:13' },
  { text: '수고하고 무거운 짐 진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라.', ref: '마태복음 11:28' },
  { text: '아무 염려도 하지 말고 오직 모든 일에 기도와 간구로, 너희 구할 것을 감사함으로 하나님께 아뢰라.', ref: '빌립보서 4:6' },
  { text: '여호와는 나의 목자시니 내게 부족함이 없으리로다.', ref: '시편 23:1' },
  { text: '하나님은 우리의 피난처시요 힘이시니 환난 중에 만날 큰 도움이시라.', ref: '시편 46:1' },
  { text: '네 마음을 다하고 네 뜻을 다하여 여호와를 의뢰하고 네 지식을 의존하지 말라.', ref: '잠언 3:5' },
  { text: '오직 여호와를 앙망하는 자는 새 힘을 얻으리니 독수리가 날개치며 올라감 같을 것이요.', ref: '이사야 40:31' },
  { text: '평안을 너희에게 끼치노니 곧 나의 평안을 너희에게 주노라 내가 너희에게 주는 것은 세상이 주는 것 같지 아니하니라.', ref: '요한복음 14:27' },
  { text: '나에게 이르신 내 은혜가 족하도다 이는 내 능력이 약한 데서 온전하여짐이라.', ref: '고린도후서 12:9' },
  { text: '상심한 자에게는 마음을 고치시고 통증을 싸매시며.', ref: '시편 147:3' },
  { text: '너희 염려를 다 주께 맡겨 버리라 이는 저가 너희를 권고하심이라.', ref: '베드로전서 5:7' },
  { text: '나 여호와가 말하노라 너희를 향한 나의 생각은 내가 아나니 평안이요 재앙이 아니니라 너희에게 장래와 희망을 주는 것이니라.', ref: '예레미야 29:11' },
];

/** 예배 안내 (여의도순복음교회 공식 정보 요약 — 변경될 수 있으므로 UI에서 공식 링크 병행 표기) */
const WORSHIP_SCHEDULE = [
  { name: '주일예배 1부', time: '주일 오전 7:00', place: '대성전' },
  { name: '주일예배 2부', time: '주일 오전 9:00', place: '대성전' },
  { name: '주일예배 3부', time: '주일 오전 11:00', place: '대성전' },
  { name: '주일예배 4부', time: '주일 오후 1:00', place: '대성전' },
  { name: '주일예배 5부(대학청년)', time: '주일 오후 2:30', place: '대성전' },
  { name: '주일저녁예배', time: '주일 오후 5:00', place: '대성전' },
  { name: '수요예배', time: '수 오전 10:30 · 오후 7:30', place: '대성전' },
  { name: '금요성령대망회', time: '금 오후 8:30', place: '대성전' },
  { name: '새벽예배', time: '월~금 오전 5:30 · 6:30', place: '대성전 / 예루살렘성전' },
  { name: '토요예배', time: '토 오전 7:00', place: '대성전' },
];

const OFFICIAL_LINKS = {
  site: 'https://yfgc.fgtv.com/y2/02.asp',
  youtube: 'https://www.youtube.com/@YFGCFGTV',
  youtubeLiveEmbed: 'https://www.youtube.com/embed/videoseries?list=PLaMcIb0DJ7THbXrf6TR6fbUu6LmyRtc_L',
  address: '서울특별시 영등포구 국회대로 76길 15 (여의도동 11번지)',
  tel: '02-6181-9191',
};

app.get('/api/health', (_req, res) => res.json({ ok: true, players: players.size }));

app.get('/api/verse', (_req, res) => {
  const now = new Date();
  const dayIndex = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  res.json({ ...VERSES[dayIndex % VERSES.length], indexes: VERSES.length });
});

app.get('/api/schedule', (_req, res) => res.json({ worship: WORSHIP_SCHEDULE, official: OFFICIAL_LINKS }));

app.get('/api/posts', (req, res) => {
  const category = clampStr(req.query.category, 20);
  let list = [...db.posts].sort((a, b) => b.createdAt - a.createdAt);
  if (category && category !== '전체') list = list.filter((p) => p.category === category);
  res.json(list);
});

app.post('/api/posts', (req, res) => {
  const { name, category, title, body } = req.body || {};
  const t = clampStr(title, 120);
  const b = clampStr(body, 4000);
  if (!t || !b) return res.status(400).json({ error: '제목과 내용은 필수입니다.' });
  const post = {
    id: uid('post'),
    category: ['간증', '기도요청', '감사', '위로', '자유'].includes(category) ? category : '자유',
    name: clampStr(name, 30) || '순복음성도',
    title: t,
    body: b,
    likes: 0,
    comments: [],
    createdAt: Date.now(),
  };
  db.posts.push(post);
  persist();
  res.status(201).json(post);
});

app.post('/api/posts/:id/like', (req, res) => {
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  post.likes += 1;
  persist();
  res.json({ id: post.id, likes: post.likes });
});

app.post('/api/posts/:id/comments', (req, res) => {
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  const body = clampStr(req.body?.body, 1000);
  if (!body) return res.status(400).json({ error: '댓글 내용은 필수입니다.' });
  const comment = { id: uid('cmt'), name: clampStr(req.body?.name, 30) || '순복음성도', body, createdAt: Date.now() };
  post.comments.push(comment);
  persist();
  res.status(201).json(comment);
});

app.get('/api/prayers', (_req, res) => {
  const list = [...db.prayers].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
  res.json(list);
});

app.post('/api/prayers', (req, res) => {
  const body = clampStr(req.body?.body, 1000);
  if (!body) return res.status(400).json({ error: '기도제목을 입력해 주세요.' });
  const anonymous = Boolean(req.body?.anonymous);
  const prayer = {
    id: uid('pray'),
    name: anonymous ? '익명' : clampStr(req.body?.name, 30) || '순복음성도',
    anonymous,
    body,
    createdAt: Date.now(),
  };
  db.prayers.push(prayer);
  persist();
  res.status(201).json(prayer);
});

/** 촛불 켜기 — REST로 접수받아 WebSocket으로 전 사용자에게 브로드캐스트 */
app.post('/api/candle', (req, res) => {
  const note = clampStr(req.body?.note, 200);
  const name = clampStr(req.body?.name, 30) || '익명';
  const candle = { id: uid('cndl'), note, name, createdAt: Date.now() };
  candleCount += 1;
  broadcast({ t: 'candle', candle });
  res.status(201).json(candle);
});

// ---------- HTTP + WebSocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** @type {Map<string, {id:string,name:string,color:string,x:number,z:number,rot:number,moving:boolean}>} */
const players = new Map();

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(payload, exceptId = null) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState !== client.OPEN) continue;
    if (exceptId && client.meta?.id === exceptId) continue;
    client.send(data);
  }
}

const SPAWN = { x: 0, z: 14 }; // 입구 쪽에서 시작

wss.on('connection', (ws) => {
  let joined = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { t: 'error', message: '잘못된 메시지 형식입니다.' });
    }

    if (msg.t === 'join') {
      const name = clampStr(msg.name, 20) || '성도';
      const color = /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : '#7fb3ff';
      const player = { id: uid('usr'), name, color, x: SPAWN.x, z: SPAWN.z, rot: Math.PI, moving: false };
      joined = player;
      ws.meta = { id: player.id };
      players.set(player.id, player);
      send(ws, { t: 'welcome', you: player, players: [...players.values()].filter((p) => p.id !== player.id), candleCount });
      broadcast({ t: 'join', player }, player.id);
      console.log(`[+] ${name} 입장 (현재 ${players.size}명)`);
      return;
    }

    if (!joined) return;

    if (msg.t === 'pos') {
      const p = players.get(joined.id);
      if (!p) return;
      p.x = Number.isFinite(msg.x) ? Math.max(-27, Math.min(27, msg.x)) : p.x;
      p.z = Number.isFinite(msg.z) ? Math.max(-17, Math.min(17, msg.z)) : p.z;
      p.rot = Number.isFinite(msg.rot) ? msg.rot : p.rot;
      p.moving = Boolean(msg.moving);
      broadcast({ t: 'pos', id: p.id, x: p.x, z: p.z, rot: p.rot, moving: p.moving }, p.id);
      return;
    }

    if (msg.t === 'chat') {
      const text = clampStr(msg.text, 200);
      if (!text) return;
      broadcast({ t: 'chat', id: joined.id, name: joined.name, text, at: Date.now() });
      return;
    }
  });

  ws.on('close', () => {
    if (!joined) return;
    players.delete(joined.id);
    broadcast({ t: 'leave', id: joined.id, name: joined.name });
    console.log(`[-] ${joined.name} 퇴장 (현재 ${players.size}명)`);
  });

  ws.on('error', () => {});
});

server.listen(PORT, () => {
  console.log(`\n빛의 성전 서버 실행 중 → http://localhost:${PORT}\n`);
});
