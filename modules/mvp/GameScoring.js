const {
  HIGH_RISK_ROLE_IDS,
  buildRuleContractCoverage,
  getRoleRuleContract,
  summarizeRoleRuleContract
} = require('./RoleRuleEngine');
const {
  getAlignmentForPlayer,
  normalizeRoleId
} = require('./RuleAutomation');
const {
  getRoleAutomationPolicy
} = require('./RoleAutomationSafety');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function gradeFor(total) {
  if (total >= 90) return 'A';
  if (total >= 80) return 'B';
  if (total >= 70) return 'C';
  return 'D';
}

function normalizedType(value) {
  return String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function getEvents(record) {
  return asArray(record?.events);
}

function getPlayers(record) {
  return asArray(record?.finalState?.players).map((player) => ({
    ...player,
    seat: Number(player.seat)
  })).filter((player) => Number.isInteger(player.seat));
}

function getRoleId(player) {
  return normalizeRoleId(player.trueRoleId || player.realRoleId || player.roleId || player.role || player.shownRoleId);
}

function getShownRoleId(player) {
  return normalizeRoleId(player.shownRoleId || player.roleId || player.role || player.trueRoleId);
}

function getAlignment(player) {
  return player.alignment || player.trueAlignment || player.shownAlignment || getAlignmentForPlayer(player);
}

function roleRiskBonus(riskLevel) {
  if (riskLevel === 'high') return 12;
  if (riskLevel === 'medium') return 8;
  if (riskLevel === 'low') return 5;
  return 3;
}

function contributionTags({ won, alive, components, rolePolicy }) {
  const tags = [];
  if (won) tags.push('won');
  if (alive) tags.push('survived');
  if (components.abilityImpact >= 12) tags.push('ability-impact');
  if (components.voteParticipation >= 9) tags.push('active-voter');
  if (components.nominationPressure > 0) tags.push('nomination-pressure');
  if (rolePolicy?.riskLevel === 'high') tags.push('high-risk-role');
  if (rolePolicy?.executionModel?.testMode?.needsSyntheticEvent) tags.push('trigger-role');
  return tags;
}

function playerEvidenceScore(player) {
  const components = player?.scoreBreakdown || {};
  return Number(components.nightAction || 0)
    + Number(components.voteParticipation || 0)
    + Number(components.abilityImpact || 0)
    + Number(components.nominationPressure || 0)
    + Number(components.executionPressure || 0);
}

function winningAlignment(record) {
  if (record?.result?.winningTeam === 'evil') return 'evil';
  if (record?.result?.winningTeam === 'good') return 'good';
  return null;
}

function privacyHitCount(record) {
  return asArray(record?.privacy?.playerViewForbiddenFieldHits).length
    + asArray(record?.privacy?.promptForbiddenFieldHits).length
    + asArray(record?.privacy?.dayVoteForbiddenFieldHits).length;
}

function eventSeat(event) {
  const data = event?.data || {};
  const nested = data.data || data.payload || {};
  const seat = event?.actorSeat
    ?? data.actorSeat
    ?? data.seat
    ?? data.voterSeat
    ?? nested.actorSeat
    ?? nested.seat
    ?? nested.voterSeat;
  const number = Number(seat);
  return Number.isInteger(number) ? number : null;
}

function eventRoleId(event) {
  const data = event?.data || {};
  const nested = data.data || data.payload || {};
  return normalizeRoleId(data.roleId || data.roleIdAtPrompt || nested.roleId || nested.roleIdAtPrompt);
}

function countEvents(events, predicate) {
  return events.filter(predicate).length;
}

function buildRuleContractExecutionSummary(record) {
  const players = getPlayers(record);
  const roleIds = unique(players.flatMap((player) => [getRoleId(player), getShownRoleId(player)]));
  const coverage = buildRuleContractCoverage(roleIds);
  const events = getEvents(record);
  const candidateRoleIds = unique(events.map(eventRoleId));
  const presentHighRiskRoleIds = coverage.highRiskRoleIds;
  const supportedHighRiskRoleIds = coverage.highRiskWithContracts;
  const observedHighRiskRoleIds = presentHighRiskRoleIds.filter((roleId) => candidateRoleIds.includes(roleId));

  return {
    schemaVersion: 'mvp.role-rule-contract-summary.v1',
    coverage,
    presentHighRiskRoleIds,
    supportedHighRiskRoleIds,
    observedHighRiskRoleIds,
    unhandledHighRiskRoleIds: presentHighRiskRoleIds.filter((roleId) => !supportedHighRiskRoleIds.includes(roleId)),
    directAiStateMutationAllowedRoleIds: coverage.directAiStateMutationAllowedRoleIds,
    contracts: roleIds
      .map((roleId) => summarizeRoleRuleContract(roleId))
      .filter(Boolean)
      .sort((left, right) => left.roleId.localeCompare(right.roleId))
  };
}

function getRoleContractSummary(record) {
  return record?.ruleContracts || buildRuleContractExecutionSummary(record);
}

function collectPlayerContributions(record) {
  const events = getEvents(record);
  const winAlignment = winningAlignment(record);
  const candidateConfirmationsBySeat = new Map();
  const nightSubmissionsBySeat = new Map();
  const dayVotesBySeat = new Map();
  const nominationsBySeat = new Map();
  const executionImpactsBySeat = new Map();
  const privateMessagesBySeat = new Map();

  for (const event of events) {
    const type = normalizedType(event.type);
    const data = event.data || {};
    const nested = data.data || data.payload || {};
    const seat = eventSeat(event);
    if (seat !== null && (
      type.includes('night-submitted')
      || type.includes('night-action-submitted')
      || type.includes('ai-player-night-submitted')
      || type.includes('player-night-action-submitted')
    )) {
      nightSubmissionsBySeat.set(seat, (nightSubmissionsBySeat.get(seat) || 0) + 1);
    }
    if (seat !== null && (
      type.includes('day-voted')
      || type.includes('vote-recorded')
      || type.includes('player-vote-recorded')
      || type.includes('storyteller-proxy-vote-recorded')
    )) {
      dayVotesBySeat.set(seat, (dayVotesBySeat.get(seat) || 0) + 1);
    }
    const nominatorSeat = Number(nested.nominatorSeat ?? data.nominatorSeat);
    if (Number.isInteger(nominatorSeat)) {
      nominationsBySeat.set(nominatorSeat, (nominationsBySeat.get(nominatorSeat) || 0) + 1);
    }
    const confirmedSeat = Number(data.seat ?? nested.seat);
    if (Number.isInteger(confirmedSeat) && type.includes('confirmed-night-candidate')) {
      candidateConfirmationsBySeat.set(confirmedSeat, (candidateConfirmationsBySeat.get(confirmedSeat) || 0) + 1);
      const privateMessageCount = Number(data.privateMessages ?? nested.privateMessages ?? 0);
      if (privateMessageCount > 0) {
        privateMessagesBySeat.set(confirmedSeat, (privateMessagesBySeat.get(confirmedSeat) || 0) + privateMessageCount);
      }
    }
    const nomineeSeat = Number(nested.nomineeSeat ?? data.nomineeSeat);
    if (Number.isInteger(nomineeSeat) && type.includes('execution')) {
      executionImpactsBySeat.set(nomineeSeat, (executionImpactsBySeat.get(nomineeSeat) || 0) + 1);
    }
  }

  return getPlayers(record).map((player) => {
    const roleId = getRoleId(player);
    const alignment = getAlignment(player);
    const won = winAlignment ? alignment === winAlignment : false;
    const highRiskContract = getRoleRuleContract(roleId);
    const rolePolicy = getRoleAutomationPolicy(roleId);
    const nightSubmissions = nightSubmissionsBySeat.get(player.seat) || 0;
    const dayVotes = dayVotesBySeat.get(player.seat) || 0;
    const confirmedAbilityEffects = candidateConfirmationsBySeat.get(player.seat) || 0;
    const privateMessages = privateMessagesBySeat.get(player.seat) || 0;
    const nominations = nominationsBySeat.get(player.seat) || 0;
    const executionImpacts = executionImpactsBySeat.get(player.seat) || 0;
    const components = {
      baseline: 10,
      outcome: won ? 20 : 0,
      survival: player.alive !== false ? 8 : 0,
      nightAction: Math.min(16, nightSubmissions * 8),
      voteParticipation: Math.min(14, dayVotes * 3),
      abilityImpact: Math.min(18, confirmedAbilityEffects * 8 + privateMessages * 3),
      nominationPressure: Math.min(8, nominations * 4),
      executionPressure: Math.min(7, executionImpacts * 3),
      roleDifficulty: roleRiskBonus(rolePolicy?.riskLevel),
      safetyBoundary: highRiskContract?.highRisk ? 7 : 3
    };
    const score = clampScore(Object.values(components).reduce((sum, value) => sum + value, 0));

    return {
      seat: player.seat,
      name: player.name || null,
      roleId,
      shownRoleId: getShownRoleId(player),
      alignment,
      alive: player.alive !== false,
      won,
      score,
      scoreBreakdown: components,
      riskLevel: rolePolicy?.riskLevel || 'unknown',
      executionMode: rolePolicy?.executionModel?.executionMode || null,
      reviewTags: contributionTags({
        won,
        alive: player.alive !== false,
        components,
        rolePolicy
      }),
      signals: {
        nightSubmissions,
        dayVotes,
        confirmedAbilityEffects,
        privateMessages,
        nominations,
        executionImpacts,
        highRiskRole: highRiskContract?.highRisk === true,
        storytellerConfirmationRequired: rolePolicy?.storytellerConfirmationRequired === true
      }
    };
  }).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.seat - right.seat;
  });
}

