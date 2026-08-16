window.allGlobalUsers = window.allGlobalUsers || [];
window.mentionFocusIdx = -1;

async function openGlobal() {
  showView('global');
  globalReplyToMsg = null;
  document.getElementById('global-reply-preview').classList.add('hidden');
  document.getElementById('global-input').value = '';

  // Re-fetch user ban status
  const isBanned = state.user?.is_banned_from_global;
  const banReason = state.user?.ban_reason;
  const inputArea = document.getElementById('global-input-area');
  const bannedBar = document.getElementById('banned-bar');
  if (isBanned) {
    inputArea.classList.add('hidden');
    bannedBar.classList.remove('hidden');
    bannedBar.innerHTML = `<i class="fa fa-ban"></i> You are banned from global chat${banReason ? `. <strong>Reason:</strong> ${esc(banReason)}` : '.'}`;
  } else {
    inputArea.classList.remove('hidden');
    bannedBar.classList.add('hidden');
  }

  // Set input placeholder based on permissions
  const canUseCommands = state.roles.find(r => r.name === state.user?.role)?.permissions?.canUseCommands;
  document.getElementById('global-input').placeholder = canUseCommands
    ? 'Message everyone... (@mention, /command)'
    : 'Message everyone... (@mention)';

  // Load users for @mention and command suggestions (directory endpoint is
  // available to every authenticated user, unlike /users/all which is admin-only)
  try {
    const { users } = await api.getDirectory();
    allGlobalUsers = users || [];
    const onlineCount = allGlobalUsers.filter(u => u.is_online).length;
    const statusEl = document.getElementById('global-status');
    statusEl.textContent = `${onlineCount} online · ${allGlobalUsers.length} members`;
    statusEl.dataset.memberCount = allGlobalUsers.length;
    if (socket) socket.emit('get_online_count');
  } catch {}

  // Load messages without skeleton flash
  const container = document.getElementById('global-msgs');
  const isEmpty = !container.children.length || !!container.querySelector('.empty-state');
  if (isEmpty) container.innerHTML = '';

  try {
    const { messages } = await api.getGlobalMsgs();
    renderGlobalMsgs(messages, container);
    scrollToBottom('global-msgs');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><i class="fa fa-circle-exclamation"></i><p>${friendlyError(err) || 'Failed to load messages.'}</p></div>`;
  }
}

function renderGlobalMsgs(messages, container) {
  container.innerHTML = '';
  if (!messages.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa fa-globe"></i><h4 class="es-title">No messages yet</h4><p>Be the first to say something in the global chat!</p></div>`;
    return;
  }
  let lastDate = null;
  messages.forEach(msg => {
    if (msg.isSystem) {
      const el = document.createElement('div'); el.className = 'bubble system msg-appear';
      el.textContent = msg.content; container.appendChild(el); return;
    }
    const d = fmtDate(msg.created_at);
    if (d !== lastDate) {
      const div = document.createElement('div'); div.className = 'day-divider';
      div.innerHTML = `<span>${d}</span>`; container.appendChild(div); lastDate = d;
    }
    container.appendChild(makeGlobalMsgEl(msg));
  });
  if (typeof initSwipe === 'function') initSwipe(container);
}

function makeGlobalMsgEl(msg) {
  const isOwn = msg.sender_id === state.user?.id;
  const sender = msg.sender || {};
  const isOwnerMsg = msg.is_owner_message || sender.role === 'owner';

  const row = document.createElement('div');
  row.className = `msg-row ${isOwn ? 'own' : ''} ${isOwnerMsg ? 'owner-msg' : ''} msg-appear`;
  if (isOwnerMsg) {
    const oc = sender.profile_color || '#ef4444';
    row.style.setProperty('--owner-color', oc);
    row.style.setProperty('--owner-color-rgb', hexToRgb(oc));
  }
  if (msg.id) row.dataset.id = msg.id;

  if (msg.deleted) {
    row.innerHTML = `<div class="bubble deleted"><i class="fa fa-ban"></i> Message deleted</div>`;
    return row;
  }

  const av = makeAvEl(sender, 'xs');
  const replyHtml = msg.reply_to_msg ? `
    <div class="reply-quote" onclick="scrollToGlobalMsg('${msg.reply_to_msg.id || ''}')">
      <i class="fa fa-reply" style="color:var(--accent)"></i>
      ${esc((msg.reply_to_msg.content || 'Message').substring(0, 60))}
    </div>` : '';

  let content = esc(msg.content).replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>');
  const roleColor = getRoleColor(sender.role);
  const canDelete = isOwn || state.roles.find(r => r.name === state.user?.role)?.permissions?.canDeleteMessages;

  // Crown for owner messages
  const ownerCrown = (isOwnerMsg && !isOwn)
    ? `<i class="fa fa-crown owner-shine" style="color:var(--danger);margin-right:4px;font-size:12px"></i>` : '';

  row.innerHTML = `
    ${av.outerHTML}
    <div class="msg-body">
      <div class="sender-lbl" style="color:${roleColor}">
        ${ownerCrown}${esc(sender.display_name || 'Unknown')} ${getRoleBadge(sender.role)}
      </div>
      ${replyHtml}
      <div class="bubble">${content}</div>
      <div class="msg-meta">
        <span class="msg-time">${fmtTime(msg.created_at)}</span>
        <div class="msg-actions">
          <button class="mac-btn" onclick="setGlobalReply('${msg.id}',${onclickStr(sender.display_name || '')},${onclickStr((msg.content||'').substring(0,60))})" title="Reply"><i class="fa fa-reply"></i></button>
          ${!isOwn ? `<button class="mac-btn" onclick="openProfile(${safeJsonForOnclick(sender)})" title="Profile"><i class="fa fa-user"></i></button>` : ''}
          ${canDelete ? `<button class="mac-btn" onclick="deleteGlobalMsg('${msg.id}')" title="Delete" style="color:var(--danger)"><i class="fa fa-trash"></i></button>` : ''}
        </div>
      </div>
    </div>`;
  return row;
}

