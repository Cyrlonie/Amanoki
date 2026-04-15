// Messages: Supabase realtime, rendering, reactions, replies, send, upload, channel switch.
// Classic script. Uses globals from state/config/auth/presence and main.js (notify, escHtml, escapeJsString, formatTime, scrollToBottom, autoResize, playNotificationSound, getUserColor, deleteMessage, isAdmin).

function unreadStorageKey() {
  return `amanoki_lastRead_${authUser?.id || 'anon'}`;
}

function loadLastReadMap() {
  try {
    const raw = localStorage.getItem(unreadStorageKey());
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch (_) {
    return {};
  }
}

function saveLastReadMap(map) {
  try {
    localStorage.setItem(unreadStorageKey(), JSON.stringify(map));
  } catch (_) {}
}

function markChannelReadTimestamp(ch, iso) {
  if (!TEXT_CHANNELS.includes(ch)) return;
  const map = loadLastReadMap();
  const t = iso || new Date().toISOString();
  if (map[ch] && new Date(t) <= new Date(map[ch])) {
    unreadCounts[ch] = 0;
    updateChannelUnreadUI();
    return;
  }
  map[ch] = t;
  saveLastReadMap(map);
  unreadCounts[ch] = 0;
  updateChannelUnreadUI();
}

function bumpUnread(ch) {
  if (!TEXT_CHANNELS.includes(ch) || ch === currentChannel) return;
  unreadCounts[ch] = (unreadCounts[ch] || 0) + 1;
  updateChannelUnreadUI();
}

async function refreshUnreadCountsFromServer() {
  if (isDemoMode || !supabase || !authUser) return;
  const map = loadLastReadMap();
  for (const ch of TEXT_CHANNELS) {
    if (ch === currentChannel) {
      unreadCounts[ch] = 0;
      continue;
    }
    const since = map[ch];
    if (!since) {
      if (unreadCounts[ch] === undefined) unreadCounts[ch] = 0;
      continue;
    }
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel', ch)
      .gt('created_at', since);
    if (error) {
      console.warn('Unread count', ch, error);
      continue;
    }
    unreadCounts[ch] = count ?? 0;
  }
  updateChannelUnreadUI();
}

function updateChannelUnreadUI() {
  TEXT_CHANNELS.forEach((ch) => {
    const item = document.querySelector(`.channel-item[data-channel="${ch}"]`);
    if (!item) return;
    let badge = item.querySelector('.unread-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'unread-badge';
      item.appendChild(badge);
    }
    const n = unreadCounts[ch] || 0;
    if (n <= 0) {
      badge.textContent = '';
      badge.style.display = 'none';
    } else {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.style.display = '';
    }
  });
}

// ===================== SUPABASE REALTIME =====================
async function subscribeToMessages() {
  if (!supabase && !isDemoMode) return;
  if (isDemoMode) return;

  try {
    if (messageSubscription) {
      await supabase.removeChannel(messageSubscription);
      messageSubscription = null;
    }
    if (presenceChannel) {
      await supabase.removeChannel(presenceChannel);
      presenceChannel = null;
    }
    if (reactionSubscription) {
      await supabase.removeChannel(reactionSubscription);
      reactionSubscription = null;
    }

    // Load previous messages
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel', currentChannel)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      notify('Ошибка загрузки сообщений: ' + error.message, 'error');
      return;
    }

    if (data) {
      data.forEach((r) =>
        renderMessage({
          id: r.id,
          author: r.author,
          text: r.content,
          created: r.created_at,
          user_id: r.user_id,
          image_url: r.image_url,
          reply_to: r.reply_to,
        })
      );
      await loadReactionsForMessages(data.map((r) => r.id));
    }

    const latestIso =
      data && data.length > 0 ? data[data.length - 1].created_at : new Date().toISOString();
    markChannelReadTimestamp(currentChannel, latestIso);
    await refreshUnreadCountsFromServer();

    await loadMembersDirectory();

    // Subscribe to realtime updates
    messageSubscription = supabase
      .channel('messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new;
        const ch = row.channel;
        if (!TEXT_CHANNELS.includes(ch)) return;

        if (ch === currentChannel) {
          const isOwnMessage = row.user_id === authUser.id;

          renderMessage({
            id: row.id,
            author: row.author,
            text: row.content,
            created: row.created_at,
            user_id: row.user_id,
            image_url: row.image_url,
            reply_to: row.reply_to,
          });
          scrollToBottom();
          markChannelReadTimestamp(ch, row.created_at);

          if (!windowHasFocus && !isOwnMessage) {
            playNotificationSound();
          }
        } else if (row.user_id !== authUser.id) {
          bumpUnread(ch);
          if (!windowHasFocus) {
            playNotificationSound();
          }
        }
      })
      .subscribe();

    reactionSubscription = supabase
      .channel(`reactions:${currentChannel}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, async () => {
        const ids = [...document.querySelectorAll('.message-group[data-id]')].map((el) => el.dataset.id);
        if (!ids.length) return;
        await loadReactionsForMessages(ids);
      })
      .subscribe();

    presenceChannel = supabase.channel(`presence:${currentChannel}`, {
      config: {
        presence: {
          key: authUser.id,
        },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => applyPresenceFromChannel())
      .on('presence', { event: 'join' }, () => applyPresenceFromChannel())
      .on('presence', { event: 'leave' }, () => applyPresenceFromChannel())
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && presenceChannel) {
          try {
            // Показываем себя онлайн сразу, не дожидаясь sync
            if (currentUser) {
              members[currentUser] = 'online';
              updateMemberList();
              updateOnlineCount();
            }
            await presenceChannel.track({
              user_id: authUser.id,
              username: currentUser,
              channel: currentChannel,
              typing: false,
            });
            applyPresenceFromChannel();
            // На некоторых сетапах sync приходит чуть позже
            setTimeout(applyPresenceFromChannel, 500);
          } catch (e) {
            console.error('Presence track error:', e);
          }
        }
      });
  } catch (e) {
    notify('Ошибка подписки: ' + e.message, 'error');
  }
}

function clearReactionStore() {
  Object.keys(reactionStore).forEach((key) => delete reactionStore[key]);
}

function ensureMessageReactionStore(messageId) {
  if (!reactionStore[messageId]) {
    reactionStore[messageId] = {};
  }
  return reactionStore[messageId];
}

function renderReactionBar(messageId) {
  const group = document.querySelector(`.message-group[data-id="${messageId}"]`);
  if (!group) return;
  const chipsEl = group.querySelector('.msg-reaction-chips');
  const quickEl = group.querySelector('.msg-quick-actions');
  if (!chipsEl || !quickEl) return;

  const messageReactions = ensureMessageReactionStore(messageId);
  const currentUserId = authUser?.id || 'demo-user';

  const chips = Object.entries(messageReactions)
    .filter(([_, users]) => users && users.length > 0)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([emoji, users]) => {
      const active = users.includes(currentUserId) ? ' active' : '';
      const safeEmoji = escapeJsString(emoji);
      return `<button class="reaction${active}" type="button" data-action="toggle-reaction" data-message-id="${escapeJsString(
        messageId
      )}" data-emoji="${safeEmoji}">${emoji} <span class="count">${users.length}</span></button>`;
    })
    .join('');

  const safeMessageId = escapeJsString(messageId);
  chipsEl.innerHTML = chips;

  const adminBtn = isAdmin
    ? `<button class="hover-btn" type="button" title="Удалить" data-action="delete-message" data-message-id="${escapeJsString(
        messageId
      )}" style="color:var(--red);">🗑️</button>`
    : '';
  quickEl.innerHTML = `${adminBtn}
      <button class="reaction msg-quick-btn" type="button" title="Добавить реакцию" data-action="open-reaction-picker" data-message-id="${safeMessageId}">➕</button>
      <button class="reaction msg-quick-btn" type="button" title="Ответить" data-action="start-reply" data-message-id="${safeMessageId}">↩</button>`;
}

