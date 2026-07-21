(function attachStorytellerFlowPanels(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BOTC_STORYTELLER_FLOW_PANELS = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createStorytellerFlowPanels() {
  const FLOW_STAGE_LABELS = {
    setup: '配板',
    identity: '身份',
    night: '夜晚',
    day: '白天',
    vote: '投票',
    'game-end': '结局'
  };
  const RIGHT_MENU_FLOW_STAGE_ORDER = ['setup', 'identity', 'night', 'day', 'vote', 'game-end'];
  const RIGHT_MENU_STAGE_TOOL_ITEMS = {
    setup: [
      { tool: 'setup', label: '配板工具', title: '打开配板发身份面板' },
      { tool: 'manual', label: '手动处理', title: '打开说书人手动处理工具' }
    ],
    identity: [
      { tool: 'identity', label: '身份确认', title: '打开身份确认面板' },
      { tool: 'manual', label: '手动处理', title: '打开说书人手动处理工具' }
    ],
    night: [
      { tool: 'night', label: '夜晚技能', title: '打开夜晚技能工具' },
      { tool: 'manual', label: '手动处理', title: '打开说书人手动处理工具' }
    ],
    day: [
      { tool: 'vote', label: '白天投票', title: '打开白天与投票处决工具' },
      { tool: 'manual', label: '手动处理', title: '打开说书人手动处理工具' }
    ],
    vote: [
      { tool: 'vote', label: '投票处决', title: '打开投票处决工具' },
      { tool: 'manual', label: '手动处理', title: '打开说书人手动处理工具' }
    ],
    'game-end': [
      { tool: 'game-end', label: '结局确认', title: '打开结局确认面板' },
      { tool: 'review', label: '复盘分析', title: '打开结局后的复盘分析面板' }
    ]
  };
  const ROLE_DISPLAY_NAME_FALLBACKS = {
    washerwoman: '洗衣妇',
    librarian: '图书管理员',
    investigator: '调查员',
    chef: '厨师',
    empath: '共情者',
    fortuneteller: '占卜师',
    'fortune-teller': '占卜师',
    undertaker: '掘墓人',
    monk: '僧侣',
    ravenkeeper: '守鸦人',
    slayer: '杀手',
    soldier: '士兵',
    mayor: '市长',
    butler: '管家',
    drunk: '酒鬼',
    recluse: '陌客',
    saint: '圣徒',
    poisoner: '投毒者',
    spy: '间谍',
    scarletwoman: '猩红女人',
    'scarlet-woman': '猩红女人',
    baron: '男爵',
    imp: '小恶魔',
    sailor: '水手',
    chambermaid: '侍女',
    innkeeper: '旅店老板',
    professor: '教授',
    devilsadvocate: '恶魔代言人',
    assassin: '刺客',
    shabaloth: '沙巴洛斯',
    grandmother: '祖母',
    balloonist: '气球驾驶员',
    dreamer: '筑梦师',
    snakecharmer: '舞蛇人',
    gambler: '赌徒',
    savant: '博学者',
    philosopher: '哲学家',
    amnesiac: '失忆者',
    cannibal: '食人族',
    sweetheart: '心上人',
    mutant: '畸形秀演员',
    lunatic: '疯子',
    godfather: '教父',
    cerenovus: '洗脑师',
    pithag: '麻脸巫婆',
    'pit-hag': '麻脸巫婆',
    widow: '寡妇',
    vigormortis: '亡骨魔',
    fanggu: '方古',
    apprentice: '学徒',
    barista: '咖啡师',
    zombuul: '僵怖',
    pukka: '亡灵法师',
    po: '珀',
    none: '无'
  };

  function normalizeRoleDisplayKey(roleId) {
    return String(roleId || '').trim().toLowerCase().replace(/_/g, '-');
  }

  function getFlowStageLabel(stage) {
    return FLOW_STAGE_LABELS[stage] || '流程';
  }

  function buildRightMenuStageToolsModel(stage = 'setup') {
    const safeStage = FLOW_STAGE_LABELS[stage] ? stage : 'setup';
    return (RIGHT_MENU_STAGE_TOOL_ITEMS[safeStage] || RIGHT_MENU_STAGE_TOOL_ITEMS.setup).map((item) => ({ ...item }));
  }

  function buildStageGuideModel({
    activeStage = 'setup',
    setupBadge = '准备',
    identityBadge = '未发送',
    nightBadge = '未开始',
    dayBadge = '未开始',
    voteBadge = '未开始',
    gameEndBadge = '未开始',
    dayVote = {},
    rolesDealt = false,
    identityComplete = false,
    dayResolved = false
  } = {}) {
    const nomination = dayVote.nomination || {};
    const voting = dayVote.voting || {};
    const voteCount = dayVote.voteCount || {};
    const voteActive = voting.status === 'open'
      || voteCount.status === 'counted'
      || dayResolved
      || nomination.status === 'recorded';
    const waitingForIdentity = rolesDealt && !identityComplete && activeStage === 'identity';
    const stageNightBadge = waitingForIdentity ? '待身份确认' : nightBadge;
    const stageDayBadge = waitingForIdentity ? '待第 1 天夜晚' : dayBadge;
    const stageVoteBadge = waitingForIdentity
      ? '待白天'
      : (voteActive ? voteBadge : (rolesDealt ? '待提名' : '未开始'));
    const stageGameEndBadge = waitingForIdentity ? '待后续' : gameEndBadge;

    return {
      setup: { label: setupBadge, active: activeStage === 'setup', done: rolesDealt },
      identity: { label: identityBadge, active: activeStage === 'identity', done: rolesDealt && identityComplete },
      night: { label: stageNightBadge, active: activeStage === 'night', done: ['day', 'vote', 'game-end'].includes(activeStage) },
      day: { label: stageDayBadge, active: activeStage === 'day', done: activeStage === 'vote' || dayResolved },
      vote: { label: stageVoteBadge, active: activeStage === 'vote', done: dayResolved },
      'game-end': { label: stageGameEndBadge, active: activeStage === 'game-end', done: gameEndBadge === '已结束' }
    };
  }

  function buildRightMenuFlowBoardModel({
    mainFlow = null,
    stageIndex = 0,
    stageCount = 6,
    phaseSnapshot = null,
    primaryButtonText = '',
    detailButtonTitle = '打开完整主流程面板',
    blockerText = ''
  } = {}) {
    const flow = mainFlow || {};
    const safeStage = flow.stage || 'setup';
    const safeStageCount = Number.isFinite(Number(stageCount)) && Number(stageCount) > 0 ? Number(stageCount) : 6;
    const unclampedStageIndex = Number.isFinite(Number(stageIndex)) ? Math.max(0, Number(stageIndex)) : 0;
    const safeStageIndex = Math.min(unclampedStageIndex, Math.max(0, safeStageCount - 1));
    const title = flow.title || '先完成配板准备';
    const detail = flow.detail || '创建或重连房间后，按当前人数生成配板方案。';
    const badge = flow.badge || '';
    const contextTitle = `${getFlowStageLabel(safeStage)}${badge ? ` · ${badge}` : ''}`;
    const stageOrderIndex = RIGHT_MENU_FLOW_STAGE_ORDER.indexOf(safeStage);
    const progressIndex = stageOrderIndex >= 0 ? stageOrderIndex : safeStageIndex;
    const progressItems = RIGHT_MENU_FLOW_STAGE_ORDER.map((stage, index) => ({
      stage,
      label: getFlowStageLabel(stage),
      active: stage === safeStage,
      done: index < progressIndex
    }));
    const authoritativeStrip = buildAuthoritativePhaseStripModel(phaseSnapshot);
    return {
      stage: safeStage,
      primaryStage: safeStage,
      primaryActionId: flow.primaryActionId || '',
      stepText: authoritativeStrip.stepText || `阶段 ${safeStageIndex + 1}/${safeStageCount}`,
      title,
      detail,
      progressMode: authoritativeStrip.mode || 'fixed',
      progressItems: authoritativeStrip.items.length ? authoritativeStrip.items : progressItems,
      toolItems: buildRightMenuStageToolsModel(safeStage),
      blockerText: blockerText || flow.blockedReason || '',
      primaryButtonText: primaryButtonText || `打开${getFlowStageLabel(safeStage)}面板`,
      primaryButtonDisabled: false,
      detailButtonTitle,
      contextTitle,
      contextDetail: detail
    };
  }

  function buildAuthoritativePhaseStripModel(phaseSnapshot = null) {
    const snapshot = phaseSnapshot && typeof phaseSnapshot === 'object' ? phaseSnapshot : {};
    if (snapshot.mode === 'opening' && Array.isArray(snapshot.openingSteps)) {
      return {
        mode: 'opening',
        stepText: '开局准备',
        items: snapshot.openingSteps.slice(0, 3).map((item) => ({
          key: item.key || '',
          label: item.label || '',
          status: item.status || 'next',
          active: item.status === 'current',
          done: item.status === 'done',
          detail: item.status === 'done' ? '已完成' : (item.status === 'current' ? '当前' : '下一步')
        }))
      };
    }
    const cycle = snapshot.cycle || {};
    if (snapshot.mode !== 'cycle' || !cycle.current) {
      return { mode: '', stepText: '', items: [] };
    }
    const status = snapshot.status || {};
    const sourceItems = [cycle.previous, cycle.current, cycle.next].filter(Boolean);
    return {
      mode: 'cycle',
      stepText: `${cycle.current.label || '当前阶段'} · ${status.label || '当前'}`,
      items: sourceItems.map((item, index) => ({
        key: item.kind || `phase-${index}`,
        stage: item.kind === 'game-end' || item.kind === 'ended' ? 'game-end' : item.kind,
        label: item.label || '',
        status: index === 0 ? 'done' : (index === 1 ? 'current' : 'next'),
        active: index === 1,
        done: index === 0,
        detail: index === 0
          ? '已完成'
          : (index === 1 ? (status.detail || status.label || '当前') : '下一阶段')
      }))
    };
  }

  function buildStatePreflightModel({
    roomId = '',
    occupied = 0,
    playerCount = 0,
    rolesDealt = false,
    gamePhase = ''
  } = {}) {
    const safeOccupied = Number(occupied || 0);
    const safePlayerCount = Number(playerCount || 0);
    const phaseLabel = gamePhase === 'night' ? '夜晚' : '白天';
    const checks = [
      {
        label: '房间',
        ok: Boolean(roomId),
        detail: roomId || '尚未创建'
      },
      {
        label: '座位',
        ok: Boolean(safeOccupied >= safePlayerCount),
        detail: `${safeOccupied}/${safePlayerCount}`
      },
      {
        label: '身份',
        ok: Boolean(rolesDealt),
        detail: rolesDealt ? '已发送' : '未发送'
      },
      {
        label: '阶段',
        ok: true,
        detail: phaseLabel
      }
    ];
    const allOk = checks.every((check) => check.ok);
    return {
      allOk,
      summaryClass: allOk ? 'is-go' : 'is-warn',
      headTitle: allOk ? '体检通过' : '仍需确认',
      headDetail: allOk ? '可以继续当前流程。' : '按提示补齐后再推进。',
      checks: checks.map((check) => ({
        ...check,
        status: check.ok ? 'OK' : 'WAIT'
      }))
    };
  }

  function normalizeReceiptSummary(summary = {}, playerCount = 0) {
    const total = Number.isInteger(Number(summary.total)) && Number(summary.total) > 0
      ? Number(summary.total)
      : Number(playerCount || 0);
    const confirmedCount = Number.isInteger(Number(summary.confirmedCount))
      ? Number(summary.confirmedCount)
      : 0;
    const pendingSeats = Array.isArray(summary.pendingSeats)
      ? summary.pendingSeats.map((seat) => Number(seat)).filter((seat) => Number.isInteger(seat))
      : Array.from({ length: total }, (_, index) => index + 1);
    return { total, confirmedCount, pendingSeats };
  }

  function buildIdentityReceiptSectionsModel({
    rolesDealt = false,
    normalizedSummary = {},
    confirmedSeats = [],
    aiConfirmedSeats = [],
    emptySummaryText = '\u8eab\u4efd\u5c1a\u672a\u53d1\u9001\u3002'
  } = {}) {
    if (!rolesDealt) {
      return {
        emptyText: emptySummaryText,
        sections: []
      };
    }
    const safeConfirmedSeats = Array.isArray(confirmedSeats) ? confirmedSeats : [];
    const pendingSeats = Array.isArray(normalizedSummary.pendingSeats) ? normalizedSummary.pendingSeats : [];
    const aiConfirmedSet = new Set((Array.isArray(aiConfirmedSeats) ? aiConfirmedSeats : []).map((seat) => Number(seat)));
    return {
      emptyText: '',
      sections: [
        {
          title: '\u5df2\u6536\u5230\u8eab\u4efd\u56de\u6267',
          count: safeConfirmedSeats.length,
          items: safeConfirmedSeats.map((seat) => ({
            label: `${seat}\u53f7`,
            value: aiConfirmedSet.has(Number(seat)) ? 'AI\u6d4b\u8bd5\u81ea\u52a8\u56de\u6267' : '\u5df2\u56de\u6267',
            className: 'is-confirmed'
          })),
          emptyText: '\u6682\u65e0\u5df2\u56de\u6267\u73a9\u5bb6',
          open: true
        },
        {
          title: '\u5f85\u56de\u6267\u8eab\u4efd',
          count: pendingSeats.length,
          items: pendingSeats.map((seat) => ({
            label: `${seat}\u53f7`,
            value: '\u5f85\u73a9\u5bb6\u56de\u6267'
          })),
          emptyText: '\u5168\u90e8\u73a9\u5bb6\u5df2\u56de\u6267',
          open: pendingSeats.length > 0
        }
      ]
    };
  }

  function buildIdentityReceiptPanelModel({
    rolesDealt = false,
    playerCount = 0,
    summary = {}
  } = {}) {
    if (!rolesDealt) {
      const notDealtSummary = normalizeReceiptSummary({}, playerCount);
      const notDealtEmptySummaryText = '\u8eab\u4efd\u5c1a\u672a\u53d1\u9001\uff1b\u5148\u5b8c\u6210\u914d\u677f\u5e76\u70b9\u51fb\u201c\u53d1\u9001\u89d2\u8272\u201d\u3002';
      return {
        badge: '\u672a\u53d1\u9001',
        complete: false,
        statusText: '\u53d1\u9001\u8eab\u4efd\u540e\uff0c\u8fd9\u91cc\u53ea\u67e5\u770b\u73a9\u5bb6\u56de\u6267\u72b6\u6001\u3002',
        cards: [
          { label: '\u72b6\u6001', value: '\u672a\u53d1\u9001', tone: '' },
          { label: '\u5df2\u56de\u6267', value: `0/${Number(playerCount || 0)}`, tone: '' },
          { label: '\u4e0b\u4e00\u6b65', value: '\u56de\u5230\u914d\u677f\u53d1\u8eab\u4efd', tone: '' }
        ],
        waitButton: {
          disabled: true,
          text: '\u67e5\u770b\u56de\u6267',
          title: '\u8eab\u4efd\u5c1a\u672a\u53d1\u9001'
        },
        continueButton: {
          disabled: true,
          text: '\u7ee7\u7eed\u9996\u591c',
          title: '\u5148\u53d1\u9001\u8eab\u4efd'
        },
        actionReason: {
          title: '\u8eab\u4efd\u672a\u53d1\u9001',
          detail: '\u8eab\u4efd\u56de\u6267\u4e0d\u662f\u7b2c\u4e8c\u5957\u4e3b\u6d41\u7a0b\uff1b\u8bf7\u5148\u5728\u914d\u677f\u9762\u677f\u53d1\u9001\u8eab\u4efd\u3002'
        },
        emptySummaryText: notDealtEmptySummaryText,
        normalizedSummary: notDealtSummary,
        confirmedSeats: [],
        summarySections: buildIdentityReceiptSectionsModel({
          rolesDealt: false,
          normalizedSummary: notDealtSummary,
          confirmedSeats: [],
          emptySummaryText: notDealtEmptySummaryText
        })
      };
    }

    const normalizedSummary = normalizeReceiptSummary(summary, playerCount);
    const confirmedSeats = Array.from({ length: normalizedSummary.total }, (_, index) => index + 1)
      .filter((seat) => !normalizedSummary.pendingSeats.includes(seat));
    const complete = normalizedSummary.confirmedCount >= normalizedSummary.total || normalizedSummary.pendingSeats.length === 0;
    const pendingText = normalizedSummary.pendingSeats.join('\u3001') || '\u65e0';
    const aiConfirmedSeats = Array.isArray(summary.aiConfirmedSeats) ? summary.aiConfirmedSeats : [];
    const aiConfirmedCount = Number.isInteger(Number(summary.aiConfirmedCount)) ? Number(summary.aiConfirmedCount) : aiConfirmedSeats.length;
    const aiNote = aiConfirmedCount > 0 ? `\u5176\u4e2d ${aiConfirmedCount} \u4e2a\u662f AI \u6d4b\u8bd5\u73a9\u5bb6\u81ea\u52a8\u56de\u6267\u3002` : '';
    return {
      badge: complete ? '\u56de\u6267\u5df2\u9f50' : `${normalizedSummary.confirmedCount}/${normalizedSummary.total}`,
      complete,
      statusText: complete
        ? `\u8eab\u4efd\u5df2\u53d1\u9001\uff0c\u73a9\u5bb6\u56de\u6267 ${normalizedSummary.confirmedCount}/${normalizedSummary.total}\uff1b\u4e0b\u4e00\u6b65\u5f00\u59cb\u9996\u591c\u3002${aiNote}`
        : `\u8eab\u4efd\u5df2\u53d1\u9001\uff0c\u73a9\u5bb6\u56de\u6267 ${normalizedSummary.confirmedCount}/${normalizedSummary.total}\uff1b\u8bf4\u4e66\u4eba\u53ef\u7b49\u5f85\u6216\u7ee7\u7eed\u9996\u591c\u3002${aiNote}`,
      cards: [
        { label: '\u5df2\u56de\u6267', value: `${normalizedSummary.confirmedCount}/${normalizedSummary.total}`, tone: complete ? 'ready' : '' },
        { label: '\u672a\u56de\u6267', value: `${normalizedSummary.pendingSeats.length} \u4eba`, tone: normalizedSummary.pendingSeats.length ? 'warning' : 'ready' },
        { label: '\u4e0b\u4e00\u6b65', value: complete ? '\u5f00\u59cb\u9996\u591c' : '\u53ef\u7ee7\u7eed\u9996\u591c', tone: '' }
      ],
      waitButton: {
        disabled: complete,
        text: complete ? '\u56de\u6267\u5df2\u9f50' : '\u7b49\u5f85\u56de\u6267',
        title: complete ? '\u6240\u6709\u73a9\u5bb6\u5df2\u56de\u6267\uff1b\u4e0b\u4e00\u6b65\u662f\u5f00\u59cb\u9996\u591c' : '\u7ee7\u7eed\u7b49\u5f85\u73a9\u5bb6\u5728\u624b\u673a\u7aef\u70b9\u51fb\u786e\u8ba4'
      },
      continueButton: {
        disabled: false,
        text: complete ? '\u5f00\u59cb\u9996\u591c' : '\u4ecd\u8981\u7ee7\u7eed\u9996\u591c',
        title: complete
          ? '\u6253\u5f00\u591c\u665a\u6280\u80fd\u9762\u677f\uff0c\u5f00\u59cb\u9996\u591c'
          : '\u4ecd\u6709\u73a9\u5bb6\u672a\u56de\u6267\uff1b\u7531\u8bf4\u4e66\u4eba\u51b3\u5b9a\u662f\u5426\u5148\u8fdb\u5165\u9996\u591c'
      },
      actionReason: {
        title: complete ? '\u8eab\u4efd\u56de\u6267\u5df2\u9f50' : '\u67e5\u770b\u8eab\u4efd\u56de\u6267',
        detail: complete
          ? `\u8eab\u4efd\u5df2\u7ecf\u53d1\u9001\u5e76\u6536\u5230\u5168\u90e8\u56de\u6267\uff0c\u8fd9\u91cc\u53ea\u662f\u56de\u6267\u67e5\u770b\uff1b\u53ef\u4ee5\u5f00\u59cb\u9996\u591c\u3002${aiNote}`
          : `\u672a\u56de\u6267\u5ea7\u4f4d\uff1a${pendingText}\u3002\u8fd9\u91cc\u4e0d\u9700\u8981\u518d\u6b21\u201c\u786e\u8ba4\u8eab\u4efd\u201d\uff1b\u53ef\u4ee5\u5148\u7b49\u56de\u6267\uff0c\u4e5f\u53ef\u4ee5\u7531\u8bf4\u4e66\u4eba\u51b3\u5b9a\u7ee7\u7eed\u9996\u591c\u3002${aiNote}`
      },
      normalizedSummary,
      confirmedSeats,
      summarySections: buildIdentityReceiptSectionsModel({
        rolesDealt: true,
        normalizedSummary,
        confirmedSeats,
        aiConfirmedSeats
      })
    };
  }

  function buildSetupReadinessChecklistModel({
    roomId = '',
    occupied = 0,
    playerCount = 0,
    scriptName = '',
    hasCandidate = false,
    confirmed = false,
    bluffs = [],
    rolesDealt = false
  } = {}) {
    const allSeated = Boolean(roomId && Number(occupied) === Number(playerCount));
    const bluffCount = Array.isArray(bluffs) ? bluffs.length : 0;
    const items = [
      {
        label: '\u623f\u95f4',
        value: roomId ? `\u5df2\u8fde\u63a5 ${roomId}` : '\u672a\u521b\u5efa',
        state: roomId ? 'ready' : 'blocked'
      },
      {
        label: '\u843d\u5ea7',
        value: `${Number(occupied || 0)}/${Number(playerCount || 0)}`,
        state: allSeated ? 'ready' : roomId ? 'warn' : 'blocked'
      },
      {
        label: '\u677f\u5b50',
        value: scriptName || '\u672a\u9009\u62e9',
        state: scriptName ? 'ready' : 'blocked'
      },
      {
        label: '配板方案',
        value: confirmed ? '\u5df2\u786e\u8ba4' : hasCandidate ? '\u5f85\u786e\u8ba4' : '\u672a\u751f\u6210',
        state: confirmed ? 'ready' : hasCandidate ? 'warn' : 'blocked'
      },
      {
        label: '\u6076\u9b54\u4f2a\u88c5',
        value: bluffCount ? bluffs.join('\u3001') : '\u5f85\u751f\u6210',
        state: bluffCount >= 3 ? 'ready' : confirmed ? 'warn' : 'blocked'
      },
      {
        label: '\u73a9\u5bb6\u9690\u79c1',
        value: '\u53ea\u53d1\u672c\u4eba\u8eab\u4efd',
        state: 'ready'
      }
    ];
    const blockedCount = items.filter((item) => item.state === 'blocked').length;
    const warnCount = items.filter((item) => item.state === 'warn').length;
    const title = rolesDealt
      ? '\u8eab\u4efd\u5df2\u53d1\u9001'
      : blockedCount
        ? `\u8fd8\u5dee ${blockedCount} \u9879`
        : warnCount
          ? `\u5f85\u786e\u8ba4 ${warnCount} \u9879`
          : '\u53ef\u4ee5\u53d1\u9001\u8eab\u4efd';
    return {
      title,
      items,
      blockedCount,
      warnCount,
      footnote: '\u53d1\u9001\u8eab\u4efd\u524d\u8bf7\u786e\u8ba4\u677f\u5b50\u3001\u4eba\u6570\u3001\u89d2\u8272\u5206\u5e03\u548c\u6076\u9b54\u4f2a\u88c5\uff1b\u73a9\u5bb6\u7aef\u4ecd\u53ea\u80fd\u770b\u5230\u81ea\u5df1\u7684\u771f\u5b9e\u8eab\u4efd\u3002'
    };
  }

  function resolveSetupCandidateRoleName(roleId, fallbackRole, helpers = {}) {
    if (typeof helpers.getSetupCandidateRoleName === 'function') {
      return helpers.getSetupCandidateRoleName(roleId, fallbackRole);
    }
    if (typeof helpers.getRoleDisplayName === 'function') {
      const displayName = helpers.getRoleDisplayName(roleId);
      if (displayName) return displayName;
    }
    if (fallbackRole?.name) return fallbackRole.name;
    return roleId || '\u672a\u77e5\u89d2\u8272';
  }

  function buildSetupCandidateSummaryModel({
    candidate = null,
    helpers = {}
  } = {}) {
    if (!candidate) {
      return {
        emptyText: '还没有配板方案。点击“生成配板”，再核对身份和恶魔伪装。',
        headerText: '',
        sections: []
      };
    }
    const count = candidate.effectiveCounts || candidate.teamCounts || {};
    const playerCount = Array.isArray(candidate.seatCandidates)
      ? candidate.seatCandidates.length
      : Number(candidate.playerCount || 0);
    const teamText = `民 ${count.townsfolk ?? '-'} / 外 ${count.outsider ?? count.outsiders ?? '-'} / 爪 ${count.minion ?? count.minions ?? '-'} / 恶 ${count.demon ?? count.demons ?? '-'}`;
    const editedText = candidate.storytellerEdited ? '已手动调整，确认前请复核。' : '确认前可继续重生成或拖拽调整。';
    const headerText = `当前配板方案：${playerCount || '-'} 人局（${teamText}）。${editedText}`;
    const seatItems = (Array.isArray(candidate.seatCandidates) ? candidate.seatCandidates : []).map((seatCandidate) => ({
      label: `${seatCandidate.seat}号`,
      value: resolveSetupCandidateRoleName(seatCandidate.trueRoleId || seatCandidate.roleId, seatCandidate.role, helpers)
    }));
    const bluffItems = (Array.isArray(candidate.demonBluffs) ? candidate.demonBluffs : []).map((roleId, index) => ({
      label: `伪装${index + 1}`,
      value: resolveSetupCandidateRoleName(roleId, null, helpers)
    }));
    return {
      emptyText: '',
      headerText,
      sections: [
        {
          title: '恶魔伪装',
          count: bluffItems.length,
          items: bluffItems,
          emptyText: '未生成伪装',
          open: true
        },
        {
          title: '身份预览',
          count: seatItems.length,
          items: seatItems,
          emptyText: '暂无座位身份',
          open: true
        }
      ]
    };
  }

  function buildDealConfirmPanelModel({
    candidate = null,
    occupied = 0,
    playerCount = 0,
    rolesDealt = false,
    helpers = {}
  } = {}) {
    if (!candidate) {
      return {
        ready: false,
        confirmDisabled: true,
        statusItems: ['\u8bf7\u5148\u786e\u8ba4\u914d\u677f'],
        seatItems: [],
        bluffItems: []
      };
    }

    const count = candidate.effectiveCounts || candidate.teamCounts || {};
    const seatCandidates = Array.isArray(candidate.seatCandidates)
      ? [...candidate.seatCandidates].sort((a, b) => Number(a.seat) - Number(b.seat))
      : [];
    const seatItems = seatCandidates.map((seatCandidate) => {
      const roleId = typeof helpers.getSetupCandidateRoleId === 'function'
        ? helpers.getSetupCandidateRoleId(seatCandidate)
        : (seatCandidate.trueRoleId || seatCandidate.roleId || '');
      const shownRoleId = seatCandidate.shownRoleId || '';
      const shownRoleName = shownRoleId && shownRoleId !== roleId
        ? resolveSetupCandidateRoleName(shownRoleId, seatCandidate.shownRole, helpers)
        : '';
      const iconId = typeof helpers.getRoleIconId === 'function'
        ? helpers.getRoleIconId(roleId, seatCandidate)
        : roleId;
      return {
        seat: seatCandidate.seat,
        roleId,
        team: typeof helpers.getSetupCandidateRoleTeam === 'function'
          ? helpers.getSetupCandidateRoleTeam(roleId, seatCandidate.role)
          : (seatCandidate.role?.team || ''),
        roleName: resolveSetupCandidateRoleName(roleId, seatCandidate.role, helpers),
        shownRoleName,
        iconId: iconId || roleId || ''
      };
    });
    const bluffItems = (Array.isArray(candidate.demonBluffs) ? candidate.demonBluffs : []).map((roleId, index) => ({
      label: `\u4f2a\u88c5${index + 1}`,
      value: resolveSetupCandidateRoleName(roleId, null, helpers)
    }));
    const statusItems = [
      `${Number(occupied || 0)}/${Number(playerCount || 0)} 已落座`,
      `阵营：民 ${count.townsfolk ?? '-'} / 外 ${count.outsider ?? count.outsiders ?? '-'} / 爪 ${count.minion ?? count.minions ?? '-'} / 恶 ${count.demon ?? count.demons ?? '-'}`,
      candidate.storytellerEdited ? '已手动调整' : '配板已确认，发送前可复核'
    ];
    return {
      ready: true,
      confirmDisabled: Boolean(rolesDealt) || seatItems.length !== Number(playerCount || 0),
      statusItems,
      seatItems,
      bluffItems
    };
  }

  function buildSetupDealPanelModel({
    roomId = '',
    occupied = 0,
    playerCount = 0,
    hasCandidate = false,
    confirmed = false,
    rolesDealt = false,
    setupBusy = false,
    setupBusyAction = '',
    candidateEdited = false,
    receiptSummary = {}
  } = {}) {
    const normalizedReceipt = normalizeReceiptSummary(receiptSummary, playerCount);
    const fillAiDisabled = setupBusy || !roomId || Number(occupied) >= Number(playerCount) || rolesDealt;
    const generateDisabled = setupBusy || confirmed || rolesDealt;
    const confirmDisabled = setupBusy || !hasCandidate || confirmed || rolesDealt;
    const dealDisabled = setupBusy || !confirmed || rolesDealt;
    const resetDisabled = setupBusy || (!hasCandidate && !confirmed) || rolesDealt;
    const busyReason = '\u6b63\u5728\u5904\u7406\u914d\u677f\uff0c\u8bf7\u7a0d\u7b49\u3002';
    const roleLockedReason = '\u8eab\u4efd\u5df2\u53d1\u9001\uff0c\u672c\u5c40\u4e0d\u80fd\u518d\u4fee\u6539\u914d\u677f\u3002';
    const fillAiReason = setupBusy
      ? busyReason
      : rolesDealt
        ? '\u8eab\u4efd\u5df2\u53d1\u9001\uff0c\u672c\u5c40\u4e0d\u80fd\u518d\u586b\u5145 AI \u6d4b\u8bd5\u73a9\u5bb6\u3002'
        : !roomId
          ? '\u8bf7\u5148\u521b\u5efa\u6216\u91cd\u8fde\u623f\u95f4\u3002'
          : Number(occupied) >= Number(playerCount)
            ? '\u623f\u95f4\u5df2\u6ee1\u5458\u3002'
            : '';
    const generateReason = setupBusy
      ? busyReason
      : rolesDealt
        ? roleLockedReason
        : confirmed
          ? '\u914d\u677f\u5df2\u786e\u8ba4\uff1b\u5982\u9700\u91cd\u65b0\u751f\u6210\uff0c\u5148\u70b9\u201c\u91cd\u7f6e\u914d\u677f\u201d\u3002'
          : '';
    const confirmReason = setupBusy
      ? busyReason
      : rolesDealt
        ? roleLockedReason
        : confirmed
          ? '\u914d\u677f\u5df2\u786e\u8ba4\u3002'
          : !hasCandidate
            ? '\u8bf7\u5148\u751f\u6210配板方案\u3002'
            : '';
    const dealReason = setupBusy
      ? busyReason
      : rolesDealt
        ? '\u8eab\u4efd\u5df2\u53d1\u9001\u3002'
        : !confirmed
          ? '\u8bf7\u5148\u786e\u8ba4\u914d\u677f\u3002'
          : '';
    const resetReason = setupBusy
      ? busyReason
      : rolesDealt
        ? roleLockedReason
        : (!hasCandidate && !confirmed)
          ? '\u6682\u65e0\u53ef\u91cd\u7f6e\u7684\u914d\u677f\u3002'
          : '';
    const primaryActionId = rolesDealt || confirmed
      ? 'btn-deal-roles'
      : hasCandidate
        ? 'btn-confirm-setup-candidate'
        : 'btn-generate-setup-candidate';

    let statusText = '\u521b\u5efa\u6216\u91cd\u8fde\u623f\u95f4\u540e\u5f00\u59cb\u3002';
    if (setupBusy) {
      statusText = setupBusyAction === 'generate'
        ? '\u6b63\u5728\u751f\u6210\u65b0\u7684配板方案...'
        : setupBusyAction === 'confirm'
          ? '\u6b63\u5728\u786e\u8ba4\u5e76\u9501\u5b9a\u5f53\u524d\u914d\u677f...'
          : setupBusyAction === 'deal'
            ? '\u6b63\u5728\u6d3e\u53d1\u4e2d\uff0c\u8bf7\u7a0d\u7b49...'
            : setupBusyAction === 'reset'
              ? '\u6b63\u5728\u91cd\u7f6e\u914d\u677f...'
              : '\u6b63\u5728\u5904\u7406...';
    } else if (rolesDealt) {
      statusText = `\u8eab\u4efd\u5df2\u53d1\u9001\uff0c\u73a9\u5bb6\u56de\u6267 ${normalizedReceipt.confirmedCount}/${normalizedReceipt.total}\uff0c\u4e0b\u4e00\u6b65\u5f00\u59cb\u9996\u591c\u3002`;
    } else if (confirmed) {
      statusText = '\u914d\u677f\u5df2\u786e\u8ba4\u5e76\u9501\u5b9a\uff1b\u5982\u9700\u4fee\u6539\u8bf7\u5148\u91cd\u7f6e\u914d\u677f\u3002';
    } else if (hasCandidate) {
      statusText = candidateEdited
        ? '配板方案\u5df2\u624b\u52a8\u8c03\u6574\uff0c\u786e\u8ba4\u540e\u624d\u4f1a\u9501\u5b9a\u5e76\u53ef\u53d1\u9001\u3002'
        : 'AI配板方案\u5df2\u751f\u6210\uff1b\u786e\u8ba4\u524d\u53ef\u4ee5\u53cd\u590d\u91cd\u65b0\u751f\u6210\u6216\u70b9 token \u8c03\u6574\u3002';
    } else if (roomId) {
      statusText = `\u843d\u5ea7 ${Number(occupied || 0)}/${Number(playerCount || 0)}\uff1b\u6ee1\u5458\u540e\u53ef\u751f\u6210\u914d\u677f\uff0c\u6d4b\u8bd5\u6a21\u5f0f\u53ef\u5148\u586b\u6ee1 AI \u73a9\u5bb6\u3002`;
    }

    return {
      primaryActionId,
      statusText,
      buttons: {
        fillAi: {
          disabled: fillAiDisabled,
          reason: fillAiReason,
          title: '\u586b\u6ee1 AI \u6d4b\u8bd5\u73a9\u5bb6'
        },
        generate: {
          disabled: generateDisabled,
          reason: generateReason,
          title: '\u751f\u6210\u6216\u91cd\u65b0\u751f\u6210配板方案',
          text: setupBusy && setupBusyAction === 'generate'
            ? '\u751f\u6210\u4e2d...'
            : hasCandidate && !confirmed ? '\u91cd\u65b0\u751f\u6210\u914d\u677f' : '\u751f\u6210\u914d\u677f'
        },
        confirm: {
          disabled: confirmDisabled,
          reason: confirmReason,
          title: '\u786e\u8ba4\u5e76\u9501\u5b9a\u5f53\u524d\u914d\u677f',
          text: setupBusy && setupBusyAction === 'confirm'
            ? '\u786e\u8ba4\u4e2d...'
            : confirmed ? '\u5df2\u786e\u8ba4\u914d\u677f' : '\u786e\u8ba4\u914d\u677f'
        },
        deal: {
          disabled: dealDisabled,
          reason: dealReason,
          title: '\u6253\u5f00\u53d1\u9001\u8eab\u4efd\u786e\u8ba4\u5f39\u7a97',
          text: setupBusy && setupBusyAction === 'deal'
            ? '\u53d1\u9001\u4e2d...'
            : rolesDealt ? '\u8eab\u4efd\u5df2\u53d1\u9001' : '\u53d1\u9001\u8eab\u4efd'
        },
        reset: {
          disabled: resetDisabled,
          reason: resetReason,
          title: '\u91cd\u7f6e\u5f53\u524d配板方案',
          text: setupBusy && setupBusyAction === 'reset' ? '\u91cd\u7f6e\u4e2d...' : '\u91cd\u7f6e\u914d\u677f'
        }
      },
      emptySummaryText: '\u5c1a\u65e0待确认结果\u3002'
    };
  }

  function buildNightResolutionHeaderModel({
    rolesDealt = false,
    hasBatch = false,
    hasCandidates = false,
    collectionClosed = false,
    nightResolvedAwaitingDay = false,
    currentNightLabel = '\u9996\u591c',
    nextNightLabel = '\u9996\u591c',
    nightSummaryCount = 0,
    candidateCount = 0
  } = {}) {
    const hasNightFeedback = Number(nightSummaryCount || 0) > 0;
    const nextStepText = !rolesDealt
      ? '\u5148\u53d1\u9001\u8eab\u4efd'
      : nightResolvedAwaitingDay
        ? '\u8fdb\u5165\u767d\u5929\u53d1\u8a00'
        : !hasBatch && !hasCandidates
          ? `\u70b9\u51fb\u201c\u5f00\u59cb${nextNightLabel}\u201d`
        : hasBatch && !collectionClosed
            ? (hasNightFeedback ? '点击“整理夜晚结果”' : '等待玩家行动或手动处理')
            : hasBatch && collectionClosed && !hasCandidates
              ? (hasNightFeedback ? '点击“整理夜晚结果”' : '还没有玩家行动')
              : hasCandidates
                ? '打开夜晚面板逐条确认或修改'
                : '\u7ee7\u7eed\u5f53\u524d\u6d41\u7a0b';
    const phaseTitle = nightResolvedAwaitingDay
      ? `${currentNightLabel}\u7ed3\u679c\u5df2\u786e\u8ba4`
      : hasCandidates
        ? '夜晚技能结果待确认'
        : hasBatch && collectionClosed
          ? (hasNightFeedback ? '可确认夜晚技能结果' : '等待玩家行动')
          : hasBatch
            ? (hasNightFeedback ? '等待行动' : '等待玩家行动')
            : rolesDealt
              ? `\u53ef\u5f00\u59cb${nextNightLabel}`
              : '\u7b49\u5f85\u8eab\u4efd';
    const countText = hasCandidates
      ? `${Number(candidateCount || 0)} \u6761夜晚结果`
      : `${Number(nightSummaryCount || 0)} \u6761\u8bb0\u5f55`;

    return {
      phaseTitle,
      nextStepText,
      countText
    };
  }

  function buildNightResolutionSummarySectionsModel({
    nightOrderCount = 0,
    nightSummaryCount = 0,
    candidateCount = 0,
    hasCandidateRows = false
  } = {}) {
    return [
      {
        key: 'official-order',
        bodySlot: 'orderRows',
        title: '\u5b98\u65b9\u591c\u5e8f',
        count: Number(nightOrderCount || 0),
        emptyText: '\u5f00\u59cb\u9996\u591c\u540e\u663e\u793a\u672c\u5c40\u591c\u95f4\u987a\u5e8f\u3002',
        open: true
      },
      {
        key: 'submissions',
        bodySlot: 'summaryRows',
        title: '\u63d0\u4ea4\u72b6\u6001',
        count: Number(nightSummaryCount || 0),
        emptyText: '\u6682\u65e0\u63d0\u4ea4\u3002',
        open: !hasCandidateRows
      },
      {
        key: 'candidates',
        bodySlot: 'candidateRows',
        title: '待确认结果',
        count: Number(candidateCount || 0),
        emptyText: '点击“整理夜晚结果”后在这里确认。',
        open: Boolean(hasCandidateRows)
      }
    ];
  }

  function buildNightFlowPanelModel({
    rolesDealt = false,
    hasBatch = false,
    hasCandidates = false,
    collectionClosed = false,
    nightResolvedAwaitingDay = false,
    dayFlowBlocking = false,
    localGameEndReady = false,
    pendingGameEnd = false,
    confirmedGameEnd = false,
    hasPendingNightCandidate = false,
    canPrepare = null,
    canFinishEmpty = false,
    currentNightLabel = '\u9996\u591c',
    nextNightLabel = '\u9996\u591c',
    nightSummaryCount = 0,
    candidateCount = 0
  } = {}) {
    const canStartNight = Boolean(rolesDealt)
      && !hasBatch
      && !nightResolvedAwaitingDay
      && !hasPendingNightCandidate
      && !dayFlowBlocking
      && !localGameEndReady
      && !pendingGameEnd
      && !confirmedGameEnd;
    const startDisabledReason = !rolesDealt
      ? '\u8bf7\u5148\u5b8c\u6210\u914d\u677f\u5e76\u53d1\u9001\u8eab\u4efd\u3002'
      : hasBatch
        ? `${currentNightLabel}已经开始；请在夜晚面板等待玩家行动或确认技能结果。`
        : hasPendingNightCandidate
          ? '还有夜晚结果未处理，确认或修改后才能进入下一阶段。'
          : nightResolvedAwaitingDay
            ? `${currentNightLabel}\u7ed3\u679c\u5df2\u786e\u8ba4\uff1b\u4e0b\u4e00\u6b65\u8fdb\u5165\u767d\u5929\u53d1\u8a00\uff0c\u4e0d\u8981\u91cd\u590d\u5f00\u59cb\u591c\u665a\u3002`
            : dayFlowBlocking
              ? '\u767d\u5929/\u6295\u7968\u8fd8\u672a\u6536\u5c3e\uff1b\u9700\u8981\u5b8c\u6210\u8ba1\u7968\u5e76\u786e\u8ba4\u5904\u51b3\u6216\u65e0\u5904\u51b3\u3002'
              : localGameEndReady || pendingGameEnd
                ? '\u5df2\u7ecf\u68c0\u6d4b\u5230\u80dc\u8d1f\u6761\u4ef6\uff0c\u8bf7\u5148\u8fdb\u5165\u7ed3\u5c40\u786e\u8ba4\u3002'
                : confirmedGameEnd
                  ? '\u672c\u5c40\u5df2\u7ed3\u675f\u3002'
                  : '';
    const hasNightFeedback = Number(nightSummaryCount || 0) > 0;
    const prepareReady = typeof canPrepare === 'boolean' ? canPrepare : hasNightFeedback;
    const primaryActionId = nightResolvedAwaitingDay
      ? 'btn-start-day-vote'
      : !rolesDealt
        ? 'btn-start-night-collection'
        : hasCandidates || canFinishEmpty
          ? 'btn-close-night-collection'
          : hasBatch
            ? 'btn-prepare-night-candidates'
            : 'btn-start-night-collection';
    const actionTitle = nightResolvedAwaitingDay
      ? `${currentNightLabel}\u7ed3\u679c\u5df2\u786e\u8ba4`
      : canFinishEmpty
        ? `${currentNightLabel}可结束`
        : hasCandidates
        ? `${currentNightLabel}待确认`
        : hasBatch
          ? (collectionClosed ? `${currentNightLabel}可确认结果` : `${currentNightLabel}等待行动`)
          : `${nextNightLabel}\u672a\u5f00\u59cb`;
    const actionDetail = nightResolvedAwaitingDay
      ? '本轮夜晚结果已经全部确认或修改完成；下一步请打开“白天发言”并进入白天。'
      : canFinishEmpty
        ? '本夜没有待确认结果；打开夜晚面板，确认结束本夜后由服务器检查胜负并进入白天。'
        : hasCandidates
        ? '打开夜晚面板逐条确认或修改结果；确认后才会发送玩家可见结果或写入魔典。'
        : hasBatch
          ? (!hasNightFeedback
            ? '当前还没有玩家行动；先等玩家提交夜晚动作，或打开“手动处理”由说书人直接裁定。'
            : (collectionClosed
              ? '下一步整理夜晚结果。'
              : `已收到 ${nightSummaryCount} 条行动；点击“整理夜晚结果”会锁定本夜提交并生成待确认结果。`))
          : (dayFlowBlocking
            ? '\u767d\u5929/\u6295\u7968\u672a\u6536\u5c3e\uff0c\u5148\u5b8c\u6210\u8ba1\u7968\u5e76\u786e\u8ba4\u5904\u51b3\u6216\u65e0\u5904\u51b3\u3002'
            : (localGameEndReady || pendingGameEnd
              ? '\u80dc\u8d1f\u6761\u4ef6\u5df2\u51fa\u73b0\uff0c\u5148\u5904\u7406\u7ed3\u5c40\u786e\u8ba4\u3002'
              : (rolesDealt
                ? `\u70b9\u51fb\u201c\u5f00\u59cb${nextNightLabel}\u201d\u540e\uff0c系统会按夜序等待玩家行动\u3002`
                : '\u8bf7\u5148\u5b8c\u6210\u914d\u677f\u5e76\u53d1\u9001\u8eab\u4efd\u3002')));
    const statusText = !rolesDealt
      ? '身份发出后开始第 1 天夜晚行动\uff1b\u4e4b\u540e\u767d\u5929\u6536\u5c3e\u4f1a\u56de\u5230\u591c\u665a\u3002'
      : nightResolvedAwaitingDay
        ? `${currentNightLabel}\u7ed3\u679c\u5df2\u786e\u8ba4\uff1b\u4e0b\u4e00\u6b65\u8fdb\u5165\u767d\u5929\u53d1\u8a00\u3002`
        : canFinishEmpty
          ? `${currentNightLabel}没有待确认结果；请确认结束本夜。`
        : hasCandidates
          ? '夜晚技能结果已整理，等待逐条确认。'
          : hasBatch && collectionClosed
            ? (hasNightFeedback
              ? `${currentNightLabel}可整理夜晚结果。`
              : `${currentNightLabel}还没有玩家行动，无法确认技能结果。请等待玩家或用“手动处理”裁定。`)
            : hasBatch
              ? (hasNightFeedback
                ? `${currentNightLabel}等待行动中；已收到 ${nightSummaryCount} 条行动，可确认夜晚技能结果。`
                : `${currentNightLabel}等待行动中；还没有玩家行动，暂不能确认夜晚技能结果。`)
              : `\u53ef\u5f00\u59cb${nextNightLabel}等待行动\u3002`;
    const summaryHeader = buildNightResolutionHeaderModel({
      rolesDealt,
      hasBatch,
      hasCandidates,
      collectionClosed,
      nightResolvedAwaitingDay,
      currentNightLabel,
      nextNightLabel,
      nightSummaryCount,
      candidateCount
    });
    const { phaseTitle, nextStepText } = summaryHeader;
    return {
      primaryActionId,
      statusText,
      actionReason: { title: actionTitle, detail: actionDetail },
      phaseTitle,
      nextStepText,
      summaryHeader,
      buttons: {
        start: {
          disabled: nightResolvedAwaitingDay ? false : !canStartNight,
          reason: nightResolvedAwaitingDay ? '' : startDisabledReason,
          title: nightResolvedAwaitingDay
            ? '进入白天发言'
            : `\u5f00\u59cb${nextNightLabel}等待玩家夜间行动`,
          text: nightResolvedAwaitingDay
            ? '进入白天'
            : (hasBatch ? `${currentNightLabel}\u5df2\u5f00\u59cb` : `\u5f00\u59cb${nextNightLabel}`)
        },
        close: {
          disabled: !rolesDealt,
          reason: !rolesDealt ? '请先完成配板并发送身份。' : '',
          title: '打开夜晚结果面板，查看顺序、提交状态和待确认结果。',
          text: '打开夜晚面板'
        },
        prepare: {
          disabled: !hasBatch || hasCandidates || !prepareReady,
          reason: !hasBatch
            ? `\u8bf7\u5148\u5f00\u59cb${nextNightLabel}接收\u3002`
            : hasCandidates
              ? '夜晚技能结果已整理，请打开夜晚面板逐条确认或修改。'
              : canFinishEmpty
                ? '本夜没有待确认结果，请使用“确认结束本夜并进入白天”。'
              : !prepareReady
                ? '还没有玩家行动，或仍有必填夜晚行动未提交，暂不能整理夜晚结果。'
                : '',
          title: !prepareReady
            ? (canFinishEmpty ? '本夜没有待确认结果' : '仍有必填夜晚行动未提交')
            : collectionClosed
              ? '根据已收到的行动整理待确认结果'
              : '锁定当前提交并整理待确认结果',
          text: !hasBatch || prepareReady || hasCandidates ? '整理夜晚结果' : '等待行动'
        }
      },
      cards: [
        { label: '\u591c\u665a', value: currentNightLabel, tone: rolesDealt ? 'ready' : 'warning' },
        { label: '行动', value: hasBatch ? `${nightSummaryCount} \u6761` : collectionClosed ? '\u5df2\u5173\u95ed' : '\u672a\u5f00\u59cb', tone: '' },
        { label: '\u591c\u665a\u7ed3\u679c', value: hasCandidates ? `${candidateCount} \u6761待确认` : nightResolvedAwaitingDay ? '\u5df2\u5b8c\u6210' : canFinishEmpty ? '无待确认结果' : hasBatch && !prepareReady ? '等行动' : '\u5f85\u751f\u6210', tone: nightResolvedAwaitingDay || canFinishEmpty ? 'ready' : hasCandidates ? 'warning' : '' }
      ]
    };
  }


  const DAY_ATTENTION_ROLE_HINTS = {
    slayer: '白天一次可公开发动；命中恶魔才会死亡，务必由说书人确认。',
    virgin: '首次被镇民提名时会处死提名者；记录提名前先确认提名者阵营。',
    mayor: '3 人存活且白天无处决时可能触发市长胜利；收尾前检查胜负。',
    saint: '若被处决会使邪恶阵营胜利；确认处决前必须复核。',
    butler: '投票需跟随主人；投票阶段可由说书人提醒或记录投票。',
    cannibal: '处决后获得被处决者能力；白天收尾时记录来源角色。',
    gossip: '白天公开流言；若流言为真，夜晚会有人死亡。',
    juggler: '第一天公开杂耍猜测；夜晚前记录猜测内容。',
    savant: '白天拜访说书人获取两条信息；建议私下发送并留日志。',
    artist: '白天一次向说书人提问；答复前先确认是否已用。',
    seamstress: '白天一次选择两名玩家询问阵营是否相同；需要私信结果。',
    virgin_nomination: '提名触发类能力；记录提名前先复核。',
    mutant: '疯狂/公开发言相关；需要说书人判断是否处决。',
    cerenovus: '洗脑疯狂会影响白天发言；必要时可自由处决但需记录原因。',
    'pit-hag': '可能造成角色变化；白天公开状态前确认昨夜改动。',
    pit_hag: '可能造成角色变化；白天公开状态前确认昨夜改动。',
    scarlet_woman: '5 人以上恶魔死亡时可能接替恶魔；处决恶魔后检查。',
    scarletwoman: '5 人以上恶魔死亡时可能接替恶魔；处决恶魔后检查。',
    town_crier: '明晚信息依赖今天是否有爪牙提名；白天提名请留记录。',
    flowergirl: '明晚信息依赖今天恶魔是否投票；投票请留记录。'
  };

  const DAY_ATTENTION_KEYWORDS = ['白天', '提名', '投票', '处决', '胜利', '发言', '疯狂', '公开', '猜测', '说书人'];

  function normalizeDayRoleId(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');
  }

  function formatDayDuration(seconds) {
    const total = Number(seconds);
    if (!Number.isFinite(total) || total <= 0) return '未设置';
    if (total < 60) return `${Math.round(total)} 秒`;
    const minutes = Math.floor(total / 60);
    const rest = Math.round(total % 60);
    return rest > 0 ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
  }

  function buildDayTimerUtilityItems(dayVote = {}) {
    const timer = dayVote.dayTimer || dayVote.timer || {};
    const status = timer.status || dayVote.timerStatus || 'not-started';
    const items = [
      { label: '状态', value: getDayTimerStatusLabel(status) },
      { label: '公聊时长', value: formatDayDuration(timer.durationSeconds) },
      { label: '本轮', value: `第 ${Number(dayVote.round || dayVote.dayNumber || 1) || 1} 天白天` }
    ];
    if (timer.startedAt) items.push({ label: '开始', value: String(timer.startedAt).replace('T', ' ').slice(0, 16) });
    if (status === 'not-started') {
      items[1] = { label: '公聊时长', value: '点击“开始白天”后默认 5 分钟' };
    }
    return items;
  }

  function buildDayAnnouncementItems({ dayVote = {}, aliveCount = null } = {}) {
    const timer = dayVote.dayTimer || dayVote.timer || {};
    const nomination = dayVote.nomination || {};
    const voting = dayVote.voting || {};
    const voteCount = dayVote.voteCount || {};
    const execution = dayVote.execution || {};
    const candidateExecution = voteCount.candidateExecution || null;
    const round = Number(dayVote.round || dayVote.dayNumber || 1) || 1;
    const items = [];

    if (timer.status && timer.status !== 'not-started') {
      const aliveText = Number.isFinite(Number(aliveCount)) ? `；存活 ${Number(aliveCount)} 人` : '';
      items.push({ label: '进入白天', value: `第 ${round} 天白天已开始${aliveText}` });
    }
    if (nomination.nominationId || nomination.status === 'recorded' || nomination.status === 'active') {
      items.push({ label: '公开提名', value: `${nomination.nominatorSeat || '-'} 号提名 ${nomination.nomineeSeat || '-'} 号` });
    }
    if (voting.status === 'open') {
      items.push({ label: '投票开启', value: `对 ${nomination.nomineeSeat || '-'} 号投票中` });
    }
    if (voteCount.status === 'counted') {
      items.push({ label: '计票公告', value: `${Number(voteCount.yes || 0)} 赞成 / ${Number(voteCount.no || 0)} 不举手 / ${Number(voteCount.total || 0)} 总票` });
    }
    if (candidateExecution?.status === 'pending-storyteller-confirmation') {
      items.push({ label: '待确认处决', value: candidateExecution.passes === false ? '未过半，等待确认无处决' : `${candidateExecution.nomineeSeat || '-'} 号待确认处决` });
    }
    if (execution.status === 'confirmed' || execution.status === 'no-execution-confirmed' || execution.effective === true) {
      items.push({ label: '处决结果', value: execution.effective ? `${execution.nomineeSeat || candidateExecution?.nomineeSeat || '-'} 号已处决` : '已确认无处决' });
    }

    return items;
  }

  function resolveDayPlayerRoleId(player = {}) {
    return player.roleId || player.trueRoleId || player.realRoleId || player.role || player.shownRoleId || '';
  }

  function buildDayAbilityHintItems({ players = [], helpers = {}, maxItems = 6 } = {}) {
    const items = [];
    const sourcePlayers = Array.isArray(players) ? players : [];
    sourcePlayers.forEach((player) => {
      const rawRoleId = resolveDayPlayerRoleId(player);
      const normalizedRoleId = normalizeDayRoleId(rawRoleId);
      if (!normalizedRoleId) return;
      const directHint = DAY_ATTENTION_ROLE_HINTS[normalizedRoleId] || DAY_ATTENTION_ROLE_HINTS[String(rawRoleId || '').trim()];
      const ability = String(player.ability || player.desc || player.roleAbility || '').trim();
      const abilityLooksDayRelated = ability && DAY_ATTENTION_KEYWORDS.some((keyword) => ability.includes(keyword));
      if (!directHint && !abilityLooksDayRelated) return;
      const roleName = player.roleName || player.nameZh || resolveRoleDisplayName(rawRoleId, helpers);
      const seatText = Number.isFinite(Number(player.seat)) ? `${Number(player.seat)}号` : '未落座';
      const alivePrefix = player.alive === false ? '已死亡，' : '';
      const fallbackHint = ability
        ? `技能可能影响白天：${ability.length > 46 ? `${ability.slice(0, 46)}…` : ability}`
        : '技能可能影响白天，请按角色库复核。';
      items.push({
        label: `${seatText} ${roleName}`,
        value: `${alivePrefix}${directHint || fallbackHint}`
      });
    });
    return items.slice(0, maxItems);
  }

  function buildDayUtilitySummaryModel({
    rolesDealt = false,
    dayAlreadyStarted = false,
    dayResolved = false,
    dayVote = {},
    players = [],
    aliveCount = null,
    helpers = {},
    nextNightLabel = '下一夜'
  } = {}) {
    const timerItems = buildDayTimerUtilityItems(dayVote);
    const announcementItems = buildDayAnnouncementItems({ dayVote, aliveCount });
    const abilityItems = rolesDealt
      ? buildDayAbilityHintItems({ players, helpers })
      : [];
    const timerStatus = (dayVote.dayTimer || dayVote.timer || {}).status || dayVote.timerStatus || 'not-started';
    const timerLabel = getDayTimerStatusLabel(timerStatus);
    const announcementCount = announcementItems.length;
    const abilityCount = abilityItems.length;

    let guidance = '先开始白天公聊；白天面板只负责发言、公告和技能提醒，提名投票在下一面板处理。';
    if (!rolesDealt) {
      guidance = '身份发送后，这里会显示白天公聊、公告和白天技能提醒。';
    } else if (!dayAlreadyStarted && timerStatus === 'not-started') {
      guidance = '下一步点击“开始白天”，玩家端会看到进入白天公告。';
    } else if (dayResolved) {
      guidance = `本轮白天已收尾；若没有胜负，请进入${nextNightLabel}。`;
    } else if (announcementCount > 0) {
      guidance = '白天进行中：控制公聊节奏，留意公告和可触发的白天技能。';
    }

    return {
      guidance,
      cards: [
        { label: '公聊', value: timerLabel, tone: timerStatus === 'running' ? 'warning' : timerStatus === 'ended' ? 'ready' : '' },
        { label: '公告', value: `${announcementCount} 条`, tone: announcementCount > 0 ? 'ready' : '' },
        { label: '白天技能', value: abilityCount > 0 ? `${abilityCount} 项` : '无强提示', tone: abilityCount > 0 ? 'warning' : '' }
      ],
      sections: [
        {
          title: '公聊计时',
          count: timerItems.length,
          open: true,
          emptyText: '暂无计时信息',
          items: timerItems
        },
        {
          title: '公开公告',
          count: announcementItems.length,
          open: announcementItems.length > 0,
          emptyText: '开始白天、提名、计票和处决会形成玩家可见公告。',
          items: announcementItems
        },
        {
          title: '白天技能提示',
          count: abilityItems.length,
          open: abilityItems.length > 0,
          emptyText: rolesDealt ? '暂无明显白天触发；按发言、提名、投票和处决推进。' : '发送身份后显示本局白天相关技能。',
          items: abilityItems
        }
      ]
    };
  }


  function buildDayFlowPanelModel({
    rolesDealt = false,
    dayAlreadyStarted = false,
    dayResolved = false,
    timerStatus = 'not-started',
    nominationStatus = '',
    nominationNominatorSeat = '',
    nominationNomineeSeat = '',
    votingStatus = '',
    votesCount = 0,
    eligibleVoteCount = 0,
    candidateExecution = null,
    execution = {},
    nextStepTitle = '',
    nextStepDetail = '',
    gamePhase = 'day'
  } = {}) {
    const candidateExists = Boolean(candidateExecution);
    const candidatePasses = candidateExecution && candidateExecution.passes !== false;
    const candidateYesVotes = candidateExecution && Number.isFinite(Number(candidateExecution.yesVotes))
      ? Number(candidateExecution.yesVotes)
      : 0;
    const executionEffective = Boolean(execution && execution.effective);
    const executionSeat = execution && execution.nomineeSeat ? execution.nomineeSeat : '';
    const startDisabled = !rolesDealt || dayAlreadyStarted;
    const startReason = !rolesDealt
      ? '\u8bf7\u5148\u5b8c\u6210\u914d\u677f\u5e76\u53d1\u9001\u8eab\u4efd\u3002'
      : '\u767d\u5929\u5df2\u7ecf\u5f00\u59cb\uff1b\u8bf7\u5728\u6295\u7968\u5904\u51b3\u9762\u677f\u7ee7\u7eed\u8bb0\u5f55\u63d0\u540d\u3001\u6295\u7968\u548c\u5904\u51b3\u3002';

    let statusText = '\u53ef\u5f00\u59cb\u767d\u5929\u8ba1\u65f6\u3002';
    let voteStatusText = '\u5148\u5f00\u59cb\u767d\u5929\uff0c\u518d\u8fdb\u5165\u63d0\u540d\u6295\u7968\u3002';
    if (!rolesDealt) {
      statusText = '\u8eab\u4efd\u53d1\u51fa\u540e\u53ef\u8fdb\u5165\u767d\u5929\u6d41\u7a0b\u3002';
      voteStatusText = '\u767d\u5929\u5f00\u59cb\u540e\u624d\u80fd\u8bb0\u5f55\u63d0\u540d\u3002';
    } else if (dayResolved) {
      statusText = executionEffective
        ? `${executionSeat} \u53f7\u5904\u51b3\u5df2\u786e\u8ba4\u3002`
        : '\u672c\u6b21\u6295\u7968\u5df2\u786e\u8ba4\u65e0\u5904\u51b3\uff0c\u53ef\u8fdb\u5165\u4e0b\u4e00\u591c\u3002';
      voteStatusText = executionEffective
        ? `${executionSeat} \u53f7\u5904\u51b3\u5df2\u786e\u8ba4\u3002`
        : '\u6295\u7968\u5df2\u6536\u5c3e\uff0c\u65e0\u5904\u51b3\u3002';
    } else if (candidateExists) {
      statusText = candidateExecution.passes === false
        ? `\u8ba1\u7968\u7ed3\u679c\uff1a${candidateYesVotes} \u7968\u672a\u8fc7\u534a\uff0c\u7b49\u5f85\u786e\u8ba4\u65e0\u5904\u51b3\u3002`
        : `计票结果\uff1a${candidateYesVotes} \u7968\uff0c\u7b49\u5f85\u8bf4\u4e66\u4eba\u786e\u8ba4\u3002`;
      voteStatusText = candidateExecution.passes === false
        ? '\u8ba1\u7968\u672a\u8fc7\u5904\u51b3\u7ebf\uff0c\u70b9\u201c\u786e\u8ba4\u65e0\u5904\u51b3\u201d\u6536\u5c3e\u767d\u5929\u3002'
        : '计票结果\u5df2\u751f\u6210\uff0c\u70b9\u201c\u786e\u8ba4\u5904\u51b3\u201d\u540e\u624d\u4f1a\u751f\u6548\u3002';
    } else if (votingStatus === 'open') {
      statusText = '\u6295\u7968\u5f00\u542f\u4e2d\uff0c\u73a9\u5bb6\u53ef\u81ea\u6295\uff0c\u8bf4\u4e66\u4eba\u53ef\u4ee3\u7968\u3002';
      voteStatusText = `\u6295\u7968\u5f00\u542f\u4e2d\uff0c\u5df2\u8bb0\u5f55 ${Number(votesCount || 0)} \u7968\u3002`;
    } else if (nominationStatus === 'recorded') {
      statusText = '\u63d0\u540d\u5df2\u8bb0\u5f55\uff0c\u53ef\u5f00\u542f\u6295\u7968\u3002';
      voteStatusText = `${nominationNominatorSeat} \u53f7\u63d0\u540d ${nominationNomineeSeat} \u53f7\uff0c\u53ef\u5f00\u542f\u6295\u7968\u3002`;
    } else if (timerStatus === 'running') {
      statusText = '\u767d\u5929\u8ba1\u65f6\u4e2d\uff0c\u53ef\u8bb0\u5f55\u516c\u5f00\u63d0\u540d\u3002';
      voteStatusText = '\u7b49\u5f85\u516c\u5f00\u63d0\u540d\uff1b\u5148\u586b\u63d0\u540d\u8005\u548c\u88ab\u63d0\u540d\u8005\uff0c\u518d\u8bb0\u5f55\u63d0\u540d\u3002';
    }

    return {
      statusText,
      voteStatusText,
      actionReason: {
        title: `\u4e0b\u4e00\u6b65\uff1a${nextStepTitle || '\u7ee7\u7eed\u767d\u5929\u6d41\u7a0b'}`,
        detail: nextStepDetail || '\u6309\u987a\u5e8f\u5b8c\u6210\u767d\u5929\u53d1\u8a00\u3001\u63d0\u540d\u3001\u6295\u7968\u548c\u5904\u51b3\u786e\u8ba4\u3002'
      },
      buttons: {
        start: {
          disabled: startDisabled,
          reason: startReason,
          title: '\u8fdb\u5165\u767d\u5929\u8ba1\u65f6',
          text: dayAlreadyStarted ? '\u767d\u5929\u5df2\u5f00\u59cb' : '\u5f00\u59cb\u767d\u5929'
        }
      },
      cards: [
        { label: '\u8eab\u4efd', value: rolesDealt ? '\u5df2\u53d1\u9001' : '\u672a\u53d1\u9001', tone: rolesDealt ? 'ready' : 'warning' },
        { label: '\u767d\u5929', value: dayAlreadyStarted ? '\u53d1\u8a00\u4e2d' : '\u672a\u5f00\u59cb', tone: dayAlreadyStarted ? 'ready' : '' },
        { label: '\u4e0b\u4e00\u6b65', value: dayAlreadyStarted ? '\u8bb0\u5f55\u63d0\u540d' : '\u5f00\u59cb\u767d\u5929', tone: '' }
      ],
      meta: {
        gamePhase,
        candidatePasses,
        votesCount: Number(votesCount || 0),
        eligibleVoteCount: Number(eligibleVoteCount || 0)
      }
    };
  }


  function buildVoteFlowPanelModel({
    rolesDealt = false,
    dayAlreadyStarted = false,
    dayResolved = false,
    timerStatus = 'not-started',
    nominationStatus = '',
    hasNomination = false,
    votingStatus = '',
    voteCountStatus = '',
    votesCount = 0,
    eligibleVoteCount = 0,
    candidateExecution = null,
    execution = {},
    nextNightLabel = '\u4e0b\u4e00\u591c'
  } = {}) {
    const candidatePending = voteCountStatus === 'counted' && candidateExecution?.status === 'pending-storyteller-confirmation';
    const executionEffective = execution?.effective === true;
    const nomineeSeat = execution?.nomineeSeat || candidateExecution?.nomineeSeat || '';
    const canUseDayActions = Boolean(rolesDealt) && dayAlreadyStarted && !dayResolved;
    const hasOpenableNomination = hasNomination || nominationStatus === 'recorded';
    const voteAlreadyStarted = Boolean(votingStatus && votingStatus !== 'closed')
      || voteCountStatus === 'counted'
      || Boolean(candidateExecution);
    const dayActionBlockedReason = !rolesDealt
      ? '\u8bf7\u5148\u5b8c\u6210\u914d\u677f\u5e76\u53d1\u9001\u8eab\u4efd\u3002'
      : !dayAlreadyStarted
        ? '\u8bf7\u5148\u5f00\u59cb\u767d\u5929\u3002'
        : dayResolved
          ? '\u672c\u8f6e\u767d\u5929\u5df2\u7ecf\u6536\u5c3e\uff1b\u5982\u9700\u7ee7\u7eed\uff0c\u8bf7\u8fdb\u5165\u4e0b\u4e00\u591c\u3002'
          : '';
    const buttons = {
      nomination: {
        disabled: !canUseDayActions || timerStatus === 'not-started' || hasNomination || ['recorded', 'active'].includes(nominationStatus),
        reason: dayActionBlockedReason || (timerStatus === 'not-started'
            ? '\u8bf7\u5148\u5f00\u59cb\u767d\u5929\u3002'
            : hasNomination || ['recorded', 'active'].includes(nominationStatus)
              ? '\u672c\u8f6e\u5df2\u8bb0\u5f55\u63d0\u540d\u3002'
              : ''),
        title: '\u8bb0\u5f55\u516c\u5f00\u63d0\u540d'
      },
      openVote: {
        disabled: !canUseDayActions || !hasOpenableNomination || voteAlreadyStarted,
        reason: dayActionBlockedReason || (!hasOpenableNomination
          ? '\u8bf7\u5148\u8bb0\u5f55\u63d0\u540d\u3002'
          : voteAlreadyStarted
            ? '\u6295\u7968\u5df2\u7ecf\u5f00\u542f\u6216\u5df2\u8ba1\u7968\uff0c\u4e0d\u8981\u91cd\u590d\u5f00\u542f\u3002'
            : ''),
        title: '\u5f00\u542f\u73a9\u5bb6\u6295\u7968'
      },
      proxyVote: {
        disabled: !canUseDayActions || votingStatus !== 'open',
        reason: dayActionBlockedReason || (votingStatus !== 'open' ? '\u6295\u7968\u5f00\u542f\u540e\u624d\u80fd\u4ee3\u7968\u3002' : ''),
        title: '\u7531\u8bf4\u4e66\u4eba\u4ee3\u8bb0\u4e00\u7968'
      },
      countVote: {
        disabled: !canUseDayActions || votingStatus !== 'open',
        reason: dayActionBlockedReason || (votingStatus !== 'open' ? '\u6295\u7968\u5f00\u542f\u540e\u624d\u80fd\u8ba1\u7968\u3002' : ''),
        title: '\u7edf\u8ba1\u6295\u7968\u5e76\u751f\u6210待确认处决'
      },
      confirm: {
        disabled: !canUseDayActions || !candidatePending,
        reason: dayActionBlockedReason || (candidatePending ? '' : '计票结果\u751f\u6210\u540e\u624d\u80fd\u786e\u8ba4\u5904\u51b3\u6216\u65e0\u5904\u51b3\u3002'),
        title: '确认本轮结果；只更新暂列处决，不立即改变玩家生死',
        text: '确认本轮结果'
      },
      manual: {
        disabled: !canUseDayActions,
        reason: !rolesDealt
          ? '\u8bf7\u5148\u5b8c\u6210\u914d\u677f\u5e76\u53d1\u9001\u8eab\u4efd\u3002'
          : !dayAlreadyStarted
            ? '\u81ea\u7531\u5904\u51b3\u53ea\u80fd\u5728\u767d\u5929\u5f00\u59cb\u540e\u4f7f\u7528\u3002'
            : dayResolved
              ? '\u672c\u8f6e\u767d\u5929\u5df2\u7ecf\u6536\u5c3e\uff1b\u5982\u9700\u7ee7\u7eed\uff0c\u8bf7\u8fdb\u5165\u4e0b\u4e00\u591c\u3002'
              : '',
        title: '\u4e0d\u8d70\u6295\u7968\u6d41\u7a0b\uff0c\u76f4\u63a5\u7531\u8bf4\u4e66\u4eba\u786e\u8ba4\u5904\u51b3\u6307\u5b9a\u73a9\u5bb6\u3002',
        text: '\u81ea\u7531\u5904\u51b3'
      }
    };

    let statusText = '\u8bb0\u5f55\u63d0\u540d\u540e\u5f00\u542f\u6295\u7968\uff0c\u8ba1\u7968\u540e\u786e\u8ba4\u5904\u51b3\u3002';
    let guidance = '\u4e0b\u4e00\u6b65\uff1a\u6309\u987a\u5e8f\u8bb0\u5f55\u63d0\u540d\u3001\u5f00\u542f\u6295\u7968\u3001\u8ba1\u7968\u5e76\u786e\u8ba4\u7ed3\u679c\u3002';
    let actionTitle = '\u4e0b\u4e00\u6b65\uff1a\u8bb0\u5f55\u63d0\u540d';
    let actionDetail = '\u767d\u5929\u53d1\u8a00\u540e\uff0c\u5148\u8bb0\u5f55\u63d0\u540d\u8005\u548c\u88ab\u63d0\u540d\u8005\u3002';
    if (!rolesDealt) {
      statusText = '\u8bf7\u5148\u5b8c\u6210\u914d\u677f\u5e76\u53d1\u9001\u8eab\u4efd\u3002';
      actionTitle = '\u4e0b\u4e00\u6b65\uff1a\u53d1\u9001\u8eab\u4efd';
      actionDetail = '\u8eab\u4efd\u672a\u53d1\u9001\uff0c\u4e0d\u80fd\u8fdb\u5165\u6295\u7968\u5904\u51b3\u3002';
    } else if (!dayAlreadyStarted) {
      statusText = '\u5148\u8fdb\u5165\u767d\u5929\u53d1\u8a00\uff0c\u518d\u5904\u7406\u63d0\u540d\u548c\u6295\u7968\u3002';
      actionTitle = '\u4e0b\u4e00\u6b65\uff1a\u5f00\u59cb\u767d\u5929';
      actionDetail = '\u767d\u5929\u5f00\u59cb\u540e\u624d\u663e\u793a\u63d0\u540d\u548c\u6295\u7968\u64cd\u4f5c\u3002';
    } else if (dayResolved) {
      statusText = executionEffective
        ? `${nomineeSeat} \u53f7\u5904\u51b3\u5df2\u786e\u8ba4\u3002`
        : '\u672c\u8f6e\u767d\u5929\u5df2\u786e\u8ba4\u65e0\u5904\u51b3\u3002';
      guidance = `\u4e0b\u4e00\u6b65\uff1a\u8fdb\u5165${nextNightLabel}\u3002`;
      actionTitle = `\u4e0b\u4e00\u6b65\uff1a\u8fdb\u5165${nextNightLabel}`;
      actionDetail = '\u672c\u8f6e\u767d\u5929\u5df2\u6536\u5c3e\uff1b\u5982\u672a\u8fbe\u6210\u80dc\u8d1f\u6761\u4ef6\uff0c\u8bf7\u8fdb\u5165\u4e0b\u4e00\u591c\u3002';
    } else if (candidatePending) {
      statusText = `计票结果：${candidateExecution?.yesVotes || 0} 票；等待确认本轮结果。`;
      guidance = '下一步：确认本轮结果；服务器会归档票型并更新暂列处决。';
      actionTitle = '下一步：确认本轮结果';
      actionDetail = '确认后只更新暂列处决，可以继续提名；结束今天时才会真正执行。';
    } else if (votingStatus === 'open') {
      statusText = '\u6295\u7968\u5f00\u542f\u4e2d\uff0c\u73a9\u5bb6\u53ef\u81ea\u6295\uff0c\u8bf4\u4e66\u4eba\u53ef\u4ee3\u7968\u3002';
      guidance = `\u4e0b\u4e00\u6b65\uff1a\u7b49\u5f85\u73a9\u5bb6\u6295\u7968\u6216\u7531\u8bf4\u4e66\u4eba\u4ee3\u7968\uff1b\u5f53\u524d\u5df2\u8bb0\u5f55 ${Number(votesCount || 0)}/${Number(eligibleVoteCount || 0)} \u7968\u3002`;
      actionTitle = '\u4e0b\u4e00\u6b65\uff1a\u7edf\u8ba1\u7968\u6570';
      actionDetail = '\u7b49\u5f85\u73a9\u5bb6\u6295\u7968\u6216\u7531\u8bf4\u4e66\u4eba\u4ee3\u7968\uff0c\u7136\u540e\u8ba1\u7968\u751f\u6210待确认处决\u3002';
    } else if (hasNomination || nominationStatus === 'recorded') {
      statusText = '\u63d0\u540d\u5df2\u8bb0\u5f55\uff0c\u53ef\u4ee5\u5f00\u542f\u6295\u7968\u3002';
      actionTitle = '\u4e0b\u4e00\u6b65\uff1a\u5f00\u542f\u6295\u7968';
      actionDetail = '\u5f00\u542f\u6295\u7968\u540e\uff0c\u73a9\u5bb6\u7aef\u624d\u4f1a\u51fa\u73b0\u6295\u7968\u64cd\u4f5c\u3002';
    }

    return {
      statusText,
      guidance,
      actionReason: { title: actionTitle, detail: actionDetail },
      buttons,
      cards: [
        { label: '\u63d0\u540d', value: hasNomination ? '\u5df2\u8bb0\u5f55' : '\u5f85\u8bb0\u5f55', tone: hasNomination ? 'ready' : '' },
        { label: '\u6295\u7968', value: votingStatus === 'open' ? `${Number(votesCount || 0)} \u7968` : (voteCountStatus === 'counted' ? '\u5df2\u8ba1\u7968' : '\u672a\u5f00\u542f'), tone: votingStatus === 'open' ? 'warning' : voteCountStatus === 'counted' ? 'ready' : '' },
        { label: '\u5904\u51b3', value: dayResolved ? (executionEffective ? '\u5df2\u751f\u6548' : '\u65e0\u5904\u51b3') : (candidatePending ? '\u5f85\u786e\u8ba4' : '\u672a\u751f\u6548'), tone: dayResolved ? 'ready' : candidatePending ? 'warning' : '' }
      ]
    };
  }

  function getDayTimerStatusLabel(status = 'not-started') {
    const labels = {
      'not-started': '未开始',
      running: '计时中',
      paused: '已暂停',
      ended: '已结束'
    };
    return labels[status] || status || '未知';
  }

  function getDayVotingStatusLabel(status = 'closed') {
    const labels = {
      open: '投票开启中',
      closed: '未开启',
      'closed-for-counting': '已关闭待确认',
      counted: '已计票'
    };
    return labels[status] || status || '未知';
  }

  function getDayExecutionStatusLabel(status = 'not-confirmed') {
    const labels = {
      'not-confirmed': '未确认',
      confirmed: '已确认',
      'no-execution-confirmed': '已确认无处决',
      rejected: '已取消',
      resolved: '已收尾'
    };
    return labels[status] || status || '未知';
  }

  function getDayVoteCandidateText(candidateExecution = null) {
    if (!candidateExecution) return '未生成';
    const nomineeSeat = candidateExecution.nomineeSeat || '-';
    const yesVotes = Number.isFinite(Number(candidateExecution.yesVotes)) ? Number(candidateExecution.yesVotes) : '-';
    const requiredVotes = Number.isFinite(Number(candidateExecution.requiredVotes)) ? Number(candidateExecution.requiredVotes) : '-';
    if (candidateExecution.passes === false) return `${nomineeSeat}号未达到门槛（${yesVotes}/${requiredVotes}票）`;
    if (candidateExecution.status === 'confirmed') return `${nomineeSeat}号已确认`;
    if (candidateExecution.status === 'confirmed-no-execution') return '已确认无处决';
    if (candidateExecution.source === 'storyteller-manual') return `${nomineeSeat}号自由处决`;
    return `${nomineeSeat}号待确认（${yesVotes}/${requiredVotes}票）`;
  }

  function getDayExecutionText(execution = {}, candidateExecution = null) {
    if (execution?.effective === true) return `${execution.nomineeSeat || candidateExecution?.nomineeSeat || '-'}号已生效`;
    if (execution?.status === 'no-execution-confirmed' || (execution?.effective === false && execution?.confirmedAt)) return '已确认无处决';
    if (execution?.status === 'rejected') return '已取消处决，玩家生死未改变';
    if (candidateExecution?.status === 'pending-storyteller-confirmation') return '等待说书人确认';
    return '确认前不生效';
  }

  function buildDayVoteDetailSectionsModel({
    timerStatus = 'not-started',
    nomination = {},
    voting = {},
    voteCount = {},
    execution = {},
    votes = []
  } = {}) {
    const normalizedVotes = Array.isArray(votes) ? votes : [];
    const candidateExecution = voteCount?.candidateExecution || null;
    const nominationText = nomination?.nominationId
      ? `${nomination.nominatorSeat || '-'}号 -> ${nomination.nomineeSeat || '-'}号`
      : '暂无';
    const votingStatus = voting?.status || 'closed';
    const votingText = voting?.voteId
      ? `${getDayVotingStatusLabel(votingStatus)} · 本轮投票已生成`
      : getDayVotingStatusLabel(votingStatus);
    const countText = voteCount?.status === 'counted'
      ? `${Number(voteCount.yes || 0)} 赞成 / ${Number(voteCount.no || 0)} 不举手 / ${Number(voteCount.total || 0)} 总票`
      : '未计票';
    const thresholdText = candidateExecution?.requiredVotes
      ? `${candidateExecution.requiredVotes} 票达到处决门槛`
      : '计票后显示';
    const executionSource = execution?.source === 'storyteller-manual' || candidateExecution?.source === 'storyteller-manual'
      ? '说书人自由处决'
      : '投票计票结果';
    return [
      {
        title: '流程状态',
        count: 3,
        open: true,
        emptyText: '暂无流程状态',
        items: [
          { label: '计时', value: getDayTimerStatusLabel(timerStatus) },
          { label: '提名', value: nominationText },
          { label: '投票', value: votingText }
        ]
      },
      {
        title: '计票与处决',
        count: 4,
        open: voteCount?.status === 'counted' || Boolean(candidateExecution) || Boolean(execution?.status),
        emptyText: '计票后显示待确认处决',
        items: [
          { label: '计票', value: countText },
          { label: '门槛', value: thresholdText },
          { label: '计票结果', value: getDayVoteCandidateText(candidateExecution) },
          { label: '处决', value: getDayExecutionText(execution, candidateExecution) }
        ]
      },
      {
        title: '投票记录',
        count: normalizedVotes.length,
        open: normalizedVotes.length > 0,
        emptyText: '暂无投票记录',
        items: mapVoteEntriesToFlowItems(normalizedVotes)
      },
      {
        title: '处决来源',
        count: 2,
        open: Boolean(candidateExecution || execution?.source || candidateExecution?.source || execution?.status),
        emptyText: '暂无处决来源',
        items: [
          { label: '状态', value: getDayExecutionStatusLabel(execution?.status || 'not-confirmed') },
          { label: '来源', value: executionSource }
        ]
      }
    ];
  }

  function buildDayVoteSummaryModel({
    guidance = '',
    timerStatus = 'not-started',
    nomination = {},
    voting = {},
    voteCount = {},
    execution = {},
    votes = []
  } = {}) {
    const sections = buildDayVoteDetailSectionsModel({ timerStatus, nomination, voting, voteCount, execution, votes });
    const detailItems = sections.slice(0, 2).flatMap((section) => section.items);
    const voteItems = sections.find((section) => section.title === '投票记录')?.items || [];
    return {
      guidance: guidance || '下一步：按顺序记录提名、开启投票、计票并确认结果。',
      detailItems,
      voteItems,
      sections
    };
  }

  function formatDayInputSeat(value, fallbackText = '未填写') {
    const seat = Number(value);
    return Number.isInteger(seat) && seat > 0 ? `${seat}号` : fallbackText;
  }

  function buildDayVoteInputGuideModel({
    rolesDealt = false,
    dayAlreadyStarted = false,
    dayResolved = false,
    dayVote = {},
    selectedNominatorSeat = '',
    selectedNomineeSeat = '',
    selectedProxySeat = '',
    nextNightLabel = '下一夜'
  } = {}) {
    const timer = dayVote.dayTimer || dayVote.timer || {};
    const nomination = dayVote.nomination || {};
    const voting = dayVote.voting || {};
    const voteCount = dayVote.voteCount || {};
    const execution = dayVote.execution || {};
    const candidateExecution = voteCount.candidateExecution || null;
    const timerStatus = timer.status || dayVote.timerStatus || 'not-started';
    const resolved = Boolean(
      dayResolved
      || dayVote.resolved === true
      || execution.status === 'confirmed'
      || execution.effective === true
      || execution.noExecution === true
      || execution.type === 'no-execution'
    );
    const started = Boolean(
      dayAlreadyStarted
      || resolved
      || timerStatus !== 'not-started'
      || nomination.nominationId
      || voting.voteId
      || voteCount.status
      || candidateExecution
    );
    const nominatorText = nomination.nominatorSeat
      ? `已记录 ${formatDayInputSeat(nomination.nominatorSeat)}`
      : `当前 ${formatDayInputSeat(selectedNominatorSeat, '未填写')}`;
    const nomineeText = nomination.nomineeSeat
      ? `已记录 ${formatDayInputSeat(nomination.nomineeSeat)}`
      : `当前 ${formatDayInputSeat(selectedNomineeSeat, '未填写')}`;
    const proxyText = voting.status === 'open'
      ? `已选 ${formatDayInputSeat(selectedProxySeat, '未选择')}；点座位卡切换赞成/不举手`
      : `可选：${formatDayInputSeat(selectedProxySeat, '未选择')}`;

    let guidance = '填写提名者和被提名者，然后点击“记录提名”。';
    if (!rolesDealt) {
      guidance = '先完成配板并发送身份；白天开始后这里才会接收提名和投票。';
    } else if (!started) {
      guidance = '先点击“开始白天”；进入发言后再填写提名者和被提名者。';
    } else if (resolved) {
      guidance = `本轮白天已收尾；如未达成胜负，下一步进入${nextNightLabel}。`;
    } else if (voteCount.status === 'counted' && candidateExecution?.status === 'pending-storyteller-confirmation') {
      guidance = candidateExecution.passes === false
        ? '票数未过半；现在确认“无人处决”。'
        : '计票已完成；确认前不会改变玩家生死状态。';
    } else if (voting.status === 'open') {
      guidance = '投票开启中；玩家端会实时回传，说书人可点座位卡切换赞成/不举手。';
    } else if (nomination.nominationId || nomination.status === 'recorded') {
      guidance = '提名已记录；下一步开启投票，玩家端才会出现投票操作。';
    }

    return {
      guidance,
      section: {
        title: '本环节输入',
        count: 3,
        open: true,
        emptyText: '暂无输入',
        items: [
          { label: '提名者', value: nominatorText },
          { label: '被提名/处决目标', value: nomineeText },
          { label: '已选座位', value: proxyText }
        ]
      }
    };
  }

  function buildNightToolSummaryModel({
    hasBatch = false,
    collectionClosed = false,
    nightOrder = [],
    nightSummary = [],
    candidateResolutions = [],
    helpers = {}
  } = {}) {
    const candidateItems = mapNightCandidatesToFlowItems(candidateResolutions, helpers);
    const summaryItems = mapNightTodoToFlowItems({ nightOrder, nightSummary, helpers });
    const submittedCount = (Array.isArray(nightSummary) ? nightSummary : [])
      .filter((item) => ['submitted', 'locked'].includes(String(item?.submissionStatus || ''))).length;
    const waitingCount = hasBatch ? Math.max(0, summaryItems.length - submittedCount) : 0;
    const closed = Boolean(collectionClosed || candidateItems.length);
    const statusText = candidateItems.length
      ? `已整理 ${candidateItems.length} 条夜晚技能结果；请逐条处理。`
      : hasBatch
        ? (closed
          ? (summaryItems.length ? '可整理夜晚结果。' : '还没有玩家行动，无法确认夜晚技能结果。')
          : (summaryItems.length ? `夜晚已开始；已收到 ${submittedCount} 条，仍需等待/人工处理 ${waitingCount} 条。` : '夜晚已开始；还没有玩家行动，暂不能确认夜晚技能结果。'))
        : '先点击“开始夜晚”，创建本夜处理批次。';
    const fallbackItems = hasBatch
      ? [
        {
          label: closed ? (summaryItems.length ? '下一步' : '等玩家行动') : '玩家行动',
          value: closed
            ? (summaryItems.length ? '点击“整理夜晚结果”' : '还没有玩家行动，无法确认夜晚技能结果')
            : '\u7b49\u5f85\u73a9\u5bb6\u63d0\u4ea4\uff1b\u4e5f\u53ef\u624b\u52a8\u88c1\u5b9a'
        }
      ]
      : [
        { label: '状态', value: '夜晚尚未开始' }
      ];
    return {
      statusText,
      section: candidateItems.length
        ? { title: '待确认结果', count: candidateItems.length, items: candidateItems, emptyText: '暂无待确认结果', open: true }
        : {
          title: summaryItems.length ? '当前夜晚待办' : '当前状态',
          count: summaryItems.length,
          items: summaryItems.length ? summaryItems : fallbackItems,
          emptyText: '还没有玩家行动；请等待玩家提交，或打开手动处理直接裁定。',
          open: true
        }
    };
  }

  function isPendingNightCandidate(candidate = {}) {
    const status = String(candidate.status || '').trim();
    return !status || status === 'pending-storyteller' || status === 'pending-storyteller-confirmation' || status === 'needs-storyteller-ruling';
  }

  function buildNightToolStepGuideModel({
    rolesDealt = false,
    hasBatch = false,
    collectionClosed = false,
    nightSummary = [],
    candidateResolutions = [],
    nightResolvedAwaitingDay = false,
    currentNightLabel = '第 1 天夜晚',
    nextNightLabel = '第 1 天夜晚'
  } = {}) {
    const summaryCount = Array.isArray(nightSummary) ? nightSummary.length : 0;
    const candidates = Array.isArray(candidateResolutions) ? candidateResolutions : [];
    const candidateCount = candidates.length;
    const pendingCount = candidates.filter(isPendingNightCandidate).length;
    const closed = Boolean(collectionClosed || candidateCount > 0 || nightResolvedAwaitingDay);
    const hasCandidates = candidateCount > 0;
    const resolved = Boolean(nightResolvedAwaitingDay || (hasCandidates && pendingCount === 0));
    const startActive = Boolean(rolesDealt && !hasBatch && !hasCandidates && !resolved);
    const collectActive = Boolean(hasBatch && !closed && !hasCandidates && !resolved);
    const prepareActive = Boolean(hasBatch && summaryCount > 0 && !hasCandidates && !resolved);
    const reviewActive = Boolean(hasCandidates && pendingCount > 0 && !nightResolvedAwaitingDay);
    const steps = [
      {
        key: 'start-night',
        label: '开始夜晚',
        state: getVoteToolStepState({
          done: hasBatch || hasCandidates || resolved,
          active: startActive,
          blocked: !rolesDealt
        }),
        badge: hasBatch || hasCandidates || resolved ? currentNightLabel : (startActive ? '当前' : '未满足'),
        detail: !rolesDealt ? '先发送身份' : `创建${nextNightLabel}批次`
      },
      {
        key: 'collect',
        label: '等玩家行动',
        state: getVoteToolStepState({
          done: closed || hasCandidates || resolved,
          active: collectActive,
          blocked: !hasBatch
        }),
        badge: hasBatch ? `${summaryCount} 条` : '待开始',
        detail: summaryCount ? `\u5df2\u6536\u5230 ${summaryCount} \u6761` : '\u7b49\u5f85\u73a9\u5bb6\u63d0\u4ea4'
      },
      {
        key: 'prepare',
        label: '确认夜晚技能结果',
        state: getVoteToolStepState({
          done: hasCandidates || resolved,
          active: prepareActive,
          blocked: !hasBatch || (hasBatch && summaryCount === 0 && !hasCandidates && !resolved)
        }),
        badge: hasCandidates ? `${candidateCount} \u6761` : (prepareActive ? '当前' : (hasBatch ? '等行动' : '\u5f85\u5f00\u59cb')),
        detail: hasCandidates ? '夜晚技能结果已整理' : (summaryCount ? '锁定提交并整理待确认结果' : '收到玩家行动后才可确认')
      },
      {
        key: 'review',
        label: '确认后入白天',
        state: getVoteToolStepState({
          done: resolved,
          active: reviewActive,
          blocked: !hasCandidates
        }),
        badge: resolved ? '已完成' : (reviewActive ? `${pendingCount} 待确认` : '待结果'),
        detail: resolved ? '可进入白天' : '确认或修改夜晚技能结果'
      }
    ];
    const currentStep = steps.find((step) => step.state === 'active') || steps.find((step) => step.state !== 'done') || steps[steps.length - 1];
    let guidance = `当前：${currentStep.label}。${currentStep.detail}`;
    if (!rolesDealt) {
      guidance = '先完成配板并发送身份；夜晚技能面板会保持只读提示。';
    } else if (resolved) {
      guidance = `${currentNightLabel}已收尾；下一步进入白天发言。`;
    } else if (hasBatch && summaryCount === 0 && !hasCandidates) {
      guidance = '\u5f53\u524d\u6ca1\u6709\u73a9\u5bb6行动\uff1b\u7b49\u5f85\u73a9\u5bb6\u63d0\u4ea4\uff0c\u6216\u6253\u5f00\u201c\u624b\u52a8\u5904\u7406\u201d\u7531\u8bf4\u4e66\u4eba\u76f4\u63a5\u88c1\u5b9a\u3002';
    } else if (prepareActive && !closed) {
      guidance = '已收到玩家行动；点击“整理夜晚结果”会锁定当前提交并生成待确认结果。';
    }
    return {
      guidance,
      currentKey: currentStep.key,
      steps
    };
  }

  function buildVoteToolSummaryModel({
    dayVote = {},
    isResolved = false,
    nextNightLabel = '下一夜'
  } = {}) {
    const timerStatus = dayVote.dayTimer?.status || dayVote.timer?.status || dayVote.timerStatus || 'not-started';
    const nomination = dayVote.nomination || {};
    const voting = dayVote.voting || {};
    const voteCount = dayVote.voteCount || {};
    const execution = dayVote.execution || {};
    const candidateExecution = voteCount.candidateExecution || null;
    const votes = Array.isArray(voting.votes) ? voting.votes : [];
    const guidance = voting.status === 'open'
      ? `下一步：保存票型并完成计票；服务器已记录 ${votes.length} 票。`
      : voteCount.status === 'counted' && candidateExecution?.status === 'pending-storyteller-confirmation'
        ? (candidateExecution?.passes === false
          ? '下一步：确认本轮结果并清空票型，然后可以继续提名。'
          : '下一步：确认本轮结果；只更新暂列处决。')
        : isResolved
          ? `下一步：进入${nextNightLabel}。`
          : '下一步：记录提名、开启投票、计票并确认结果。';
    const sections = buildDayVoteDetailSectionsModel({
      timerStatus,
      nomination,
      voting,
      voteCount,
      execution,
      votes
    });
    return {
      guidance,
      sections,
      detailItems: sections.slice(0, 2).flatMap((section) => section.items),
      voteItems: sections.find((section) => section.title === '投票记录')?.items || []
    };
  }

  function getVoteToolStepState({ done = false, active = false, blocked = false } = {}) {
    if (done) return 'done';
    if (active) return 'active';
    if (blocked) return 'blocked';
    return 'ready';
  }

  function buildVoteToolStepGuideModel({
    rolesDealt = false,
    dayAlreadyStarted = false,
    dayResolved = false,
    dayVote = {},
    selectedNominatorSeat = '',
    selectedNomineeSeat = '',
    selectedProxySeat = '',
    nextNightLabel = '下一夜'
  } = {}) {
    const timer = dayVote.dayTimer || dayVote.timer || {};
    const nomination = dayVote.nomination || {};
    const voting = dayVote.voting || {};
    const voteCount = dayVote.voteCount || {};
    const execution = dayVote.execution || {};
    const candidateExecution = voteCount.candidateExecution || null;
    const votes = Array.isArray(voting.votes) ? voting.votes : [];
    const timerStatus = timer.status || dayVote.timerStatus || 'not-started';
    const resolved = Boolean(dayResolved || dayVote.resolved === true || dayVote.dayClosed?.status === 'confirmed');
    const started = Boolean(
      dayAlreadyStarted
      || resolved
      || timerStatus !== 'not-started'
      || nomination.nominationId
      || voting.voteId
      || voteCount.status
      || candidateExecution
    );
    const hasNomination = Boolean(nomination.nominationId || nomination.status === 'recorded');
    const voteOpened = Boolean(voting.voteId || voting.status === 'open' || voteCount.status === 'counted' || candidateExecution);
    const counted = Boolean(voteCount.status === 'counted' || candidateExecution);
    const candidatePending = Boolean(voteCount.status === 'counted' && candidateExecution?.status === 'pending-storyteller-confirmation');
    const voteCountText = voting.status === 'open'
      ? `${votes.length} 票`
      : voteOpened
        ? getDayVotingStatusLabel(voting.status || 'closed')
        : '未开启';
    const confirmationLabel = '确认本轮结果';
    const confirmationDoneText = execution?.effective === true
      ? `${execution.nomineeSeat || candidateExecution?.nomineeSeat || '-'}号已处决`
      : '白天已收尾';

    const startActive = Boolean(rolesDealt && !started && !resolved);
    const nominationActive = Boolean(rolesDealt && started && !hasNomination && !resolved);
    const voteActive = Boolean(rolesDealt && hasNomination && !voteOpened && !resolved);
    const votingActive = Boolean(rolesDealt && voting.status === 'open' && !counted && !resolved);
    const countActive = Boolean(rolesDealt && voting.status === 'open' && !counted && !resolved);
    const confirmActive = Boolean(rolesDealt && candidatePending && !resolved);

    const steps = [
      {
        key: 'start-day',
        label: '开始白天',
        state: getVoteToolStepState({
          done: started || resolved,
          active: startActive,
          blocked: !rolesDealt
        }),
        badge: started || resolved ? '已开始' : (startActive ? '当前' : '未满足'),
        detail: !rolesDealt ? '先完成配板并发送身份' : (started || resolved ? '白天流程已开启' : '进入发言计时')
      },
      {
        key: 'nomination',
        label: '记录提名',
        state: getVoteToolStepState({
          done: hasNomination || voteOpened || counted || resolved,
          active: nominationActive,
          blocked: !rolesDealt || !started || resolved
        }),
        badge: hasNomination ? `${nomination.nominatorSeat || '-'}→${nomination.nomineeSeat || '-'}` : (nominationActive ? '当前' : '待处理'),
        detail: hasNomination
          ? '提名已记录'
          : `填 ${formatDayInputSeat(selectedNominatorSeat, '未填写')} 提名 ${formatDayInputSeat(selectedNomineeSeat, '未填写')}`
      },
      {
        key: 'open-vote',
        label: '等待投票',
        state: getVoteToolStepState({
          done: counted || resolved,
          active: voteActive || votingActive,
          blocked: !rolesDealt || !hasNomination || resolved
        }),
        badge: voteCountText,
        detail: voting.status === 'open'
          ? `等待玩家投票；说书人可点座位卡切换赞成/不举手，当前 ${formatDayInputSeat(selectedProxySeat, '未选择')}`
          : voteOpened
            ? '投票已关闭或进入计票'
            : '开启后玩家端才会出现投票'
      },
      {
        key: 'count',
        label: '计票结果',
        state: getVoteToolStepState({
          done: counted || resolved,
          active: countActive,
          blocked: !rolesDealt || voting.status !== 'open' || resolved
        }),
        badge: counted ? `${Number(voteCount.yes || candidateExecution?.yesVotes || 0)} 赞成` : (countActive ? '当前' : '待投票'),
        detail: counted ? getDayVoteCandidateText(candidateExecution) : '统计投票，确认是否处决'
      },
      {
        key: 'confirm',
        label: '确认本轮结果',
        state: getVoteToolStepState({
          done: resolved,
          active: confirmActive,
          blocked: !rolesDealt || !candidatePending
        }),
        badge: resolved ? '已确认' : (confirmActive ? '当前' : '待结果'),
        detail: resolved
          ? confirmationDoneText
          : candidateExecution?.passes === false
            ? `${confirmationLabel}；确认后清空本轮票型并继续提名`
            : `${confirmationLabel}；结束当天时再检查胜负`
      }
    ];
    const currentStep = steps.find((step) => step.state === 'active') || steps.find((step) => step.state !== 'done') || steps[steps.length - 1];
    let guidance = `当前：${currentStep.label}。${currentStep.detail}`;
    if (resolved) {
      guidance = `本轮白天已收尾；如未达成胜负，下一步进入${nextNightLabel}。`;
    } else if (!rolesDealt) {
      guidance = '先完成配板并发送身份；投票处决面板会保持只读提示。';
    }

    return {
      guidance,
      currentKey: currentStep.key,
      steps
    };
  }

  function cloneButtonState(button = {}, overrides = {}) {
    return {
      disabled: Boolean(button.disabled),
      reason: button.reason || '',
      title: button.title || '',
      text: button.text,
      ...overrides
    };
  }

  function buildVoteToolActionModel({
    rolesDealt = false,
    dayVote = {},
    dayAlreadyStarted = false,
    dayResolved = false,
    eligibleVoteCount = 0,
    nextNightLabel = '下一夜'
  } = {}) {
    const timer = dayVote.dayTimer || dayVote.timer || {};
    const nomination = dayVote.nomination || {};
    const voting = dayVote.voting || {};
    const voteCount = dayVote.voteCount || {};
    const execution = dayVote.execution || {};
    const candidateExecution = voteCount.candidateExecution || null;
    const votes = Array.isArray(voting.votes) ? voting.votes : [];
    const timerStatus = timer.status || dayVote.timerStatus || 'not-started';
    const resolved = Boolean(dayResolved || dayVote.resolved === true || dayVote.dayClosed?.status === 'confirmed');
    const started = Boolean(
      dayAlreadyStarted
      || resolved
      || timerStatus !== 'not-started'
      || nomination.nominationId
      || voting.voteId
      || voteCount.status
      || candidateExecution
    );
    const hasNomination = Boolean(nomination.nominationId);
    const dayModel = buildDayFlowPanelModel({
      rolesDealt,
      dayAlreadyStarted: started,
      dayResolved: resolved,
      timerStatus,
      nominationStatus: nomination.status || '',
      nominationNominatorSeat: nomination.nominatorSeat || '',
      nominationNomineeSeat: nomination.nomineeSeat || '',
      votingStatus: voting.status || '',
      votesCount: votes.length,
      eligibleVoteCount,
      candidateExecution,
      execution,
      nextStepTitle: resolved ? `进入${nextNightLabel}` : '继续白天流程',
      nextStepDetail: resolved
        ? `本轮白天已经收尾；如未达成胜负条件，下一步进入${nextNightLabel}。`
        : '按顺序完成白天发言、提名、投票、计票和处决确认。'
    });
    const voteModel = buildVoteFlowPanelModel({
      rolesDealt,
      dayAlreadyStarted: started,
      dayResolved: resolved,
      timerStatus,
      nominationStatus: nomination.status || '',
      hasNomination,
      votingStatus: voting.status || '',
      voteCountStatus: voteCount.status || '',
      votesCount: votes.length,
      eligibleVoteCount,
      candidateExecution,
      execution,
      nextNightLabel
    });

    return {
      guidance: voteModel.guidance,
      actionReason: voteModel.actionReason,
      statusText: voteModel.statusText,
      buttons: {
        startDay: cloneButtonState(dayModel.buttons.start, { text: dayModel.buttons.start.text || '开始白天' }),
        nomination: cloneButtonState(voteModel.buttons.nomination, { text: '记录提名' }),
        openVote: cloneButtonState(voteModel.buttons.openVote, { text: '开启投票' }),
        proxyVote: cloneButtonState(voteModel.buttons.proxyVote, { text: '点座位卡记票' }),
        countVote: cloneButtonState(voteModel.buttons.countVote, { text: '计票结果' }),
        confirm: cloneButtonState(voteModel.buttons.confirm, { text: voteModel.buttons.confirm.text || '确认处决' }),
        manual: cloneButtonState(voteModel.buttons.manual, { text: '直接处决' }),
        state: {
          disabled: false,
          reason: '',
          title: '关闭本面板并回到右侧主流程看板。',
          text: '回到主流程'
        }
      }
    };
  }

  function buildGameEndPanelModel({
    rolesDealt = false,
    localGameEnd = {},
    pendingCandidate = null,
    confirmed = false,
    publicGameOver = null
  } = {}) {
    const ready = Boolean(localGameEnd && localGameEnd.ready);
    const confirmableCandidate = Boolean(pendingCandidate
      && pendingCandidate.status === 'pending-storyteller-confirmation'
      && pendingCandidate.winningTeam
      && pendingCandidate.reasonCode
      && pendingCandidate.storytellerConfirmationRequired !== false);
    const canPrepare = Boolean(rolesDealt) && !pendingCandidate && !confirmed;
    const prepareReason = !rolesDealt
      ? '\u5148\u5b8c\u6210\u914d\u677f\u5e76\u53d1\u9001\u8eab\u4efd\u3002'
      : pendingCandidate
          ? '\u5df2\u6709胜负判断\uff0c\u5148\u786e\u8ba4\u6216\u53d6\u6d88\u540e\u518d\u68c0\u67e5\u3002'
          : confirmed
            ? '\u672c\u5c40\u7ed3\u5c40\u5df2\u516c\u5f00\u3002'
            : (!ready ? '\u524d\u7aef\u672a\u68c0\u6d4b\u5230\u901a\u7528\u80dc\u8d1f\uff0c\u4ecd\u53ef\u8bf7\u540e\u7aef\u68c0\u67e5\u5723\u5f92\u3001\u5e02\u957f\u7b49\u7ed3\u5c40\u5019\u9009\u3002' : '');
    const confirmReason = !pendingCandidate
      ? '\u5fc5\u987b\u5148\u68c0\u67e5\u5e76\u751f\u6210\u4e00\u6761\u5e26\u80dc\u5229\u9635\u8425\u548c\u539f\u56e0\u7801\u7684胜负判断\u3002'
      : !confirmableCandidate
        ? '裁决项\u7f3a\u5c11\u80dc\u5229\u9635\u8425\u3001\u539f\u56e0\u7801\u6216\u8bf4\u4e66\u4eba\u786e\u8ba4\u6807\u8bb0\uff0c\u4e0d\u80fd\u516c\u5f00\u7ed3\u5c40\u3002'
        : confirmed
          ? '\u672c\u5c40\u7ed3\u5c40\u5df2\u516c\u5f00\u3002'
          : '';
    let statusText = '\u53d1\u8eab\u4efd\u540e\u624d\u80fd\u68c0\u67e5\u7ed3\u5c40\u3002';
    if (confirmed) statusText = `${publicGameOver?.winningTeam === 'good' ? '\u597d\u4eba' : '\u90aa\u6076'}\u9635\u8425\u80dc\u5229\u5df2\u516c\u5f00\u3002`;
    else if (pendingCandidate) statusText = '胜负判断\u5df2\u751f\u6210\uff0c\u7b49\u5f85\u8bf4\u4e66\u4eba\u786e\u8ba4\u3002';
    else if (rolesDealt && !ready) statusText = `\u53ef\u70b9\u51fb\u201c\u6574\u7406\u7ed3\u5c40\u201d\u8bf7\u540e\u7aef\u68c0\u67e5\uff1b\u524d\u7aef\u901a\u7528\u68c0\u67e5\uff1a${localGameEnd.label || '\u5c1a\u672a\u8fbe\u6210\u80dc\u8d1f'}`;
    else if (rolesDealt && ready) statusText = `\u53ef\u68c0\u67e5\u80dc\u8d1f\uff1a${localGameEnd.label || '\u6761\u4ef6\u51fa\u73b0'}`;

    const winnerLabel = confirmed
      ? (publicGameOver?.winningTeam === 'good' ? '\u597d\u4eba\u80dc\u5229' : '\u90aa\u6076\u80dc\u5229')
      : ready
        ? '\u6761\u4ef6\u51fa\u73b0'
        : '\u672a\u6ee1\u8db3';
    return {
      statusText,
      buttons: {
        prepare: { disabled: !canPrepare, reason: prepareReason, title: '检查胜负并检查胜负' },
        confirm: { disabled: !confirmableCandidate || confirmed, reason: confirmReason, title: '\u786e\u8ba4\u5e76\u516c\u5f00\u7ed3\u5c40' },
        review: { disabled: !confirmed, reason: '\u7ed3\u5c40\u516c\u5f00\u540e\u624d\u80fd\u6253\u5f00\u672c\u5c40\u590d\u76d8\u3002', title: '\u67e5\u770b\u672c\u5c40\u590d\u76d8' },
        nextGame: { disabled: !confirmed, reason: '\u7ed3\u5c40\u516c\u5f00\u540e\u624d\u80fd\u8fdb\u5165\u4e0b\u4e00\u5c40\u3002', title: '\u5f00\u4e0b\u4e00\u5c40' }
      },
      cards: [
        { label: '\u80dc\u8d1f\u6761\u4ef6', value: winnerLabel, tone: ready || confirmed ? 'ready' : '' },
        { label: '裁决项', value: pendingCandidate ? '\u5f85\u786e\u8ba4' : (confirmed ? '\u5df2\u516c\u5f00' : '\u672a\u751f\u6210'), tone: pendingCandidate ? 'warning' : confirmed ? 'ready' : '' },
        { label: '\u590d\u76d8', value: confirmed ? '\u4e0b\u4e00\u6b65' : '\u672a\u5f00\u653e', tone: confirmed ? 'ready' : '' }
      ],
      actionReason: {
        title: confirmed ? '\u4e0b\u4e00\u6b65\uff1a\u590d\u76d8' : pendingCandidate ? '\u4e0b\u4e00\u6b65\uff1a\u786e\u8ba4\u7ed3\u5c40' : '\u4e0b\u4e00\u6b65\uff1a\u6574\u7406\u7ed3\u5c40',
        detail: confirmed ? '\u7ed3\u5c40\u5df2\u516c\u5f00\uff0c\u5148\u6253\u5f00\u590d\u76d8\u67e5\u770b\u672c\u5c40\u62a5\u544a\uff1b\u5f00\u4e0b\u4e00\u5c40\u4ecd\u9700\u5355\u72ec\u70b9\u51fb\u3002' : pendingCandidate ? '\u786e\u8ba4\u524d\u4e0d\u4f1a\u5411\u73a9\u5bb6\u516c\u5f00\u7ed3\u5c40\u3002' : ready ? (localGameEnd.label || '\u80dc\u8d1f\u6761\u4ef6\u5df2\u51fa\u73b0\u3002') : '\u5373\u4f7f\u524d\u7aef\u672a\u68c0\u6d4b\u5230\u901a\u7528\u80dc\u8d1f\uff0c\u4e5f\u4f1a\u5411\u540e\u7aef\u8bf7\u6c42\u7ed3\u5c40\u5019\u9009\uff1b\u65e0\u5019\u9009\u65f6\u4f1a\u660e\u786e\u663e\u793a\u3002'
      }
    };
  }

  function buildGameEndSummaryModel({
    confirmed = false,
    publicGameOver = null,
    candidates = []
  } = {}) {
    if (confirmed) {
      return {
        confirmed: true,
        summary: publicGameOver?.summary || '游戏结束。',
        nextRoundTitle: '本局已归档，下一步：复盘',
        nextRoundDetail: '先查看复盘报告，确认胜负、关键玩家、阶段记录和下一局建议；开下一局仍需单独点击。',
        candidateItems: []
      };
    }
    return {
      confirmed: false,
      candidateItems: mapGameEndCandidatesToFlowItems(candidates),
      emptyText: '尚未生成结局判断'
    };
  }

  function buildManualToolPanelModel({
    targetSeat = 0,
    players = []
  } = {}) {
    const seatNumber = Number(targetSeat || 0);
    const target = (Array.isArray(players) ? players : []).find((player) => Number(player.seat) === seatNumber);
    return {
      targetSeat: seatNumber,
      target,
      statusText: target
        ? `当前目标：${seatNumber}号 ${target.name || ''}。手动动作仍需说书人确认。`
        : '选择目标座位后，可处理特殊裁定、私信或回到主流程。'
    };
  }

  function getNightSubmissionStatusLabel(status = 'none') {
    const labels = {
      locked: '已锁定',
      submitted: '已提交',
      missing: '未提交',
      none: '未提交',
      withdrawn: '已撤回'
    };
    return labels[status] || status || '未知';
  }

  function getNightCandidateStatusLabel(status = '', resolutionMode = '') {
    if (status === 'confirmed' && resolutionMode === 'record-only') return '已记录 · 未生效';
    const labels = {
      'pending-storyteller': '待确认',
      'pending-storyteller-confirmation': '待确认',
      'needs-storyteller-ruling': '需人工处理',
      confirmed: '已确认',
      rejected: '已不采用',
      superseded: '已替换'
    };
    return labels[status] || status || '未知';
  }

  function resolveRoleDisplayName(roleId, helpers = {}) {
    if (!roleId) return '未知角色';
    const fallback = ROLE_DISPLAY_NAME_FALLBACKS[normalizeRoleDisplayKey(roleId)]
      || ROLE_DISPLAY_NAME_FALLBACKS[String(roleId || '').trim().toLowerCase().replace(/[-_]/g, '')]
      || '';
    const name = typeof helpers.getRoleDisplayName === 'function'
      ? helpers.getRoleDisplayName(roleId)
      : '';
    const raw = String(roleId || '').trim();
    if (!name || name === raw || name === normalizeRoleDisplayKey(raw)) return fallback || raw || '未知角色';
    return name || fallback || '未知角色';
  }

  function getNightPromptKindLabel(kind, autoSubmit = false) {
    if (autoSubmit) return '自动信息';
    const labels = {
      auto_info: '自动信息',
      waiting: '等待',
      select_1: '选 1 人',
      select_2: '选 2 人',
      select_3: '选 3 人',
      select_role: '选角色',
      select_player_role: '选人+角色'
    };
    return labels[kind] || '行动';
  }

  function resolveNightRoleName(roleId, helpers = {}) {
    if (!roleId) return '未知角色';
    const name = resolveRoleDisplayName(roleId, helpers);
    return name === '未知角色' ? String(roleId) : name;
  }

  function getNightOrderValue(item = {}) {
    const order = Number(item?.order);
    return Number.isFinite(order) ? order : 999;
  }

  function findNightSummaryBySeat(nightSummary = [], seat) {
    const targetSeat = Number(seat);
    return (Array.isArray(nightSummary) ? nightSummary : []).find((row) => Number(row?.seat) === targetSeat) || {};
  }

  function resolveNightOrderForSeat(seat, roleId, nightOrder = []) {
    const orderRows = Array.isArray(nightOrder) ? nightOrder : [];
    const targetSeat = Number(seat);
    const matched = orderRows.find((item) => Number(item?.seat) === targetSeat)
      || orderRows.find((item) => item?.roleId === roleId || item?.roleIdAtPrompt === roleId);
    return getNightOrderValue(matched);
  }

  function buildNightOrderRowsModel({ nightOrder = [], nightSummary = [], helpers = {} } = {}) {
    return (Array.isArray(nightOrder) ? nightOrder : [])
      .slice()
      .sort((left, right) => {
        const leftOrder = getNightOrderValue(left);
        const rightOrder = getNightOrderValue(right);
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return Number(left?.seat || 0) - Number(right?.seat || 0);
      })
      .map((item, index) => {
        const summary = findNightSummaryBySeat(nightSummary, item?.seat);
        return {
          index: index + 1,
          seat: item?.seat || '',
          roleName: resolveNightRoleName(item?.roleId || item?.roleIdAtPrompt || '', helpers),
          detail: [
            getNightPromptKindLabel(item?.promptKind || item?.actionType || item?.kind, item?.autoSubmit === true),
            getImportedLogicClassLabel(item?.importedLogicProfile || item?.logicProfile)
          ].filter(Boolean).join(' \u00b7 '),
          status: getNightSubmissionStatusLabel(summary.submissionStatus || item?.status || 'none')
        };
      });
  }

  function buildNightSummaryRowsModel({ nightSummary = [], nightOrder = [], helpers = {} } = {}) {
    return (Array.isArray(nightSummary) ? nightSummary : [])
      .slice()
      .sort((left, right) => {
        const leftOrder = resolveNightOrderForSeat(left?.seat, left?.roleIdAtPrompt || left?.roleId, nightOrder);
        const rightOrder = resolveNightOrderForSeat(right?.seat, right?.roleIdAtPrompt || right?.roleId, nightOrder);
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return Number(left?.seat || 0) - Number(right?.seat || 0);
      })
      .map((item) => {
        const status = getNightSubmissionStatusLabel(item?.submissionStatus || 'none');
        const actionLabel = getNightPromptKindLabel(
          item?.actionType || item?.promptKind || item?.kind,
          item?.autoSubmit === true
        );
        return {
          seat: item?.seat || '',
          roleName: resolveNightRoleName(item?.roleIdAtPrompt || item?.roleId || '', helpers),
          detail: `${status} · ${actionLabel}`,
          status,
          note: item?.canModify === true
            ? '等待玩家提交；说书人也可以确认技能结果并推进。'
            : '本条为系统自动信息，不需要玩家手动选择。'
        };
      });
  }

  const NIGHT_CANDIDATE_KIND_LABELS = {
    'state-change': '状态变化',
    'rule-result': '信息结果',
    info: '信息结果',
    warning: '提醒',
    noop: '无状态变化'
  };

  const NIGHT_STATE_CHANGE_TYPE_LABELS = {
    poison: '中毒',
    drunk: '醉酒',
    kill: '死亡',
    death: '死亡',
    protect: '保护',
    'imp-self-kill-transfer': '小恶魔自杀转移',
    'demon-transfer': '恶魔转移'
  };

  const NIGHT_EDITABLE_STATE_TARGET_TYPES = new Set([
    'poison',
    'poison-target',
    'widow-poison-and-warning',
    'imported-role-poison',
    'protect',
    'imported-role-protect',
    'kill',
    'death',
    'demon-kill',
    'demon-kill-vigormortis',
    'demon-kill-fanggu',
    'vortox-kill-and-false-info',
    'bmr-assassin-kill',
    'bmr-shabaloth-kill',
    'imported-role-kill'
  ]);

  const NIGHT_EDITABLE_ROLE_TEMPLATE_TYPES = new Set([
    'butler-master',
    'gambler-guess',
    'cerenovus-madness',
    'pithag-character-change',
    'philosopher-gain-ability'
  ]);

  const NIGHT_EDITABLE_TARGET_TEMPLATE_TYPES = new Set([
    'butler-master',
    'gambler-guess',
    'cerenovus-madness',
    'pithag-character-change',
    'snakecharmer-swap'
  ]);

  const NIGHT_EDITABLE_TRANSFER_TEMPLATE_TYPES = new Set([
    'imp-self-kill-transfer'
  ]);

  const IMPORTED_STATE_PATCH_REQUIRED_TYPES = new Set([
    'imported-role-status',
    'imported-role-change'
  ]);

  function getNightCandidateKindLabel(kind = '') {
    return NIGHT_CANDIDATE_KIND_LABELS[kind] || kind || '未知';
  }

  function getNightStateChangeTypeLabel(type = '') {
    return NIGHT_STATE_CHANGE_TYPE_LABELS[type] || getNightCandidateKindLabel(type);
  }

  const IMPORTED_LOGIC_CLASS_LABELS = {
    'information-options': '\u4fe1\u606f\u7c7b',
    'storyteller-execution-options': '\u534a\u81ea\u52a8',
    'auto-calculable': '\u53ef\u8ba1\u7b97',
    'passive-manual': '\u624b\u5de5'
  };

  const IMPORTED_LOGIC_CLASS_BOUNDARIES = {
    'information-options': '\u786e\u8ba4\u540e\u79c1\u53d1\u4fe1\u606f',
    'storyteller-execution-options': '\u8bf4\u4e66\u4eba\u4ee3\u4e3a\u6267\u884c',
    'auto-calculable': '\u81ea\u52a8\u7b97\u5019\u9009\uff0c\u4e0d\u81ea\u52a8\u843d\u5b50',
    'passive-manual': '\u624b\u5de5\u88c1\u5b9a'
  };

  function getImportedLogicClassLabel(profile = {}) {
    const classId = profile?.automationClass || profile?.classId || '';
    return IMPORTED_LOGIC_CLASS_LABELS[classId] || '';
  }

  function getImportedLogicBoundary(profile = {}) {
    const classId = profile?.automationClass || profile?.classId || '';
    return IMPORTED_LOGIC_CLASS_BOUNDARIES[classId] || profile?.automationRule || '';
  }

  function buildImportedLogicMetaItems(profile = {}) {
    const label = getImportedLogicClassLabel(profile);
    if (!label) return [];
    const boundary = getImportedLogicBoundary(profile);
    return [`\u5bfc\u5165\uff1a${label}`, boundary ? `\u8fb9\u754c\uff1a${boundary}` : '\u8fb9\u754c\uff1a\u8bf4\u4e66\u4eba\u786e\u8ba4\u540e\u751f\u6548'];
  }

  function getNightCandidateId(candidate = {}) {
    return candidate?.candidateId || candidate?.id || '';
  }

  function isReviewableNightCandidate(candidate = {}) {
    return candidate?.status === 'pending-storyteller'
      || candidate?.status === 'pending-storyteller-confirmation'
      || candidate?.status === 'needs-storyteller-ruling';
  }

  function requiresManualImportedStateRuling(candidate = {}) {
    const stateDraft = candidate?.stateChangeDraft || {};
    if (!IMPORTED_STATE_PATCH_REQUIRED_TYPES.has(stateDraft.type)) return false;
    return !(Array.isArray(stateDraft.patches) && stateDraft.patches.some((patch) => (
      patch?.op === 'set' && String(patch?.path || '').trim()
    )));
  }

  function getNightCandidateTargetSeats(candidate = {}) {
    const stateDraft = candidate?.stateChangeDraft || {};
    const visibleDraft = candidate?.visibleResultDraft || {};
    const payload = candidate?.payload || {};
    const rawTargets = [
      stateDraft.targetSeat,
      stateDraft.target,
      visibleDraft.targetSeat,
      payload.target,
      ...(Array.isArray(stateDraft.targetSeats) ? stateDraft.targetSeats : []),
      ...(Array.isArray(visibleDraft.targetSeats) ? visibleDraft.targetSeats : [])
    ];
    return [...new Set(rawTargets
      .map((seat) => Number(seat))
      .filter((seat) => Number.isFinite(seat) && seat > 0))]
      .sort((left, right) => left - right);
  }

  function canEditNightCandidateStateTarget(candidate = {}) {
    const type = candidate?.stateChangeDraft?.type || '';
    return NIGHT_EDITABLE_STATE_TARGET_TYPES.has(type) || NIGHT_EDITABLE_TARGET_TEMPLATE_TYPES.has(type);
  }

  function canEditNightCandidateTemplateRole(candidate = {}) {
    const type = candidate?.stateChangeDraft?.type || '';
    return NIGHT_EDITABLE_ROLE_TEMPLATE_TYPES.has(type);
  }

  function canEditNightCandidateTemplateCorrectness(candidate = {}) {
    return candidate?.stateChangeDraft?.type === 'gambler-guess';
  }

  function canEditNightCandidateTransferSeat(candidate = {}) {
    const type = candidate?.stateChangeDraft?.type || '';
    return NIGHT_EDITABLE_TRANSFER_TEMPLATE_TYPES.has(type);
  }

  function canEditNightCandidateFangGuRegistration(candidate = {}) {
    return candidate?.stateChangeDraft?.type === 'demon-kill-fanggu';
  }

  function buildNightCandidateRoleOptionsModel({
    selectedRoleId = '',
    roles = [],
    fallbackRole = null,
    emptyLabel = '请选择角色'
  } = {}) {
    const selected = String(selectedRoleId || '').trim();
    const unique = {};
    const options = [];
    const addRole = (role) => {
      if (!role?.id || unique[role.id]) return;
      unique[role.id] = true;
      const roleName = role.nameZh
        || role.name
        || resolveRoleDisplayName(role.id);
      const label = roleName && roleName !== role.id
        ? roleName
        : resolveRoleDisplayName(role.id);
      options.push({
        value: role.id,
        label,
        selected: role.id === selected
      });
    };

    (Array.isArray(roles) ? roles : []).forEach(addRole);
    if (selected && !unique[selected]) {
      addRole(fallbackRole || { id: selected, name: selected, team: 'custom' });
    }

    return [
      { value: '', label: emptyLabel, selected: selected === '' },
      ...options
    ];
  }

  function buildNightCandidateRoleOptionsContextModel({
    selectedRoleId = '',
    roles = [],
    fallbackRole = null,
    emptyLabel = '请选择角色'
  } = {}) {
    const selected = String(selectedRoleId || '').trim();
    return {
      selectedRoleId: selected,
      roleOptions: buildNightCandidateRoleOptionsModel({
        selectedRoleId: selected,
        roles,
        fallbackRole: selected
          ? (fallbackRole || { id: selected, name: selected, team: 'custom' })
          : null,
        emptyLabel
      })
    };
  }

  function buildNightCandidateEditorDraftModel(candidate = {}, {
    reviewable = false,
    playerCount = 15,
    helpers = {}
  } = {}) {
    const visibleDraft = candidate?.visibleResultDraft || null;
    const stateDraft = candidate?.stateChangeDraft || null;
    const visibleText = visibleDraft
      ? cleanNightText(visibleDraft.text || visibleDraft.messageDraft || visibleDraft.result || '', helpers)
      : '';
    const visibleResultKind = visibleDraft?.resultKind || '';
    const visibleResultValue = visibleDraft?.resultValue || (
      visibleResultKind === 'yes-no'
        ? (['?', 'yes', 'true'].includes(String(visibleText).toLowerCase()) ? 'yes' : 'no')
        : visibleText
    );
    const visibleResultSeats = Array.isArray(visibleDraft?.resultSeats)
      ? visibleDraft.resultSeats.join(',')
      : '';
    const stateType = stateDraft?.type || '';
    const manualRulingMissing = requiresManualImportedStateRuling(candidate);

    return {
      hasVisibleResult: Boolean(visibleDraft),
      hasStateChange: Boolean(stateDraft),
      readonly: !reviewable || manualRulingMissing,
      manualRulingMissing,
      visible: {
        text: visibleText,
        resultKind: visibleResultKind,
        resultValue: visibleResultValue,
        resultSeats: visibleResultSeats,
        resultSeat: visibleDraft?.resultSeat || '',
        resultRoleId: visibleDraft?.resultRoleId || '',
        min: visibleDraft?.min ?? 0,
        max: visibleDraft?.max ?? 99,
        playerMax: Number(playerCount || 15) || 15,
        fields: {
          yesNo: visibleResultKind === 'yes-no',
          number: visibleResultKind === 'number',
          role: visibleResultKind === 'role',
          seat: visibleResultKind === 'seat',
          seatRole: visibleResultKind === 'seat-role',
          twoSeatsRole: visibleResultKind === 'two-seats-role'
        },
        yesNoOptions: [
          { value: 'yes', label: '是', selected: visibleResultValue === 'yes' },
          { value: 'no', label: '否', selected: visibleResultValue === 'no' }
        ]
      },
      state: {
        summary: stateDraft
          ? cleanNightText(stateDraft.summary || stateType || '', helpers)
          : '',
        targetText: getNightCandidateTargetSeats(candidate).join(','),
        targetEditable: Boolean(stateDraft && reviewable && canEditNightCandidateStateTarget(candidate)),
        roleEditable: Boolean(stateDraft && reviewable && canEditNightCandidateTemplateRole(candidate)),
        correctnessEditable: Boolean(stateDraft && reviewable && canEditNightCandidateTemplateCorrectness(candidate)),
        transferEditable: Boolean(stateDraft && reviewable && canEditNightCandidateTransferSeat(candidate)),
        fangGuRegistrationEditable: Boolean(stateDraft && reviewable && canEditNightCandidateFangGuRegistration(candidate)),
        roleValue: stateDraft?.chosenRoleId || stateDraft?.roleId || stateDraft?.guessedRoleId || '',
        transferSeatValue: stateDraft?.newDemonSeat || stateDraft?.transferSeat || '',
        fangGuRegistrationValue: stateDraft?.fangguRegistrationRuling || stateDraft?.registrationRuling || 'default',
        isGamblerGuess: stateType === 'gambler-guess',
        fangGuRegistrationOptions: [
          { value: 'default', label: '默认登记', selected: (stateDraft?.fangguRegistrationRuling || stateDraft?.registrationRuling || 'default') === 'default' },
          { value: 'outsider', label: '登记为外来者', selected: (stateDraft?.fangguRegistrationRuling || stateDraft?.registrationRuling || 'default') === 'outsider' },
          { value: 'not-outsider', label: '不登记为外来者', selected: (stateDraft?.fangguRegistrationRuling || stateDraft?.registrationRuling || 'default') === 'not-outsider' }
        ],
        gamblerCorrectOptions: [
          { value: 'false', label: '猜错，不触发死亡', selected: stateDraft?.correct !== true },
          { value: 'true', label: '猜中，触发死亡', selected: stateDraft?.correct === true }
        ]
      }
    };
  }

  function cleanNightText(value, helpers = {}) {
    const roleTitle = (roleId) => resolveNightRoleName(roleId, helpers);
    if (Array.isArray(value)) {
      value = value
        .map((item) => cleanNightText(item, helpers))
        .filter(Boolean)
        .join('、');
    } else if (value && typeof value === 'object') {
      const direct = value.text
        || value.message
        || value.content
        || value.summary
        || value.label
        || value.result
        || value.value;
      if (direct !== undefined && direct !== value) {
        value = direct;
      } else {
        value = Object.entries(value)
          .filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item))
          .slice(0, 4)
          .map(([key, item]) => `${key}: ${item}`)
          .join('；');
      }
    }
    let text = String(value || '').trim();
    if (!text) return '';
    text = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (text === '[object Object]' || /\?{3,}/.test(text) || /^[?？\s]+$/.test(text)) return '';
    text = text.replace(/\s+/g, ' ');
    text = text.replace(/\bafter storyteller confirmation\.?/ig, '');
    text = text.replace(/\bstoryteller confirmation required\.?/ig, '');
    text = text.replace(/\bstoryteller-confirmed\b/ig, '说书人确认');
    text = text.replace(/\bmust be storyteller confirmed\.?/ig, '需说书人确认');
    text = text.replace(/\brules directory\b/ig, '规则库');
    text = text.replace(/\bBMR slice:\s*/ig, '');
    text = text.replace(/\bthis slice\b/ig, '当前版本');
    text = text.replace(/\bRegistration and decoy selection remain storyteller-confirmed\.?/ig, '登记与误导项需说书人确认。');
    text = text.replace(
      /^Butler\s+([0-9]+)\s+chooses\s+([0-9]+)\s+as master\.?$/i,
      (_, actorSeat, targetSeat) => `${actorSeat}号管家选择${targetSeat}号为主人`
    );
    text = text.replace(
      /^Butler\s+chooses\s+([0-9]+)\s+as master\.?$/i,
      (_, targetSeat) => `管家选择${targetSeat}号为主人`
    );
    text = text.replace(
      /^([a-z-]+)\s+private Grimoire access prepared for seat\s+([0-9]+)\.?$/i,
      (_, roleId, seat) => `${seat}号${roleTitle(roleId)}的私密魔典已准备`
    );
    text = text.replace(
      /^Your private Grimoire view is available in your player view\.?$/i,
      '你的私密魔典已在玩家端可查看。'
    );
    text = text.replace(
      /^You learn:\s*([a-z0-9_-]+)\.?$/i,
      (_, roleId) => `你得知：${roleTitle(roleId)}。`
    );
    text = text.replace(
      /^You learn seat\s+([0-9]+)\.?$/i,
      (_, seat) => `你得知：${seat}号。`
    );
    text = text.replace(
      /^You learn seat\s+([0-9]+)\s+is\s+([a-z0-9_-]+)\.?$/i,
      (_, seat, roleId) => `你得知：${seat}号是${roleTitle(roleId)}。`
    );
    text = text.replace(
      /^You learn seats\s+([0-9,\sand]+)\s+with character\s+([a-z0-9_-]+)\.?$/i,
      (_, seats, roleId) => {
        const seatText = seats
          .split(/,|\band\b/i)
          .map((seat) => seat.trim())
          .filter(Boolean)
          .map((seat) => `${seat}号`)
          .join('、');
        return `你得知：${seatText}中有一人是${roleTitle(roleId)}。`;
      }
    );
    text = text.replace(
      /^You learn zero matching characters are in play\.?$/i,
      '你得知：本局没有匹配角色。'
    );
    text = text.replace(
      /^No good player was found for local information\.?$/i,
      '本地信息未找到可用的善良玩家。'
    );
    text = text.replace(
      /^Demon information:\s*minions\s*([^;]+);\s*bluffs\s*(.+)\.?$/i,
      (_, minions, bluffs) => `恶魔信息：爪牙 ${minions}; 恶魔伪装 ${bluffs}`
    );
    text = text.replace(
      /^Lunatic seat\s+([0-9]+)\s+submitted\s+(target\s+([0-9]+)|no target yet)\.?$/i,
      (_, actorSeat, __, targetSeat) => targetSeat
        ? `疯子${actorSeat}号提交目标${targetSeat}号`
        : `疯子${actorSeat}号尚未提交目标`
    );
    text = text.replace(
      /^Private Grimoire reviewed;\s*poison target\s+([0-9]+)\s+is recorded\.?$/i,
      (_, targetSeat) => `已查看私密魔典；中毒目标记录为${targetSeat}号`
    );
    text = text.replace(
      /^Gambler guessed\s+([0-9]+)\s+as\s+([a-z-]+);\s*no death\.?$/i,
      (_, targetSeat, roleId) => `赌徒猜测${targetSeat}号是${roleTitle(roleId)}；不死亡`
    );
    text = text.replace(
      /^Gambler guessed\s+([0-9]+)\s+as\s+([a-z-]+);\s*Gambler dies\.?$/i,
      (_, targetSeat, roleId) => `赌徒猜测${targetSeat}号是${roleTitle(roleId)}；赌徒死亡`
    );
    text = text.replace(
      /^Gambler\s+([0-9]+)\s+guessed\s+([0-9]+)\s+as\s+([a-z0-9_-]+);\s*correct=(true|false)\.?$/i,
      (_, actorSeat, targetSeat, roleId, correct) => `${actorSeat}号赌徒猜测${targetSeat}号是${roleTitle(roleId)}；${correct === 'true' ? '猜中，不死亡' : '猜错，赌徒死亡'}`
    );
    text = text.replace(
      /^([0-9]+)\s+can be revived after storyteller confirmation\.?$/i,
      (_, seat) => `${seat}号可复活，等待说书人确认。`
    );
    text = text.replace(
      /^([0-9]+)\s+is not a confirmed dead Townsfolk target;\s*storyteller ruling required\.?$/i,
      (_, seat) => `${seat}号未确认是已死亡镇民，需说书人裁决。`
    );
    text = text.replace(
      /^([0-9]+)\s+is protected from execution tomorrow after storyteller confirmation\.?$/i,
      (_, seat) => `${seat}号明日免于处决，等待说书人确认。`
    );
    text = text.replace(
      /^([0-9]+)\s+dies after storyteller confirmation;\s*once-per-game use must be checked by storyteller\.?$/i,
      (_, seat) => `${seat}号死亡，等待说书人确认；“一局一次”用量请说书人核对。`
    );
    text = text.replace(
      /([a-z-]+) info prepared:\s*You learn seats ([0-9,\sand]+) with character ([a-z-]+)/i,
      (_, roleId, seats, characterId) => {
        const seatText = seats
          .split(/,|\band\b/i)
          .map((seat) => seat.trim())
          .filter(Boolean)
          .map((seat) => `${seat}号`)
          .join('、');
        return `得知：${seatText}，其中一人是${roleTitle(characterId)}`;
      }
    );
    text = text.replace(
      /([a-z-]+) marks ([0-9]+) poisoned/i,
      (_, roleId, seat) => `${roleTitle(roleId)}：${seat}号中毒`
    );
    text = text.replace(
      /([a-z-]+) protects ([0-9]+)/i,
      (_, roleId, seat) => `${roleTitle(roleId)}：保护${seat}号`
    );
    text = text.replace(
      /([a-z-]+) kills ([0-9]+)/i,
      (_, roleId, seat) => `${roleTitle(roleId)}：击杀${seat}号`
    );
    text = text.replace(
      /([a-z-]+) selected role ([a-z-]+)/i,
      (_, roleId, selectedRoleId) => `${roleTitle(roleId)}：选择${roleTitle(selectedRoleId)}`
    );
    return text.replace(/\s+([。；，])/g, '$1').replace(/\.$/, '。').trim();
  }

  function buildNightCandidateReviewGuideModel(candidate = {}, {
    reviewable = false,
    statusLabel = '',
    hasVisibleResult = false,
    hasStateChange = false
  } = {}) {
    const status = candidate?.status || '';
    let title = '确认前检查';
    let detail = '确认前不写入权威结果；如信息或状态不应生效，请点“拒绝”。';
    let tone = reviewable ? 'warning' : '';
    let actionValue = reviewable ? '确认或修改' : statusLabel || '未处理';
    const manualRulingMissing = requiresManualImportedStateRuling(candidate);

    if (status === 'confirmed' && candidate?.resolutionMode === 'record-only') {
      title = '已记录 · 未生效';
      detail = '本条只写入说书人记录；未发送私信、未修改魔典状态，也未发布公开事件。';
      tone = 'ready';
      actionValue = '已记录 · 未生效';
    } else if (status === 'confirmed') {
      title = '结果已确认';
      detail = '该夜晚结果已处理；如包含玩家可见结果或魔典状态，已按确认结果生效。';
      tone = 'ready';
      actionValue = '已确认';
    } else if (status === 'rejected') {
      title = '已不采用';
      detail = '本条候选已结束，未写入游戏状态；继续处理其他夜晚结果。';
      tone = 'blocked';
      actionValue = '已不采用';
    } else if (!reviewable) {
      title = statusLabel || '夜晚结果状态';
      detail = '当前夜晚结果不可操作；请回到夜晚流程检查状态。';
      tone = '';
    } else if (manualRulingMissing) {
      title = '需要人工处理';
      detail = '当前结果不能安全自动写入。请先在魔典完成处理，再点“不采用”；系统不会把空结果记成已确认。';
      tone = 'blocked';
      actionValue = '先处理魔典状态';
    } else if (hasVisibleResult && hasStateChange) {
      detail = '确认后会发送玩家可见结果，并写入说书人魔典状态；确认前不写入权威结果。';
    } else if (hasVisibleResult) {
      detail = '确认后只发送玩家可见结果；确认前不写入权威结果，也不会向玩家发送这条信息。';
    } else if (hasStateChange) {
      detail = '确认后只写入说书人魔典状态；确认前不写入权威结果，也不会改变玩家状态。';
    }

    return {
      title,
      detail,
      tone,
      items: [
        { label: '玩家可见结果', value: hasVisibleResult ? '确认后发送' : '无私信' },
        { label: '魔典状态', value: manualRulingMissing ? '不会自动写入' : (hasStateChange ? '确认后写入' : '不改状态') },
        { label: '当前动作', value: actionValue }
      ]
    };
  }

  function buildNightCandidateActionModel(candidate = {}, {
    reviewable = false,
    statusLabel = ''
  } = {}) {
    const blockedReason = `当前夜晚结果状态为“${statusLabel || getNightCandidateStatusLabel(candidate?.status)}”，不能重复操作。`;
    const manualRulingMissing = reviewable && requiresManualImportedStateRuling(candidate);
    const manualRulingReason = '当前复杂状态或转职结果不能安全自动写入。请先在魔典手动处理，再点“不采用”。';
    return {
      confirm: {
        text: manualRulingMissing ? '需人工处理' : '确认本条结果',
        disabled: !reviewable || manualRulingMissing,
        title: manualRulingMissing ? manualRulingReason : (reviewable ? '确认后才会发送玩家可见结果或写入魔典状态。' : blockedReason),
        reason: manualRulingMissing ? manualRulingReason : (reviewable ? '' : blockedReason)
      },
      reject: {
        text: '不采用',
        disabled: !reviewable,
        title: reviewable ? '结束本条候选且不应用结果；不会写入权威状态或发送私信。如要更换目标，请先点“修改结果”。' : blockedReason,
        reason: reviewable ? '' : blockedReason
      },
      recordOnly: {
        text: '仅记录',
        disabled: !reviewable,
        title: reviewable ? '只写入说书人审计记录；不发私信、不改状态、不发布公开事件。' : blockedReason,
        reason: reviewable ? '' : blockedReason
      }
    };
  }

  function buildNightCandidateEditorGuideModel(candidate = {}, {
    reviewable = false,
    statusLabel = '',
    hasVisibleResult = false,
    hasStateChange = false
  } = {}) {
    let subtitle = '确认后才会应用最终结果；确认前不写入权威结果。';
    const manualRulingMissing = requiresManualImportedStateRuling(candidate);
    if (manualRulingMissing) {
      subtitle = '该复杂状态或转职效果没有可安全写入的状态补丁；请在魔典手动处理，系统禁止空确认。';
    } else if (hasVisibleResult && hasStateChange) {
      subtitle = '确认后只把“玩家可见结果”发给对应玩家；状态变更只写入说书人魔典。';
    } else if (hasVisibleResult) {
      subtitle = '确认后只发送玩家可见结果；不改变说书人魔典状态。';
    } else if (hasStateChange) {
      subtitle = '确认后只写入说书人魔典状态；不向玩家发送私信。';
    } else {
      subtitle = '此夜晚结果没有可编辑草稿；请根据结果效果确认或关闭。';
    }

    return {
      title: '最终结果',
      badge: manualRulingMissing ? '需手动处理' : (reviewable ? '确认前可改' : (statusLabel || getNightCandidateStatusLabel(candidate?.status))),
      subtitle,
      visibleResult: {
        title: '玩家可见结果',
        textLabel: '私信内容',
        textHint: '可手动覆盖最终私信；手动改过后优先使用这里的文本。',
        resultValueLabel: '结构化结果',
        numberLabel: '结构化数字',
        roleLabel: '结构化角色',
        seatLabel: '结构化座位'
      },
      stateRuling: {
        title: '说书人状态裁定',
        summaryLabel: '状态摘要',
        targetSeatLabel: '目标座位',
        targetSeatPlaceholder: '例如 3 或 3,5',
        roleLabel: '角色',
        guessRoleLabel: '猜测角色',
        transferSeatLabel: '新恶魔座位',
        transferSeatPlaceholder: '例如 7',
        fangGuRegistrationLabel: '方古注册裁定',
        defaultRegistrationLabel: '默认判断',
        outsiderRegistrationLabel: '按外来者触发跳转',
        notOutsiderRegistrationLabel: '按非外来者普通死亡',
        gamblerGuessLabel: '赌徒猜测',
        gamblerWrongLabel: '错误，赌徒死亡',
        gamblerCorrectLabel: '正确，赌徒不死'
      }
    };
  }


  function buildNightCandidateEditorSectionsModel(candidate = {}, {
    reviewable = false,
    editorDraft = null,
    editorGuide = null,
    playerCount = 15,
    helpers = {}
  } = {}) {
    const visibleDraft = candidate?.visibleResultDraft || null;
    const stateDraft = candidate?.stateChangeDraft || null;
    const draft = editorDraft || buildNightCandidateEditorDraftModel(candidate, {
      reviewable,
      playerCount,
      helpers
    });
    const guide = editorGuide || buildNightCandidateEditorGuideModel(candidate, {
      reviewable,
      hasVisibleResult: Boolean(visibleDraft),
      hasStateChange: Boolean(stateDraft)
    });
    const guideText = (value, fallback) => String(value || fallback);
    const readonly = draft?.readonly === true;
    const sections = [];

    if (visibleDraft) {
      const visibleGuide = guide.visibleResult || {};
      const visible = draft.visible || {};
      const visibleFields = visible.fields || {};
      const visiblePlayerMax = visible.playerMax ?? (Number(playerCount || 15) || 15);
      const primaryFields = [
        {
          className: 'is-wide',
          label: guideText(visibleGuide.textLabel, '结果文本'),
          hint: guideText(visibleGuide.textHint, '确认后才会把这段信息发送给对应玩家。'),
          control: {
            kind: 'textarea',
            editKey: 'visible-text',
            value: visible.text || '',
            disabled: readonly
          }
        }
      ];
      const secondaryFields = [];

      if (visibleFields.yesNo) {
        secondaryFields.push({
          label: guideText(visibleGuide.resultValueLabel, '结果判断'),
          control: {
            kind: 'select',
            editKey: 'visible-result-value',
            disabled: readonly,
            attributes: { 'data-result-kind': 'yes-no' },
            options: visible.yesNoOptions || []
          }
        });
      }
      if (visibleFields.number) {
        secondaryFields.push({
          label: guideText(visibleGuide.numberLabel, '数字结果'),
          control: {
            kind: 'input',
            editKey: 'visible-result-value',
            inputType: 'number',
            value: visible.resultValue || '0',
            disabled: readonly,
            attributes: {
              'data-result-kind': 'number',
              min: visible.min ?? visibleDraft.min ?? 0,
              max: visible.max ?? visibleDraft.max ?? 99
            }
          }
        });
      }
      if (visibleFields.role) {
        secondaryFields.push({
          label: guideText(visibleGuide.roleLabel, '角色结果'),
          control: {
            kind: 'role-select',
            editKey: 'visible-result-role',
            selectedRoleId: visible.resultRoleId || visible.resultValue || '',
            disabled: readonly,
            attributes: { 'data-result-kind': 'role' }
          }
        });
      }
      if (visibleFields.seat) {
        secondaryFields.push({
          label: guideText(visibleGuide.seatLabel, '座位结果'),
          control: {
            kind: 'input',
            editKey: 'visible-result-seat',
            inputType: 'number',
            value: visible.resultSeat || visible.resultValue || '',
            disabled: readonly,
            attributes: {
              'data-result-kind': 'seat',
              min: 1,
              max: visiblePlayerMax
            }
          }
        });
      }
      if (visibleFields.seatRole) {
        secondaryFields.push(
          {
            label: guideText(visibleGuide.seatLabel, '座位结果'),
            control: {
              kind: 'input',
              editKey: 'visible-result-seat',
              inputType: 'number',
              value: visible.resultSeat || '',
              disabled: readonly,
              attributes: {
                'data-result-kind': 'seat-role',
                min: 1,
                max: visiblePlayerMax
              }
            }
          },
          {
            label: guideText(visibleGuide.roleLabel, '角色结果'),
            control: {
              kind: 'role-select',
              editKey: 'visible-result-role',
              selectedRoleId: visible.resultRoleId || '',
              disabled: readonly,
              attributes: { 'data-result-kind': 'seat-role' }
            }
          }
        );
      }
      if (visibleFields.twoSeatsRole) {
        secondaryFields.push(
          {
            label: guideText(visibleGuide.seatLabel, '座位结果'),
            control: {
              kind: 'input',
              editKey: 'visible-result-seats',
              value: visible.resultSeats || '',
              disabled: readonly,
              attributes: {
                'data-result-kind': 'two-seats-role',
                placeholder: '如 3,8'
              }
            }
          },
          {
            label: guideText(visibleGuide.roleLabel, '角色结果'),
            control: {
              kind: 'role-select',
              editKey: 'visible-result-role',
              selectedRoleId: visible.resultRoleId || '',
              disabled: readonly,
              attributes: { 'data-result-kind': 'two-seats-role' }
            }
          }
        );
      }

      sections.push({
        section: 'visible-result',
        title: guideText(visibleGuide.title, '玩家可见结果'),
        primaryFields,
        secondaryFields
      });
    }

    if (stateDraft) {
      const stateGuide = guide.stateRuling || {};
      const state = draft.state || {};
      const mapFangGuOptionLabel = (option = {}) => {
        if (option.value === 'default') return guideText(stateGuide.defaultRegistrationLabel, option.label);
        if (option.value === 'outsider') return guideText(stateGuide.outsiderRegistrationLabel, option.label);
        return guideText(stateGuide.notOutsiderRegistrationLabel, option.label);
      };
      const mapGamblerOptionLabel = (option = {}) => option.value === 'true'
        ? guideText(stateGuide.gamblerCorrectLabel, option.label)
        : guideText(stateGuide.gamblerWrongLabel, option.label);
      const primaryFields = [
        {
          className: 'is-wide',
          label: guideText(stateGuide.summaryLabel, '状态摘要'),
          control: {
            kind: 'textarea',
            editKey: 'state-summary',
            value: state.summary || '',
            disabled: readonly
          }
        }
      ];
      const secondaryFields = [
        {
          label: guideText(stateGuide.targetSeatLabel, '目标座位'),
          control: {
            kind: 'input',
            editKey: state.targetEditable ? 'target-seats' : '',
            value: state.targetText || '',
            disabled: !state.targetEditable,
            attributes: {
              placeholder: guideText(stateGuide.targetSeatPlaceholder, '如 3 或 3,5')
            }
          }
        }
      ];

      if (state.roleEditable) {
        const isGamblerGuess = state.isGamblerGuess || stateDraft.type === 'gambler-guess';
        secondaryFields.push({
          label: guideText(isGamblerGuess ? stateGuide.guessRoleLabel : stateGuide.roleLabel, isGamblerGuess ? '猜测角色' : '角色'),
          control: {
            kind: 'role-select',
            editKey: 'role-id',
            selectedRoleId: state.roleValue || ''
          }
        });
      }
      if (state.transferEditable) {
        secondaryFields.push({
          label: guideText(stateGuide.transferSeatLabel, '新恶魔座位'),
          control: {
            kind: 'input',
            editKey: 'transfer-seat',
            value: state.transferSeatValue || '',
            attributes: {
              placeholder: guideText(stateGuide.transferSeatPlaceholder, '如 7')
            }
          }
        });
      }
      if (state.fangGuRegistrationEditable) {
        secondaryFields.push({
          label: guideText(stateGuide.fangGuRegistrationLabel, '方古登记'),
          control: {
            kind: 'select',
            editKey: 'fanggu-registration',
            options: (state.fangGuRegistrationOptions || []).map((option) => ({
              ...option,
              label: mapFangGuOptionLabel(option)
            }))
          }
        });
      }
      if (state.correctnessEditable) {
        secondaryFields.push({
          label: guideText(stateGuide.gamblerGuessLabel, '赌徒结果'),
          control: {
            kind: 'select',
            editKey: 'gambler-correct',
            options: (state.gamblerCorrectOptions || []).map((option) => ({
              ...option,
              label: mapGamblerOptionLabel(option)
            }))
          }
        });
      }

      sections.push({
        section: 'state-ruling',
        title: guideText(stateGuide.title, '魔典状态裁决'),
        primaryFields,
        secondaryFields
      });
    }

    return {
      readonly,
      hasVisibleResult: Boolean(visibleDraft),
      hasStateChange: Boolean(stateDraft),
      sections
    };
  }

  function buildNightCandidateEditorModel(candidate = {}, {
    id = '',
    reviewable = false,
    editorDraft = null,
    editorGuide = null,
    playerCount = 15,
    helpers = {},
    statusLabel = ''
  } = {}) {
    const visibleDraft = candidate?.visibleResultDraft || null;
    const stateDraft = candidate?.stateChangeDraft || null;
    if (!visibleDraft && !stateDraft) return null;

    const hasVisibleResult = Boolean(visibleDraft);
    const hasStateChange = Boolean(stateDraft);
    const guide = editorGuide || buildNightCandidateEditorGuideModel(candidate, {
      reviewable,
      statusLabel,
      hasVisibleResult,
      hasStateChange
    });
    const draft = editorDraft || buildNightCandidateEditorDraftModel(candidate, {
      reviewable,
      playerCount,
      helpers
    });
    const sectionsModel = buildNightCandidateEditorSectionsModel(candidate, {
      reviewable,
      editorDraft: draft,
      editorGuide: guide,
      playerCount,
      helpers
    });
    const guideText = (value, fallback) => String(value || fallback);

    return {
      id,
      title: guideText(guide.title, '最终结果'),
      badge: guideText(guide.badge, reviewable ? '待确认' : (statusLabel || getNightCandidateStatusLabel(candidate?.status))),
      subtitle: guideText(guide.subtitle, '确认前不会发送给玩家，也不会写入魔典状态。'),
      sections: Array.isArray(sectionsModel.sections) ? sectionsModel.sections : []
    };
  }

  function buildNightCandidateDetailModel(candidate = {}, helpers = {}) {
    const stateDraft = candidate?.stateChangeDraft || {};
    const visibleDraft = candidate?.visibleResultDraft || {};
    const hasVisibleResult = Boolean(visibleDraft && Object.keys(visibleDraft).length);
    const hasStateChange = Boolean(stateDraft && Object.keys(stateDraft).length);
    const targets = getNightCandidateTargetSeats(candidate);
    const targetText = targets.map((seat) => `${seat}号`).join('、');
    const warnings = Array.isArray(candidate?.warnings)
      ? candidate.warnings.map((warning) => cleanNightText(warning?.text || warning, helpers)).filter(Boolean)
      : [];
    const fallbackDetail = stateDraft.type
      ? getNightStateChangeTypeLabel(stateDraft.type)
      : getNightCandidateKindLabel(candidate?.candidateKind);
    const rawDetail = candidate?.diaryDraft?.storytellerText
      || stateDraft.summary
      || visibleDraft.text
      || visibleDraft.messageDraft
      || fallbackDetail
      || '等待确认。';
    const detailCore = cleanNightText(rawDetail, helpers) || '等待确认。';
    const type = stateDraft.type || visibleDraft.type || candidate?.candidateKind;
    let headline = detailCore;
    if (type === 'poison' && targetText) headline = `${targetText}中毒`;
    else if ((type === 'kill' || type === 'death') && targetText) headline = `${targetText}死亡`;
    else if (type === 'protect' && targetText) headline = `保护${targetText}`;
    else if (type === 'drunk' && targetText) headline = `${targetText}醉酒`;
    else if (type === 'imp-self-kill-transfer') headline = targetText
      ? `${targetText}死亡，需指定新恶魔`
      : '小恶魔自杀转移，需指定新恶魔';
    else if (visibleDraft.text || visibleDraft.messageDraft) headline = cleanNightText(visibleDraft.text || visibleDraft.messageDraft, helpers) || detailCore;

    const kind = getNightCandidateKindLabel(candidate?.candidateKind);
    const source = candidate?.inputSourceLabel
      || (candidate?.inputSource === 'ai-test' ? 'AI测试'
        : candidate?.inputSource === 'auto-info' ? '自动信息'
          : candidate?.inputSource === 'storyteller' ? '说书人代填'
            : candidate?.inputSource === 'player' ? '玩家提交'
              : candidate?.source === 'rules'
      ? '规则'
      : (candidate?.source === 'ai' ? 'AI' : (candidate?.source || '本地')));
    const effectType = stateDraft.type
      ? getNightStateChangeTypeLabel(stateDraft.type)
      : getNightCandidateKindLabel(candidate?.candidateKind);
    const metaItems = [
      `来源：${source}`,
      `类型：${kind}`,
      targets.length ? `目标：${targetText}` : `效果：${effectType}`,
      ...buildImportedLogicMetaItems(candidate?.importedLogicProfile || candidate?.logicProfile)
    ];

    const reviewable = isReviewableNightCandidate(candidate);
    const statusLabel = getNightCandidateStatusLabel(candidate?.status, candidate?.resolutionMode);
    return {
      id: getNightCandidateId(candidate),
      seat: candidate?.seat || '',
      roleName: resolveNightRoleName(candidate?.roleId || candidate?.roleIdAtPrompt || '', helpers),
      status: candidate?.status || '',
      statusLabel,
      reviewable,
      headline,
      detailCore,
      warnings,
      metaItems,
      reviewGuide: buildNightCandidateReviewGuideModel(candidate, {
        reviewable,
        statusLabel,
        hasVisibleResult,
        hasStateChange
      }),
      editorGuide: buildNightCandidateEditorGuideModel(candidate, {
        reviewable,
        statusLabel,
        hasVisibleResult,
        hasStateChange
      }),
      actions: buildNightCandidateActionModel(candidate, { reviewable, statusLabel })
    };
  }

  function buildNightCandidateFallbackRowModel(candidate = {}, {
    reviewable = null,
    statusLabel = '',
    helpers = {}
  } = {}) {
    const stateDraft = candidate?.stateChangeDraft || {};
    const visibleDraft = candidate?.visibleResultDraft || {};
    const hasVisibleResult = Boolean(visibleDraft && Object.keys(visibleDraft).length);
    const hasStateChange = Boolean(stateDraft && Object.keys(stateDraft).length);
    const effectiveReviewable = reviewable === null || reviewable === undefined
      ? isReviewableNightCandidate(candidate)
      : Boolean(reviewable);
    const effectiveStatusLabel = statusLabel || getNightCandidateStatusLabel(candidate?.status, candidate?.resolutionMode);

    return {
      id: getNightCandidateId(candidate),
      seat: candidate?.seat || '',
      roleName: resolveNightRoleName(candidate?.roleId || candidate?.roleIdAtPrompt || '', helpers),
      status: candidate?.status || '',
      statusLabel: effectiveStatusLabel,
      reviewable: effectiveReviewable,
      headline: '等待确认。',
      detailCore: '等待确认。',
      warnings: [],
      metaItems: [],
      reviewGuide: buildNightCandidateReviewGuideModel(candidate, {
        reviewable: effectiveReviewable,
        statusLabel: effectiveStatusLabel,
        hasVisibleResult,
        hasStateChange
      }),
      editorGuide: buildNightCandidateEditorGuideModel(candidate, {
        reviewable: effectiveReviewable,
        statusLabel: effectiveStatusLabel,
        hasVisibleResult,
        hasStateChange
      }),
      actions: buildNightCandidateActionModel(candidate, {
        reviewable: effectiveReviewable,
        statusLabel: effectiveStatusLabel
      })
    };
  }

  function buildNightCandidateRowsModel(candidateResolutions = [], helpers = {}) {
    return (Array.isArray(candidateResolutions) ? candidateResolutions : [])
      .map((candidate) => buildNightCandidateDetailModel(candidate, helpers));
  }

  function buildNightCandidateRowsViewModel(candidateResolutions = [], {
    rowModels = [],
    helpers = {}
  } = {}) {
    const candidates = Array.isArray(candidateResolutions) ? candidateResolutions : [];
    const models = Array.isArray(rowModels) ? rowModels : [];
    return candidates.map((candidate, index) => {
      const fallbackModel = buildNightCandidateFallbackRowModel(candidate, { helpers });
      const model = models[index] || fallbackModel;
      const id = model.id || getNightCandidateId(candidate);
      const reviewable = model.reviewable === true;
      return {
        ...model,
        id,
        reviewable,
        actions: model.actions || {
          confirm: { text: '\u786e\u8ba4', disabled: !reviewable },
          reject: { text: '\u4e0d\u91c7\u7528', disabled: !reviewable }
        }
      };
    });
  }

  function buildNightResolutionPanelRenderModel({
    rolesDealt = false,
    hasBatch = false,
    hasCandidates = false,
    collectionClosed = false,
    nightResolvedAwaitingDay = false,
    currentNightLabel = '第 1 天夜晚',
    nextNightLabel = '第 1 天夜晚',
    nightOrder = [],
    nightSummary = [],
    candidateResolutions = [],
    helpers = {}
  } = {}) {
    const safeNightOrder = Array.isArray(nightOrder) ? nightOrder : [];
    const safeNightSummary = Array.isArray(nightSummary) ? nightSummary : [];
    const safeCandidates = Array.isArray(candidateResolutions) ? candidateResolutions : [];
    const effectiveHasCandidates = Boolean(hasCandidates) || safeCandidates.length > 0;
    const orderRowsModel = buildNightOrderRowsModel({
      nightOrder: safeNightOrder,
      nightSummary: safeNightSummary,
      helpers
    });
    const summaryRowsModel = buildNightSummaryRowsModel({
      nightSummary: safeNightSummary,
      nightOrder: safeNightOrder,
      helpers
    });
    const candidateRowsModel = buildNightCandidateRowsModel(safeCandidates, helpers);
    const candidateRowsViewModel = buildNightCandidateRowsViewModel(safeCandidates, {
      rowModels: candidateRowsModel,
      helpers
    });
    return {
      orderRowsModel,
      summaryRowsModel,
      candidateRowsModel,
      candidateRowsViewModel,
      summaryHeader: buildNightResolutionHeaderModel({
        rolesDealt,
        hasBatch,
        hasCandidates: effectiveHasCandidates,
        collectionClosed,
        nightResolvedAwaitingDay,
        currentNightLabel,
        nextNightLabel,
        nightSummaryCount: safeNightSummary.length,
        candidateCount: safeCandidates.length
      }),
      summarySections: buildNightResolutionSummarySectionsModel({
        nightOrderCount: safeNightOrder.length,
        nightSummaryCount: safeNightSummary.length,
        candidateCount: safeCandidates.length,
        hasCandidateRows: candidateRowsViewModel.length > 0
      })
    };
  }

  function mapNightSummaryToFlowItems(nightSummary = [], helpers = {}) {
    return (Array.isArray(nightSummary) ? nightSummary : []).map((item) => ({
      label: `${item.seat || '-'}号`,
      value: `${resolveRoleDisplayName(item.roleIdAtPrompt || item.roleId || '', helpers)} · ${getNightSubmissionStatusLabel(item.submissionStatus || 'none')}${item.aiTestPlayer ? ' · AI测试确定性提交' : ''}`
    }));
  }

  function mapNightTodoToFlowItems({ nightOrder = [], nightSummary = [], helpers = {} } = {}) {
    const summaryBySeat = new Map((Array.isArray(nightSummary) ? nightSummary : [])
      .map((item) => [Number(item?.seat), item]));
    const orderRows = Array.isArray(nightOrder) && nightOrder.length
      ? nightOrder
      : (Array.isArray(nightSummary) ? nightSummary : []);
    return orderRows
      .slice()
      .sort((left, right) => {
        const leftOrder = getNightOrderValue(left);
        const rightOrder = getNightOrderValue(right);
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return Number(left?.seat || 0) - Number(right?.seat || 0);
      })
      .map((row) => {
        const seat = Number(row?.seat);
        const summary = summaryBySeat.get(seat) || {};
        const status = summary.submissionStatus || row?.submissionStatus || row?.status || 'none';
        const roleId = summary.roleIdAtPrompt || summary.roleId || row?.roleIdAtPrompt || row?.roleId || '';
        const promptKind = summary.promptKind || row?.promptKind || '';
        const source = summary.inputSourceLabel
          || (summary.aiTestPlayer
            ? 'AI测试'
            : ['submitted', 'locked'].includes(String(status)) ? '玩家提交' : '等待玩家/说书人');
        const manualHint = (summary.canModify === false || row?.autoSubmit === true)
          ? '自动信息'
          : '可人工确认或手动处理';
        return {
          label: `${Number.isFinite(seat) ? seat : '-'}号`,
          value: `${resolveRoleDisplayName(roleId, helpers)} · ${getNightSubmissionStatusLabel(status)} · ${getNightPromptKindLabel(promptKind, row?.autoSubmit === true)} · ${source} · ${manualHint}`
        };
      });
  }

  function mapNightCandidatesToFlowItems(candidateResolutions = [], helpers = {}) {
    return (Array.isArray(candidateResolutions) ? candidateResolutions : []).map((candidate) => ({
      label: `${candidate.seat || '-'}号`,
      value: `${resolveRoleDisplayName(candidate.roleId || candidate.roleIdAtPrompt || '', helpers)} · ${getNightCandidateStatusLabel(candidate.status)}`
    }));
  }

  function mapVoteEntriesToFlowItems(votes = []) {
    const recordedByLabel = (recordedBy) => {
      const value = String(recordedBy || '').toLowerCase();
      if (value === 'storyteller') return '说书人记录';
      if (value === 'player') return '玩家提交';
      if (value === 'system') return '系统记录';
      return '玩家提交';
    };
    return (Array.isArray(votes) ? votes : []).map((entry) => ({
      label: `${entry.voterSeat || '-'}号`,
      value: `${entry.vote ? '赞成' : '不举手'} · ${recordedByLabel(entry.recordedBy)}`
    }));
  }

  function mapGameEndCandidatesToFlowItems(candidates = []) {
    return (Array.isArray(candidates) ? candidates : []).map((candidate) => ({
      label: candidate.winningTeam === 'good' ? '好人' : '邪恶',
      value: `${candidate.reasonCode || '未标注原因'} · ${candidate.status || '未知状态'}`
    }));
  }

  return {
    FLOW_STAGE_LABELS,
    getFlowStageLabel,
    buildStageGuideModel,
    buildRightMenuStageToolsModel,
    buildRightMenuFlowBoardModel,
    buildAuthoritativePhaseStripModel,
    buildStatePreflightModel,
    normalizeReceiptSummary,
    buildIdentityReceiptSectionsModel,
    buildIdentityReceiptPanelModel,
    buildSetupReadinessChecklistModel,
    buildSetupCandidateSummaryModel,
    buildDealConfirmPanelModel,
    buildSetupDealPanelModel,
    buildNightResolutionHeaderModel,
    buildNightResolutionSummarySectionsModel,
    buildNightResolutionPanelRenderModel,
    buildNightFlowPanelModel,
    buildDayFlowPanelModel,
    buildDayUtilitySummaryModel,
    buildVoteFlowPanelModel,
    buildGameEndPanelModel,
    buildDayVoteDetailSectionsModel,
    buildDayVoteSummaryModel,
    buildDayVoteInputGuideModel,
    buildNightToolSummaryModel,
    buildNightToolStepGuideModel,
    buildVoteToolSummaryModel,
    buildVoteToolStepGuideModel,
    buildVoteToolActionModel,
    buildGameEndSummaryModel,
    buildManualToolPanelModel,
    getNightSubmissionStatusLabel,
    getNightCandidateStatusLabel,
    getNightPromptKindLabel,
    buildNightOrderRowsModel,
    buildNightSummaryRowsModel,
    getNightCandidateTargetSeats,
    canEditNightCandidateStateTarget,
    canEditNightCandidateTemplateRole,
    canEditNightCandidateTemplateCorrectness,
    canEditNightCandidateTransferSeat,
    canEditNightCandidateFangGuRegistration,
    requiresManualImportedStateRuling,
    buildNightCandidateRoleOptionsModel,
    buildNightCandidateRoleOptionsContextModel,
    buildNightCandidateEditorDraftModel,
    buildNightCandidateEditorSectionsModel,
    buildNightCandidateEditorModel,
    cleanNightText,
    buildNightCandidateReviewGuideModel,
    buildNightCandidateEditorGuideModel,
    buildNightCandidateActionModel,
    buildNightCandidateDetailModel,
    buildNightCandidateFallbackRowModel,
    buildNightCandidateRowsModel,
    buildNightCandidateRowsViewModel,
    mapNightSummaryToFlowItems,
    mapNightCandidatesToFlowItems,
    mapVoteEntriesToFlowItems,
    mapGameEndCandidatesToFlowItems
  };
});
