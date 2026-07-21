# AI Capabilities / AI 能力说明

## 一句话定位

BOTC AI Storyteller Assistant 的 AI 不是噱头，也不是全自动裁判。它的定位是：

```text
AI Storyteller Co-pilot = 候选审阅 + 风险提示 + 策略模拟 + 草稿文案 + 自动化测试玩家
Storyteller = 最终确认 + 现场裁定 + 发送消息 + 写入权威状态
```

## 核心 AI 能力

### 1. AI 审阅夜晚技能结算候选

夜晚阶段会先由规则逻辑整理玩家提交和角色信息，生成候选结果。启用 OpenAI-compatible provider 后，服务端会把脱敏后的候选摘要交给模型审阅，让 AI 输出：

- `copySuggestion`：给说书人看的确认/提示文案草稿。
- `riskSummary`：这条结算可能涉及的规则、信息泄露或人工裁定风险。

AI 输出不会直接发给玩家，也不会直接改状态。它只挂在候选结果上，等待说书人确认、修改或拒绝。

### 2. 风险提示和边缘情况提醒

AI 可以帮助说书人在确认前检查：

- 当前结果是否可能泄露不该泄露的信息。
- 是否需要考虑毒醉、保护、死亡/存活、错误信息等边缘条件。
- 是否应该改为手动裁定，而不是直接接受候选。

这部分能力的价值是减少说书人漏看点，而不是替代说书人判断。

### 3. AI 测试玩家和策略探索

项目包含面向演示、压测和流程验证的 AI 测试玩家能力：

- 自动填充空座位。
- 自动确认身份回执。
- 自动提交夜晚行动。
- 根据阵营、存活、角色能力、历史选择等因素生成目标选择、提名、提名人和投票建议。

这让项目不依赖一桌真人也能跑通演示流程，适合录屏、截图、VPS 验收和回归测试。

### 4. 安全 AI 控制模式

AI 控制模式有明确的安全边界：

- 允许的安全意图：刷新建议、总结说书人状态。
- 拒绝的高风险意图：发身份、确认配板、确认结算、发送私信、确认处决、确认结局、写日志、直接改状态。

这意味着 AI 可以帮你看局面、整理建议，但不能绕过说书人做关键动作。

### 5. 审计和降级

AI 相关结果会记录审计信息：

- provider / model / request id 等 provider metadata。
- 使用的是脱敏候选摘要，原始隐藏状态、玩家 token、服务端密钥不会进入玩家可见输出。
- 如果 provider 未配置、超时、返回非法 JSON 或输出不安全，系统会降级，不阻塞本地对局。

## 配置方式

支持 OpenAI-compatible provider。常见环境变量：

```bash
BOTC_AI_PROVIDER=openai-compatible
BOTC_AI_BASE_URL=https://api.openai.com/v1
BOTC_AI_MODEL=your-model
BOTC_AI_API_KEY=your-key
BOTC_AI_TIMEOUT_MS=12000
BOTC_AI_MAX_TOKENS=220
BOTC_AI_TEMPERATURE=0.2
```

也支持运行时 AI settings endpoint；该接口只暴露脱敏配置，密钥仍留在服务端。

## 对外介绍推荐文案

> AI-assisted storyteller co-pilot for Blood on the Clocktower: reviews rule-generated night results, drafts storyteller-facing risk notes, simulates AI test players, and keeps final authority with the storyteller.

中文：

> 《血染钟楼》AI 说书人副驾驶：AI 审阅夜晚结算候选、生成风险提示和确认草稿、驱动测试玩家跑完整流程，但最终裁定和状态写入始终由说书人确认。

## 不应该这样宣传

不要写成：

- “AI 自动说书人”。
- “AI 自动裁决全部复杂角色”。
- “不需要说书人”。
- “自动替代官方规则/官方 App”。

更准确的说法是：

- “AI co-pilot”。
- “draft-only”。
- “storyteller-confirmed”。
- “suggestion and risk review”。
