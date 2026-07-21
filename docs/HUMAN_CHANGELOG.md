# Human Changelog

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