function mvpReasonFor(player) {
  const reasons = [];
  const evidenceScore = playerEvidenceScore(player);
  if (player.won) reasons.push('胜利阵营');
  if (evidenceScore > 0) reasons.push(`结构化影响 ${evidenceScore} 分`);
  if (player.scoreBreakdown?.abilityImpact > 0) reasons.push(`技能影响 ${player.scoreBreakdown.abilityImpact} 分`);
  if (player.signals.nightSubmissions > 0) reasons.push(`${player.signals.nightSubmissions} 次夜晚行动`);
  if (player.signals.dayVotes > 0) reasons.push(`${player.signals.dayVotes} 次投票`);
  if (player.signals.nominations > 0) reasons.push(`${player.signals.nominations} 次提名`);
  if (player.signals.highRiskRole) reasons.push('高风险角色已走说书人确认边界');
  return reasons.slice(0, 3).join('，') || '结构化记录较少，按胜负、身份和座位稳定排序';
}

function deriveMvpCandidates(record, playerScores = collectPlayerContributions(record)) {
  if (playerScores.length === 0) return [];
  const winAlignment = winningAlignment(record);
  const scoped = winAlignment
    ? playerScores.filter((player) => player.alignment === winAlignment)
    : playerScores;
  const ranked = [...(scoped.length > 0 ? scoped : playerScores)].sort((left, right) => {
    const evidenceDiff = playerEvidenceScore(right) - playerEvidenceScore(left);
    return evidenceDiff || right.score - left.score || left.seat - right.seat;
  });
  return ranked.slice(0, 3).map((player, index) => ({
    rank: index + 1,
    seat: player.seat,
    name: player.name,
    roleId: player.shownRoleId || player.roleId,
    trueRoleId: player.roleId,
    alignment: player.alignment,
    score: player.score,
    evidenceScore: playerEvidenceScore(player),
    reason: mvpReasonFor(player),
    signals: player.signals,
    scoreBreakdown: player.scoreBreakdown,
    reviewTags: player.reviewTags
  }));
}

