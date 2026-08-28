const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const dns = require('dns');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
const { auth, ownerOnly } = require('../middleware/auth');
const { validateMaxLength } = require('../error-handler');
const { sendError } = require('../utils');
const {
  generateTOTPSecret,
  verifyTOTP,
  totpProvisioningUri,
  qrDataUrl,
  generateOtp,
  hashOtp,
  generateRecoveryCodes,
  hashRecoveryCode,
  sendEmail,
} = require('../security');

const pronounMap = { male:'he/him', female:'she/her', 'non-binary':'they/them', 'prefer-not-to-say':'they/them' };
const colorMap = { male:'#4A90D9', female:'#D94A8C', 'non-binary':'#9B4AD9', 'prefer-not-to-say':'#4AD9A0' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const makeToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
// Short-lived token used only to complete the 2FA login step
const makeTotpTempToken = (userId) => jwt.sign({ userId, purpose: 'totp' }, process.env.JWT_SECRET, { expiresIn: '5m' });

// OTP lifetime (ms) and max verify attempts before a resend is required
const OTP_TTL = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN = 60 * 1000;

const otpCooldowns = new Map(); // userId -> timestamp of last send

// Email-domain existence check: verifies the address's domain has actual mail
// servers (MX records) so clearly-fake domains are rejected at signup. Results
// are cached for an hour to avoid repeated DNS lookups. Only ENOTFOUND/ENODATA
// are treated as "domain does not exist"; transient DNS failures are allowed
// through so real users are never blocked by a resolver hiccup.
const mxCache = new Map(); // domain -> { ok, at }
const MX_CACHE_TTL = 60 * 60 * 1000;

async function domainHasMx(email) {
  const domain = String(email).split('@')[1];
  if (!domain) return false;
  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.at < MX_CACHE_TTL) return cached.ok;
  let ok = false;
  try {
    const records = await dns.promises.resolveMx(domain);
    ok = Array.isArray(records) && records.length > 0;
  } catch (err) {
    ok = !['ENOTFOUND', 'ENODATA'].includes(err.code);
  }
  mxCache.set(domain, { ok, at: Date.now() });
  return ok;
}

// Generate temporary password: 12 chars, mixed case + numbers (crypto-secure)
const generateTempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(crypto.randomInt(chars.length));
  }
  return pwd;
};

const safeUser = (u) => {
  const { password, email, banned_by, ban_reason, temp_ban_until, sage_history, email_otp_hash, email_otp_expires, totp_secret, totp_recovery_codes, ...rest } = u;
  return rest;
};

