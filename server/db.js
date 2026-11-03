/**
 * JSON 파일 기반 간이 저장소.
 * 운영 환경에서는 SQLite/Postgres로 교체 권장.
 */
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

const DEFAULT_DB = {
  posts: [
    {
      id: 'seed-1',
      category: '간증',
      name: '서초순복음',
      title: '낮기도를 하며 마음의 평안을 얻었어요',
      body: '매일 새벽기도로 하루를 시작하니 하루의 불안이 눈에 띄게 줄었습니다. 함께 기도하며 걷는 이 공간이 너무 감사합니다.',
      likes: 12,
      comments: [
        { id: 'c-seed-1', name: '은혜', body: '함께 기도할게요. 복 많이 받으세요!', createdAt: Date.now() - 1000 * 60 * 60 * 5 },
      ],
      createdAt: Date.now() - 1000 * 60 * 60 * 26,
    },
    {
      id: 'seed-2',
      category: '기도요청',
      name: '은혜로운아침',
      title: '일자리를 찾고 있습니다',
      body: '취업 준비 중인데 지치지 않게 인도해 주시길 기도 부탁드립니다.',
      likes: 8,
      comments: [],
      createdAt: Date.now() - 1000 * 60 * 60 * 9,
    },
    {
      id: 'seed-3',
      category: '감사',
      name: '소망이',
      title: '가족의 수술이 무사히 끝났습니다',
      body: '이곳에서 함께 기도해 주신 분들 모두 감사합니다. 가족 모두 건강 회복 중입니다.',
      likes: 21,
      comments: [
        { id: 'c-seed-2', name: '소금빛', body: '주님께 감사드려요!', createdAt: Date.now() - 1000 * 60 * 60 * 2 },
      ],
      createdAt: Date.now() - 1000 * 60 * 60 * 3,
    },
  ],
  prayers: [
    { id: 'p-seed-1', name: '익명', anonymous: true, body: '직장 동료와의 화해를 위해 기도합니다.', createdAt: Date.now() - 1000 * 60 * 40 },
    { id: 'p-seed-2', name: '김성민', anonymous: false, body: '어머니의 건강과 회복을 위해 기도 부탁드립니다.', createdAt: Date.now() - 1000 * 60 * 120 },
  ],
};

function load() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      save(DEFAULT_DB);
      return structuredClone(DEFAULT_DB);
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_DB), ...parsed };
  } catch (e) {
    console.error('DB 로드 실패, 기본값 사용:', e.message);
    return structuredClone(DEFAULT_DB);
  }
}

function save(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

module.exports = { load, save };
