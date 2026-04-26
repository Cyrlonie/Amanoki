// Presence / members / typing (classic script).
const typingBroadcastState = {};
const TYPING_BROADCAST_TTL_MS = 4500;
const LAST_SEEN_ONLINE_TTL_MS = 5 * 60 * 1000; // 5 минут
const memberLastSeen = {}; // id -> timestamp (ms)

function applyPresenceFromChannel() {
  if (isDemoMode || !authUser) return;
  const byUserId = {};
  const statusRank = { offline: 0, online: 1, typing: 2 };

  // Determine which user IDs to show based on context
  let visibleUserIds;
  if (typeof isDMHomeMode !== 'undefined' && isDMHomeMode && typeof currentDMTarget !== 'undefined' && currentDMTarget) {
    // DM mode: only show self + DM partner
    visibleUserIds = new Set([authUser.id, currentDMTarget.userId]);
  } else if (typeof isDMHomeMode !== 'undefined' && isDMHomeMode) {
    // DM home with no active conversation: show only self
    visibleUserIds = new Set([authUser.id]);
  } else if (currentServerMemberIds && currentServerMemberIds.size > 0) {
    // Server mode: show only this server's members
    visibleUserIds = currentServerMemberIds;
  } else {
    // Fallback: show all
    visibleUserIds = null;
  }

  // База списка участников: профили как offline (filtered by context)
  Object.entries(memberDirectory).forEach(([id, name]) => {
    if (visibleUserIds && !visibleUserIds.has(id)) return;
    byUserId[id] = { name, status: 'offline' };
  });

  // Накладываем presence-состояние для активных пользователей
  const state = presenceChannel ? presenceChannel.presenceState() : {};
  const voiceUsersByChannel = {};
  
  let presenceUsersCount = 0;
  Object.keys(state).forEach((key) => {
    const presences = state[key];
    if (!presences || !presences.length) return;

    presences.forEach((p) => {
      // Для глобального presence не проверяем канал
      const id = String(p.user_id || key);
      const name = p.username || memberDirectory[id] || byUserId[id]?.name || 'Unknown';
      const status = p.typing ? 'typing' : 'online';
      const prev = byUserId[id]?.status || 'offline';
      byUserId[id] = {
        name,
        status: statusRank[status] >= statusRank[prev] ? status : prev,
      };

      if (p.voice_channel) {
        if (!voiceUsersByChannel[p.voice_channel]) voiceUsersByChannel[p.voice_channel] = [];
        if (!voiceUsersByChannel[p.voice_channel].some(u => u.id === id)) {
          voiceUsersByChannel[p.voice_channel].push({ id, name });
          console.log(`[Presence] Добавлен пользователь ${name} в канал ${p.voice_channel}`);
        }
      }

      presenceUsersCount++;
    });
  });

  // Fallback: если presence не работает, используем активность по сообщениям
  if (presenceUsersCount === 0) {
    const now = Date.now();
    Object.entries(memberDirectory).forEach(([id, name]) => {
      if (byUserId[id]?.status !== 'offline') return;
      const lastSeen = memberLastSeen[id];
      if (lastSeen && (now - lastSeen) < LAST_SEEN_ONLINE_TTL_MS) {
        byUserId[id] = { name, status: 'online' };
      }
    });
  }

  // Текущий пользователь всегда online
  const selfId = String(authUser.id);
  const selfName = memberDirectory[selfId] || currentUser || 'You';
  byUserId[selfId] = { name: selfName, status: 'online' };
  currentUser = selfName;

  if (typeof currentVoiceChannel !== 'undefined' && currentVoiceChannel) {
    if (!voiceUsersByChannel[currentVoiceChannel]) voiceUsersByChannel[currentVoiceChannel] = [];
    if (!voiceUsersByChannel[currentVoiceChannel].some(u => u.id === selfId)) {
      voiceUsersByChannel[currentVoiceChannel].push({ id: selfId, name: selfName });
    }
    // Merge local LiveKit room participants (available before presence syncs)
    if (typeof voiceParticipants !== 'undefined' && voiceParticipants) {
      Object.values(voiceParticipants).forEach(p => {
        if (!voiceUsersByChannel[currentVoiceChannel].some(u => u.id === p.id)) {
          voiceUsersByChannel[currentVoiceChannel].push({ id: p.id, name: p.name });
        }
      });
    }
  }

  // Для UI сворачиваем в объект name -> status
  members = {};
  Object.values(byUserId).forEach((entry) => {
    if (!entry?.name) return;
    const prev = members[entry.name] || 'offline';
    members[entry.name] = statusRank[entry.status] >= statusRank[prev] ? entry.status : prev;
  });

  updateMemberList();
  updateOnlineCount();
  updateTypingIndicator();
  if (typeof renderVoiceChannelUsers === 'function') {
    renderVoiceChannelUsers(voiceUsersByChannel);
  }
}

