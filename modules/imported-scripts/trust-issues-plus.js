const SCRIPT_ID = 'trust-issues-plus';

function logicProfile({
  triggerMode,
  promptKind = 'auto_info',
  riskLevel = 'medium',
  resultType = 'information',
  candidateType = null,
  targetRules = null,
  notes = []
}) {
  const resolvedCandidateType = candidateType || (
    resultType === 'information' ? 'custom-info-candidate'
      : resultType === 'kill' ? 'custom-kill-candidate'
        : resultType === 'poison' ? 'custom-poison-candidate'
          : resultType === 'protect' ? 'custom-protect-candidate'
            : resultType === 'role-change' ? 'custom-role-change-candidate'
              : 'custom-choice-candidate'
  );
  return {
    schemaVersion: 'botc.imported-role-logic.v1',
    source: 'trust-issues-plus-image-import-2026-07-09',
    triggerMode,
    promptKind,
    riskLevel,
    resultType,
    candidateType: resolvedCandidateType,
    targetRules,
    storytellerConfirmationRequired: true,
    playerVisibleBoundary: 'confirmed-candidate-only',
    manualTweaksAllowed: true,
    notes
  };
}

const TARGETS = Object.freeze({
  oneAliveOther: { count: 1, allowSelf: false, allowDead: false, mustBeDistinct: true, mustBeDead: false },
  oneAliveAny: { count: 1, allowSelf: true, allowDead: false, mustBeDistinct: true, mustBeDead: false },
  oneAny: { count: 1, allowSelf: true, allowDead: true, mustBeDistinct: true, mustBeDead: false },
  twoAliveAny: { count: 2, allowSelf: true, allowDead: false, mustBeDistinct: true, mustBeDead: false },
  twoAliveOther: { count: 2, allowSelf: false, allowDead: false, mustBeDistinct: true, mustBeDead: false },
  threeAliveAny: { count: 3, allowSelf: true, allowDead: false, mustBeDistinct: true, mustBeDead: false },
  fourAliveAny: { count: 4, allowSelf: true, allowDead: false, mustBeDistinct: true, mustBeDead: false },
  twoAny: { count: 2, allowSelf: true, allowDead: true, mustBeDistinct: true, mustBeDead: false }
});

const ROLE_LOGIC_CLASSES = Object.freeze({
  informationOptions: {
    id: 'information-options',
    name: '信息类选项',
    rule: '角色提交目标/选项后，系统生成信息候选；不改玩家存活、阵营、角色或胜负状态。',
    storytellerBoundary: '说书人确认后才发送给玩家；可由系统预填候选文本或可计算信息。',
  },
  storytellerExecutionOptions: {
    id: 'storyteller-execution-options',
    name: '半自动执行类',
    rule: '角色提交目标/选项后，系统生成状态变化候选；需要说书人代为确认并执行最终结果。',
    storytellerBoundary: '候选阶段不得直接修改权威游戏状态，确认后才落子。',
  },
  autoCalculable: {
    id: 'auto-calculable',
    name: '可自动计算类',
    rule: '当所需输入、标记和历史账本齐全时，系统可以直接算出结果候选。',
    storytellerBoundary: '当前项目边界下仍默认走说书人确认；只在测试/明确授权模式下可自动提交。',
  },
  passiveManual: {
    id: 'passive-manual',
    name: '被动/手工裁定类',
    rule: '主要是设置、疯狂、注册、恶魔特殊限制或传奇规则；没有稳定夜晚提交就不能自动结算。',
    storytellerBoundary: '由说书人维护标记和最终裁定。',
  },
});

