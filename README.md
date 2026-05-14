# Pixel Wizard RPG - 像素巫师水晶 Quest

多人联机像素风格巫师游戏，支持单人模式、合作模式(PvE)和对战模式(PvP)。

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务器（局域网）
npm start

# 启动服务器（公网隧道）
npm run start:public
```

启动后浏览器打开 `http://localhost:3000` 即可游玩。

## 操作方式

| 操作 | 键盘 | 触屏 |
|------|------|------|
| 移动 | WASD / 方向键 | 左侧摇杆 |
| 射击 | 空格 / Z / J | 右侧按钮 |
| 暂停 | P | - |
| 静音 | M | - |

## 游戏模式

- **单人模式** — 独自挑战无限波次敌人，升级、完成任务
- **合作模式(Co-op)** — 2-4 人联机合作打怪
- **对战模式(PvP)** — 1v1 联机对决

## 联机方式

1. **局域网**: 启动服务器后，同一局域网的玩家输入 `IP:3000`
2. **公网**: `npm run start:public` 自动创建隧道，分享公网地址给外网好友
3. **自定义服务器**: 在联机大厅点击服务器地址可修改

## 项目结构

```
Pixel_Wizard_Game/
├── server.js          # Node.js 游戏服务器（HTTP + WebSocket）
├── index.html         # 入口页面
├── js/
│   ├── config.js      # 游戏配置
│   ├── game.js        # 主游戏逻辑
│   ├── renderer.js    # Canvas 渲染器
│   ├── entities.js    # 实体类（敌人、子弹、道具）
│   ├── input.js       # 输入系统（键盘、鼠标、触屏）
│   ├── network.js     # WebSocket 网络系统
│   ├── audio.js       # Web Audio API 音效
│   ├── save.js        # localStorage 存档系统
│   └── quest.js       # 任务系统
└── package.json
```

## 技术栈

- **前端**: 原生 Canvas 2D + WebSocket
- **后端**: Node.js HTTP + ws (WebSocket)
- **音效**: Web Audio API 合成（无需外部文件）
- **隧道**: serveo.net / localtunnel / ngrok
