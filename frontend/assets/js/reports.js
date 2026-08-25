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
// --- Donnees : imports et requetes mis en cache pour eviter les appels en double ---
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

const _animauxEquipesPromises = new Map();
function chargerAnimauxEquipes(token, annee) {
  const cle = annee || '__global__';
  if (!_animauxEquipesPromises.has(cle)) {
    _animauxEquipesPromises.set(cle, chargerApi().then(({ fetchAnimauxEquipes }) => fetchAnimauxEquipes(token, annee)));
  }
  return _animauxEquipesPromises.get(cle);
}

let capturesReellesPromise = null;
function chargerCapturesReelles(token) {
  if (!capturesReellesPromise) {
    capturesReellesPromise = chargerApi().then(({ fetchCapturesReelles }) => fetchCapturesReelles(token));
  }
  return capturesReellesPromise;
}

let translocationsReellesPromise = null;
function chargerTranslocationsReelles(token) {
  if (!translocationsReellesPromise) {
    translocationsReellesPromise = chargerApi().then(({ fetchTranslocationsReelles }) => fetchTranslocationsReelles(token));
  }
  return translocationsReellesPromise;
}

function marquerErreur(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '?';
  el.title = 'Échec du chargement de cet indicateur — voir la console pour le détail.';
}

async function chargerTotalAnimauxDeclares(token) {
  try {
    const { fetchCountAnimaux } = await chargerApi();
    const total = await fetchCountAnimaux(token);
    const el = document.getElementById('totalAnimauxDeclares');
    if (el) el.textContent = total.toLocaleString('fr-FR');
  } catch (err) {
    console.error('Échec chargement total animaux déclarés :', err);
    marquerErreur('totalAnimauxDeclares');
  }
}

async function chargerTotalAnimauxSuivis(token) {
  try {
    const animauxSuivis = await chargerAnimauxSuivis(token);
    const el = document.getElementById('totalAnimauxSuivis');
    if (el) el.textContent = animauxSuivis.length.toLocaleString('fr-FR');
  } catch (err) {
    console.error('Échec chargement total animaux en cours de suivi :', err);
    marquerErreur('totalAnimauxSuivis');
  }
}

// --- ApexCharts : rendu commun a tous les camemberts ---
// Tailles des graphiques : voir .reports-graph-chart dans reports.css.
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

// Palette Sexe : modifier les couleurs ici.
const COULEURS_SEXE = { M: '#3A86FF', F: '#FF006E', non_renseigne: '#b0b0b0' };

function construireEntreesSexe(counts) {
  return [
    { label: 'Mâle', valeur: counts.M, couleur: COULEURS_SEXE.M },
    { label: 'Femelle', valeur: counts.F, couleur: COULEURS_SEXE.F },
    { label: 'Non renseigné', valeur: counts.non_renseigne, couleur: COULEURS_SEXE.non_renseigne }
  ].filter(e => e.valeur > 0);
}

const instancesApexCharts = new Map();

// Point central a modifier pour changer la strategie de rendu ApexCharts.
function rendreApexCharts(el, options) {
  instancesApexCharts.get(el.id)?.destroy();
  const chart = new ApexCharts(el, options);
  instancesApexCharts.set(el.id, chart);
  chart.render();
}

function afficherCamembertAvecLegende(elId, legendId, entrees) {
  const el = document.getElementById(elId);
  if (!el || !window.ApexCharts) return;
  afficherLegendeGraphique(legendId, entrees);
  rendreApexCharts(el, {
    // Animation, vitesse et type du graphique se reglent ici.
    chart: {
      type: 'pie',
      height: '100%',
      parentHeightOffset: 0,
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 550,
        animateGradually: { enabled: true, delay: 60 },
        dynamicAnimation: { enabled: true, speed: 400 }
      },
      toolbar: { show: false }
    },
    series: entrees.map(e => e.valeur),
    labels: entrees.map(e => e.label),
    colors: entrees.map(e => e.couleur),
    legend: { show: false },
    stroke: { width: 0 },
    // Taille visuelle du disque : modifier customScale avec prudence.
    plotOptions: {
      pie: {
        offsetY: 0,
        customScale: 0.9
      }
    },
    dataLabels: {
      enabled: true,
      formatter: (val, opts) => opts.w.config.series[opts.seriesIndex]
    },
    tooltip: { enabled: true }
  });
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
    const animaux = await chargerAnimauxSuivis(token);
    const counts = { M: 0, F: 0, non_renseigne: 0 };
    animaux.forEach(a => {
      if (a.ani_sexe === 'M') counts.M++;
      else if (a.ani_sexe === 'F') counts.F++;
      else counts.non_renseigne++;
    });
    afficherCamembertAvecLegende('chartSuiviSexe', 'legendSuiviSexe', construireEntreesSexe(counts));
  } catch (err) {
    console.error('Échec chargement répartition Sexe (suivi):', err);
  }
}

// Population utilise le meme rendu fixe que Sexe et Gestionnaire.
function afficherCamembertExterne(elId, legendId, entrees) {
  afficherCamembertAvecLegende(elId, legendId, entrees);
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
    afficherCamembertExterne('chartTotalPopulation', 'legendTotalPopulation', construireEntreesPopulation(counts, nonRenseigne, getCouleurParIndex));
  } catch (err) {
    console.error('Échec chargement répartition Population:', err);
  }
}

async function chargerRepartitionPopulationSuivi(token) {
  try {
    const [animaux, { getCouleurParIndex }] = await Promise.all([
      chargerAnimauxSuivis(token),
      import('./config.js')
    ]);
    const { counts, nonRenseigne } = compterParPopulation(animaux);
    afficherCamembertExterne('chartSuiviPopulation', 'legendSuiviPopulation', construireEntreesPopulation(counts, nonRenseigne, getCouleurParIndex));
  } catch (err) {
    console.error('Échec chargement répartition Population (suivi):', err);
  }
}

