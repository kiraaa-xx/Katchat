const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const supabase = require('../supabase');
const { auth, getUserPermissions } = require('../middleware/auth');
const { validateMaxLength } = require('../error-handler');
const { imageFileFilter, sanitizeText, makeUploadFilename, validateUploadedImage, removeUploadedFile, sendError } = require('../utils');

const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads/messages');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, makeUploadFilename(file.mimetype))
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter
});

const enrichMessages = async (messages) => {
  if (!messages?.length) return [];
  const senderIds = [...new Set(messages.map(m => m.sender_id))];
  const { data: users } = await supabase.from('users')
    .select('id,display_name,username,profile_picture,profile_color,role,bio,created_at,pronouns,is_online,last_seen').in('id', senderIds);
  const userMap = {};
  (users || []).forEach(u => userMap[u.id] = u);

  // Enrich reply_to
  const replyIds = messages.filter(m => m.reply_to).map(m => m.reply_to);
  let replyMap = {};
  if (replyIds.length) {
    const { data: replies } = await supabase.from('messages').select('id,content,sender_id').in('id', replyIds);
    (replies || []).forEach(r => replyMap[r.id] = r);
  }

  return messages.map(m => ({
    ...m,
    sender: userMap[m.sender_id] || { display_name: 'Unknown', username: 'unknown' },
    reply_to_msg: m.reply_to ? replyMap[m.reply_to] : null
  }));
};

const areFriends = async (a, b) => {
  const { data: r1 } = await supabase.from('friends').select('status').eq('user_id', a).eq('friend_id', b).maybeSingle();
  if (r1?.status === 'accepted') return true;
  const { data: r2 } = await supabase.from('friends').select('status').eq('user_id', b).eq('friend_id', a).maybeSingle();
  return r2?.status === 'accepted';
};

// Get private messages
router.get('/private/:userId', auth, async (req, res) => {
  try {
    if (!isUuid(req.params.userId)) return res.status(400).json({ error: 'Invalid user ID' });
    const convId = [req.user.id, req.params.userId].sort().join('_');
    const page = Math.max(1, parseInt(req.query.page || 1) || 1);
    const limit = 50;
    const { data: messages } = await supabase.from('messages')
      .select('*').eq('conversation_id', convId).eq('deleted', false)
      .order('created_at', { ascending: false }).range((page-1)*limit, page*limit-1);
    const enriched = await enrichMessages((messages || []).reverse());
    // Mark as read — append current user to read_by array
    try {
      const { data: unread } = await supabase.from('messages')
        .select('id,read_by').eq('conversation_id', convId).neq('sender_id', req.user.id);
      for (const m of unread || []) {
        const arr = m.read_by || [];
        if (!arr.includes(req.user.id)) {
          arr.push(req.user.id);
          await supabase.from('messages').update({ read_by: arr }).eq('id', m.id);
        }
      }
    } catch (_) { /* best-effort read tracking */ }
    res.json({ messages: enriched });
  } catch (err) { sendError(res, err); }
});

// Get global messages
router.get('/global', auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || 1) || 1);
    const { data: messages } = await supabase.from('messages')
      .select('*').eq('type', 'global').eq('deleted', false)
      .order('created_at', { ascending: false }).range((page-1)*100, page*100-1);
    const enriched = await enrichMessages((messages || []).reverse());
    res.json({ messages: enriched });
  } catch (err) { sendError(res, err); }
});

