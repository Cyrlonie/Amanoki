// Extracted from index.html inline script (no bundler).
// Kept as classic script for compatibility with inline handlers.

// State/config moved to assets/js/state.js + assets/js/config.js

// Initialize theme early to avoid flashing
(function() {
  const savedTheme = localStorage.getItem('amanoki_theme');
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

function isMobileLayout() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function syncMobileBackdrop() {
  const backdrop = document.getElementById('mobileBackdrop');
  const sidebar = document.getElementById('channelSidebar');
  const memberList = document.getElementById('memberList');
  if (!backdrop || !sidebar || !memberList) return;

  const needsBackdrop =
    sidebar.classList.contains('mobile-open') ||
    memberList.classList.contains('mobile-open');
  backdrop.classList.toggle('show', needsBackdrop);
}

function openImagePreview(src, alt = 'Изображение') {
  const lightbox = document.getElementById('imageLightbox');
  const preview = document.getElementById('imageLightboxPreview');
  if (!lightbox || !preview || !src) return;

  preview.src = src;
  preview.alt = alt || 'Изображение';
  lightbox.classList.add('show');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeImagePreview() {
  const lightbox = document.getElementById('imageLightbox');
  const preview = document.getElementById('imageLightboxPreview');
  if (!lightbox || !preview) return;

  lightbox.classList.remove('show');
  lightbox.setAttribute('aria-hidden', 'true');
  preview.src = '';
  document.body.style.overflow = '';
}

function openSearchPanel() {
  const panel = document.getElementById('searchPanel');
  if (!panel) return;
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  document.getElementById('searchInput').focus();
}

function closeSearchPanel() {
  const panel = document.getElementById('searchPanel');
  if (!panel) return;
  panel.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
}

let currentEditingMessageId = null;

function openEditMessagePanel(messageId) {
  const panel = document.getElementById('editMessagePanel');
  const input = document.getElementById('editMessageInput');
  if (!panel || !input) return;
  
  // Use original text from messageStore (preserves Markdown), fallback to DOM textContent
  const storedMessage = messageStore[messageId];
  if (storedMessage) {
    input.value = storedMessage.text;
  } else {
    const messageGroup = document.querySelector(`.message-group[data-id="${messageId}"]`);
    const textElement = messageGroup?.querySelector('.msg-text');
    if (!textElement) return;
    input.value = textElement.textContent;
  }
  currentEditingMessageId = messageId;
  
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  input.focus();
}

function closeEditMessagePanel() {
  const panel = document.getElementById('editMessagePanel');
  if (!panel) return;
  panel.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  document.getElementById('editMessageInput').value = '';
  currentEditingMessageId = null;
}

async function saveEditedMessage() {
  const input = document.getElementById('editMessageInput');
  const newText = input.value.trim();
  
  if (!newText || !currentEditingMessageId) return;
  
  if (typeof updateMessageInSupabase === 'function') {
    const success = await updateMessageInSupabase(currentEditingMessageId, newText);
    if (success) {
      closeEditMessagePanel();
      notify('Сообщение обновлено', 'success');
    } else {
      notify('Не удалось обновить сообщение', 'error');
    }
  } else {
    notify('Функция обновления не доступна', 'error');
  }
}

function toggleSidebar() {
  if (!isMobileLayout()) return;
  const sidebar = document.getElementById('channelSidebar');
  if (!sidebar) return;

  sidebar.classList.toggle('mobile-open');
  document.getElementById('memberList')?.classList.remove('mobile-open');
  syncMobileBackdrop();
}

function closeMobilePanels() {
  document.getElementById('channelSidebar')?.classList.remove('mobile-open');
  document.getElementById('memberList')?.classList.remove('mobile-open');
  syncMobileBackdrop();
}

window.addEventListener('resize', () => {
  if (!isMobileLayout()) {
    closeMobilePanels();
  }
});

function setupDomEventHandlers() {
  document.addEventListener('click', async (event) => {
    const targetEl = event.target instanceof Element ? event.target : null;
    if (!targetEl) return;
    const actionEl = targetEl.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    if (!action) return;

    if (actionEl.tagName === 'A') {
      event.preventDefault();
    }

    switch (action) {

      case 'switch-to-register':
        switchToRegister();
        break;
      case 'switch-to-login':
        switchToLogin();
        break;

      case 'notify':
        notify(actionEl.dataset.message || '');
        break;
      case 'open-profile':
        openProfilePanel();
        break;
      case 'close-profile':
        closeProfilePanel();
        break;
      case 'logout':
        await handleLogout();
        break;
      case 'toggle-sidebar':
        toggleSidebar();
        break;
      case 'switch-server':
        await switchServer(actionEl.dataset.serverId);
        break;
      case 'open-server-admin':
        openServerAdmin();
        break;
      case 'close-server-admin':
        closeServerAdmin();
        break;
      case 'toggle-members':
        toggleMemberList();
        break;
      case 'toggle-admin':
        toggleAdminPanel();
        break;
      case 'join-voice':
        await joinVoiceChannel(actionEl.dataset.voiceChannel);
        break;
      case 'leave-voice':
        await leaveVoiceChannel();
        break;
      case 'toggle-voice-mute':
        await toggleVoiceMute();
        break;
      case 'toggle-voice-deafen':
        await toggleVoiceDeafen();
        break;
      case 'toggle-screen-share':
        await toggleScreenShare();
        break;
      case 'reload-admin-users':
        await loadAdminUsers();
        break;
      case 'cancel-reply':
        cancelReply();
        break;
      case 'open-dm':
        await openDM(actionEl.dataset.dmUserId, actionEl.dataset.dmUsername);
        break;
      case 'open-file-dialog':
        document.getElementById('fileInput')?.click();
        break;
      case 'toggle-emoji-picker':
        toggleEmojiPicker();
        break;
      case 'send-message':
        await sendMessage();
        break;
      case 'close-mobile-panels':
        closeMobilePanels();
        break;
      case 'open-image-preview':
        openImagePreview(actionEl.getAttribute('src'), actionEl.getAttribute('alt'));
        break;
      case 'close-image-preview':
        closeImagePreview();
        break;
      case 'open-search':
        openSearchPanel();
        break;
      case 'close-search':
        closeSearchPanel();
        break;
      case 'open-pinned':
        if (typeof openPinnedPanel === 'function') openPinnedPanel();
        break;
      case 'close-pinned':
        if (typeof closePinnedPanel === 'function') closePinnedPanel();
        break;
      case 'unpin-message':
        if (typeof unpinMessage === 'function') unpinMessage(actionEl.dataset.messageId);
        break;
      case 'toggle-pin':
        if (typeof togglePinMessage === 'function') togglePinMessage(actionEl.dataset.messageId);
        break;
      case 'edit-message':
        openEditMessagePanel(actionEl.dataset.messageId);
        break;
      case 'close-edit-message':
        closeEditMessagePanel();
        break;
      case 'save-edit-message':
        saveEditedMessage();
        break;
      case 'toggle-reaction':
        await toggleReaction(actionEl.dataset.messageId, actionEl.dataset.emoji);
        break;
      case 'toggle-theme':
        const isLight = document.getElementById('themeToggle').checked;
        if (isLight) {
          document.documentElement.setAttribute('data-theme', 'light');
          localStorage.setItem('amanoki_theme', 'light');
        } else {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem('amanoki_theme', 'dark');
        }
        break;
      case 'open-reaction-picker':
        event.stopPropagation();
        await openReactionPicker(actionEl.dataset.messageId, actionEl, event);
        break;
      case 'pick-reaction':
        event.stopPropagation();
        await pickReaction(actionEl.dataset.messageId, actionEl.dataset.emoji, event);
        break;
      case 'start-reply':
        startReply(actionEl.dataset.messageId);
        break;
      case 'scroll-to-message':
        scrollToMessage(actionEl.dataset.messageId);
        break;
      case 'delete-message':
        await deleteMessage(actionEl.dataset.messageId);
        break;
      case 'ban-user':
        await banUser(actionEl.dataset.userId, actionEl.dataset.username);
        break;
      case 'unban-user':
        await unbanUser(actionEl.dataset.userId, actionEl.dataset.username);
        break;
      default:
        break;
    }
  });

  document.getElementById('serversContainer')?.addEventListener('contextmenu', async (event) => {
    const targetEl = event.target instanceof Element ? event.target : null;
    const serverEl = targetEl?.closest('[data-action="switch-server"]');
    if (!serverEl || !isAdmin) return;

    event.preventDefault();
    await switchServer(serverEl.dataset.serverId);
    openChannelAdmin('', 'Текстовые каналы');
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id === 'loginForm') {
      await handleLogin(event);
      return;
    }
    if (form.id === 'registerForm') {
      await handleRegister(event);
      return;
    }
    if (form.id === 'profileForm') {
      await saveProfileSettings(event);
    }
  });

  const fileInput = document.getElementById('fileInput');
  fileInput?.addEventListener('change', handleFileSelect);

  const messageInput = document.getElementById('message-input');
  messageInput?.addEventListener('keydown', (event) => {
    if (handleMentionKeydown(event)) return;
    handleKey(event);
  });
  messageInput?.addEventListener('input', (event) => {
    autoResize(event.target);
    handleTyping();
    handleMentionInput(event.target);
  });

  // Drag & Drop on chat area
  const chatArea = document.querySelector('.chat-area');
  if (chatArea) {
    let dragCounter = 0;
    chatArea.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      document.getElementById('dragDropOverlay')?.classList.add('show');
    });
    chatArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        document.getElementById('dragDropOverlay')?.classList.remove('show');
      }
    });
    chatArea.addEventListener('dragover', (e) => e.preventDefault());
    chatArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      document.getElementById('dragDropOverlay')?.classList.remove('show');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const fileInput = document.getElementById('fileInput');
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change'));
    });
  }

  const profileNameInput = document.getElementById('profileDisplayName');
  profileNameInput?.addEventListener('input', () => {
    if (typeof updateProfilePreview === 'function') {
      updateProfilePreview();
    }
  });

  const profileCard = document.querySelector('.profile-panel-card');
  profileCard?.addEventListener('click', (event) => {
    const targetEl = event.target instanceof Element ? event.target : null;
    if (targetEl?.closest('[data-action="close-profile"]')) return;
    event.stopPropagation();
  });

  document.getElementById('profileLogoutBtn')?.addEventListener('click', async () => {
    await handleLogout();
  });

  document.querySelectorAll('.channel-item[data-channel]').forEach((el) => {
    el.addEventListener('click', () => switchChannel(el.dataset.channel));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeImagePreview();
    }
  });

  // Direct click listener for image lightbox backdrop
  const imageLightboxBackdrop = document.querySelector('.image-lightbox-backdrop');
  imageLightboxBackdrop?.addEventListener('click', closeImagePreview);

  // Search input event listener
  const searchInput = document.getElementById('searchInput');
  searchInput?.addEventListener('input', handleSearch);
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSearchPanel();
    }
  });
}

