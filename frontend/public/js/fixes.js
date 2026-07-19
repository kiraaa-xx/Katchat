/**
 * KATCHAT PRODUCTION FIXES & ENHANCEMENTS
 * This file contains critical fixes, error handling, and missing pieces
 * Loaded before other JS files to establish global functions
 */

// ===== PREVENT DOUBLE INITIALIZATION =====
if (window.__katchat_fixes_loaded__) {
  console.log('🔧 KatChat fixes already loaded');
} else {
  window.__katchat_fixes_loaded__ = true;
  console.log('🔧 Loading KatChat production fixes...');

  // ===== GLOBAL FUNCTION SAFETY WRAPPERS =====
  
  /**
   * Safe console error - always logs to console for debugging
   */
  window.logError = function(ctx, err) {
    console.error(`[${ctx}]`, err instanceof Error ? err.message : err);
  };

  /**
   * Wrapper for async operations with error handling
   */
  window.safeAsync = async function(fn, ctx = 'async-op') {
    try {
      return await fn();
    } catch (err) {
      logError(ctx, err);
      if (typeof showToast === 'function') {
        showToast((err?.message || 'An error occurred'), 'error');
      }
      throw err;
    }
  };

  /**
   * Ensure a DOM element exists before manipulating it
   */
  window.safeDom = function(id, fallback = null) {
    const el = document.getElementById(id);
    if (!el) {
      logError('safeDom', `Element #${id} not found`);
      return fallback || { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} };
    }
    return el;
  };

  // ===== CRITICAL MISSING FUNCTIONS =====

  /**
   * Show/hide mention dropdown
   */
  window.showMentionDropdown = window.showMentionDropdown || function(query) {
    logError('showMentionDropdown', 'Function not defined in global.js');
  };

  window.hideMentionDropdown = window.hideMentionDropdown || function() {
    try {
      const dropdown = safeDom('mention-dropdown');
      if (dropdown && dropdown.classList) {
        dropdown.classList.add('hidden');
      }
      window.mentionFocusIdx = -1;
    } catch (err) {
      logError('hideMentionDropdown', err);
    }
  };

  /**
   * Insert mention into input
   */
  window.insertMention = window.insertMention || function(username) {
    try {
      const inp = safeDom('global-input');
      if (inp) {
        inp.value = inp.value.replace(/@(\w*)$/, `@${username} `);
        inp.focus();
      }
      hideMentionDropdown();
    } catch (err) {
      logError('insertMention', err);
    }
  };

  /**
   * Insert command into input
   */
  window.insertCommand = window.insertCommand || function(cmd) {
    try {
      const inp = safeDom('global-input');
      if (inp) {
        inp.value = `${cmd} @`;
        inp.focus();
      }
      hideMentionDropdown();
      setTimeout(() => globalInput(inp), 10);
    } catch (err) {
      logError('insertCommand', err);
    }
  };

  /**
   * Insert command user suggestion
   */
  window.insertCommandUser = window.insertCommandUser || function(cmd, username) {
    try {
      const inp = safeDom('global-input');
      if (inp) {
        inp.value = `${cmd} @${username} `;
        inp.focus();
      }
      hideMentionDropdown();
    } catch (err) {
      logError('insertCommandUser', err);
    }
  };

  /**
   * Global chat input handler
   */
  window.globalInput = window.globalInput || function(el) {
    try {
      if (typeof autoResize === 'function') {
        autoResize(el);
      }
      const val = el.value;
      const cur = el.selectionStart;
      const textBefore = val.substring(0, cur);

      const mMatch = textBefore.match(/@(\w*)$/);
      if (mMatch && typeof showMentionDropdown === 'function') {
        showMentionDropdown(mMatch[1]);
        return;
      }

      const canUseCommands = state?.roles?.find(r => r.name === state.user?.role)?.permissions?.canUseCommands;
      if (canUseCommands && val.startsWith('/') && typeof showCommandDropdown === 'function') {
        showCommandDropdown(val);
        return;
      }

      hideMentionDropdown();
    } catch (err) {
      logError('globalInput', err);
    }
  };

  /**
   * Global chat key handler
   */
  window.globalKey = window.globalKey || function(e) {
    try {
      const dropdown = safeDom('mention-dropdown');
      if (dropdown && !dropdown.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveMentionFocus(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); moveMentionFocus(-1); return; }
        if (e.key === 'Enter' || e.key === 'Tab') {
          const focused = dropdown.querySelector('.mention-item.focused');
          if (focused) { e.preventDefault(); focused.click(); return; }
        }
        if (e.key === 'Escape') { hideMentionDropdown(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGlobal(); return; }
      if (typeof autoResize === 'function') {
        autoResize(e.target);
      }
    } catch (err) {
      logError('globalKey', err);
    }
  };

  /**
   * Move mention focus
   */
  window.moveMentionFocus = window.moveMentionFocus || function(dir) {
    try {
      const dropdown = safeDom('mention-dropdown');
      const items = dropdown.querySelectorAll('.mention-item');
      if (!items.length) return;
      items.forEach(el => el.classList.remove('focused'));
      window.mentionFocusIdx = (window.mentionFocusIdx + dir + items.length) % items.length;
      items[window.mentionFocusIdx]?.classList.add('focused');
      items[window.mentionFocusIdx]?.scrollIntoView({ block: 'nearest' });
    } catch (err) {
      logError('moveMentionFocus', err);
    }
  };

  /**
   * Show command dropdown
   */
  window.showCommandDropdown = window.showCommandDropdown || function(val) {
    try {
      const dropdown = safeDom('mention-dropdown');
      if (!dropdown) return;
      
      const parts = val.split(/\s+/);
      const cmdPart = parts[0].toLowerCase();
      const rawTarget = parts[1] ? parts[1].replace(/^@/, '') : '';

      const cmds = [
        { cmd: '/ban',    usage: '/ban @username "reason"',          desc: 'Permanently ban from global chat' },
        { cmd: '/unban',  usage: '/unban @username',                 desc: 'Remove ban' },
        { cmd: '/tban',   usage: '/tban @username 2.5 "reason"',     desc: 'Temp-ban for N hours' },
        { cmd: '/tunban', usage: '/tunban @username',                desc: 'Remove temporary ban early' },
      ];

      let html = '';

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

      if (parts.length >= 2 && ['/ban','/unban','/tban','/tunban'].includes(cmdPart)) {
        const allGlobalUsers = window.allGlobalUsers || [];
        const userMatches = allGlobalUsers
          .filter(u => u.id !== state?.user?.id && (
            rawTarget === '' ||
            u.username.toLowerCase().includes(rawTarget.toLowerCase()) ||
            u.display_name.toLowerCase().includes(rawTarget.toLowerCase())
          ))
          .slice(0, 6);

        if (userMatches.length) {
          html += `<div class="mention-sep"><i class="fa fa-user" style="margin-right:4px"></i>Users${rawTarget ? ` matching "${rawTarget}"` : ''}</div>`;
          html += userMatches.map(u => {
            const av = makeAvEl(u, 'xs');
            return `
            <div class="mention-item" onclick="insertCommandUser('${cmdPart}','${u.username}')">
              ${av?.outerHTML || ''}
              <div class="mention-info">
                <span class="mention-name">${esc(u.display_name)}</span>
                <span class="mention-un">@${u.username} ${u.is_banned_from_global ? '<span class="ban-badge"><i class="fa fa-ban"></i></span>' : ''}</span>
              </div>
            </div>`;
          }).join('');
        }
      }

      if (!html) { hideMentionDropdown(); return; }
      dropdown.innerHTML = html;
      dropdown.classList.remove('hidden');
    } catch (err) {
      logError('showCommandDropdown', err);
    }
  };

  /**
   * Send global message with error handling
   */
  window.sendGlobal = window.sendGlobal || function() {
    try {
      if (state?.user?.is_banned_from_global) {
        showToast('You are banned from global chat', 'error');
        return;
      }
      const input = safeDom('global-input');
      if (!input) return;
      const content = input.value.trim();
      if (!content) return;
      input.value = '';
      input.style.height = 'auto';
      hideMentionDropdown();
      if (typeof socket !== 'undefined' && socket) {
        const mentions = [];
        const allGlobalUsers = window.allGlobalUsers || [];
        (content.match(/@(\w+)/g) || []).forEach(m => {
          const u = allGlobalUsers.find(x => x.username === m.slice(1));
          if (u) mentions.push(u.id);
        });
        socket.emit('send_global_message', { 
          content, 
          replyTo: window.globalReplyToMsg?.id || null, 
          mentions 
        });
      }
      if (typeof cancelGlobalReply === 'function') {
        cancelGlobalReply();
      }
    } catch (err) {
      logError('sendGlobal', err);
      showToast('Failed to send message', 'error');
    }
  };

  /**
   * Delete global message with error handling
   */
  window.deleteGlobalMsg = window.deleteGlobalMsg || function(msgId) {
    try {
      if (typeof showConfirm !== 'function') {
        console.warn('showConfirm not available');
        return;
      }
      showConfirm('Delete Message', 'Remove this message from global chat?', () => {
        if (typeof socket !== 'undefined' && socket) {
          socket.emit('delete_message', { messageId: msgId, type: 'global', conversationId: null });
        }
      });
    } catch (err) {
      logError('deleteGlobalMsg', err);
    }
  };

  /**
   * Scroll to global message
   */
  window.scrollToGlobalMsg = window.scrollToGlobalMsg || function(msgId) {
    try {
      if (!msgId) return;
      const el = document.querySelector(`#global-msgs [data-id="${msgId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'background .3s ease';
        el.style.background = 'var(--accent-d)';
        setTimeout(() => { el.style.background = ''; }, 1800);
      }
    } catch (err) {
      logError('scrollToGlobalMsg', err);
    }
  };

  /**
   * Set global reply
   */
  window.setGlobalReply = window.setGlobalReply || function(msgId, senderName, content) {
    try {
      window.globalReplyToMsg = { id: msgId, content, senderName };
      const nameEl = safeDom('global-reply-name');
      const textEl = safeDom('global-reply-text');
      const preview = safeDom('global-reply-preview');
      if (nameEl) nameEl.textContent = senderName;
      if (textEl) textEl.textContent = content;
      if (preview) preview.classList.remove('hidden');
      const input = safeDom('global-input');
      if (input) input.focus();
    } catch (err) {
      logError('setGlobalReply', err);
    }
  };

  /**
   * Cancel global reply
   */
  window.cancelGlobalReply = window.cancelGlobalReply || function() {
    try {
      window.globalReplyToMsg = null;
      const preview = safeDom('global-reply-preview');
      if (preview) preview.classList.add('hidden');
    } catch (err) {
      logError('cancelGlobalReply', err);
    }
  };

  // ===== AVATAR/UI HELPERS =====

  /**
   * Initialize avatar element
   */
  window.setAvEl = window.setAvEl || function(el, user) {
    try {
      if (!el || !user) return;
      el.style.background = user.profile_color || user.profileColor || '#555';
      el.innerHTML = '';
      if (user.profile_picture || user.profilePicture) {
        const img = document.createElement('img');
        img.src = user.profile_picture || user.profilePicture;
        img.alt = '';
        img.onerror = () => { img.remove(); el.textContent = (user.display_name || user.username || '?')[0].toUpperCase(); };
        el.appendChild(img);
      } else {
        el.textContent = (user.display_name || user.username || '?')[0].toUpperCase();
      }
    } catch (err) {
      logError('setAvEl', err);
    }
  };

  // ===== GLOBAL STATE INITIALIZERS =====
  // These are initialized by global.js / state.js via window properties.
  // Window assignments here would shadow those, so keep this empty.
  // The actual initialization happens in the respective module files.

  console.log('✅ KatChat production fixes loaded successfully');
}
