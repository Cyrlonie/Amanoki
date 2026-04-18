// Profile customization (classic script). Loads after main.js (notify, getUserColor, escHtml).

let profilePanelKeyHandler = null;
let selectedProfileColor = null;
let selectedProfileAvatarFile = null;
let selectedProfileAvatarPreviewUrl = null;
let profileOriginalUsername = '';
let profileSwatchClickHandler = null;
let profileLastFocusedElement = null;
let removeProfileAvatar = false;

function refreshSidebarUserChip() {
  const av = document.getElementById('myAvatar');
  const nameEl = document.getElementById('myName');
  if (!av || !nameEl) return;

  const initial = currentUser && currentUser[0] ? currentUser[0].toUpperCase() : '?';
  const color = getUserColor(currentUser);
  const avatarUrl = currentUserProfile?.avatar_url || userAvatars[currentUser];

  nameEl.textContent = currentUser;
  if (avatarUrl) {
    av.textContent = '';
    av.innerHTML = '';
    av.style.backgroundImage = `url('${escapeJsString(avatarUrl)}')`;
    av.style.backgroundColor = 'transparent';
  } else {
    av.innerHTML = '';
    av.textContent = initial;
    av.style.backgroundImage = '';
    av.style.backgroundColor = color;
    av.style.background = color;
  }
  av.innerHTML += '<div class="status-dot"></div>';
}

function buildProfileColorSwatches() {
  const wrap = document.getElementById('profileColorSwatches');
  if (!wrap) return;

  wrap.innerHTML = COLORS.map(
    (c) =>
      `<button type="button" class="profile-color-swatch${c === selectedProfileColor ? ' selected' : ''}" style="--swatch:${c}" data-color="${c}" aria-label="Цвет ${c}"></button>`
  ).join('');

  if (profileSwatchClickHandler) {
    wrap.removeEventListener('click', profileSwatchClickHandler);
  }

  profileSwatchClickHandler = (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    selectedProfileColor = btn.dataset.color;
    wrap.querySelectorAll('.profile-color-swatch').forEach((b) => b.classList.toggle('selected', b.dataset.color === selectedProfileColor));
    updateProfilePreview();
  };

  wrap.addEventListener('click', profileSwatchClickHandler);
}

function cleanupProfileAvatarPreview() {
  if (selectedProfileAvatarPreviewUrl) {
    URL.revokeObjectURL(selectedProfileAvatarPreviewUrl);
    selectedProfileAvatarPreviewUrl = null;
  }
}

function updateProfilePreview() {
  const input = document.getElementById('profileDisplayName');
  const prev = document.getElementById('profilePreviewAvatar');
  if (!input || !prev) return;

  const name = input.value.trim() || currentUser || '?';
  const avatarUrl =
    (selectedProfileAvatarFile ? selectedProfileAvatarPreviewUrl : '') ||
    (!removeProfileAvatar &&
      (currentUserProfile?.avatar_url ||
      userAvatars[currentUser])) ||
    '';

  if (avatarUrl) {
    prev.textContent = '';
    prev.style.backgroundImage = `url('${escapeJsString(avatarUrl)}')`;
    prev.style.backgroundColor = 'transparent';
  } else {
    prev.textContent = name[0].toUpperCase();
    prev.style.backgroundImage = '';
    prev.style.backgroundColor = selectedProfileColor || COLORS[0];
  }
}

function handleProfileAvatarFileSelect(event) {
  const fileInput = event.target;
  if (!(fileInput instanceof HTMLInputElement)) return;

  selectedProfileAvatarFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
  removeProfileAvatar = false;
  cleanupProfileAvatarPreview();

  if (selectedProfileAvatarFile) {
    selectedProfileAvatarPreviewUrl = URL.createObjectURL(selectedProfileAvatarFile);
  }

  updateProfilePreview();
}

