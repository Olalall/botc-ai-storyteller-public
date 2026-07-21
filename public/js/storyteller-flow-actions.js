(function attachStorytellerFlowActions(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BOTC_STORYTELLER_FLOW_ACTIONS = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createStorytellerFlowActions() {
  const RIGHT_MENU_TOOL_ACTIONS = {
    setup: { type: 'modal', modal: 'ai-setup' },
    identity: { type: 'modal', modal: 'identity-tool' },
    night: { type: 'modal', modal: 'night-tool' },
    day: { type: 'modal', modal: 'vote-tool' },
    vote: { type: 'modal', modal: 'vote-tool' },
    manual: { type: 'modal', modal: 'manual-tool' },
    'game-end': { type: 'modal', modal: 'game-end-tool' },
    // 复盘实际是抽屉，不是旧版 game-review-tool-modal。
    // 保持唯一入口目标，避免点击后菜单收起但没有界面。
    review: { type: 'drawer', drawer: 'game-review' }
  };

  const FLOW_STAGE_TOOL_MAP = {
    setup: 'setup',
    identity: 'identity',
    night: 'night',
    day: 'vote',
    vote: 'vote',
    'game-end': 'game-end'
  };

  const FLOW_MODAL_SURFACES = {
    'ai-setup': {
      overlayId: 'ai-setup-modal',
      panelRenderers: ['setup-deal']
    },
    'identity-tool': {
      overlayId: 'identity-tool-modal',
      panelRenderers: ['identity-tool']
    },
    'night-tool': {
      overlayId: 'night-tool-modal',
      panelRenderers: ['night-flow', 'night-tool']
    },
    'vote-tool': {
      overlayId: 'vote-tool-modal',
      panelRenderers: ['day-vote', 'vote-tool']
    },
    'manual-tool': {
      overlayId: 'manual-tool-modal',
      panelRenderers: ['manual-tool']
    },
    'game-end-tool': {
      overlayId: 'game-end-tool-modal',
      panelRenderers: ['game-end-tool']
    },
    // 复盘不再挂到已删除的旧 modal；由 drawer action 处理。
  };

  function getRightMenuStageToolAction(tool) {
    const key = String(tool || '').trim();
    const action = RIGHT_MENU_TOOL_ACTIONS[key];
    return action ? { tool: key, ...action } : { tool: key, type: 'none' };
  }

  function getPendingGameEndCandidate(gameEnd = {}) {
    const candidates = Array.isArray(gameEnd.candidates) ? gameEnd.candidates : [];
    return candidates.find((candidate) => candidate.status === 'pending-storyteller-confirmation') || null;
  }

  function getFlowWizardNextStage(stage, context = {}) {
    const {
      rolesDealt = false,
      nightResolvedAwaitingDay = false,
      dayStarted = false,
      dayResolved = false,
      localGameEndReady = false
    } = context;
    if (stage === 'setup') return rolesDealt ? 'identity' : '';
    if (stage === 'identity') return rolesDealt ? 'night' : '';
    if (stage === 'night') return nightResolvedAwaitingDay ? 'day' : '';
    if (stage === 'day') return dayStarted ? 'vote' : '';
    if (stage === 'vote') {
      if (!dayResolved) return '';
      return localGameEndReady ? 'game-end' : 'night';
    }
    return '';
  }

  function getPreviousFlowStage(stage, stages = []) {
    const index = stages.indexOf(stage);
    return index > 0 ? stages[index - 1] : '';
  }

  function normalizeFlowStageForActions(stage, stages = [], fallback = 'setup') {
    const stageList = Array.isArray(stages) && stages.length
      ? stages
      : ['setup', 'identity', 'night', 'day', 'vote', 'game-end'];
    if (stageList.includes(stage)) return stage;
    return stageList.includes(fallback) ? fallback : stageList[0] || 'setup';
  }

  function buildOpenFlowStageModel({
    requestedStage = '',
    fallbackStage = 'setup',
    stages = [],
    sectionIds = {}
  } = {}) {
    const stageList = Array.isArray(stages) && stages.length
      ? stages
      : ['setup', 'identity', 'night', 'day', 'vote', 'game-end'];
    const targetStage = normalizeFlowStageForActions(requestedStage, stageList, fallbackStage);
    return {
      targetStage,
      targetSectionId: sectionIds[targetStage] || '',
      sectionStates: stageList.map((stage) => ({
        stage,
        sectionId: sectionIds[stage] || '',
        active: stage === targetStage
      }))
    };
  }

  function buildFlowStageOpenSurfaceModel({
    stage = '',
    fallbackStage = 'setup',
    primaryActionId = '',
    stages = []
  } = {}) {
    const normalizedStage = normalizeFlowStageForActions(stage, stages, fallbackStage);
    const tool = FLOW_STAGE_TOOL_MAP[normalizedStage] || 'setup';
    const model = buildRightMenuToolOpenModel(tool, { fallbackStage: normalizedStage, stages });
    return {
      ...model,
      source: 'flow-stage',
      stage: normalizedStage,
      primaryActionId: primaryActionId || ''
    };
  }

  function buildCurrentFlowPanelOpenModel({
    flowStage = '',
    fallbackStage = 'setup',
    primaryActionId = '',
    fallbackPrimaryActionId = '',
    stages = []
  } = {}) {
    const stage = normalizeFlowStageForActions(flowStage, stages, fallbackStage);
    return buildFlowStageOpenSurfaceModel({
      stage,
      fallbackStage,
      primaryActionId: primaryActionId || fallbackPrimaryActionId || '',
      stages
    });
  }

  function buildRightMenuToolOpenModel(tool, {
    fallbackStage = 'setup',
    stages = []
  } = {}) {
    const action = getRightMenuStageToolAction(tool);
    if (action.type === 'stage' && action.stage) {
      return {
        tool: action.tool,
        ...buildFlowStageOpenSurfaceModel({
          stage: action.stage,
          fallbackStage,
          stages
        })
      };
    }
    if (action.type === 'modal' && action.modal) {
      const surface = FLOW_MODAL_SURFACES[action.modal] || {};
      return {
        type: 'modal',
        tool: action.tool,
        closeSurfaces: true,
        collapseRightMenu: true,
        activeMenuToolId: action.tool === 'review' ? 'btn-toolbar-review' : 'btn-game-state',
        modal: action.modal,
        overlayId: surface.overlayId || '',
        panelRenderers: Array.isArray(surface.panelRenderers) ? [...surface.panelRenderers] : []
      };
    }
    if (action.type === 'drawer' && action.drawer) {
      return {
        type: 'drawer',
        tool: action.tool,
        closeSurfaces: true,
        collapseRightMenu: true,
        activeMenuToolId: null,
        drawer: action.drawer
      };
    }
    return {
      type: 'none',
      tool: action.tool,
      closeSurfaces: false,
      collapseRightMenu: false,
      activeMenuToolId: null
    };
  }

  function buildFlowWizardPrevModel({
    activeStage = '',
    fallbackStage = 'setup',
    stages = []
  } = {}) {
    const currentStage = normalizeFlowStageForActions(activeStage, stages, fallbackStage);
    return {
      currentStage,
      targetStage: getPreviousFlowStage(currentStage, stages) || currentStage
    };
  }

  function buildFlowWizardNextRunModel({
    flowStage = '',
    fallbackStage = 'setup',
    primaryActionId = '',
    fallbackPrimaryActionId = '',
    disabled = false
  } = {}) {
    return {
      disabled: Boolean(disabled),
      targetStage: flowStage || fallbackStage || 'setup',
      primaryActionId: primaryActionId || fallbackPrimaryActionId || ''
    };
  }

  function buildFlowWizardNextButtonModel({
    stage = 'setup',
    primaryActionText = '',
    nextStage = '',
    nextStageLabel = '',
    blockedReason = '',
    canContinueIdentity = false
  } = {}) {
    const normalizedPrimaryText = String(primaryActionText || '').trim();
    const stageBlockedReason = {
      setup: '还差：创建房间、玩家落座、生成配板方案或确认配板。',
      identity: '还需要等待玩家确认身份，或由说书人决定继续第 1 天夜晚。',
      night: '还差：开始夜晚、整理夜晚结果，或处理完所有夜晚结果。',
      day: '还需要进入白天发言。',
      vote: '还需要记录提名、开启投票、计票并确认处决或无处决。',
      'game-end': '还需要检测胜负条件并确认公开结局。'
    }[stage] || '当前阶段仍有前置条件未满足。';
    const effectiveBlockedReason = blockedReason || stageBlockedReason;
    const nextText = normalizedPrimaryText
      || (nextStage ? `进入${nextStageLabel || nextStage}` : '')
      || (stage === 'identity' ? '等待或继续第 1 天夜晚' : '查看等待原因');
    const disabled = !normalizedPrimaryText && !nextStage && !(stage === 'identity' && canContinueIdentity);
    return {
      text: `下一步：${nextText}`,
      disabled,
      title: disabled
        ? effectiveBlockedReason
        : (effectiveBlockedReason && stage === 'identity'
          ? `${effectiveBlockedReason}；可由说书人决定继续第 1 天夜晚。`
          : '执行当前步骤')
      };
  }

  function getStageLabel(stage, labels = {}) {
    const fallbackLabels = {
      setup: '配板',
      identity: '身份确认',
      night: '夜晚',
      day: '白天',
      vote: '投票处决',
      'game-end': '结局'
    };
    return labels[stage] || fallbackLabels[stage] || stage || '';
  }

  function buildFlowWizardNavigationModel({
    stage = 'setup',
    actionContext = {},
    mainFlow = {},
    primaryActionId = '',
    primaryActionText = '',
    primaryActionDisabled = false,
    primaryActionDisabledReason = '',
    nightResolvedAwaitingDay = false,
    dayStarted = undefined,
    dayResolved = undefined,
    localGameEndReady = false,
    stageLabels = {}
  } = {}) {
    const dayVote = actionContext.dayVote || {};
    const normalizedStage = stage || mainFlow.stage || 'setup';
    const resolvedDayStarted = dayStarted ?? actionContext.dayStarted ?? isDayFlowStarted(dayVote);
    const resolvedDayResolved = dayResolved ?? actionContext.dayResolved ?? isDayVoteResolved(dayVote);
    const nextStage = getFlowWizardNextStage(normalizedStage, {
      rolesDealt: Boolean(actionContext.rolesDealt),
      nightResolvedAwaitingDay: Boolean(nightResolvedAwaitingDay || actionContext.nightResolvedAwaitingDay),
      dayStarted: Boolean(resolvedDayStarted),
      dayResolved: Boolean(resolvedDayResolved),
      localGameEndReady: Boolean(localGameEndReady || actionContext.localGameEndReady)
    });
    const effectivePrimaryActionId = primaryActionId || mainFlow.primaryActionId || '';
    const effectivePrimaryActionText = primaryActionDisabled
      ? ''
      : String(primaryActionText || mainFlow.primaryActionText || mainFlow.primaryAction?.text || '').trim();
    const blockedReason = primaryActionDisabledReason
      || mainFlow.blockedReason
      || (primaryActionDisabled ? mainFlow.detail : '')
      || '';
    return {
      stage: normalizedStage,
      primaryActionId: effectivePrimaryActionId,
      nextStage,
      nextStageLabel: getStageLabel(nextStage, stageLabels),
      nextButton: buildFlowWizardNextButtonModel({
        stage: normalizedStage,
        primaryActionText: effectivePrimaryActionText,
        nextStage,
        nextStageLabel: getStageLabel(nextStage, stageLabels),
        blockedReason,
        canContinueIdentity: normalizedStage === 'identity' && Boolean(actionContext.rolesDealt)
      })
    };
  }

  function getSetupPrimaryActionId({
    rolesDealt = false,
    hasCandidate = false,
    confirmed = false
  } = {}) {
    if (rolesDealt || confirmed) return 'btn-deal-roles';
    return hasCandidate ? 'btn-confirm-setup-candidate' : 'btn-generate-setup-candidate';
  }

  function getNightPrimaryActionId({
    hasBatch = false,
    hasCandidates = false,
    collectionClosed = false,
    nightResolvedAwaitingDay = false
  } = {}) {
    if (nightResolvedAwaitingDay) return 'btn-start-day-vote';
    if (hasCandidates) return 'btn-close-night-collection';
    if (hasBatch) return 'btn-prepare-night-candidates';
    return 'btn-start-night-collection';
  }

  function isDayFlowStarted(dayVote = {}) {
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

  function isDayVoteResolved(dayVote = {}) {
    return dayVote.resolved === true
      || dayVote.dayClosed?.status === 'confirmed';
  }

  function normalizePendingSeats(identityState = {}, playerCount = 0, rolesDealt = false) {
    if (!rolesDealt) return [];
    if (Array.isArray(identityState.pendingSeats)) {
      return identityState.pendingSeats
        .map((seat) => Number(seat))
        .filter((seat) => Number.isInteger(seat));
    }
    const total = Number(identityState.total || playerCount || 0);
    const confirmedCount = Number(identityState.confirmedCount || 0);
    if (!Number.isInteger(total) || total <= 0 || confirmedCount >= total) return [];
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  function buildFlowActionContextFromRoomSession(roomSession = {}) {
    const candidateResolutions = Array.isArray(roomSession.candidateResolutions)
      ? roomSession.candidateResolutions
      : [];
    const dayVote = roomSession.dayVote || {};
    const gameEnd = roomSession.gameEnd || {};
    const gameEndCandidates = Array.isArray(gameEnd.candidates) ? gameEnd.candidates : [];
    return {
      rolesDealt: Boolean(roomSession.rolesDealt),
      hasSetupCandidate: Boolean(roomSession.setupCandidate),
      hasConfirmedSetup: Boolean(roomSession.confirmedSetupCandidate),
      hasNightBatch: Boolean(roomSession.nightBatchId),
      hasNightCandidates: candidateResolutions.length > 0,
      nightCollectionClosed: roomSession.nightCollectionClosed === true,
      dayVote,
      dayStarted: isDayFlowStarted(dayVote),
      dayResolved: isDayVoteResolved(dayVote),
      pendingGameEndCandidate: getPendingGameEndCandidate(gameEnd),
      hasGameEndCandidates: gameEndCandidates.length > 0,
      confirmedGameEnd: gameEnd.publicGameOver?.status === 'confirmed'
    };
  }

  function buildFlowRecommendationContextFromRoomSession(roomSession = {}, {
    playerCount = 0,
    identityState = null,
    nightProgress = null,
    localGameEnd = null,
    gamePhase = ''
  } = {}) {
    const actionContext = buildFlowActionContextFromRoomSession(roomSession);
    const identitySummary = identityState || roomSession.identityReceiptSummary || {};
    const pendingSeats = normalizePendingSeats(identitySummary, playerCount, actionContext.rolesDealt);
    return {
      ...actionContext,
      identityPendingSeats: pendingSeats,
      identityPending: pendingSeats.length > 0,
      nightPending: Boolean(nightProgress?.pending),
      nightResolvedAwaitingDay: Boolean(nightProgress?.awaitingDay),
      gamePhase,
      localGameEndReady: Boolean(localGameEnd?.ready),
      localGameEndLabel: localGameEnd?.label || ''
    };
  }

  function getRecommendedFlowStage(context = {}) {
    const {
      rolesDealt = false,
      identityPending = false,
      identityPendingSeats = [],
      nightPending = false,
      hasNightBatch = false,
      hasNightCandidates = false,
      nightResolvedAwaitingDay = false,
      gamePhase = '',
      dayVote = {},
      dayStarted = isDayFlowStarted(dayVote),
      dayResolved = isDayVoteResolved(dayVote),
      localGameEndReady = false,
      hasGameEndCandidates = false,
      confirmedGameEnd = false
    } = context;
    const hasPendingIdentity = Boolean(identityPending)
      || (Array.isArray(identityPendingSeats) && identityPendingSeats.length > 0);
    if (!rolesDealt) return 'setup';
    if (hasPendingIdentity) return 'identity';
    if (nightPending) return 'night';
    if (nightResolvedAwaitingDay || gamePhase === 'day') {
      if (dayResolved) {
        return localGameEndReady || hasGameEndCandidates || confirmedGameEnd ? 'game-end' : 'night';
      }
      return dayStarted ? 'vote' : 'day';
    }
    if (hasNightBatch || hasNightCandidates) return 'night';
    if (hasGameEndCandidates || confirmedGameEnd) return 'game-end';
    return 'night';
  }

  function getDayPrimaryActionId(dayVote = {}, {
    rolesDealt = false,
    dayStarted = isDayFlowStarted(dayVote)
  } = {}) {
    const timer = dayVote.dayTimer || {};
    const nomination = dayVote.nomination || {};
    const voting = dayVote.voting || {};
    const voteCount = dayVote.voteCount || {};
    if (!rolesDealt || timer.status === 'not-started' || !dayStarted) return 'btn-start-day-vote';
    if (dayVote.execution?.status === 'confirmed') return 'btn-finish-day-vote';
    if (!nomination.nominationId && !['recorded', 'active'].includes(nomination.status)) return 'btn-record-nomination';
    if (voting.status !== 'open' && voteCount.status !== 'counted') return 'btn-open-day-vote';
    if (voting.status === 'open') return 'btn-count-day-vote';
    if (voteCount.candidateExecution?.status === 'pending-storyteller-confirmation') return 'btn-finish-day-vote';
    return 'btn-finish-day-vote';
  }

  function getGameEndPrimaryActionId({
    pendingCandidate = null,
    confirmed = false
  } = {}) {
    if (confirmed) return 'btn-open-current-review';
    return pendingCandidate ? 'btn-confirm-game-end' : 'btn-prepare-game-end';
  }

  function getFlowStagePrimaryActionId(stage, context = {}) {
    if (stage === 'setup') {
      return getSetupPrimaryActionId({
        rolesDealt: Boolean(context.rolesDealt),
        hasCandidate: Boolean(context.hasSetupCandidate),
        confirmed: Boolean(context.hasConfirmedSetup)
      });
    }
    if (stage === 'identity') return 'btn-identity-continue-night';
    if (stage === 'night') {
      return getNightPrimaryActionId({
        hasBatch: Boolean(context.hasNightBatch),
        hasCandidates: Boolean(context.hasNightCandidates),
        collectionClosed: Boolean(context.nightCollectionClosed),
        nightResolvedAwaitingDay: Boolean(context.nightResolvedAwaitingDay)
      });
    }
    if (stage === 'day') return 'btn-start-day-vote';
    if (stage === 'vote') {
      return getDayPrimaryActionId(context.dayVote || {}, {
        rolesDealt: Boolean(context.rolesDealt),
        dayStarted: context.dayStarted ?? isDayFlowStarted(context.dayVote || {})
      });
    }
    if (stage === 'game-end') {
      return getGameEndPrimaryActionId({
        pendingCandidate: context.pendingGameEndCandidate || null,
        confirmed: Boolean(context.confirmedGameEnd)
      });
    }
    return '';
  }

  function buildFlowActionFocusModel(context = {}) {
    return {
      setupActionId: getFlowStagePrimaryActionId('setup', context),
      nightActionId: getFlowStagePrimaryActionId('night', context),
      voteActionId: getFlowStagePrimaryActionId('vote', context),
      gameEndActionId: getFlowStagePrimaryActionId('game-end', context)
    };
  }

  return {
    getRightMenuStageToolAction,
    getFlowWizardNextStage,
    getPreviousFlowStage,
    buildOpenFlowStageModel,
    buildFlowStageOpenSurfaceModel,
    buildCurrentFlowPanelOpenModel,
    buildRightMenuToolOpenModel,
    buildFlowWizardPrevModel,
    buildFlowWizardNextRunModel,
    buildFlowWizardNextButtonModel,
    buildFlowWizardNavigationModel,
    getSetupPrimaryActionId,
    getNightPrimaryActionId,
    isDayFlowStarted,
    isDayVoteResolved,
    buildFlowActionContextFromRoomSession,
    buildFlowRecommendationContextFromRoomSession,
    getRecommendedFlowStage,
    getDayPrimaryActionId,
    getGameEndPrimaryActionId,
    getFlowStagePrimaryActionId,
    buildFlowActionFocusModel
  };
});
