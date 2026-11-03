# 아키텍처

## 스택 요약

| 계층 | 기술 | 이유 |
|---|---|---|
| 3D 렌더링 | Three.js (r166, `/vendor/three/three.module.js`로 로컬 서빙) | 빌드 없는 ES 모듈 직접 사용, 오프라인 배포 가능 |
| 클라이언트 | Vanilla ES Modules + CSS 커스텀 (프레임워크 없음) | 번들러 0, 로딩/디버깅 단순 |
| 서버 | Node.js + Express 4 + `ws` 8 | 정적 서빙 + REST + WS를 단일 프로세스로 |
| 저장소 | `data/db.json` (디바운스 저장) | 초기 단계 단순성. 트래픽 증가 시 SQLite 이전 예정 |
| 실시간 | WebSocket `/ws`, 12Hz 위치 동기화 | 가볍고 브라우저 범용 |

## 디렉터리

```
church-healing/
├─ PRD.md                 제품 요구사항
├─ README.md
├─ package.json
├─ data/db.json            (gitignore) 런타임 생성, 시드는 server/db.js
├─ server/
│  ├─ index.js             Express 라우트 + WS 룸 + 인메모리 players Map
│  └─ db.js                JSON 로드/저장 (structuredClone 시드)
└─ public/
   ├─ index.html           입장 화면(#entry) → 앱(#app, canvas + HUD + 사이드 패널)
   ├─ css/style.css
   └─ js/
      ├─ main.js           씬/카메라/입력/WS/채팅/패널 오케스트레이션
      ├─ sanctuary.js      예배당 빌드 (캔버스 텍스처 절차적 생성, AABB 충돌체 반환)
      ├─ avatars.js        캡슐+구체 저폴리 아바타, 이름표/말풍선 스프라이트
      └─ panels.js         5개 패널 렌더/바인딩, escapeHtml 강제
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

클라이언트 → 서버

| 메시지 | 필드 | 비고 |
|---|---|---|
| `join` | `name`, `color(#rrggbb)` | 이름 20자, 색상 정규식 검증 |
| `pos`  | `x`, `z`, `rot`, `moving` | 서버가 실내 바운드로 클램프 |
| `chat` | `text` | 200자 제한, 전원 브로드캐스트 |

서버 → 클라이언트

| 메시지 | 필드 | 비고 |
|---|---|---|
| `welcome` | `you`, `players[]`, `candleCount` | 입장자 본인 포함 players는 자신 제외 |
| `join`    | `player` | 본인 제외 브로드캐스트 |
| `leave`   | `id`, `name` | 연결 종료 시 |
| `pos`     | `id`, `x`, `z`, `rot`, `moving` | 본인 제외, 수신 측 보간 |
| `chat`    | `id`, `name`, `text`, `at` | 본인 포함 전원 |
| `candle`  | `candle{id,note,name,createdAt}` | `POST /api/candle` 경유 |
| `error`   | `message` | 잘못된 페이로드 |

## REST API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | `{ ok, players }` |
| GET | `/api/verse` | 오늘의 말씀 (UTC 날짜 로테이션, 12절) |
| GET | `/api/schedule` | 예배 시간표(공식 편성 요약) + `official`(링크/임베드) |
| GET | `/api/posts?category=` | 목록 (최신순) |
| POST | `/api/posts` | 생성 `{name?, category, title, body}` |
| POST | `/api/posts/:id/like` | 공감 +1 |
| POST | `/api/posts/:id/comments` | 댓글 추가 |
| GET | `/api/prayers` | 최근 100개 |
| POST | `/api/prayers` | 기도 제목 (`anonymous` 지원) |
| POST | `/api/candle` | 촛불 접수 → WS `candle` 브로드캐스트 |

## 3D 씬 개요

- 룸 56×38×15, 단상(z<0) 쪽이 "성소", 입구(z>0) 반대편
- 중앙 회랑(폭 3.6) + 양측 페우 8열×2, 충돌체는 AABB 목록으로 반환
- 십자가: `MeshStandardMaterial(emissive)` + PointLight(맥동) + AdditiveBlending 빛줄기 콘 + 후광 Plane
- 텍스처는 전부 `document.createElement('canvas')` 절차적 생성 (스테인드글라스/카펫/스크린/레터링) → 외부 이미지 0
- 조명: Hemisphere + Directional(섀도 2048) + PointLight 2개 (십자가/필)

## 좌표/충돌 규칙

- 플레이어 반경 0.55, 원–AABB 최근접점 밀어내기 + 룸 경계 클램프
- 카메라(3인칭 오빗)도 룸 내부로 클램프 (`dims` 사용)
- 스폰: `(0, 0, 10.5)`, 십자가 정면(-z)

## 보안/프라이버시

- 계정/쿠키/IP 수집 없음. 닉네임은 localStorage에만
- 사용자 입력: 서버 길이 제한 + 클라이언트 `escapeHtml` (게시글/댓글/기도/이름)
- JSON body 256KB, 색상은 `#rrggbb` 정규식만 허용
- (미비) 레이트리밋·신고·모더레이션 → `docs/ISSUES.md`

## 테스트 / 검증

헤드리스 Chrome(Playwright Python 1.58, `channel='chrome'`)으로 스모크:

1. 입장 폼 제출 → 3.5초 대기
2. 스크린샷 7장 (`docs/screenshots/`) — 콘솔 에러/페이지 에러 수집
3. 패널 5종 열기 → ESC 닫기
4. 채팅 1건 전송 → 말풍선 확인

결과: `NO_CONSOLE_ERRORS`. 재현: 서버 실행 후 스크립트 실행 (스크린샷은 참고 자료).

## 배포 메모

- 단일 노드에서 `PORT=xxxx node server/index.js` 로 동작 (정적+WS 동일 오리진)
- WS는 sticky session 불필요(단일 프로세스). 다중 인스턴스 시 Redis pub/sub 또는 룸 분리 필요
- `data/db.json`은 영속 볼륨에 배치. 백업은 파일 단위로 충분
- 리버스 프록시(nginx) 뒤에 둘 경우 `Upgrade`/`Connection` 헤더 전달 필요

## 확장 포인트

- 룸 샤딩(입장 인원 상한), 음성( WebRTC ), 배경 성가( Web Audio )
- 말씀 풀 DB화 + 관리자 페이지, 절기 이벤트 훅
- SQLite(better-sqlite3) 이전, 레이트리밋 미들웨어, 신고/숨김
