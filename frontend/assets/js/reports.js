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
 * Charge le nombre total d'individus (t_animal) et l'affiche dans la grille — le "-"
 * deja present dans le HTML sert d'etat de chargement, puis marquerErreur() en cas
 * d'echec (pas de message intrusif pour un simple chiffre non critique).
 */
async function chargerKpiTotalIndividus(token) {
  try {
    const { fetchCountAnimaux } = await chargerApi();
    const total = await fetchCountAnimaux(token);
    document.getElementById('kpiTotalIndividus').textContent = total.toLocaleString('fr-FR');
  } catch (err) {
    console.error('Échec chargement du nombre total d\'individus:', err);
    marquerErreur('kpiTotalIndividus');
  }
}

/**
 * Convertit une date JJ/MM/AAAA (format Flatpickr/affichage) en ISO AAAA-MM-JJ, format
 * attendu par les filtres PostgREST (gte./lte. sur capture_date/relache_date). Meme
 * conversion que getPeriodesActives() dans filters.js, dupliquee ici car reports.js
 * n'importe pas filters.js (page independante, pas de logique de filtre partagee).
 */
function convertirDateFrancaiseEnISO(dateStr) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return null;
  const [j, m, a] = dateStr.split('/');
  return `${a}-${m}-${j}`;
}

function lireFiltresPeriode() {
  const dateFrom = document.getElementById('reportsDateFrom')?.value || '';
  const dateTo = document.getElementById('reportsDateTo')?.value || '';
  return {
    date_from: convertirDateFrancaiseEnISO(dateFrom) || undefined,
    date_to: convertirDateFrancaiseEnISO(dateTo) || undefined
  };
}

/**
 * Charge les 3 indicateurs de stock global (non filtres par periode, cf. etape 6 du
 * plan) : individus transloques (+ repartition F/M), individus suivis GPS (+ pourcentage),
 * nombre de zones de translocation. Appelee uniquement au chargement initial — ces
 * chiffres ne dependent pas du selecteur de periode.
 */
async function chargerKpisStock(token) {
  try {
    const { fetchTranslocationIds, fetchAnimals, fetchAnimauxSuivis, fetchCountAnimaux, fetchCountZonesTranslocation } = await chargerApi();
    // "Suivis GPS" = etat ACTUEL (collier actif + derniere position transmise), meme
    // definition que la page Carte (fetchAnimauxSuivis) — PAS le cumul historique de
    // tous les individus equipes un jour (colliers aujourd'hui inactifs inclus). Ne
    // pas comparer ce chiffre a un rapport externe utilisant l'autre definition.
    const [transloquesIds, animaux, suivisIds, totalIndividus, nombreZones] = await Promise.all([
      fetchTranslocationIds(token),
      fetchAnimals(token),
      fetchAnimauxSuivis(token),
      fetchCountAnimaux(token),
      fetchCountZonesTranslocation(token)
    ]);

    const transloques = animaux.filter(a => transloquesIds.has(a.ani_id));
    const femelles = transloques.filter(a => a.ani_sexe === 'F').length;
    const males = transloques.filter(a => a.ani_sexe === 'M').length;
    document.getElementById('kpiTransloques').textContent = transloques.length.toLocaleString('fr-FR');
    document.getElementById('kpiTransloquesRepartition').textContent = `${femelles}F / ${males}M`;

    const pourcentageSuivi = totalIndividus > 0 ? Math.round((suivisIds.size / totalIndividus) * 100) : 0;
    document.getElementById('kpiSuiviGps').textContent = suivisIds.size.toLocaleString('fr-FR');
    document.getElementById('kpiSuiviGpsPourcentage').textContent = `${pourcentageSuivi}%`;

    document.getElementById('kpiZones').textContent = nombreZones.toLocaleString('fr-FR');
  } catch (err) {
    console.error('Échec chargement des indicateurs de stock:', err);
    marquerErreur('kpiTransloques');
    marquerErreur('kpiSuiviGps');
    marquerErreur('kpiZones');
  }
}

let periodeRequeteId = 0;

