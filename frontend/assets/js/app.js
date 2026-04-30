import { login, fetchLocations } from './api.js';
import { initMap, renderPoints } from './map.js';
import { ROLES } from './config.js';

const DEV_MODE = true;
async function startApp(token) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mapScreen').style.display = 'block';
  initMap('map', 'popup');
  const status = document.getElementById('status');
  status.textContent = 'Chargement des données...';
  const locations = await fetchLocations(token);
  const count = renderPoints(locations);
  status.textContent = `✓ ${count} positions chargées`;
  setTimeout(() => status.style.display = 'none', 3000);
}

if (DEV_MODE) {
  login(ROLES.READER, 'appBQT!6465').then(token => startApp(token));
} else {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';
    try {
      const token = await login(username, password);
      await startApp(token);
    } catch (err) {
      errorEl.textContent = 'Identifiants incorrects ou serveur inaccessible.';
      console.error(err);
    }
  });
}