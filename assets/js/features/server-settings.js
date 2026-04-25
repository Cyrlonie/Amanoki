// Server Settings & Customization (classic script, no bundler)

const SS_COLORS = [
  '#9333ea', '#7c3aed', '#6366f1', '#a855f7', '#c084fc',
  '#22d3ee', '#34d399', '#fb7185', '#fbbf24', '#f472b6',
  '#3b82f6', '#14b8a6', '#f97316', '#ef4444', '#8b5cf6',
  '#06b6d4', '#10b981', '#ec4899',
];

let ssSelectedColor = '';
let ssCurrentServerData = null;
let ssIsOwner = false;

// ===================== SIDEBAR DROPDOWN =====================
function toggleServerDropdown() {
  const dropdown = document.getElementById('sidebarDropdown');
  if (!dropdown) return;
  dropdown.classList.toggle('show');

  // Rotate chevron
  const chevron = document.querySelector('.sidebar-header .chevron .material-icons-round');
  if (chevron) {
    chevron.textContent = dropdown.classList.contains('show') ? 'expand_less' : 'expand_more';
  }
}

function closeServerDropdown() {
  const dropdown = document.getElementById('sidebarDropdown');
  if (!dropdown) return;
  dropdown.classList.remove('show');

  const chevron = document.querySelector('.sidebar-header .chevron .material-icons-round');
  if (chevron) chevron.textContent = 'expand_more';
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  const dropdown = document.getElementById('sidebarDropdown');
  if (!dropdown || !dropdown.classList.contains('show')) return;

  if (!target.closest('.sidebar-header') && !target.closest('.sidebar-dropdown')) {
    closeServerDropdown();
  }
});

// ===================== SERVER SETTINGS MODAL =====================
async function openServerSettings(tabName = 'overview') {
  if (!currentServerId || !supabase) return;
  closeServerDropdown();

  const overlay = document.getElementById('serverSettingsOverlay');
  if (!overlay) return;

  // Load server data
  try {
    const { data, error } = await supabase
      .from('servers')
      .select('*')
      .eq('id', currentServerId)
      .single();

    if (error) throw error;
    ssCurrentServerData = data;
  } catch (err) {
    notify('Ошибка загрузки настроек сервера', 'error');
    return;
  }

  ssIsOwner = ssCurrentServerData.owner_id === authUser?.id;

  // Populate overview fields
  document.getElementById('ssServerName').value = ssCurrentServerData.name || '';
  document.getElementById('ssServerDesc').value = ssCurrentServerData.description || '';

  // Server icon preview
  const iconPreview = document.getElementById('ssIconPreview');
  iconPreview.textContent = ssCurrentServerData.name.charAt(0).toUpperCase();

  // Determine current color
  let hash = 0;
  for (let i = 0; i < ssCurrentServerData.name.length; i++) {
    hash = ssCurrentServerData.name.charCodeAt(i) + ((hash << 5) - hash);
  }
  ssSelectedColor = ssCurrentServerData.icon_color || COLORS[Math.abs(hash) % COLORS.length];
  iconPreview.style.background = ssSelectedColor;

  // Build color grid
  buildColorGrid();

  // Show/hide owner-only elements
  const deleteItem = document.getElementById('ssDeleteServerItem');
  if (deleteItem) deleteItem.style.display = ssIsOwner ? 'flex' : 'none';

  // Show/hide settings tab for non-owners (they can still view but not save)
  const saveBar = overlay.querySelector('.ss-save-bar');
  if (saveBar) saveBar.style.display = ssIsOwner ? 'flex' : 'none';

  // Switch to requested tab
  switchSSTab(tabName);

  // If members tab, load members
  if (tabName === 'members') {
    loadSSMembers();
  }

  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeServerSettings() {
  const overlay = document.getElementById('serverSettingsOverlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  ssCurrentServerData = null;
}

function switchSSTab(tabName) {
  // Update tabs
  document.querySelectorAll('[data-ss-tab]').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.ssTab === tabName);
  });

  // Update sections
  document.querySelectorAll('[data-ss-section]').forEach(section => {
    section.classList.toggle('active', section.dataset.ssSection === tabName);
  });

  // Update title
  const titles = {
    overview: 'Обзор сервера',
    members: 'Участники',
    invites: 'Приглашения',
    danger: 'Опасная зона',
  };
  const titleEl = document.getElementById('ssTitle');
  if (titleEl) titleEl.textContent = titles[tabName] || 'Настройки сервера';

  // Load members on tab switch
  if (tabName === 'members') loadSSMembers();
}

