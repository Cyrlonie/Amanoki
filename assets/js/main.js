// Extracted from index.html inline script (no bundler).
// Kept as classic script for compatibility with inline handlers.

// State/config moved to assets/js/state.js + assets/js/config.js

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
      case 'init-supabase':
        await initSupabase();
        break;
      case 'demo-mode':
        demoMode();
        break;
      case 'switch-to-register':
        switchToRegister();
        break;
      case 'switch-to-login':
        switchToLogin();
        break;
      case 'back-to-login':
        document.getElementById('authOverlay').style.display = 'flex';
        closeSetupOverlay();
        break;
      case 'notify':
        notify(actionEl.dataset.message || '');
        break;
      case 'open-profile':
        openProfilePanel();
        break;
      case 'close-profile':
        console.log('close-profile action triggered');
        closeProfilePanel();
        break;
      case 'logout':
        await handleLogout();
        break;
      case 'toggle-sidebar':
        toggleSidebar();
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
      case 'reload-admin-users':
        await loadAdminUsers();
        break;
      case 'cancel-reply':
        cancelReply();
        break;
      case 'open-file-dialog':
        document.getElementById('fileInput')?.click();
        break;
      case 'insert-emoji':
        insertEmoji();
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
      case 'toggle-reaction':
        await toggleReaction(actionEl.dataset.messageId, actionEl.dataset.emoji);
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
  messageInput?.addEventListener('keydown', handleKey);
  messageInput?.addEventListener('input', (event) => {
    autoResize(event.target);
    handleTyping();
  });

  const profileNameInput = document.getElementById('profileDisplayName');
  profileNameInput?.addEventListener('input', () => {
    if (typeof updateProfilePreview === 'function') {
      updateProfilePreview();
    }
  });

  const profileCard = document.querySelector('.profile-panel-card');
  profileCard?.addEventListener('click', (event) => event.stopPropagation());

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
      await loadUserProfile(); // Загружаем данные профиля и проверяем админку
      await loadMembersDirectory();

      // Скрываем экран входа
      document.getElementById('authOverlay').style.display = 'none';
      closeSetupOverlay();

      initApp();
      subscribeToMessages();
    } else {
      // Если сессии нет, сразу показываем авторизацию
      const authSubEl = document.getElementById('authSub');
      if (authSubEl) authSubEl.textContent = 'Пожалуйста, войдите в аккаунт';
      showLoginPanel();
    }
  } catch (e) {
    console.error(e);
    const authSubEl = document.getElementById('authSub');
    if (authSubEl) authSubEl.textContent = 'Ошибка инициализации системы';
    showLoginPanel();
  }
};

// ===================== INIT APP =====================
function initApp() {
  const initial = currentUser && currentUser[0] ? currentUser[0].toUpperCase() : '?';
  const color = getUserColor(currentUser);

  document.getElementById('myName').textContent = currentUser;
  document.getElementById('myAvatar').textContent = initial;
  document.getElementById('myAvatar').style.background = color;
  document.getElementById('myAvatar').innerHTML += '<div class="status-dot"></div>';
  document.getElementById('message-input').placeholder = `Написать в #${currentChannel}`;

  if (!userColors[currentUser]) {
    userColors[currentUser] = color;
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

  // Отслеживание фокуса окна браузера
  window.addEventListener('focus', () => {
    windowHasFocus = true;
  });
  window.addEventListener('blur', () => {
    windowHasFocus = false;
  });

  // Горячая клавиша Ctrl+Shift+A для открытия админ панели
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      toggleAdminPanel();
    }
  });

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
    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: true })
      .eq('id', userId);

    if (error) throw error;

    notify(`✅ Пользователь ${username} заблокирован`, 'success');
    // Обновить список участников
    location.reload();
  } catch (e) {
    notify('❌ Ошибка бана: ' + e.message, 'error');
  }
}

async function unbanUser(userId, username) {
  if (!isAdmin || !supabase) return;

  if (!confirm(`✅ Разбанить пользователя ${username}?`)) return;

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: false })
      .eq('id', userId);

    if (error) throw error;

    notify(`✅ Пользователь ${username} разблокирован`, 'success');
    location.reload();
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
            <div class="admin-item-status">${user.email} • ${
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

function insertEmoji() {
  const emojis = ['😀', '😂', '🔥', '❤️', '👍', '🎉', '😎', '🤔', '💯', '🚀', '✅', '💬'];
  const e = emojis[Math.floor(Math.random() * emojis.length)];
  const input = document.getElementById('message-input');
  input.value += e;
  input.focus();
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
