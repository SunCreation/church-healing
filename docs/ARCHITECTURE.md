# 아키텍처

## 스택 요약

| 계층 | 기술 | 이유 |
|---|---|---|
| 3D 렌더링 | Three.js (r166, `/vendor/three/three.module.js`로 로컬 서빙) | 빌드 없는 ES 모듈 직접 사용, 오프라인 배포 가능 |
| 클라이언트 | Vanilla ES Modules + CSS 커스텀 (프레임워크 없음) | 번들러 0, 로딩/디버깅 단순 |
| 서버 | Node.js + Express 4 + `ws` 8 | 정적 서빙 + REST + WS를 단일 프로세스로 |
| 저장소 | Neon/Lakebase Postgres(`pg.Pool`, 풀링 `-pooler` 연결) 또는 없으면 `data/db.json` | 무료 영구 저장소; 로컬/테스트는 JSON 시드 유지 |
| 실시간 | WebSocket `/ws`, 12Hz 위치 동기화 | 가볍고 브라우저 범용 |

## 디렉터리

```
church-healing/
├─ PRD.md                 제품 요구사항
├─ README.md
├─ package.json
├─ .env.local              (gitignore) `neon env pull`이 DATABASE_URL 등을 씀
├─ server/
│  ├─ index.js             Express 라우트 + WS 룸 + 보안 헤더/레이트리밋
│  ├─ news.js              신도교회 공식 공지사항·주보 목록 프록시 (10분 캐시)
│  └─ store.js             저장소 팩토리 (Postgres 우선, 없으면 JSON)
└─ public/
   ├─ index.html           입장 화면(#entry) → 앱(#app, canvas + HUD + 사이드 패널)
   ├─ css/style.css
   └─ js/
      ├─ main.js           씬/카메라/입력/WS/채팅/패널 오케스트레이션
      ├─ sanctuary.js      예배당 빌드 (캔버스 텍스처 절차적 생성, AABB 충돌체 반환)
      ├─ avatars.js        캡슐+구체 저폴리 아바타, 이름표/말풍선 스프라이트
      └─ panels.js         6개 패널 렌더/바인딩, escapeHtml 강제
```

## 실행 흐름

```
[브라우저] 입장 폼 제출
   → #entry 숨김, #app 표시, initThree()  (씬/예배당/내 아바타 생성)
   → connectWS()                          (ws://host/ws)
   → server: join 수신 → players Map에 저장 → welcome(you, players[], candleCount)
   → client: 원격 아바타 생성, 촛불 count만큼 시드, tick() 루프 시작
```

## WebSocket 프로토콜 (`/ws`)

서버 기동 시 `store.init()`이 PostgreSQL에서 스키마(테이블 4개)를 idempotent 하게 만들고, 비어 있으면 시드를 삽입한다.

클라이언트 → 서버

| 메시지 | 필드 | 비고 |
|---|---|---|
| `join` | `name`, `color(#rrggbb)` | 이름 20자, 색상 정규식 검증 |
| `pos`  | `x`, `z`, `rot`, `moving`, `y`, `seat` | 서버가 실내/앞마당 경계로 클램프, `seat`는 0..143 또는 null |
| `chat` | `text` | 200자 제한, 전원 브로드캐스트 |

서버 → 클라이언트

| 메시지 | 필드 | 비고 |
|---|---|---|
| `welcome` | `you`, `players[]`, `candleCount` | players는 본인 제외 (y/seat 포함) |
| `join`    | `player` | 본인 제외 브로드캐스트 |
| `leave`   | `id`, `name` | 연결 종료 시 |
| `pos`     | `id`, `x`, `z`, `rot`, `moving`, `y`, `seat` | 본인 제외, 수신 측 보간 |
| `chat`    | `id`, `name`, `text`, `at` | 본인 포함 전원 |
| `candle`  | `candle{id,note,name,createdAt}` | `POST /api/candle` 경유 |
| `error`   | `message` | 잘못된 페이로드 |

