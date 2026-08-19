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
  window.location.replace('../login.html');
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

function lireFiltresReports() {
  return {
    population: document.getElementById('filtreReportsPopulation')?.value || '',
    gestionnaire: document.getElementById('filtreReportsGestionnaire')?.value || '',
    sexe: document.getElementById('filtreReportsSexe')?.value || ''
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
  setChargementFiltresReports(true);
  try {
    const { fetchCountAnimaux, fetchCountAnimauxEquipes, fetchAnimauxSuivis } = await chargerApi();
    const [totalIndividus, totalEquipes, suivisIds] = await Promise.all([
      fetchCountAnimaux(token, filtres),
      fetchCountAnimauxEquipes(token, filtres),
      fetchAnimauxSuivis(token, filtres)
    ]);
    if (requeteId !== filtresReportsRequeteId) return;
    setChargementFiltresReports(false);

    document.getElementById('kpiTotalIndividus').textContent = totalIndividus.toLocaleString('fr-FR');
    document.getElementById('kpiEquipes').textContent = totalEquipes.toLocaleString('fr-FR');

    const pourcentageSuivi = totalIndividus > 0 ? Math.round((suivisIds.size / totalIndividus) * 100) : 0;
    document.getElementById('kpiSuiviGps').textContent = suivisIds.size.toLocaleString('fr-FR');
    document.getElementById('kpiSuiviGpsPourcentage').textContent = `${pourcentageSuivi}%`;
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

function reinitialiserFiltresReports(token) {
  ['filtreReportsPopulation', 'filtreReportsGestionnaire', 'filtreReportsSexe'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  chargerKpisFiltrablesReports(token);
}

document.addEventListener('DOMContentLoaded', () => {
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

  if (tokenAuChargement) {
    peuplerFiltresReportsDynamiques(tokenAuChargement);
    chargerKpisFiltrablesReports(tokenAuChargement);
  }
});
