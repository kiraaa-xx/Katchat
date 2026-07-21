const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const supabase = require('../supabase');
const { auth, adminOnly } = require('../middleware/auth');
const { validateMaxLength } = require('../error-handler');
const { imageFileFilter, sanitizeText } = require('../utils');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads/announcements');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `ann_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter
});

const enrichAnnouncements = async (anns) => {
  if (!anns?.length) return [];
  const authorIds = [...new Set(anns.map(a => a.author_id))];
  const { data: users } = await supabase.from('users').select('id,display_name,username,profile_picture,profile_color,role').in('id', authorIds);
  const userMap = {};
  (users || []).forEach(u => userMap[u.id] = u);
  return anns.map(a => ({ ...a, author: userMap[a.author_id] || {} }));
};

// Get all announcements
router.get('/', auth, async (req, res) => {
  try {
    const { data } = await supabase.from('announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false });
    res.json({ announcements: await enrichAnnouncements(data || []) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create announcement
router.post('/', auth, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { title, content, pinned } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    const lenErr = validateMaxLength({ title, content }, { title: 200, content: 5000 });
    if (lenErr) return res.status(400).json({ error: lenErr });
    const safeTitle = sanitizeText(title, 200);
    const safeContent = sanitizeText(content, 5000);
    if (!safeTitle || !safeContent) return res.status(400).json({ error: 'Title and content required' });
    const image = req.file ? `/uploads/announcements/${req.file.filename}` : null;
    const { data } = await supabase.from('announcements').insert({ title: safeTitle, content: safeContent, image, author_id: req.user.id, pinned: pinned === 'true' }).select().single();
    const enriched = await enrichAnnouncements([data]);
    res.json({ announcement: enriched[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update announcement
router.put('/:id', auth, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { title, content, pinned } = req.body;
    const lenErr = validateMaxLength({ title, content }, { title: 200, content: 5000 });
    if (lenErr) return res.status(400).json({ error: lenErr });
    const updates = { updated_at: new Date().toISOString() };
    if (title) updates.title = sanitizeText(title, 200);
    if (content) updates.content = sanitizeText(content, 5000);
    if (pinned !== undefined) updates.pinned = pinned === 'true';
    if (req.file) updates.image = `/uploads/announcements/${req.file.filename}`;
    const { data } = await supabase.from('announcements').update(updates).eq('id', req.params.id).select().single();
    const enriched = await enrichAnnouncements([data]);
    res.json({ announcement: enriched[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete announcement
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await supabase.from('announcement_comments').delete().eq('announcement_id', req.params.id);
    await supabase.from('announcements').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Comments ──────────────────────────────────────────────────
router.get('/:id/comments', auth, async (req, res) => {
  try {
    const { data: comments } = await supabase.from('announcement_comments')
      .select('*').eq('announcement_id', req.params.id).eq('deleted', false)
      .order('created_at', { ascending: true });
    if (!comments?.length) return res.json({ comments: [] });
    const authorIds = [...new Set(comments.map(c => c.author_id))];
    const { data: users } = await supabase.from('users').select('id,display_name,username,profile_picture,profile_color,role').in('id', authorIds);
    const userMap = {};
    (users || []).forEach(u => userMap[u.id] = u);
    res.json({ comments: comments.map(c => ({ ...c, author: userMap[c.author_id] || {} })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/comments', auth, async (req, res) => {
  try {
    // Check if banned
    const { data: user } = await supabase.from('users').select('is_banned_from_global').eq('id', req.user.id).single();
    if (user?.is_banned_from_global) return res.status(403).json({ error: 'Banned users cannot comment' });
    const safeContent = sanitizeText(req.body.content, 1000);
    if (!safeContent) return res.status(400).json({ error: 'Comment cannot be empty' });
    const { data: comment } = await supabase.from('announcement_comments')
      .insert({ announcement_id: req.params.id, author_id: req.user.id, content: safeContent }).select().single();
    const { data: author } = await supabase.from('users').select('id,display_name,username,profile_picture,profile_color,role').eq('id', req.user.id).single();
    res.json({ comment: { ...comment, author } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:annId/comments/:commentId', auth, async (req, res) => {
  try {
    const { data: comment } = await supabase.from('announcement_comments').select('author_id').eq('id', req.params.commentId).single();
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const { data: role } = await supabase.from('roles').select('permissions').eq('name', req.user.role).single();
    const canDelete = comment.author_id === req.user.id || role?.permissions?.canDeleteMessages;
    if (!canDelete) return res.status(403).json({ error: 'Not authorized' });
    await supabase.from('announcement_comments').update({ deleted: true }).eq('id', req.params.commentId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
