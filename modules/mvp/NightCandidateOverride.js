const { getScriptById } = require('../ScriptCatalog');

const CONFIRMATION_MODES = new Set(['apply', 'record-only']);
const EDITABLE_VISIBLE_FIELDS = new Set([
  'recipientSeat',
  'messageType',
  'text',
  'messageDraft',
  'result',
  'resultKind',
  'resultValue',
  'value',
  'resultSeat',
  'resultSeats',
  'resultRoleId'
]);
const EDITABLE_STATE_FIELDS = new Set([
  'type',
  'summary',
  'target',
  'targets',
  'targetSeat',
  'targetSeats',
  'protectedTargetSeats',
  'drunkTargetSeat',
  'drunkSeat',
  'roleId',
  'chosenRoleId',
  'guessedRoleId',
  'correct',
  'transferSeat',
  'newDemonSeat',
  'fangguRegistrationRuling',
  'registrationRuling',
  'revived'
]);
const STRUCTURED_VISIBLE_FIELDS = [
  'resultKind',
  'resultValue',
  'value',
  'resultSeat',
  'resultSeats',
  'resultRoleId'
];
const ROLE_FIELDS = ['roleId', 'chosenRoleId', 'guessedRoleId'];

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getRoomState(options = {}) {
  const room = options.roomState || options.room || null;
  return room?.state && typeof room.state === 'object' ? room.state : room;
}

function getPlayers(options = {}) {
  const state = getRoomState(options);
  return Array.isArray(state?.players) ? state.players : null;
}

function getPlayerBySeat(options, seat) {
  const players = getPlayers(options);
  if (!players) return null;
  return players.find((player) => Number(player?.seat) === Number(seat)) || null;
}

function validateSeat(options, rawSeat, code = 'invalid-candidate-override-target') {
  const seat = Number(rawSeat);
  if (!Number.isInteger(seat) || seat <= 0) {
    fail(code, `candidate override seat is invalid: ${rawSeat}`);
  }
  const players = getPlayers(options);
  if (players && !getPlayerBySeat(options, seat)) {
    fail(code, `candidate override target seat does not exist: ${seat}`);
  }
  return seat;
}

function normalizeSeatList(options, rawSeats, { exactCount = null, allowEmpty = false } = {}) {
  if (!Array.isArray(rawSeats)) {
    if (allowEmpty && (rawSeats === undefined || rawSeats === null)) return [];
    fail('invalid-candidate-override-target', 'candidate override target seats must be an array');
  }
  const seats = rawSeats.map((seat) => validateSeat(options, seat));
  if (new Set(seats).size !== seats.length) {
    fail('invalid-candidate-override-target', 'candidate override target seats must be unique');
  }
  if (exactCount !== null && seats.length !== exactCount) {
    fail('invalid-candidate-override-target', `candidate override requires exactly ${exactCount} target seats`);
  }
  if (!allowEmpty && seats.length === 0) {
    fail('invalid-candidate-override-target', 'candidate override requires at least one target seat');
  }
  return seats;
}

function getRoomRoleIds(options = {}) {
  const state = getRoomState(options) || {};
  const script = state.script || getScriptById(state.currentScript || state.scriptId || 'trouble-brewing');
  const roleIds = new Set(['none']);
  for (const roles of Object.values(script?.characters || {})) {
    for (const role of roles || []) {
      if (role?.id) roleIds.add(String(role.id));
    }
  }
  for (const player of state.players || []) {
    for (const field of ['trueRoleId', 'realRoleId', 'roleId', 'shownRoleId']) {
      if (player?.[field]) roleIds.add(String(player[field]));
    }
  }
  return roleIds;
}

function validateRoleId(options, rawRoleId, code = 'invalid-candidate-override-role') {
  const roleId = String(rawRoleId || '').trim();
  if (!roleId || roleId.length > 80 || !/^[a-z0-9_-]+$/i.test(roleId)) {
    fail(code, `candidate override role is invalid: ${rawRoleId}`);
  }
  const state = getRoomState(options);
  if (state && !getRoomRoleIds(options).has(roleId)) {
    fail(code, `candidate override role is not in the current script: ${roleId}`);
  }
  return roleId;
}

