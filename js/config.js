// ═══ Game Configuration ═══
const CONFIG = {
  W: 960,
  H: 640,
  TICK_RATE: 20,
  PLAYER_BASE_SPEED: 3.2,
  PLAYER_RADIUS: 14,
  BULLET_SPEED: 10,
  BULLET_DAMAGE: 30,
  BULLET_LIFE: 60,
  SHOOT_COOLDOWN: 180,
  MANA_COST: 1,
  MANA_REGEN: 0.10,
  INVINCIBLE_FRAMES: 25,
  COMBO_TIMEOUT: 120,
  WAVE_BOSS_INTERVAL: 5,
  ENEMIES_PER_WAVE_BASE: 6,
  ENEMIES_PER_WAVE_GROWTH: 2.5,
  SPAWN_INTERVAL_BASE: 40,
  SPAWN_INTERVAL_MIN: 10,
  WAVE_DELAY: 60,
  BOSS_WAVE_DELAY: 120,

  // Level table: { hp, mp, regen, speed }
  LEVEL_TABLE: [
    { hp: 100, mp: 60,  reg: 0.06, sp: 3.2 },
    { hp: 115, mp: 66,  reg: 0.07, sp: 3.2 },
    { hp: 130, mp: 72,  reg: 0.08, sp: 3.3 },
    { hp: 150, mp: 78,  reg: 0.09, sp: 3.3 },
    { hp: 170, mp: 85,  reg: 0.10, sp: 3.4 },
    { hp: 195, mp: 92,  reg: 0.11, sp: 3.4 },
    { hp: 220, mp: 100, reg: 0.12, sp: 3.5 },
    { hp: 250, mp: 108, reg: 0.13, sp: 3.5 },
    { hp: 280, mp: 116, reg: 0.14, sp: 3.6 },
    { hp: 320, mp: 125, reg: 0.15, sp: 3.6 },
  ],

  ENEMY_TYPES: {
    slime:    { r: 22, hp: 15, sp: 0.8, atk: 8,  sc: 10, c1: '#44cc66', c2: '#66ee88' },
    bat:      { r: 18, hp: 10, sp: 1.8, atk: 10, sc: 15, c1: '#8855aa', c2: '#aa77cc' },
    skeleton: { r: 24, hp: 22, sp: 0.7, atk: 12, sc: 20, c1: '#ccbbaa', c2: '#eeddcc' },
    ghost:    { r: 20, hp: 14, sp: 1.2, atk: 10, sc: 18, c1: '#9977dd', c2: '#bb99ff' },
    boss:     { r: 40, hp: 150,sp: 0.5, atk: 18, sc: 100,c1: '#aa2244', c2: '#dd4466' },
  },

  ITEM_DROP_RATES: {
    crystal: 0.25,
    potion: 0.04,
    powerup: 0.015,
  },

  PLAYER_COLORS: ['#4466aa', '#cc4444', '#44aa66', '#aa44cc', '#cc8844', '#4488cc'],

  ASSET_PATHS: {
    bg_village:  'diagrams/bg_village.jpg',
    bg_dungeon:  'diagrams/bg_dungeon.jpg',
    bg_battle:   'diagrams/bg_battle.jpg',
    bg_magic:    'diagrams/bg_magic.jpg',
    wizard:      'diagrams/gba_wizard_20260514_204835.jpg',
    enemy_slime:     'diagrams/game_enemy_slime.jpg',
    enemy_bat:       'diagrams/game_enemy_bat.jpg',
    enemy_skeleton:  'diagrams/game_enemy_skeleton.jpg',
    enemy_ghost:     'diagrams/game_enemy_ghost.jpg',
    enemy_boss:      'diagrams/game_enemy_boss.jpg',
  },
};
