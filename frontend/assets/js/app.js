import { login, fetchAnimals } from './api.js';
import { ROLES, DEV_PASSWORD } from './config.js';

const DEV_MODE = true;

async function startApp(token) {
  try {
    const animals = await fetchAnimals(token);
    const listeIndividus = document.getElementById('listeIndividus');
    const searchIndividu = document.getElementById('searchIndividu');

    if (listeIndividus) {
      // Liste simple triée par ordre alphabétique
      animals.sort((a, b) => (a.ani_nom || '').localeCompare(b.ani_nom || '')).forEach(ani => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.innerHTML = `<input type="checkbox" value="${ani.ani_id}"> ${ani.ani_nom}`;
        listeIndividus.appendChild(label);
      });

      // Limiter la hauteur avec scroll
      listeIndividus.style.maxHeight = '300px';
      listeIndividus.style.overflowY = 'auto';
    }

    // Filtre de recherche
    if (searchIndividu && listeIndividus) {
      searchIndividu.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();

        listeIndividus.querySelectorAll('.checkbox-label').forEach(label => {
          const match = label.textContent.toLowerCase().includes(val);
          label.style.display = match ? 'flex' : 'none';
        });
      });
    }

  } catch (err) {
    console.error('Erreur chargement individus:', err);
  }
}

document.getElementById('sidebarToggle').addEventListener('click', function () {
  const sidebar = document.getElementById('sidebar');
  const headerBottom = document.querySelector('.header-bottom');
  sidebar.classList.toggle('collapsed');
  if (sidebar.classList.contains('collapsed')) {
    this.textContent = '›';
    if (headerBottom) headerBottom.style.marginLeft = '0';
  } else {
    this.textContent = '‹';
    if (headerBottom) headerBottom.style.marginLeft = '330px';
  }
});

if (DEV_MODE) {
  login(ROLES.READER, DEV_PASSWORD).then(token => startApp(token));
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