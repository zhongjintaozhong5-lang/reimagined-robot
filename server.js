#!/usr/bin/env node
/**
 * Pixel Wizard RPG - Multiplayer Server
 * 支持: 合作模式(Co-op) / 对战模式(PvP)
 */

// ─── 模块路径 ───
const _pwModPaths = [
  require('path').resolve(__dirname, 'node_modules'),
].filter(p => { try { require('fs').accessSync(p); return true; } catch(e) { return false; } });
_pwModPaths.forEach(p => module.paths.push(p));

const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const USE_TUNNEL = process.argv.includes('--public') || process.argv.includes('--tunnel');
let tunnelUrl = ''; // 公网隧道地址
const TICK_RATE = 20; // Hz
const TICK_MS = 1000 / TICK_RATE;
const GAME_DIR = __dirname;
const DIAGRAMS_DIR = path.resolve(GAME_DIR, '..', '..', 'diagrams');

const MIME = {
  '.html':'text/html','.js':'application/javascript','.css':'text/css',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.svg':'image/svg+xml',
  '.json':'application/json','.ico':'image/x-icon',
};

// ─── Room Manager ───
const rooms = new Map();
const clients = new Map(); // ws -> { id, name, roomId }

function genCode() {
  let code;
  do { code = Math.floor(1000 + Math.random() * 9000).toString(); }
  while (rooms.has(code));
  return code;
}

function genId() { return crypto.randomUUID().slice(0, 8); }

// ─── Room Class ───
class Room {
  constructor(code, mode, maxPlayers) {
    this.code = code;
    this.mode = mode;        // 'coop' | 'pvp'
    this.maxPlayers = maxPlayers || (mode === 'pvp' ? 2 : 4);
    this.players = new Map();  // id -> playerData
    this.state = 'waiting';    // waiting, playing, ended
    this.tick = 0;

    // Co-op shared state
    this.enemies = [];
    this.wave = 0;
    this.enemiesSpawned = 0;
    this.enemiesPerWave = 6;
    this.spawnTimer = 0;
    this.waveTimer = 0;
    this.bossActive = false;
    this.bossWave = false;
    this.items = [];
  }

  broadcast(msg, excludeId = null) {
    const data = JSON.stringify(msg);
    this.players.forEach((p, id) => {
      if (id !== excludeId && p.ws.readyState === 1) {
        p.ws.send(data);
      }
    });
  }

  getPlayerList() {
    return Array.from(this.players.entries()).map(([id, p]) => ({
      id, name: p.name, ready: p.ready, level: p.level
    }));
  }

  toJSON() {
    return {
      code: this.code, mode: this.mode,
      state: this.state,
      players: this.getPlayerList(),
      maxPlayers: this.maxPlayers,
    };
  }

  startGame() {
    this.state = 'playing';
    this.tick = 0;
    this.wave = 0;
    this.enemies = [];
    this.items = [];

    const spawnPositions = [
      { x: 200, y: 320 }, { x: 760, y: 320 },
      { x: 480, y: 100 }, { x: 480, y: 540 },
    ];

    let i = 0;
    this.players.forEach((p, id) => {
      const pos = spawnPositions[i % spawnPositions.length];
      p.x = pos.x; p.y = pos.y;
      p.hp = 100; p.maxHp = 100;
      p.mana = 60; p.maxMana = 60;
      p.level = 1;
      p.score = 0;
      p.invincible = 60;
      p.angle = 0;
      p.alive = true;
      i++;
    });

    this.broadcast({ type: 'game_start', mode: this.mode });
    this.nextWave();
  }

  nextWave() {
    this.wave++;
    this.enemiesSpawned = 0;
    this.enemiesPerWave = Math.floor(6 + this.wave * 2);
    this.spawnTimer = 0;
    this.waveTimer = 0;
    this.bossActive = false;
    this.bossWave = this.wave % 5 === 0;

    this.broadcast({ type: 'wave_start', wave: this.wave, bossWave: this.bossWave });
  }

  getState() {
    const pData = {};
    this.players.forEach((p, id) => {
      pData[id] = {
        x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp,
        mana: p.mana, maxMana: p.maxMana,
        level: p.level, score: p.score,
        name: p.name, angle: p.angle,
        alive: p.alive !== false,
        invincible: p.invincible || 0,
      };
    });

    return {
      type: 'game_state',
      tick: this.tick,
      players: pData,
      enemies: this.enemies.map(e => ({
        id: e.id, type: e.type, x: e.x, y: e.y,
        hp: e.hp, maxHp: e.maxHp,
        vx: e.vx, vy: e.vy, r: e.r,
        wobble: e.wobble, hitFlash: e.hitFlash,
      })),
      items: this.items.map(i => ({
        id: i.id, type: i.type, x: i.x, y: i.y, bob: i.bob,
      })),
      wave: this.wave, bossActive: this.bossActive,
    };
  }

