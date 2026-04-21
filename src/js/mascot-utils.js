export function shouldShowSpeech({ windowFocused, priority, onCooldown, withinBudget }) {
  if (priority) return true;
  if (!windowFocused) return false;
  if (onCooldown) return false;
  if (!withinBudget) return false;
  return true;
}
