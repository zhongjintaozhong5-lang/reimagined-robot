// ═══ Audio System ═══
const Audio = (() => {
  let ctx = null;
  let enabled = true;
  let volume = 0.1;

  function init() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function beep(freq, dur, type = 'square', vol) {
    if (!enabled) return;
    try {
      init();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(vol !== undefined ? vol : volume, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch (e) { /* ignore */ }
  }

  return {
    init,
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; },
    get volume() { return volume; },
    set volume(v) { volume = Math.max(0, Math.min(1, v)); },

    SFX: {
      shoot()    { beep(880, 0.07, 'square', 0.06); beep(660, 0.05, 'square', 0.04); },
      hit()      { beep(220, 0.12, 'sawtooth', 0.07); },
      kill()     { beep(440, 0.04, 'square', 0.06); setTimeout(() => beep(660, 0.07, 'square', 0.06), 50); },
      pickup()   { beep(660, 0.05, 'square', 0.06); setTimeout(() => beep(880, 0.07, 'square', 0.06), 60); },
      wave()     { beep(330, 0.08, 'square', 0.07); setTimeout(() => beep(440, 0.08, 'square', 0.07), 100); setTimeout(() => beep(660, 0.12, 'square', 0.07), 200); },
      damage()   { beep(150, 0.15, 'sawtooth', 0.1); beep(100, 0.12, 'square', 0.06); },
      gameOver() { beep(400, 0.15, 'square', 0.1); setTimeout(() => beep(300, 0.15, 'square', 0.1), 200); setTimeout(() => beep(200, 0.3, 'square', 0.1), 400); },
      boss()     { beep(220, 0.12, 'sawtooth', 0.1); setTimeout(() => beep(330, 0.12, 'sawtooth', 0.08), 150); setTimeout(() => beep(440, 0.18, 'sawtooth', 0.1), 300); },
      levelUp()  { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'square', 0.08), i * 80)); setTimeout(() => { for (let i = 0; i < 3; i++) beep(1047 + i * 100, 0.3, 'sine', 0.06); }, 350); },
      questComplete() { beep(660, 0.1, 'sine', 0.08); setTimeout(() => beep(880, 0.1, 'sine', 0.08), 100); setTimeout(() => beep(1047, 0.2, 'sine', 0.1), 200); },
    },
  };
})();
