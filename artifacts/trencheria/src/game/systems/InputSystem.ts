// Shared input state — singleton store
// Uses double-buffering: events accumulate into "next" sets during the frame,
// then flushInput() swaps them into the "current" readable sets at frame start.
// This guarantees all useFrame consumers see the same consistent snapshot
// regardless of execution order.

const inputState = {
  keys: new Set<string>(),
  mouseButtons: new Set<number>(),

  // Readable this frame (filled by previous flush swap)
  _justPressed: new Set<string>(),
  _justClicked: new Set<number>(),
  pointerJustLocked: false,

  // Accumulating for next frame (filled by DOM events between frames)
  _justPressedNext: new Set<string>(),
  _justClickedNext: new Set<number>(),
  pointerJustLockedNext: false,

  // Chat/UI input focus — when true, game input is suppressed
  inputFocused: false,
};

let initialized = false;

export function setInputFocused(focused: boolean) {
  inputState.inputFocused = focused;
  if (focused) {
    // Clear all held keys when focusing input to prevent stuck keys
    inputState.keys.clear();
    inputState.mouseButtons.clear();
    inputState._justPressedNext.clear();
    inputState._justClickedNext.clear();
  }
}

export function initInput() {
  if (initialized) return;
  initialized = true;

  window.addEventListener('keydown', (e) => {
    // Skip game input when UI input is focused
    if (inputState.inputFocused) return;
    if (!inputState.keys.has(e.code)) {
      inputState._justPressedNext.add(e.code);
    }
    inputState.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    inputState.keys.delete(e.code);
  });
  window.addEventListener('mousedown', (e) => {
    if (inputState.inputFocused) return;
    if (!inputState.mouseButtons.has(e.button)) {
      inputState._justClickedNext.add(e.button);
    }
    inputState.mouseButtons.add(e.button);
  });
  window.addEventListener('mouseup', (e) => {
    inputState.mouseButtons.delete(e.button);
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) {
      inputState.pointerJustLockedNext = true;
    }
  });
  window.addEventListener('blur', () => {
    inputState.keys.clear();
    inputState.mouseButtons.clear();
    inputState._justPressedNext.clear();
    inputState._justClickedNext.clear();
  });
}

export function isKeyDown(code: string): boolean {
  return inputState.keys.has(code);
}

export function wasKeyJustPressed(code: string): boolean {
  return inputState._justPressed.has(code);
}

export function wasMouseJustClicked(button: number): boolean {
  if (button === 0 && inputState.pointerJustLocked) return false;
  return inputState._justClicked.has(button);
}

export function isMouseDown(button: number): boolean {
  return inputState.mouseButtons.has(button);
}

/**
 * Swap buffers: promote "next" events into "current" readable sets.
 * Must be called once per frame BEFORE any consumers read input.
 * With double-buffering, it doesn't matter if this runs first or last —
 * the pattern is: flush (swap) → all consumers read → DOM events accumulate into "next".
 */
export function flushInput() {
  // Swap: next becomes current, clear next for new accumulation
  const tmpKeys = inputState._justPressed;
  inputState._justPressed = inputState._justPressedNext;
  inputState._justPressedNext = tmpKeys;
  tmpKeys.clear();

  const tmpClicks = inputState._justClicked;
  inputState._justClicked = inputState._justClickedNext;
  inputState._justClickedNext = tmpClicks;
  tmpClicks.clear();

  inputState.pointerJustLocked = inputState.pointerJustLockedNext;
  inputState.pointerJustLockedNext = false;
}

export function getMovementInput() {
  return {
    w: isKeyDown('KeyW') || isKeyDown('ArrowUp'),
    s: isKeyDown('KeyS') || isKeyDown('ArrowDown'),
    a: isKeyDown('KeyA') || isKeyDown('ArrowLeft'),
    d: isKeyDown('KeyD') || isKeyDown('ArrowRight'),
    run: isKeyDown('ShiftLeft') || isKeyDown('ShiftRight'),
    jump: wasKeyJustPressed('Space'),
    interact: wasKeyJustPressed('KeyE'),
    attack: wasMouseJustClicked(0),
    eat: wasKeyJustPressed('KeyF'),
    buildToggle: wasKeyJustPressed('KeyB'),
    buildPlace: wasMouseJustClicked(0),
    buildCancel: wasKeyJustPressed('Escape') || wasMouseJustClicked(2),
    buildNext: wasKeyJustPressed('KeyQ'),
    buildPrev: wasKeyJustPressed('KeyR'),
    callHorse: wasKeyJustPressed('KeyH'),
    toggleMap: wasKeyJustPressed('KeyM'),
  };
}