function renderAllReactionBars() {
  document
    .querySelectorAll('.message-group[data-id]')
    .forEach((group) => renderReactionBar(group.dataset.id));
}

function closeReactionPicker() {
  const picker = document.getElementById('reactionPicker');
  if (!picker) return;
  picker.classList.remove('show');
  picker.innerHTML = '';
  picker.setAttribute('aria-hidden', 'true');
  reactionPickerMessageId = null;
}

function positionReactionPicker(anchorEl) {
  const picker = document.getElementById('reactionPicker');
  if (!picker || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const pickerWidth = picker.offsetWidth || 260;
  const pickerHeight = picker.offsetHeight || 44;
  const gap = 8;

  let left = rect.left + rect.width / 2 - pickerWidth / 2;
  let top = rect.top - pickerHeight - gap;

  if (left < 8) left = 8;
  if (left + pickerWidth > window.innerWidth - 8)
    left = window.innerWidth - pickerWidth - 8;
  if (top < 8) top = rect.bottom + gap;
  if (top + pickerHeight > window.innerHeight - 8)
    top = window.innerHeight - pickerHeight - 8;

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
}

async function loadReactionsForMessages(messageIds) {
  if (!messageIds || messageIds.length === 0) return;
  clearReactionStore();

  if (isDemoMode) {
    messageIds.forEach((id) => ensureMessageReactionStore(id));
    renderAllReactionBars();
    return;
  }

  if (!supabase) return;

  const { data, error } = await supabase
    .from('reactions')
    .select('message_id,user_id,emoji')
    .in('message_id', messageIds);

  if (error) {
    console.error('Ошибка загрузки реакций:', error);
    return;
  }

  messageIds.forEach((id) => ensureMessageReactionStore(id));
  (data || []).forEach((row) => {
    const msgStore = ensureMessageReactionStore(row.message_id);
    if (!msgStore[row.emoji]) msgStore[row.emoji] = [];
    msgStore[row.emoji].push(row.user_id);
  });

  renderAllReactionBars();
}

async function sendToSupabase(text, imageUrl = null) {
  if (!supabase) return false;
  if (!authUser) {
    notify('Требуется авторизация', 'error');
    return false;
  }

  try {
    const payload = {
      author: currentUser,
      content: text,
      channel: currentChannel,
      user_id: authUser.id,
      created_at: new Date().toISOString(),
    };

    if (replyToMessageId) {
      payload.reply_to = replyToMessageId;
    }

    if (imageUrl) {
      payload.image_url = imageUrl;
    }

    const { error } = await supabase.from('messages').insert(payload);

    if (error) throw error;
    return true;
  } catch (e) {
    notify('Ошибка отправки: ' + e.message, 'error');
    return false;
  }
}

function snippetFromHtml(htmlOrText) {
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(htmlOrText || '');
    return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  } catch (_) {
    return String(htmlOrText || '').replace(/\s+/g, ' ').trim();
  }
}

