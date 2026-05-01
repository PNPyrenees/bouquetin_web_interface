import { login, fetchAnimals } from './api.js';
import { ROLES } from './config.js';
const DEV_MODE = true;
async function startApp(token) {
  console.log('App démarrée avec token');
  const dropdownList = document.getElementById('selectIndividu');
  const dropdownBtn = document.getElementById('btnIndividu');
  if (dropdownList && dropdownBtn) {
    console.log('Dropdown elements trouvés');
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownList.classList.toggle('show');
    });
    dropdownBtn.addEventListener('input', (e) => {
      const val = e.target.value.toLowerCase();
      dropdownList.classList.add('show');
      const items = dropdownList.querySelectorAll('.dropdown-item');
      items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(val) ? 'block' : 'none';
      });
    });
    document.addEventListener('click', (e) => {
      if (!dropdownList.contains(e.target) && e.target !== dropdownBtn) {
        dropdownList.classList.remove('show');
      }
    });
    const firstItem = dropdownList.querySelector('.dropdown-item');
    if (firstItem) {
      firstItem.addEventListener('click', () => {
        dropdownBtn.value = '';
        dropdownBtn.placeholder = '- Tous les individus -';
        dropdownList.classList.remove('show');
      });
    }
  }
  try {
    const animals = await fetchAnimals(token);
    if (dropdownList && dropdownBtn) {
      animals.forEach(ani => {
        const li = document.createElement('li');
        li.className = 'dropdown-item';
        li.textContent = ani.ani_nom;
        li.dataset.value = ani.ani_id;
        li.addEventListener('click', () => {
          dropdownBtn.value = ani.ani_nom;
          dropdownList.classList.remove('show');
        });
        dropdownList.appendChild(li);
      });
    }
  } catch (err) {
    console.error('Erreur chargement individus:', err);
  }
}
if (DEV_MODE) {
  login(ROLES.READER, 'adminpasword').then(token => startApp(token));
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
