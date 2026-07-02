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

    const { token, user } = await api.login({ email, password: pass });
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
    await enterApp();
  } catch (err) {
    logError('handleSignup', err, false);
    showValidationErrors([err.message], 'signup-err');
    const btn = document.getElementById('signup-btn');
    btn.innerHTML = '<span>Create Account</span><i class="fa fa-arrow-right"></i>';
    btn.disabled = false;
  }
}

async function checkAuth() {
  const token = localStorage.getItem('kc_token');
  if (!token) return false;
  try {
    const decoded = JSON.parse(atob(token.split('.')[1]));
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

