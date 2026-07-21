const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const GAME_RECORDS_ADMIN_TOKEN_STORAGE_KEY = 'botc-ai-storyteller-game-records-admin-token-v1';
const params = new URLSearchParams(window.location.search);
const requestedGameId = params.get('gameId') || params.get('fileName') || params.get('reviewId') || '';
const requestedRoomId = (params.get('roomId') || '').trim().toUpperCase();
const wantsLatest = params.get('latest') === '1' || params.get('latest') === 'true';

const state = { records: [], selectedId: '', filter: 'all', source: { type: 'mock', message: '正在读取主项目对局记录。' } };

const ROLE_NAMES = {
  washerwoman: '洗衣妇', librarian: '图书管理员', investigator: '调查员', chef: '厨师', empath: '共情者', 'fortune-teller': '占卜师', fortune_teller: '占卜师', undertaker: '送葬者', monk: '僧侣', ravenkeeper: '守鸦人', virgin: '贞洁者', slayer: '猎魔人', soldier: '士兵', mayor: '镇长', butler: '管家', drunk: '酒鬼', recluse: '隐士', saint: '圣徒', poisoner: '投毒者', spy: '间谍', 'scarlet-woman': '猩红女郎', scarlet_woman: '猩红女郎', baron: '男爵', imp: '小恶魔'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
function asArray(value) { return Array.isArray(value) ? value : []; }
function compact(values) { return values.filter((item) => item !== undefined && item !== null && String(item).trim() !== ''); }
function roleLabel(value) { const raw = String(value || '').trim(); if (!raw) return '未知身份'; const key = raw.toLowerCase().replace(/_/g, '-'); return ROLE_NAMES[key] || ROLE_NAMES[key.replace(/-/g, '_')] || raw; }
function scriptLabel(value) { return ({ 'trouble-brewing': '暗流涌动', 'Trouble Brewing': '暗流涌动', 'bad-moon-rising': '黯月初升', 'Bad Moon Rising': '黯月初升', 'sects-and-violets': '梦殒春宵', 'Sects & Violets': '梦殒春宵', catfishing: '钓鱼' })[String(value || '')] || value || '未知剧本'; }
function teamLabel(value) { if (value === 'good') return '善良胜'; if (value === 'evil') return '邪恶胜'; if (value === 'unknown') return '胜负未明'; return '未结束'; }
function alignmentLabel(value) { if (value === 'good') return '善良'; if (value === 'evil') return '邪恶'; return '阵营未记'; }
function sourceLabel(value) { if (value === 'room' || value === 'storyteller-room-confirmed') return '真人房间记录'; if (value === 'autonomous' || value === 'test-only-ai-storyteller-and-ai-players') return '自动测试记录'; return value || '主项目记录'; }
function reasonLabel(value) { return ({ 'saint-executed': '圣徒被处决', 'no-alive-demon': '恶魔死亡', 'evil-twin-win': '邪恶孪生胜利', 'good-wins': '善良胜利', 'evil-wins': '邪恶胜利' })[value] || value || '未记录胜负原因'; }
function eventTypeLabel(type) { return ({ room_created: '创建房间', player_joined: '玩家加入', setup_candidate_confirmed: '确认配板', roles_dealt: '发送身份', night_collection_started: '夜晚开始', night_collection_closed: '夜晚关闭', night_candidates_prepared: '夜晚候选', night_candidate_confirmed: '确认夜晚裁定', day_vote_started: '白天开始', nomination_recorded: '记录提名', vote_opened: '开启投票', storyteller_proxy_vote_recorded: '记录投票', vote_counted_candidate: '统计票型', execution_confirmed: '确认处决', game_end_candidate_prepared: '整理结局', game_end_confirmed: '公开结局' })[type] || String(type || '对局事件').replace(/_/g, ' '); }
function formatDate(value) { if (!value) return '时间未记'; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false }); }
function formatShortDate(value) { if (!value) return '未记日期'; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString('zh-CN'); }
function formatDuration(startedAt, endedAt) { const start = new Date(startedAt || 0).getTime(); const end = new Date(endedAt || 0).getTime(); return Number.isFinite(start) && Number.isFinite(end) && end > start ? `${Math.max(1, Math.round((end - start) / 60000))} 分钟` : '未记录时长'; }
function getToken() { return (localStorage.getItem(GAME_RECORDS_ADMIN_TOKEN_STORAGE_KEY) || '').trim(); }