async function loadMembersDirectory() {
  if (isDemoMode || !supabase) return;
  try {
    const { data, error } = await supabase.from('profiles').select('id, username, is_banned, avatar_color, avatar_url');
    if (error) throw error;

    const previousNames = new Set(Object.values(memberDirectory));
    memberDirectory = {};
    (data || []).forEach((row) => {
      if (row.is_banned) return;
      if (!row.username) return;
      memberDirectory[row.id] = row.username;

      previousNames.delete(row.username);
      if (row.avatar_color) {
        userColors[row.username] = row.avatar_color;
      }
      if (row.avatar_url) {
        userAvatars[row.username] = row.avatar_url;
      } else {
        delete userAvatars[row.username];
      }
    });
    previousNames.forEach((name) => delete userAvatars[name]);
    applyPresenceFromChannel();
  } catch (e) {
    console.error('Ошибка загрузки списка пользователей:', e);
  }
}

async function updateLastSeen() {
  if (isDemoMode || !supabase || !authUser) return;
  try {
    await supabase
      .from('profiles')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', authUser.id);
  } catch (e) {
    console.error('Ошибка обновления last_seen:', e);
  }
}

// ===================== TYPING =====================
function handleTyping() {
  if (!isTyping) {
    isTyping = true;
    publishTypingStatus(true);
    updateLastSeen(); // Обновляем last_seen при активности
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    isTyping = false;
    publishTypingStatus(false);
  }, 3000);
}

async function updateMyPresence(isTyping2 = isTyping) {
  if (isDemoMode || !supabase || !authUser || !presenceChannel) return;
  try {
    const voiceCh = typeof currentVoiceChannel !== 'undefined' ? currentVoiceChannel : null;
    await presenceChannel.track({
      user_id: authUser.id,
      username: currentUser,
      channel: currentChannel,
      typing: !!isTyping2,
      voice_channel: voiceCh,
    });
    applyPresenceFromChannel();
  } catch (e) {
    console.error('Presence track error:', e);
  }
}

async function publishTypingStatus(isTyping2) {
  if (isDemoMode || !supabase || !authUser || !presenceChannel) return;
  try {
    await updateMyPresence(isTyping2);
    await presenceChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: authUser.id,
        username: currentUser,
        channel: currentChannel,
        typing: !!isTyping2,
        ts: Date.now(),
      },
    });
    // Refresh local UI immediately is now handled inside updateMyPresence
  } catch (e) {
    console.error('Presence typing error:', e);
  }
}

function applyTypingBroadcast(payload) {
  if (!payload || isDemoMode) return;
  if (payload.channel && payload.channel !== currentChannel) return;
  const id = String(payload.user_id || '');
  if (!id) return;

  if (payload.typing) {
    typingBroadcastState[id] = {
      username: payload.username || memberDirectory[id] || 'Unknown',
      expiresAt: Date.now() + TYPING_BROADCAST_TTL_MS,
    };
  } else {
    delete typingBroadcastState[id];
  }
  updateTypingIndicator();
}

function updateTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (!el) return;
  if (isDemoMode) {
    el.innerHTML = '';
    return;
  }

  const selfId = authUser?.id ? String(authUser.id) : '';
  const now = Date.now();
  Object.keys(typingBroadcastState).forEach((id) => {
    if (typingBroadcastState[id].expiresAt <= now) {
      delete typingBroadcastState[id];
    }
  });

  let typingUsers = [];
  if (presenceChannel && typeof presenceChannel.presenceState === 'function') {
    try {
      const state = presenceChannel.presenceState() || {};
      const byUserId = new Map();

      Object.keys(state).forEach((key) => {
        const presences = state[key];
        if (!presences || !presences.length) return;

        presences.forEach((p) => {
          if (p.channel && p.channel !== currentChannel) return;
          if (!p.typing) return;

          const id = String(p.user_id || key);
          if (selfId && id === selfId) return;

          const name = p.username || memberDirectory[id] || 'Unknown';
          if (!byUserId.has(id)) byUserId.set(id, name);
        });
      });

      typingUsers = Array.from(byUserId.values()).filter(Boolean);
    } catch (_) {
      typingUsers = [];
    }
  }

  // Broadcast fallback for environments where presence sync is unreliable.
  if (!typingUsers.length) {
    typingUsers = Object.entries(typingBroadcastState)
      .filter(([id]) => !selfId || id !== selfId)
      .map(([_, data]) => data.username)
      .filter(Boolean);
  }

  // Fallback for cases where presence state is unavailable.
  if (!typingUsers.length) {
    typingUsers = Object.entries(members)
      .filter(([name, st]) => st === 'typing' && name !== currentUser)
      .map(([name]) => name);
  }

  if (typingUsers.length === 0) {
    el.innerHTML = '';
    return;
  }

  const names = typingUsers.join(', ');
  const verb = typingUsers.length === 1 ? 'печатает' : 'печатают';
  el.innerHTML = `<div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div><span><strong>${escHtml(
    names
  )}</strong> ${verb}...</span>`;
}

