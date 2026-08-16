/**
 * KATCHAT SECURITY MODULE
 * TOTP (authenticator) 2FA, email OTP verification, recovery codes,
 * and optional email delivery via Resend (free tier).
 *
 * TOTP is implemented per RFC 6238 / RFC 4226 using Node's crypto —
 * no external library or third-party account required.
 */

const crypto = require('crypto');
const QRCode = require('qrcode');

// ── Base32 (RFC 4648) ──────────────────────────────────────────
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buffer) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

const base32Decode = (str) => {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

// ── TOTP (RFC 6238) ────────────────────────────────────────────
const TOTP_STEP = 30;
const TOTP_DIGITS = 6;

const generateTOTPSecret = () => base32Encode(crypto.randomBytes(20));

const hotp = (secret, counter) => {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return (bin % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
};

const totpCounter = (now = Date.now()) => Math.floor(now / 1000 / TOTP_STEP);

/**
 * Verify a user-supplied code against the secret.
 * window = allowed steps backward/forward for clock drift (default ±1).
 */
const verifyTOTP = (secret, code, window = 1) => {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  if (!secret) return false;
  const current = totpCounter();
  for (let i = -window; i <= window; i++) {
    if (hotp(secret, current + i) === code) return true;
  }
  return false;
};

const totpProvisioningUri = (secret, account, issuer = 'KatChat') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;

const qrDataUrl = async (uri) => QRCode.toDataURL(uri, { width: 220, margin: 2 });

// ── Email OTP ──────────────────────────────────────────────────
const generateOtp = (digits = 6) => {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits;
  return String(crypto.randomInt(min, max));
};

const hashOtp = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

// ── Recovery codes ─────────────────────────────────────────────
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generateRecoveryCodes = (count = 8) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    let code = '';
    for (let j = 0; j < 12; j++) code += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    codes.push(code);
  }
  return codes;
};

const hashRecoveryCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

// ── Email delivery (Resend — free tier) ────────────────────────
// Requires RESEND_API_KEY in .env. Returns false when not configured.
const sendEmail = async ({ to, subject, html }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.RESEND_FROM || 'KatChat <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Email send failed (${res.status})`);
    err.body = body;
    throw err;
  }
  return true;
};

module.exports = {
  generateTOTPSecret,
  verifyTOTP,
  totpProvisioningUri,
  qrDataUrl,
  generateOtp,
  hashOtp,
  generateRecoveryCodes,
  hashRecoveryCode,
  sendEmail,
};