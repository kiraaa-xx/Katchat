const ACCENT_THEMES = {
  cyan:    { h: 192, s: 72, l: 45, label: 'Cyan', emoji: '🩵' },
  emerald: { h: 156, s: 74, l: 42, label: 'Emerald', emoji: '🌲' },
  blue:    { h: 210, s: 80, l: 52, label: 'Blue', emoji: '🔵' },
  purple:  { h: 275, s: 72, l: 56, label: 'Purple', emoji: '🟣' },
  pink:    { h: 330, s: 75, l: 58, label: 'Pink', emoji: '🌸' },
  red:     { h: 0,   s: 78, l: 56, label: 'Red', emoji: '❤️' },
  orange:  { h: 28,  s: 77, l: 48, label: 'Orange', emoji: '🟧' },
};

function renderAccentColors() {
  const grid = document.getElementById('accent-grid');
  if (!grid || grid.dataset.rendered) return;
  grid.dataset.rendered = '1';
  const current = state.user?.accent_color || localStorage.getItem('kc_accent') || 'cyan';
  Object.keys(ACCENT_THEMES).forEach(key => {
    const t = ACCENT_THEMES[key];
    const card = document.createElement('button');
    card.className = 'accent-card' + (key === current ? ' selected' : '');
    card.dataset.accent = key;
    card.setAttribute('aria-label', t.label);
    card.setAttribute('title', t.label);
    card.innerHTML = '<span class="accent-swatch" style="--swatch-h:' + t.h + ';--swatch-s:' + t.s + '%;--swatch-l:' + t.l + '%"></span><span class="accent-label">' + t.emoji + ' ' + t.label + '</span><span class="accent-check"><i class="fa fa-check"></i></span>';
    card.onclick = function () { applyAccentColor(key); };
    grid.appendChild(card);
  });
}

function applyAccentColor(key) {
  const theme = ACCENT_THEMES[key];
  if (!theme) return;
  const root = document.documentElement;
  root.classList.add('accent-transitioning');
  clearTimeout(root._accentTimer);
  root._accentTimer = setTimeout(function () { root.classList.remove('accent-transitioning'); }, 300);
  root.style.setProperty('--accent-h', theme.h);
  root.style.setProperty('--accent-s', theme.s + '%');
  root.style.setProperty('--accent-l', theme.l + '%');
  localStorage.setItem('kc_accent', key);
  if (state.user) {
    state.user.accent_color = key;
    api.updateProfile({ accentColor: key }).catch(function () {});
  }
  document.querySelectorAll('.accent-card').forEach(function (el) {
    el.classList.toggle('selected', el.dataset.accent === key);
  });
}

function initAccentColor() {
  const key = state.user?.accent_color || localStorage.getItem('kc_accent') || 'cyan';
  const theme = ACCENT_THEMES[key];
  if (!theme) return;
  const root = document.documentElement;
  root.style.setProperty('--accent-h', theme.h);
  root.style.setProperty('--accent-s', theme.s + '%');
  root.style.setProperty('--accent-l', theme.l + '%');
}

function openSettings() {
  showView('settings');
  const u = state.user;
  if (!u) return;
  const av = document.getElementById('settings-av');
  av.className = 'av xl';
  setAvEl(av, u);
  document.getElementById('sh-name').textContent = u.display_name;
  document.getElementById('sh-username').textContent = '@' + u.username;
  document.getElementById('sh-role-badge').innerHTML = getRoleBadge(u.role);
  document.getElementById('sh-pronouns').textContent = u.pronouns || '';
  document.getElementById('set-name').value = u.display_name;
  document.getElementById('set-gender').value = u.gender || 'prefer-not-to-say';
  document.getElementById('set-bio').value = u.bio || '';
  const wc = (u.bio||'').trim().split(/\s+/).filter(Boolean).length;
  document.getElementById('bio-count').textContent = wc+'/20 words';
  document.documentElement.setAttribute('data-theme', u.theme || 'dark');
  document.getElementById('fast-mode-toggle').checked = localStorage.getItem('kc_fast_mode') === '1';
  const pmNotif = document.getElementById('notif-pm-toggle');
  if (pmNotif) pmNotif.checked = notificationSystem.isEnabled('pm');
  const anNotif = document.getElementById('notif-announce-toggle');
  if (anNotif) anNotif.checked = notificationSystem.isEnabled('announce');
  const isAdmin = state.roles.find(r => r.name === u.role)?.permissions?.canAccessAdminPanel;
  document.getElementById('admin-card').classList.toggle('hidden', !isAdmin);
  renderAccentColors();
}

