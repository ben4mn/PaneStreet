import { TrayIcon } from '../vendor/tauri-api/tray.js';
import { Image } from '../vendor/tauri-api/image.js';

const ICON_SIZE = 44; // 22pt @2x for macOS tray
let trayInstance = null;

/**
 * Build an SVG string of the Pane mascot head, colored to the given theme.
 * Kept minimal so it reads well at 22×22pt.
 */
function buildMascotSVG(colors) {
  const accent = colors['--accent'] || '#2a6df0';
  const body = colors['--text-secondary'] || '#b0b0b0';
  const visor = colors['--bg-pane'] || '#111111';
  const muted = colors['--text-muted'] || '#888888';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44">
  <!-- Antenna -->
  <line x1="22" y1="8" x2="21" y2="3" stroke="${body}" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="21" cy="2.5" r="2.2" fill="${accent}"/>

  <!-- Head shell -->
  <rect x="8" y="7" width="28" height="22" rx="10" fill="${body}"/>
  <!-- Head top shine -->
  <path d="M17 8 Q22 6.5 27 8" stroke="#fff" stroke-width="0.8" opacity="0.25" fill="none" stroke-linecap="round"/>

  <!-- Visor / face plate -->
  <rect x="12" y="11" width="20" height="15" rx="6.5" fill="${visor}"/>

  <!-- Ear discs -->
  <ellipse cx="8.5" cy="18" rx="3" ry="3.2" fill="${body}"/>
  <ellipse cx="8.5" cy="18" rx="1.6" ry="1.8" fill="${muted}" opacity="0.4"/>
  <ellipse cx="35.5" cy="18" rx="3" ry="3.2" fill="${body}"/>
  <ellipse cx="35.5" cy="18" rx="1.6" ry="1.8" fill="${muted}" opacity="0.4"/>

  <!-- Eyes -->
  <circle cx="18" cy="15.5" r="2.8" fill="${accent}"/>
  <circle cx="26" cy="15.5" r="2.8" fill="${accent}"/>
  <!-- Eye highlights -->
  <circle cx="19" cy="14.5" r="0.9" fill="#fff" opacity="0.5"/>
  <circle cx="27" cy="14.5" r="0.9" fill="#fff" opacity="0.5"/>

  <!-- Smile -->
  <path d="M19 22 Q22 25 25 22" stroke="${accent}" stroke-width="1.3" fill="none" stroke-linecap="round"/>

  <!-- Body peek (just the top, keeps it compact) -->
  <rect x="15" y="30" width="14" height="6" rx="3.5" fill="${body}"/>
  <rect x="15.5" y="30.5" width="13" height="2.5" rx="2" fill="#fff" opacity="0.08"/>

  <!-- Arms -->
  <rect x="10" y="30.5" width="5" height="4.5" rx="2.2" fill="${body}"/>
  <rect x="29" y="30.5" width="5" height="4.5" rx="2.2" fill="${body}"/>

  <!-- Feet -->
  <rect x="16" y="36" width="5" height="3" rx="1.2" fill="${body}"/>
  <rect x="23" y="36" width="5" height="3" rx="1.2" fill="${body}"/>
  <rect x="15" y="38.5" width="6.5" height="2.2" rx="1" fill="${muted}" opacity="0.45"/>
  <rect x="22.5" y="38.5" width="6.5" height="2.2" rx="1" fill="${muted}" opacity="0.45"/>

  <!-- Shadow -->
  <ellipse cx="22" cy="42" rx="11" ry="1.5" fill="#000" opacity="0.1"/>
</svg>`;
}

/**
 * Render an SVG string onto an offscreen canvas and return RGBA pixel data.
 */
function svgToRGBA(svgString, size) {
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

    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render tray icon SVG'));
    };

    img.src = url;
  });
}

/**
 * Create or update the system tray icon with the current theme colors.
 */
export async function updateTrayIcon(themeColors) {
  try {
    const svg = buildMascotSVG(themeColors);
    const rgba = await svgToRGBA(svg, ICON_SIZE);
    const image = await Image.new(Array.from(rgba), ICON_SIZE, ICON_SIZE);

    if (trayInstance) {
      await trayInstance.setIcon(image);
    } else {
      trayInstance = await TrayIcon.new({
        icon: image,
        tooltip: 'Pane Street',
        id: 'panestreet-tray',
      });
    }
  } catch (err) {
    console.warn('[tray-icon] Failed to update tray icon:', err);
  }
}

/**
 * Initialize the tray icon using current CSS variable values (from applied theme).
 */
export function initTrayIcon() {
  const style = getComputedStyle(document.documentElement);
  const colors = {
    '--accent': style.getPropertyValue('--accent').trim() || '#2a6df0',
    '--text-secondary': style.getPropertyValue('--text-secondary').trim() || '#b0b0b0',
    '--text-muted': style.getPropertyValue('--text-muted').trim() || '#888888',
    '--bg-pane': style.getPropertyValue('--bg-pane').trim() || '#111111',
  };
  updateTrayIcon(colors);

  // Listen for theme changes and update tray
  window.addEventListener('theme-changed', (e) => {
    if (e.detail && e.detail.colors) {
      updateTrayIcon(e.detail.colors);
    }
  });
}