const ID_KPIS_PERIODE = ['kpiCaptures', 'kpiCapturesSanitaires', 'kpiEvenementsTranslocation', 'kpiSuiviGpsPeriode'];

/**
 * Bascule la classe .loading (opacite reduite, cf. reports.css) sur les KPI sensibles
 * a la periode pendant qu'une requete de rafraichissement est en vol — sans ca, un
 * changement rapide de periode laisse un ancien chiffre affiche sans aucun signal
 * qu'il ne correspond plus a la periode selectionnee (cf. audit durcissement, point 1).
 */
function setChargementPeriode(enCours) {
  ID_KPIS_PERIODE.forEach(id => {
    document.getElementById(id)?.classList.toggle('loading', enCours);
  });
}

/**
 * Charge les 3 indicateurs sensibles a la periode (Captures, Captures sanitaires,
 * Evenements de translocation) et les affiche. Appelee au chargement initial (periode
 * vide = historique complet) et a chaque changement des champs Du/Au. Garde de
 * sequence (periodeRequeteId) : si l'utilisateur modifie Du puis Au rapidement, deux
 * appels se chevauchent — sans garde, la reponse la plus lente pourrait ecraser
 * l'affichage avec un resultat perime.
 */
async function chargerKpisSensiblesPeriode(token) {
  const requeteId = ++periodeRequeteId;
  const filtres = lireFiltresPeriode();
  const periodeComplete = Boolean(filtres.date_from && filtres.date_to);
  setChargementPeriode(true);
  try {
    const { fetchCountCaptures, fetchCountCapturesSanitaires, fetchCountEvenementsTranslocation, fetchAnimalIdsParPeriode } = await chargerApi();
    // idsEquipesPeriode reste null si la periode n'est pas complete (Du et Au tous les
    // deux renseignes) — evite une requete inutile et garde le sous-texte invisible,
    // pour ne pas dérouter l'utilisateur sur ce que represente "la periode" a vide.
    const [captures, capturesSanitaires, evenementsTranslocation, idsEquipesPeriode] = await Promise.all([
      fetchCountCaptures(token, filtres),
      fetchCountCapturesSanitaires(token, filtres),
      fetchCountEvenementsTranslocation(token, filtres),
      periodeComplete ? fetchAnimalIdsParPeriode(token, filtres) : Promise.resolve(null)
    ]);
    if (requeteId !== periodeRequeteId) return;
    setChargementPeriode(false);
    document.getElementById('kpiCaptures').textContent = captures.toLocaleString('fr-FR');
    document.getElementById('kpiCapturesSanitaires').textContent = capturesSanitaires.toLocaleString('fr-FR');
    document.getElementById('kpiEvenementsTranslocation').textContent = evenementsTranslocation.toLocaleString('fr-FR');

    const kpiSuiviGpsPeriode = document.getElementById('kpiSuiviGpsPeriode');
    if (kpiSuiviGpsPeriode) {
      kpiSuiviGpsPeriode.textContent = periodeComplete
        ? `${idsEquipesPeriode.length.toLocaleString('fr-FR')} équipés sur la période`
        : '';
    }
  } catch (err) {
    if (requeteId !== periodeRequeteId) return;
    setChargementPeriode(false);
    console.error('Échec chargement des indicateurs sensibles à la période:', err);
    marquerErreur('kpiCaptures');
    marquerErreur('kpiCapturesSanitaires');
    marquerErreur('kpiEvenementsTranslocation');
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

  document.getElementById('reportsDateFrom')?.addEventListener('input', () => {
    if (tokenAuChargement) chargerKpisSensiblesPeriode(tokenAuChargement);
  });
  document.getElementById('reportsDateTo')?.addEventListener('input', () => {
    if (tokenAuChargement) chargerKpisSensiblesPeriode(tokenAuChargement);
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
    chargerKpiTotalIndividus(tokenAuChargement);
    chargerKpisSensiblesPeriode(tokenAuChargement);
    chargerKpisStock(tokenAuChargement);
  } else {
    afficherLoginScreen();
  }
});
