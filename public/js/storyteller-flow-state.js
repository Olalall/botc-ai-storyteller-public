(function attachStorytellerFlowState(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BOTC_STORYTELLER_FLOW = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createStorytellerFlowState() {
  const FLOW_WIZARD_STAGES = ['setup', 'identity', 'night', 'day', 'vote', 'game-end'];
  const FLOW_STAGE_SECTION_IDS = {
    setup: 'state-flow-setup',
    identity: 'state-flow-identity',
    night: 'state-flow-night',
    day: 'state-flow-day',
    vote: 'state-flow-vote',
    'game-end': 'state-flow-game-end'
  };
  const FLOW_WIZARD_META = {
    setup: {
      title: '配板：先把这一局准备好',
      subtitle: '确认房间、人数、板子和配板方案；身份没发出前，这一步只负责配板和最终发送身份。'
    },
    identity: {
      title: '身份确认：等玩家知道自己是谁',
      subtitle: '玩家端确认身份会实时回到这里；必要时说书人也可以决定继续第 1 天夜晚。'
    },
    night: {
      title: '夜晚：处理玩家行动',
      subtitle: '开始夜晚、整理夜晚结果、逐条确认；确认前不改权威状态。'
    },
    day: {
      title: '白天：进入发言阶段',
      subtitle: '这里只负责把游戏推进到白天；提名、投票和处决放到下一步。'
    },
    vote: {
      title: '投票：提名、计票、处决',
      subtitle: '先记录提名，再开启投票，计票后确认处决；也保留自由处决入口。'
    },
    'game-end': {
      title: '结局：必须有胜负条件才确认',
      subtitle: '只有检测到一方达成胜利条件时，才允许确认公开结局；否则继续下一夜。'
    }
  };

  function defaultNightLabel(value) {
    const n = Number(value || 1) || 1;
    return `第 ${n} 天夜晚`;
  }

  function normalizeFlowStage(stage, fallback = 'setup') {
    return FLOW_WIZARD_STAGES.includes(stage) ? stage : fallback;
  }

  function getFlowWizardStageIndex(stage) {
    const index = FLOW_WIZARD_STAGES.indexOf(stage);
    return index >= 0 ? index : 0;
  }

  function getFlowWizardStageCount() {
    return FLOW_WIZARD_STAGES.length;
  }

  function getFlowSectionId(stage) {
    return FLOW_STAGE_SECTION_IDS[normalizeFlowStage(stage)] || FLOW_STAGE_SECTION_IDS.setup;
  }

  function getFlowStageSectionEntries() {
    return FLOW_WIZARD_STAGES.map((stage) => [stage, FLOW_STAGE_SECTION_IDS[stage]]);
  }

  function isDayFlowStartedForState(dayVote = {}) {
    const timer = dayVote.dayTimer || {};
    const nomination = dayVote.nomination || {};
    const voting = dayVote.voting || {};
    const voteCount = dayVote.voteCount || {};
    return timer.status === 'running'
      || nomination.status === 'recorded'
      || voting.status === 'open'
      || voteCount.status === 'counted'
      || Boolean(dayVote.execution?.status || dayVote.execution?.effective);
  }

  function isDayVoteResolvedForState(dayVote = {}) {
    return dayVote.resolved === true
      || dayVote.dayClosed?.status === 'confirmed';
  }

  function countPendingNightCandidates(candidateResolutions = []) {
    return candidateResolutions
      .filter((candidate) => !['confirmed', 'rejected', 'superseded'].includes(candidate.status || ''))
      .length;
  }

  function getPrimaryActionText(primaryActionId, {
    nextNightNumber = 1,
    nightLabel = defaultNightLabel,
    hasNightBatch = false,
    hasNightCandidates = false
  } = {}) {
    const nightText = nightLabel(nextNightNumber);
    const labels = {
      'btn-generate-setup-candidate': '生成配板',
      'btn-confirm-setup-candidate': '确认配板',
      'btn-deal-roles': '发送身份',
      'btn-identity-continue-night': '继续第 1 天夜晚',
      'btn-start-day-vote': '进入白天',
      'btn-record-nomination': '记录提名',
      'btn-open-day-vote': '开启投票',
      'btn-count-day-vote': '统计投票',
      'btn-confirm-execution': '确认处决',
      'btn-finish-day-vote': '结束今日投票',
      'btn-prepare-game-end': '确认结局',
      'btn-confirm-game-end': '公开结局',
      'btn-open-current-review': '查看复盘',
      'btn-close-night-collection': '打开夜晚面板'
    };
    if (primaryActionId === 'btn-start-night-collection') return `开始${nightText}`;
    if (primaryActionId === 'btn-prepare-night-candidates') {
      return '确认夜晚技能结果';
    }
    return labels[primaryActionId] || '';
  }

  function buildMainFlowStateContextFromRoomSession(roomSession = {}, {
    gameState = {},
    identityState = {},
    nightProgress = {},
    localGameEnd = {},
    nextNightNumber = 1
  } = {}) {
    const players = Array.isArray(gameState.players) ? gameState.players : [];
    const dayVote = roomSession.dayVote || {};
    const gameEnd = roomSession.gameEnd || {};
    const gameEndCandidates = Array.isArray(gameEnd.candidates) ? gameEnd.candidates : [];
    const candidateResolutions = Array.isArray(roomSession.candidateResolutions)
      ? roomSession.candidateResolutions
      : [];
    const pendingNightCandidateCount = countPendingNightCandidates(candidateResolutions);
    const dayStarted = isDayFlowStartedForState(dayVote) || gameState.phase === 'day';
    const nightResolvedAwaitingDay = Boolean(nightProgress.awaitingDay)
      || (candidateResolutions.length > 0 && pendingNightCandidateCount === 0 && !dayStarted);
    return {
      rolesDealt: Boolean(roomSession.rolesDealt),
      occupied: Number(roomSession.lobby?.occupied || players.length || 0),
      playerCount: Number(roomSession.lobby?.playerCount || players.length || 0),
      roomId: roomSession.roomId || '',
      hasSetupCandidate: Boolean(roomSession.setupCandidate),
      hasConfirmedSetup: Boolean(roomSession.confirmedSetupCandidate),
      hasNightBatch: Boolean(roomSession.nightBatchId),
      hasNightCandidates: candidateResolutions.length > 0,
      hasPendingNightCandidates: pendingNightCandidateCount > 0,
      pendingNightCandidateCount,
      nightResolvedAwaitingDay,
      dayStarted,
      dayResolved: isDayVoteResolvedForState(dayVote),
      nominationStatus: dayVote.nomination?.status || '',
      votingStatus: dayVote.voting?.status || '',
      voteCountStatus: dayVote.voteCount?.status || '',
      candidateExecutionPasses: dayVote.voteCount?.candidateExecution?.passes === true,
      executionEffective: dayVote.execution?.effective === true,
      identityState,
      localGameEnd,
      pendingGameEnd: gameEndCandidates.some((candidate) => candidate.status === 'pending-storyteller-confirmation'),
      confirmedGameEnd: gameEnd.publicGameOver?.status === 'confirmed',
      nextNightNumber
    };
  }

  function resolveMainFlowState(context = {}, helpers = {}) {
    const nightLabel = helpers.nightLabel || defaultNightLabel;
    const {
      rolesDealt = false,
      occupied = 0,
      playerCount = 0,
      roomId = '',
      hasSetupCandidate = false,
      hasConfirmedSetup = false,
      hasNightBatch = false,
      hasNightCandidates = false,
      hasPendingNightCandidates = false,
      nightResolvedAwaitingDay = false,
      dayStarted = false,
      dayResolved = false,
      nominationStatus = '',
      votingStatus = '',
      voteCountStatus = '',
      candidateExecutionPasses = false,
      executionEffective = false,
      identityState = {},
      localGameEnd = {},
      pendingGameEnd = false,
      confirmedGameEnd = false,
      nextNightNumber = 1
    } = context;
    const identityComplete = Boolean(identityState.complete);
    const canAdvanceToNextNight = rolesDealt
      && !hasNightBatch
      && !hasPendingNightCandidates
      && dayStarted
      && dayResolved
      && !localGameEnd.ready
      && !pendingGameEnd
      && !confirmedGameEnd;
    const voteActive = !dayResolved && (
      nominationStatus === 'recorded'
      || votingStatus === 'open'
      || voteCountStatus === 'counted'
    );
    const nightWorkflowActive = rolesDealt && (
      hasNightBatch
      || hasPendingNightCandidates
      || canAdvanceToNextNight
      || (!nightResolvedAwaitingDay && !dayStarted && !hasNightCandidates)
    );

    let stage = 'setup';
    let title = '先完成配板准备';
    let detail = roomId
      ? `等待落座或生成配板：${occupied}/${playerCount}`
      : '先创建或重连房间。';
    let primaryActionId = 'btn-generate-setup-candidate';
    let badge = '准备';
    let nextStage = '';

    if (confirmedGameEnd) {
      stage = 'game-end';
      title = '本局已公开结局';
      detail = '下一步是打开复盘，查看本局报告和下一局建议。';
      primaryActionId = 'btn-open-current-review';
      badge = '已结束';
    } else if (pendingGameEnd || localGameEnd.ready) {
      stage = 'game-end';
      title = pendingGameEnd ? '胜负判断等待确认' : '检测到胜负条件';
      detail = pendingGameEnd ? '确认前玩家端不会看到公开结局。' : (localGameEnd.label || '确认胜负条件后再公开结局。');
      primaryActionId = pendingGameEnd ? 'btn-confirm-game-end' : 'btn-prepare-game-end';
      badge = pendingGameEnd ? '待确认' : '可确认';
    } else if (!rolesDealt) {
      stage = 'setup';
      if (hasConfirmedSetup) {
        title = '下一步：发送身份';
        detail = '配板已确认，发送前再核对一次角色和恶魔伪装。';
        primaryActionId = 'btn-deal-roles';
        badge = '待发送';
      } else if (hasSetupCandidate) {
        title = '下一步：确认配板';
        detail = '当前只是配板方案，确认后才允许发送身份。';
        primaryActionId = 'btn-confirm-setup-candidate';
        badge = '待确认';
      } else if (roomId && occupied >= playerCount) {
        title = '下一步：生成配板';
        detail = '玩家已落座，生成配板方案不会直接发送身份。';
        primaryActionId = 'btn-generate-setup-candidate';
        badge = '可配板';
      }
    } else if (!identityComplete && !hasNightBatch && !hasNightCandidates && !dayStarted) {
      stage = 'identity';
      title = '等待玩家确认身份';
      detail = `未确认座位：${(identityState.pendingSeats || []).join('、') || '无'}。说书人可以等待，也可以决定继续第 1 天夜晚。`;
      primaryActionId = 'btn-identity-continue-night';
      badge = identityState.badge || '待确认';
      nextStage = 'night';
    } else if (nightResolvedAwaitingDay) {
      stage = 'day';
      title = '下一步：进入白天';
      detail = '夜晚已收尾，现在进入白天发言；提名投票在下一阶段处理。';
      primaryActionId = 'btn-start-day-vote';
      badge = '可开始';
    } else if (nightWorkflowActive || (hasNightCandidates && !dayStarted)) {
      stage = 'night';
      if (hasPendingNightCandidates) {
        title = `${nightLabel(nextNightNumber)}技能结果待确认`;
        detail = '打开夜晚面板，逐条确认或修改夜晚技能结果。确认前不改权威状态。';
        primaryActionId = 'btn-close-night-collection';
        badge = hasPendingNightCandidates ? '待确认' : '已完成';
      } else if (hasNightBatch) {
        title = '等待玩家夜晚行动';
        detail = '收到行动后点击“确认夜晚技能结果”，系统会锁定当前提交并整理候选。';
        primaryActionId = 'btn-prepare-night-candidates';
        badge = '等行动';
      } else {
        title = `下一步：开始${nightLabel(nextNightNumber)}`;
        detail = '开始后才会向玩家端发出当前夜晚行动提示。';
        primaryActionId = 'btn-start-night-collection';
        badge = '可开始';
      }
    } else if (voteActive) {
      stage = 'vote';
      if (voteCountStatus === 'counted') {
        title = candidateExecutionPasses ? '下一步：结束今日投票' : '下一步：确认本轮无处决';
        detail = candidateExecutionPasses
          ? '打开今日结果汇总；确认后由服务器确认处决结果并检查胜负。'
          : '确认后清空本轮票型，可以继续记录下一次提名。';
        primaryActionId = candidateExecutionPasses ? 'btn-finish-day-vote' : 'btn-confirm-execution';
        badge = candidateExecutionPasses ? '待收尾' : '待确认';
      } else if (votingStatus === 'open') {
        title = '正在等待玩家投票';
        detail = '等玩家投票，或由说书人记录票型，再统计结果。';
        primaryActionId = 'btn-count-day-vote';
        badge = '投票中';
      } else {
        title = '下一步：开启投票';
        detail = '提名已记录，开启投票后玩家端才会出现投票操作。';
        primaryActionId = 'btn-open-day-vote';
        badge = '待投票';
      }
    } else if (dayResolved) {
      stage = localGameEnd.ready ? 'game-end' : 'night';
      title = localGameEnd.ready ? '下一步：确认结局' : `白天已收尾，进入${nightLabel(nextNightNumber)}`;
      detail = localGameEnd.ready
        ? (localGameEnd.label || '检测到胜负条件，确认后公开结局。')
        : `未达成胜负条件，下一步进入${nightLabel(nextNightNumber)}。`;
      primaryActionId = localGameEnd.ready ? 'btn-prepare-game-end' : 'btn-start-night-collection';
      badge = executionEffective ? '已处决' : '无处决';
    } else {
      stage = 'day';
      title = dayStarted ? '白天进行中，下一步记录提名' : '下一步：开始白天';
      detail = dayStarted ? '发言结束后进入提名和投票。' : '这里只负责进入白天发言。';
      primaryActionId = dayStarted ? 'btn-record-nomination' : 'btn-start-day-vote';
      badge = dayStarted ? '进行中' : '可开始';
    }

    const primaryActionText = getPrimaryActionText(primaryActionId, {
      nextNightNumber,
      nightLabel,
      hasNightBatch,
      hasNightCandidates
    });
    const primaryAction = {
      id: primaryActionId,
      text: primaryActionText,
      stage
    };

    return {
      stage,
      title,
      detail,
      primaryActionId,
      primaryActionText,
      primaryAction,
      badge,
      nextStage,
      canAdvanceToNextNight
    };
  }

  return {
    FLOW_WIZARD_STAGES,
    FLOW_WIZARD_META,
    FLOW_STAGE_SECTION_IDS,
    normalizeFlowStage,
    getFlowWizardStageIndex,
    getFlowWizardStageCount,
    getFlowSectionId,
    getFlowStageSectionEntries,
    isDayFlowStartedForState,
    isDayVoteResolvedForState,
    countPendingNightCandidates,
    getPrimaryActionText,
    buildMainFlowStateContextFromRoomSession,
    resolveMainFlowState
  };
});