// Palette Gestionnaire : modifier les couleurs ici.
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
    const animaux = await chargerAnimauxSuivis(token);
    const counts = { PNP: 0, PNRPA: 0, non_renseigne: 0 };
    animaux.forEach(a => {
      if (a.ani_gestionnaire === 'PNP') counts.PNP++;
      else if (a.ani_gestionnaire === 'PNRPA') counts.PNRPA++;
      else counts.non_renseigne++;
    });
    afficherCamembertAvecLegende('chartSuiviGestionnaire', 'legendSuiviGestionnaire', construireEntreesGestionnaire(counts));
  } catch (err) {
    console.error('Échec chargement répartition Gestionnaire (suivi):', err);
  }
}

// --- Vue Equipes : filtre annuel base sur la date de pose du capteur ---
async function initFiltreAnneeEquipes(token) {
  const select = document.getElementById('selectAnneeEquipes');
  if (!select) return;
  try {
    const animaux = await chargerAnimauxEquipes(token, '');
    const annees = [...new Set(
      animaux.flatMap(a => a.cor_animal_capteur.map(c => Number(String(c.cor_date_debut).slice(0, 4))))
    )].filter(y => Number.isFinite(y)).sort((a, b) => b - a);
    annees.forEach(annee => {
      const opt = document.createElement('option');
      opt.value = String(annee);
      opt.textContent = String(annee);
      select.appendChild(opt);
    });
    select.disabled = false;

    if (window.TomSelect && !select.tomselect) {
      const tomSelect = new TomSelect(select, {
        create: false,
        allowEmptyOption: true,
        controlInput: null,
        dropdownParent: 'body'
      });
      tomSelect.dropdown.classList.add('reports-select-annee-dropdown');
    }
  } catch (err) {
    console.error('Échec peuplement des années (équipés):', err);
  }
}

async function chargerTotalAnimauxEquipes(token, annee) {
  try {
    const animaux = await chargerAnimauxEquipes(token, annee);
    const el = document.getElementById('totalAnimauxEquipes');
    if (el) el.textContent = animaux.length.toLocaleString('fr-FR');
  } catch (err) {
    console.error('Échec chargement total animaux équipés :', err);
    marquerErreur('totalAnimauxEquipes');
  }
}

async function chargerRepartitionSexeEquipes(token, annee) {
  try {
    const animaux = await chargerAnimauxEquipes(token, annee);
    const counts = { M: 0, F: 0, non_renseigne: 0 };
    animaux.forEach(a => {
      if (a.ani_sexe === 'M') counts.M++;
      else if (a.ani_sexe === 'F') counts.F++;
      else counts.non_renseigne++;
    });
    afficherCamembertAvecLegende('chartEquipesSexe', 'legendEquipesSexe', construireEntreesSexe(counts));
  } catch (err) {
    console.error('Échec chargement répartition Sexe (équipés):', err);
  }
}

async function chargerRepartitionPopulationEquipes(token, annee) {
  try {
    const [animaux, { getCouleurParIndex }] = await Promise.all([
      chargerAnimauxEquipes(token, annee),
      import('./config.js')
    ]);
    const { counts, nonRenseigne } = compterParPopulation(animaux);
    afficherCamembertExterne('chartEquipesPopulation', 'legendEquipesPopulation', construireEntreesPopulation(counts, nonRenseigne, getCouleurParIndex));
  } catch (err) {
    console.error('Échec chargement répartition Population (équipés):', err);
  }
}

async function chargerRepartitionGestionnaireEquipes(token, annee) {
  try {
    const animaux = await chargerAnimauxEquipes(token, annee);
    const counts = { PNP: 0, PNRPA: 0, non_renseigne: 0 };
    animaux.forEach(a => {
      if (a.ani_gestionnaire === 'PNP') counts.PNP++;
      else if (a.ani_gestionnaire === 'PNRPA') counts.PNRPA++;
      else counts.non_renseigne++;
    });
    afficherCamembertAvecLegende('chartEquipesGestionnaire', 'legendEquipesGestionnaire', construireEntreesGestionnaire(counts));
  } catch (err) {
    console.error('Échec chargement répartition Gestionnaire (équipés):', err);
  }
}

// Annee de reference d'un evenement — champ principal en priorite, champ de repli
// sinon (une translocation n'a pas de capture_date ; a l'inverse, une translocation
// pas encore relachee n'a pas de relache_date).
function anneeEvenement(ligne, champPrincipal, champRepli) {
  const date = ligne[champPrincipal] || (champRepli && ligne[champRepli]);
  return date ? String(date).slice(0, 4) : null;
}

// --- Vue Captures : filtre annuel base sur capture_date (repli relache_date pour les
// translocations, qui n'ont pas de capture_date) ---
async function initFiltreAnneeCaptures(token) {
  const select = document.getElementById('selectAnneeCaptures');
  if (!select) return '';
  try {
    const [captures, { REPORTS_ANNEE_PAR_DEFAUT_DERNIERE }] = await Promise.all([
      chargerCapturesReelles(token),
      import('./config.js')
    ]);
    const annees = [...new Set(captures.map(c => Number(anneeEvenement(c, 'capture_date', 'relache_date'))))]
      .filter(y => Number.isFinite(y))
      .sort((a, b) => b - a);
    annees.forEach(annee => {
      const opt = document.createElement('option');
      opt.value = String(annee);
      opt.textContent = String(annee);
      select.appendChild(opt);
    });
    select.disabled = false;

    const anneeParDefaut = REPORTS_ANNEE_PAR_DEFAUT_DERNIERE && annees.length > 0 ? String(annees[0]) : '';
    if (anneeParDefaut) select.value = anneeParDefaut;

    if (window.TomSelect && !select.tomselect) {
      const tomSelect = new TomSelect(select, {
        create: false,
        allowEmptyOption: true,
        controlInput: null,
        dropdownParent: 'body'
      });
      tomSelect.dropdown.classList.add('reports-select-annee-dropdown');
    }
    return anneeParDefaut;
  } catch (err) {
    console.error('Échec peuplement des années (captures):', err);
    return '';
  }
}

function idsCapturesPourAnnee(captures, annee) {
  return captures.filter(c => !annee || anneeEvenement(c, 'capture_date', 'relache_date') === annee);
}

