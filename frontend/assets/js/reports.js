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
 * Marque un KPI en echec de chargement — "?" discret + title explicatif au survol,
 * pour qu'un echec silencieux (permission RPC, timeout...) reste au moins detectable
 * sans ouvrir la console, sans pour autant afficher un message intrusif (cf. audit
 * durcissement, point 2).
 */
function marquerErreur(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '?';
  el.title = 'Échec du chargement de cet indicateur — voir la console pour le détail.';
}

/**
 * Convertit une date JJ/MM/AAAA (format Flatpickr/affichage) en ISO AAAA-MM-JJ, format
 * attendu par les filtres PostgREST (gte./lte.). Meme conversion que getPeriodesActives()
 * dans filters.js, dupliquee ici car reports.js n'importe pas filters.js (page
 * independante, pas de logique de filtre partagee).
 */
function convertirDateFrancaiseEnISO(dateStr) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return null;
  const [j, m, a] = dateStr.split('/');
  return `${a}-${m}-${j}`;
}

/**
 * FILTRES SIDEBAR (Population/Gestionnaire/Sexe/Periode) — filtrage cumulatif (ET
 * logique) en temps reel des 3 KPI filtrables, meme pattern que la page Individus. La
 * periode ne s'applique PAS a Individus recenses : fetchCountAnimaux ignore
 * date_from/date_to par construction (cf. api.js).
 */
function lireFiltresReports() {
  const dateFrom = document.getElementById('reportsDateFrom')?.value || '';
  const dateTo = document.getElementById('reportsDateTo')?.value || '';
  return {
    population: document.getElementById('filtreReportsPopulation')?.value || '',
    gestionnaire: document.getElementById('filtreReportsGestionnaire')?.value || '',
    sexe: document.getElementById('filtreReportsSexe')?.value || '',
    date_from: convertirDateFrancaiseEnISO(dateFrom) || undefined,
    date_to: convertirDateFrancaiseEnISO(dateTo) || undefined
  };
}

const ID_KPIS_FILTRABLES = ['kpiTotalIndividus', 'kpiEquipes', 'kpiSuiviGps'];

function setChargementFiltresReports(enCours) {
  ID_KPIS_FILTRABLES.forEach(id => {
    document.getElementById(id)?.classList.toggle('loading', enCours);
  });
}

let filtresReportsRequeteId = 0;

/**
 * Charge les 3 KPI filtrables (Individus recenses, Equipes d'un collier, Suivis GPS)
 * selon les criteres actuels de la sidebar. Appelee au chargement initial (filtres
 * vides) et a chaque changement d'un des 3 selects. Garde de sequence
 * (filtresReportsRequeteId) : evite qu'une reponse perimee (changement rapide de
 * filtre) ecrase un resultat plus recent.
 */
async function chargerKpisFiltrablesReports(token) {
  const requeteId = ++filtresReportsRequeteId;
  const filtres = lireFiltresReports();
  const periodeActive = Boolean(filtres.date_from || filtres.date_to);
  setChargementFiltresReports(true);
  try {
    const { fetchCountAnimaux, fetchCountAnimauxEquipes, fetchAnimauxSuivis } = await chargerApi();
    // "Suivis GPS" = etat ACTUEL (collier actif + derniere position transmise) SAUF si
    // une periode est active, auquel cas fetchAnimauxSuivis bascule sur "au moins une
    // position transmise PENDANT la periode" (cf. api.js). "Equipes d'un collier" =
    // cumul historique SAUF periode active (alors poses dont cor_date_debut tombe dans
    // l'intervalle). Ne pas comparer ces chiffres a un rapport externe utilisant une
    // autre definition.
    const [totalIndividus, totalEquipes, suivisIds] = await Promise.all([
      fetchCountAnimaux(token, filtres),
      fetchCountAnimauxEquipes(token, filtres),
      fetchAnimauxSuivis(token, filtres)
    ]);
    if (requeteId !== filtresReportsRequeteId) return;
    setChargementFiltresReports(false);

    document.getElementById('kpiTotalIndividus').textContent = totalIndividus.toLocaleString('fr-FR');
    document.getElementById('kpiEquipes').textContent = totalEquipes.toLocaleString('fr-FR');

    const kpiEquipesSub = document.getElementById('kpiEquipesSub');
    if (kpiEquipesSub) kpiEquipesSub.textContent = periodeActive ? 'Sur la période sélectionnée' : 'Cumul historique';

    const pourcentageSuivi = totalIndividus > 0 ? Math.round((suivisIds.size / totalIndividus) * 100) : 0;
    document.getElementById('kpiSuiviGps').textContent = suivisIds.size.toLocaleString('fr-FR');
    document.getElementById('kpiSuiviGpsPourcentage').textContent = `${pourcentageSuivi}%`;

    const kpiSuiviGpsPeriode = document.getElementById('kpiSuiviGpsPeriode');
    if (kpiSuiviGpsPeriode) kpiSuiviGpsPeriode.textContent = periodeActive ? 'Sur la période sélectionnée' : '';
  } catch (err) {
    if (requeteId !== filtresReportsRequeteId) return;
    setChargementFiltresReports(false);
    console.error('Échec chargement des KPI filtrables:', err);
    marquerErreur('kpiTotalIndividus');
    marquerErreur('kpiEquipes');
    marquerErreur('kpiSuiviGps');
  }
}