async function fetchJson(url) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers['X-BOTC-Game-Records-Token'] = token;
  const response = await fetch(url, { cache: 'no-store', headers });
  let payload = null;
  try { payload = await response.json(); } catch (_) { payload = null; }
  if (!response.ok || payload?.status === 'NO-GO') throw new Error(payload?.reason || payload?.error || `状态码 ${response.status}`);
  return payload;
}

function normalizeSummary(summary) {
  const finishedAt = summary.endedAt || summary.modifiedAt || summary.startedAt;
  const winner = summary.result?.winningTeam || summary.winner || 'unknown';
  const score = summary.score || {};
  const id = summary.fileName || summary.gameId || `record-${Math.random().toString(16).slice(2)}`;
  return {
    id, fileName: summary.fileName || '', gameId: summary.gameId || id, roomId: summary.roomId || '',
    title: summary.roomId ? `房间 ${summary.roomId} · ${scriptLabel(summary.scriptId)}` : `${scriptLabel(summary.scriptId)} · 对局记录`,
    script: scriptLabel(summary.scriptId), playerCount: Number(summary.playerCount || 0), duration: formatDuration(summary.startedAt, summary.endedAt), date: formatShortDate(finishedAt), finishedAt,
    winner, status: winner === 'good' || winner === 'evil' ? 'ended' : 'in-progress', grade: score.grade || '待整理', scoreTotal: score.total ?? '--', disputeLevel: Number(summary.privacyHits || 0) > 0 || Number(summary.failureCount || 0) > 0 ? 'medium' : 'low',
    tags: compact([sourceLabel(summary.source), reasonLabel(summary.result?.reasonCode), summary.roomId ? `房间 ${summary.roomId}` : '']),
    publicSummary: summary.result?.summary || '这是一条主项目对局摘要。打开后会读取完整事件、评分和玩家贡献。', privateSummary: '请选择这局记录读取完整复盘。',
    stats: { nights: 0, days: 0, nominations: 0, executions: 0, decisiveVotes: 0, privacyRisk: Number(summary.privacyHits || 0) },
    turningPoints: ['点击左侧记录读取完整关键转折。'], missedSignals: ['点击左侧记录读取完整复盘细节。'], voteAnalysis: '点击左侧记录读取投票和处决摘要。', timeline: [], playerLogic: [], storytellerNotes: []
  };
}

function eventPhase(event) { const type = String(event?.type || '').toLowerCase(); const phase = String(event?.phase || event?.data?.phase || '').toLowerCase(); if (phase.includes('night') || type.includes('night')) return 'night'; if (type.includes('vote') || type.includes('nomination') || type.includes('execution') || type.includes('game_end')) return 'vote'; return 'day'; }
function phaseLabel(phase, index) { if (phase === 'night') return index === 0 ? '首夜' : '夜晚'; if (phase === 'vote') return '投票'; return '白天'; }
function countEvents(events, predicate) { return events.reduce((count, event) => count + (predicate(event) ? 1 : 0), 0); }
function privacyHitCount(game, summary) { return Number(summary?.privacyHits || 0) + asArray(game?.privacy?.playerViewForbiddenFieldHits).length + asArray(game?.privacy?.promptForbiddenFieldHits).length + asArray(game?.privacy?.dayVoteForbiddenFieldHits).length; }
function buildEventFact(event) { const data = event?.data || {}; const parts = compact([event?.actorSeat ? `${event.actorSeat}号参与` : '', data.seat ? `${data.seat}号` : '', data.nomineeSeat ? `被提名 ${data.nomineeSeat}号` : '', data.nominatorSeat ? `提名人 ${data.nominatorSeat}号` : '', data.votes !== undefined ? `票数 ${data.votes}` : '', data.executedSeat ? `处决 ${data.executedSeat}号` : '', data.reasonCode ? reasonLabel(data.reasonCode) : '']); return parts.length ? parts.join('，') : '主项目记录了这个阶段事件。'; }

