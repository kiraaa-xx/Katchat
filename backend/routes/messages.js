const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const supabase = require('../supabase');
const { auth, adminOnly } = require('../middleware/auth');
const { validateMaxLength } = require('../error-handler');
const { imageFileFilter } = require('../utils');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads/messages');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `msg_${Date.now()}_${Math.random().toString(36).substr(2,6)}${path.extname(file.originalname)}`)
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
    .select('id,display_name,username,profile_picture,profile_color,role,bio').in('id', senderIds);
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

// Get private messages
router.get('/private/:userId', auth, async (req, res) => {
  try {
    const convId = [req.user.id, req.params.userId].sort().join('_');
    const page = parseInt(req.query.page || 1);
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get global messages
router.get('/global', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1);
    const { data: messages } = await supabase.from('messages')
      .select('*').eq('type', 'global').eq('deleted', false)
      .order('created_at', { ascending: false }).range(0, 99);
    const enriched = await enrichMessages((messages || []).reverse());
    res.json({ messages: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Send private message with images
router.post('/private/:userId', auth, upload.array('images', 5), async (req, res) => {
  try {
    const { content, replyTo } = req.body;
    const convId = [req.user.id, req.params.userId].sort().join('_');
    const images = req.files ? req.files.map(f => `/uploads/messages/${f.filename}`) : [];
    if (!content && !images.length) return res.status(400).json({ error: 'Message cannot be empty' });
    const lenErr = validateMaxLength({ content }, { content: 5000 });
    if (lenErr) return res.status(400).json({ error: lenErr });
    
    // Check image upload limit
    if (images.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const { data: imageUploadData } = await supabase.from('image_uploads')
        .select('count').eq('user_id', req.user.id).eq('upload_date', today).maybeSingle();
      const currentCount = imageUploadData?.count || 0;
      if (currentCount + images.length > 5) {
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
      sender_id: req.user.id, content: content || '', images,
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete message
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const { data: message } = await supabase.from('messages').select('sender_id,type').eq('id', req.params.messageId).single();
    if (!message) return res.status(404).json({ error: 'Not found' });
    const { data: role } = await supabase.from('roles').select('permissions').eq('name', req.user.role).single();
    const canDelete = message.sender_id === req.user.id || role?.permissions?.canDeleteMessages;
    if (!canDelete) return res.status(403).json({ error: 'Not authorized' });
    await supabase.from('messages').update({ deleted: true, content: '', images: [], deleted_at: new Date().toISOString() }).eq('id', req.params.messageId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
