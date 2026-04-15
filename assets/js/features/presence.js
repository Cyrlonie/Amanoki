// Presence / members / typing (classic script).
const typingBroadcastState = {};
const TYPING_BROADCAST_TTL_MS = 4500;

function applyPresenceFromChannel() {
  if (isDemoMode || !authUser) return;

  const byUserId = {};

  // Seed all known profiles as offline first.
  Object.entries(memberDirectory).forEach(([id, name]) => {
    byUserId[id] = { name, status: 'offline' };
  });

  // Overlay live presence for active users in the current channel.
  const state = presenceChannel ? presenceChannel.presenceState() : {};
  Object.keys(state).forEach((key) => {
    const presences = state[key];
    if (!presences || !presences.length) return;

    presences.forEach((p) => {
      if (p.channel !== currentChannel) return;

      const id = String(p.user_id || key);
      const name = p.username || memberDirectory[id] || byUserId[id]?.name || 'Unknown';
      const status = p.typing ? 'typing' : 'online';
      const prev = byUserId[id]?.status || 'offline';

      byUserId[id] = {
        name,
        status: statusRank[status] >= statusRank[prev] ? status : prev,
      };
    });
  });

  // Always mark the current user as online locally.
  const selfId = String(authUser.id);
  const selfName = memberDirectory[selfId] || currentUser || 'You';
  byUserId[selfId] = { name: selfName, status: 'online' };

  // Collapse to the UI-friendly map: username -> strongest status.
  members = {};
  Object.values(byUserId).forEach((entry) => {
    if (!entry?.name) return;
    const prev = members[entry.name] || 'offline';
    members[entry.name] = statusRank[entry.status] >= statusRank[prev] ? entry.status : prev;
  });

  updateMemberList();
  updateOnlineCount();
  updateTypingIndicator();
}

async function loadMembersDirectory() {
  if (isDemoMode || !supabase) return;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, is_banned, avatar_color, avatar_url');
    if (error) throw error;

    const previousNames = new Set(Object.values(memberDirectory));
    memberDirectory = {};

    (data || []).forEach((row) => {
      if (row.is_banned || !row.username) return;

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

    previousNames.forEach((name) => {
      delete userColors[name];
      delete userAvatars[name];
    });

    applyPresenceFromChannel();
  } catch (e) {
    console.error('\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0441\u043f\u0438\u0441\u043a\u0430 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439:', e);
  }
}

// ===================== TYPING =====================
function handleTyping() {
  if (!isTyping) {
    isTyping = true;
    publishTypingStatus(true);
  }

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    isTyping = false;
    publishTypingStatus(false);
  }, 3000);
}

async function publishTypingStatus(isTyping2) {
  if (isDemoMode || !supabase || !authUser || !presenceChannel) return;

  try {
    await presenceChannel.track({
      user_id: authUser.id,
      username: currentUser,
      channel: currentChannel,
      typing: !!isTyping2,
    });

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

    // Refresh local UI immediately; remote clients receive sync separately.
    applyPresenceFromChannel();
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

  const names = typingUsers.slice(0, 2).join(', ');
  const verb = typingUsers.length === 1 ? '\u043f\u0435\u0447\u0430\u0442\u0430\u0435\u0442' : '\u043f\u0435\u0447\u0430\u0442\u0430\u044e\u0442';
  el.innerHTML = `<div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div><span><strong>${escHtml(
    names
  )}</strong> ${verb}...</span>`;
}

function showTyping(name) {
  const el = document.getElementById('typingIndicator');
  if (!el) return;

  el.innerHTML = `<div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div><span><strong>${escHtml(
    name
  )}</strong> \u043f\u0435\u0447\u0430\u0442\u0430\u0435\u0442...</span>`;
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

    el.innerHTML = `
        <div class="member-avatar" style="${avatarStyle}">
          ${avatarContent}
          <div class="status ${dotClass}"></div>
        </div>
        <div class="member-info">
          <div class="member-name">${escHtml(name)}</div>
          ${status === 'typing' ? '<div class="mstatus">\u041f\u0435\u0447\u0430\u0442\u0430\u0435\u0442...</div>' : ''}
          ${status === 'idle' ? '<div class="mstatus">\u041d\u0435 \u0430\u043a\u0442\u0438\u0432\u0435\u043d</div>' : ''}
          ${status === 'dnd' ? '<div class="mstatus">\u041d\u0435 \u0431\u0435\u0441\u043f\u043e\u043a\u043e\u0438\u0442\u044c</div>' : ''}
        </div>
      `;

    (status === 'offline' ? offline : online).appendChild(el);
  });
}

function updateOnlineCount() {
  const el = document.getElementById('onlineCount');
  if (!el) return;

  const onlineStatuses = new Set(['online', 'typing', 'idle', 'dnd']);
  el.textContent = String(
    Object.values(members).filter((status) => onlineStatuses.has(status)).length
  );
}

function toggleMemberList() {
  const ml = document.getElementById('memberList');
  if (!ml) return;

  if (isMobileLayout()) {
    ml.classList.toggle('mobile-open');
    document.getElementById('channelSidebar')?.classList.remove('mobile-open');
    syncMobileBackdrop();
    return;
  }

  memberListVisible = !memberListVisible;
  ml.style.display = memberListVisible ? '' : 'none';
}
