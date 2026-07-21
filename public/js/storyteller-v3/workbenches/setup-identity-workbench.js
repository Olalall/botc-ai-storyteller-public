import { getPrimaryAction } from '../workflow-progress.js';

const STEPS = [
  {
    id: 'selectScript',
    label: '选择剧本',
    hint: '先锁定本局使用的剧本；选择卡片本身不发送任何玩家信息。',
    done: '剧本已选择'
  },
  {
    id: 'generateSetup',
    label: '生成配板',
    hint: '生成一套可检查、可调整的身份候选，仍不是最终权威状态。',
    done: '配板候选已生成'
  },
  {
    id: 'confirmSetup',
    label: '确认配板',
    hint: '由说书人确认候选；确认后才进入发送身份。',
    done: '配板已锁定'
  },
  {
    id: 'dealRoles',
    label: '发送身份',
    hint: '把每名玩家自己的身份发到玩家端，并开始收集回执。',
    done: '身份已发送'
  },
  {
    id: 'startFirstNight',
    label: '开始首夜',
    hint: '回执可见后，由说书人决定是否进入第 1 夜。',
    done: '首夜已开始'
  }
];

const SCRIPT_OPTIONS = ['Trouble Brewing', 'Bad Moon Rising', 'Sects & Violets'];

export function renderSetupIdentityWorkbench(state) {
  const action = buildPrimaryActionState(state, getPrimaryAction(state));
  const feedback = state.setup?.feedback || { tone: 'neutral', message: '' };
  return `
    <section class="stv3-panel stv3-workbench" aria-label="开局发身份工作台">
      <header class="stv3-panel-header">
        <div>
          <h2 class="stv3-panel-title">开局发身份工作台</h2>
          <p class="stv3-panel-caption">唯一主流程：选择剧本 → 生成配板 → 确认配板 → 发送身份 → 查看回执 → 开始首夜。</p>
        </div>
        <span class="stv3-pill" data-tone="active">下一步：${escapeHtml(action.label)}</span>
      </header>
      <div class="stv3-panel-body stv3-workbench-body">
        <div class="stv3-setup-grid">
          <div class="stv3-step-card stv3-setup-flow-card">
            <div class="stv3-card-heading">
              <h3>流程向导</h3>
              <span class="stv3-panel-caption">底部只有一个高亮主按钮，避免 V2 的双主流程。</span>
            </div>
            <div class="stv3-step-list">${renderSteps(state, action.id)}</div>
          </div>

          <div class="stv3-form-card">
            <div class="stv3-card-heading">
              <h3>本环节输入</h3>
              <span class="stv3-lock-copy">身份发出后，本局不再切换剧本或重置配板。</span>
            </div>
            ${renderScriptSelect(state)}
            ${renderSetupSummary(state)}
            <div class="stv3-notice">
              玩家会收到：自己的座位、自己的身份和必要私信；不会收到完整魔典、其他玩家身份或配板草稿。
            </div>
          </div>

          <div class="stv3-receipt-card">
            <div class="stv3-card-heading">
              <h3>身份回执</h3>
              <span class="stv3-panel-caption">发身份后留在同一个工作台查看。</span>
            </div>
            ${renderReceipts(state)}
          </div>

          <div class="stv3-receipt-card">
            <div class="stv3-card-heading">
              <h3>操作日记</h3>
              <span class="stv3-panel-caption">关键动作写成人话。</span>
            </div>
            ${renderJournal(state)}
          </div>
        </div>
      </div>
      <footer class="stv3-workbench-footer stv3-setup-footer">
        <div class="stv3-feedback-stack">
          <div class="stv3-feedback" data-tone="${feedback.tone || 'neutral'}">${escapeHtml(feedback.message || '')}</div>
          ${action.disabledReason ? `<div class="stv3-disabled-reason">当前不能执行：${escapeHtml(action.disabledReason)}</div>` : renderPrimaryHelp(state, action)}
        </div>
        <button class="stv3-primary-button" type="button" data-stv3-primary="true" data-stv3-command="${escapeHtml(action.id)}" ${action.disabled ? 'disabled' : ''} title="${escapeHtml(action.disabledReason || action.effect)}">
          ${escapeHtml(action.label)}
        </button>
      </footer>
    </section>
  `;
}

