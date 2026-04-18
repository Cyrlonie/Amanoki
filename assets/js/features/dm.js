// Direct Messages feature (classic script, no bundler).
// Uses existing `messages` table with channel = 'dm:<sorted_ids>'

let activeDMConversations = []; // [{userId, username, lastMessage, lastTime}]
let currentDMTarget = null; // {userId, username} when viewing a DM

function getDMChannelId(otherUserId) {
  if (!authUser) return null;
  const ids = [authUser.id, otherUserId].sort();
  return `dm:${ids[0]}_${ids[1]}`;
}

function isDMChannel(channel) {
  return channel && channel.startsWith('dm:');
}

function getOtherDMUserId(channel) {
  if (!isDMChannel(channel) || !authUser) return null;
  const ids = channel.replace('dm:', '').split('_');
  return ids.find(id => id !== authUser.id) || ids[0];
}

async function openDM(targetUserId, targetUsername) {
  if (!authUser || !supabase) return;
  if (targetUserId === authUser.id) {
    notify('Нельзя написать самому себе', 'error');
    return;
  }

  const channelId = getDMChannelId(targetUserId);
  if (!channelId) return;

  currentDMTarget = { userId: targetUserId, username: targetUsername };
  currentChannel = channelId;

  // Update header to show DM
  document.getElementById('channelTitle').textContent = targetUsername;
  document.getElementById('channelDesc').textContent = 'Личные сообщения';
  document.getElementById('message-input').placeholder = `Написать ${targetUsername}...`;

  // Clear active channel highlights
  document.querySelectorAll('.channel-item[data-channel]').forEach(el => {
    el.classList.remove('active');
  });
  // Highlight DM item
  document.querySelectorAll('.dm-item').forEach(el => {
    el.classList.toggle('active', el.dataset.dmUserId === targetUserId);
  });

  // Clear chat and show welcome
  const area = document.getElementById('messagesArea');
  area.innerHTML = `
    <div class="channel-welcome">
      <div class="welcome-icon">💬</div>
      <div class="welcome-title">${escHtml(targetUsername)}</div>
      <div class="welcome-desc">Начало переписки с ${escHtml(targetUsername)}</div>
    </div>
    <div class="divider-date">Сегодня</div>
  `;
  lastMessageAuthor = null;
  lastMessageTime = null;
  clearReactionStore();
  cancelReply();

  // Subscribe and load messages
  subscribeToMessages();

  if (isMobileLayout()) {
    closeMobilePanels();
  }

  // Add to conversations if not already there
  if (!activeDMConversations.find(c => c.userId === targetUserId)) {
    activeDMConversations.push({
      userId: targetUserId,
      username: targetUsername,
      lastMessage: '',
      lastTime: new Date().toISOString(),
    });
    renderDMList();
  }
}

async function loadDMConversations() {
  if (!supabase || !authUser) return;

  try {
    // Query distinct DM channels involving current user
    const { data, error } = await supabase
      .from('messages')
      .select('channel, content, created_at, author')
      .like('channel', `dm:%${authUser.id}%`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!data || !data.length) {
      activeDMConversations = [];
      renderDMList();
      return;
    }

    // Group by channel, get last message per channel
    const channelMap = {};
    data.forEach(msg => {
      if (!channelMap[msg.channel]) {
        channelMap[msg.channel] = msg;
      }
    });

    // Build conversation list
    const conversations = [];
    for (const [channel, lastMsg] of Object.entries(channelMap)) {
      const otherUserId = getOtherDMUserId(channel);
      if (!otherUserId) continue;
      const username = memberDirectory[otherUserId] || lastMsg.author || 'Пользователь';
      conversations.push({
        userId: otherUserId,
        username,
        lastMessage: lastMsg.content || '',
        lastTime: lastMsg.created_at,
      });
    }

    // Sort by last message time
    conversations.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
    activeDMConversations = conversations;
    renderDMList();
  } catch (e) {
    console.error('Error loading DM conversations:', e);
  }
}

function renderDMList() {
  const container = document.getElementById('dmList');
  if (!container) return;

  if (!activeDMConversations.length) {
    container.innerHTML = '<div class="dm-empty">Нет сообщений</div>';
    return;
  }

  container.innerHTML = activeDMConversations.map(conv => {
    const color = getUserColor(conv.username);
    const avatarUrl = userAvatars[conv.username];
    const avatarStyle = avatarUrl
      ? `background-image:url('${escapeJsString(avatarUrl)}')`
      : `background:${color}`;
    const avatarContent = avatarUrl ? '' : (conv.username[0] || '?').toUpperCase();
    const preview = conv.lastMessage.length > 30
      ? conv.lastMessage.substring(0, 30) + '...'
      : conv.lastMessage;
    const isActive = currentDMTarget?.userId === conv.userId;

    return `<div class="dm-item${isActive ? ' active' : ''}" data-action="open-dm" data-dm-user-id="${escHtml(conv.userId)}" data-dm-username="${escHtml(conv.username)}" role="button" tabindex="0">
      <div class="dm-avatar" style="${avatarStyle}">${avatarContent}</div>
      <div class="dm-info">
        <div class="dm-name">${escHtml(conv.username)}</div>
        ${preview ? `<div class="dm-preview">${escHtml(preview)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// Update DM conversation when a new message arrives in a DM channel
function updateDMConversation(channel, content, author) {
  if (!isDMChannel(channel)) return;
  const otherUserId = getOtherDMUserId(channel);
  if (!otherUserId) return;

  const existing = activeDMConversations.find(c => c.userId === otherUserId);
  if (existing) {
    existing.lastMessage = content;
    existing.lastTime = new Date().toISOString();
  } else {
    const username = memberDirectory[otherUserId] || author || 'Пользователь';
    activeDMConversations.unshift({
      userId: otherUserId,
      username,
      lastMessage: content,
      lastTime: new Date().toISOString(),
    });
  }

  // Re-sort
  activeDMConversations.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
  renderDMList();
}

function exitDMView() {
  currentDMTarget = null;
  // Switch back to general
  switchChannel('general');
}