function showTyping(name) {
  const el = document.getElementById('typingIndicator');
  if (!el) return;
  el.innerHTML = `<div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div><span><strong>${escHtml(
    name
  )}</strong> печатает...</span>`;
}

function hideTyping() {
  const el = document.getElementById('typingIndicator');
  if (!el) return;
  el.innerHTML = '';
}

// ===================== MEMBERS =====================
function addMember(name, status) {
  members[name] = status;
  updateMemberList();
  updateOnlineCount();
}

function updateMemberList() {
  const online = document.getElementById('onlineMembers');
  const offline = document.getElementById('offlineMembers');
  if (!online || !offline) return;
  online.innerHTML = '';
  offline.innerHTML = '';

  const sorted = Object.entries(members).sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  sorted.forEach(([name, status]) => {
    const el = document.createElement('div');
    el.className = 'member-item';
    const color = getUserColor(name);
    const avatarUrl = userAvatars[name];
    const dotClass = status === 'typing' ? 'online typing' : status;
    const avatarStyle = avatarUrl
      ? `background-image:url('${escapeJsString(avatarUrl)}');`
      : `background:${color};`;
    const avatarContent = avatarUrl ? '' : name[0].toUpperCase();

    // Find userId for this member
    const userId = Object.entries(memberDirectory).find(([, n]) => n === name)?.[0] || '';
    const showDmBtn = userId && authUser && userId !== authUser.id;

    el.innerHTML = `
        <div class="member-avatar" style="${avatarStyle}">
          ${avatarContent}
          <div class="status ${dotClass}"></div>
        </div>
        <div class="member-info">
          <div class="mname">${escHtml(name)}</div>
          ${status === 'typing' ? '<div class="mstatus">Печатает...</div>' : ''}
          ${status === 'idle' ? '<div class="mstatus">Не активен</div>' : ''}
          ${status === 'dnd' ? '<div class="mstatus">Не беспокоить</div>' : ''}
        </div>
        ${showDmBtn ? `<button class="member-dm-btn" type="button" data-action="open-dm" data-dm-user-id="${escHtml(userId)}" data-dm-username="${escHtml(name)}" title="Написать"><span class="material-icons-round" style="font-size:16px;">chat</span></button>` : ''}
      `;
    (status === 'offline' ? offline : online).appendChild(el);
  });
}

function updateOnlineCount() {
  const el = document.getElementById('onlineCount');
  if (!el) return;

  if (!isDemoMode && presenceChannel) {
    try {
      const state = presenceChannel.presenceState() || {};
      const onlineUserIds = new Set();

      Object.keys(state).forEach((key) => {
        const presences = state[key];
        if (!presences || !presences.length) return;
        presences.forEach((p) => {
          // Presence глобальный — считаем всех подключённых пользователей.
          onlineUserIds.add(String(p.user_id || key));
        });
      });

      // Текущий пользователь должен учитываться всегда, даже если sync еще не пришел.
      if (authUser?.id) {
        onlineUserIds.add(String(authUser.id));
      }

      el.textContent = String(onlineUserIds.size);
      return;
    } catch (_) {
      // Fallback ниже на локальное состояние members.
    }
  }

  el.textContent = String(Object.values(members).filter((s) => s !== 'offline').length);
}

function toggleMemberList() {
  const ml = document.getElementById('memberList');
  if (!ml) return;
  if (isMobileLayout()) {
    ml.classList.toggle('mobile-open');
    document.getElementById('channelSidebar')?.classList.remove('mobile-open');
    document.getElementById('serversContainer')?.classList.remove('mobile-open');
    syncMobileBackdrop();
    return;
  }
  memberListVisible = !memberListVisible;
  ml.style.display = memberListVisible ? '' : 'none';
}

