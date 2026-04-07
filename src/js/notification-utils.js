// Notification utilities — grouping logic

/**
 * Group consecutive notifications with the same session and status.
 * Returns a new array where consecutive duplicates are collapsed.
 */
export function groupNotifications(history) {
  const groups = [];
  for (const n of history) {
    const last = groups[groups.length - 1];
    if (last && last.sessionIndex === n.sessionIndex && last.status === n.status) {
      last.count++;
      last.timestamps.push(n.timestamp);
    } else {
      groups.push({ ...n, count: 1, timestamps: [n.timestamp] });
    }
  }
  return groups;
}