async function chargerTotalAnimauxCaptures(token, annee) {
  try {
    const captures = await chargerCapturesReelles(token);
    const total = idsCapturesPourAnnee(captures, annee).length;
    const el = document.getElementById('totalAnimauxCaptures');
    if (el) el.textContent = total.toLocaleString('fr-FR');
  } catch (err) {
    console.error('Échec chargement total animaux capturés :', err);
    marquerErreur('totalAnimauxCaptures');
  }
}

async function chargerRepartitionSexeCaptures(token, annee) {
  try {
    const captures = idsCapturesPourAnnee(await chargerCapturesReelles(token), annee);
    const counts = { M: 0, F: 0, non_renseigne: 0 };
    captures.forEach(capture => {
      if (capture.ani_sexe === 'M') counts.M++;
      else if (capture.ani_sexe === 'F') counts.F++;
      else counts.non_renseigne++;
    });
    afficherCamembertAvecLegende('chartCapturesSexe', 'legendCapturesSexe', construireEntreesSexe(counts));
  } catch (err) {
    console.error('Échec chargement répartition Sexe (captures):', err);
  }
}

async function chargerRepartitionPopulationCaptures(token, annee) {
  try {
    const [captures, { getCouleurParIndex }] = await Promise.all([
      chargerCapturesReelles(token),
      import('./config.js')
    ]);
    const { counts, nonRenseigne } = compterParPopulation(idsCapturesPourAnnee(captures, annee));
    afficherCamembertExterne('chartCapturesPopulation', 'legendCapturesPopulation', construireEntreesPopulation(counts, nonRenseigne, getCouleurParIndex));
  } catch (err) {
    console.error('Échec chargement répartition Population (captures):', err);
  }
}

async function chargerRepartitionGestionnaireCaptures(token, annee) {
  try {
    const captures = idsCapturesPourAnnee(await chargerCapturesReelles(token), annee);
    const counts = { PNP: 0, PNRPA: 0, non_renseigne: 0 };
    captures.forEach(capture => {
      if (capture.ani_gestionnaire === 'PNP') counts.PNP++;
      else if (capture.ani_gestionnaire === 'PNRPA') counts.PNRPA++;
      else counts.non_renseigne++;
    });
    afficherCamembertAvecLegende('chartCapturesGestionnaire', 'legendCapturesGestionnaire', construireEntreesGestionnaire(counts));
  } catch (err) {
    console.error('Échec chargement répartition Gestionnaire (captures):', err);
  }
}

function compterCapturesParChamp(captures, annee, champ) {
  const counts = new Map();
  let nonRenseigne = 0;
  captures
    .filter(c => !annee || anneeEvenement(c, 'capture_date', 'relache_date') === annee)
    .forEach(c => {
      const val = c[champ];
      if (!val) {
        nonRenseigne++;
        return;
      }
      counts.set(val, (counts.get(val) || 0) + 1);
    });
  return { counts, nonRenseigne };
}

async function chargerRepartitionObjectifCaptures(token, annee) {
  try {
    const [captures, { getCouleurParIndex }] = await Promise.all([
      chargerCapturesReelles(token),
      import('./config.js')
    ]);
    const { counts, nonRenseigne } = compterCapturesParChamp(captures, annee, 'capture_objectif');
    const entrees = [...counts.keys()].sort().map((obj, i) => ({
      label: obj,
      valeur: counts.get(obj),
      couleur: getCouleurParIndex(i)
    }));
    if (nonRenseigne > 0) {
      entrees.push({ label: 'Non renseigné', valeur: nonRenseigne, couleur: '#aaaaaa' });
    }
    afficherCamembertAvecLegende('chartCapturesObjectif', 'legendCapturesObjectif', entrees);
  } catch (err) {
    console.error('Échec chargement répartition Objectif (captures):', err);
  }
}

async function chargerRepartitionMethodeCaptures(token, annee) {
  try {
    const [captures, { getCouleurParIndex }] = await Promise.all([
      chargerCapturesReelles(token),
      import('./config.js')
    ]);
    const { counts, nonRenseigne } = compterCapturesParChamp(captures, annee, 'capture_methode');
    const entrees = [...counts.keys()].sort().map((meth, i) => ({
      label: meth,
      valeur: counts.get(meth),
      couleur: getCouleurParIndex(i + 4)
    }));
    if (nonRenseigne > 0) {
      entrees.push({ label: 'Non renseigné', valeur: nonRenseigne, couleur: '#aaaaaa' });
    }
    afficherCamembertAvecLegende('chartCapturesMethode', 'legendCapturesMethode', entrees);
  } catch (err) {
    console.error('Échec chargement répartition Méthode (captures):', err);
  }
}

// --- Vue Translocations : filtre annuel base sur relache_date (repli capture_date pour
// une translocation pas encore relachee) ---
async function initFiltreAnneeTranslocations(token) {
  const select = document.getElementById('selectAnneeTranslocations');
  if (!select) return '';
  try {
    const [translocations, { REPORTS_ANNEE_PAR_DEFAUT_DERNIERE }] = await Promise.all([
      chargerTranslocationsReelles(token),
      import('./config.js')
    ]);
    const annees = [...new Set(translocations.map(t => Number(anneeEvenement(t, 'relache_date', 'capture_date'))))]
      .filter(y => Number.isFinite(y))
      .sort((a, b) => b - a);
    annees.forEach(annee => {
      const opt = document.createElement('option');
      opt.value = String(annee);
      opt.textContent = String(annee);
      select.appendChild(opt);
    });
    select.disabled = false;

    const anneeParDefaut = REPORTS_ANNEE_PAR_DEFAUT_DERNIERE && annees.length > 0 ? String(annees[0]) : '';
    if (anneeParDefaut) select.value = anneeParDefaut;

    if (window.TomSelect && !select.tomselect) {
      const tomSelect = new TomSelect(select, {
        create: false,
        allowEmptyOption: true,
        controlInput: null,
        dropdownParent: 'body'
      });
      tomSelect.dropdown.classList.add('reports-select-annee-dropdown');
    }
    return anneeParDefaut;
  } catch (err) {
    console.error('Échec peuplement des années (translocations):', err);
    return '';
  }
}

function idsTranslocationsPourAnnee(translocations, annee) {
  return translocations.filter(t => !annee || anneeEvenement(t, 'relache_date', 'capture_date') === annee);
}

