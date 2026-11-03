/**
 * 사이드 패널 — 예배중계 / 묵상 / 기도 / 나눔 / 안내
 * 모든 사용자 생성 콘텐츠는 escapeHtml을 거쳐 렌더링한다 (XSS 방지).
 */

/** 신도교회 공식 공지사항·주보 목록을 외부 링크로 보여준다 (본문 재배포 없음) */
async function newsHtml() {
  const data = await fetchJson('/api/news');
  const groups = data.groups ?? [];
  const fetchNote = data.fetchedAt
    ? `마지막 갱신 ${new Date(data.fetchedAt).toLocaleString('ko-KR')}`
    : '서버에서 소식을 불러오지 못했습니다.';
  const groupHtml = groups.map((g) => `
    <div class="panel-section">
      <div class="panel-section__title">${escapeHtml(g.label)}</div>
      <div style="display:grid; gap:8px">
        ${(g.items ?? []).slice(0, 6).map((it) => `
          <a class="card post-card" href="${escapeHtml(it.url)}" target="_blank" rel="noopener" style="text-decoration:none">
            <div class="post-card__meta"><span class="chip">${escapeHtml(g.label)}</span><span>${escapeHtml(it.date)}</span></div>
            <h3>${escapeHtml(it.title)}</h3>
            <span class="muted" style="font-size:0.75rem">공식 페이지에서 보기 ↗</span>
          </a>`).join('') || '<p class="muted">표시할 소식을 가져오지 못했습니다.</p>'}
      </div>
      <a class="btn btn--ghost btn--sm" href="${escapeHtml(g.sourceUrl)}" target="_blank" rel="noopener">공식 ${escapeHtml(g.label)} 목록 ↗</a>
    </div>`).join('');
  return `
    <div class="panel-section">
      <p class="muted">신도교회 공식 홈페이지의 공지사항과 주보입니다. 본문은 재배포하지 않고 공식 페이지로 연결합니다.</p>
    </div>
    ${groupHtml}
    <p class="muted" style="font-size:0.72rem">${escapeHtml(fetchNote)}</p>`;
}
function bindNews() {}

export const PANEL_TITLES = {
  worship: '📺 예배 생중계',
  verse: '📖 말씀 묵상',
  prayer: '🕯️ 기도의 자리',
  community: '💬 나눔과 간증',
  info: 'ℹ️ 교회 안내',
  news: '📋 신도교회 소식',
};

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

const timeAgo = (ts) => {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
};

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `요청 실패 (${res.status})`);
  }
  return res.json();
}

/* =========================================================
   예배 생중계
   ========================================================= */
async function worshipHtml() {
  const { worship, official } = await fetchJson('/api/schedule');
  return `
    <div class="panel-section">
      <div class="worship-frame">
        <iframe id="worshipFrame" src="${escapeHtml(official.youtubeUploadsEmbed)}"
                title="신도교회 예배 영상"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen loading="lazy"></iframe>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px">
        <button class="btn btn--gold btn--sm worship-tab active" data-embed="${escapeHtml(official.youtubeUploadsEmbed)}" aria-pressed="true">최근 예배 영상</button>
        <button class="btn btn--ghost btn--sm worship-tab" data-embed="${escapeHtml(official.youtubeLiveEmbed)}" aria-pressed="false">🔴 실시간 생중계</button>
      </div>
      <p class="muted" style="margin-top:8px">신도교회 공식 YouTube 채널의 최근 업로드 영상입니다. 생중계는 방송 중에만 볼 수 있으며, 위 버튼으로 전환해 주세요. 영상이 표시되지 않거나 임베드가 제한되면 공식 채널에서 확인하세요.</p>
      <a class="btn btn--ghost btn--sm" href="${escapeHtml(official.youtube)}" target="_blank" rel="noopener">YouTube 채널 바로가기 ↗</a>
    </div>
    <div class="panel-section">
      <div class="panel-section__title">예배 안내 (공식 편성 요약)</div>
      <ul class="schedule-list">
        ${worship.map((w) => `<li><span>${escapeHtml(w.name)}${w.place ? `<small class="muted"> · ${escapeHtml(w.place)}</small>` : ''}</span><span>${escapeHtml(w.time)}</span></li>`).join('')}
      </ul>
      <p class="muted">주보·헌금·새가족 안내는 <a href="${escapeHtml(official.site)}" target="_blank" rel="noopener">공식 홈페이지</a> 참조. 편성은 변경될 수 있습니다.</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
        <a class="btn btn--ghost btn--sm" href="${escapeHtml(official.worshipUrl)}" target="_blank" rel="noopener">공식 예배 안내 ↗</a>
        <a class="btn btn--ghost btn--sm" href="${escapeHtml(official.noticeUrl)}" target="_blank" rel="noopener">공지사항 ↗</a>
        <a class="btn btn--ghost btn--sm" href="${escapeHtml(official.bulletinUrl)}" target="_blank" rel="noopener">주보 ↗</a>
      </div>
    </div>`;
}
function bindWorship(root) {
  const frame = root.querySelector('#worshipFrame');
  root.querySelectorAll('.worship-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!frame) return;
      frame.src = btn.dataset.embed;
      root.querySelectorAll('.worship-tab').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.classList.toggle('btn--gold', b === btn);
        b.classList.toggle('btn--ghost', b !== btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
    });
  });
}