const ROLE_LOGIC_CLASSIFICATION = Object.freeze({
  copycat: { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '目标善恶会导致变角色或醉酒，是状态变化。' },
  'head-nurse': { classId: ROLE_LOGIC_CLASSES.informationOptions.id, reason: '读取目标当晚选择和信息，只输出私密信息。' },
  psychologist: { classId: ROLE_LOGIC_CLASSES.informationOptions.id, reason: '目标同意后给双方恶魔判断信息。' },
  'vivid-dreamer': { classId: ROLE_LOGIC_CLASSES.informationOptions.id, reason: '选择两人后回答是/否和偶数夜维度信息。' },
  'pill-hoarder': { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '一名保护清醒、一名醉酒，需说书人分配并落状态。' },
  conspiracist: { classId: ROLE_LOGIC_CLASSES.autoCalculable.id, reason: '目标数等于初始邪恶人数时，可由阵营账本判断是否全邪恶。' },
  'security-guard': { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '可能跳过爪牙唤醒，会影响夜晚流程。' },
  clairvoyant: { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '修正注册会影响其他信息能力。' },
  'pathological-liar': { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '命中恶魔后让其自以为能力按中毒处理。' },
  'doomsday-preacher': { classId: ROLE_LOGIC_CLASSES.autoCalculable.id, reason: '在夜晚提交完整后，可统计目标选择玩家的总次数。' },
  'scaredy-cat': { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '选择2-4人后可能免死，保护结算仍影响死亡裁定。' },
  'corpse-obsessed': { classId: ROLE_LOGIC_CLASSES.autoCalculable.id, reason: '关注目标死亡后，可从角色账本生成角色信息候选。' },
  interrogator: { classId: ROLE_LOGIC_CLASSES.autoCalculable.id, reason: '红鲱鱼标记齐全时，可判断两名目标是否含邪恶注册。' },
  anarchist: { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '目标重定向会改写其他角色目标。' },
  nihilist: { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '替死会改变死亡结果。' },
  rambler: { classId: ROLE_LOGIC_CLASSES.passiveManual.id, reason: '白天疯狂与处决风险没有稳定夜晚提交。' },
  joker: { classId: ROLE_LOGIC_CLASSES.passiveManual.id, reason: '仅当其为恶魔时改变死亡决定权，需说书人管理。' },
  gaslighter: { classId: ROLE_LOGIC_CLASSES.passiveManual.id, reason: '设置假煤气灯人和恢复能力需要说书人维护。' },
  'shoulder-angel': { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '临时恶魔/邪恶注册会影响其他能力。' },
  schemer: { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '可变恶魔并改变原恶魔角色，是高风险状态变化。' },
  'shoulder-devil': { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '根据目标当晚选择制造死亡，需说书人执行。' },
  psycho: { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '恶魔击杀并保留被杀爪牙能力。' },
  maniac: { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '首次选择镇民会中毒并改为邻近死亡。' },
  sociopath: { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '首次选择外来者会改为邻近死亡。' },
  doppelganger: { classId: ROLE_LOGIC_CLASSES.storytellerExecutionOptions.id, reason: '二重身成对、共享能力和单死亡源需说书人管理。' },
  'blood-thirst': { classId: ROLE_LOGIC_CLASSES.passiveManual.id, reason: '传奇规则改变恶魔击杀选择顺序和最终死亡决定。' },
});

function roleLogicClass(roleId) {
  const item = ROLE_LOGIC_CLASSIFICATION[roleId] || {
    classId: ROLE_LOGIC_CLASSES.passiveManual.id,
    reason: '未单独归类，默认由说书人手工裁定。',
  };
  const classDef = Object.values(ROLE_LOGIC_CLASSES).find((entry) => entry.id === item.classId) || ROLE_LOGIC_CLASSES.passiveManual;
  return {
    ...item,
    name: classDef.name,
    rule: classDef.rule,
    storytellerBoundary: classDef.storytellerBoundary,
  };
}

