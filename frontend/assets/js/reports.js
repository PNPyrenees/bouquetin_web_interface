let loginEnCours = false;

const ROLE_LABELS = {
  pnp_bqt_reader: 'Lecteur',
  pnp_bqt_writer: 'Administrateur'
};

const ROLE_INITIALES = {
  pnp_bqt_reader: 'LC',
  pnp_bqt_writer: 'AD'
};

/* Exécution synchrone : le header est déjà analysé, mais le navigateur ne peut pas
 * effectuer son premier rendu avant la fin de ce script classique. */
const tokenAuChargement = sessionStorage.getItem('bqt_token');
if (tokenAuChargement) afficherSession(tokenAuChargement);

/**
 * AUTHENTIFICATION
 * Reproduit le pattern d'app.js/individuals.js — overlay #loginScreen affiché/masqué
 * en JS, pas de redirection HTTP, jeton en sessionStorage.
 */

function afficherLoginScreen() {
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.style.display = 'flex';
  const userChip = document.getElementById('userChip');
  if (userChip) userChip.style.display = 'none';
}

function masquerLoginScreen() {
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.style.display = 'none';
}

function afficherSession(token) {
  try {
    const tokenPayload = JSON.parse(atob(token.split('.')[1]));
    const role = tokenPayload.role || tokenPayload.sub || 'Utilisateur';
    const initiales = ROLE_INITIALES[role] || role.slice(0, 2).toUpperCase();
    const sessionLabel = ROLE_LABELS[role] || role;
    const userChip = document.getElementById('userChip');
    if (userChip) {
      document.getElementById('sessionAvatar').textContent = initiales;
      document.getElementById('sessionRole').textContent = sessionLabel;
      userChip.style.display = 'flex';
    }
  } catch (err) {
    console.warn('Décodage du token échoué:', err);
  }
}

function deconnecter() {
  sessionStorage.removeItem('bqt_token');
  window.location.replace('../index.html');
}

// Memoise l'import dynamique de api.js — script classique (pas type="module", cf.
// commentaire en tete de fichier), donc pas d'import statique possible. Un seul point
// d'acces au module dans le code source plutot qu'un import() duplique a chaque usage
// (login, chargement des KPI) — le moteur JS cache deja le module en interne, ceci
// n'evite qu'une redite textuelle, pas un vrai cout de performance.
let apiPromise = null;
function chargerApi() {
  if (!apiPromise) apiPromise = import('./api.js');
  return apiPromise;
}

/**
 * Charge le nombre total d'individus (t_animal) et l'affiche dans la grille — le "-"
 * deja present dans le HTML sert d'etat de chargement, puis d'etat degrade en cas
 * d'echec (pas de message intrusif pour un simple chiffre non critique).
 */
async function chargerKpiTotalIndividus(token) {
  try {
    const { fetchCountAnimaux } = await chargerApi();
    const total = await fetchCountAnimaux(token);
    document.getElementById('kpiTotalIndividus').textContent = total.toLocaleString('fr-FR');
  } catch (err) {
    console.error('Échec chargement du nombre total d\'individus:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Flatpickr — Periode (JJ/MM/AAAA), meme pattern que app.js/individuals.js. Pas
  // encore d'effet sur les chiffres affiches a cette etape (etape 5 du plan) — seul
  // le fonctionnement visuel du selecteur est branche ici.
  if (window.flatpickr) {
    flatpickr('#reportsDateFrom', {
      dateFormat: 'd/m/Y',
      allowInput: true,
      locale: 'fr',
      onClose(selectedDates, dateStr) {
        if (dateStr) {
          document.getElementById('reportsDateFrom').value = dateStr;
          document.getElementById('reportsDateFrom').dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
    flatpickr('#reportsDateTo', {
      dateFormat: 'd/m/Y',
      allowInput: true,
      locale: 'fr',
      onClose(selectedDates, dateStr) {
        if (dateStr) {
          document.getElementById('reportsDateTo').value = dateStr;
          document.getElementById('reportsDateTo').dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
  }

  document.getElementById('sessionTrigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('sessionMenu');
    const chevron = document.getElementById('sessionChevron');
    const isOpen = menu.style.display !== 'none';
    menu.style.display = isOpen ? 'none' : 'block';
    chevron.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
  });

  document.addEventListener('click', () => {
    const menu = document.getElementById('sessionMenu');
    const chevron = document.getElementById('sessionChevron');
    if (menu && menu.style.display !== 'none') {
      menu.style.display = 'none';
      if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
  });

  document.getElementById('btnDeconnexion')?.addEventListener('click', deconnecter);

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginEnCours) return;
    loginEnCours = true;
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';
    try {
      const { login } = await chargerApi();
      const token = await login(username, password);
      sessionStorage.setItem('bqt_token', token);
      window.location.replace('../index.html');
    } catch (err) {
      errorEl.textContent = 'Identifiants incorrects ou serveur inaccessible.';
      console.error(err);
    } finally {
      loginEnCours = false;
    }
  });

  if (tokenAuChargement) {
    masquerLoginScreen();
    chargerKpiTotalIndividus(tokenAuChargement);
  } else {
    afficherLoginScreen();
  }
});
