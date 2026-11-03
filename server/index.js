/**
 * 신도교회 — 서버
 * - Express: 정적 파일 + REST API (묵상 말씀 / 커뮤니티 / 기도요청 / 촛불 / 공식 소식)
 * - WebSocket(`/ws`): 3D 공간 실시간 아바타 위치 동기화 + 채팅 + 촛불 브로드캐스트
 *
 * 실행: npm start  → http://localhost:8787
 * DATABASE_URL이 있으면 Neon/Lakebase Postgres, 없으면 로컬 JSON 저장소.
 */
const path = require('path');
const fs = require('fs');
const http = require('http');

// 로컬 개발: .env.local / .env 로드 (운영에서는 플랫폼이 환경변수를 주입)
if (!process.env.DATABASE_URL) {
  for (const file of ['.env.local', '.env']) {
    try {
      if (fs.existsSync(file)) process.loadEnvFile(file);
    } catch (e) {
      console.warn(`${file} 로드 실패:`, e.message);
    }
  }
}

const express = require('express');
const { WebSocketServer } = require('ws');
const { createStore, uid } = require('./store');
const { getNews } = require('./news');

const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, '..');

const store = createStore();

// ---------- Express 공통 ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render 등 리버스 프록시 뒤에서 실제 클라이언트 IP 사용
app.use(express.json({ limit: '256kb' }));

// 보안 헤더 (CSP는 YouTube 예배 영상 임베드만 허용)
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self' ws: wss:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; frame-ancestors 'self'; object-src 'none'; base-uri 'self';"
  );
  next();
});

// three.js 모듈을 번들러 없이 브라우저에 제공
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules', 'three', 'build')));
app.use(express.static(path.join(ROOT, 'public')));

/* ---------- 간이 레이트리밋 (메모리, 단일 인스턴스 기준) ---------- */
const rateBuckets = new Map();
/** 1분 창 고정; 키별로 max회 허용 */
function rateLimit(maxPerMinute, label) {
  return (req, res, next) => {
    const now = Date.now();
    const window = Math.floor(now / 60000);
    const key = `${label}:${window}:${req.ip}`;
    const count = (rateBuckets.get(key) || 0) + 1;
    rateBuckets.set(key, count);
    if (rateBuckets.size > 5000) {
      // 오래된 창 정리
      for (const k of rateBuckets.keys()) {
        const w = Number(k.split(':')[1]);
        if (w < window - 1) rateBuckets.delete(k);
      }
    }
    if (count > maxPerMinute) {
      res.set('Retry-After', '60');
      return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후에 다시 시도해 주세요.' });
    }
    next();
  };
}
const limitWrites = rateLimit(60, 'writes');
const limitCandle = rateLimit(15, 'candle');
const limitPosts = rateLimit(30, 'posts');
const limitApi = rateLimit(600, 'api');

const clampStr = (s, max) => String(s ?? '').trim().slice(0, max);
const asyncHandle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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

/** 예배 안내 (신도교회 공식 홈페이지 요약 — 변경될 수 있으므로 UI에서 공식 링크 병행 표기) */
const WORSHIP_SCHEDULE = [
  { name: '주일낮예배 1부', time: '주일 오전 7:30', place: '본당' },
  { name: '주일낮예배 2부', time: '주일 오전 9:00', place: '본당' },
  { name: '주일낮예배 3부', time: '주일 오전 11:00', place: '본당' },
  { name: '주일낮예배 4부', time: '주일 오후 2:00', place: '소예배실' },
  { name: '오후 찬양예배', time: '주일 오후 2:00', place: '본당' },
  { name: '새벽기도회', time: '월~금 오전 5:30', place: '본당' },
  { name: '수요기도회', time: '수요일 저녁 7:30', place: '본당' },
  { name: '금요기도회', time: '금요일 밤 9:00', place: '본당' },
  { name: '목장모임', time: '주일 (월 1회)', place: '각 목장별' },
];

const OFFICIAL_LINKS = {
  site: 'https://www.shindoch.org',
  youtube: 'https://www.youtube.com/channel/UC7Ko6OUkjH0gThOqEBFRCNA',
  youtubeLiveEmbed: 'https://www.youtube.com/embed/live_stream?channel=UC7Ko6OUkjH0gThOqEBFRCNA',
  youtubeUploadsEmbed: 'https://www.youtube.com/embed/videoseries?list=UU7Ko6OUkjH0gThOqEBFRCNA',
  noticeUrl: 'https://www.shindoch.org/main/e0101/board',
  bulletinUrl: 'https://www.shindoch.org/main/e04/board',
  worshipUrl: 'https://www.shindoch.org/main/a03',
  address: '서울특별시 구로구 구일로2길 45 (구로동)',
  tel: '02-869-6747',
  tel2: '02-869-6748',
  tel3: '02-868-9191',
  pastorTel: '02-839-1009',
};

app.get('/api/health', (_req, res) => res.json({ ok: true, players: players.size, storage: store.name }));

app.get('/api/verse', (_req, res) => {
  const now = new Date();
  const dayIndex = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  res.json({ ...VERSES[dayIndex % VERSES.length], indexes: VERSES.length });
});

app.get('/api/schedule', (_req, res) => res.json({ worship: WORSHIP_SCHEDULE, official: OFFICIAL_LINKS }));

app.get('/api/news', asyncHandle(async (_req, res) => res.json(await getNews())));

app.get('/api/posts', limitApi, asyncHandle(async (req, res) => {
  const category = clampStr(req.query.category, 20);
  res.json(await store.listPosts(category));
}));

