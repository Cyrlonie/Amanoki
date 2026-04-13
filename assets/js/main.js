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
}

// ===================== ADMIN FUNCTIONS =====================
async function deleteMessage(messageId) {
  if (!isAdmin || !supabase) return;

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
                ? `<button class="admin-btn admin-btn-unban" onclick="unbanUser('${user.id}', '${escHtml(
                    user.username
                  )}')">Разбан</button>`
                : `<button class="admin-btn admin-btn-ban" onclick="banUser('${user.id}', '${escHtml(
                    user.username
                  )}')">Бан</button>`
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
function createNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const volume = 0.3;
    const duration = 0.3;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.frequency.setValueAtTime(800, audioContext.currentTime);
    osc.frequency.setValueAtTime(1000, audioContext.currentTime + 0.05);

    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + duration);
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
  if (picker.contains(event.target)) return;
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
