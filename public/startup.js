(() => {
  const fallback = () => document.getElementById('startup-fallback');
  const retry = document.getElementById('startup-fallback-retry');
  if (retry) retry.addEventListener('click', () => window.location.reload());

  const showStartupProblem = () => {
    if (!fallback()) return;
    const offline = navigator.onLine === false;
    const title = document.getElementById('startup-fallback-title');
    const message = document.getElementById('startup-fallback-message');
    if (title) title.textContent = offline ? 'No internet connection' : 'My Passwords could not finish loading';
    if (message) message.textContent = offline
      ? 'A vault already saved on this device remains encrypted and unchanged. Reconnect and try again if the app files have not yet been saved for offline use.'
      : 'Refresh the page to try again. Your encrypted vault data has not been changed.';
    if (retry) retry.style.display = 'inline-flex';
  };

  window.setTimeout(showStartupProblem, 3500);
  window.addEventListener('offline', showStartupProblem);
  window.addEventListener('online', () => {
    if (fallback()) window.location.reload();
  });
})();
