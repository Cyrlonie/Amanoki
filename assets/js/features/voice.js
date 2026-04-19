// Voice chat MVP on LiveKit Cloud (classic script, no bundler).

let livekitSdkPromise = null;
let isVoiceDeafened = false;
const voiceAudioTrackData = new Map();
const voiceParticipantTrackMap = new Map();
const voiceSpeakingTimers = {};
let voiceAudioContext = null;
const VAD_THRESHOLD = 0.03;
let voiceConnectionGeneration = 0;

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
    updateSidebarVoiceUsers();
    return;
  }

  const next = {};
  const localId = String(authUser?.id || 'local');
  next[localId] = {
    id: localId,
    name: currentUser || 'You',
    isLocal: true,
    muted: !!isVoiceMuted,
    volume: voiceParticipants[localId]?.volume ?? 1,
    speaking: false,
  };

  room.remoteParticipants.forEach((participant) => {
    const id = String(participant.identity || participant.sid);
    const name =
      participant.name ||
      participant.identity ||
      memberDirectory[id] ||
      'Участник';
    const previous = voiceParticipants[id] || {};
    next[id] = {
      id,
      name,
      isLocal: false,
      muted: participantMicMuted(participant),
      volume: previous.volume ?? 1,
      speaking: previous.speaking ?? false,
    };
  });

  voiceParticipants = next;
  renderVoiceParticipants();
  updateSidebarVoiceUsers();
}

/** Build sidebar voice user list directly from voiceParticipants + currentVoiceChannel. */
function updateSidebarVoiceUsers() {
  if (typeof renderVoiceChannelUsers !== 'function') return;
  const voiceUsersByChannel = {};
  if (currentVoiceChannel && voiceParticipants) {
    const users = Object.values(voiceParticipants).map(p => ({ id: p.id, name: p.name }));
    if (users.length > 0) {
      voiceUsersByChannel[currentVoiceChannel] = users;
    }
  }
  renderVoiceChannelUsers(voiceUsersByChannel);
}

function updateVoiceUiState() {
  const panel = document.getElementById('voicePanel');
  const status = document.getElementById('voiceStatus');
  const leaveBtn = document.getElementById('voiceLeaveBtn');
  const muteBtn = document.getElementById('voiceMuteBtn');
  const channelLabel = document.getElementById('voiceCurrentChannel');

  if (panel) panel.classList.toggle('show', !!currentVoiceChannel);
  const deafenBtn = document.getElementById('voiceDeafenBtn');
  if (leaveBtn) leaveBtn.disabled = !currentVoiceChannel;
  if (muteBtn) muteBtn.disabled = !currentVoiceChannel;
  if (deafenBtn) deafenBtn.disabled = !currentVoiceChannel;
  if (muteBtn) {
    muteBtn.textContent = isVoiceMuted ? '🎤 Включить микрофон' : '🔇 Выключить микрофон';
  }
  if (deafenBtn) {
    deafenBtn.textContent = isVoiceDeafened ? '🎧 Включить звук' : '🙉 Отключить звук';
  }
  if (channelLabel) {
    channelLabel.textContent = currentVoiceChannel
      ? getVoiceChannelName(currentVoiceChannel)
      : 'Не подключено';
  }
  if (status) {
    status.textContent = currentVoiceChannel
      ? `Вы в канале ${getVoiceChannelName(currentVoiceChannel)}${isVoiceDeafened ? ' (без звука)' : ''}`
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
    .map((p) => {
      const indicator = p.speaking ? '🔊' : '◦';
      const volumeValue = Math.round((p.volume ?? 1) * 100);
      const slider = p.isLocal
        ? ''
        : `<input type="range" min="0" max="100" value="${volumeValue}" class="voice-volume-slider" data-action="change-volume" data-participant-id="${escHtml(
            p.id
          )}" />`;

      const muteState = p.muted ? '🔇' : '🎤';
      const deafenState = p.deafened ? '🔈' : '';

      return `<div class="voice-participant${p.speaking ? ' speaking' : ''}" data-participant-id="${escHtml(
        p.id
      )}">
        <div class="voice-participant-row">
          <span class="voice-participant-name">${escHtml(p.name)}${p.isLocal ? ' (вы)' : ''}</span>
          <span class="voice-participant-indicator">${indicator}</span>
          <span class="voice-participant-state">${muteState}${deafenState}</span>
        </div>
        ${slider ? `<div class="voice-participant-controls">${slider}</div>` : ''}
      </div>`;
    })
    .join('');

  updateVoiceUiState();
}

function getTrackKey(track) {
  return String(track?.sid || track?.trackSid || track?.name || Math.random());
}

function getParticipantIdFromArgs(args) {
  return String(
    args.find((arg) => arg?.identity)?.identity ||
      args.find((arg) => arg?.sid)?.sid ||
      args.find((arg) => arg?.participant)?.participant?.identity ||
      args.find((arg) => arg?.participant)?.participant?.sid ||
      authUser?.id ||
      'remote'
  );
}

function ensureVoiceAudioContext() {
  if (!voiceAudioContext) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    voiceAudioContext = new Ctor();
  }
  if (voiceAudioContext.state === 'suspended') {
    voiceAudioContext.resume().catch(() => {});
  }
  return voiceAudioContext;
}

