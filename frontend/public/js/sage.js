// Prevent redeclaration if script loads twice
if (!window.__sage_initialized__) {
window.__sage_initialized__ = true;

// Sage state (attached to window to avoid duplicate errors)
window.sageMessages = window.sageMessages || [];
window.sageImageBase64 = null;
window.sageImageMime = null;
window.sageImageDataUrl = null; // full data URL for display in bubble
window.sageChats = window.sageChats || [];
window.activeSageChatId = null;
window.activeSageChatObj = null;
window.sagePanelOpen = false;

function openSage() { 
  showView('sage'); 
  initSageView(); 
}
window.openSage = openSage;

async function initSageView() {
  await loadSageChats();
  // Always start a fresh new chat when opening Sage
  // User must explicitly click a history item to load an old chat
  showSageWelcome();
}

async function loadSageChats() {
  try {
    const { chats } = await api.getSageChats();
    sageChats = chats || [];
    renderSageChatList();
  } catch (err) {
    console.error('Failed to load Sage chats:', err);
    sageChats = []; 
  }
}
window.loadSageChats = loadSageChats;

function renderSageChatList() {
  const list = document.getElementById('sage-chat-list');
  if (!list) return;

  if (!sageChats.length) {
    list.innerHTML = `<div style="padding:16px;text-align:center;color:var(--txt3);font-size:12px">
      <i class="fa fa-comment-slash"></i><br>No chats yet</div>`;
    return;
  }

  const sorted = [...sageChats].sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));

  list.innerHTML = sorted.map(c => `
    <div class="sage-chat-item ${c.id === activeSageChatId ? 'active' : ''}" 
         onclick="loadSageChat(${safeJsonForOnclick(c)})">
      <div class="sci-title">${esc(c.title || 'Chat')}</div>
      <div class="sci-preview">${esc(c.preview || '...')}</div>
      <div class="sci-actions">
        <button class="sci-rename" onclick="event.stopPropagation();renameSageChat('${c.id}')" title="Rename chat">
          <i class="fa fa-pen"></i>
        </button>
        <button class="sci-del" onclick="event.stopPropagation();deleteSageChat('${c.id}')" title="Delete chat">
          <i class="fa fa-trash"></i>
        </button>
      </div>
    </div>`).join('');
}
window.renderSageChatList = renderSageChatList;

function loadSageChat(chat) {
  if (typeof chat === 'string') {
    try {
      chat = JSON.parse(chat);
    } catch (e) {
      console.error('Failed to parse chat object:', e);
      return;
    }
  }

  activeSageChatId = chat.id;
  activeSageChatObj = chat;
  sageMessages = chat.messages || [];

  document.getElementById('sage-welcome')?.remove();
  const container = document.getElementById('sage-msgs');
  container.innerHTML = '';

  sageMessages.forEach((m, idx) => container.appendChild(makeSageMsgEl(m, idx)));
  scrollToBottom('sage-msgs');

  document.getElementById('sage-status').textContent =
    `${Math.floor(sageMessages.length/2)} exchanges`;

  renderSageChatList();
  clearSageImg();
}
window.loadSageChat = loadSageChat;