setupDomEventHandlers();

// ===================== ADMIN PANEL =====================
function getUserColor(name) {
  if (!userColors[name]) {
    userColors[name] = COLORS[Object.keys(userColors).length % COLORS.length];
  }
  return userColors[name];
}

// initializeSupabaseClient is defined in assets/js/config.js

window.onload = async () => {
  try {
    await initializeSupabaseClient();

    // ПРОВЕРКА СЕССИИ (Запоминание авторизации)
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session && session.user) {
      authUser = session.user;
      const profileResult = await loadUserProfile();
      if (profileResult === false) return; // Забанен — не продолжаем
      await loadMembersDirectory();

      // Скрываем экран входа
      document.getElementById('authOverlay').style.display = 'none';

      initApp();
      await loadServers();
      if (typeof loadDMConversations === 'function') loadDMConversations();
    } else {
      // Если сессии нет, сразу показываем авторизацию
      showLoginPanel();
    }
  } catch (e) {
    console.error(e);
    showLoginPanel();
  }
};

// ===================== INIT APP =====================
function initApp() {
  if (typeof refreshSidebarUserChip === 'function') {
    refreshSidebarUserChip();
  } else {
    const initial = currentUser && currentUser[0] ? currentUser[0].toUpperCase() : '?';
    const color = getUserColor(currentUser);

    document.getElementById('myName').textContent = currentUser;
    document.getElementById('myAvatar').textContent = initial;
    document.getElementById('myAvatar').style.background = color;
    document.getElementById('myAvatar').innerHTML += '<div class="status-dot"></div>';
  }
  const initChObj = channelsList.find(c => c.slug === currentChannel);
  document.getElementById('message-input').placeholder = `Написать в #${initChObj ? initChObj.name : currentChannel}`;

  if (!userColors[currentUser]) {
    userColors[currentUser] = getUserColor(currentUser);
  }
  if (isDemoMode) {
    addMember(currentUser, 'online');
  } else {
    members = {};
    updateMemberList();
    updateOnlineCount();
  }

  // Показать кнопку админ панели если администратор
  if (isAdmin) {
    document.getElementById('adminBtn').style.display = '';
  }

  // Отслеживание фокуса окна браузера (guard against duplicate handlers)
  if (!window._amanokiFocusHandlersSet) {
    window._amanokiFocusHandlersSet = true;
    window.addEventListener('focus', () => {
      windowHasFocus = true;
    });
    window.addEventListener('blur', () => {
      windowHasFocus = false;
    });
  }

  // Горячая клавиша Ctrl+Shift+A для открытия админ панели (guard against duplicate)
  if (!window._amanokiAdminKeySet) {
    window._amanokiAdminKeySet = true;
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        toggleAdminPanel();
      }
    });
  }

  if (typeof updateChannelUnreadUI === 'function') {
    updateChannelUnreadUI();
  }
}

