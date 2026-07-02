// Global app state
const state = {
  user: null,
  token: null,
  friends: [],
  friendRequestsReceived: [],
  friendRequestsSent: [],
  unreadCounts: {},
  roles: [],
};

// Per-session variables
let activeFriend = null;
let replyToMsg = null;
let globalReplyToMsg = null;
let selectedImages = [];
let typingTimer = null;
let sageMessages = [];
let editingAnnId = null;
let editingRoleName = null;
let sageImageBase64 = null;
let sageImageMime = null;

