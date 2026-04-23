// Messages: Supabase realtime, rendering, reactions, replies, send, upload, channel switch.
// Classic script. Uses globals from state/config/auth/presence and main.js (notify, escHtml, escapeJsString, formatTime, scrollToBottom, autoResize, playNotificationSound, getUserColor, deleteMessage, isAdmin).

let messageSubscriptionGeneration = 0;

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

  const generation = ++messageSubscriptionGeneration;

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

    if (generation !== messageSubscriptionGeneration) return;

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
          is_pinned: r.is_pinned,
        })
      );
      // Заполняем memberLastSeen из загруженных сообщений для fallback онлайн-счётчика
      data.forEach((r) => {
        if (r.user_id && r.created_at) {
          const ts = new Date(r.created_at).getTime();
          const prev = memberLastSeen[String(r.user_id)] || 0;
          if (ts > prev) memberLastSeen[String(r.user_id)] = ts;
        }
      });
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
        if (generation !== messageSubscriptionGeneration) return;
        const row = payload.new;
        const ch = row.channel;
        const isDM = typeof isDMChannel === 'function' && isDMChannel(ch);

        // Allow text channels and DM channels involving current user
        if (!isDM && !TEXT_CHANNELS.includes(ch)) return;
        if (isDM && !ch.includes(authUser?.id)) return;

        // Трекаем активность пользователя для fallback онлайн-счётчика
        if (row.user_id) {
          memberLastSeen[String(row.user_id)] = Date.now();
        }

        // Update DM conversation list
        if (isDM && typeof updateDMConversation === 'function') {
          updateDMConversation(ch, row.content, row.author);
        }

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
            is_pinned: row.is_pinned,
          });
          scrollToBottom();
          if (!isDM) markChannelReadTimestamp(ch, row.created_at);

          if (!windowHasFocus && !isOwnMessage) {
            playNotificationSound();
          }
        } else if (row.user_id !== authUser.id) {
          if (!isDM) bumpUnread(ch);
          if (!windowHasFocus) {
            playNotificationSound();
          }
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        if (generation !== messageSubscriptionGeneration) return;
        const messageId = payload.old?.id;
        if (!messageId) return;
        delete messageStore[messageId];
        delete reactionStore[messageId];
        document.querySelector(`.message-group[data-id="${messageId}"]`)?.remove();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        if (generation !== messageSubscriptionGeneration) return;
        const row = payload.new;
        const messageGroup = document.querySelector(`.message-group[data-id="${row.id}"]`);
        if (messageGroup) {
          messageGroup.classList.toggle('pinned-message', !!row.is_pinned);
          const textElement = messageGroup.querySelector('.msg-text');
          if (textElement && messageStore[row.id] && messageStore[row.id].text !== row.content) {
            marked.setOptions({ breaks: true });
            textElement.innerHTML = DOMPurify.sanitize(marked.parse(row.content));
          }
          if (messageStore[row.id]) {
            messageStore[row.id].text = row.content;
            messageStore[row.id].is_pinned = row.is_pinned;
          }
          renderReactionBar(row.id);
        }
      })
      .subscribe();

    reactionSubscription = supabase
      .channel(`reactions:${currentChannel}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, async () => {
        if (generation !== messageSubscriptionGeneration) return;
        const ids = [...document.querySelectorAll('.message-group[data-id]')].map((el) => el.dataset.id);
        if (!ids.length) return;
        await loadReactionsForMessages(ids);
      })
      .subscribe();

    presenceChannel = supabase.channel('presence:global', {
  config: {
    presence: {
      key: authUser.id,
    },
  },
});

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        if (generation !== messageSubscriptionGeneration) return;
        applyPresenceFromChannel();
      })
      .on('presence', { event: 'join' }, () => {
        if (generation !== messageSubscriptionGeneration) return;
        applyPresenceFromChannel();
      })
      .on('presence', { event: 'leave' }, () => {
        if (generation !== messageSubscriptionGeneration) return;
        applyPresenceFromChannel();
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (generation !== messageSubscriptionGeneration) return;
        if (typeof applyTypingBroadcast === 'function') {
          applyTypingBroadcast(payload);
        }
      })
      .subscribe(async (status) => {
        if (generation !== messageSubscriptionGeneration) return;
        if (status === 'SUBSCRIBED' && presenceChannel) {
          try {
            // Показываем себя онлайн сразу, не дожидаясь sync
            if (currentUser) {
              members[currentUser] = 'online';
              updateMemberList();
              updateOnlineCount();
            }
            if (typeof updateMyPresence === 'function') {
              await updateMyPresence(false);
            }
            // На некоторых сетапах sync приходит чуть позже
            setTimeout(() => {
              if (generation !== messageSubscriptionGeneration) return;
              applyPresenceFromChannel();
            }, 500);
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

function getMessageAvatarStyle(author, color) {
  const avatarUrl = userAvatars[author];
  if (avatarUrl) {
    return `background-image:url('${escapeJsString(avatarUrl)}'); color: transparent;`;
  }
  return `background:${color};`;
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

  const messageData = messageStore[messageId];
  const canDelete = isAdmin || (messageData && messageData.user_id === (authUser?.id || 'demo-user'));
  const deleteBtn = canDelete
    ? `<button class="hover-btn" type="button" title="Удалить" data-action="delete-message" data-message-id="${escapeJsString(
        messageId
      )}" style="color:var(--red);">🗑️</button>`
    : '';
  
  const canEdit = authUser && (messageData && messageData.user_id === authUser.id || isAdmin);
  const editBtn = canEdit
    ? `<button class="hover-btn" type="button" title="Редактировать" data-action="edit-message" data-message-id="${escapeJsString(
        messageId
      )}">✏️</button>`
    : '';

  const canPin = isAdmin || (messageData && messageData.user_id === (authUser?.id || 'demo-user'));
  const isPinned = messageData?.is_pinned;
  const pinBtn = canPin
    ? `<button class="hover-btn" type="button" title="${isPinned ? 'Открепить' : 'Закрепить'}" data-action="toggle-pin" data-message-id="${escapeJsString(
        messageId
      )}" style="${isPinned ? 'color: var(--accent);' : ''}">📌</button>`
    : '';
  
  quickEl.innerHTML = `${pinBtn}${editBtn}${deleteBtn}
      <button class="reaction msg-quick-btn" type="button" title="Добавить реакцию" data-action="open-reaction-picker" data-message-id="${safeMessageId}">❤️</button>
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
  if (currentUserProfile?.is_banned) {
    notify('❌ Ваш аккаунт заблокирован. Отправка сообщений невозможна.', 'error');
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

function isVideoMediaUrl(url) {
  if (!url) return false;
  try {
    const noQuery = String(url).split('?')[0].toLowerCase();
    return /\.(mp4|webm|mov|m4v|ogg)$/i.test(noQuery);
  } catch (_) {
    return false;
  }
}

function isImageUrl(url) {
  if (!url) return false;
  try {
    const noQuery = String(url).split('?')[0].toLowerCase();
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(noQuery);
  } catch (_) {
    return false;
  }
}

function isMediaUrl(url) {
  return isImageUrl(url) || isVideoMediaUrl(url);
}

function getFileNameFromUrl(url) {
  if (!url) return 'файл';
  try {
    const parts = String(url).split('/');
    const fileName = parts[parts.length - 1].split('?')[0];
    return fileName || 'файл';
  } catch (_) {
    return 'файл';
  }
}

function getFileExtension(filename) {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function renderMessageMedia(url) {
  if (!url) return '';
  const safeUrl = escHtml(String(url));
  
  // Проверяем, является ли файл медиа
  if (isVideoMediaUrl(url)) {
    return `<div class="msg-media"><video class="msg-video" controls preload="metadata" playsinline>
      <source src="${safeUrl}">
      Ваш браузер не поддерживает воспроизведение видео.
    </video></div>`;
  }
  
  if (isImageUrl(url)) {
    return `<div class="msg-media"><img class="msg-image" src="${safeUrl}" data-action="open-image-preview" alt="Изображение в сообщении"></div>`;
  }
  
  // Для не-медиа файлов показываем кнопку скачивания
  const fileName = getFileNameFromUrl(url);
  const ext = getFileExtension(fileName);
  const fileIcon = getFileIconByExtension(ext);
  
  return `<div class="msg-file-attachment">
    <div class="file-icon">${fileIcon}</div>
    <div class="file-info">
      <div class="file-name">${escHtml(fileName)}</div>
      <div class="file-type">${ext.toUpperCase()}</div>
    </div>
    <a href="${safeUrl}" download="${escHtml(fileName)}" class="file-download-btn" title="Скачать файл">
      <span class="material-icons-round">download</span>
    </a>
  </div>`;
}

function getFileIconByExtension(ext) {
  const iconMap = {
    'pdf': 'picture_as_pdf',
    'doc': 'description',
    'docx': 'description',
    'txt': 'description',
    'zip': 'folder_zip',
    'rar': 'folder_zip',
    '7z': 'folder_zip',
    'json': 'code',
    'csv': 'table_chart',
    'xls': 'table_chart',
    'xlsx': 'table_chart',
    'mp3': 'music_note',
    'wav': 'music_note',
    'ogg': 'music_note',
  };
  return `<span class="material-icons-round">${iconMap[ext] || 'insert_drive_file'}</span>`;
}

// ===================== MESSAGE RENDERING =====================
function renderMessage(record) {
  const area = document.getElementById('messagesArea');
  const author = record.author || 'Unknown';
  const text = String(record.text || '');
  const hasVisibleText = text.trim().length > 0;
  const time = new Date(record.created);

  // Insert date divider when the date changes
  const msgDateStr = time.toDateString();
  if (lastMessageDate !== msgDateStr) {
    const divider = document.createElement('div');
    divider.className = 'divider-date';
    divider.textContent = typeof formatDateDivider === 'function'
      ? formatDateDivider(time)
      : msgDateStr;
    area.appendChild(divider);
    lastMessageDate = msgDateStr;
    // Break message grouping across date boundaries
    lastMessageAuthor = null;
    lastMessageTime = null;
  }

  // Проверяем, нужно ли группировать сообщения (если автор тот же и прошло меньше 5 минут)
  const isConsecutive =
    lastMessageAuthor === author &&
    lastMessageTime &&
    time - lastMessageTime < 5 * 60 * 1000;

  const group = document.createElement('div');
  group.className = 'message-group' + (isConsecutive ? '' : ' with-header') + (record.is_pinned ? ' pinned-message' : '');
  group.dataset.id = record.id; // Важно для реакций и удаления

  const color = getUserColor(author);

  // --- ОБРАБОТКА MARKDOWN ---
  marked.setOptions({ breaks: true });
  let cleanHtml = hasVisibleText ? DOMPurify.sanitize(marked.parse(text)) : '';

  // --- ПОДСВЕТКА @УПОМИНАНИЙ ---
  if (cleanHtml) {
    const allNames = Object.values(memberDirectory);
    allNames.forEach(name => {
      const regex = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      const selfClass = name === currentUser ? ' mention-self' : '';
      cleanHtml = cleanHtml.replace(regex, `<span class="mention-highlight${selfClass}">@${escHtml(name)}</span>`);
    });
  }

  // cache для ответов
  messageStore[record.id] = {
    id: record.id,
    author,
    text,
    created: record.created,
    user_id: record.user_id,
    reply_to: record.reply_to || null,
    is_pinned: record.is_pinned || false,
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

  const avatarStyle = getMessageAvatarStyle(author, color);

  if (!isConsecutive) {
    group.innerHTML = `
        <div class="msg-avatar" style="${avatarStyle}">${author[0].toUpperCase()}</div>
        <div class="content-area">
          <div class="msg-stack">
            <div class="message-header">
              <span class="msg-author" style="color:${color}">${escHtml(author)}</span>
              <span class="msg-timestamp">${formatTime(time)}</span>
            </div>
            ${replyBlock}
            ${hasVisibleText ? `<div class="msg-text">${cleanHtml}</div>` : ''}
            ${renderMessageMedia(record.image_url)}
            <div class="msg-reaction-chips"></div>
          </div>
          <div class="msg-aside">
            <div class="msg-quick-actions"></div>
          </div>
        </div>`;
  } else {
    group.innerHTML = `
        <div class="msg-avatar compact" style="${avatarStyle}; opacity:0">${author[0].toUpperCase()}</div>
        <div class="content-area">
          <div class="msg-stack">
            ${replyBlock}
            ${hasVisibleText ? `<div class="msg-text compact">${cleanHtml}</div>` : ''}
            ${renderMessageMedia(record.image_url)}
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
    // Some schemas require non-empty content even for media-only messages.
    // Use zero-width space for media-only payload so DB constraints pass,
    // while UI keeps the text visually empty.
    const messageText = text || (isMediaFile ? '\u200B' : file.name);
    input.value = '';
    autoResize(input);

    if (false /* isDemoMode — unreachable: early return on line 749 */) {
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
        input.value = text;
        autoResize(input);
        return;
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
      input.value = text;
      autoResize(input);
      return;
    }
    if (typeof updateLastSeen === 'function') {
      updateLastSeen();
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

  // Clear DM state when switching to a regular channel
  if (typeof currentDMTarget !== 'undefined') currentDMTarget = null;
  document.querySelectorAll('.dm-item').forEach(el => el.classList.remove('active'));

  document.querySelectorAll('.channel-item[data-channel]').forEach((el) => {
    el.classList.toggle('active', el.dataset.channel === ch);
  });
  const chObj = typeof channelsList !== 'undefined' ? channelsList.find(c => c.slug === ch) : null;
  const chName = chObj ? chObj.name : ch;
  document.getElementById('channelTitle').textContent = chName;
  document.getElementById('channelDesc').textContent = CHANNEL_DESCS[ch] || `Канал #${chName}`;
  document.getElementById('message-input').placeholder = `Написать в #${chName}`;
  
  // Reset scroll on message input
  const messageInput = document.getElementById('message-input');
  if (messageInput) {
    messageInput.scrollLeft = 0;
  }

  const area = document.getElementById('messagesArea');
  area.innerHTML = `
      <div class="channel-welcome">
        <div class="welcome-icon">💬</div>
        <div class="welcome-title"># ${escHtml(chName)}</div>
        <div class="welcome-desc">${escHtml(CHANNEL_DESCS[ch] || 'Начало канала #' + chName)}</div>
      </div>
    `;
  lastMessageAuthor = null;
  lastMessageTime = null;
  lastMessageDate = null;
  clearReactionStore();
  cancelReply();
  updateTypingIndicator();

  if (!isDemoMode && supabase) {
    subscribeToMessages();
  }

  if (isMobileLayout()) {
    closeMobilePanels();
  }

  applyPresenceFromChannel();
}

