// Solara City 3D — keyboard + mouse input (WASD, orbit camera, aim, wheel).
import { G } from './state.js';

export const input = {
  keys: {},
  mouseDX: 0, mouseDY: 0,
  mouseDown: false, rightDown: false,
  dragging: false,
  locked: false,
  pressed: new Set(), // keys pressed this frame (edge-triggered)
  attach(canvas) {
    const k = (e) => e.code;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      input.keys[k(e)] = true; input.pressed.add(k(e));
      if (['Space', 'Tab', 'KeyM', 'KeyE', 'KeyF', 'KeyQ'].includes(k(e))) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { input.keys[k(e)] = false; });
    window.addEventListener('blur', () => { input.keys = {}; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { input.mouseDown = true; input.dragging = true; }
      if (e.button === 2) input.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { input.mouseDown = false; input.dragging = false; }
      if (e.button === 2) input.rightDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (input.locked) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
      else if (input.dragging) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
    });
    canvas.addEventListener('click', () => {
      if (!G.title && !G.paused && !G.mapOpen && !input.locked && canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch (e) {}
      }
    });
    document.addEventListener('pointerlockchange', () => {
      input.locked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { input.wheelDelta = (input.wheelDelta || 0) + e.deltaY; }, { passive: true });
  },
  axis() {
    const f = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
    const s = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);
    return { f, s };
  },
  wasPressed(code) { return this.pressed.has(code); },
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0; this.mouseDY = 0;
    this.wheelDelta = 0;
  },
};
