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
  updateThemeLogos();
  initSocket(state.token);
  await loadFriends();
  showView('welcome');
  loadWelcomeAnnouncements();
  initWelcomeAnimations();
  // Start announcement polling
  startAnnouncementPoll();
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

// ── Announcement Polling ──────────────────────────────────────
let _annPollInterval = null;

function startAnnouncementPoll() {
  stopAnnouncementPoll();
  // Check immediately on start
  checkNewAnnouncements();
  // Then every 60 seconds
  _annPollInterval = setInterval(checkNewAnnouncements, 60000);
}

function stopAnnouncementPoll() {
  if (_annPollInterval) {
    clearInterval(_annPollInterval);
    _annPollInterval = null;
  }
}

async function checkNewAnnouncements() {
  if (!state.user || document.hidden) return;
  try {
    const { announcements } = await api.getAnnouncements();
    if (!announcements || !announcements.length) return;
    const latestId = Math.max(...announcements.map(a => a.id));
    const lastSeen = parseInt(localStorage.getItem('kc_last_announcement_id') || '0', 10);
    if (latestId > lastSeen) {
      // Find new announcements (those with id > lastSeen)
      const newOnes = announcements.filter(a => a.id > lastSeen);
      newOnes.forEach(ann => {
        if (window.notificationSystem && notificationSystem.isEnabled('announce')) {
          notificationSystem.notifyAnnouncement(ann.title, ann.content, function() {
            navTo('announcements');
          });
        }
        showToast(`📢 New announcement: ${ann.title}`, 'info');
      });
      localStorage.setItem('kc_last_announcement_id', String(latestId));
    }
  } catch {}
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

// ── Page visibility (pause animations, rejoin rooms) ──
document.addEventListener('visibilitychange', () => {
  var hero = document.querySelector('.welcome-hero');
  if (hero) hero.classList.toggle('anim-paused', document.hidden);
  if (document.hidden) {
    if (_sparkleTimer) clearInterval(_sparkleTimer);
  } else {
    startWelcomeSparkles();
  }
  if (!socket) return;
  if (!document.hidden && socket.connected) {
    socket.emit('join_global');
    if (activeFriend) {
      const convId = [state.user.id, activeFriend.id].sort().join('_');
      socket.emit('join_conversation', { conversationId: convId });
    }
    checkNewAnnouncements();
  }
});

// ── Welcome Animation Init ───────────────────────────────────
function initWelcomeAnimations() {
  spawnWelcomeParticles();
  startWelcomeSparkles();
  initWelcomeParallax();
}

function spawnWelcomeParticles() {
  var container = document.getElementById('welcome-particles');
  if (!container || container.dataset.spawned) return;
  container.dataset.spawned = '1';
  var count = window.innerWidth < 768 ? 5 : 8;
  for (var i = 0; i < count; i++) {
    var p = document.createElement('div');
    p.className = 'welcome-particle';
    p.style.cssText = 'left:' + (15 + Math.random() * 70) + '%;top:' + (20 + Math.random() * 60) + '%;--dx:' + ((Math.random() - 0.5) * 80) + 'px;--dy:' + ((Math.random() - 0.5) * 80) + 'px;animation-duration:' + (8 + Math.random() * 10) + 's;animation-delay:' + (Math.random() * 6) + 's;width:' + (1.5 + Math.random() * 2) + 'px;height:' + (1.5 + Math.random() * 2) + 'px';
    container.appendChild(p);
  }
}

var _sparkleTimer = null;

function startWelcomeSparkles() {
  var container = document.getElementById('welcome-sparkles');
  if (!container) return;
  if (_sparkleTimer) clearInterval(_sparkleTimer);
  _sparkleTimer = setInterval(function () {
    if (document.hidden) return;
    var s = document.createElement('div');
    s.className = 'welcome-sparkle';
    s.style.cssText = 'left:' + (35 + Math.random() * 30) + '%;top:' + (28 + Math.random() * 24) + '%;animation-duration:' + (1.2 + Math.random() * 1) + 's';
    container.appendChild(s);
    s.addEventListener('animationend', function () { s.remove(); });
  }, 3000);
}

function initWelcomeParallax() {
  var welcome = document.getElementById('v-welcome');
  var glow = document.getElementById('welcome-glow');
  if (!welcome || !glow) return;
  welcome.addEventListener('mousemove', function (e) {
    var rect = welcome.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width - 0.5;
    var y = (e.clientY - rect.top) / rect.height - 0.5;
    glow.style.transform = 'translate(calc(-50% + ' + (x * 16) + 'px),calc(-60% + ' + (y * 12) + 'px))';
  });
  welcome.addEventListener('mouseleave', function () {
    glow.style.transform = '';
  });
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initApp);
