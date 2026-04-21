import { debounce, settingsChanged } from '../timing-utils.js';

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('delays execution by specified ms', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('passes the latest args only', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    debounced('b');
    debounced('c');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('resets timer on each call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(80);
    debounced();
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('fires independently after each debounce window', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('first');
    vi.advanceTimersByTime(100);
    debounced('second');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'first');
    expect(fn).toHaveBeenNthCalledWith(2, 'second');
  });
});

describe('settingsChanged', () => {
  it('returns false for identical objects', () => {
    const a = { theme: 'dark', fontSize: 14 };
    const b = { theme: 'dark', fontSize: 14 };
    expect(settingsChanged(a, b)).toBe(false);
  });

  it('returns true when a value differs', () => {
    const a = { theme: 'dark', fontSize: 14 };
    const b = { theme: 'light', fontSize: 14 };
    expect(settingsChanged(a, b)).toBe(true);
  });

  it('returns true when keys differ', () => {
    const a = { theme: 'dark' };
    const b = { theme: 'dark', fontSize: 14 };
    expect(settingsChanged(a, b)).toBe(true);
  });

  it('returns false for two empty objects', () => {
    expect(settingsChanged({}, {})).toBe(false);
  });

  it('returns true for nested value change', () => {
    const a = { nested: { a: 1 } };
    const b = { nested: { a: 2 } };
    expect(settingsChanged(a, b)).toBe(true);
  });
});
