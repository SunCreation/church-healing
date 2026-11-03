#!/usr/bin/env python3
"""Touch integration smoke. Requires Python Playwright and Google Chrome.

Start npm start separately. BASE_URL=http://localhost:8788 python3 scripts/smoke-mobile.py
Use --screenshots DIR to save portrait/landscape evidence. No DB writes.
"""
import argparse
import json
import math
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--screenshots', type=Path)
args = parser.parse_args()
base = os.environ.get('BASE_URL', 'http://localhost:8787')


class Fingers:
    def __init__(self, page, session):
        self.page, self.session, self.points = page, session, {}

    def send(self, kind):
        self.session.send('Input.dispatchTouchEvent', {
            'type': kind, 'touchPoints': list(self.points.values()),
        })

    def down(self, selector, finger=1):
        box = self.page.locator(selector).bounding_box()
        assert box, selector
        self.points[finger] = {'id': finger, 'x': box['x'] + box['width'] / 2,
                               'y': box['y'] + box['height'] / 2}
        self.send('touchStart')

    def up(self, finger):
        ended = self.points.pop(finger)
        self.session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [ended]})

    def end(self):
        if not self.points:
            return
        self.points.clear()
        self.send('touchEnd')

    def hold(self, action, ms):
        self.down(f'[data-touch-hold="{action}"]')
        self.page.wait_for_timeout(ms)
        self.up(1)
        self.page.wait_for_timeout(180)

    def tap(self, selector):
        self.down(selector, 9)
        self.up(9)