async function chargerTotalAnimauxTransloques(token, annee) {
  try {
    const translocations = await chargerTranslocationsReelles(token);
    const translocationsFiltrees = idsTranslocationsPourAnnee(translocations, annee);
    const dates = new Set(translocationsFiltrees.map(t => String(t.relache_date).slice(0, 10)));
    const total = dates.size;
    const el = document.getElementById('totalAnimauxTransloques');
    if (el) el.textContent = total.toLocaleString('fr-FR');
    const ids = new Set(translocationsFiltrees.map(t => String(t.ani_id)));
    const noteOperations = document.getElementById('noteTranslocationsOperations');
    const noteAnimaux = document.getElementById('noteTranslocationsAnimaux');
    if (noteOperations) noteOperations.textContent = total.toLocaleString('fr-FR');
    if (noteAnimaux) noteAnimaux.textContent = ids.size.toLocaleString('fr-FR');
  } catch (err) {
    console.error('Échec chargement total animaux transloqués :', err);
    marquerErreur('totalAnimauxTransloques');
  }
}

async function chargerRepartitionSexeTranslocations(token, annee) {
  try {
    const translocations = idsTranslocationsPourAnnee(await chargerTranslocationsReelles(token), annee);
    const counts = { M: 0, F: 0, non_renseigne: 0 };
    translocations.forEach(translocation => {
      if (translocation.ani_sexe === 'M') counts.M++;
      else if (translocation.ani_sexe === 'F') counts.F++;
      else counts.non_renseigne++;
    });
    afficherCamembertAvecLegende('chartTranslocationsSexe', 'legendTranslocationsSexe', construireEntreesSexe(counts));
  } catch (err) {
    console.error('Échec chargement répartition Sexe (translocations):', err);
  }
}

async function chargerRepartitionPopulationTranslocations(token, annee) {
  try {
    const [translocations, { getCouleurParIndex }] = await Promise.all([
      chargerTranslocationsReelles(token),
      import('./config.js')
    ]);
    const { counts, nonRenseigne } = compterParPopulation(idsTranslocationsPourAnnee(translocations, annee));
    afficherCamembertExterne('chartTranslocationsPopulation', 'legendTranslocationsPopulation', construireEntreesPopulation(counts, nonRenseigne, getCouleurParIndex));
  } catch (err) {
    console.error('Échec chargement répartition Population (translocations):', err);
  }
}

async function chargerRepartitionGestionnaireTranslocations(token, annee) {
  try {
    const translocations = idsTranslocationsPourAnnee(await chargerTranslocationsReelles(token), annee);
    const counts = { PNP: 0, PNRPA: 0, non_renseigne: 0 };
    translocations.forEach(translocation => {
      if (translocation.ani_gestionnaire === 'PNP') counts.PNP++;
      else if (translocation.ani_gestionnaire === 'PNRPA') counts.PNRPA++;
      else counts.non_renseigne++;
    });
    afficherCamembertAvecLegende('chartTranslocationsGestionnaire', 'legendTranslocationsGestionnaire', construireEntreesGestionnaire(counts));
  } catch (err) {
    console.error('Échec chargement répartition Gestionnaire (translocations):', err);
  }
}

// --- Cartes Captures et Translocations : configuration OpenLayers partagee ---
// Duplication du pattern OpenLayers/IGN de individuals.js (initCarteSites) — pas de
// module JS ici (reports.js n'est pas en type="module"), donc config.js est chargé
// dynamiquement une fois puis mis en cache dans ces variables de module.
let LAMBERT93, DEFAULT_CENTER, DEFAULT_ZOOM, IGN_API_KEY, BASEMAPS_CONFIG, GLASBEY_32, getCouleurParIndex;
let configCartePromise = null;
function chargerConfigCarte() {
  if (!configCartePromise) {
    configCartePromise = import('./config.js').then(cfg => {
      ({ LAMBERT93, DEFAULT_CENTER, DEFAULT_ZOOM, IGN_API_KEY, BASEMAPS_CONFIG, GLASBEY_32, getCouleurParIndex } = cfg);
    });
  }
  return configCartePromise;
}

let _projRegistered = false;

function assurerProjectionLambert93() {
  if (_projRegistered) return;
  proj4.defs('EPSG:2154', LAMBERT93);
  ol.proj.proj4.register(proj4);
  _projRegistered = true;
}

let _wmtsCapabilitiesPromise = null;
function chargerCapacitesWMTS() {
  if (!_wmtsCapabilitiesPromise) {
    _wmtsCapabilitiesPromise = fetch('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetCapabilities')
      .then(res => {
        if (!res.ok) throw new Error(`GetCapabilities IGN : HTTP ${res.status}`);
        return res.text();
      })
      .then(texte => new ol.format.WMTSCapabilities().read(texte));
  }
  return _wmtsCapabilitiesPromise;
}

function creerCoucheWMTS(bm) {
  const layer = new ol.layer.Tile({ visible: bm.visible, opacity: bm.opacity ?? 1 });
  chargerCapacitesWMTS()
    .then(capacites => {
      const options = ol.source.WMTS.optionsFromCapabilities(capacites, {
        layer: bm.layer,
        matrixSet: bm.matrixSet,
        style: bm.style,
        format: bm.format,
        crossOrigin: 'anonymous'
      });
      if (!options) {
        throw new Error(`Couche introuvable dans le GetCapabilities IGN : layer="${bm.layer}" matrixSet="${bm.matrixSet}" style="${bm.style}"`);
      }
      layer.setSource(new ol.source.WMTS(options));
    })
    .catch(err => {
      console.error(`Fond WMTS "${bm.nom}" indisponible :`, err.message);
      if (window._showToast) window._showToast(`"${bm.nom}" n'a pas pu être chargé.`);
    });
  return layer;
}

