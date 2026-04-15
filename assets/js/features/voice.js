// Voice chat MVP on LiveKit Cloud (classic script, no bundler).

let livekitSdkPromise = null;
let isVoiceDeafened = false;
const voiceAudioTrackData = new Map();
const voiceParticipantTrackMap = new Map();
const voiceSpeakingTimers = {};
let voiceAudioContext = null;
const VAD_THRESHOLD = 0.03;

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
        ? '<span class="voice-participant-local">Ваш уровень</span>'
        : `<input type="range" min="0" max="100" value="${volumeValue}" class="voice-volume-slider" data-action="change-volume" data-participant-id="${escHtml(
            p.id
          )}" />`;

      return `<div class="voice-participant${p.speaking ? ' speaking' : ''}" data-participant-id="${escHtml(
        p.id
      )}">
        <div class="voice-participant-row">
          <span class="voice-participant-name">${escHtml(p.name)}${p.isLocal ? ' (вы)' : ''}</span>
          <span class="voice-participant-indicator">${indicator}</span>
          <span class="voice-participant-state">${p.muted ? '🔇' : '🎤'}</span>
        </div>
        <div class="voice-participant-controls">${slider}</div>
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
      const participantId = getParticipantIdFromArgs(args);
      if (track) attachAudioTrack(track, participantId);
    })
    .on(RoomEvent.TrackUnsubscribed, (...args) => {
      const track = args.find((arg) => arg?.kind === 'audio') || args.find((arg) => arg?.track?.kind === 'audio')?.track;
      if (track) detachAudioTrack(track);
    })
    .on(RoomEvent.Disconnected, () => {
      cleanupVoiceAudioTracks();
      currentVoiceChannel = null;
      voiceRoom = null;
      isVoiceMuted = false;
      voiceParticipants = {};
      renderVoiceParticipants();
      updateVoiceUiState();
    });
}

function cleanupVoiceAudioTracks() {
  Array.from(voiceAudioTrackData.keys()).forEach((trackKey) => detachAudioTrackByKey(trackKey));
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

  cleanupVoiceAudioTracks();
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