def distance(a, b):
    return math.hypot(a['x'] - b['x'], a['z'] - b['z'])


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844},
                                  device_scale_factor=1, is_mobile=True, has_touch=True)
    # Keep UI tests independent of availability/rate limits of the official site.
    context.route('**/api/news', lambda route: route.fulfill(json={
        'groups': [{'key': key, 'label': label, 'items': [{
            'title': label + ' 테스트', 'date': '2026.11.03',
            'url': 'https://www.shindoch.org/main/' + module + '/board/1',
        }]} for key, label, module in [('notice', '공지사항', 'e0101'), ('bulletin', '주보', 'e04')]],
    }))
    page = context.new_page()
    errors, positions = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))

    def frame(payload):
        data = json.loads(payload)
        if data.get('t') == 'pos':
            positions.append(data)

    page.on('websocket', lambda socket: socket.on('framesent', frame))
    fingers = Fingers(page, context.new_cdp_session(page))

    def start():
        fingers.end()
        positions.clear()
        page.goto(base, wait_until='networkidle')
        page.evaluate('''() => {
          window.touchEvents = [];
          for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
            document.addEventListener(name, e => window.touchEvents.push([name, e.pointerId, e.target.id || e.target.dataset.touchHold, e.clientX]));
          }
        }''')
        page.fill('#nameInput', '모바일검증')
        page.locator('#entryForm button[type=submit]').tap()
        expect(page.locator('#connBadge')).to_contain_text('연결됨')
        expect(page.locator('#touchControls')).to_be_visible()
        page.wait_for_timeout(250)
        assert positions

    def position():
        return dict(positions[-1])

    def go_to(x, z):
        for _ in range(6):
            current = position()
            dx, dz = x - current['x'], z - current['z']
            if math.hypot(dx, dz) < 0.4:
                return
            yaw = math.atan2(dx, dz)
            turn = (yaw - current['rot'] + math.pi) % (2 * math.pi) - math.pi
            if abs(turn) > 0.03:
                fingers.hold('left' if turn > 0 else 'right', abs(turn) / 2.4 * 1000)
            fingers.hold('forward', math.hypot(dx, dz) / 5.8 * 1000)
        assert distance(position(), {'x': x, 'z': z}) < 0.8

    start()
    origin = position()
    fingers.hold('forward', 450)
    walked = position()
    assert walked['z'] < origin['z'] - 0.5
    page.wait_for_timeout(300)
    assert distance(walked, position()) < 0.05, 'movement stuck after release'
    fingers.hold('backward', 450)
    assert position()['z'] > walked['z'] + 0.5
    run_origin = position()
    fingers.down('[data-touch-hold="forward"]', 1)
    fingers.down('[data-touch-hold="run"]', 2)
    page.wait_for_timeout(450)
    fingers.end()
    page.wait_for_timeout(180)
    assert distance(run_origin, position()) > distance(origin, walked) * 1.05
    for action, sign in [('left', 1), ('right', -1)]:
        before = position()
        fingers.hold(action, 350)
        assert (position()['rot'] - before['rot']) * sign > 0.3

    # Two simultaneous fingers: releasing movement must not end the view drag.
    fingers.down('[data-touch-hold="forward"]', 1)
    fingers.points[2] = {'id': 2, 'x': 220, 'y': 320}
    fingers.send('touchStart')
    before = position()
    fingers.points[2]['x'] += 50
    fingers.send('touchMove')
    page.wait_for_timeout(250)
    assert position()['rot'] < before['rot'] - 0.1, (before, position(), page.evaluate('() => window.touchEvents.slice(-20)'))
    fingers.up(1)
    before = position()
    fingers.points[2]['x'] += 40
    fingers.send('touchMove')
    page.wait_for_timeout(250)
    assert position()['rot'] < before['rot'] - 0.1, (before, position(), page.evaluate('() => window.touchEvents.slice(-20)'))
    fingers.end()

    # Cancel, panel opening, typing, window blur and rotation all stop held input.
    fingers.down('[data-touch-hold="forward"]')
    fingers.points.clear()
    fingers.send('touchCancel')
    page.wait_for_timeout(180)
    before = position()
    page.wait_for_timeout(250)
    assert distance(before, position()) < 0.05
    fingers.down('[data-touch-hold="forward"]')
    fingers.tap('[data-panel="verse"]')
    expect(page.locator('#sidePanel')).to_have_class('side-panel open')
    expect(page.locator('#touchControls')).not_to_be_visible()
    page.wait_for_timeout(180)
    before = position()
    page.wait_for_timeout(250)
    assert distance(before, position()) < 0.05
    fingers.end()
    page.locator('#panelClose').tap()
    page.locator('#chatInput').tap()
    expect(page.locator('#touchControls')).not_to_be_visible()
    page.locator('#chatInput').blur()
    expect(page.locator('#touchControls')).to_be_visible()
    fingers.down('[data-touch-hold="forward"]')
    page.evaluate('() => window.dispatchEvent(new Event("blur"))')
    page.wait_for_timeout(180)
    before = position()
    page.wait_for_timeout(250)
    assert distance(before, position()) < 0.05
    fingers.end()

    start()
    go_to(2.5, 5)
    expect(page.locator('[data-touch-label]')).to_have_text('앉기')
    fingers.tap('[data-touch-interact]')
    expect(page.locator('[data-touch-label]')).to_have_text('일어서기')
    page.wait_for_timeout(180)
    assert position()['seat'] is not None
    seated = position()
    fingers.hold('forward', 300)
    assert distance(seated, position()) < 0.05
    fingers.tap('[data-touch-interact]')
    page.wait_for_timeout(180)
    assert position()['seat'] is None

    start()
    go_to(0, 24)
    go_to(-10.4, 21.7)
    expect(page.locator('[data-touch-label]')).to_have_text('게시판 열기')
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(args.screenshots / '12_mobile_controls.png'), animations='disabled')
    fingers.tap('[data-touch-interact]')
    expect(page.locator('#bulletinViewer')).to_be_visible()
    page.locator('#weeklyTab').tap()
    expect(page.locator('#weeklyTab')).to_have_attribute('aria-selected', 'true')
    page.locator('#bulletinClose').tap()
    fingers.down('[data-touch-hold="left"]')
    page.set_viewport_size({'width': 844, 'height': 390})
    page.wait_for_timeout(250)
    assert not page.locator('.touch-key.is-held').count()
    fingers.end()
    for control in page.locator('.touch-key, .touch-interact').all():
        box = control.bounding_box()
        assert box and box['width'] >= 44 and box['height'] >= 44
        assert box['y'] >= 0 and box['y'] + box['height'] <= 390
    if args.screenshots:
        page.screenshot(path=str(args.screenshots / '13_mobile_landscape.png'), animations='disabled')
    assert not errors, errors
    context.close()

    # Desktop keyboard and mouse remain available; touch overlay stays hidden.
    desktop = browser.new_page(viewport={'width': 1440, 'height': 900})
    desktop.on('pageerror', lambda e: errors.append(str(e)))
    desktop.goto(base, wait_until='networkidle')
    desktop.fill('#nameInput', 'PC검증')
    desktop.click('#entryForm button[type=submit]')
    expect(desktop.locator('#touchControls')).not_to_be_visible()
    desktop.keyboard.down('ArrowRight')
    desktop.wait_for_timeout(300)
    desktop.keyboard.up('ArrowRight')
    expect(desktop.locator('#headingText')).not_to_contain_text('0°')
    desktop.click('[data-panel="verse"]')
    before = desktop.inner_text('#headingText')
    desktop.keyboard.down('ArrowRight')
    desktop.wait_for_timeout(200)
    desktop.keyboard.up('ArrowRight')
    assert desktop.inner_text('#headingText') == before
    assert not errors, errors
    browser.close()
print('PASS: touch movement/turn/run, multi-touch look, cancel/pause/blur/resize, sit/stand, board, landscape, PC; no page errors')