## REST API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | `{ ok, players, storage }` |
| GET | `/api/verse` | 오늘의 말씀 (UTC 날짜 로테이션, 12절) |
| GET | `/api/schedule` | 예배 시간표(공식 편성 요약) + `official`(링크/임베드) |
| GET | `/api/news` | 신도교회 공지사항·주보 10분 캐시 (`groups[]`: notice/bulletin, `items[]`) |
| GET | `/api/posts?category=` | 목록 (최신순) |
| POST | `/api/posts` | 생성 `{name?, category, title, body}` |
| POST | `/api/posts/:id/like` | 공감 +1 |
| POST | `/api/posts/:id/comments` | 댓글 추가 |
| GET | `/api/prayers` | 최근 100개 |
| POST | `/api/prayers` | 기도 제목 (`anonymous` 지원) |
| POST | `/api/candle` | 촛불 접수 → WS `candle` 브로드캐스트 (`candleCount` 포함) |

## 저장소

기본은 **Postgres**, 실패/미설정 시 경고만 남기고 시작하지 않음(`store.init()` 실패 → `process.exit(1)`). 대신 `DATABASE_URL`이 없으면 JSON 저장소로 동작한다(전체 기능 동작, 재시작/동시성 한계 있음). 테이블:

- `posts` (카테고리/이름/제목/본문/공감수/created_at)
- `comments` (`post_id` FK → `ON DELETE CASCADE`)
- `prayers` (`anonymous` bool)
- `candles` (촛불 누적 카운트)

앱 트래픽은 `-pooler`(DATABASE_URL), 스키마 마이그레이션은 direct(DATABASE_URL_UNPOOLED)를 쓰는 것이 원칙. `store.init()`은 `CREATE TABLE IF NOT EXISTS` + 빈 테이블에만 시드 삽입(멱등). SQL은 전부 `$1..` 파라미터 바인딩, `sslmode`는 `verify-full`로 승격.

## 3D 씬 개요

- 룸 56×38×15 + 앞마당 56×9 (입구 남쪽 z>19) — 입구 포털 아치, 앞마당 게시판, 담장, 석재 바닥
- 중앙 회랑(폭 3.6) + 양측 페우 8열×2, 개별 지정석 144개 (`seats`)
- 게시판은 신도교회 공식 홈페이지의 공지사항·주보 목록을 10분 캐시. 본문/이미지 재배포 없이 공식 링크만 제공
- 십자가: `MeshStandardMaterial(emissive)` + PointLight(맥동) + AdditiveBlending 빛줄기 콘 + 후광 Plane
- 텍스처는 전부 `document.createElement('canvas')` 절차적 생성 (스테인드글라스/카펫/스크린/LED레터링) → 외부 이미지 0
- 조명: Hemisphere + Directional(섀도 2048) + PointLight 2개 (십자가/필)

## 좌표/충돌 규칙

- 플레이어 반경 0.55, 원–AABB 최근접점 밀어내기 + 룸 경계 클램프
- 조작: `↑` 바라보는 방향으로만 전진(`↓` 후진), `←`/`→` 시야 회전(전진 중에도 회전 가능), 마우스 가로 드래그 = 시야 회전
- 스폰: `(0, 0, 10.5)` — 십자가 정면(내용)
- 앞마당 경계: 좌우 담장/기둥, 입구 포털 기둥(`openingHalf` 이내만 통과) — 출입 가능
- 페우 통로: 좌석 열 단위 충돌(열 사이 1.2m+ 간격), 앞뒤로 이동 가능
- 앉을 때: 아바타가 좌석면으로 이동하고 시야가 성소(정면)로 고정되며 이동/물리가 비활성화
- 페우 좌석: 근접 시 `F`로 앉기/일어서기. 앉으면 아바타를 좌석면(y≈0.74)에 가깝게 내리고(루트 y≈0.28), 이동/물리 충돌이 비활성화. 좌석 선점 상태는 WS `pos`(`seat`)로 동기화, 리모트 아바타 y도 보간

## 예배당 밖 게시판

- 위치: 남쪽 입구 앞마당 왼쪽의 독립형 초록 게시판 (플레이어 z≈19.5, x≈-10.4)
- `GET /api/news` → 신도교회 공식 홈페이지의 두 목록을 10분 캐시로 JSON 수집
  - 공지사항 `https://www.shindoch.org/documents?moduleId=e0101&permissionsOnly=0`
  - 주보 `https://www.shindoch.org/documents?moduleId=e04&permissionsOnly=0`
