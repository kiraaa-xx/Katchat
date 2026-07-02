// ── Admin panel functions ─────────────────────────────────────
function openAdmin() { showView('admin'); loadAdminUsers(); }

async function loadAdminUsers() {
  const list = document.getElementById('admin-users-list');
  if (!list) return;
  list.innerHTML = `<div class="empty-state"><i class="fa fa-spinner fa-spin"></i><p>Loading users...</p></div>`;
  try {
    const { users } = await api.getAllUsers();
    list.innerHTML = '';
    if (!users || !users.length) {
      list.innerHTML = `<div class="empty-state"><i class="fa fa-users"></i><p>No users found</p></div>`;
      return;
    }
    users.forEach((u, i) => {
      const row = makeAdminUserRow(u);
      row.style.animationDelay = `${i * 0.04}s`;
      row.classList.add('admin-row-anim');
      list.appendChild(row);
    });
  } catch (err) {
    console.error('loadAdminUsers error:', err);
    list.innerHTML = `<div class="empty-state"><i class="fa fa-circle-exclamation"></i><p>${esc(err.message)}</p></div>`;
  }
}

function makeAdminUserRow(u) {
  const row = document.createElement('div');
  row.className = 'admin-row';
  const isSelf = u.id === state.user?.id;
  const isOwner = state.user?.role === 'owner';
  const isAdmin = state.user?.role === 'admin';
  const canManage = isOwner || (isAdmin && !['admin','owner'].includes(u.role));

  // Build avatar — show default avatar instead of empty black circle
  const av = makeAvEl(u, 'md');

  // Role selector — only owner can assign roles
  const roleOptions = isOwner && state.roles
    ? state.roles.map(r => `<option value="${r.name}" ${u.role===r.name?'selected':''}>${r.name}</option>`).join('')
    : '';

  const joinedDate = u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : 'N/A';
  const lastSeenTxt = u.is_online ? '<span class="online-badge"><i class="fa fa-circle"></i> Online</span>' : `<span style="color:var(--txt3);font-size:11px">Offline</span>`;

  row.innerHTML = `
    ${av.outerHTML}
    <div class="ar-info">
      <div class="ar-name">
        ${esc(u.display_name)} ${getRoleBadge(u.role)}
        ${u.is_banned_from_global ? `<span class="ban-badge"><i class="fa fa-ban"></i> Banned</span>` : ''}
      </div>
      <div class="ar-meta">
        <span><i class="fa fa-at" style="opacity:.5"></i> ${esc(u.username)}</span>
        ${u.pronouns ? `<span style="color:var(--txt3)">${esc(u.pronouns)}</span>` : ''}
        ${lastSeenTxt}
      </div>
      ${u.ban_reason ? `<div class="ar-meta" style="margin-top:3px"><span style="color:var(--danger);font-size:11px"><i class="fa fa-circle-info"></i> Ban reason: ${esc(u.ban_reason)}</span></div>` : ''}
      <div class="ar-meta" style="color:var(--txt3);font-size:10px;margin-top:3px">Joined ${joinedDate}</div>
    </div>
    <div class="ar-actions">
      ${isSelf ? `<span class="self-badge"><i class="fa fa-user"></i> You</span>` : ''}
      ${!isSelf && isOwner && roleOptions ? `
        <select class="field-select role-select" onchange="changeUserRole('${u.id}',this.value)">
          ${roleOptions}
        </select>` : ''}
      ${!isSelf && canManage
        ? u.is_banned_from_global
          ? `<button class="btn-xs primary" onclick="adminUnban('${u.id}', this)"><i class="fa fa-unlock"></i> Unban</button>`
          : `<button class="btn-xs danger" onclick="openBanDialog('${u.id}',${onclickStr(u.display_name)})"><i class="fa fa-ban"></i> Ban</button>`
        : ''}
      ${!isSelf && isOwner ? `<button class="btn-xs secondary" onclick="resetUserPassword('${u.id}',${onclickStr(u.display_name)})"><i class="fa fa-key"></i> Reset Password</button>` : ''}
    </div>`;
  return row;
}