function startReply(messageId) {
  replyToMessageId = messageId;
  const msg = messageStore[messageId];
  const previewEl = document.getElementById('replyBannerPreview');
  const banner = document.getElementById('replyBanner');
  if (!banner || !previewEl) return;
  const author = msg?.author || 'Сообщение';
  const snip = snippetFromHtml(msg?.text || '').slice(0, 120);
  previewEl.textContent = `${author}: ${snip || '(без текста)'}`;
  banner.classList.add('show');
  document.getElementById('message-input')?.focus();
}

function cancelReply() {
  replyToMessageId = null;
  const banner = document.getElementById('replyBanner');
  if (banner) banner.classList.remove('show');
}

function scrollToMessage(messageId) {
  const el = document.querySelector(`.message-group[data-id="${messageId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.style.outline = '2px solid rgba(192, 132, 252, 0.55)';
  el.style.outlineOffset = '4px';
  setTimeout(() => {
    el.style.outline = '';
    el.style.outlineOffset = '';
  }, 1200);
}

// ===================== MESSAGE RENDERING =====================
function renderMessage(record) {
  const area = document.getElementById('messagesArea');
  const author = record.author || 'Unknown';
  const text = record.text || '';
  const time = new Date(record.created);

  // Проверяем, нужно ли группировать сообщения (если автор тот же и прошло меньше 5 минут)
  const isConsecutive =
    lastMessageAuthor === author &&
    lastMessageTime &&
    time - lastMessageTime < 5 * 60 * 1000;

  const group = document.createElement('div');
  group.className = 'message-group' + (isConsecutive ? '' : ' with-header');
  group.dataset.id = record.id; // Важно для реакций и удаления

  const color = getUserColor(author);

  // --- ОБРАБОТКА MARKDOWN ---
  marked.setOptions({ breaks: true });
  const cleanHtml = DOMPurify.sanitize(marked.parse(text));

  // cache для ответов
  messageStore[record.id] = {
    id: record.id,
    author,
    text,
    created: record.created,
    reply_to: record.reply_to || null,
  };

  const replyTo = record.reply_to ? messageStore[record.reply_to] : null;
  const replyBlock = record.reply_to
    ? `<button class="reply-preview" type="button" data-action="scroll-to-message" data-message-id="${escapeJsString(
        record.reply_to
      )}">
           <span>↩</span>
           <span class="reply-author">${escHtml(replyTo?.author || 'Сообщение')}</span>
           <span class="reply-snippet">${escHtml(
             (snippetFromHtml(replyTo?.text || '') || '(без текста)').slice(0, 140)
           )}</span>
         </button>`
    : '';

  if (!isConsecutive) {
    group.innerHTML = `
        <div class="msg-avatar" style="background:${color}">${author[0].toUpperCase()}</div>
        <div class="content-area">
          <div class="msg-stack">
            <div class="message-header">
              <span class="msg-author" style="color:${color}">${escHtml(author)}</span>
              <span class="msg-timestamp">${formatTime(time)}</span>
            </div>
            ${replyBlock}
            <div class="msg-text">${cleanHtml}</div>
            ${
              record.image_url
                ? `<img class="msg-image" src="${record.image_url}" data-action="open-image-preview" alt="Изображение в сообщении">`
                : ''
            }
            <div class="msg-reaction-chips"></div>
          </div>
          <div class="msg-aside">
            <div class="msg-quick-actions"></div>
          </div>
        </div>`;
  } else {
    group.innerHTML = `
        <div class="msg-avatar compact" style="background:${color}; opacity:0">${author[0].toUpperCase()}</div>
        <div class="content-area">
          <div class="msg-stack">
            ${replyBlock}
            <div class="msg-text compact">${cleanHtml}</div>
            ${
              record.image_url
                ? `<img class="msg-image" src="${record.image_url}" data-action="open-image-preview" alt="Изображение в сообщении">`
                : ''
            }
            <div class="msg-reaction-chips"></div>
          </div>
          <div class="msg-aside">
            <div class="msg-quick-actions"></div>
          </div>
        </div>`;
  }

  area.appendChild(group);
  ensureMessageReactionStore(record.id);
  renderReactionBar(record.id);
  lastMessageAuthor = author;
  lastMessageTime = time;
  scrollToBottom();
}

async function openReactionPicker(messageId, triggerEl, event) {
  if (event) event.stopPropagation();
  const picker = document.getElementById('reactionPicker');
  if (!picker) return;

  if (reactionPickerMessageId === messageId && picker.classList.contains('show')) {
    closeReactionPicker();
    return;
  }

  reactionPickerMessageId = messageId;
  picker.innerHTML = REACTION_EMOJIS.map(
    (emoji) =>
      `<button class="reaction-picker-btn" type="button" data-action="pick-reaction" data-message-id="${escapeJsString(
        messageId
      )}" data-emoji="${escapeJsString(emoji)}">${emoji}</button>`
  ).join('');

  picker.classList.add('show');
  picker.setAttribute('aria-hidden', 'false');
  positionReactionPicker(triggerEl);
}

