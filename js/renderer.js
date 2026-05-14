// ═══ Renderer System ═══
const Renderer = (() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Color palette
  const C = {
    dark: '#0f0f23', bg: '#1a1a3e', card: '#16213e',
    accent: '#ffcc00', white: '#eee',
    green: '#44cc88', red: '#ff4466', blue: '#4488ff',
    purple: '#aa66ff', hp: '#44cc44', hpBG: '#442222',
  };

  // Player colors for multiplayer
  const P_COLORS = ['#4466aa', '#cc4444', '#44aa66', '#aa44cc', '#cc8844', '#4488cc'];

  // Cached background canvas
  let _bgCanvas = null;
  let _bgA = 0;
  let _titleWobble = 0;

  // Floating texts
  let _floatingTexts = [];

  // ─── Helpers ───
  function addText(x, y, text, color = '#ffcc00') {
    _floatingTexts.push({ x, y, text, color, life: 45, vy: -2 });
  }

  function getBgCache() {
    if (!_bgCanvas) {
      _bgCanvas = document.createElement('canvas');
      _bgCanvas.width = CONFIG.W;
      _bgCanvas.height = CONFIG.H;
      const bc = _bgCanvas.getContext('2d');
      const gg = bc.createRadialGradient(CONFIG.W / 2, CONFIG.H / 2, 0, CONFIG.W / 2, CONFIG.H / 2, 500);
      gg.addColorStop(0, '#1a1a3e');
      gg.addColorStop(1, '#0a0a1a');
      bc.fillStyle = gg;
      bc.fillRect(0, 0, CONFIG.W, CONFIG.H);
      bc.strokeStyle = 'rgba(255,255,255,0.015)';
      bc.lineWidth = 1;
      bc.beginPath();
      for (let x = 0; x < CONFIG.W; x += 48) { bc.moveTo(x, 0); bc.lineTo(x, CONFIG.H); }
      for (let y = 0; y < CONFIG.H; y += 48) { bc.moveTo(0, y); bc.lineTo(CONFIG.W, y); }
      bc.stroke();
    }
    return _bgCanvas;
  }

  // ─── Environment ───
  function genEnv() {
    const envDecos = [];
    const types = ['tree', 'crystal', 'mushroom', 'flower'];
    const flowerColors = ['#ff6688', '#ffaa44', '#ff44aa', '#ffcc44'];
    for (let i = 0; i < 15; i++) {
      envDecos.push({
        t: types[Math.floor(Math.random() * types.length)],
        x: Math.random() * CONFIG.W,
        y: Math.random() * CONFIG.H,
        sz: 8 + Math.random() * 12,
        wobble: Math.random() * 6,
        fc: flowerColors[Math.floor(Math.random() * 4)],
      });
    }
    return envDecos;
  }

  function drawEnv(envDecos) {
    _bgA += 0.02;
    envDecos.forEach(d => {
      const x = Math.floor(d.x), y = Math.floor(d.y) + Math.sin(_bgA + d.wobble) * 2;
      if (d.t === 'tree') {
        ctx.fillStyle = '#335533';
        ctx.beginPath();
        ctx.arc(x, y - 8, d.sz * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#446644';
        ctx.beginPath();
        ctx.arc(x - 3, y - 12, d.sz * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#553322';
        ctx.fillRect(x - 2, y - d.sz * 0.3, 4, d.sz * 0.6);
      } else if (d.t === 'crystal') {
        ctx.fillStyle = '#6688cc';
        ctx.beginPath();
        ctx.moveTo(x, y - d.sz);
        ctx.lineTo(x + d.sz * 0.3, y);
        ctx.lineTo(x - d.sz * 0.3, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#88aaff';
        ctx.beginPath();
        ctx.moveTo(x, y - d.sz * 0.7);
        ctx.lineTo(x + d.sz * 0.1, y);
        ctx.lineTo(x - d.sz * 0.1, y);
        ctx.closePath();
        ctx.fill();
      } else if (d.t === 'mushroom') {
        ctx.fillStyle = '#dd8866';
        ctx.beginPath();
        ctx.arc(x, y - 3, d.sz * 0.4, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#eeaa88';
        ctx.beginPath();
        ctx.arc(x, y - 3, d.sz * 0.3, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#ccbbaa';
        ctx.fillRect(x - 1, y - d.sz * 0.1, 2, d.sz * 0.4);
      } else if (d.t === 'flower') {
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          ctx.fillStyle = d.fc;
          ctx.fillRect(x + Math.cos(a) * 3 - 1, y + Math.sin(a) * 3 - 1, 2, 2);
        }
        ctx.fillStyle = '#ffee88';
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    });
  }

  // ─── Draw Wizard (shared by single/multiplayer) ───
  function drawWizard(x, y, angle, color = '#4466aa', shield = 0, speedB = 0, inv = 0, luFX = null, name = '') {
    if (inv > 0 && Math.floor(inv / 3) % 2 === 0) return;
    ctx.save();
    ctx.translate(x, y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(1, 14 * 0.7, 14 * 0.45, 14 * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shield aura
    if (shield > 0) {
      const ps = Math.sin(Game.frame * 0.1) * 0.2 + 0.8;
      ctx.strokeStyle = `rgba(68,136,255,${ps * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(68,136,255,${ps * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Speed aura
    if (speedB > 0) {
      const ps = Math.sin(Game.frame * 0.15) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(68,255,136,${ps * 0.1})`;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    // Level up aura
    if (luFX) {
      const ps = Math.sin(Game.frame * 0.2) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(255,255,200,${ps * 0.15})`;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-4.9, 7.7);
    ctx.lineTo(-7.7, 1.4);
    ctx.lineTo(-4.9, -4.2);
    ctx.lineTo(4.9, -4.2);
    ctx.lineTo(7.7, 1.4);
    ctx.lineTo(4.9, 7.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3355aa';
    ctx.beginPath();
    ctx.moveTo(-4.2, 0);
    ctx.lineTo(4.2, 0);
    ctx.lineTo(4.9, 7);
    ctx.lineTo(-4.9, 7);
    ctx.closePath();
    ctx.fill();

    // Belt
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(-5.3, 4.9, 10.6, 2);
    ctx.fillRect(-5.9, 2.5, 2, 2.1);
    ctx.fillRect(5.6, 2.5, 2, 2.1);

    // Head
    ctx.fillStyle = '#ffcc88';
    ctx.beginPath();
    ctx.arc(0, -6.3, 4.9, 0, Math.PI * 2);
    ctx.fill();

    // Hat
    ctx.fillStyle = '#3355aa';
    ctx.beginPath();
    ctx.moveTo(-7, -5.6);
    ctx.lineTo(0, -18.2);
    ctx.lineTo(7, -5.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4466aa';
    ctx.fillRect(-7.7, -5.6, 15.4, 3);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(-4.9, -10.5, 9.8, 2);

    // Eyes
    const lx = Math.cos(angle) * 2, ly = Math.sin(angle) * 2, eo = 1.7;
    ctx.fillStyle = '#222';
    ctx.fillRect(-eo + lx - 1.5, -5.9 + ly - 1.5, 3, 4);
    ctx.fillRect(eo + lx - 1.5, -5.9 + ly - 1.5, 3, 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-eo + lx, -6.3 + ly, 1.5, 1.5);
    ctx.fillRect(eo + lx, -6.3 + ly, 1.5, 1.5);

    // Blush
    ctx.fillStyle = 'rgba(255,150,150,0.25)';
    ctx.beginPath();
    ctx.ellipse(-3.5, -4.2, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.ellipse(3.5, -4.2, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Staff
    const sa = angle, sl = 19.6;
    const sx2 = Math.cos(sa) * sl, sy2 = Math.sin(sa) * sl;
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4.2, 2.8);
    ctx.lineTo(4.2 + sx2, 2.8 + sy2);
    ctx.stroke();

    // Magic crystal on staff
    const cx2 = Math.floor(4.2 + sx2), cy2 = Math.floor(2.8 + sy2);
    const gp = Math.sin(Game.frame * 0.08) * 0.2 + 0.8;
    const cg = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, 12);
    cg.addColorStop(0, `rgba(255,255,255,${gp})`);
    cg.addColorStop(0.3, `rgba(100,200,255,${gp * 0.6})`);
    cg.addColorStop(1, 'rgba(100,200,255,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx2, cy2, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#66ccff';
    ctx.beginPath();
    ctx.moveTo(cx2, cy2 - 7);
    ctx.lineTo(cx2 + 6, cy2);
    ctx.lineTo(cx2 + 4, cy2 + 6);
    ctx.lineTo(cx2 - 4, cy2 + 6);
    ctx.lineTo(cx2 - 6, cy2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#aaddff';
    ctx.beginPath();
    ctx.moveTo(cx2, cy2 - 4);
    ctx.lineTo(cx2 + 3, cy2);
    ctx.lineTo(cx2, cy2 + 1);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Name
    if (name) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '10px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(name, x, y - 30);
      ctx.textAlign = 'left';
    }
  }

  // ─── Title Screen ───
  function drawTitle() {
    const W = CONFIG.W, H = CONFIG.H;
    const gg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 500);
    gg.addColorStop(0, '#1a1a3e');
    gg.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);

    const bg = window.ASSETS && ASSETS.bg_village;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.globalAlpha = 0.1;
      ctx.drawImage(bg, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // Floating particles
    for (let i = 0; i < 25; i++) {
      const px = (Math.sin(Date.now() / 2000 + i * 251) + 1) * W / 2;
      const py = (Math.cos(Date.now() / 1500 + i * 379) + 1) * H / 2;
      ctx.fillStyle = `rgba(255,204,0,${Math.sin(Date.now() / 1000 + i * 0.7) * 0.08 + 0.08})`;
      ctx.fillRect(px, py, 2, 2);
    }

    const pu = Math.sin(Date.now() / 400) * 3;
    ctx.shadowColor = 'rgba(255,204,0,0.3)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 52px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚔ PIXEL WIZARD ⚔', W / 2, H / 2 - 120 + pu);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#88ccff';
    ctx.font = '20px "Courier New", monospace';
    ctx.fillText('— 像素巫师 · 水晶 Quest —', W / 2, H / 2 - 60);

    const highScore = Save.getHighScore();
    if (highScore > 0) {
      ctx.fillStyle = '#ffcc00';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText('🏆 HIGH SCORE: ' + highScore, W / 2, H / 2 - 25);
    }

    // Title wizard character
    _titleWobble++;
    ctx.save();
    ctx.translate(W / 2, H / 2 + 50 + Math.sin(_titleWobble / 30) * 5);
    ctx.scale(2.5, 2.5);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4466aa';
    ctx.fillRect(-8, 0, 16, 18);
    ctx.fillStyle = '#3355aa';
    ctx.fillRect(-7, 0, 14, 2);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(-7, 12, 14, 2);
    ctx.fillRect(-8, 4, 2, 8);
    ctx.fillRect(6, 4, 2, 8);
    ctx.fillStyle = '#ffcc88';
    ctx.beginPath();
    ctx.arc(0, -7, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3355aa';
    ctx.beginPath();
    ctx.moveTo(-11, -7);
    ctx.lineTo(0, -26);
    ctx.lineTo(11, -7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(-7, -16, 14, 2);
    ctx.fillStyle = '#222';
    ctx.fillRect(-4, -9, 3, 3);
    ctx.fillRect(2, -9, 3, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-3, -10, 1, 1);
    ctx.fillRect(3, -10, 1, 1);
    // Staff
    const sx = 10;
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, 5);
    ctx.lineTo(sx + 12, -16);
    ctx.stroke();
    const gi = Math.sin(_titleWobble / 20) * 0.3 + 0.7;
    const cg = ctx.createRadialGradient(sx + 12, -16, 0, sx + 12, -16, 8);
    cg.addColorStop(0, `rgba(255,255,255,${gi})`);
    cg.addColorStop(0.4, `rgba(100,200,255,${gi * 0.6})`);
    cg.addColorStop(1, 'rgba(100,200,255,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(sx + 12, -16, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Menu buttons
    const by = H / 2 + 165;
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(W / 2 - 120, by, 240, 36);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🎮 单人模式', W / 2, by + 24);

    ctx.fillStyle = '#4488ff';
    ctx.fillRect(W / 2 - 120, by + 44, 240, 36);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText('🌐 联网对战', W / 2, by + 68);

    ctx.fillStyle = '#888';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText('WASD 移动 | 空格 射击 | P 暂停 | 触屏支持', W / 2, by + 110);
    ctx.textAlign = 'left';
  }

  // ─── Lobby Screen ───
  function drawLobby() {
    const W = CONFIG.W, H = CONFIG.H;
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);
    const bg = window.ASSETS && ASSETS.bg_dungeon;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.globalAlpha = 0.1;
      ctx.drawImage(bg, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🌐 联 网 对 战', W / 2, 50);

    ctx.fillStyle = '#888';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText(Network.net.connected ? '🟢 已连接' : '🔴 未连接', W / 2, 75);

    // Name input
    ctx.fillStyle = '#aa88ff';
    ctx.font = '13px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('你的名字:', 60, 120);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(60, 128, 200, 28);
    ctx.fillStyle = '#fff';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText(Network.playerName || ('玩家' + Network.net.id.slice(0, 4)), 65, 147);

    // Tabs
    const tabs = ['create', 'join'];
    const tw = 120, th = 35, tx = W / 2 - 120, ty = 165;
    tabs.forEach((t, i) => {
      const sel = Network.lobbyTab === t;
      const x = tx + i * tw;
      ctx.fillStyle = sel ? '#ffcc00' : '#333';
      ctx.fillRect(x, ty, tw - 4, th);
      ctx.fillStyle = sel ? '#000' : '#888';
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t === 'create' ? '创建房间' : '加入房间', x + tw / 2 - 2, ty + 22);
    });
    ctx.textAlign = 'left';

    if (Network.lobbyTab === 'create') {
      ctx.fillStyle = '#eee';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText('模式选择:', 60, 230);
      const modes = [
        { k: 'coop', l: '👥 合作模式' },
        { k: 'pvp', l: '⚔ 对战模式' }
      ];
      modes.forEach((m, i) => {
        const sel = Network.net.mode === m.k;
        const x = 60 + i * 160;
        ctx.fillStyle = sel ? '#ffcc00' : '#444';
        ctx.fillRect(x, 240, 140, 30);
        ctx.fillStyle = sel ? '#000' : '#aaa';
        ctx.font = '13px "Courier New", monospace';
        ctx.fillText(m.l, x + 10, 260);
      });
      ctx.fillStyle = '#44cc88';
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.fillText('[ 创建房间 ]', 60, 310);
    } else {
      ctx.fillStyle = '#eee';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText('房间码:', 60, 230);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(60, 238, 160, 28);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px "Courier New", monospace';
      ctx.fillText(Network.joinCode, 65, 260);
      ctx.fillStyle = '#4488ff';
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.fillText('[ 加入房间 ]', 60, 310);
    }

    if (!Network.net.connected) {
      ctx.fillStyle = '#ff6644';
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ 未连接到服务器', W / 2, 400);
      ctx.textAlign = 'left';
    }

    // Server address
    ctx.fillStyle = '#888';
    ctx.font = '11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('服务器: ' + Network.serverAddr + (Network.net.connected ? ' 🟢' : ''), W / 2, H - 35);
    ctx.fillStyle = '#555';
    ctx.font = '9px "Courier New", monospace';
    ctx.fillText('点击修改服务器地址', W / 2, H - 20);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#888';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText('ESC 返回主菜单', 20, H - 20);
  }

  // ─── Room Screen ───
  function drawRoom() {
    const W = CONFIG.W, H = CONFIG.H;
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);
    const bg = window.ASSETS && ASSETS.bg_dungeon;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.globalAlpha = 0.1;
      ctx.drawImage(bg, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 24px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('📋 房间 ' + Network.net.room, W / 2, 45);
    ctx.fillStyle = '#88ccff';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('模式: ' + (Network.net.mode === 'coop' ? '👥 合作模式' : '⚔ 对战模式'), W / 2, 75);

    const pList = Object.values(Network.net.players);
    ctx.fillStyle = '#eee';
    ctx.font = '16px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('玩家 (' + pList.length + ')', 60, 130);
    pList.forEach((p, i) => {
      const y = 150 + i * 35;
      const isMe = p.id === Network.net.id;
      ctx.fillStyle = isMe ? '#ffcc00' : '#ddd';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText((isMe ? '▶ ' : '') + p.name + (p.ready ? ' ✅' : '') + (isMe ? ' (你)' : ''), 80, y);
    });
    ctx.textAlign = 'center';

    if (Network.net.mode === 'coop') {
      if (pList.length >= 2) {
        const allR = pList.every(p => p.ready);
        ctx.fillStyle = allR ? '#44cc88' : '#888';
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.fillText(allR ? '[ 准备就绪，即将开始... ]' : '[ 按空格准备 ]', W / 2, 350);
      } else {
        ctx.fillStyle = '#888';
        ctx.font = '14px "Courier New", monospace';
        ctx.fillText('等待更多玩家加入...', W / 2, 350);
      }
    } else {
      ctx.fillStyle = pList.length >= 2 ? '#ff6644' : '#888';
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.fillText(pList.length >= 2 ? '[ 按空格开始对战 ]' : '等待对手加入...', W / 2, 350);
    }

    ctx.fillStyle = '#888';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText('ESC 离开房间', W / 2, 400);
    ctx.textAlign = 'left';

    if (Network.tunnelUrl) {
      ctx.fillStyle = '#44ff88';
      ctx.font = '11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🔗 公网: ' + Network.tunnelUrl, W / 2, H - 50);
      ctx.fillStyle = '#888';
      ctx.font = '9px "Courier New", monospace';
      ctx.fillText('分享这个地址给外网好友', W / 2, H - 35);
      ctx.textAlign = 'left';
    }
  }

  // ─── Log Messages ───
  function drawLog() {
    const msgs = Network.logMsgs;
    msgs.forEach((m, i) => {
      m.life--;
      const al = Math.min(1, m.life / 30);
      ctx.globalAlpha = al;
      ctx.fillStyle = m.color;
      ctx.font = '12px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(m.text, CONFIG.W / 2, 40 + i * 18);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    });
    // Remove expired
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].life <= 0) msgs.splice(i, 1);
    }
  }

  // ─── Game View ───
  function drawGame() {
    const W = CONFIG.W, H = CONFIG.H;
    const frame = Game.frame;
    const bg = Game.bossA ? (window.ASSETS && ASSETS.bg_dungeon) :
      Game.wave % 3 === 0 ? (window.ASSETS && ASSETS.bg_battle) :
      Game.wave % 3 === 1 ? (window.ASSETS && ASSETS.bg_magic) :
      (window.ASSETS && ASSETS.bg_village);

    ctx.drawImage(getBgCache(), 0, 0);
    if (bg && bg.complete && bg.naturalWidth > 0 && frame % 3 === 0) {
      ctx.globalAlpha = Game.bossA ? 0.2 : 0.1;
      ctx.drawImage(bg, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    drawEnv(Game.envDecos);

    // Multiplayer: other players
    if (Game.multi && Game.multi.started && Game.multi.otherPlayers) {
      const ids = Object.keys(Game.multi.otherPlayers);
      ids.forEach((id, i) => {
        const sp = Game.multi.otherPlayers[id];
        if (id === Network.net.id || !sp.alive) return;
        if (sp._lerp !== undefined && sp._lerp < 1) {
          sp._lerp = Math.min(1, sp._lerp + 0.12);
          sp._sx += (sp.x - sp._sx) * 0.2;
          sp._sy += (sp.y - sp._sy) * 0.2;
        } else {
          sp._sx = sp.x;
          sp._sy = sp.y;
        }
        drawWizard(sp._sx, sp._sy, sp.angle || 0, P_COLORS[i % P_COLORS.length], 0, 0, sp.invincible || 0, null, sp.name);
      });
    }

    // Items
    if (Game.multi && Game.multi.started && Network.net.mode === 'coop') {
      Game.multi.items.forEach(i => {
        ctx.fillStyle = '#66bbff';
        ctx.fillRect(i.x - 4, i.y - 4, 8, 8);
      });
    } else {
      Game.items.forEach(i => i.draw(ctx));
    }

    // Enemies
    if (Game.multi && Game.multi.started && Network.net.mode === 'coop') {
      drawMultiEnemies();
    } else {
      Game.enemies.forEach(e => e.draw(ctx, frame));
    }

    // Bullets
    Game.bullets.forEach(b => b.draw(ctx));

    // Particles
    Game.particles.forEach(p => p.draw(ctx));

    // Floating texts
    _floatingTexts = _floatingTexts.filter(ft => {
      ft.y += ft.vy;
      ft.vy *= 0.96;
      ft.life--;
      const al = Math.min(1, ft.life / 20);
      ctx.globalAlpha = al;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
      return ft.life > 0;
    });

    // Player
    const p = Game.player;
    drawWizard(
      p.x, p.y,
      Math.atan2(Input.mouse.y - p.y, Input.mouse.x - p.x),
      '#4466aa', p.shield, p.speedB, p.inv, Game.luFX
    );

    // Level up effect
    if (Game.luFX) {
      const e2 = Game.luFX;
      if (e2.fl > 0) {
        ctx.fillStyle = `rgba(255,255,255,${e2.fl / 12 * 0.3})`;
        ctx.fillRect(0, 0, W, H);
      }
      const pr = 1 - e2.t / 90, rr = pr * 300;
      ctx.strokeStyle = `rgba(255,204,0,${(1 - pr) * 0.4})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(1 - pr) * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawHUD();

    // Paused overlay
    if (Game.state === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 36px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⏸ PAUSED', W / 2, H / 2);
      ctx.textAlign = 'left';
    }

    // Connection status
    if (Game.multi && Game.multi.started) {
      ctx.fillStyle = 'rgba(0,255,0,0.5)';
      ctx.fillRect(W - 80, 8, 6, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '9px "Courier New", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('ONLINE', W - 16, 16);
      ctx.textAlign = 'left';
    }

    // Game over
    if (Game.state === 'gameover') {
      drawGameOver();
    }

    // Controls hint
    if (!Game.multi && Game.frame < 240) {
      const al = Math.max(0, 1 - Game.frame / 240);
      ctx.globalAlpha = al * 0.5;
      ctx.fillStyle = '#fff';
      ctx.font = '12px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        Input.isMobile ? '左侧摇杆 | 右侧射击' : 'WASD 移动 | 空格 射击 | P 暂停',
        W / 2, H - 12
      );
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    // Mobile controls
    if (Input.isMobile && !Game.multi) drawMobileControls();
  }

  // ─── Multiplayer Enemy Drawing (Simplified for co-op) ───
  function drawMultiEnemies() {
    const frame = Game.frame;
    Game.multi.enemies.forEach(e => {
      if (e.dead) return;
      const x = Math.floor(e.x), y = Math.floor(e.y), s = e.r || 18;
      const fl = e.hitFlash > 0;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.8, s * 0.5, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      // Simplified pixel drawing for network enemies
      const c1 = { slime: '#44cc66', bat: '#8855aa', skeleton: '#ccbbaa', ghost: '#9977dd', boss: '#aa2244' } [e.type] || '#cc4444';
      const c2 = { slime: '#66ee88', bat: '#aa77cc', skeleton: '#eeddcc', ghost: '#bb99ff', boss: '#dd4466' } [e.type] || '#ee6666';
      if (e.type === 'slime') {
        const sq = 1 + Math.sin((e.wobble || 0) * 2) * 0.05;
        ctx.fillStyle = fl ? '#fff' : c1;
        ctx.beginPath();
        ctx.ellipse(x, y + s * 0.2, s * 0.55 * sq, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = fl ? '#fff' : c2;
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
      } else if (e.type === 'bat') {
        const wa = Math.sin((e.wobble || 0) * 5) * 0.3;
        ctx.fillStyle = fl ? '#fff' : c1;
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
        ctx.fillStyle = fl ? '#fff' : c2;
        ctx.beginPath();
        ctx.ellipse(x, y, s * 0.2, s * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(x - 4, y - 2, 2, 3);
        ctx.fillRect(x + 2, y - 2, 2, 3);
      }
      // HP bar
      const bw = s + 12, by2 = y - s - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - bw / 2 - 1, by2 - 1, bw + 2, 5);
      ctx.fillStyle = e.type === 'boss' ? '#ff4444' : '#44cc44';
      ctx.fillRect(x - bw / 2, by2, bw * (Math.max(0, e.hp || 0) / (e.maxHp || 1)), 3);
    });
  }

  // ─── Game Over Screen ───
  function drawGameOver() {
    const W = CONFIG.W, H = CONFIG.H;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);
    const bx = W / 2 - 200, by = H / 2 - 100, bw = 400, bh = 200;
    ctx.fillStyle = 'rgba(20,10,30,0.95)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#ff4466';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#ff4466';
    ctx.font = 'bold 40px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, by + 45);
    ctx.fillStyle = '#ffcc00';
    ctx.font = '22px "Courier New", monospace';
    ctx.fillText('SCORE: ' + Game.score, W / 2, by + 85);
    if (Game.score >= Save.getHighScore() && Game.score > 0) {
      ctx.fillStyle = '#ffaa00';
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.fillText('🏆 NEW HIGH SCORE! 🏆', W / 2, by + 115);
    }
    ctx.fillStyle = '#88ccff';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('Wave ' + Game.wave + ' · Level ' + Game.player.level + ' · Combo ' + Game.combo, W / 2, by + 140);
    ctx.fillStyle = '#4488ff';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText('HIGH SCORE: ' + Save.getHighScore(), W / 2, by + 160);
    ctx.fillStyle = '#fff';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('点击 或 按 ENTER 重新开始', W / 2, by + 185);
    ctx.textAlign = 'left';
  }

  // ─── HUD ───
  function drawHUD() {
    const p = Game.player, bx = 16, bw = 200, bh = 16;

    // HP bar
    const hy = 16;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 4, hy - 4, bw + 54, bh + 26);
    ctx.fillStyle = '#442222';
    ctx.fillRect(bx, hy, bw, bh);
    const hr = p.hp / p.maxHp;
    const hc = hr > 0.5 ? '#44cc44' : hr > 0.25 ? '#cccc44' : '#cc4444';
    ctx.fillStyle = hc;
    const haw = bw * Math.max(0, hr);
    ctx.fillRect(bx, hy, haw, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, hy, haw, 3);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, hy, bw, bh);
    ctx.fillStyle = '#fff';
    ctx.font = '10px "Courier New", monospace';
    ctx.fillText('HP ' + Math.ceil(p.hp) + '/' + p.maxHp, bx + 4, hy + 12);

    // MP bar
    const my = hy + bh + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 4, my - 4, bw + 54, bh + 26);
    ctx.fillStyle = '#222244';
    ctx.fillRect(bx, my, bw, bh);
    ctx.fillStyle = '#4488ff';
    const maw = bw * (p.mana / p.maxMana);
    ctx.fillRect(bx, my, maw, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, my, maw, 3);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, my, bw, bh);
    ctx.fillStyle = '#aaccff';
    ctx.font = '10px "Courier New", monospace';
    ctx.fillText('MP ' + Math.ceil(p.mana) + '/' + p.maxMana, bx + 4, my + 12);

    // XP bar
    const xy = my + bh + 4;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx - 2, xy - 2, bw + 4, 7);
    ctx.fillStyle = '#444';
    ctx.fillRect(bx, xy, bw, 4);
    ctx.fillStyle = '#aa66ff';
    ctx.fillRect(bx, xy, bw * (p.xp / p.xpToNext), 4);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, xy, bw, 4);
    ctx.fillStyle = '#cc88ff';
    ctx.font = '10px "Courier New", monospace';
    ctx.fillText('Lv.' + p.level, bx + bw + 6, xy + 3);

    // Score
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillText('SCORE: ' + Game.score, CONFIG.W - 16, 30);

    ctx.fillStyle = Game.bossA ? '#ff4466' : '#88ccff';
    ctx.font = 'bold 15px "Courier New", monospace';
    ctx.fillText(Game.bossW && Game.bossA ? ('WAVE ' + Game.wave + ' ⚠') : ('WAVE ' + Game.wave), CONFIG.W - 16, 50);

    if (Game.combo > 1) {
      ctx.fillStyle = '#ffaa00';
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.fillText(Game.combo + 'x COMBO', CONFIG.W - 16, 68);
    }

    ctx.fillStyle = Game.bossA ? '#ff6666' : '#cc8888';
    ctx.font = '12px "Courier New", monospace';
    const yo = Game.combo > 1 ? 86 : 68;
    ctx.fillText('敌人: ' + Game.enemies.length, CONFIG.W - 16, yo + 6);

    let py = Game.combo > 1 ? 104 : 86;
    if (p.shield > 0) {
      ctx.fillStyle = '#4488ff';
      ctx.font = '12px "Courier New", monospace';
      ctx.fillText('🛡 x' + p.shield, CONFIG.W - 16, py);
      py += 15;
    }
    if (p.speedB > 0 || p.triple > 0) {
      ctx.fillStyle = '#ffaa00';
      ctx.font = '12px "Courier New", monospace';
      ctx.fillText('⚡ ' + Math.ceil(p.puTimer / 60) + 's', CONFIG.W - 16, py);
    }
    ctx.textAlign = 'left';

    // Boss HP bar
    if (Game.bossA) {
      const boss = Game.enemies.find(e => e.t === 'boss');
      if (boss) {
        const bW = 320, bH = 10, bX = CONFIG.W / 2 - bW / 2, bY = 8;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(bX - 2, bY - 2, bW + 4, bH + 4);
        ctx.fillStyle = '#442222';
        ctx.fillRect(bX, bY, bW, bH);
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(bX, bY, bW * (boss.hp / boss.mh), bH);
        ctx.strokeStyle = '#ff4466';
        ctx.lineWidth = 1;
        ctx.strokeRect(bX - 2, bY - 2, bW + 4, bH + 4);
        ctx.fillStyle = '#ff8888';
        ctx.font = '9px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DARK WIZARD', CONFIG.W / 2, bY + 8);
        ctx.textAlign = 'left';
      }
    }

    // Quest progress display (right side)
    if (typeof Quest !== 'undefined') {
      const quests = Quest.getActiveQuests();
      if (quests && quests.length > 0) {
        const qx = CONFIG.W - 190, qw = 175;
        const completedIds = Quest.getCompleted();

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(qx - 4, 76, qw + 8, quests.length * 38 + 20);
        ctx.fillStyle = '#ffcc00';
        ctx.font = '9px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillText('📋 任务', CONFIG.W - 10, 88);

        quests.forEach((q, i) => {
          const qy = 96 + i * 38;
          const done = completedIds.includes(q.id);
          const prog = done ? 1 : (Quest.getQuestProgress(q) / 100);

          ctx.fillStyle = done ? '#44cc88' : '#ccc';
          ctx.font = '9px "Courier New", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(q.icon + ' ' + q.title, CONFIG.W - 10, qy + 8);

          // Progress bar
          ctx.fillStyle = '#333';
          ctx.fillRect(qx, qy + 12, qw, 6);
          ctx.fillStyle = done ? '#44cc88' : '#ffcc00';
          ctx.fillRect(qx + 1, qy + 13, (qw - 2) * Math.min(1, prog), 4);

          // Label
          ctx.fillStyle = '#888';
          ctx.font = '7px "Courier New", monospace';
          ctx.fillText(done ? '✅ 完成' : Math.floor(prog * 100) + '%', CONFIG.W - 10, qy + 30);
        });
        ctx.textAlign = 'left';
      }
    }

    // Sound and controls indicator
    if (!Audio.enabled) {
      ctx.fillStyle = 'rgba(255,68,68,0.5)';
      ctx.font = '10px "Courier New", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('🔇 静音 (M)', CONFIG.W - 16, CONFIG.H - 10);
      ctx.textAlign = 'left';
    }
  }

  // ─── Mobile Controls ───
  function drawMobileControls() {
    const tc = Input.touchCtrl;
    if (tc.joy.active) {
      const j = tc.joy;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(j.sx, j.sy, j.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,204,0,0.35)';
      ctx.beginPath();
      ctx.arc(j.sx + j.dx, j.sy + j.dy, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,204,0,0.6)';
      ctx.beginPath();
      ctx.arc(j.sx + j.dx, j.sy + j.dy, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    const fx = Math.min(CONFIG.W - 40, Math.max(CONFIG.W / 2 + 20, Input.mouse.x));
    const fy = Math.min(CONFIG.H - 40, Math.max(40, Input.mouse.y));
    const fr = 35;
    const pu = Math.sin(Game.frame * 0.08) * 0.1 + 0.9;
    ctx.fillStyle = `rgba(255,50,80,${tc.fire.active ? 0.25 : 0.15})`;
    ctx.strokeStyle = `rgba(255,50,80,${pu * 0.3})`;
    ctx.lineWidth = tc.fire.active ? 3 : 2;
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${pu * 0.3})`;
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚔', fx, fy + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ─── Main Draw ───
  function draw() {
    ctx.save();
    ctx.translate(Game.shake.x, Game.shake.y);

    switch (Game.state) {
      case 'title':
        drawTitle();
        break;
      case 'lobby':
        drawLobby();
        drawLog();
        break;
      case 'room':
        drawRoom();
        drawLog();
        break;
      case 'playing':
      case 'gameover':
      case 'paused':
        drawGame();
        break;
      default:
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 20px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚔ PIXEL WIZARD ⚔', CONFIG.W / 2, CONFIG.H / 2 - 40);
        ctx.fillStyle = '#888';
        ctx.font = '14px "Courier New", monospace';
        ctx.fillText('加载资源中...', CONFIG.W / 2, CONFIG.H / 2);

        // Progress bar
        const prog = Game.loadProgress || 0;
        const barW = 240, barH = 12, barX = CONFIG.W / 2 - barW / 2, barY = CONFIG.H / 2 + 20;
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(barX + 2, barY + 2, (barW - 4) * Math.min(1, prog), barH - 4);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.fillStyle = '#555';
        ctx.font = '11px "Courier New", monospace';
        ctx.fillText(Math.floor(prog * 100) + '%', CONFIG.W / 2, barY + barH + 18);

        if (Game.loadErrors > 0) {
          ctx.fillStyle = '#ff6644';
          ctx.font = '11px "Courier New", monospace';
          ctx.fillText(Game.loadErrors + ' 个资源加载失败', CONFIG.W / 2, barY + barH + 40);
        }
        ctx.textAlign = 'left';
    }

    ctx.restore();
  }

  return {
    ctx,
    C,
    get floatingTexts() { return _floatingTexts; },
    addText,
    genEnv,
    drawWizard,
    drawTitle,
    drawLobby,
    drawRoom,
    drawLog,
    drawGame,
    drawHUD,
    draw,
    drawGameOver,
    drawMobileControls,
    drawEnv,
    getBgCache,
  };
})();
