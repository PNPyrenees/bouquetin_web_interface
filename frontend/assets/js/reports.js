let _populationsConnues = [];
let _gestionnairesConnues = [];

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

let apiPromise = null;
function chargerApi() {
  if (!apiPromise) apiPromise = import('./api.js');
  return apiPromise;
}

function marquerErreur(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '?';
  el.title = 'Échec du chargement de cet indicateur — voir la console pour le détail.';
}

function convertirDateFrancaiseEnISO(dateStr) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return null;
  const [j, m, a] = dateStr.split('/');
  return `${a}-${m}-${j}`;
}

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

let _abortControllerKpisReports = null;

async function chargerKpisFiltrablesReports(token) {
  _abortControllerKpisReports?.abort();
  const controller = new AbortController();
  _abortControllerKpisReports = controller;
  const { signal } = controller;

  const requeteId = ++filtresReportsRequeteId;
  const filtres = lireFiltresReports();
  const periodeActive = Boolean(filtres.date_from || filtres.date_to);
  setChargementFiltresReports(true);
  try {
    const { fetchCountAnimaux, fetchCountAnimauxEquipes, fetchAnimauxSuivis } = await chargerApi();
    const [totalIndividus, totalEquipes, suivisIds] = await Promise.all([
      fetchCountAnimaux(token, filtres, signal),
      fetchCountAnimauxEquipes(token, filtres, signal),
      fetchAnimauxSuivis(token, filtres, signal)
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
    // Annulation volontaire (nouvel appel demarre entre-temps) — pas une vraie erreur,
    // ne pas afficher de marqueur d'echec.
    if (err.name === 'AbortError') return;
    if (requeteId !== filtresReportsRequeteId) return;
    setChargementFiltresReports(false);
    console.error('Échec chargement des KPI filtrables:', err);
    marquerErreur('kpiTotalIndividus');
    marquerErreur('kpiEquipes');
    marquerErreur('kpiSuiviGps');
  }
}

async function peuplerFiltresReportsDynamiques(token) {
  try {
    const { fetchPopulations, fetchGestionnaires } = await chargerApi();
    const [populations, gestionnaires] = await Promise.all([
      fetchPopulations(token),
      fetchGestionnaires(token)
    ]);
    _populationsConnues = populations;
    _gestionnairesConnues = gestionnaires;

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
    initTomSelectFiltresReports();
  }
}

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
  chargerGraphiquesReports(token);
}


const PALETTE_GRAPHIQUES_REPORTS = [
  '#2D6A4F', '#6a9a84', '#9ab5ac', '#5c7a99', '#b08968', '#a3763f', '#8a8f6b', '#7a6c5d'
];
// Gris neutre hors palette categorielle — signale une donnee manquante en base
// (ani_sexe/ani_pop_rattach/ani_gestionnaire NULL) plutot qu'une vraie categorie.
const COULEUR_NON_RENSEIGNE_REPORTS = '#b0b0b0';

function chargerFonctionPerimetreReports(fonctions, perimetre) {
  if (perimetre === 'equipes') return fonctions.fetchCountAnimauxEquipes;
  if (perimetre === 'suivis') return fonctions.fetchAnimauxSuivis;
  return fonctions.fetchCountAnimaux;
}

// fetchAnimauxSuivis retourne un Set (comme les 2 autres KPI filtrables), fetchCountAnimaux
// et fetchCountAnimauxEquipes un nombre — uniformise en nombre pour les 3 perimetres.
async function compterPerimetreReports(fn, token, filtres, signal) {
  const resultat = await fn(token, filtres, signal);
  return resultat instanceof Set ? resultat.size : resultat;
}

async function chargerRepartitionReports(fn, token, filtresSansDimension, dimension, categories, signal) {
  const [total, ...comptes] = await Promise.all([
    compterPerimetreReports(fn, token, filtresSansDimension, signal),
    ...categories.map(valeur => compterPerimetreReports(fn, token, { ...filtresSansDimension, [dimension]: valeur }, signal))
  ]);

  const labels = [...categories];
  const valeurs = [...comptes];
  const somme = comptes.reduce((a, b) => a + b, 0);
  if (total > somme) {
    labels.push('Non renseigné');
    valeurs.push(total - somme);
  }
  return { labels, valeurs };
}

function coloreesRepartitionReports(labels) {
  let indexPalette = 0;
  return labels.map(label => {
    if (label === 'Non renseigné') return COULEUR_NON_RENSEIGNE_REPORTS;
    return PALETTE_GRAPHIQUES_REPORTS[(indexPalette++) % PALETTE_GRAPHIQUES_REPORTS.length];
  });
}

const _chartsReports = { sexe: null, population: null, gestionnaire: null };

function detruireGraphiqueReports(dimension) {
  if (_chartsReports[dimension]) {
    _chartsReports[dimension].destroy();
    _chartsReports[dimension] = null;
  }
}

const ID_CHART_REPORTS = { sexe: 'chartReportsSexe', population: 'chartReportsPopulation', gestionnaire: 'chartReportsGestionnaire' };
const ID_WRAPPER_REPORTS = { sexe: 'chartReportsSexeWrapper', population: 'chartReportsPopulationWrapper', gestionnaire: 'chartReportsGestionnaireWrapper' };

function afficherGraphiqueReports(dimension, labels, valeurs) {
  detruireGraphiqueReports(dimension);
  const el = document.getElementById(ID_CHART_REPORTS[dimension]);
  if (!el || !window.ApexCharts) return;

  _chartsReports[dimension] = new ApexCharts(el, {
    chart: {
      type: 'pie',
      height: '100%',
      width: '100%',
      animations: { enabled: false }
    },
    series: valeurs,
    labels,
    colors: coloreesRepartitionReports(labels),
    dataLabels: {
      enabled: true,
      formatter: (val, opts) => opts.w.config.series[opts.seriesIndex]
    },
    plotOptions: {
      pie: {
        customScale: dimension === 'population' ? 1.3 : 1,
        dataLabels: {
          external: {
            show: true,
            connector: { show: true, length: 16 }
          }
        }
      }
    },
    legend: { show: false },
    tooltip: { enabled: true },
    stroke: { width: 1, colors: ['#ffffff'] }
  });
  _chartsReports[dimension].render();
}

function marquerErreurGraphiqueReports(dimension) {
  detruireGraphiqueReports(dimension);
  const wrapper = document.getElementById(ID_WRAPPER_REPORTS[dimension]);
  if (!wrapper) return;
  wrapper.innerHTML = `<div id="${ID_CHART_REPORTS[dimension]}"></div><div class="reports-chart-erreur">Échec du chargement</div>`;
}

// Cible .reports-chart-wrapper (pas .reports-chart-cell) — seule la zone du graphique
// doit griser pendant le chargement, le label au-dessus doit rester net en permanence.
function setChargementGraphiquesReports(enCours) {
  document.querySelectorAll('.reports-chart-wrapper').forEach(el => el.classList.toggle('loading', enCours));
}

let graphiquesReportsRequeteId = 0;

let _abortControllerGraphiquesReports = null;

async function chargerGraphiquesReports(token) {
  _abortControllerGraphiquesReports?.abort();
  const controller = new AbortController();
  _abortControllerGraphiquesReports = controller;
  const { signal } = controller;

  const requeteId = ++graphiquesReportsRequeteId;
  const filtresBase = lireFiltresReports();
  const perimetre = document.getElementById('filtreReportsPerimetre')?.value || 'total';
  setChargementGraphiquesReports(true);

  try {
    const fonctions = await chargerApi();
    const fn = chargerFonctionPerimetreReports(fonctions, perimetre);

    const dimensions = [
      { dimension: 'sexe', categories: ['M', 'F'] },
      { dimension: 'population', categories: _populationsConnues },
      { dimension: 'gestionnaire', categories: _gestionnairesConnues }
    ];

    const resultats = await Promise.all(dimensions.map(({ dimension, categories }) => {
      const filtresSansDimension = { ...filtresBase };
      delete filtresSansDimension[dimension];
      return chargerRepartitionReports(fn, token, filtresSansDimension, dimension, categories, signal);
    }));

    if (requeteId !== graphiquesReportsRequeteId) return;
    setChargementGraphiquesReports(false);

    dimensions.forEach(({ dimension }, i) => {
      afficherGraphiqueReports(dimension, resultats[i].labels, resultats[i].valeurs);
    });
  } catch (err) {
    // Annulation volontaire (nouvel appel demarre entre-temps) — pas une vraie erreur,
    // ne pas remplacer les camemberts par un message d'echec.
    if (err.name === 'AbortError') return;
    if (requeteId !== graphiquesReportsRequeteId) return;
    setChargementGraphiquesReports(false);
    console.error('Échec chargement des camemberts de répartition:', err);
    ['sexe', 'population', 'gestionnaire'].forEach(marquerErreurGraphiqueReports);
  }
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
    if (tokenAuChargement) { chargerKpisFiltrablesReports(tokenAuChargement); chargerGraphiquesReports(tokenAuChargement); }
  });
  document.getElementById('reportsDateTo')?.addEventListener('input', () => {
    if (tokenAuChargement) { chargerKpisFiltrablesReports(tokenAuChargement); chargerGraphiquesReports(tokenAuChargement); }
  });

  ['filtreReportsPopulation', 'filtreReportsGestionnaire', 'filtreReportsSexe'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (tokenAuChargement) { chargerKpisFiltrablesReports(tokenAuChargement); chargerGraphiquesReports(tokenAuChargement); }
    });
  });

  // Perimetre des camemberts — n'affecte que la Repartition, pas les 3 KPI ci-dessus.
  document.getElementById('filtreReportsPerimetre')?.addEventListener('change', () => {
    if (tokenAuChargement) chargerGraphiquesReports(tokenAuChargement);
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
    peuplerFiltresReportsDynamiques(tokenAuChargement).then(() => chargerGraphiquesReports(tokenAuChargement));
    chargerKpisFiltrablesReports(tokenAuChargement);
  }
});