function deriveTeamAwards(playerScores) {
  const byAlignment = {
    good: playerScores.filter((player) => player.alignment === 'good'),
    evil: playerScores.filter((player) => player.alignment === 'evil')
  };
  const top = (players, label) => {
    const player = players[0] || null;
    return player
      ? {
          label,
          seat: player.seat,
          name: player.name,
          roleId: player.shownRoleId || player.roleId,
          alignment: player.alignment,
          score: player.score,
          reason: mvpReasonFor(player)
        }
      : null;
  };
  const ability = [...playerScores].sort((left, right) => {
    const diff = (right.scoreBreakdown?.abilityImpact || 0) - (left.scoreBreakdown?.abilityImpact || 0);
    return diff || right.score - left.score || left.seat - right.seat;
  })[0] || null;
  const social = [...playerScores].sort((left, right) => {
    const leftScore = (left.scoreBreakdown?.voteParticipation || 0) + (left.scoreBreakdown?.nominationPressure || 0);
    const rightScore = (right.scoreBreakdown?.voteParticipation || 0) + (right.scoreBreakdown?.nominationPressure || 0);
    return rightScore - leftScore || right.score - left.score || left.seat - right.seat;
  })[0] || null;

  return [
    top(byAlignment.good, '好人方贡献'),
    top(byAlignment.evil, '邪恶方贡献'),
    ability ? {
      label: '技能影响',
      seat: ability.seat,
      name: ability.name,
      roleId: ability.shownRoleId || ability.roleId,
      alignment: ability.alignment,
      score: ability.score,
      reason: `${ability.scoreBreakdown?.abilityImpact || 0} 分技能影响`
    } : null,
    social ? {
      label: '投票提名影响',
      seat: social.seat,
      name: social.name,
      roleId: social.shownRoleId || social.roleId,
      alignment: social.alignment,
      score: social.score,
      reason: `${(social.scoreBreakdown?.voteParticipation || 0) + (social.scoreBreakdown?.nominationPressure || 0)} 分投票/提名影响`
    } : null
  ].filter(Boolean);
}