function makeSageMsgEl(m, index) {
  const el = document.createElement('div');
  el.className = `sage-msg-row ${m.role === 'user' ? 'sage-own' : 'sage-bot'} msg-appear`;
  if (index !== undefined) el.dataset.msgIndex = index;

  // Avatar
  let avHtml = '';
  if (m.role === 'user') {
    const u = state.user;
    if (u) {
      const bg = esc(u.profile_color || u.profileColor || '#555');
      if (u.profile_picture || u.profilePicture) {
        const src = esc(u.profile_picture || u.profilePicture);
        avHtml = `<div class="av xs" style="background:${bg}"><img src="${src}" onerror="this.remove();this.parentNode.textContent='${initials(u)}'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`;
      } else {
        avHtml = `<div class="av xs" style="background:${bg}">${initials(u)}</div>`;
      }
    }
  } else {
    avHtml = `<img src="assets/sage-logo.png" class="av xs rotating" style="object-fit:cover">`;
  }

  // Image inside bubble (if message has an attached image)
  const imageHtml = m.image 
    ? `<div class="sage-msg-img-wrap"><img src="${esc(m.image)}" class="sage-msg-img" onclick="openImgViewer(${onclickStr(m.image)})" alt="Attached image" loading="lazy"></div>` 
    : '';

  // Action buttons — shown on hover for all messages, but retry only for assistant
  let actionButtons = '';
  if (index !== undefined) {
    if (m.role === 'assistant') {
      actionButtons = `
        <div class="sage-msg-actions">
          <button class="sage-action-btn" onclick="retryMessage(${index})" title="Regenerate response">
            <i class="fa fa-rotate-right"></i> Retry
          </button>
          <button class="sage-action-btn danger" onclick="deleteSageMessage(${index})" title="Delete message">
            <i class="fa fa-trash"></i> Delete
          </button>
        </div>`;
    } else {
      actionButtons = `
        <div class="sage-msg-actions">
          <button class="sage-action-btn danger" onclick="deleteSageMessage(${index})" title="Delete message">
            <i class="fa fa-trash"></i> Delete
          </button>
        </div>`;
    }
  }

  el.innerHTML = `
    ${avHtml}
    <div class="sage-msg-body">
      <div class="sage-bubble ${m.role === 'user' ? 'user' : ''}">
        <div class="sage-bubble-text">${formatSageText(m.content)}</div>
        ${imageHtml}
      </div>
      ${actionButtons}
    </div>`;

  return el;
}

function showSageWelcome() {
  activeSageChatId = null;
  activeSageChatObj = null;
  sageMessages = [];

  const container = document.getElementById('sage-msgs');

  container.innerHTML = `
    <div class="sage-welcome" id="sage-welcome">
      <img src="assets/sage-logo.png" class="sage-welcome-icon rotating" alt="">
      <h3>Hey, I'm Sage 👋</h3>
      <p>Your bold, witty, and actually helpful AI companion. Ask me anything — no boring answers, I promise.</p>
      <div class="sage-chips">
        <button class="sage-chip" onclick="insertSagePrompt('Tell me everything about Kat Chat')"><i class="fa fa-info-circle"></i> About Kat-Chat</button>
        <button class="sage-chip" onclick="insertSagePrompt('How do I change my password on KatChat?')"><i class="fa fa-key"></i> Change password</button>
        <button class="sage-chip" onclick="insertSagePrompt('What are the rules and features of KatChat?')"><i class="fa fa-book"></i> How KatChat works</button>
        <button class="sage-chip" onclick="insertSagePrompt('How do I contact the owner of KatChat?')"><i class="fa fa-envelope"></i> Contact owner</button>
        <button class="sage-chip" onclick="document.getElementById('sage-img-input').click()"><i class="fa fa-image"></i> Analyze image</button>
        <button class="sage-chip" onclick="insertSagePrompt('Tell me something interesting')"><i class="fa fa-lightbulb"></i> Inspire me</button>
      </div>
    </div>`;

  document.getElementById('sage-status').textContent = 'AI Assistant';
  clearSageImg();
}

function toggleSagePanel() {
  sagePanelOpen = !sagePanelOpen;
  document.getElementById('sage-side-panel')
    ?.classList.toggle('open', sagePanelOpen);
}
window.toggleSagePanel = toggleSagePanel;

function closeSagePanel() {
  sagePanelOpen = false;
  document.getElementById('sage-side-panel')
    ?.classList.remove('open');
}

function insertSagePrompt(text) {
  const inp = document.getElementById('sage-input');
  inp.value = text;
  inp.focus();
}
window.insertSagePrompt = insertSagePrompt;

function sageKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendSage();
    return;
  }
  autoResize(e.target);
}
window.sageKey = sageKey;