function role({ id, name, nameEn, team, ability, nightOrder = { first: 0, other: 0 }, logic = null, reminders = [] }) {
  const typeByTeam = {
    townsfolk: 'townsfolk',
    outsider: 'outsiders',
    minion: 'minions',
    demon: 'demons',
    fabled: 'travellers'
  };
  const alignmentByTeam = {
    townsfolk: 'good',
    outsider: 'good',
    minion: 'evil',
    demon: 'evil',
    fabled: 'fabled'
  };
  const classification = roleLogicClass(id);
  const logicWithClassification = logic ? {
    ...logic,
    automationClass: classification.classId,
    automationClassName: classification.name,
    automationRule: classification.rule,
  } : null;
  return {
    id,
    name,
    nameEn,
    team,
    type: typeByTeam[team],
    group: typeByTeam[team],
    alignment: alignmentByTeam[team],
    ability,
    firstNight: Number(nightOrder.first || 0) > 0,
    otherNights: Number(nightOrder.other || 0) > 0,
    nightOrder,
    abilityType: logic ? 'imported_logic_profile' : 'manual',
    actionType: logic ? 'storyteller_confirmed_candidate' : 'manual_review',
    logicClassification: classification,
    logicProfile: logicWithClassification,
    reminders,
    remindersGlobal: [],
    source: { scriptId: SCRIPT_ID, image: 'D:/下载/微信图片_20260709002315.jpg' }
  };
}

