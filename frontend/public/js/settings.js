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
  const isAdmin = state.roles.find(r => r.name === u.role)?.permissions?.canAccessAdminPanel;
  document.getElementById('admin-card').classList.toggle('hidden', !isAdmin);
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

function toggleTheme() {
  const curr = document.documentElement.getAttribute('data-theme');
  const next = curr === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.content = next === 'light' ? '#ffffff' : '#0a0a0a';
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

let _avCropDragging = false, _avCropStartX = 0, _avCropStartY = 0;
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
  const onMove = function (x, y) {
    if (!_avCropDragging) return;
    _avCropX = x - _avCropStartX;
    _avCropY = y - _avCropStartY;
    applyAvCropTransform();
  };
  const onEnd = function () {
    _avCropDragging = false;
    vp.style.cursor = 'grab';
  };
  vp.addEventListener('mousedown', function (e) { onStart(e.clientX, e.clientY); });
  window.addEventListener('mousemove', function (e) { onMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', onEnd);
  vp.addEventListener('touchstart', function (e) { const t = e.touches[0]; onStart(t.clientX, t.clientY); }, { passive: true });
  vp.addEventListener('touchmove', function (e) { const t = e.touches[0]; onMove(t.clientX, t.clientY); }, { passive: true });
  vp.addEventListener('touchend', onEnd, { passive: true });
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
