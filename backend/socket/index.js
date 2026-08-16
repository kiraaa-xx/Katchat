const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
const stripHtml = (s) => typeof s === 'string' ? s.replace(/<[^>]*>/g, '').trim().slice(0, 5000) : '';

const onlineUsers = new Map(); // userId -> socketId

const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// Fallback permissions when the roles table has no row for a system role
const fallbackPerms = (roleName) => ({
  canChat: true,
  canGlobalChat: ['owner', 'admin', 'member'].includes(roleName),
  canUseCommands: ['owner', 'admin'].includes(roleName),
  canBanUsers: ['owner', 'admin'].includes(roleName),
  canDeleteMessages: ['owner', 'admin'].includes(roleName),
  canCreateAnnouncements: ['owner', 'admin'].includes(roleName),
  canCommentAnnouncements: true,
  canAccessAdminPanel: ['owner', 'admin'].includes(roleName)
});

const getPerms = async (roleName) => {
  try {
    const { data: role, error } = await supabase.from('roles').select('permissions').eq('name', roleName).single();
    if (error || !role?.permissions) return fallbackPerms(roleName);
    return { ...fallbackPerms(roleName), ...role.permissions };
  } catch {
    return fallbackPerms(roleName);
  }
};

const areFriends = async (a, b) => {
  const { data: r1 } = await supabase.from('friends').select('status').eq('user_id', a).eq('friend_id', b).maybeSingle();
  if (r1?.status === 'accepted') return true;
  const { data: r2 } = await supabase.from('friends').select('status').eq('user_id', b).eq('friend_id', a).maybeSingle();
  return r2?.status === 'accepted';
};

const hasPendingFriendRequest = async (a, b) => {
  const { data: r1 } = await supabase.from('friends').select('id').eq('user_id', a).eq('friend_id', b).eq('status', 'pending').maybeSingle();
  if (r1) return true;
  const { data: r2 } = await supabase.from('friends').select('id').eq('user_id', b).eq('friend_id', a).eq('status', 'pending').maybeSingle();
  return Boolean(r2);
};

// Per-socket sliding-window throttle; returns true when allowed
const throttle = (socket, key, limit, windowMs) => {
  const now = Date.now();
  socket._throttle = socket._throttle || {};
  const entry = socket._throttle[key] || { times: [] };
  entry.times = entry.times.filter((t) => now - t < windowMs);
  if (entry.times.length >= limit) return false;
  entry.times.push(now);
  socket._throttle[key] = entry;
  return true;
};

// Validate that a conversation id is a pair of UUIDs and uid is a participant
const convParticipates = (conversationId, uid) => {
  if (typeof conversationId !== 'string') return false;
  const parts = conversationId.split('_');
  return parts.length === 2 && parts.every(isUuid) && parts.includes(uid);
};

