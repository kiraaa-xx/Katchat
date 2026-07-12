// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-wrap');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.setAttribute('role', 'status');
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const colors = { success: 'var(--accent)', error: 'var(--danger)', info: 'var(--cyan)' };
  t.innerHTML = `<i class="fa ${icons[type] || icons.info}" style="color:${colors[type] || colors.info}" aria-hidden="true"></i><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(16px)'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, 3200);
}

// ── Avatar ────────────────────────────────────────────────────
function makeAvEl(user, size = 'md') {
  const el = document.createElement('div');
  el.className = `av ${size}`;
  el.style.background = user.profile_color || user.profileColor || '#555';
  if (user.profile_picture || user.profilePicture) {
    const img = document.createElement('img');
    img.src = user.profile_picture || user.profilePicture;
    img.alt = user.display_name || user.displayName || '';
    img.onerror = () => { img.remove(); el.textContent = initials(user); };
    el.appendChild(img);
  } else {
    el.textContent = initials(user);
  }
  return el;
}

function setAvEl(el, user) {
  el.style.background = user.profile_color || user.profileColor || '#555';
  el.innerHTML = '';
  if (user.profile_picture || user.profilePicture) {
    const img = document.createElement('img');
    img.src = user.profile_picture || user.profilePicture;
    img.alt = '';
    img.onerror = () => { img.remove(); el.textContent = initials(user); };
    el.appendChild(img);
  } else {
    el.textContent = initials(user);
  }
}

function initials(user) {
  const name = user.display_name || user.displayName || user.username || '?';
  return name[0].toUpperCase();
}

// ── Role badge ────────────────────────────────────────────────
function getRoleBadge(role, roles = state.roles) {
  const found = roles.find(r => r.name === role);
  if (!found) return '';
  const iconCls = found.icon || 'fa-solid fa-user';
  const cls = role === 'owner' ? 'rb-owner' : role === 'admin' ? 'rb-admin' : 'rb-member';
  return `<span class="role-badge ${cls}" style="color:${found.color};border-color:${found.color}40;background:${found.color}15">
    <i class="${iconCls}" style="color:${found.color}"></i> ${found.name}
  </span>`;
}

function getRoleColor(role) {
  const found = state.roles.find(r => r.name === role);
  return found?.color || '#888';
}

// ── Time ──────────────────────────────────────────────────────
function fmtTime(d) { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function fmtDate(d) {
  const now = new Date(), dd = new Date(d), diff = now - dd;
  if (diff < 86400000 && dd.getDate() === now.getDate()) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  return dd.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function fmtLastSeen(d) {
  if (!d) return 'Offline';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'Last seen just now';
  if (s < 3600) return `Last seen ${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `Last seen ${Math.floor(s / 3600)}h ago`;
  return `Last seen ${new Date(d).toLocaleDateString()}`;
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById('overlay').classList.remove('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  const modal = document.getElementById(id);
  modal.classList.remove('hidden');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  const firstFocusable = modal.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (firstFocusable) setTimeout(() => firstFocusable.focus(), 100);
}
function closeModal() {
  document.getElementById('overlay').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => { m.classList.add('hidden'); m.removeAttribute('role'); m.removeAttribute('aria-modal'); });
}
function overlayClick(e) { if (e.target === document.getElementById('overlay')) closeModal(); }

// ── Confirm ───────────────────────────────────────────────────
function showConfirm(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-ok').onclick = () => { closeModal(); cb(); };
  openModal('m-confirm');
}

// ── Safe JSON for onclick attributes ──────────────────────────
function safeJsonForOnclick(obj) {
  return JSON.stringify(obj).replace(/[&"']/g, function(c) {
    if (c === '&') return '&amp;';
    if (c === '"') return '&quot;';
    return '&#x27;';
  });
}

// ── Safe string for onclick JS contexts ───────────────────────
function onclickStr(s) {
  if (!s) return "''";
  return "'" + String(s).replace(/[&<>]/g, function(c) {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    return c;
  }).replace(/[\\']/g, '\\$&') + "'";
}

// ── Hex to RGB (for CSS custom properties) ────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16) || 0;
  const g = parseInt(hex.slice(3,5),16) || 0;
  const b = parseInt(hex.slice(5,7),16) || 0;
  return `${r},${g},${b}`;
}

// ── Escape HTML ───────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

// ── Auto-resize textarea ──────────────────────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 110) + 'px';
}