function timelineFromEvents(events, narrativeTimeline = []) {
  const bySeq = new Map(events.map((event) => [Number(event.sequence), event]));
  const preferred = asArray(narrativeTimeline).map((item) => ({ ...bySeq.get(Number(item.sequence)), ...item })).filter((item) => item.type || item.title);
  const source = preferred.length ? preferred : events.filter((event) => /night|day|vote|nomination|execution|game_end|roles_dealt|setup_candidate/.test(String(event.type || '')));
  return source.slice(-14).map((event, index) => {
    const phase = eventPhase(event); const title = event.title || eventTypeLabel(event.type); const fact = buildEventFact(event);
    return { phase, label: event.label || phaseLabel(phase, index), title, body: event.summary || `${fact}这是第 ${event.sequence || index + 1} 条关键记录。`, details: [
      { label: '发生事实', text: fact },
      { label: '玩家当时视角', text: phase === 'night' ? '玩家只知道自己收到的信息，不应看到说书人隐藏来源。' : phase === 'vote' ? '桌面能看到提名、投票和处决结果，但未必知道背后的真实身份。' : '玩家基于公开发言和可见信息推进讨论。' },
      { label: '事后复盘', text: `${title} 应放回胜负原因、票型和身份信息里一起看，避免只按单点发言判断。` },
      { label: '应该追问', text: phase === 'vote' ? '这轮票型谁受益？谁顺势跟票？有没有重新检查前一天旧坑？' : '这条信息如果为真能推出什么？如果被误导，又是谁因此获利？' },
      { label: '胜负影响', text: event.type === 'game_end_confirmed' ? '这一步决定本局公开结论。' : '单条事件不自动决定阵营，但会改变后续讨论焦点。' },
      { label: '说书人观察', text: '复盘页只展示记录和建议，不会回写权威游戏状态。', private: true }
    ] };
  });
}

