const listeners = new Set();
let timer = 0;

export function onMinute(fn) {
  listeners.add(fn);
  if (!timer) {
    timer = setInterval(() => {
      listeners.forEach((listener) => listener());
    }, 30000);
    if (typeof timer === 'object' && timer && typeof timer.unref === 'function') timer.unref();
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = 0;
    }
  };
}
