/**
 * KATCHAT INPUT VALIDATION & SANITIZATION
 * Comprehensive validation for all user inputs across the app
 * Prevents XSS, injection attacks, and data corruption
 */

if (window.__katchat_validation_loaded__) {
  console.log('🛡️ Validation system already loaded');
} else {
  window.__katchat_validation_loaded__ = true;

  // ===== SANITIZATION UTILITIES =====

  /**
   * HTML escape to prevent XSS
   */
  window.esc = window.esc || function(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return String(text).replace(/[&<>"']/g, c => map[c]);
  };

  /**
   * Remove HTML tags (strip all markup)
   */
  window.stripHtml = function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  /**
   * Sanitize URL to prevent javascript: and data: schemes
   */
  window.sanitizeUrl = function(url) {
    if (!url) return '';
    const lower = String(url).toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:')) {
      logError('sanitizeUrl', new Error(`Blocked dangerous URL: ${url}`), false);
      return '';
    }
    return url;
  };

  /**
   * Remove excessive whitespace
   */
  window.trimExcess = function(text) {
    return String(text).replace(/\s+/g, ' ').trim();
  };

  /**
   * Limit string length
   */
  window.limitLength = function(text, max) {
    return String(text).substring(0, max);
  };

  // ===== INPUT VALIDATORS =====

  /**
   * Validate email format
   */
  window.validateEmail = function(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !re.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }
    if (email.length > 254) {
      return { valid: false, error: 'Email too long' };
    }
    return { valid: true };
  };

  /**
   * Validate password strength
   */
  window.validatePassword = function(password) {
    const errors = [];
    
    if (!password) {
      return { valid: false, error: 'Password required' };
    }
    if (password.length < 8) {
      errors.push('at least 8 characters');
    }
    if (password.length > 128) {
      errors.push('maximum 128 characters');
    }
    // Optional: require mixed case/numbers
    // if (!/[A-Z]/.test(password)) errors.push('uppercase letter');
    // if (!/[0-9]/.test(password)) errors.push('number');

    if (errors.length > 0) {
      return { valid: false, error: `Password must have: ${errors.join(', ')}` };
    }
    return { valid: true };
  };

  /**
   * Validate username format
   */
  window.validateUsername = function(username) {
    const re = /^[a-z0-9_]{3,20}$/;
    
    if (!username) {
      return { valid: false, error: 'Username required' };
    }
    if (!re.test(username)) {
      return { valid: false, error: 'Username: 3-20 lowercase letters, numbers, or underscores only' };
    }
    return { valid: true };
  };

  /**
   * Validate display name
   */
  window.validateDisplayName = function(name) {
    const trimmed = trimExcess(name);
    
    if (!trimmed) {
      return { valid: false, error: 'Display name required' };
    }
    if (trimmed.length < 2) {
      return { valid: false, error: 'Display name too short (min 2 characters)' };
    }
    if (trimmed.length > 100) {
      return { valid: false, error: 'Display name too long (max 100 characters)' };
    }
    return { valid: true };
  };

  /**
   * Validate message content
   */
  window.validateMessage = function(content) {
    const trimmed = trimExcess(content || '');
    
    if (!trimmed) {
      return { valid: false, error: 'Message cannot be empty' };
    }
    if (trimmed.length > 5000) {
      return { valid: false, error: 'Message too long (max 5000 characters)' };
    }
    return { valid: true };
  };

  /**
   * Validate announcement title
   */
  window.validateAnnTitle = function(title) {
    const trimmed = trimExcess(title || '');
    
    if (!trimmed) {
      return { valid: false, error: 'Title required' };
    }
    if (trimmed.length < 3) {
      return { valid: false, error: 'Title too short (min 3 characters)' };
    }
    if (trimmed.length > 200) {
      return { valid: false, error: 'Title too long (max 200 characters)' };
    }
    return { valid: true };
  };

  /**
   * Validate announcement content
   */
  window.validateAnnContent = function(content) {
    const trimmed = trimExcess(content || '');
    
    if (!trimmed) {
      return { valid: false, error: 'Content required' };
    }
    if (trimmed.length < 5) {
      return { valid: false, error: 'Content too short (min 5 characters)' };
    }
    if (trimmed.length > 10000) {
      return { valid: false, error: 'Content too long (max 10000 characters)' };
    }
    return { valid: true };
  };

  /**
   * Validate role name
   */
  window.validateRoleName = function(name) {
    const trimmed = trimExcess(name || '');
    
    if (!trimmed) {
      return { valid: false, error: 'Role name required' };
    }
    if (trimmed.length < 2) {
      return { valid: false, error: 'Role name too short' };
    }
    if (trimmed.length > 50) {
      return { valid: false, error: 'Role name too long' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return { valid: false, error: 'Role name: letters, numbers, dash, or underscore only' };
    }
    return { valid: true };
  };

  /**
   * Validate hex color
   */
  window.validateHexColor = function(color) {
    const re = /^#[0-9A-Fa-f]{6}$/;
    
    if (!color || !re.test(color)) {
      return { valid: false, error: 'Invalid hex color (e.g., #FF5733)' };
    }
    return { valid: true };
  };

  /**
   * Validate Font Awesome icon class
   */
  window.validateIconClass = function(icon) {
    if (!icon || icon.length < 5) {
      return { valid: false, error: 'Icon class too short' };
    }
    if (!icon.includes('fa')) {
      return { valid: false, error: 'Must be a Font Awesome class' };
    }
    if (icon.length > 100) {
      return { valid: false, error: 'Icon class too long' };
    }
    return { valid: true };
  };

  /**
   * Validate image file
   */
  window.validateImageFile = function(file) {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (!file) {
      return { valid: false, error: 'No file selected' };
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return { valid: false, error: 'Only JPEG, PNG, GIF, or WebP images allowed' };
    }

    if (file.size > MAX_SIZE) {
      return { valid: false, error: `Image too large (max ${MAX_SIZE / 1024 / 1024}MB)` };
    }

    return { valid: true };
  };

  /**
   * Validate multiple files
   */
  window.validateImageFiles = function(files, maxCount = 5) {
    if (!files || files.length === 0) {
      return { valid: false, error: 'No files selected' };
    }

    if (files.length > maxCount) {
      return { valid: false, error: `Maximum ${maxCount} images allowed` };
    }

    for (let file of files) {
      const result = validateImageFile(file);
      if (!result.valid) {
        return result;
      }
    }

    return { valid: true };
  };

  /**
   * Validate command format (/ban, /unban, etc)
   */
  window.validateCommand = function(cmdString) {
    if (!cmdString || !cmdString.startsWith('/')) {
      return { valid: false, error: 'Command must start with /' };
    }

    const parts = cmdString.split(/\s+/);
    const cmd = parts[0];
    const validCommands = ['/ban', '/unban', '/tban', '/tunban'];

    if (!validCommands.includes(cmd)) {
      return { valid: false, error: `Unknown command: ${cmd}` };
    }

    return { valid: true, command: cmd, parts };
  };

  /**
   * Validate mention format (@username)
   */
  window.validateMention = function(mention) {
    if (!mention.startsWith('@')) {
      return { valid: false, error: 'Mention must start with @' };
    }

    const username = mention.slice(1);
    const re = /^[a-z0-9_]{3,20}$/;

    if (!re.test(username)) {
      return { valid: false, error: 'Invalid username format' };
    }

    return { valid: true, username };
  };

  /**
   * Sanitize form input
   */
  window.sanitizeInput = function(value, options = {}) {
    const {
      maxLength = 1000,
      allowHtml = false,
      trim = true,
      lowercase = false,
    } = options;

    let result = String(value);

    if (trim) {
      result = result.trim();
    }

    if (lowercase) {
      result = result.toLowerCase();
    }

    if (result.length > maxLength) {
      result = result.substring(0, maxLength);
    }

    if (!allowHtml) {
      result = esc(result);
    }

    return result;
  };

  // ===== FORM VALIDATION HELPERS =====

  /**
   * Validate 6-digit one-time code (email OTP or authenticator TOTP)
   */
  window.validateOtpCode = function(code) {
    const re = /^\d{6}$/;
    if (!code || !re.test(code)) {
      return { valid: false, error: 'Enter the 6-digit code' };
    }
    return { valid: true };
  };

  /**
   * Validate login form
   */
  window.validateLoginForm = function(email, password) {
    const errors = [];

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) errors.push(emailCheck.error);

    if (!password) {
      errors.push('Password required');
    } else if (password.length > 128) {
      errors.push('Password too long');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  };

  /**
   * Validate signup form
   */
  window.validateSignupForm = function(displayName, username, email, password, gender) {
    const errors = [];

    const nameCheck = validateDisplayName(displayName);
    if (!nameCheck.valid) errors.push(nameCheck.error);

    const userCheck = validateUsername(username);
    if (!userCheck.valid) errors.push(userCheck.error);

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) errors.push(emailCheck.error);

    const passCheck = validatePassword(password);
    if (!passCheck.valid) errors.push(passCheck.error);

    if (!gender || !['male', 'female', 'non-binary', 'prefer-not-to-say'].includes(gender)) {
      errors.push('Please select a gender');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  };

  /**
   * Validate password change form
   */
  window.validatePasswordChangeForm = function(currentPassword, newPassword, confirmPassword) {
    const errors = [];

    if (!currentPassword) {
      errors.push('Current password required');
    }

    const passCheck = validatePassword(newPassword);
    if (!passCheck.valid) errors.push(passCheck.error);

    if (newPassword !== confirmPassword) {
      errors.push('Passwords do not match');
    }

    if (currentPassword === newPassword) {
      errors.push('New password must be different from current password');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  };

  /**
   * Validate announcement form
   */
  window.validateAnnouncementForm = function(title, content) {
    const errors = [];

    const titleCheck = validateAnnTitle(title);
    if (!titleCheck.valid) errors.push(titleCheck.error);

    const contentCheck = validateAnnContent(content);
    if (!contentCheck.valid) errors.push(contentCheck.error);

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  };

  /**
   * Validate role form
   */
  window.validateRoleForm = function(name, color, icon) {
    const errors = [];

    const nameCheck = validateRoleName(name);
    if (!nameCheck.valid) errors.push(nameCheck.error);

    const colorCheck = validateHexColor(color);
    if (!colorCheck.valid) errors.push(colorCheck.error);

    const iconCheck = validateIconClass(icon);
    if (!iconCheck.valid) errors.push(iconCheck.error);

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  };

  // ===== ERROR DISPLAY HELPERS =====

  /**
   * Show validation errors in modal or toast
   */
  window.showValidationErrors = function(errors, errorElementId = null) {
    if (!Array.isArray(errors) || errors.length === 0) return;

    const message = errors.join('\n');

    if (errorElementId) {
      const errorEl = document.getElementById(errorElementId);
      if (errorEl) {
        errorEl.textContent = errors[0]; // Show first error in element
        errorEl.classList.remove('hidden');
      }
    }

    // Also show toast for first error
    if (typeof showToast === 'function') {
      showToast(errors[0], 'error');
    }

    console.warn('Validation errors:', errors);
  };

  /**
   * Clear validation error display
   */
  window.clearValidationErrors = function(errorElementId = null) {
    if (errorElementId) {
      const errorEl = document.getElementById(errorElementId);
      if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
      }
    }
  };

  console.log('✅ Input validation & sanitization system loaded');
}
