import { login, fetchAnimals } from './api.js';
import { ROLES, DEV_PASSWORD } from './config.js';

const DEV_MODE = true;

async function startApp(token) {
  try {
    const animals = await fetchAnimals(token);
    const listeIndividus = document.getElementById('listeIndividus');
    const searchIndividu = document.getElementById('searchIndividu');

    if (listeIndividus) {
      // Grouper par première lettre

      animals.forEach(ani => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.innerHTML = `<input type="checkbox" value="${ani.ani_id}"> ${ani.ani_nom}`;
        listeIndividus.appendChild(label);
      });
      // Limiter la hauteur avec scroll
      listeIndividus.style.maxHeight = '200px';
      listeIndividus.style.overflowY = 'auto';
    }

    // Filtre de recherche
    if (searchIndividu && listeIndividus) {
      searchIndividu.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();

        if (val === 0) {
          // Réinitialiser — fermer tous les groupes, tout afficher
          listeIndividus.querySelectorAll('details').forEach(details => {
            details.removeAttribute('open');
            details.style.display = 'block';
            details.querySelectorAll('.checkbox-label').forEach(label => {
              label.style.display = 'flex';
            });
          });
          return;
        }

        // Mode recherche — afficher directement les noms sans les lettres
        listeIndividus.querySelectorAll('details').forEach(details => {
          let hasMatch = false;

          details.querySelectorAll('.checkbox-label').forEach(label => {
            const match = label.textContent.toLowerCase().includes(val);
            label.style.display = match ? 'flex' : 'none';
            if (match) hasMatch = true;
          });

          if (hasMatch) {
            details.setAttribute('open', '');
            details.style.display = 'block';
            details.querySelector('summary').style.display = 'none';
          } else {
            details.style.display = 'none';
          }
        });
      });
    }

  } catch (err) {
    console.error('Erreur chargement individus:', err);
  }
}

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