function creerCoucheBasemap(bm) {
  if (bm.type === 'wmts') {
    return creerCoucheWMTS(bm);
  }

  let source;
  if (bm.type === 'osm') {
    source = new ol.source.OSM();
  } else if (bm.type === 'wms') {
    source = new ol.source.TileWMS({
      url: bm.url,
      params: bm.wmsParams || {},
      serverType: 'geoserver',
      attributions: bm.attributions
    });
  } else {
    source = new ol.source.XYZ({
      url: bm.url && bm.url.includes('IGN_API_KEY') ? bm.url.replace('${IGN_API_KEY}', IGN_API_KEY) : bm.url,
      attributions: bm.attributions
    });
  }
  return new ol.layer.Tile({ source });
}

function changerCoucheBasemap(carte, basemapId) {
  if (!carte) return;
  const bm = BASEMAPS_CONFIG.find(b => b.id === basemapId) || BASEMAPS_CONFIG[0];
  carte.getLayers().removeAt(0);
  carte.getLayers().insertAt(0, creerCoucheBasemap({ ...bm, visible: true }));
}

function initBoutonFondsCarte(suffixe, getCarteActuelle) {
  const bouton = document.getElementById(`btnFondsCarte${suffixe}`);
  const panneau = document.getElementById(`basemapPanel${suffixe}`);
  const liste = document.getElementById(`basemapListe${suffixe}`);
  if (!bouton || !panneau || !liste) return;

  const fondParDefaut = BASEMAPS_CONFIG.find(bm => bm.visible) || BASEMAPS_CONFIG[0];

  liste.innerHTML = '';
  BASEMAPS_CONFIG.filter(bm => bm.category !== 'overlay').forEach(bm => {
    const estParDefaut = bm.id === fondParDefaut.id;
    const item = document.createElement('label');
    item.className = `reports-basemap-item${estParDefaut ? ' active' : ''}`;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `fondsCarte${suffixe}`;
    radio.className = 'reports-basemap-radio';
    radio.checked = estParDefaut;

    const nom = document.createElement('span');
    nom.textContent = bm.nom;

    item.append(radio, nom);
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      liste.querySelectorAll('.reports-basemap-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      radio.checked = true;
      changerCoucheBasemap(getCarteActuelle(), bm.id);
      panneau.classList.remove('open');
    });
    liste.appendChild(item);
  });

  bouton.addEventListener('click', (e) => {
    e.stopPropagation();
    panneau.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (panneau.classList.contains('open') && !panneau.contains(e.target) && !bouton.contains(e.target)) {
      panneau.classList.remove('open');
    }
  });
}

const SRID_ATTENDU = 2154;

function parseGeomPostGIS(geom) {
  if (!geom) return null;

  if (typeof geom === 'object' && Array.isArray(geom.coordinates)) {
    const crsNom = geom.crs?.properties?.name;
    if (crsNom && crsNom !== `EPSG:${SRID_ATTENDU}`) {
      console.warn(
        `Géométrie capture avec un CRS inattendu (${crsNom}, attendu EPSG:${SRID_ATTENDU}) — le point est affiché quand même, sa position peut être incorrecte.`,
        geom
      );
    }
    return geom.coordinates;
  }

  if (typeof geom === 'string') {
    return parseEwkbHexPoint(geom);
  }

  console.warn('Format de géométrie PostGIS non reconnu:', geom);
  return null;
}

function parseEwkbHexPoint(hex) {
  try {
    const bytes = new Uint8Array(hex.match(/../g).map(b => parseInt(b, 16)));
    const view = new DataView(bytes.buffer);
    const littleEndian = bytes[0] === 1;
    let offset = 1;

    const geomType = view.getUint32(offset, littleEndian);
    offset += 4;

    const hasSrid = (geomType & 0x20000000) !== 0;
    let srid = null;
    if (hasSrid) {
      srid = view.getUint32(offset, littleEndian);
      offset += 4;
    }

    if (srid !== null && srid !== SRID_ATTENDU) {
      console.warn(
        `Géométrie capture avec un SRID inattendu (${srid}, attendu ${SRID_ATTENDU}) — le point est affiché quand même, sa position peut être incorrecte.`,
        hex
      );
    }

    const x = view.getFloat64(offset, littleEndian);
    offset += 8;
    const y = view.getFloat64(offset, littleEndian);

    return [x, y];
  } catch (err) {
    console.warn('Échec parsing EWKB:', hex, err);
    return null;
  }
}

function lambert93VersEcran(coordLambert93) {
  const wgs84 = proj4('EPSG:2154', 'EPSG:4326', coordLambert93);
  return ol.proj.fromLonLat(wgs84);
}

// Duplication fidele de creerFeaturesLienSite() (individuals.js) — trait + fleche au
// milieu, pointant de l'origine vers la destination.
function creerFeaturesLienSite(coordOrigineLambert93, coordDestinationLambert93, couleur) {
  const pointA = lambert93VersEcran(coordOrigineLambert93);
  const pointB = lambert93VersEcran(coordDestinationLambert93);

  const ligne = new ol.Feature({ geometry: new ol.geom.LineString([pointA, pointB]) });
  ligne.setStyle(new ol.style.Style({
    stroke: new ol.style.Stroke({ color: couleur, width: 2, lineCap: 'round', lineJoin: 'round' })
  }));

  const dx = pointB[0] - pointA[0];
  const dy = pointB[1] - pointA[1];
  const rotation = Math.atan2(dy, dx) - Math.PI / 2;
  const midpoint = [(pointA[0] + pointB[0]) / 2, (pointA[1] + pointB[1]) / 2];

  const fleche = new ol.Feature({ geometry: new ol.geom.Point(midpoint) });
  fleche.setStyle(new ol.style.Style({
    image: new ol.style.RegularShape({
      points: 3,
      radius: 7,
      rotation: -rotation,
      fill: new ol.style.Fill({ color: couleur }),
      stroke: new ol.style.Stroke({ color: '#ffffff', width: 1 }),
      rotateWithView: false
    })
  }));

  return [ligne, fleche];
}

function observerRedimensionnementCarte(carte, targetId) {
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => carte.updateSize());
    const mapEl = document.getElementById(targetId);
    if (mapEl) resizeObserver.observe(mapEl);
  }
  setTimeout(() => carte.updateSize(), 100);
  setTimeout(() => carte.updateSize(), 300);
  setTimeout(() => carte.updateSize(), 600);
}

