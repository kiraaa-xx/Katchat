async function openPrivateChat(friend) {
  activeFriend = friend;
  replyToMsg = null;
  selectedImages = [];

  document.getElementById('priv-reply-preview')?.classList.add('hidden');
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
    container.innerHTML = `<div class="empty-state"><i class="fa fa-circle-exclamation"></i><p>${friendlyError(err) || 'Failed to load messages.'}</p></div>`;
  }
}

function renderPrivateMsgs(messages, container) {
  container.innerHTML = '';
  if (!messages.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa fa-comment-dots"></i><h4 class="es-title">No messages yet</h4><p>Start the conversation by saying hello!</p></div>`;
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

  const imgs = msg.images || [];
  const imagesHtml = imgs.length ? `
    <div class="msg-imgs count-${Math.min(imgs.length,5)}">
      ${imgs.map((s,i) => `
        <div class="msg-img-wrap">
          <img src="${esc(s)}" onclick="openImgViewer([${imgs.map(u=>onclickStr(u)).join(',')}],${i})" loading="lazy">
          <button class="img-dl-btn" onclick="event.stopPropagation();downloadImg(${onclickStr(s)})" title="Download"><i class="fa fa-download"></i></button>
        </div>`).join('')}
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
        ${isOwn ? `<span class="msg-read"><i class="fa fa-check${msg.read_by?.length ? '-double" style="color:var(--accent)' : ''}"></i></span>` : ''}
        <div class="msg-actions">
          <button class="mac-btn" onclick="setPrivReply(event,'${msg.id}',${onclickStr(sender.display_name)},${onclickStr((msg.content||'').substring(0,60))})" title="Reply"><i class="fa fa-reply"></i></button>
          ${imgs.length > 1 ? `<button class="mac-btn" onclick="downloadAllImgs([${imgs.map(u=>onclickStr(u)).join(',')}])" title="Download all"><i class="fa fa-images"></i></button>` : ''}
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
    const doUpload = async function() {
      const fd = new FormData();
      if (content) fd.append('content', content);
      if (replyToMsg) fd.append('replyTo', replyToMsg.id);
      selectedImages.forEach(f => fd.append('images', f));
      showUploadProgress(true);
      setUploadProgress(0, 'Uploading images...');
      try {
        const data = await uploadWithProgress('POST', `/messages/private/${activeFriend.id}`, fd, function(pct) {
          setUploadProgress(pct, 'Uploading ' + Math.round(pct * 100) + '%');
        });
        showUploadProgress(false);
        if (data.message) appendPrivateMsg(data.message);
      } catch (err) {
        showUploadRetry(doUpload);
        return;
      }
    };
    await doUpload();
  } else {
    const tempId = `temp_${Date.now()}`;
    if (socket) {
      socket.emit('send_private_message', { recipientId: activeFriend.id, content, replyTo: replyToMsg?.id, tempId });
    }
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
  const all = Array.from(input.files);
  if (!all.length) return;
  if (all.length > 5) { showToast('You can only upload up to 5 images at a time.', 'error'); input.value = ''; return; }
  const maxPerFile = 5 * 1024 * 1024;
  const maxTotal = 10 * 1024 * 1024;
  let totalSize = 0;
  for (const f of all) {
    if (f.size > maxPerFile) { showToast(`"${f.name}" is too large. Max 5MB per image.`, 'error'); input.value = ''; return; }
    totalSize += f.size;
  }
  if (totalSize > maxTotal) { showToast('Total image size exceeds 10MB. Please choose smaller files.', 'error'); input.value = ''; return; }
  selectedImages = all;
  renderImgPreviews();
}
function renderImgPreviews() {
  const preview = document.getElementById('img-previews');
  preview.innerHTML = '';
  preview.classList.remove('hidden');
  selectedImages.forEach((f, i) => {
    const url = URL.createObjectURL(f);
    const item = document.createElement('div');
    item.className = 'img-prev-item';
    item.innerHTML = `<img src="${url}"><button onclick="removeImg(${i})"><i class="fa fa-xmark"></i></button>`;
    preview.appendChild(item);
  });
}
function removeImg(i) {
  selectedImages.splice(i, 1);
  if (!selectedImages.length) { clearImgPreviews(); return; }
  renderImgPreviews();
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

// ── Image download helpers ────────────────────────────────────
function downloadImg(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = url.split('/').pop() || 'image.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadAllImgs(urls) {
  urls.forEach((url, i) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `image_${i+1}_${url.split('/').pop() || 'image.jpg'}`;
    document.body.appendChild(a);
    setTimeout(() => { a.click(); a.remove(); }, i * 300);
  });
}

// ── Chat Search ──────────────────────────────────────────────
let chatSearchMatches = [];
let chatSearchCurrent = -1;
let savedBubbles = new Map();

function openChatSearch() {
  const bar = document.getElementById('ch-search-bar');
  if (!bar) return;
  bar.classList.remove('hidden');
  document.getElementById('ch-search-input').value = '';
  document.getElementById('ch-search-input').focus();
  document.getElementById('ch-search-meta').classList.add('hidden');
  const searchBtn = document.querySelector('.chat-search-btn');
  if (searchBtn) searchBtn.style.display = 'none';
  savedBubbles.clear();
  document.querySelectorAll('#priv-msgs .bubble:not(.deleted):not(.system)').forEach(b => {
    savedBubbles.set(b, b.innerHTML);
  });
}

function closeChatSearch() {
  const bar = document.getElementById('ch-search-bar');
  if (!bar) return;
  bar.classList.add('hidden');
  const searchBtn = document.querySelector('.chat-search-btn');
  if (searchBtn) searchBtn.style.display = '';
  chatSearchMatches = [];
  chatSearchCurrent = -1;
  savedBubbles.forEach((html, bubble) => { bubble.innerHTML = html; });
  savedBubbles.clear();
  document.querySelectorAll('.search-match-row').forEach(el => el.classList.remove('search-match-row'));
  document.querySelectorAll('.search-highlight, .search-highlight-current').forEach(el => {
    const txt = document.createTextNode(el.textContent);
    el.parentNode.replaceChild(txt, el);
  });
}

function searchPrivateChat(query) {
  const meta = document.getElementById('ch-search-meta');
  const count = document.getElementById('ch-search-count');
  if (!meta || !count) return;
  if (!query.trim()) {
    meta.classList.add('hidden');
    chatSearchMatches = [];
    chatSearchCurrent = -1;
    savedBubbles.forEach((html, bubble) => { bubble.innerHTML = html; });
    document.querySelectorAll('.search-match-row').forEach(el => el.classList.remove('search-match-row'));
    return;
  }
  const q = query.toLowerCase();
  const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQ})`, 'gi');
  chatSearchMatches = [];
  chatSearchCurrent = -1;
  document.querySelectorAll('#priv-msgs .msg-row[data-id]').forEach(row => {
    const bubble = row.querySelector('.bubble:not(.deleted):not(.system)');
    if (!bubble) return;
    const originalHtml = savedBubbles.get(bubble);
    if (!originalHtml) return;
    if (bubble.textContent.toLowerCase().includes(q)) {
      chatSearchMatches.push(row);
      row.classList.add('search-match-row');
      bubble.innerHTML = originalHtml.replace(regex, '<span class="search-highlight">$1</span>');
    } else {
      row.classList.remove('search-match-row');
      bubble.innerHTML = originalHtml;
    }
  });
  if (chatSearchMatches.length) {
    meta.classList.remove('hidden');
    chatSearchCurrent = 0;
    goToChatMatch(0);
  } else {
    meta.classList.remove('hidden');
    count.textContent = '0/0';
  }
}

function goToChatMatch(index) {
  if (!chatSearchMatches.length) return;
  const idx = (index + chatSearchMatches.length) % chatSearchMatches.length;
  chatSearchCurrent = idx;
  document.querySelectorAll('.search-highlight-current').forEach(el => {
    el.classList.remove('search-highlight-current');
    el.classList.add('search-highlight');
  });
  const row = chatSearchMatches[idx];
  row.querySelectorAll('.search-highlight').forEach(el => {
    el.classList.remove('search-highlight');
    el.classList.add('search-highlight-current');
  });
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('ch-search-count').textContent = `${idx + 1}/${chatSearchMatches.length}`;
}

function nextChatMatch() { goToChatMatch(chatSearchCurrent + 1); }
function prevChatMatch() { goToChatMatch(chatSearchCurrent - 1); }

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    const vChat = document.getElementById('v-chat');
    if (vChat && !vChat.classList.contains('hidden') && activeFriend) {
      e.preventDefault();
      openChatSearch();
    }
  }
  if (e.key === 'Escape') {
    const bar = document.getElementById('ch-search-bar');
    if (bar && !bar.classList.contains('hidden')) {
      closeChatSearch();
    }
  }
});
