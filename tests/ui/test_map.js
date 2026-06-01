import { API_URL, ROLES, DEV_PASSWORD, DEFAULT_CENTER, DEFAULT_ZOOM, LAMBERT93, ZOOM_POINT_SINGLE } from '../../frontend/assets/js/config.js';
import { login } from '../../frontend/assets/js/api.js';
import { initMap, renderPoints } from '../../frontend/assets/js/map.js';

console.log('Test Map JS chargé');

// Login et affichage minimal de la carte
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  try {
    const token = await login(username, password);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mapScreen').style.display = 'block';
    initMap('map', 'popup');
    console.log('Carte initialisée - token:', token ? 'ok' : 'manquant');

    // Expositions debug
    window._token = token;
  } catch (err) {
    errorEl.textContent = 'Identifiants incorrects ou serveur inaccessible.';
    console.error(err);
  }
});
