async function openPrivateChat(friend) {
  activeFriend = friend;
  replyToMsg = null;
  selectedImages = [];

  document.getElementById('reply-preview')?.classList.add('hidden');
  document.getElementById('img-previews')?.classList.add('hidden');
  document.getElementById('typing-bar')?.classList.add('hidden');
  document.getElementById('priv-input').value = '';

  // Header
  const av = document.getElementById('ch-avatar');
  setAvEl(av, friend);
  av.className = `av md ${friend.is_online ? 'online-ring' : ''}`;
  document.getElementById('ch-name').textContent = friend.display_name;
  document.getElementById('ch-status').textContent = friend.is_online ? 'Online' : fmtLastSeen(friend.last_seen);
  document.getElementById('ch-status').className = `ch-status ${friend.is_online ? 'online' : ''}`;
  const dot = document.getElementById('ch-online-dot');
  dot.classList.toggle('hidden', !friend.is_online);

  // Join socket room
  const convId = [state.user.id, friend.id].sort().join('_');
  if (socket) {
    socket.emit('join_conversation', { conversationId: convId });
    socket.emit('message_read', { conversationId: convId, senderId: friend.id });
  }

  // Clear unread
  delete state.unreadCounts[friend.id];
  updateUnreadBadge(friend.id);

  showView('chat');

  // Sidebar active
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-chat-id="${friend.id}"]`)?.classList.add('active');

  // Show skeleton only if loading takes > 400ms (avoids flash on fast connections)
  const container = document.getElementById('priv-msgs');
  const skeletonTimer = setTimeout(() => {
    if (!container.querySelector('.msg-row')) {
      container.innerHTML = skeletonRows(6);
    }
  }, 400);

  try {
    const { messages } = await api.getPrivateMsgs(friend.id);
    clearTimeout(skeletonTimer);
    renderPrivateMsgs(messages, container);
    scrollToBottom('priv-msgs');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><i class="fa fa-circle-exclamation"></i><p>${err.message}</p></div>`;
  }
}

function renderPrivateMsgs(messages, container) {
  container.innerHTML = '';
  if (!messages.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa fa-comment-dots"></i><p>No messages yet. Say hello!</p></div>`;
    return;
  }
  let lastDate = null;
  messages.forEach(msg => {
    const d = fmtDate(msg.created_at);
    if (d !== lastDate) {
      const div = document.createElement('div');
      div.className = 'day-divider';
      div.innerHTML = `<span>${d}</span>`;
      container.appendChild(div);
      lastDate = d;
    }
    container.appendChild(makePrivMsgEl(msg));
  });
  initSwipe(container);
}

function makePrivMsgEl(msg) {
  const isOwn = msg.sender_id === state.user.id;
  const sender = isOwn ? state.user : (activeFriend || msg.sender || {});
  const row = document.createElement('div');
  row.className = `msg-row ${isOwn ? 'own' : ''} msg-appear`;
  if (msg.id) row.dataset.id = msg.id;
  if (msg.tempId) row.dataset.temp = msg.tempId;

  if (msg.deleted) {
    row.innerHTML = `<div class="bubble deleted"><i class="fa fa-ban"></i> Message deleted</div>`;
    return row;
  }

  const av = makeAvEl(sender, 'xs');
  const replyHtml = msg.reply_to_msg ? `
    <div class="reply-quote" onclick="scrollToMsg('${msg.reply_to_msg.id}')">
      <i class="fa fa-reply" style="color:var(--accent)"></i> ${esc(msg.reply_to_msg.content?.substring(0, 60) || 'Message')}
    </div>` : '';

  const imagesHtml = msg.images?.length ? `
    <div class="msg-imgs count-${Math.min(msg.images.length, 3)}">
      ${msg.images.map(s => `<img src="${esc(s)}" onclick="openImgViewer('${esc(s)}')" loading="lazy">`).join('')}
    </div>` : '';

  const canDelete = isOwn || state.roles.find(r => r.name === state.user?.role)?.permissions?.canDeleteMessages;

  row.innerHTML = `
    ${av.outerHTML}
    <div class="msg-body">
      ${replyHtml}
      <div class="bubble">${esc(msg.content)}</div>
      ${imagesHtml}
      <div class="msg-meta">
        <span class="msg-time">${fmtTime(msg.created_at)}</span>
        ${isOwn ? `<span class="msg-read"><i class="fa fa-check"></i></span>` : ''}
        <div class="msg-actions">
          <button class="mac-btn" onclick="setPrivReply(event,'${msg.id}','${esc(sender.display_name)}','${esc((msg.content||'').substring(0,60))}')" title="Reply"><i class="fa fa-reply"></i></button>
          ${canDelete ? `<button class="mac-btn" onclick="deletePrivMsg('${msg.id}')" title="Delete" style="color:var(--danger)"><i class="fa fa-trash"></i></button>` : ''}
        </div>
      </div>
    </div>`;

  return row;
}