function buildColorGrid() {
  const grid = document.getElementById('ssColorGrid');
  if (!grid) return;

  grid.innerHTML = SS_COLORS.map(color => {
    const selected = color === ssSelectedColor ? ' selected' : '';
    return `<button type="button" class="ss-color-swatch${selected}" style="background:${color};" data-color="${color}"></button>`;
  }).join('');

  grid.querySelectorAll('.ss-color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      ssSelectedColor = swatch.dataset.color;
      document.getElementById('ssIconPreview').style.background = ssSelectedColor;
      grid.querySelectorAll('.ss-color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
    });
  });
}

// Live name preview
document.getElementById('ssServerName')?.addEventListener('input', (e) => {
  const preview = document.getElementById('ssIconPreview');
  if (preview) {
    preview.textContent = (e.target.value || '?').charAt(0).toUpperCase();
  }
});

// ===================== SAVE SETTINGS =====================
async function saveServerSettings() {
  if (!supabase || !currentServerId || !ssIsOwner) {
    notify('Только владелец может менять настройки', 'error');
    return;
  }

  const name = document.getElementById('ssServerName').value.trim();
  const description = document.getElementById('ssServerDesc').value.trim();

  if (!name) {
    notify('Название сервера не может быть пустым', 'error');
    return;
  }

  try {
    const { error } = await supabase
      .from('servers')
      .update({ name, description, icon_color: ssSelectedColor })
      .eq('id', currentServerId);

    if (error) throw error;

    notify('✅ Настройки сервера сохранены!', 'success');

    // Update local state
    const serverObj = serversList.find(s => s.id === currentServerId);
    if (serverObj) {
      serverObj.name = name;
      serverObj.icon_color = ssSelectedColor;
    }

    renderServers();
    closeServerSettings();
  } catch (err) {
    notify('Ошибка сохранения: ' + err.message, 'error');
  }
}

// ===================== MEMBERS =====================
async function loadSSMembers() {
  const list = document.getElementById('ssMembersList');
  if (!list || !supabase || !currentServerId) return;

  list.innerHTML = '<div class="ss-hint" style="text-align:center;padding:24px 0;">Загрузка...</div>';

  try {
    const { data, error } = await supabase
      .from('server_members')
      .select('user_id, role, profiles(id, username, email, avatar_url, avatar_color)')
      .eq('server_id', currentServerId);

    if (error) throw error;

    if (!data || data.length === 0) {
      list.innerHTML = '<div class="ss-hint" style="text-align:center;padding:24px 0;">Нет участников</div>';
      return;
    }

    list.innerHTML = data.map(member => {
      const profile = member.profiles;
      if (!profile) return '';

      const name = profile.username || 'Unknown';
      const initial = name.charAt(0).toUpperCase();
      const color = profile.avatar_color || getUserColor(name);
      const avatarStyle = profile.avatar_url
        ? `background-image:url('${profile.avatar_url}');background-size:cover;`
        : `background:${color};`;
      const avatarContent = profile.avatar_url ? '' : initial;

      const roleBadge = member.role === 'owner'
        ? '<span class="ss-role-badge owner">👑 Владелец</span>'
        : member.role === 'admin'
          ? '<span class="ss-role-badge admin">🛡️ Админ</span>'
          : '<span class="ss-role-badge member">Участник</span>';

      const isSelf = profile.id === authUser?.id;
      const isTargetOwner = member.role === 'owner';

      let actionsHtml = '';
      if (ssIsOwner && !isSelf && !isTargetOwner) {
        actionsHtml = `
          <div class="ss-member-actions">
            <button type="button" class="ss-member-btn kick" data-action="ss-kick-member" data-user-id="${profile.id}" data-username="${escHtml(name)}">Кик</button>
          </div>
        `;
      }

      return `
        <div class="ss-member-row">
          <div class="ss-member-avatar" style="${avatarStyle}">${avatarContent}</div>
          <div class="ss-member-info">
            <div class="ss-member-name">${escHtml(name)}${isSelf ? ' <span style="color:var(--text-muted);font-size:11px;">(вы)</span>' : ''}</div>
            <div class="ss-member-role">${roleBadge}</div>
          </div>
          ${actionsHtml}
        </div>
      `;
    }).join('');
  } catch (err) {
    list.innerHTML = `<div class="ss-hint" style="text-align:center;padding:24px 0;color:var(--red);">Ошибка: ${err.message}</div>`;
  }
}