function buildReviewNarrative(record, scoringContext) {
  const events = getEvents(record);
  const playerScores = asArray(scoringContext.playerScores);
  const top = playerScores[0] || null;
  return {
    bullets: [
      `结局：${record?.result?.winningTeam || '未知阵营'}，原因：${record?.result?.reasonCode || '未知原因'}。`,
      `记录完整度：共 ${events.length} 条事件，计入 ${scoringContext.playerActionCount} 次玩家行动。`,
      top ? `结构化贡献最高：${top.seat}号（${top.shownRoleId || top.roleId}）${top.score}分。` : '暂无可评分玩家。',
      `风险检查：隐私命中 ${scoringContext.privacyHits} 次，失败记录 ${scoringContext.failureCount} 个。`,
      '评分不使用语音、表情、欺骗质量或未写入日志的场外信息。'
    ],
    timeline: events.slice(-12).map((event) => ({
      sequence: event.sequence ?? null,
      type: event.type || 'event',
      seat: eventSeat(event),
      roleId: eventRoleId(event) || null
    }))
  };
}

function buildScoringMethodology() {
  return {
    schemaVersion: 'mvp.scoring-methodology.v1',
    scoringVersion: 'mvp.structured-review.v2',
    sourceSignals: [
      '结局与胜利阵营',
      '最终玩家状态',
      '夜晚行动提交',
      '说书人确认的能力结算',
      '私信发送计数',
      '白天投票',
      '提名',
      '处决',
      '隐私扫描命中',
      '角色规则边界覆盖'
    ],
    excludedSignals: [
      '真实语音发言质量',
      '欺骗质量',
      '盘逻辑读人准确度',
      '场外讨论',
      '未写入事件日志的玩家意图'
    ],
    authorityBoundary: '仅作为启发式复盘分数；说书人结局和官方规则仍是权威',
    mvpSelectionRule: '已知胜利阵营时优先在胜利阵营内按结构化影响分排序，再按总分和座位稳定排序',
    scoreRange: { min: 0, max: 100 }
  };
}

