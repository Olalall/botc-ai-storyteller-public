const {
  RULES,
  normalizeRoleId
} = require('./RuleAutomation');
const {
  summarizeRoleRuleContract
} = require('./RoleRuleEngine');

const CONCRETE_PRIVATE_INFO_ROLE_IDS = new Set([
  'chef',
  'clockmaker',
  'empath',
  'flowergirl',
  'investigator',
  'librarian',
  'mathematician',
  'oracle',
  'towncrier',
  'undertaker',
  'washerwoman'
]);

const PRIVATE_GRIMOIRE_ROLE_IDS = new Set(['spy', 'widow']);

const EXPLICIT_RISK = Object.freeze({
  amnesiac: {
    level: 'high',
    categories: ['custom-hidden-ability', 'day-private-guess'],
    mechanism: 'AI can suggest ability templates and score guesses; storyteller must define the hidden ability and final feedback.',
    adjustment: 'Add hidden ability contract, player guess capture, and storyteller feedback states.'
  },
  lunatic: {
    level: 'high',
    categories: ['false-identity', 'demon-decoy', 'private-info-routing'],
    mechanism: 'AI may choose as the fake Demon; the choice must not kill and must be routed to the real Demon/storyteller.',
    adjustment: 'Use trueRoleId=lunatic with shownRoleId=demon, fake minions/bluffs, and decoy night submissions.'
  },
  drunk: {
    level: 'high',
    categories: ['hidden-identity', 'false-role-view'],
    mechanism: 'Player view must only expose shownRoleId; true Drunk state stays storyteller-only.',
    adjustment: 'Keep shown-role projection and forbid true role or drunk markers in player payloads.'
  },
  eviltwin: {
    level: 'high',
    categories: ['paired-private-info', 'alternate-win-condition', 'execution-trigger'],
    mechanism: 'AI can prepare a twin pair candidate; storyteller must confirm pair and game-end effects.',
    adjustment: 'Add twin pair private messages and execution win-condition gate.'
  },
  recluse: {
    level: 'high',
    categories: ['false-registration', 'storyteller-registration-choice'],
    mechanism: 'Never deterministically register the Recluse as good/evil/minion/demon without storyteller review.',
    adjustment: 'Route registration-sensitive checks through storyteller-confirmed candidates.'
  },
  spy: {
    level: 'high',
    categories: ['private-grimoire', 'false-registration'],
    mechanism: 'Player may receive private Grimoire; registration remains storyteller-confirmed.',
    adjustment: 'Keep private Grimoire projection and avoid deterministic public registration.'
  },
  widow: {
    level: 'high',
    categories: ['private-grimoire', 'poison-state', 'widow-warning'],
    mechanism: 'Player receives private Grimoire and chooses poison target; warning/poison finalization remains storyteller-confirmed.',
    adjustment: 'Keep private Grimoire projection and candidate-based poison confirmation.'
  },
  vortox: {
    level: 'high',
    categories: ['false-information-global', 'demon-kill', 'execution-pressure'],
    mechanism: 'AI may choose a target; all Townsfolk information must be forced false under storyteller review.',
    adjustment: 'Add global false-info context before treating deterministic info as sendable.'
  },
  pithag: {
    level: 'high',
    categories: ['role-change', 'script-legality', 'game-state-rewrite'],
    mechanism: 'AI may choose target and role; storyteller must approve legality and downstream state changes.',
    adjustment: 'Keep role-change as confirmation-only patches.'
  },
  snakecharmer: {
    level: 'high',
    categories: ['role-swap', 'alignment-swap', 'poison-transfer'],
    mechanism: 'AI may choose target; swap candidate must be reviewed before state mutation.',
    adjustment: 'Keep swap as storyteller-confirmed patches.'
  },
  philosopher: {
    level: 'high',
    categories: ['gained-ability', 'drunk-original-role'],
    mechanism: 'AI may choose a good character; storyteller must confirm ability gain and drunk side effect.',
    adjustment: 'Track gained ability and affected original role through confirmation.'
  },
  cannibal: {
    level: 'high',
    categories: ['gained-ability', 'execution-trigger', 'poison-if-evil'],
    mechanism: 'Triggered by execution; copied ability and evil poisoning must be storyteller-confirmed.',
    adjustment: 'Add execution-triggered ability contract.'
  },
  klutz: {
    level: 'high',
    categories: ['death-trigger', 'player-choice', 'game-end'],
    mechanism: 'Triggered only after death; the chosen player and game-end consequence must be storyteller-confirmed.',
    adjustment: 'Add death-trigger choice capture and game-end candidate gate.'
  },
  apprentice: {
    level: 'high',
    categories: ['gained-ability', 'traveller-setup-choice'],
    mechanism: 'AI can suggest a gained Townsfolk/Minion ability; storyteller must choose final ability.',
    adjustment: 'Add gained ability selector and private message.'
  },
  balloonist: {
    level: 'medium',
    categories: ['progressive-type-info', 'history-dependent-info'],
    mechanism: 'AI can choose an unrevealed character type candidate; storyteller must confirm sequence memory.',
    adjustment: 'Track previously shown character types per Balloonist.'
  },
  grandmother: {
    level: 'medium',
    categories: ['learn-player-role', 'death-link-trigger'],
    mechanism: 'AI can propose a good grandchild; storyteller confirms and death link becomes trigger state.',
    adjustment: 'Track grandchild relation and trigger death if grandchild dies.'
  },
  juggler: {
    level: 'medium',
    categories: ['day-public-claim', 'history-dependent-info'],
    mechanism: 'Needs recorded first-day juggles; AI cannot infer unrecorded public claims.',
    adjustment: 'Add day claim capture, then deterministic correct-count candidate.'
  },
  gossip: {
    level: 'medium',
    categories: ['day-public-statement', 'storyteller-truth-evaluation', 'night-death-risk'],
    mechanism: 'Needs recorded statement and truth ruling; AI may draft but storyteller decides truth/death.',
    adjustment: 'Add public statement capture and truth/death confirmation.'
  },
  savant: {
    level: 'medium',
    categories: ['storyteller-authored-info', 'day-private-info'],
    mechanism: 'AI can draft true/false statement pairs; storyteller must approve exact statements.',
    adjustment: 'Add Savant statement composer and approval.'
  },
  artist: {
    level: 'medium',
    categories: ['freeform-question', 'storyteller-yes-no'],
    mechanism: 'AI can summarize the question; storyteller must answer.',
    adjustment: 'Add private question capture and yes/no approval.'
  },
  sage: {
    level: 'medium',
    categories: ['death-trigger-info', 'demon-kill-source'],
    mechanism: 'Only triggers if killed by Demon; AI can propose two Demon candidates after source is recorded.',
    adjustment: 'Track death source before auto prompt.'
  },
  barber: {
    level: 'medium',
    categories: ['death-trigger-state', 'demon-choice', 'role-swap'],
    mechanism: 'Only if Barber died; Demon choice and swap require storyteller confirmation.',
    adjustment: 'Create death-triggered Demon swap prompt.'
  },
  tinker: {
    level: 'medium',
    categories: ['storyteller-optional-death', 'death-trigger-state'],
    mechanism: 'Storyteller decides if Tinker dies; AI must not decide final death.',
    adjustment: 'Keep as optional death candidate.'
  },
  mutant: {
    level: 'medium',
    categories: ['madness', 'day-execution-trigger'],
    mechanism: 'AI can flag possible madness break; storyteller decides execution.',
    adjustment: 'Add madness review record.'
  },
  cerenovus: {
    level: 'medium',
    categories: ['madness', 'private-marker'],
    mechanism: 'AI may choose player/role; madness enforcement remains storyteller-confirmed.',
    adjustment: 'Track mad-as role and next-day review.'
  },
  harlot: {
    level: 'medium',
    categories: ['consent', 'learn-role', 'death-risk'],
    mechanism: 'Target agreement and death risk require storyteller confirmation.',
    adjustment: 'Add target consent and death-risk confirmation.'
  },
  goon: {
    level: 'medium',
    categories: ['target-trigger', 'alignment-change', 'drunking-attacker'],
    mechanism: 'Triggers when targeted; alignment and drunking cannot be inferred from prompt alone.',
    adjustment: 'Add target-trigger candidate.'
  },
  pacifist: {
    level: 'medium',
    categories: ['storyteller-confirmed-prevention', 'execution-prevention'],
    mechanism: 'Execution prevention is storyteller choice.',
    adjustment: 'Add execution prevention candidate gate.'
  },
  mastermind: {
    level: 'medium',
    categories: ['game-end-delay', 'execution-next-day'],
    mechanism: 'Only after Demon death; storyteller must confirm delayed evil win condition.',
    adjustment: 'Add Demon-death game-end delay state.'
  },
  mayor: {
    level: 'medium',
    categories: ['game-end-condition', 'death-bounce'],
    mechanism: 'Mayor win and attack bounce require storyteller confirmation.',
    adjustment: 'Keep game-end/death-prevention candidates confirmation-only.'
  }
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function promptKindsFor(rule) {
  return [...new Set([rule?.firstNight?.promptKind, rule?.otherNight?.promptKind].filter(Boolean))];
}

function includesPhase(rule, fragment) {
  return asArray(rule?.phases).some((phase) => String(phase).toLowerCase().includes(fragment));
}

function inferCategories(roleId, rule) {
  const categories = new Set(EXPLICIT_RISK[roleId]?.categories || []);
  const automation = String(rule?.automation || '');
  const resolution = String(rule?.resolution || '');
  const prompts = promptKindsFor(rule);

  if (CONCRETE_PRIVATE_INFO_ROLE_IDS.has(roleId)) categories.add('concrete-private-info');
  if (PRIVATE_GRIMOIRE_ROLE_IDS.has(roleId)) categories.add('private-grimoire');
  if (prompts.some((kind) => kind.startsWith('select_'))) categories.add('player-choice');
  if (prompts.includes('auto_info')) categories.add('auto-info');
  if (automation.includes('state')) categories.add('state-change');
  if (automation.includes('storyteller')) categories.add('storyteller-judgement');
  if (automation.includes('registration') || resolution.includes('registration')) categories.add('registration');
  if (includesPhase(rule, 'trigger')) categories.add('trigger');
  if (includesPhase(rule, 'death')) categories.add('death-related');
  if (includesPhase(rule, 'day')) categories.add('day-flow');
  if (includesPhase(rule, 'setup')) categories.add('setup');
  if (resolution.includes('game-end') || includesPhase(rule, 'gameend')) categories.add('game-end');
  if (resolution.includes('drunk')) categories.add('drunk-state');
  if (resolution.includes('poison')) categories.add('poison-state');
  if (resolution.includes('madness')) categories.add('madness');
  if (resolution.includes('swap') || resolution.includes('change') || resolution.includes('gain')) categories.add('role-state-change');

  return [...categories].sort();
}

function inferRiskLevel(roleId, rule, categories) {
  if (EXPLICIT_RISK[roleId]?.level) return EXPLICIT_RISK[roleId].level;
  const high = [
    'false-identity',
    'hidden-identity',
    'custom-hidden-ability',
    'false-information-global',
    'role-state-change',
    'game-end'
  ];
  if (categories.some((category) => high.includes(category))) return 'high';
  const medium = [
    'state-change',
    'trigger',
    'death-related',
    'storyteller-judgement',
    'registration',
    'day-flow',
    'drunk-state',
    'poison-state',
    'madness'
  ];
  if (categories.some((category) => medium.includes(category))) return 'medium';
  if (promptKindsFor(rule).length > 0) return 'low';
  return 'passive';
}

function inferExecutionMode(roleId, rule, categories, riskLevel) {
  if (!rule) return 'unsupported';
  const prompts = promptKindsFor(rule);
  const hasPrompt = prompts.length > 0;
  if (PRIVATE_GRIMOIRE_ROLE_IDS.has(roleId)) return 'private-grimoire-candidate';
  if (CONCRETE_PRIVATE_INFO_ROLE_IDS.has(roleId)) return 'deterministic-private-info-candidate';
  if (hasPrompt && categories.includes('role-state-change')) return 'role-state-change-candidate';
  if (hasPrompt && categories.includes('state-change')) return 'state-change-candidate';
  if (hasPrompt && categories.includes('storyteller-judgement')) return 'storyteller-info-candidate';
  if (hasPrompt) return 'prompt-choice-candidate';
  if (categories.includes('setup')) return 'setup-passive-contract';
  if (categories.includes('game-end')) return 'game-end-trigger-contract';
  if (categories.includes('death-related')) return 'death-trigger-contract';
  if (categories.includes('day-flow')) return 'day-event-contract';
  if (categories.includes('registration')) return 'registration-ruling-contract';
  if (riskLevel === 'passive') return 'passive-contract';
  return 'event-trigger-contract';
}

function inferTriggerEvents(rule, categories) {
  const events = new Set();
  for (const phase of asArray(rule?.phases)) {
    const normalized = String(phase || '').toLowerCase();
    if (normalized.includes('firstnight')) events.add('first-night');
    else if (normalized.includes('othernight')) events.add('other-night');
    else if (normalized.includes('death')) events.add('death-confirmed');
    else if (normalized.includes('execution')) events.add('execution-confirmed');
    else if (normalized.includes('nomination')) events.add('nomination-confirmed');
    else if (normalized.includes('vote')) events.add('vote-open-or-vote-counted');
    else if (normalized.includes('gameend')) events.add('game-end-check');
    else if (normalized.includes('setup')) events.add('setup-confirmed');
    else if (normalized.includes('day')) events.add('day-event-recorded');
    else if (normalized.includes('registration')) events.add('registration-check');
    else events.add(normalized || 'storyteller-event');
  }
  if (categories.includes('private-grimoire')) events.add('private-grimoire-authorized');
  if (categories.includes('madness')) events.add('madness-review');
  if (categories.includes('storyteller-judgement')) events.add('storyteller-ruling');
  return [...events].sort();
}

function buildExecutionModel({ roleId, rule, categories, riskLevel, concretePrivateInfo, privateGrimoire, hasPrompt, hasStateRisk }) {
  const executionMode = inferExecutionMode(roleId, rule, categories, riskLevel);
  const triggerEvents = inferTriggerEvents(rule, categories);
  const needsSyntheticEvent = !hasPrompt && triggerEvents.some((event) => {
    return !['setup-confirmed', 'first-night', 'other-night'].includes(event);
  });
  const playerInputMode = hasPrompt
    ? 'ai-test-player-submits-legal-payload'
    : needsSyntheticEvent
      ? 'synthetic-trigger-event'
      : 'no-player-input';
  const storytellerMode = concretePrivateInfo && !hasStateRisk
    ? 'review-private-info-before-send'
    : privateGrimoire
      ? 'authorize-private-grimoire-and-confirm-effects'
      : hasStateRisk || riskLevel !== 'low'
        ? 'confirm-candidate-before-effect'
        : 'review-candidate-before-message';

  return {
    executionMode,
    triggerEvents,
    testMode: {
      status: 'covered',
      playerInputMode,
      aiStorytellerMode: storytellerMode,
      needsSyntheticEvent,
      directStateMutation: false,
      completionDefinition: hasPrompt
        ? 'prompt submitted, candidate generated, storyteller test harness confirms candidate'
        : 'trigger/passive event recorded, candidate or contract assertion evaluated by test harness'
    },
    liveMode: {
      authority: 'storyteller-confirmed',
      directAiStateMutation: false,
      playerVisibleOutput: concretePrivateInfo || privateGrimoire ? 'private-redacted-projection' : 'confirmed-candidate-only',
      blocksUnconfirmedStateChange: true
    }
  };
}

function defaultMechanism(roleId, rule, categories) {
  if (CONCRETE_PRIVATE_INFO_ROLE_IDS.has(roleId)) {
    return 'Rules compute a private info draft; player delivery or final visible result stays behind storyteller confirmation/review.';
  }
  if (PRIVATE_GRIMOIRE_ROLE_IDS.has(roleId)) {
    return 'Private Grimoire projection is allowed only for this role; state effects still use candidate confirmation.';
  }
  if (categories.includes('player-choice')) {
    return 'AI test players may submit legal choices; generated candidates require storyteller confirmation before state or messages change.';
  }
  if (categories.includes('auto-info')) {
    return 'AI test may submit auto_info only as a placeholder; final information requires a concrete rule projection or storyteller ruling.';
  }
  if (categories.includes('trigger') || categories.includes('day-flow')) {
    return 'No automatic prompt is safe until the triggering public/day event is recorded.';
  }
  return 'Passive/setup rule; handled by setup, public flow, or storyteller-confirmed triggers.';
}

function defaultAdjustment(roleId, categories) {
  if (categories.includes('auto-info')) return 'Replace placeholder with concrete private info projection or mark as storyteller-confirmed info.';
  if (categories.includes('player-choice')) return 'Keep AI auto-submit to tests only; keep final effects as candidate-confirmation-only.';
  if (categories.includes('trigger')) return 'Add trigger event capture and generate candidate only after trigger exists.';
  if (categories.includes('day-flow')) return 'Add day-flow input/record surface before AI can assist.';
  return 'Keep as documented passive/manual boundary unless promoted by a focused implementation slice.';
}

function getRoleAutomationPolicy(inputRoleId) {
  const roleId = normalizeRoleId(inputRoleId);
  const rule = RULES[roleId] || null;
  const roleRuleContract = summarizeRoleRuleContract(roleId);
  const categories = inferCategories(roleId, rule);
  const riskLevel = inferRiskLevel(roleId, rule, categories);
  const explicit = EXPLICIT_RISK[roleId] || {};
  const prompts = promptKindsFor(rule);
  const hasPrompt = prompts.length > 0;
  const hasStateRisk = categories.some((category) => [
    'state-change',
    'role-state-change',
    'game-end',
    'death-related',
    'drunk-state',
    'poison-state'
  ].includes(category));
  const concretePrivateInfo = CONCRETE_PRIVATE_INFO_ROLE_IDS.has(roleId);
  const privateGrimoire = PRIVATE_GRIMOIRE_ROLE_IDS.has(roleId);
  const executionModel = buildExecutionModel({
    roleId,
    rule,
    categories,
    riskLevel,
    concretePrivateInfo,
    privateGrimoire,
    hasPrompt,
    hasStateRisk
  });

  return {
    roleId,
    riskLevel,
    riskCategories: categories,
    aiAutoSubmit: hasPrompt,
    aiAutoSubmitScope: hasPrompt ? 'test-only-player-choice-or-auto-info' : 'none',
    aiMayChooseTargets: hasPrompt && prompts.some((kind) => kind.startsWith('select_')),
    aiMayGenerateDraft: riskLevel !== 'passive',
    aiMayMutateStateDirectly: false,
    autoSettle: concretePrivateInfo && !hasStateRisk,
    storytellerConfirmationRequired: !concretePrivateInfo || hasStateRisk || privateGrimoire || riskLevel !== 'low',
    currentMechanism: explicit.mechanism || defaultMechanism(roleId, rule, categories),
    requiredAdjustment: explicit.adjustment || defaultAdjustment(roleId, categories),
    implementedMechanism: roleRuleContract?.highRisk
      ? 'explicit-high-risk-rule-contract'
      : concretePrivateInfo
      ? 'concrete-private-info-projection'
      : privateGrimoire
        ? 'private-grimoire-projection'
        : hasPrompt
          ? 'prompt-submission-plus-candidate-review'
          : 'passive-or-trigger-boundary',
    executionModel,
    roleRuleContract,
    rule: rule
      ? {
          phases: rule.phases || [],
          automation: rule.automation || null,
          resolution: rule.resolution || null,
          promptKinds: prompts
        }
      : null
  };
}

function buildRoleAutomationPolicies() {
  return Object.keys(RULES)
    .sort((left, right) => left.localeCompare(right))
    .map(getRoleAutomationPolicy);
}

function buildRoleExecutionMatrix() {
  const roles = buildRoleAutomationPolicies().map((policy) => ({
    roleId: policy.roleId,
    riskLevel: policy.riskLevel,
    riskCategories: policy.riskCategories,
    implementedMechanism: policy.implementedMechanism,
    executionModel: policy.executionModel,
    storytellerConfirmationRequired: policy.storytellerConfirmationRequired,
    aiMayMutateStateDirectly: policy.aiMayMutateStateDirectly,
    officialEdgeCaseBoundary: policy.currentMechanism,
    requiredAdjustment: policy.requiredAdjustment
  }));
  const totals = roles.reduce((acc, role) => {
    acc.total += 1;
    acc.byExecutionMode[role.executionModel.executionMode] = (acc.byExecutionMode[role.executionModel.executionMode] || 0) + 1;
    acc.byRiskLevel[role.riskLevel] = (acc.byRiskLevel[role.riskLevel] || 0) + 1;
    if (role.executionModel.testMode.status === 'covered') acc.testCovered += 1;
    if (role.executionModel.testMode.needsSyntheticEvent) acc.syntheticEventRoles += 1;
    if (role.aiMayMutateStateDirectly) acc.directAiStateMutationRoles.push(role.roleId);
    return acc;
  }, {
    total: 0,
    testCovered: 0,
    syntheticEventRoles: 0,
    byExecutionMode: {},
    byRiskLevel: {},
    directAiStateMutationRoles: []
  });

  return {
    status: totals.testCovered === totals.total && totals.directAiStateMutationRoles.length === 0 ? 'GO' : 'NO-GO',
    schemaVersion: 'mvp.role-execution-matrix.v1',
    totals,
    roles
  };
}

module.exports = {
  CONCRETE_PRIVATE_INFO_ROLE_IDS,
  PRIVATE_GRIMOIRE_ROLE_IDS,
  buildRoleExecutionMatrix,
  buildRoleAutomationPolicies,
  getRoleAutomationPolicy
};
