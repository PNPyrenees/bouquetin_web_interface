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

let animauxSuivisPromise = null;
function chargerAnimauxSuivis(token) {
  if (!animauxSuivisPromise) {
    animauxSuivisPromise = chargerApi().then(({ fetchAnimauxSuivis }) => fetchAnimauxSuivis(token));
  }
  return animauxSuivisPromise;
}

let animauxPromise = null;
function chargerAnimaux(token) {
  if (!animauxPromise) {
    animauxPromise = chargerApi().then(({ fetchAnimals }) => fetchAnimals(token));
  }
  return animauxPromise;
}

function marquerErreur(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '?';
  el.title = 'Échec du chargement de cet indicateur — voir la console pour le détail.';
}

const ID_KPIS = ['kpiTotalIndividus', 'kpiEquipes', 'kpiSuiviGps'];

function setChargementKpis(enCours) {
  ID_KPIS.forEach(id => {
    document.getElementById(id)?.classList.toggle('loading', enCours);
  });
}

async function chargerKpis(token) {
  setChargementKpis(true);
  try {
    const { fetchCountAnimaux, fetchCountAnimauxEquipes } = await chargerApi();
    const [totalIndividus, totalEquipes, suivisIds] = await Promise.all([
      fetchCountAnimaux(token),
      fetchCountAnimauxEquipes(token),
      chargerAnimauxSuivis(token)
    ]);
    setChargementKpis(false);

    document.getElementById('kpiTotalIndividus').textContent = totalIndividus.toLocaleString('fr-FR');
    document.getElementById('kpiEquipes').textContent = totalEquipes.toLocaleString('fr-FR');

    const pourcentageSuivi = totalIndividus > 0 ? Math.round((suivisIds.size / totalIndividus) * 100) : 0;
    document.getElementById('kpiSuiviGps').textContent = suivisIds.size.toLocaleString('fr-FR');
    document.getElementById('kpiSuiviGpsPourcentage').textContent = `${pourcentageSuivi}%`;
  } catch (err) {
    setChargementKpis(false);
    console.error('Échec chargement des KPI:', err);
    marquerErreur('kpiTotalIndividus');
    marquerErreur('kpiEquipes');
    marquerErreur('kpiSuiviGps');
  }
}

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

const COULEURS_SEXE = { M: '#3A86FF', F: '#FF006E', non_renseigne: '#b0b0b0' };

function construireEntreesSexe(counts) {
  return [
    { label: 'Mâle', valeur: counts.M, couleur: COULEURS_SEXE.M },
    { label: 'Femelle', valeur: counts.F, couleur: COULEURS_SEXE.F },
    { label: 'Non renseigné', valeur: counts.non_renseigne, couleur: COULEURS_SEXE.non_renseigne }
  ].filter(e => e.valeur > 0);
}

function afficherCamembertAvecLegende(elId, legendId, entrees) {
  const el = document.getElementById(elId);
  if (!el || !window.ApexCharts) return;
  afficherLegendeGraphique(legendId, entrees);
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
}

async function chargerRepartitionSexeTotal(token) {
  try {
    const { fetchRepartitionSexeAnimaux } = await chargerApi();
    const counts = await fetchRepartitionSexeAnimaux(token);
    afficherCamembertAvecLegende('chartTotalSexe', 'legendTotalSexe', construireEntreesSexe(counts));
  } catch (err) {
    console.error('Échec chargement répartition Sexe:', err);
  }
}

async function chargerRepartitionSexeSuivi(token) {
  try {
    const [suivisIds, animaux] = await Promise.all([chargerAnimauxSuivis(token), chargerAnimaux(token)]);
    const suivisIdsStr = new Set([...suivisIds].map(String));
    const counts = { M: 0, F: 0, non_renseigne: 0 };
    animaux.filter(a => suivisIdsStr.has(String(a.ani_id))).forEach(a => {
      if (a.ani_sexe === 'M') counts.M++;
      else if (a.ani_sexe === 'F') counts.F++;
      else counts.non_renseigne++;
    });
    afficherCamembertAvecLegende('chartSuiviSexe', 'legendSuiviSexe', construireEntreesSexe(counts));
  } catch (err) {
    console.error('Échec chargement répartition Sexe (suivi):', err);
  }
}

function afficherCamembertExterne(elId, entrees) {
  const el = document.getElementById(elId);
  if (!el || !window.ApexCharts) return;
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
}