function renderScriptSelect(state) {
  const selected = state.setup?.scriptSelected;
  const selectedScript = state.room?.script || SCRIPT_OPTIONS[0];
  return `
    <div class="stv3-field">
      <label for="stv3-script-select">剧本</label>
      <select id="stv3-script-select" data-stv3-input="script" ${selected ? 'disabled' : ''} aria-describedby="stv3-script-help">
        ${SCRIPT_OPTIONS.map((script) => `<option ${selectedScript === script ? 'selected' : ''}>${escapeHtml(script)}</option>`).join('')}
      </select>
      <div id="stv3-script-help" class="stv3-field-help">
        ${selected ? '已选择剧本；为避免身份和回执串局，本轮不在此处重复切换。' : '先选择剧本，再用底部主按钮推进到生成配板。'}
      </div>
    </div>
  `;
}

function renderSetupSummary(state) {
  const setup = state.setup || {};
  const playerCount = getPlayerCount(state);
  const summaryItems = [
    ['玩家人数', `${playerCount} 人`, playerCount >= 7 ? '可生成配板' : '需要至少 7 名玩家'],
    ['配板候选', setup.setupGenerated ? '已生成' : '未生成', setup.setupGenerated ? '确认前请复核恶魔、爪牙、外来者数量。' : '生成前不会写入权威身份。'],
    ['配板锁定', setup.setupConfirmed ? '已确认' : '未确认', setup.setupConfirmed ? '下一步可发送身份。' : '确认前玩家端不会看到身份。'],
    ['身份发送', setup.rolesDealt ? '已发送' : '未发送', setup.rolesDealt ? '查看下方回执，再决定是否开始首夜。' : '发送后不能重复发送同一轮身份。']
  ];
  return `
    <div class="stv3-setup-status-list" aria-label="开局状态摘要">
      ${summaryItems.map(([label, value, detail]) => `
        <div class="stv3-setup-status-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(detail)}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSteps(state, activeId) {
  return STEPS.map((step, index) => {
    const status = getStepStatus(state, step.id, activeId);
    const reason = getStepReason(state, step.id, status);
    return `
      <div class="stv3-step-row" data-step="${step.id}" data-status="${status}">
        <div class="stv3-step-num">${index + 1}</div>
        <div class="stv3-step-copy">
          <strong>${escapeHtml(step.label)}</strong>
          <div class="stv3-panel-caption">${escapeHtml(status === 'complete' ? step.done : step.hint)}</div>
          ${reason ? `<div class="stv3-step-reason">${escapeHtml(reason)}</div>` : ''}
        </div>
        <span class="stv3-pill" data-tone="${status === 'complete' ? 'success' : status === 'active' ? 'active' : status === 'blocked' ? 'warning' : ''}">${statusLabel(status)}</span>
      </div>
    `;
  }).join('');
}

function getStepStatus(state, id, activeId) {
  const setup = state.setup || {};
  const done = {
    selectScript: setup.scriptSelected,
    generateSetup: setup.setupGenerated,
    confirmSetup: setup.setupConfirmed,
    dealRoles: setup.rolesDealt,
    startFirstNight: setup.firstNightStarted
  };
  if (done[id]) return 'complete';
  if (activeId === id) return getStepReason(state, id) ? 'blocked' : 'active';
  return isStepUnlocked(state, id) ? 'waiting' : 'locked';
}

function isStepUnlocked(state, id) {
  const setup = state.setup || {};
  return {
    selectScript: true,
    generateSetup: Boolean(setup.scriptSelected),
    confirmSetup: Boolean(setup.setupGenerated),
    dealRoles: Boolean(setup.setupConfirmed),
    startFirstNight: Boolean(setup.rolesDealt)
  }[id];
}

function getStepReason(state, id, status = '') {
  const setup = state.setup || {};
  const playerCount = getPlayerCount(state);
  if (status === 'complete') return '';
  if (id === 'selectScript' && setup.scriptSelected) return '剧本已选择，本局不重复选择。';
  if (id === 'generateSetup') {
    if (!setup.scriptSelected) return '请先选择剧本。';
    if (playerCount < 7) return `需要至少 7 名玩家；当前 ${playerCount} 名。`;
    if (setup.setupGenerated) return '配板候选已生成，避免重复覆盖。';
  }
  if (id === 'confirmSetup') {
    if (!setup.setupGenerated) return '请先生成配板候选。';
    if (setup.setupConfirmed) return '配板已确认锁定。';
  }
  if (id === 'dealRoles') {
    if (!setup.setupConfirmed) return '请先确认配板。';
    if (setup.rolesDealt) return '身份已发送，不能重复发送。';
  }
  if (id === 'startFirstNight') {
    if (!setup.rolesDealt) return '请先发送身份并查看回执。';
    if (setup.firstNightStarted) return '首夜已开始。';
  }
  return '';
}