  update() {
    if (this.state !== 'playing') return;
    this.tick++;

    // Update invincibility
    this.players.forEach(p => { if (p.invincible > 0) p.invincible--; });

    // === CO-OP: Enemy wave spawning ===
    if (this.mode === 'coop') {
      if (this.enemies.length === 0 && this.enemiesSpawned >= this.enemiesPerWave && !this.bossActive) {
        this.waveTimer++;
        if (this.waveTimer > 30) this.nextWave();
      } else {
        this.waveTimer = 0;
      }

      if (this.enemiesSpawned < this.enemiesPerWave) {
        this.spawnTimer++;
        if (this.spawnTimer >= (this.bossWave ? 30 : Math.max(15, 50 - this.wave * 2))) {
          this.spawnTimer = 0;
          this.enemiesSpawned++;
          const id = genId();
          if (this.bossWave && this.enemiesSpawned >= this.enemiesPerWave) {
            this.enemies.push({ id, type: 'boss', x: 200+Math.random()*560, y: 100+Math.random()*440,
              hp: 200*(1+this.wave*0.15), maxHp: 200*(1+this.wave*0.15), r: 36, sp: 0.6, dmg: 15,
              vx: 0, vy: 0, wobble: Math.random()*6, hitFlash: 0, atkCD: 0, wave: this.wave });
            this.bossActive = true;
          } else {
            const r = Math.random();
            const t = this.wave < 3 ? (r<0.6?'slime':'bat') :
                      this.wave < 6 ? (r<0.35?'slime':r<0.6?'bat':'skeleton') :
                      (r<0.25?'slime':r<0.45?'bat':r<0.7?'skeleton':'ghost');
            const s = 1 + this.wave * 0.06;
            const stats = {
              slime: {r:18,hp:20*s,sp:1.0,dmg:8},
              bat: {r:14,hp:12*s,sp:2.2,dmg:10},
              skeleton: {r:20,hp:30*s,sp:0.9,dmg:12},
              ghost: {r:16,hp:18*s,sp:1.4,dmg:10},
            }[t];
            const side = Math.floor(Math.random()*4);
            let ex, ey;
            if(side===0){ex=Math.random()*960;ey=-30;}
            else if(side===1){ex=Math.random()*960;ey=670;}
            else if(side===2){ex=-30;ey=Math.random()*640;}
            else{ex=990;ey=Math.random()*640;}
            this.enemies.push({ id, type: t, x: ex, y: ey, ...stats, maxHp: stats.hp,
              vx:0, vy:0, wobble:Math.random()*6, hitFlash:0, atkCD:0, wave:this.wave });
          }
        }
      }

      // Move enemies toward closest player
      this.enemies.forEach(e => {
        if (e.dead) return;
        let target = null, minD = Infinity;
        this.players.forEach(p => { if (p.alive !== false) {
          const d = Math.sqrt((p.x-e.x)**2 + (p.y-e.y)**2);
          if (d < minD) { minD = d; target = p; }
        }});
        if (!target) return;
        const dx = target.x - e.x, dy = target.y - e.y, dist = Math.sqrt(dx*dx+dy*dy) || 1;
        e.wobble += 0.03;
        if (e.type === 'slime') { e.vx = (dx/dist)*e.sp+Math.sin(e.wobble)*0.2; e.vy = (dy/dist)*e.sp+Math.cos(e.wobble)*0.2; }
        else if (e.type === 'bat') { e.vx = (dx/dist)*e.sp+Math.sin(e.wobble)*0.5; e.vy = (dy/dist)*e.sp+Math.sin(e.wobble*5)*0.1; }
        else if (e.type === 'skeleton') { e.vx = (dx/dist)*e.sp*0.7; e.vy = (dy/dist)*e.sp*0.7; e.atkCD = (e.atkCD||0)-1; if(e.atkCD<0)e.atkCD=0; }
        else if (e.type === 'ghost') { e.vx = (dx/dist)*e.sp+Math.sin(e.wobble*0.5)*0.8; e.vy = (dy/dist)*e.sp+Math.cos(e.wobble*0.7)*0.8; }
        else if (e.type === 'boss') { const a=Math.atan2(dy,dx); e.vx=Math.cos(a-0.5)*e.sp; e.vy=Math.sin(a-0.5)*e.sp; e.atkCD = (e.atkCD||0)+1; }
        e.x += e.vx; e.y += e.vy;
        // Bounds
        if (e.type === 'boss' || e.type === 'bat') {
          if (e.x < -60) e.x = 1020; if (e.x > 1020) e.x = -60;
          if (e.y < -60) e.y = 700; if (e.y > 700) e.y = -60;
        }
        // Enemy-player collision
        this.players.forEach(p => {
          if (p.alive === false || p.invincible > 0) return;
          const d = Math.sqrt((p.x-e.x)**2+(p.y-e.y)**2);
          const pr = 14, er = e.r || 18;
          if (d < pr + er) {
            p.hp -= e.dmg || 10;
            p.invincible = 30;
            if (p.hp <= 0) { p.hp = 0; p.alive = false; }
          }
        });
      });
      this.enemies = this.enemies.filter(e => !e.dead);
    }

    // === Check win/lose conditions ===
    if (this.mode === 'pvp') {
      // Check if only one player is alive
      const alive = [];
      this.players.forEach((p, id) => { if (p.alive !== false) alive.push(id); });
      if (alive.length <= 1 && this.players.size > 1 && this.tick > 60) {
        this.state = 'ended';
        const winner = alive.length === 1 ? alive[0] : null;
        this.broadcast({ type: 'game_end', reason: 'pvp_winner', winner });
      }
    } else if (this.mode === 'coop') {
      const alive = [];
      this.players.forEach((p, id) => { if (p.alive !== false) alive.push(id); });
      if (alive.length === 0) {
        this.state = 'ended';
        this.broadcast({ type: 'game_end', reason: 'all_dead', wave: this.wave });
      }
    }

    // Broadcast state
    this.broadcast(this.getState());
  }