// Couleurs et contours des points affiches sur les cartes.
const COULEUR_NON_RENSEIGNE_SITE = '#aaaaaa';

// Contours cycliques (identiques a map.js) avec un override force en blanc pour les
// couleurs GLASBEY trop sombres — evite qu'un point sombre + contour noir ne devienne
// un disque quasi illisible, sans retirer ces couleurs de la palette.
const CONTOURS_SITE = ['#ffffff', '#000000', '#FFDC00', '#00C8FF'];
const CONTOUR_OVERRIDE_SITE = {
  '#0000FF': CONTOURS_SITE[0],
  '#000033': CONTOURS_SITE[0],
  '#005300': CONTOURS_SITE[0],
  '#201A01': CONTOURS_SITE[0],
  '#720055': CONTOURS_SITE[0],
  '#A10300': CONTOURS_SITE[0],
  '#00478E': CONTOURS_SITE[0]
};

function getContourSiteParIndex(index) {
  const couleur = GLASBEY_32[index % GLASBEY_32.length];
  if (CONTOUR_OVERRIDE_SITE[couleur]) return CONTOUR_OVERRIDE_SITE[couleur];
  return CONTOURS_SITE[Math.floor(index / GLASBEY_32.length) % CONTOURS_SITE.length];
}

const STYLE_NON_RENSEIGNE_SITE = { couleur: COULEUR_NON_RENSEIGNE_SITE, contour: '#000000' };

function creerLigneLegendeSite(couleur, contour, label) {
  const ligne = document.createElement('div');
  ligne.className = 'reports-legende-item';
  const pastille = document.createElement('span');
  pastille.className = 'reports-legende-pastille';
  pastille.style.background = couleur;
  pastille.style.border = `2px solid ${contour}`;
  const texte = document.createElement('span');
  texte.textContent = label;
  ligne.append(pastille, texte);
  return ligne;
}

