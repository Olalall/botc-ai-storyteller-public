const { getRule, normalizeRoleId } = require('./RuleAutomation');

const HIGH_RISK_ROLE_IDS = Object.freeze([
  'amnesiac',
  'apprentice',
  'cannibal',
  'drunk',
  'eviltwin',
  'klutz',
  'lunatic',
  'philosopher',
  'pithag',
  'recluse',
  'saint',
  'snakecharmer',
  'spy',
  'vortox',
  'widow'
]);

const CONTRACTS = Object.freeze({
  amnesiac: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'day-private-guess-contract',
    triggers: ['day-private-guess', 'storyteller-feedback'],
    aiTestActions: ['submit-private-ability-guess'],
    candidateTypes: ['amnesiac-guess-feedback'],
    storytellerConfirmationPoints: ['hidden ability definition', 'guess warmth feedback', 'final ruling'],
    playerVisibleBoundary: 'Player sees only their own guess feedback, never the hidden ability contract unless storyteller sends it.',
    stateEffects: ['record amnesiacAbilityGuess', 'record storytellerFeedback'],
    scoringSignals: ['private guess recorded', 'feedback delivered', 'no hidden ability leak']
  },
  apprentice: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'setup-gained-ability-contract',
    triggers: ['setup'],
    aiTestActions: ['request-gained-ability-summary'],
    candidateTypes: ['apprentice-gained-ability'],
    storytellerConfirmationPoints: ['gained Townsfolk or Minion ability'],
    playerVisibleBoundary: 'Player receives only the chosen gained ability after storyteller confirmation.',
    stateEffects: ['set gainedAbilityRoleId'],
    scoringSignals: ['gained ability recorded', 'private ability message delivered']
  },
  cannibal: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'execution-trigger-contract',
    triggers: ['execution-confirmed'],
    aiTestActions: ['copy-executed-role-after-execution'],
    candidateTypes: ['cannibal-executee-ability', 'cannibal-poison-if-evil-executed'],
    storytellerConfirmationPoints: ['executed role copied', 'poison status when evil was executed'],
    playerVisibleBoundary: 'No automatic public reveal; copied ability is represented in storyteller/audit state.',
    stateEffects: ['set cannibalAbilityRoleId', 'set cannibalPoisonedIfEvilExecuted'],
    scoringSignals: ['execution trigger observed', 'copied ability recorded', 'evil-executed poison handled']
  },
  drunk: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'setup-hidden-role-contract',
    triggers: ['setup', 'player-view-projection'],
    aiTestActions: ['verify-shown-role-only'],
    candidateTypes: ['drunk-shown-role-projection'],
    storytellerConfirmationPoints: ['shown Townsfolk role'],
    playerVisibleBoundary: 'Player view must expose shownRoleId only; true Drunk role, drunk markers, and true alignment are forbidden.',
    stateEffects: ['set trueRoleId=drunk', 'set shownRoleId to not-in-play Townsfolk'],
    scoringSignals: ['shown role valid', 'no drunk marker leak']
  },
  eviltwin: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'paired-private-info-and-game-end-contract',
    triggers: ['firstNight', 'execution-confirmed'],
    aiTestActions: ['send-pair-info', 'evaluate-twin-execution-gate'],
    candidateTypes: ['evil-twin-pair-and-win-condition'],
    storytellerConfirmationPoints: ['good twin seat', 'evil twin pair messages', 'good twin execution evil win gate'],
    playerVisibleBoundary: 'Each twin learns only the paired seat/role text approved by storyteller.',
    stateEffects: ['set evilTwinPairSeat', 'prepare evilTwinExecutionWinCandidate'],
    scoringSignals: ['pair info delivered', 'execution win gate evaluated']
  },
  klutz: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'death-trigger-game-end-contract',
    triggers: ['death-confirmed'],
    aiTestActions: ['choose-trusted-player-after-death'],
    candidateTypes: ['klutz-death-choice-game-end'],
    storytellerConfirmationPoints: ['death trigger exists', 'chosen player', 'good/evil game-end consequence'],
    playerVisibleBoundary: 'Choice prompt appears only after Klutz death; no hidden alignments are exposed.',
    stateEffects: ['record klutzChoiceSeat', 'prepare gameEndCandidate'],
    scoringSignals: ['death trigger observed', 'choice recorded', 'game-end candidate reviewed']
  },
  lunatic: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'false-demon-decoy-contract',
    triggers: ['firstNight', 'otherNight'],
    aiTestActions: ['receive-fake-demon-info', 'submit-decoy-demon-kill'],
    candidateTypes: ['lunatic-demon-decoy'],
    storytellerConfirmationPoints: ['fake Demon role', 'fake minions/bluffs', 'real Demon notification', 'decoy kill routing'],
    playerVisibleBoundary: 'Lunatic receives Demon-like fiction; real Demon can receive Lunatic choice; no real demon identity leaks to Lunatic.',
    stateEffects: ['set lunaticDecoyRoleId', 'record lunaticDecoyTargetSeat'],
    scoringSignals: ['decoy information generated', 'decoy action did not kill', 'real Demon notification prepared']
  },
  philosopher: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'gained-ability-contract',
    triggers: ['firstNight', 'otherNight'],
    aiTestActions: ['choose-good-character-ability'],
    candidateTypes: ['philosopher-gain-ability'],
    storytellerConfirmationPoints: ['chosen good character', 'original holder drunking if in play', 'ability duration'],
    playerVisibleBoundary: 'Player sees only confirmed gained ability result.',
    stateEffects: ['set gainedAbilityRoleId', 'set philosopherDrunkedSeat when original role holder exists'],
    scoringSignals: ['gained ability recorded', 'original-holder side effect represented']
  },
  pithag: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'role-change-contract',
    triggers: ['otherNight'],
    aiTestActions: ['choose-target-and-character'],
    candidateTypes: ['pithag-character-change'],
    storytellerConfirmationPoints: ['target seat', 'new character legality', 'downstream death/count/game-end consequences'],
    playerVisibleBoundary: 'Role change is not revealed to unrelated players by automation.',
    stateEffects: ['set target trueRoleId after confirmation', 'record scriptLegalityReview'],
    scoringSignals: ['target+role submitted', 'legality review marked', 'state patch confirmation recorded']
  },
  recluse: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'false-registration-contract',
    triggers: ['registration-check'],
    aiTestActions: ['route-registration-to-storyteller'],
    candidateTypes: ['recluse-registration-ruling'],
    storytellerConfirmationPoints: ['which registration applies for this check'],
    playerVisibleBoundary: 'No automatic hidden registration reason is visible to players.',
    stateEffects: ['record registrationRuling only in candidate/audit'],
    scoringSignals: ['registration-sensitive check downgraded to storyteller ruling']
  },
  saint: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'execution-game-end-contract',
    triggers: ['execution-confirmed'],
    aiTestActions: ['prepare-evil-win-if-executed'],
    candidateTypes: ['saint-executed-evil-win'],
    storytellerConfirmationPoints: ['execution was confirmed', 'evil win game end'],
    playerVisibleBoundary: 'Public game end can show reason only after storyteller confirmation.',
    stateEffects: ['prepare gameEndCandidate evil win'],
    scoringSignals: ['execution trigger observed', 'game-end candidate confirmed']
  },
  snakecharmer: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'role-swap-contract',
    triggers: ['firstNight', 'otherNight'],
    aiTestActions: ['choose-target', 'prepare-swap-if-demon'],
    candidateTypes: ['snakecharmer-swap'],
    storytellerConfirmationPoints: ['target demon check', 'role swap', 'alignment swap', 'poisoned old Snake Charmer'],
    playerVisibleBoundary: 'Only direct private messages from confirmed candidate may inform involved players.',
    stateEffects: ['swap trueRoleId', 'swap trueAlignment', 'mark old demon poisoned'],
    scoringSignals: ['demon target evaluated', 'swap patch prepared or no-swap recorded']
  },
  spy: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'private-grimoire-contract',
    triggers: ['firstNight', 'otherNight', 'registration-check'],
    aiTestActions: ['receive-private-grimoire-projection'],
    candidateTypes: ['spy-private-grimoire', 'spy-registration-ruling'],
    storytellerConfirmationPoints: ['private grimoire view authorization', 'false registration per check'],
    playerVisibleBoundary: 'Spy can inspect private grimoire projection; other players never receive it.',
    stateEffects: ['record short-lived private grimoire authorization'],
    scoringSignals: ['private grimoire delivered only to Spy', 'no public hidden-state leak']
  },
  vortox: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'false-info-and-demon-kill-contract',
    triggers: ['otherNight', 'townsfolk-info', 'execution-check'],
    aiTestActions: ['choose-kill-target', 'force-info-through-false-info-review'],
    candidateTypes: ['vortox-kill-and-false-info'],
    storytellerConfirmationPoints: ['kill target', 'false Townsfolk information', 'execution pressure game-end'],
    playerVisibleBoundary: 'Townsfolk info is not auto-trusted while Vortox is alive; final text stays storyteller-confirmed.',
    stateEffects: ['set target alive=false after confirmation', 'mark falseInfoContext=vortox'],
    scoringSignals: ['kill candidate resolved', 'false info context present']
  },
  widow: {
    officialLogicStatus: 'explicit-contract',
    automationTier: 'private-grimoire-and-poison-contract',
    triggers: ['firstNight'],
    aiTestActions: ['receive-private-grimoire-projection', 'choose-poison-target'],
    candidateTypes: ['widow-poison-and-warning'],
    storytellerConfirmationPoints: ['private grimoire view', 'poison target', 'widow warning recipient'],
    playerVisibleBoundary: 'Widow sees grimoire privately; warning and poison effects are storyteller-confirmed.',
    stateEffects: ['set target poisoned', 'record widowWarningRequired'],
    scoringSignals: ['private grimoire delivered only to Widow', 'poison target recorded', 'warning requirement represented']
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getRoleRuleContract(inputRoleId) {
  const roleId = normalizeRoleId(inputRoleId);
  const base = CONTRACTS[roleId] || null;
  if (base) {
    return {
      roleId,
      highRisk: HIGH_RISK_ROLE_IDS.includes(roleId),
      directAiStateMutationAllowed: false,
      storytellerConfirmationRequired: true,
      ...clone(base)
    };
  }

  const rule = getRule(roleId);
  if (!rule) return null;
  return {
    roleId,
    highRisk: false,
    officialLogicStatus: 'standard-rule-directory',
    automationTier: rule.firstNight || rule.otherNight ? 'prompt-and-candidate-contract' : 'passive-or-trigger-contract',
    triggers: asArray(rule.phases),
    aiTestActions: rule.firstNight || rule.otherNight ? ['submit-legal-prompt-payload'] : [],
    candidateTypes: unique([rule.resolution]),
    storytellerConfirmationPoints: ['candidate review when state or private information is player-visible'],
    playerVisibleBoundary: 'Player-visible output is produced only from redacted player views, private messages, or confirmed candidates.',
    directAiStateMutationAllowed: false,
    storytellerConfirmationRequired: true,
    stateEffects: rule.automation && String(rule.automation).includes('state') ? ['candidate state patches after confirmation'] : [],
    scoringSignals: ['legal prompt submission', 'candidate confirmation', 'no privacy leak']
  };
}

function buildRoleRuleContracts(roleIds = Object.keys(CONTRACTS)) {
  return roleIds
    .map((roleId) => getRoleRuleContract(roleId))
    .filter(Boolean)
    .sort((left, right) => left.roleId.localeCompare(right.roleId));
}

function summarizeRoleRuleContract(inputRoleId) {
  const contract = getRoleRuleContract(inputRoleId);
  if (!contract) return null;
  return {
    roleId: contract.roleId,
    highRisk: contract.highRisk === true,
    officialLogicStatus: contract.officialLogicStatus,
    automationTier: contract.automationTier,
    candidateTypes: asArray(contract.candidateTypes),
    triggers: asArray(contract.triggers),
    storytellerConfirmationRequired: contract.storytellerConfirmationRequired === true,
    directAiStateMutationAllowed: contract.directAiStateMutationAllowed === true,
    playerVisibleBoundary: contract.playerVisibleBoundary
  };
}

function buildCandidateRuleContract(inputRoleId, candidateKind) {
  const summary = summarizeRoleRuleContract(inputRoleId);
  if (!summary) return null;
  return {
    ...summary,
    candidateKind: candidateKind || null,
    generatedAs: 'rules-candidate',
    aiTestExecution: summary.highRisk ? 'covered-by-explicit-high-risk-contract' : 'covered-by-standard-rule-contract'
  };
}

function buildRuleContractCoverage(roleIds) {
  const normalizedRoleIds = unique(asArray(roleIds).map(normalizeRoleId));
  const contracts = normalizedRoleIds.map((roleId) => getRoleRuleContract(roleId));
  const missingRoleIds = normalizedRoleIds.filter((_roleId, index) => !contracts[index]);
  const highRiskRoleIds = normalizedRoleIds.filter((roleId) => HIGH_RISK_ROLE_IDS.includes(roleId));
  const highRiskWithContracts = highRiskRoleIds.filter((roleId) => Boolean(getRoleRuleContract(roleId)));
  return {
    totalRoles: normalizedRoleIds.length,
    contractCount: contracts.filter(Boolean).length,
    missingRoleIds,
    highRiskRoleIds,
    highRiskWithContracts,
    highRiskMissingContractRoleIds: highRiskRoleIds.filter((roleId) => !highRiskWithContracts.includes(roleId)),
    directAiStateMutationAllowedRoleIds: contracts
      .filter((contract) => contract?.directAiStateMutationAllowed === true)
      .map((contract) => contract.roleId)
  };
}

module.exports = {
  HIGH_RISK_ROLE_IDS,
  buildCandidateRuleContract,
  buildRoleRuleContracts,
  buildRuleContractCoverage,
  getRoleRuleContract,
  summarizeRoleRuleContract
};
