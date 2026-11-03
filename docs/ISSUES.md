# 알려진 이슈 / 백로그

우선순위: P0(차단) > P1(출시 전) > P2(개선). 상태: open / planned / done

## 기능·품질

| ID | 우선 | 상태 | 내용 |
|---|---|---|---|
| W-001 | P1 | done | **레이트리밋 적용** — 메모리 기준 API 600/분·쓰기 60/분·게시글 30/분·촛불 15/분·채팅 10초 5회. 다중 인스턴스로 확장하면 Redis 필요 |
| W-002 | P1 | open | **모더레이션 부재** — 게시글/댓글 신고·숨김·삭제. 운영자 토큰 기반 관리 API 필요 |
| W-003 | P2 | open | 촛불 위치가 클라이언트 로컬 랜덤 — 새로고침 시 재배치. 서버가 좌표를 배정하도록 |
| W-004 | P2 | done | ~~SQLite 이전~~ → **Neon/Lakebase Postgres** (ADR-011). 단일 인스턴스 내 동시성 해결, 백업은 Neon Restore 또는 `pg_dump` |
| W-005 | P2 | open | 게시글 페이지네이션 없음 (전체 반환). cursor 기반으로 |
| W-006 | P2 | open | 말씀 풀 12개 하드코딩 — DB화 + 매일 갱신/절기 말씀 |
| W-007 | P2 | open | 사운드 없음 — 배경 성가/ambience(Web Audio, 음소거 기본) |
| W-008 | P1 | open | 접근성 — 키보드만으로 패널 조작/포커스 트랩, 스크린리더용 aria 점검 |
| W-009 | P2 | open | iOS Safari 성능 — 픽셀비율/섀도맵 자동 축소, `devicePixelRatio>2` 캡 |
| W-010 | P2 | open | 테스트 자동화 — Playwright 스모크를 CI로 (GitHub Actions), API 통합 테스트 |

## 보안/프라이버시

| ID | 우선 | 상태 | 내용 |
|---|---|---|---|
| S-001 | P1 | done | CSP 설정 완료 (`default-src 'self'`; YouTube frame-src만 허용) + X-Frame-Options/Referrer-Policy/Permissions-Policy/nosniff, `X-Powered-By` 제거 |
| S-002 | P1 | open | 닉네임 사칭/욕설 필터링 없음 |
| S-003 | P2 | open | YouTube 임베드 쿠키 — `youtube-nocookie.com` 도메인으로 교체 검토 |
| S-004 | P2 | open | `data/db.json` 백업/복구 절차 문서화 → Neon Restore/`pg_dump` 안내로 대체(W-004) |

## 법적/브랜드

| ID | 우선 | 상태 | 내용 |
|---|---|---|---|
| L-001 | P1 | open | 비공식 고지 사용자 눈에 더 띄게 (현재 입장 하단 소자) — 안내 패널 상단 고정 검토 |
| L-002 | P2 | open | "여의도순복음교회" 명칭 사용 범위 — 공식 문의 또는 disclaimer 강화 |
| L-003 | P2 | planned | 성경 인용 저작권 검토 (ADR-009) |

## 완료

| ID | 내용 |
|---|---|
| ~~B-001~~ | 스크린 텍스처 이중 래핑으로 검은 화면 (`canvasTexture(slideTexture(...))`) → 2026-11-03 수정 |
| ~~B-002~~ | 카메라가 입구 벽 밖에서 시작 → 스폰 z=10.5 + 카메라 룸 클램프 |
| ~~B-003~~ | 예배중계 "video unavailable" → 공식 LIVE 재생목록 임베드로 교체 (ADR-006) |
| ~~B-004~~ | Google Fonts stylesheet CSP 차단 → `style-src` allowlist에 `fonts.googleapis.com` 추가 |
| ~~B-005~~ | Neon Postgres 연동 — JSON 시드 영구 저장으로 대체 (ADR-011) |
| ~~B-006~~ | 앞마당 게시판(공식 순복음소식) + 페우 개별 좌석 앉기, 시야 방향 동기화, 앞마당 씬 분리 없이 통합 |