async function pickReaction(messageId, emoji, event) {
  if (event) event.stopPropagation();
  await toggleReaction(messageId, emoji);
  closeReactionPicker();
}

async function toggleReaction(messageId, emoji) {
  const userId = authUser?.id || 'demo-user';
  const msgStore = ensureMessageReactionStore(messageId);
  if (!msgStore[emoji]) msgStore[emoji] = [];
  const hasOwnReaction = msgStore[emoji].includes(userId);

  if (isDemoMode) {
    msgStore[emoji] = hasOwnReaction
      ? msgStore[emoji].filter((id) => id !== userId)
      : [...msgStore[emoji], userId];
    if (msgStore[emoji].length === 0) delete msgStore[emoji];
    renderReactionBar(messageId);
    return;
  }

  if (!supabase || !authUser) return;

  try {
    if (hasOwnReaction) {
      const { error } = await supabase
        .from('reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', authUser.id)
        .eq('emoji', emoji);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('reactions').insert({
        message_id: messageId,
        user_id: authUser.id,
        emoji,
      });
      if (error) throw error;
    }

    await loadReactionsForMessages([messageId]);
  } catch (err) {
    console.error('Ошибка переключения реакции:', err);
    notify('Не удалось обновить реакцию', 'error');
  }
}

// ===================== FILE UPLOAD =====================
async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (isDemoMode) {
    notify('Загрузка файлов в демо-режиме недоступна', 'info');
    return;
  }

  if (!supabase) {
    notify('Подключитесь к Supabase для загрузки файлов', 'error');
    return;
  }

  isUploadingFile = true;
  notify(`📤 Загружаю ${file.name}...`);

  try {
    // Генерируем уникальное имя файла
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileExt = file.name.split('.').pop();
    const fileName = `${timestamp}-${randomStr}.${fileExt}`;
    const filePath = `${currentChannel}/${fileName}`;

    // Загружаем файл в Storage
    const { error } = await supabase.storage.from('chat-media').upload(filePath, file);

    if (error) throw error;

    // Получаем публичный URL
    const {
      data: { publicUrl },
    } = supabase.storage.from('chat-media').getPublicUrl(filePath);

    // Отправляем сообщение с ссылкой
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    const isMediaFile = file.type.startsWith('image/') || file.type.startsWith('video/');
    const messageText = text || (isMediaFile ? '' : file.name);
    input.value = '';
    autoResize(input);

    if (isDemoMode) {
      renderMessage({
        author: currentUser,
        text: messageText,
        image_url: publicUrl,
        created: new Date().toISOString(),
        id: 'local_' + Date.now(),
        user_id: 'demo',
        reply_to: replyToMessageId,
      });
    } else {
      const sent = await sendToSupabase(messageText, publicUrl);
      if (!sent) {
        renderMessage({
          author: currentUser,
          text: messageText,
          image_url: publicUrl,
          created: new Date().toISOString(),
          id: 'local_' + Date.now(),
          user_id: authUser.id,
          reply_to: replyToMessageId,
        });
      }
    }

    notify(`✅ Файл ${file.name} загружен!`);
    cancelReply();
    scrollToBottom();
  } catch (error) {
    notify(`❌ Ошибка загрузки: ${error.message}`, 'error');
    console.error('Upload error:', error);
  } finally {
    isUploadingFile = false;
    event.target.value = ''; // Очищаем input
  }
}