// ===================== ADMIN FUNCTIONS =====================
async function deleteMessage(messageId) {
  if (!supabase) return;

  // Получить сообщение, чтобы проверить автора
  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select('user_id')
    .eq('id', messageId)
    .single();

  if (fetchError || !message) {
    notify('❌ Ошибка: сообщение не найдено', 'error');
    return;
  }

  const isAuthor = message.user_id === authUser?.id;
  if (!isAdmin && !isAuthor) {
    notify('❌ Нет прав на удаление этого сообщения', 'error');
    return;
  }

  if (!confirm('🗑️ Удалить это сообщение?')) return;

  try {
    const { error } = await supabase.from('messages').delete().eq('id', messageId);

    if (error) throw error;

    notify('✅ Сообщение удалено', 'success');
    const msgGroup = document.querySelector(`[data-id="${messageId}"]`);
    if (msgGroup) msgGroup.style.opacity = '0.5';
    setTimeout(() => {
      if (msgGroup) msgGroup.remove();
    }, 300);
  } catch (e) {
    notify('❌ Ошибка удаления: ' + e.message, 'error');
  }
}

async function banUser(userId, username) {
  if (!isAdmin || !supabase) return;
  if (!confirm(`🚫 Забанить пользователя ${username}?`)) return;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_banned: true })
      .eq('id', userId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      notify('❌ Не удалось забанить — проверьте RLS-политики в Supabase (нужно разрешить админам UPDATE на profiles)', 'error');
      return;
    }

    notify(`✅ Пользователь ${username} заблокирован`, 'success');
    await loadAdminUsers();
    await loadMembersDirectory();
  } catch (e) {
    notify('❌ Ошибка бана: ' + e.message, 'error');
  }
}

async function unbanUser(userId, username) {
  if (!isAdmin || !supabase) return;
  if (!confirm(`✅ Разбанить пользователя ${username}?`)) return;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_banned: false })
      .eq('id', userId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      notify('❌ Не удалось разбанить — проверьте RLS-политики в Supabase', 'error');
      return;
    }

    notify(`✅ Пользователь ${username} разблокирован`, 'success');
    await loadAdminUsers();
    await loadMembersDirectory();
  } catch (e) {
    notify('❌ Ошибка разбана: ' + e.message, 'error');
  }
}

function toggleAdminPanel() {
  if (!isAdmin) {
    notify('❌ Только администратор может открыть админ панель', 'error');
    return;
  }
  closeMobilePanels();
  const panel = document.getElementById('adminPanel');
  panel.classList.toggle('show');
  if (panel.classList.contains('show')) {
    loadAdminUsers();
    updateAdminStats();
  }
}

