async function loadFriends() {
  try {
    const data = await api.getFriends();
    state.friends = data.friends || [];
    state.friendRequestsReceived = data.requestsReceived || [];
    state.friendRequestsSent = data.requestsSent || [];
    renderChatList();
    renderFriendsList();
    if (state.friendRequestsReceived.length > 0) showFriendReqDot();
    const { counts } = await api.getUnreadCounts().catch(() => ({ counts: {} }));
    state.unreadCounts = counts || {};
    Object.keys(state.unreadCounts).forEach(uid => updateUnreadBadge(uid));
  } catch (err) { console.error('loadFriends:', err); }
}

function renderChatList() {
  const list = document.getElementById('chat-list');
  list.innerHTML = '';
  if (!state.friends.length) {
    list.innerHTML = `<div class="empty-state"><i class="fa fa-user-group"></i><p>No chats yet. Add some friends!</p></div>`;
    return;
  }
  const sorted = [...state.friends].sort((a, b) => b.is_online - a.is_online);
  sorted.forEach((friend, i) => {
    const item = document.createElement('div');
    item.className = 'chat-item';
    item.style.animationDelay = `${i * 0.04}s`;
    item.dataset.chatId = friend.id;
    item.onclick = () => openPrivateChat(friend);
    const av = makeAvEl(friend, 'md');
    if (friend.is_online) av.classList.add('online-ring');
    const unread = state.unreadCounts[friend.id];
    item.innerHTML = `
      ${av.outerHTML}
      <div class="ci-info">
        <div class="ci-name">${esc(friend.display_name)}</div>
        <div class="ci-preview">${friend.is_online ? '<span style="color:var(--accent)">● Online</span>' : 'Tap to chat'}</div>
      </div>
      <div class="ci-meta">
        ${unread ? `<span class="unread-badge">${unread}</span>` : ''}
      </div>`;
    list.appendChild(item);
  });
}

function renderFriendsList() {
  const list = document.getElementById('friends-list');
  list.innerHTML = '';
  const online = state.friends.filter(f => f.is_online);
  const offline = state.friends.filter(f => !f.is_online);
  if (!state.friends.length) {
    list.innerHTML = `<div class="empty-state"><i class="fa fa-user-plus"></i><p>No friends yet</p></div>`;
    return;
  }
  if (online.length) {
    list.innerHTML += `<div class="friends-section-label"><i class="fa fa-circle" style="color:var(--accent);font-size:8px"></i> Online — ${online.length}</div>`;
    online.forEach(f => list.appendChild(makeFriendItem(f)));
  }
  if (offline.length) {
    list.innerHTML += `<div class="friends-section-label">Offline — ${offline.length}</div>`;
    offline.forEach(f => list.appendChild(makeFriendItem(f)));
  }
}

function makeFriendItem(friend) {
  const item = document.createElement('div');
  item.className = 'friend-item';
  item.dataset.friendId = friend.id;
  item.onclick = () => openPrivateChat(friend);
  const av = makeAvEl(friend, 'md');
  item.innerHTML = `
    ${av.outerHTML}
    <div class="fi-info">
      <div class="fi-name">${esc(friend.display_name)}</div>
      <div class="fi-status ${friend.is_online ? 'online' : ''}">${friend.is_online ? '● Online' : fmtLastSeen(friend.last_seen)}</div>
    </div>
    <button class="icon-btn" onclick="event.stopPropagation();openProfile(${safeJsonForOnclick(friend)})" title="View Profile"><i class="fa fa-ellipsis-vertical"></i></button>`;
  return item;
}

// ── Add Friend Modal ──────────────────────────────────────────
function openAddFriend() {
  document.getElementById('friend-search-inp').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('req-dot').classList.add('hidden');
  renderPendingRequests();
  openModal('m-friend');
}

function renderPendingRequests() {
  const list = document.getElementById('pending-list');
  list.innerHTML = '';
  if (!state.friendRequestsReceived?.length) {
    list.innerHTML = `<p style="color:var(--txt3);font-size:13px">No pending requests</p>`;
    return;
  }
  state.friendRequestsReceived.forEach(u => {
    const item = document.createElement('div');
    item.className = 'pending-item';
    const av = makeAvEl(u, 'md');
    item.innerHTML = `${av.outerHTML}
      <div class="pi-info"><div class="pi-name">${esc(u.display_name)}</div><div class="pi-un">@${esc(u.username)}</div></div>
      <div class="pi-actions">
        <button class="btn-accept" onclick="doAcceptFriend('${u.id}')"><i class="fa fa-check"></i></button>
        <button class="btn-decline" onclick="doDeclineFriend('${u.id}')"><i class="fa fa-xmark"></i></button>
      </div>`;
    list.appendChild(item);
  });
}

