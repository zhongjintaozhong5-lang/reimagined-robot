// ═══ Input System (Keyboard, Mouse, Touch) ═══
const Input = (() => {
  'use strict';

  const canvas = document.getElementById('game');
  const keys = {};
  const mouse = { x: CONFIG.W / 2, y: CONFIG.H / 2 };

  // Touch controls state
  const touchCtrl = {
    joy: { active: false, id: -1, sx: 0, sy: 0, dx: 0, dy: 0, r: 50 },
    fire: { active: false, id: -1 },
  };

  let _lastShot = 0;

  function canvasPos(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (CONFIG.W / r.width),
      y: (clientY - r.top) * (CONFIG.H / r.height),
    };
  }

  function isMobile() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  // ─── Touch Events ───
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    Audio.init();
    const gs = Game.state;
    if (gs === 'title' || gs === 'lobby' || gs === 'room' || gs === 'gameover') {
      const t = e.changedTouches[0];
      if (!t) return;
      const p = canvasPos(t.clientX, t.clientY);
      if (gs === 'title') {
        const by = CONFIG.H / 2 + 165;
        if (p.y >= by && p.y <= by + 36) { Game.startSinglePlayer(); Audio.SFX.wave(); }
        else if (p.y >= by + 44 && p.y <= by + 80) { Network.connect(); Game.switchState('lobby'); }
      } else if (gs === 'lobby') {
        Network.handleClick(p.x, p.y);
      } else if (gs === 'gameover') {
        Game.handleGameOverClick();
      }
      return;
    }
    if (Game.state !== 'playing') return;
    for (const t of e.changedTouches) {
      const p = canvasPos(t.clientX, t.clientY);
      if (p.x < CONFIG.W / 2 && !touchCtrl.joy.active) {
        touchCtrl.joy.active = true;
        touchCtrl.joy.id = t.identifier;
        touchCtrl.joy.sx = p.x;
        touchCtrl.joy.sy = p.y;
        touchCtrl.joy.dx = 0;
        touchCtrl.joy.dy = 0;
      } else if (p.x >= CONFIG.W / 2 && !touchCtrl.fire.active) {
        touchCtrl.fire.active = true;
        touchCtrl.fire.id = t.identifier;
        mouse.x = p.x;
        mouse.y = p.y;
        tryShoot();
      }
    }
  });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const p = canvasPos(t.clientX, t.clientY);
      if (t.identifier === touchCtrl.joy.id) {
        const dx = p.x - touchCtrl.joy.sx, dy = p.y - touchCtrl.joy.sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > touchCtrl.joy.r) {
          touchCtrl.joy.dx = (dx / dist) * touchCtrl.joy.r;
          touchCtrl.joy.dy = (dy / dist) * touchCtrl.joy.r;
        } else {
          touchCtrl.joy.dx = dx;
          touchCtrl.joy.dy = dy;
        }
        mouse.x = p.x;
        mouse.y = p.y;
      } else {
        mouse.x = p.x;
        mouse.y = p.y;
      }
    }
  });

  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touchCtrl.joy.id) {
        touchCtrl.joy.active = false;
        touchCtrl.joy.id = -1;
        touchCtrl.joy.dx = 0;
        touchCtrl.joy.dy = 0;
      }
      if (t.identifier === touchCtrl.fire.id) {
        touchCtrl.fire.active = false;
        touchCtrl.fire.id = -1;
      }
    }
  });

  canvas.addEventListener('touchcancel', () => {
    touchCtrl.joy.active = false;
    touchCtrl.joy.id = -1;
    touchCtrl.joy.dx = 0;
    touchCtrl.joy.dy = 0;
    touchCtrl.fire.active = false;
    touchCtrl.fire.id = -1;
  });

  // ─── Keyboard Events ───
  document.addEventListener('keydown', e => {
    keys[e.key] = true;

    const gs = Game.state;
    if (gs === 'lobby') {
      if (e.key >= '0' && e.key <= '9' && Network.joinCode.length < 4) {
        Network.joinCode += e.key;
        e.preventDefault();
        return;
      }
      if (e.key === 'Backspace' && Network.joinCode.length > 0) {
        Network.joinCode = Network.joinCode.slice(0, -1);
        e.preventDefault();
        return;
      }
    }

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (gs === 'title') { Game.startSinglePlayer(); Audio.SFX.wave(); }
      else if (gs === 'lobby') { Network.handleClick(null, null); }
      else if (gs === 'room') { Network.toggleReady(); }
      else if (gs === 'gameover') { Game.handleGameOverClick(); }
    }

    if (e.key === 'Escape') {
      if (gs === 'lobby') { Network.disconnect(); Game.switchState('title'); }
      else if (gs === 'room') { Network.leaveRoom(); Game.switchState('lobby'); }
    }

    if (e.key === 'p' && gs === 'playing') Game.switchState('paused');
    else if (e.key === 'p' && gs === 'paused') Game.switchState('playing');
    // Sound toggle
    if (e.key === 'm') {
      Audio.enabled = !Audio.enabled;
      const s = Save.getSettings();
      s.sfx = Audio.enabled;
      Save.saveSettings(s);
    }
  });

  document.addEventListener('keyup', e => { keys[e.key] = false; });

  // ─── Mouse Events ───
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (CONFIG.W / r.width);
    mouse.y = (e.clientY - r.top) * (CONFIG.H / r.height);
  });

  canvas.addEventListener('click', e => {
    Audio.init();
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (CONFIG.W / r.width);
    const my = (e.clientY - r.top) * (CONFIG.H / r.height);
    const gs = Game.state;

    if (gs === 'title') {
      const by = CONFIG.H / 2 + 165;
      if (my >= by && my <= by + 36) { Game.startSinglePlayer(); Audio.SFX.wave(); }
      else if (my >= by + 44 && my <= by + 80) { Network.connect(); Game.switchState('lobby'); }
      return;
    }
    if (gs === 'lobby') { Network.handleClick(mx, my); return; }
    if (gs === 'room') return;
    if (gs === 'gameover') { Game.handleGameOverClick(); return; }
    if (gs === 'playing') tryShoot();
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ─── Shooting Helper ───
  function tryShoot() {
    const p = Game.player;
    const now = Date.now();
    if (now - _lastShot < CONFIG.SHOOT_COOLDOWN || p.mana < CONFIG.MANA_COST || Game.state !== 'playing') return;
    _lastShot = now;

    const a = Math.atan2(mouse.y - p.y, mouse.x - p.x);
    const allEnemies = Game.enemies.concat(Game.multi && Game.multi.enemies || []);
    let near = null, minD = Infinity;
    allEnemies.forEach(e => {
      if (e.dead) return;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < minD) { minD = d; near = e; }
    });

    let ba = a, bdmg = CONFIG.BULLET_DAMAGE, bsp = CONFIG.BULLET_SPEED;
    if (p.triple > 0) { bdmg = 20; bsp = 9; }
    if (near) ba = Math.atan2(near.y - p.y, near.x - p.x);

    Game.bullets.push(new Entities.Bullet(p.x, p.y, ba, false, false, bdmg, bsp, 12));
    p.mana = Math.max(0, p.mana - CONFIG.MANA_COST);
    for (let i = 0; i < 2; i++) {
      Game.particles.push(Entities.spawnParticles(
        p.x + Math.cos(ba) * 18 + (Math.random() - 0.5) * 10,
        p.y + Math.sin(ba) * 18 + (Math.random() - 0.5) * 10,
        '#ffcc00', 1, 1, 6
      ));
    }
    Audio.SFX.shoot();
  }

  return {
    keys,
    mouse,
    touchCtrl,
    get isMobile() { return isMobile(); },
    tryShoot,
  };
})();
