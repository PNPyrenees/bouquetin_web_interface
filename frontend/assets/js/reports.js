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

function afficherLegendeGraphique(id, entrees) {
  const legende = document.getElementById(id);
  if (!legende) return;
  legende.replaceChildren(...entrees.map(entree => {
    const item = document.createElement('span');
    item.className = 'reports-graph-legend-item';
    const couleur = document.createElement('span');
    couleur.className = 'reports-graph-legend-color';
    couleur.style.backgroundColor = entree.couleur;
    const label = document.createElement('span');
    label.textContent = entree.label;
    item.append(couleur, label);
    return item;
  }));
}

async function chargerRepartitionSexeTotal(token) {
  const el = document.getElementById('chartTotalSexe');
  if (!el || !window.ApexCharts) return;
  try {
    const { fetchRepartitionSexeAnimaux } = await chargerApi();
    const counts = await fetchRepartitionSexeAnimaux(token);

    const entrees = [
      { label: 'Mâle', valeur: counts.M, couleur: '#3A86FF' },
      { label: 'Femelle', valeur: counts.F, couleur: '#FF006E' },
      { label: 'Non renseigné', valeur: counts.non_renseigne, couleur: '#b0b0b0' }
    ].filter(e => e.valeur > 0);

    afficherLegendeGraphique('legendTotalSexe', entrees);

    new ApexCharts(el, {
      chart: { type: 'pie', height: '100%' },
      series: entrees.map(e => e.valeur),
      labels: entrees.map(e => e.label),
      colors: entrees.map(e => e.couleur),
      legend: { show: false },
      plotOptions: {
        pie: {
          offsetY: -10,
          customScale: 0.88
        }
      },
      dataLabels: {
        enabled: true,
        formatter: (val, opts) => opts.w.config.series[opts.seriesIndex]
      },
      tooltip: { enabled: true }
    }).render();
  } catch (err) {
    console.error('Échec chargement répartition Sexe:', err);
  }
}

async function chargerRepartitionPopulationTotal(token) {
  const el = document.getElementById('chartTotalPopulation');
  if (!el || !window.ApexCharts) return;
  try {
    const { fetchRepartitionPopulationAnimaux } = await chargerApi();
    const { getCouleurParIndex } = await import('./config.js');
    const { counts, nonRenseigne } = await fetchRepartitionPopulationAnimaux(token);

    const entrees = [...counts.keys()].sort().map((pop, i) => ({
      label: pop,
      valeur: counts.get(pop),
      couleur: getCouleurParIndex(i)
    }));
    if (nonRenseigne > 0) {
      entrees.push({ label: 'Non renseigné', valeur: nonRenseigne, couleur: '#aaaaaa' });
    }

    new ApexCharts(el, {
      chart: { type: 'pie', height: '100%', width: '100%', animations: { enabled: false } },
      series: entrees.map(e => e.valeur),
      labels: entrees.map(e => e.label),
      colors: entrees.map(e => e.couleur),
      dataLabels: {
        enabled: true,
        formatter: (val, opts) => opts.w.config.series[opts.seriesIndex]
      },
      plotOptions: {
        pie: {
          customScale: 1.3,
          dataLabels: {
            external: { show: true, connector: { show: true, length: 16 } }
          }
        }
      },
      legend: { show: false },
      tooltip: { enabled: true },
      stroke: { width: 1, colors: ['#ffffff'] }
    }).render();
  } catch (err) {
    console.error('Échec chargement répartition Population:', err);
  }
}

async function chargerRepartitionGestionnaireTotal(token) {
  const el = document.getElementById('chartTotalGestionnaire');
  if (!el || !window.ApexCharts) return;
  try {
    const { fetchRepartitionGestionnaireAnimaux } = await chargerApi();
    const counts = await fetchRepartitionGestionnaireAnimaux(token);

    const entrees = [
      { label: 'PNP', valeur: counts.PNP, couleur: '#2D6A4F' },
      { label: 'PNRPA', valeur: counts.PNRPA, couleur: '#E07B39' },
      { label: 'Non renseigné', valeur: counts.non_renseigne, couleur: '#aaaaaa' }
    ].filter(e => e.valeur > 0);

    afficherLegendeGraphique('legendTotalGestionnaire', entrees);

    new ApexCharts(el, {
      chart: { type: 'pie', height: '100%' },
      series: entrees.map(e => e.valeur),
      labels: entrees.map(e => e.label),
      colors: entrees.map(e => e.couleur),
      legend: { show: false },
      plotOptions: {
        pie: {
          offsetY: -10,
          customScale: 0.88
        }
      },
      dataLabels: {
        enabled: true,
        formatter: (val, opts) => opts.w.config.series[opts.seriesIndex]
      },
      tooltip: { enabled: true }
    }).render();
  } catch (err) {
    console.error('Échec chargement répartition Gestionnaire:', err);
  }
}

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
    chargerRepartitionSexeTotal(tokenAuChargement);
    chargerRepartitionPopulationTotal(tokenAuChargement);
    chargerRepartitionGestionnaireTotal(tokenAuChargement);
  }
});
