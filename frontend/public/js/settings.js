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
  document.documentElement.setAttribute('data-theme', u.theme || 'dark');
  const isAdmin = state.roles.find(r => r.name === u.role)?.permissions?.canAccessAdminPanel;
  document.getElementById('admin-card').classList.toggle('hidden', !isAdmin);
}

async function saveProfile() {
  const displayName = document.getElementById('set-name').value.trim();
  const gender = document.getElementById('set-gender').value;
  if (!displayName) { showToast('Display name cannot be empty', 'error'); return; }
  try {
    const { user } = await api.updateProfile({ displayName, gender });
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
  if (state.user) { state.user.theme = next; api.updateProfile({ theme: next }).catch(err => console.warn('theme update failed:', err)); }
}

async function handleAvatarUpload(input) {
  if (!input.files[0]) return;
  try {
    const fd = new FormData();
    fd.append('avatar', input.files[0]);
    const { profilePicture } = await api.uploadAvatar(fd);
    state.user.profile_picture = profilePicture;
    setAvEl(document.getElementById('settings-av'), state.user);
    updateTopbarAv();
    showToast('Avatar updated!', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

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
