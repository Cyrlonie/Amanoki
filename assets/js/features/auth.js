// Auth / profile related logic (classic script).

function closeSetupOverlay() {
  document.getElementById('setupOverlay')?.classList.remove('is-open');
}

function showError(panelId, message) {
  const errorEl =
    document.querySelector(`#${panelId} .auth-error`) ||
    document.getElementById('loginError');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 4000);
  }
}

function switchToLogin() {
  document.getElementById('registerPanel').style.display = 'none';
  document.getElementById('loginPanel').style.display = 'block';
  document.getElementById('loginError').classList.remove('show');
}

function switchToRegister() {
  document.getElementById('loginPanel').style.display = 'none';
  document.getElementById('registerPanel').style.display = 'block';
  document.getElementById('registerError').classList.remove('show');
}

function showLoginPanel() {
  document.getElementById('setupPanel').style.display = 'none';
  document.getElementById('loginPanel').style.display = 'block';
  document.getElementById('registerPanel').style.display = 'none';
  if (authUser) {
    document.getElementById('loginEmail').value = authUser.email;
    document.getElementById('loginPassword').value = '';
  }
}

// Новая функция для загрузки профиля (нужна для админки)
async function loadUserProfile() {
  if (!authUser || !supabase) return;
  const prevUsername = currentUserProfile?.username || currentUser;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();
    if (error) throw error;

    currentUserProfile = data;
    currentUser = data.username;
    isAdmin = data.is_admin === true;

    if (prevUsername && prevUsername !== data.username) {
      delete userColors[prevUsername];
      delete userAvatars[prevUsername];
    }

    if (data.avatar_color && data.username) {
      userColors[data.username] = data.avatar_color;
    }
    if (data.avatar_url && data.username) {
      userAvatars[data.username] = data.avatar_url;
    } else if (data.username) {
      delete userAvatars[data.username];
    }

    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';
  } catch (_) {
    currentUserProfile = null;
    isAdmin = false;
    currentUser = authUser.email.split('@')[0];
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) adminBtn.style.display = 'none';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('registerUsername').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const password2 = document.getElementById('registerPassword2').value;

  if (password.length < 6) {
    showError('registerPanel', 'Пароль должен быть минимум 6 символов');
    return;
  }

  if (password !== password2) {
    showError('registerPanel', 'Пароли не совпадают');
    return;
  }

  try {
    await initializeSupabaseClient();
    document.getElementById('registerBtnText').textContent = 'Регистрация...';
    const btnEl = document.querySelector('#registerPanel .auth-btn');
    btnEl.disabled = true;

    const {
      data: { session, user },
      error: signUpError,
    } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });

    if (signUpError) {
      // Если требуется подтверждение email, это не ошибка
      if (signUpError.message?.includes('Email not confirmed') || signUpError.message?.includes('email confirmation')) {
        document.getElementById('registerBtnText').textContent = 'Проверьте почту';
        btnEl.disabled = false;
        showError('registerPanel', 'Аккаунт создан. Подтвердите почту и затем войдите.');
        switchToLogin();
        document.getElementById('loginEmail').value = email;
        document.getElementById('loginPassword').value = '';
        return;
      }
      throw signUpError;
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: user.id,
      username: username,
      email: email,
      avatar_color: COLORS[Math.floor(Math.random() * COLORS.length)],
      avatar_url: null,
    });

    if (profileError) throw profileError;

    if (!session) {
      document.getElementById('registerBtnText').textContent = 'Проверьте почту';
      btnEl.disabled = false;
      showError('registerPanel', 'Аккаунт создан. Подтвердите почту и затем войдите.');
      switchToLogin();
      document.getElementById('loginEmail').value = email;
      document.getElementById('loginPassword').value = '';
      return;
    }

    authUser = user;
    currentUser = username;
    document.getElementById('registerBtnText').textContent = 'Успешно!';

    setTimeout(() => {
      document.getElementById('authOverlay').style.display = 'none';
      closeSetupOverlay();
      initApp();
      loadMembersDirectory();
      subscribeToMessages();
    }, 800);
  } catch (e2) {
    showError('registerPanel', e2.message);
    document.getElementById('registerBtnText').textContent = 'Регистрация';
    document.querySelector('#registerPanel .auth-btn').disabled = false;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    await initializeSupabaseClient();
    document.getElementById('loginBtnText').textContent = 'Вход...';
    const btnEl = document.querySelector('#loginPanel .auth-btn');
    btnEl.disabled = true;

    const {
      data: { user },
      error,
    } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    authUser = user;
    await loadUserProfile();
    document.getElementById('loginBtnText').textContent = 'Добро пожаловать!';

    setTimeout(() => {
      document.getElementById('authOverlay').style.display = 'none';
      closeSetupOverlay();
      initApp();
      loadMembersDirectory();
      subscribeToMessages();
    }, 800);
  } catch (e2) {
    showError('loginPanel', e2.message);
    document.getElementById('loginBtnText').textContent = 'Войти';
    document.querySelector('#loginPanel .auth-btn').disabled = false;
  }
}

async function handleLogout() {
  try {
    await initializeSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
  } catch (e) {
    console.warn('Logout failed', e);
  } finally {
    window.location.reload();
  }
}

function demoMode() {
  const name = 'Гость_' + Math.floor(Math.random() * 10000);
  currentUser = name;
  isDemoMode = true;
  initApp();

  DEMO_MESSAGES.forEach((m) =>
    renderMessage({
      author: m.author,
      text: m.text,
      created: m.time.toISOString(),
      user_id: 'demo-' + m.author,
    })
  );

  document.getElementById('authOverlay').style.display = 'none';
  closeSetupOverlay();

  addMember(name, 'online');
  ['Алексей', 'Мария', 'Иван'].forEach((n) =>
    addMember(n, ['online', 'idle', 'dnd'][Math.floor(Math.random() * 3)])
  );
  addMember('Саша', 'offline');
}

// Deprecated manual init (kept for hidden setup panel compatibility)
async function initSupabase() {
  const url = document.getElementById('supabaseUrl').value.trim();
  const key = document.getElementById('supabaseKey').value.trim();
  const adminId = document.getElementById('adminUserId').value.trim();

  if (!url || !key) {
    showError('setupPanel', 'Укажите URL и Anon Key');
    return;
  }

  if (adminId) {
    adminUserId = adminId;
    localStorage.setItem('adminUserId', adminId);
  }

  try {
    const module = await import(
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.43.1/+esm'
    );
    const { createClient } = module;
    window.supabaseClient = module;
    supabase = createClient(url, key);

    const { error } = await supabase.auth.getSession();
    if (error && error.message !== 'Invalid Refresh Token') {
      throw new Error('Не удалось подключиться к Supabase');
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      authUser = user;
      await loadUserProfile();
      showLoginPanel();
    } else {
      showLoginPanel();
    }
  } catch (e) {
    showError('setupPanel', 'Ошибка подключения: ' + e.message);
  }
}

