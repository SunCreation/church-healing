# 작업 로그 (Worklog)

형식: `YYYY-MM-DD` — 요약 / 세부 / 검증 / 다음. 최신이 위.

## 2026-11-03

### 요약
PRD/문서화 체계 추가 + 예배중계 임베드 교체 + 초기 3D 렌더링 이슈 수정 + 헤드리스 Chrome 스모크 통과.

### 세부 작업
1. **스캐폴드**: `package.json` (express, ws, three), `.gitignore` (`node_modules/`, `data/db.json`), `data/.gitkeep`
2. **서버** (`server/index.js`, `server/db.js`)
   - REST: `/api/health`, `/api/verse`, `/api/schedule`, `/api/posts` (+like/comments), `/api/prayers`, `/api/candle`
   - WS `/ws`: join/pos/chat/candle/leave 브로드캐스트, ~12Hz 위치, 입장 스폰 (0, 10.5)
   - JSON 저장소: 500ms 디바운스 원자적 저장, 시드 게시글 3 · 기도 2
3. **클라이언트**
   - 입장 화면: 닉네임+아바타 색 8종, localStorage 기억, 비공식 고지
   - 3D 예배당 (`sanctuary.js`): 회랑/페우/단상/발광 십자가/빛줄기/스테인드글라스 10/기둥/샹들리에/대형 스크린/기도 촛불 테이블 — 전부 절차적 생성
   - 아바타 (`avatars.js`): 캡슐+구체+이름표 스프라이트+말풍선
   - 이동/카메라 (`main.js`): WASD/방향키, 드래그 오빗, Shift 달리기, 원–AABB 충돌, 룸/카메라 클램프
   - 패널 5종 (`panels.js`): 예배중계/묵상(SOAP+로컬노트)/기도(촛불·익명제출)/나눔(필터·공감·댓글)/안내 — `escapeHtml` 전면 적용
4. **버그 수정**
   - 스크린 텍스처 이중 래핑(`canvasTexture(slideTexture(...))`) → `texSubImage2D`/`glTexStorage2D` 오류 및 검은 화면 원인 → 수정
   - 카메라가 입구 벽 밖(z≈22)에서 시작하던 문제 → 스폰을 z=10.5로, 카메라를 룸 내부로 클램프
   - 십자가/빛줄기 위치 하향 조정 (시야에 들어오도록), lookAt y=+2.35
   - 예배중계 임베드: `live_stream?channel=` → `videoseries?list=PLaMcIb0DJ7THbXrf6TR6fbUu6LmyRtc_L` (ADR-006)
5. **문서화**: `PRD.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/ISSUES.md`, `docs/WORKLOG.md`, `docs/screenshots/` (00_entry ~ 07_chat)

### 검증
- `node --check` 서버/모듈 통과
- 헤드리스 Chrome 스모크: 입장 → 씬 렌더 → 패널 5종 → ESC → 채팅 1건. 콘솔/페이지 에러 **0건**
- API: `/api/health`, `/api/verse`, `/api/posts`, `/api/schedule` 200 확인
- 스크린샷: `docs/screenshots/*.png`

### 커밋 (로컬 git, 브랜치 main)
1. `chore: 프로젝트 스캐폴드 및 서버 구현`
2. (예정) `feat: 3D 예배당 클라이언트 + 패널 UI`
3. (예정) `fix(server): 예배중계 임베드 교체`
4. (예정) `docs: PRD 및 문서화`

### 다음
- ISSUES.md 참조: 레이트리밋/신고, 촛불 동기화, SQLite 이전, 배포 자동화

---

## (이전) 2026-11-02
- `/Users/admin/Projects/A/realtodo` (별도 프로젝트) 작업과 무관 — 본 디렉터리는 신규 프로젝트로 시작

### 2026-11-03 (후속)
- 예배중계 임베드 교체 후 헤드리스 재검증: 「video unavailable」 제거, 프레임 정상 로드 확인
- `docs/screenshots/*` 갱신, 히스토리는 git에 기록