async function saveProfile() {
  const displayName = document.getElementById('set-name').value.trim();
  const bio = document.getElementById('set-bio').value.trim();
  const gender = document.getElementById('set-gender').value;
  if (!displayName) { showToast('Display name cannot be empty', 'error'); return; }
  if (bio.split(/\s+/).filter(Boolean).length > 20) { showToast('Bio exceeds 20 words', 'error'); return; }
  try {
    const { user } = await api.updateProfile({ displayName, bio, gender });
    state.user = { ...state.user, ...user };
    updateTopbarAv();
    showToast('Profile saved!', 'success');
    openSettings();
  } catch (err) { showToast(err.message, 'error'); }
}

async function changePassword() {
  const curr = document.getElementById('set-curr-pw').value;
  const next = document.getElementById('set-new-pw').value;
  if (!curr || !next) { showToast('Fill in both password fields', 'error'); return; }
  if (next.length < 8) { showToast('New password must be at least 8 characters', 'error'); return; }
  try {
    await api.changePassword({ currentPassword: curr, newPassword: next });
    showToast('Password changed!', 'success');
    document.getElementById('set-curr-pw').value = '';
    document.getElementById('set-new-pw').value = '';
  } catch (err) { showToast(err.message, 'error'); }
}

function updateThemeLogos() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  document.querySelectorAll('.theme-logo').forEach(function (img) {
    img.src = theme === 'light' ? 'assets/logo_black.png' : 'assets/logo.png';
  });
}
window.updateThemeLogos = updateThemeLogos;

function toggleTheme() {
  const curr = document.documentElement.getAttribute('data-theme');
  const next = curr === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.content = next === 'light' ? '#ffffff' : '#0a0a0a';
  updateThemeLogos();
  if (state.user) { state.user.theme = next; api.updateProfile({ theme: next }).catch(err => console.warn('theme update failed:', err)); }
}

let _avCropFile = null;
let _avCropZoom = 1;
let _avCropX = 0;
let _avCropY = 0;

function handleAvatarUpload(input) {
  if (!input.files[0]) return;
  _avCropFile = input.files[0];
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = document.getElementById('av-crop-img');
    img.src = e.target.result;
    openModal('m-av-crop');
    requestAnimationFrame(function () {
      if (img.complete) {
        fitAvatarCrop();
      } else {
        img.onload = fitAvatarCrop;
      }
    });
  };
  reader.readAsDataURL(input.files[0]);
  input.value = '';
}

function fitAvatarCrop() {
  const vp = document.getElementById('av-crop-viewport');
  const img = document.getElementById('av-crop-img');
  const vpSize = vp.offsetWidth;
  if (vpSize <= 0) return;
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  const fitZoom = Math.min(vpSize / natW, vpSize / natH);
  _avCropZoom = fitZoom;
  // Center the unscaled image in the viewport.
  // translate(X,Y) moves the element, then scale(Z) scales from its center.
  // The visible center after both transforms = (X + natW/2, Y + natH/2).
  // Set this equal to viewport center: X = (vpSize - natW) / 2
  _avCropX = (vpSize - natW) / 2;
  _avCropY = (vpSize - natH) / 2;
  const slider = document.getElementById('av-crop-zoom');
  slider.value = fitZoom;
  applyAvCropTransform();
  // Reset drag lock so init re-registers listeners (supports re-opening modal)
  vp._avDragInit = false;
  requestAnimationFrame(initAvCropDrag);
}

