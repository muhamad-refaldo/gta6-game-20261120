// input.js — keyboard and mouse state for Solara City.
window.SC = window.SC || {};
(function () {
  var keys = {};
  var mouse = { x: 0, y: 0, down: false, clicked: false };
  var pressed = {}; // edge-triggered keys, consumed by the game loop

  function init(canvas) {
    window.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
      if (!keys[k]) pressed[k] = true;
      keys[k] = true;
    });
    window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
    });
    window.addEventListener('mouseup', function () { mouse.down = false; });
    window.addEventListener('blur', function () { keys = {}; mouse.down = false; });
  }

  function wasPressed(k) {
    if (pressed[k]) { pressed[k] = false; return true; }
    return false;
  }
  function endFrame() { pressed = {}; mouse.clicked = false; }
  function isDown(k) { return !!keys[k]; }
  function axis() {
    var x = 0, y = 0;
    if (keys['a'] || keys['arrowleft']) x -= 1;
    if (keys['d'] || keys['arrowright']) x += 1;
    if (keys['w'] || keys['arrowup']) y -= 1;
    if (keys['s'] || keys['arrowdown']) y += 1;
    return { x: x, y: y };
  }

  SC.Input = { init: init, isDown: isDown, wasPressed: wasPressed, axis: axis,
    endFrame: endFrame, mouse: mouse, keys: keys };
})();
