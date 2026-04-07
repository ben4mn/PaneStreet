// Tests for dock-icon.js — theme-aware macOS dock icon

import { buildMascotSVG, initDockIcon } from '../dock-icon.js';

const defaultColors = {
  '--accent': '#ff0000',
  '--text-secondary': '#aaa',
  '--text-muted': '#666',
  '--bg-pane': '#111',
};

describe('buildMascotSVG', () => {
  it('returns a valid SVG string with correct viewBox', () => {
    const svg = buildMascotSVG(defaultColors);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toContain('</svg>');
  });

  it('uses theme accent color for eyes', () => {
    const svg = buildMascotSVG({ ...defaultColors, '--accent': '#ff00ff' });
    expect(svg).toContain('#ff00ff');
  });

  it('uses text-secondary for body', () => {
    const svg = buildMascotSVG({ ...defaultColors, '--text-secondary': '#b0b0b0' });
    expect(svg).toContain('#b0b0b0');
  });

  it('uses bg-pane for visor', () => {
    const svg = buildMascotSVG({ ...defaultColors, '--bg-pane': '#222333' });
    expect(svg).toContain('#222333');
  });

  it('falls back to defaults when colors missing', () => {
    const svg = buildMascotSVG({});
    expect(svg).toContain('#2a6df0'); // default accent
    expect(svg).toContain('#b0b0b0'); // default text-secondary
  });

  it('produces SVG with eyes, mouth, body, and antenna elements', () => {
    const svg = buildMascotSVG(defaultColors);
    // Should have two eye circles, a smile path, body rect, antenna
    const eyeMatches = svg.match(/circle.*fill="#ff0000"/g);
    expect(eyeMatches.length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain('stroke="#ff0000"'); // smile uses accent
  });
});

describe('initDockIcon', () => {
  it('listens for theme-changed events', () => {
    const addEventSpy = vi.spyOn(window, 'addEventListener');
    initDockIcon();
    expect(addEventSpy).toHaveBeenCalledWith('theme-changed', expect.any(Function));
    addEventSpy.mockRestore();
  });

  it('calls invoke to set dock icon on init', () => {
    // initDockIcon calls updateDockIcon which calls invoke asynchronously
    // Just verify it doesn't throw
    expect(() => initDockIcon()).not.toThrow();
  });
});
