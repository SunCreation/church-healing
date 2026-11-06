# 무료 배포 가이드 (Render + Neon)

목표: URL 하나로 여러 사람이 접속하고, 커뮤니티 글/기도 제목이 재시작 후에도 유지되도록 한다.

## 구성
- **Neon**: 무료 Postgres. 저장소의 `data/db.json`을 대신한다.
- **Render**: 무료 Web Service. Node 앱 + WebSocket을 같은 프로세스에서 제공한다.
- 무료 Render 플랜은 15분 미사용 시 슬립, 재시작 시 파일시스템은 초기화된다. **DB 없이 배포하면 Neon 없이 Render만 쓰면 데이터가 사라진다.**

## 순서

### 1. Neon
1. [neon.com](https://neon.com) 회원가입 → **Create project**
2. 프로젝트의 `production` 브랜치 → **Connect** → Connection string
   - **Pooled** (`-pooler` 호스트) → `DATABASE_URL`
   - **Direct** → `DATABASE_URL_UNPOOLED`
3. 로컬에서 `neon env pull`을 쓰려면 `.env.local`에 저절로 저장된다(git에 포함되지 않음).

### 2. GitHub push
```bash
git remote add origin git@github.com:<계정>/church-healing.git
git push -u origin main
```

### 3. Render
1. [render.com](https://render.com) → **New → Web Service**
2. 저장소 선택, 아래 설정:
   - Runtime: Node
   - Build Command: `npm ci`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
3. **Environment** 추가:
   - `DATABASE_URL` = 풀링 연결 문자열
   - `DATABASE_URL_UNPOOLED` = 직접 연결
4. Deploy → 로그에 아래가 보여야 한다:
   ```
   [store] Neon/Lakebase Postgres
   ```

또는 리포지토리의 `render.yaml`로 **New → Blueprint**를 선택해 자동 구성한다.

### 4. 배포 후 확인
- `https://<service>.onrender.com/api/health` → `{"ok":true,"storage":"postgres", ...}`
- 3D 화면 렌더, 채팅, 게시글 작성 → 재시작 후 유지되는지 확인

### 5. GitHub Actions로 5분 간격 상태 확인 (선택)

`.github/workflows/render-keepalive.yml`이 `*/5 * * * *`(UTC 기준 5분 간격)으로 상태 요청과 실제 Chromium 브라우저 검사를 예약합니다. Render API 키나 DB 비밀번호는 필요하지 않습니다. **이는 실행 간격 설정이지 정시 실행 보장이 아닙니다.**

1. GitHub 저장소 → **Settings → Secrets and variables → Actions → Variables** → **New repository variable**
2. 이름: `RENDER_HEALTH_URL`
3. 값: Render Dashboard에서 복사한 실제 배포 주소 뒤에 `/api/health`를 붙입니다.
   - 예시 형식: `https://<실제 서비스 주소>.onrender.com/api/health`
   - 서비스 이름만으로 주소를 추측하지 마세요. 커스텀 도메인의 HTTPS 주소도 사용 가능합니다.
4. **Actions → Render Keep Alive → Run workflow**로 수동 실행해 성공을 확인합니다.

CLI로 설정하려면:

```bash
gh variable set RENDER_HEALTH_URL --repo SunCreation/church-healing \
  --body 'https://<실제 서비스 주소>.onrender.com/api/health'
gh workflow run render-keepalive.yml --repo SunCreation/church-healing
```

- URL 미설정 시 예약 작업은 건너뛰고, 수동 실행은 설정 오류를 표시합니다.
- `scripts/check-render-health.sh`로 HTTPS 응답과 JSON의 `ok: true`를 검사합니다. 기동 중이거나 HTTP 오류이면 최대 3회 요청(회당 최대 60초, 재시도 간격 5초)합니다.
- 이어서 `scripts/monitor-render.py`가 실제 사이트에 접속해 **상태점검봇으로 입장 → WebGL·WebSocket 확인 → 짧은 전진/후진·좌우 회전 → 말씀 패널·소식 게시판의 공지/주보 탭 → 종료**를 검사합니다. 봇은 다른 이용자에게 잠깐 보일 수 있습니다.
- 글·기도·댓글·촛불 생성 및 공감·좌석 점유는 하지 않습니다. 변경 HTTP 요청을 차단하고 WebSocket은 입장/위치 전송만 허용되었는지 확인합니다. 종료 시 브라우저 연결을 닫습니다.
- 브라우저 포함 Playwright 컨테이너를 사용하며 브라우저 검사는 최대 2분, 전체 작업은 최대 6분입니다. 성공 시 Actions Summary에 검사 결과가 남고, 실패 시 보고서와 가능한 경우 스크린샷을 아티팩트로 1일 보관합니다.
- GitHub 예약 작업은 지연·누락될 수 있으므로 **정확한 5분 실행이나 무슬립을 보장하지 않습니다.** 공개 저장소에서 60일간 활동이 없으면 예약 작업이 비활성화될 수 있습니다.
- 공개 저장소의 표준 러너는 무료이지만, 이것이 예약 시각 보장을 의미하지는 않습니다. 2026-11-06 조회한 실제 예약 기록에는 약 4~8시간의 실행 공백이 있었습니다. 원인을 무료 횟수 제한으로 단정하지 않습니다.
- 유휴 슬립 방지에는 정상 HTTP 요청 자체로 충분합니다. 브라우저 검사는 실제 기능 확인을 강화하는 것이며 **예약 작업이 실행되지 않는 공백을 해결하지는 않습니다.** 지속적인 가용성이 필요하면 별도 주기 모니터링 또는 유휴 슬립 없는 컴퓨트를 사용하세요.
- Render가 계속 실행되면 월 750시간의 무료 인스턴스 시간을 사용합니다. 같은 워크스페이스의 다른 무료 서비스와 합산되므로 한도를 확인하세요.
- 브라우저 검사는 단순 health 요청보다 러너 사용량·트래픽·DB 활성 시간을 늘립니다. 공개 저장소의 러너 무료 조건과 아티팩트 저장 용량 한도는 별개입니다.
- 중단하려면 Actions의 해당 워크플로를 **Disable workflow** 하거나 `RENDER_HEALTH_URL` 변수를 삭제합니다.

로컬에서 같은 브라우저 검사를 실행하려면(Python 가상환경 권장):

```bash
python3 -m pip install -r scripts/monitor-requirements.txt
python3 -m playwright install chromium
RENDER_HEALTH_URL=https://shindo-church.onrender.com/api/health python3 scripts/monitor-render.py
```

설치된 Google Chrome을 사용하려면 `BROWSER_CHANNEL=chrome`을 추가합니다. 로컬 서버 검사는 `--base-url http://localhost:8787/`로 실행합니다. 보고서는 git에서 제외되는 `artifacts/render-browser/`에 저장됩니다.

## 보안 체크리스트 (현재 상태)
- [x] `.env.local` git 배제, 코드에 비밀 없음
- [x] SQL 파라미터 바인딩 (`pg`)
- [x] 클라이언트의 모든 사용자 입력 `escapeHtml`
- [x] CSP(`default-src 'self'`, YouTube만 frame-src 허용), `X-Content-Type-Options`, `Referrer-Policy` 등
- [x] 메모리 레이트리밋: API 600/분, 쓰기 60/분, 게시글 30/분, 촛불 15/분, 채팅 10초 5회
- [x] `trust proxy` + `X-Powered-By` 제거
- [ ] Render GitHub 토큰/API키 발급 금지 (GitHub App OAuth 사용)
- [ ] 관리자 기능/신고 기능 없음 — 게시물 삭제가 필요하면 Render 환경변수처럼 별도 운영자 토큰을 추가해야 함

## 학생들에게 전달할 내용 (각자 계정)
1. [neon.com](https://neon.com) 회원가입 → 본인 프로젝트 생성 (Free 플랜 충분)
2. 전역 OpenCode 설정(`~/.config/opencode/opencode.jsonc`)에 추가:
   ```json
   "Neon": {
     "type": "remote",
     "url": "https://mcp.neon.tech/mcp",
     "oauth": {
       "redirect_uri": "http://localhost:19876/callback",
       "callback_port": 19876
     }
   }
   ```
3. 프로젝트 폴더에서 `opencode mcp auth Neon` → 브라우저 승인
4. `opencode mcp list`에서 `✓ Neon connected` 확인

각자 자기 Neon 프로젝트에 붙는 방식이므로 초대하거나 권한을 공유할 필요가 없다. 콜백 URL은 공유 금지.