// ── Scroll to bottom ──────────────────────────────────────────
function scrollToBottom(id) {
  const el = document.getElementById(id);
  if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

// ── Toggle password eye ───────────────────────────────────────
function toggleEye(inputId, btn) {
  const inp = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if (inp.type === 'password') { inp.type = 'text'; icon.className = 'fa fa-eye-slash'; }
  else { inp.type = 'password'; icon.className = 'fa fa-eye'; }
}

// ── Image viewer ──────────────────────────────────────────────
function openImgViewer(images, index) {
  if (!images) return;
  const urls = Array.isArray(images) ? images : [images];
  const idx = (typeof index === 'number' ? index : 0);
  const total = urls.length;

  const overlay = document.createElement('div');
  overlay.className = 'img-viewer';
  overlay.innerHTML = `
    <button class="img-viewer-close" title="Close (Esc)"><i class="fa fa-times"></i></button>
    <div class="img-viewer-nav">
      <button class="iv-nav-btn iv-prev" title="Previous (←)"><i class="fa fa-chevron-left"></i></button>
      <div class="iv-main">
        <img src="${esc(urls[idx])}" alt="Image" class="iv-img">
        <button class="iv-dl-btn" title="Download"><i class="fa fa-download"></i></button>
      </div>
      <button class="iv-nav-btn iv-next" title="Next (→)"><i class="fa fa-chevron-right"></i></button>
    </div>
    ${total > 1 ? `<div class="iv-counter"><span class="iv-cur">${idx+1}</span> / ${total}</div>` : ''}`;

  document.body.appendChild(overlay);

  const imgEl = overlay.querySelector('.iv-img');
  const prevBtn = overlay.querySelector('.iv-prev');
  const nextBtn = overlay.querySelector('.iv-next');
  const counterEl = overlay.querySelector('.iv-cur');
  const dlBtn = overlay.querySelector('.iv-dl-btn');

  function showImage(i) {
    const newIdx = (i + total) % total;
    imgEl.style.opacity = '0';
    setTimeout(function() {
      imgEl.src = esc(urls[newIdx]);
      imgEl.style.opacity = '1';
    }, 120);
    if (prevBtn) prevBtn.style.display = total > 1 ? '' : 'none';
    if (nextBtn) nextBtn.style.display = total > 1 ? '' : 'none';
    if (counterEl) counterEl.textContent = newIdx + 1;
    return newIdx;
  }

  let currentIdx = idx;
  prevBtn?.addEventListener('click', function(e) { e.stopPropagation(); currentIdx = showImage(currentIdx - 1); });
  nextBtn?.addEventListener('click', function(e) { e.stopPropagation(); currentIdx = showImage(currentIdx + 1); });

  dlBtn?.addEventListener('click', function(e) {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = urls[currentIdx];
    a.download = urls[currentIdx].split('/').pop() || 'image.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay || e.target.closest('.img-viewer-close')) overlay.remove();
  });

  // Keyboard nav
  const keyHandler = function(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', keyHandler); }
    if (total > 1) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); currentIdx = showImage(currentIdx - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); currentIdx = showImage(currentIdx + 1); }
    }
  };
  document.addEventListener('keydown', keyHandler);

  // Touch swipe for mobile
  let touchStartX = 0;
  overlay.addEventListener('touchstart', function(e) { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
  overlay.addEventListener('touchend', function(e) {
    const delta = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(delta) > 50 && total > 1) {
      if (delta < 0) currentIdx = showImage(currentIdx + 1);
      else currentIdx = showImage(currentIdx - 1);
    }
  }, { passive: true });

  // Fade-in the image
  void imgEl.offsetWidth;
  imgEl.style.transition = 'opacity .15s ease';
}

