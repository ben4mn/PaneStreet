export function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function settingsChanged(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}
