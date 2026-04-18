// General UI utility functions

function notify(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Auto remove after 4 seconds
  setTimeout(() => {
    notification.remove();
  }, 4000);
}

function playNotificationSound() {
  // Create a simple beep sound
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.3);
}

function toggleAdminPanel() {
  const panel = document.getElementById('adminPanel');
  if (!panel) return;

  panel.classList.toggle('show');
}

function showError(panelId, message) {
  const errorEl = document.querySelector(`#${panelId} .auth-error`) ||
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

function isMobileLayout() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function syncMobileBackdrop() {
  const backdrop = document.getElementById('mobileBackdrop');
  const sidebar = document.getElementById('channelSidebar');
  const memberList = document.getElementById('memberList');
  if (!backdrop || !sidebar || !memberList) return;

  const needsBackdrop = sidebar.classList.contains('mobile-open') || memberList.classList.contains('mobile-open');
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

function toggleMemberList() {
  if (!isMobileLayout()) return;
  const memberList = document.getElementById('memberList');
  if (!memberList) return;

  memberList.classList.toggle('mobile-open');
  document.getElementById('channelSidebar')?.classList.remove('mobile-open');
  syncMobileBackdrop();
}

export { notify, playNotificationSound, toggleAdminPanel, showError, switchToLogin, switchToRegister, showLoginPanel, isMobileLayout, syncMobileBackdrop, toggleSidebar, closeMobilePanels, toggleMemberList };