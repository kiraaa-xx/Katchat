// ── User: Open Contact Owner Modal ────────────────────────────
function openOwnerContact() {
  const input = document.getElementById('owner-msg-input');
  const statusEl = document.getElementById('owner-msg-status');
  const countEl = document.getElementById('owner-msg-count');
  const btn = document.getElementById('owner-msg-send-btn');
  const inboxEl = document.getElementById('owner-msg-inbox');
  if (input) input.value = '';
  if (countEl) countEl.textContent = '0/2000';
  if (inboxEl) inboxEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--txt3)"><i class="fa fa-spinner fa-spin"></i> Loading...</div>';
  openModal('m-contact-owner');

  if (statusEl) {
    statusEl.className = '';
    statusEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--txt3)"><i class="fa fa-spinner fa-spin"></i> Checking...</div>';
  }
  if (btn) btn.disabled = true;

  // Load user's previous messages with replies
  api.getMyOwnerMessages().then(function(res) {
    const msgs = res.messages || [];
    if (inboxEl) {
      if (!msgs.length) {
        inboxEl.innerHTML = '';
      } else {
        var html = '<div style="margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:12px"><span style="font-size:12px;font-weight:600;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px"><i class="fa fa-clock-rotate-left"></i> Your Messages</span></div>';
        msgs.forEach(function(m) {
          var created = new Date(m.created_at);
          var dateStr = created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          html += '<div class="owner-msg-history-item' + (m.reply ? ' has-reply' : '') + '">' +
            '<div class="omh-meta">' + dateStr + '</div>' +
            '<div class="omh-content">' + esc(m.content) + '</div>';
          if (m.reply) {
            html += '<div class="omh-reply">' +
              '<div class="omh-reply-head"><i class="fa fa-reply" style="color:var(--danger)"></i> Owner replied</div>' +
              '<div class="omh-reply-content">' + esc(m.reply) + '</div>' +
              '</div>';
          }
          html += '</div>';
        });
        inboxEl.innerHTML = html;
      }
    }
    // Mark replies as read now that user has seen them
    api.markOwnerRepliesRead().catch(function(){});
    clearOwnerReplyNotif();
  }).catch(function() {
    if (inboxEl) inboxEl.innerHTML = '';
  });

  api.checkOwnerMessageStatus().then(function(result) {
    if (!result.canSend && result.nextAllowedAt) {
      var next = new Date(result.nextAllowedAt);
      var now = new Date();
      var diffMs = next - now;
      var hours = Math.floor(diffMs / 3600000);
      var minutes = Math.floor((diffMs % 3600000) / 60000);
      var timeStr = '';
      if (hours > 0) timeStr = hours + 'h ' + minutes + 'm';
      else if (minutes > 0) timeStr = minutes + 'm';
      else timeStr = 'less than a minute';
      if (statusEl) {
        statusEl.className = '';
        statusEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--danger)"><i class="fa fa-clock"></i> You already sent a message today. Next message available in <strong>' + timeStr + '</strong>.</div>';
      }
      if (input) input.disabled = true;
      if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
    } else {
      if (statusEl) { statusEl.className = 'hidden'; statusEl.innerHTML = ''; }
      if (input) input.disabled = false;
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
  }).catch(function() {
    if (statusEl) { statusEl.className = 'hidden'; statusEl.innerHTML = ''; }
    if (btn) btn.disabled = false;
  });
}

function updateOwnerMsgCount() {
  const el = document.getElementById('owner-msg-input');
  const countEl = document.getElementById('owner-msg-count');
  if (el && countEl) countEl.textContent = el.value.length + '/2000';
}

async function sendOwnerContact() {
  const input = document.getElementById('owner-msg-input');
  if (!input) return;
  const content = input.value.trim();
  const statusEl = document.getElementById('owner-msg-status');
  const btn = document.getElementById('owner-msg-send-btn');
  if (!content) { showToast('Please write a message', 'error'); return; }
  if (content.length > 2000) { showToast('Message too long (max 2000 chars)', 'error'); return; }
  btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Sending...';
  try {
    await api.sendOwnerMessage(content);
    input.value = '';
    document.getElementById('owner-msg-count').textContent = '0/2000';
    if (statusEl) {
      statusEl.className = '';
      statusEl.innerHTML = '<div style="color:var(--accent);padding:10px"><i class="fa fa-check-circle"></i> Message sent successfully!</div>';
    }
    setTimeout(function() { closeModal(); }, 2000);
  } catch (err) {
    if (err.message.includes('once per day') || err.message.includes('429')) {
      if (statusEl) {
        statusEl.className = '';
        statusEl.innerHTML = '<div style="color:var(--danger);padding:10px"><i class="fa fa-clock"></i> You can only send one message per day. Please try again tomorrow.</div>';
      }
    } else {
      showToast(err.message || 'Failed to send message', 'error');
      console.error('sendOwnerContact error:', err);
    }
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa fa-paper-plane"></i> Send Message';
  }
}

// ── User: Notification badge for unread owner replies ──────────
let _ownerReplyNotifShown = false;

function showOwnerReplyNotif() {
  const badge = document.getElementById('owner-reply-notif');
  if (badge) badge.classList.remove('hidden');
  _ownerReplyNotifShown = true;
}

function clearOwnerReplyNotif() {
  const badge = document.getElementById('owner-reply-notif');
  if (badge) badge.classList.add('hidden');
  _ownerReplyNotifShown = false;
}

// ── Socket: handle incoming owner reply notification ──────────
function handleOwnerReplyNotification(data) {
  showToast('You received a reply from the owner!', 'info');
  showOwnerReplyNotif();
}

