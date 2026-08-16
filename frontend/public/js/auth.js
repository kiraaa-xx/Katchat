function showLogin() {
  document.getElementById('login-card').classList.remove('hidden');
  document.getElementById('signup-card').classList.add('hidden');
}
function showSignup() {
  document.getElementById('signup-card').classList.remove('hidden');
  document.getElementById('login-card').classList.add('hidden');
}

async function handleLogin() {
  const email = document.getElementById('l-email').value.trim();
  const pass = document.getElementById('l-pass').value;
  const errEl = document.getElementById('login-err');
  
  try {
    clearValidationErrors('login-err');

    // Validate form
    const validation = validateLoginForm(email, pass);
    if (!validation.valid) {
      showValidationErrors(validation.errors, 'login-err');
      return;
    }

    const btn = document.getElementById('login-btn');
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Signing in...';
    btn.disabled = true;

    const data = await api.login({ email, password: pass });

    // Two-factor step: server returns a temp token to complete login
    if (data.twoFactorRequired) {
      state.totpTempToken = data.tempToken;
      state.pendingUser = data.user;
      showTotpLogin();
      btn.innerHTML = '<span>Sign In</span><i class="fa fa-arrow-right"></i>';
      btn.disabled = false;
      return;
    }

    const { token, user } = data;
    localStorage.setItem('kc_token', token);
    state.token = token;
    state.user = user;
    
    // Check if password must be changed
    if (user.must_change_password) {
      showChangePasswordView();
    } else {
      await enterApp();
    }
  } catch (err) {
    logError('handleLogin', err, false);
    if (err.code === 'EMAIL_NOT_VERIFIED') {
      showEmailVerifyCard(email, pass, err.tempToken);
      btn.innerHTML = '<span>Sign In</span><i class="fa fa-arrow-right"></i>';
      btn.disabled = false;
      return;
    }
    showValidationErrors([err.message], 'login-err');
    const btn = document.getElementById('login-btn');
    btn.innerHTML = '<span>Sign In</span><i class="fa fa-arrow-right"></i>';
    btn.disabled = false;
  }
}

async function handleSignup() {
  try {
    clearValidationErrors('signup-err');

    const displayName = document.getElementById('s-name').value.trim();
    const username = document.getElementById('s-username').value.trim();
    const email = document.getElementById('s-email').value.trim();
    const password = document.getElementById('s-pass').value;
    const genderEl = document.querySelector('input[name="gender"]:checked');

    // Validate form
    const validation = validateSignupForm(displayName, username, email, password, genderEl?.value);
    if (!validation.valid) {
      showValidationErrors(validation.errors, 'signup-err');
      return;
    }

    const btn = document.getElementById('signup-btn');
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Creating account...';
    btn.disabled = true;

    const { token, user } = await api.register({
      displayName,
      username,
      email,
      password,
      gender: genderEl.value
    });
    
    localStorage.setItem('kc_token', token);
    state.token = token;
    state.user = user;

    // If the email service is configured, require verification before entering
    if (user.email_verified === false) {
      showEmailVerifyCard(email, password);
      btn.innerHTML = '<span>Create Account</span><i class="fa fa-arrow-right"></i>';
      btn.disabled = false;
      return;
    }
    await enterApp();
  } catch (err) {
    logError('handleSignup', err, false);
    showValidationErrors([err.message], 'signup-err');
    const btn = document.getElementById('signup-btn');
    btn.innerHTML = '<span>Create Account</span><i class="fa fa-arrow-right"></i>';
    btn.disabled = false;
  }
}

// ── TOTP login step ────────────────────────────────────────────
function showTotpLogin() {
  document.getElementById('login-card').classList.add('hidden');
  document.getElementById('signup-card').classList.add('hidden');
  const card = document.getElementById('totp-card');
  if (card) {
    card.classList.remove('hidden');
    const nameEl = document.getElementById('totp-user');
    if (nameEl && state.pendingUser) nameEl.textContent = state.pendingUser.display_name || state.pendingUser.username || '';
    const inp = document.getElementById('totp-code');
    if (inp) { inp.value = ''; inp.focus(); }
    clearValidationErrors('totp-err');
  }
}

async function submitTotpLogin() {
  const code = document.getElementById('totp-code').value.trim();
  const btn = document.getElementById('totp-btn');
  try {
    clearValidationErrors('totp-err');
    if (!/^\d{6}$/.test(code)) {
      showValidationErrors(['Enter the 6-digit code from your authenticator app'], 'totp-err');
      return;
    }
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Verifying...';
    btn.disabled = true;
    const { token, user } = await api.verifyTotpLogin(state.totpTempToken, code);
    localStorage.setItem('kc_token', token);
    state.token = token;
    state.user = user;
    document.getElementById('totp-card').classList.add('hidden');
    if (user.must_change_password) {
      showChangePasswordView();
    } else {
      await enterApp();
    }
  } catch (err) {
    logError('submitTotpLogin', err, false);
    showValidationErrors([err.message], 'totp-err');
  } finally {
    btn.innerHTML = '<span>Verify</span><i class="fa fa-shield-halved"></i>';
    btn.disabled = false;
  }
}

function backToLoginFromTotp() {
  document.getElementById('totp-card').classList.add('hidden');
  document.getElementById('login-card').classList.remove('hidden');
  state.totpTempToken = null;
  state.pendingUser = null;
}

// ── Email verification step ────────────────────────────────────
let _verifyEmailAddr = null;
let _verifyEmailPass = null;
let _verifyTempToken = null;

