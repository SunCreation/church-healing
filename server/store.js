/**
 * 저장소 팩토리
 * - DATABASE_URL이 있으면 Neon/Lakebase Postgres (pg.Pool, 파라미터 바인딩)
 * - 없으면 로컬 JSON 파일 (개발/오프라인용)
 *
 * 모든 메서드는 async. 애플리케이션 트래픽은 풀링된 DATABASE_URL(pgbouncer) 사용,
 * 스키마 생성/시드는 init()에서 idempotent하게 수행한다.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const SEED_POSTS = [
  {
    id: 'seed-1', category: '간증', name: '구로동성도',
    title: '낮기도를 하며 마음의 평안을 얻었어요',
    body: '매일 새벽기도로 하루를 시작하니 하루의 불안이 눈에 띄게 줄었습니다. 함께 기도하며 걷는 이 공간이 너무 감사합니다.',
    likes: 12, createdAt: Date.now() - 1000 * 60 * 60 * 26,
    comments: [{ id: 'c-seed-1', name: '은혜', body: '함께 기도할게요. 복 많이 받으세요!', createdAt: Date.now() - 1000 * 60 * 60 * 5 }],
  },
  {
    id: 'seed-2', category: '기도요청', name: '은혜로운아침',
    title: '일자리를 찾고 있습니다',
    body: '취업 준비 중인데 지치지 않게 인도해 주시길 기도 부탁드립니다.',
    likes: 8, createdAt: Date.now() - 1000 * 60 * 60 * 9, comments: [],
  },
  {
    id: 'seed-3', category: '감사', name: '소망이',
    title: '가족의 수술이 무사히 끝났습니다',
    body: '이곳에서 함께 기도해 주신 분들 모두 감사합니다. 가족 모두 건강 회복 중입니다.',
    likes: 21, createdAt: Date.now() - 1000 * 60 * 60 * 3,
    comments: [{ id: 'c-seed-2', name: '소금빛', body: '주님께 감사드려요!', createdAt: Date.now() - 1000 * 60 * 60 * 2 }],
  },
];
const SEED_PRAYERS = [
  { id: 'p-seed-1', name: '익명', anonymous: true, body: '직장 동료와의 화해를 위해 기도합니다.', createdAt: Date.now() - 1000 * 60 * 40 },
  { id: 'p-seed-2', name: '김성민', anonymous: false, body: '어머니의 건강과 회복을 위해 기도 부탁드립니다.', createdAt: Date.now() - 1000 * 60 * 120 },
];

/* =========================================================
   JSON (로컬 개발용)
   ========================================================= */
function createJsonStore() {
  let db = null;
  let saveTimer = null;

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
        const tmp = DB_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
        fs.renameSync(tmp, DB_FILE);
      } catch (e) {
        console.error('DB 저장 실패:', e.message);
      }
    }, 500);
  }

  return {
    name: 'json',
    async init() {
      try {
        if (fs.existsSync(DB_FILE)) {
          db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        }
      } catch (e) {
        console.error('DB 로드 실패, 시드 사용:', e.message);
        db = null;
      }
      if (!db) {
        db = { posts: structuredClone(SEED_POSTS), prayers: structuredClone(SEED_PRAYERS), candles: [] };
        persist();
      }
      db.posts ||= []; db.prayers ||= []; db.candles ||= [];
    },
    async listPosts(category) {
      let list = [...db.posts].sort((a, b) => b.createdAt - a.createdAt);
      if (category && category !== '전체') list = list.filter((p) => p.category === category);
      return list.map((p) => ({ ...p, comments: p.comments ?? [] }));
    },
    async createPost(post) {
      db.posts.push({ ...post, comments: [] });
      persist();
      return { ...post, comments: [] };
    },
    async likePost(id) {
      const post = db.posts.find((p) => p.id === id);
      if (!post) return null;
      post.likes = (post.likes ?? 0) + 1;
      persist();
      return { id: post.id, likes: post.likes };
    },
    async addComment(postId, comment) {
      const post = db.posts.find((p) => p.id === postId);
      if (!post) return null;
      post.comments ||= [];
      post.comments.push(comment);
      persist();
      return comment;
    },
    async listPrayers() {
      return [...db.prayers].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
    },
    async createPrayer(prayer) {
      db.prayers.push(prayer);
      persist();
      return prayer;
    },
    async addCandle(candle) {
      db.candles.push(candle);
      persist();
      return db.candles.length;
    },
    async countCandles() {
      return db.candles.length;
    },
  };
}

/* =========================================================
   Postgres (Neon/Lakebase)
   ========================================================= */
/** Neon 권장 SSL 의미론: `sslmode=require` → `verify-full`로 승격 (경고 방지) */
function normalizeSslMode(url) {
  try {
    const u = new URL(url);
    const mode = u.searchParams.get('sslmode');
    if (mode && mode !== 'verify-full') u.searchParams.set('sslmode', 'verify-full');
    return u.toString();
  } catch {
    return url; // 로컬/사내 postgres 등 — 원본 그대로
  }
}