// ── Admin: Load owner messages in admin panel ──────────────────
async function loadAdminOwnerMessages() {
  const list = document.getElementById('admin-owner-msgs-list');
  if (!list) return;
  list.innerHTML = '<div class="empty-state"><i class="fa fa-spinner fa-spin"></i><p>Loading messages...</p></div>';
  try {
    const { messages, unreadCount } = await api.getOwnerMessages();
    const notif = document.getElementById('owner-msg-notif');
    if (notif) {
      if (unreadCount > 0) { notif.textContent = unreadCount; notif.classList.remove('hidden'); }
      else { notif.classList.add('hidden'); }
    }
    const countEl = document.getElementById('owner-msg-count-display');
    if (countEl) countEl.textContent = messages.length;
    const unreadLabel = document.getElementById('owner-msg-unread-label');
    if (unreadLabel) unreadLabel.textContent = unreadCount > 0 ? unreadCount + ' unread' : '';
    list.innerHTML = '';
    if (!messages.length) {
      list.innerHTML = '<div class="empty-state"><i class="fa fa-inbox"></i><p>No contact messages yet</p></div>';
      return;
    }
    messages.forEach(function(m, i) {
      var row = document.createElement('div');
      row.className = 'admin-row';
      row.style.animationDelay = (i * 0.04) + 's';
      row.classList.add('admin-row-anim');
      var sender = m.sender || { display_name: 'Unknown', username: 'unknown', email: '' };
      var av = makeAvEl ? makeAvEl(sender, 'md') : (function() {
        var d = document.createElement('div');
        d.className = 'av md';
        d.textContent = (sender.display_name || '?')[0].toUpperCase();
        return d;
      })();
      var created = new Date(m.created_at);
      var dateStr = created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      var isUnread = !m.read;
      var hasReply = !!m.reply;
      var replyBoxId = 'reply-box-' + m.id.replace(/-/g, '');
      row.innerHTML = av.outerHTML +
        '<div class="ar-info">' +
          '<div class="ar-name">' +
            esc(sender.display_name) + ' <span style="color:var(--txt3);font-weight:400;font-size:12px">@' + esc(sender.username) + '</span>' +
            (isUnread ? '<span class="ban-badge" style="background:var(--accent-d);color:var(--accent)">New</span>' : '') +
          '</div>' +
          '<div class="ar-meta">' + dateStr + ' &middot; ' + esc(sender.email || '') + '</div>' +
          '<div class="ar-meta" style="margin-top:6px;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;font-size:13px;line-height:1.6;white-space:pre-wrap">' + esc(m.content) + '</div>' +
          (hasReply ? '<div class="omh-reply" style="margin-top:8px"><div class="omh-reply-head"><i class="fa fa-reply" style="color:var(--danger)"></i> Your Reply</div><div class="omh-reply-content">' + esc(m.reply) + '</div></div>' : '') +
          '<div id="' + replyBoxId + '" class="owner-reply-box hidden" style="margin-top:8px">' +
            '<textarea class="field-textarea" placeholder="Type your reply..." rows="2" style="min-height:50px;margin-bottom:6px"></textarea>' +
            '<button class="btn-xs primary" onclick="sendOwnerReply(\'' + m.id + '\',this)"><i class="fa fa-paper-plane"></i> Send Reply</button>' +
            '<button class="btn-xs" onclick="closeOwnerReplyBox(\'' + replyBoxId + '\')" style="margin-left:6px"><i class="fa fa-xmark"></i> Cancel</button>' +
          '</div>' +
        '</div>' +
        '<div class="ar-actions" style="display:flex;flex-direction:column;gap:4px">' +
          (isUnread ? '<button class="btn-xs primary" onclick="markOwnerMsgRead(\'' + m.id + '\',this)"><i class="fa fa-check"></i> Read</button>' : '') +
          (hasReply ? '' : '<button class="btn-xs accent" onclick="openOwnerReplyBox(\'' + replyBoxId + '\')"><i class="fa fa-reply"></i> Reply</button>') +
          '<button class="btn-xs danger" onclick="deleteOwnerMsg(\'' + m.id + '\',this)"><i class="fa fa-trash"></i> Delete</button>' +
        '</div>';
      list.appendChild(row);
    });
  } catch (err) {
    console.error('loadAdminOwnerMessages error:', err);
    list.innerHTML = '<div class="empty-state"><i class="fa fa-circle-exclamation"></i><p>' + esc(err.message) + '</p></div>';
  }
}

function openOwnerReplyBox(boxId) {
  var box = document.getElementById(boxId);
  if (box) box.classList.remove('hidden');
}

function closeOwnerReplyBox(boxId) {
  var box = document.getElementById(boxId);
  if (box) box.classList.add('hidden');
}

async function sendOwnerReply(msgId, btn) {
  var row = btn.closest('.admin-row');
  var box = btn.closest('.owner-reply-box');
  if (!box) return;
  var textarea = box.querySelector('textarea');
  if (!textarea) return;
  var reply = textarea.value.trim();
  if (!reply) { showToast('Please write a reply', 'error'); return; }
  if (reply.length > 2000) { showToast('Reply too long (max 2000 chars)', 'error'); return; }
  btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
  try {
    await api.replyToOwnerMessage(msgId, reply);
    showToast('Reply sent!', 'success');
    loadAdminOwnerMessages();
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false; btn.innerHTML = '<i class="fa fa-paper-plane"></i> Send Reply';
  }
}

async function markOwnerMsgRead(id) {
  try {
    await api.markOwnerMessageRead(id);
    showToast('Marked as read');
    loadAdminOwnerMessages();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteOwnerMsg(id, btn) {
  if (!confirm('Delete this message?')) return;
  try {
    await api.deleteOwnerMessage(id);
    showToast('Message deleted');
    var row = btn.closest('.admin-row');
    if (row) row.remove();
  } catch (err) { showToast(err.message, 'error'); }
}
