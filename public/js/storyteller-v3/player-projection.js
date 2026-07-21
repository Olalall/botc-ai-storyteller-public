export function buildPlayerIdentityProjection(state, playerRef) {
  const snapshot = state || {};
  const player = findPlayer(snapshot, playerRef);

  return {
    player: player ? buildOwnPlayerView(snapshot, player) : null,
    privateMessages: player ? selectPrivateMessages(snapshot, player) : [],
    prompts: player ? selectOwnPrompts(snapshot, player) : [],
    publicState: buildPublicState(snapshot)
  };
}

function buildOwnPlayerView(state, player) {
  const identitySent = isIdentitySent(state);

  return {
    seat: player.seat,
    name: player.name,
    ownRoleVisible: identitySent,
    role: identitySent ? normalizeOwnRole(player) : null,
    identityConfirmed: Boolean(player.identityConfirmed),
    publicStatus: getPublicStatus(player)
  };
}

function buildPublicState(state) {
  const players = Array.isArray(state.players) ? state.players : [];
  return {
    phase: state.phase || null,
    dayLabel: state.room?.dayLabel || state.dayLabel || null,
    dayNumber: state.dayNumber ?? state.room?.dayNumber ?? null,
    players: players.map((player, index) => ({
      seat: player.seat ?? index + 1,
      name: player.name || `${player.seat ?? index + 1}号`,
      publicStatus: getPublicStatus(player)
    })),
    publicAnnouncements: selectPublicAnnouncements(state)
  };
}

function findPlayer(state, playerRef) {
  const players = Array.isArray(state.players) ? state.players : [];
  const ref = normalizePlayerRef(playerRef) || normalizePlayerRef(state.currentPlayer) || normalizePlayerRef({
    seat: state.currentPlayerSeat ?? state.playerSeat,
    id: state.currentPlayerId ?? state.playerId
  });

  if (!ref) return null;
  return players.find((player) => {
    if (ref.seat != null && String(player.seat) === String(ref.seat)) return true;
    if (ref.id != null && String(player.id ?? player.playerId) === String(ref.id)) return true;
    if (ref.name != null && String(player.name) === String(ref.name)) return true;
    return false;
  }) || null;
}

function normalizePlayerRef(ref) {
  if (ref == null || ref === '') return null;
  if (typeof ref === 'number' || typeof ref === 'string') return { seat: ref };
  if (typeof ref !== 'object') return null;

  const nested = ref.player && typeof ref.player === 'object' ? ref.player : {};
  const seat = ref.seat ?? ref.playerSeat ?? ref.requestingSeat ?? nested.seat;
  const id = ref.id ?? ref.playerId ?? ref.requestingPlayerId ?? nested.id ?? nested.playerId;
  const name = ref.name ?? ref.playerName ?? nested.name;

  if (seat == null && id == null && name == null) return null;
  return { seat, id, name };
}

function isIdentitySent(state) {
  return Boolean(
    state.setup?.rolesDealt ||
    state.setup?.status === 'roles-dealt' ||
    state.identity?.sent ||
    state.rolesDealt
  );
}

function normalizeOwnRole(player) {
  if (player.role == null && player.roleId == null && player.roleName == null) return null;
  if (typeof player.role === 'string') return player.role;

  const role = typeof player.role === 'object' && player.role ? player.role : {};
  return {
    id: role.id ?? player.roleId ?? null,
    name: role.name ?? role.roleName ?? player.roleName ?? null,
    alignment: role.alignment ?? player.alignment ?? null,
    type: role.type ?? player.type ?? null
  };
}

function getPublicStatus(player) {
  if (player.alive === false) return '死亡';
  return '存活';
}

function selectPrivateMessages(state, player) {
  const messages = [
    ...normalizeList(state.privateMessages),
    ...normalizeList(state.messages),
    ...normalizeList(state.inbox?.messages)
  ];
  return messages
    .filter((message) => isOwnPrivateItem(message, player))
    .map((message) => ({
      id: message.id ?? null,
      type: message.type ?? 'private',
      title: message.title ?? '',
      body: message.body ?? message.text ?? '',
      createdAt: message.createdAt ?? message.time ?? null,
      acknowledged: Boolean(message.acknowledged)
    }));
}

function selectOwnPrompts(state, player) {
  return normalizeList(state.prompts)
    .filter((prompt) => isOwnPrivateItem(prompt, player))
    .map((prompt) => ({
      id: prompt.id ?? null,
      type: prompt.type ?? 'prompt',
      title: prompt.title ?? '',
      options: Array.isArray(prompt.options) ? prompt.options.map(String) : [],
      deadline: prompt.deadline ?? null,
      submitted: Boolean(prompt.submitted)
    }));
}

function selectPublicAnnouncements(state) {
  const announcements = [
    ...normalizeList(state.publicAnnouncements),
    ...normalizeList(state.announcements)
  ];
  return announcements
    .filter((announcement) => announcement.visibility == null || announcement.visibility === 'public')
    .map((announcement) => ({
      id: announcement.id ?? null,
      title: announcement.title ?? '',
      body: announcement.body ?? announcement.text ?? '',
      createdAt: announcement.createdAt ?? announcement.time ?? null
    }));
}

function isOwnPrivateItem(item, player) {
  if (!item || item.visibility === 'public') return false;
  if (item.seat != null && String(item.seat) === String(player.seat)) return true;
  if (item.playerSeat != null && String(item.playerSeat) === String(player.seat)) return true;
  if (item.toSeat != null && String(item.toSeat) === String(player.seat)) return true;
  if (item.playerId != null && String(item.playerId) === String(player.id ?? player.playerId)) return true;
  if (item.toPlayerId != null && String(item.toPlayerId) === String(player.id ?? player.playerId)) return true;
  return false;
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}