// Fabrique une carte OL "sites" (fond IGN + symbologie Zone/Lieu-dit + legende + popup),
// parametree par les noms de champs — utilisee pour les blocs "Animaux captures" et
// "Translocations", identiques a l'exception de ces champs et des ids DOM (suffixe).
function creerCarteSites({ suffixe, champDate, champDateRepli, champZone, champLieuDit, champGeom, champDateOrigine, champZoneOrigine, champLieuDitOrigine, champGeomOrigine, libellePopup, symbologieFixe }) {
  let carte = null;
  let couche = null;
  let source = null;
  let coucheLiens = null;
  let sourceLiens = null;
  let popupOverlay = null;
  let modeCouleur = 'zone';
  let pointsAffiches = [];
  const couleursZone = new Map();
  const couleursLieuDit = new Map();

  // Un point "origine" (site de capture) reprend ses propres champs zone/lieu-dit —
  // pas ceux du point "destination" du meme evenement.
  function construirePoints(lignes) {
    const points = [];
    lignes.forEach(l => {
      const coord = parseGeomPostGIS(l[champGeom]);
      if (coord) points.push({ ligne: l, siteType: 'destination', coord, zone: l[champZone], lieuDit: l[champLieuDit] });
      if (!champGeomOrigine) return;
      const coordOrigine = parseGeomPostGIS(l[champGeomOrigine]);
      if (coordOrigine) points.push({ ligne: l, siteType: 'origine', coord: coordOrigine, zone: l[champZoneOrigine], lieuDit: l[champLieuDitOrigine] });
    });
    return points;
  }

  function preparerCouleurs(points) {
    couleursZone.clear();
    [...new Set(points.map(p => p.zone).filter(Boolean))].sort()
      .forEach((v, i) => couleursZone.set(v, { couleur: getCouleurParIndex(i), contour: getContourSiteParIndex(i) }));

    couleursLieuDit.clear();
    [...new Set(points.map(p => p.lieuDit).filter(Boolean))].sort()
      .forEach((v, i) => couleursLieuDit.set(v, { couleur: getCouleurParIndex(i), contour: getContourSiteParIndex(i) }));
  }

  function getStylePoint(feature) {
    const champ = modeCouleur === 'lieu_dit' ? 'pointLieuDit' : 'pointZone';
    const couleursMap = modeCouleur === 'lieu_dit' ? couleursLieuDit : couleursZone;
    return couleursMap.get(feature.get(champ)) || STYLE_NON_RENSEIGNE_SITE;
  }

  // Contour : noir (origine/capture) / blanc (destination/relache) sur les cartes a
  // deux roles (translocations), fidele a stylePointSite() d'individuals.js — sinon
  // contour cyclique habituel (evite le noir sur couleur GLASBEY sombre).
  function stylePoint(feature) {
    if (symbologieFixe) {
      const style = feature.get('siteType') === 'origine' ? symbologieFixe.origine : symbologieFixe.destination;
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 7,
          fill: new ol.style.Fill({ color: style.couleur }),
          stroke: new ol.style.Stroke({ color: style.contour, width: 3 })
        })
      });
    }
    const { couleur, contour } = getStylePoint(feature);
    const contourFinal = champGeomOrigine
      ? (feature.get('siteType') === 'origine' ? '#000000' : '#ffffff')
      : contour;
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius: 7,
        fill: new ol.style.Fill({ color: couleur }),
        stroke: new ol.style.Stroke({ color: contourFinal, width: 3 })
      })
    });
  }

  function construireLegende() {
    const conteneur = document.getElementById(`legende${suffixe}Couleurs`);
    if (!conteneur) return;
    conteneur.innerHTML = '';

    if (symbologieFixe) {
      conteneur.appendChild(creerLigneLegendeSite(symbologieFixe.origine.couleur, symbologieFixe.origine.contour, symbologieFixe.origine.libelle));
      conteneur.appendChild(creerLigneLegendeSite(symbologieFixe.destination.couleur, symbologieFixe.destination.contour, symbologieFixe.destination.libelle));
      return;
    }

    const couleursMap = modeCouleur === 'lieu_dit' ? couleursLieuDit : couleursZone;
    couleursMap.forEach(({ couleur, contour }, valeur) => {
      conteneur.appendChild(creerLigneLegendeSite(couleur, contour, valeur));
    });

    const champ = modeCouleur === 'lieu_dit' ? 'lieuDit' : 'zone';
    if (pointsAffiches.some(p => !p[champ])) {
      conteneur.appendChild(creerLigneLegendeSite(STYLE_NON_RENSEIGNE_SITE.couleur, STYLE_NON_RENSEIGNE_SITE.contour, 'Non renseigné'));
    }
  }

  function changerModeCouleur(mode) {
    modeCouleur = mode;
    couche?.changed();
    construireLegende();
  }

  async function initCarte() {
    if (carte) return;
    await chargerConfigCarte();
    assurerProjectionLambert93();

    source = new ol.source.Vector();
    couche = new ol.layer.Vector({ source, style: stylePoint });

    if (symbologieFixe) {
      sourceLiens = new ol.source.Vector();
      coucheLiens = new ol.layer.Vector({ source: sourceLiens });
    }

    const popupEl = document.getElementById(`popupMap${suffixe}`);
    popupOverlay = new ol.Overlay({
      element: popupEl,
      positioning: 'bottom-center',
      offset: [0, -22],
      autoPan: { margin: 12, animation: { duration: 250 } }
    });

    carte = new ol.Map({
      target: `reportsMap${suffixe}`,
      controls: [],
      interactions: ol.interaction.defaults.defaults({ mouseWheelZoom: false, doubleClickZoom: true, pinchZoom: false, shiftDragZoom: false }),
      layers: [creerCoucheBasemap(BASEMAPS_CONFIG.find(bm => bm.visible) || BASEMAPS_CONFIG[0]), ...(coucheLiens ? [coucheLiens] : []), couche],
      overlays: [popupOverlay],
      view: new ol.View({ center: ol.proj.fromLonLat(DEFAULT_CENTER), zoom: DEFAULT_ZOOM })
    });

    carte.on('pointermove', evt => {
      carte.getViewport().style.cursor = carte.hasFeatureAtPixel(evt.pixel) ? 'pointer' : '';
    });

    carte.on('singleclick', evt => {
      let hit = false;
      carte.forEachFeatureAtPixel(evt.pixel, feature => {
        if (hit) return;
        hit = true;
        const l = feature.getProperties();

        popupEl.innerHTML = '';
        const strong = document.createElement('strong');
        strong.textContent = libellePopup;
        popupEl.appendChild(strong);

        const estOrigine = l.siteType === 'origine';
        const date = estOrigine ? l[champDateOrigine] : l[champDate];
        const zone = estOrigine ? l[champZoneOrigine] : l[champZone];
        const lieuDit = estOrigine ? l[champLieuDitOrigine] : l[champLieuDit];
        strong.textContent = estOrigine ? 'Site de capture' : libellePopup;

        [
          ['Date', date ? date.slice(0, 10).split('-').reverse().join('/') : null],
          ['Zone', zone],
          ['Lieu-dit', lieuDit]
        ].forEach(([label, valeur]) => {
          const div = document.createElement('div');
          div.className = 'popup-champ';
          div.textContent = `${label} : ${valeur || '-'}`;
          popupEl.appendChild(div);
        });

        popupEl.style.display = 'block';
        popupOverlay.setPosition(feature.getGeometry().getCoordinates());
      });
      if (!hit) popupEl.style.display = 'none';
    });

    document.getElementById(`btnZoomIn${suffixe}`)?.addEventListener('click', () => {
      const view = carte.getView();
      view.animate({ zoom: view.getZoom() + 1, duration: 200 });
    });
    document.getElementById(`btnZoomOut${suffixe}`)?.addEventListener('click', () => {
      const view = carte.getView();
      view.animate({ zoom: view.getZoom() - 1, duration: 200 });
    });
    document.getElementById(`btnZoomReset${suffixe}`)?.addEventListener('click', () => {
      const extent = source?.getExtent();
      if (extent && !ol.extent.isEmpty(extent)) {
        carte.getView().fit(extent, { padding: [30, 30, 30, 30], maxZoom: 14, duration: 300 });
      } else {
        carte.getView().animate({ center: ol.proj.fromLonLat(DEFAULT_CENTER), zoom: DEFAULT_ZOOM, duration: 300 });
      }
    });

    observerRedimensionnementCarte(carte, `reportsMap${suffixe}`);
    initBoutonFondsCarte(suffixe, () => carte);

    if (!symbologieFixe) {
      document.querySelectorAll(`input[name="modeCouleur${suffixe}"]`).forEach(radio => {
        radio.addEventListener('change', () => {
          if (radio.checked) changerModeCouleur(radio.value);
        });
      });
    }
  }

  function lignesPourAnnee(lignes, annee) {
    return lignes.filter(l => !annee || anneeEvenement(l, champDate, champDateRepli) === annee);
  }

  function renderPoints(lignes, annee) {
    if (!source) return;

    const lignesFiltrees = lignesPourAnnee(lignes, annee);
    pointsAffiches = construirePoints(lignesFiltrees);
    if (!symbologieFixe) preparerCouleurs(pointsAffiches);
    construireLegende();

    source.clear();
    const features = pointsAffiches.map(p => new ol.Feature({
      ...p.ligne,
      siteType: p.siteType,
      pointZone: p.zone,
      pointLieuDit: p.lieuDit,
      geometry: new ol.geom.Point(lambert93VersEcran(p.coord))
    }));
    source.addFeatures(features);

    if (sourceLiens) {
      sourceLiens.clear();
      const traits = lignesFiltrees.flatMap(l => {
        const coordDestination = parseGeomPostGIS(l[champGeom]);
        const coordOrigine = champGeomOrigine ? parseGeomPostGIS(l[champGeomOrigine]) : null;
        if (!coordDestination || !coordOrigine) return [];
        return creerFeaturesLienSite(coordOrigine, coordDestination, symbologieFixe.couleurTrait);
      });
      sourceLiens.addFeatures(traits);
    }

    const extent = source.getExtent();
    if (!ol.extent.isEmpty(extent)) {
      carte.getView().fit(extent, { padding: [30, 30, 30, 30], maxZoom: 14, duration: 300 });
    }
  }

  async function charger(token, annee, chargerLignes) {
    try {
      await initCarte();
      const lignes = await chargerLignes(token);
      renderPoints(lignes, annee);
    } catch (err) {
      console.error(`Échec chargement carte des sites (${suffixe}):`, err);
    }
  }

  return { charger };
}