async function loadAdminUsers() {
  if (!isAdmin || !supabase) return;

  try {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, username, email, is_banned, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const list = document.getElementById('adminUsersList');
    list.innerHTML = '';

    users.forEach((user) => {
      const item = document.createElement('div');
      item.className = 'admin-item';
      item.innerHTML = `
          <div>
            <div class="admin-item-name">${escHtml(user.username)}</div>
            <div class="admin-item-status">${escHtml(user.email || '')} • ${
              user.is_banned ? '🚫 Забанен' : '✅ Активен'
            }</div>
          </div>
          <div class="admin-actions">
            ${
              user.is_banned
                ? `<button class="admin-btn admin-btn-unban" type="button" data-action="unban-user" data-user-id="${user.id}" data-username="${escHtml(
                    user.username
                  )}">Разбан</button>`
                : `<button class="admin-btn admin-btn-ban" type="button" data-action="ban-user" data-user-id="${user.id}" data-username="${escHtml(
                    user.username
                  )}">Бан</button>`
            }
          </div>
        `;
      list.appendChild(item);
    });

    document.getElementById('adminUserCount').textContent = users.length;
  } catch (e) {
    console.error('Error loading admin users:', e);
    notify('❌ Ошибка загрузки пользователей', 'error');
  }
}

async function updateAdminStats() {
  if (!isAdmin || !supabase) return;

  try {
    const { count: userCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const { count: messageCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    document.getElementById('adminUserCount').textContent = userCount;
    document.getElementById('adminMessageCount').textContent = messageCount;
  } catch (e) {
    console.error('Error updating admin stats:', e);
  }
}
let notificationAudioContext = null;

function getNotificationAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!notificationAudioContext) {
    notificationAudioContext = new Ctor();
  }
  if (notificationAudioContext.state === 'suspended') {
    notificationAudioContext.resume().catch(() => {});
  }
  return notificationAudioContext;
}

/** Мягкое входящее: короткий «колокольчик» без резких атак и высоких пиков. */
function createNotificationSound() {
  try {
    const ctx = getNotificationAudioContext();
    if (!ctx) return;

    const t0 = ctx.currentTime;
    const duration = 0.26;
    const peak = 0.085;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(peak, t0 + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0009, t0 + duration);
    master.connect(ctx.destination);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(2200, t0);
    lowpass.Q.value = 0.6;
    lowpass.connect(master);

    const partials = [
      { hz: 523.25, level: 0.55 },
      { hz: 659.25, level: 0.32 },
      { hz: 783.99, level: 0.12 },
    ];

    partials.forEach((p, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const g = ctx.createGain();
      g.gain.value = p.level;
      osc.connect(g);
      g.connect(lowpass);
      const start = t0 + i * 0.012;
      osc.frequency.setValueAtTime(p.hz * 0.985, start);
      osc.frequency.exponentialRampToValueAtTime(p.hz, start + 0.06);
      osc.start(start);
      osc.stop(t0 + duration + 0.04);
    });
  } catch (e) {
    console.warn('Sound notification not available:', e);
  }
}

function playNotificationSound() {
  if (!windowHasFocus) {
    createNotificationSound();
  }
}

// ===================== UTILS =====================
function scrollToBottom() {
  const area = document.getElementById('messagesArea');
  setTimeout(() => (area.scrollTop = area.scrollHeight), 50);
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.4) + 'px';
}

function formatTime(date) {
  return date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function formatDateDivider(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - msgDay) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  return date.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJsString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

document.addEventListener('click', (event) => {
  const picker = document.getElementById('reactionPicker');
  if (!picker || !picker.classList.contains('show')) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (picker.contains(target)) return;
  if (target.closest('[data-action="open-reaction-picker"]')) return;
  closeReactionPicker();
});

window.addEventListener('resize', closeReactionPicker);

// ===================== EMOJI PICKER =====================
const EMOJI_DATA = [
  { id:'frequent', icon:'🕑', label:'Часто используемые', emojis:[] },
  { id:'smileys', icon:'😀', label:'Смайлы', emojis:'😀😃😄😁😆😅🤣😂🙂😉😊😇🥰😍🤩😘😗😚😙😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬😌😔😪😴😷🤒🤕🤢🤮🥵🥶🥴😵🤯🤠🥳😎🤓🧐😕😟🙁😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀💩🤡👻👽👾🤖'.match(/./gu) },
  { id:'gestures', icon:'👋', label:'Жесты', emojis:'👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏✍️💅🤳💪🦾👀👁️👅👄🫶'.match(/./gu) },
  { id:'hearts', icon:'❤️', label:'Сердечки', emojis:'❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟♥️'.match(/./gu) },
  { id:'nature', icon:'🌿', label:'Природа', emojis:'🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐔🐧🐦🦆🦅🦉🐺🐴🦄🐝🦋🐌🐞🌸🌺🌻🌹🌷🌱🌲🌳🌴🍀🍁🍂🍃🌿💐🌈☀️⭐🌟💫✨🌙'.match(/./gu) },
  { id:'food', icon:'🍕', label:'Еда', emojis:'🍏🍎🍐🍊🍋🍌🍉🍇🍓🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥒🌶️🌽🥕🥔🍞🧀🥚🍳🥓🥩🍗🍖🌭🍔🍟🍕🥪🌮🌯🍝🍜🍲🍛🍣🍱🍤🍙🍚🍘🍥🍡🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪☕🍵🥤🍺🍻🥂🍷'.match(/./gu) },
  { id:'objects', icon:'💡', label:'Объекты', emojis:'⌚📱💻⌨️🖥️🖨️🕹️💾📷📹🎥📞📺📻🎙️⏰💡🔦🔧🔨🛠️⚙️🔬🔭💉💊🚪🛏️🚽🧹🧼🛒🔑🗝️🔒🔓'.match(/./gu) },
  { id:'symbols', icon:'🔣', label:'Символы', emojis:'⭐🌟💫✨⚡🔥💥🎵🎶💤💬💭🕳️❤️‍🔥♻️⚜️🔱⭕✅☑️✔️❌❎➕➖✖️💲™️©️®️‼️⁉️❓❗⚠️🚩🏳️🏴🇷🇺'.match(/./gu) },
];

const FREQUENT_EMOJI_KEY = 'amanoki_freq_emoji';

function getFrequentEmojis() {
  try { return JSON.parse(localStorage.getItem(FREQUENT_EMOJI_KEY) || '[]'); } catch(_) { return []; }
}
function addFrequentEmoji(emoji) {
  let freq = getFrequentEmojis().filter(e => e !== emoji);
  freq.unshift(emoji);
  freq = freq.slice(0, 24);
  localStorage.setItem(FREQUENT_EMOJI_KEY, JSON.stringify(freq));
  EMOJI_DATA[0].emojis = freq;
}

function buildEmojiPickerContent() {
  const panel = document.getElementById('emojiPickerPanel');
  if (!panel) return;
  EMOJI_DATA[0].emojis = getFrequentEmojis();

  const tabs = EMOJI_DATA.filter(c => c.emojis && c.emojis.length > 0)
    .map(c => `<button class="emoji-tab" type="button" data-cat="${c.id}">${c.icon}</button>`).join('');

  const body = EMOJI_DATA.filter(c => c.emojis && c.emojis.length > 0)
    .map(c => `<div class="emoji-category-label" data-cat-label="${c.id}">${c.label}</div>
      <div class="emoji-grid">${c.emojis.map(e => `<button class="emoji-btn" type="button" data-emoji="${e}">${e}</button>`).join('')}</div>`).join('');

  panel.innerHTML = `<div class="emoji-picker-search"><input type="text" placeholder="Поиск эмодзи..." id="emojiSearchInput"></div>
    <div class="emoji-picker-tabs">${tabs}</div>
    <div class="emoji-picker-body">${body}</div>`;

  panel.querySelector('.emoji-picker-body')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-emoji]');
    if (!btn) return;
    const emoji = btn.dataset.emoji;
    const input = document.getElementById('message-input');
    if (input) { input.value += emoji; input.focus(); }
    addFrequentEmoji(emoji);
    closeEmojiPicker();
  });

  panel.querySelectorAll('.emoji-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const label = panel.querySelector(`[data-cat-label="${tab.dataset.cat}"]`);
      if (label) label.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  const searchInput = document.getElementById('emojiSearchInput');
  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    panel.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.style.display = !q || btn.dataset.emoji.includes(q) ? '' : 'none';
    });
  });
}

let emojiPickerBuilt = false;
function toggleEmojiPicker() {
  const panel = document.getElementById('emojiPickerPanel');
  if (!panel) return;
  if (panel.classList.contains('show')) { closeEmojiPicker(); return; }
  if (!emojiPickerBuilt) { buildEmojiPickerContent(); emojiPickerBuilt = true; }
  else { EMOJI_DATA[0].emojis = getFrequentEmojis(); }
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('emojiSearchInput')?.focus();
}
function closeEmojiPicker() {
  const panel = document.getElementById('emojiPickerPanel');
  if (!panel) return;
  panel.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
}
document.addEventListener('click', (e) => {
  const panel = document.getElementById('emojiPickerPanel');
  if (!panel || !panel.classList.contains('show')) return;
  const t = e.target instanceof Element ? e.target : null;
  if (!t) return;
  if (panel.contains(t) || t.closest('#emojiPickerBtn')) return;
  closeEmojiPicker();
});

// ===================== @MENTIONS =====================
let mentionActive = false;
let mentionQuery = '';
let mentionStartPos = -1;
let mentionSelectedIdx = 0;

function getMentionCandidates(query) {
  const names = Object.values(memberDirectory);
  if (!query) return names.slice(0, 8);
  const q = query.toLowerCase();
  return names.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
}

function handleMentionInput(textarea) {
  const val = textarea.value;
  const cursor = textarea.selectionStart;
  const before = val.substring(0, cursor);
  const match = before.match(/@(\S*)$/);

  if (match) {
    mentionActive = true;
    mentionQuery = match[1];
    mentionStartPos = cursor - match[0].length;
    mentionSelectedIdx = 0;
    renderMentionAutocomplete();
  } else {
    closeMentionAutocomplete();
  }
}

function renderMentionAutocomplete() {
  const ac = document.getElementById('mentionAutocomplete');
  if (!ac) return;
  const candidates = getMentionCandidates(mentionQuery);
  if (!candidates.length) { closeMentionAutocomplete(); return; }

  ac.innerHTML = candidates.map((name, i) => {
    const color = getUserColor(name);
    const avatarUrl = userAvatars[name];
    const style = avatarUrl ? `background-image:url('${escapeJsString(avatarUrl)}')` : `background:${color}`;
    const content = avatarUrl ? '' : name[0].toUpperCase();
    return `<div class="mention-item${i === mentionSelectedIdx ? ' active' : ''}" data-mention-name="${escHtml(name)}">
      <div class="mention-item-avatar" style="${style}">${content}</div>
      <div class="mention-item-name">${escHtml(name)}</div>
    </div>`;
  }).join('');
  ac.classList.add('show');

  ac.querySelectorAll('.mention-item').forEach(item => {
    item.addEventListener('click', () => applyMention(item.dataset.mentionName));
  });
}

function applyMention(name) {
  const input = document.getElementById('message-input');
  if (!input) return;
  const val = input.value;
  const after = val.substring(input.selectionStart);
  input.value = val.substring(0, mentionStartPos) + '@' + name + ' ' + after;
  const newPos = mentionStartPos + name.length + 2;
  input.setSelectionRange(newPos, newPos);
  input.focus();
  closeMentionAutocomplete();
}

function handleMentionKeydown(e) {
  if (!mentionActive) return false;
  const candidates = getMentionCandidates(mentionQuery);
  if (!candidates.length) return false;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    mentionSelectedIdx = (mentionSelectedIdx + 1) % candidates.length;
    renderMentionAutocomplete();
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    mentionSelectedIdx = (mentionSelectedIdx - 1 + candidates.length) % candidates.length;
    renderMentionAutocomplete();
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    applyMention(candidates[mentionSelectedIdx]);
    return true;
  }
  if (e.key === 'Escape') {
    closeMentionAutocomplete();
    return true;
  }
  return false;
}

function closeMentionAutocomplete() {
  mentionActive = false;
  mentionQuery = '';
  mentionStartPos = -1;
  const ac = document.getElementById('mentionAutocomplete');
  if (ac) { ac.classList.remove('show'); ac.innerHTML = ''; }
}

let notifTimeout;
function notify(msg, type = 'info') {
  let n = document.querySelector('.notification');
  if (n) n.remove();
  clearTimeout(notifTimeout);
  n = document.createElement('div');
  n.className = 'notification';
  n.innerHTML = `<span>${type === 'error' ? '❌' : 'ℹ️'}</span> ${escHtml(msg)}`;
  document.body.appendChild(n);
  notifTimeout = setTimeout(() => n.remove(), 3000);
}

// ===================== SERVER MANAGEMENT =====================
async function loadServers() {
  if (isDemoMode || !supabase || !authUser) return;

  try {
    const { data, error } = await supabase
      .from('servers')
      .select(`
        id,
        name,
        icon_url,
        server_members!inner (user_id)
      `)
      .eq('server_members.user_id', authUser.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    
    serversList = data || [];
    renderServers();

    if (serversList.length > 0) {
      if (!currentServerId || !serversList.find(s => s.id === currentServerId)) {
        currentServerId = serversList[0].id;
      }
      await loadChannels();
      subscribeToMessages();
    } else {
      currentServerId = null;
      document.getElementById('channelsContainer').innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:13px;text-align:center;">У вас нет серверов.<br>Создайте новый!</div>';
      document.getElementById('serverName').textContent = 'Amanoki';
    }
  } catch (err) {
    console.error('Ошибка загрузки серверов:', err);
    notify('Не удалось загрузить сервера', 'error');
  }
}

function renderServers() {
  const container = document.getElementById('serversContainer');
  if (!container) return;

  let html = `
    <div class="server-icon home" title="Личные сообщения" data-action="open-dm-home" role="button" tabindex="0">
      <span class="material-icons-round">chat</span>
    </div>
    <div class="server-divider"></div>
  `;

  serversList.forEach(server => {
    const isActive = server.id === currentServerId ? ' active' : '';
    const initial = server.name.charAt(0).toUpperCase();
    
    // For now, generate a deterministic color based on server name
    let hash = 0;
    for (let i = 0; i < server.name.length; i++) hash = server.name.charCodeAt(i) + ((hash << 5) - hash);
    const color = COLORS[Math.abs(hash) % COLORS.length];

    html += `
      <div class="server-icon${isActive}" style="background: ${color};" title="${escHtml(server.name)}" data-action="switch-server" data-server-id="${server.id}" role="button" tabindex="0">
        ${initial}
      </div>
    `;
  });

  html += `
    <div style="margin-top:auto;">
      <div class="server-icon" style="background:var(--bg-secondary);" title="Добавить сервер" data-action="open-server-admin" role="button" tabindex="0" aria-label="Добавить сервер">
        <span class="material-icons-round">add</span>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Update Server Name in sidebar
  const currentServer = serversList.find(s => s.id === currentServerId);
  const serverNameEl = document.getElementById('serverName');
  if (serverNameEl) {
    serverNameEl.textContent = currentServer ? currentServer.name : 'Amanoki';
  }
}

