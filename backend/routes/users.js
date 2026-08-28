const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const supabase = require('../supabase');
const { auth, adminOnly, ownerOnly, getUserPermissions } = require('../middleware/auth');
const { validateMaxLength } = require('../error-handler');
const { imageFileFilter, makeUploadFilename, validateUploadedImage, removeUploadedFile, sendError, sanitizeText } = require('../utils');

const pronounMap = { male:'he/him', female:'she/her', 'non-binary':'they/them', 'prefer-not-to-say':'they/them' };
const colorMap = { male:'#4A90D9', female:'#D94A8C', 'non-binary':'#9B4AD9', 'prefer-not-to-say':'#4AD9A0' };
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads/avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, makeUploadFilename(file.mimetype))
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter
});

const safe = (u) => { if (!u) return null; const { email, password, banned_by, ban_reason, temp_ban_until, sage_history, ...r } = u; return r; };

router.get('/search', auth, async (req, res) => {
  try {
    const q = String(req.query.q || '').replace(/[%_,()]/g, '').trim();
    if (!q || q.length < 1) return res.json({ users: [] });
      const { data } = await supabase.from('users')
      .select('id,display_name,username,profile_picture,profile_color,role,is_online,pronouns,last_seen,bio,created_at')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq('id', req.user.id).limit(20);
    res.json({ users: data || [] });
  } catch (err) { sendError(res, err); }
});

// ── User directory (any authenticated user) — for global chat mentions ──
router.get('/directory', auth, async (req, res) => {
  try {
    const { data } = await supabase.from('users')
      .select('id,display_name,username,profile_picture,profile_color,role,is_online')
      .limit(500);
    res.json({ users: data || [] });
  } catch (err) { sendError(res, err); }
});

router.get('/friends', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const { data: friendRows } = await supabase.from('friends').select('*').or(`user_id.eq.${uid},friend_id.eq.${uid}`);
    const accepted = (friendRows || []).filter(r => r.status === 'accepted');
    const friendIds = accepted.map(r => r.user_id === uid ? r.friend_id : r.user_id);
    const sentRows = (friendRows || []).filter(r => r.status === 'pending' && r.user_id === uid);
    const receivedRows = (friendRows || []).filter(r => r.status === 'pending' && r.friend_id === uid);
    const fetchUsers = async (ids) => {
      if (!ids.length) return [];
      const { data } = await supabase.from('users').select('id,display_name,username,profile_picture,profile_color,role,is_online,last_seen,pronouns,bio,created_at').in('id', ids);
      return data || [];
    };
    const [friends, sent, received] = await Promise.all([fetchUsers(friendIds), fetchUsers(sentRows.map(r => r.friend_id)), fetchUsers(receivedRows.map(r => r.user_id))]);
    res.json({ friends, requestsSent: sent, requestsReceived: received });
  } catch (err) { sendError(res, err); }
});

router.post('/friend-request/:userId', auth, async (req, res) => {
  try {
    const uid = req.user.id; const targetId = req.params.userId;
    if (!isUuid(targetId)) return res.status(400).json({ error: 'Invalid user ID' });
    if (uid === targetId) return res.status(400).json({ error: 'Cannot add yourself' });
    const { data: existing } = await supabase.from('friends').select('*').or(`and(user_id.eq.${uid},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${uid})`).maybeSingle();
    if (existing) {
      if (existing.status === 'accepted') return res.status(400).json({ error: 'Already friends' });
      if (existing.status === 'pending') {
        if (existing.user_id === targetId) { await supabase.from('friends').update({ status: 'accepted' }).eq('id', existing.id); return res.json({ success: true, action: 'friends' }); }
        return res.status(400).json({ error: 'Request already sent' });
      }
    }
    const { error: insertErr } = await supabase.from('friends').insert({ user_id: uid, friend_id: targetId, status: 'pending' });
    if (insertErr) {
      // Concurrent reverse request -> unique pair conflict; resolve gracefully
      if (insertErr.code === '23505') {
        const { data: raced } = await supabase.from('friends').select('*').or(`and(user_id.eq.${uid},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${uid})`).maybeSingle();
        if (raced?.user_id === targetId && raced?.status === 'pending') {
          await supabase.from('friends').update({ status: 'accepted' }).eq('id', raced.id);
          return res.json({ success: true, action: 'friends' });
        }
        return res.status(400).json({ error: 'Request already sent' });
      }
      throw insertErr;
    }
    res.json({ success: true, action: 'sent' });
  } catch (err) { sendError(res, err); }
});

