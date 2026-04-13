// Authentication functions
import { supabase } from './config.js';
import { authUser, currentUser, currentUserProfile, isAdmin, COLORS, showLoginPanel, showError, notify } from './state.js';

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const { data: { user }, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    authUser = user;
    await loadUserProfile();
    document.getElementById('loginBtnText').textContent = 'Добро пожаловать!';

    setTimeout(() => {
      document.getElementById('authOverlay').style.display = 'none';
      initApp();
      loadMembersDirectory();
      subscribeToMessages();
    }, 800);

  } catch(e) {
    showError('loginPanel', e.message);
    document.getElementById('loginBtnText').textContent = 'Войти';
    document.querySelector('#loginPanel .auth-btn').disabled = false;
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
    document.getElementById('registerBtnText').textContent = 'Регистрация...';
    const btnEl = document.querySelector('#registerPanel .auth-btn');
    btnEl.disabled = true;

    // Register user
    const { data: { user }, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });

    if (signUpError) throw signUpError;

    // Create user profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        username: username,
        email: email,
        avatar_color: COLORS[Math.floor(Math.random() * COLORS.length)]
      });

    if (profileError) throw profileError;

    authUser = user;
    currentUser = username;
    document.getElementById('registerBtnText').textContent = 'Успешно!';

    setTimeout(() => {
      document.getElementById('authOverlay').style.display = 'none';
      initApp();
      loadMembersDirectory();
      subscribeToMessages();
    }, 800);

  } catch(e) {
    showError('registerPanel', e.message);
    document.getElementById('registerBtnText').textContent = 'Регистрация';
    document.querySelector('#registerPanel .auth-btn').disabled = false;
  }
}

async function loadUserProfile() {
  if (!authUser || !supabase) return;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (error) throw error;

    // Проверить если пользователь забанен
    if (data.is_banned) {
      await supabase.auth.signOut();
      showError('loginPanel', '❌ Ваш аккаунт заблокирован администратором');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      return;
    }

    currentUserProfile = data;
    currentUser = data.username;
    userColors[currentUser] = data.avatar_color;

    // Проверить если это администратор
    isAdmin = (authUser.id === adminUserId);

  } catch(e) {
    console.error('Error loading profile:', e);
    currentUser = authUser.email.split('@')[0];
  }
      const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
    if (data) {
      currentUser = data.username;
      isAdmin = data.is_admin === true; // берем из базы
      if (isAdmin) {
        document.getElementById('adminBtn').style.display = 'flex'; // показываем кнопку
      }
    }
  }

export { handleLogin, handleRegister, loadUserProfile };