const characters = {
  townsfolk: [
    role({
      id: 'copycat',
      name: '模仿者',
      nameEn: 'Copycat',
      team: 'townsfolk',
      ability: '在你的首个夜晚，选择一名玩家：如果他是善良的，你变成他的角色；如果他是邪恶的，你醉酒。',
      nightOrder: { first: 10, other: 0 },
      logic: logicProfile({ triggerMode: 'first-night', promptKind: 'select_1', resultType: 'role-change', riskLevel: 'high', targetRules: TARGETS.oneAliveOther, notes: ['善良目标变角色；邪恶目标导致醉酒，需说书人确认。'] }),
      reminders: ['变成', '醉酒']
    }),
    role({
      id: 'head-nurse',
      name: '护士长',
      nameEn: 'Head Nurse',
      team: 'townsfolk',
      ability: '每个夜晚，选择一名玩家：你会得知他选择了谁，以及他得知了什么。如果你选中了恶魔，他会得知自己的恶魔角色。你不可能是恶魔。',
      nightOrder: { first: 20, other: 20 },
      logic: logicProfile({ triggerMode: 'first-and-other-night', promptKind: 'select_1', resultType: 'information', riskLevel: 'high', targetRules: TARGETS.oneAliveAny, notes: ['信息依赖目标当晚行动与目标收到的信息。'] }),
      reminders: ['已查看']
    }),
    role({
      id: 'psychologist',
      name: '心理医生',
      nameEn: 'Psychologist',
      team: 'townsfolk',
      ability: '每个夜晚*，选择一名玩家：如果他同意，你们都会得知他是否是恶魔。你不可能是恶魔。',
      nightOrder: { first: 0, other: 30 },
      logic: logicProfile({ triggerMode: 'other-night', promptKind: 'select_1', resultType: 'information', riskLevel: 'medium', targetRules: TARGETS.oneAliveOther, notes: ['需要记录目标是否同意，再给双方信息。'] }),
      reminders: ['同意', '信息']
    }),
    role({
      id: 'vivid-dreamer',
      name: '白日梦想家',
      nameEn: 'Vivid Dreamer',
      team: 'townsfolk',
      ability: '每个夜晚，选择两名玩家。你会得知他们是否同一阵营、是否与恶魔邻近、是否有恶魔；说书人只回答是或否。你会在每个偶数夜晚得知自己的信息对应以上哪两项。',
      nightOrder: { first: 30, other: 40 },
      logic: logicProfile({ triggerMode: 'first-and-other-night', promptKind: 'select_2', resultType: 'information', riskLevel: 'high', targetRules: TARGETS.twoAliveAny, notes: ['说书人需选择两个检测维度；偶数夜揭示维度。'] }),
      reminders: ['维度A', '维度B']
    }),
    role({
      id: 'pill-hoarder',
      name: '药师',
      nameEn: 'Pill Hoarder',
      team: 'townsfolk',
      ability: '每个夜晚，选择两名玩家：一名玩家会清醒健康且恶魔负面能力对他无效；另一名玩家醉酒，直到下个黄昏。',
      nightOrder: { first: 40, other: 50 },
      logic: logicProfile({ triggerMode: 'first-and-other-night', promptKind: 'select_2', resultType: 'status', riskLevel: 'high', targetRules: TARGETS.twoAliveAny, notes: ['两个目标的效果不同，需要说书人确认哪一名受保护、哪一名醉酒。'] }),
      reminders: ['清醒健康', '醉酒']
    }),
    role({
      id: 'conspiracist',
      name: '阴谋论者',
      nameEn: 'Conspiracist',
      team: 'townsfolk',
      ability: '每个夜晚，选择与初始邪恶玩家数量相等的玩家：如果你选择的玩家都是邪恶的，善良阵营获胜。',
      nightOrder: { first: 50, other: 60 },
      logic: logicProfile({ triggerMode: 'first-and-other-night', promptKind: 'select_4', resultType: 'status', riskLevel: 'high', targetRules: TARGETS.fourAliveAny, notes: ['实际目标数应等于初始邪恶人数；7-9人通常为2，10-12人为3，13-15人为4。'] }),
      reminders: ['阴谋目标']
    }),
    role({
      id: 'security-guard',
      name: '安保人员',
      nameEn: 'Security Guard',
      team: 'townsfolk',
      ability: '每个夜晚，选择两名玩家：如果你选中了爪牙，他当晚不会因其自身能力而被唤醒。',
      nightOrder: { first: 60, other: 70 },
      logic: logicProfile({ triggerMode: 'first-and-other-night', promptKind: 'select_2', resultType: 'status', riskLevel: 'high', targetRules: TARGETS.twoAliveAny, notes: ['可能阻止爪牙自身能力唤醒，需说书人确认并调整夜晚流程。'] }),
      reminders: ['守卫']
    }),
    role({
      id: 'clairvoyant',
      name: '灵视者',
      nameEn: 'Clairvoyant',
      team: 'townsfolk',
      ability: '每个夜晚*，选择两名玩家：他们被当作正确的阵营和角色类型，即使因为任何原因无法被当作正确的阵营和角色类型。',
      nightOrder: { first: 0, other: 80 },
      logic: logicProfile({ triggerMode: 'other-night', promptKind: 'select_2', resultType: 'status', riskLevel: 'high', targetRules: TARGETS.twoAliveAny, notes: ['注册修正效果会影响其他信息能力。'] }),
      reminders: ['正确注册']
    }),
    role({
      id: 'pathological-liar',
      name: '惯性说谎者',
      nameEn: 'Pathological Liar',
      team: 'townsfolk',
      ability: '每个夜晚*，选择一名玩家：如果你选中了恶魔，恶魔自以为的角色能力按中毒处理。',
      nightOrder: { first: 0, other: 90 },
      logic: logicProfile({ triggerMode: 'other-night', promptKind: 'select_1', resultType: 'poison', riskLevel: 'high', targetRules: TARGETS.oneAliveAny, notes: ['只在目标为恶魔时影响其自以为角色能力。'] }),
      reminders: ['中毒处理']
    }),
    role({
      id: 'doomsday-preacher',
      name: '末日传道士',
      nameEn: 'Doomsday Preacher',
      team: 'townsfolk',
      ability: '每个夜晚*，选择两名玩家：你会得知他们今晚选择玩家的总次数。',
      nightOrder: { first: 0, other: 100 },
      logic: logicProfile({ triggerMode: 'other-night', promptKind: 'select_2', resultType: 'information', riskLevel: 'medium', targetRules: TARGETS.twoAliveAny, notes: ['统计所选玩家当晚选择玩家的次数总和。'] }),
      reminders: ['次数']
    }),
    role({
      id: 'scaredy-cat',
      name: '胆小鬼',
      nameEn: 'Scaredy Cat',
      team: 'townsfolk',
      ability: '每个夜晚*，选择二至四名玩家：如果你选中了恶魔，你今晚不会被恶魔杀死。',
      nightOrder: { first: 0, other: 110 },
      logic: logicProfile({ triggerMode: 'other-night', promptKind: 'select_4', resultType: 'protect', riskLevel: 'high', targetRules: TARGETS.fourAliveAny, notes: ['实际允许2-4名目标；当前提示使用4目标上限，少于4人时说书人可手动处理候选。'] }),
      reminders: ['防恶魔']
    }),
    role({
      id: 'corpse-obsessed',
      name: '冰恋者',
      nameEn: 'Corpse Obsessed',
      team: 'townsfolk',
      ability: '每个夜晚，选择两名玩家：如果他们之中有人在下个黄昏前死亡，你会在当晚得知他的角色。',
      nightOrder: { first: 70, other: 120 },
      logic: logicProfile({ triggerMode: 'first-and-other-night', promptKind: 'select_2', resultType: 'information', riskLevel: 'medium', targetRules: TARGETS.twoAliveAny, notes: ['延迟到目标死亡后的当晚给角色信息。'] }),
      reminders: ['关注']
    }),
    role({
      id: 'interrogator',
      name: '审讯官',
      nameEn: 'Interrogator',
      team: 'townsfolk',
      ability: '每个夜晚，选择两名玩家：你会得知他们之中是否有邪恶玩家；会有一名玩家始终被你的能力当作邪恶玩家。你可能会被当作邪恶阵营、爪牙角色或恶魔角色，即使你已死亡。',
      nightOrder: { first: 80, other: 130 },
      logic: logicProfile({ triggerMode: 'first-and-other-night', promptKind: 'select_2', resultType: 'information', riskLevel: 'high', targetRules: TARGETS.twoAny, notes: ['包含红鲱鱼式假阳性与自身错误注册。'] }),
      reminders: ['错误', '邪恶?']
    })
  ],
  outsiders: [
    role({
      id: 'anarchist',
      name: '无政府主义者',
      nameEn: 'Anarchist',
      team: 'outsider',
      ability: '每个夜晚，选择两名存活玩家：今晚任何玩家使用自身能力选择他们之一作为目标时，可能会改为选中另一名玩家。',
      nightOrder: { first: 90, other: 140 },
      logic: logicProfile({ triggerMode: 'first-and-other-night', promptKind: 'select_2', resultType: 'status', riskLevel: 'high', targetRules: TARGETS.twoAliveOther, notes: ['重定向目标会影响多名角色行动，必须说书人确认。'] }),
      reminders: ['互换目标']
    }),
    role({
      id: 'nihilist',
      name: '虚无主义者',
      nameEn: 'Nihilist',
      team: 'outsider',
      ability: '每个夜晚*，选择两名存活玩家：如果今晚他们之中有人死亡，你可能会代替死亡。',
      nightOrder: { first: 0, other: 150 },
      logic: logicProfile({ triggerMode: 'other-night', promptKind: 'select_2', resultType: 'kill', riskLevel: 'high', targetRules: TARGETS.twoAliveOther, notes: ['替死为候选，不直接改状态。'] }),
      reminders: ['替死']
    }),
    role({
      id: 'rambler',
      name: '漫步者',
      nameEn: 'Rambler',
      team: 'outsider',
      ability: '每个白天，会有一名与你之前不同的玩家“疯狂”地证明自己是漫步者，否则他可能被处决。如果你“疯狂”地证明自己是漫步者，你可能会被处决。你不可能是恶魔。',
      nightOrder: { first: 0, other: 0 },
      logic: null,
      reminders: ['疯狂']
    }),
    role({
      id: 'joker',
      name: '丑角',
      nameEn: 'Joker',
      team: 'outsider',
      ability: '如果你是恶魔，在夜晚时你造成的死亡会由说书人决定。',
      nightOrder: { first: 0, other: 0 },
      logic: null,
      reminders: ['说书人决定死亡']
    })
  ],
  minions: [
    role({
      id: 'gaslighter',
      name: '煤气灯人',
      nameEn: 'Gaslighter',
      team: 'minion',
      ability: '会有一名镇民自以为是煤气灯人，且无法使用他自己的能力，即使你已死亡。如果你被处决，他重获他的能力。其他爪牙不会得知你，你不会得知其他爪牙。',
      nightOrder: { first: 0, other: 0 },
      logic: null,
      reminders: ['假煤气灯人']
    }),
    role({
      id: 'shoulder-angel',
      name: '断罪天使',
      nameEn: 'Shoulder Angel',
      team: 'minion',
      ability: '每个夜晚*，选择一名玩家：他在当晚会被当作邪恶阵营和恶魔角色。',
      nightOrder: { first: 0, other: 160 },
      logic: logicProfile({ triggerMode: 'other-night', promptKind: 'select_1', resultType: 'status', riskLevel: 'high', targetRules: TARGETS.oneAliveAny, notes: ['临时错误注册为邪恶/恶魔。'] }),
      reminders: ['邪恶恶魔注册']
    }),
    role({
      id: 'schemer',
      name: '幕后黑手',
      nameEn: 'Schemer',
      team: 'minion',
      ability: '每个夜晚，你可以选择变成恶魔。如果你变成恶魔，当前的恶魔玩家会变成他自以为的善良角色。你会得知恶魔每晚选择的玩家。',
      nightOrder: { first: 100, other: 170 },
      logic: logicProfile({ triggerMode: 'first-and-other-night', promptKind: 'auto_info', resultType: 'role-change', riskLevel: 'high', notes: ['是否变成恶魔、原恶魔变成什么善良角色均需说书人确认。'] }),
      reminders: ['可变恶魔']
    }),
    role({
      id: 'shoulder-devil',
      name: '代行邪魔',
      nameEn: 'Shoulder Devil',
      team: 'minion',
      ability: '每个夜晚*，选择一名玩家：他今晚选择的玩家之一会死亡。始终会有一名善良玩家知道你在场。恶魔无法制造死亡。',
      nightOrder: { first: 0, other: 180 },
      logic: logicProfile({ triggerMode: 'other-night', promptKind: 'select_1', resultType: 'kill', riskLevel: 'high', targetRules: TARGETS.oneAliveAny, notes: ['死亡目标来自被选玩家当晚选择的对象之一；恶魔不能造成死亡。'] }),
      reminders: ['代杀']
    })
  ],
  demons: [
    role({
      id: 'psycho',
      name: '精神分裂',
      nameEn: 'Psycho',
      team: 'demon',
      ability: '[只能是镇民] 被你杀死的爪牙保留能力，且会得知你是谁。',
      nightOrder: { first: 0, other: 190 },
      logic: logicProfile({ triggerMode: 'other-night', promptKind: 'select_1', resultType: 'kill', riskLevel: 'high', targetRules: TARGETS.oneAliveOther, notes: ['标注“只能是镇民”；被杀爪牙保留能力并得知恶魔。'] }),
      reminders: ['爪牙保留能力']
    }),
    role({
      id: 'maniac',
      name: '躁狂症',
      nameEn: 'Maniac',
      team: 'demon',
      ability: '[只能是镇民] 当你首次因自身能力选择镇民时：他中毒，改为一名与他邻近的玩家会死亡。',
      nightOrder: { first: 0, other: 200 },
      logic: logicProfile({ triggerMode: 'other-night', promptKind: 'select_1', resultType: 'kill', riskLevel: 'high', targetRules: TARGETS.oneAliveOther, notes: ['首次选择镇民时改为邻近玩家死亡且目标中毒。'] }),
      reminders: ['首次镇民', '中毒', '邻近死亡']
    }),
    role({
      id: 'sociopath',
      name: '反社会人格',
      nameEn: 'Sociopath',
      team: 'demon',
      ability: '[只能是外来者] 当你首次因自身能力选择外来者时，改为一名与他邻近的玩家死亡。',
      nightOrder: { first: 0, other: 210 },
      logic: logicProfile({ triggerMode: 'other-night', promptKind: 'select_1', resultType: 'kill', riskLevel: 'high', targetRules: TARGETS.oneAliveOther, notes: ['首次选择外来者时改为邻近玩家死亡。'] }),
      reminders: ['首次外来者', '邻近死亡']
    }),
    role({
      id: 'doppelganger',
      name: '二重身',
      nameEn: 'Doppelgänger',
      team: 'demon',
      ability: '[镇民或外来者] 会有两名玩家是二重身且拥有相同角色能力。你们不能杀死彼此。每个夜晚，你们中有且仅有一人能够造成死亡。[-1爪牙]',
      nightOrder: { first: 110, other: 220 },
      logic: logicProfile({ triggerMode: 'first-and-other-night', promptKind: 'select_1', resultType: 'kill', riskLevel: 'high', targetRules: TARGETS.oneAliveOther, notes: ['成对二重身、共享能力与每夜唯一死亡源均需说书人管理。'] }),
      reminders: ['二重身同伴', '-1爪牙']
    })
  ],
  travellers: [
    role({
      id: 'blood-thirst',
      name: '嗜血诅咒',
      nameEn: 'Blood Thirst',
      team: 'fabled',
      ability: '每个夜晚，恶魔使用自身能力选择的玩家之一会死亡。该存活玩家应在所有恶魔选择过目标后，再于对应行动顺序决定谁会死亡。',
      nightOrder: { first: 0, other: 0 },
      logic: null,
      reminders: ['传奇角色']
    })
  ]
};

