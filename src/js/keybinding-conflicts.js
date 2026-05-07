// Pure conflict detection and display formatting for keybindings.
// Caller supplies an array of { id, key, meta, shift, alt, ctrl };
// we group by canonical shortcut signature and surface every group
// with more than one member.

function normalizeKey(key) {
  if (!key) return null;
  return String(key).length === 1 ? String(key).toLowerCase() : String(key);
}

function signature(binding) {
  const key = normalizeKey(binding.key);
  if (!key) return null;
  return [
    binding.meta ? '⌘' : '',
    binding.ctrl ? '⌃' : '',
    binding.alt ? '⌥' : '',
    binding.shift ? '⇧' : '',
    key,
  ].join('|');
}

export function findKeybindingConflicts(bindings) {
  if (!Array.isArray(bindings)) return [];
  const groups = new Map();

  for (const b of bindings) {
    if (!b || !b.id) continue;
    const sig = signature(b);
    if (!sig) continue;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(b);
  }

  const conflicts = [];
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    conflicts.push({
      ids: members.map(m => m.id),
      shortcut: formatShortcut(members[0]),
    });
  }
  return conflicts;
}

export function formatShortcut(binding) {
  if (!binding || !binding.key) return '';
  const parts = [];
  if (binding.meta) parts.push('Cmd');
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  const key = String(binding.key);
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join('+');
}
