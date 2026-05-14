// ═══ Main Game System ═══
const Game = (() => {
  'use strict';

  const W = CONFIG.W, H = CONFIG.H;
  let _gameStarted = false;

  // ─── State ───
  const state = {
    state: 'loading',
    score: 0,
    wave: 0,
    combo: 0,
    comboT: 0,
    frame: 0,
    bossW: false,
    bossA: false,
    waveTimer: 0,
    enemySpawned: 0,
    enemyMax: 8,
    spawnTimer: 0,
    luFX: null,
    shake: { x: 0, y: 0, amt: 0 },
    player: {
      x: W / 2, y: H / 2, r: 14,
      speed: 3.2, hp: 100, maxHp: 100,
      mana: 60, maxMana: 60,
      manaReg: 0.10,
      level: 1, xp: 0, xpToNext: 20,
      inv: 0, triple: 0, shield: 0, speedB: 0, puTimer: 0,
    },
    enemies: [],
    bullets: [],
    items: [],
    particles: [],
    envDecos: [],
    // Multiplayer
    multi: null,
  };

  // ─── Single Player Init ───
  function startSinglePlayer() {
    state.multi = null;
    Network.disconnect();

    const p = state.player;
    p.x = W / 2; p.y = H / 2;
    p.hp = p.maxHp; p.mana = p.maxMana;
    p.level = 1; p.xp = 0; p.xpToNext = 20;
    p.inv = 0; p.triple = 0; p.shield = 0; p.speedB = 0; p.puTimer = 0;
    p.manaReg = 0.10; p.speed = 3.2;

    state.score = 0;
    state.wave = 0;
    state.combo = 0;
    state.comboT = 0;
    state.enemies = [];
    state.bullets = [];
    state.items = [];
    state.particles = [];
    Renderer.floatingTexts.length = 0;
    state.shake = { x: 0, y: 0, amt: 0 };
    state.waveTimer = 0;
    state.enemySpawned = 0;
    state.enemyMax = 8;
    state.spawnTimer = 0;
    state.bossW = false;
    state.bossA = false;
    state.frame = 0;
    state.luFX = null;

    state.envDecos = Renderer.genEnv();
    state.state = 'playing';

    // Initialize quest tracking with rewards
    Quest.init();
    Quest.setOnComplete(q => {
      state.score += q.reward.score;
      Audio.SFX.levelUp();
      Renderer.addText(CONFIG.W / 2, CONFIG.H / 2 + 50, `任务奖励: +${q.reward.score}分 +${q.reward.xpBonus}经验`, '#ffcc00');
    });
    Quest.startGame();
  }

  // ─── Multiplayer Reset ───
  function resetMultiplayer() {
    const p = state.player;
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    p.x = 200;
    p.y = 320;
    p.inv = 60;
    p.level = 1;
    p.xp = 0;

    state.score = 0;
    state.wave = 0;
    state.enemies = [];
    state.bullets = [];
    state.items = [];
    state.particles = [];
    state.combo = 0;
    state.frame = 0;

    if (Network.net.mode === 'coop') {
      state.enemySpawned = 0;
      state.enemyMax = 6;
      state.spawnTimer = 0;
      state.waveTimer = 0;
      state.bossA = false;
      state.bossW = false;
    }
  }

  // ─── Game Over Click ───
  function handleGameOverClick() {
    if (state.multi) {
      state.multi = null;
      state.state = 'lobby';
    } else {
      startSinglePlayer();
      Audio.SFX.wave();
    }
  }

  // ─── Switch State ───
  function switchState(newState) {
    state.state = newState;
  }

  // ─── Update ───
  function update() {
    state.frame++;
    if (state.state !== 'playing') return;

    const p = state.player;
    const keys = Input.keys;
    const tc = Input.touchCtrl;

    // Cooldowns
    if (p.inv > 0) p.inv--;
    p.mana = Math.min(p.maxMana, p.mana + p.manaReg);
    if (state.luFX) {
      state.luFX.t--;
      if (state.luFX.fl > 0) state.luFX.fl--;
      if (state.luFX.t <= 0) state.luFX = null;
    }
    if (p.puTimer > 0) {
      p.puTimer--;
      if (p.puTimer <= 0) { p.speedB = 0; p.triple = 0; }
    }

    // Movement
    let mx = 0, my = 0;
    if (keys['w'] || keys['ArrowUp']) my = -1;
    if (keys['s'] || keys['ArrowDown']) my = 1;
    if (keys['a'] || keys['ArrowLeft']) mx = -1;
    if (keys['d'] || keys['ArrowRight']) mx = 1;
    if (tc.joy.active) {
      const j = tc.joy;
      if (Math.abs(j.dx) > 8) mx = j.dx / j.r;
      if (Math.abs(j.dy) > 8) my = j.dy / j.r;
    }
    if (mx !== 0 && my !== 0) { mx *= 0.707; my *= 0.707; }
    const sp = p.speed + (p.speedB > 0 ? 2 : 0);
    p.x += mx * sp;
    p.y += my * sp;
    p.x = Math.max(p.r, Math.min(W - p.r, p.x));
    p.y = Math.max(p.r, Math.min(H - p.r, p.y));

    // Shooting via keyboard
    if (keys[' '] || keys['z'] || keys['j']) Input.tryShoot();
    if (tc.fire.active) {
      let near = null, minD = 800;
      const allEnemies = state.enemies.concat(state.multi && state.multi.enemies || []);
      allEnemies.forEach(e => {
        if (e.dead) return;
        const d = Math.sqrt((e.x - p.x) ** 2 + (e.y - p.y) ** 2);
        if (d < minD) { minD = d; near = e; }
      });
      if (near) { Input.mouse.x = near.x; Input.mouse.y = near.y; }
      Input.tryShoot();
    }

    // Send input to server (multiplayer)
    if (state.multi && state.multi.started) {
      Network.sendInput({
        x: p.x, y: p.y,
        angle: Math.atan2(Input.mouse.y - p.y, Input.mouse.x - p.x),
        shoot: keys[' '] || tc.fire.active,
      });
    }

    // Single player: wave system & enemies
    if (!state.multi || !state.multi.started) {
      updateWave();
      updateEnemies();
      updateItems();
    }

    // Bullets: always update (movement, life, hit detection)
    updateBullets();

    // Particles cleanup
    state.particles = state.particles.filter(p2 => p2.update());
    if (state.particles.length > 80) state.particles = state.particles.slice(-80);

    // Shake decay
    if (state.shake.amt > 0) {
      state.shake.amt *= 0.85;
      if (state.shake.amt < 0.5) state.shake.amt = 0;
      state.shake.x = (Math.random() - 0.5) * state.shake.amt;
      state.shake.y = (Math.random() - 0.5) * state.shake.amt;
    }

    // Combo timer
    if (!state.multi || !state.multi.started) {
      if (state.comboT > 0) {
        state.comboT--;
        if (state.comboT <= 0) state.combo = 0;
      }
    }
  }

  // ─── Wave System ───
  function updateWave() {
    const allDead = state.enemies.length === 0 && state.enemySpawned >= state.enemyMax && !state.bossA;
    if (allDead) {
      state.waveTimer++;
      if (state.waveTimer > CONFIG.WAVE_DELAY) nextWave();
    } else {
      state.waveTimer = 0;
    }

    if (state.enemySpawned < state.enemyMax) {
      state.spawnTimer++;
      const interval = state.bossW ? 30 : Math.max(CONFIG.SPAWN_INTERVAL_MIN, CONFIG.SPAWN_INTERVAL_BASE - state.wave * 2);
      if (state.spawnTimer >= interval) {
        state.spawnTimer = 0;
        state.enemySpawned++;
        if (state.bossW && state.enemySpawned >= state.enemyMax) {
          state.enemies.push(new Entities.Enemy('boss', state.wave));
          state.bossA = true;
          Renderer.addText(W / 2, 60, '💀 DARK WIZARD APPEARS! 💀', '#ff4466');
          state.shake.amt = 15;
        } else {
          let t;
          if (state.wave < 3) t = Math.random() < 0.6 ? 'slime' : 'bat';
          else if (state.wave < 6) {
            const r = Math.random();
            t = r < 0.35 ? 'slime' : r < 0.6 ? 'bat' : 'skeleton';
          } else {
            const r = Math.random();
            t = r < 0.25 ? 'slime' : r < 0.45 ? 'bat' : r < 0.7 ? 'skeleton' : 'ghost';
          }
          state.enemies.push(new Entities.Enemy(t, state.wave));
        }
      }
    }
  }

  function nextWave() {
    state.wave++;
    state.enemySpawned = 0;
    state.enemyMax = Math.floor(CONFIG.ENEMIES_PER_WAVE_BASE + state.wave * CONFIG.ENEMIES_PER_WAVE_GROWTH);
    state.spawnTimer = 0;
    state.waveTimer = 0;
    state.bossA = false;
    state.bossW = state.wave % CONFIG.WAVE_BOSS_INTERVAL === 0;
    if (state.bossW) Audio.SFX.boss();
    else Audio.SFX.wave();
    Renderer.addText(W / 2, H / 2 - 20, '⚔ WAVE ' + state.wave + ' ⚔', '#ffcc00');
    if (state.bossW) Renderer.addText(W / 2, H / 2 + 20, '⚠ BOSS INCOMING ⚠', '#ff4466');
    state.shake.amt = 8;
    for (let i = 0; i < 15; i++) {
      state.particles.push(Entities.spawnParticles(
        Math.random() * W, Math.random() * H,
        ['#ffcc00', '#4488ff', '#44cc88'][Math.floor(Math.random() * 3)], 2, 1
      ));
    }
    Quest.recordWave(state.wave);
  }

  // ─── Enemy Updates ───
  function updateEnemies() {
    const p = state.player;
    let scoreAdded = 0;

    state.enemies = state.enemies.filter(e => {
      if (!e.update(p, state.frame) || e.dead) return false;

      // Skeleton ranged attack
      if (e.t === 'skeleton' && e.atkCD <= 0) {
        const dx = p.x - e.x, dy = p.y - e.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200) {
          const a = Math.atan2(dy, dx);
          state.bullets.push(new Entities.Bullet(e.x, e.y, a, true, false, e.atk, 3, 4));
          e.atkCD = 60;
        }
      }

      // Boss phase 2 enrage notification
      if (e.t === 'boss' && e.consumeEnrage()) {
        Renderer.addText(CONFIG.W / 2, CONFIG.H / 2 - 60, '💢 DARK WIZARD ENRAGED! 💢', '#ff4444');
        state.shake.amt = 15;
        Audio.SFX.boss();
      }

      // Boss spread attack with phase 2 patterns
      if (e.t === 'boss' && e.atkCD > (e.isBossPhase2 ? 35 : 60)) {
        e.atkCD = 0;
        const p2 = e.isBossPhase2;
        const count = p2 ? 12 : 8;
        const speed = p2 ? 3.5 : 2.5;

        for (let i = 0; i < count; i++) {
          const a = i / count * Math.PI * 2 + state.frame * 0.02;
          state.bullets.push(new Entities.Bullet(e.x, e.y, a, true, false, p2 ? 12 : 10, speed, 5));
        }

        // Phase 2: also fire aimed shots at player
        if (p2) {
          const da = Math.atan2(p.y - e.y, p.x - e.x);
          for (let i = -1; i <= 1; i++) {
            state.bullets.push(new Entities.Bullet(e.x, e.y, da + i * 0.15, true, false, 8, 4, 4));
          }
        }
      }

      // Contact damage
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < p.r + e.r && p.inv <= 0) {
        if (p.shield > 0) {
          p.shield--;
          Renderer.addText(p.x, p.y - 20, '🛡 BLOCK!', '#4488ff');
          state.shake.amt = 3;
          e.hitFlash = 5;
          e.x += Math.cos(Math.atan2(dy, dx)) * 30;
          e.y += Math.sin(Math.atan2(dy, dx)) * 30;
          return true;
        }
        p.hp -= e.atk;
        p.inv = CONFIG.INVINCIBLE_FRAMES;
        state.combo = 0;
        state.comboT = 0;
        state.shake.amt = 6;
        Audio.SFX.damage();
        state.particles.push(Entities.spawnParticles(p.x, p.y, '#ff4444', 10, 4, 18));
        if (p.hp <= 0) {
          p.hp = 0;
          state.state = 'gameover';
          Audio.SFX.gameOver();
          Save.setHighScore(state.score);
          state.particles.push(Entities.spawnParticles(p.x, p.y, '#ffaa00', 40, 7, 35));
          // End quest tracking
          Quest.endGame(state.score);
        }
      }
      return true;
    });
  }

  // ─── Bullet Updates ───
  function updateBullets() {
    const p = state.player;

    state.bullets = state.bullets.filter(b => {
      if (!b.update()) return false;

      // Enemy bullet hits player
      if (b.isE) {
        const dx = p.x - b.x, dy = p.y - b.y;
        if (Math.sqrt(dx * dx + dy * dy) < p.r + b.r && p.inv <= 0) {
          p.hp -= b.dmg;
          p.inv = CONFIG.INVINCIBLE_FRAMES;
          state.shake.amt = 5;
          Audio.SFX.damage();
          return false;
        }
        return true;
      }

      // Player bullet hits enemy (single player)
      let hit = false;
      if (!state.multi || !state.multi.started) {
        state.enemies.forEach(e => {
          if (e.dead) return;
          const dx = b.x - e.x, dy = b.y - e.y;
          if (Math.sqrt(dx * dx + dy * dy) < e.r + b.r) {
            const killed = e.dmg(b.dmg);
            hit = true;
            state.particles.push(Entities.spawnParticles(b.x, b.y, '#ffcc00', 4, 2, 10));
            if (killed) {
              state.combo++;
              state.comboT = CONFIG.COMBO_TIMEOUT;
              Quest.recordCombo(state.combo);
              const cm = Math.min(10, 1 + Math.floor(state.combo / 10));
              const rw = e.sc * cm;
              state.score += rw;
              state.shake.amt = e.t === 'boss' ? 20 : 4;
              Audio.SFX.kill();
              state.particles.push(Entities.spawnParticles(e.x, e.y, '#44cc88', 18, 5, 22));
              state.particles.push(Entities.spawnParticles(e.x, e.y, '#ffcc00', 10, 3, 16));
              Renderer.addText(e.x, e.y - e.r - 10, '+' + rw + (cm > 1 ? ' x' + cm : ''), cm > 3 ? '#ffcc00' : '#fff');

              // XP
              p.xp += e.t === 'boss' ? 30 : 5 + state.wave;
              if (p.xp >= p.xpToNext) doLevelUp();

              // Quest tracking
              Quest.recordKill(e.t);

              if (e.t === 'boss') {
                for (let i = 0; i < 5; i++) {
                  state.items.push(new Entities.Item(
                    e.x + (Math.random() - 0.5) * 60,
                    e.y + (Math.random() - 0.5) * 60,
                    Math.random() < 0.5 ? 'crystal' : 'potion'
                  ));
                }
                state.items.push(new Entities.Item(e.x, e.y - 20, 'powerup'));
                state.bossA = false;
                state.waveTimer = CONFIG.BOSS_WAVE_DELAY;
                Renderer.addText(W / 2, H / 2, '💥 BOSS DEFEATED! 💥', '#ffcc00');
                Audio.SFX.wave();
                state.shake.amt = 20;
              } else {
                if (Math.random() < CONFIG.ITEM_DROP_RATES.crystal) state.items.push(new Entities.Item(e.x, e.y, 'crystal'));
                if (Math.random() < CONFIG.ITEM_DROP_RATES.potion) state.items.push(new Entities.Item(e.x, e.y, 'potion'));
                if (Math.random() < CONFIG.ITEM_DROP_RATES.powerup) state.items.push(new Entities.Item(e.x, e.y, 'powerup'));
              }
            } else {
              Audio.SFX.hit();
            }
          }
        });
      }

      // Co-op bullet hit
      if (state.multi && state.multi.started && Network.net.mode === 'coop' && !b.isE) {
        const enemies = state.multi.enemies || [];
        enemies.forEach(e => {
          if (e.dead) return;
          const dx = b.x - e.x, dy = b.y - e.y;
          if (Math.sqrt(dx * dx + dy * dy) < e.r + b.r) {
            hit = true;
            Network.sendInput({ bulletHit: true, enemyId: e.id, damage: b.dmg });
            state.particles.push(Entities.spawnParticles(b.x, b.y, '#ffcc00', 4, 2, 10));
            Audio.SFX.hit();
          }
        });
      }

      // PvP bullet hit
      if (!hit && state.multi && state.multi.started && Network.net.mode === 'pvp' && !b.isE) {
        const pp = state.multi.otherPlayers || {};
        Object.keys(pp).forEach(pid => {
          if (pid === Network.net.id || !pp[pid].alive) return;
          const dx = b.x - pp[pid].x, dy = b.y - pp[pid].y;
          if (Math.sqrt(dx * dx + dy * dy) < 14 + b.r && (pp[pid].invincible || 0) <= 0) {
            Network.sendInput({ playerHit: true, targetId: pid, damage: b.dmg });
            hit = true;
            state.particles.push(Entities.spawnParticles(b.x, b.y, '#ff4466', 6, 3, 12));
          }
        });
      }

      return !hit;
    });
  }

  // ─── Item Updates ───
  function updateItems() {
    if (state.multi && state.multi.started) return;
    const p = state.player;

    state.items = state.items.filter(it => {
      if (!it.update()) return false;
      const dx = p.x - it.x, dy = p.y - it.y;
      if (Math.sqrt(dx * dx + dy * dy) < p.r + it.r + 8) {
        Audio.SFX.pickup();
        if (it.t === 'crystal') {
          p.mana = Math.min(p.maxMana, p.mana + 20);
          state.score += 5;
          Renderer.addText(it.x, it.y - 10, '+5 MP', '#4488ff');
          state.particles.push(Entities.spawnParticles(it.x, it.y, '#4488ff', 6, 2));
          Quest.recordCrystal();
        } else if (it.t === 'potion') {
          p.hp = Math.min(p.maxHp, p.hp + 30);
          Renderer.addText(it.x, it.y - 10, '+30 HP', '#44ff44');
          state.particles.push(Entities.spawnParticles(it.x, it.y, '#44ff44', 6, 2));
        } else {
          const r = Math.random();
          if (r < 0.33) {
            p.shield += 3;
            Renderer.addText(it.x, it.y - 10, '🛡 SHIELD!', '#4488ff');
          } else if (r < 0.66) {
            p.triple += 30;
            p.puTimer = 600;
            Renderer.addText(it.x, it.y - 10, '⚡ TRIPLE SHOT!', '#ffaa00');
          } else {
            p.speedB = 1;
            p.puTimer = 600;
            Renderer.addText(it.x, it.y - 10, '💨 SPEED BOOST!', '#44ff88');
          }
          state.particles.push(Entities.spawnParticles(it.x, it.y, '#ffdd44', 12, 3));
        }
        return false;
      }
      return true;
    });
  }

  // ─── Level Up ───
  const LT = CONFIG.LEVEL_TABLE;

  function getLevelStats(l) {
    if (l <= 0) return LT[0];
    if (l >= LT.length) return LT[LT.length - 1];
    return LT[l];
  }

  function doLevelUp() {
    const p = state.player;
    const oldLevel = p.level;
    p.level++;
    p.xp = 0;
    p.xpToNext = Math.floor(p.xpToNext * 1.5);

    const oldS = getLevelStats(oldLevel);
    const newS = getLevelStats(p.level);
    const hpGain = newS.hp - oldS.hp;
    const mpGain = newS.mp - oldS.mp;
    const regGain = (newS.reg - oldS.reg);

    p.maxHp = newS.hp;
    p.hp = Math.min(p.hp + hpGain * 0.5, p.maxHp);
    p.maxMana = newS.mp;
    p.mana = Math.min(p.mana + mpGain * 0.5, p.maxMana);
    p.manaReg = newS.reg;
    p.speed = newS.sp;
    p.hp = Math.min(p.hp + 25, p.maxHp);
    p.mana = Math.min(p.mana + 15, p.maxMana);

    state.luFX = { t: 90, fl: 12 };
    for (let i = 0; i < 30; i++) {
      state.particles.push(Entities.spawnParticles(
        p.x + (Math.random() - 0.5) * 100,
        p.y + (Math.random() - 0.5) * 100,
        ['#ffcc00', '#44ff88', '#4488ff', '#ff44ff', '#44ffff'][Math.floor(Math.random() * 5)], 4, 4, 25
      ));
    }
    Renderer.addText(p.x, p.y - 40, '⬆ LEVEL ' + p.level + ' ⬆', '#ffcc00');
    setTimeout(() => Renderer.addText(p.x + Math.random() * 20 - 10, p.y - 20, 'HP +' + hpGain, '#44ff44'), 100);
    setTimeout(() => Renderer.addText(p.x + Math.random() * 20 - 10, p.y - 35, 'MP +' + mpGain, '#4488ff'), 200);
    setTimeout(() => Renderer.addText(p.x + Math.random() * 20 - 10, p.y - 50, 'Regen +' + regGain.toFixed(2), '#44ffff'), 300);
    Audio.SFX.levelUp();
    state.shake.amt = 12;
    p.inv = 40;
  }

  // ─── Game Loop ───
  function loop() {
    try {
      update();
      Renderer.draw();
    } catch (e) {
      console.error('Game error:', e);
    }
    requestAnimationFrame(loop);
  }

  function start() {
    if (_gameStarted) return;
    _gameStarted = true;
    state.envDecos = Renderer.genEnv();
    loop();
  }

  // ─── Asset Preloading ───
  const ASSETS = {};
  let _loadProgress = 0;
  let _loadErrors = 0;

  function preload() {
    // Apply saved settings
    const savedSettings = Save.getSettings();
    Audio.enabled = savedSettings.sfx !== undefined ? savedSettings.sfx : true;
    if (savedSettings.volume !== undefined) Audio.volume = savedSettings.volume;

    const imgBase = location.protocol === 'http:' || location.protocol === 'https:'
      ? '/diagrams/' : '../../diagrams/';

    const paths = CONFIG.ASSET_PATHS;
    let loaded = 0;
    const total = Object.keys(paths).length;

    Object.entries(paths).forEach(([name, src]) => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        _loadProgress = loaded / total;
        if (loaded >= total) {
          start();
          state.state = 'title';
        }
      };
      img.onerror = () => {
        loaded++;
        _loadErrors++;
        _loadProgress = loaded / total;
        console.warn('[Assets] Failed to load:', name, src);
        if (loaded >= total) {
          start();
          state.state = 'title';
        }
      };
      img.src = imgBase + src;
      ASSETS[name] = img;
    });

    // Expose assets globally for Renderer
    window.ASSETS = ASSETS;

    // Fallback timeout
    setTimeout(() => {
      if (!_gameStarted) {
        start();
        state.state = 'title';
      }
    }, 3000);
  }

  return {
    get state() { return state.state; },
    get player() { return state.player; },
    get score() { return state.score; },
    set score(v) { state.score = v; },
    get wave() { return state.wave; },
    set wave(v) { state.wave = v; },
    get combo() { return state.combo; },
    set combo(v) { state.combo = v; },
    get frame() { return state.frame; },
    get bossW() { return state.bossW; },
    set bossW(v) { state.bossW = v; },
    get bossA() { return state.bossA; },
    set bossA(v) { state.bossA = v; },
    get enemies() { return state.enemies; },
    get bullets() { return state.bullets; },
    get items() { return state.items; },
    get particles() { return state.particles; },
    get envDecos() { return state.envDecos; },
    get multi() { return state.multi; },
    set multi(v) { state.multi = v; },
    get luFX() { return state.luFX; },
    set luFX(v) { state.luFX = v; },
    get shake() { return state.shake; },
    get waveTimer() { return state.waveTimer; },
    set waveTimer(v) { state.waveTimer = v; },
    get enemySpawned() { return state.enemySpawned; },
    set enemySpawned(v) { state.enemySpawned = v; },
    get enemyMax() { return state.enemyMax; },
    set enemyMax(v) { state.enemyMax = v; },
    get spawnTimer() { return state.spawnTimer; },
    set spawnTimer(v) { state.spawnTimer = v; },
    get comboT() { return state.comboT; },
    set comboT(v) { state.comboT = v; },
    get loadProgress() { return _loadProgress; },
    get loadErrors() { return _loadErrors; },

    switchState,
    startSinglePlayer,
    resetMultiplayer,
    handleGameOverClick,
    start,
    preload,
    ASSETS,
  };
})();