/* =========================================================
   말씀 묵상
   ========================================================= */
async function verseHtml() {
  const verse = await fetchJson('/api/verse');
  const saved = localStorage.getItem('light-sanctuary:meditation') || '';
  return `
    <div class="panel-section">
      <div class="panel-section__title">오늘의 말씀</div>
      <blockquote class="verse-text">“${escapeHtml(verse.text)}”</blockquote>
      <div class="verse-ref">— ${escapeHtml(verse.ref)}</div>
    </div>
    <div class="panel-section">
      <div class="panel-section__title">묵상 가이드 (SOAP)</div>
      <div class="card">
        <p class="muted" style="margin-bottom:8px"><strong>S</strong> 본문 읽기 · <strong>O</strong> 관찰하기 · <strong>A</strong> 적용하기 · <strong>P</strong> 기도하기</p>
        <ol class="muted" style="padding-left:18px; display:grid; gap:6px">
          <li>이 말씀에서 하나님은 어떤 분으로 나타나시나요?</li>
          <li>오늘 내 마음을 무겁게 하는 짐은 무엇인가요?</li>
          <li>이 말씀을 오늘 한 가지 행동으로 옮긴다면?</li>
        </ol>
      </div>
      <label class="field">
        <span class="field__label">나의 묵상 노트 (이 기기에만 저장됩니다)</span>
        <textarea id="meditationNote" rows="5" placeholder="오늘 말씀에서 받은 은혜를 적어보세요…">${escapeHtml(saved)}</textarea>
      </label>
      <button id="saveMeditation" class="btn btn--gold btn--sm" style="justify-self:start">묵상 노트 저장</button>
    </div>`;
}
function bindVerse(root, ctx) {
  root.querySelector('#saveMeditation')?.addEventListener('click', () => {
    const v = root.querySelector('#meditationNote')?.value ?? '';
    localStorage.setItem('light-sanctuary:meditation', v);
    ctx.toast('묵상 노트를 저장했습니다. 🙏');
  });
}

/* =========================================================
   기도 — 촛불 켜기 + 기도제목 나눔
   ========================================================= */
async function prayerHtml() {
  const prayers = await fetchJson('/api/prayers');
  return `
    <div class="panel-section candle-stage">
      <div class="candle-flame">🕯️</div>
      <p class="muted">촛불을 켜면 성전 안 모든 성도가 함께 기도하는 표시가 됩니다.</p>
      <button id="lightCandleBtn" class="btn btn--gold">촛불 켜기</button>
      <input id="candleNote" class="hidden" type="text" maxlength="200" />
    </div>
    <div class="panel-section">
      <div class="panel-section__title">함께 기도해요 (최근 100개)</div>
      <form id="prayerForm" class="card" style="display:grid; gap:10px">
        <textarea id="prayerBody" rows="3" maxlength="1000" required placeholder="기도 제목을 나눠주세요…"></textarea>
        <label style="display:flex; align-items:center; gap:8px; font-size:0.82rem; color:var(--text-dim)">
          <input type="checkbox" id="prayerAnon" /> 익명으로 올리기
        </label>
        <button type="submit" class="btn btn--ghost btn--sm" style="justify-self:start">기도 제목 올리기</button>
      </form>
      <div id="prayerList" style="display:grid; gap:10px">
        ${prayers.map((p) => `
          <div class="card">
            <div class="post-card__meta"><span class="chip chip--prayer">기도</span><span>${escapeHtml(p.name)}</span><span>·</span><span>${timeAgo(p.createdAt)}</span></div>
            <p style="font-size:0.88rem; line-height:1.7; white-space:pre-wrap">${escapeHtml(p.body)}</p>
          </div>`).join('') || '<p class="muted">아직 기도 제목이 없습니다. 첫 번째로 나눠보세요.</p>'}
      </div>
    </div>`;
}
function bindPrayer(root, ctx) {
  root.querySelector('#lightCandleBtn')?.addEventListener('click', async () => {
    try {
      await fetchJson('/api/candle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ctx.name }),
      });
      ctx.toast('촛불이 켜졌습니다. 주님이 들으십니다. 🕯️');
    } catch (e) {
      ctx.toast(e.message);
    }
  });

  root.querySelector('#prayerForm')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const body = root.querySelector('#prayerBody')?.value.trim();
    const anonymous = root.querySelector('#prayerAnon')?.checked;
    if (!body) return;
    try {
      await fetchJson('/api/prayers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, anonymous, name: ctx.name }),
      });
      ctx.toast('기도 제목을 올렸습니다. 함께 기도하겠습니다.');
      ctx.reload();
    } catch (e) {
      ctx.toast(e.message);
    }
  });
}