// ===================== SEND =====================
async function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  autoResize(input);

  if (isDemoMode) {
    renderMessage({
      author: currentUser,
      text,
      created: new Date().toISOString(),
      id: 'local_' + Date.now(),
      user_id: 'demo',
      reply_to: replyToMessageId,
    });
    simulateReply(text);
  } else {
    const sent = await sendToSupabase(text);
    if (!sent) {
      renderMessage({
        author: currentUser,
        text,
        created: new Date().toISOString(),
        id: 'local_' + Date.now(),
        user_id: authUser.id,
        reply_to: replyToMessageId,
      });
    }
  }
  cancelReply();
  scrollToBottom();
}

function simulateReply(userText) {
  const replies = [
    'Интересно!',
    'Понял, понял 👍',
    'Согласен полностью!',
    'Хм, надо подумать...',
    'Да ладно?! 😮',
    'Прикольно!',
    'Окей, буду иметь в виду',
    'Спасибо за инфу!',
    'Давай обсудим завтра?',
    '🔥🔥🔥',
    'Кайф',
    'Ты серьёзно? 😂',
  ];
  const bots = ['Алексей', 'Мария', 'Иван'];
  const bot = bots[Math.floor(Math.random() * bots.length)];

  showTyping(bot);
  setTimeout(() => {
    hideTyping();
    const reply = replies[Math.floor(Math.random() * replies.length)];
    renderMessage({
      author: bot,
      text: reply,
      created: new Date().toISOString(),
      id: 'bot_' + Date.now(),
      user_id: 'bot',
    });
  }, 1000 + Math.random() * 2000);
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function switchChannel(ch) {
  currentChannel = ch;
  document.querySelectorAll('.channel-item[data-channel]').forEach((el) => {
    el.classList.toggle('active', el.dataset.channel === ch);
  });
  document.getElementById('channelTitle').textContent = ch;
  document.getElementById('channelDesc').textContent = CHANNEL_DESCS[ch] || `Канал #${ch}`;
  document.getElementById('message-input').placeholder = `Написать в #${ch}`;

  const area = document.getElementById('messagesArea');
  area.innerHTML = `
      <div class="channel-welcome">
        <div class="welcome-icon">💬</div>
        <div class="welcome-title"># ${ch}</div>
        <div class="welcome-desc">${CHANNEL_DESCS[ch] || 'Начало канала #' + ch}</div>
      </div>
      <div class="divider-date">Сегодня</div>
    `;
  lastMessageAuthor = null;
  lastMessageTime = null;
  clearReactionStore();
  updateTypingIndicator();

  if (!isDemoMode && supabase) {
    subscribeToMessages();
  }

  if (isMobileLayout()) {
    closeMobilePanels();
  }
}
