# BOTC AI Storyteller Assistant

> "让每一位说书人都能轻松开局，让每一局血染都充满乐趣。"

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#)
[![Status](https://img.shields.io/badge/Status-Beta-orange.svg)](#)

**Blood on the Clocktower（非官方）说书人辅助工具**

---

## 这是什么？

一个帮助说书人管理《血染钟楼》游戏的浏览器工具。

- 在本地或局域网内快速开局
- 管理玩家座位、夜晚顺序、提名投票
- AI 辅助生成复杂角色的行动候选（说书人确认后生效）
- 玩家在手机上查看自己的身份和公开信息

**不是**第二套魔典，也不是自动规则引擎 —— 所有游戏决策都经过说书人确认。

> Blood on the Clocktower 是 Steven Medway 和 The Pandemonium Institute 的商标。本工具为粉丝自制，不属于官方项目。

---

## 为什么做这个？

第一次玩血染钟楼是 2024 年初，立刻被这个游戏的魅力吸引了 —— 推理、社交、表演、博弈，每一局都是独一无二的故事。

但每次开局都很头疼：
- 魔典忘带了怎么查夜晚顺序？
- 7 人局怎么配板？
- 复杂角色的候选目标总是搞混...

作为一个开发者，与其每次手忙脚乱，不如写个工具帮自己。于是有了这个项目。

### 迭代历程

| 版本 | 时间 | 内容 |
|------|------|------|
| v0.1 | 2024.3 | 最早的原型，纯前端 HTML |
| v1.0 | 2024.6 | 添加 WebSocket 多人同步 |
| v2.0 | 2024.9 | 重构前后端，加入 AI 候选 |
| v3.0 | 2025.2 | 完全重写 UI，魔典风格 |
| v4.0 | 2025.8 | 规范化数据，脚本支持 |
| v5.0 | 2026.1 | AI 自动化增强，稳定版 |

> 如果你在 GitHub 上找到早期版本，可能会困惑 —— 没错，每次都是推倒重来。代码质量不够好，但功能一直在进步。

---

## 功能特点

| 功能 | 说明 |
|------|------|
| **说书人端** | 魔典风格界面、夜晚流程管理、提名投票、玩家状态面板 |
| **玩家端** | 手机/浏览器查看身份、私信系统、公开信息同步 |
| **AI 辅助** | 复杂角色目标候选，说书人确认后生效 |
| **脚本支持** | Trouble Brewing、Bad Moon Rising、Sects & Violets、Catfishing |
| **本地运行** | 无需云服务器，局域网即可开玩 |
| **数据溯源** | 官方角色数据、社区脚本标注作者来源 |

---

## 快速开始

### 方式一：命令行

```bash
# 克隆项目
git clone https://github.com/Olalall/botc-ai-storyteller-public.git
cd botc-ai-storyteller-public

# 安装依赖
npm install

# 启动
npm start
```

然后打开浏览器：

| 页面 | 地址 |
|------|------|
| 说书人端 | http://127.0.0.1:3000/storyteller-v2.html |
| 玩家端 | http://127.0.0.1:3000/player-v2.html |

同一局域网的手机或平板访问 `http://<电脑IP>:3000/player-v2.html`

### 方式二：Docker

```bash
docker-compose up -d
```

### 方式三：下载 Release

在 [Releases](https://github.com/Olalall/botc-ai-storyteller-public/releases) 页面下载打包好的版本，解压后运行即可。

---

## 项目结构

```
├── server.js              # 服务器（Express + WebSocket）
├── public/
│   ├── storyteller-v2.html # 说书人界面
│   ├── player-v2.html      # 玩家界面
│   ├── css/                # 样式
│   ├── js/                 # 前端逻辑
│   └── clocktower-assets/  # 角色图标、背景等素材
├── modules/
│   ├── mvp/                # 核心游戏逻辑
│   └── imported-scripts/   # 社区脚本工具
└── data/
    └── runtime/
        ├── official/       # 官方角色和夜序数据
        └── scripts/        # 剧本配置
```

---

## 如果对你有帮助

⭐ 如果这个项目对你有帮助，请给我一个 Star！

这对我来说是很大的鼓励，也是让更多人看到这个项目的最好方式。

---

## 一起完善

这个项目还有很多可以改进的地方：

- [ ] 更完善的 AI 提示词
- [ ] 更多社区脚本支持
- [ ] 更好的移动端体验
- [ ] 中文本地化文档
- [ ] 教程视频

如果你也想参与开发，欢迎 Fork 并提交 PR！

```bash
# Fork 后
git clone https://github.com/YOUR_USERNAME/botc-ai-storyteller-public.git
cd botc-ai-storyteller-public
npm install
npm start  # 开始开发
```

参见 [CONTRIBUTING.md](CONTRIBUTING.md) 了解更多。

---

## 致谢

### 开源项目参考

- **[bra1n/townsquare](https://github.com/bra1n/townsquare)** — 最早的血染在线工具，启发了我的设计思路
- **[bjageman/tiny-grimoire](https://github.com/bjageman/tiny-grimoire)** — 简洁的实现方式值得学习

### 数据来源

- **官方角色数据** — 来自 `release.botc.app`
- **Catfishing 剧本** — 社区剧本，作者 [Emily](https://www.botcscripts.com/script/3/11.1.1/download)

### 感谢

- 感谢和我一起开局的玩家们 —— 没有你们的测试，就没有这个工具
- 感谢血染钟楼社区的每一位成员 —— 这个游戏因你们而精彩
- 感谢 The Pandemonium Institute 创造了这么好玩的游戏

---

## License

MIT License，仅覆盖本项目代码。

**不涵盖** Blood on the Clocktower 的角色、剧本、名称、规则文本、美术等知识产权。

详见 [LICENSE](LICENSE)。

---

<div align="center">

**让更多人一起来玩血染钟楼！**

Blood on the Clocktower is a trademark of Steven Medway and The Pandemonium Institute.

</div>
