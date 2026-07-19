async function loadFriends() {
  try {
    const data = await api.getFriends();
    state.friends = data.friends || [];
    state.friendRequestsReceived = data.requestsReceived || [];
    state.friendRequestsSent = data.requestsSent || [];
    renderChatList();
    renderFriendsList();
    updateFriendReqBadge();
    const { counts } = await api.getUnreadCounts().catch(() => ({ counts: {} }));
    state.unreadCounts = counts || {};
    Object.keys(state.unreadCounts).forEach(uid => updateUnreadBadge(uid));
  } catch (err) { console.error('loadFriends:', err); }
}

function updateFriendReqBadge() {
  var dot = document.getElementById('req-dot');
  var badge = document.getElementById('req-tab-badge');
  var count = state.friendRequestsReceived ? state.friendRequestsReceived.length : 0;
  if (count > 0) {
    if (dot) { dot.classList.remove('hidden'); dot.textContent = count > 9 ? '9+' : count; dot.style.width = 'auto'; dot.style.padding = '0 4px'; dot.style.borderRadius = '8px'; dot.style.fontSize = '9px'; dot.style.fontWeight = '700'; dot.style.minWidth = '16px'; dot.style.textAlign = 'center'; dot.style.lineHeight = '14px'; }
    if (badge) { badge.textContent = count > 9 ? '9+' : count; badge.classList.remove('hidden'); }
  } else {
    if (dot) { dot.classList.add('hidden'); dot.textContent = ''; }
    if (badge) { badge.classList.add('hidden'); badge.textContent = ''; }
  }
}