/* =========================================================
   나눔 — 간증/감사/위로 커뮤니티
   ========================================================= */
const POST_CATEGORIES = ['전체', '간증', '기도요청', '감사', '위로', '자유'];
let communityFilter = '전체';

async function communityHtml() {
  const posts = await fetchJson(`/api/posts?category=${encodeURIComponent(communityFilter)}`);
  return `
    <div class="panel-section">
      <div class="filter-row" role="group" aria-label="카테고리 필터">
        ${POST_CATEGORIES.map((c) => `<button class="filter-chip" data-filter="${c}" aria-pressed="${c === communityFilter}">${c}</button>`).join('')}
      </div>
      <form id="postForm" class="card" style="display:grid; gap:10px">
        <div style="display:flex; gap:8px">
          <select id="postCategory" aria-label="카테고리">
            ${POST_CATEGORIES.filter((c) => c !== '전체').map((c) => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <input id="postTitle" type="text" maxlength="120" required placeholder="제목" style="flex:1; min-width:0; padding:10px 12px; border-radius:10px; background:rgba(6,12,22,0.6); border:1px solid rgba(250,246,236,0.12); color:var(--ivory)" />
        </div>
        <textarea id="postBody" rows="3" maxlength="4000" required placeholder="나누고 싶은 이야기를 적어주세요…"></textarea>
        <button type="submit" class="btn btn--gold btn--sm" style="justify-self:start">올리기</button>
      </form>
    </div>
    <div id="postList" style="display:grid; gap:12px">
      ${posts.map(postCardHtml).join('') || '<p class="muted">아직 글이 없습니다. 첫 나눔을 남겨보세요.</p>'}
    </div>`;
}

function postCardHtml(p) {
  return `
    <article class="card post-card" data-post-id="${escapeHtml(p.id)}">
      <div class="post-card__meta"><span class="chip">${escapeHtml(p.category)}</span><span>${escapeHtml(p.name)}</span><span>·</span><span>${timeAgo(p.createdAt)}</span></div>
      <h3>${escapeHtml(p.title)}</h3>
      <p>${escapeHtml(p.body)}</p>
      <div class="post-card__foot">
        <button class="like-btn" data-like="${escapeHtml(p.id)}" aria-label="공감하기">🤍 <span>${p.likes}</span></button>
        <span>💬 ${p.comments.length}</span>
      </div>
      ${p.comments.length ? `<div class="comment-list">${p.comments.map((c) => `<div class="comment-item"><strong>${escapeHtml(c.name)}</strong>${escapeHtml(c.body)}</div>`).join('')}</div>` : ''}
      <form class="comment-form" data-comment-form="${escapeHtml(p.id)}">
        <input type="text" maxlength="1000" required placeholder="댓글로 위로를 전하세요…" aria-label="댓글 입력" />
        <button type="submit" class="icon-btn" aria-label="댓글 등록">➤</button>
      </form>
    </article>`;
}

