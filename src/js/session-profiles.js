// Session Profiles — save/load named terminal profiles

let profiles = [];

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('ps-profiles');
    profiles = raw ? JSON.parse(raw) : [];
  } catch { profiles = []; }
}

function persistToStorage() {
  localStorage.setItem('ps-profiles', JSON.stringify(profiles));
}

export function getProfiles() {
  return [...profiles];
}

export function saveProfile(profile) {
  const existing = profiles.findIndex(p => p.name === profile.name);
  const entry = {
    id: profile.id || crypto.randomUUID?.() || String(Date.now()),
    name: profile.name || 'Untitled',
    shell: profile.shell || '',
    cwd: profile.cwd || '',
    startupCommand: profile.startupCommand || '',
    autoStartClaude: profile.autoStartClaude || false,
  };

  if (existing >= 0) {
    entry.id = profiles[existing].id;
    profiles[existing] = entry;
  } else {
    profiles.push(entry);
  }
  persistToStorage();
}

export function deleteProfile(name) {
  profiles = profiles.filter(p => p.name !== name);
  persistToStorage();
}

export function resetProfiles() {
  loadFromStorage();
}

// Initialize on module load
loadFromStorage();
