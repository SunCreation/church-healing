/** 두 번째 손가락의 탭도 처리하고 뒤따르는 호환 click은 한 번만 실행한다. */
let handledPointerTap = -Infinity;
const tapDocuments = new WeakSet();
export function bindTap(element, callback) {
  let lastPointerTap = -Infinity;
  const doc = element.ownerDocument;
  if (doc && !tapDocuments.has(doc)) {
    tapDocuments.add(doc);
    doc.addEventListener('pointerdown', () => { handledPointerTap = -Infinity; }, true);
    doc.addEventListener('click', (event) => {
      // 탭으로 패널이 열려도 뒤따르는 click이 새 배경/링크를 누르지 않도록 한다.
      if (event.detail > 0 && event.timeStamp - handledPointerTap < 500) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }
  element.addEventListener('pointerup', (event) => {
    if (!['touch', 'pen'].includes(event.pointerType) || element.disabled) return;
    const rect = element.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) return;
    event.preventDefault();
    lastPointerTap = event.timeStamp;
    handledPointerTap = event.timeStamp;
    callback();
  });
  element.addEventListener('click', (event) => {
    if (element.disabled || (event.detail > 0 && event.timeStamp - lastPointerTap < 500)) return;
    callback();
  });
}

/** Pointer Events: 여러 손가락의 이동/달리기/시야 입력을 서로 분리한다. */
export function createTouchControls({ root, canvas, onLook, onInteract }) {
  const held = new Map();
  const buttons = [...root.querySelectorAll('[data-touch-hold]')];
  const actionButton = root.querySelector('[data-touch-interact]');
  const actionLabel = root.querySelector('[data-touch-label]');
  let paused = false;
  let look = null;

  function release(target, id) {
    if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
  }
  function paint() {
    for (const button of buttons) {
      const down = [...held.values()].some((entry) => entry.button === button);
      button.classList.toggle('is-held', down);
      button.setAttribute('aria-pressed', String(down));
    }
  }
  function resetLook() {
    const previous = look;
    look = null;
    if (previous) release(canvas, previous.id);
  }
  function reset() {
    const previous = [...held.entries()];
    held.clear();
    for (const [id, { button }] of previous) release(button, id);
    paint();
    resetLook();
  }

  for (const button of buttons) {
    button.addEventListener('pointerdown', (event) => {
      if (paused || button.disabled || event.button !== 0) return;
      event.preventDefault();
      held.set(event.pointerId, { button, action: button.dataset.touchHold });
      button.setPointerCapture(event.pointerId);
      paint();
    });
    const end = (event) => {
      held.delete(event.pointerId);
      release(button, event.pointerId);
      paint();
    };
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', end);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  }
  bindTap(actionButton, () => {
    if (paused || actionButton.disabled) return;
    reset();
    onInteract();
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (paused || look || event.button !== 0) return;
    event.preventDefault();
    look = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!look || look.id !== event.pointerId || paused) return;
    const dx = event.clientX - look.x, dy = event.clientY - look.y;
    look.x = event.clientX; look.y = event.clientY;
    onLook(dx, dy);
  });
  const endLook = (event) => { if (look?.id === event.pointerId) resetLook(); };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);
  canvas.addEventListener('lostpointercapture', endLook);

  return {
    has(action) { return !paused && [...held.values()].some((entry) => entry.action === action); },
    reset,
    setPaused(value) {
      if (paused === value) return;
      paused = value;
      root.inert = value;
      if (value) reset();
    },
    setMovementEnabled(enabled) {
      if (buttons[0].disabled === !enabled) return;
      reset();
      buttons.forEach((button) => { button.disabled = !enabled; });
    },
    setInteraction(label) {
      const disabled = paused || !label;
      if (actionButton.disabled !== disabled) actionButton.disabled = disabled;
      const text = label || '가까이 가세요';
      if (actionLabel.textContent !== text) {
        actionLabel.textContent = text;
        actionButton.setAttribute('aria-label', text);
      }
    },
  };
}