function buildPrimaryActionState(state, action) {
  const disabledReason = getStepReason(state, action.id);
  const pendingCount = getReceiptStats(state).pending.length;
  const effect = {
    selectScript: '锁定当前下拉框里的剧本；不会发送玩家信息。',
    generateSetup: '生成一套候选配板；确认前仍只是候选。',
    confirmSetup: '把当前候选作为本局配板锁定；下一步才能发送身份。',
    dealRoles: '把每名玩家自己的身份发到玩家端，并在本工作台显示回执。',
    startFirstNight: pendingCount > 0
      ? `仍有 ${pendingCount} 名玩家未确认；说书人可决定继续进入首夜。`
      : '回执已齐，可以进入第 1 夜。',
    noop: 'V3.1 到此结束，夜晚裁决在 V3.2。'
  }[action.id] || '执行当前步骤。';
  return {
    ...action,
    disabled: Boolean(action.disabled || disabledReason),
    disabledReason: action.reason || disabledReason || '',
    effect
  };
}

function renderPrimaryHelp(state, action) {
  const stats = getReceiptStats(state);
  if (action.id === 'startFirstNight' && stats.pending.length > 0) {
    return `<div class="stv3-primary-help" data-tone="warning">还有 ${stats.pending.length} 名玩家未确认：${escapeHtml(stats.pending.join('、'))}。规则允许说书人决定继续。</div>`;
  }
  return `<div class="stv3-primary-help">点击后：${escapeHtml(action.effect)}</div>`;
}

function statusLabel(status) {
  return ({ complete: '完成', active: '当前', waiting: '待解锁', locked: '未解锁', blocked: '受阻' })[status] || status;
}

function renderReceipts(state) {
  if (!state.setup?.rolesDealt) {
    return `
      <div class="stv3-empty stv3-receipt-empty">
        <strong>尚未发送身份</strong>
        <span>发送后这里会显示回执 X/N、未确认座位和自动确认说明；不再跳到另一个“确认身份”主面板。</span>
      </div>
    `;
  }

  const stats = getReceiptStats(state);
  return `
    <div class="stv3-receipt-summary">
      <div><strong>${stats.confirmed}/${stats.total}</strong><span>已确认</span></div>
      <div><strong>${stats.pending.length}</strong><span>未确认</span></div>
      <div><strong>${stats.autoConfirmed.length}</strong><span>离线/测试自动确认</span></div>
    </div>
    ${stats.autoConfirmed.length > 0 ? `<div class="stv3-receipt-note">演示数据中离线/测试席位已自动确认：${escapeHtml(stats.autoConfirmed.join('、'))}。</div>` : ''}
    ${stats.pending.length > 0 ? `<div class="stv3-receipt-note" data-tone="warning">未确认：${escapeHtml(stats.pending.join('、'))}。可以等待，也可以由说书人决定继续首夜。</div>` : ''}
    <div class="stv3-receipt-grid">${stats.items.map((receipt) => `
      <div class="stv3-receipt" data-confirmed="${receipt.confirmed}">
        <span>${escapeHtml(receipt.seat)}号</span>
        <span><strong>${receipt.confirmed ? '已确认' : '未确认'}</strong><br><span class="stv3-receipt-role">${escapeHtml(receipt.role || '身份已发送')}</span></span>
      </div>
    `).join('')}</div>
  `;
}

function getReceiptStats(state) {
  const receipts = Array.isArray(state.receipts) ? state.receipts : [];
  const players = Array.isArray(state.players) ? state.players : [];
  const total = receipts.length || players.length || 0;
  const items = receipts.length > 0
    ? receipts
    : players.map((player) => ({ seat: player.seat, name: player.name, role: player.role, confirmed: Boolean(player.identityConfirmed) }));
  const confirmedItems = items.filter((receipt) => receipt.confirmed);
  const playerBySeat = new Map(players.map((player) => [String(player.seat), player]));
  return {
    total,
    confirmed: confirmedItems.length,
    pending: items.filter((receipt) => !receipt.confirmed).map(formatReceiptSeat),
    autoConfirmed: confirmedItems
      .filter((receipt) => playerBySeat.get(String(receipt.seat))?.connected === false)
      .map(formatReceiptSeat),
    items
  };
}

function formatReceiptSeat(receipt) {
  const name = receipt.name ? ` ${receipt.name}` : '';
  return `${receipt.seat}号${name}`;
}

function renderJournal(state) {
  const entries = state.journal || [];
  if (entries.length === 0) return '<div class="stv3-empty">暂无记录</div>';
  return entries.map((entry) => `
    <div class="stv3-journal-entry">
      <span>${escapeHtml(entry.time)}</span>
      <span>${escapeHtml(entry.text)}</span>
    </div>
  `).join('');
}

function getPlayerCount(state) {
  return state.players?.length || state.room?.playerCount || 0;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}