function handleSearch(event) {
  const query = event.target.value.trim().toLowerCase();
  const resultsContainer = document.getElementById('searchResults');
  
  if (!query || query.length < 2) {
    resultsContainer.innerHTML = '';
    return;
  }
  
  const messages = document.querySelectorAll('.message-group');
  const results = [];
  
  messages.forEach((msg) => {
    const textElement = msg.querySelector('.msg-text');
    if (!textElement) return;
    
    const text = textElement.textContent.toLowerCase();
    if (text.includes(query)) {
      const author = msg.querySelector('.msg-author')?.textContent || 'Unknown';
      const textContent = textElement.textContent;
      const timestamp = msg.querySelector('.msg-timestamp')?.textContent || '';
      
      results.push({
        author,
        text: textContent,
        timestamp,
        element: msg
      });
    }
  });
  
  if (results.length === 0) {
    resultsContainer.innerHTML = '<div class="search-no-results">Нет результатов</div>';
    return;
  }
  
  resultsContainer.innerHTML = results.map(result => {
    const highlightedText = highlightText(result.text, query);
    return `
      <div class="search-result-item" data-message-id="${escHtml(result.element.dataset.id || '')}">
        <div class="result-author">${escHtml(result.author)}</div>
        <div class="result-text">${highlightedText}</div>
        <div class="result-time">${escHtml(result.timestamp)}</div>
      </div>
    `;
  }).join('');
  
  // Add click listeners to results
  resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const messageId = item.dataset.messageId;
      const messageElement = document.querySelector(`.message-group[data-id="${messageId}"]`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.style.animation = 'none';
        messageElement.offsetHeight; // Trigger reflow
        messageElement.style.animation = 'messageSlideIn 0.3s ease';
        closeSearchPanel();
      }
    });
  });
}