function renderChatList() {
  const list = document.getElementById('chat-list');
  list.innerHTML = '';
  if (!state.friends.length) {
    list.innerHTML = '<div class="empty-state"><i class="fa fa-user-group"></i><p>No chats yet. Add some friends!</p></div>';
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
    list.innerHTML = '<div class="empty-state"><i class="fa fa-user-plus"></i><p>No friends yet</p></div>';
    return;
  }
  if (online.length) {
    const lbl = document.createElement('div');
    lbl.className = 'friends-section-label';
    lbl.innerHTML = '<i class="fa fa-circle" style="color:var(--accent);font-size:8px"></i> Online \u2014 ' + online.length;
    list.appendChild(lbl);
    online.forEach(f => list.appendChild(makeFriendItem(f)));
  }
  if (offline.length) {
    const lbl = document.createElement('div');
    lbl.className = 'friends-section-label';
    lbl.textContent = 'Offline \u2014 ' + offline.length;
    list.appendChild(lbl);
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
      <div class="fi-status ${friend.is_online ? 'online' : ''}">${friend.is_online ? '\u25cf Online' : fmtLastSeen(friend.last_seen)}</div>
    </div>
    <button class="icon-btn" onclick="event.stopPropagation();openProfile(${safeJsonForOnclick(friend)})" title="View Profile"><i class="fa fa-ellipsis-vertical"></i></button>`;
  return item;
}

// ── Friends Modal ──────────────────────────────────────────────
function openAddFriend() {
  document.getElementById('friend-search-inp').value = '';
  var clearBtn = document.getElementById('friend-search-clear');
  if (clearBtn) clearBtn.classList.add('hidden');
  renderFriendRequests();
  updateFriendReqBadge();
  openModal('m-friend');
  loadSuggestions();
  setTimeout(() => document.getElementById('friend-search-inp')?.focus(), 150);
}

function switchFriendTab(tab, btn) {
  document.querySelectorAll('.ftab').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('ft-search').classList.toggle('hidden', tab !== 'search');
  document.getElementById('ft-requests').classList.toggle('hidden', tab !== 'requests');
  if (tab === 'requests') renderFriendRequests();
  if (tab === 'search') setTimeout(function () { document.getElementById('friend-search-inp')?.focus(); }, 100);
}

function clearFriendSearch() {
  document.getElementById('friend-search-inp').value = '';
  document.getElementById('friend-search-clear').classList.add('hidden');
  document.getElementById('friend-search-inp')?.focus();
  loadSuggestions();
}

function renderFriendRequests() {
  renderIncomingRequests();
  renderSentRequests();
}

function renderIncomingRequests() {
  var section = document.getElementById('friend-incoming-section');
  if (!section) return;
  var list = state.friendRequestsReceived || [];
  if (!list.length) {
    section.innerHTML = '<div class="friend-req-section"><h4 class="friend-req-label"><i class="fa fa-inbox"></i> Incoming</h4><div class="empty-state" style="padding:16px"><i class="fa fa-envelope-open"></i><p>No pending requests</p></div></div>';
    return;
  }
  var html = '<div class="friend-req-section"><h4 class="friend-req-label"><i class="fa fa-inbox"></i> Incoming <span class="req-count">' + list.length + '</span></h4>';
  list.forEach(function (u) {
    var av = makeAvEl(u, 'sm');
    html += '<div class="friend-req-item">' +
      av.outerHTML +
      '<div class="fri-info"><div class="fri-name">' + esc(u.display_name) + '</div><div class="fri-un">@' + esc(u.username) + '</div></div>' +
      '<div class="fri-actions">' +
        '<button class="fri-btn accept" onclick="doAcceptFriend(\'' + u.id + '\')" title="Accept"><i class="fa fa-check"></i></button>' +
        '<button class="fri-btn decline" onclick="doDeclineFriend(\'' + u.id + '\')" title="Decline"><i class="fa fa-xmark"></i></button>' +
      '</div></div>';
  });
  html += '</div>';
  section.innerHTML = html;
}

function renderSentRequests() {
  var section = document.getElementById('friend-sent-section');
  if (!section) return;
  var list = state.friendRequestsSent || [];
  if (!list.length) {
    section.innerHTML = '';
    return;
  }
  var html = '<div class="friend-req-section"><h4 class="friend-req-label"><i class="fa fa-paper-plane"></i> Sent <span class="req-count">' + list.length + '</span></h4>';
  list.forEach(function (u) {
    var av = makeAvEl(u, 'sm');
    html += '<div class="friend-req-item sent">' +
      av.outerHTML +
      '<div class="fri-info"><div class="fri-name">' + esc(u.display_name) + '</div><div class="fri-un">@' + esc(u.username) + '</div></div>' +
      '<div class="fri-actions">' +
        '<button class="fri-btn cancel" onclick="doCancelFriendReq(\'' + u.id + '\')" title="Cancel Request"><i class="fa fa-times"></i> Cancel</button>' +
      '</div></div>';
  });
  html += '</div>';
  section.innerHTML = html;
}

// ── Suggestions ─────────────────────────────────────────────────
async function loadSuggestions() {
  var results = document.getElementById('search-results');
  try {
    var data = await api.getSuggestions();
    var suggestions = data.suggestions || [];
    results.innerHTML = '';
    if (!suggestions.length) {
      results.innerHTML = '<div class="suggestions-section"><div class="suggestions-title"><i class="fa fa-users"></i> Suggested People</div><div class="empty-state" style="padding:20px"><i class="fa fa-user-plus"></i><p>No suggestions yet — add some friends first!</p></div></div>';
      return;
    }
    var html = '<div class="suggestions-section"><div class="suggestions-title"><i class="fa fa-users"></i> People You May Know</div>';
    suggestions.forEach(function (u) {
      var av = makeAvEl(u, 'md');
      var mutualText = u.mutual_count > 0 ? '<span class="mutual-badge"><i class="fa fa-user-friends"></i> ' + u.mutual_count + ' mutual</span>' : '';
      var isFriend = state.friends.some(function (f) { return f.id === u.id; });
      var sent = state.friendRequestsSent ? state.friendRequestsSent.some(function (s) { return s.id === u.id; }) : false;
      var recv = state.friendRequestsReceived ? state.friendRequestsReceived.some(function (r) { return r.id === u.id; }) : false;
      var btn = '';
      if (isFriend) btn = '<button class="fri-result-btn friend" disabled><i class="fa fa-check"></i> Friends</button>';
      else if (sent) btn = '<button class="fri-result-btn cancel" onclick="doCancelFriendReq(\'' + u.id + '\')"><i class="fa fa-times"></i> Cancel</button>';
      else if (recv) btn = '<button class="fri-result-btn accept" onclick="doAcceptFriend(\'' + u.id + '\')"><i class="fa fa-check"></i> Accept</button>';
      else btn = '<button class="fri-result-btn add" onclick="doSendFriendReq(\'' + u.id + '\')"><i class="fa fa-user-plus"></i> Add</button>';
      html += '<div class="friend-result-row">' +
        av.outerHTML +
        '<div class="frr-info">' +
          '<div class="frr-name">' + esc(u.display_name) + ' ' + getRoleBadge(u.role) + '</div>' +
          '<div class="frr-un">@' + esc(u.username) + ' ' + mutualText + '</div>' +
        '</div>' +
        '<div class="frr-actions">' + btn + '</div></div>';
    });
    html += '</div>';
    results.innerHTML = html;
  } catch (err) {
    results.innerHTML = '<div class="empty-state" style="padding:20px"><i class="fa fa-circle-exclamation"></i><p>Could not load suggestions</p></div>';
  }
}

// ── Search ─────────────────────────────────────────────────────
var searchDebounce;
function searchUsers(q) {
  clearTimeout(searchDebounce);
  var clearBtn = document.getElementById('friend-search-clear');
  if (clearBtn) clearBtn.classList.toggle('hidden', !q);
  var results = document.getElementById('search-results');
  if (!q || q.length < 2) {
    loadSuggestions();
    return;
  }
  results.innerHTML = '<div class="empty-state" style="padding:20px"><i class="fa fa-spinner fa-spin"></i></div>';
  searchDebounce = setTimeout(async function () {
    try {
      var data = await api.searchUsers(q);
      var users = data.users || [];
      results.innerHTML = '';
      if (!users.length) {
        results.innerHTML = '<div class="empty-state" style="padding:24px"><i class="fa fa-user-slash"></i><p>No users found</p><span style="font-size:12px;color:var(--txt3);margin-top:4px">Try a different name or username</span></div>';
        return;
      }
      results.innerHTML = '<div class="friend-result-count">Found ' + users.length + ' user' + (users.length > 1 ? 's' : '') + '</div>';
      users.forEach(function (u) {
        var isFriend = state.friends.some(function (f) { return f.id === u.id; });
        var sent = state.friendRequestsSent ? state.friendRequestsSent.some(function (s) { return s.id === u.id; }) : false;
        var recv = state.friendRequestsReceived ? state.friendRequestsReceived.some(function (r) { return r.id === u.id; }) : false;
        var btn = '';
        if (isFriend) btn = '<button class="fri-result-btn friend" disabled><i class="fa fa-check"></i> Friends</button>';
        else if (sent) btn = '<button class="fri-result-btn cancel" onclick="doCancelFriendReq(\'' + u.id + '\')"><i class="fa fa-times"></i> Cancel</button>';
        else if (recv) btn = '<button class="fri-result-btn accept" onclick="doAcceptFriend(\'' + u.id + '\')"><i class="fa fa-check"></i> Accept</button>';
        else btn = '<button class="fri-result-btn add" onclick="doSendFriendReq(\'' + u.id + '\')"><i class="fa fa-user-plus"></i> Add</button>';
        var av = makeAvEl(u, 'md');
        var row = document.createElement('div');
        row.className = 'friend-result-row';
        row.innerHTML = av.outerHTML +
          '<div class="frr-info">' +
            '<div class="frr-name">' + esc(u.display_name) + ' ' + getRoleBadge(u.role) + '</div>' +
            '<div class="frr-un">@' + esc(u.username) + (u.pronouns ? ' \u00b7 ' + esc(u.pronouns) : '') + '</div>' +
          '</div>' +
          '<div class="frr-actions">' + btn + '</div>';
        results.appendChild(row);
      });
    } catch (err) {
      results.innerHTML = '<div class="empty-state" style="padding:20px"><i class="fa fa-circle-exclamation"></i><p>' + err.message + '</p></div>';
    }
  }, 350);
}

async function doSendFriendReq(userId) {
  try {
    var data = await api.sendFriendReq(userId);
    if (data.action === 'friends') { showToast('You are now friends!', 'success'); await loadFriends(); }
    else {
      showToast('Friend request sent', 'success');
      state.friendRequestsSent = state.friendRequestsSent || [];
      var user = { id: userId };
      state.friendRequestsSent.push(user);
    }
    if (socket) socket.emit('notify_friend_request', { recipientId: userId, from: state.user });
    searchUsers(document.getElementById('friend-search-inp').value);
  } catch (err) { showToast(err.message, 'error'); }
}

async function doCancelFriendReq(userId) {
  try {
    await api.cancelFriendReq(userId);
    state.friendRequestsSent = state.friendRequestsSent ? state.friendRequestsSent.filter(function (u) { return u.id !== userId; }) : [];
    showToast('Request cancelled', 'info');
    searchUsers(document.getElementById('friend-search-inp').value);
    var activeTab = document.querySelector('.ftab.active');
    if (activeTab && activeTab.dataset.ftab === 'requests') renderFriendRequests();
  } catch (err) { showToast(err.message, 'error'); }
}

async function doAcceptFriend(userId) {
  try {
    await api.sendFriendReq(userId);
    state.friendRequestsReceived = state.friendRequestsReceived ? state.friendRequestsReceived.filter(function (u) { return u.id !== userId; }) : [];
    showToast('Friend added!', 'success');
    await loadFriends();
    var activeTab = document.querySelector('.ftab.active');
    if (activeTab && activeTab.dataset.ftab === 'requests') renderFriendRequests();
    else closeModal();
  } catch (err) { showToast(err.message, 'error'); }
}

async function doDeclineFriend(userId) {
  try {
    await api.cancelFriendReq(userId);
    state.friendRequestsReceived = state.friendRequestsReceived ? state.friendRequestsReceived.filter(function (u) { return u.id !== userId; }) : [];
    renderFriendRequests();
    updateFriendReqBadge();
  } catch (err) { showToast(err.message, 'error'); }
}

async function doRemoveFriend(userId) {
  showConfirm('Remove Friend', 'Are you sure?', async function () {
    try {
      await api.removeFriend(userId);
      state.friends = state.friends.filter(function (f) { return f.id !== userId; });
      renderChatList();
      renderFriendsList();
      closeModal();
      showToast('Friend removed', 'info');
    } catch (err) { showToast(err.message, 'error'); }
  });
}