function normalizeGameRecord(payload) {
  const game = payload?.record || payload?.game || payload?.reviewRecord || payload;
  const summary = payload?.summary || {};
  if (!game || typeof game !== 'object') return null;
  const events = asArray(game.events || game.timeline || game.phases);
  const score = game.scoring || summary.score || {};
  const narrative = score.reviewNarrative || game.mvpReview?.reviewNarrative || {};
  const reviewSummary = score.reviewSummary || {};
  const players = asArray(game.finalState?.players || game.players || game.seats);
  const playerScores = asArray(score.playerScores).length ? asArray(score.playerScores) : players;
  const mvpCandidates = asArray(score.mvpCandidates).length ? asArray(score.mvpCandidates) : asArray(game.mvpReview?.mvpCandidates);
  const teamAwards = asArray(score.teamAwards).length ? asArray(score.teamAwards) : asArray(game.mvpReview?.teamAwards);
  const winner = game.result?.winningTeam || game.winner || summary.result?.winningTeam || 'unknown';
  const finished = ['confirmed', 'ended', 'finished'].includes(game.result?.status || game.status || game.finalState?.phase) || winner === 'good' || winner === 'evil';
  const privacyRisk = privacyHitCount(game, summary);
  const failureCount = asArray(game.failures).length + Number(reviewSummary.failureCount || summary.failureCount || 0);
  const voteCount = countEvents(events, (event) => /vote|nomination|execution/.test(String(event.type || '')));
  const executionCount = countEvents(events, (event) => /execution/.test(String(event.type || '')));
  const topPlayer = mvpCandidates[0] || playerScores[0] || null;
  const bullets = asArray(narrative.bullets);
  const limitations = asArray(score.limitations || game.mvpReview?.scoringLimitations);
  const publicSummary = compact([game.result?.summary, bullets.find((line) => /结局|胜利/.test(line)), finished ? `${teamLabel(winner)}，原因：${reasonLabel(game.result?.reasonCode || summary.result?.reasonCode)}。` : ''])[0] || (finished ? '本局已结束，但缺少结局文字摘要。' : '本局尚未结束。结束后再公开完整复盘。');
  const privateSummary = [
    topPlayer ? `结构化记录显示：${topPlayer.seat}号 ${roleLabel(topPlayer.roleId || topPlayer.shownRoleId || topPlayer.trueRoleId)} 当前贡献最高。` : '暂无明确 MVP 候选。',
    `复盘依据：${events.length} 条事件、${playerScores.length || players.length} 名玩家、${voteCount} 条投票/提名/处决记录。`,
    privacyRisk === 0 ? '玩家视角隐私检查未发现越界记录。' : `发现 ${privacyRisk} 条隐私风险，公开分享前要复查。`
  ].join(' ');
  const turningPoints = compact([game.result?.reasonCode ? `胜负触发点：${reasonLabel(game.result.reasonCode)}。` : '', topPlayer ? `最高贡献：${topPlayer.seat}号 ${roleLabel(topPlayer.roleId || topPlayer.shownRoleId || topPlayer.trueRoleId)}，${topPlayer.reason || `${topPlayer.score ?? '--'}分`}。` : '', voteCount ? `桌面关键压力来自 ${voteCount} 条投票/提名/处决记录。` : '', ...bullets.filter((line) => !/评分不使用/.test(line)).slice(0, 3)]).slice(0, 5);
  const missedSignals = compact([failureCount ? `有 ${failureCount} 条失败/异常记录需要复查。` : '没有失败记录，但仍应回看大票型、存活异常和未被追问的信息源。', privacyRisk ? `隐私风险 ${privacyRisk} 条，公开版需要隐藏私密身份或污染来源。` : '隐私风险为 0，说明玩家端未直接暴露禁止字段。', ...limitations.slice(0, 3)]);
  const voteAnalysis = voteCount ? `本局记录了 ${voteCount} 条提名/投票/处决相关事件，其中处决 ${executionCount} 次。复盘时优先看“谁推动出票、谁跟票、票型是否过高或过低”，不要只看最终谁被处决。` : '当前记录里没有足够投票明细。若是线下真人局，建议说书人后续补记提名人、被提名人、票数和处决结果。';
  return {
    id: game.gameId || summary.gameId || summary.fileName || requestedGameId || 'current-game', fileName: summary.fileName || game.fileName || '', gameId: game.gameId || summary.gameId || '', roomId: game.roomId || summary.roomId || '',
    title: game.roomId ? `房间 ${game.roomId} · ${scriptLabel(game.scriptId)}` : `${scriptLabel(game.scriptId)} · 对局复盘`, script: scriptLabel(game.scriptId || summary.scriptId), playerCount: Number(game.playerCount || summary.playerCount || players.length || playerScores.length || 0), duration: game.duration || formatDuration(game.startedAt || summary.startedAt, game.endedAt || summary.endedAt), date: formatShortDate(game.endedAt || summary.endedAt || game.startedAt || summary.startedAt), finishedAt: game.endedAt || summary.endedAt || summary.modifiedAt,
    winner, status: finished ? 'ended' : 'in-progress', grade: score.grade || summary.score?.grade || (finished ? '待整理' : '进行中'), scoreTotal: score.total ?? summary.score?.total ?? '--', disputeLevel: privacyRisk || failureCount ? 'medium' : 'low', tags: compact([sourceLabel(game.mode || summary.source), reasonLabel(game.result?.reasonCode || summary.result?.reasonCode), `${events.length}条事件`, `${playerScores.length || players.length}名玩家`]), publicSummary, privateSummary,
    stats: { nights: countEvents(events, (event) => eventPhase(event) === 'night'), days: countEvents(events, (event) => eventPhase(event) === 'day'), nominations: countEvents(events, (event) => /nomination/.test(String(event.type || ''))), executions: executionCount, decisiveVotes: Number(game.aiPlayers?.dayVotes || summary.aiPlayers?.dayVotes || voteCount || 0), privacyRisk },
    turningPoints: turningPoints.length ? turningPoints : ['暂无足够结构化转折，建议补充提名、票型和死亡顺序。'], missedSignals: missedSignals.length ? missedSignals : ['暂无被忽略信息。'], voteAnalysis, timeline: timelineFromEvents(events, narrative.timeline),
    playerLogic: playerScores.slice(0, 8).map((player) => ({ title: `${player.seat || '?'}号 ${roleLabel(player.roleId || player.shownRoleId || player.trueRoleId)}`, body: `${alignmentLabel(player.alignment)} · ${player.alive === false ? '已死亡' : '存活'} · ${player.score ?? '--'}分。${asArray(player.reviewTags).length ? `标记：${asArray(player.reviewTags).join('、')}。` : ''}${player.reason ? `原因：${player.reason}。` : ''}` })),
    storytellerNotes: [{ title: '裁决边界', body: '复盘页只读主项目记录，不会写入房间状态，也不会自动裁决阵营。' }, { title: '记录完整度', body: `本局共有 ${events.length} 条事件；评分等级 ${score.grade || '未评级'}，总分 ${score.total ?? '--'}。` }, { title: '公开分享', body: privacyRisk === 0 ? '当前隐私检查干净，可以公开复盘结构化摘要。' : `公开前需要处理 ${privacyRisk} 条隐私风险。`, private: privacyRisk > 0 }, ...limitations.slice(0, 3).map((text) => ({ title: '限制说明', body: text, private: true })), ...teamAwards.slice(0, 2).map((item) => ({ title: item.label || '阵营贡献', body: `${item.seat}号 ${roleLabel(item.roleId)}：${item.reason || `${item.score ?? '--'}分`}` }))]
  };
}

