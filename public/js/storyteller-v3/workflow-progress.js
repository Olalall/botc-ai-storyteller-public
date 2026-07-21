const STAGES = [
  { id: 'setup', name: '开局', description: '房间、剧本、座位' },
  { id: 'identity', name: '身份', description: '配板、发身份、回执' },
  { id: 'night', name: '夜晚', description: '等待首夜开启' },
  { id: 'day', name: '白天', description: '公告与发言' },
  { id: 'vote', name: '投票', description: '提名、投票、处决' },
  { id: 'gameEnd', name: '结局', description: '检查并公开结局' },
  { id: 'review', name: '复盘', description: '时间线与同房下一局' }
];

export function getWorkflowProgress(state) {
  const setup = state.setup || {};
  return STAGES.map((stage, index) => {
    let status = 'locked';
    let detail = stage.description;

    if (stage.id === 'setup') {
      status = setup.setupConfirmed ? 'complete' : 'active';
      detail = setup.setupConfirmed ? '配板已确认' : '正在开局';
    }

    if (stage.id === 'identity') {
      if (!setup.setupConfirmed) status = 'available';
      if (setup.setupConfirmed && !setup.rolesDealt) status = 'active';
      if (setup.rolesDealt && !setup.firstNightStarted) status = 'complete';
      if (setup.firstNightStarted) status = 'complete';
      detail = buildIdentityDetail(state);
    }

    if (stage.id === 'night') {
      if (setup.rolesDealt && !setup.firstNightStarted) status = 'available';
      if (setup.firstNightStarted) status = 'active';
      detail = setup.firstNightStarted ? '首夜已开启' : '身份发送后可开启';
    }

    return { ...stage, index: index + 1, status, detail };
  });
}

export function getPrimaryAction(state) {
  const setup = state.setup || {};
  if (!setup.scriptSelected) return { id: 'selectScript', label: '选择剧本', disabled: false };
  if (!setup.setupGenerated) return { id: 'generateSetup', label: '生成配板', disabled: false };
  if (!setup.setupConfirmed) return { id: 'confirmSetup', label: '确认配板', disabled: false };
  if (!setup.rolesDealt) return { id: 'dealRoles', label: '发送身份', disabled: false };
  if (!setup.firstNightStarted) return { id: 'startFirstNight', label: '开始首夜', disabled: false };
  return { id: 'noop', label: '首夜已开始', disabled: true, reason: 'V3.1 到此为止，夜晚裁决在 V3.2。' };
}

function buildIdentityDetail(state) {
  const total = state.players?.length || 0;
  const confirmed = state.receipts?.filter((item) => item.confirmed).length || 0;
  if (!state.setup?.rolesDealt) return '等待发送身份';
  return `回执 ${confirmed}/${total}`;
}