function assertOnlyBaseOrEditableFields(raw, base, editableFields, kind) {
  for (const [key, value] of Object.entries(raw)) {
    if (editableFields.has(key)) continue;
    if (hasOwn(base, key) && sameJson(value, base[key])) continue;
    const code = key === 'patches'
      ? 'unsafe-state-patch-override'
      : key === 'privateMessageDrafts'
        ? 'unsafe-private-message-override'
        : `unsupported-${kind}-override-field`;
    fail(code, `${kind} override cannot change field: ${key}`);
  }
}

function getVisibleText(value = {}) {
  return String(value.text ?? value.messageDraft ?? value.result ?? '').trim();
}

function sanitizeFinalVisibleResult(candidate, rawResult, options = {}) {
  const base = candidate?.visibleResultDraft;
  if (!base) fail('unexpected-visible-result-override', 'candidate has no visible result to override');
  const raw = typeof rawResult === 'string' ? { text: rawResult } : rawResult;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('invalid-visible-result-override', 'visible result override must be an object or text');
  }
  assertOnlyBaseOrEditableFields(raw, base, EDITABLE_VISIBLE_FIELDS, 'visible-result');

  if (hasOwn(raw, 'recipientSeat') && Number(raw.recipientSeat) !== Number(base.recipientSeat || candidate.seat)) {
    fail('visible-result-recipient-locked', 'visible result recipient cannot be changed');
  }
  if (hasOwn(raw, 'messageType') && raw.messageType !== base.messageType) {
    fail('visible-result-message-type-locked', 'visible result message type cannot be changed');
  }
  validateSeat(options, base.recipientSeat || candidate.seat, 'invalid-visible-result-recipient');

  const baseKind = base.resultKind || null;
  const rawKind = hasOwn(raw, 'resultKind') ? String(raw.resultKind || '').trim() || null : null;
  const textEdited = getVisibleText(raw) && getVisibleText(raw) !== getVisibleText(base);
  const textOnlyOverride = Boolean(baseKind && textEdited && !rawKind);
  if (rawKind && rawKind !== baseKind) {
    fail('visible-result-kind-locked', `visible result kind cannot change from ${baseKind} to ${rawKind}`);
  }

  if (textOnlyOverride) {
    return {
      recipientSeat: base.recipientSeat || candidate.seat,
      messageType: base.messageType || 'ability-result',
      text: getVisibleText(raw),
      messageDraft: getVisibleText(raw),
      result: getVisibleText(raw),
      redactedForPlayer: base.redactedForPlayer === true
    };
  }

  const sanitized = clone(base);
  for (const field of EDITABLE_VISIBLE_FIELDS) {
    if (hasOwn(raw, field)) sanitized[field] = clone(raw[field]);
  }
  sanitized.recipientSeat = base.recipientSeat || candidate.seat;
  sanitized.messageType = base.messageType || 'ability-result';

  const resultKind = sanitized.resultKind || null;
  const rawValue = sanitized.resultValue ?? sanitized.value;
  if (resultKind === 'yes-no') {
    const allowed = new Set(['yes', 'no', 'true', 'false', '1', '0', '是', '否']);
    if (!allowed.has(String(rawValue ?? '').trim().toLowerCase())) {
      fail('invalid-visible-result-option', 'yes-no result must use an allowed option');
    }
  }
  if (resultKind === 'number') {
    const number = Number(rawValue);
    const min = Number.isFinite(Number(base.min)) ? Number(base.min) : 0;
    const max = Number.isFinite(Number(base.max)) ? Number(base.max) : 99;
    if (!Number.isInteger(number) || number < min || number > max) {
      fail('invalid-visible-result-option', `number result must be an integer from ${min} to ${max}`);
    }
  }
  if (resultKind === 'role') {
    sanitized.resultRoleId = validateRoleId(options, sanitized.resultRoleId ?? rawValue, 'invalid-visible-result-role');
  }
  if (resultKind === 'seat') {
    sanitized.resultSeat = validateSeat(options, sanitized.resultSeat ?? rawValue, 'invalid-visible-result-target');
  }
  if (resultKind === 'seat-role') {
    const roleId = validateRoleId(options, sanitized.resultRoleId || 'none', 'invalid-visible-result-role');
    sanitized.resultRoleId = roleId;
    if (roleId !== 'none') {
      sanitized.resultSeat = validateSeat(options, sanitized.resultSeat, 'invalid-visible-result-target');
    }
  }
  if (resultKind === 'two-seats-role') {
    const roleId = validateRoleId(options, sanitized.resultRoleId || 'none', 'invalid-visible-result-role');
    sanitized.resultRoleId = roleId;
    sanitized.resultSeats = roleId === 'none'
      ? []
      : normalizeSeatList(options, sanitized.resultSeats, { exactCount: 2 });
  }
  return sanitized;
}