app.post('/api/posts', limitPosts, asyncHandle(async (req, res) => {
  const { name, category, title, body } = req.body || {};
  const t = clampStr(title, 120);
  const b = clampStr(body, 4000);
  if (!t || !b) return res.status(400).json({ error: '제목과 내용은 필수입니다.' });
  const post = {
    id: uid('post'),
    category: ['간증', '기도요청', '감사', '위로', '자유'].includes(category) ? category : '자유',
    name: clampStr(name, 30) || '신도성도',
    title: t,
    body: b,
    createdAt: Date.now(),
  };
  res.status(201).json(await store.createPost(post));
}));

app.post('/api/posts/:id/like', limitWrites, asyncHandle(async (req, res) => {
  const result = await store.likePost(req.params.id);
  if (!result) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  res.json(result);
}));

app.post('/api/posts/:id/comments', limitPosts, asyncHandle(async (req, res) => {
  const body = clampStr(req.body?.body, 1000);
  if (!body) return res.status(400).json({ error: '댓글 내용은 필수입니다.' });
  const comment = { id: uid('cmt'), name: clampStr(req.body?.name, 30) || '신도성도', body, createdAt: Date.now() };
  const saved = await store.addComment(req.params.id, comment);
  if (!saved) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  res.status(201).json(saved);
}));

app.get('/api/prayers', limitApi, asyncHandle(async (_req, res) => {
  res.json(await store.listPrayers());
}));

app.post('/api/prayers', limitWrites, asyncHandle(async (req, res) => {
  const body = clampStr(req.body?.body, 1000);
  if (!body) return res.status(400).json({ error: '기도제목을 입력해 주세요.' });
  const anonymous = Boolean(req.body?.anonymous);
  const prayer = {
    id: uid('pray'),
    name: anonymous ? '익명' : clampStr(req.body?.name, 30) || '신도성도',
    anonymous,
    body,
    createdAt: Date.now(),
  };
  res.status(201).json(await store.createPrayer(prayer));
}));

/** 촛불 켜기 — REST로 접수받아 WebSocket으로 전 사용자에게 브로드캐스트 */
app.post('/api/candle', limitCandle, asyncHandle(async (req, res) => {
  const note = clampStr(req.body?.note, 200);
  const name = clampStr(req.body?.name, 30) || '익명';
  const candle = { id: uid('cndl'), note, name, createdAt: Date.now() };
  const count = await store.addCandle(candle);
  broadcast({ t: 'candle', candle, candleCount: count });
  res.status(201).json({ ...candle, candleCount: count });
}));

// ---------- HTTP + WebSocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** @type {Map<string, {id:string,name:string,color:string,x:number,z:number,rot:number,moving:boolean,y:number,seat:number|null}>} */
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

const SPAWN = { x: 0, z: 10.5 };

wss.on('connection', (ws) => {
  let joined = null;
  // 채팅 레이트리밋: 연결당 10초에 5회
  const chatWindow = { started: 0, count: 0 };

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
      const player = { id: uid('usr'), name, color, x: SPAWN.x, z: SPAWN.z, rot: Math.PI, moving: false, y: 0, seat: null };
      joined = player;
      ws.meta = { id: player.id };
      players.set(player.id, player);
      store.countCandles()
        .then((candleCount) => {
          send(ws, { t: 'welcome', you: player, players: [...players.values()].filter((p) => p.id !== player.id), candleCount });
        })
        .catch(() => send(ws, { t: 'welcome', you: player, players: [], candleCount: 0 }));
      broadcast({ t: 'join', player }, player.id);
      console.log(`[+] ${name} 입장 (현재 ${players.size}명)`);
      return;
    }

    if (!joined) return;

    if (msg.t === 'pos') {
      const p = players.get(joined.id);
      if (!p) return;
      p.x = Number.isFinite(msg.x) ? Math.max(-27, Math.min(27, msg.x)) : p.x;
      p.z = Number.isFinite(msg.z) ? Math.max(-17, Math.min(26.8, msg.z)) : p.z;
      p.rot = Number.isFinite(msg.rot) ? msg.rot : p.rot;
      p.moving = Boolean(msg.moving);
      p.y = Number.isFinite(msg.y) ? Math.max(0, Math.min(2, msg.y)) : p.y;
      p.seat = Number.isInteger(msg.seat) ? Math.max(0, Math.min(143, msg.seat)) : (msg.seat === null ? null : p.seat);
      broadcast({ t: 'pos', id: p.id, x: p.x, z: p.z, rot: p.rot, moving: p.moving, y: p.y, seat: p.seat }, p.id);
      return;
    }

    if (msg.t === 'chat') {
      const now = Date.now();
      if (now - chatWindow.started > 10000) {
        chatWindow.started = now;
        chatWindow.count = 0;
      }
      chatWindow.count += 1;
      if (chatWindow.count > 5) {
        return send(ws, { t: 'error', message: '채팅은 잠깐 쉬었다가 보내주세요.' });
      }
      const text = clampStr(msg.text, 200);
      if (!text) return;
      broadcast({ t: 'chat', id: joined.id, name: joined.name, text, at: Date.now() });
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

// 알 수 없는 API 라우트는 JSON 404
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// 에러 핸들러: 내부 정보를 노출하지 않음
app.use((err, _req, res, _next) => {
  console.error('unhandled error:', err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

store
  .init()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`\n신도교회 서버 실행 중 → http://localhost:${PORT}\n`);
    });
  })
  .catch((err) => {
    console.error('저장소 초기화 실패:', err);
    process.exit(1);
  });
