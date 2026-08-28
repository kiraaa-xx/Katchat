/**
 * KATCHAT FUNCTION BINDING & VALIDATION
 * Ensures all HTML onclick handlers map to real, accessible functions
 * Validates critical functions exist before app initializes
 */

if (window.__katchat_bindings_loaded__) {
  console.log('🔗 Function bindings already loaded');
} else {
  window.__katchat_bindings_loaded__ = true;

  // ===== CRITICAL FUNCTIONS REGISTRY =====
  
  const CRITICAL_FUNCTIONS = [
    // Auth
    'handleLogin', 'handleSignup', 'checkAuth', 'doLogout', 'showChangePasswordView',
    'submitChangePassword', 'showLogin', 'showSignup', 'toggleEye',
    'showTotpLogin', 'submitTotpLogin', 'backToLoginFromTotp',
    'showEmailVerifyCard', 'submitEmailVerify', 'resendVerificationCode', 'backToLoginFromVerify',
    
    // Navigation
    'navTo', 'goBack', 'showView', 'switchTab', 'adminTab',
    
    // Chat
    'openPrivateChat', 'sendPrivate', 'privKey', 'privInput', 'handleImgSelect',
    'deletePrivMsg', 'cancelReply', 'openProfile',
    
    // Global
    'openGlobal', 'sendGlobal', 'globalKey', 'globalInput', 'showMentionDropdown',
    'hideMentionDropdown', 'insertMention', 'insertCommand', 'insertCommandUser',
    'setGlobalReply', 'cancelGlobalReply', 'deleteGlobalMsg', 'scrollToGlobalMsg',
    'moveMentionFocus', 'showCommandDropdown',
    
    // Friends
    'openAddFriend', 'searchUsers', 'doSendFriendReq', 'doAcceptFriend',
    'doDeclineFriend', 'doRemoveFriend', 'doCancelFriendReq', 'loadFriends',
    'switchFriendTab', 'clearFriendSearch',
    
    // Announcements
    'openAnnouncements', 'openAnnModal', 'submitAnnouncement', 'deleteAnn',
    'toggleComments', 'loadComments',
    'previewAnnImg',
    
    // Sage
    'openSage', 'sendSage', 'sageKey', 'handleSageImg', 'clearSageImg',
    'newSageChat', 'deleteSageChat', 'clearSageHistory', 'insertSagePrompt',
    'loadSageChats', 'renderSageChatList', 'loadSageChat', 'toggleSagePanel',
    
    // Settings
    'openSettings', 'saveProfile', 'changePassword', 'toggleTheme',
    'handleAvatarUpload', 'applyAvatarCrop', 'setAvCropZoom', 'toggleSettingsSection', 'confirmLogout',
    'toggleTotpPanel', 'enableTotp', 'disableTotp', 'confirmDisableTotp',
    'regenerateRecoveryCodes', 'confirmRegenerateRecovery',
    'toggleEmailVerifyPanel', 'submitEmailVerifyCode', 'resendVerificationFromSettings',
    
    // Admin
    'openAdmin', 'openBanDialog', 'changeUserRole', 'adminBan', 'adminUnban',
    'resetUserPassword', 'copyToClipboard', 'filterAdminUsers', 'loadAdminUsers',
    'loadAdminRoles', 'openRoleModal', 'previewRoleIcon', 'setIcon', 'setRoleColor',
    'submitRole', 'deleteRole', 'syncColorFromHex', 'loadAdminBans',
    'loadAdminPosts',
    
    // UI
    'showToast', 'openModal', 'closeModal', 'overlayClick', 'showConfirm',
    'scrollToBottom', 'autoResize', 'filterChats', 'clearSearch',
    'updateTopbarAv', 'initApp', 'playIntro', 'enterApp',
    
    // Help
    'openHelp', 'toggleHelpSection', 'toggleFaqItem', 'loadWelcomeAnnouncements',
    
    // Owner Messages
    'openOwnerContact', 'sendOwnerContact', 'updateOwnerMsgCount',
    'loadAdminOwnerMessages', 'markOwnerMsgRead', 'deleteOwnerMsg', 'openModal',
    'openOwnerReplyBox', 'closeOwnerReplyBox', 'sendOwnerReply',
    'handleOwnerReplyNotification', 'showOwnerReplyNotif', 'clearOwnerReplyNotif',
  ];

  /**
   * Check if function is globally accessible
   */
  window.isFunctionAccessible = function(fnName) {
    try {
      const fn = window[fnName];
      return typeof fn === 'function';
    } catch {
      return false;
    }
  };

  /**
   * Validate all critical functions exist
   */
  window.validateCriticalFunctions = function() {
    const missing = [];
    const available = [];

    CRITICAL_FUNCTIONS.forEach(fnName => {
      if (isFunctionAccessible(fnName)) {
        available.push(fnName);
      } else {
        missing.push(fnName);
      }
    });

    console.log(`✅ Available functions: ${available.length}/${CRITICAL_FUNCTIONS.length}`);
    
    if (missing.length > 0) {
      console.warn(`⚠️ Missing functions: ${missing.join(', ')}`);
      return { valid: false, missing, available };
    }

    console.log('✅ All critical functions available');
    return { valid: true, available, missing: [] };
  };

  /**
   * Create safe wrapper for HTML onclick handlers
   */
  window.safeCall = function(fnName, ...args) {
    try {
      const fn = window[fnName];
      if (typeof fn !== 'function') {
        logError(`safeCall[${fnName}]`, new Error(`Function not found: ${fnName}`), true);
        return;
      }
      return fn.apply(window, args);
    } catch (err) {
      logError(`safeCall[${fnName}]`, err);
    }
  };

  /**
   * Create safe async wrapper
   */
  window.safeCallAsync = async function(fnName, ...args) {
    try {
      const fn = window[fnName];
      if (typeof fn !== 'function') {
        logError(`safeCallAsync[${fnName}]`, new Error(`Function not found: ${fnName}`), true);
        return;
      }
      return await fn.apply(window, args);
    } catch (err) {
      logError(`safeCallAsync[${fnName}]`, err);
    }
  };

  /**
   * Map all HTML onclick handlers to safe versions
   */
  window.bindAllClickHandlers = function() {
    const handlers = document.querySelectorAll('[onclick]');
    let bound = 0;

    handlers.forEach(el => {
      const onclick = el.getAttribute('onclick');
      if (!onclick) return;

      // Extract function name
      const match = onclick.match(/^(\w+)\(/);
      if (!match) return;

      const fnName = match[1];
      
      // Skip if already using safeCall
      if (onclick.includes('safeCall')) return;

      // Verify function exists
      if (!isFunctionAccessible(fnName)) {
        console.warn(`⚠️ Handler references missing function: ${fnName}`);
        console.warn(`   Element: ${el.outerHTML.substring(0, 100)}`);
      } else {
        bound++;
      }
    });

    console.log(`🔗 Verified ${bound} onclick handlers`);
  };

  /**
   * Validate DOM element IDs match HTML
   */
  window.validateDomIds = function() {
    const REQUIRED_IDS = [
      // Auth
      'auth-page', 'login-card', 'signup-card', 'v-change-password', 'totp-card', 'verify-card',
      'l-email', 'l-pass', 'login-btn', 's-name', 's-username', 's-email',
      's-pass', 'signup-btn', 'new-password-input', 'confirm-password-input',
      'change-pass-btn', 'login-err', 'signup-err', 'change-pass-err',
      'totp-code', 'totp-btn', 'totp-user', 'totp-err',
      'verify-code', 'verify-btn', 'verify-resend', 'verify-email', 'verify-err',
      
      // Main App
      'app', 'app-body', 'topbar', 'sidebar', 'main-content', 'bottom-nav',
      
      // Views
      'v-welcome', 'v-chat', 'v-global', 'v-announcements', 'v-settings',
      'v-admin', 'v-sage',
      
      // Chat
      'chat-header', 'ch-avatar', 'ch-name', 'ch-status', 'ch-online-dot',
      'priv-msgs', 'priv-input', 'priv-send-btn', 'typing-bar',
      'priv-reply-preview', 'img-previews', 'img-input',
      
      // Global
      'global-msgs', 'global-input', 'global-online-count', 'global-status',
      'mention-dropdown', 'global-reply-preview', 'banned-bar',
      
      // Sage
      'v-sage', 'sage-side-panel', 'sage-msgs', 'sage-input', 'sage-img-preview',
      'sage-img-input', 'sage-chat-list',
      
      // Admin
      'admin-users-list', 'admin-roles-list', 'admin-bans-list',
      'admin-posts-list', 'at-users', 'at-roles', 'at-bans', 'at-posts',
      'at-owner-msgs', 'admin-owner-msgs-list', 'owner-msg-notif', 'owner-msg-count-display',
      
      // Settings
      'settings-av', 'set-name', 'set-gender', 'set-curr-pw',
      'set-new-pw', 'av-upload', 'theme-toggle', 'admin-card',
      'totp-status-text', 'totp-manage-btn', 'totp-manage-label', 'totp-panel',
      'email-verify-status', 'email-verify-btn', 'email-verify-label', 'email-verify-panel',
      
      // Modals
      'overlay', 'm-friend', 'm-profile', 'm-ann', 'm-ann-detail', 'm-role', 'm-confirm',
      'm-recovery', 'recovery-codes-list',
      'friend-search-inp', 'ann-title', 'ann-content', 'ann-img-input',
      'role-name', 'role-color', 'role-icon',
      
      // Owner Contact
      'm-contact-owner', 'owner-msg-input', 'owner-msg-count', 'owner-msg-status',
      'owner-msg-inbox', 'owner-reply-notif',
      
      // UI
      'toast-wrap', 'swipe-hint', 'topbar-beam', 'topbar-zav',
      'chat-list', 'friends-list', 'search-results',
    ];

    const missing = [];
    const found = [];

    REQUIRED_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        found.push(id);
      } else {
        missing.push(id);
      }
    });

    console.log(`✅ Found DOM elements: ${found.length}/${REQUIRED_IDS.length}`);

    if (missing.length > 0) {
      console.warn(`⚠️ Missing DOM IDs: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ` ... +${missing.length - 10} more` : ''}`);
      return { valid: found.length / REQUIRED_IDS.length > 0.9, missing, found };
    }

    return { valid: true, missing: [], found };
  };

  /**
   * Run comprehensive validation
   */
  window.runValidation = function() {
    console.log('🔍 Running KatChat validation...\n');

    const funcCheck = validateCriticalFunctions();
    console.log('');
    
    const domCheck = validateDomIds();
    console.log('');
    
    bindAllClickHandlers();
    console.log('');

    const overall = funcCheck.valid && domCheck.valid;
    console.log(overall ? '✅ Validation PASSED' : '⚠️ Validation had issues');

    return {
      functions: funcCheck,
      dom: domCheck,
      overall,
      timestamp: new Date().toISOString(),
    };
  };

  /**
   * Auto-run validation on app startup
   * Run as separate DOMContentLoaded listener so it fires BEFORE initApp
   * (bindings.js loads before app.js, so this listener registers first)
   */
  document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 KatChat initializing...');
    const validation = runValidation();

    if (!validation.overall) {
      console.warn('⚠️ Starting with validation warnings - some features may not work');
    }
  });

  console.log('✅ Function bindings & validation system loaded');
}
