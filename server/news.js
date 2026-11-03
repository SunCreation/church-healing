/**
 * 공식 소스: 여의도순복음교회 FGTV "순복음소식" 목록 프록시
 * - https://www.fgtv.com/fgtv/f5/01_listview.asp 에서 날짜/제목/영상 번호를 추출
 * - 본문/영상은 재배포하지 않고, 공식 페이지로 연결하는 링크만 제공한다.
 */

const LIST_URL = 'https://www.fgtv.com/fgtv/f5/01_listview.asp';
const DETAIL_URL = 'https://www.fgtv.com/fgtv/f5/01.asp?selected_num=';
const CACHE_MS = 10 * 60 * 1000;

let cache = { at: 0, data: null };

function parseList(html) {
  const items = [];
  const re = /<td>(20\d\d\.\d{2}\.\d{2}\.)<\/td>[\s\S]*?<a[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null && items.length < 10) {
    // 같은 블록의 hdtit에는 `날짜//제목//파일//번호` 형태로 영상 번호가 있다.
  }
  // hdtit 텍스트와 a링크를 같은 행 단위로 순서대로 매칭한다 (공식 페이지 구조 고정)
  const rows = html.split(/<tr id="hdplay\d+">/).slice(1);
  for (const row of rows) {
    const titleMatch = row.match(/<span id="hdtit\d+"[^>]*>([^<]+)<\/span>/);
    if (!titleMatch) continue;
    const parts = titleMatch[1].split('//');
    if (parts.length < 4) continue;
    const [dateRaw, , , videoId] = parts;
    const linkText = row.match(/<a[^>]*>([^<]+)<\/a>/);
    const title = (linkText?.[1] ?? parts[1]).trim();
    items.push({ date: dateRaw.replace(/\.$/, ''), title, videoId, url: `${DETAIL_URL}${videoId}` });
    if (items.length >= 10) break;
  }
  return items;
}

/** @returns {Promise<{source:string, sourceUrl:string, items:Array, fetchedAt:number}>} */
async function getNews() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  try {
    const res = await fetch(LIST_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`official source ${res.status}`);
    const html = await res.text();
    const data = {
      source: '순복음소식',
      sourceUrl: 'https://www.fgtv.com/fgtv/f5/0101.asp',
      official: true,
      fetchedAt: Date.now(),
      items: parseList(html),
    };
    cache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.warn('공식 소식 fetch 실패, 캐시 사용:', err.message);
    if (cache.data) return cache.data;
    return { source: '순복음소식', sourceUrl: 'https://www.fgtv.com/fgtv/f5/0101.asp', official: true, fetchedAt: 0, items: [], error: '공식 소식을 불러오지 못했습니다.' };
  }
}

module.exports = { getNews };