/**
 * Peuple dynamiquement les selects Population/Gestionnaire (fetchPopulations/
 * fetchGestionnaires, deja utilisees sur la page Carte) — appelee une seule fois au
 * chargement initial. L'option "Tous" (value="") est deja presente en dur dans le HTML.
 */
async function peuplerFiltresReportsDynamiques(token) {
  try {
    const { fetchPopulations, fetchGestionnaires } = await chargerApi();
    const [populations, gestionnaires] = await Promise.all([
      fetchPopulations(token),
      fetchGestionnaires(token)
    ]);

    const selectPopulation = document.getElementById('filtreReportsPopulation');
    if (selectPopulation) {
      populations.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        selectPopulation.appendChild(opt);
      });
    }

    const selectGestionnaire = document.getElementById('filtreReportsGestionnaire');
    if (selectGestionnaire) {
      gestionnaires.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        selectGestionnaire.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Échec peuplement des filtres Population/Gestionnaire:', err);
  } finally {
    // Dans le finally : les 3 selects doivent etre remplaces par TomSelect meme si le
    // peuplement Population/Gestionnaire a echoue (Sexe reste utilisable, options
    // statiques deja dans le HTML) — un echec reseau partiel ne doit pas priver
    // l'utilisateur du filtre Sexe.
    initTomSelectFiltresReports();
  }
}

// TomSelect — meme mecanisme que initTomSelectFiltresColonnes() (individuals.js) :
// remplace le rendu natif (popup non stylable de facon fiable/coherente entre
// navigateurs) par un composant HTML entierement stylable (cf. .ts-wrapper.reports-col-filtre
// dans reports.css), pour un rendu identique a la page Carte y compris a l'ouverture.
// dropdownParent: 'body' evite que le popup soit coupe par un overflow parent —
// meme choix defensif que sur la page Individus.
function initTomSelectFiltresReports() {
  ['filtreReportsPopulation', 'filtreReportsGestionnaire', 'filtreReportsSexe'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.tomselect) return;
    const ts = new TomSelect(el, {
      create: false,
      allowEmptyOption: true,
      dropdownParent: 'body',
      onChange() {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    ts.dropdown.classList.add('reports-col-filtre-dropdown');
  });
}

// Ferme les dropdowns TomSelect ouverts au scroll du contenu principal —
// dropdownParent:'body' ne recalcule la position qu'au scroll/resize de la fenetre,
// jamais au scroll interne de #reportsScreen (meme raison que sur la page Individus).
document.getElementById('reportsScreen')?.addEventListener('scroll', () => {
  ['filtreReportsPopulation', 'filtreReportsGestionnaire', 'filtreReportsSexe'].forEach(id => {
    document.getElementById(id)?.tomselect?.close();
  });
}, { passive: true });

// Vide les 3 selects + la periode puis recharge les KPI — equivaut a "tout afficher".
function reinitialiserFiltresReports(token) {
  ['filtreReportsPopulation', 'filtreReportsGestionnaire', 'filtreReportsSexe'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dateFrom = document.getElementById('reportsDateFrom');
  const dateTo = document.getElementById('reportsDateTo');
  if (dateFrom) { dateFrom.value = ''; dateFrom._flatpickr?.clear(); }
  if (dateTo) { dateTo.value = ''; dateTo._flatpickr?.clear(); }
  chargerKpisFiltrablesReports(token);
}

document.addEventListener('DOMContentLoaded', () => {
  // Flatpickr — Periode (JJ/MM/AAAA), meme pattern que app.js/individuals.js.
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

  document.getElementById('reportsDateFrom')?.addEventListener('input', () => {
    if (tokenAuChargement) chargerKpisFiltrablesReports(tokenAuChargement);
  });
  document.getElementById('reportsDateTo')?.addEventListener('input', () => {
    if (tokenAuChargement) chargerKpisFiltrablesReports(tokenAuChargement);
  });

  ['filtreReportsPopulation', 'filtreReportsGestionnaire', 'filtreReportsSexe'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (tokenAuChargement) chargerKpisFiltrablesReports(tokenAuChargement);
    });
  });

  document.getElementById('btnReinitialiserFiltresReports')?.addEventListener('click', () => {
    if (tokenAuChargement) reinitialiserFiltresReports(tokenAuChargement);
  });

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
    peuplerFiltresReportsDynamiques(tokenAuChargement);
    chargerKpisFiltrablesReports(tokenAuChargement);
  } else {
    afficherLoginScreen();
  }
});