function updateAudioGainForParticipant(participantId) {
  const trackIds = voiceParticipantTrackMap.get(participantId);
  if (!trackIds) return;
  const volume = isVoiceDeafened ? 0 : voiceParticipants[participantId]?.volume ?? 1;
  const muted = isVoiceDeafened || volume <= 0;
  trackIds.forEach((trackKey) => {
    const data = voiceAudioTrackData.get(trackKey);
    if (!data) return;
    if (data.gainNode) {
      const gain = Math.max(0, Math.min(volume, 1));
      data.gainNode.gain.setValueAtTime(gain, voiceAudioContext?.currentTime || 0);
    }
    if (Array.isArray(data.elements)) {
      data.elements.forEach((el) => {
        if (el instanceof HTMLMediaElement) {
          el.volume = Math.max(0, Math.min(volume, 1));
          el.muted = muted;
        }
      });
    }
  });
}

function updateAllAudioGains() {
  Array.from(voiceParticipantTrackMap.keys()).forEach((participantId) => updateAudioGainForParticipant(participantId));
}

function updateParticipantSpeaking(participantId, isSpeaking) {
  if (!participantId || !voiceParticipants[participantId]) return;
  if (isSpeaking) {
    if (!voiceParticipants[participantId].speaking) {
      voiceParticipants[participantId].speaking = true;
      renderVoiceParticipants();
    }
    clearTimeout(voiceSpeakingTimers[participantId]);
    voiceSpeakingTimers[participantId] = window.setTimeout(() => {
      if (voiceParticipants[participantId]?.speaking) {
        voiceParticipants[participantId].speaking = false;
        renderVoiceParticipants();
      }
    }, 300);
  }
}

function startVAD(trackKey) {
  const data = voiceAudioTrackData.get(trackKey);
  if (!data || !data.analyser) return;

  const buffer = new Uint8Array(data.analyser.fftSize);
  const tick = () => {
    data.analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const value = buffer[i] - 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / buffer.length) / 128;
    updateParticipantSpeaking(data.participantId, rms > VAD_THRESHOLD);
    data.rafId = requestAnimationFrame(tick);
  };
  tick();
}