let _avCropDragging = false, _avCropStartX = 0, _avCropStartY = 0, _avCropRafId = null;
let _avCropPinch = null;
function initAvCropDrag() {
  const vp = document.getElementById('av-crop-viewport');
  if (!vp || vp._avDragInit) return;
  vp._avDragInit = true;
  const onStart = function (x, y) {
    _avCropDragging = true;
    _avCropStartX = x - _avCropX;
    _avCropStartY = y - _avCropY;
    vp.style.cursor = 'grabbing';
  };
  const batchMove = function () {
    _avCropRafId = null;
    applyAvCropTransform();
  };
  const onMove = function (x, y) {
    if (!_avCropDragging) return;
    _avCropX = x - _avCropStartX;
    _avCropY = y - _avCropStartY;
    if (!_avCropRafId) _avCropRafId = requestAnimationFrame(batchMove);
  };
  const clampPos = function () {
    const vpSize = vp.offsetWidth;
    const img = document.getElementById('av-crop-img');
    const natW = img.naturalWidth, natH = img.naturalHeight;
    const Z = _avCropZoom;
    const maxOffset = vpSize * 0.5;
    const limitX = Math.max(maxOffset, (natW * Z - vpSize) * 0.5);
    const limitY = Math.max(maxOffset, (natH * Z - vpSize) * 0.5);
    _avCropX = Math.max(-limitX, Math.min(limitX, _avCropX));
    _avCropY = Math.max(-limitY, Math.min(limitY, _avCropY));
    applyAvCropTransform();
  };
  const onEnd = function () {
    if (_avCropRafId) { cancelAnimationFrame(_avCropRafId); _avCropRafId = null; }
    _avCropDragging = false;
    vp.style.cursor = 'grab';
    clampPos();
  };
  vp.addEventListener('mousedown', function (e) { onStart(e.clientX, e.clientY); });
  window.addEventListener('mousemove', function (e) { onMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', onEnd);
  vp.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      if (_avCropRafId) { cancelAnimationFrame(_avCropRafId); _avCropRafId = null; }
      _avCropDragging = false;
      const t1 = e.touches[0], t2 = e.touches[1];
      _avCropPinch = {
        initialDist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
        initialZoom: _avCropZoom
      };
    }
  }, { passive: true });
  vp.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && _avCropPinch) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const newZoom = Math.max(0.1, Math.min(5, _avCropPinch.initialZoom * (dist / _avCropPinch.initialDist)));
      if (newZoom !== _avCropZoom) {
        const img = document.getElementById('av-crop-img');
        const ox = img.naturalWidth / 2, oy = img.naturalHeight / 2;
        const rect = vp.getBoundingClientRect();
        const mx = (t1.clientX + t2.clientX) / 2 - rect.left;
        const my = (t1.clientY + t2.clientY) / 2 - rect.top;
        const Z_old = _avCropZoom, Z_new = newZoom;
        const inv = (Z_old - Z_new) / (Z_old * Z_new);
        _avCropX += (mx - ox) * inv;
        _avCropY += (my - oy) * inv;
        _avCropZoom = newZoom;
        document.getElementById('av-crop-zoom').value = newZoom;
        applyAvCropTransform();
      }
    } else if (e.touches.length === 1 && _avCropDragging) {
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });
  vp.addEventListener('touchend', function (e) {
    if (e.touches.length === 0) {
      _avCropPinch = null;
      onEnd();
    } else if (e.touches.length === 1 && _avCropPinch) {
      _avCropPinch = null;
      if (_avCropRafId) { cancelAnimationFrame(_avCropRafId); _avCropRafId = null; }
      _avCropDragging = false;
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });
  vp.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.05 : 0.95;
    const newZoom = Math.max(0.1, Math.min(5, _avCropZoom * factor));
    if (newZoom !== _avCropZoom) {
      const img = document.getElementById('av-crop-img');
      const ox = img.naturalWidth / 2, oy = img.naturalHeight / 2;
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const Z_old = _avCropZoom, Z_new = newZoom;
      const inv = (Z_old - Z_new) / (Z_old * Z_new);
      _avCropX += (mx - ox) * inv;
      _avCropY += (my - oy) * inv;
      _avCropZoom = newZoom;
      document.getElementById('av-crop-zoom').value = newZoom;
      applyAvCropTransform();
    }
  }, { passive: false });
}

