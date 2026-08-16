// Global app state
const state = {
  user: null,
  token: null,
  friends: [],
  friendRequestsReceived: [],
  friendRequestsSent: [],
  unreadCounts: {},
  roles: [],
  totpTempToken: null,
  pendingUser: null,
};

// Per-session variables
// NOTE: globalReplyToMsg is intentionally a window property (not a let) so
// that fallback handlers in fixes.js and the real handlers in global.js
// share the same reference. Do NOT add a let declaration for it here.
let activeFriend = null;
let replyToMsg = null;
let selectedImages = [];
let typingTimer = null;
let sageMessages = [];
let editingAnnId = null;
let editingRoleName = null;
let sageImageBase64 = null;
let sageImageMime = null;