function openProfilePanel() {
  closeSetupOverlay();
  closeMobilePanels();
  const panel = document.getElementById('profilePanel');
  if (!panel) return;

  profileLastFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const nameInput = document.getElementById('profileDisplayName');
  const emailHint = document.getElementById('profileEmailHint');

  profileOriginalUsername = currentUser;
  nameInput.value = currentUser;

  selectedProfileColor =
    (currentUserProfile && currentUserProfile.avatar_color) ||
    userColors[currentUser] ||
    COLORS[0];
  selectedProfileAvatarFile = null;
  removeProfileAvatar = false;
  cleanupProfileAvatarPreview();
  const fileInput = document.getElementById('profileAvatarFile');
  if (fileInput) fileInput.value = '';

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
  document.body.style.overflow = 'hidden';
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
  cleanupProfileAvatarPreview();
  selectedProfileAvatarFile = null;
  removeProfileAvatar = false;
  document.body.style.overflow = '';
  if (profilePanelKeyHandler) {
    document.removeEventListener('keydown', profilePanelKeyHandler);
    profilePanelKeyHandler = null;
  }
  if (profileLastFocusedElement && document.contains(profileLastFocusedElement)) {
    profileLastFocusedElement.focus();
  }
  profileLastFocusedElement = null;
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
  let avatarUrl = removeProfileAvatar ? null : (currentUserProfile?.avatar_url || userAvatars[prevName] || null);

  if (selectedProfileAvatarFile) {
    try {
      avatarUrl = await uploadProfileAvatar(selectedProfileAvatarFile);
    } catch (uploadErr) {
      notify('Не удалось загрузить аватар: ' + uploadErr.message, 'error');
      return;
    }
  }

  if (isDemoMode) {
    if (members[prevName] !== undefined && prevName !== username) {
      delete members[prevName];
    }
    delete userColors[prevName];
    delete userAvatars[prevName];
    currentUser = username;
    userColors[currentUser] = selectedProfileColor;
    if (avatarUrl) {
      userAvatars[currentUser] = avatarUrl;
    }
    currentUserProfile = { username, avatar_color: selectedProfileColor, avatar_url: avatarUrl };
    refreshSidebarUserChip();
    addMember(currentUser, 'online');
    notify('Профиль обновлён (демо)', 'success');
    closeProfilePanel();
    return;
  }

  if (!supabase || !authUser) {
    console.log('No supabase or authUser');
    notify('Нет подключения к серверу', 'error');
    return;
  }

  saveBtn.disabled = true;
  console.log('Saving to DB');
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        username,
        avatar_color: selectedProfileColor,
        avatar_url: avatarUrl,
      })
      .eq('id', authUser.id);

    if (error) {
      console.error('DB update error:', error);
      throw error;
    }

    console.log('DB update successful');
    if (prevName !== username) {
      delete userColors[prevName];
      delete userAvatars[prevName];
    }
    userColors[username] = selectedProfileColor;
    if (avatarUrl) {
      userAvatars[username] = avatarUrl;
    } else {
      delete userAvatars[username];
    }
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
    console.error('Save error:', e2);
    notify('Не удалось сохранить: ' + e2.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

async function uploadProfileAvatar(file) {
  if (!supabase) {
    throw new Error('Нет подключения к Supabase');
  }
  console.log('Starting avatar upload for file:', file.name, file.size);
  const safeExt = String(file.name).split('.').pop().toLowerCase() || 'png';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  const filePath = `avatars/${authUser.id}/${fileName}`;
  console.log('Upload path:', filePath);

  const { error } = await supabase.storage.from('avatar').upload(filePath, file);
  if (error) {
    console.error('Upload error:', error);
    throw error;
  }
  console.log('Upload successful');

  const { data } = supabase.storage.from('avatar').getPublicUrl(filePath);
  console.log('Public URL:', data?.publicUrl);
  return data?.publicUrl || null;
}

function initProfileFormEvents() {
  const profileForm = document.getElementById('profileForm');
  if (!profileForm || profileForm.dataset.profileEventsInit === '1') return;

  if (!document.getElementById('profileRemoveAvatarBtn')) {
    const fileInput = document.getElementById('profileAvatarFile');
    const hint = fileInput?.nextElementSibling;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.id = 'profileRemoveAvatarBtn';
    removeBtn.className = 'profile-btn profile-btn-secondary';
    removeBtn.textContent = 'Удалить аватар';
    hint?.insertAdjacentElement('afterend', removeBtn);
  }

  const profileAvatarUrlInput = document.getElementById('profileAvatarUrl');
  profileAvatarUrlInput?.addEventListener('input', () => {
    selectedProfileAvatarFile = null;
    cleanupProfileAvatarPreview();
    updateProfilePreview();
  });

  const profileAvatarFileInput = document.getElementById('profileAvatarFile');
  profileAvatarFileInput?.addEventListener('change', handleProfileAvatarFileSelect);

  document.getElementById('profileRemoveAvatarBtn')?.addEventListener('click', () => {
    removeProfileAvatar = true;
    selectedProfileAvatarFile = null;
    cleanupProfileAvatarPreview();
    const fileInput = document.getElementById('profileAvatarFile');
    if (fileInput) fileInput.value = '';
    updateProfilePreview();
  });

  profileForm.dataset.profileEventsInit = '1';
}

initProfileFormEvents();
