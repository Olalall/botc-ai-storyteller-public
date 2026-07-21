'use strict';

const {
  DEMON_ROLE_IDS,
  MINION_ROLE_IDS,
  getAlignmentForPlayer,
  normalizeRoleId
} = require('./RuleAutomation');
const {
  buildAiSelectionSeed,
  chooseDiversified,
  stableHash
} = require('./AiTestTargetPolicy');

const POLICY_NAME = 'strategy-explorer-v1';

const PROTECTION_ROLE_IDS = new Set([
  'innkeeper',
  'monk',
  'pacifist',
  'sailor',
  'tea-lady'
]);

const ATTACK_ROLE_IDS = new Set([
  'assassin',
  'gambler',
  'godfather',
  'gossip',
  'lycanthrope',
  'psychopath'
]);

const CONTROL_ROLE_IDS = new Set([
  'cerenovus',
  'devils-advocate',
  'fearmonger',
  'poisoner',
  'pukka',
  'witch'
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function roleIdOf(player) {
  return normalizeRoleId(player?.trueRoleId || player?.realRoleId || player?.roleId || player?.role || player?.shownRoleId);
}

function shownRoleId(playerView, prompt) {
  return normalizeRoleId(
    playerView?.privateView?.role?.roleId
      || prompt?.roleIdAtPrompt
      || prompt?.roleId
  );
}

function normalizeAlignment(value) {
  const alignment = String(value || '').trim().toLowerCase();
  if (alignment === 'evil' || alignment === 'good') return alignment;
  if (['demon', 'demons', 'minion', 'minions'].includes(alignment)) return 'evil';
  if (['townsfolk', 'outsider', 'outsiders'].includes(alignment)) return 'good';
  return 'unknown';
}

function actorAlignment(playerView, roleId) {
  const shown = playerView?.privateView?.role || {};
  const explicit = normalizeAlignment(shown.alignment || shown.team);
  if (explicit !== 'unknown') return explicit;
  if (DEMON_ROLE_IDS.has(roleId) || MINION_ROLE_IDS.has(roleId)) return 'evil';
  return 'good';
}

function knownEvilSeats(playerView, actorSeat, alignment) {
  if (alignment !== 'evil') return new Set();
  const evilInfo = playerView?.privateView?.evilInfo || {};
  return new Set([
    Number(actorSeat),
    Number(evilInfo.demon?.seat),
    ...asArray(evilInfo.minions).map((item) => Number(item?.seat)),
    ...asArray(evilInfo.otherMinions).map((item) => Number(item?.seat))
  ].filter(Number.isInteger));
}

function abilityProfile(roleId) {
  if (DEMON_ROLE_IDS.has(roleId) || ATTACK_ROLE_IDS.has(roleId)) return 'attack';
  if (PROTECTION_ROLE_IDS.has(roleId)) return 'protect';
  if (MINION_ROLE_IDS.has(roleId) || CONTROL_ROLE_IDS.has(roleId)) return 'control';
  return 'information-or-utility';
}

function ownPriorTargetCounts(history, actorSeat) {
  const counts = new Map();
  for (const event of asArray(history)) {
    if (event?.type !== 'ai-player-night-submitted') continue;
    if (Number(event?.data?.seat) !== Number(actorSeat)) continue;
    for (const seat of asArray(event?.data?.selectedTargetSeats).map(Number).filter(Number.isInteger)) {
      counts.set(seat, (counts.get(seat) || 0) + 1);
    }
  }
  return counts;
}

function privateRoleBySeat(playerView) {
  return new Map(asArray(playerView?.privateView?.privateGrimoire?.seats).map((item) => [
    Number(item?.seat),
    normalizeRoleId(item?.role?.roleId)
  ]));
}

function buildTargetDecision({ playerView, prompt, history, count, seed }) {
  const targetRules = prompt?.targetRules || {};
  const actorSeat = Number(prompt?.seat || playerView?.privateView?.seat);
  const roleId = shownRoleId(playerView, prompt);
  const alignment = actorAlignment(playerView, roleId);
  const profile = abilityProfile(roleId);
  const allies = knownEvilSeats(playerView, actorSeat, alignment);
  const priorTargets = ownPriorTargetCounts(history, actorSeat);
  const publicSeats = new Map(asArray(playerView?.publicView?.seats).map((item) => [Number(item?.seat), item]));
  const visibleRoles = privateRoleBySeat(playerView);
  const options = asArray(prompt?.options)
    .map((option) => ({
      seat: Number(option?.seat),
      alive: option?.alive !== false,
      publicSeat: publicSeats.get(Number(option?.seat)) || null,
      visibleRoleId: visibleRoles.get(Number(option?.seat)) || null
    }))
    .filter((option) => Number.isInteger(option.seat))
    .filter((option) => targetRules.allowSelf !== false || option.seat !== actorSeat)
    .filter((option) => targetRules.mustBeDead !== true || option.alive === false)
    .filter((option) => targetRules.allowDead !== false || option.alive !== false);

  const scoreTarget = (option) => {
    let score = option.alive ? 12 : 0;
    score -= (priorTargets.get(option.seat) || 0) * 9;
    if (option.seat === actorSeat) score -= 3;

    if (alignment === 'evil') {
      score += allies.has(option.seat) ? -80 : 28;
      if (profile === 'attack' || profile === 'control') score += allies.has(option.seat) ? -20 : 12;
    } else if (profile === 'protect') {
      score += option.alive ? 18 : -20;
    } else if (profile === 'attack') {
      score += stableHash(`${seed}:public-suspicion:${option.seat}`) % 17;
    } else {
      score += priorTargets.has(option.seat) ? -6 : 14;
    }

    if (visibleRoles.has(option.seat)) {
      const visibleRoleId = visibleRoles.get(option.seat);
      const visibleEvil = DEMON_ROLE_IDS.has(visibleRoleId) || MINION_ROLE_IDS.has(visibleRoleId);
      if (profile === 'protect') score += visibleEvil ? -30 : 20;
      else if (profile === 'attack' || profile === 'control') score += visibleEvil === (alignment === 'good') ? 30 : -20;
    }
    return score;
  };

  const selected = chooseDiversified(
    options,
    count,
    `${buildAiSelectionSeed(playerView?.publicView, prompt, POLICY_NAME)}:${seed}`,
    { score: scoreTarget }
  );
  const selectedSeats = selected.map((option) => option.seat);
  const optionSeats = new Set(options.map((option) => option.seat));
  const selectedPublicSeats = selected.map((option) => option.publicSeat).filter(Boolean);
  const priorSelectionCount = selectedSeats.reduce((sum, seat) => sum + (priorTargets.get(seat) || 0), 0);

  return {
    selectedSeats,
    rationale: {
      actorAlignment: alignment,
      abilityProfile: profile,
      considersAlignmentGoal: true,
      considersSurvival: selectedPublicSeats.length > 0,
      considersOwnHistory: true,
      priorSelectionCount,
      knownAllySeats: [...allies].sort((left, right) => left - right),
      scoringVersion: POLICY_NAME
    },
    checks: [
      { name: 'target-count', pass: selectedSeats.length === count, expected: count, actual: selectedSeats.length },
      { name: 'target-unique', pass: new Set(selectedSeats).size === selectedSeats.length },
      { name: 'target-in-prompt-options', pass: selectedSeats.every((seat) => optionSeats.has(seat)) },
      { name: 'target-self-rule', pass: targetRules.allowSelf !== false || selectedSeats.every((seat) => seat !== actorSeat) },
      { name: 'target-dead-rule', pass: targetRules.mustBeDead !== true || selected.every((option) => option.alive === false) },
      { name: 'target-alive-rule', pass: targetRules.allowDead !== false || selected.every((option) => option.alive !== false) }
    ]
  };
}

function chooseRoleOption({ prompt, targetSeat, playerView, seed }) {
  const options = asArray(prompt?.roleOptions);
  if (options.length === 0) return null;
  const visibleRoleId = privateRoleBySeat(playerView).get(Number(targetSeat));
  const exactVisible = visibleRoleId
    ? options.find((option) => normalizeRoleId(option?.roleId || option?.id) === visibleRoleId)
    : null;
  const [selected] = exactVisible ? [exactVisible] : chooseDiversified(options, 1, `${seed}:role-option`);
  return selected?.roleId || selected?.id || null;
}

function payloadForPrompt({ playerView, prompt, history, defaultPayload, seed }) {
  if (prompt?.promptKind === 'auto_info') {
    return {
      payload: { kind: 'auto_info' },
      rationale: {
        abilityProfile: abilityProfile(shownRoleId(playerView, prompt)),
        considersAlignmentGoal: true,
        considersSurvival: false,
        considersOwnHistory: false,
        scoringVersion: POLICY_NAME
      },
      checks: [{ name: 'auto-info-payload', pass: true }]
    };
  }
  if (prompt?.promptKind === 'waiting') return { payload: null, rationale: { scoringVersion: POLICY_NAME }, checks: [] };

  const targetCounts = { select_1: 1, select_2: 2, select_3: 3, select_4: 4, select_player_role: 1 };
  const count = targetCounts[prompt?.promptKind] || 0;
  const targetDecision = count > 0
    ? buildTargetDecision({ playerView, prompt, history, count, seed })
    : { selectedSeats: [], rationale: {}, checks: [] };

  if (prompt?.promptKind === 'select_role') {
    const roleId = chooseRoleOption({ prompt, targetSeat: null, playerView, seed });
    const allowed = new Set(asArray(prompt?.roleOptions).map((option) => String(option?.roleId || option?.id || '')));
    return {
      payload: roleId ? { kind: 'select_role', roleId } : defaultPayload,
      rationale: { ...targetDecision.rationale, selectedRoleFromVisibleInfo: false, scoringVersion: POLICY_NAME },
      checks: [{ name: 'selected-role-in-options', pass: Boolean(roleId) && allowed.has(String(roleId)) }]
    };
  }

  const targets = targetDecision.selectedSeats;
  let payload = defaultPayload;
  if (prompt?.promptKind === 'select_1' && targets.length === 1) payload = { kind: 'select_1', target: targets[0] };
  if (prompt?.promptKind === 'select_2' && targets.length === 2) payload = { kind: 'select_2', targets };
  if (prompt?.promptKind === 'select_3' && targets.length === 3) payload = { kind: 'select_3', targets };
  if (prompt?.promptKind === 'select_4' && targets.length === 4) payload = { kind: 'select_4', targets };
  if (prompt?.promptKind === 'select_player_role' && targets.length === 1) {
    const roleId = chooseRoleOption({ prompt, targetSeat: targets[0], playerView, seed });
    if (roleId) payload = { kind: 'select_player_role', target: targets[0], roleId, guessedRoleId: roleId };
  }

  return {
    payload,
    rationale: targetDecision.rationale,
    checks: targetDecision.checks
  };
}

function chooseNominee({ roomState, candidates, dayNumber, defaultSeat, seed, history }) {
  const values = asArray(candidates);
  const priorNominees = new Set(asArray(history)
    .filter((event) => event?.type === 'ai-strategy-nomination-selected')
    .map((event) => Number(event?.data?.nomineeSeat))
    .filter(Number.isInteger));
  const hasProfessor = asArray(roomState?.players).some((player) => player?.alive !== false && roleIdOf(player) === 'professor');
  if (roomState?.scriptId === 'bad-moon-rising' && dayNumber <= 1 && hasProfessor) {
    return {
      seat: defaultSeat,
      rationale: {
        strategyBranch: 'preserve-professor-recovery-path',
        considersAlignmentGoal: true,
        considersSurvival: true,
        considersRoleAbility: true,
        considersHistory: true
      },
      checks: [{ name: 'nominee-is-executable-candidate', pass: values.some((player) => Number(player.seat) === Number(defaultSeat)) }]
    };
  }

  const [selected] = chooseDiversified(values, 1, `${seed}:nominee:day-${dayNumber}`, {
    score: (player) => {
      const roleId = roleIdOf(player);
      let score = priorNominees.has(Number(player.seat)) ? -40 : 0;
      if (dayNumber <= 1) {
        if (MINION_ROLE_IDS.has(roleId)) score += 70;
        else if (DEMON_ROLE_IDS.has(roleId)) score -= 35;
        else score += 10;
      } else {
        if (DEMON_ROLE_IDS.has(roleId)) score += 100;
        else if (MINION_ROLE_IDS.has(roleId)) score += 30;
      }
      return score;
    }
  });
  const seat = selected?.seat ?? defaultSeat;
  return {
    seat,
    rationale: {
      strategyBranch: dayNumber <= 1 ? 'pressure-minion-before-demon' : 'pressure-demon',
      considersAlignmentGoal: true,
      considersSurvival: true,
      considersRoleAbility: true,
      considersHistory: true
    },
    checks: [{ name: 'nominee-is-executable-candidate', pass: values.some((player) => Number(player.seat) === Number(seat)) }]
  };
}

function chooseNominator({ roomState, candidates, nomineeSeat, defaultSeat, seed, history }) {
  const nominee = asArray(roomState?.players).find((player) => Number(player?.seat) === Number(nomineeSeat));
  const nomineeAlignment = getAlignmentForPlayer(nominee || {});
  const priorCounts = new Map();
  for (const event of asArray(history).filter((item) => item?.type === 'ai-strategy-nomination-selected')) {
    const seat = Number(event?.data?.nominatorSeat);
    if (Number.isInteger(seat)) priorCounts.set(seat, (priorCounts.get(seat) || 0) + 1);
  }
  const values = asArray(candidates);
  const [selected] = chooseDiversified(values, 1, `${seed}:nominator:${nomineeSeat}`, {
    score: (player) => {
      const alignment = getAlignmentForPlayer(player);
      let score = -(priorCounts.get(Number(player.seat)) || 0) * 15;
      if (nomineeAlignment === 'evil' && alignment === 'good') score += 25;
      if (nomineeAlignment === 'good' && alignment === 'evil') score += 25;
      return score;
    }
  });
  const seat = selected?.seat ?? defaultSeat;
  return {
    seat,
    rationale: {
      strategyBranch: 'alignment-pressure-and-nominator-rotation',
      considersAlignmentGoal: true,
      considersSurvival: true,
      considersRoleAbility: false,
      considersHistory: true
    },
    checks: [
      { name: 'nominator-is-alive-candidate', pass: values.some((player) => Number(player.seat) === Number(seat)) },
      { name: 'nominator-is-not-nominee', pass: Number(seat) !== Number(nomineeSeat) }
    ]
  };
}

function chooseVote({ playerView, voteView, nomineeSeat, dayNumber, defaultVote, seed, history }) {
  const actorSeat = Number(playerView?.privateView?.seat);
  const roleId = shownRoleId(playerView, {});
  const alignment = actorAlignment(playerView, roleId);
  const allies = knownEvilSeats(playerView, actorSeat, alignment);
  const aliveSeats = asArray(playerView?.publicView?.seats)
    .filter((seat) => seat?.occupied !== false && seat?.alive !== false)
    .map((seat) => Number(seat?.seat))
    .filter(Number.isInteger);
  const dissenterSeat = aliveSeats.length > 0
    ? aliveSeats[stableHash(`${seed}:day-${dayNumber}:nominee-${nomineeSeat}:dissenter`) % aliveSeats.length]
    : null;
  const priorVotes = asArray(history).filter((event) => event?.type === 'ai-player-day-voted').length;
  const actorAlive = asArray(playerView?.publicView?.seats)
    .find((seat) => Number(seat?.seat) === actorSeat)?.alive !== false;

  let vote = Boolean(defaultVote);
  let strategyBranch = 'fallback';
  if (alignment === 'evil') {
    vote = !allies.has(Number(nomineeSeat));
    strategyBranch = vote ? 'evil-pressure-non-ally' : 'evil-protect-known-ally';
  } else if (!actorAlive && dayNumber <= 1) {
    vote = false;
    strategyBranch = 'conserve-dead-vote-early';
  } else {
    vote = actorSeat !== dissenterSeat;
    strategyBranch = vote ? 'good-support-public-nomination' : 'good-seeded-dissent';
  }

  return {
    vote,
    rationale: {
      strategyBranch,
      actorAlignment: alignment,
      considersAlignmentGoal: true,
      considersSurvival: true,
      considersRoleAbility: true,
      considersHistory: true,
      priorVoteCount: priorVotes,
      knownAllySeats: [...allies].sort((left, right) => left - right),
      seededDissenterSeat: dissenterSeat
    },
    checks: [
      { name: 'vote-is-boolean', pass: typeof vote === 'boolean' },
      { name: 'vote-view-allows-submission', pass: voteView?.privateView?.canVote === true }
    ]
  };
}

function createStrategyExplorerPolicy({ seed = 'strategy-explorer' } = {}) {
  return {
    name: POLICY_NAME,
    authority: 'suggestion-only-through-existing-player-and-storyteller-commands',
    buildNightPayload(context) {
      return payloadForPrompt({ ...context, seed: `${seed}:${context.seed || ''}` });
    },
    chooseNominee(context) {
      return chooseNominee({ ...context, seed: `${seed}:${context.seed || ''}` });
    },
    chooseNominator(context) {
      return chooseNominator({ ...context, seed: `${seed}:${context.seed || ''}` });
    },
    chooseVote(context) {
      return chooseVote({ ...context, seed: `${seed}:${context.seed || ''}` });
    }
  };
}

module.exports = {
  POLICY_NAME,
  createStrategyExplorerPolicy
};
