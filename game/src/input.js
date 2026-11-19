// MARISOL BAY - keyboard + mouse-drag input state (drag orbit, no pointer lock).

const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  Space: 'jump',
  KeyE: 'interact',
  KeyF: 'action',
  Escape: 'pause',
  KeyR: 'reset',
};

export function buildInput(domElement) {
  const keys = {
    forward: false,
    back: false,
    left: false,
    right: false,
    run: false,
    jump: false,
    interact: false,
    action: false,
    pause: false,
    reset: false,
  };

  const pressed = {
    jump: false,
    interact: false,
    action: false,
    pause: false,
    reset: false,
  };

  const mouse = {
    dragging: false,
    dx: 0,
    dy: 0,
    wheel: 0,
    lastX: 0,
    lastY: 0,
  };

  let enabled = true;

  function setKey(code, down) {
    const name = KEY_MAP[code];
    if (!name) return false;
    if (down && !keys[name] && pressed[name] !== undefined) pressed[name] = true;
    keys[name] = down;
    return true;
  }

  function onKeyDown(e) {
    if (!enabled) return;
    if (e.repeat) {
      if (KEY_MAP[e.code]) e.preventDefault();
      return;
    }
    if (setKey(e.code, true)) e.preventDefault();
  }

  function onKeyUp(e) {
    if (setKey(e.code, false)) e.preventDefault();
  }

  function onPointerDown(e) {
    if (!enabled) return;
    if (e.button === 0 || e.button === 2) {
      mouse.dragging = true;
      mouse.lastX = e.clientX;
      mouse.lastY = e.clientY;
      if (domElement.setPointerCapture && e.pointerId !== undefined) {
        try {
          domElement.setPointerCapture(e.pointerId);
        } catch (err) {
          void err;
        }
      }
    }
  }

  function onPointerMove(e) {
    if (!mouse.dragging) return;
    mouse.dx += e.clientX - mouse.lastX;
    mouse.dy += e.clientY - mouse.lastY;
    mouse.lastX = e.clientX;
    mouse.lastY = e.clientY;
  }

  function onPointerUp() {
    mouse.dragging = false;
  }

  function onWheel(e) {
    if (!enabled) return;
    mouse.wheel += Math.sign(e.deltaY);
    e.preventDefault();
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  function onBlur() {
    for (const k of Object.keys(keys)) keys[k] = false;
    mouse.dragging = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('wheel', onWheel, { passive: false });
  domElement.addEventListener('contextmenu', onContextMenu);

  function consumeMouse() {
    const out = { dx: mouse.dx, dy: mouse.dy, wheel: mouse.wheel };
    mouse.dx = 0;
    mouse.dy = 0;
    mouse.wheel = 0;
    return out;
  }

  function consumePress(name) {
    if (pressed[name]) {
      pressed[name] = false;
      return true;
    }
    return false;
  }

  function readMovement() {
    return {
      forward: keys.forward,
      back: keys.back,
      left: keys.left,
      right: keys.right,
      run: keys.run,
      jump: keys.jump || consumePress('jump'),
    };
  }

  function setEnabled(v) {
    enabled = v;
    if (!v) onBlur();
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('wheel', onWheel);
    domElement.removeEventListener('contextmenu', onContextMenu);
  }

  return {
    keys,
    mouse,
    readMovement,
    consumeMouse,
    consumePress,
    setEnabled,
    dispose,
    get dragging() {
      return mouse.dragging;
    },
  };
}
