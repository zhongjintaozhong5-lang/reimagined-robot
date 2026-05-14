// ═══ Quest System ═══
const Quest = (() => {
  const QUEST_POOL = [
    { id: 'kill_slime',   title: '粘液猎人',   desc: '击败 20 只史莱姆',       icon: '🟢', check: s => s.killsByType.slime >= 20,      progress: s => Math.min(100, Math.floor(s.killsByType.slime / 20 * 100)), reward: { score: 200, xpBonus: 50 } },
    { id: 'kill_bat',     title: '蝙蝠克星',   desc: '击败 15 只蝙蝠',         icon: '🦇', check: s => s.killsByType.bat >= 15,       progress: s => Math.min(100, Math.floor(s.killsByType.bat / 15 * 100)), reward: { score: 200, xpBonus: 50 } },
    { id: 'kill_skeleton',title: '骷髅终结者', desc: '击败 10 只骷髅',         icon: '💀', check: s => s.killsByType.skeleton >= 10,  progress: s => Math.min(100, Math.floor(s.killsByType.skeleton / 10 * 100)), reward: { score: 300, xpBonus: 80 } },
    { id: 'kill_ghost',   title: '幽灵驱逐者', desc: '击败 10 只幽灵',         icon: '👻', check: s => s.killsByType.ghost >= 10,     progress: s => Math.min(100, Math.floor(s.killsByType.ghost / 10 * 100)), reward: { score: 300, xpBonus: 80 } },
    { id: 'kill_boss',    title: 'Boss 猎手',  desc: '击败 3 个 Boss',         icon: '👑', check: s => s.killsByType.boss >= 3,       progress: s => Math.min(100, Math.floor(s.killsByType.boss / 3 * 100)), reward: { score: 1000, xpBonus: 200 } },
    { id: 'wave_10',      title: '身经百战',   desc: '到达第 10 波',           icon: '⚔',  check: s => s.maxWave >= 10,               progress: s => Math.min(100, Math.floor(s.maxWave / 10 * 100)), reward: { score: 500, xpBonus: 150 } },
    { id: 'wave_20',      title: '精英战士',   desc: '到达第 20 波',           icon: '⚡',  check: s => s.maxWave >= 20,               progress: s => Math.min(100, Math.floor(s.maxWave / 20 * 100)), reward: { score: 1500, xpBonus: 500 } },
    { id: 'collect_crystal', title: '水晶收集者', desc: '收集 50 个水晶',      icon: '💎', check: s => s.crystalsCollected >= 50,     progress: s => Math.min(100, Math.floor(s.crystalsCollected / 50 * 100)), reward: { score: 400, xpBonus: 100 } },
    { id: 'combo_50',     title: '连击大师',   desc: '达成 50 连击',           icon: '🔥', check: s => s.maxCombo >= 50,               progress: s => Math.min(100, Math.floor(s.maxCombo / 50 * 100)), reward: { score: 800, xpBonus: 200 } },
    { id: 'score_5000',   title: '财富积累',   desc: '单局得分 5000',           icon: '💰', check: s => s.highScore >= 5000,            progress: s => Math.min(100, Math.floor(s.highScore / 5000 * 100)), reward: { score: 1000, xpBonus: 300 } },
    { id: 'score_10000',  title: '百万富翁',   desc: '单局得分 10000',          icon: '🏆', check: s => s.highScore >= 10000,           progress: s => Math.min(100, Math.floor(s.highScore / 10000 * 100)), reward: { score: 3000, xpBonus: 1000 } },
    { id: 'survive_5min', title: '坚韧不拔',   desc: '存活 5 分钟',            icon: '⏱',  check: s => s.longestGame >= 300,            progress: s => Math.min(100, Math.floor(s.longestGame / 300 * 100)), reward: { score: 600, xpBonus: 150 } },
  ];

  // Session tracking state
  let state = {
    active: [],           // quests the player has active (picked up)
    completed: [],        // quest IDs completed this session
    stats: {              // accumulated session stats
      killsByType: {},
      maxWave: 0,
      highScore: 0,
      crystalsCollected: 0,
      maxCombo: 0,
      longestGame: 0,
    },
    gameStartTime: 0,
    notified: [],
  };

  // Persistent completed quests (account-bound)
  let permCompleted = [];

  // Callback for when a quest is completed
  let _onComplete = null;

  function setOnComplete(cb) {
    _onComplete = cb;
  }

  function init() {
    state.active = [];
    state.completed = [];
    state.notified = [];
    state.stats = {
      killsByType: {},
      maxWave: 0,
      highScore: 0,
      crystalsCollected: 0,
      maxCombo: 0,
      longestGame: 0,
    };

    permCompleted = Save.load('permQuests', []);

    // Assign random active quests (up to 3)
    const available = QUEST_POOL.filter(q => !permCompleted.includes(q.id));
    const shuffled = available.sort(() => Math.random() - 0.5);
    state.active = shuffled.slice(0, 3).map(q => ({ ...q }));
  }

  function startGame() {
    state.gameStartTime = Date.now();
  }

  function recordKill(type) {
    if (!state.stats.killsByType[type]) state.stats.killsByType[type] = 0;
    state.stats.killsByType[type]++;
    checkQuests();
  }

  function recordWave(wave) {
    if (wave > state.stats.maxWave) state.stats.maxWave = wave;
    checkQuests();
  }

  function recordCrystal() {
    state.stats.crystalsCollected++;
    checkQuests();
  }

  function recordCombo(combo) {
    if (combo > state.stats.maxCombo) state.stats.maxCombo = combo;
    checkQuests();
  }

  function endGame(score) {
    if (score > state.stats.highScore) state.stats.highScore = score;
    const elapsed = Math.floor((Date.now() - state.gameStartTime) / 1000);
    if (elapsed > state.stats.longestGame) state.stats.longestGame = elapsed;
    checkQuests();
    Save.saveProgress({
      maxWave: state.stats.maxWave,
      addKills: Object.values(state.stats.killsByType).reduce((a, b) => a + b, 0),
      addScore: score,
      addGame: true,
    });
    // Save permanent completions
    const newPerm = [...new Set([...permCompleted, ...state.completed])];
    Save.save({ permQuests: newPerm });
    permCompleted = newPerm;
  }

  function checkQuests() {
    state.active.forEach(q => {
      if (q.check(state.stats) && !state.completed.includes(q.id) && !state.notified.includes(q.id)) {
        state.notified.push(q.id);
        state.completed.push(q.id);
        // Apply rewards via callback
        if (typeof _onComplete === 'function') {
          _onComplete(q);
        }
        // Queue notification
        setTimeout(() => {
          if (typeof Renderer !== 'undefined') {
            Renderer.addText(CONFIG.W / 2, CONFIG.H / 2 - 40, `✅ 任务完成: ${q.title}!`, '#ffcc00');
            Renderer.addText(CONFIG.W / 2, CONFIG.H / 2 - 15, `+${q.reward.score} 分`, '#44ff44');
          }
          Audio.SFX.questComplete();
        }, 100);
      }
    });
  }

  function getActiveQuests() {
    return state.active;
  }

  function getCompleted() {
    return state.completed;
  }

  function getPermCompleted() {
    return permCompleted;
  }

  function getQuestProgress(q) {
    return q.progress(state.stats);
  }

  function getAllQuests() {
    return QUEST_POOL;
  }

  return {
    init,
    startGame,
    recordKill,
    recordWave,
    recordCrystal,
    recordCombo,
    endGame,
    getActiveQuests,
    getCompleted,
    getPermCompleted,
    getQuestProgress,
    getAllQuests,
    setOnComplete,
    get stats() { return state.stats; },
  };
})();
