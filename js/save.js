// ═══ Save/Load System ═══
const Save = (() => {
  const PREFIX = 'pw_';

  function k(name) { return PREFIX + name; }

  return {
    save(data) {
      try {
        Object.entries(data).forEach(([key, val]) => {
          localStorage.setItem(k(key), JSON.stringify(val));
        });
        return true;
      } catch (e) {
        console.warn('[Save] Failed:', e.message);
        return false;
      }
    },

    load(key, fallback = null) {
      try {
        const raw = localStorage.getItem(k(key));
        return raw !== null ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },

    getHighScore() {
      return Save.load('highScore', 0);
    },

    setHighScore(score) {
      if (score > Save.getHighScore()) {
        Save.save({ highScore: score });
        return true;
      }
      return false;
    },

    getSettings() {
      return Save.load('settings', { sfx: true, volume: 0.1, quality: 'high' });
    },

    saveSettings(settings) {
      Save.save({ settings });
    },

    getProgress() {
      return Save.load('progress', { maxWave: 0, totalKills: 0, totalScore: 0, gamesPlayed: 0 });
    },

    saveProgress(progress) {
      const current = Save.getProgress();
      Save.save({
        progress: {
          maxWave: Math.max(current.maxWave, progress.maxWave || 0),
          totalKills: current.totalKills + (progress.addKills || 0),
          totalScore: current.totalScore + (progress.addScore || 0),
          gamesPlayed: current.gamesPlayed + (progress.addGame ? 1 : 0),
        }
      });
    },

    getQuests() {
      return Save.load('quests', null);
    },

    saveQuests(quests) {
      Save.save({ quests });
    },

    resetAll() {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(PREFIX)) localStorage.removeItem(key);
      });
    },
  };
})();
