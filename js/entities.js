// ═══ Entity Classes ═══
const Entities = (() => {
  'use strict';

  // ─── Enemy ───
  class Enemy {
    constructor(t, wave) {
      this.t = t;
      const s = 1 + wave * 0.04;
      const cfg = CONFIG.ENEMY_TYPES[t] || CONFIG.ENEMY_TYPES.slime;
      this.r = cfg.r;
      this.hp = cfg.hp * s;
      this.mh = this.hp;
      this.sp = cfg.sp;
      this.atk = cfg.atk;
      this.sc = cfg.sc;
      this.c1 = cfg.c1;
      this.c2 = cfg.c2;
      this.atkCD = 0;
      this.wobble = Math.random() * 6;
      this.hitFlash = 0;
      this.dead = false;

      // AI state
      this.aiTimer = 0;
      this.aiState = 'chase';
      this.aiPhase = 0; // for multi-phase enemies (ghost invis, boss phases)

      // Bat swoop
      this._swoop = { active: false, vx: 0, vy: 0, timer: 0 };

      // Ghost phase
      this._ghost = { invisible: false, timer: 0, reappearX: 0, reappearY: 0 };

      // Boss phase 2
      this._bossPhase2 = false;
      this._justEnraged = false;
      this._bossAngles = Array.from({ length: 3 }, (_, i) => (i / 3) * Math.PI * 2);

      // Spawn at random screen edge
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { this.x = Math.random() * CONFIG.W; this.y = -this.r * 2; }
      else if (edge === 1) { this.x = Math.random() * CONFIG.W; this.y = CONFIG.H + this.r * 2; }
      else if (edge === 2) { this.x = -this.r * 2; this.y = Math.random() * CONFIG.H; }
      else { this.x = CONFIG.W + this.r * 2; this.y = Math.random() * CONFIG.H; }
      this.vx = 0; this.vy = 0;
    }

    update(p, frame) {
      if (this.dead) return false;
      const dx = p.x - this.x, dy = p.y - this.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      this.wobble += 0.03;
      if (this.hitFlash > 0) this.hitFlash--;

      switch (this.t) {
        case 'slime':
          // Bounce toward player with wobble
          this.vx = (dx / dist) * this.sp + Math.sin(this.wobble) * 0.2;
          this.vy = (dy / dist) * this.sp + Math.cos(this.wobble) * 0.2;
          break;

        case 'bat':
          // Swoop AI: periodically charge at player
          if (!this._swoop.active) {
            this.aiTimer++;
            if (this.aiTimer > 120 && dist < 300) {
              // Initiate swoop
              this._swoop.active = true;
              this._swoop.vx = (dx / dist) * this.sp * 3.5;
              this._swoop.vy = (dy / dist) * this.sp * 3.5;
              this._swoop.timer = 20;
              this.aiTimer = 0;
            } else {
              // Normal fluttering movement
              this.vx = (dx / dist) * this.sp * 0.5 + Math.sin(this.wobble) * 0.5;
              this.vy = (dy / dist) * this.sp * 0.5 + Math.sin(this.wobble * 5) * 0.1;
            }
          } else {
            // Swooping
            this.vx = this._swoop.vx;
            this.vy = this._swoop.vy;
            this._swoop.timer--;
            if (this._swoop.timer <= 0 || dist < 30) {
              this._swoop.active = false;
            }
          }
          break;

        case 'skeleton':
          // Ranged AI: maintain distance, shoot from afar
          this.aiTimer++;
          if (dist < 120) {
            // Too close, retreat
            this.vx = (-dx / dist) * this.sp * 0.5;
            this.vy = (-dy / dist) * this.sp * 0.5;
          } else if (dist < 300) {
            // Optimal range, strafe
            const strafeAngle = Math.atan2(dy, dx) + Math.PI / 2;
            this.vx = Math.cos(strafeAngle) * this.sp * 0.3;
            this.vy = Math.sin(strafeAngle) * this.sp * 0.3;
          } else {
            // Approach
            this.vx = (dx / dist) * this.sp * 0.5;
            this.vy = (dy / dist) * this.sp * 0.5;
          }
          if (this.atkCD > 0) this.atkCD--;
          break;

        case 'ghost':
          // Ghost AI: phase through obstacles, blink to new position
          this._ghost.timer++;
          if (this._ghost.invisible) {
            // During invisibility, move toward reappear point
            const gdx = this._ghost.reappearX - this.x;
            const gdy = this._ghost.reappearY - this.y;
            const gd = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
            this.vx = (gdx / gd) * this.sp * 3;
            this.vy = (gdy / gd) * this.sp * 3;
            if (gd < 20 || this._ghost.timer > 50) {
              this._ghost.invisible = false;
              this._ghost.timer = 0;
            }
          } else {
            this.vx = (dx / dist) * this.sp + Math.sin(this.wobble + 0.01) * 0.8;
            this.vy = (dy / dist) * this.sp + Math.cos(this.wobble * 0.7) * 0.8;
            if (this._ghost.timer > 150 && dist < 250) {
              // Blink away
              this._ghost.invisible = true;
              this._ghost.timer = 0;
              this._ghost.reappearX = Math.random() * CONFIG.W;
              this._ghost.reappearY = Math.random() * CONFIG.H;
            }
          }
          break;

        case 'boss':
          // Boss AI: phase 1 and phase 2
          if (!this._bossPhase2 && this.hp < this.mh * 0.5) {
            this._bossPhase2 = true;
            this._justEnraged = true;
            this.sp *= 1.4;
            this.atkCD = 0;
          }

          // Movement: orbit player at a distance in phase 1, chase in phase 2
          const orbitAngle = Math.atan2(dy, dx) + (this._bossPhase2 ? 0.2 : 0.7);
          const moveSpeed = this._bossPhase2 ? this.sp * 1.2 : this.sp;
          this.vx = Math.cos(orbitAngle - 0.3) * moveSpeed;
          this.vy = Math.sin(orbitAngle - 0.3) * moveSpeed;
          this.atkCD++;

          if (this.x < -60) this.x = CONFIG.W + 60;
          if (this.x > CONFIG.W + 60) this.x = -60;
          if (this.y < -60) this.y = CONFIG.H + 60;
          if (this.y > CONFIG.H + 60) this.y = -60;
          break;
      }
      this.x += this.vx;
      this.y += this.vy;
      return true;
    }

    dmg(d) {
      this.hp -= d;
      this.hitFlash = 6;
      if (this.hp <= 0) { this.dead = true; return true; }
      return false;
    }

    // Extra utility: should ghost be drawn invisible?
    get isInvisible() {
      return this.t === 'ghost' && this._ghost.invisible;
    }

    // Is boss in phase 2?
    get isBossPhase2() {
      return this._bossPhase2;
    }

    // Check and consume enrage flag (for game notifications)
    consumeEnrage() {
      if (this._justEnraged) {
        this._justEnraged = false;
        return true;
      }
      return false;
    }

    draw(ctx, frame) {
      if (this.dead) return;
      const x = Math.floor(this.x), y = Math.floor(this.y), s = this.r, fl = this.hitFlash > 0;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.8, s * 0.5, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();

      switch (this.t) {
        case 'slime': this._drawSlime(ctx, x, y, s, fl); break;
        case 'bat': this._drawBat(ctx, x, y, s, fl); break;
        case 'skeleton': this._drawSkeleton(ctx, x, y, s, fl); break;
        case 'ghost': this._drawGhost(ctx, x, y, s, fl); break;
        case 'boss': this._drawBoss(ctx, x, y, s, fl, frame); break;
      }
      // HP bar
      const bw = s + 12, by2 = y - s - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - bw / 2 - 1, by2 - 1, bw + 2, 5);
      ctx.fillStyle = this.t === 'boss' ? '#ff4444' : '#44cc44';
      ctx.fillRect(x - bw / 2, by2, bw * (this.hp / this.mh), 3);
    }

    _drawSlime(ctx, x, y, s, fl) {
      const sq = 1 + Math.sin(this.wobble * 2) * 0.05;
      ctx.fillStyle = fl ? '#fff' : this.c1;
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.2, s * 0.55 * sq, s * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fl ? '#fff' : this.c2;
      ctx.beginPath();
      ctx.ellipse(x - s * 0.15, y - s * 0.05, s * 0.2, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(x - s * 0.22 - 1, y - s * 0.1, 4, 4);
      ctx.fillRect(x + s * 0.1, y - s * 0.1, 4, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - s * 0.17, y - s * 0.15, 2, 2);
      ctx.fillRect(x + s * 0.15, y - s * 0.15, 2, 2);
      ctx.fillStyle = '#226633';
      ctx.fillRect(x - 3, y + s * 0.15, 6, 2);
    }

    _drawBat(ctx, x, y, s, fl) {
      const wa = Math.sin(this.wobble * 5) * 0.3;
      ctx.fillStyle = fl ? '#fff' : this.c1;
      ctx.save();
      ctx.translate(x - s * 0.2, y);
      ctx.rotate(-wa);
      ctx.beginPath();
      ctx.ellipse(-s * 0.3, 0, s * 0.35, s * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(x + s * 0.2, y);
      ctx.rotate(wa);
      ctx.beginPath();
      ctx.ellipse(s * 0.3, 0, s * 0.35, s * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = fl ? '#fff' : this.c2;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.2, s * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(x - 4, y - 2, 2, 3);
      ctx.fillRect(x + 2, y - 2, 2, 3);
    }

    _drawSkeleton(ctx, x, y, s, fl) {
      ctx.fillStyle = fl ? '#fff' : this.c1;
      ctx.fillRect(x - s * 0.25, y - s * 0.1, s * 0.5, s * 0.5);
      ctx.strokeStyle = fl ? '#fff' : '#aa9988';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const ry = y + i * 6 - 2;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.2, ry);
        ctx.lineTo(x + s * 0.2, ry);
        ctx.stroke();
      }
      ctx.fillStyle = fl ? '#fff' : this.c2;
      ctx.beginPath();
      ctx.arc(x, y - s * 0.45, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 5, y - s * 0.5, 3, 4);
      ctx.fillRect(x + 2, y - s * 0.5, 3, 4);
      ctx.fillStyle = fl ? '#fff' : this.c1;
      ctx.fillRect(x - s * 0.2, y + s * 0.35, 4, s * 0.3);
      ctx.fillRect(x + s * 0.1, y + s * 0.35, 4, s * 0.3);
    }

    _drawGhost(ctx, x, y, s, fl) {
      if (this._ghost.invisible) {
        // Flicker when invisible
        if (Math.floor(this.wobble * 10) % 2 === 0) return;
        ctx.globalAlpha = 0.15;
      } else {
        ctx.globalAlpha = 0.6 + Math.sin(this.wobble * 2) * 0.2;
      }
      ctx.fillStyle = fl ? '#fff' : this.c1;
      ctx.beginPath();
      ctx.ellipse(x, y - 2, s * 0.4, s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - s * 0.35, y + 2, s * 0.7, 6);
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 5, y - 4, 3, 4);
      ctx.fillRect(x + 2, y - 4, 3, 4);
      ctx.globalAlpha = 1;
    }

    _drawBoss(ctx, x, y, s, fl, frame) {
      ctx.save();
      const p2 = this._bossPhase2;
      const ap = Math.sin(frame * (p2 ? 0.06 : 0.03)) * 0.3 + 0.7;
      const auraColor = p2 ? 'rgba(255,50,50,' : 'rgba(200,50,80,';
      const bodyColor = fl ? '#fff' : (p2 ? '#441111' : '#662233');
      const faceColor = fl ? '#fff' : (p2 ? '#cc8844' : '#ddbb99');
      const hatColor = p2 ? '#220011' : '#441122';
      const eyeColor = p2 ? '#ffff00' : '#ff2244';

      // Aura
      const gg = ctx.createRadialGradient(x, y, s * 0.3, x, y, s * 1.3);
      gg.addColorStop(0, `${auraColor}${ap * 0.2})`);
      gg.addColorStop(1, `${auraColor}0)`);
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, s * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.6, y + s * 0.7);
      ctx.lineTo(x - s * 0.5, y - s * 0.2);
      ctx.lineTo(x + s * 0.5, y - s * 0.2);
      ctx.lineTo(x + s * 0.6, y + s * 0.7);
      ctx.closePath();
      ctx.fill();

      // Belts
      ctx.fillStyle = p2 ? '#ff4444' : '#ffcc00';
      ctx.fillRect(x - s * 0.5, y + s * 0.1, s, 3);
      ctx.fillRect(x - s * 0.55, y + s * 0.5, s * 1.1, 3);

      // Face
      ctx.fillStyle = faceColor;
      ctx.beginPath();
      ctx.arc(x, y - s * 0.5, s * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Hat
      ctx.fillStyle = hatColor;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.5, y - s * 0.2);
      ctx.lineTo(x - s * 0.4, y - s * 0.9);
      ctx.lineTo(x + s * 0.4, y - s * 0.9);
      ctx.lineTo(x + s * 0.5, y - s * 0.2);
      ctx.closePath();
      ctx.fill();

      // Eyes
      ctx.fillStyle = eyeColor;
      ctx.fillRect(x - 6, y - s * 0.45, 4, 3);
      ctx.fillRect(x + 2, y - s * 0.45, 4, 3);

      // Staff
      ctx.strokeStyle = p2 ? '#884422' : '#553311';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.4, y + s * 0.3);
      ctx.lineTo(x + s * 1.0, y - s * 0.7);
      ctx.stroke();

      ctx.restore();
    }
  }

  // ─── Bullet ───
  class Bullet {
    constructor(x, y, angle, isEnemy = false, isTriple = false, dmg = 15, speed = 7.5, radius = 6) {
      this.x = x;
      this.y = y;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.r = radius;
      this.life = 60;
      this.dmg = dmg;
      this.isE = isEnemy;
      this.isT = isTriple;
      this.homing = 0;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life--;
      return this.life > 0 && this.x > -30 && this.x < 990 && this.y > -30 && this.y < 670;
    }

    draw(ctx) {
      ctx.fillStyle = this.isE ? '#ff4466' : '#ffcc00';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(this.x - 2, this.y - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─── Item ───
  class Item {
    constructor(x, y, type) {
      this.x = x;
      this.y = y;
      this.t = type;
      this.r = 10;
      this.wobble = Math.random() * 6;
      this.life = 600;
    }

    update() {
      this.wobble += 0.04;
      this.life--;
      return this.life > 0;
    }

    draw(ctx) {
      const yo = Math.sin(this.wobble) * 3;
      const x = Math.floor(this.x), y = Math.floor(this.y + yo);
      const gl = Math.sin(this.wobble) * 0.3 + 0.7;

      if (this.t === 'crystal') {
        const gg = ctx.createRadialGradient(x, y, 0, x, y, 18);
        gg.addColorStop(0, `rgba(100,200,255,${gl * 0.25})`);
        gg.addColorStop(1, 'rgba(100,200,255,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#66bbff';
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x + 5, y);
        ctx.lineTo(x + 4, y + 6);
        ctx.lineTo(x - 4, y + 6);
        ctx.lineTo(x - 5, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#aaddff';
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 3, y - 1);
        ctx.lineTo(x, y + 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 1, y - 3, 2, 2);
      } else if (this.t === 'potion') {
        const gg = ctx.createRadialGradient(x, y, 0, x, y, 16);
        gg.addColorStop(0, `rgba(255,100,100,${gl * 0.2})`);
        gg.addColorStop(1, 'rgba(255,100,100,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ee5566';
        ctx.fillRect(x - 4, y - 4, 8, 10);
        ctx.fillStyle = '#cc3344';
        ctx.fillRect(x - 3, y - 2, 6, 6);
        ctx.fillStyle = '#ee5566';
        ctx.fillRect(x - 2, y - 7, 4, 4);
        ctx.fillStyle = '#886644';
        ctx.fillRect(x - 3, y - 8, 6, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x - 2, y - 1, 2, 5);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 2, y + 2, 4, 2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 1, y - 5, 2, 2);
      } else if (this.t === 'powerup') {
        const pu = Math.sin(this.wobble * 2) * 0.2 + 0.8;
        const gg = ctx.createRadialGradient(x, y, 0, x, y, 16);
        gg.addColorStop(0, `rgba(255,204,0,${pu * 0.3})`);
        gg.addColorStop(1, 'rgba(255,204,0,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffdd44';
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2 - Math.PI / 2;
          ctx.fillRect(x + Math.cos(a) * 6 - 2, y + Math.sin(a) * 6 - 2, 4, 4);
        }
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  }

  // ─── Particles ───
  function spawnParticles(x, y, color, count = 8, speed = 3, life = 25, grav = true) {
    const particleSys = {
      pts: [],
      update() {
        let alive = false;
        for (let i = this.pts.length - 1; i >= 0; i--) {
          const p = this.pts[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.96;
          p.vy *= 0.96;
          if (p.grav) p.vy += 0.05;
          p.life--;
          if (p.life <= 0) this.pts.splice(i, 1);
          else alive = true;
        }
        return alive;
      },
      draw(c) {
        this.pts.forEach(p => {
          c.globalAlpha = Math.min(1, p.life / p.ml * 2);
          c.fillStyle = p.color;
          c.fillRect(Math.floor(p.x), Math.floor(p.y), Math.ceil(p.sz), Math.ceil(p.sz));
        });
        c.globalAlpha = 1;
      }
    };
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = Math.random() * speed + 1;
      particleSys.pts.push({
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: Math.random() * life + life * 0.3,
        ml: life * 1.3,
        sz: Math.random() * 3 + 1.5,
        color,
        grav
      });
    }
    return particleSys;
  }

  return {
    Enemy,
    Bullet,
    Item,
    spawnParticles,
  };
})();
