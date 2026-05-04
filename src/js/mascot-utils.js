export function shouldShowSpeech({ windowFocused, priority, onCooldown, withinBudget }) {
  if (priority) return true;
  if (!windowFocused) return false;
  if (onCooldown) return false;
  if (!withinBudget) return false;
  return true;
}

const MASCOT_KEYS = [
  'ps-robot-enabled',
  'ps-robot-standstill',
  'ps-robot-location',
  'ps-robot-frequency',
];

export function resetMascotPreferences() {
  for (const key of MASCOT_KEYS) {
    localStorage.removeItem(key);
  }
}

const MASCOT_INIT_FLAG = '__psMascotInitialized';

export function claimMascotInit(el) {
  if (!el) return false;
  if (el[MASCOT_INIT_FLAG]) return false;
  el[MASCOT_INIT_FLAG] = true;
  return true;
}

export function registerMascotActions({ registerPaletteAction, onReset }) {
  registerPaletteAction('reset-easter-eggs', 'Reset Easter Eggs (Mascot)', null, () => {
    resetMascotPreferences();
    if (typeof onReset === 'function') onReset();
  });
}

export function getMascotDiagnostics() {
  const enabledRaw = localStorage.getItem('ps-robot-enabled');
  const standstillRaw = localStorage.getItem('ps-robot-standstill');
  const mountedEl = typeof document !== 'undefined'
    ? document.getElementById('footer-mascot')
    : null;

  return {
    enabled: enabledRaw === null ? true : enabledRaw !== 'false',
    standstill: standstillRaw === 'true',
    location: localStorage.getItem('ps-robot-location') || 'footer',
    frequency: localStorage.getItem('ps-robot-frequency') || 'medium',
    mounted: !!mountedEl,
  };
}
