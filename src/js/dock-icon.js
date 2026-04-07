const { invoke } = window.__TAURI__?.core ?? { invoke: () => Promise.resolve() };

const ICON_SIZE = 512;

/**
 * Build an SVG string of the Pane mascot, sized for a 512x512 dock icon.
 * Uses theme colors for accent (eyes/mouth), body, visor, and muted elements.
 */
export function buildMascotSVG(colors) {
  const accent = colors['--accent'] || '#2a6df0';
  const body = colors['--text-secondary'] || '#b0b0b0';
  const visor = colors['--bg-pane'] || '#111111';
  const muted = colors['--text-muted'] || '#888888';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Background: rounded square for dock icon -->
  <rect width="512" height="512" rx="110" fill="${visor}"/>

  <!-- Antenna -->
  <line x1="256" y1="100" x2="248" y2="45" stroke="${body}" stroke-width="10" stroke-linecap="round"/>
  <circle cx="248" cy="38" r="16" fill="${accent}"/>

  <!-- Head shell -->
  <rect x="100" y="90" width="312" height="190" rx="90" fill="${body}"/>
  <!-- Head shine -->
  <path d="M200 96 Q256 80 312 96" stroke="#fff" stroke-width="5" opacity="0.2" fill="none" stroke-linecap="round"/>

  <!-- Visor / face plate -->
  <rect x="138" y="125" width="236" height="140" rx="60" fill="${visor}"/>

  <!-- Ear discs -->
  <ellipse cx="102" cy="200" rx="30" ry="34" fill="${body}"/>
  <ellipse cx="102" cy="200" rx="17" ry="20" fill="${muted}" opacity="0.4"/>
  <ellipse cx="410" cy="200" rx="30" ry="34" fill="${body}"/>
  <ellipse cx="410" cy="200" rx="17" ry="20" fill="${muted}" opacity="0.4"/>

  <!-- Eyes -->
  <circle cx="210" cy="180" r="28" fill="${accent}"/>
  <circle cx="302" cy="180" r="28" fill="${accent}"/>
  <!-- Eye highlights -->
  <circle cx="220" cy="170" r="9" fill="#fff" opacity="0.5"/>
  <circle cx="312" cy="170" r="9" fill="#fff" opacity="0.5"/>

  <!-- Smile -->
  <path d="M218 240 Q256 275 294 240" stroke="${accent}" stroke-width="10" fill="none" stroke-linecap="round"/>

  <!-- Body -->
  <rect x="170" y="295" width="172" height="80" rx="36" fill="${body}"/>
  <!-- Body highlight -->
  <rect x="176" y="300" width="160" height="30" rx="18" fill="#fff" opacity="0.08"/>

  <!-- Arms -->
  <rect x="114" y="300" width="56" height="60" rx="24" fill="${body}"/>
  <rect x="342" y="300" width="56" height="60" rx="24" fill="${body}"/>

  <!-- Legs -->
  <rect x="190" y="375" width="44" height="45" rx="14" fill="${body}"/>
  <rect x="278" y="375" width="44" height="45" rx="14" fill="${body}"/>
  <!-- Feet -->
  <rect x="178" y="414" width="68" height="24" rx="10" fill="${muted}" opacity="0.5"/>
  <rect x="266" y="414" width="68" height="24" rx="10" fill="${muted}" opacity="0.5"/>

  <!-- Shadow -->
  <ellipse cx="256" cy="460" rx="120" ry="16" fill="#000" opacity="0.12"/>
</svg>`;
}

/**
 * Render SVG to canvas and return RGBA pixel data.
 * Exported for test override.
 */
export function svgToRGBA(svgString, size) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new window.Image();

    img.onload = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const imageData = ctx.getImageData(0, 0, size, size);
      resolve(new Uint8Array(imageData.data.buffer));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render dock icon SVG'));
    };

    img.src = url;
  });
}

/**
 * Generate a themed icon and set it as the macOS dock icon.
 */
export async function updateDockIcon(themeColors) {
  try {
    const svg = buildMascotSVG(themeColors);
    const rgba = await svgToRGBA(svg, ICON_SIZE);
    await invoke('set_dock_icon', {
      rgba: Array.from(rgba),
      width: ICON_SIZE,
      height: ICON_SIZE,
    });
  } catch (err) {
    console.warn('[dock-icon] Failed to update dock icon:', err);
  }
}

/**
 * Initialize dock icon from current theme and listen for changes.
 */
export function initDockIcon() {
  const style = getComputedStyle(document.documentElement);
  const colors = {
    '--accent': style.getPropertyValue('--accent').trim() || '#2a6df0',
    '--text-secondary': style.getPropertyValue('--text-secondary').trim() || '#b0b0b0',
    '--text-muted': style.getPropertyValue('--text-muted').trim() || '#888888',
    '--bg-pane': style.getPropertyValue('--bg-pane').trim() || '#111111',
  };
  updateDockIcon(colors);

  window.addEventListener('theme-changed', (e) => {
    if (e.detail && e.detail.colors) {
      updateDockIcon(e.detail.colors);
    }
  });
}
