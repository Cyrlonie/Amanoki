// Presence / members / typing (classic script).

function applyPresenceFromChannel() {
  if (isDemoMode || !authUser) return;
  const byUserId = {};
  const statusRank = { offline: 0, online: 1, typing: 2 };

  // База списка участников: все профили как offline
  Object.entries(memberDirectory).forEach(([id, name]) => {
    byUserId[id] = { name, status: 'offline' };
  });

  // Накладываем presence-состояние для активных пользователей
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

  // Текущий пользователь всегда online
  const selfId = String(authUser.id);
  const selfName = memberDirectory[selfId] || currentUser || 'You';
  byUserId[selfId] = { name: selfName, status: 'online' };
  currentUser = selfName;

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
}

async function loadMembersDirectory() {
  if (isDemoMode || !supabase) return;
  try {
    const { data, error } = await supabase.from('profiles').select('id, username, is_banned');
    if (error) throw error;

    memberDirectory = {};
    (data || []).forEach((row) => {
      if (row.is_banned) return;
      if (!row.username) return;
      memberDirectory[row.id] = row.username;
    });
    applyPresenceFromChannel();
  } catch (e) {
    console.error('Ошибка загрузки списка пользователей:', e);
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
  } catch (e) {
    console.error('Presence typing error:', e);
  }
}

function updateTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (!el) return;
  if (isDemoMode) {
    el.innerHTML = '';
    return;
  }
  const typingUsers = Object.entries(members)
    .filter(([name, st]) => st === 'typing' && name !== currentUser)
    .map(([name]) => name);

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
    const dotClass = status === 'typing' ? 'online typing' : status;
    el.innerHTML = `
        <div class="member-avatar" style="background:${color}">
          ${name[0].toUpperCase()}
          <div class="status ${dotClass}"></div>
        </div>
        <div class="member-info">
          <div class="mname">${escHtml(name)}</div>
          ${status === 'typing' ? '<div class="mstatus">Печатает...</div>' : ''}
          ${status === 'idle' ? '<div class="mstatus">Не активен</div>' : ''}
          ${status === 'dnd' ? '<div class="mstatus">Не беспокоить</div>' : ''}
        </div>
      `;
    (status === 'offline' ? offline : online).appendChild(el);
  });
}

function updateOnlineCount() {
  const el = document.getElementById('onlineCount');
  if (!el) return;
  el.textContent = Object.values(members).filter((s) => s !== 'offline').length;
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