router.delete('/friend-request/:userId', auth, async (req, res) => {
  try {
    const uid = req.user.id; const targetId = req.params.userId;
    if (!isUuid(targetId)) return res.status(400).json({ error: 'Invalid user ID' });
    await supabase.from('friends').delete().or(`and(user_id.eq.${uid},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${uid})`);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.delete('/friend/:userId', auth, async (req, res) => {
  try {
    const uid = req.user.id; const targetId = req.params.userId;
    if (!isUuid(targetId)) return res.status(400).json({ error: 'Invalid user ID' });
    await supabase.from('friends').delete().or(`and(user_id.eq.${uid},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${uid})`);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.put('/profile', auth, async (req, res) => {
  try {
    let { displayName, gender, theme, bio, accentColor } = req.body;
    if (displayName && /[<>&"']/.test(displayName))
      return res.status(400).json({ error: 'Display name contains invalid characters' });
    if (bio) {
      const words = bio.trim().split(/\s+/);
      if (words.length > 20) return res.status(400).json({ error: 'Bio must be 20 words or fewer' });
      if (/[<>&"']/.test(bio)) return res.status(400).json({ error: 'Bio contains invalid characters' });
    }
    const validGenders = ['male', 'female', 'non-binary', 'prefer-not-to-say'];
    if (gender && !validGenders.includes(gender)) return res.status(400).json({ error: 'Invalid gender value' });
    const validThemes = ['dark', 'light'];
    if (theme && !validThemes.includes(theme)) return res.status(400).json({ error: 'Invalid theme value' });
    if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) return res.status(400).json({ error: 'Invalid accent color format' });
    const lenErr = validateMaxLength({ displayName, gender, theme, bio, accentColor }, { displayName: 50, gender: 20, theme: 20, bio: 200, accentColor: 20 });
    if (lenErr) return res.status(400).json({ error: lenErr });
    const updates = { updated_at: new Date().toISOString() };
    if (displayName) updates.display_name = displayName;
    if (theme) updates.theme = theme;
    if (bio !== undefined) updates.bio = bio;
    if (gender) { updates.gender = gender; updates.pronouns = pronounMap[gender]; updates.profile_color = colorMap[gender]; }
    if (accentColor) updates.accent_color = accentColor;
    let user;
    try {
      const result = await supabase.from('users').update(updates).eq('id', req.user.id).select().single();
      user = result.data;
    } catch (updateErr) {
      // Retry without bio in case column doesn't exist
      if (bio !== undefined) { delete updates.bio; const result = await supabase.from('users').update(updates).eq('id', req.user.id).select().single(); user = { ...result.data, bio }; }
      else throw updateErr;
    }
    res.json({ user: safe(user) });
  } catch (err) { sendError(res, err); }
});

router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const { data: user } = await supabase.from('users').select('password').eq('id', req.user.id).single();
    if (!await bcrypt.compare(currentPassword, user.password)) return res.status(400).json({ error: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await supabase.from('users').update({ password: hashed }).eq('id', req.user.id);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // Verify actual file content matches an allowed image signature
    const sigErr = validateUploadedImage(req.file.path);
    if (sigErr) {
      removeUploadedFile(req.file.path);
      return res.status(400).json({ error: sigErr.message });
    }
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await supabase.from('users').update({ profile_picture: avatarUrl }).eq('id', req.user.id);
    res.json({ profilePicture: avatarUrl });
  } catch (err) {
    if (req.file) removeUploadedFile(req.file.path);
    sendError(res, err);
  }
});

// ── User suggestions (people you may know) ────────────────────
router.get('/suggestions', auth, async (req, res) => {
  try {
    const uid = req.user.id;

    // 1. Get current user's accepted friend IDs
    const { data: myRows } = await supabase
      .from('friends')
      .select('user_id,friend_id')
      .or(`user_id.eq.${uid},friend_id.eq.${uid}`)
      .eq('status', 'accepted');
    const myFriendIds = (myRows || []).map(r => r.user_id === uid ? r.friend_id : r.user_id);

    // 2. Get pending user IDs to exclude
    const { data: pendingRows } = await supabase
      .from('friends')
      .select('user_id,friend_id')
      .or(`user_id.eq.${uid},friend_id.eq.${uid}`)
      .eq('status', 'pending');
    const pendingIds = (pendingRows || []).map(r => r.user_id === uid ? r.friend_id : r.user_id);

    const excludeIds = [uid, ...myFriendIds, ...pendingIds];
    if (!excludeIds.length) return res.json({ suggestions: [] });

    // 3. Get candidate users not in exclude list
    const { data: candidates } = await supabase
      .from('users')
      .select('id,display_name,username,profile_picture,profile_color,role,is_online,pronouns,bio,last_seen,created_at')
      .not('id', 'in', `(${excludeIds.join(',')})`)
      .limit(30);

    if (!candidates || !candidates.length) return res.json({ suggestions: [] });

    const candidateIds = candidates.map(c => c.id);

    // 4. Count mutual friends for each candidate (user_id direction)
    const { data: cfRows1 } = await supabase
      .from('friends')
      .select('user_id,friend_id')
      .in('user_id', candidateIds)
      .eq('status', 'accepted');

    const mutualCounts = {};
    (cfRows1 || []).forEach(row => {
      if (myFriendIds.includes(row.friend_id)) {
        mutualCounts[row.user_id] = (mutualCounts[row.user_id] || 0) + 1;
      }
    });

    // 5. Count mutual friends (friend_id direction)
    const { data: cfRows2 } = await supabase
      .from('friends')
      .select('user_id,friend_id')
      .in('friend_id', candidateIds)
      .eq('status', 'accepted');

    (cfRows2 || []).forEach(row => {
      if (myFriendIds.includes(row.user_id)) {
        mutualCounts[row.friend_id] = (mutualCounts[row.friend_id] || 0) + 1;
      }
    });

    // 6. Build suggestions sorted by mutual count
    const suggestions = candidates
      .map(c => ({ ...c, mutual_count: mutualCounts[c.id] || 0 }))
      .sort((a, b) => b.mutual_count - a.mutual_count)
      .slice(0, 6);

    res.json({ suggestions });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Get all users (admin) — secure response ──
router.get('/all', auth, adminOnly, async (req, res) => {
  try {
    const { data } = await supabase.from('users')
      .select('id,display_name,username,profile_picture,profile_color,role,is_online,last_seen,is_banned_from_global,ban_reason,created_at,gender,pronouns')
      .order('created_at', { ascending: false });
    res.json({ users: data || [] });
  } catch (err) { sendError(res, err); }
});

// ── Update role (owner only) ──────────────────────────────────
router.put('/role/:userId', auth, ownerOnly, async (req, res) => {
  try {
    const { role } = req.body;
    const { data: roleExists } = await supabase.from('roles').select('name').eq('name', role).maybeSingle();
    if (!roleExists) return res.status(400).json({ error: 'Invalid role' });
    const { data: user } = await supabase.from('users').update({ role }).eq('id', req.params.userId).select('id,display_name,username,role').single();
    res.json({ user });
  } catch (err) { sendError(res, err); }
});

const canBan = (perms, roleName) => perms?.permissions?.canBanUsers || ['admin', 'owner'].includes(roleName);

router.put('/ban/:userId', auth, adminOnly, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!isUuid(req.params.userId)) return res.status(400).json({ error: 'Invalid user ID' });
    const perms = await getUserPermissions(req.user.id);
    if (!canBan(perms, req.user.role)) return res.status(403).json({ error: 'You do not have permission to ban users' });
    const { data: target } = await supabase.from('users').select('role').eq('id', req.params.userId).maybeSingle();
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (['admin','owner'].includes(target.role) && req.user.role !== 'owner') return res.status(403).json({ error: 'Cannot ban admin or owner' });
    // Permanent ban must clear any temp ban so auto-unban never fires for it
    await supabase.from('users').update({ is_banned_from_global: true, banned_by: req.user.id, ban_reason: sanitizeText(reason, 500) || null, temp_ban_until: null }).eq('id', req.params.userId);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.put('/unban/:userId', auth, adminOnly, async (req, res) => {
  try {
    if (!isUuid(req.params.userId)) return res.status(400).json({ error: 'Invalid user ID' });
    const perms = await getUserPermissions(req.user.id);
    if (!canBan(perms, req.user.role)) return res.status(403).json({ error: 'You do not have permission to ban users' });
    await supabase.from('users').update({ is_banned_from_global: false, banned_by: null, ban_reason: null, temp_ban_until: null }).eq('id', req.params.userId);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.get('/mutual/:userId', auth, async (req, res) => {
  try {
    const uid = req.user.id; const targetId = req.params.userId;
    if (!isUuid(targetId)) return res.status(400).json({ error: 'Invalid user ID' });
    const getFriendIds = async (userId) => {
      const { data } = await supabase.from('friends').select('user_id,friend_id').or(`user_id.eq.${userId},friend_id.eq.${userId}`).eq('status', 'accepted');
      return (data || []).map(r => r.user_id === userId ? r.friend_id : r.user_id);
    };
    const [myIds, theirIds] = await Promise.all([getFriendIds(uid), getFriendIds(targetId)]);
    const mutualIds = myIds.filter(id => theirIds.includes(id));
    if (!mutualIds.length) return res.json({ mutual: [] });
    const { data: mutual } = await supabase.from('users').select('id,display_name,username,profile_picture,profile_color').in('id', mutualIds);
    res.json({ mutual: mutual || [] });
  } catch (err) { sendError(res, err); }
});

router.put('/sage-history', auth, async (req, res) => {
  try {
    const { history } = req.body;
    const limited = (Array.isArray(history) ? history : []).slice(-10);
    await supabase.from('users').update({ sage_history: limited }).eq('id', req.user.id);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// ── Check image upload limit for today ────────────────────────
router.get('/image-upload-limit', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { data } = await supabase.from('image_uploads')
      .select('count').eq('user_id', req.user.id).eq('upload_date', today).maybeSingle();
    const count = data?.count || 0;
    const limit = 5;
    res.json({ count, limit, remaining: Math.max(0, limit - count) });
  } catch (err) { sendError(res, err); }
});

// ── Increment image upload count ──────────────────────────────
router.post('/image-upload-increment', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase.from('image_uploads')
      .select('id,count').eq('user_id', req.user.id).eq('upload_date', today).maybeSingle();
    
    if (existing) {
      if (existing.count >= 5) return res.status(429).json({ error: 'Daily image upload limit (5) exceeded' });
      await supabase.from('image_uploads').update({ count: existing.count + 1 }).eq('id', existing.id);
    } else {
      await supabase.from('image_uploads').insert({ user_id: req.user.id, upload_date: today, count: 1 });
    }
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// ── Get all banned users (admin) ──────────────────────────────
router.get('/banned', auth, adminOnly, async (req, res) => {
  try {
    const { data } = await supabase.from('users')
      .select('id,display_name,username,profile_picture,profile_color,role,is_banned_from_global,ban_reason,banned_by,created_at')
      .eq('is_banned_from_global', true)
      .order('created_at', { ascending: false });
    res.json({ users: data || [] });
  } catch (err) { sendError(res, err); }
});

module.exports = router;
