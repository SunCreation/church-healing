#!/usr/bin/env python3
"""Read-only browser monitoring of the live app, not an uptime guarantee."""
import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit, urlunsplit


def base_url(value):
    url = urlsplit(value)
    local = url.hostname in ('localhost', '127.0.0.1', '::1')
    if not url.hostname or (url.scheme != 'https' and not (local and url.scheme == 'http')):
        raise ValueError('A public HTTPS URL (or local HTTP test URL) is required')
    if url.username or url.password or url.query or url.fragment:
        raise ValueError('Credentials, query strings and fragments are not allowed')
    if url.path not in ('', '/', '/api/health'):
        raise ValueError('Use the site root or /api/health URL')
    return urlunsplit((url.scheme, url.netloc, '/', '', ''))


def movement_result(before, during_walk, during_turn):
    if not during_walk or not during_turn:
        raise AssertionError('No movement updates were sent over WebSocket')
    moved = max(math.hypot(p['x'] - before['x'], p['z'] - before['z']) for p in during_walk)
    turned = max(abs((p['rot'] - during_turn[0]['rot'] + math.pi) % (2 * math.pi) - math.pi)
                 for p in during_turn)
    if moved < 0.05 or not any(p.get('moving') for p in during_walk):
        raise AssertionError('The avatar did not move')
    if turned < 0.05:
        raise AssertionError('The avatar did not turn')
    return {'moved_metres': round(moved, 2), 'turned_radians': round(turned, 2)}


def monitor(target, output):
    # Import lazily so configuration/unit tests do not need a browser installation.
    from playwright.sync_api import sync_playwright, expect

    report = {'url': target, 'started_at': datetime.now(timezone.utc).isoformat(), 'ok': False}
    output.mkdir(parents=True, exist_ok=True)
    positions, messages, errors, writes, welcomes = [], [], [], [], []
    with sync_playwright() as p:
        launch = {'headless': True, 'args': ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
        if os.environ.get('BROWSER_CHANNEL'):
            launch['channel'] = os.environ['BROWSER_CHANNEL']
        browser = p.chromium.launch(**launch)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.set_default_timeout(20_000)

        def guard(route):
            if route.request.method not in ('GET', 'HEAD', 'OPTIONS'):
                writes.append(route.request.method)
                route.abort()
            else:
                route.continue_()

        def sent(payload):
            data = json.loads(payload)
            messages.append(data.get('t'))
            if data.get('t') == 'pos':
                positions.append(data)

        def received(payload):
            data = json.loads(payload)
            if data.get('t') == 'welcome':
                welcomes.append(data['you'])

        def socket_open(socket):
            socket.on('framesent', sent)
            socket.on('framereceived', received)

        page.route('**/*', guard)
        page.on('websocket', socket_open)
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            response = page.goto(target, wait_until='domcontentloaded', timeout=60_000)
            assert response and response.ok, 'The app root did not return HTTP success'
            expect(page.locator('#entryForm')).to_be_visible()
            page.fill('#nameInput', '상태점검봇')
            page.click('#entryForm button[type=submit]')
            expect(page.locator('#onlineCount')).to_contain_text('함께 예배하는 중')
            assert welcomes, 'WebSocket welcome was not received'
            assert page.locator('#scene').evaluate('''canvas => {
              const gl = canvas.getContext('webgl2');
              return !!gl && !gl.isContextLost() && gl.drawingBufferWidth > 0;
            }'''), 'WebGL renderer is unavailable'

            page.keyboard.down('ArrowUp')
            page.wait_for_timeout(600)
            page.keyboard.up('ArrowUp')
            page.wait_for_timeout(150)
            walk = list(positions)
            page.keyboard.down('ArrowDown')
            page.wait_for_timeout(600)
            page.keyboard.up('ArrowDown')
            first_turn = len(positions)
            turn_baseline = positions[-1]
            heading_before = page.inner_text('#headingText')
            page.keyboard.down('ArrowLeft')
            try:
                page.wait_for_timeout(400)
                # Software rendering on CI may produce very few frames.
                expect(page.locator('#headingText')).not_to_have_text(heading_before, timeout=10_000)
            finally:
                page.keyboard.up('ArrowLeft')
            page.wait_for_timeout(250)
            turn = [turn_baseline] + positions[first_turn:]
            page.keyboard.down('ArrowRight')
            page.wait_for_timeout(400)
            page.keyboard.up('ArrowRight')
            report.update(movement_result(welcomes[0], walk, turn))

            page.click('[data-panel="verse"]')
            expect(page.locator('#panelBody .verse-text')).to_be_visible()
            page.click('#panelClose')
            page.click('[data-panel="news"]')
            expect(page.locator('#bulletinViewer')).to_be_visible()
            page.click('#weeklyTab')
            expect(page.locator('#weeklyTab')).to_have_attribute('aria-selected', 'true')
            page.click('#noticeTab')
            expect(page.locator('#noticeTab')).to_have_attribute('aria-selected', 'true')
            page.click('#bulletinClose')
            expect(page.locator('#bulletinViewer')).to_be_hidden()
            assert not writes, 'A mutating HTTP request was blocked'
            assert set(messages) <= {'join', 'pos'}, 'Unexpected WebSocket action'
            assert not errors, errors
            report.update(ok=True, websocket_updates=len(positions),
                          checks=['entry', 'webgl', 'websocket', 'walk', 'turn', 'verse', 'news-tabs'],
                          blocked_writes=len(writes))
        except Exception as error:
            report['error'] = str(error)
            report['page_errors'] = errors
            report['websocket_updates'] = len(positions)
            report['recent_bot_positions'] = positions[-5:]
            try:
                page.screenshot(path=str(output / 'failure.png'))
            except Exception:
                pass
        finally:
            browser.close()  # Disconnect the bot; never occupy a seat or persist content.
            report['finished_at'] = datetime.now(timezone.utc).isoformat()
            (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default=os.environ.get('RENDER_HEALTH_URL', ''))
    parser.add_argument('--check-config', action='store_true')
    args = parser.parse_args()
    try:
        target = base_url(args.base_url)
    except ValueError as error:
        parser.error(str(error))
    if args.check_config:
        print(target)
        return 0
    report = monitor(target, Path('artifacts/render-browser'))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('## Render browser check\n\n')
            summary.write('```json\n' + json.dumps(report, ensure_ascii=False, indent=2) + '\n```\n')
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