function highlightText(text, query) {
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return escHtml(text).replace(regex, '<span class="search-result-highlight">$1</span>');
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function updateMessageInSupabase(messageId, newText) {
  if (!supabase || !authUser) return false;
  
  try {
    // Try with user_id check first
    let { error } = await supabase
      .from('messages')
      .update({ content: newText })
      .eq('id', messageId)
      .eq('user_id', authUser.id);
    
    // If that fails, try without user_id check (for admin or RLS policy)
    if (error) {
      console.warn('First update attempt failed, trying without user_id check:', error);
      const result = await supabase
        .from('messages')
        .update({ content: newText })
        .eq('id', messageId);
      error = result.error;
    }
    
    if (error) throw error;
    
    // Update the message in the DOM
    const messageGroup = document.querySelector(`.message-group[data-id="${messageId}"]`);
    const textElement = messageGroup?.querySelector('.msg-text');
    if (textElement) {
      marked.setOptions({ breaks: true });
      textElement.innerHTML = DOMPurify.sanitize(marked.parse(newText));
    }
    
    // Update in message store
    if (messageStore[messageId]) {
      messageStore[messageId].text = newText;
    }
    
    return true;
  } catch (e) {
    console.error('Error updating message:', e);
    return false;
  }
}

// ===================== SUBSCRIPTION =====================

// ===================== PINNED MESSAGES =====================
function openPinnedPanel() {
  const panel = document.getElementById('pinnedPanel');
  if (!panel) return;
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  loadPinnedMessages();
}

function closePinnedPanel() {
  const panel = document.getElementById('pinnedPanel');
  if (!panel) return;
  panel.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

async function loadPinnedMessages() {
  const container = document.getElementById('pinnedResults');
  if (!container) return;
  
  if (isDemoMode) {
    container.innerHTML = '<div class="search-no-results">В демо-режиме нет закрепленных сообщений</div>';
    return;
  }
  
  if (!supabase) return;
  
  container.innerHTML = '<div class="search-no-results">Загрузка...</div>';
  
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel', currentChannel)
      .eq('is_pinned', true)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="search-no-results">В этом канале нет закрепленных сообщений</div>';
      return;
    }
    
    container.innerHTML = data.map(msg => {
      const cleanHtml = DOMPurify.sanitize(marked.parse(msg.content));
      const canPin = isAdmin || (msg.user_id === authUser?.id);
      const unpinHtml = canPin 
        ? `<button type="button" class="pinned-btn pinned-btn-unpin" data-action="unpin-message" data-message-id="${msg.id}">Открепить</button>`
        : '';
        
      return `
        <div class="pinned-result-item" data-message-id="${msg.id}">
          <div class="pinned-author">${escHtml(msg.author)} <span style="font-size: 11px; font-weight: normal; color: var(--text-muted); margin-left: 6px;">${formatTime(new Date(msg.created_at))}</span></div>
          <div class="pinned-text">${cleanHtml}</div>
          <div class="pinned-actions">
            ${unpinHtml}
            <button type="button" class="pinned-btn" data-action="scroll-to-message" data-message-id="${msg.id}">Перейти</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div class="search-no-results">Ошибка при загрузке</div>';
    console.error(err);
  }
}

async function togglePinMessage(messageId) {
  if (!supabase || !authUser) return;
  
  const msgData = messageStore[messageId];
  if (!msgData) return;
  
  const isPinned = !msgData.is_pinned; // Toggle current state
  
  try {
    const { error } = await supabase
      .from('messages')
      .update({ is_pinned: isPinned })
      .eq('id', messageId);
      
    if (error) throw error;
    
    // Update local store so repeated toggles work correctly
    if (messageStore[messageId]) {
      messageStore[messageId].is_pinned = isPinned;
    }
    
    // Update DOM: toggle pinned-message class
    const msgEl = document.querySelector(`.message-group[data-id="${messageId}"]`);
    if (msgEl) {
      msgEl.classList.toggle('pinned-message', isPinned);
    }
    
    if (isPinned) {
      notify('Сообщение закреплено', 'success');
    } else {
      notify('Сообщение откреплено', 'success');
    }
  } catch (err) {
    notify('Ошибка: ' + err.message, 'error');
  }
}

async function unpinMessage(messageId) {
  if (!supabase || !authUser) return;
  
  try {
    const { error } = await supabase
      .from('messages')
      .update({ is_pinned: false })
      .eq('id', messageId);
      
    if (error) throw error;
    notify('Сообщение откреплено', 'success');
    
    // Refresh the panel if it's open
    const panel = document.getElementById('pinnedPanel');
    if (panel && panel.classList.contains('show')) {
      loadPinnedMessages();
    }
  } catch (err) {
    notify('Ошибка: ' + err.message, 'error');
  }
}