const SAMPLE_RECORD = { id: 'sample-local-review', title: '样例复盘', script: '暗流涌动', playerCount: 12, duration: '未记录时长', date: '样例', winner: 'evil', status: 'ended', grade: '样例', scoreTotal: '--', disputeLevel: 'medium', tags: ['样例数据', '接口未读取'], publicSummary: '没有读取到主项目真实记录时才显示这条样例。真实使用时应通过说书人端入口打开，并带上当前房间或对局编号。', privateSummary: '如果在 VPS 上看到样例，通常是复盘记录接口需要管理员 Token，或当前服务器没有 game-records 文件。', stats: { nights: 0, days: 0, nominations: 0, executions: 0, decisiveVotes: 0, privacyRisk: 0 }, turningPoints: ['等待真实 gameId 或房间记录。'], missedSignals: ['等待主项目输出结构化对局信息。'], voteAnalysis: '等待真实投票记录。', timeline: [{ phase: 'day', label: '接入', title: '等待真实记录', body: '请从说书人端点击复盘入口，或在地址里传入 ?gameId=记录文件名。', details: [{ label: '处理方式', text: '复盘页会先列出记录，再按 gameId、fileName 或 roomId 选择本局。' }] }], playerLogic: [{ title: '未读取真实玩家', body: '真实记录读取成功后，这里会显示玩家贡献、阵营、存活和评分。' }], storytellerNotes: [{ title: '未接入真实数据', body: '当前是兜底样例，不代表真实复盘。' }] };