// ── View management ───────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(`v-${id}`);
  if (el) {
    el.classList.remove('hidden');
    el.classList.remove('view-enter', 'page-enter');
    void el.offsetWidth; // force reflow
    el.classList.add('view-enter');
    setTimeout(() => el.classList.remove('view-enter'), 400);
  }

  const sidebar = document.getElementById('sidebar');
  const isMobile = window.innerWidth < 769;

  // Always keep bottom nav visible — never hide it
  // This ensures navigation is always accessible on small screens
  const bnav = document.getElementById('bottom-nav');
  if (bnav) bnav.classList.remove('hidden');

  // Mobile sidebar — hide when going to subpages, show on welcome/home
  const fullscreenViews = ['chat', 'sage', 'admin', 'global', 'announcements', 'settings', 'help'];
  if (isMobile) {
    if (id === 'welcome') sidebar.classList.remove('hidden-mobile');
    else sidebar.classList.add('hidden-mobile');
  }

  // Nav active state
  const navMap = { welcome: 'home', global: 'global', announcements: 'announcements', settings: 'settings' };
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === navMap[id]));
}

function goBack() {
  showView('welcome');
  document.getElementById('sidebar').classList.remove('hidden-mobile');
  activeFriend = null;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
}

// ── Sidebar tab ───────────────────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.sidebar-tabs .stab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-chats').classList.toggle('hidden', tab !== 'chats');
  document.getElementById('tab-friends').classList.toggle('hidden', tab !== 'friends');
}

// ── Skeleton loader ───────────────────────────────────────────
function skeletonRows(n = 5) {
  return Array(n).fill(0).map((_, i) => `
    <div class="skel-row" style="flex-direction:${i % 2 === 0 ? 'row' : 'row-reverse'}">
      <div class="skel skel-av"></div>
      <div class="skel-lines" style="max-width:${120 + Math.random() * 100}px">
        <div class="skel skel-line" style="width:${60 + Math.random() * 40}%"></div>
        <div class="skel skel-line" style="width:${30 + Math.random() * 30}%"></div>
      </div>
    </div>`).join('');
}

// ── Profile modal ─────────────────────────────────────────────
async function openProfile(user) {
  if (!user) return;
  const body = document.getElementById('profile-modal-body');
  body.innerHTML = `<div class="empty-state"><div class="skel" style="width:72px;height:72px;border-radius:50%;margin:0 auto 12px"></div></div>`;
  openModal('m-profile');

  try {
    const av = makeAvEl(user, 'lg');
    const { mutual } = await api.getMutual(user.id).catch(() => ({ mutual: [] }));
    const isFriend = state.friends.some(f => f.id === user.id);
    const sentReq = state.friendRequestsSent?.some(u => u.id === user.id);
    const recvReq = state.friendRequestsReceived?.some(u => u.id === user.id);

    let actionBtns = '';
    if (isFriend) {
      actionBtns = `<button class="btn-secondary" onclick="startChat('${user.id}');closeModal()"><i class="fa fa-comment"></i> Message</button>
                    <button class="btn-danger" onclick="doRemoveFriend('${user.id}')"><i class="fa fa-user-minus"></i> Remove</button>`;
    } else if (sentReq) {
      actionBtns = `<button class="btn-secondary" onclick="doCancelFriendReq('${user.id}')"><i class="fa fa-xmark"></i> Cancel Request</button>`;
    } else if (recvReq) {
      actionBtns = `<button class="btn-accept" onclick="doAcceptFriend('${user.id}')"><i class="fa fa-check"></i> Accept Request</button>`;
    } else {
      actionBtns = `<button class="btn-secondary" onclick="doSendFriendReq('${user.id}')"><i class="fa fa-user-plus"></i> Add Friend</button>`;
    }

    const mutualHtml = mutual?.length ? (() => {
      const MAX = 5;
      const chips = mutual.map(m => `<div class="mutual-chip">${makeAvEl(m,'xs').outerHTML}<span>${esc(m.display_name)}</span></div>`);
      const visible = chips.slice(0, MAX);
      const remaining = chips.slice(MAX);
      const extra = remaining.length;
      return `
        <div class="mutual-section">
          <h4 class="section-label">Mutual Friends</h4>
          <div class="mutual-chips">${visible.join('')}</div>
          ${extra ? `
            <div class="mutual-chips-full" hidden>${remaining.join('')}</div>
            <button class="mutual-see-more" onclick="var n=this.nextElementSibling;if(!n||!n.classList.contains('mutual-chips-full')){n=this.previousElementSibling};n.hidden=!n.hidden;this.textContent=n.hidden?'See all ('+this.dataset.extra+' more)':'Show less'">See all (${extra} more)</button>` : ''}
        </div>`;
    })() : '';

    const bio = user.bio ? esc(user.bio) : '';
    body.innerHTML = `
      <div class="profile-card">
        ${av.outerHTML}
        <div class="pc-name">${esc(user.display_name)}</div>
        <div class="pc-un">@${esc(user.username)}</div>
        ${bio ? `<div class="pc-bio">${bio}</div>` : ''}
        <div class="pc-pronouns">${esc(user.pronouns || '')}</div>
        ${getRoleBadge(user.role)}
        <div style="font-size:12px;color:${user.is_online ? 'var(--accent)' : 'var(--txt3)'}">
          <i class="fa fa-circle" style="font-size:8px"></i> ${user.is_online ? 'Online' : fmtLastSeen(user.last_seen)}
        </div>
        <div class="pc-actions">${actionBtns}</div>
        ${mutualHtml}
      </div>`;
  } catch (err) {
    body.innerHTML = `<p style="color:var(--danger)">${err.message}</p>`;
  }
}