function showEmailVerifyCard(email, password, tempToken) {
  document.getElementById('login-card').classList.add('hidden');
  document.getElementById('signup-card').classList.add('hidden');
  const card = document.getElementById('verify-card');
  if (!card) return;
  _verifyEmailAddr = email;
  _verifyEmailPass = password || null;
  _verifyTempToken = tempToken || null;
  card.classList.remove('hidden');
  const emailEl = document.getElementById('verify-email');
  if (emailEl) emailEl.textContent = email;
  clearValidationErrors('verify-err');
  resendVerificationCode();
}

async function submitEmailVerify() {
  const code = document.getElementById('verify-code').value.trim();
  const btn = document.getElementById('verify-btn');
  try {
    clearValidationErrors('verify-err');
    if (!/^\d{6}$/.test(code)) {
      showValidationErrors(['Enter the 6-digit code from your email'], 'verify-err');
      return;
    }
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Verifying...';
    btn.disabled = true;
    const { user } = await api.verifyEmail(code, _verifyTempToken);
    state.user = { ...state.user, ...user };
    document.getElementById('verify-card').classList.add('hidden');
    if (_verifyEmailPass) {
      // User came from a blocked login — finish login now
      try {
        const data = await api.login({ email: _verifyEmailAddr, password: _verifyEmailPass });
        if (data.twoFactorRequired) {
          state.totpTempToken = data.tempToken;
          state.pendingUser = data.user;
          showTotpLogin();
          return;
        }
        localStorage.setItem('kc_token', data.token);
        state.token = data.token;
        state.user = data.user;
        await enterApp();
        return;
      } catch (loginErr) {
        showValidationErrors([loginErr.message], 'verify-err');
      }
    } else {
      await enterApp();
    }
  } catch (err) {
    logError('submitEmailVerify', err, false);
    showValidationErrors([err.message], 'verify-err');
  } finally {
    btn.innerHTML = '<span>Verify</span><i class="fa fa-shield-halved"></i>';
    btn.disabled = false;
  }
}

async function resendVerificationCode() {
  const btn = document.getElementById('verify-resend');
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Sending...'; }
    await api.resendVerification(_verifyTempToken);
    showToast('Verification code sent to your email', 'success');
    if (btn) { btn.disabled = true; btn.textContent = 'Resend code (60s)'; }
    setTimeout(() => { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-rotate-right"></i> Resend code'; } }, 60000);
  } catch (err) {
    logError('resendVerificationCode', err, false);
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-rotate-right"></i> Resend code'; }
  }
}

function backToLoginFromVerify() {
  document.getElementById('verify-card').classList.add('hidden');
  document.getElementById('login-card').classList.remove('hidden');
  _verifyEmailAddr = null;
  _verifyEmailPass = null;
}

async function checkAuth() {
  const token = localStorage.getItem('kc_token');
  if (!token) return false;
  try {
    // base64url-safe decode (JWT payloads use - and _ instead of + and /)
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(decodeURIComponent(escape(atob(payload))));
    if (decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem('kc_token');
      return false;
    }
  } catch {}
  try {
    const { user } = await api.me();
    state.user = user;
    state.token = token;
    return true;
  } catch (err) {
    const msg = err?.message || '';
    if (msg.includes('401') || msg.includes('No token') || msg.includes('Invalid token') || msg.includes('Authentication failed')) {
      localStorage.removeItem('kc_token');
    }
    return false;
  }
}

function doLogout() {
  localStorage.removeItem('kc_token');
  state.user = null;
  if (socket) socket.disconnect();
  location.reload();
}

function confirmLogout() {
  showConfirm('Sign Out', 'Are you sure you want to sign out?', doLogout);
}

function showChangePasswordView() {
  // Hide login/signup cards, show change password view
  document.getElementById('login-card').classList.add('hidden');
  document.getElementById('signup-card').classList.add('hidden');
  document.getElementById('intro-screen').style.display = 'none';
  const changePassView = document.getElementById('v-change-password');
  if (changePassView) {
    changePassView.classList.remove('hidden');
    document.getElementById('change-pass-display-name').textContent = state.user?.display_name || 'User';
    document.getElementById('new-password-input').focus();
  }
}

async function submitChangePassword() {
  try {
    clearValidationErrors('change-pass-err');

    const newPw = document.getElementById('new-password-input').value;
    const confirmPw = document.getElementById('confirm-password-input').value;
    const btn = document.getElementById('change-pass-btn');

    // Validate new password (no current password needed for forced reset)
    if (!newPw || newPw.length < 8) {
      showValidationErrors(['New password must be at least 8 characters'], 'change-pass-err');
      return;
    }
    if (newPw !== confirmPw) {
      showValidationErrors(['Passwords do not match'], 'change-pass-err');
      return;
    }

    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Changing password...';
    btn.disabled = true;

    const { user } = await api.changePassword({ newPassword: newPw, fromReset: true });
    state.user = user;
    localStorage.setItem('kc_token', state.token);
    
    // Close change password view and enter app
    document.getElementById('v-change-password').classList.add('hidden');
    await enterApp();
  } catch (err) {
    logError('submitChangePassword', err, false);
    showValidationErrors([err.message], 'change-pass-err');
    const btn = document.getElementById('change-pass-btn');
    btn.innerHTML = '<span>Set New Password</span><i class="fa fa-arrow-right"></i>';
    btn.disabled = false;
  }
}