function attachAudioTrack(track, participantId = null) {
  if (!track || track.kind !== 'audio' || typeof track.attach !== 'function') return;
  participantId = participantId || String(track?.participant?.identity || track?.participant?.sid || 'remote');
  const trackKey = getTrackKey(track);
  const elements = track.attach();
  const audioElements = Array.isArray(elements) ? elements : elements ? [elements] : [];
  const ctx = ensureVoiceAudioContext();

  audioElements.forEach((el) => {
    if (!(el instanceof HTMLMediaElement)) return;
    el.autoplay = true;
    el.controls = false;
    el.muted = true;
    el.style.display = 'none';
    document.body.appendChild(el);

    const volume = isVoiceDeafened ? 0 : voiceParticipants[participantId]?.volume ?? 1;
    el.volume = Math.max(0, Math.min(volume, 1));
    el.muted = volume <= 0 || isVoiceDeafened;

    const elements = [el];
    const existingData = voiceAudioTrackData.get(trackKey);
    if (existingData) {
      existingData.elements = Array.isArray(existingData.elements)
        ? existingData.elements.concat(elements)
        : existingData.elements
        ? [existingData.elements].concat(elements)
        : elements;
    }

    if (!ctx) {
      const trackData = existingData || {
        participantId,
        elements,
        gainNode: null,
        analyser: null,
        rafId: null,
        element: el,
        track,
      };
      voiceAudioTrackData.set(trackKey, trackData);
      const trackIds = voiceParticipantTrackMap.get(participantId) || new Set();
      trackIds.add(trackKey);
      voiceParticipantTrackMap.set(participantId, trackIds);
      return;
    }

    try {
      const source = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const gainNode = ctx.createGain();
      source.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);
      gainNode.gain.setValueAtTime(Math.max(0, Math.min(volume, 1)), ctx.currentTime || 0);
      const trackData = existingData || {
        participantId,
        elements,
        gainNode,
        analyser,
        rafId: null,
        element: el,
        track,
      };
      trackData.gainNode = gainNode;
      trackData.analyser = analyser;
      trackData.track = track;
      trackData.element = el;
      trackData.rafId = trackData.rafId || null;
      trackData.elements = Array.isArray(trackData.elements)
        ? Array.from(new Set([].concat(trackData.elements, elements)))
        : elements;
      voiceAudioTrackData.set(trackKey, trackData);
      const trackIds = voiceParticipantTrackMap.get(participantId) || new Set();
      trackIds.add(trackKey);
      voiceParticipantTrackMap.set(participantId, trackIds);
      startVAD(trackKey);
    } catch (_) {
      const trackData = existingData || {
        participantId,
        elements,
        gainNode: null,
        analyser: null,
        rafId: null,
        element: el,
        track,
      };
      trackData.elements = Array.isArray(trackData.elements)
        ? Array.from(new Set([].concat(trackData.elements, elements)))
        : elements;
      voiceAudioTrackData.set(trackKey, trackData);
      const trackIds = voiceParticipantTrackMap.get(participantId) || new Set();
      trackIds.add(trackKey);
    }
  });
}

function detachAudioTrack(track) {
  const trackKey = getTrackKey(track);
  const data = voiceAudioTrackData.get(trackKey);
  if (!data) {
    if (typeof track.detach === 'function') {
      const elements = track.detach();
      const audioElements = Array.isArray(elements) ? elements : elements ? [elements] : [];
      audioElements.forEach((el) => el.remove());
    }
    return;
  }

  if (data.rafId) {
    cancelAnimationFrame(data.rafId);
  }
  if (data.gainNode) {
    data.gainNode.disconnect();
  }
  if (data.analyser) {
    data.analyser.disconnect();
  }
  if (Array.isArray(data.elements)) {
    data.elements.forEach((el) => {
      if (el instanceof HTMLElement) el.remove();
    });
  } else if (data.element) {
    data.element.remove();
  }
  voiceAudioTrackData.delete(trackKey);
  const trackIds = voiceParticipantTrackMap.get(data.participantId);
  if (trackIds) {
    trackIds.delete(trackKey);
    if (!trackIds.size) {
      voiceParticipantTrackMap.delete(data.participantId);
    }
  }
}

function detachAudioTrackByKey(trackKey) {
  const data = voiceAudioTrackData.get(trackKey);
  if (!data) return;
  if (data.track) {
    detachAudioTrack(data.track);
  } else {
    if (data.rafId) {
      cancelAnimationFrame(data.rafId);
    }
    if (data.gainNode) {
      data.gainNode.disconnect();
    }
    if (data.analyser) {
      data.analyser.disconnect();
    }
    if (data.element) {
      data.element.remove();
    }
    voiceAudioTrackData.delete(trackKey);
    const trackIds = voiceParticipantTrackMap.get(data.participantId);
    if (trackIds) {
      trackIds.delete(trackKey);
      if (!trackIds.size) {
        voiceParticipantTrackMap.delete(data.participantId);
      }
    }
  }
}