### 2026-11-03 (Neon 연동 + 보안 검토)
- `neon deploy`: production 브랜치 정책 일치, `.env.local`에 DATABASE_URL/UNPOOLED/NEON_BRANCH pull
- 저장소를 JSON → **Neon/Lakebase Postgres**로 전환 (`pg.Pool` max 4, `store.js`)
  - 스키마: posts/comments(FK cascade)/prayers/candles, idempotent 생성 + 빈 테이블일 때만 시드
  - 연결: 앱 트래픽 풀링 URL 사용, `sslmode`를 `verify-full`로 승격
- 보안 강화
  - CSP: `default-src 'self'` + Google Fonts style만 허용 + YouTube frame-src만 허용, `X-Frame-Options`/`nosniff`/`Referrer-Policy`/`Permissions-Policy`, `X-Powered-By` 제거, `trust proxy 1`
  - 메모리 레이트리밋: API 600/분 · 쓰기 60/분 · 게시글 30/분 · 촛불 15/분 · 채팅 10초 5회
  - Express 4 async 핸들러 전부 `asyncHandle`로 감싸 내부 에러 비노출(500 generic)
- 빌드 검증 추가: `npm run build`(서버 CJS/공개 ESM 파싱 + 필수 파일 존재) → 통과
- Neon에 실제 INSERT/SELECT/DELETE 검증: 게시글/공감/댓글/기도/촛불 생성→행 수 확인→테스트 데이터 삭제
- 검증용 데이터 삭제 완료 (posts 3 / comments 2 / prayers 2 / candles 0)
- 헤드리스 스모크 재실행 `NO_CONSOLE_ERRORS` (CSP 수정 후)
- 문서: PRD/README/ARCHITECTURE/DEPLOY.md/ADR 갱신, `render.yaml`(Render 무료 Blueprint) 추가

### 2026-11-03 (3D 고도화 — 좌석/시야/앞마당 게시판)
- 예배당 앞마당 9m 확장: 포털 아치 + 담장 + 석재 바닥 + 정면 십자가/레터링 + 열린 대문
- 페우 개별 지정석 144개(좌·우 8열×9석) + `F` 앉기/일어서기, 좌석 선점 WS `pos(seat,y)`로 동기화, 근접 1.35m→2.1m, 게시판과 충돌 안 함, 앉으면 이동 비활성화/좌석면 근처로 루트 내림
- 아바타 전체 몸이 아바타 정면(=카메라 보고 있는 방향)을 따라가도록, 리모트 아바타도 동일하게 보간
- `/api/news` 프록시: FGTV ‘순복음소식’ 목록 HTML 파싱 (10분 캐시) → 게시판 캔버스에 날짜/제목, 상세 패널 `news`로 공식 링크만 연결 (본문/영상 재배포 없음)
- 앞마당 게시판: 마당 서편 벽걸이형, `F`로 상세 패널 열기
- 입구 포털/기둥/게시판/페우 충돌체 조정, 카메라 z 상한을 앞마당으로 확장
- 검증: `npm run build` 통과, 스모크 재실행 NO_CONSOLE_ERRORS, 앉기/서서이서 F 인터랙션 확인, `/api/news` 최신 목록(2026.11.01 한세대…) 렌더 확인

### 2026-11-03 (조작 모델 개선 — 전진/좌우회전/방향 표시)
- 이동을 전방만으로 단순화: `↑` 전진, `↓` 후진, `←`/`→` 회전 (이전에는 카메라 기준 스트레이프)
- 아바타 전체 회전을 조작에 직접 반영, 원격 아바타로 보이는 정도가 맞춤
- 화면 상단에 현재 바라보는 방향 배지 추가 (성소/측면/후면 + 각도)
- 앉을 때 시야를 정면(성소)으로 고정, 이동 불가
- 카메라 오프셋을 아바타 정면의 반대 방향으로 고정 (뒤쪽 시점)
- 페우 간격을 1.5m→2.0m로 넓혀 앞뒤 이동 가능, 좌석 개별 충돌체로 변경 (선택가능)
- 검증: `npm run build` 통과, 스모크 재실행 NO_CONSOLE_ERRORS
