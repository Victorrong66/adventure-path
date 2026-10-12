// Keyboard + touch input. Movement is reported in screen space.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.touch = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.touchDash = false;
    this.touchAttack = false;   // attack button held
    this.mouseAttack = null;    // {x, y} screen position while the mouse button is held on the game
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.touchAttack = false; this.mouseAttack = null; });
  }

  bindTouch(el, stickEl, knobEl) {
    const show = (on) => { stickEl.style.display = on ? 'block' : 'none'; };
    addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
    el.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.id === null && t.clientX < innerWidth * 0.6) {
          this.touch = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
          stickEl.style.left = t.clientX - 40 + 'px';
          stickEl.style.top = t.clientY - 40 + 'px';
          knobEl.style.transform = 'translate(0px,0px)';
          show(true);
        }
      }
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.id) {
          this.touch.x = t.clientX; this.touch.y = t.clientY;
          let dx = t.clientX - this.touch.ox, dy = t.clientY - this.touch.oy;
          const l = Math.hypot(dx, dy);
          if (l > 34) { dx = (dx / l) * 34; dy = (dy / l) * 34; }
          knobEl.style.transform = `translate(${dx}px,${dy}px)`;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.touch.id) { this.touch.id = null; show(false); }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  // Returns [ux, uy] screen-space direction, length <= 1.
  move() {
    if (!this.enabled) return [0, 0];
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (this.touch.id !== null) {
      const dx = this.touch.x - this.touch.ox, dy = this.touch.y - this.touch.oy;
      const l = Math.hypot(dx, dy);
      if (l > 8) { x = dx / l; y = dy / l; }
    }
    const l = Math.hypot(x, y);
    return l > 1 ? [x / l, y / l] : [x, y];
  }

  // Is the player holding attack? Returns true for keys/touch, or {x, y} when aiming with the mouse.
  attack() {
    if (!this.enabled) return false;
    if (this.mouseAttack) return this.mouseAttack;
    return this.touchAttack || this.keys.has('j') || this.keys.has('k');
  }

  bindMouse(el) {
    el.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouseAttack = { x: e.clientX, y: e.clientY }; });
    addEventListener('mousemove', (e) => { if (this.mouseAttack) this.mouseAttack = { x: e.clientX, y: e.clientY }; });
    addEventListener('mouseup', () => { this.mouseAttack = null; });
  }

  // Was this key pressed since the last call to endFrame()?
  hit(k) { return this.enabled && this.pressed.has(k); }
  dash() {
    const d = this.hit(' ') || this.hit('shift') || this.touchDash;
    this.touchDash = false;
    return d;
  }
  endFrame() { this.pressed.clear(); }
}
