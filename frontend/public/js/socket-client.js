let socket = null;

function initSocket(token) {
  socket = io({ auth: { token }, transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    socket.emit('join_global');
    socket.emit('get_online_count');
    if (typeof startHeartbeat === 'function') startHeartbeat();
  });

  socket.on('online_count', ({ count }) => {
    const el = document.getElementById('global-online-count');
    if (el) {
      el.textContent = count;
      el.classList.add('count-pulse');
      setTimeout(() => el.classList.remove('count-pulse'), 600);
    }
    // Also update global status if in global view
    const statusEl = document.getElementById('global-status');
    if (statusEl && statusEl.dataset.memberCount) {
      statusEl.textContent = `${count} online · ${statusEl.dataset.memberCount} members`;
    }
  });

  socket.on('user_status', ({ userId, isOnline, lastSeen }) => {
    updateFriendOnlineStatus(userId, isOnline, lastSeen);
  });

  socket.on('banned_from_global', ({ reason }) => {
    state.user.is_banned_from_global = true;
    state.user.ban_reason = reason;
    const globalView = document.getElementById('v-global');
    if (globalView && !globalView.classList.contains('hidden')) {
      document.getElementById('global-input-area').classList.add('hidden');
      const bar = document.getElementById('banned-bar');
      bar.classList.remove('hidden');
      if (reason) bar.innerHTML = `<i class="fa fa-ban"></i> You are banned from global chat. <strong>Reason:</strong> ${esc(reason)}`;
    }
    showToast(reason ? `You were banned: ${reason}` : 'You were banned from global chat', 'error');
  });

  socket.on('unbanned_from_global', () => {
    state.user.is_banned_from_global = false;
    state.user.ban_reason = null;
    const globalView = document.getElementById('v-global');
    if (globalView && !globalView.classList.contains('hidden')) {
      document.getElementById('global-input-area').classList.remove('hidden');
      document.getElementById('banned-bar').classList.add('hidden');
    }
    showToast('Your global chat ban has been lifted 🎉', 'success');
  });

  socket.on('new_private_message', (msg) => {
    if (activeFriend && msg.sender_id === activeFriend.id) {
      appendPrivateMsg(msg);
      socket.emit('message_read', { conversationId: [state.user.id, activeFriend.id].sort().join('_'), senderId: activeFriend.id });
    } else {
      state.unreadCounts[msg.sender_id] = (state.unreadCounts[msg.sender_id] || 0) + 1;
      updateUnreadBadge(msg.sender_id);
      showToast(`New message from ${msg.sender?.display_name || 'Someone'}`, 'info');
      if (window.notificationSystem) {
        const senderName = msg.sender?.display_name || msg.sender?.username || 'Someone';
        const preview = msg.content || '📷 Image';
        notificationSystem.notifyPrivateMessage(senderName, preview, function() {
          var friend = state.friends?.find(function(f) { return f.id === msg.sender_id; });
          if (!friend && msg.sender) {
            friend = { id: msg.sender.id, display_name: msg.sender.display_name, username: msg.sender.username, profile_picture: msg.sender.profile_picture, is_online: false, last_seen: null };
          }
          if (friend) openPrivateChat(friend);
        });
      }
    }
    updateChatListPreview(msg.sender_id, msg.content, msg.created_at);
  });

  socket.on('message_sent', (msg) => {
    const tempEl = document.querySelector(`[data-temp="${msg.tempId}"]`);
    if (tempEl) {
      tempEl.setAttribute('data-id', msg.id);
      tempEl.removeAttribute('data-temp');
      const s = tempEl.querySelector('.msg-read');
      if (s) s.innerHTML = '<i class="fa fa-check"></i>';
    }
    if (activeFriend) updateChatListPreview(activeFriend.id, msg.content, msg.created_at);
  });

  socket.on('new_global_message', (msg) => {
    const container = document.getElementById('global-msgs');
    if (!container) return;
    if (msg.isSystem) {
      const el = document.createElement('div');
      el.className = 'bubble system msg-appear';
      el.textContent = msg.content;
      container.appendChild(el);
    } else {
      container.appendChild(makeGlobalMsgEl(msg));
    }
    scrollToBottom('global-msgs');
  });

  socket.on('message_deleted', ({ messageId }) => {
    const el = document.querySelector(`[data-id="${messageId}"]`);
    if (el) {
      const av = el.querySelector('.av');
      const bubble = el.querySelector('.bubble');
      if (bubble) {
        bubble.className = 'bubble deleted';
        bubble.innerHTML = '<i class="fa fa-ban"></i> Message deleted';
      }
      el.querySelector('.msg-imgs')?.remove();
      el.querySelector('.msg-actions')?.remove();
      el.querySelector('.reply-quote')?.remove();
      el.querySelector('.sender-lbl')?.remove();
      if (av) av.remove();
    }
  });

  socket.on('typing_start', ({ userId }) => {
    if (activeFriend?.id === userId) {
      document.getElementById('typing-bar')?.classList.remove('hidden');
      if (activeFriend) { const av = document.getElementById('typing-av'); if (av) setAvEl(av, activeFriend); }
    }
  });
  socket.on('typing_stop', ({ userId }) => {
    if (activeFriend?.id === userId) document.getElementById('typing-bar')?.classList.add('hidden');
  });

  socket.on('messages_read', ({ conversationId }) => {
    const currentConvId = activeFriend ? [state.user.id, activeFriend.id].sort().join('_') : null;
    if (conversationId === currentConvId) {
      document.querySelectorAll('#priv-msgs .msg-row.own .msg-read').forEach(s => {
        s.innerHTML = '<i class="fa fa-check-double" style="color:var(--accent)"></i>';
      });
    }
  });

  socket.on('friend_request_received', ({ from }) => {
    if (!state.friendRequestsReceived) state.friendRequestsReceived = [];
    state.friendRequestsReceived.push(from);
    updateFriendReqBadge();
    showToast(`${from.display_name} sent you a friend request`, 'info');
  });

  socket.on('owner_reply_notification', (data) => {
    if (typeof handleOwnerReplyNotification === 'function') {
      handleOwnerReplyNotification(data);
    }
  });

  socket.on('error', ({ message }) => showToast(message, 'error'));
}

function emitTypingStart() { if (socket && activeFriend) socket.emit('typing_start', { recipientId: activeFriend.id }); }
function emitTypingStop() { if (socket && activeFriend) socket.emit('typing_stop', { recipientId: activeFriend.id }); }

function updateChatListPreview(userId, content, time) {
  const item = document.querySelector(`[data-chat-id="${userId}"]`);
  if (item) {
    const preview = item.querySelector('.ci-preview');
    const timeEl = item.querySelector('.ci-time');
    if (preview) preview.textContent = content || '📷 Image';
    if (timeEl && time) timeEl.textContent = fmtTime(time);
  }
}

function updateUnreadBadge(userId) {
  const item = document.querySelector(`[data-chat-id="${userId}"]`);
  if (!item) return;
  let badge = item.querySelector('.unread-badge');
  if (!badge) { badge = document.createElement('span'); badge.className = 'unread-badge'; item.querySelector('.ci-meta')?.appendChild(badge); }
  const count = state.unreadCounts[userId] || 0;
  badge.textContent = count;
  badge.style.display = count ? '' : 'none';
}
