// Voice chat MVP on LiveKit Cloud (classic script, no bundler).

let livekitSdkPromise = null;

function getVoiceChannelName(channelId) {
  const channel = VOICE_CHANNELS.find((item) => item.id === channelId);
  return channel ? channel.name : channelId;
}

function getVoiceRoomName(channelId) {
  return `amanoki-${channelId}`;
}

async function loadLivekitSdk() {
  if (!livekitSdkPromise) {
    livekitSdkPromise = import('https://cdn.jsdelivr.net/npm/livekit-client@2.15.7/+esm');
  }
  return livekitSdkPromise;
}

async function fetchVoiceToken(roomName) {
  if (!authUser || !currentUser) {
    throw new Error('Требуется авторизация для голосового чата');
  }

  const response = await fetch('./api/voice-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomName,
      userId: authUser.id,
      username: currentUser,
    }),
  });

  if (!response.ok) {
    let message = 'Не удалось получить voice token';
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch (_) {}
    throw new Error(message);
  }

  return response.json();
}

function participantMicMuted(participant) {
  try {
    const pubs = participant?.audioTrackPublications || participant?.trackPublications;
    if (!pubs) return false;
    const values = typeof pubs.values === 'function' ? Array.from(pubs.values()) : Object.values(pubs);
    const micPub = values.find((pub) => String(pub?.source || '').toLowerCase().includes('microphone'));
    if (!micPub) return false;
    return micPub.isMuted === true;
  } catch (_) {
    return false;
  }
}

function syncVoiceParticipants(room) {
  if (!room) {
    voiceParticipants = {};
    renderVoiceParticipants();
    return;
  }

  const next = {};
  const localId = String(authUser?.id || 'local');
  next[localId] = {
    id: localId,
    name: currentUser || 'You',
    isLocal: true,
    muted: !!isVoiceMuted,
  };

  room.remoteParticipants.forEach((participant) => {
    const id = String(participant.identity || participant.sid);
    const name =
      participant.name ||
      participant.identity ||
      memberDirectory[id] ||
      'Участник';
    next[id] = {
      id,
      name,
      isLocal: false,
      muted: participantMicMuted(participant),
    };
  });

  voiceParticipants = next;
  renderVoiceParticipants();
}

function updateVoiceUiState() {
  const panel = document.getElementById('voicePanel');
  const status = document.getElementById('voiceStatus');
  const leaveBtn = document.getElementById('voiceLeaveBtn');
  const muteBtn = document.getElementById('voiceMuteBtn');
  const channelLabel = document.getElementById('voiceCurrentChannel');

  if (panel) panel.classList.toggle('show', !!currentVoiceChannel);
  if (leaveBtn) leaveBtn.disabled = !currentVoiceChannel;
  if (muteBtn) muteBtn.disabled = !currentVoiceChannel;
  if (muteBtn) {
    muteBtn.textContent = isVoiceMuted ? '🎤 Включить микрофон' : '🔇 Выключить микрофон';
  }
  if (channelLabel) {
    channelLabel.textContent = currentVoiceChannel
      ? getVoiceChannelName(currentVoiceChannel)
      : 'Не подключено';
  }
  if (status) {
    status.textContent = currentVoiceChannel
      ? `Вы в канале ${getVoiceChannelName(currentVoiceChannel)}`
      : 'Голосовой канал не подключен';
  }

  document.querySelectorAll('[data-voice-channel]').forEach((el) => {
    el.classList.toggle('active', el.dataset.voiceChannel === currentVoiceChannel);
  });
}

function renderVoiceParticipants() {
  const list = document.getElementById('voiceParticipants');
  const count = document.getElementById('voiceParticipantCount');
  if (!list || !count) return;

  const participants = Object.values(voiceParticipants);
  count.textContent = String(participants.length);

  if (!participants.length) {
    list.innerHTML = '<div class="voice-participant-empty">Нет участников</div>';
    updateVoiceUiState();
    return;
  }

  list.innerHTML = participants
    .sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || a.name.localeCompare(b.name, 'ru'))
    .map(
      (p) => `<div class="voice-participant">
        <span class="voice-participant-name">${escHtml(p.name)}${p.isLocal ? ' (вы)' : ''}</span>
        <span class="voice-participant-state">${p.muted ? '🔇' : '🎤'}</span>
      </div>`
    )
    .join('');

  updateVoiceUiState();
}

function attachAudioTrack(track) {
  if (!track || track.kind !== 'audio' || typeof track.attach !== 'function') return;
  const elements = track.attach();
  const audioElements = Array.isArray(elements) ? elements : elements ? [elements] : [];
  audioElements.forEach((el) => {
    if (!(el instanceof HTMLMediaElement)) return;
    el.autoplay = true;
    el.controls = false;
    el.style.display = 'none';
    document.body.appendChild(el);
  });
}

