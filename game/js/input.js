// Solara City 3D v3.4 — input: keyboard + mouse, F5 quick-save support.
// Fresh rewrite for v3.4. Exports: input { attach, wasPressed, keys, rightDown,
// mouseDX, mouseDY, wheelDelta, mouseDown, axis, endFrame }.
// F5 is intercepted (preventDefault on keydown) so quick-save never reloads
// the page; Tab and Space are also prevented (focus / scroll).
export const input = {
  keys: {},
  pressed: new Set(),
  mouseDX: 0,
  mouseDY: 0,
  wheelDelta: 0,
  mouseDown: false,
  rightDown: false,

  attach(el) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F5' || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      this.keys[e.code] = true;
      if (!e.repeat) this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; this.rightDown = false; });
    if (el) {
      el.addEventListener('mousedown', (e) => {
        if (e.button === 2) this.rightDown = true;
        else if (e.button === 0) this.mouseDown = true;
      });
      el.addEventListener('mousemove', (e) => {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      });
      el.addEventListener('wheel', (e) => { this.wheelDelta += e.deltaY; }, { passive: true });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rightDown = false;
      else if (e.button === 0) this.mouseDown = false;
    });
  },

  wasPressed(code) {
    return this.pressed.has(code);
  },

  // movement axis: f = forward (+1) / back (-1), s = strafe right (+1) / left (-1)
  axis() {
    const k = this.keys;
    const f = ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0);
    const s = ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0);
    return { f, s };
  },

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
  },
};