// ===================== INVITE =====================
async function sendServerInvite() {
  const emailInput = document.getElementById('ssInviteEmail');
  const email = emailInput?.value.trim();
  if (!email || !supabase || !currentServerId) return;

  try {
    // Find user by email
    const { data: profiles, error: searchError } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('email', email)
      .limit(1);

    if (searchError) throw searchError;
    if (!profiles || profiles.length === 0) {
      notify('Пользователь с таким email не найден', 'error');
      return;
    }

    const targetUser = profiles[0];

    // Check if already a member
    const { data: existing } = await supabase
      .from('server_members')
      .select('id')
      .eq('server_id', currentServerId)
      .eq('user_id', targetUser.id)
      .limit(1);

    if (existing && existing.length > 0) {
      notify(`${targetUser.username} уже состоит на этом сервере`, 'error');
      return;
    }

    // Add as member
    const { error: insertError } = await supabase
      .from('server_members')
      .insert([{ server_id: currentServerId, user_id: targetUser.id, role: 'member' }]);

    if (insertError) throw insertError;

    notify(`✅ ${targetUser.username} приглашён на сервер!`, 'success');
    emailInput.value = '';
    loadSSMembers();
  } catch (err) {
    notify('Ошибка приглашения: ' + err.message, 'error');
  }
}

// ===================== KICK MEMBER =====================
async function kickMember(userId, username) {
  if (!ssIsOwner || !supabase || !currentServerId) return;
  if (!confirm(`Исключить ${username} с сервера?`)) return;

  try {
    const { error } = await supabase
      .from('server_members')
      .delete()
      .eq('server_id', currentServerId)
      .eq('user_id', userId);

    if (error) throw error;
    notify(`✅ ${username} исключён с сервера`, 'success');
    loadSSMembers();
  } catch (err) {
    notify('Ошибка исключения: ' + err.message, 'error');
  }
}

// ===================== LEAVE SERVER =====================
async function leaveServer() {
  if (!supabase || !currentServerId || !authUser) return;

  // Check if owner
  const server = serversList.find(s => s.id === currentServerId);
  if (ssCurrentServerData?.owner_id === authUser.id) {
    notify('Владелец не может покинуть сервер. Удалите его или передайте права.', 'error');
    return;
  }

  if (!confirm('Вы уверены, что хотите покинуть этот сервер?')) return;

  try {
    const { error } = await supabase
      .from('server_members')
      .delete()
      .eq('server_id', currentServerId)
      .eq('user_id', authUser.id);

    if (error) throw error;

    notify('Вы покинули сервер', 'success');
    closeServerSettings();
    closeServerDropdown();
    currentServerId = null;
    await loadServers();
  } catch (err) {
    notify('Ошибка: ' + err.message, 'error');
  }
}

// ===================== DELETE SERVER =====================
async function deleteServer() {
  if (!ssIsOwner || !supabase || !currentServerId) return;

  const serverName = ssCurrentServerData?.name || '';
  const input = prompt(`Для подтверждения введите название сервера: "${serverName}"`);
  if (input !== serverName) {
    notify('Название не совпадает. Удаление отменено.', 'error');
    return;
  }

  try {
    // Delete members first
    await supabase.from('server_members').delete().eq('server_id', currentServerId);
    // Delete channels
    await supabase.from('channels').delete().eq('server_id', currentServerId);
    // Delete server
    const { error } = await supabase.from('servers').delete().eq('id', currentServerId);

    if (error) throw error;

    notify('Сервер удалён', 'success');
    closeServerSettings();
    currentServerId = null;
    await loadServers();
  } catch (err) {
    notify('Ошибка удаления: ' + err.message, 'error');
  }
}

// ===================== EVENT DELEGATION =====================
document.addEventListener('click', async (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  const actionEl = target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  switch (action) {
    case 'toggle-server-dropdown':
      toggleServerDropdown();
      break;
    case 'open-server-settings':
      openServerSettings(actionEl.dataset.tab || 'overview');
      break;
    case 'close-server-settings':
      closeServerSettings();
      break;
    case 'save-server-settings':
      await saveServerSettings();
      break;
    case 'generate-invite':
      await generateInvite();
      break;
    case 'delete-invite':
      await deleteInvite(actionEl.dataset.inviteId);
      break;
    case 'ss-kick-member':
      await kickMember(actionEl.dataset.userId, actionEl.dataset.username);
      break;
    case 'leave-server':
    case 'leave-server-btn':
      closeServerDropdown();
      await leaveServer();
      break;
    case 'delete-server':
      await deleteServer();
      break;
  }
});

// Tab switching
document.querySelectorAll('[data-ss-tab]').forEach(tab => {
  tab.addEventListener('click', () => switchSSTab(tab.dataset.ssTab));
});

// ESC to close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('serverSettingsOverlay');
    if (overlay?.classList.contains('show')) {
      closeServerSettings();
      return;
    }
    closeServerDropdown();
  }
});