// Send (or queue) a verification OTP for a user. Returns { sent: boolean }.
// When no email service is configured, the account is left verified (graceful).
async function sendVerificationEmail(user) {
  const emailServiceOn = !!process.env.RESEND_API_KEY;
  if (!emailServiceOn) {
    const { error: upErr } = await supabase.from('users').update({ email_verified: true }).eq('id', user.id);
    if (upErr) throw upErr;
    return { sent: false };
  }
  const code = generateOtp();
  const expires = new Date(Date.now() + OTP_TTL).toISOString();
  const { error: otpErr } = await supabase.from('users').update({
    email_otp_hash: hashOtp(code),
    email_otp_expires: expires,
    email_otp_attempts: 0,
    email_verified: false,
  }).eq('id', user.id);
  if (otpErr) throw otpErr;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0d1117;border-radius:14px;color:#e6edf3">
      <h2 style="margin:0 0 6px;color:#22d46a">KatChat — Verify your email</h2>
      <p style="color:#9da7b3">Your one-time verification code is:</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#22d46a;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:14px;text-align:center;margin:12px 0">${code}</div>
      <p style="color:#9da7b3">This code expires in 10 minutes. If you didn't create an account, you can ignore this email.</p>
    </div>`;
  await sendEmail({ to: user.email, subject: 'KatChat — Verify your email', html });
  return { sent: true };
}

router.post('/register', async (req, res) => {
  try {
    const { displayName, username, email, password, gender } = req.body;
    if (!displayName || !username || !email || !password || !gender)
      return res.status(400).json({ error: 'All fields are required' });

    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()))
      return res.status(400).json({ error: 'Please enter a valid email address' });

    if (typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    if (/[<>&"']/.test(displayName))
      return res.status(400).json({ error: 'Display name contains invalid characters' });

    const lenErr = validateMaxLength({ displayName, username, email, password, gender }, { displayName: 50, username: 20, email: 254, password: 128, gender: 20 });
    if (lenErr) return res.status(400).json({ error: lenErr });

    const usernameClean = username.toLowerCase().trim();
    if (!/^[a-z0-9_]{3,20}$/.test(usernameClean))
      return res.status(400).json({ error: 'Username: 3-20 chars, lowercase, numbers, underscores only' });

    const emailClean = email.trim().toLowerCase();

    // Reject emails on domains that have no mail servers (obviously fake/typo'd)
    if (!(await domainHasMx(emailClean)))
      return res.status(400).json({ error: 'This email domain does not exist. Check the spelling and try again.' });

    // Check existing — structured queries only (no filter injection)
    const { data: existingEmail } = await supabase.from('users').select('id,email_verified').eq('email', emailClean).maybeSingle();
    if (existingEmail) {
      if (existingEmail.email_verified === false)
        return res.status(400).json({ error: 'This email is already registered but not verified. Sign in to resend the verification code.' });
      return res.status(400).json({ error: 'Email or username already taken' });
    }
    const { data: existingUser } = await supabase.from('users').select('id').eq('username', usernameClean).maybeSingle();
    if (existingUser) return res.status(400).json({ error: 'Email or username already taken' });

    const hashedPw = await bcrypt.hash(password, 12);

    // Everyone starts as member; owner/admin roles are only granted by the owner
    const { data: user, error } = await supabase.from('users').insert({
      display_name: displayName,
      username: usernameClean,
      email: emailClean,
      password: hashedPw,
      gender,
      pronouns: pronounMap[gender] || 'they/them',
      profile_color: colorMap[gender] || '#4AD9A0',
      role: 'member',
      sage_history: []
    }).select().single();

    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Email or username already taken' });
      return sendError(res, error);
    }
    await sendVerificationEmail(user);
    // Re-fetch so the response reflects the email_verified state set above
    const { data: fresh, error: freshErr } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (freshErr) throw freshErr;
    res.status(201).json({ token: makeToken(user.id), user: safeUser(fresh || user) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const { data: user, error: loginErr } = await supabase.from('users').select('*').eq('email', String(email).trim().toLowerCase()).maybeSingle();
    if (loginErr) throw loginErr;
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    // Email verification gate (only enforced when email service is configured)
    if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && user.email_verified === false) {
      return res.status(403).json({ error: 'Please verify your email address first', code: 'EMAIL_NOT_VERIFIED', tempToken: makeTotpTempToken(user.id) });
    }

    // 2FA: return a short-lived temp token; the user must complete the code step
    if (user.totp_enabled) {
      return res.json({ twoFactorRequired: true, tempToken: makeTotpTempToken(user.id), user: safeUser(user) });
    }

    res.json({ token: makeToken(user.id), user: safeUser(user) });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Verify a login-time 2FA code ───────────────────────────────
router.post('/totp/verify-login', async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) return res.status(400).json({ error: 'Missing 2FA data' });
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: '2FA session expired. Please sign in again.' });
    }
    if (decoded.purpose !== 'totp') return res.status(401).json({ error: 'Invalid 2FA session' });

    const { data: user, error: verifyUserErr } = await supabase.from('users').select('*').eq('id', decoded.userId).maybeSingle();
    if (verifyUserErr) throw verifyUserErr;
    if (!user || !user.totp_enabled) return res.status(401).json({ error: 'Invalid user' });

    if (!verifyTOTP(user.totp_secret, code)) {
      // Fallback: accept an unused recovery code so a lost authenticator
      // device doesn't permanently lock the user out. The code is consumed
      // (removed) after a successful login.
      const hashedCode = hashRecoveryCode(code);
      const recoveryCodes = user.totp_recovery_codes || [];
      if (!recoveryCodes.some(h => h === hashedCode)) {
        return res.status(400).json({ error: 'Invalid authenticator or recovery code' });
      }
      const { error: consumeErr } = await supabase.from('users')
        .update({ totp_recovery_codes: recoveryCodes.filter(h => h !== hashedCode) })
        .eq('id', user.id);
      if (consumeErr) throw consumeErr;
    }
    res.json({ token: makeToken(user.id), user: safeUser(user) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    res.json({ user: safeUser(req.user) });
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/mark-intro-seen', auth, async (req, res) => {
  try {
    await supabase.from('users').update({ intro_seen: true }).eq('id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Resend email verification code ─────────────────────────────
router.post('/resend-verification', auth, async (req, res) => {
  try {
    const lastSent = otpCooldowns.get(req.user.id) || 0;
    const wait = OTP_RESEND_COOLDOWN - (Date.now() - lastSent);
    if (wait > 0) return res.status(429).json({ error: `Please wait ${Math.ceil(wait / 1000)}s before resending`, retryAfter: Math.ceil(wait / 1000) });

    const emailServiceOn = !!process.env.RESEND_API_KEY;
    if (!emailServiceOn) return res.status(503).json({ error: 'Email service is not configured' });

    const code = generateOtp();
    const expires = new Date(Date.now() + OTP_TTL).toISOString();
    const { error: otpErr } = await supabase.from('users').update({
      email_otp_hash: hashOtp(code),
      email_otp_expires: expires,
      email_otp_attempts: 0,
      email_verified: false,
    }).eq('id', req.user.id);
    if (otpErr) throw otpErr;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0d1117;border-radius:14px;color:#e6edf3">
        <h2 style="margin:0 0 6px;color:#22d46a">KatChat — Verify your email</h2>
        <p style="color:#9da7b3">Your one-time verification code is:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#22d46a;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:14px;text-align:center;margin:12px 0">${code}</div>
        <p style="color:#9da7b3">This code expires in 10 minutes.</p>
      </div>`;
    await sendEmail({ to: req.user.email, subject: 'KatChat — Verify your email', html });
    otpCooldowns.set(req.user.id, Date.now());
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Verify email OTP code ──────────────────────────────────────
router.post('/verify-email', auth, async (req, res) => {
  try {
    const { code } = req.body;
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim()))
      return res.status(400).json({ error: 'Enter the 6-digit code from your email' });

    const { data: user, error: userErr } = await supabase.from('users').select('email_verified,email_otp_hash,email_otp_expires,email_otp_attempts').eq('id', req.user.id).single();
    if (userErr) throw userErr;
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.email_verified) return res.json({ success: true, verified: true, user: safeUser(req.user) });

    const attempts = (user.email_otp_attempts || 0) + 1;
    if (attempts > OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
    }
    if (!user.email_otp_hash || !user.email_otp_expires || new Date(user.email_otp_expires).getTime() < Date.now()) {
      const { error: expErr } = await supabase.from('users').update({ email_otp_attempts: attempts }).eq('id', req.user.id);
      if (expErr) throw expErr;
      return res.status(400).json({ error: 'Code expired. Please request a new one.' });
    }

    const codeClean = code.trim();
    const hash = hashOtp(codeClean);
    const valid = hash.length === user.email_otp_hash.length;
    const match = valid && user.email_otp_hash === hash;

    if (!match) {
      const { error: attErr } = await supabase.from('users').update({ email_otp_attempts: attempts }).eq('id', req.user.id);
      if (attErr) throw attErr;
      return res.status(400).json({ error: 'Incorrect code. Check your email and try again.' });
    }

    const { data: updated, error } = await supabase.from('users').update({
      email_verified: true,
      email_otp_hash: null,
      email_otp_expires: null,
      email_otp_attempts: 0,
    }).eq('id', req.user.id).select().single();
    if (error) throw error;
    res.json({ success: true, verified: true, user: safeUser(updated) });
  } catch (err) {
    sendError(res, err);
  }
});