// ── Filter sidebar ─────────────────────────────────────────────
function filterChats(q) {
  const clearBtn = document.getElementById('clear-search');
  clearBtn.classList.toggle('hidden', !q);
  clearBtn.setAttribute('aria-label', q ? 'Clear search' : '');
  document.querySelectorAll('.chat-item').forEach(el => {
    const name = el.querySelector('.ci-name')?.textContent.toLowerCase() || '';
    el.style.display = name.includes(q.toLowerCase()) ? '' : 'none';
  });
}
function clearSearch() {
  document.getElementById('sidebar-search-inp').value = '';
  filterChats('');
}

// ── Update topbar avatar ───────────────────────────────────────
function updateTopbarAv() {
  // The topbar avatar element is #topbar-zav in HTML
  const el = document.getElementById('topbar-zav');
  if (el && state.user) {
    el.innerHTML = '';
    const u = state.user;
    if (u.profile_picture || u.profilePicture) {
      const img = document.createElement('img');
      img.src = u.profile_picture || u.profilePicture;
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
      img.onerror = () => { img.remove(); el.textContent = (u.display_name || '?')[0].toUpperCase(); el.style.background = u.profile_color || '#555'; };
      el.appendChild(img);
    } else {
      el.textContent = (u.display_name || '?')[0].toUpperCase();
      el.style.background = u.profile_color || '#555';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontWeight = '700';
      el.style.fontSize = '14px';
      el.style.color = '#fff';
    }
  }
}

// ── Online status helpers ─────────────────────────────────────
function updateFriendOnlineStatus(userId, isOnline, lastSeen) {
  const friend = state.friends.find(f => f.id === userId);
  if (friend) { friend.is_online = isOnline; friend.last_seen = lastSeen; }

  // Update sidebar
  const chatItem = document.querySelector(`[data-chat-id="${userId}"]`);
  if (chatItem) {
    const preview = chatItem.querySelector('.ci-preview');
    if (preview && isOnline) preview.innerHTML = `<span style="color:var(--accent)">● Online</span>`;
  }

  // Update friend list
  const friendItem = document.querySelector(`[data-friend-id="${userId}"]`);
  if (friendItem) {
    const status = friendItem.querySelector('.fi-status');
    if (status) {
      status.textContent = isOnline ? '● Online' : fmtLastSeen(lastSeen);
      status.className = `fi-status ${isOnline ? 'online' : ''}`;
    }
  }

  // Update chat header if active
  if (activeFriend?.id === userId) {
    const dot = document.getElementById('ch-online-dot');
    const statusEl = document.getElementById('ch-status');
    if (dot) dot.classList.toggle('hidden', !isOnline);
    if (statusEl) {
      statusEl.textContent = isOnline ? 'Online' : fmtLastSeen(lastSeen);
      statusEl.className = `ch-status ${isOnline ? 'online' : ''}`;
    }
  }
}

function showFriendReqDot() {
  const dot = document.getElementById('req-dot');
  dot.classList.remove('hidden');
  dot.classList.add('notif-bounce');
  setTimeout(() => dot.classList.remove('notif-bounce'), 600);
}