function createPostgresStore(url) {
  const pool = new Pool({
    connectionString: normalizeSslMode(url),
    max: 4,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
  });
  pool.on('error', (err) => console.error('pg pool error:', err.message));

  const query = (text, params) => pool.query(text, params);

  return {
    name: 'postgres',
    async init() {
      // 스키마 (멱등)
      await query(`
        CREATE TABLE IF NOT EXISTS posts (
          id         text PRIMARY KEY,
          category   text NOT NULL,
          name       text NOT NULL,
          title      text NOT NULL,
          body       text NOT NULL,
          likes      integer NOT NULL DEFAULT 0,
          created_at bigint NOT NULL
        );
        CREATE TABLE IF NOT EXISTS comments (
          id         text PRIMARY KEY,
          post_id    text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          name       text NOT NULL,
          body       text NOT NULL,
          created_at bigint NOT NULL
        );
        CREATE INDEX IF NOT EXISTS comments_post_id_idx ON comments(post_id);
        CREATE TABLE IF NOT EXISTS prayers (
          id         text PRIMARY KEY,
          name       text NOT NULL,
          anonymous  boolean NOT NULL DEFAULT false,
          body       text NOT NULL,
          created_at bigint NOT NULL
        );
        CREATE TABLE IF NOT EXISTS candles (
          id         text PRIMARY KEY,
          name       text NOT NULL,
          note       text,
          created_at bigint NOT NULL
        );
      `);
      // 시드: posts가 비어 있을 때만
      const { rows } = await query('SELECT COUNT(*)::int AS c FROM posts');
      if (rows[0].c === 0) {
        for (const p of SEED_POSTS) {
          await query(
            'INSERT INTO posts (id, category, name, title, body, likes, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [p.id, p.category, p.name, p.title, p.body, p.likes, p.createdAt]
          );
          for (const c of p.comments) {
            await query(
              'INSERT INTO comments (id, post_id, name, body, created_at) VALUES ($1,$2,$3,$4,$5)',
              [c.id, p.id, c.name, c.body, c.createdAt]
            );
          }
        }
        for (const p of SEED_PRAYERS) {
          await query(
            'INSERT INTO prayers (id, name, anonymous, body, created_at) VALUES ($1,$2,$3,$4,$5)',
            [p.id, p.name, p.anonymous, p.body, p.createdAt]
          );
        }
        console.log('Neon seed inserted');
      }
    },
    async listPosts(category) {
      const params = [];
      let where = '';
      if (category && category !== '전체') {
        params.push(category);
        where = 'WHERE category = $1';
      }
      const { rows } = await query(
        `SELECT id, category, name, title, body, likes, created_at AS "createdAt" FROM posts ${where} ORDER BY created_at DESC`,
        params
      );
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      const { rows: commentRows } = await query(
        `SELECT id, post_id AS "postId", name, body, created_at AS "createdAt" FROM comments WHERE post_id = ANY($1::text[]) ORDER BY created_at ASC`,
        [ids]
      );
      const byPost = new Map();
      for (const c of commentRows) {
        (byPost.get(c.postId) || byPost.set(c.postId, []).get(c.postId)).push(c);
      }
      return rows.map((r) => ({ ...r, comments: byPost.get(r.id) ?? [] }));
    },
    async createPost(post) {
      await query(
        'INSERT INTO posts (id, category, name, title, body, likes, created_at) VALUES ($1,$2,$3,$4,$5,0,$6)',
        [post.id, post.category, post.name, post.title, post.body, post.createdAt]
      );
      return { ...post, likes: 0, comments: [] };
    },
    async likePost(id) {
      const { rows } = await query('UPDATE posts SET likes = likes + 1 WHERE id = $1 RETURNING likes', [id]);
      return rows[0] ? { id, likes: rows[0].likes } : null;
    },
    async addComment(postId, comment) {
      const exists = await query('SELECT 1 FROM posts WHERE id = $1', [postId]);
      if (exists.rowCount === 0) return null;
      await query(
        'INSERT INTO comments (id, post_id, name, body, created_at) VALUES ($1,$2,$3,$4,$5)',
        [comment.id, postId, comment.name, comment.body, comment.createdAt]
      );
      return comment;
    },
    async listPrayers() {
      const { rows } = await query(
        'SELECT id, name, anonymous, body, created_at AS "createdAt" FROM prayers ORDER BY created_at DESC LIMIT 100'
      );
      return rows;
    },
    async createPrayer(prayer) {
      await query(
        'INSERT INTO prayers (id, name, anonymous, body, created_at) VALUES ($1,$2,$3,$4,$5)',
        [prayer.id, prayer.name, prayer.anonymous, prayer.body, prayer.createdAt]
      );
      return prayer;
    },
    async addCandle(candle) {
      await query('INSERT INTO candles (id, name, note, created_at) VALUES ($1,$2,$3,$4)', [
        candle.id, candle.name, candle.note ?? null, candle.createdAt,
      ]);
      return this.countCandles();
    },
    async countCandles() {
      const { rows } = await query('SELECT COUNT(*)::int AS c FROM candles');
      return rows[0].c;
    },
  };
}

function createStore() {
  const url = process.env.DATABASE_URL;
  if (url) {
    console.log('[store] Neon/Lakebase Postgres');
    return createPostgresStore(url);
  }
  console.log('[store] DATABASE_URL 없음 → 로컬 JSON (data/db.json)');
  return createJsonStore();
}

module.exports = { createStore, uid };