async function switchServer(serverId) {
  if (currentServerId === serverId) return;
  currentServerId = serverId;
  
  // Clear channel state
  currentChannel = null;
  channelsList = [];
  TEXT_CHANNELS = [];
  CHANNEL_DESCS = {};
  
  renderServers();
  await loadChannels();
}

function openServerAdmin() {
  const modal = document.getElementById('serverAdminModal');
  if (modal) modal.classList.add('show');
}

function closeServerAdmin() {
  const modal = document.getElementById('serverAdminModal');
  if (modal) {
    modal.classList.remove('show');
    document.getElementById('serverAdminForm').reset();
  }
}

document.getElementById('serverAdminForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!supabase || !authUser) return;

  const name = document.getElementById('serverAdminName').value.trim();
  if (!name) return;

  try {
    const serverId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    // 1. Create server
    const { error: serverError } = await supabase
      .from('servers')
      .insert([{ id: serverId, name: name, owner_id: authUser.id }]);

    if (serverError) throw serverError;

    // 2. Add creator as owner member
    const { error: memberError } = await supabase
      .from('server_members')
      .insert([{ server_id: serverId, user_id: authUser.id, role: 'owner' }]);

    if (memberError) throw memberError;

    // 3. Create default general channel
    await supabase.from('channels').insert([{
      slug: 'general',
      name: 'general',
      type: 'text',
      category: 'Текстовые каналы',
      description: 'Общий чат сервера',
      server_id: serverId
    }]);

    notify('Сервер успешно создан!', 'success');
    closeServerAdmin();
    
    await loadServers();
    switchServer(serverId);

  } catch (err) {
    notify('Ошибка создания сервера: ' + err.message, 'error');
  }
});


