'use strict';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableItemKey(item) {
  if (item === null || item === undefined) return '';
  if (typeof item !== 'object') return String(item);
  return String(item.seat ?? item.roleId ?? item.id ?? JSON.stringify(item));
}

function rotateDeterministically(items, seed) {
  const values = asArray(items).slice();
  if (values.length <= 1) return values;
  const start = stableHash(seed) % values.length;
  return values.slice(start).concat(values.slice(0, start));
}

function chooseDiversified(items, count, seed, { score = null } = {}) {
  const expectedCount = Number(count || 0);
  if (!Number.isInteger(expectedCount) || expectedCount <= 0) return [];
  const values = asArray(items).slice();
  if (typeof score !== 'function') {
    return rotateDeterministically(values, seed).slice(0, expectedCount);
  }

  const groups = new Map();
  for (const item of values) {
    const itemScore = Number(score(item));
    const key = Number.isFinite(itemScore) ? itemScore : Number.NEGATIVE_INFINITY;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const ordered = [...groups.keys()]
    .sort((left, right) => right - left)
    .flatMap((itemScore) => rotateDeterministically(
      groups.get(itemScore).sort((left, right) => stableItemKey(left).localeCompare(stableItemKey(right), 'zh-CN', { numeric: true })),
      `${seed}:score:${itemScore}`
    ));
  return ordered.slice(0, expectedCount);
}

function buildAiSelectionSeed(roomState, prompt, scope = 'target') {
  return [
    roomState?.roomId || roomState?.id || roomState?.gameId || 'room',
    roomState?.gameNumber || 1,
    prompt?.batchId || `night-${roomState?.nightNumber || roomState?.round || 1}`,
    prompt?.promptId || 'prompt',
    prompt?.seat || 0,
    prompt?.roleIdAtPrompt || prompt?.roleId || 'role',
    scope
  ].join(':');
}

module.exports = {
  buildAiSelectionSeed,
  chooseDiversified,
  rotateDeterministically,
  stableHash
};