- 응답: `{ source, official, fetchedAt, groups:[{key,label,sourceUrl,items[]}], items[] }`
  - 각 item: `{ id, kind, date(YYYY.MM.DD), title, url }` — 날짜 내림차순 최대 10건
- 클라이언트는 3D 게시판 캔버스에 공지 3건 + 주보 3건을 종이/핀 형태로 렌더
- 근접 `F` → 확대 뷰(`#bulletinViewer`)에서 `공지사항`/`주보` 탭 전환, 카드 클릭 시 공식 문서(`/main/<module>/board/<document_idx>`)로 새 탭 이동
- 본문/이미지는 재배포하지 않고 제목·날짜·링크만 노출
- 공개·열람 가능 문서와 숫자 ID만 허용. 분류별 마지막 성공 목록/시각을 보존하고 실패도 10분 캐시. 동시 요청은 같은 조회를 공유

## 보안/프라이버시

- 계정/쿠키/위치 수집 없음. 닉네임은 localStorage에만, IP는 레이트리밋 목적으로만 메모리에 체류
- 사용자 입력: 서버 길이 제한 + 클라이언트 `escapeHtml`
- SQL: 파라미터 바인딩만 사용 (문자열 연결 쿼리 없음)
- CSP(`default-src 'self'`, YouTube만 frame, Google Fonts만 style), `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`, `X-Powered-By` 제거
- 레이트리밋(인메모리/단일 인스턴스): API 600/분, 쓰기 60/분, 게시글·댓글 30/분, 촛불 15/분, 채팅 10초 5회
- `trust proxy 1` (Render/nginx 뒤에서 실제 IP), JSON body 256KB, 색상은 `#rrggbb` 정규식만 허용
- 미적용: 관리자 모더레이션/신고, 다중 인스턴스에서는 Redis 등 저장소 기반 레이트리밋 필요 → `docs/ISSUES.md`

## 테스트 / 검증

헤드리스 Chrome(Playwright Python 1.58, `channel='chrome'`)으로 스모크:

1. 입장 폼 제출 → 3.5초 대기
2. 스크린샷 (`docs/screenshots/`) — 콘솔 에러/페이지 에러 수집
3. 패널 5종(예배/묵상/기도/나눔/안내) 열기 → ESC 닫기
4. 앞마당 게시판 근접 → `F` 확대 뷰 → 공지/주보 탭 전환
5. 채팅 1건 전송 → 말풍선 확인

결과: `NO_CONSOLE_ERRORS`. 재현: 서버 실행 후 스크립트 실행 (스크린샷은 참고 자료).

`npm test`: 공식 소식 목록·권한 필터·캐시·동시 조회·부분/전체 장애를 네트워크 없이 검증 (`tests/news.test.cjs`).

추가로 `npm run build`(서버/공개 JS 파싱 검사 + 필수 파일 존재 확인) 통과. 실제 Neon에 대해서는 생성→공감→댓글을 요청하고 `posts/comments/prayers/candles` 행 수를 쿼리로 확인했다(검증 데이터는 삭제).

## 배포 메모

- 단일 노드에서 `PORT=xxxx node server/index.js` 로 동작 (정적+WS 동일 오리진) — Neon 권장 구성(Render 무료 + Neon 무료)은 `docs/DEPLOY.md`
- WS는 sticky session 불필요(단일 프로세스). 다중 인스턴스 시 Redis pub/sub 또는 룸 분리 필요
- `render.yaml` Blueprint 포함 (`npm ci`, health `/api/health`)
- 백업: Neon Restore(특정 시점 복원) 또는 `pg_dump`(직접 연결)

## 확장 포인트

- 룸 샤딩(입장 인원 상한), 음성( WebRTC ), 배경 성가( Web Audio )
- 말씀 풀 DB화 + 관리자 페이지, 절기 이벤트 훅
- 관리자 모더레이션(신고/숨김), 실시간 집계 레이트리밋