  handleInput(ws, data) {
    const player = this.players.get(clients.get(ws).id);
    if (!player) return;

    if (data.x !== undefined) { player.x = data.x; player.y = data.y; }
    if (data.angle !== undefined) { player.angle = data.angle; }

    // Handle projectiles (co-op: client tells server it shot)
    if (data.shoot && this.mode === 'coop') {
      // Server validates rate
      const now = Date.now();
      if (!player._lastShot || now - player._lastShot > 100) {
        player._lastShot = now;
      }
    }

    // Handle bullet hits (co-op)
    if (data.bulletHit && this.mode === 'coop') {
      const enemy = this.enemies.find(e => e.id === data.enemyId);
      if (enemy && !enemy.dead) {
        enemy.hp -= data.damage || 15;
        enemy.hitFlash = 6;
        if (enemy.hp <= 0) {
          enemy.dead = true;
          player.score += enemy.type === 'boss' ? 100 : 15;
          if (enemy.type === 'boss') { this.bossActive = false; this.waveTimer = 60; }
        }
      }
    }

    // Handle damage report (PvP: player hit another player)
    if (data.playerHit && this.mode === 'pvp') {
      const target = this.players.get(data.targetId);
      if (target && target.alive !== false && !(target.invincible > 0)) {
        target.hp -= data.damage || 10;
        target.invincible = 20;
        player.score += 5;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; }
      }
    }
  }
}

