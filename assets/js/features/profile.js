// Profile customization (classic script). Loads after main.js (notify, getUserColor, escHtml).

let profilePanelKeyHandler = null;
let selectedProfileColor = null;
let profileOriginalUsername = '';

function refreshSidebarUserChip() {
  const av = document.getElementById('myAvatar');
  const nameEl = document.getElementById('myName');
  if (!av || !nameEl) return;

  const initial = currentUser && currentUser[0] ? currentUser[0].toUpperCase() : '?';
  const color = getUserColor(currentUser);

  nameEl.textContent = currentUser;
  av.textContent = initial;
  av.style.background = color;
  av.innerHTML = `${initial}<div class="status-dot"></div>`;
}

function buildProfileColorSwatches() {
  const wrap = document.getElementById('profileColorSwatches');
  if (!wrap) return;

  wrap.innerHTML = COLORS.map(
    (c) =>
      `<button type="button" class="profile-color-swatch${c === selectedProfileColor ? ' selected' : ''}" style="--swatch:${c}" data-color="${c}" aria-label="Цвет ${c}"></button>`
  ).join('');

  wrap.onclick = (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    selectedProfileColor = btn.dataset.color;
    wrap.querySelectorAll('.profile-color-swatch').forEach((b) => b.classList.toggle('selected', b.dataset.color === selectedProfileColor));
    updateProfilePreview();
  };
}

function updateProfilePreview() {
  const input = document.getElementById('profileDisplayName');
  const prev = document.getElementById('profilePreviewAvatar');
  if (!input || !prev) return;

  const name = input.value.trim() || currentUser || '?';
  prev.textContent = name[0].toUpperCase();
  prev.style.background = selectedProfileColor || COLORS[0];
}

function openProfilePanel() {
  closeSetupOverlay();
  closeMobilePanels();
  const panel = document.getElementById('profilePanel');
  if (!panel) return;

  const nameInput = document.getElementById('profileDisplayName');
  const emailHint = document.getElementById('profileEmailHint');

  profileOriginalUsername = currentUser;
  nameInput.value = currentUser;

  selectedProfileColor =
    (currentUserProfile && currentUserProfile.avatar_color) ||
    userColors[currentUser] ||
    COLORS[0];

  if (isDemoMode) {
    emailHint.textContent = 'Демо: имя и цвет только в этой сессии.';
  } else if (authUser?.email) {
    emailHint.textContent = `Аккаунт: ${authUser.email}`;
  } else {
    emailHint.textContent = '';
  }

  buildProfileColorSwatches();
  updateProfilePreview();

  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  nameInput.focus();

  profilePanelKeyHandler = (e) => {
    if (e.key === 'Escape') closeProfilePanel();
  };
  document.addEventListener('keydown', profilePanelKeyHandler);
}

function closeProfilePanel() {
  const panel = document.getElementById('profilePanel');
  if (panel) {
    panel.classList.remove('show');
    panel.setAttribute('aria-hidden', 'true');
  }
  if (profilePanelKeyHandler) {
    document.removeEventListener('keydown', profilePanelKeyHandler);
    profilePanelKeyHandler = null;
  }
}

function validateProfileUsername(raw) {
  const u = raw.trim();
  if (u.length < 2 || u.length > 32) {
    return 'Имя: от 2 до 32 символов.';
  }
  if (!/^[\w\u0400-\u04FF-]+$/.test(u)) {
    return 'Допустимы буквы, цифры, _ и дефис.';
  }
  return '';
}

async function saveProfileSettings(e) {
  e.preventDefault();
  const nameInput = document.getElementById('profileDisplayName');
  const saveBtn = document.getElementById('profileSaveBtn');
  const username = nameInput.value.trim();
  const err = validateProfileUsername(username);
  if (err) {
    notify(err, 'error');
    return;
  }

  const prevName = profileOriginalUsername || currentUser;

  if (isDemoMode) {
    if (members[prevName] !== undefined && prevName !== username) {
      delete members[prevName];
    }
    delete userColors[prevName];
    currentUser = username;
    userColors[currentUser] = selectedProfileColor;
    currentUserProfile = { username, avatar_color: selectedProfileColor };
    refreshSidebarUserChip();
    addMember(currentUser, 'online');
    notify('Профиль обновлён (демо)', 'success');
    closeProfilePanel();
    return;
  }

  if (!supabase || !authUser) {
    notify('Нет подключения к серверу', 'error');
    return;
  }

  saveBtn.disabled = true;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        username,
        avatar_color: selectedProfileColor,
      })
      .eq('id', authUser.id);

    if (error) throw error;

    if (prevName !== username) {
      delete userColors[prevName];
    }
    userColors[username] = selectedProfileColor;
    currentUser = username;

    await loadUserProfile();
    await loadMembersDirectory();
    applyPresenceFromChannel();

    if (presenceChannel) {
      try {
        await presenceChannel.track({
          user_id: authUser.id,
          username: currentUser,
          channel: currentChannel,
          typing: false,
        });
      } catch (trackErr) {
        console.warn('Presence track after profile:', trackErr);
      }
    }

    refreshSidebarUserChip();
    notify('Профиль сохранён', 'success');
    closeProfilePanel();
  } catch (e2) {
    notify('Не удалось сохранить: ' + e2.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}
