const jwt = require('jsonwebtoken');
const supabase = require('../supabase');

const onlineUsers = new Map(); // userId -> socketId

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('No token'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { data: user } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
      if (!user) return next(new Error('Invalid token'));
      socket.user = user;
      next();
    } catch (err) { next(new Error('Auth error')); }
  });

  io.on('connection', async (socket) => {
    const uid = socket.user.id;
    onlineUsers.set(uid, socket.id);
    const { data: freshUser } = await supabase.from('users').select('*').eq('id', uid).single();
    if (freshUser) socket.user = freshUser;
    await supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', uid);
    io.emit('user_status', { userId: uid, isOnline: true });
    // Broadcast updated online count
    io.emit('online_count', { count: onlineUsers.size });
    socket.join('global');

    socket.on('join_conversation', ({ conversationId }) => socket.join(conversationId));
    socket.on('leave_conversation', ({ conversationId }) => socket.leave(conversationId));

    socket.on('send_private_message', async ({ recipientId, content, replyTo, tempId }) => {
      try {
        const convId = [uid, recipientId].sort().join('_');
        const { data: message } = await supabase.from('messages').insert({ sender_id: uid, content, type: 'private', conversation_id: convId, reply_to: replyTo || null }).select().single();
        const { data: sender } = await supabase.from('users').select('id,display_name,username,profile_picture,profile_color,role').eq('id', uid).single();
        let replyData = null;
        if (replyTo) { const { data: r } = await supabase.from('messages').select('id,content,sender_id').eq('id', replyTo).single(); replyData = r; }
        const enriched = { ...message, sender, reply_to_msg: replyData, tempId };
        socket.emit('message_sent', enriched);
        const recipientSocket = onlineUsers.get(recipientId);
        if (recipientSocket) io.to(recipientSocket).emit('new_private_message', enriched);
      } catch (err) { socket.emit('error', { message: err.message }); }
    });

    socket.on('send_global_message', async ({ content, replyTo, mentions }) => {
      try {
        const { data: freshUser } = await supabase.from('users').select('is_banned_from_global,ban_reason,role,temp_ban_until').eq('id', uid).single();
        if (freshUser?.is_banned_from_global) {
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
        const { data: roleData } = await supabase.from('roles').select('permissions').eq('name', userRole).single();
        if (roleData?.permissions?.canUseCommands && content.startsWith('/')) { await handleCommand(socket, io, content, onlineUsers); return; }
        const isOwner = userRole === 'owner';
        const { data: message } = await supabase.from('messages').insert({ sender_id: uid, content, type: 'global', reply_to: replyTo || null, mentions: mentions || [], is_owner_message: isOwner }).select().single();
        const { data: sender } = await supabase.from('users').select('id,display_name,username,profile_picture,profile_color,role').eq('id', uid).single();
        let replyData = null;
        if (replyTo) { const { data: r } = await supabase.from('messages').select('id,content,sender_id').eq('id', replyTo).single(); replyData = r; }
        io.to('global').emit('new_global_message', { ...message, sender, reply_to_msg: replyData });
      } catch (err) { socket.emit('error', { message: err.message }); }
    });

    socket.on('delete_message', async ({ messageId, type, conversationId }) => {
      try {
        const { data: msg } = await supabase.from('messages').select('sender_id').eq('id', messageId).single();
        if (!msg) return;
        const { data: role } = await supabase.from('roles').select('permissions').eq('name', socket.user.role).single();
        if (msg.sender_id !== uid && !role?.permissions?.canDeleteMessages) return socket.emit('error', { message: 'Not authorized' });
        await supabase.from('messages').update({ deleted: true, content: '', images: [] }).eq('id', messageId);
        if (type === 'global') io.to('global').emit('message_deleted', { messageId });
        else io.to(conversationId).emit('message_deleted', { messageId });
      } catch (err) { socket.emit('error', { message: err.message }); }
    });

    socket.on('typing_start', ({ recipientId }) => { const s = onlineUsers.get(recipientId); if (s) io.to(s).emit('typing_start', { userId: uid }); });
    socket.on('typing_stop', ({ recipientId }) => { const s = onlineUsers.get(recipientId); if (s) io.to(s).emit('typing_stop', { userId: uid }); });
    socket.on('message_read', async ({ conversationId, senderId }) => { const s = onlineUsers.get(senderId); if (s) io.to(s).emit('messages_read', { conversationId, readerId: uid }); });
    socket.on('notify_friend_request', ({ recipientId, from }) => { const s = onlineUsers.get(recipientId); if (s) io.to(s).emit('friend_request_received', { from }); });

    socket.on('admin_ban_user', async ({ userId, reason }) => {
      const bannedSocket = onlineUsers.get(userId);
      if (bannedSocket) io.to(bannedSocket).emit('banned_from_global', { reason: reason || null });
    });
    socket.on('admin_unban_user', async ({ userId }) => {
      const unbannedSocket = onlineUsers.get(userId);
      if (unbannedSocket) io.to(unbannedSocket).emit('unbanned_from_global');
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
  if (!cmdMatch) return socket.emit('error', { message: 'Invalid command. Use: /ban @username "reason"' });
  const cmd = cmdMatch[1].toLowerCase();
  const target = cmdMatch[2];
  const reason = cmdMatch[3] || null;
  const hoursArg = cmdMatch[4] || cmdMatch[3];
  const { data: targetUser } = await supabase.from('users').select('id,username,display_name,role,is_banned_from_global').or(`username.ilike.${target},display_name.ilike.${target}`).maybeSingle();
  if (!targetUser) return socket.emit('error', { message: `User "@${target}" not found` });
  if (cmd === '/ban' || cmd === '/tban') {
    if (socket.user.role === 'admin' && ['admin','owner'].includes(targetUser.role)) return socket.emit('error', { message: 'Cannot ban admin or owner' });
    const hours = cmd === '/tban' ? parseFloat(hoursArg) || 1 : null;
    const tempBanUntil = hours ? new Date(Date.now() + hours * 3600000).toISOString() : null;
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
  } else { socket.emit('error', { message: `Unknown command: ${cmd}` }); }
}