function setGlobalReply(msgId, senderName, content) {
  globalReplyToMsg = { id: msgId, content, senderName };
  document.getElementById('global-reply-name').textContent = senderName;
  document.getElementById('global-reply-text').textContent = content;
  document.getElementById('global-reply-preview').classList.remove('hidden');
  document.getElementById('global-input').focus();
}
function cancelGlobalReply() {
  globalReplyToMsg = null;
  document.getElementById('global-reply-preview').classList.add('hidden');
}

async function sendGlobal() {
  if (state.user?.is_banned_from_global) { showToast('You are banned from global chat', 'error'); return; }
  const input = document.getElementById('global-input');
  const content = input.value.trim();
  if (!content) return;
  input.value = ''; input.style.height = 'auto';
  hideMentionDropdown();
  if (socket) {
    const mentions = [];
    (content.match(/@(\w+)/g) || []).forEach(m => {
      const u = allGlobalUsers.find(x => x.username === m.slice(1));
      if (u) mentions.push(u.id);
    });
    socket.emit('send_global_message', { content, replyTo: globalReplyToMsg?.id || null, mentions });
  }
  cancelGlobalReply();
}

function globalKey(e) {
  const dropdown = document.getElementById('mention-dropdown');
  if (!dropdown.classList.contains('hidden')) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveMentionFocus(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveMentionFocus(-1); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const focused = dropdown.querySelector('.mention-item.focused');
      if (focused) { e.preventDefault(); focused.click(); return; }
    }
    if (e.key === 'Escape') { hideMentionDropdown(); return; }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGlobal(); return; }
  autoResize(e.target);
}

function globalInput(el) {
  autoResize(el);
  const val = el.value;
  const cur = el.selectionStart;
  const textBefore = val.substring(0, cur);

  // Check for @mention
  const mMatch = textBefore.match(/@(\w*)$/);
  if (mMatch) {
    showMentionDropdown(mMatch[1]);
    return;
  }

  // Check for slash commands (admin/owner only)
  const canUseCommands = state.roles.find(r => r.name === state.user?.role)?.permissions?.canUseCommands;
  if (canUseCommands && val.startsWith('/')) {
    showCommandDropdown(val);
    return;
  }

  hideMentionDropdown();
}

function showMentionDropdown(query) {
  const dropdown = document.getElementById('mention-dropdown');
  const q = query.toLowerCase();
  const matches = allGlobalUsers
    .filter(u => u.id !== state.user.id &&
      (u.username.toLowerCase().startsWith(q) ||
       u.display_name.toLowerCase().startsWith(q) ||
       u.username.toLowerCase().includes(q) ||
       u.display_name.toLowerCase().includes(q)))
    .slice(0, 8);

  if (!matches.length) { hideMentionDropdown(); return; }
  mentionFocusIdx = -1;

  dropdown.innerHTML = matches.map((u, i) => `
    <div class="mention-item" data-idx="${i}" onclick="insertMention('${u.username}')">
      ${makeAvEl(u, 'xs').outerHTML}
      <div class="mention-info">
        <span class="mention-name">${esc(u.display_name)}</span>
        <span class="mention-un">@${u.username} ${getRoleBadge(u.role)}</span>
      </div>
    </div>`).join('');
  dropdown.classList.remove('hidden');
}

