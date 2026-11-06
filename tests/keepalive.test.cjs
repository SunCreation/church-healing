const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const workflow = readFileSync(join(__dirname, '../.github/workflows/render-keepalive.yml'), 'utf8');
const script = readFileSync(join(__dirname, '../scripts/check-render-health.sh'), 'utf8');

function run(t, url, body, curlStatus = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'church-keepalive-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'curl'), `#!/usr/bin/env bash
echo request >> "$RUNNER_TEMP/calls"
while [[ $# -gt 0 ]]; do
  if [[ "$1" == --output ]]; then printf '%s' "$MOCK_BODY" > "$2"; shift; fi
  shift
done
exit "$MOCK_CURL_STATUS"
`, { mode: 0o755 });
  writeFileSync(join(dir, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RUNNER_TEMP: dir,
      RENDER_HEALTH_URL: url, MOCK_BODY: body, MOCK_CURL_STATUS: String(curlStatus) },
  });
  let calls = 0;
  try { calls = readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n').length; } catch {}
  return { ...result, calls };
}

test('keepalive를 5분 간격·수동 실행·제한 시간·최소 권한으로 설정한다', () => {
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /timeout-minutes: 6/);
  assert.match(workflow, /run: bash scripts\/check-render-health.sh/);
  assert.match(workflow, /run: python3 scripts\/monitor-render.py/);
  assert.match(workflow, /retention-days: 1/);
  assert.equal(spawnSync('bash', ['-n'], { input: script }).status, 0);
});

test('브라우저 검사 대상 주소·이동 검증 단위 테스트', () => {
  const result = spawnSync('python3', [join(__dirname, 'test_browser_monitor.py')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('주소 미설정 또는 HTTP 주소는 요청 전에 실패한다', (t) => {
  for (const url of ['', 'http://example.invalid/api/health']) {
    const result = run(t, url, '{"ok":true}');
    assert.notEqual(result.status, 0);
    assert.equal(result.calls, 0);
    assert.match(result.stdout, /::error::/);
  }
});

test('정상 health 응답이면 요청 한 번으로 성공한다', (t) => {
  const result = run(t, 'https://example.invalid/api/health', '{"ok":true,"storage":"postgres"}');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls, 1);
});

test('HTTP 오류·기동 HTML·ok=false 응답은 세 번 시도한 뒤 실패한다', (t) => {
  for (const [body, status] of [['', 22], ['<html>Starting…</html>', 0], ['{"ok":false}', 0]]) {
    const result = run(t, 'https://example.invalid/api/health', body, status);
    assert.notEqual(result.status, 0);
    assert.equal(result.calls, 3);
    assert.match(result.stdout, /after three attempts/);
  }
});