function attachExistingParticipantAudio(participant) {
  const pubs = participant?.audioTrackPublications || participant?.trackPublications;
  if (!pubs) return;
  const values = typeof pubs.values === 'function' ? Array.from(pubs.values()) : Object.values(pubs);
  const participantId = String(participant.identity || participant.sid);
  values.forEach((pub) => {
    const track = pub?.track;
    if (track?.kind === 'audio') attachAudioTrack(track, participantId);
  });
}

function bindRoomEvents(room, RoomEvent, generation) {
  room
    .on(RoomEvent.ParticipantConnected, () => {
      if (generation !== voiceConnectionGeneration) return;
      syncVoiceParticipants(room);
    })
    .on(RoomEvent.ParticipantDisconnected, () => {
      if (generation !== voiceConnectionGeneration) return;
      syncVoiceParticipants(room);
    })
    .on(RoomEvent.TrackMuted, () => {
      if (generation !== voiceConnectionGeneration) return;
      syncVoiceParticipants(room);
    })
    .on(RoomEvent.TrackUnmuted, () => {
      if (generation !== voiceConnectionGeneration) return;
      syncVoiceParticipants(room);
    })
    .on(RoomEvent.LocalTrackUnpublished, () => {
      if (generation !== voiceConnectionGeneration) return;
      syncVoiceParticipants(room);
    })
    .on(RoomEvent.LocalTrackPublished, () => {
      if (generation !== voiceConnectionGeneration) return;
      syncVoiceParticipants(room);
    })
    .on(RoomEvent.TrackSubscribed, (...args) => {
      if (generation !== voiceConnectionGeneration) return;
      const track = args.find((arg) => arg?.kind === 'audio') || args.find((arg) => arg?.track?.kind === 'audio')?.track;
      const participantId = getParticipantIdFromArgs(args);
      if (track) attachAudioTrack(track, participantId);
    })
    .on(RoomEvent.TrackUnsubscribed, (...args) => {
      if (generation !== voiceConnectionGeneration) return;
      const track = args.find((arg) => arg?.kind === 'audio') || args.find((arg) => arg?.track?.kind === 'audio')?.track;
      if (track) detachAudioTrack(track);
    })
    .on(RoomEvent.Disconnected, () => {
      if (generation !== voiceConnectionGeneration) return;
      resetVoiceState();
    });
}

function cleanupVoiceAudioTracks() {
  Array.from(voiceAudioTrackData.keys()).forEach((trackKey) => detachAudioTrackByKey(trackKey));
  Object.keys(voiceSpeakingTimers).forEach((participantId) => {
    clearTimeout(voiceSpeakingTimers[participantId]);
    delete voiceSpeakingTimers[participantId];
  });
}

function setParticipantVolume(participantId, volume) {
  if (!voiceParticipants[participantId]) return;
  voiceParticipants[participantId].volume = volume;
  renderVoiceParticipants();
  updateAudioGainForParticipant(participantId);
}

async function toggleVoiceDeafen() {
  if (!voiceRoom) {
    notify('Сначала подключитесь к голосовому каналу', 'error');
    return;
  }
  isVoiceDeafened = !isVoiceDeafened;
  updateAllAudioGains();
  renderVoiceParticipants();
  updateVoiceUiState();
}

function handleVoiceVolumeInput(event) {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  if (!target || target.dataset.action !== 'change-volume') return;
  const participantId = target.dataset.participantId;
  if (!participantId) return;
  const volume = Number(target.value) / 100;
  setParticipantVolume(participantId, volume);
}

document.addEventListener('input', handleVoiceVolumeInput);