const nightOrder = {
  first: Object.values(characters).flat().filter((item) => Number(item.nightOrder?.first || 0) > 0).sort((left, right) => left.nightOrder.first - right.nightOrder.first).map((item) => item.id),
  other: Object.values(characters).flat().filter((item) => Number(item.nightOrder?.other || 0) > 0).sort((left, right) => left.nightOrder.other - right.nightOrder.other).map((item) => item.id)
};

const ruleLogic = {
  schemaVersion: 'botc.imported-script-rule-logic.v1',
  source: 'trust-issues-plus-image-import-2026-07-09',
  roles: Object.fromEntries(
    Object.values(characters).flat()
      .filter((item) => item.logicProfile)
      .map((item) => [item.id, item.logicProfile])
  )
};

module.exports = Object.freeze({
  id: SCRIPT_ID,
  name: '信念解离+',
  nameEn: 'Trust Issues+',
  difficulty: 4,
  description: '本地图片导入的二创剧本《信念解离+》；支持配板、发身份和夜晚导入角色候选，复杂裁定均需说书人确认。',
  source: {
    kind: 'local-image',
    imagePath: 'D:/下载/微信图片_20260709002315.jpg',
    sourceAccessedAt: '2026-07-09',
    author: 'Cake Found & David L',
    designer: '钟楼剧本博物馆 美术设计',
    licenseNote: '用户提供的本地剧本图片；仅作为本地 review-ready 角色库导入，不声明公开授权。',
    status: 'review-ready',
    transcriptionReview: {
      status: 'verified',
      reviewedAt: '2026-07-09',
      reviewer: 'codex-manual-image-check',
      scope: 'role names and visible ability text in the provided source image',
      note: 'Manually compared against D:/??/????_20260709002315.jpg; names and visible ability text match the imported role library. Logic classification still remains storyteller-confirmed candidate logic.'
    }
  },
  characters,
  nightOrder,
  ruleLogic,
  roleLogicClasses: ROLE_LOGIC_CLASSES,
  roleLogicClassification: ROLE_LOGIC_CLASSIFICATION,
  balanceRules: {},
  runtimeSupport: {
    setupCandidate: true,
    dealRoles: true,
    playerView: true,
    ruleAutomation: 'logic-profile-candidate-confirmation'
  }
});
