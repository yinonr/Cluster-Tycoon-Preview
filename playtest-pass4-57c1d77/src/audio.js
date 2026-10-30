// All sound is synthesized with Web Audio: no files to load.
// The trading bell, board clatter, stamp thud, dot-matrix chatter, phone ring,
// room murmur, bulletin alert, and the intro's pile-up of phones.

export function createAudio() {
  let ctx = null;
  let master = null;
  let room = null;
  let noise = null;
  let muted = false;
  let gestured = false;
  let roomWanted = false;
  let chorus = null;   // while open, every sound routes here so it can be cut at once
  let swell = null;
  const out = () => chorus || master;
  try { muted = localStorage.getItem('hsc-tycoon-preview-pass4-57c1d77-muted') === '1'; } catch { /* storage unavailable */ }

  function ensure() {
    if (!ctx && !gestured) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const unlock = () => {
    gestured = true;
    ensure();
    if (roomWanted && !room) api.startRoom();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  function noiseBuf() {
    if (noise) return noise;
    const c = ensure();
    const len = c.sampleRate;
    noise = c.createBuffer(1, len, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  function env(g, t0, a, peak, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + decay);
  }

  function osc(type, freq, t0, dur, peak, dest = out(), attack = 0.004) {
    const c = ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    env(g, t0, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + attack + dur + 0.05);
    return o;
  }

  function burst(t0, dur, peak, { type = 'bandpass', freq = 2000, q = 1 } = {}) {
    const c = ctx;
    const s = c.createBufferSource();
    s.buffer = noiseBuf();
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    env(g, t0, 0.002, peak, dur);
    s.connect(f).connect(g).connect(out());
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.05);
  }

  const api = {
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('hsc-tycoon-preview-pass4-57c1d77-muted', muted ? '1' : '0'); } catch { /* ignore */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05);
      return muted;
    },

    // The trading bell: inharmonic partials, long ring.
    bell({ strikes = 1, gap = 0.32, f = 830, ring = 2.4 } = {}) {
      if (!ensure()) return;
      const partials = [[0.5, 0.35], [1, 1], [2.4, 0.45], [2.76, 0.4], [5.4, 0.18], [8.93, 0.08]];
      for (let s = 0; s < strikes; s++) {
        const t0 = ctx.currentTime + 0.02 + s * gap;
        partials.forEach(([m, a]) => osc('sine', f * m, t0, ring / Math.sqrt(m), 0.22 * a));
        burst(t0, 0.03, 0.25, { type: 'highpass', freq: 3000 });
      }
    },

    // Split-flap clatter: a flurry of tiny clicks.
    clatter(count = 14, spread = 0.5) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < count; i++) {
        burst(t + Math.random() * spread, 0.012, 0.18, { type: 'bandpass', freq: 2500 + Math.random() * 2500, q: 3 });
      }
    },

    // Rubber stamp: low thud + paper smack.
    stamp() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      env(g, t, 0.003, 0.9, 0.22);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.3);
      burst(t, 0.07, 0.5, { type: 'lowpass', freq: 1400 });
    },

    // Paper slapped onto a desk.
    slap() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      burst(t, 0.09, 0.45, { type: 'bandpass', freq: 900, q: 0.7 });
      osc('sine', 90, t, 0.1, 0.3);
    },

    // Dot-matrix printer chatter.
    printer(seconds = 1.6) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const n = Math.floor(seconds * 38);
      for (let i = 0; i < n; i++) {
        const tt = t + i / 38 + (Math.random() * 0.006);
        if (i % 19 > 15) continue; // carriage pause
        burst(tt, 0.008, 0.12, { type: 'bandpass', freq: 3200, q: 6 });
        osc('square', 1800 + (i % 3) * 140, tt, 0.006, 0.02);
      }
    },

    // Short CRT/ticker blip.
    blip(freq = 1320, vol = 0.06) {
      if (!ensure()) return;
      osc('square', freq, ctx.currentTime, 0.05, vol);
    },

    // Bulletin alert: two descending tones.
    alert() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      osc('triangle', 988, t, 0.16, 0.18);
      osc('triangle', 740, t + 0.17, 0.22, 0.18);
    },

    // Corded desk phone ring (two bursts).
    ring(times = 1) {
      if (!ensure()) return;
      const t0 = ctx.currentTime;
      for (let r = 0; r < times; r++) {
        for (let i = 0; i < 2; i++) {
          const t = t0 + r * 1.6 + i * 0.42;
          for (let k = 0; k < 14; k++) {
            osc('square', k % 2 ? 1400 : 1700, t + k * 0.025, 0.02, 0.035);
          }
        }
      }
    },

    // Paddle raise / counter tap.
    tap() {
      if (!ensure()) return;
      burst(ctx.currentTime, 0.03, 0.25, { type: 'bandpass', freq: 1500, q: 2 });
    },

    // Lost lot: a low buzz.
    buzz() {
      if (!ensure()) return;
      osc('sawtooth', 110, ctx.currentTime, 0.28, 0.06);
      osc('sawtooth', 116, ctx.currentTime, 0.28, 0.05);
    },

    // Pen scratch for signatures.
    scratch(seconds = 0.9) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < seconds * 22; i++) {
        burst(t + i / 22 + Math.random() * 0.02, 0.03, 0.06, { type: 'highpass', freq: 5000 });
      }
    },

    // The room: murmur + an occasional far-off phone.
    startRoom() {
      roomWanted = true;
      if (!ensure() || room) return;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf(); s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 1.2);
      const lfo = ctx.createOscillator(); const lg = ctx.createGain();
      lfo.frequency.value = 0.35; lg.gain.value = 0.03;
      lfo.connect(lg).connect(g.gain);
      s.connect(f).connect(g).connect(master);
      s.start(); lfo.start();
      const phones = setInterval(() => { if (Math.random() < 0.5) api.distantPhone(); }, 7000);
      room = { s, g, lfo, phones };
    },
    stopRoom() {
      roomWanted = false;
      if (!room) return;
      const { s, g, lfo, phones } = room;
      clearInterval(phones);
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
      setTimeout(() => { try { s.stop(); lfo.stop(); } catch { /* already stopped */ } }, 1200);
      room = null;
    },
    distantPhone() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      for (let k = 0; k < 10; k++) osc('square', k % 2 ? 1400 : 1700, t + k * 0.03, 0.02, 0.008);
    },

    // The intro's runaway chain: opens a sub-mix with a swell that rises over
    // `seconds`. Everything played until cutChorus() goes through it, so the
    // cut silences the whole pile-up at once, notes already scheduled included.
    openChorus(seconds = 5) {
      if (!ensure() || chorus) return;
      chorus = ctx.createGain();
      chorus.connect(master);
      const t = ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf(); s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(320, t);
      f.frequency.exponentialRampToValueAtTime(1900, t + seconds);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + seconds);
      s.connect(f).connect(g).connect(chorus);
      s.start();
      swell = s;
    },
    cutChorus() {
      if (!chorus) return;
      const bus = chorus;
      const s = swell;
      chorus = null;
      swell = null;
      const t = ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0, t + 0.025);
      setTimeout(() => { try { s?.stop(); } catch { /* already stopped */ } bus.disconnect(); }, 300);
    },

    // V10.18 opening. A message slip lands: a dry paper rustle under the slap.
    rustle() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      burst(t, 0.06, 0.12, { type: 'highpass', freq: 3200 });
      burst(t + 0.03, 0.08, 0.08, { type: 'bandpass', freq: 5200, q: 1.5 });
    },
    // The camera pulls back from the glass: filtered air rising, then settling.
    whoosh(seconds = 1.2) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf(); s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 0.9;
      f.frequency.setValueAtTime(260, t);
      f.frequency.exponentialRampToValueAtTime(1400, t + seconds * 0.45);
      f.frequency.exponentialRampToValueAtTime(300, t + seconds);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + seconds * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      s.connect(f).connect(g).connect(out());
      s.start(t); s.stop(t + seconds + 0.05);
    },
    // A CRT powering on: the relay thunk, the flyback whine settling.
    crtOn() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
      env(g, t, 0.004, 0.5, 0.25);
      o.connect(g).connect(out());
      o.start(t); o.stop(t + 0.35);
      burst(t, 0.05, 0.3, { type: 'lowpass', freq: 900 });
      osc('sine', 7800, t + 0.05, 0.9, 0.012);
    },
    // Analogue static while the picture tunes in.
    hiss(seconds = 0.9) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      burst(t, seconds, 0.07, { type: 'highpass', freq: 1500 });
      burst(t, seconds * 0.8, 0.05, { type: 'bandpass', freq: 600, q: 0.6 });
    },
  };
  return api;
}