function applyAvCropTransform() {
  const img = document.getElementById('av-crop-img');
  if (!img) return;
  img.style.transform = `translate(${_avCropX}px, ${_avCropY}px) scale(${_avCropZoom})`;
}

function setAvCropZoom(val) {
  _avCropZoom = parseFloat(val);
  applyAvCropTransform();
}

async function applyAvatarCrop() {
  const vp = document.getElementById('av-crop-viewport');
  const img = document.getElementById('av-crop-img');
  if (!vp || !img || !_avCropFile) return;
  const size = vp.offsetWidth;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  const Z = _avCropZoom;
  const cx = natW / 2, cy = natH / 2;
  // Inverse of translate(X,Y) scale(Z) from element center (CSS default transform-origin)
  const sx = cx + (-_avCropX - cx) / Z;
  const sy = cy + (-_avCropY - cy) / Z;
  const sw = size / Z;
  const sh = size / Z;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  closeModal();
  try {
    const blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.92); });
    const fd = new FormData();
    fd.append('avatar', blob, 'avatar.jpg');
    const { profilePicture } = await api.uploadAvatar(fd);
    state.user.profile_picture = profilePicture;
    setAvEl(document.getElementById('settings-av'), state.user);
    updateTopbarAv();
    showToast('Avatar updated!', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

window.openSettings = openSettings;
window.saveProfile = saveProfile;
window.changePassword = changePassword;
window.toggleTheme = toggleTheme;
window.toggleFastMode = toggleFastMode;
window.handleAvatarUpload = handleAvatarUpload;
window.applyAvatarCrop = applyAvatarCrop;
window.setAvCropZoom = setAvCropZoom;
window.applyAccentColor = applyAccentColor;
window.initAccentColor = initAccentColor;

function updateBioCount() {
  const val = document.getElementById('set-bio')?.value || '';
  const count = val.trim() ? val.trim().split(/\s+/).filter(Boolean).length : 0;
  document.getElementById('bio-count').textContent = count + '/20 words';
}
window.updateBioCount = updateBioCount;

function toggleFastMode(enabled) {
  document.documentElement.classList.toggle('fast-mode', enabled);
  localStorage.setItem('kc_fast_mode', enabled ? '1' : '0');
}

function toggleNotif(type, enabled) {
  if (window.notificationSystem && notificationSystem.setEnabled) {
    notificationSystem.setEnabled(type, enabled);
  }
}
window.toggleNotif = toggleNotif;

// Apply fast mode on page load
(function() {
  if (localStorage.getItem('kc_fast_mode') === '1') {
    document.documentElement.classList.add('fast-mode');
  }
})();

function toggleAbout(btn) {
  const full = btn.nextElementSibling;
  const icon = btn.querySelector('i');
  const isOpen = full.classList.contains('visible');
  if (isOpen) {
    full.classList.remove('visible');
    full.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<i class="fa fa-chevron-down" aria-hidden="true"></i> Read more';
  } else {
    full.classList.add('visible');
    full.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    btn.innerHTML = '<i class="fa fa-chevron-up" aria-hidden="true"></i> Read less';
  }
}

window.toggleAbout = toggleAbout;

// ── Contact Owner ────────────────────────────────────────────
window.messageOwner = function() { openOwnerContact(); };

window.emailOwner = function emailOwner() {
  window.location.href = 'mailto:katchat369@gmail.com?subject=KatChat%20Support';
}
window.emailOwner = emailOwner;