// ===================== CHANNEL MANAGEMENT =====================
async function loadChannels() {
  if (isDemoMode) {
    channelsList = [
      { slug: 'general', name: 'general', type: 'text', category: 'Текстовые каналы' },
      { slug: 'random', name: 'random', type: 'text', category: 'Текстовые каналы' },
      { slug: 'general-voice', name: 'General Voice', type: 'voice', category: 'Голосовые каналы' },
    ];
    TEXT_CHANNELS = channelsList.filter(c => c.type === 'text').map(c => c.slug);
    renderSidebarChannels();
    return;
  }

  if (!supabase || !currentServerId) return;

  try {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('server_id', currentServerId)
      .order('order_index', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    
    channelsList = data || [];
    TEXT_CHANNELS = channelsList.filter(c => c.type === 'text').map(c => c.slug);
    channelsList.forEach(c => CHANNEL_DESCS[c.slug] = c.description);
    
    // Auto-select first text channel if none selected
    if (!currentChannel && TEXT_CHANNELS.length > 0) {
      currentChannel = TEXT_CHANNELS[0];
    }
    
    renderSidebarChannels();

    if (currentChannel && TEXT_CHANNELS.includes(currentChannel)) {
      switchChannel(currentChannel);
    } else {
      document.getElementById('messagesArea').innerHTML = `
        <div class="channel-welcome">
          <div class="welcome-icon"><span class="material-icons-round">forum</span></div>
          <div class="welcome-title">Нет каналов</div>
          <div class="welcome-desc">Создайте канал для этого сервера.</div>
        </div>
      `;
    }

    if (typeof updateChannelUnreadUI === 'function') {
      updateChannelUnreadUI();
    }
    if (typeof refreshUnreadCountsFromServer === 'function') {
      refreshUnreadCountsFromServer();
    }
  } catch (err) {
    console.error('Ошибка загрузки каналов:', err);
  }
}

function renderSidebarChannels() {
  const container = document.getElementById('channelsContainer');
  if (!container) return;

  console.log('Rendering sidebar, isAdmin:', isAdmin);

  // Группировка по категориями
  const categories = {};
  channelsList.forEach(ch => {
    const cat = ch.category || 'Без категории';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(ch);
  });

  let html = '';
  Object.keys(categories).forEach(cat => {
    html += `
      <div class="channel-section">
        <div class="channel-section-title">
          <span>${escHtml(cat)}</span>
          ${isAdmin ? `<span class="add-btn" data-action="open-channel-admin" data-category="${escHtml(cat)}">+</span>` : ''}
        </div>
    `;

    categories[cat].forEach(ch => {
      const isVoice = ch.type === 'voice';
      const icon = isVoice ? 'volume_up' : 'tag'; // using # for text, but material icon tag is also good. We use # text for general
      const iconHtml = isVoice ? `<span class="material-icons-round">${icon}</span>` : '#';
      const activeClass = (ch.slug === currentChannel && !isVoice) ? ' active' : '';
      const voiceClass = isVoice ? ' voice-channel-item' : '';
      const action = isVoice ? `data-action="join-voice" data-voice-channel="${ch.slug}"` : `data-action="switch-channel" data-channel="${ch.slug}"`;
      
      const adminEditBtn = isAdmin ? `<button class="ch-edit-btn" data-action="open-channel-admin" data-slug="${ch.slug}">✏️</button>` : '';

      html += `
        <div class="channel-item${activeClass}${voiceClass}" ${action} role="button" tabindex="0">
          <span class="ch-icon">${iconHtml}</span>
          <span class="ch-name">${escHtml(ch.name)}</span>
          ${adminEditBtn}
        </div>
      `;
      
      if (isVoice) {
        html += `<div class="voice-channel-users" id="voiceUsers-${ch.slug}"></div>`;
      }
    });

    html += `</div>`;
  });

  container.innerHTML = html;
  
  // Добавляем обработчики кликов
  container.querySelectorAll('[data-action="switch-channel"]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.ch-edit-btn')) return;
      switchChannel(el.dataset.channel);
    });
  });
  
  // Обновляем текущее название и описание
  const currentChObj = channelsList.find(c => c.slug === currentChannel);
  if (currentChObj) {
    document.getElementById('channelTitle').textContent = currentChObj.name;
    document.getElementById('channelDesc').textContent = currentChObj.description || '';
  }
}

