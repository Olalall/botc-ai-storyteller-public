export function renderGrimoireTable(state) {
  const players = Array.isArray(state.players) ? state.players : [];
  const seats = players.map((player, index) => renderSeat(player, index, players.length, state)).join('');
  const connectedCount = players.filter((player) => player.connected !== false).length;
  const aliveCount = state.room?.aliveCount ?? players.filter((player) => player.alive !== false).length;

  return `
    <section class="stv3-panel stv3-grimoire" aria-label="魔典主桌面">
      <header class="stv3-panel-header">
        <div>
          <h2 class="stv3-panel-title">魔典主桌面</h2>
          <p class="stv3-panel-caption">局势以魔典为主，当前操作卡只负责确认下一步。</p>
        </div>
        <span class="stv3-pill" data-tone="active">${aliveCount} 存活</span>
      </header>
      <div class="stv3-panel-body">
        <div class="stv3-grimoire-stage" data-density="${players.length > 12 ? 'dense' : 'normal'}" aria-label="座位圆环">
          <div class="stv3-grimoire-center">
            <div>
              当前阶段<br>
              <strong>${escapeHtml(state.room?.dayLabel || '开局')}</strong>
              <small>${players.length || 0} 个座位 · 魔典主视图</small>
            </div>
          </div>
          ${seats || renderEmptySeats()}
        </div>
        <div class="stv3-grimoire-summary" aria-label="魔典摘要">
          ${renderSummaryItem('座位', `${players.length || 0}/12`)}
          ${renderSummaryItem('在线', `${connectedCount}/${players.length || 0}`)}
          ${renderSummaryItem('身份', state.setup?.rolesDealt ? '已发送' : '未发送')}
        </div>
        <div class="stv3-grimoire-actions" aria-label="魔典快捷动作">
          <button class="stv3-secondary-button" type="button" disabled>记录提名</button>
          <button class="stv3-secondary-button" type="button" disabled>开始投票</button>
          <button class="stv3-secondary-button" type="button" disabled>公开信息</button>
          <button class="stv3-secondary-button" type="button" disabled>记事本</button>
        </div>
      </div>
    </section>
  `;
}

function renderSeat(player, index, total, state) {
  const { x, y } = getSeatPosition(index, total);
  const seat = player.seat ?? index + 1;
  const role = player.role || '未分配';
  const alive = player.alive !== false;
  const connected = player.connected !== false;
  const label = `${seat}号 ${player.name || `${seat}号`} ${alive ? '存活' : '死亡'}`;

  return `
    <article
      class="stv3-seat"
      data-seat="${escapeAttribute(seat)}"
      data-alive="${alive}"
      data-connected="${connected}"
      data-alignment="${escapeAttribute(player.alignment || 'unknown')}"
      style="--seat-x:${x.toFixed(2)}%;--seat-y:${y.toFixed(2)}%"
      aria-label="${escapeAttribute(label)}"
    >
      <div class="stv3-seat-number">${escapeHtml(seat)}</div>
      <div class="stv3-token-stack" aria-hidden="true">
        <div class="stv3-seat-avatar"></div>
        <div class="stv3-seat-role">${escapeHtml(role)}</div>
      </div>
      <div class="stv3-seat-nameplate">
        <div class="stv3-seat-name">${escapeHtml(player.name || `${seat}号`)}</div>
        <div class="stv3-seat-meta">${renderSeatMeta(player, state)}</div>
      </div>
    </article>
  `;
}

function getSeatPosition(index, total) {
  const twelveSeatRing = [
    [50, 17], [73, 17], [87, 33], [88, 50], [87, 67], [73, 83],
    [50, 83], [27, 83], [13, 67], [12, 50], [13, 33], [27, 17]
  ];

  if (total <= twelveSeatRing.length) {
    return { x: twelveSeatRing[index][0], y: twelveSeatRing[index][1] };
  }

  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  return {
    x: 50 + Math.cos(angle) * 38,
    y: 50 + Math.sin(angle) * 37
  };
}

function renderSeatMeta(player, state) {
  const receipt = getReceiptForSeat(state, player.seat);
  const chips = [
    { label: player.alive === false ? '死亡' : '存活', tone: player.alive === false ? 'dead' : 'alive' },
    { label: player.connected === false ? '未连接' : '在线', tone: player.connected === false ? 'muted' : 'info' }
  ];

  if (state.setup?.rolesDealt) {
    chips.push({ label: receipt?.confirmed || player.identityConfirmed ? '已回执' : '待回执', tone: receipt?.confirmed || player.identityConfirmed ? 'info' : 'muted' });
  }

  for (const status of normalizeStatusList(player.status || player.statuses).slice(0, 2)) {
    chips.push({ label: status, tone: 'muted' });
  }

  return chips.map((chip) => `<span class="stv3-seat-chip" data-tone="${chip.tone}">${escapeHtml(chip.label)}</span>`).join('');
}

function renderSummaryItem(label, value) {
  return `
    <div class="stv3-grimoire-summary-item">
      <span class="stv3-grimoire-summary-label">${escapeHtml(label)}</span>
      <span class="stv3-grimoire-summary-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderEmptySeats() {
  return '<div class="stv3-empty">暂无玩家座位</div>';
}

function getReceiptForSeat(state, seat) {
  const receipts = Array.isArray(state.receipts) ? state.receipts : [];
  return receipts.find((item) => String(item.seat) === String(seat));
}

function normalizeStatusList(statuses) {
  if (!statuses) return [];
  if (Array.isArray(statuses)) return statuses.filter(Boolean).map(String);
  return [String(statuses)];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
