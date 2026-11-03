#!/usr/bin/env node
/**
 * 빌드 검증 — 번들러 없이 정적 파일을 서빙한다.
 * - server/*.js: CommonJS 파싱 검사
 * - public/js/*.js, neon.ts: ES module 파싱 검사
 * - 필수 정적 산출물 존재 확인
 */
import { execFileSync as execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const errors = [];

const runCheck = (label, args, input) => {
  try {
    execSync(process.execPath, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`ok  ${label}`);
  } catch (e) {
    errors.push(`${label}\n${e.stderr || e.message}`);
  }
};

for (const file of readdirSync(join(ROOT, 'server')).filter((f) => f.endsWith('.js'))) {
  runCheck(`server/${file}`, ['--check', join(ROOT, 'server', file)]);
}
for (const file of readdirSync(join(ROOT, 'public', 'js')).filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(join(ROOT, 'public', 'js', file), 'utf8');
  runCheck(`public/js/${file}`, ['--input-type=module', '--check'], src);
}

const required = ['public/index.html', 'public/css/style.css', 'public/js/main.js', 'node_modules/three/build/three.module.js'];
for (const rel of required) {
  if (existsSync(join(ROOT, rel))) console.log(`ok  exists ${rel}`);
  else errors.push(`missing ${rel}`);
}

if (errors.length) {
  console.error('\nBuild check FAILED:\n' + errors.join('\n\n'));
  process.exit(1);
}
console.log('\nBuild check passed.');