function openChannelAdmin(slug, category) {
  if (!isAdmin) return;
  const modal = document.getElementById('channelAdminModal');
  const form = document.getElementById('channelAdminForm');
  const slugInput = document.getElementById('channelAdminSlug');
  const nameInput = document.getElementById('channelAdminName');
  const catInput = document.getElementById('channelAdminCategory');
  const typeInput = document.getElementById('channelAdminType');
  const descInput = document.getElementById('channelAdminDesc');
  const deleteBtn = document.getElementById('channelAdminDeleteBtn');
  const title = document.getElementById('channelAdminTitle');

  if (slug) {
    const ch = channelsList.find(c => c.slug === slug);
    if (ch) {
      title.textContent = 'Редактировать канал';
      slugInput.value = ch.slug;
      nameInput.value = ch.name;
      catInput.value = ch.category;
      typeInput.value = ch.type;
      descInput.value = ch.description || '';
      deleteBtn.style.display = 'block';
    }
  } else {
    title.textContent = 'Создать канал';
    form.reset();
    slugInput.value = '';
    catInput.value = category || 'Текстовые каналы';
    typeInput.value = 'text';
    deleteBtn.style.display = 'none';
  }

  modal.classList.add('show');
}

function closeChannelAdmin() {
  document.getElementById('channelAdminModal').classList.remove('show');
}

document.getElementById('channelAdminForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isAdmin || !supabase) return;

  const slugInput = document.getElementById('channelAdminSlug').value;
  const name = document.getElementById('channelAdminName').value.trim();
  const category = document.getElementById('channelAdminCategory').value.trim();
  const type = document.getElementById('channelAdminType').value;
  const description = document.getElementById('channelAdminDesc').value.trim();
  
  const slugBase = slugInput || name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  let slug = slugBase;

  try {
    let error;
    if (slugInput) {
      const payload = { name, category, type, description };
      ({ error } = await supabase.from('channels').update(payload).eq('slug', slugInput).eq('server_id', currentServerId));
    } else {
      // Generate unique slug for new channel
      let counter = 1;
      while (channelsList.some(c => c.slug === slug)) {
        slug = `${slugBase}-${counter++}`;
      }
      const payload = { slug, name, category, type, description, server_id: currentServerId };
      ({ error } = await supabase.from('channels').insert([payload]));
    }
    if (error) {
      if (error.code === '23505') {
        throw new Error('Канал с таким идентификатором уже существует');
      }
      throw error;
    }
    notify('Канал сохранен', 'success');
    closeChannelAdmin();
    loadChannels();
  } catch (err) {
    notify('Ошибка сохранения: ' + err.message, 'error');
  }
});

