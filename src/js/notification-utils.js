// Notification utilities — grouping logic

/**
 * Group consecutive notifications with the same session and status.
 * Returns a new array where consecutive duplicates are collapsed.
 */
export function groupNotifications(history) {
  const groups = [];
  for (const n of history) {
    const last = groups[groups.length - 1];
    if (last && last.sessionId === n.sessionId && last.status === n.status) {
      last.count++;
      last.timestamps.push(n.timestamp);
    } else {
      groups.push({ ...n, count: 1, timestamps: [n.timestamp] });
    }
  }
  return groups;
}

export async function sendDesktopNotification(invoke, options, onError) {
  const report = (err) => {
    if (typeof onError === 'function') onError(err);
    else console.error('[PaneStreet] notification failed:', err);
  };
  let granted;
  try {
    granted = await invoke('plugin:notification|is_permission_granted');
  } catch (err) {
    report(err);
    return;
  }
  if (!granted) return;
  try {
    await invoke('plugin:notification|notify', { options });
  } catch (err) {
    report(err);
  }
}