function buildScoringLimitations(record) {
  const limitations = [
    '评分基于结构化事件和最终状态，不评价真实发言、欺骗质量或玩家推理质量。',
    'AI 自动测试局的得分只能说明流程覆盖和规则边界，不等同于真人局贡献。',
    '高风险角色仍以说书人确认候选为准，AI 测试提交不能直接成为官方裁判。'
  ];
  if (record?.mode === 'test-only-ai-storyteller-and-ai-players') {
    limitations.push('当前记录来自 test-only AI 对局，MVP 结果适合作为流程验收，不适合作为真人表现评价。');
  }
  return limitations;
}

function buildScoringConfidence({ ended, events, players, playerScores, privacyHits, failures, illegalActions, mvpCandidates }) {
  let score = 0;
  if (ended) score += 20;
  if (events.length >= 12) score += 20;
  else if (events.length >= 8) score += 14;
  if (players.length > 0 && playerScores.length === players.length) score += 20;
  if (mvpCandidates.length > 0) score += 15;
  if (privacyHits === 0) score += 10;
  if (failures.length === 0 && illegalActions === 0) score += 10;
  score += 5; // Methodology is deterministic and replayable from persisted JSON.
  const value = clampScore(score);
  return {
    value,
    level: value >= 85 ? 'high' : value >= 65 ? 'medium' : 'low',
    reasons: {
      ended,
      eventCount: events.length,
      playerScoresComplete: players.length > 0 && playerScores.length === players.length,
      mvpCandidates: mvpCandidates.length,
      privacyHits,
      failureCount: failures.length,
      illegalActions,
      speechSignalsAvailable: false
    }
  };
}

function scoreRecord(record) {
  const roleContractSummary = getRoleContractSummary(record);
  const privacyHits = privacyHitCount(record);
  const failures = asArray(record?.failures);
  const illegalActions = failures.filter((failure) => /refused|missing-ai-payload|missing-required|illegal|unsafe/i.test(String(failure))).length;
  const ended = record?.result?.status === 'ended' || record?.result?.status === 'confirmed';
  const events = getEvents(record);
  const players = getPlayers(record);
  const playerScores = collectPlayerContributions(record);
  const mvpCandidates = deriveMvpCandidates(record, playerScores);
  const confirmations = Number(record?.aiStoryteller?.confirmedCandidates || 0)
    + Number(record?.aiStoryteller?.confirmedExecutions || 0)
    + Number(record?.aiStoryteller?.confirmedGameEnd || 0);
  const playerActionCount = Number(record?.aiPlayers?.nightSubmissions || 0)
    + Number(record?.aiPlayers?.dayVotes || 0)
    + countEvents(events, (event) => /night-submitted|day-voted|vote-recorded/i.test(normalizedType(event.type)));
  const unsupported = Number(record?.roleLogic?.coverage?.unsupported || 0)
    + asArray(roleContractSummary?.coverage?.missingRoleIds).length;
  const directAiMutationRoles = asArray(roleContractSummary?.directAiStateMutationAllowedRoleIds);
  const highRiskMissing = asArray(roleContractSummary?.unhandledHighRiskRoleIds).length
    + asArray(roleContractSummary?.coverage?.highRiskMissingContractRoleIds).length;
  const highRiskPresent = asArray(roleContractSummary?.presentHighRiskRoleIds).length;
  const teamAwards = deriveTeamAwards(playerScores);

  const scores = {
    completion: ended ? 100 : 0,
    roleContract: clampScore(100 - unsupported * 12 - directAiMutationRoles.length * 40),
    highRiskRoleContracts: highRiskMissing === 0 ? 100 : clampScore(100 - highRiskMissing * 20),
    privacy: clampScore(100 - privacyHits * 25),
    legalActions: clampScore(100 - illegalActions * 20),
    playerParticipation: players.length === 0 ? 0 : clampScore(Math.min(100, 55 + playerActionCount * 4)),
    storytellerResolution: clampScore(confirmations > 0 ? Math.min(100, 65 + confirmations * 5) : 60),
    replay: events.length >= 8 && (record?.artifacts?.recordPath || record?.mode === 'storyteller-room-confirmed') ? 100 : 60,
    mvpEvidence: mvpCandidates.length > 0 && playerScores.length === players.length ? 100 : 50
  };
  const total = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.keys(scores).length);
  const confidence = buildScoringConfidence({
    ended,
    events,
    players,
    playerScores,
    privacyHits,
    failures,
    illegalActions,
    mvpCandidates
  });

  return {
    total,
    scores,
    grade: gradeFor(total),
    playerScores,
    mvpCandidates,
    teamAwards,
    reviewNarrative: buildReviewNarrative(record, {
      playerScores,
      playerActionCount,
      privacyHits,
      failureCount: failures.length
    }),
    roleContractSummary: {
      presentHighRiskRoleIds: asArray(roleContractSummary?.presentHighRiskRoleIds),
      supportedHighRiskRoleIds: asArray(roleContractSummary?.supportedHighRiskRoleIds),
      observedHighRiskRoleIds: asArray(roleContractSummary?.observedHighRiskRoleIds),
      unhandledHighRiskRoleIds: asArray(roleContractSummary?.unhandledHighRiskRoleIds),
      directAiStateMutationAllowedRoleIds: directAiMutationRoles,
      highRiskPresent
    },
    reviewSummary: {
      privacyHits,
      failureCount: failures.length,
      illegalActions,
      confirmations,
      playerActionCount,
      structuredScoring: true,
      scoringVersion: 'mvp.structured-review.v2'
    },
    scoreWeights: {
      player: ['outcome', 'survival', 'nightAction', 'voteParticipation', 'abilityImpact', 'nominationPressure', 'executionPressure', 'roleDifficulty', 'safetyBoundary'],
      game: Object.keys(scores)
    },
    confidence,
    methodology: buildScoringMethodology(),
    limitations: buildScoringLimitations(record)
  };
}