// Send private message with images
router.post('/private/:userId', auth, upload.array('images', 5), async (req, res) => {
  const removeFiles = () => { for (const f of req.files || []) removeUploadedFile(f.path); };
  try {
    const { content, replyTo } = req.body;
    if (!isUuid(req.params.userId)) { removeFiles(); return res.status(400).json({ error: 'Invalid user ID' }); }
    if (req.params.userId === req.user.id) { removeFiles(); return res.status(400).json({ error: 'Cannot message yourself' }); }

    // Recipient must exist and be an accepted friend
    const { data: recipient } = await supabase.from('users').select('id').eq('id', req.params.userId).maybeSingle();
    if (!recipient) { removeFiles(); return res.status(404).json({ error: 'User not found' }); }
    if (!(await areFriends(req.user.id, req.params.userId))) { removeFiles(); return res.status(403).json({ error: 'You can only message your friends' }); }
    const perms = await getUserPermissions(req.user.id);
    if (!perms?.permissions?.canChat) { removeFiles(); return res.status(403).json({ error: 'You do not have permission to chat' }); }

    // Validate every uploaded file by content signature
    for (const f of req.files || []) {
      const sigErr = validateUploadedImage(f.path);
      if (sigErr) {
        removeFiles();
        return res.status(400).json({ error: sigErr.message });
      }
    }

    const convId = [req.user.id, req.params.userId].sort().join('_');
    const images = req.files ? req.files.map(f => `/uploads/messages/${f.filename}`) : [];
    const safeContent = sanitizeText(content, 5000);
    if (!safeContent && !images.length) { removeFiles(); return res.status(400).json({ error: 'Message cannot be empty' }); }
    const lenErr = validateMaxLength({ content: safeContent }, { content: 5000 });
    if (lenErr) { removeFiles(); return res.status(400).json({ error: lenErr }); }
    
    // Check image upload limit
    if (images.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const { data: imageUploadData } = await supabase.from('image_uploads')
        .select('count').eq('user_id', req.user.id).eq('upload_date', today).maybeSingle();
      const currentCount = imageUploadData?.count || 0;
      if (currentCount + images.length > 5) {
        removeFiles();
        return res.status(429).json({ error: `Daily image limit reached. Can upload ${Math.max(0, 5 - currentCount)} more today.` });
      }
      // Increment count
      if (imageUploadData) {
        await supabase.from('image_uploads').update({ count: currentCount + images.length }).eq('user_id', req.user.id).eq('upload_date', today);
      } else {
        await supabase.from('image_uploads').insert({ user_id: req.user.id, upload_date: today, count: images.length });
      }
    }
    
    const { data: message } = await supabase.from('messages').insert({
      sender_id: req.user.id, content: safeContent, images,
      type: 'private', conversation_id: convId,
      reply_to: replyTo || null
    }).select().single();
    const enriched = await enrichMessages([message]);
    // Emit socket event so receiver gets the image in real-time
    try {
      const io = req.app.get('io');
      const { onlineUsers } = require('../socket');
      const recipientSocket = onlineUsers.get(req.params.userId);
      if (recipientSocket) io.to(recipientSocket).emit('new_private_message', enriched[0]);
    } catch (_) { /* best-effort socket notification */ }
    res.json({ message: enriched[0] });
  } catch (err) { removeFiles(); sendError(res, err); }
});

// Delete message
router.delete('/:messageId', auth, async (req, res) => {
  try {
    if (!isUuid(req.params.messageId)) return res.status(400).json({ error: 'Invalid message ID' });
    const { data: message } = await supabase.from('messages').select('sender_id,type').eq('id', req.params.messageId).maybeSingle();
    if (!message) return res.status(404).json({ error: 'Not found' });
    const { data: role } = await supabase.from('roles').select('permissions').eq('name', req.user.role).maybeSingle();
    const canDelete = message.sender_id === req.user.id || role?.permissions?.canDeleteMessages || ['admin', 'owner'].includes(req.user.role);
    if (!canDelete) return res.status(403).json({ error: 'Not authorized' });
    await supabase.from('messages').update({ deleted: true, content: '', images: [], deleted_at: new Date().toISOString() }).eq('id', req.params.messageId);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// Unread counts
router.get('/unread-counts', auth, async (req, res) => {
  try {
    const { data: friendRows } = await supabase.from('friends')
      .select('user_id,friend_id').or(`user_id.eq.${req.user.id},friend_id.eq.${req.user.id}`).eq('status', 'accepted');
    const friendIds = (friendRows || []).map(r => r.user_id === req.user.id ? r.friend_id : r.user_id);
    const counts = {};
    for (const fid of friendIds) {
      const convId = [req.user.id, fid].sort().join('_');
      const { count } = await supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', convId).eq('deleted', false).neq('sender_id', req.user.id)
        .not('read_by', 'cs', `{${req.user.id}}`);
      if (count > 0) counts[fid] = count;
    }
    res.json({ counts });
  } catch (err) { sendError(res, err); }
});

module.exports = router;