function appendPrivateMsg(msg) {
  const container = document.getElementById('priv-msgs');
  if (!container) return;
  const emptyEl = container.querySelector('.empty-state');
  if (emptyEl) emptyEl.remove();
  container.appendChild(makePrivMsgEl(msg));
  scrollToBottom('priv-msgs');
}

function setPrivReply(e, msgId, senderName, content) {
  e?.stopPropagation();
  replyToMsg = { id: msgId, content, senderName };
  document.getElementById('priv-reply-name').textContent = senderName;
  document.getElementById('priv-reply-text').textContent = content;
  document.getElementById('priv-reply-preview').classList.remove('hidden');
  document.getElementById('priv-input').focus();
}
function cancelReply() {
  replyToMsg = null;
  document.getElementById('priv-reply-preview').classList.add('hidden');
}

async function sendPrivate() {
  if (!activeFriend) return;
  const input = document.getElementById('priv-input');
  const content = input.value.trim();
  if (!content && !selectedImages.length) return;

  if (selectedImages.length) {
    // Send via HTTP for images
    try {
      const fd = new FormData();
      if (content) fd.append('content', content);
      if (replyToMsg) fd.append('replyTo', replyToMsg.id);
      selectedImages.forEach(f => fd.append('images', f));
      const headers = { 'Authorization': `Bearer ${state.token}` };
      const res = await fetch(`/api/messages/private/${activeFriend.id}`, { method: 'POST', headers, body: fd });
      const data = await res.json();
      if (data.message) appendPrivateMsg(data.message);
    } catch (err) { showToast('Failed to send images', 'error'); }
  } else {
    // Via socket
    const tempId = `temp_${Date.now()}`;
    if (socket) {
      socket.emit('send_private_message', { recipientId: activeFriend.id, content, replyTo: replyToMsg?.id, tempId });
    }
    // Optimistic
    const optimistic = { id: null, tempId, sender_id: state.user.id, sender: state.user, content, created_at: new Date().toISOString(), reply_to_msg: replyToMsg ? { id: replyToMsg.id, content: replyToMsg.content } : null };
    appendPrivateMsg(optimistic);
  }

  input.value = '';
  input.style.height = 'auto';
  cancelReply();
  clearImgPreviews();
  emitTypingStop();
  clearTimeout(typingTimer);
}

function privKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrivate(); return; }
  autoResize(e.target);
}
function privInput(el) {
  autoResize(el);
  emitTypingStart();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(emitTypingStop, 2000);
}

// Images
function handleImgSelect(input) {
  const files = Array.from(input.files).slice(0, 5);
  if (!files.length) return;
  selectedImages = files;
  const preview = document.getElementById('img-previews');
  preview.innerHTML = '';
  preview.classList.remove('hidden');
  files.forEach((f, i) => {
    const url = URL.createObjectURL(f);
    const item = document.createElement('div');
    item.className = 'img-prev-item';
    item.innerHTML = `<img src="${url}"><button onclick="removeImg(${i})"><i class="fa fa-xmark"></i></button>`;
    preview.appendChild(item);
  });
}
function removeImg(i) {
  selectedImages.splice(i, 1);
  if (!selectedImages.length) clearImgPreviews();
  else handleImgSelect({ files: selectedImages });
}
function clearImgPreviews() {
  selectedImages = [];
  document.getElementById('img-previews').classList.add('hidden');
  document.getElementById('img-input').value = '';
}

async function deletePrivMsg(msgId) {
  showConfirm('Delete Message', 'This cannot be undone.', async () => {
    try {
      if (socket) {
        const convId = [state.user.id, activeFriend.id].sort().join('_');
        socket.emit('delete_message', { messageId: msgId, type: 'private', conversationId: convId });
      }
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function scrollToMsg(msgId) {
  const el = document.querySelector(`[data-id="${msgId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'background .3s';
    el.style.background = 'var(--accent-d)';
    setTimeout(() => { el.style.background = ''; }, 1500);
  }
}

function startChat(userId) {
  const friend = state.friends.find(f => f.id === userId);
  if (friend) openPrivateChat(friend);
}