const emitError = (socket, message) => socket.emit('error', { message });

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('No token'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { data: user } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
      if (!user) return next(new Error('Invalid token'));
      if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && user.email_verified === false) {
        return next(new Error('Email verification required'));
      }
      socket.user = user;
      next();
    } catch (err) { next(new Error('Auth error')); }
  });

  io.on('connection', async (socket) => {
    const uid = socket.user.id;
    onlineUsers.set(uid, socket.id);
    const { data: freshUser } = await supabase.from('users').select('*').eq('id', uid).single();
    if (freshUser) {
      socket.user = freshUser;
      // Auto-unban ONLY if a temp ban exists AND it expired
      if (freshUser.is_banned_from_global && freshUser.temp_ban_until && new Date(freshUser.temp_ban_until) < new Date()) {
        await supabase.from('users').update({ is_banned_from_global: false, banned_by: null, ban_reason: null, temp_ban_until: null }).eq('id', uid);
        socket.user.is_banned_from_global = false;
        socket.emit('unbanned_from_global');
      }
    }
    await supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', uid);
    io.emit('user_status', { userId: uid, isOnline: true });
    // Broadcast updated online count
    io.emit('online_count', { count: onlineUsers.size });
    socket.join('global');

    socket.on('join_conversation', ({ conversationId }) => {
      if (convParticipates(conversationId, uid)) socket.join(conversationId);
    });
    socket.on('leave_conversation', ({ conversationId }) => {
      if (typeof conversationId === 'string') socket.leave(conversationId);
    });

    socket.on('send_private_message', async ({ recipientId, content, replyTo, tempId }) => {
      if (!throttle(socket, 'msg', 15, 10000)) return emitError(socket, 'You are sending messages too fast');
      if (!isUuid(recipientId) || recipientId === uid) return;
      try {
        const perms = await getPerms(socket.user.role);
        if (!perms.canChat) return emitError(socket, 'You do not have permission to chat');
        if (!(await areFriends(uid, recipientId))) return emitError(socket, 'You can only message your friends');

        const safeContent = stripHtml(content);
        if (!safeContent && !replyTo) return;
        const convId = [uid, recipientId].sort().join('_');
        const { data: message, error: insertErr } = await supabase.from('messages').insert({ sender_id: uid, content: safeContent, type: 'private', conversation_id: convId, reply_to: replyTo || null }).select().single();
        if (insertErr || !message) throw insertErr || new Error('insert failed');
        const { data: sender } = await supabase.from('users').select('id,display_name,username,profile_picture,profile_color,role,bio,created_at,pronouns,is_online,last_seen').eq('id', uid).single();
        let replyData = null;
        if (replyTo && isUuid(replyTo)) {
          const { data: r } = await supabase.from('messages').select('id,content,sender_id').eq('id', replyTo).maybeSingle();
          replyData = r;
        }
        const enriched = { ...message, sender, reply_to_msg: replyData, tempId };
        socket.emit('message_sent', enriched);
        const recipientSocket = onlineUsers.get(recipientId);
        if (recipientSocket) io.to(recipientSocket).emit('new_private_message', enriched);
      } catch (err) {
        console.error('send_private_message error:', err);
        emitError(socket, 'Failed to send message');
      }
    });

    socket.on('send_global_message', async ({ content, replyTo, mentions }) => {
      if (!throttle(socket, 'msg', 15, 10000)) return emitError(socket, 'You are sending messages too fast');
      try {
        const safeContent = stripHtml(content);
        if (!safeContent && !replyTo) return;
        const { data: freshUser } = await supabase.from('users').select('is_banned_from_global,ban_reason,role,temp_ban_until').eq('id', uid).single();
        if (freshUser?.is_banned_from_global) {
          // Auto-unban ONLY when a temp ban expired (permanent bans have temp_ban_until = null)
          if (freshUser.temp_ban_until && new Date(freshUser.temp_ban_until) < new Date()) {
            await supabase.from('users').update({ is_banned_from_global: false, banned_by: null, ban_reason: null, temp_ban_until: null }).eq('id', uid);
            const unbannedSocket = onlineUsers.get(uid);
            if (unbannedSocket) io.to(unbannedSocket).emit('unbanned_from_global');
            io.to('global').emit('new_global_message', { id: `sys_${Date.now()}`, content: `✅ @${socket.user.username}'s temporary ban has expired`, type: 'global', isSystem: true, created_at: new Date() });
          } else {
            return socket.emit('banned_from_global', { reason: freshUser.ban_reason || null });
          }
        }
        const userRole = freshUser?.role || socket.user.role;
        const roleData = await getPerms(userRole);
        if (roleData.canUseCommands && content.startsWith('/')) { await handleCommand(socket, io, content, onlineUsers); return; }
        if (!roleData.canGlobalChat) return emitError(socket, 'You do not have permission to send global messages');
        const isOwner = userRole === 'owner';
        const { data: message, error: insertErr } = await supabase.from('messages').insert({ sender_id: uid, content: safeContent, type: 'global', reply_to: replyTo || null, mentions: mentions || [], is_owner_message: isOwner }).select().single();
        if (insertErr || !message) throw insertErr || new Error('insert failed');
        const { data: sender } = await supabase.from('users').select('id,display_name,username,profile_picture,profile_color,role,bio,created_at,pronouns,is_online,last_seen').eq('id', uid).single();
        let replyData = null;
        if (replyTo && isUuid(replyTo)) {
          const { data: r } = await supabase.from('messages').select('id,content,sender_id').eq('id', replyTo).maybeSingle();
          replyData = r;
        }
        io.to('global').emit('new_global_message', { ...message, sender, reply_to_msg: replyData });
      } catch (err) {
        console.error('send_global_message error:', err);
        emitError(socket, 'Failed to send message');
      }
    });

    socket.on('delete_message', async ({ messageId, type, conversationId }) => {
      if (!isUuid(messageId)) return;
      try {
        const { data: msg } = await supabase.from('messages').select('sender_id').eq('id', messageId).maybeSingle();
        if (!msg) return;
        const perms = await getPerms(socket.user.role);
        if (msg.sender_id !== uid && !perms.canDeleteMessages) return emitError(socket, 'Not authorized');
        await supabase.from('messages').update({ deleted: true, content: '', images: [] }).eq('id', messageId);
        if (type === 'global') io.to('global').emit('message_deleted', { messageId });
        else if (typeof conversationId === 'string' && convParticipates(conversationId, uid)) io.to(conversationId).emit('message_deleted', { messageId });
      } catch (err) {
        console.error('delete_message error:', err);
        emitError(socket, 'Failed to delete message');
      }
    });

    socket.on('typing_start', ({ recipientId }) => {
      if (!throttle(socket, 'typing', 1, 2000)) return;
      if (!isUuid(recipientId) || recipientId === uid) return;
      const s = onlineUsers.get(recipientId);
      if (s) io.to(s).emit('typing_start', { userId: uid });
    });
    socket.on('typing_stop', ({ recipientId }) => {
      if (!isUuid(recipientId) || recipientId === uid) return;
      const s = onlineUsers.get(recipientId);
      if (s) io.to(s).emit('typing_stop', { userId: uid });
    });
    socket.on('message_read', async ({ conversationId, senderId }) => {
      if (!convParticipates(conversationId, uid) || !isUuid(senderId)) return;
      try {
        const s = onlineUsers.get(senderId);
        if (s) io.to(s).emit('messages_read', { conversationId, readerId: uid });
        const { data: unread } = await supabase.from('messages')
          .select('id,read_by').eq('conversation_id', conversationId).neq('sender_id', uid);
        for (const m of unread || []) {
          const arr = m.read_by || [];
          if (!arr.includes(uid)) { arr.push(uid); await supabase.from('messages').update({ read_by: arr }).eq('id', m.id); }
        }
      } catch (err) { console.error('message_read error:', err); }
    });

    socket.on('notify_friend_request', async ({ recipientId }) => {
      if (!isUuid(recipientId) || recipientId === uid) return;
      try {
        if (!(await hasPendingFriendRequest(uid, recipientId))) return;
        const { data: me } = await supabase.from('users').select('id,display_name,username,profile_picture,profile_color,role').eq('id', uid).single();
        const s = onlineUsers.get(recipientId);
        if (s && me) io.to(s).emit('friend_request_received', { from: me });
      } catch (err) { console.error('notify_friend_request error:', err); }
    });

    socket.on('admin_ban_user', async ({ userId, reason }) => {
      if (!isUuid(userId) || userId === uid) return;
      try {
        const perms = await getPerms(socket.user.role);
        if (!perms.canBanUsers) return emitError(socket, 'Not authorized');
        const { data: target } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
        if (!target) return;
        if (['admin', 'owner'].includes(target.role) && socket.user.role !== 'owner') return emitError(socket, 'Cannot ban admin or owner');
        const bannedSocket = onlineUsers.get(userId);
        if (bannedSocket) io.to(bannedSocket).emit('banned_from_global', { reason: stripHtml(reason) || null });
      } catch (err) { console.error('admin_ban_user error:', err); }
    });
    socket.on('admin_unban_user', async ({ userId }) => {
      if (!isUuid(userId) || userId === uid) return;
      try {
        const perms = await getPerms(socket.user.role);
        if (!perms.canBanUsers) return emitError(socket, 'Not authorized');
        const unbannedSocket = onlineUsers.get(userId);
        if (unbannedSocket) io.to(unbannedSocket).emit('unbanned_from_global');
      } catch (err) { console.error('admin_unban_user error:', err); }
    });

    // Request online count
    socket.on('get_online_count', () => {
      socket.emit('online_count', { count: onlineUsers.size });
    });

    socket.on('disconnect', async () => {
      onlineUsers.delete(uid);
      await supabase.from('users').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', uid);
      io.emit('user_status', { userId: uid, isOnline: false, lastSeen: new Date() });
      io.emit('online_count', { count: onlineUsers.size });
    });
  });
};