function openBanDialog(userId, displayName) {
  document.getElementById('confirm-title').textContent = `Ban ${displayName}`;
  document.getElementById('confirm-msg').innerHTML = `
    <p style="margin-bottom:12px;color:var(--txt2)">Ban <strong>${esc(displayName)}</strong> from global chat.</p>
    <div class="form-group">
      <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2);margin-bottom:6px">Reason (optional)</label>
      <div class="field-wrap"><i class="fa fa-comment"></i><input type="text" id="ban-reason-input" placeholder="e.g. Spamming, harassment..." style="width:100%"></div>
    </div>`;
  document.getElementById('confirm-ok').onclick = async () => {
    const reason = document.getElementById('ban-reason-input')?.value.trim() || null;
    closeModal(); await adminBan(userId, reason);
  };
  openModal('m-confirm');
}

async function changeUserRole(userId, role) {
  try {
    await api.updateRole(userId, role);
    showToast('Role updated ✓', 'success');
    loadAdminUsers();
  } catch (err) { showToast(err.message, 'error'); }
}

async function adminBan(userId, reason = null) {
  try {
    await api.banUser(userId, reason);
    if (typeof socket !== 'undefined' && socket) socket.emit('admin_ban_user', { userId, reason });
    showToast(reason ? `User banned: "${reason}"` : 'User banned', 'info');
    loadAdminUsers();
  } catch (err) { showToast(err.message, 'error'); }
}

async function adminUnban(userId, btn) {
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>'; }
    await api.unbanUser(userId);
    if (typeof socket !== 'undefined' && socket) socket.emit('admin_unban_user', { userId });
    showToast('User unbanned ✓', 'success');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-unlock"></i> Unban'; }
  }
}

