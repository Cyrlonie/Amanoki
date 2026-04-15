// Presence and member management functions
import { members, memberDirectory, userColors, getUserColor } from './state.js';
import { supabase } from './config.js';

function addMember(name, status) {
  members[name] = { status, name };
  updateMemberList();
  updateOnlineCount();
}

function updateMemberList() {
  const memberList = document.getElementById('memberList');
  if (!memberList) return;

  memberList.innerHTML = '';

  // Sort members: online first, then by name
  const sortedMembers = Object.values(members).sort((a, b) => {
    if (a.status === 'online' && b.status !== 'online') return -1;
    if (a.status !== 'online' && b.status === 'online') return 1;
    return a.name.localeCompare(b.name);
  });

  sortedMembers.forEach(member => {
    const memberDiv = document.createElement('div');
    memberDiv.className = 'member-item';

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'member-avatar';
    const initial = member.name[0].toUpperCase();
    const color = userColors[member.name] || getUserColor(member.name);
    avatarDiv.textContent = initial;
    avatarDiv.style.background = color;
    memberDiv.appendChild(avatarDiv);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'member-name';
    nameDiv.textContent = member.name;
    memberDiv.appendChild(nameDiv);

    const statusDiv = document.createElement('div');
    statusDiv.className = `member-status ${member.status}`;
    memberDiv.appendChild(statusDiv);

    memberList.appendChild(memberDiv);
  });
}

function updateOnlineCount() {
  const onlineCount = Object.values(members).filter(m => m.status === 'online').length;
  const countEl = document.getElementById('onlineCount');
  if (countEl) {
    countEl.textContent = `${onlineCount} онлайн`;
  }
}

function updatePresenceFromState(state) {
  // Clear current members
  members = {};

  Object.values(state).forEach(presences => {
    presences.forEach(presence => {
      if (presence.user_id && presence.username) {
        const memberName = presence.username;
        members[memberName] = {
          name: memberName,
          status: 'online',
          user_id: presence.user_id
        };
      }
    });
  });

  // Add offline members from directory
  Object.values(memberDirectory).forEach(profile => {
    if (!members[profile.username]) {
      members[profile.username] = {
        name: profile.username,
        status: 'offline',
        user_id: profile.id
      };
    }
  });

  updateMemberList();
  updateOnlineCount();
}

export { addMember, updateMemberList, updateOnlineCount, updatePresenceFromState };