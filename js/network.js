// ═══ Multiplayer Network System ═══
const Network = (() => {
  'use strict';

  let _serverAddr = Save.load('serverAddr', 'localhost:3000');
  let _lobbyTab = 'create';
  let _joinCode = '';
  let _playerName = '';
  let _logMsgs = [];

  const net = {
    ws: null,
    connected: false,
    room: null,
    players: {},
    mode: '',
    id: '',
  };

  let _tunnelUrl = null;

  function getWsUrl() {
    if (location.protocol.startsWith('http')) {
      return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    }
    return `ws://${_serverAddr}`;
  }

  function connect() {
    if (net.ws && net.ws.readyState === 1) return;
    net.connected = false;
    try {
      net.ws = new WebSocket(getWsUrl());
      net.ws.onopen = () => { net.connected = true; log('已连接到服务器', '#44cc88'); };
      net.ws.onclose = () => {
        net.connected = false;
        net.room = null;
        log('与服务器断开', '#ff6644');
        if (Game.multi) {
          Game.multi = null;
          if (Game.state === 'playing' || Game.state === 'room') Game.switchState('title');
        }
      };
      net.ws.onerror = () => { net.connected = false; };
      net.ws.onmessage = e => {
        try { handle(JSON.parse(e.data)); } catch (ex) { /* ignore parse errors */ }
      };
    } catch (e) {
      log('连接失败: ' + e.message, '#ff4444');
    }
  }

  function send(msg) {
    try {
      if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(msg));
    } catch (e) { /* ignore */ }
  }

  function handle(msg) {
    switch (msg.type) {
      case 'connected':
        net.id = msg.id;
        break;
      case 'error':
        log(msg.message, '#ff4444');
        break;
      case 'joined':
        net.room = msg.code;
        net.mode = msg.mode;
        Game.multi = { ready: false, started: false, enemies: [], items: [], otherPlayers: {} };
        Game.switchState('room');
        break;
      case 'room_update':
        if (Game.state === 'lobby' || Game.state === 'room') {
          net.players = {};
          msg.room.players.forEach(p => { net.players[p.id] = p; });
        }
        break;
      case 'game_start':
        if (!Game.multi) break;
        Game.multi.started = true;
        Game.multi.ready = false;
        Game.switchState('playing');
        Game.resetMultiplayer();
        log('游戏开始!', '#ffcc00');
        Audio.SFX.wave();
        break;
      case 'wave_start':
        Game.wave = msg.wave;
        Game.bossW = msg.bossWave;
        Renderer.addText(CONFIG.W / 2, CONFIG.H / 2 - 20, '⚔ WAVE ' + Game.wave + ' ⚔', '#ffcc00');
        if (Game.bossW) Renderer.addText(CONFIG.W / 2, CONFIG.H / 2 + 20, '⚠ BOSS ⚠', '#ff4466');
        Audio.SFX.wave();
        Game.shake.amt = 8;
        break;
      case 'game_state':
        if (!Game.multi || !Game.multi.started) break;
        if (msg.players) {
          if (!Game.multi.otherPlayers) Game.multi.otherPlayers = {};
          Object.entries(msg.players).forEach(([id, sp]) => {
            const old = Game.multi.otherPlayers[id];
            if (old && old.x !== undefined) {
              sp._sx = old._sx || old.x;
              sp._sy = old._sy || old.y;
              sp._lerp = 0;
            } else {
              sp._sx = sp.x;
              sp._sy = sp.y;
              sp._lerp = 1;
            }
            Game.multi.otherPlayers[id] = sp;
          });
          Object.keys(Game.multi.otherPlayers).forEach(id => {
            if (!msg.players[id]) delete Game.multi.otherPlayers[id];
          });
          if (msg.players[net.id]) {
            const sp = msg.players[net.id];
            Game.player.hp = sp.hp;
            Game.player.mana = sp.mana;
            Game.player.level = sp.level;
            if (sp.score !== undefined && sp.score > Game.score) Game.score = sp.score;
          }
        }
        if (net.mode === 'coop' && msg.enemies) {
          Game.multi.enemies = msg.enemies;
          Game.wave = msg.wave || Game.wave;
        }
        if (net.mode === 'coop' && msg.items) Game.multi.items = msg.items;
        break;
      case 'game_end':
        if (Game.multi) Game.multi.started = false;
        if (msg.reason === 'all_dead') {
          Game.switchState('gameover');
          Audio.SFX.gameOver();
          Save.setHighScore(Game.score);
        } else if (msg.reason === 'pvp_winner') {
          Game.switchState('gameover');
          if (msg.winner === net.id) log('🏆 你赢了!', '#ffcc00');
          else log('你输了...', '#ff6644');
          Audio.SFX.gameOver();
        }
        break;
      case 'player_left':
        if (Game.multi) delete Game.multi.otherPlayers[msg.id];
        break;
      case 'tunnel_url':
        _tunnelUrl = msg.url;
        break;
    }
  }

  function handleClick(mx, my) {
    if (mx !== null && my !== null) {
      // Tab switching
      if (my >= 165 && my <= 200) { _lobbyTab = mx < CONFIG.W / 2 ? 'create' : 'join'; return; }
      // Name input
      if (my >= 128 && my <= 156 && mx >= 60 && mx <= 260) {
        const n = prompt('输入你的名字(最多16字):', _playerName || '');
        if (n && n.trim()) _playerName = n.trim().slice(0, 16);
        return;
      }
      // Server address
      if (my >= CONFIG.H - 50 && my <= CONFIG.H - 10 && mx >= CONFIG.W / 2 - 150 && mx <= CONFIG.W / 2 + 150) {
        const a = prompt('输入服务器地址 (IP:端口):', _serverAddr);
        if (a && a.trim()) {
          _serverAddr = a.trim();
          Save.save({ serverAddr: _serverAddr });
          net.connected = false;
          if (net.ws) try { net.ws.close(); } catch (e) { /* ignore */ }
          net.ws = null;
        }
        return;
      }
      if (!net.connected) { log('正在连接服务器...', '#888'); connect(); return; }
      // Create mode select
      if (_lobbyTab === 'create' && my >= 240 && my <= 270 && mx >= 60 && mx <= 200) { net.mode = 'coop'; return; }
      if (_lobbyTab === 'create' && my >= 240 && my <= 270 && mx >= 220 && mx <= 360) { net.mode = 'pvp'; return; }
      // Create room button
      if (_lobbyTab === 'create' && my >= 295 && my <= 325 && mx >= 60 && mx <= 220) {
        send({ type: 'set_name', name: _playerName || ('玩家' + net.id.slice(0, 4)) });
        send({ type: 'create_room', mode: net.mode || 'coop' });
        return;
      }
      // Join room button
      if (_lobbyTab === 'join' && my >= 295 && my <= 325 && mx >= 60 && mx <= 220 && _joinCode.length >= 4) {
        send({ type: 'set_name', name: _playerName || ('玩家' + net.id.slice(0, 4)) });
        send({ type: 'join_room', code: _joinCode });
        return;
      }
    } else {
      // Keyboard Enter activation
      if (!net.connected) { connect(); return; }
      if (_lobbyTab === 'create') {
        send({ type: 'set_name', name: _playerName || ('玩家' + net.id.slice(0, 4)) });
        send({ type: 'create_room', mode: net.mode || 'coop' });
      } else if (_lobbyTab === 'join' && _joinCode.length >= 4) {
        send({ type: 'set_name', name: _playerName || ('玩家' + net.id.slice(0, 4)) });
        send({ type: 'join_room', code: _joinCode });
      }
    }
  }

  function toggleReady() {
    if (!net.room) return;
    Game.multi.ready = !Game.multi.ready;
    send({ type: 'player_ready', ready: Game.multi.ready });
    if (net.mode === 'pvp' && Game.multi.ready) send({ type: 'start_pvp' });
  }

  function leaveRoom() {
    net.room = null;
    net.players = {};
    net.mode = '';
    Game.multi = null;
    send({ type: 'leave_room' });
  }

  function disconnect() {
    leaveRoom();
    if (net.ws) { try { net.ws.close(); } catch (e) { /* ignore */ } net.ws = null; }
    net.connected = false;
  }

  function sendInput(data) {
    send({ type: 'input', data });
  }

  function log(text, color = '#fff') {
    _logMsgs.push({ text, color, life: 180 });
    if (_logMsgs.length > 5) _logMsgs.shift();
  }

  return {
    connect,
    send,
    handleClick,
    toggleReady,
    leaveRoom,
    disconnect,
    sendInput,
    log,
    get net() { return net; },
    get tunnelUrl() { return _tunnelUrl; },
    get lobbyTab() { return _lobbyTab; },
    get playerName() { return _playerName; },
    get joinCode() { return _joinCode; },
    set joinCode(v) { _joinCode = v; },
    get logMsgs() { return _logMsgs; },
    get serverAddr() { return _serverAddr; },
  };
})();