async function handleCommand(socket, io, content, onlineUsers) {
  const cmdMatch = content.match(/^(\S+)\s+@?(\S+)(?:\s+"([^"]+)")?(?:\s+(\S+))?/);
  if (!cmdMatch) return emitError(socket, 'Invalid command. Use: /ban @username "reason"');
  const cmd = cmdMatch[1].toLowerCase().replace(/[^a-z0-9_]/g, '');
  const target = cmdMatch[2];
  const reason = stripHtml(cmdMatch[3] || null);
  const hoursArg = cmdMatch[4] || cmdMatch[3];
  // Whitelist only safe chars (no commas, quotes, parens -> no filter injection)
  const safeTarget = target.replace(/[^A-Za-z0-9_.-]/g, '').trim();
  if (!safeTarget) return emitError(socket, 'Invalid target');

  const perms = await getPerms(socket.user.role);
  if (['/ban', '/unban', '/tban', '/tunban'].includes(cmd) && !perms.canBanUsers) {
    return emitError(socket, 'You do not have permission to ban users');
  }

  // Exact username OR display-name match only (no substring wildcards)
  const { data: targetUser } = await supabase.from('users')
    .select('id,username,display_name,role,is_banned_from_global')
    .or(`username.eq.${safeTarget},display_name.eq.${safeTarget}`)
    .maybeSingle();
  if (!targetUser) return emitError(socket, `User "@${safeTarget}" not found`);

  if (cmd === '/ban' || cmd === '/tban') {
    if (['admin', 'owner'].includes(targetUser.role) && socket.user.role !== 'owner') {
      return emitError(socket, 'Cannot ban admin or owner');
    }
    const hours = cmd === '/tban' ? Math.min(Math.max(parseFloat(hoursArg) || 1, 0.01), 720) : null;
    const tempBanUntil = hours ? new Date(Date.now() + hours * 3600000).toISOString() : null;
    // Permanent bans clear temp_ban_until so auto-unban never fires for them
    await supabase.from('users').update({ is_banned_from_global: true, banned_by: socket.user.id, ban_reason: reason, temp_ban_until: tempBanUntil }).eq('id', targetUser.id);
    const bannedSocket = onlineUsers.get(targetUser.id);
    if (bannedSocket) io.to(bannedSocket).emit('banned_from_global', { reason });
    const sysMsg = `⚠️ ${socket.user.display_name} has ${hours ? `temp-banned for ${hours}h` : 'banned'} @${targetUser.username} from global chat${reason ? ` (${reason})` : ''}`;
    io.to('global').emit('new_global_message', { id: `sys_${Date.now()}`, content: sysMsg, type: 'global', isSystem: true, created_at: new Date() });
  } else if (cmd === '/unban' || cmd === '/tunban') {
    await supabase.from('users').update({ is_banned_from_global: false, banned_by: null, ban_reason: null, temp_ban_until: null }).eq('id', targetUser.id);
    const unbannedSocket = onlineUsers.get(targetUser.id);
    if (unbannedSocket) io.to(unbannedSocket).emit('unbanned_from_global');
    io.to('global').emit('new_global_message', { id: `sys_${Date.now()}`, content: `✅ ${socket.user.display_name} has unbanned @${targetUser.username}`, type: 'global', isSystem: true, created_at: new Date() });
  } else {
    emitError(socket, 'Unknown command');
  }
}
module.exports.onlineUsers = onlineUsers;