function chooseRecord(summaries) { const req = requestedGameId.trim(); const noExt = (value) => String(value || '').replace(/\.json$/i, ''); if (req) { const match = summaries.find((item) => item.fileName === req || item.gameId === req || noExt(item.fileName) === noExt(req) || noExt(item.gameId) === noExt(req)); if (match) return match; } if (requestedRoomId) { const match = summaries.find((item) => String(item.roomId || '').toUpperCase() === requestedRoomId); if (match) return match; } return wantsLatest || !req ? summaries[0] || null : null; }
async function loadRecordsFromApi() { const listPayload = await fetchJson('/api/storyteller/game-records?limit=120'); const summaries = asArray(listPayload.records).map(normalizeSummary); state.records = summaries; if (!summaries.length) { state.source = { type: 'api-fallback', message: '接口可用，但当前服务器没有可复盘的对局记录。' }; return; } const chosenSummary = chooseRecord(summaries); if (!chosenSummary?.fileName) { state.selectedId = summaries[0].id; state.source = { type: 'api-fallback', message: requestedGameId ? `没有找到 ${requestedGameId} 对应的记录，已显示最新记录列表。` : '已读取记录列表。' }; return; } const detailPayload = await fetchJson(`/api/storyteller/game-records/${encodeURIComponent(chosenSummary.fileName)}`); const detail = normalizeGameRecord(detailPayload); if (!detail) throw new Error('详情接口返回格式无法识别'); state.records = [detail, ...summaries.filter((item) => item.fileName !== chosenSummary.fileName)]; state.selectedId = detail.id; state.source = { type: 'api-ok', message: `${detail.roomId ? `房间 ${detail.roomId}` : '当前对局'}已接入真实记录：${detail.fileName || detail.gameId || detail.id}` }; }
async function selectRecord(record) { if (!record) return; if (record.fileName && !record.timeline?.length) { try { const detailPayload = await fetchJson(`/api/storyteller/game-records/${encodeURIComponent(record.fileName)}`); const detail = normalizeGameRecord(detailPayload); if (detail) { state.records = [detail, ...state.records.filter((item) => item.id !== record.id && item.fileName !== record.fileName)]; state.selectedId = detail.id; state.source = { type: 'api-ok', message: `已读取真实记录：${detail.fileName || detail.gameId}` }; } } catch (error) { state.source = { type: 'api-fallback', message: `详情读取失败：${error.message}` }; state.selectedId = record.id; } } else { state.selectedId = record.id; } render(); }

