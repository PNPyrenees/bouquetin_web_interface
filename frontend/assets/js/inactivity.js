(async () => {
  const token = localStorage.getItem('bqt_token');
  if (!token) return;

  const { INACTIVITY_DELAY_MINUTES } = await import('./config.js');
  if (!INACTIVITY_DELAY_MINUTES) return;

  const delay = INACTIVITY_DELAY_MINUTES * 60 * 1000;
  const loginPath = window.location.pathname.includes('/pages/') ? '../login.html' : 'login.html';

  let timer = null;
  function reset() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      localStorage.removeItem('bqt_token');
      window.location.replace(loginPath);
    }, delay);
  }

  ['mousemove', 'keydown', 'click', 'scroll'].forEach(event => {
    document.addEventListener(event, reset, { passive: true });
  });
  reset();
})();