function resetVoiceState() {
  cleanupVoiceAudioTracks();
  currentVoiceChannel = null;
  voiceRoom = null;
  isVoiceMuted = false;
  isVoiceDeafened = false;
  voiceParticipants = {};
  renderVoiceParticipants();
  updateVoiceUiState();
  if (typeof renderVoiceChannelUsers === 'function') {
    renderVoiceChannelUsers({});
  }
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

  let generation = 0;

  try {
    if (voiceRoom) {
      await leaveVoiceChannel(true);
    }

    generation = ++voiceConnectionGeneration;

    const roomName = getVoiceRoomName(channelId);
    const [{ Room, RoomEvent }, tokenData] = await Promise.all([
      loadLivekitSdk(),
      fetchVoiceToken(roomName),
    ]);

    const room = new Room();
    bindRoomEvents(room, RoomEvent, generation);
    await room.connect(tokenData.url, tokenData.token);
    if (generation !== voiceConnectionGeneration) {
      room.disconnect();
      return;
    }
    room.remoteParticipants.forEach((participant) => attachExistingParticipantAudio(participant));
    await room.localParticipant.setMicrophoneEnabled(true);
    if (generation !== voiceConnectionGeneration) {
      room.disconnect();
      return;
    }

    currentVoiceChannel = channelId;
    voiceRoom = room;
    isVoiceMuted = false;
    isVoiceDeafened = false;

    syncVoiceParticipants(room);
    updateVoiceUiState();
    if (typeof updateMyPresence === 'function') updateMyPresence();
    notify(`Вы подключились к ${getVoiceChannelName(channelId)}`, 'success');
  } catch (error) {
    if (generation === voiceConnectionGeneration) {
      resetVoiceState();
    }
    notify(`Ошибка voice подключения: ${error.message}`, 'error');
  }
}

async function leaveVoiceChannel(silent = false) {
  voiceConnectionGeneration += 1;
  try {
    if (voiceRoom) {
      voiceRoom.disconnect();
    }
  } catch (_) {}

  resetVoiceState();
  if (typeof updateMyPresence === 'function') updateMyPresence();

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

// ===================== SCREEN SHARE =====================
let isScreenSharing = false;
let screenShareTrack = null;
let remoteScreenShareTrack = null;

async function toggleScreenShare() {
  if (!voiceRoom) {
    notify('Сначала подключитесь к голосовому каналу', 'error');
    return;
  }

  if (isScreenSharing) {
    await stopScreenShare();
  } else {
    await startScreenShare();
  }
}

async function startScreenShare() {
  if (!voiceRoom) return;

  try {
    const lk = await loadLivekitSdk();
    const tracks = await lk.createLocalScreenTracks({ audio: false });
    const track = tracks[0];
    if (!track) {
      notify('Не удалось получить доступ к экрану', 'error');
      return;
    }

    // Publish the screen share track
    await voiceRoom.localParticipant.publishTrack(track, {
      name: 'screen-share',
      source: 'screen_share',
    });

    screenShareTrack = track;
    isScreenSharing = true;

    // Show local preview
    showScreenSharePreview(track, currentUser + ' (вы)');

    // Listen for track ended (user clicks "Stop sharing" in browser UI)
    const mediaTrack = track.mediaStreamTrack;
    if (mediaTrack) {
      mediaTrack.addEventListener('ended', () => {
        stopScreenShare();
      });
    }

    updateScreenShareButton();
    notify('📺 Демонстрация экрана запущена', 'success');
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      // User cancelled the screen share picker
      return;
    }
    notify('Ошибка демонстрации экрана: ' + error.message, 'error');
  }
}

async function stopScreenShare() {
  if (screenShareTrack) {
    try {
      await voiceRoom?.localParticipant?.unpublishTrack(screenShareTrack);
      screenShareTrack.stop();
    } catch (_) {}
    screenShareTrack = null;
  }

  isScreenSharing = false;
  hideScreenSharePreview();
  updateScreenShareButton();
  notify('Демонстрация экрана остановлена', 'info');
}

function showScreenSharePreview(track, label) {
  const container = document.getElementById('voiceScreenShareContainer');
  const video = document.getElementById('voiceScreenShareVideo');
  const labelEl = document.getElementById('voiceScreenShareLabel');
  if (!container || !video) return;

  // Attach video track to the video element
  const mediaStream = new MediaStream();
  const mediaTrack = track.mediaStreamTrack || track;
  if (mediaTrack instanceof MediaStreamTrack) {
    mediaStream.addTrack(mediaTrack);
  }
  video.srcObject = mediaStream;
  video.play().catch(() => {});

  if (labelEl) labelEl.textContent = label || 'Демонстрация экрана';
  container.style.display = '';

  // Click to open fullscreen
  video.onclick = () => {
    if (video.requestFullscreen) video.requestFullscreen();
    else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
  };
}