function detachAudioTrack(track) {
  if (!track || track.kind !== 'audio' || typeof track.detach !== 'function') return;
  const elements = track.detach();
  const audioElements = Array.isArray(elements) ? elements : elements ? [elements] : [];
  audioElements.forEach((el) => el.remove());
}

function attachExistingParticipantAudio(participant) {
  const pubs = participant?.audioTrackPublications || participant?.trackPublications;
  if (!pubs) return;
  const values = typeof pubs.values === 'function' ? Array.from(pubs.values()) : Object.values(pubs);
  values.forEach((pub) => {
    const track = pub?.track;
    if (track?.kind === 'audio') attachAudioTrack(track);
  });
}

function bindRoomEvents(room, RoomEvent) {
  room
    .on(RoomEvent.ParticipantConnected, () => syncVoiceParticipants(room))
    .on(RoomEvent.ParticipantDisconnected, () => syncVoiceParticipants(room))
    .on(RoomEvent.TrackMuted, () => syncVoiceParticipants(room))
    .on(RoomEvent.TrackUnmuted, () => syncVoiceParticipants(room))
    .on(RoomEvent.LocalTrackUnpublished, () => syncVoiceParticipants(room))
    .on(RoomEvent.LocalTrackPublished, () => syncVoiceParticipants(room))
    .on(RoomEvent.TrackSubscribed, (...args) => {
      const track = args.find((arg) => arg?.kind === 'audio') || args.find((arg) => arg?.track?.kind === 'audio')?.track;
      if (track) attachAudioTrack(track);
    })
    .on(RoomEvent.TrackUnsubscribed, (...args) => {
      const track = args.find((arg) => arg?.kind === 'audio') || args.find((arg) => arg?.track?.kind === 'audio')?.track;
      if (track) detachAudioTrack(track);
    })
    .on(RoomEvent.Disconnected, () => {
      currentVoiceChannel = null;
      voiceRoom = null;
      isVoiceMuted = false;
      voiceParticipants = {};
      renderVoiceParticipants();
      updateVoiceUiState();
    });
}

async function joinVoiceChannel(channelId) {
  if (isDemoMode) {
    notify('Голосовой чат недоступен в демо-режиме', 'error');
    return;
  }

  if (!authUser) {
    notify('Сначала войдите в аккаунт', 'error');
    return;
  }

  if (!channelId) return;
  if (currentVoiceChannel === channelId && voiceRoom) return;

  try {
    if (voiceRoom) {
      await leaveVoiceChannel(true);
    }

    const roomName = getVoiceRoomName(channelId);
    const [{ Room, RoomEvent }, tokenData] = await Promise.all([
      loadLivekitSdk(),
      fetchVoiceToken(roomName),
    ]);

    const room = new Room();
    bindRoomEvents(room, RoomEvent);
    await room.connect(tokenData.url, tokenData.token);
    room.remoteParticipants.forEach((participant) => attachExistingParticipantAudio(participant));
    await room.localParticipant.setMicrophoneEnabled(true);

    currentVoiceChannel = channelId;
    voiceRoom = room;
    isVoiceMuted = false;

    syncVoiceParticipants(room);
    updateVoiceUiState();
    notify(`Вы подключились к ${getVoiceChannelName(channelId)}`, 'success');
  } catch (error) {
    currentVoiceChannel = null;
    voiceRoom = null;
    isVoiceMuted = false;
    voiceParticipants = {};
    renderVoiceParticipants();
    updateVoiceUiState();
    notify(`Ошибка voice подключения: ${error.message}`, 'error');
  }
}

async function leaveVoiceChannel(silent = false) {
  try {
    if (voiceRoom) {
      voiceRoom.disconnect();
    }
  } catch (_) {}

  currentVoiceChannel = null;
  voiceRoom = null;
  isVoiceMuted = false;
  voiceParticipants = {};
  renderVoiceParticipants();
  updateVoiceUiState();

  if (!silent) {
    notify('Вы вышли из голосового канала', 'info');
  }
}

async function toggleVoiceMute() {
  if (!voiceRoom) {
    notify('Сначала подключитесь к голосовому каналу', 'error');
    return;
  }

  try {
    const nextMuted = !isVoiceMuted;
    await voiceRoom.localParticipant.setMicrophoneEnabled(!nextMuted);
    isVoiceMuted = nextMuted;

    const localId = String(authUser?.id || 'local');
    if (voiceParticipants[localId]) {
      voiceParticipants[localId].muted = isVoiceMuted;
    }
    renderVoiceParticipants();
    updateVoiceUiState();
  } catch (error) {
    notify(`Не удалось изменить микрофон: ${error.message}`, 'error');
  }
}

updateVoiceUiState();
renderVoiceParticipants();
