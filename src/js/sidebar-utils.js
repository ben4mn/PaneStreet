export function computeCardData(session) {
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    minimized: session.minimized,
    shortCwd: shortenCwd(session.cwd),
  };
}

function shortenCwd(cwd) {
  if (!cwd) return '';
  const parts = cwd.split('/').filter(Boolean);
  if (parts.length <= 2) return cwd;
  return parts.slice(-2).join('/');
}

export function shouldPatchCard(oldCard, newCard) {
  return (
    oldCard.name !== newCard.name ||
    oldCard.status !== newCard.status ||
    oldCard.minimized !== newCard.minimized ||
    oldCard.shortCwd !== newCard.shortCwd
  );
}

export function diffCards(oldList, newList) {
  if (oldList.length !== newList.length) {
    return newList.map((_, i) => i);
  }
  const changed = [];
  for (let i = 0; i < newList.length; i++) {
    if (shouldPatchCard(oldList[i], newList[i])) {
      changed.push(i);
    }
  }
  return changed;
}