function showCommandDropdown(val) {
  const dropdown = document.getElementById('mention-dropdown');
  const parts = val.split(/\s+/);
  const cmdPart = parts[0].toLowerCase();
  // The @username part — strip @ if present
  const rawTarget = parts[1] ? parts[1].replace(/^@/, '') : '';

  const cmds = [
    { cmd: '/ban',    usage: '/ban @username "reason"',          desc: 'Permanently ban from global chat' },
    { cmd: '/unban',  usage: '/unban @username',                 desc: 'Remove ban' },
    { cmd: '/tban',   usage: '/tban @username 2.5 "reason"',     desc: 'Temp-ban for N hours (decimals OK)' },
    { cmd: '/tunban', usage: '/tunban @username',                desc: 'Remove temporary ban early' },
  ];

  let html = '';

  // Show command list if still typing the command itself
  if (parts.length <= 1) {
    const matching = cmds.filter(c => c.cmd.startsWith(cmdPart));
    if (matching.length) {
      html += `<div class="mention-sep"><i class="fa fa-terminal" style="margin-right:4px"></i>Commands</div>`;
      html += matching.map(c => `
        <div class="mention-item" onclick="insertCommand('${c.cmd}')">
          <div style="width:28px;text-align:center"><i class="fa fa-terminal" style="color:var(--accent);font-size:12px"></i></div>
          <div class="mention-info">
            <span class="mention-name" style="font-family:monospace;color:var(--accent)">${c.cmd}</span>
            <span class="mention-un">${c.usage} — ${c.desc}</span>
          </div>
        </div>`).join('');
    }
  }

  // Show user suggestions when we have at least 2 parts (command + username start)
  if (parts.length >= 2 && ['/ban','/unban','/tban','/tunban'].includes(cmdPart)) {
    const userMatches = allGlobalUsers
      .filter(u => u.id !== state.user.id && (
        rawTarget === '' ||
        u.username.toLowerCase().includes(rawTarget.toLowerCase()) ||
        u.display_name.toLowerCase().includes(rawTarget.toLowerCase())
      ))
      .slice(0, 6);

    if (userMatches.length) {
      html += `<div class="mention-sep"><i class="fa fa-user" style="margin-right:4px"></i>Users${rawTarget ? ` matching "${rawTarget}"` : ''}</div>`;
      html += userMatches.map(u => `
        <div class="mention-item" onclick="insertCommandUser(${onclickStr(cmdPart)},${onclickStr(u.username)})">
          ${makeAvEl(u, 'xs').outerHTML}
          <div class="mention-info">
            <span class="mention-name">${esc(u.display_name)}</span>
            <span class="mention-un">@${u.username} ${u.is_banned_from_global ? '<span class="ban-badge"><i class="fa fa-ban"></i></span>' : ''}</span>
          </div>
        </div>`).join('');
    }
  }

  if (!html) { hideMentionDropdown(); return; }
  dropdown.innerHTML = html;
  dropdown.classList.remove('hidden');
}

function moveMentionFocus(dir) {
  const dropdown = document.getElementById('mention-dropdown');
  const items = dropdown.querySelectorAll('.mention-item');
  if (!items.length) return;
  items.forEach(el => el.classList.remove('focused'));
  mentionFocusIdx = (mentionFocusIdx + dir + items.length) % items.length;
  items[mentionFocusIdx].classList.add('focused');
  items[mentionFocusIdx].scrollIntoView({ block: 'nearest' });
}

function hideMentionDropdown() {
  document.getElementById('mention-dropdown').classList.add('hidden');
  mentionFocusIdx = -1;
}

function insertMention(username) {
  const inp = document.getElementById('global-input');
  inp.value = inp.value.replace(/@(\w*)$/, `@${username} `);
  inp.focus(); hideMentionDropdown();
}

function insertCommand(cmd) {
  const inp = document.getElementById('global-input');
  inp.value = `${cmd} @`;
  inp.focus(); hideMentionDropdown();
  // Immediately trigger dropdown to show user list
  setTimeout(() => globalInput(inp), 10);
}

function insertCommandUser(cmd, username) {
  const inp = document.getElementById('global-input');
  const parts = inp.value.split(/\s+/);
  // Replace the @username part
  inp.value = `${cmd} @${username} `;
  inp.focus(); hideMentionDropdown();
}

async function deleteGlobalMsg(msgId) {
  showConfirm('Delete Message', 'Remove this message from global chat?', () => {
    if (socket) socket.emit('delete_message', { messageId: msgId, type: 'global', conversationId: null });
  });
}

function scrollToGlobalMsg(msgId) {
  if (!msgId) return;
  const el = document.querySelector(`#global-msgs [data-id="${msgId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'background .3s ease';
    el.style.background = 'var(--accent-d)';
    setTimeout(() => { el.style.background = ''; }, 1800);
  }
}
