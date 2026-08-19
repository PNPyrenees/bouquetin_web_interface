import { login } from './api.js';

let loginEnCours = false;

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loginEnCours) return;
  loginEnCours = true;
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  try {
    const token = await login(username, password);
    sessionStorage.setItem('bqt_token', token);
    window.location.replace('index.html');
  } catch (err) {
    errorEl.textContent = 'Identifiants incorrects ou serveur inaccessible.';
    console.error(err);
  } finally {
    loginEnCours = false;
  }
});
