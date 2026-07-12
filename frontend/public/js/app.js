// ── Navigation ────────────────────────────────────────────────
function navTo(view) {
  if (view === 'home') {
    showView('welcome');
    document.getElementById('sidebar').classList.remove('hidden-mobile');
  } else if (view === 'global') openGlobal();
  else if (view === 'announcements') openAnnouncements();
  else if (view === 'settings') openSettings();
   else if (view === 'admin') openAdmin();
   else if (view === 'help') openHelp();
   else if (view === 'sage') openSage();
}

// ── App Init ──────────────────────────────────────────────────
async function initApp() {
  // Apply saved theme instantly to prevent flash
  const savedTheme = localStorage.getItem('kc_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  initAccentColor();

  const isAuthed = await checkAuth();
  if (!isAuthed) {
    playIntro(() => {
      document.getElementById('auth-page').classList.remove('hidden');
    });
    return;
  }

  if (state.user.must_change_password) {
    document.getElementById('auth-page').classList.remove('hidden');
    document.getElementById('intro-screen').style.display = 'none';
    showChangePasswordView();
    return;
  }

  if (!state.user.intro_seen) {
    playIntro(() => enterApp());
  } else {
    document.getElementById('intro-screen').style.display = 'none';
    enterApp();
  }
}

function playIntro(cb) {
  const intro = document.getElementById('intro-screen');
  intro.style.display = 'flex';
  spawnParticles();
  setTimeout(() => {
    intro.classList.add('out');
    setTimeout(() => { intro.style.display = 'none'; if (cb) cb(); }, 800);
  }, 2900);
}

function spawnParticles() {
  const container = document.getElementById('intro-particles');
  if (!container) return;
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'intro-particle';
    p.style.cssText = `left:${Math.random()*100}%;animation-duration:${3+Math.random()*4}s;animation-delay:${Math.random()*2}s;--dx:${(Math.random()-.5)*100}px;width:${1+Math.random()*2}px;height:${1+Math.random()*2}px;opacity:${.4+Math.random()*.6}`;
    container.appendChild(p);
  }
}

async function enterApp() {
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('intro-screen').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');

  if (!state.user.intro_seen) {
    api.markIntroSeen().catch(err => console.warn('markIntroSeen failed:', err));
    state.user.intro_seen = true;
  }

  // Apply theme from user profile
  const theme = state.user.theme || localStorage.getItem('kc_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('kc_theme', theme);
  initAccentColor();

  // Load roles first (needed everywhere for badges)
  try {
    const { roles } = await api.getRoles();
    state.roles = roles;
  } catch {}

  updateTopbarAv();
  initSocket(state.token);
  await loadFriends();
  showView('welcome');
  loadWelcomeAnnouncements();
  // Bottom nav is always visible — remove hidden class
  const bnav = document.getElementById('bottom-nav');
  if (bnav) bnav.classList.remove('hidden');
}

// ── Online/offline (works locally and on deploy) ──────────────
// Heartbeat: periodically update online status and sync from server
let heartbeatInterval = null;

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    if (!state.user || !socket?.connected) return;
    try {
      const { friends } = await api.getFriends();
      if (friends && friends.length) {
        friends.forEach(f => {
          const prev = state.friends.find(sf => sf.id === f.id);
          if (prev && prev.is_online !== f.is_online) {
            updateFriendOnlineStatus(f.id, f.is_online, f.last_seen);
          }
        });
        state.friends = friends;
      }
    } catch {}
  }, 30000);
}

// ── Resize handler ────────────────────────────────────────────
window.addEventListener('resize', () => {
  if (window.innerWidth >= 769) {
    document.getElementById('sidebar')?.classList.remove('hidden-mobile');
  }
});

// ── Keyboard shortcuts ─────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('overlay');
    if (!overlay.classList.contains('hidden')) closeModal();
  }
});

// ── Page visibility (mark offline when tab hidden on mobile) ──
document.addEventListener('visibilitychange', () => {
  if (!socket) return;
  if (document.hidden) {
    // Tab/app went to background — do nothing, socket handles disconnect
  } else {
    // Tab came back — rejoin rooms
    if (socket.connected) {
      socket.emit('join_global');
      if (activeFriend) {
        const convId = [state.user.id, activeFriend.id].sort().join('_');
        socket.emit('join_conversation', { conversationId: convId });
      }
    }
  }
});

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initApp);