function renderSourceStatus() { const node = $('#sourceStatus'); if (!node) return; node.className = `source-status ${state.source.type}`; node.textContent = `数据来源：${state.source.message}`; }
function filteredRecords() { if (state.filter === 'all') return state.records; if (state.filter === 'disputed') return state.records.filter((record) => record.disputeLevel !== 'low' || record.stats?.privacyRisk > 0); return state.records.filter((record) => record.winner === state.filter); }
function renderRecordList() { const list = $('#recordList'); const count = $('#recordCount'); if (!list) return; const records = filteredRecords(); if (count) count.textContent = `${state.records.length} 局`; list.innerHTML = records.map((record) => `<button class="record-card ${record.id === state.selectedId ? 'active' : ''}" type="button" data-record-id="${escapeHtml(record.id)}"><span class="record-title"><span>${escapeHtml(record.title)}</span><span>${escapeHtml(teamLabel(record.winner))}</span></span><span class="record-meta">${escapeHtml(record.date)} · ${escapeHtml(record.script)} · ${escapeHtml(record.playerCount)}人 · ${escapeHtml(record.grade)} / ${escapeHtml(record.scoreTotal)}</span><span class="record-meta">${escapeHtml(record.tags.join(' · '))}</span></button>`).join('') || '<div class="chip">没有符合筛选条件的记录。</div>'; list.querySelectorAll('[data-record-id]').forEach((button) => button.addEventListener('click', () => selectRecord(state.records.find((record) => record.id === button.dataset.recordId)))); }
function renderChips(selector, items) { const node = $(selector); if (!node) return; node.innerHTML = asArray(items).map((item, index) => `<div class="chip"><span class="chip-index">${index + 1}</span><span class="chip-text">${escapeHtml(item)}</span></div>`).join('') || '<div class="chip"><span class="chip-index">—</span><span class="chip-text">暂无记录。</span></div>'; }
function phaseClass(phase) { return phase === 'night' || phase === 'vote' ? phase : 'day'; }
function renderTimeline(record) { const node = $('#timeline'); if (!node) return; node.innerHTML = asArray(record.timeline).map((item) => `<article class="timeline-item timeline-item-detailed"><div class="timeline-phase ${phaseClass(item.phase)}">${escapeHtml(item.label)}</div><div class="timeline-body"><h3>${escapeHtml(item.title)}</h3><p class="timeline-brief">${escapeHtml(item.body)}</p><div class="timeline-details-grid">${asArray(item.details).map((detail) => `<div class="timeline-detail ${detail.private ? 'private-detail storyteller-only' : ''}"><span>${escapeHtml(detail.label)}</span><p>${escapeHtml(detail.text)}</p></div>`).join('')}</div></div></article>`).join('') || '<div class="chip">暂无时间线。</div>'; }
function renderLogic(selector, items) { const node = $(selector); if (!node) return; node.innerHTML = asArray(items).map((item, index) => `<article class="logic-card ${item.private ? 'storyteller-only' : ''}"><h3 class="logic-heading"><span>${index + 1}</span>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join('') || '<div class="chip">暂无记录。</div>'; }
function renderIntegration(record) { const list = $('#integrationList'); if (!list) return; const urlGameId = requestedGameId || '未传入'; const items = [`入口来源：说书人端按钮会打开 /review/index.html，并携带当前房间或最新 gameId。`, `当前参数：gameId=${urlGameId}${requestedRoomId ? `，roomId=${requestedRoomId}` : ''}。`, `真实对接：本页只读 /api/storyteller/game-records，不修改房间、身份、投票或结局。`, `公网说明：如果服务器启用了复盘 Token，本页会读取同源 localStorage 中的管理员 Token。`, record?.fileName ? `当前文件：${record.fileName}。` : '当前没有选中真实记录文件。']; list.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join(''); }
function renderCurrentRecord() { const record = state.records.find((item) => item.id === state.selectedId) || state.records[0] || SAMPLE_RECORD; const unfinished = $('#unfinishedNotice'); $('#gameTitle').textContent = record.title; $('#gameMeta').textContent = `${record.date} · ${record.script} · ${record.playerCount}人 · ${record.duration}`; $('#resultSeal').textContent = teamLabel(record.winner); if (unfinished) unfinished.hidden = record.status === 'ended'; $('#keyStats').innerHTML = [['夜晚', record.stats?.nights ?? 0], ['白天', record.stats?.days ?? 0], ['提名', record.stats?.nominations ?? 0], ['处决', record.stats?.executions ?? 0], ['投票记录', record.stats?.decisiveVotes ?? 0], ['隐私风险', record.stats?.privacyRisk ?? 0]].map(([label, value]) => `<span class="stat-item"><strong>${escapeHtml(value)}</strong>${escapeHtml(label)}</span>`).join(''); $('#storytellerSummary').innerHTML = `<div class="summary-block"><strong>本局结论</strong><p>${escapeHtml(record.publicSummary)}</p></div><div class="summary-block storyteller-only"><strong>说书人补充</strong><p>${escapeHtml(record.privateSummary)}</p></div>`; renderChips('#turningPoints', record.turningPoints); renderChips('#missedSignals', record.missedSignals); $('#voteAnalysis').textContent = record.voteAnalysis || '暂无票型分析。'; renderTimeline(record); renderLogic('#playerLogic', record.playerLogic); renderLogic('#storytellerNotes', record.storytellerNotes); renderIntegration(record); }
function render() { renderSourceStatus(); renderRecordList(); renderCurrentRecord(); }
function updateViewportProfile() { const width = window.innerWidth; let label = '电脑宽屏'; if (width < 768) label = '手机竖屏'; else if (width < 1180) label = '平板屏幕'; const node = $('#viewportProfile'); if (node) node.textContent = `当前屏幕：${label} · ${width} 像素`; }
function bindFilters() { $$('.filter-button').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter || 'all'; $$('.filter-button').forEach((item) => item.classList.toggle('active', item === button)); renderRecordList(); })); }
async function bootstrap() { updateViewportProfile(); bindFilters(); try { await loadRecordsFromApi(); } catch (error) { state.records = [SAMPLE_RECORD]; state.selectedId = SAMPLE_RECORD.id; state.source = { type: 'api-fallback', message: `未读取到真实记录，当前显示样例。原因：${error.message}` }; } render(); }
window.addEventListener('resize', updateViewportProfile);
bootstrap();
