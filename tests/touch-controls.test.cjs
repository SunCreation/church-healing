const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const source = readFileSync(require.resolve('../public/js/touch-controls.js'), 'utf8');
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

class Element extends EventTarget {
  constructor(action) {
    super();
    this.dataset = { touchHold: action };
    this.disabled = false;
    this.attrs = {};
    this.capture = new Set();
    this.classList = { toggle() {} };
    this.textContent = '가까이 가세요';
  }
  setAttribute(name, value) { this.attrs[name] = value; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100 }; }
  setPointerCapture(id) { this.capture.add(id); }
  hasPointerCapture(id) { return this.capture.has(id); }
  releasePointerCapture(id) {
    if (this.capture.delete(id)) fire(this, 'lostpointercapture', id);
  }
}
function fire(target, type, id, x = 0, y = 0) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: id, button: 0, clientX: x, clientY: y });
  target.dispatchEvent(event);
}
async function setup() {
  const { createTouchControls } = await modulePromise;
  const buttons = ['forward', 'backward', 'left', 'right', 'run'].map((action) => new Element(action));
  const root = new Element();
  const canvas = new Element();
  const action = new Element();
  const label = new Element();
  const looks = [];
  let interactions = 0;
  root.querySelectorAll = () => buttons;
  root.querySelector = (selector) => selector === '[data-touch-interact]' ? action : label;
  const input = createTouchControls({ root, canvas,
    onLook: (x, y) => looks.push([x, y]), onInteract: () => { interactions += 1; },
  });
  return { input, root, canvas, buttons, action, label, looks, interactions: () => interactions };
}

test('동시 이동·회전·달리기 포인터를 독립적으로 해제한다', async () => {
  const { input, buttons } = await setup();
  fire(buttons[0], 'pointerdown', 1);
  fire(buttons[2], 'pointerdown', 2);
  fire(buttons[4], 'pointerdown', 3);
  assert.ok(input.has('forward') && input.has('left') && input.has('run'));
  fire(buttons[2], 'pointerup', 2);
  assert.ok(!input.has('left') && input.has('forward') && input.has('run'));
  fire(buttons[0], 'pointercancel', 1);
  buttons[4].releasePointerCapture(3);
  assert.ok(!input.has('forward') && !input.has('run'));
});

test('같은 버튼의 두 손가락 중 하나를 떼도 나머지 입력을 보존한다', async () => {
  const { input, buttons } = await setup();
  fire(buttons[0], 'pointerdown', 1);
  fire(buttons[0], 'pointerdown', 2);
  fire(buttons[0], 'pointerup', 1);
  assert.ok(input.has('forward'));
  fire(buttons[0], 'pointerup', 2);
  assert.ok(!input.has('forward'));
});

test('이동 중 다른 손가락으로 시야를 돌리고 다른 포인터 이동은 무시한다', async () => {
  const { input, buttons, canvas, looks } = await setup();
  fire(buttons[0], 'pointerdown', 1);
  fire(canvas, 'pointerdown', 2, 100, 100);
  fire(canvas, 'pointermove', 1, 150, 160);
  fire(canvas, 'pointermove', 2, 120, 130);
  assert.deepEqual(looks, [[20, 30]]);
  fire(buttons[0], 'pointerup', 1);
  fire(canvas, 'pointermove', 2, 130, 140);
  assert.deepEqual(looks, [[20, 30], [10, 10]]);
  fire(canvas, 'pointercancel', 2);
  fire(canvas, 'pointermove', 2, 150, 160);
  assert.equal(looks.length, 2);
  assert.ok(!input.has('forward'));
});

test('패널/포커스 중단 및 초기화 후 입력이 붙어 있지 않는다', async () => {
  const { input, root, buttons, canvas, looks } = await setup();
  fire(buttons[0], 'pointerdown', 1);
  fire(canvas, 'pointerdown', 2);
  input.setPaused(true);
  assert.ok(root.inert && !input.has('forward'));
  fire(buttons[0], 'pointerdown', 3);
  fire(canvas, 'pointermove', 2, 50, 50);
  assert.equal(looks.length, 0);
  input.setPaused(false);
  assert.ok(!input.has('forward'));
  fire(buttons[0], 'pointerdown', 4);
  input.reset();
  assert.ok(!input.has('forward') && !buttons[0].hasPointerCapture(4));
});

test('앉은 상태에서는 이동을 막고 상호작용 버튼으로 일어설 수 있다', async () => {
  const { input, buttons, action, label, interactions } = await setup();
  input.setMovementEnabled(false);
  assert.ok(buttons.every((button) => button.disabled));
  fire(buttons[0], 'pointerdown', 1);
  assert.ok(!input.has('forward'));
  input.setInteraction('일어서기');
  action.dispatchEvent(new Event('click'));
  assert.equal(label.textContent, '일어서기');
  assert.equal(interactions(), 1);
  input.setInteraction(null);
  action.dispatchEvent(new Event('click'));
  assert.equal(interactions(), 1);
});

test('터치 탭은 한 번만 실행하고 새 패널로 click이 전달되지 않는다', async () => {
  const { bindTap } = await modulePromise;
  const button = new Element();
  const doc = new EventTarget();
  button.ownerDocument = doc;
  let calls = 0;
  bindTap(button, () => { calls += 1; });
  const tap = new Event('pointerup', { cancelable: true });
  Object.assign(tap, { pointerType: 'touch', clientX: 50, clientY: 50 });
  button.dispatchEvent(tap);
  const click = new Event('click', { cancelable: true });
  Object.assign(click, { detail: 1 });
  doc.dispatchEvent(click);
  assert.equal(calls, 1);
  assert.ok(click.defaultPrevented);
  doc.dispatchEvent(new Event('pointerdown'));
  const next = new Event('click', { cancelable: true });
  Object.assign(next, { detail: 1 });
  doc.dispatchEvent(next);
  assert.ok(!next.defaultPrevented);
  button.dispatchEvent(new Event('click')); // 키보드/보조 기술의 detail=0 click
  assert.equal(calls, 2);
});
