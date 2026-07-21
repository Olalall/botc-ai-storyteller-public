# Human Changelog

## 2026-07-21 — Complete core-function screenshots and GIF

### 大白话总结

这次把“项目看起来只有几张截图”的问题补上了：现在 README 和 `docs/SCREENSHOTS.md` 展示从说书人开房、玩家加入、配板发身份、玩家收到身份、夜晚流程、白天投票，到角色库、私信/手动处理、历史记录、复盘和 AI 边界的完整核心演示，并额外加了一个 GIF 总览。

### 用户现在能看到什么变化

- GitHub README 里先显示一个核心流程 GIF，再显示完整截图矩阵。
- 玩家端不再只展示“加入入口”，现在也展示选座、等待房间、收到身份后的手机界面。
- 说书人端新增主菜单、切换剧本、私信/信息面板、手动工具、历史日志、游戏复盘等截图。
- `docs/SCREENSHOTS.md` 变成截图说明书：每张图对应哪个核心功能，一眼能看懂项目完整度。

### Before / After

| Before | After |
| --- | --- |
| README 主要展示 8 张左右核心截图 | README 展示 GIF + 17 个核心功能截图入口 |
| 玩家端只有加入页面 | 玩家端覆盖选座、等待、收到身份 |
| 说书人端缺少菜单、手动工具、历史、复盘展示 | 补齐主菜单、剧本切换、私信、手动处理、历史日志、复盘 |
| 截图说明较散 | `docs/SCREENSHOTS.md` 有覆盖表和逐张说明 |

### 自行验证步骤

1. 打开 GitHub README，确认能看到 `demo-core-flow.gif` 和完整截图矩阵。
2. 打开 `docs/SCREENSHOTS.md`，按覆盖表检查每张截图对应的核心功能。
3. 本地运行 `npm run verify:public-package`，确认公开包仍可启动并输出 `PUBLIC_PREFLIGHT_GO`。

### 风险和注意

- GIF 是由静态截图合成的轻量演示，不代表真实录像；真实对局验收仍需要浏览器 smoke 或线下测试。
- 这些截图展示的是公开包的核心流程，不等于承诺复杂角色都由系统自动裁决；AI 和规则逻辑仍保持 draft-only / storyteller-confirmed 边界。
## 2026-07-21 — Public README, screenshots, and IP-risk cleanup

### 大白话总结

这次把公开仓库从“能运行的源码包”整理成更像成熟开源项目的展示页：首屏有说明，README 有多张功能截图，角色图标改成安装时下载，不再把图标 PNG 直接提交到仓库。

### 用户现在能看到什么变化

- GitHub 首页不再只是一张入口截图，而是展示欢迎页、房间座位、配板发身份、发送身份确认、夜晚流程、白天投票、角色库、AI 边界和玩家手机端。
- 欢迎页文案改成“非官方说书人辅助工具”，不再写“官方魔典”。
- 首屏截图不再出现 The Pandemonium Institute / 集石相关 Logo。
- README 明确说明项目非官方、免费、fan-made，MIT 只覆盖本项目代码和文档。
- 角色图标通过 `npm run assets:icons` 下载到本地 gitignored 缓存。

### Before / After

| Before | After |
| --- | --- |
| README 主要展示入口页，功能截图少 | README 展示大部分核心流程截图 |
| 封面截图底部出现 PI / 集石 Logo | 封面截图已去掉这些 Logo |
| 欢迎页写“官方魔典” | 欢迎页写“非官方说书人辅助工具” |
| 角色 PNG 直接在仓库里 | 角色 PNG 不进仓库，安装/手动下载 |
| 第三方 IP 边界分散在 README | 新增 `docs/THIRD_PARTY_NOTICES.md` 单独说明 |

### 风险和注意

- 自动下载图标依赖 GitHub 网络；失败时需要手动运行 `npm run assets:icons`。
- 当前玩家端截图主要展示加入房间入口，后续可以补“已收到身份”的手机截图。
- 这不是法律意见，只是按主流非官方开源工具做法降低误导和授权混淆。

### 自行验证步骤

1. 打开 GitHub README，确认首屏是“非官方说书人辅助工具”，且不出现 PI / 集石 Logo。
2. 本地运行 `npm install` 或 `npm run assets:icons`，确认 `public/clocktower-assets/role_icon/` 生成图标。
3. 运行 `npm run verify:public-package`，确认输出 `PUBLIC_PREFLIGHT_GO`。