let searchDebounce;
function searchUsers(q) {
  clearTimeout(searchDebounce);
  const results = document.getElementById('search-results');
  if (!q || q.length < 2) { results.innerHTML = ''; return; }
  results.innerHTML = `<div class="empty-state" style="padding:20px"><i class="fa fa-spinner fa-spin"></i></div>`;
  searchDebounce = setTimeout(async () => {
    try {
      const { users } = await api.searchUsers(q);
      results.innerHTML = '';
      if (!users.length) { results.innerHTML = `<div class="empty-state" style="padding:16px"><i class="fa fa-magnifying-glass"></i><p>No users found</p></div>`; return; }
      users.forEach(u => {
        const isFriend = state.friends.some(f => f.id === u.id);
        const sent = state.friendRequestsSent?.some(s => s.id === u.id);
        const recv = state.friendRequestsReceived?.some(r => r.id === u.id);
        let btn = '';
        if (isFriend) btn = `<button class="btn-xs" disabled><i class="fa fa-check"></i> Friends</button>`;
        else if (sent) btn = `<button class="btn-xs danger" onclick="doCancelFriendReq('${u.id}')"><i class="fa fa-xmark"></i> Cancel</button>`;
        else if (recv) btn = `<button class="btn-xs primary" onclick="doAcceptFriend('${u.id}')"><i class="fa fa-check"></i> Accept</button>`;
        else btn = `<button class="btn-xs primary" onclick="doSendFriendReq('${u.id}')"><i class="fa fa-user-plus"></i> Add</button>`;
        const row = document.createElement('div');
        row.className = 'user-row';
        const av = makeAvEl(u, 'md');
        row.innerHTML = `${av.outerHTML}
          <div class="ur-info"><div class="ur-name">${esc(u.display_name)} ${getRoleBadge(u.role)}</div><div class="ur-un">@${esc(u.username)} · ${esc(u.pronouns || '')}</div></div>
          <div class="ur-actions">${btn}</div>`;
        results.appendChild(row);
      });
    } catch (err) { results.innerHTML = `<div class="empty-state" style="padding:16px"><i class="fa fa-circle-exclamation"></i><p>${err.message}</p></div>`; }
  }, 350);
}

async function doSendFriendReq(userId) {
  try {
    const { action } = await api.sendFriendReq(userId);
    if (action === 'friends') { showToast('You are now friends!', 'success'); await loadFriends(); }
    else { showToast('Friend request sent', 'success'); state.friendRequestsSent = state.friendRequestsSent || []; state.friendRequestsSent.push({ id: userId }); }
    if (socket) socket.emit('notify_friend_request', { recipientId: userId, from: state.user });
    searchUsers(document.getElementById('friend-search-inp').value);
  } catch (err) { showToast(err.message, 'error'); }
}

async function doCancelFriendReq(userId) {
  try {
    await api.cancelFriendReq(userId);
    state.friendRequestsSent = state.friendRequestsSent?.filter(u => u.id !== userId);
    showToast('Request cancelled', 'info');
    searchUsers(document.getElementById('friend-search-inp').value);
  } catch (err) { showToast(err.message, 'error'); }
}

async function doAcceptFriend(userId) {
  try {
    await api.sendFriendReq(userId);
    state.friendRequestsReceived = state.friendRequestsReceived?.filter(u => u.id !== userId);
    showToast('Friend added!', 'success');
    await loadFriends();
    closeModal();
  } catch (err) { showToast(err.message, 'error'); }
}

async function doDeclineFriend(userId) {
  try {
    await api.cancelFriendReq(userId);
    state.friendRequestsReceived = state.friendRequestsReceived?.filter(u => u.id !== userId);
    renderPendingRequests();
  } catch (err) { showToast(err.message, 'error'); }
}

async function doRemoveFriend(userId) {
  showConfirm('Remove Friend', 'Are you sure?', async () => {
    try {
      await api.removeFriend(userId);
      state.friends = state.friends.filter(f => f.id !== userId);
      renderChatList(); renderFriendsList();
      closeModal();
      showToast('Friend removed', 'info');
    } catch (err) { showToast(err.message, 'error'); }
  });
}