function sanitizeFinalStateChange(candidate, rawStateChange, options = {}) {
  const base = candidate?.stateChangeDraft;
  if (!base) fail('unexpected-state-change-override', 'candidate has no state change to override');
  if (!rawStateChange || typeof rawStateChange !== 'object' || Array.isArray(rawStateChange)) {
    fail('invalid-state-change-override', 'state change override must be an object');
  }
  assertOnlyBaseOrEditableFields(rawStateChange, base, EDITABLE_STATE_FIELDS, 'state-change');
  if (hasOwn(rawStateChange, 'type') && rawStateChange.type !== base.type) {
    fail('state-change-type-locked', 'state change type cannot be changed');
  }

  const sanitized = clone(base);
  for (const field of EDITABLE_STATE_FIELDS) {
    if (hasOwn(rawStateChange, field)) sanitized[field] = clone(rawStateChange[field]);
  }
  sanitized.type = base.type;

  for (const field of ['targetSeat', 'target', 'transferSeat', 'newDemonSeat', 'drunkTargetSeat', 'drunkSeat']) {
    if (sanitized[field] !== undefined && sanitized[field] !== null && sanitized[field] !== '') {
      sanitized[field] = validateSeat(options, sanitized[field]);
    }
  }
  for (const field of ['targetSeats', 'targets', 'protectedTargetSeats']) {
    if (sanitized[field] !== undefined && sanitized[field] !== null) {
      sanitized[field] = normalizeSeatList(options, sanitized[field], { allowEmpty: true });
    }
  }
  for (const field of ROLE_FIELDS) {
    if (sanitized[field]) sanitized[field] = validateRoleId(options, sanitized[field]);
  }
  if (sanitized.correct !== undefined && typeof sanitized.correct !== 'boolean') {
    fail('invalid-state-change-option', 'state change correctness must be boolean');
  }
  for (const field of ['revived']) {
    if (sanitized[field] !== undefined && typeof sanitized[field] !== 'boolean') {
      fail('invalid-state-change-option', `${field} must be boolean`);
    }
  }
  return sanitized;
}

function normalizeNightCandidateConfirmationOptions(candidate, options = {}) {
  const resolutionMode = options.resolutionMode || 'apply';
  if (!CONFIRMATION_MODES.has(resolutionMode)) {
    fail('invalid-candidate-resolution-mode', `unsupported candidate resolution mode: ${resolutionMode}`);
  }
  const recordOnlyReason = typeof options.recordOnlyReason === 'string'
    ? options.recordOnlyReason.trim().slice(0, 300)
    : '';
  if (resolutionMode === 'record-only' && !recordOnlyReason) {
    fail('missing-record-only-reason', 'record-only confirmation requires a reason');
  }

  const normalized = { resolutionMode, recordOnlyReason };
  if (hasOwn(options, 'finalVisibleResult') && options.finalVisibleResult !== undefined && options.finalVisibleResult !== null) {
    normalized.finalVisibleResult = sanitizeFinalVisibleResult(candidate, options.finalVisibleResult, options);
  }
  if (hasOwn(options, 'finalStateChange') && options.finalStateChange !== undefined && options.finalStateChange !== null) {
    normalized.finalStateChange = sanitizeFinalStateChange(candidate, options.finalStateChange, options);
  }
  return normalized;
}

module.exports = {
  CONFIRMATION_MODES,
  normalizeNightCandidateConfirmationOptions,
  sanitizeFinalStateChange,
  sanitizeFinalVisibleResult
};