function buildMvpReview(record, scoring = scoreRecord(record)) {
  const roleSummary = scoring.roleContractSummary || {};
  const privacyHits = scoring.reviewSummary?.privacyHits ?? privacyHitCount(record);
  const aiStorytellerConfirmed = Number(record?.aiStoryteller?.confirmedCandidates || 0) > 0
    || Number(record?.aiStoryteller?.confirmedExecutions || 0) > 0
    || Number(record?.aiStoryteller?.confirmedGameEnd || 0) > 0;

  return {
    completeGame: scoring.scores.completion === 100,
    allRoleContractsSupported: scoring.scores.roleContract >= 90 && asArray(roleSummary.directAiStateMutationAllowedRoleIds).length === 0,
    highRiskRoleContractsSupported: scoring.scores.highRiskRoleContracts === 100,
    playerPrivacyClean: privacyHits === 0,
    aiStorytellerAutoConfirmed: aiStorytellerConfirmed,
    aiPlayersAutoSubmitted: Number(record?.aiPlayers?.nightSubmissions || 0) > 0 || Number(record?.aiPlayers?.dayVotes || 0) > 0,
    structuredScoring: true,
    scoringVersion: scoring.reviewSummary?.scoringVersion || 'mvp.structured-review.v2',
    scoringConfidence: scoring.confidence || null,
    scoringLimitations: asArray(scoring.limitations),
    playerScoreCount: asArray(scoring.playerScores).length,
    mvpCandidates: asArray(scoring.mvpCandidates),
    teamAwards: asArray(scoring.teamAwards),
    reviewNarrative: scoring.reviewNarrative || null
  };
}

module.exports = {
  buildMvpReview,
  buildRuleContractExecutionSummary,
  collectPlayerContributions,
  deriveMvpCandidates,
  privacyHitCount,
  scoreRecord
};
