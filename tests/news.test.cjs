const test = require('node:test');
const assert = require('node:assert/strict');

const doc = (id, date, title = '교회 소식') => ({
  document_idx: id, reg_date: date, title, read_allowed: true, is_secret: false,
  content: '본문은 전달하면 안 됩니다.', member_name: '작성자',
});
const fresh = () => {
  delete require.cache[require.resolve('../server/news')];
  return require('../server/news').getNews;
};

test('공지·주보를 날짜순으로 제공하고 본문·작성자를 제외한다', async (t) => {
  t.mock.method(global, 'fetch', async (url) => {
    assert.equal(new URL(url).origin, 'https://www.shindoch.org');
    return { ok: true, json: async () => ({ documents: [
      doc('1', '2026-10-01'), doc('2', '2026-11-01', '새 소식'),
    ] }) };
  });
  const data = await fresh()();
  assert.deepEqual(data.groups.map((g) => g.key), ['notice', 'bulletin']);
  for (const g of data.groups) {
    assert.equal(g.items[0].date, '2026.11.01');
    assert.equal(g.items[0].title, '새 소식');
    assert.equal(g.items[0].url, `${g.sourceUrl}/2`);
    assert.deepEqual(Object.keys(g.items[0]).sort(), ['date', 'id', 'kind', 'title', 'url']);
  }
});

test('비공개·읽기 불가·잘못된 ID는 공개 목록에서 제외한다', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ documents: [
    doc('1', '2026-11-01'), { ...doc('2'), is_secret: true },
    { ...doc('3'), read_allowed: false }, doc('../other', '2026-11-01'),
    { document_idx: '4', title: '권한 정보가 없는 글' },
  ] }) }));
  const data = await fresh()();
  assert.deepEqual(data.groups.map((g) => g.items.map((it) => it.id)), [['1'], ['1']]);
});

test('동시 요청과 10분 이내 요청은 같은 조회를 공유한다', async (t) => {
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls += 1;
    return { ok: true, json: async () => ({ documents: [doc('1', '2026-11-01')] }) };
  });
  const getNews = fresh();
  await Promise.all([getNews(), getNews(), getNews()]);
  await getNews();
  assert.equal(calls, 2);
});

test('한쪽 소스 실패 시 이전 목록·조회시각을 보존한다', async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(console, 'warn', () => {});
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ documents: [doc('1', '2026-11-01')] }) }));
  const getNews = fresh();
  const initial = await getNews();
  now += 600_001;
  t.mock.method(global, 'fetch', async (url) => {
    if (new URL(url).searchParams.get('moduleId') === 'e0101') throw new Error('offline');
    return { ok: true, json: async () => ({ documents: [doc('2', '2026-11-02')] }) };
  });
  const data = await getNews();
  assert.equal(data.groups[0].stale, true);
  assert.deepEqual(data.groups[0].items, initial.groups[0].items);
  assert.equal(data.groups[0].fetchedAt, initial.groups[0].fetchedAt);
  assert.equal(data.groups[1].items[0].id, '2');
});

test('잘못된 응답·전체 장애를 오류 상태로 표시하고 재시도 폭주를 막는다', async (t) => {
  let calls = 0;
  t.mock.method(console, 'warn', () => {});
  t.mock.method(global, 'fetch', async () => {
    calls += 1;
    return { ok: true, json: async () => ({ result: false }) };
  });
  const getNews = fresh();
  const data = await getNews();
  assert.equal(data.fetchedAt, 0);
  assert.deepEqual(data.items, []);
  assert.ok(data.groups.every((g) => g.error));
  await getNews();
  assert.equal(calls, 2);
});