function bindCommunity(root, ctx) {
  root.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      communityFilter = btn.dataset.filter;
      ctx.reload();
    });
  });

  root.querySelector('#postForm')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const category = root.querySelector('#postCategory')?.value;
    const title = root.querySelector('#postTitle')?.value.trim();
    const body = root.querySelector('#postBody')?.value.trim();
    if (!title || !body) return;
    try {
      await fetchJson('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, title, body, name: ctx.name }),
      });
      ctx.toast('나눔을 올렸습니다. 감사합니다 🙏');
      ctx.reload();
    } catch (e) {
      ctx.toast(e.message);
    }
  });

  root.querySelectorAll('[data-like]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const { likes } = await fetchJson(`/api/posts/${encodeURIComponent(btn.dataset.like)}/like`, { method: 'POST' });
        btn.querySelector('span:last-child').textContent = likes;
      } catch (e) { ctx.toast(e.message); }
    });
  });

  root.querySelectorAll('[data-comment-form]').forEach((form) => {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const input = form.querySelector('input');
      const body = input.value.trim();
      if (!body) return;
      try {
        await fetchJson(`/api/posts/${encodeURIComponent(form.dataset.commentForm)}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, name: ctx.name }),
        });
        ctx.reload();
      } catch (e) { ctx.toast(e.message); }
    });
  });
}

/* =========================================================
   교회 안내
   ========================================================= */
function infoHtml() {
  return `
    <div class="panel-section">
      <div class="panel-section__title">신도교회</div>
      <div class="card card--gold">
        <p class="muted" style="color:#e9cd8a; font-weight:700; margin-bottom:6px">신도교회는 우리동네교회입니다.</p>
        <p class="muted">대한예수교 장로회 통합 측 교회로, 1967년 신도림에서 개척되어 1990년 현재 위치(구로구 구일로2길 45)에 예배당을 세웠습니다. 복음 전파와 사회 봉사의 균형, 큰 예배와 작은 목장의 조화를 추구합니다.</p>
      </div>
      <div class="card">
        <div class="panel-section__title" style="margin-bottom:8px">오시는 길</div>
        <p class="muted">서울특별시 구로구 구일로2길 45 (구로동)<br />대표전화 02-869-6747 · 02-869-6748 · 02-868-9191<br />구일우성 아파트 정문 앞</p>
      </div>
    </div>
    <div class="panel-section">
      <div class="panel-section__title">공식 채널</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <a class="btn btn--ghost btn--sm" href="https://www.shindoch.org" target="_blank" rel="noopener">공식 홈페이지 ↗</a>
        <a class="btn btn--ghost btn--sm" href="https://www.youtube.com/channel/UC7Ko6OUkjH0gThOqEBFRCNA" target="_blank" rel="noopener">YouTube ↗</a>
        <a class="btn btn--ghost btn--sm" href="https://www.shindoch.org/main/a03" target="_blank" rel="noopener">예배 안내 ↗</a>
        <a class="btn btn--ghost btn--sm" href="https://www.shindoch.org/main/e0101/board" target="_blank" rel="noopener">공지사항 ↗</a>
        <a class="btn btn--ghost btn--sm" href="https://www.shindoch.org/main/e04/board" target="_blank" rel="noopener">주보 ↗</a>
      </div>
    </div>
    <div class="panel-section">
      <div class="panel-section__title">이 공간에 대하여</div>
      <p class="muted">이 공간은 신도교회를 <strong>테마</strong>로 삼은 <strong>비공식</strong> 힐링·묵상 프로젝트입니다. 교회 공식 로고·건물 외관을 그대로 복제하지 않았으며, 교회의 공식 입장을 대변하지 않습니다.</p>
      <p class="muted">예배 편성·주보·헌금·새가족 등록 등 모든 공식 정보는 반드시 <a href="https://www.shindoch.org" target="_blank" rel="noopener">교회 공식 홈페이지</a>에서 확인하세요. 이 앱에 올린 닉네임·기도 제목·나눔 글은 서버에 저장되어 다른 이용자에게 공개되며, 교회에 제출되지 않습니다. 개인 식별정보는 적지 마세요.</p>
    </div>`;
}
function bindInfo() {}

/* =========================================================
   패널 렌더링 엔트리
   ========================================================= */
const RENDERERS = {
  worship: { html: worshipHtml, bind: bindWorship },
  verse: { html: verseHtml, bind: bindVerse },
  prayer: { html: prayerHtml, bind: bindPrayer },
  community: { html: communityHtml, bind: bindCommunity },
  info: { html: async () => infoHtml(), bind: bindInfo },
  news: { html: newsHtml, bind: bindNews },
};

/**
 * @param {string} name 패널 키
 * @param {HTMLElement} container #panelBody
 * @param {{ name: string, toast: (msg:string)=>void }} baseCtx
 */
export async function renderPanel(name, container, baseCtx) {
  const entry = RENDERERS[name];
  if (!entry) return;
  container.innerHTML = '<p class="muted">불러오는 중…</p>';
  const ctx = { ...baseCtx, reload: () => renderPanel(name, container, baseCtx) };
  try {
    container.innerHTML = await entry.html();
    entry.bind(container, ctx);
  } catch (e) {
    container.innerHTML = `<div class="card"><p class="muted">불러오지 못했습니다: ${escapeHtml(e.message)}</p></div>`;
  }
}
