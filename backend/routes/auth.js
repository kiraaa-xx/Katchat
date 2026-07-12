const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
const { auth, ownerOnly } = require('../middleware/auth');
const { validateMaxLength } = require('../error-handler');

const pronounMap = { male:'he/him', female:'she/her', 'non-binary':'they/them', 'prefer-not-to-say':'they/them' };
const colorMap = { male:'#4A90D9', female:'#D94A8C', 'non-binary':'#9B4AD9', 'prefer-not-to-say':'#4AD9A0' };

const makeToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Generate temporary password: 12 chars, mixed case + numbers
const generateTempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
};

const safeUser = (u) => {
  const { password, email, banned_by, ban_reason, temp_ban_until, sage_history, ...rest } = u;
  return rest;
};

router.post('/register', async (req, res) => {
  try {
    const { displayName, username, email, password, gender } = req.body;
    if (!displayName || !username || !email || !password || !gender)
      return res.status(400).json({ error: 'All fields are required' });

    if (/[<>&"']/.test(displayName))
      return res.status(400).json({ error: 'Display name contains invalid characters' });

    const lenErr = validateMaxLength({ displayName, username, email, password, gender }, { displayName: 50, username: 20, email: 254, password: 128, gender: 20 });
    if (lenErr) return res.status(400).json({ error: lenErr });

    const usernameClean = username.toLowerCase().trim();
    if (!/^[a-z0-9_]{3,20}$/.test(usernameClean))
      return res.status(400).json({ error: 'Username: 3-20 chars, lowercase, numbers, underscores only' });

    // Check existing
    const { data: existing } = await supabase.from('users')
      .select('id').or(`email.eq.${email},username.eq.${usernameClean}`).maybeSingle();
    if (existing) return res.status(400).json({ error: 'Email or username already taken' });

    const hashedPw = await bcrypt.hash(password, 12);
    const ownerEmails = ['chandkris27@gmail.com', 'katchat369@gmail.com'];
    const role = ownerEmails.includes(email.toLowerCase()) ? 'owner' : 'member';

    const { data: user, error } = await supabase.from('users').insert({
      display_name: displayName,
      username: usernameClean,
      email: email.toLowerCase(),
      password: hashedPw,
      gender,
      pronouns: pronounMap[gender] || 'they/them',
      profile_color: colorMap[gender] || '#4AD9A0',
      role,
      sage_history: []
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ token: makeToken(user.id), user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('email', email.toLowerCase()).single();
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ token: makeToken(user.id), user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    res.json({ user: safeUser(req.user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/mark-intro-seen', auth, async (req, res) => {
  try {
    await supabase.from('users').update({ intro_seen: true }).eq('id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reset password (owner only) ────────────────────────────────
router.post('/admin/reset-password', auth, ownerOnly, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    // Check user exists and is not owner
    const { data: target } = await supabase.from('users').select('role').eq('id', userId).single();
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'owner') return res.status(403).json({ error: 'Cannot reset owner password' });

    // Generate temporary password
    const tempPassword = generateTempPassword();
    const hashedPw = await bcrypt.hash(tempPassword, 12);

    // Update user: new password + set must_change_password flag
    const { error } = await supabase.from('users').update({
      password: hashedPw,
      must_change_password: true
    }).eq('id', userId);

    if (error) throw error;

    // IMPORTANT: Only return temp password to admin, never store it
    res.json({ temporaryPassword: tempPassword });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Change password (user endpoint) ────────────────────────────
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword, fromReset } = req.body;

    // For normal password changes (not forced reset), verify current password
    if (!fromReset) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const { data: userData } = await supabase.from('users').select('password').eq('id', req.user.id).single();
      if (!userData) return res.status(404).json({ error: 'User not found' });
      const isMatch = await bcrypt.compare(currentPassword, userData.password);
      if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect' });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const hashedPw = await bcrypt.hash(newPassword, 12);
    const updates = { password: hashedPw };

    // If user is changing password after forced reset, clear the flag
    if (fromReset) {
      updates.must_change_password = false;
    }

    const { data: user, error } = await supabase.from('users').update(updates).eq('id', req.user.id).select().single();

    if (error) throw error;

    res.json({ user: safeUser(user), success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
