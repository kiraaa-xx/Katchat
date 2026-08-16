/**
 * KATCHAT ERROR HANDLING ENHANCEMENT
 * Comprehensive error tracking and user feedback system
 * Load this after fixes.js but before other files
 */

if (window.__katchat_error_handling_loaded__) {
  console.log('🔒 Error handling already loaded');
} else {
  window.__katchat_error_handling_loaded__ = true;
  
  // ===== ERROR LOGGER SYSTEM =====
  window.__errorLog__ = [];
  window.MAX_ERROR_LOG = 100;

  /**
   * Central error logger - all errors go here for debugging
   */
  window.logError = function(context, error, showUser = false) {
    const err = error instanceof Error ? error : new Error(String(error));
    const entry = {
      timestamp: new Date().toISOString(),
      context,
      message: err.message,
      stack: err.stack,
      userAgent: navigator.userAgent.substring(0, 100)
    };

    // Keep only last N errors
    window.__errorLog__.push(entry);
    if (window.__errorLog__.length > window.MAX_ERROR_LOG) {
      window.__errorLog__.shift();
    }

    // Always log to console
    console.error(`[${context}] ${err.message}`, err);

    // Show user-friendly message if enabled
    if (showUser && typeof showToast === 'function') {
      // Extract user-friendly message
      let msg = err.message || 'Something went wrong';
      if (msg.includes('fetch')) msg = 'Network connection failed';
      if (msg.includes('timeout')) msg = 'Request timed out';
      if (msg.includes('unauthorized')) msg = 'You need to log in again';
      if (msg.includes('forbidden')) msg = 'You don\'t have permission';
      
      showToast(msg, 'error');
    }

    return err;
  };

  /**
   * Get error log for debugging
   */
  window.getErrorLog = function() {
    console.table(window.__errorLog__);
    return window.__errorLog__;
  };

  /**
   * Export error log as JSON for bug reports
   */
  window.exportErrorLog = function() {
    const json = JSON.stringify(window.__errorLog__, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `katchat-errors-${new Date().toISOString()}.json`;
    a.click();
  };

  // ===== ENHANCED API WRAPPER =====
  
  const originalFetch = window.fetch;

  /**
   * Wrap fetch with error handling
   */
  window.fetch = function(...args) {
    return originalFetch.apply(this, args)
      .catch(err => {
        logError('fetch', err, false);
        throw err;
      });
  };

  // ===== CRITICAL FUNCTION WRAPPERS =====

  /**
   * Safely open global chat
   */
  const orig_openGlobal = window.openGlobal;
  if (typeof orig_openGlobal === 'function') {
    window.openGlobal = async function() {
      try {
        return await orig_openGlobal.call(this);
      } catch (err) {
        logError('openGlobal', err);
        const container = document.getElementById('global-msgs');
        if (container) {
          container.innerHTML = `<div class="empty-state"><i class="fa fa-exclamation-circle"></i><p>Failed to load global chat: ${err.message}</p></div>`;
        }
      }
    };
  }

  /**
   * Safely send global message
   */
  const orig_sendGlobal = window.sendGlobal;
  if (typeof orig_sendGlobal === 'function') {
    window.sendGlobal = function() {
      try {
        return orig_sendGlobal.call(this);
      } catch (err) {
        logError('sendGlobal', err);
      }
    };
  }

  /**
   * Safely send private message
   */
  const orig_sendPrivate = window.sendPrivate;
  if (typeof orig_sendPrivate === 'function') {
    window.sendPrivate = async function() {
      try {
        return await orig_sendPrivate.call(this);
      } catch (err) {
        logError('sendPrivate', err);
        showToast('Failed to send message', 'error');
      }
    };
  }

  /**
   * Safely send sage message
   */
  const orig_sendSage = window.sendSage;
  if (typeof orig_sendSage === 'function') {
    window.sendSage = async function() {
      try {
        return await orig_sendSage.call(this);
      } catch (err) {
        logError('sendSage', err);
        showToast('Failed to send message to Sage', 'error');
      }
    };
  }

  /**
   * Safely open private chat
   */
  const orig_openPrivateChat = window.openPrivateChat;
  if (typeof orig_openPrivateChat === 'function') {
    window.openPrivateChat = async function(friend) {
      try {
        return await orig_openPrivateChat.call(this, friend);
      } catch (err) {
        logError('openPrivateChat', err);
        showToast('Failed to open chat', 'error');
      }
    };
  }

  /**
   * Safely handle login
   */
  const orig_handleLogin = window.handleLogin;
  if (typeof orig_handleLogin === 'function') {
    window.handleLogin = async function() {
      try {
        return await orig_handleLogin.call(this);
      } catch (err) {
        logError('handleLogin', err, false);
        const errEl = document.getElementById('login-err');
        if (errEl) {
          errEl.textContent = err.message || 'Login failed';
          errEl.classList.remove('hidden');
        }
      }
    };
  }

  /**
   * Safely handle signup
   */
  const orig_handleSignup = window.handleSignup;
  if (typeof orig_handleSignup === 'function') {
    window.handleSignup = async function() {
      try {
        return await orig_handleSignup.call(this);
      } catch (err) {
        logError('handleSignup', err, false);
        const errEl = document.getElementById('signup-err');
        if (errEl) {
          errEl.textContent = err.message || 'Signup failed';
          errEl.classList.remove('hidden');
        }
      }
    };
  }

  // ===== GLOBAL ERROR HANDLERS =====

  /**
   * Catch unhandled rejections
   */
  window.addEventListener('unhandledrejection', event => {
    logError('unhandledRejection', event.reason);
    event.preventDefault();
  });

  /**
   * Catch uncaught errors
   */
  window.addEventListener('error', event => {
    logError('uncaughtError', event.error || event.message);
  });

  /**
   * Monitor socket errors
   */
  const origInitSocket = window.initSocket;
  if (typeof origInitSocket === 'function') {
    window.initSocket = function(token) {
      const result = origInitSocket.call(this, token);
      
      if (window.socket) {
        window.socket.on('connect_error', (error) => {
          logError('socketConnectError', error.message);
        });
        
        window.socket.on('disconnect', (reason) => {
          console.warn(`🔌 Socket disconnected: ${reason}`);
        });

        window.socket.on('error', (error) => {
          logError('socketError', error.message || error);
        });
      }

      return result;
    };
  }

  // ===== PERFORMANCE MONITORING =====

  /**
   * Track slow operations
   */
  window.trackPerf = function(label, fn) {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    if (duration > 1000) {
      console.warn(`⚠️ Slow operation: ${label} took ${duration.toFixed(0)}ms`);
    } else {
      console.log(`✓ ${label}: ${duration.toFixed(1)}ms`);
    }
    
    return result;
  };

  /**
   * Async performance tracking
   */
  window.trackPerfAsync = async function(label, fn) {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      
      if (duration > 2000) {
        console.warn(`⚠️ Slow async: ${label} took ${duration.toFixed(0)}ms`);
      } else {
        console.log(`✓ ${label}: ${duration.toFixed(1)}ms`);
      }
      
      return result;
    } catch (err) {
      const duration = performance.now() - start;
      logError(`${label} (${duration.toFixed(0)}ms)`, err);
      throw err;
    }
  };

  // ===== VALIDATION HELPERS =====

  /**
   * Validate user object
   */
  window.validateUser = function(user) {
    if (!user) return { valid: false, error: 'User not found' };
    if (!user.id) return { valid: false, error: 'User missing ID' };
    if (!user.email) return { valid: false, error: 'User missing email' };
    return { valid: true };
  };

  /**
   * Validate message object
   */
  window.validateMessage = function(msg) {
    if (!msg) return { valid: false, error: 'Message not found' };
    if (!msg.sender_id && msg.sender_id !== 0) return { valid: false, error: 'Message missing sender' };
    if (!msg.content && !msg.images?.length) return { valid: false, error: 'Message has no content' };
    return { valid: true };
  };

  /**
   * Validate token
   */
  window.validateToken = function(token) {
    if (!token) return { valid: false, error: 'Token missing' };
    if (token.length < 10) return { valid: false, error: 'Token too short' };
    return { valid: true };
  };

  // ===== DOM SAFETY HELPERS =====

  /**
   * Safely update DOM element
   */
  window.safeDomUpdate = function(selector, updater, context = 'safeDomUpdate') {
    try {
      const el = document.querySelector(selector);
      if (!el) {
        logError(`${context} - element not found: ${selector}`, new Error('DOM element missing'), false);
        return null;
      }
      return updater(el);
    } catch (err) {
      logError(context, err);
      return null;
    }
  };

  /**
   * Safely query all elements
   */
  window.safeDomQueryAll = function(selector, context = 'safeDomQueryAll') {
    try {
      return document.querySelectorAll(selector);
    } catch (err) {
      logError(context, err);
      return [];
    }
  };

  console.log('✅ Error handling system initialized');
}