async function resetUserPassword(userId, displayName) {
  try {
    const { temporaryPassword } = await api.resetUserPassword(userId);
    document.getElementById('confirm-title').textContent = `✅ Password Reset`;
    document.getElementById('confirm-msg').innerHTML = `
      <p style="margin-bottom:12px;color:var(--txt2)">Password reset for <strong>${esc(displayName)}</strong></p>
      <div class="form-group">
        <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--txt2);margin-bottom:6px">Temporary Password (share securely):</label>
        <div class="field-wrap" style="position:relative">
          <input type="text" value="${esc(temporaryPassword)}" id="temp-pw-input" readonly style="width:100%;padding-right:40px" class="field-input">
          <button style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--accent);font-size:14px" onclick="copyToClipboard('${temporaryPassword}')"><i class="fa fa-copy"></i></button>
        </div>
        <p style="font-size:11px;color:var(--txt3);margin-top:8px">⚠ User must change this password on first login. Save this securely before closing.</p>
      </div>`;
    document.getElementById('confirm-ok').textContent = 'OK, Noted';
    document.getElementById('confirm-ok').onclick = () => { closeModal(); loadAdminUsers(); };
    openModal('m-confirm');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function copyToClipboard(text) {
  try {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard ✓', 'success');
  } catch {
    // Fallback for non-HTTPS environments
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('Copied to clipboard ✓', 'success');
  }
}

function filterAdminUsers(q) {
  document.querySelectorAll('#admin-users-list .admin-row').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

const PERM_DEFS = [
  { key:'canChat', label:'Private Chat', icon:'fa-comment' },
  { key:'canGlobalChat', label:'Global Chat', icon:'fa-globe' },
  { key:'canViewAnnouncements', label:'View Announcements', icon:'fa-bullhorn' },
  { key:'canCommentAnnouncements', label:'Comment on Posts', icon:'fa-comment-dots' },
  { key:'canCreateAnnouncements', label:'Create Announcements', icon:'fa-pen' },
  { key:'canDeleteMessages', label:'Delete Messages', icon:'fa-trash' },
  { key:'canBanUsers', label:'Ban Users', icon:'fa-ban' },
  { key:'canUseCommands', label:'Use /commands', icon:'fa-terminal' },
  { key:'canAccessAdminPanel', label:'Admin Panel Access', icon:'fa-shield-halved' },
  { key:'canManageRoles', label:'Manage Roles', icon:'fa-tag' },
  { key:'canManageUsers', label:'Manage Users', icon:'fa-users' },
];

const COLOR_SWATCHES = [
  '#22c55e','#06b6d4','#a855f7','#ef4444','#f59e0b',
  '#ec4899','#8b5cf6','#14b8a6','#f97316','#64748b',
  '#e11d48','#0ea5e9','#84cc16','#d97706','#ffffff'
];

async function loadAdminRoles() {
  const list = document.getElementById('admin-roles-list');
  if (!list) return;
  list.innerHTML = `<div class="empty-state"><i class="fa fa-spinner fa-spin"></i></div>`;
  try {
    const { roles } = await api.getRoles();
    state.roles = roles;
    list.innerHTML = '';
    roles.forEach((r, i) => {
      const row = makeRoleRow(r);
      row.style.animationDelay = `${i * 0.04}s`;
      row.classList.add('admin-row-anim');
      list.appendChild(row);
    });
  } catch (err) { list.innerHTML = `<div class="empty-state"><i class="fa fa-circle-exclamation"></i><p>${esc(err.message)}</p></div>`; }
}

function makeRoleRow(role) {
  const row = document.createElement('div');
  row.className = 'admin-row';
  const iconCls = role.icon || 'fa-solid fa-user';
  const perms = Object.entries(role.permissions || {}).filter(([,v]) => v).map(([k]) => {
    const def = PERM_DEFS.find(p => p.key === k);
    return def ? `<span style="font-size:10px;background:${role.color}18;color:${role.color};padding:2px 6px;border-radius:10px;border:1px solid ${role.color}30">${def.label}</span>` : '';
  }).join('');
  row.innerHTML = `
    <div style="width:18px;height:18px;border-radius:50%;background:${role.color};flex-shrink:0;box-shadow:0 0 8px ${role.color}80"></div>
    <div class="ar-info">
      <div class="ar-name">
        <i class="${iconCls}" style="color:${role.color}"></i>
        <span style="color:${role.color};font-weight:700">${esc(role.name)}</span>
        ${role.is_system ? '<span style="font-size:10px;color:var(--txt3);padding:2px 6px;background:var(--bg3);border-radius:10px;border:1px solid var(--border)">System</span>' : ''}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">${perms || '<span style="font-size:11px;color:var(--txt3)">No permissions</span>'}</div>
    </div>
    <div class="ar-actions">
      <button class="btn-xs" onclick="openRoleModal('${role.name}')"><i class="fa fa-pen"></i> Edit</button>
      ${!role.is_system ? `<button class="btn-xs danger" onclick="deleteRole('${role.name}')"><i class="fa fa-trash"></i></button>` : ''}
    </div>`;
  return row;
}

function openRoleModal(roleName) {
  editingRoleName = roleName;
  const isEdit = !!roleName;
  document.getElementById('role-modal-title').innerHTML = isEdit ? '<i class="fa fa-pen"></i> Edit Role' : '<i class="fa fa-tag"></i> Create Role';
  document.getElementById('role-submit-label').textContent = isEdit ? 'Save Changes' : 'Create Role';
  document.getElementById('role-name').value = '';
  document.getElementById('role-name').disabled = false;
  document.getElementById('role-icon').value = 'fa-solid fa-user';
  document.getElementById('role-color').value = '#22c55e';
  document.getElementById('role-color-hex').value = '#22c55e';
  document.getElementById('icon-preview').innerHTML = '<i class="fa-solid fa-user"></i> Preview';
  document.getElementById('color-swatches').innerHTML = COLOR_SWATCHES.map(c => `<div class="color-swatch" style="background:${c}" onclick="setRoleColor('${c}')" title="${c}"></div>`).join('');
  document.getElementById('permissions-grid').innerHTML = PERM_DEFS.map(p => `
    <label class="perm-item" id="perm-${p.key}">
      <input type="checkbox" id="perm-check-${p.key}" onchange="this.closest('.perm-item').classList.toggle('checked',this.checked)">
      <i class="fa ${p.icon}" style="font-size:13px;width:16px;text-align:center"></i>
      <span>${p.label}</span>
    </label>`).join('');
  if (isEdit) {
    const role = state.roles.find(r => r.name === roleName);
    if (role) {
      document.getElementById('role-name').value = role.name;
      document.getElementById('role-name').disabled = true;
      document.getElementById('role-icon').value = role.icon || 'fa-solid fa-user';
      document.getElementById('role-color').value = role.color || '#22c55e';
      document.getElementById('role-color-hex').value = role.color || '#22c55e';
      previewRoleIcon(role.icon);
      PERM_DEFS.forEach(p => {
        const cb = document.getElementById(`perm-check-${p.key}`);
        if (cb && role.permissions?.[p.key]) { cb.checked = true; document.getElementById(`perm-${p.key}`)?.classList.add('checked'); }
      });
    }
  }
  openModal('m-role');
}

function setRoleColor(hex) {
  document.getElementById('role-color').value = hex;
  document.getElementById('role-color-hex').value = hex;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.title === hex));
}
function syncColorFromHex(val) { if (/^#[0-9a-fA-F]{6}$/.test(val)) document.getElementById('role-color').value = val; }
function previewRoleIcon(cls) {
  const preview = document.getElementById('icon-preview');
  if (!cls || !cls.includes('fa-')) { preview.innerHTML = '<i class="fa-solid fa-user"></i> Preview'; return; }
  const parts = cls.trim().split(' ').filter(p => p.startsWith('fa')).join(' ');
  preview.innerHTML = `<i class="${parts || 'fa-solid fa-user'}"></i> ${parts ? cls : 'invalid class'}`;
}
function setIcon(cls) { document.getElementById('role-icon').value = cls; previewRoleIcon(cls); }

async function submitRole() {
  const name = document.getElementById('role-name').value.trim();
  const color = document.getElementById('role-color-hex').value.trim() || document.getElementById('role-color').value;
  const icon = document.getElementById('role-icon').value.trim() || 'fa-solid fa-user';
  const permissions = {};
  PERM_DEFS.forEach(p => { permissions[p.key] = document.getElementById(`perm-check-${p.key}`)?.checked || false; });
  if (!editingRoleName && !name) { showToast('Role name is required', 'error'); return; }
  if (!color) { showToast('Role color is required', 'error'); return; }
  try {
    if (editingRoleName) { await api.updateRoleData(editingRoleName, { color, icon, permissions }); showToast('Role updated!', 'success'); }
    else { await api.createRole({ name, color, icon, permissions }); showToast(`Role "${name}" created!`, 'success'); }
    closeModal();
    const { roles } = await api.getRoles();
    state.roles = roles;
    loadAdminRoles();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteRole(name) {
  showConfirm('Delete Role', `Delete the "${name}" role? Users with this role become members.`, async () => {
    try {
      await api.deleteRole(name);
      showToast('Role deleted', 'info');
      const { roles } = await api.getRoles(); state.roles = roles; loadAdminRoles();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function adminTab(tab, btn) {
  document.querySelectorAll('.admin-tabs .stab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['users','roles','bans','posts'].forEach(t => { document.getElementById(`at-${t}`)?.classList.toggle('hidden', t !== tab); });
  if (tab === 'users') loadAdminUsers();
  else if (tab === 'roles') loadAdminRoles();
  else if (tab === 'bans') loadAdminBans();
  else if (tab === 'posts') loadAdminPosts();
}

async function loadAdminBans() {
  const list = document.getElementById('admin-bans-list');
  if (!list) return;
  list.innerHTML = `<div class="empty-state"><i class="fa fa-spinner fa-spin"></i><p>Loading banned users...</p></div>`;
  try {
    // Use dedicated banned endpoint for accuracy
    const { users: banned } = await api.getBannedUsers();
    list.innerHTML = '';
    if (!banned || !banned.length) {
      list.innerHTML = `<div class="empty-state"><i class="fa fa-check-circle" style="color:var(--accent)"></i><p>No banned users 🎉</p></div>`;
      return;
    }
    banned.forEach(u => {
      const row = document.createElement('div');
      row.className = 'admin-row admin-row-anim';
      const av = makeAvEl(u, 'md');
      const bannedDate = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A';
      row.innerHTML = `${av.outerHTML}
        <div class="ar-info">
          <div class="ar-name">${esc(u.display_name)} <span class="ban-badge"><i class="fa fa-ban"></i> Banned</span></div>
          <div class="ar-meta">
            <span><i class="fa fa-at" style="opacity:.5"></i> ${esc(u.username)}</span>
          </div>
          ${u.ban_reason ? `<div class="ar-meta"><span style="color:var(--danger);font-size:11px"><i class="fa fa-circle-info"></i> Reason: ${esc(u.ban_reason)}</span></div>` : ''}
          <div class="ar-meta" style="color:var(--txt3);font-size:10px">Joined ${bannedDate}</div>
        </div>
        <div class="ar-actions">
          <button class="btn-xs primary" onclick="adminUnbanFromBans('${u.id}', ${onclickStr(u.display_name)}, this)"><i class="fa fa-unlock"></i> Unban</button>
        </div>`;
      list.appendChild(row);
    });
  } catch (err) {
    console.error('loadAdminBans error:', err);
    list.innerHTML = `<div class="empty-state"><i class="fa fa-circle-exclamation"></i><p>${esc(err.message)}</p></div>`;
  }
}

async function adminUnbanFromBans(userId, displayName, btn) {
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>'; }
    await api.unbanUser(userId);
    if (typeof socket !== 'undefined' && socket) socket.emit('admin_unban_user', { userId });
    showToast(`${displayName} unbanned ✓`, 'success');
    // Remove from bans list immediately
    btn.closest('.admin-row')?.remove();
    // Check if list is now empty
    const list = document.getElementById('admin-bans-list');
    if (list && !list.querySelector('.admin-row')) {
      list.innerHTML = `<div class="empty-state"><i class="fa fa-check-circle" style="color:var(--accent)"></i><p>No banned users 🎉</p></div>`;
    }
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-unlock"></i> Unban'; }
  }
}
window.adminUnbanFromBans = adminUnbanFromBans;

async function loadAdminPosts() {
  const list = document.getElementById('admin-posts-list');
  if (!list) return;
  list.innerHTML = `<div class="empty-state"><i class="fa fa-spinner fa-spin"></i></div>`;
  try {
    const { announcements } = await api.getAnnouncements();
    list.innerHTML = '';
    if (!announcements || !announcements.length) {
      list.innerHTML = `<div class="empty-state"><i class="fa fa-bullhorn"></i><p>No posts yet</p></div>`;
      return;
    }
    announcements.forEach(ann => {
      const row = document.createElement('div');
      row.className = 'admin-row admin-row-anim';
      const imgThumb = ann.image ? `<img src="${ann.image}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;flex-shrink:0" onerror="this.remove()">` : '';
      row.innerHTML = `
        ${imgThumb}
        <div class="ar-info">
          <div class="ar-name">${esc(ann.title)} ${ann.pinned ? '<span class="ann-pin-badge" style="font-size:10px;margin-left:6px"><i class="fa fa-thumbtack"></i> Pinned</span>' : ''}</div>
          <div class="ar-meta">${esc(ann.content.substring(0,80))}${ann.content.length>80?'...':''}</div>
          ${ann.image ? `<div class="ar-meta" style="font-size:11px;color:var(--accent)"><i class="fa fa-image"></i> Has image</div>` : ''}
        </div>
        <div class="ar-actions">
          <button class="btn-xs" onclick="openAnnModal('${ann.id}')"><i class="fa fa-pen"></i> Edit</button>
          <button class="btn-xs danger" onclick="deleteAnn('${ann.id}');setTimeout(loadAdminPosts,400)"><i class="fa fa-trash"></i></button>
        </div>`;
      list.appendChild(row);
    });
  } catch (err) { list.innerHTML = `<div class="empty-state"><i class="fa fa-circle-exclamation"></i><p>${esc(err.message)}</p></div>`; }
}

window.openAdmin = openAdmin;
window.adminTab = adminTab;
window.openBanDialog = openBanDialog;
window.changeUserRole = changeUserRole;
window.adminBan = adminBan;
window.adminUnban = adminUnban;
window.resetUserPassword = resetUserPassword;
window.copyToClipboard = copyToClipboard;
window.filterAdminUsers = filterAdminUsers;
window.loadAdminUsers = loadAdminUsers;
window.loadAdminRoles = loadAdminRoles;
window.openRoleModal = openRoleModal;
window.setRoleColor = setRoleColor;
window.previewRoleIcon = previewRoleIcon;
window.setIcon = setIcon;
window.submitRole = submitRole;
window.deleteRole = deleteRole;
window.syncColorFromHex = syncColorFromHex;
window.loadAdminBans = loadAdminBans;
window.loadAdminPosts = loadAdminPosts;
