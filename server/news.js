/**
 * 공식 소스: 신도교회(shindoch.org) 공지사항 + 주보 목록 프록시
 * - 공지사항: /documents?moduleId=e0101&permissionsOnly=0  (게시판 경로 /main/e0101/board)
 * - 주보:     /documents?moduleId=e04&permissionsOnly=0    (게시판 경로 /main/e04/board)
 * - 본문/이미지는 재배포하지 않고, 제목·날짜와 공식 페이지 링크만 제공한다.
 */

const SITE = 'https://www.shindoch.org';
const CACHE_MS = 10 * 60 * 1000;

const SOURCES = [
  {
    key: 'notice',
    label: '공지사항',
    listUrl: `${SITE}/documents?moduleId=e0101&permissionsOnly=0`,
    boardUrl: `${SITE}/main/e0101/board`,
  },
  {
    key: 'bulletin',
    label: '주보',
    listUrl: `${SITE}/documents?moduleId=e04&permissionsOnly=0`,
    boardUrl: `${SITE}/main/e04/board`,
  },
];

let cache = { at: 0, data: null };
let pending = null;

const formatDate = (raw) => {
  const s = String(raw ?? '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : s.slice(0, 10);
};

/** 문서 목록을 날짜 내림차순으로 정리하고 필요한 필드만 남긴다 */
function parseDocuments(json, source) {
  if (!Array.isArray(json?.documents)) throw new Error('invalid official document list');
  const docs = json.documents;
  return docs
    .filter((doc) => doc && typeof doc.title === 'string' && /^\d+$/.test(String(doc.document_idx))
      && doc.read_allowed === true && doc.is_secret === false)
    .map((doc) => ({
      id: String(doc.document_idx),
      kind: source.key,
      date: formatDate(doc.reg_date || doc.regi_date),
      title: String(doc.title).replace(/\s+/g, ' ').trim(),
      url: `${source.boardUrl}/${doc.document_idx}`,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 10);
}

async function fetchGroup(source) {
  try {
    const res = await fetch(source.listUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; ShindoChurchHealing/1.0)',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`official source ${res.status}`);
    const json = await res.json();
    return {
      key: source.key,
      label: source.label,
      sourceUrl: source.boardUrl,
      items: parseDocuments(json, source),
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.warn(`신도교회 ${source.label} fetch 실패:`, err.message);
    const previous = cache.data?.groups.find((group) => group.key === source.key);
    return {
      key: source.key,
      label: source.label,
      sourceUrl: source.boardUrl,
      items: previous?.items ?? [],
      fetchedAt: previous?.fetchedAt ?? 0,
      stale: Boolean(previous?.fetchedAt),
      error: `${source.label}을 불러오지 못했습니다.`,
    };
  }
}

/** @returns {Promise<{source:string, sourceUrl:string, official:boolean, fetchedAt:number, groups:Array, items:Array}>} */
async function getNews() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  if (!pending) {
    pending = (async () => {
      const groups = await Promise.all(SOURCES.map(fetchGroup));
      const times = groups.map((g) => g.fetchedAt).filter(Boolean);
      const data = {
        source: '신도교회',
        sourceUrl: `${SITE}/main/e0101/board`,
        official: true,
        fetchedAt: times.length ? Math.min(...times) : 0,
        groups,
        items: groups.flatMap((g) => g.items),
      };
      // 실패 응답도 잠시 캐시해 공식 사이트에 재시도가 몰리지 않게 한다.
      cache = { at: Date.now(), data };
      return data;
    })().finally(() => { pending = null; });
  }
  return pending;
}

module.exports = { getNews };