// ─── HTTP Static File Server ───
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0].split('#')[0];

  // API: room list
  if (url === '/rooms') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    const list = Array.from(rooms.values()).filter(r => r.state === 'waiting').map(r => r.toJSON());
    res.end(JSON.stringify(list));
    return;
  }
  if (url === '/server-info') {
    const os = require('os');
    const nets = Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ port: PORT, ips: nets.map(i => i.address) }));
    return;
  }
  if (url === '/tunnel-status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ url: tunnelUrl || null }));
    return;
  }

  // Resolve file path
  let filePath;
  if (url.startsWith('/diagrams/')) {
    filePath = path.join(DIAGRAMS_DIR, url.slice('/diagrams/'.length));
  } else {
    filePath = path.join(GAME_DIR, url === '/' ? 'index.html' : url);
  }

  // Security: prevent directory traversal
  filePath = path.resolve(filePath);
  const allowed = filePath.startsWith(GAME_DIR) || filePath.startsWith(DIAGRAMS_DIR);
  if (!allowed) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // If file not found, serve index.html (SPA fallback)
      if (url.startsWith('/diagrams/')) { res.writeHead(404); res.end('Not found'); return; }
      fs.readFile(path.join(GAME_DIR, 'index.html'), (_, html) => {
        res.writeHead(html ? 200 : 404, { 'Content-Type': 'text/html' });
        res.end(html || 'Not found');
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ─── WebSocket Server (attached to HTTP server) ───
const wss = new WebSocketServer({ server });
console.log(`[Pixel Wizard Server] Running on http://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
  const clientId = genId();
  const client = { id: clientId, name: `Player${clientId.slice(0,4)}`, ws, roomId: null };
  clients.set(ws, client);

  console.log(`[+] ${client.name} connected (${req.socket.remoteAddress})`);

  ws.send(JSON.stringify({ type: 'connected', id: clientId }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      handleMessage(ws, client, msg);
    } catch (e) { /* ignore bad messages */ }
  });

  ws.on('close', () => {
    handleDisconnect(ws, client);
  });

  ws.on('error', () => {});
});

function handleMessage(ws, client, msg) {
  switch (msg.type) {
    case 'set_name':
      client.name = msg.name.slice(0, 16);
      // Update in room
      if (client.roomId) {
        const room = rooms.get(client.roomId);
        if (room && room.players.has(client.id)) {
          room.players.get(client.id).name = client.name;
          room.broadcast({ type: 'room_update', room: room.toJSON() });
        }
      }
      break;

    case 'create_room': {
      if (client.roomId) return;
      const code = genCode();
      const mode = msg.mode === 'pvp' ? 'pvp' : 'coop';
      const room = new Room(code, mode);
      rooms.set(code, room);
      joinRoom(ws, client, code);
      break;
    }

    case 'join_room': {
      const code = msg.code;
      if (!code || !rooms.has(code)) {
        ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
        return;
      }
      const room = rooms.get(code);
      if (room.state !== 'waiting') {
        ws.send(JSON.stringify({ type: 'error', message: '游戏已开始' }));
        return;
      }
      if (room.players.size >= room.maxPlayers) {
        ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));
        return;
      }
      joinRoom(ws, client, code);
      break;
    }

    case 'leave_room':
      leaveRoom(ws, client);
      break;

    case 'player_ready':
      if (client.roomId) {
        const room = rooms.get(client.roomId);
        if (room && room.players.has(client.id)) {
          room.players.get(client.id).ready = msg.ready !== false;
          room.broadcast({ type: 'room_update', room: room.toJSON() });

          // Auto-start if all ready (co-op only, min 2 players)
          if (room.mode === 'coop' && room.players.size >= 2) {
            const allReady = Array.from(room.players.values()).every(p => p.ready);
            if (allReady) {
              setTimeout(() => {
                if (room.state === 'waiting') room.startGame();
              }, 1000);
            }
          }
        }
      }
      break;

    case 'start_pvp':
      if (client.roomId) {
        const room = rooms.get(client.roomId);
        if (room && room.mode === 'pvp' && room.players.size >= 2 && room.state === 'waiting') {
          room.startGame();
        }
      }
      break;

    case 'input':
      if (client.roomId) {
        const room = rooms.get(client.roomId);
        if (room) room.handleInput(ws, msg.data);
      }
      break;
  }
}

function joinRoom(ws, client, code) {
  const room = rooms.get(code);
  if (!room) return;

  client.roomId = code;
  room.players.set(client.id, {
    ws, id: client.id, name: client.name,
    ready: false, x: 100, y: 100,
    hp: 100, maxHp: 100, mana: 60, maxMana: 60,
    level: 1, score: 0, invincible: 0, angle: 0, alive: true,
  });

  ws.send(JSON.stringify({ type: 'joined', code, mode: room.mode,
    players: room.getPlayerList() }));
  room.broadcast({ type: 'room_update', room: room.toJSON() }, client.id);

  console.log(`  → ${client.name} joined room ${code} (${room.players.size}/${room.maxPlayers})`);
}

function leaveRoom(ws, client) {
  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  if (room) {
    room.players.delete(client.id);
    if (room.players.size === 0) {
      rooms.delete(client.roomId);
      console.log(`  ✕ Room ${client.roomId} deleted`);
    } else {
      room.broadcast({ type: 'room_update', room: room.toJSON() });
      if (room.state === 'playing') {
        room.broadcast({ type: 'player_left', id: client.id });
        // PvP: if only one player remains, they win
        if (room.mode === 'pvp' && room.players.size === 1) {
          const winner = Array.from(room.players.keys())[0];
          room.state = 'ended';
          room.broadcast({ type: 'game_end', reason: 'pvp_winner', winner });
        }
      }
    }
  }
  client.roomId = null;
}

function handleDisconnect(ws, client) {
  console.log(`[-] ${client.name} disconnected`);
  leaveRoom(ws, client);
  clients.delete(ws);
}

// ─── Game Tick Loop ───
setInterval(() => {
  rooms.forEach(room => {
    try { room.update(); } catch(e) { console.error('Room update error:', e.message); }
  });
}, TICK_MS);

server.listen(PORT, () => {
  const os = require('os');
  const nets = Object.values(os.networkInterfaces()).flat().filter(i => i.family==='IPv4'&&!i.internal);
  console.log('[Pixel Wizard Server] Ready!');
  console.log(`  - 本地:   http://localhost:${PORT}`);
  nets.forEach(ip => console.log(`  - 局域网: http://${ip.address}:${PORT}`));
  console.log(`  - 分享这个地址给局域网好友`);

  if (USE_TUNNEL) {
    console.log('[隧道] 正在创建公网隧道...');
    // 方案1: serveo.net (SSH 隧道, 无需装包, 无验证页)
    (function tryServeo() {
      console.log('[隧道] 尝试 serveo.net ...');
      const subdomain = `pw${Math.random().toString(36).slice(2,6)}`;
      const cp = require('child_process');
      const ssh = cp.spawn('ssh', [
        '-o','StrictHostKeyChecking=no',
        '-o','ServerAliveInterval=30',
        '-R',`${subdomain}:80:localhost:${PORT}`,
        'serveo.net'
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      let urlFound = false;
      ssh.stdout.on('data', d => {
        const txt = d.toString();
        console.log('[serveo]', txt.trim());
        if (!urlFound) {
          // 匹配 serveo 提供的转发地址 (格式: https://xxxx-xxxx.serveousercontent.com)
          const m = txt.match(/https:\/\/[\w-]+\.serveousercontent\.com/);
          if (m) {
            urlFound = true;
            tunnelUrl = m[0].trim();
            console.log(`[隧道] ✅ 公网地址: ${tunnelUrl}`);
            const msg = JSON.stringify({ type: 'tunnel_url', url: tunnelUrl });
            clients.forEach((c, ws) => { if (ws.readyState === 1) ws.send(msg); });
          }
        }
      });
      ssh.stderr.on('data', d => {
        const txt = d.toString().trim();
        if (txt) console.log('[serveo]', txt);
        if (!urlFound) {
          const m = txt.match(/https:\/\/\w+-\d+\.serveousercontent\.com/);
          if (m) { urlFound = true; tunnelUrl = m[0].trim();
            console.log(`[隧道] ✅ 公网地址: ${tunnelUrl}`);
            const msg = JSON.stringify({ type: 'tunnel_url', url: tunnelUrl });
            clients.forEach((c, ws) => { if (ws.readyState === 1) ws.send(msg); });
          }
        }
      });
      ssh.on('error', () => { console.log('[隧道] serveo 不可用, 尝试 localtunnel...'); tryLocalTunnel(); });
      ssh.on('exit', code => { if (!urlFound) { console.log('[隧道] serveo 退出(code:'+code+'), 尝试 localtunnel...'); tryLocalTunnel(); }});
    })();

    // 方案2: localtunnel (备用, 有验证页)
    function tryLocalTunnel() {
      console.log('[隧道] 尝试 localtunnel ...');
      try {
        const localtunnel = require('localtunnel');
        localtunnel({ port: PORT, subdomain: `pwizard-${Math.random().toString(36).slice(2,6)}` })
          .then(tunnel => {
            console.log(`[隧道] ✅ 公网地址: ${tunnel.url}`);
            tunnelUrl = tunnel.url;
            const msg = JSON.stringify({ type: 'tunnel_url', url: tunnel.url });
            clients.forEach((c, ws) => { if (ws.readyState === 1) ws.send(msg); });
            tunnel.on('close', () => console.log('[隧道] localtunnel 已关闭'));
          })
          .catch(err => { console.log('[隧道] localtunnel 失败:', err.message); });
      } catch(e) { console.log('[隧道] localtunnel 不可用'); }
    }
  }
});
