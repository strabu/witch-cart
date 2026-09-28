/* ============================================================
   WITCH CART - audio.js
   WebAudio synth: engine voices, chiptune course music and
   one-shot sound effects.  Everything is generated - no files.
   ============================================================ */
(function (global) {
  'use strict';
  const WC = global.WC, U = WC.U;

  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
  const mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  const A = WC.Audio = {
    ok: false, ctx: null, t: 0,
    muted: false,
    init: function () {
      if (A.ctx) return A.ok;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      try { A.ctx = new AC(); } catch (e) { return false; }
      const c = A.ctx;
      A.master = c.createGain(); A.master.gain.value = 0.85; A.master.connect(c.destination);
      A.musicBus = c.createGain(); A.musicBus.gain.value = 0.34; A.musicBus.connect(A.master);
      A.sfxBus = c.createGain(); A.sfxBus.gain.value = 0.62; A.sfxBus.connect(A.master);
      A.engBus = c.createGain(); A.engBus.gain.value = 0.0; A.engBus.connect(A.master);

      /* engine voices */
      A.eng = [];
      for (let i = 0; i < 3; i++) A.eng.push(A._mkEngine(i));
      A.noiseBuf = A._mkNoise();
      A.ok = true;
      return true;
    },

    resume: function () { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); },

    _mkNoise: function () {
      const c = A.ctx, n = c.sampleRate * 1.2;
      const b = c.createBuffer(1, n, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return b;
    },

    _mkEngine: function () {
      const c = A.ctx;
      const o1 = c.createOscillator(); o1.type = 'sawtooth';
      const o2 = c.createOscillator(); o2.type = 'square'; o2.detune.value = -12;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3;
      const g = c.createGain(); g.gain.value = 0;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(A.engBus);
      o1.start(); o2.start();
      return { o1: o1, o2: o2, lp: lp, g: g };
    },

    /* ---- engine mix from nearby karts ---- */
    engines: function (near, dt) {
      if (!A.ok) return;
      const c = A.ctx, g = A.engBus.gain;
      g.value = U.damp(g.value, A.muted ? 0 : 0.5, 4, dt);
      for (let i = 0; i < A.eng.length; i++) {
        const e = A.eng[i], k = near[i];
        if (!e) continue;
        if (!k) { e.g.gain.value = U.damp(e.g.gain.value, 0, 8, dt); continue; }
        const spd = Math.abs(k.vf || k.spd);
        const base = 46 + spd * 0.052 + (k.boostT > 0 ? 26 : 0);
        const wob = 1 + Math.sin(c.currentTime * 30 + i * 2) * 0.015;
        e.o1.frequency.value = base * wob;
        e.o2.frequency.value = base * 0.5 * wob;
        e.lp.frequency.value = 520 + spd * 1.35 + (k.drift ? 700 : 0);
        const target = (k.ko ? 0 : 0.06 + Math.min(0.2, spd / 3600) + (k.gas > 0 ? 0.05 : 0) + (k.boostT > 0 ? 0.09 : 0)) * (1 - i * 0.28);
        e.g.gain.value = U.damp(e.g.gain.value, A.muted ? 0 : target, 7, dt);
      }
    },

    /* ---------------- music ---------------- */
    music: function (course) {
      if (!A.ok) return;
      A.stopMusic();
      const m = course.music || { bpm: 140, key: 0, mode: 'minor', pattern: 0 };
      A.mus = {
        bpm: m.bpm, key: m.key, mode: SCALES[m.mode] || SCALES.minor, pattern: m.pattern | 0,
        step: 0, next: A.ctx.currentTime + 0.08,
        prog: [[0, 5, 3, 4], [0, 3, 4, 5], [0, 4, 5, 3], [0, 5, 4, 3]][m.pattern % 4]
      };
      A.mus.spb = 60 / A.mus.bpm / 2;
    },
    stopMusic: function () { A.mus = null; },

    tick: function () {
      if (!A.ok || !A.mus || A.muted) return;
      const c = A.ctx, M = A.mus;
      while (M.next < c.currentTime + 0.25) {
        A._beat(M, M.next, M.step);
        M.next += M.spb; M.step++;
      }
    },

    _beat: function (M, t, step) {
      const bar = ((step / 8) | 0) % 4, b = step % 8;
      const deg = M.prog[bar];
      const root = 45 + M.key + M.mode[deg % 7];
      /* bass */
      if (b % 2 === 0) A._note(root + (b === 6 ? 12 : 0), t, M.spb * 1.5, 'square', 0.20, 900);
      /* arpeggio */
      const arp = [0, 2, 4, 2, 7, 4, 2, 0];
      if (b % 2 === 1 || (b % 4 === 2)) {
        const n = root + 24 + M.mode[(arp[b] + deg) % 7] + (arp[b] >= 7 ? 12 : 0);
        A._note(n, t, M.spb * 0.9, 'triangle', 0.13, 4200);
      }
      /* drums */
      if (b % 4 === 0) A._drum('kick', t);
      if (b % 8 === 4) A._drum('snare', t);
      if (b % 2 === 1) A._drum('hat', t);
    },

    _note: function (midi, t, dur, type, vol, cut) {
      const c = A.ctx;
      const o = c.createOscillator(); o.type = type;
      o.frequency.value = mtof(midi);
      const g = c.createGain();
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut || 3000;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(f); f.connect(g); g.connect(A.musicBus);
      o.start(t); o.stop(t + dur + 0.05);
    },

    _drum: function (kind, t) {
      const c = A.ctx;
      if (kind === 'kick') {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
        const g = c.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g); g.connect(A.musicBus); o.start(t); o.stop(t + 0.2);
      } else {
        const s = c.createBufferSource(); s.buffer = A.noiseBuf;
        const f = c.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass';
        f.frequency.value = kind === 'hat' ? 7000 : 1900;
        const g = c.createGain();
        const dur = kind === 'hat' ? 0.045 : 0.14;
        g.gain.setValueAtTime(kind === 'hat' ? 0.14 : 0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        s.connect(f); f.connect(g); g.connect(A.musicBus);
        s.start(t); s.stop(t + dur + 0.02);
      }
    },

    /* ---------------- sfx ---------------- */
    tone: function (f0, f1, dur, type, vol, delay) {
      if (!A.ok || A.muted) return;
      const c = A.ctx, t = c.currentTime + (delay || 0);
      const o = c.createOscillator(); o.type = type || 'square';
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol == null ? 0.3 : vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(A.sfxBus);
      o.start(t); o.stop(t + dur + 0.03);
    },

    burst: function (dur, vol, f, type, sweep) {
      if (!A.ok || A.muted) return;
      const c = A.ctx, t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = A.noiseBuf;
      const bf = c.createBiquadFilter(); bf.type = type || 'bandpass';
      bf.frequency.setValueAtTime(f || 1200, t);
      if (sweep) bf.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol == null ? 0.4 : vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      s.connect(bf); bf.connect(g); g.connect(A.sfxBus);
      s.start(t); s.stop(t + dur + 0.02);
    },

    sfx: function (n) {
      if (!A.ok || A.muted) return;
      switch (n) {
        case 'boost': A.burst(0.5, 0.42, 380, 'bandpass', 2600); A.tone(180, 900, 0.45, 'sawtooth', 0.16); break;
        case 'turbo1': A.tone(520, 900, 0.2, 'square', 0.2); break;
        case 'turbo2': A.tone(620, 1180, 0.24, 'square', 0.22); A.tone(820, 1500, 0.26, 'triangle', 0.14, 0.04); break;
        case 'turbo3': A.tone(720, 1500, 0.3, 'square', 0.24); A.tone(1080, 2100, 0.32, 'triangle', 0.16, 0.05); break;
        case 'hop': A.tone(430, 700, 0.09, 'triangle', 0.14); break;
        case 'land': A.burst(0.11, 0.22, 320, 'lowpass'); break;
        case 'wall': A.burst(0.24, 0.5, 900, 'bandpass', 200); A.tone(140, 60, 0.2, 'square', 0.18); break;
        case 'spin': A.tone(700, 180, 0.5, 'sawtooth', 0.24); A.burst(0.3, 0.3, 2200, 'bandpass', 500); break;
        case 'item': A.tone(660, 0, 0.09, 'square', 0.2); A.tone(990, 0, 0.1, 'square', 0.18, 0.07); A.tone(1320, 0, 0.14, 'square', 0.18, 0.14); break;
        case 'fire': A.tone(1200, 260, 0.28, 'sawtooth', 0.2); break;
        case 'drop': A.tone(300, 200, 0.14, 'triangle', 0.16); break;
        case 'hex': A.burst(0.6, 0.5, 4200, 'highpass', 700); A.tone(1400, 90, 0.55, 'square', 0.2); break;
        case 'star': A.tone(880, 1760, 0.35, 'triangle', 0.22); A.tone(1320, 2640, 0.3, 'square', 0.12, 0.08); break;
        case 'lap': A.tone(1046, 0, 0.1, 'square', 0.22); A.tone(1568, 0, 0.16, 'square', 0.2, 0.09); break;
        case 'ui': A.tone(520, 760, 0.08, 'square', 0.16); break;
        case 'select': A.tone(400, 900, 0.14, 'square', 0.2); break;
        case 'beep': A.tone(660, 660, 0.14, 'square', 0.26); break;
        case 'go': A.tone(880, 880, 0.4, 'square', 0.32); A.tone(1320, 1320, 0.4, 'triangle', 0.2); break;
        case 'finish':
          [0, 4, 7, 12, 16].forEach(function (s, i) { A.tone(mtof(72 + s), 0, 0.3, 'square', 0.24, i * 0.11); });
          break;
      }
    },

    setMute: function (m) {
      A.muted = m;
      if (A.ok) A.master.gain.value = m ? 0 : 0.85;
    }
  };
})(typeof window !== 'undefined' ? window : global);