// ── TOTP setup: generate secret + QR ───────────────────────────
router.post('/totp/setup', auth, async (req, res) => {
  try {
    const secret = generateTOTPSecret();
    const uri = totpProvisioningUri(secret, req.user.email || req.user.username);
    const qr = await qrDataUrl(uri);
    const { error: setupErr } = await supabase.from('users').update({ totp_secret: secret }).eq('id', req.user.id);
    if (setupErr) throw setupErr;
    res.json({ secret, qr, uri });
  } catch (err) {
    sendError(res, err);
  }
});

// ── TOTP enable: confirm a code, then activate ─────────────────
router.post('/totp/enable', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const { data: user, error: userErr } = await supabase.from('users').select('totp_secret,totp_enabled').eq('id', req.user.id).single();
    if (userErr) throw userErr;
    if (!user || user.totp_enabled) return res.status(400).json({ error: '2FA is already enabled' });
    if (!user.totp_secret) return res.status(400).json({ error: 'Start 2FA setup first' });
    if (!verifyTOTP(user.totp_secret, code)) return res.status(400).json({ error: 'Invalid authenticator code' });

    const recoveryCodes = generateRecoveryCodes(8);
    const hashed = recoveryCodes.map(hashRecoveryCode);
    const { data: updated, error } = await supabase.from('users').update({
      totp_enabled: true,
      totp_recovery_codes: hashed,
    }).eq('id', req.user.id).select().single();
    if (error) throw error;
    res.json({ success: true, recoveryCodes, user: safeUser(updated) });
  } catch (err) {
    sendError(res, err);
  }
});

