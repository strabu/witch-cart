/* ============================================================
   WITCH CART - input.js
   Keyboard + touch.  Analog-ish steering, one-shot presses.
   ============================================================ */
(function (global) {
  'use strict';
  const WC = global.WC, U = WC.U;

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
    ShiftLeft: 'drift', ShiftRight: 'drift', KeyZ: 'drift',
    Space: 'item', Enter: 'start', Escape: 'pause', KeyP: 'pause', KeyM: 'mute',
    KeyR: 'restart'
  };

  WC.Input = {
    down: {}, hits: {}, touch: false,
    steer: 0, gas: 0, brake: 0, drift: false,
    steerSm: 0,

    bind: function () {
      const I = WC.Input;
      global.addEventListener('keydown', function (e) {
        const k = KEYMAP[e.code];
        if (!k) return;
        e.preventDefault();
        if (!I.down[k]) I.hits[k] = true;
        I.down[k] = true;
      }, { passive: false });
      global.addEventListener('keyup', function (e) {
        const k = KEYMAP[e.code];
        if (!k) return;
        e.preventDefault();
        I.down[k] = false;
        if (k === 'drift') I.driftHit = false;
      }, { passive: false });
      global.addEventListener('blur', function () { I.down = {}; });

      /* reveal the on-screen pads on the first actual touch */
      global.addEventListener('touchstart', function () {
        if (global.document && document.body) document.body.classList.add('touch');
      }, { passive: true });

      /* touch pads */
      const pads = global.document.querySelectorAll('[data-btn]');
      for (const el of pads) {
        const k = el.getAttribute('data-btn');
        const on = function (e) { e.preventDefault(); I.touch = true; if (!I.down[k]) I.hits[k] = true; I.down[k] = true; el.classList.add('on'); };
        const off = function (e) { e.preventDefault(); I.down[k] = false; el.classList.remove('on'); };
        el.addEventListener('touchstart', on, { passive: false });
        el.addEventListener('touchend', off, { passive: false });
        el.addEventListener('touchcancel', off, { passive: false });
        el.addEventListener('mousedown', on);
        el.addEventListener('mouseup', off);
        el.addEventListener('mouseleave', off);
      }
    },

    consume: function (k) { const v = WC.Input.hits[k]; WC.Input.hits[k] = false; return !!v; },
    /* one-shot presses only live for the frame in which they arrived */
    endFrame: function () { WC.Input.hits = {}; },

    poll: function (dt) {
      const I = WC.Input, d = I.down;
      const want = (d.right ? 1 : 0) - (d.left ? 1 : 0);
      I.steerSm = U.damp(I.steerSm, want, want === 0 ? 14 : 16, dt);
      if (Math.abs(I.steerSm) < 0.02) I.steerSm = 0;
      I.steer = I.steerSm;
      I.gas = d.gas ? 1 : 0;
      I.brake = d.brake ? 1 : 0;
      I.drift = !!d.drift;
    }
  };
})(typeof window !== 'undefined' ? window : global);
