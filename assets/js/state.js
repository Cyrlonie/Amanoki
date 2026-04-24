// Shared state (classic script, no bundler).

// If you want to force-enable admin locally, you can set this to a user UUID.
// Keeping it empty by default.
const ADMIN_USER_ID = '';

// Supabase runtime
let supabase = null;
let supabaseInitPromise = null;

// Auth/user
let authUser = null;
let currentUser = '';
let currentUserProfile = null;

// Chat state
let currentChannel = 'general';
let messageSubscription = null;
let presenceChannel = null;
let reactionSubscription = null;

// Voice state
let currentVoiceChannel = null;
let voiceRoom = null;
let isVoiceMuted = false;
let voiceParticipants = {};

// UI/state flags
let isDemoMode = false;
let typingTimer = null;
let isTyping = false;
let members = {};
let memberDirectory = {};
let messageIdCounter = 1;
let lastMessageAuthor = null;
let lastMessageTime = null;
let lastMessageDate = null;
let memberListVisible = true;
let isUploadingFile = false;
let windowHasFocus = true;

// Reactions/replies caches
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '😮'];
const reactionStore = {};
let reactionPickerMessageId = null;
const messageStore = {};
let replyToMessageId = null;

// Admin
let adminUserId = ADMIN_USER_ID || localStorage.getItem('adminUserId') || '';
let isAdmin = false;

// Constants/data
const COLORS = [
  '#9333ea',
  '#7c3aed',
  '#6366f1',
  '#a855f7',
  '#c084fc',
  '#22d3ee',
  '#34d399',
  '#fb7185',
  '#fbbf24',
  '#f472b6',
];

let channelsList = []; // Array of channel objects from DB
let TEXT_CHANNELS = []; // Array of text channel slugs
let CHANNEL_DESCS = {}; // Map of slug -> description

// Multi-server state
let serversList = [];
let currentServerId = null;

function getScopedChannelKey(channelId = currentChannel, serverId = currentServerId) {
  if (!channelId) return '';
  if (typeof isDMChannel === 'function' && isDMChannel(channelId)) return channelId;
  return serverId ? `${serverId}:${channelId}` : channelId;
}

function getScopedStoragePath(channelId = currentChannel, serverId = currentServerId) {
  if (!channelId) return '';
  if (typeof isDMChannel === 'function' && isDMChannel(channelId)) return channelId;
  return serverId ? `${serverId}/${channelId}` : channelId;
}

function unwrapScopedChannelKey(channelKey, serverId = currentServerId) {
  if (!channelKey) return '';
  if (typeof isDMChannel === 'function' && isDMChannel(channelKey)) return channelKey;
  const prefix = serverId ? `${serverId}:` : '';
  return prefix && channelKey.startsWith(prefix) ? channelKey.slice(prefix.length) : channelKey;
}

/** Счётчики непрочитанных по каналу (в памяти; «прочитано» — в localStorage). */
let unreadCounts = {};

const DEMO_MESSAGES = [
  { author: 'Алексей', text: 'Всем привет! Как дела?', time: new Date(Date.now() - 1800000) },
  { author: 'Мария', text: 'Отлично! Закончила PR наконец-то 🎉', time: new Date(Date.now() - 1500000) },
  { author: 'Иван', text: 'О, поздравляю! Давно мучилась?', time: new Date(Date.now() - 1400000) },
  { author: 'Мария', text: 'Дня три наверное. Там баг с WebSocket подключением был 😅', time: new Date(Date.now() - 1300000) },
  { author: 'Алексей', text: 'Кстати, смотрели новый релиз Supabase? Там реалтайм стал намного стабильнее!', time: new Date(Date.now() - 900000) },
  { author: 'Иван', text: 'Да, видел. Надо будет обновить проект', time: new Date(Date.now() - 800000) },
];

// Derived
const userColors = {};
let userAvatars = {};