// ── Check daily image upload limit ───────────────────────────
async function checkImageUploadLimit() {
  try {
    const { remaining, limit } = await api.getImageUploadLimit();
    if (remaining <= 0) {
      showToast(`Daily image limit reached (${limit}/day). Resets at midnight.`, 'error');
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Could not check image limit:', err.message);
    return true; // allow if check fails
  }
}

// ── Increment daily image upload count ───────────────────────
async function incrementImageUploadCount() {
  try {
    await api.incrementImageUpload();
  } catch (err) {
    console.warn('Could not increment image count:', err.message);
  }
}

function generateChatTitle(text) {
  if (!text) return 'New Chat';
  const t = text.trim();
  const lower = t.toLowerCase();

  // Single word: map common greetings/simple inputs to contextual titles
  if (!t.includes(' ') && t.length <= 20) {
    const map = {
      'hi':'Greetings','hello':'Greetings','hey':'Greetings','yo':'Greetings',
      'sup':'Greetings','howdy':'Greetings','hiya':'Greetings','heyo':'Greetings',
      'bye':'Farewell','goodbye':'Farewell','cya':'Farewell','later':'Farewell',
      'thanks':'Thanks','ty':'Thanks','thankyou':'Thanks','thx':'Thanks',
      'ok':'OK','okay':'OK','k':'OK','kk':'OK','lol':'Fun Chat','lmao':'Fun Chat',
      'nice':'Nice','cool':'Cool','wow':'Wow','omg':'Wow',
      'help':'Help Request','test':'Testing','yes':'Affirmative','no':'Negative',
      'maybe':'Maybe','sure':'Sure','idk':'Not Sure','random':'Random Chat',
      'hmm':'Thinking','huh':'Curiosity','really':'Curiosity',
    };
    if (map[lower]) return map[lower];
  }

  // Step 1: Strip leading question/command prefixes to expose the core topic
  const prefixes = [
    /^(?:can|could|would|will|do|does)\s+(?:you\s+)?(?:please\s+)?(?:help\s+(?:me\s+)?(?:with\s+)?)?/i,
    /^(?:what|where|when|why|how|who)\s+(?:is|are|was|were|does|do|can|would|should|will|did)\s+/i,
    /^how\s+to\s+/i,
    /^(?:what|where|when|why|how|who)\s+/i,
    /^(?:explain|describe|define)\s+/i,
    /^tell\s+(?:me\s+)?(?:about\s+|more\s+(?:about\s+)?)?/i,
    /^help\s+(?:me\s+)?(?:with\s+)?(?:to\s+)?/i,
    /^(?:i\s+)?(?:want|need|would\s+like)\s+(?:to\s+|help\s+(?:with\s+)?)?/i,
    /^show\s+(?:me\s+)?/i,
    /^give\s+(?:me\s+)?/i,
    /^write\s+(?:me\s+)?(?:a|an|the)\s+/i,
    /^make\s+(?:me\s+)?(?:a|an|the)\s+/i,
    /^create\s+(?:a|an|the)\s+/i,
  ];

  let core = t;
  for (const p of prefixes) {
    const stripped = core.replace(p, '').trim();
    if (stripped && stripped.length < core.length) { core = stripped; break; }
  }

  // Step 2: Strip leading articles
  core = core.replace(/^(?:a|an|the)\s+/i, '').trim();

  // Step 3: Remove trailing punctuation
  core = core.replace(/[?!.,;:]+$/, '').trim();

  // Step 4: If we have a meaningful core, clean and return it
  if (core && core.length >= 3) {
    // Capitalize first letter
    let title = core.charAt(0).toUpperCase() + core.slice(1);
    // Truncate at 42 chars on word boundary
    if (title.length > 42) {
      const brk = title.lastIndexOf(' ', 42);
      if (brk > 12) title = title.substring(0, brk);
      else title = title.substring(0, 42);
      title = title.replace(/[,;:\s]+$/, '');
    }
    return title;
  }

  // Step 5: Fallback — extract 2-4 meaningful words skipping stop words
  const words = t.split(/\s+/).filter(w => w.length > 0);
  const stopWords = new Set([
    'a','an','the','is','are','was','were','to','of','in','for','on','with',
    'at','by','from','and','or','but','can','do','does','did','has','have',
    'had','will','would','could','should','may','might','am','be','been',
    'being','it','its','that','this','these','those','i','my','me','we',
    'our','you','your','he','she','they','him','his','her','them','their',
    'what','which','who','whom','how','when','where','why','if','then',
    'else','not','no','nor','just','also','very','too','so','up','out',
    'about','into','over','after','before','between','under','again',
    'further','once','here','there','all','each','every','both','few',
    'more','most','other','some','such','only','own','same','please',
  ]);

  let start = 0;
  while (start < words.length && stopWords.has(words[start].toLowerCase())) start++;
  const contentWords = words.slice(start, start + 4);
  if (contentWords.length >= 2) {
    return (contentWords[0].charAt(0).toUpperCase()+contentWords[0].slice(1)+' '+contentWords.slice(1).join(' ')).substring(0, 50);
  }

  // Ultimate fallback: first 4 words
  return (words[0]?.charAt(0)?.toUpperCase()+words[0]?.slice(1)||'')+(words.length > 1 ? ' '+words.slice(1,4).join(' ') : '').substring(0, 50) || 'New Chat';
}

async function sendSage() {
  const input = document.getElementById('sage-input');
  const content = input.value.trim();

  if (!content && !sageImageBase64) {
    console.warn('No message or image to send');
    return;
  }

  // Check daily image limit BEFORE sending
  if (sageImageBase64) {
    const canUpload = await checkImageUploadLimit();
    if (!canUpload) {
      clearSageImg();
      return;
    }
  }

  input.value = '';
  autoResize(input);

  const container = document.getElementById('sage-msgs');

  // Remove welcome if exists
  document.getElementById('sage-welcome')?.remove();

  // Build user message — include image data URL for display in bubble
  const userMsg = { 
    role: 'user', 
    content: content || '(Image analysis)',
    image: sageImageDataUrl || null  // Store full data URL for display
  };
  sageMessages.push(userMsg);

  container.appendChild(makeSageMsgEl(userMsg, sageMessages.length - 1));
  scrollToBottom('sage-msgs');

  // Capture image data before clearing
  const capturedBase64 = sageImageBase64;
  const capturedMime = sageImageMime;
  const capturedDataUrl = sageImageDataUrl;
  
  // Clear image preview immediately after capturing
  clearSageImg();

  // Increment image upload count if image attached
  if (capturedBase64) {
    incrementImageUploadCount();
  }

  // Show thinking indicator
  const thinkingEl = document.createElement('div');
  thinkingEl.className = 'sage-msg-row sage-bot msg-appear';
  thinkingEl.id = 'sage-thinking';
  thinkingEl.innerHTML = `
    <img src="assets/sage-logo.png" class="av xs rotating" style="object-fit:cover">
    <div class="sage-msg-body">
      <div class="sage-bubble sage-thinking-bubble">
        <div class="typing-dots"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  container.appendChild(thinkingEl);
  scrollToBottom('sage-msgs');

  try {
    const { content: reply } =
      await api.chatSage(sageMessages.slice(-10), capturedBase64, capturedMime, activeSageChatId);

    // Remove thinking indicator
    document.getElementById('sage-thinking')?.remove();

    const botMsg = { role: 'assistant', content: reply };
    sageMessages.push(botMsg);

    container.appendChild(makeSageMsgEl(botMsg, sageMessages.length - 1));
    scrollToBottom('sage-msgs');

    // ── 20-message retention: trim oldest 5 locally if > 20 ──
    if (sageMessages.length > 20) {
      sageMessages.splice(0, 5);
      // Re-render all messages
      container.innerHTML = '';
      sageMessages.forEach((m, idx) => container.appendChild(makeSageMsgEl(m, idx)));
      scrollToBottom('sage-msgs');
    }

    // Save or create chat
    if (activeSageChatId) {
      // Update existing chat
      activeSageChatObj = {
        ...activeSageChatObj,
        messages: sageMessages,
        preview: sageMessages[sageMessages.length - 2]?.content?.substring(0, 50) || '',
        updated_at: new Date().toISOString()
      };
      await api.saveSageChat(activeSageChatObj);
    } else {
      // Create new chat with placeholder title
      const chat = {
        id: Date.now().toString(),
        title: 'New Chat',
        preview: sageMessages[sageMessages.length - 2]?.content?.substring(0, 50) || '',
        messages: sageMessages,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      activeSageChatId = chat.id;
      activeSageChatObj = chat;
      await api.saveSageChat(chat);
      sageChats.push(chat);
      renderSageChatList();
      // Generate AI title (fire-and-forget after first reply)
      generateSageTitleForChat(chat, sageMessages[0]?.content || '', reply);
    }

    document.getElementById('sage-status').textContent =
      `${Math.floor(sageMessages.length/2)} exchanges`;

  } catch (err) {
    // If the server is unreachable (network down / 5xx), surface Sage's
    // friendly maintenance message rather than a raw error. The backend
    // already returns this message in the normal success path when both
    // providers fail, so this only covers transport-level failures.
    // 429s are user-visible (daily limit / busy) — show the real message.
    console.error('Error sending message to Sage:', err);
    document.getElementById('sage-thinking')?.remove();
    const errorMsg = {
      role: 'assistant',
      content: err.status === 429
        ? (err.message || 'Sage is busy right now. Please wait a moment and try again.')
        : '⚠️ Sage is currently under maintenance. Please try again in a few minutes.'
    };
    sageMessages.push(errorMsg);
    container.appendChild(makeSageMsgEl(errorMsg, sageMessages.length - 1));
    scrollToBottom('sage-msgs');
  }
}
window.sendSage = sendSage;

// ── AI title generation ──────────────────────────────────────
async function generateSageTitleForChat(chat, userMessage, assistantReply) {
  if (!chat || chat.title && chat.title !== 'New Chat') return;
  try {
    const { title } = await api.generateSageTitle(userMessage, assistantReply);
    if (title && title.length >= 2 && title.length <= 60) {
      chat.title = title;
      if (activeSageChatObj?.id === chat.id) activeSageChatObj.title = title;
      await api.saveSageChat(chat);
      renderSageChatList();
    }
  } catch (_) { /* keep 'New Chat' on failure */ }
}

// Delete a Sage message and its paired response
async function deleteSageMessage(index) {
  if (!activeSageChatId) {
    showToast('Save the chat first by sending a message', 'info');
    return;
  }
  try {
    // Determine what to delete: if user msg, also delete following assistant msg
    // If assistant msg, also delete preceding user msg
    let startIndex = index;
    if (sageMessages[index]?.role === 'assistant' && index > 0 && sageMessages[index - 1]?.role === 'user') {
      startIndex = index - 1; // delete user msg too
    }
    
    await api.deleteSageMessage(activeSageChatId, startIndex);
    
    // Remove from local state
    sageMessages.splice(startIndex, 1); // remove first message
    if (sageMessages[startIndex]?.role === 'assistant' || sageMessages[startIndex]?.role === 'user') {
      sageMessages.splice(startIndex, 1); // remove paired message
    }
    
    // Re-render
    const container = document.getElementById('sage-msgs');
    container.innerHTML = '';
    sageMessages.forEach((m, idx) => container.appendChild(makeSageMsgEl(m, idx)));
    scrollToBottom('sage-msgs');
    showToast('Message deleted', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
window.deleteSageMessage = deleteSageMessage;

// Regenerate the response to a message
async function retryMessage(index) {
  if (!activeSageChatId && sageMessages.length === 0) return;
  
  try {
    // index points to the assistant message — remove it and resend
    if (!sageMessages[index] || sageMessages[index].role !== 'assistant') {
      showToast('Can only retry an assistant response', 'error');
      return;
    }
    
    // Remove the assistant's response from local state
    sageMessages.splice(index, 1);
    
    // Re-render to show the removed response
    const container = document.getElementById('sage-msgs');
    container.innerHTML = '';
    sageMessages.forEach((m, idx) => container.appendChild(makeSageMsgEl(m, idx)));
    scrollToBottom('sage-msgs');

    // Show thinking indicator
    const thinkingEl = document.createElement('div');
    thinkingEl.className = 'sage-msg-row sage-bot msg-appear';
    thinkingEl.id = 'sage-thinking';
    thinkingEl.innerHTML = `
      <img src="assets/sage-logo.png" class="av xs rotating" style="object-fit:cover">
      <div class="sage-msg-body">
        <div class="sage-bubble sage-thinking-bubble">
          <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>`;
    container.appendChild(thinkingEl);
    scrollToBottom('sage-msgs');
    
    // Send again with remaining messages
    const messagesForSage = sageMessages.slice(-10);
    const { content: reply } = await api.chatSage(messagesForSage, null, null, activeSageChatId);
    
    document.getElementById('sage-thinking')?.remove();
    
    // Add new response
    const botMsg = { role: 'assistant', content: reply };
    sageMessages.push(botMsg);
    container.appendChild(makeSageMsgEl(botMsg, sageMessages.length - 1));
    scrollToBottom('sage-msgs');
    
    // Save updated chat
    if (activeSageChatObj) {
      activeSageChatObj.messages = sageMessages;
      activeSageChatObj.updated_at = new Date().toISOString();
      await api.saveSageChat(activeSageChatObj);
    }
    
    showToast('Response regenerated', 'success');
  } catch (err) {
    document.getElementById('sage-thinking')?.remove();
    showToast(err.message || 'Failed to regenerate', 'error');
  }
}
window.retryMessage = retryMessage;

function formatSageText(text) {
  if (!text) return '';
  // Escape HTML, then convert newlines to <br>, bold **text**, code `text`
  return esc(text)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg3);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>');
}

// Image handling
function handleSageImg(input) {
  const file = input.files?.[0];
  if (!file) return;

  // Check file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    showToast('Image must be under 10MB', 'error');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const dataUrl = e.target?.result;
      if (!dataUrl) return;

      // Extract base64 part (remove "data:image/jpeg;base64," prefix)
      const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      
      sageImageBase64 = base64Part;
      sageImageMime = file.type || 'image/jpeg';
      sageImageDataUrl = dataUrl; // Store full data URL for display

      // Display preview with full data URL
      const preview = document.getElementById('sage-preview-img');
      const previewContainer = document.getElementById('sage-img-preview');
      if (preview && previewContainer) {
        preview.src = dataUrl;
        previewContainer.classList.remove('hidden');
      }
      
      console.log('Image loaded:', { mime: sageImageMime, size: base64Part.length });
    } catch (err) {
      console.error('Error processing image:', err);
    }
  };
  reader.onerror = (err) => {
    console.error('Error reading image file:', err);
  };
  reader.readAsDataURL(file);
}
window.handleSageImg = handleSageImg;

function clearSageImg() {
  sageImageBase64 = null;
  sageImageMime = null;
  sageImageDataUrl = null;
  const previewContainer = document.getElementById('sage-img-preview');
  if (previewContainer) {
    previewContainer.classList.add('hidden');
  }
  const input = document.getElementById('sage-img-input');
  if (input) {
    input.value = '';
  }
  const preview = document.getElementById('sage-preview-img');
  if (preview) preview.src = '';
}
window.clearSageImg = clearSageImg;

async function newSageChat() {
  showSageWelcome();
  renderSageChatList();
  const inp = document.getElementById('sage-input');
  if (inp) inp.focus();
}
window.newSageChat = newSageChat;

async function renameSageChat(chatId) {
  const chat = sageChats.find(c => c.id === chatId);
  if (!chat) return;
  const newTitle = prompt('Rename chat:', chat.title || 'Chat');
  if (!newTitle || newTitle.trim() === (chat.title || 'Chat')) return;
  const trimmed = newTitle.trim().substring(0, 50);
  try {
    chat.title = trimmed;
    await api.saveSageChat(chat);
    renderSageChatList();
    if (activeSageChatId === chatId && activeSageChatObj) {
      activeSageChatObj.title = trimmed;
    }
    showToast('Chat renamed', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
window.renameSageChat = renameSageChat;

async function deleteSageChat(chatId) {
  try {
    await api.deleteSageChat(chatId);
    sageChats = sageChats.filter(c => c.id !== chatId);
    renderSageChatList();
    
    if (activeSageChatId === chatId) {
      showSageWelcome();
    }
  } catch (err) {
    console.error('Failed to delete Sage chat:', err);
    showToast('Failed to delete chat', 'error');
  }
}
window.deleteSageChat = deleteSageChat;

async function clearSageHistory() {
  if (!confirm('Delete all Sage chats? This cannot be undone.')) return;

  try {
    for (const chat of sageChats) {
      await api.deleteSageChat(chat.id);
    }
    sageChats = [];
    renderSageChatList();
    showSageWelcome();
    showToast('All chats cleared', 'info');
  } catch (err) {
    console.error('Failed to clear Sage history:', err);
    showToast('Failed to clear history', 'error');
  }
}
window.clearSageHistory = clearSageHistory;

} // end of __sage_initialized__ guard