// ── TOTP disable: confirm with a valid code ────────────────────
router.post('/totp/disable', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const { data: user, error: userErr } = await supabase.from('users').select('totp_secret,totp_enabled,totp_recovery_codes').eq('id', req.user.id).single();
    if (userErr) throw userErr;
    if (!user || !user.totp_enabled) return res.status(400).json({ error: '2FA is not enabled' });

    const validTotp = verifyTOTP(user.totp_secret, code);
    const validRecovery = (user.totp_recovery_codes || []).some(h => h === hashRecoveryCode(code));
    if (!validTotp && !validRecovery) return res.status(400).json({ error: 'Invalid code. 2FA stays enabled.' });

    const { data: updated, error } = await supabase.from('users').update({
      totp_enabled: false,
      totp_secret: null,
      totp_recovery_codes: [],
    }).eq('id', req.user.id).select().single();
    if (error) throw error;
    res.json({ success: true, user: safeUser(updated) });
  } catch (err) {
    sendError(res, err);
  }
});

// ── TOTP regenerate recovery codes ─────────────────────────────
router.post('/totp/regenerate-recovery', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const { data: user, error: userErr } = await supabase.from('users').select('totp_secret,totp_enabled,totp_recovery_codes').eq('id', req.user.id).single();
    if (userErr) throw userErr;
    if (!user || !user.totp_enabled) return res.status(400).json({ error: '2FA is not enabled' });
    if (!verifyTOTP(user.totp_secret, code)) return res.status(400).json({ error: 'Invalid authenticator code' });

    const recoveryCodes = generateRecoveryCodes(8);
    const hashed = recoveryCodes.map(hashRecoveryCode);
    const { error: regenErr } = await supabase.from('users').update({ totp_recovery_codes: hashed }).eq('id', req.user.id);
    if (regenErr) throw regenErr;
    res.json({ success: true, recoveryCodes });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Reset password (owner only) ────────────────────────────────
router.post('/admin/reset-password', auth, ownerOnly, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'User ID required' });

    // Check user exists and is not owner
    const { data: target } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
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
    sendError(res, err);
  }
});

// ── Change password (user endpoint) ────────────────────────────
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword, fromReset } = req.body;

    // fromReset is only honored when a forced reset is actually pending
    if (fromReset && !req.user.must_change_password) {
      return res.status(400).json({ error: 'No forced password reset pending' });
    }

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

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
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
    sendError(res, err);
  }
});

module.exports = router;
