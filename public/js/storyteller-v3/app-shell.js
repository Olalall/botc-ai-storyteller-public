import { getState, setState, subscribe, pushJournal } from './state-store.js';
import { commandClient } from './command-client.js';
import { renderGrimoireTable } from './grimoire-table.js';
import { getPrimaryAction, getWorkflowProgress } from './workflow-progress.js';
import { renderSetupIdentityWorkbench } from './workbenches/setup-identity-workbench.js';

const root = document.getElementById('storyteller-v3-root');
let commandInFlight = false;

function render(state) {
  root.innerHTML = `
    <div class="stv3-shell">
      ${renderTopBar(state)}
      <main class="stv3-main">
        ${renderGrimoireTable(state)}
        ${renderSetupIdentityWorkbench(state)}
        ${renderWorkflowRail(state)}
      </main>
    </div>
  `;
}

function renderTopBar(state) {
  const stats = [
    ['房间', state.room?.code || '-'],
    ['密码', state.room?.password || '-'],
    ['连接', connectionLabel(state)],
    ['剧本', state.room?.script || '未选择'],
    ['阶段', state.room?.dayLabel || '开局'],
    ['回执', `${state.receipts?.filter((item) => item.confirmed).length || 0}/${state.players?.length || 0}`]
  ];
  return `
    <header class="stv3-topbar">
      <div class="stv3-brand">
        <div class="stv3-brand-mark">☾</div>
        <div>
          <h1 class="stv3-title">说书人辅助工具 · V3</h1>
          <p class="stv3-subtitle">一个主流程、一个状态来源、一个当前工作台。</p>
        </div>
      </div>
      <div class="stv3-topbar-stats">${stats.map(([label, value]) => `
        <div class="stv3-stat"><span class="stv3-stat-label">${label}</span><span class="stv3-stat-value">${value}</span></div>
      `).join('')}</div>
      <div class="stv3-topbar-actions">
        <button class="stv3-ghost-button" type="button" disabled>公告</button>
        <button class="stv3-ghost-button" type="button" disabled>日记</button>
        <button class="stv3-ghost-button" type="button" disabled>设置</button>
      </div>
      <div class="stv3-room-strip" aria-label="房间连接信息">
        <span>房号：${state.room?.code || '-'}</span>
        <span>密码：${state.room?.password || '-'}</span>
        <span>连接状态：${connectionLabel(state)}</span>
      </div>
    </header>
  `;
}

function connectionLabel(state) {
  if (state.runtime?.commandInFlight) return '处理中';
  if (state.room?.id && state.runtime?.transport === 'websocket') return '真实后端';
  if (state.room?.id) return '已创建';
  return '待创建';
}

function renderWorkflowRail(state) {
  const stages = getWorkflowProgress(state);
  return `
    <aside class="stv3-panel stv3-rail" aria-label="流程轨">
      <header class="stv3-panel-header">
        <div>
          <h2 class="stv3-panel-title">流程阶段</h2>
          <p class="stv3-panel-caption">所有进度只从 WorkflowProgress 读取。</p>
        </div>
      </header>
      <div class="stv3-panel-body stv3-rail-list">
        ${stages.map((stage) => `
          <article class="stv3-rail-item" data-stage="${stage.id}" data-status="${stage.status}">
            <div class="stv3-rail-index">${stage.index}</div>
            <div><div class="stv3-rail-name">${stage.name}</div><div class="stv3-rail-desc">${stage.detail}</div></div>
            <div class="stv3-rail-status">${statusText(stage.status)}</div>
          </article>
        `).join('')}
      </div>
    </aside>
  `;
}

function statusText(status) {
  return ({ locked: '未解锁', available: '可进入', active: '当前', waiting: '等待中', complete: '已完成', blocked: '阻塞' })[status] || status;
}

async function runCommand(command) {
  if (commandInFlight) return;
  const state = getState();
  const scriptInput = document.querySelector('[data-stv3-input="script"]');
  const args = command === 'selectScript' ? [scriptInput?.value || state.room?.script] : [];
  const handler = commandClient[command];
  if (!handler) return;

  commandInFlight = true;
  setState((draft) => {
    draft.runtime = { ...(draft.runtime || {}), commandInFlight: command };
    draft.setup.feedback = { tone: 'neutral', message: '正在处理，请不要重复点击。' };
    return draft;
  });

  try {
    const latestState = getState();
    const result = await handler(latestState, ...args);
    if (!result.ok) {
      setState((draft) => {
        draft.runtime = { ...(draft.runtime || {}), commandInFlight: null };
        draft.setup.feedback = { tone: 'error', message: result.message || '操作失败。' };
        return draft;
      });
      return;
    }
    setState((draft) => {
      result.apply?.(draft);
      draft.runtime = { ...(draft.runtime || {}), commandInFlight: null };
      return draft;
    });
    pushJournal(result.message);
  } finally {
    commandInFlight = false;
  }
}

root.addEventListener('click', (event) => {
  const commandButton = event.target.closest('[data-stv3-command]');
  if (!commandButton || commandButton.disabled || commandInFlight) return;
  runCommand(commandButton.dataset.stv3Command);
});

subscribe(render);
window.__storytellerV3 = { getState, getPrimaryAction };
