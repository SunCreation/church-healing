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
