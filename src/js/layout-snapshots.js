// Layout Snapshots — save/restore named workspace layouts

let snapshots = [];

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('ps-layout-snapshots');
    snapshots = raw ? JSON.parse(raw) : [];
  } catch { snapshots = []; }
}

function persistToStorage() {
  localStorage.setItem('ps-layout-snapshots', JSON.stringify(snapshots));
}

export function getSnapshots() {
  return [...snapshots];
}

export function saveSnapshot(name, state) {
  const existing = snapshots.findIndex(s => s.name === name);
  const entry = {
    id: crypto.randomUUID?.() || String(Date.now()),
    name,
    createdAt: Date.now(),
    state,
  };

  if (existing >= 0) {
    entry.id = snapshots[existing].id;
    snapshots[existing] = entry;
  } else {
    snapshots.push(entry);
  }
  persistToStorage();
}

export function deleteSnapshot(name) {
  snapshots = snapshots.filter(s => s.name !== name);
  persistToStorage();
}

export function resetSnapshots() {
  loadFromStorage();
}

loadFromStorage();