document.addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'open-channel-admin') {
    openChannelAdmin(target.dataset.slug, target.dataset.category);
  } else if (action === 'close-channel-admin') {
    closeChannelAdmin();
  } else if (action === 'delete-channel') {
    const slug = document.getElementById('channelAdminSlug').value;
    if (!slug || !confirm('Удалить этот канал навсегда?')) return;
    try {
      const { error } = await supabase.from('channels').delete().eq('slug', slug).eq('server_id', currentServerId);
      if (error) throw error;
      notify('Канал удален', 'success');
      closeChannelAdmin();
      loadChannels();
    } catch (err) {
      notify('Ошибка удаления: ' + err.message, 'error');
    }
  }
});
// ===================== MEDIA PICKER (GIFs / Stickers) =====================
let currentMediaType = 'gif';
let mediaSearchTimeout = null;

async function fetchMedia(query = '') {
  const container = document.querySelector('.media-grid');
  if (container) {
    container.innerHTML = '<div class="search-no-results">Загрузка...</div>';
  }

  try {
    const url = new URL('/api/giphy', window.location.origin);
    if (query) url.searchParams.set('q', query);
    url.searchParams.set('type', currentMediaType);

    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) throw new Error(data.error);
    renderMediaResults(data.results || []);
  } catch (err) {
    console.error('Media fetch error:', err);
    if (container) {
      container.innerHTML = `<div class="search-no-results">Ошибка: ${err.message === 'Giphy API key not configured' ? 'API ключ Giphy не настроен' : 'Не удалось загрузить'}</div>`;
    }
  }
}

function renderMediaResults(results) {
  const container = document.querySelector('.media-grid');
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = '<div class="search-no-results">Ничего не найдено</div>';
    return;
  }

  container.innerHTML = results.map(item => 
    `<img src="${item.preview}" class="media-item" data-media-url="${item.url}" alt="${escHtml(item.title)}" loading="lazy">`
  ).join('');

  container.querySelectorAll('.media-item').forEach(img => {
    img.addEventListener('click', async (e) => {
      const url = e.target.dataset.mediaUrl;
      if (url) {
        await sendMediaMessage(url);
        closeMediaPicker();
      }
    });
  });
}

function buildMediaPickerContent() {
  const panel = document.getElementById('mediaPickerPanel');
  if (!panel) return;
  
  const html = `
    <div class="emoji-picker-search media-picker-search">
      <input type="text" placeholder="Поиск ${currentMediaType === 'gif' ? 'GIF' : 'Стикеров'}..." id="mediaSearchInput">
    </div>
    <div class="emoji-picker-body">
      <div class="media-grid">
        <div class="search-no-results">Загрузка...</div>
      </div>
    </div>
  `;
  
  panel.innerHTML = html;

  const searchInput = document.getElementById('mediaSearchInput');
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(mediaSearchTimeout);
    const q = e.target.value.trim();
    mediaSearchTimeout = setTimeout(() => fetchMedia(q), 500);
  });

  // Initial fetch
  fetchMedia();
}

async function sendMediaMessage(url) {
  if (isDemoMode) {
    renderMessage({
      id: String(Date.now()),
      author: currentUser,
      text: '',
      created: new Date().toISOString(),
      user_id: 'demo-user',
      image_url: url
    });
    return;
  }
  
  if (!supabase || !authUser) return;
  
  try {
    const { error } = await supabase.from('messages').insert([{
      channel: getScopedChannelKey(),
      content: '',
      image_url: url,
      author: currentUser,
      user_id: authUser.id
    }]);
    if (error) throw error;
  } catch (err) {
    notify('Ошибка отправки: ' + err.message, 'error');
  }
}

function toggleMediaPicker(type, anchorEl) {
  const panel = document.getElementById('mediaPickerPanel');
  if (!panel) return;
  
  if (panel.classList.contains('show') && currentMediaType === type) {
    closeMediaPicker();
    return;
  }
  
  currentMediaType = type || 'gif';
  buildMediaPickerContent();
  
  const rect = anchorEl.getBoundingClientRect();
  let left = rect.left - 320 + rect.width;
  if (left < 10) left = 10;
  
  panel.style.left = left + 'px';
  panel.style.top = (rect.top - 410) + 'px'; // 400 height + gap
  
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  
  document.getElementById('emojiPickerPanel')?.classList.remove('show');
  document.getElementById('reactionPicker')?.classList.remove('show');
}

function closeMediaPicker() {
  const panel = document.getElementById('mediaPickerPanel');
  if (panel) {
    panel.classList.remove('show');
    panel.setAttribute('aria-hidden', 'true');
  }
}

// Global click to close media picker
document.addEventListener('click', (event) => {
  const target = event.target;
  const panel = document.getElementById('mediaPickerPanel');
  if (!panel || !panel.classList.contains('show')) return;
  
  if (!panel.contains(target) && !target.closest('[data-action="toggle-media-picker"]')) {
    closeMediaPicker();
  }
});

// Добавляем обработчик в общий делегат click (найти action)
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action="toggle-media-picker"]');
  if (target) {
    toggleMediaPicker(target.dataset.mediaType, target);
  }
});