function hideScreenSharePreview() {
  const container = document.getElementById('voiceScreenShareContainer');
  const video = document.getElementById('voiceScreenShareVideo');
  if (video) {
    video.srcObject = null;
    video.onclick = null;
  }
  if (container) container.style.display = 'none';
}

function updateScreenShareButton() {
  const btn = document.getElementById('voiceScreenShareBtn');
  if (!btn) return;
  btn.classList.toggle('active', isScreenSharing);
  const icon = btn.querySelector('.material-icons-round');
  if (icon) icon.textContent = isScreenSharing ? 'stop_screen_share' : 'screen_share';
  const text = btn.querySelector('.voice-btn-text');
  if (text) text.textContent = isScreenSharing ? 'Остановить' : 'Экран';
  btn.disabled = !currentVoiceChannel;
}

// Handle remote screen shares via existing room events
function handleRemoteScreenTrack(track, participant) {
  if (!track || track.kind !== 'video') return;
  const source = String(track.source || track.name || '').toLowerCase();
  if (!source.includes('screen')) return;

  remoteScreenShareTrack = track;
  const name = participant?.name || participant?.identity || 'Участник';

  // Attach remote screen share
  const mediaTrack = track.mediaStreamTrack;
  if (mediaTrack) {
    showScreenSharePreview(track, name);
  }
}

function handleRemoteScreenTrackRemoved(track) {
  if (!track || track.kind !== 'video') return;
  const source = String(track.source || track.name || '').toLowerCase();
  if (!source.includes('screen')) return;

  remoteScreenShareTrack = null;
  if (!isScreenSharing) {
    hideScreenSharePreview();
  }
}

// Patch bindRoomEvents to also handle screen share tracks
const _originalBindRoomEvents = bindRoomEvents;
bindRoomEvents = function(room, RoomEvent, generation) {
  _originalBindRoomEvents(room, RoomEvent, generation);

  room
    .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (generation !== voiceConnectionGeneration) return;
      handleRemoteScreenTrack(track, participant);
    })
    .on(RoomEvent.TrackUnsubscribed, (track) => {
      if (generation !== voiceConnectionGeneration) return;
      handleRemoteScreenTrackRemoved(track);
    });
};

// Extend resetVoiceState to clean up screen share
const _originalResetVoiceState = resetVoiceState;
resetVoiceState = function() {
  if (screenShareTrack) {
    try { screenShareTrack.stop(); } catch(_) {}
    screenShareTrack = null;
  }
  isScreenSharing = false;
  remoteScreenShareTrack = null;
  hideScreenSharePreview();
  updateScreenShareButton();
  _originalResetVoiceState();
};

// Extend updateVoiceUiState to also update screen share button
const _originalUpdateVoiceUiState = updateVoiceUiState;
updateVoiceUiState = function() {
  _originalUpdateVoiceUiState();
  updateScreenShareButton();
};

// ... existing updateVoiceUiState call ...
updateVoiceUiState();
renderVoiceParticipants();

function renderVoiceChannelUsers(voiceUsersByChannel) {
  // Clear all voice channel containers first
  document.querySelectorAll('.voice-channel-users').forEach(el => {
    el.innerHTML = '';
    el.style.display = 'none';
  });

  if (!voiceUsersByChannel) return;

  // Render users for each channel
  Object.entries(voiceUsersByChannel).forEach(([channelId, users]) => {
    const container = document.getElementById(`voiceUsers-${channelId}`);
    if (!container || !users || !users.length) return;

    container.style.display = '';
    container.innerHTML = users.map(u => {
      const color = typeof getUserColor === 'function' ? getUserColor(u.name) : '#888';
      const avatarUrl = userAvatars && userAvatars[u.name];
      const avatarStyle = avatarUrl 
        ? `background-image:url('${escapeJsString(avatarUrl)}')` 
        : `background:${color}`;
      const avatarContent = avatarUrl ? '' : (u.name[0] || '?').toUpperCase();
      
      return `
        <div class="voice-channel-user">
          <div class="voice-channel-user-avatar" style="${avatarStyle}">${avatarContent}</div>
          <div class="voice-channel-user-name">${escHtml(u.name)}</div>
        </div>
      `;
    }).join('');
  });
}