const carteCaptures = creerCarteSites({
  suffixe: 'Captures',
  champDate: 'capture_date',
  champDateRepli: 'relache_date',
  champZone: 'capture_zone',
  champLieuDit: 'capture_lieu_dit',
  champGeom: 'capture_site_geom',
  libellePopup: 'Site de capture'
});

const carteTranslocations = creerCarteSites({
  suffixe: 'Translocations',
  champDate: 'relache_date',
  champDateRepli: 'capture_date',
  champZone: 'relache_zone',
  champLieuDit: 'relache_lieu_dit',
  champGeom: 'relache_site_geom',
  champDateOrigine: 'capture_date',
  champZoneOrigine: 'capture_zone',
  champLieuDitOrigine: 'capture_lieu_dit',
  champGeomOrigine: 'capture_site_geom',
  libellePopup: 'Site de destination',
  symbologieFixe: {
    origine: { couleur: '#E63946', contour: '#ffffff', libelle: 'Site de capture' },
    destination: { couleur: '#3A86FF', contour: '#ffffff', libelle: 'Site de relâché' },
    couleurTrait: '#E63946'
  }
});

function chargerCarteCapturesSites(token, annee) {
  return carteCaptures.charger(token, annee, chargerCapturesReelles);
}

function chargerCarteTranslocationsSites(token, annee) {
  return carteTranslocations.charger(token, annee, chargerTranslocationsReelles);
}

const VUES_CHARGEES = new Set(['total']);

// Chargement differe : une vue n'interroge l'API qu'a sa premiere ouverture.
function chargerVueSiNecessaire(nomVue, token) {
  if (!token || VUES_CHARGEES.has(nomVue)) return;
  VUES_CHARGEES.add(nomVue);
  if (nomVue === 'suivi') {
    chargerTotalAnimauxSuivis(token);
    chargerRepartitionSexeSuivi(token);
    chargerRepartitionPopulationSuivi(token);
    chargerRepartitionGestionnaireSuivi(token);
  } else if (nomVue === 'equipes') {
    initFiltreAnneeEquipes(token);
    chargerTotalAnimauxEquipes(token, '');
    chargerRepartitionSexeEquipes(token, '');
    chargerRepartitionPopulationEquipes(token, '');
    chargerRepartitionGestionnaireEquipes(token, '');
  } else if (nomVue === 'captures') {
    initFiltreAnneeCaptures(token).then(annee => {
      chargerTotalAnimauxCaptures(token, annee);
      chargerRepartitionSexeCaptures(token, annee);
      chargerRepartitionPopulationCaptures(token, annee);
      chargerRepartitionGestionnaireCaptures(token, annee);
      chargerRepartitionObjectifCaptures(token, annee);
      chargerRepartitionMethodeCaptures(token, annee);
      chargerCarteCapturesSites(token, annee);
    });
  } else if (nomVue === 'translocations') {
    initFiltreAnneeTranslocations(token).then(annee => {
      chargerTotalAnimauxTransloques(token, annee);
      chargerRepartitionSexeTranslocations(token, annee);
      chargerRepartitionPopulationTranslocations(token, annee);
      chargerRepartitionGestionnaireTranslocations(token, annee);
      chargerCarteTranslocationsSites(token, annee);
    });
  }
}

function activerVue(nomVue) {
  document.querySelectorAll('.reports-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.vue === nomVue);
  });
  document.querySelectorAll('.reports-vue').forEach(vue => {
    vue.classList.toggle('active', vue.dataset.vue === nomVue);
  });
  chargerVueSiNecessaire(nomVue, tokenAuChargement);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.reports-nav-item').forEach(btn => {
    btn.addEventListener('click', () => activerVue(btn.dataset.vue));
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

  const selectAnneeEquipes = document.getElementById('selectAnneeEquipes');

  selectAnneeEquipes?.addEventListener('change', (e) => {
    if (!tokenAuChargement) return;
    chargerTotalAnimauxEquipes(tokenAuChargement, e.target.value);
    chargerRepartitionSexeEquipes(tokenAuChargement, e.target.value);
    chargerRepartitionPopulationEquipes(tokenAuChargement, e.target.value);
    chargerRepartitionGestionnaireEquipes(tokenAuChargement, e.target.value);
  });

  const selectAnneeCaptures = document.getElementById('selectAnneeCaptures');

  selectAnneeCaptures?.addEventListener('change', (e) => {
    if (!tokenAuChargement) return;
    chargerTotalAnimauxCaptures(tokenAuChargement, e.target.value);
    chargerRepartitionSexeCaptures(tokenAuChargement, e.target.value);
    chargerRepartitionPopulationCaptures(tokenAuChargement, e.target.value);
    chargerRepartitionGestionnaireCaptures(tokenAuChargement, e.target.value);
    chargerRepartitionObjectifCaptures(tokenAuChargement, e.target.value);
    chargerRepartitionMethodeCaptures(tokenAuChargement, e.target.value);
    chargerCarteCapturesSites(tokenAuChargement, e.target.value);
  });

  const selectAnneeTranslocations = document.getElementById('selectAnneeTranslocations');

  selectAnneeTranslocations?.addEventListener('change', (e) => {
    if (!tokenAuChargement) return;
    chargerTotalAnimauxTransloques(tokenAuChargement, e.target.value);
    chargerRepartitionSexeTranslocations(tokenAuChargement, e.target.value);
    chargerRepartitionPopulationTranslocations(tokenAuChargement, e.target.value);
    chargerRepartitionGestionnaireTranslocations(tokenAuChargement, e.target.value);
    chargerCarteTranslocationsSites(tokenAuChargement, e.target.value);
  });

  if (tokenAuChargement) {
    chargerTotalAnimauxDeclares(tokenAuChargement);
    chargerRepartitionSexeTotal(tokenAuChargement);
    chargerRepartitionPopulationTotal(tokenAuChargement);
    chargerRepartitionGestionnaireTotal(tokenAuChargement);
  }
});