function construireEntreesPopulation(counts, nonRenseigne, getCouleurParIndex) {
  const entrees = [...counts.keys()].sort().map((pop, i) => ({
    label: pop,
    valeur: counts.get(pop),
    couleur: getCouleurParIndex(i)
  }));
  if (nonRenseigne > 0) {
    entrees.push({ label: 'Non renseigné', valeur: nonRenseigne, couleur: '#aaaaaa' });
  }
  return entrees;
}

function compterParPopulation(animaux) {
  const counts = new Map();
  let nonRenseigne = 0;
  animaux.forEach(a => {
    if (!a.ani_pop_rattach) { nonRenseigne++; return; }
    counts.set(a.ani_pop_rattach, (counts.get(a.ani_pop_rattach) || 0) + 1);
  });
  return { counts, nonRenseigne };
}

async function chargerRepartitionPopulationTotal(token) {
  try {
    const { fetchRepartitionPopulationAnimaux } = await chargerApi();
    const { getCouleurParIndex } = await import('./config.js');
    const { counts, nonRenseigne } = await fetchRepartitionPopulationAnimaux(token);
    afficherCamembertExterne('chartTotalPopulation', construireEntreesPopulation(counts, nonRenseigne, getCouleurParIndex));
  } catch (err) {
    console.error('Échec chargement répartition Population:', err);
  }
}

async function chargerRepartitionPopulationSuivi(token) {
  try {
    const [suivisIds, animaux, { getCouleurParIndex }] = await Promise.all([
      chargerAnimauxSuivis(token),
      chargerAnimaux(token),
      import('./config.js')
    ]);
    const suivisIdsStr = new Set([...suivisIds].map(String));
    const { counts, nonRenseigne } = compterParPopulation(animaux.filter(a => suivisIdsStr.has(String(a.ani_id))));
    afficherCamembertExterne('chartSuiviPopulation', construireEntreesPopulation(counts, nonRenseigne, getCouleurParIndex));
  } catch (err) {
    console.error('Échec chargement répartition Population (suivi):', err);
  }
}

const COULEURS_GESTIONNAIRE = { PNP: '#2D6A4F', PNRPA: '#E07B39', non_renseigne: '#aaaaaa' };

function construireEntreesGestionnaire(counts) {
  return [
    { label: 'PNP', valeur: counts.PNP, couleur: COULEURS_GESTIONNAIRE.PNP },
    { label: 'PNRPA', valeur: counts.PNRPA, couleur: COULEURS_GESTIONNAIRE.PNRPA },
    { label: 'Non renseigné', valeur: counts.non_renseigne, couleur: COULEURS_GESTIONNAIRE.non_renseigne }
  ].filter(e => e.valeur > 0);
}

async function chargerRepartitionGestionnaireTotal(token) {
  try {
    const { fetchRepartitionGestionnaireAnimaux } = await chargerApi();
    const counts = await fetchRepartitionGestionnaireAnimaux(token);
    afficherCamembertAvecLegende('chartTotalGestionnaire', 'legendTotalGestionnaire', construireEntreesGestionnaire(counts));
  } catch (err) {
    console.error('Échec chargement répartition Gestionnaire:', err);
  }
}

async function chargerRepartitionGestionnaireSuivi(token) {
  try {
    const [suivisIds, animaux] = await Promise.all([chargerAnimauxSuivis(token), chargerAnimaux(token)]);
    const suivisIdsStr = new Set([...suivisIds].map(String));
    const counts = { PNP: 0, PNRPA: 0, non_renseigne: 0 };
    animaux.filter(a => suivisIdsStr.has(String(a.ani_id))).forEach(a => {
      if (a.ani_gestionnaire === 'PNP') counts.PNP++;
      else if (a.ani_gestionnaire === 'PNRPA') counts.PNRPA++;
      else counts.non_renseigne++;
    });
    afficherCamembertAvecLegende('chartSuiviGestionnaire', 'legendSuiviGestionnaire', construireEntreesGestionnaire(counts));
  } catch (err) {
    console.error('Échec chargement répartition Gestionnaire (suivi):', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
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
    chargerKpis(tokenAuChargement);
    chargerRepartitionSexeTotal(tokenAuChargement);
    chargerRepartitionPopulationTotal(tokenAuChargement);
    chargerRepartitionGestionnaireTotal(tokenAuChargement);
    chargerRepartitionSexeSuivi(tokenAuChargement);
    chargerRepartitionPopulationSuivi(tokenAuChargement);
    chargerRepartitionGestionnaireSuivi(tokenAuChargement);
  }
});
