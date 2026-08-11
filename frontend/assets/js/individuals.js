import { login, fetchAnimals, fetchColliersActifs, fetchAnimalDetail, fetchCapteurParAnimal, fetchCaptureRelacheParAnimal, fetchLocalisationsAnimal, fetchLocalisationsRPC } from './api.js';
import { ROLE_LABELS, ROLE_INITIALES, LAMBERT93, DEFAULT_CENTER, DEFAULT_ZOOM, IGN_API_KEY, BASEMAPS_CONFIG, COULEURS_MARQUAGE, GLASBEY_32, getCouleurParIndex, SEUILS_FRAICHEUR_POSITION } from './config.js';

let currentToken = null;
let currentAniId = null;
let animals = [];
let colliersActifs = new Set();
let dernierePositionParAnimal = new Map();
let loginEnCours = false;
let pageCourante = 1;
let filtresListeAvantFiche = null;
const LIGNES_PAR_PAGE = 25;

// Cartes de la fiche individu — instances OpenLayers autonomes, independantes du
// singleton de map.js (page separee, pas de conflit de contexte JS possible)
let _carteLocalisations = null;
let _sourceLocalisations = null;
// Carte "sites de capture/relache" fusionnee — deux sources vectorielles (couleurs
// distinctes) sur une seule instance OpenLayers, plutot que deux cartes separees.
let _carteSites = null;
let _sourceSitesPoints = null;
let _sourceSitesLiens = null;
let _popupOverlayLocalisations = null;
let _popupOverlaySites = null;
let _projRegistered = false;

// Graphique Distance (Chart.js)
let _chartDistanceMois = null;
let _resizeObserversGraphiques = [];

/**
 * AUTHENTIFICATION
 * Reproduit le pattern d'app.js — overlay #loginScreen affiché/masqué en JS,
 * pas de redirection HTTP, jeton en sessionStorage.
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

document.getElementById('sessionTrigger')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = document.getElementById('sessionMenu');
  const chevron = document.getElementById('sessionChevron');
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
  chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
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

/**
 * VUE LISTE
 */

// Statut — priorite : mort (ani_date_mort renseignee) > actif (collier actif au sens
// strict de Ludovic : cor_date_fin IS NULL, cf. fetchColliersActifs) > non_suivi par
// defaut. Independant de la presence de positions GPS transmises (contrairement a
// fetchAnimauxSuivis(), utilisee par la page Carte, non modifiee).
function computeStatut(ani, colliersActifsSet) {
  if (ani.ani_date_mort) return 'mort';
  if (colliersActifsSet.has(ani.ani_id)) return 'actif';
  return 'non_suivi';
}

const STATUT_LABELS = {
  actif: 'Suivi actif',
  non_suivi: 'Non suivi',
  mort: 'Mort'
};

const STATUT_CLASSES = {
  actif: 'indiv-statut-actif',
  non_suivi: 'indiv-statut-non-suivi',
  mort: 'indiv-statut-mort'
};

// Palier de fraicheur d'une derniere position, pour un animal en suivi actif — lit
// SEUILS_FRAICHEUR_POSITION (config.js). Retourne null si la position est assez recente
// (pas d'alerte a afficher), 'aucune' si l'animal n'a jamais eu de position (cas distinct
// d'un simple retard, cf. strategie validee), sinon le palier le plus severe atteint.
function computeFraicheur(dateDerniere) {
  if (!dateDerniere) return 'aucune';
  const heuresEcoulees = (Date.now() - new Date(dateDerniere).getTime()) / 3600000;
  if (heuresEcoulees >= SEUILS_FRAICHEUR_POSITION.rouge) return 'rouge';
  if (heuresEcoulees >= SEUILS_FRAICHEUR_POSITION.orange) return 'orange';
  if (heuresEcoulees >= SEUILS_FRAICHEUR_POSITION.jaune) return 'jaune';
  return null;
}

const FRAICHEUR_LABELS = {
  jaune: 'Pas de position depuis plus de 24h',
  orange: 'Pas de position depuis plus de 2 jours',
  rouge: 'Pas de position depuis plus de 3 jours',
  aucune: 'Aucune position reçue'
};

// Duree ecoulee depuis la derniere position, format compact pour la colonne Fraicheur
// (distinct du texte complet du tooltip, cf. FRAICHEUR_LABELS) — heures sous 48h, jours au-dela.
function formaterEcheanceFraicheur(dateDerniere) {
  const heures = (Date.now() - new Date(dateDerniere).getTime()) / 3600000;
  return heures < 48 ? `${Math.floor(heures)} h` : `${Math.floor(heures / 24)} j`;
}

// Contenu de la colonne Fraicheur (2e position, apres Nom) — pastille + texte court,
// style compact. tier vient de computeFraicheur() : null (position recente, texte =
// heures ecoulees via formaterEcheanceFraicheur, meme format que jaune/orange/rouge),
// 'aucune' (jamais de position), ou le palier atteint (jaune/orange/rouge).
function creerCelluleFraicheur(tier, dateDerniere) {
  const cellule = document.createElement('div');
  cellule.className = 'indiv-fraicheur-cellule';

  const pastille = document.createElement('span');
  const texte = document.createElement('span');
  texte.className = 'indiv-fraicheur-texte';

  if (tier === 'aucune') {
    pastille.className = 'indiv-fraicheur-pastille indiv-fraicheur-aucune';
    texte.textContent = 'Aucune position';
    cellule.title = FRAICHEUR_LABELS.aucune;
  } else if (tier) {
    pastille.className = `indiv-fraicheur-pastille indiv-fraicheur-${tier}`;
    texte.textContent = formaterEcheanceFraicheur(dateDerniere);
    cellule.title = `${FRAICHEUR_LABELS[tier]} (dernière position : ${formaterDateHeure(dateDerniere)})`;
  } else {
    pastille.className = 'indiv-fraicheur-pastille indiv-fraicheur-a-jour';
    texte.textContent = formaterEcheanceFraicheur(dateDerniere);
    cellule.title = `Dernière position : ${formaterDateHeure(dateDerniere)}`;
  }

  cellule.append(pastille, texte);
  return cellule;
}

let colonneTriee = null;
let sensTriee = 'asc';

// Statut : ordre logique (actif = le plus pertinent a surveiller), pas alphabetique.
const ORDRE_STATUT = { actif: 0, non_suivi: 1, mort: 2 };

function comparerTexte(a, b) {
  return (a || '').localeCompare(b || '', 'fr', { sensitivity: 'base' });
}

function comparerNombre(a, b) {
  const na = a == null || a === '' ? Infinity : Number(a);
  const nb = b == null || b === '' ? Infinity : Number(b);
  return na - nb;
}

// Cle numerique de tri pour Fraicheur — heures ecoulees depuis la derniere position
// (pas le texte affiche). Infinity pour non-actif ou "jamais de position" : ces cas
// se classent systematiquement en dernier en ordre croissant, sans logique conditionnelle
// selon le sens du tri.
function cleTriFraicheur(ani) {
  if (computeStatut(ani, colliersActifs) !== 'actif') return Infinity;
  const dateDerniere = dernierePositionParAnimal.get(String(ani.ani_id));
  if (!dateDerniere) return Infinity;
  return (Date.now() - new Date(dateDerniere).getTime()) / 3600000;
}

const COMPARATEURS_COLONNES = {
  nom: (a, b) => comparerTexte(a.ani_nom, b.ani_nom),
  fraicheur: (a, b) => cleTriFraicheur(a) - cleTriFraicheur(b),
  id: (a, b) => comparerNombre(a.ani_id, b.ani_id),
  sexe: (a, b) => comparerTexte(a.ani_sexe, b.ani_sexe),
  annee: (a, b) => comparerNombre(a.ani_annee_naissance, b.ani_annee_naissance),
  population: (a, b) => comparerTexte(a.ani_pop_rattach, b.ani_pop_rattach),
  gestionnaire: (a, b) => comparerTexte(a.ani_gestionnaire, b.ani_gestionnaire),
  statut: (a, b) => (ORDRE_STATUT[computeStatut(a, colliersActifs)] ?? 99) - (ORDRE_STATUT[computeStatut(b, colliersActifs)] ?? 99)
};

// Met a jour l'etat de tri puis delegue le rendu a rendrePageIndividus() — le tri porte
// sur l'ensemble filtre complet (pas seulement la page affichee), et revient a la page 1
// (un nouvel ordre rend la page courante arbitraire par rapport au resultat precedent).
function trierTableau(colonne) {
  if (!COMPARATEURS_COLONNES[colonne]) return;

  sensTriee = (colonneTriee === colonne && sensTriee === 'asc') ? 'desc' : 'asc';
  colonneTriee = colonne;
  pageCourante = 1;

  mettreAJourIndicateursTri();
  rendrePageIndividus();
}

function mettreAJourIndicateursTri() {
  document.querySelectorAll('.indiv-col-triable').forEach(col => {
    const active = col.dataset.colonne === colonneTriee;
    col.classList.toggle('indiv-col-triee', active);
    const up = col.querySelector('.indiv-sort-up');
    const down = col.querySelector('.indiv-sort-down');
    if (up) up.classList.toggle('active', active && sensTriee === 'asc');
    if (down) down.classList.toggle('active', active && sensTriee === 'desc');
  });
}

document.querySelectorAll('.indiv-col-triable').forEach(col => {
  col.addEventListener('click', () => trierTableau(col.dataset.colonne));
});

// Pastille compacte de statut pour les lignes de la liste — meme icone/couleur
// que la pastille sur la photo de la fiche individu (PASTILLE_ICONES/STATUT_CLASSES,
// cf. remplirPastilleStatutPhoto), juste plus petite. Le texte du statut n'est plus
// affiche en clair ; le title (tooltip natif) porte l'accessibilite.
function creerPastilleStatut(statutKey) {
  const pastille = document.createElement('span');
  pastille.className = `indiv-statut-pastille ${STATUT_CLASSES[statutKey] || STATUT_CLASSES.non_suivi}`;
  pastille.innerHTML = PASTILLE_ICONES[statutKey] || PASTILLE_ICONES.non_suivi;
  pastille.title = STATUT_LABELS[statutKey] || STATUT_LABELS.non_suivi;
  return pastille;
}

// Icones statiques (jamais de donnee libre issue de la base) — innerHTML sans risque ici,
// a la difference de creerValeurNode() qui protege les champs texte de t_animal.
// Paths repris de SVG deja presents dans assets/img/ (Font Awesome Free), remplis en
// blanc (fill="#ffffff") pour ressortir sur le fond colore de la pastille. actif et
// non_suivi partagent la meme icone (coche) — seule la couleur de fond les distingue
// (cf. STATUT_CLASSES + regles CSS .indiv-statut-actif/non-suivi). mort garde sa
// propre icone (croix) pour rester identifiable meme sans se fier a la seule couleur.
// Pour circle-xmark, seul le sous-path du symbole (X) est garde — le sous-path du
// cercle exterieur d'origine est retire pour ne pas dupliquer le contour deja assure
// par .fiche-illustration-statut (bordure blanche + fond colore).
const ICONE_PASTILLE_COCHE = '<svg viewBox="0 0 512 512" fill="#ffffff"><path d="M305.44954,462.59c7.39157,7.29792,6.18829,20.09661-3.00038,25.00356-77.713,41.80281-176.72559,29.9105-242.34331-35.7082C-5.49624,386.28227-17.404,287.362,24.41381,209.554c4.89125-9.095,17.68975-10.29834,25.00318-3.00043L166.22872,323.36708l27.39411-27.39452c-.68759-2.60974-1.594-5.00071-1.594-7.81361a32.00407,32.00407,0,1,1,32.00407,32.00455c-2.79723,0-5.20378-.89075-7.79786-1.594l-27.40974,27.41015ZM511.9758,303.06732a16.10336,16.10336,0,0,1-16.002,17.00242H463.86031a15.96956,15.96956,0,0,1-15.89265-15.00213C440.46671,175.5492,336.45348,70.53427,207.03078,63.53328a15.84486,15.84486,0,0,1-15.00191-15.90852V16.02652A16.09389,16.09389,0,0,1,209.031.02425C372.25491,8.61922,503.47472,139.841,511.9758,303.06732Zm-96.01221-.29692a16.21093,16.21093,0,0,1-16.11142,17.29934H367.645a16.06862,16.06862,0,0,1-15.89265-14.70522c-6.90712-77.01094-68.118-138.91037-144.92467-145.22376a15.94,15.94,0,0,1-14.79876-15.89289V112.13393a16.134,16.134,0,0,1,17.29908-16.096C319.45132,104.5391,407.55627,192.64538,415.96359,302.7704Z"/></svg>';

const PASTILLE_ICONES = {
  actif: ICONE_PASTILLE_COCHE,
  non_suivi: ICONE_PASTILLE_COCHE,
  mort: '<svg viewBox="0 0 640 640" fill="#ffffff"><path d="M231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/></svg>'
};

// Pastille de statut superposee sur la photo (angle inferieur droit, cf. .fiche-illustration-statut) —
// reutilise computeStatut/STATUT_CLASSES/STATUT_LABELS, meme source de verite que le badge texte.
function remplirPastilleStatutPhoto(detail) {
  const pastille = document.getElementById('ficheIllustrationStatut');
  if (!pastille) return;
  const statutKey = computeStatut(detail || {}, colliersActifs);
  pastille.className = `fiche-illustration-statut ${STATUT_CLASSES[statutKey] || STATUT_CLASSES.non_suivi}`;
  pastille.innerHTML = PASTILLE_ICONES[statutKey] || PASTILLE_ICONES.non_suivi;
  pastille.title = STATUT_LABELS[statutKey] || STATUT_LABELS.non_suivi;
}

function peuplerFiltresDynamiques() {
  const selectPopulation = document.getElementById('filtreColPopulation');
  if (selectPopulation) {
    const valeurActuelle = selectPopulation.value;
    const populations = [...new Set(animals.map(a => a.ani_pop_rattach).filter(Boolean))].sort();
    selectPopulation.innerHTML = '<option value="">Tous</option>';
    populations.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      selectPopulation.appendChild(opt);
    });
    selectPopulation.value = valeurActuelle;
  }

  const selectGestionnaire = document.getElementById('filtreColGestionnaire');
  if (selectGestionnaire) {
    const valeurActuelle = selectGestionnaire.value;
    const gestionnaires = [...new Set(animals.map(a => a.ani_gestionnaire).filter(Boolean))].sort();
    selectGestionnaire.innerHTML = '<option value="">Tous</option>';
    gestionnaires.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      selectGestionnaire.appendChild(opt);
    });
    selectGestionnaire.value = valeurActuelle;
  }
}

const IDS_FILTRES_TEXTE = ['filtreColNom'];
const IDS_FILTRES_SELECT = ['filtreColSexe', 'filtreColPopulation', 'filtreColGestionnaire', 'filtreColStatut'];

function lireValeurFiltre(id) {
  return document.getElementById(id)?.value || '';
}

function definirValeurFiltre(id, valeur) {
  const el = document.getElementById(id);
  if (!el) return;
  const valeurNormalisee = valeur == null ? '' : String(valeur);
  if (el.tomselect) el.tomselect.setValue(valeurNormalisee, true);
  else el.value = valeurNormalisee;
}

function memoriserFiltresListe() {
  const valeurs = {};
  [...IDS_FILTRES_TEXTE, ...IDS_FILTRES_SELECT].forEach(id => {
    valeurs[id] = lireValeurFiltre(id);
  });
  return valeurs;
}

function restaurerFiltresListe(valeurs) {
  if (!valeurs) return;
  Object.entries(valeurs).forEach(([id, valeur]) => definirValeurFiltre(id, valeur));
}

function estVueFicheActive() {
  return document.getElementById('vueFiche')?.style.display !== 'none';
}

function obtenirCriteresFiltres({ inclureNom = true } = {}) {
  return {
    nom: inclureNom ? lireValeurFiltre('filtreColNom').trim().toLowerCase() : '',
    sexe: lireValeurFiltre('filtreColSexe'),
    population: lireValeurFiltre('filtreColPopulation'),
    gestionnaire: lireValeurFiltre('filtreColGestionnaire'),
    statut: lireValeurFiltre('filtreColStatut')
  };
}

function animalCorrespondAuxFiltres(ani, criteres) {
  const nom = (ani.ani_nom || '').toLowerCase();
  const population = ani.ani_pop_rattach || '';
  const gestionnaire = ani.ani_gestionnaire || '';
  const statut = computeStatut(ani, colliersActifs);

  return (
    (!criteres.nom || nom.includes(criteres.nom)) &&
    (!criteres.sexe || ani.ani_sexe === criteres.sexe) &&
    (!criteres.population || population === criteres.population) &&
    (!criteres.gestionnaire || gestionnaire === criteres.gestionnaire) &&
    (!criteres.statut || statut === criteres.statut)
  );
}

// En vue fiche, la sidebar bascule entierement sur la carte d'identite de l'animal
// affiche (#indivSidebarIdentite) — plus aucun filtre ni recherche visible.
function definirModeSidebarFiche(actif) {
  document.getElementById('indivSidebar')?.classList.toggle('indiv-sidebar--fiche', actif);

  const titre = document.getElementById('indivSidebarHeader');
  if (titre) titre.textContent = actif ? 'FICHE INDIVIDU' : 'FILTRES';
}

/**
 * Combine les filtres par colonne (ET logique) — filtrage purement client, sur les
 * donnees deja chargees par fetchAnimals() (aucun appel API). Fonction pure : renvoie
 * le sous-ensemble filtre, ne touche pas au DOM (cf. rendrePageIndividus()).
 */
function obtenirAnimauxFiltres() {
  const criteres = obtenirCriteresFiltres();
  return animals.filter(ani => animalCorrespondAuxFiltres(ani, criteres));
}

// Le filtrage en temps reel revient toujours a la page 1, car chaque modification
// change l'ensemble de resultats.
function appliquerFiltresListe() {
  pageCourante = 1;
  rendrePageIndividus();
}

document.getElementById('btnReinitialiserFiltres')?.addEventListener('click', reinitialiserFiltresListe);

document.getElementById('filtreColNom')?.addEventListener('input', appliquerFiltresListe);

IDS_FILTRES_SELECT.forEach(id => {
  document.getElementById(id)?.addEventListener('change', appliquerFiltresListe);
});

document.querySelector('.indiv-sidebar-body')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('sidebar-input')) {
    e.preventDefault();
    appliquerFiltresListe();
  }
});

// Vide les 5 champs (TomSelect inclus) puis reapplique — equivaut a "tout afficher".
function reinitialiserFiltresListe() {
  IDS_FILTRES_TEXTE.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  IDS_FILTRES_SELECT.forEach(id => {
    const el = document.getElementById(id);
    if (el?.tomselect) el.tomselect.setValue('');
    else if (el) el.value = '';
  });
  appliquerFiltresListe();
}

// TomSelect — remplace le rendu natif de ces 4 selects, dont le popup ouvert
// (coins arrondis + ombre sur Chrome/Windows) ignore border-radius/box-shadow en CSS.
// dropdownParent: 'body' (chaine litterale, pas document.body — TomSelect ne recalcule
// la position du dropdown au scroll/resize que si ce reglage vaut exactement la chaine
// 'body', cf. positionDropdown() dans tom-select) evite que le panneau d'options soit
// coupe par overflow:hidden sur .indiv-liste quand la liste est vide (aucune ligne
// visible => .indiv-liste s'effondre a la hauteur de la seule entete, cf. bug signale
// par Ludovic 2026-07-30 : filtres Population+Gestionnaire combines sans resultat).
// classList.add ci-dessous recree le ciblage CSS perdu par ce deplacement hors de
// #indivScreen (cf. .indiv-col-filtre-dropdown, individuals.css).
function initTomSelectFiltresColonnes() {
  ['filtreColSexe', 'filtreColPopulation', 'filtreColGestionnaire', 'filtreColStatut'].forEach(id => {
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
    ts.dropdown.classList.add('indiv-col-filtre-dropdown');
  });
}

// Ferme les dropdowns TomSelect ouverts au scroll de la liste — dropdownParent:'body'
// (ci-dessus) ne recalcule la position du dropdown qu'au scroll/resize de la fenetre
// (cf. positionDropdown() dans tom-select), jamais au scroll interne de #indivScreen
// (overflow-y:auto, un evenement scroll sur un conteneur ne remonte pas jusqu'a window).
// Sans ca, le dropdown reste fige a l'ecran pendant que le select defile en dessous.
document.getElementById('indivScreen')?.addEventListener('scroll', () => {
  ['filtreColSexe', 'filtreColPopulation', 'filtreColGestionnaire', 'filtreColStatut'].forEach(id => {
    document.getElementById(id)?.tomselect?.close();
  });
}, { passive: true });

// Construit une ligne .indiv-row pour un animal donne — appelee uniquement pour les
// animaux de la page courante (cf. rendrePageIndividus()), pas pour tout animals d'un coup.
function creerLigneIndividu(ani) {
  const row = document.createElement('div');
  row.className = 'indiv-row';

  const statutKey = computeStatut(ani, colliersActifs);

  const celluleNom = document.createElement('div');
  celluleNom.className = 'indiv-cell';
  celluleNom.appendChild(creerValeurNode(ani.ani_nom));

  const celluleId = document.createElement('div');
  celluleId.className = 'indiv-cell';
  celluleId.appendChild(creerValeurNode(ani.ani_id));

  const celluleSexe = document.createElement('div');
  celluleSexe.className = 'indiv-cell';
  celluleSexe.appendChild(creerValeurNode(ani.ani_sexe));

  const celluleAnnee = document.createElement('div');
  celluleAnnee.className = 'indiv-cell';
  celluleAnnee.appendChild(creerValeurNode(ani.ani_annee_naissance));

  const cellulePopulation = document.createElement('div');
  cellulePopulation.className = 'indiv-cell';
  cellulePopulation.appendChild(creerValeurNode(ani.ani_pop_rattach));

  const celluleGestionnaire = document.createElement('div');
  celluleGestionnaire.className = 'indiv-cell';
  celluleGestionnaire.appendChild(creerValeurNode(ani.ani_gestionnaire));

  const celluleStatut = document.createElement('div');
  celluleStatut.className = 'indiv-cell';
  celluleStatut.appendChild(creerPastilleStatut(statutKey));

  const celluleFraicheur = document.createElement('div');
  celluleFraicheur.className = 'indiv-cell';
  if (statutKey === 'actif') {
    const dateDerniere = dernierePositionParAnimal.get(String(ani.ani_id));
    const tier = computeFraicheur(dateDerniere);
    celluleFraicheur.appendChild(creerCelluleFraicheur(tier, dateDerniere));
  } else {
    const tiret = document.createElement('span');
    tiret.className = 'valeur-na';
    tiret.textContent = '-';
    celluleFraicheur.appendChild(tiret);
  }

  row.append(celluleNom, celluleFraicheur, celluleId, celluleSexe, celluleAnnee, cellulePopulation, celluleGestionnaire, celluleStatut);
  row.addEventListener('click', () => afficherFiche(ani.ani_id));
  return row;
}

// Pipeline complet : filtre -> trie -> pagine -> ne rend que la page courante. Remplace
// entierement l'ancien mecanisme display:none par ligne — plus aucune ligne masquee dans
// le DOM, seule la page courante y est presente a un instant donne.
function rendrePageIndividus() {
  const corps = document.getElementById('indivTableBody');
  if (!corps) return;

  let liste = obtenirAnimauxFiltres();
  if (colonneTriee) {
    const comparateur = COMPARATEURS_COLONNES[colonneTriee];
    liste = [...liste].sort((a, b) => {
      const cmp = comparateur(a, b);
      return sensTriee === 'asc' ? cmp : -cmp;
    });
  }

  const totalPages = Math.max(1, Math.ceil(liste.length / LIGNES_PAR_PAGE));
  pageCourante = Math.min(Math.max(1, pageCourante), totalPages);

  const debut = (pageCourante - 1) * LIGNES_PAR_PAGE;
  const page = liste.slice(debut, debut + LIGNES_PAR_PAGE);

  corps.innerHTML = '';
  page.forEach(ani => corps.appendChild(creerLigneIndividu(ani)));

  mettreAJourPagination(totalPages, liste.length);
}

function obtenirElementsPagination(totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (pageCourante <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }

  if (pageCourante >= totalPages - 3) {
    return [
      1,
      'ellipsis',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages
    ];
  }

  return [
    1,
    'ellipsis',
    pageCourante - 1,
    pageCourante,
    pageCourante + 1,
    'ellipsis',
    totalPages
  ];
}

function creerBoutonPagination(libelle, pageCible, { actif = false, disabled = false } = {}) {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = `page-btn${actif ? ' active' : ''}`;
  bouton.textContent = libelle;
  bouton.dataset.page = pageCible;
  bouton.disabled = disabled;

  if (actif) {
    bouton.setAttribute('aria-current', 'page');
  }

  return bouton;
}

function mettreAJourPagination(totalPages, totalLignes) {
  const infoEl = document.getElementById('indivTableInfo');
  if (infoEl) {
    const premiereLigne = totalLignes === 0
      ? 0
      : (pageCourante - 1) * LIGNES_PAR_PAGE + 1;
    const derniereLigne = Math.min(pageCourante * LIGNES_PAR_PAGE, totalLignes);
    infoEl.textContent = `ligne(s) ${premiereLigne} à ${derniereLigne} sur ${totalLignes}`;
  }

  const pagination = document.getElementById('indivPagination');
  if (!pagination) return;

  pagination.innerHTML = '';

  pagination.appendChild(
    creerBoutonPagination('Premier', 1, {
      disabled: pageCourante === 1
    })
  );

  pagination.appendChild(
    creerBoutonPagination('<', pageCourante - 1, {
      disabled: pageCourante === 1
    })
  );

  obtenirElementsPagination(totalPages).forEach(element => {
    if (element === 'ellipsis') {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'page-ellipsis';
      ellipsis.textContent = '…';
      ellipsis.setAttribute('aria-hidden', 'true');
      pagination.appendChild(ellipsis);
      return;
    }

    pagination.appendChild(
      creerBoutonPagination(String(element), element, {
        actif: element === pageCourante
      })
    );
  });

  pagination.appendChild(
    creerBoutonPagination('>', pageCourante + 1, {
      disabled: pageCourante === totalPages
    })
  );

  pagination.appendChild(
    creerBoutonPagination('Dernier', totalPages, {
      disabled: pageCourante === totalPages
    })
  );
}

document.getElementById('indivPagination')?.addEventListener('click', (e) => {
  const bouton = e.target.closest('.page-btn[data-page]');
  if (!bouton || bouton.disabled || bouton.classList.contains('active')) return;

  const pageDemandee = Number(bouton.dataset.page);
  if (!Number.isInteger(pageDemandee) || pageDemandee < 1) return;

  pageCourante = pageDemandee;
  rendrePageIndividus();

  const corps = document.getElementById('indivTableBody');
  if (corps) corps.scrollTop = 0;
});

function peuplerTableauListe() {
  peuplerFiltresDynamiques();
  initTomSelectFiltresColonnes();
  mettreAJourIndicateursTri();
  pageCourante = 1;
  rendrePageIndividus();
}

/**
 * NAVIGATION LISTE / FICHE
 */

// Nœud DOM sûr pour une valeur potentiellement manquante — jamais d'innerHTML sur une
// donnée texte libre issue de la base (ani_nom, commentaires...), pour éviter tout
// vecteur d'injection HTML/JS stocke. Le span N/A est construit via createElement,
// jamais via une chaine HTML interpretee.
function creerValeurNode(v) {
  if (v === null || v === undefined || v === '') {
    const span = document.createElement('span');
    span.className = 'valeur-na';
    span.textContent = '-';
    return span;
  }
  return document.createTextNode(v);
}

// Formate une date/heure ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm[:ss]) en JJ/MM/AAAA, ou
// JJ/MM/AAAA HH:mm si une heure significative est presente (differente de minuit) —
// beaucoup de dates de capture/pose n'ont pas d'heure reelle (minuit par defaut cote
// base), qu'il serait trompeur d'afficher comme un horaire precis. Parsing par regex
// plutot que new Date() : evite tout decalage d'un jour du a l'interpretation UTC
// d'une chaine date-only par le fuseau local du navigateur. Retourne la valeur brute
// inchangee si le format n'est pas reconnu (securite).
function formaterDateHeure(valeur, avecHeure = true) {
  if (!valeur) return valeur;
  const chaine = String(valeur);
  const correspondance = chaine.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!correspondance) return valeur;

  const [, aaaa, mm, jj, hh, min, ss] = correspondance;
  const dateFormatee = `${jj}/${mm}/${aaaa}`;
  if (!avecHeure) return dateFormatee;

  const heureMinuit = !hh || (hh === '00' && min === '00' && (ss === undefined || ss === '00'));
  return heureMinuit ? dateFormatee : `${dateFormatee} ${hh}:${min}`;
}

// Ligne label/valeur — evite d'ajouter de nouvelles classes CSS (hors perimetre de cette etape)
function ligneInfo(label, valeur) {
  const p = document.createElement('p');
  p.style.margin = '0 0 4px 0';
  const strong = document.createElement('strong');
  strong.textContent = `${label} : `;
  p.appendChild(strong);
  p.appendChild(creerValeurNode(valeur));
  return p;
}

function remplirIdentite(detail, collierActif, capteurs) {
  const corpsPrincipal = document.getElementById('carteIdentitePrincipale');
  if (corpsPrincipal) {
    corpsPrincipal.innerHTML = '';
    corpsPrincipal.appendChild(ligneInfo('Code', detail?.ani_code));
    corpsPrincipal.appendChild(ligneInfo('Sexe', detail?.ani_sexe));
    corpsPrincipal.appendChild(ligneInfo('Année de naissance', detail?.ani_annee_naissance));
    corpsPrincipal.appendChild(ligneInfo('Population', detail?.ani_pop_rattach));
    corpsPrincipal.appendChild(ligneInfo('Gestionnaire', detail?.ani_gestionnaire));
  }

  const corpsMarquage = document.getElementById('carteIdentiteMarquage');
  if (corpsMarquage) {
    corpsMarquage.innerHTML = '';
    corpsMarquage.appendChild(ligneInfo('Oreille droite', detail?.ani_marquage_oreille_droite));
    corpsMarquage.appendChild(ligneInfo('Oreille gauche', detail?.ani_marquage_oreille_gauche));
    // Meme donnee et meme logique conditionnelle que l'illustration (cf.
    // appliquerCouleursMarquage) — N/A si pas de collier actif, coherent avec le
    // masquage du SVG collier/badge capteur dans ce cas.
    const couleurCollierAffichee = collierActif ? capteurs?.[0]?.t_capteur?.capt_couleur_collier : null;
    corpsMarquage.appendChild(ligneInfo('Couleur du collier', couleurCollierAffichee));
    corpsMarquage.appendChild(ligneInfo('Commentaire', detail?.ani_commentaire));
  }
}

/**
 * Dates cles — Date de premiere capture (min sur les captures deja chargees,
 * aucun nouvel appel API) et Derniere localisation (max sur le chargement initial
 * de la carte GPS, avant tout filtre manuel via Actualiser — pas recalculee ensuite
 * pour rester une donnee stable de l'animal plutot qu'un reflet du filtre courant).
 */
function remplirDatesCles(captures, locations) {
  const corps = document.getElementById('carteIdentiteDates');
  if (!corps) return;
  corps.innerHTML = '';

  const datesCapture = (captures || []).map(dateReferenceEvenement).filter(Boolean);
  const premiereCapture = datesCapture.length > 0 ? datesCapture.reduce((min, d) => d < min ? d : min) : null;
  corps.appendChild(ligneInfo('Date de première capture', formaterDateHeure(premiereCapture, false)));

  const datesLocalisation = (locations || [])
    .map(l => l.loc_datetime_local || l.loc_date_local)
    .filter(Boolean);
  const derniereLocalisation = datesLocalisation.length > 0
    ? datesLocalisation.reduce((max, d) => d > max ? d : max)
    : null;
  corps.appendChild(ligneInfo('Dernière localisation', formaterDateHeure(derniereLocalisation, false)));
}

/**
 * ILLUSTRATION COMPOSEE (photo + collier/oreilles SVG recolores + capteur PNG fixe)
 * Collier + badge capteur visibles seulement si collierActif (cor_date_fin IS NULL sur
 * la pose la plus recente) ET couleur renseignee/reconnue — masques sinon
 * (.fiche-illustration-masque, cf. individuals.css), meme logique que les oreilles :
 * jamais de couleur grisee/incertaine affichee. Couleur du collier lue sur
 * capt_couleur_collier (t_capteur, embedding de fetchCapteurParAnimal) — rattachee
 * a la pose elle-meme depuis la migration Ludovic (ancien champ t_animal.
 * ani_marquage_couleur_collier n'avait structurellement aucun lien avec les poses
 * successives de collier, cf. historique docs/CHANGELOG.md).
 * Couleurs texte libres en base — variantes de casse/accents/genre a normaliser.
 * Mapping COULEURS_MARQUAGE centralise dans config.js.
 */

function normaliserCouleur(valeur) {
  if (!valeur) return null;
  const brut = valeur.toString().trim();
  const cle = brut
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // retire les accents
    .split(/[\/-]/)[0]        // valeurs composites ('jaune / bleu', 'blanc-rouge-blanc') — garde la 1re couleur
    .trim();

  const couleur = COULEURS_MARQUAGE[cle];
  if (!couleur) {
    console.warn(`Couleur de marquage non reconnue : "${brut}" (clé normalisée "${cle}").`);
  }
  return couleur || null;
}

function appliquerCouleursMarquage(detail, collierActif, capteurs) {
  // Photo de profil generique — variante femelle (cornes plus petites) si ani_sexe = 'F',
  // sinon photo par defaut (couvre aussi M/N/A). Classe --femelle sur le conteneur pilote
  // aussi les positions collier/oreilles/capteur specifiques (cf. individuals.css) — les
  // deux photos ont un cadrage different, un seul jeu de % ne convient pas aux deux.
  const estFemelle = detail?.ani_sexe === 'F';
  const ficheIllustration = document.querySelector('.fiche-illustration');
  ficheIllustration?.classList.toggle('fiche-illustration--femelle', estFemelle);

  const fichePhoto = document.getElementById('fichePhoto');
  if (fichePhoto) {
    fichePhoto.src = estFemelle
      ? '../assets/img/femelle.jpg'
      : '../assets/img/bqt_profil_normal.jpg';
  }

  // Depuis le passage au sprite SVG, la colorisation se fait via la propriété CSS `color`
  // sur l'élément <use>. Le <path> dans le sprite porte fill="currentColor", qui hérite
  // de `color` à travers le shadow DOM du <use> référençant un fichier externe.
  // Collier + badge capteur visibles seulement si collierActif ET couleur renseignee/
  // reconnue — masques sinon (pas de gris par defaut, meme logique que les oreilles).
  const svgCollier = document.querySelector('.fiche-illustration-collier');
  const badgeCapteur = document.querySelector('.fiche-illustration-capteur');
  const useCollier = document.getElementById('useCollier');
  const couleurCollier = normaliserCouleur(capteurs?.[0]?.t_capteur?.capt_couleur_collier);
  const collierVisible = collierActif && !!couleurCollier;
  svgCollier?.classList.toggle('fiche-illustration-masque', !collierVisible);
  badgeCapteur?.classList.toggle('fiche-illustration-masque', !collierVisible);
  if (useCollier && couleurCollier) useCollier.style.color = couleurCollier;

  // Mapping direct — l'inversion gauche/droite (point de vue anatomique du bouquetin
  // vs position ecran) est geree cote CSS (.fiche-illustration-oreille-gauche/droite).
  // Oreille masquee (pas de gris) si la couleur est absente/non reconnue (N/A) — plutot
  // que de representer une boucle qui n'existe pas forcement.
  const useOreilleGauche = document.getElementById('useOreilleGauche');
  if (useOreilleGauche) {
    const couleurOreilleGauche = normaliserCouleur(detail?.ani_marquage_oreille_gauche);
    useOreilleGauche.classList.toggle('fiche-illustration-masque', !couleurOreilleGauche);
    if (couleurOreilleGauche) useOreilleGauche.style.color = couleurOreilleGauche;
  }

  const useOreilleDroite = document.getElementById('useOreilleDroite');
  if (useOreilleDroite) {
    const couleurOreilleDroite = normaliserCouleur(detail?.ani_marquage_oreille_droite);
    useOreilleDroite.classList.toggle('fiche-illustration-masque', !couleurOreilleDroite);
    if (couleurOreilleDroite) useOreilleDroite.style.color = couleurOreilleDroite;
  }
}

// Ligne label/valeur pour une carte-evenement capture/relache — meme pattern que
// ligneInfo() mais rendue via la classe .capture-event-champ (CSS dedie) plutot
// que du style inline.
function creerChampCaptureRelache(label, valeur) {
  const p = document.createElement('p');
  p.className = 'capture-event-champ';
  const strong = document.createElement('strong');
  strong.textContent = `${label} : `;
  p.appendChild(strong);
  p.appendChild(creerValeurNode(valeur));
  return p;
}

// Heuristique de rapprochement pose de collier <-> evenement de capture : aucune FK
// directe en base entre cor_animal_capteur et t_capture_relache (confirme en base le
// 2026-07-28) — une pose est associee a un evenement si cor_date_debut tombe a +/- 1 jour
// de la date de reference de l'evenement (capture_date, ou relache_date en repli si
// capture_date est NULL — confirme en base le 2026-07-29 : ~78% des evenements
// historiques (287/367) n'ont pas de capture_date renseignee, cf. cas Baptiste/ani_id 95 :
// capture_date NULL, relache_date = cor_date_debut d'une pose reelle). Approximation
// admise, pas une certitude garantie par le schema. Pas de garde anti-doublon si deux
// evenements sont espaces de moins de 2 jours (cas trop rare pour justifier une regle
// d'exclusivite, decision explicite du 2026-07-28).
const TOLERANCE_JOURS_POSE_CAPTURE = 1;

function joursEntre(dateA, dateB) {
  return Math.abs(new Date(dateA) - new Date(dateB)) / 86400000;
}

// Date de reference d'un evenement pour le rapprochement avec une pose — capture_date
// en priorite, relache_date en repli si absente (cf. commentaire TOLERANCE_JOURS_POSE_CAPTURE).
function dateReferenceEvenement(c) {
  return c.capture_date || c.relache_date || null;
}

function posesPourCapture(capture, capteurs) {
  const dateReference = dateReferenceEvenement(capture);
  if (!dateReference) return [];
  return (capteurs || []).filter(cap =>
    cap.cor_date_debut && joursEntre(cap.cor_date_debut, dateReference) <= TOLERANCE_JOURS_POSE_CAPTURE
  );
}

// Avertissement uniquement (n'affecte jamais le rendu) : une pose sans evenement proche
// est une anomalie potentielle (une pose est censee avoir lieu pendant une capture ou un
// relache) — meme pattern que verifierCoherenceTranslocation.
function signalerPosesOrphelines(captures, capteurs) {
  (capteurs || []).forEach(cap => {
    if (!cap.cor_date_debut) return;
    const matchTrouve = (captures || []).some(c => {
      const dateReference = dateReferenceEvenement(c);
      return dateReference && joursEntre(cap.cor_date_debut, dateReference) <= TOLERANCE_JOURS_POSE_CAPTURE;
    });
    if (!matchTrouve) {
      console.warn(
        `Pose de collier (cor_id ${cap.cor_id}, cor_date_debut ${cap.cor_date_debut}) sans capture correspondante à ± ${TOLERANCE_JOURS_POSE_CAPTURE} jour — association heuristique par date, aucune capture proche trouvée.`,
        cap
      );
    }
  });
}

// Sous-bloc generique (Collier / Relache) imbrique dans une carte-evenement.
function creerSousBlocCaptureRelache(titre, options = {}) {
  const bloc = document.createElement('div');
  bloc.className = `capture-event-sousbloc ${options.classe || ''}`.trim();
  if (options.title) bloc.title = options.title;
  const soustitre = document.createElement('div');
  soustitre.className = 'capture-event-soustitre';
  soustitre.textContent = titre;
  bloc.appendChild(soustitre);
  return bloc;
}

// Sous-bloc Collier — un par pose matchee (cf. posesPourCapture). title natif = tooltip
// discret rappelant que l'association est heuristique (cf. Pas d'icones creees, texte/
// attribut natif plutot qu'une icone inventee).
function creerSousBlocCollier(pose) {
  const bloc = creerSousBlocCaptureRelache('Collier posé', { classe: 'capture-event-sousbloc-collier' });
  const t = pose.t_capteur || {};
  const prog = pose.bib_programmation || {};
  bloc.appendChild(creerChampCaptureRelache('Identifiant collier constructeur', t.capt_id_constructeur));
  bloc.appendChild(creerChampCaptureRelache('Constructeur', t.capt_constructeur));
  bloc.appendChild(creerChampCaptureRelache('Programmation', prog.prog_desciption));
  bloc.appendChild(creerChampCaptureRelache('Date début pose', formaterDateHeure(pose.cor_date_debut, false)));
  bloc.appendChild(creerChampCaptureRelache('Date fin pose', formaterDateHeure(pose.cor_date_fin, false)));
  return bloc;
}

// Sous-bloc Relache — uniquement si translocation===true (sinon redondant avec le
// leg capture, regle metier deja documentee sur l'ancienne creerCarteLegCapture).
function creerSousBlocRelache(c) {
  const bloc = creerSousBlocCaptureRelache('Relâché', { classe: 'capture-event-sousbloc-relache' });
  bloc.appendChild(creerChampCaptureRelache('Date', formaterDateHeure(c.relache_date, false)));
  bloc.appendChild(creerChampCaptureRelache('Zone', c.relache_zone));
  bloc.appendChild(creerChampCaptureRelache('Lieu-dit', c.relache_lieu_dit));
  return bloc;
}

// Carte-evenement unique par ligne t_capture_relache — remplace creerCarteLegCapture/
// creerCarteLegRelache (deux colonnes separees). Integre le(s) sous-bloc(s) Collier
// (poses matchees par date) et le sous-bloc Relache (si translocation).
function creerCarteEvenementCaptureRelache(c, capteurs, couleurs) {
  const carte = document.createElement('div');
  carte.className = 'capture-event-carte';

  const entete = document.createElement('div');
  entete.className = 'capture-event-entete';
  const dateEl = document.createElement('span');
  dateEl.className = 'capture-event-date-principale';

  const couleurEvenement = c.translocation === true
    ? couleurs?.couleurParEvenement.get(c.capture_relache_id)
    : couleurs?.couleurParObjectif.get(c.capture_objectif);
  if (couleurEvenement) {
    const pastille = document.createElement('span');
    pastille.className = c.translocation === true
      ? 'capture-event-pastille-couleur'
      : 'capture-event-pastille-couleur carre';
    pastille.style.backgroundColor = couleurEvenement;
    dateEl.appendChild(pastille);
  }

  dateEl.appendChild(document.createTextNode('Capturé le '));
  dateEl.appendChild(creerValeurNode(formaterDateHeure(c.capture_date, false)));
  entete.appendChild(dateEl);
  if (c.translocation === true) {
    const badge = document.createElement('span');
    badge.className = 'capture-event-badge-translocation oui';
    badge.textContent = 'Translocation';
    entete.appendChild(badge);
  }

  const corps = document.createElement('div');
  corps.className = 'capture-event-corps';
  corps.appendChild(creerChampCaptureRelache('Zone', c.capture_zone));
  corps.appendChild(creerChampCaptureRelache('Lieu-dit', c.capture_lieu_dit));
  corps.appendChild(creerChampCaptureRelache('Méthode', c.capture_methode));
  corps.appendChild(creerChampCaptureRelache('Objectif', c.capture_objectif));
  corps.appendChild(creerChampCaptureRelache('Commentaire', c.capture_relache_commentaire));

  posesPourCapture(c, capteurs).forEach(pose => corps.appendChild(creerSousBlocCollier(pose)));

  if (c.translocation === true) {
    corps.appendChild(creerSousBlocRelache(c));
  }

  carte.append(entete, corps);
  return carte;
}

// Remplace remplirListeCaptures/remplirListeRelaches — une seule liste d'evenements,
// triee par capture_date desc (meme ordre que l'ancienne liste Captures).
// Couleurs dynamiques carte Sites <-> bloc texte : une couleur par paire capture/relache
// transloquee (index selon l'ordre d'apparition), une couleur par objectif distinct pour
// les captures non transloquees (carres) — deux espaces d'index separes (decision Ludovic
// 2026-07-29), tous deux issus de la palette Glasbey 32 partagee (cf. config.js). Calculee
// une seule fois par affichage de fiche et partagee entre remplirEvenementsCaptureRelache
// (pastille dans l'en-tete) et renderPointsSites (couleur de remplissage des marqueurs).
// Decalage d'index pour couleurParObjectif — evite qu'un objectif de capture simple et
// un evenement transloque partagent la meme couleur juste parce que les deux systemes
// d'index demarrent independamment a 0 (constate le 2026-07-29 : les deux premiers
// elements de chaque serie tombaient sur #0000FF, 1re couleur de GLASBEY_32). Palette de
// 32 couleurs coupee en deux moities de 16 — au-dela de 16 objectifs ou 16 evenements
// transloques pour un meme animal, les couleurs recommencent a se chevaucher (cas non
// rencontre en pratique).
// Sous-ensemble "clair" de GLASBEY_32 — un marqueur capture (bordure noire fixe, cf.
// stylePointSite) avec un remplissage trop sombre devient illisible, fondu dans sa
// propre bordure (constate le 2026-07-29 sur l'index 17, '#201A01', deja identifie comme
// problematique dans map.js via CONTOUR_OVERRIDE_PAR_COULEUR — mais la bordure y est
// adaptable, alors qu'ici elle est fixe par role : on ecarte donc les teintes sombres en
// amont plutot que de faire varier la bordure). Seuil de luminance percue (ITU-R BT.601)
// identique a celui deja utilise dans map.js.
const SEUIL_LUMINANCE_SOMBRE = 58;

function luminancePercue(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const INDICES_GLASBEY_CLAIRS = GLASBEY_32
  .map((couleur, index) => (luminancePercue(couleur) > SEUIL_LUMINANCE_SOMBRE ? index : null))
  .filter(index => index !== null);

// Decalage entre couleurParEvenement et couleurParObjectif — moitie de la palette claire
// (calcule dynamiquement, plutot qu'une valeur fixe comme avant).
const OFFSET_COULEUR_OBJECTIF = Math.floor(INDICES_GLASBEY_CLAIRS.length / 2);

function getCouleurClaireParIndex(index) {
  return getCouleurParIndex(INDICES_GLASBEY_CLAIRS[index % INDICES_GLASBEY_CLAIRS.length]);
}

function construireCouleursCaptureRelache(captures) {
  const triees = [...(captures || [])].sort((a, b) => (dateReferenceEvenement(a) || '').localeCompare(dateReferenceEvenement(b) || ''));
  const couleurParEvenement = new Map();
  const couleurParObjectif = new Map();

  triees.forEach(c => {
    if (c.translocation === true) {
      if (!couleurParEvenement.has(c.capture_relache_id)) {
        couleurParEvenement.set(c.capture_relache_id, getCouleurClaireParIndex(couleurParEvenement.size));
      }
    } else if (c.capture_objectif) {
      if (!couleurParObjectif.has(c.capture_objectif)) {
        couleurParObjectif.set(c.capture_objectif, getCouleurClaireParIndex(OFFSET_COULEUR_OBJECTIF + couleurParObjectif.size));
      }
    }
  });

  return { couleurParEvenement, couleurParObjectif };
}

// Legende dynamique de la carte Sites — une entree par evenement transloque (couleur
// couleurParEvenement, libelle date) et une par objectif distinct de capture simple
// (couleur couleurParObjectif, libelle objectif), meme principe que mettreAJourLegende()
// (app.js, page Carte) : conteneur peuple en JS, une pastille + un label par entree.
// Zoom/centre la carte Sites sur un ou plusieurs points (Lambert93) — un seul point
// (boundingExtent degenere en etendue 0x0) recoit une marge artificielle pour rester
// utilisable par fit(); plusieurs points utilisent leur etendue combinee reelle. Meme
// fonction pour les deux cas plutot que deux chemins separes (capture/relache seuls vs
// tous les points d'un objectif partage).
function zoomSurPointsSites(coordsLambert93) {
  if (!_carteSites || !coordsLambert93 || coordsLambert93.length === 0) return;
  const pointsEcran = coordsLambert93.map(lambert93VersEcran);
  const extent = ol.extent.boundingExtent(pointsEcran);
  const extentAvecMarge = pointsEcran.length === 1 ? ol.extent.buffer(extent, 500) : extent;
  _carteSites.getView().fit(extentAvecMarge, { padding: [30, 30, 30, 30], maxZoom: 15, duration: 400 });
}

function creerLigneLegendeSite(couleur, forme, role, label, coordsLambert93) {
  const ligne = document.createElement('div');
  ligne.className = 'legende-item legende-site-ligne-cliquable';

  const pastille = document.createElement('span');
  pastille.className = `legende-site-pastille legende-site-pastille-${forme}${role === 'relache' ? ' legende-site-pastille-relache' : ''}`;
  pastille.style.background = couleur;

  const texte = document.createElement('span');
  texte.className = 'legende-site-label';
  texte.textContent = label;

  ligne.append(pastille, texte);
  ligne.addEventListener('click', () => zoomSurPointsSites(coordsLambert93));
  return ligne;
}

function construireLegendeSites(captures, couleurs) {
  const conteneur = document.getElementById('legendeSitesCouleurs');
  if (!conteneur || !couleurs) return;
  conteneur.innerHTML = '';

  const triees = [...(captures || [])].sort((a, b) => (dateReferenceEvenement(a) || '').localeCompare(dateReferenceEvenement(b) || ''));

  // Coordonnees regroupees par objectif — plusieurs evenements peuvent partager le meme
  // objectif, la ligne de legende doit alors zoomer sur l'etendue de tous, pas juste le
  // premier rencontre.
  const coordsParObjectif = new Map();
  triees.forEach(c => {
    if (c.translocation !== true && c.capture_objectif) {
      const coord = parseGeomPostGIS(c.capture_site_geom);
      if (!coord) return;
      if (!coordsParObjectif.has(c.capture_objectif)) coordsParObjectif.set(c.capture_objectif, []);
      coordsParObjectif.get(c.capture_objectif).push(coord);
    }
  });

  const objectifsAffiches = new Set();

  triees.forEach(c => {
    if (c.translocation === true) {
      const couleur = couleurs.couleurParEvenement.get(c.capture_relache_id);
      if (!couleur) return;
      const coordCapture = parseGeomPostGIS(c.capture_site_geom);
      const coordRelache = parseGeomPostGIS(c.relache_site_geom);
      if (coordCapture) {
        conteneur.appendChild(creerLigneLegendeSite(couleur, 'ronde', 'capture', 'Capture (Translocation)', [coordCapture]));
      }
      if (coordRelache) {
        conteneur.appendChild(creerLigneLegendeSite(couleur, 'ronde', 'relache', 'Relâché', [coordRelache]));
      }
    } else if (c.capture_objectif && !objectifsAffiches.has(c.capture_objectif)) {
      objectifsAffiches.add(c.capture_objectif);
      const couleur = couleurs.couleurParObjectif.get(c.capture_objectif);
      const coords = coordsParObjectif.get(c.capture_objectif);
      if (!couleur || !coords || coords.length === 0) return;
      conteneur.appendChild(creerLigneLegendeSite(couleur, 'carree', 'capture', `Capture - ${c.capture_objectif}`, coords));
    }
  });
}

function remplirEvenementsCaptureRelache(captures, capteurs, couleurs) {
  const conteneur = document.getElementById('captureRelacheListe');
  if (!conteneur) return;
  conteneur.innerHTML = '';

  if (!captures || captures.length === 0) {
    const vide = document.createElement('p');
    vide.className = 'fiche-placeholder';
    vide.textContent = 'Aucune capture enregistrée';
    conteneur.appendChild(vide);
    return;
  }

  const triees = [...captures].sort((a, b) => (dateReferenceEvenement(a) || '').localeCompare(dateReferenceEvenement(b) || ''));
  triees.forEach(c => conteneur.appendChild(creerCarteEvenementCaptureRelache(c, capteurs, couleurs)));

  signalerPosesOrphelines(captures, capteurs);
}

/**
 * CARTES DE LA FICHE INDIVIDU
 * Instances OpenLayers minimales et autonomes (pas d'import de map.js — singleton
 * concu pour la page Carte, cf. discussion prealable). Meme fond de carte que
 * map.js (basemap visible par defaut dans BASEMAPS_CONFIG) pour coherence visuelle.
 */

function assurerProjectionLambert93() {
  if (_projRegistered) return;
  proj4.defs('EPSG:2154', LAMBERT93);
  ol.proj.proj4.register(proj4);
  _projRegistered = true;
}

// Cache du GetCapabilities WMTS IGN — meme principe que chargerCapacitesWMTS() dans
// map.js (promesse memoisee, un seul fetch reel partage par toutes les couches WMTS).
// Duplique ici plutot qu'importe : individuals.js reste volontairement sans dependance
// sur map.js (singleton de la page Carte, cf. discussion prealable plus haut).
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

// Cree une couche ol.layer.Tile pour un fond WMTS IGN — meme logique que
// creerCoucheWMTS() dans map.js. La couche existe immediatement (necessaire pour
// l'ordre des layers dans new ol.Map()/insertAt(), construit de facon synchrone) ;
// sa source est affectee de facon asynchrone (setSource) une fois le GetCapabilities
// resolu. Un echec (reseau, ou layer/matrixSet/style introuvable) est capture ici et
// n'affecte que cette couche.
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

// Cree un layer OL Tile pour un fond de carte BASEMAPS_CONFIG donne — meme logique
// xyz/osm/wms/wmts que map.js (basemaps, non importee : individuals.js reste volontairement
// sans dependance sur map.js, singleton de la page Carte, cf. discussion prealable
// plus haut). Remplace l'ancien creerCoucheFond() (xyz uniquement, fond fixe).
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

// Remplace le layer de fond (toujours index 0, cf. initCarteLocalisations/initCarteSites)
// d'une carte OL par un nouveau fond BASEMAPS_CONFIG — retrait + insertion, pas de toggle
// de visibilite comme switchBasemap() (map.js) : les cartes de la fiche individu ne
// pre-creent qu'un seul layer de fond a la fois (pas les 8 empiles), pour rester legeres.
// visible:true force explicitement — bm.visible dans BASEMAPS_CONFIG reflète l'état de la
// page Carte (false pour tous les fonds sauf ign_ortho par defaut) et non des cartes de la
// fiche individu. Sans ce forçage, les fonds avec bm.visible=false (ign_topo, ign_relief_slopes,
// ign_scan50_1950…) seraient inserés invisibles, donnant un fond vide à la sélection.
function changerCoucheBasemap(carte, basemapId) {
  if (!carte) return;
  const bm = BASEMAPS_CONFIG.find(b => b.id === basemapId) || BASEMAPS_CONFIG[0];
  carte.getLayers().removeAt(0);
  carte.getLayers().insertAt(0, creerCoucheBasemap({ ...bm, visible: true }));
}

// Bouton + panneau liste verticale compacte pour choisir le fond de carte, individuellement
// par petite carte. fondParDefaut identique pour les 2 cartes — meme fond que celui charge
// initialement par initCarteLocalisations()/initCarteSites() (BASEMAPS_CONFIG.find(bm =>
// bm.visible) || BASEMAPS_CONFIG[0]), juste pour pre-cocher le bon radio a l'ouverture du
// panneau ; changerCoucheBasemap() prend ensuite le relais a chaque selection utilisateur.
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
    item.className = `fiche-basemap-item${estParDefaut ? ' active' : ''}`;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `fondsCarte${suffixe}`;
    radio.className = 'fiche-basemap-radio';
    radio.checked = estParDefaut;

    const nom = document.createElement('span');
    nom.textContent = bm.nom;

    item.append(radio, nom);
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      liste.querySelectorAll('.fiche-basemap-item').forEach(el => el.classList.remove('active'));
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

initBoutonFondsCarte('Localisations', () => _carteLocalisations);
initBoutonFondsCarte('Sites', () => _carteSites);

// EPSG:2154 (Lambert-93) — coherent avec le reste du schema (t_animal/v_localisation
// via f_get_localisation). Utilise pour l'avertissement de coherence du CRS/SRID dans
// parseGeomPostGIS() (branche GeoJSON, format reellement recu en pratique pour
// capture_site_geom/relache_site_geom, confirme le 2026-07-15) et parseEwkbHexPoint()
// (branche EWKB hex, conservee par securite si le format change un jour cote serveur).
const SRID_ATTENDU = 2154;

/**
 * Parse une geometrie Point PostGIS renvoyee par PostgREST pour une colonne lue via
 * un SELECT de table brute (capture_site_geom/relache_site_geom). Gere deux formats :
 * - GeoJSON avec crs explicite (objet {coordinates, crs}) — format reellement recu en
 *   pratique, confirme le 2026-07-15 (ex: {"type":"Point","crs":{"type":"name",
 *   "properties":{"name":"EPSG:2154"}},"coordinates":[...]}).
 * - EWKB hex (chaine) — comportement par defaut de PostgREST pour une colonne geometry
 *   non castee, jamais observe en pratique sur ces deux colonnes a ce jour, mais gere par
 *   securite si le format change cote serveur (cf. parseEwkbHexPoint).
 */
function parseGeomPostGIS(geom) {
  if (!geom) return null;

  if (typeof geom === 'object' && Array.isArray(geom.coordinates)) {
    const crsNom = geom.crs?.properties?.name;
    if (crsNom && crsNom !== `EPSG:${SRID_ATTENDU}`) {
      console.warn(
        `Géométrie capture/relâché avec un CRS inattendu (${crsNom}, attendu EPSG:${SRID_ATTENDU}) — le point est affiché quand même, sa position peut être incorrecte.`,
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

/**
 * Parse un Point EWKB hex (little/big endian, avec ou sans SRID) en [x, y].
 * Layout EWKB Point : 1 octet endianness + 4 octets type (+4 octets SRID si flag) + 8+8 octets X/Y.
 * Le SRID, si present, est lu et compare a SRID_ATTENDU (console.warn si different) mais
 * n'affecte jamais le rendu : le point est toujours retourne/affiche, y compris en cas de
 * SRID inattendu. Branche non exercee en pratique a ce jour (cf. parseGeomPostGIS) mais
 * conservee par securite.
 */
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
        `Géométrie capture/relâché avec un SRID inattendu (${srid}, attendu ${SRID_ATTENDU}) — le point est affiché quand même, sa position peut être incorrecte.`,
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

// --- Carte des localisations GPS ---

function initCarteLocalisations() {
  if (_carteLocalisations) return;
  assurerProjectionLambert93();

  _sourceLocalisations = new ol.source.Vector();
  const coucheLocalisations = new ol.layer.Vector({
    source: _sourceLocalisations,
    style: new ol.style.Style({
      image: new ol.style.Circle({
        radius: 5,
        fill: new ol.style.Fill({ color: '#2D6A4F' }),
        stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.5 })
      })
    })
  });

  const popupEl = document.getElementById('popupLocalisations');
  _popupOverlayLocalisations = new ol.Overlay({
    element: popupEl,
    positioning: 'bottom-center',
    offset: [0, -12]
  });

  _carteLocalisations = new ol.Map({
    target: 'ficheMapLocalisations',
    controls: [],
    layers: [creerCoucheBasemap(BASEMAPS_CONFIG.find(bm => bm.visible) || BASEMAPS_CONFIG[0]), coucheLocalisations],
    overlays: [_popupOverlayLocalisations],
    view: new ol.View({ center: ol.proj.fromLonLat(DEFAULT_CENTER), zoom: DEFAULT_ZOOM })
  });

  // Curseur pointer au survol d'un point — meme UX que la carte principale (map.js).
  _carteLocalisations.on('pointermove', evt => {
    _carteLocalisations.getViewport().style.cursor = _carteLocalisations.hasFeatureAtPixel(evt.pixel) ? 'pointer' : '';
  });

  // Clic sur un point — popup date + altitude uniquement pour l'instant (cf. analyse
  // fiche individu, point 3 valide : loc_datetime_local/loc_date_local + loc_altitude_capteur,
  // enrichissable plus tard avec d'autres colonnes de f_get_localisation).
  _carteLocalisations.on('singleclick', evt => {
    let hit = false;
    _carteLocalisations.forEachFeatureAtPixel(evt.pixel, feature => {
      if (hit) return;
      hit = true;
      const dateRaw = feature.get('loc_datetime_local') || feature.get('loc_date_local');
      const dateStr = dateRaw ? dateRaw.replace('T', ' ').slice(0, 16) : '-';
      const altitude = feature.get('loc_altitude_capteur');

      popupEl.innerHTML = '';
      const strong = document.createElement('strong');
      strong.textContent = 'Position GPS';
      popupEl.appendChild(strong);
      const ligneDate = document.createElement('div');
      ligneDate.className = 'popup-champ';
      ligneDate.textContent = `Date : ${dateStr}`;
      popupEl.appendChild(ligneDate);
      const ligneAltitude = document.createElement('div');
      ligneAltitude.className = 'popup-champ';
      ligneAltitude.textContent = `Altitude : ${altitude != null ? altitude + ' m' : '-'}`;
      popupEl.appendChild(ligneAltitude);

      _popupOverlayLocalisations.setPosition(evt.coordinate);
      popupEl.style.display = 'block';
    });
    if (!hit) popupEl.style.display = 'none';
  });

  // Boutons zoom in/out/recentrer — memes parametres que le fit automatique de
  // renderPointsLocalisations() (padding/maxZoom), pas ceux de la carte principale
  // (app.js, 80px/zoom13) non adaptes a une carte ~180px de haut.
  document.getElementById('btnZoomInLocalisations')?.addEventListener('click', () => {
    const view = _carteLocalisations.getView();
    view.animate({ zoom: view.getZoom() + 1, duration: 200 });
  });
  document.getElementById('btnZoomOutLocalisations')?.addEventListener('click', () => {
    const view = _carteLocalisations.getView();
    view.animate({ zoom: view.getZoom() - 1, duration: 200 });
  });
  document.getElementById('btnZoomResetLocalisations')?.addEventListener('click', () => {
    const extent = _sourceLocalisations?.getExtent();
    if (extent && !ol.extent.isEmpty(extent)) {
      _carteLocalisations.getView().fit(extent, { padding: [40, 40, 40, 40], maxZoom: 15, duration: 300 });
    } else {
      _carteLocalisations.getView().animate({ center: ol.proj.fromLonLat(DEFAULT_CENTER), zoom: DEFAULT_ZOOM, duration: 300 });
    }
  });

  observerRedimensionnementCarte(_carteLocalisations, 'ficheMapLocalisations');
}

/**
 * Meme pattern que map.js (page Carte) : le conteneur de la carte est dans une
 * mise en page flex/grid dont la taille finale depend du chargement des polices/images
 * de l'entete (asynchrone) — un seul updateSize() juste apres l'init peut donc capturer
 * une taille intermediaire trop petite, laissant la carte "coupee" visuellement.
 * Le ResizeObserver corrige ca a chaque changement reel de taille du conteneur.
 */
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

function renderPointsLocalisations(locations) {
  if (!_sourceLocalisations) return 0;
  _sourceLocalisations.clear();

  const features = (locations || [])
    .filter(loc => loc.geom?.coordinates)
    .map(loc => new ol.Feature({
      ...loc,
      geometry: new ol.geom.Point(lambert93VersEcran(loc.geom.coordinates))
    }));

  _sourceLocalisations.addFeatures(features);

  const extent = _sourceLocalisations.getExtent();
  if (!ol.extent.isEmpty(extent)) {
    _carteLocalisations.getView().fit(extent, { padding: [40, 40, 40, 40], maxZoom: 15, duration: 300 });
  }
  return features.length;
}

function parseDateFR(str) {
  if (!str || !/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return null;
  const [j, m, a] = str.split('/');
  return `${a}-${m}-${j}`;
}

async function chargerEtRenderLocalisations(aniId) {
  const valeurN = document.getElementById('ficheInputN')?.value.trim();
  const n = valeurN ? parseInt(valeurN) : null;
  const dateMin = parseDateFR(document.getElementById('ficheDateFrom')?.value);
  const dateMax = parseDateFR(document.getElementById('ficheDateTo')?.value);

  const locations = await fetchLocalisationsAnimal(currentToken, aniId, {
    limitParAnimal: n,
    dateMin,
    dateMax
  });
  const count = renderPointsLocalisations(locations);

  const compteurEl = document.getElementById('compteurPositionsLocalisations');
  if (compteurEl) compteurEl.textContent = `${count} position${count !== 1 ? 's' : ''} affichée${count !== 1 ? 's' : ''}`;

  return locations;
}

document.getElementById('btnActualiserFiche')?.addEventListener('click', async () => {
  if (!currentAniId) return;
  try {
    await chargerEtRenderLocalisations(currentAniId);
  } catch (err) {
    console.error('Erreur actualisation localisations:', err);
  }
});

if (window.flatpickr) {
  flatpickr('#ficheDateFrom', { dateFormat: 'd/m/Y', allowInput: true, locale: 'fr' });
  flatpickr('#ficheDateTo', { dateFormat: 'd/m/Y', allowInput: true, locale: 'fr' });
}

// --- Carte fusionnee sites de capture + sites de relache ---

// Style dynamique des points de la carte Sites : rond (evenement transloque, capture+
// relache) ou carre (capture seule, non transloquee) — bordure fixe universelle (noire
// pour toute capture, blanche pour tout relache, cf. decision Ludovic 2026-07-29),
// couleur de remplissage dynamique (cf. construireCouleursCaptureRelache).
function stylePointSite(feature) {
  const role = feature.get('_role');
  const forme = feature.get('_forme');
  const couleur = feature.get('_couleur') || '#9e9e9e';
  const stroke = new ol.style.Stroke({ color: role === 'capture' ? '#000000' : '#ffffff', width: 3 });
  const fill = new ol.style.Fill({ color: couleur });

  const image = forme === 'carre'
    ? new ol.style.RegularShape({ points: 4, radius: 8, angle: Math.PI / 4, fill, stroke })
    : new ol.style.Circle({ radius: 7, fill, stroke });

  return new ol.style.Style({ image });
}

// Trait + fleche entre le point capture et le point relache d'un meme evenement
// transloque — meme pattern que renderTrajectoire() (map.js), reimplemente ici pour ne
// pas dependre de map.js (cf. decision architecturale documentee plus haut).
function creerFeaturesLienSite(coordCaptureLambert93, coordRelacheLambert93, couleur) {
  const pointA = lambert93VersEcran(coordCaptureLambert93);
  const pointB = lambert93VersEcran(coordRelacheLambert93);

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

function initCarteSites() {
  if (_carteSites) return;
  assurerProjectionLambert93();

  _sourceSitesPoints = new ol.source.Vector();
  _sourceSitesLiens = new ol.source.Vector();
  const coucheSitesLiens = new ol.layer.Vector({ source: _sourceSitesLiens });
  const coucheSitesPoints = new ol.layer.Vector({ source: _sourceSitesPoints, style: stylePointSite });

  const popupEl = document.getElementById('popupSites');
  _popupOverlaySites = new ol.Overlay({
    element: popupEl,
    positioning: 'bottom-center',
    offset: [0, -12]
  });

  _carteSites = new ol.Map({
    target: 'ficheMapSites',
    controls: [],
    layers: [
      creerCoucheBasemap(BASEMAPS_CONFIG.find(bm => bm.visible) || BASEMAPS_CONFIG[0]),
      coucheSitesLiens,
      coucheSitesPoints
    ],
    overlays: [_popupOverlaySites],
    view: new ol.View({ center: ol.proj.fromLonLat(DEFAULT_CENTER), zoom: DEFAULT_ZOOM })
  });

  _carteSites.on('pointermove', evt => {
    const survolPoint = _carteSites.hasFeatureAtPixel(evt.pixel, { layerFilter: layer => layer === coucheSitesPoints });
    _carteSites.getViewport().style.cursor = survolPoint ? 'pointer' : '';
  });

  // Clic sur un site — distinction capture/relache via la propriete _role de la feature
  // (cf. creerFeaturePointSite/renderPointsSites), pas via l'identite du layer (source
  // unique desormais, cf. _sourceSitesPoints). Methode/objectif affiches seulement pour
  // un site de capture (champs propres au leg capture, cf. creerCarteEvenementCaptureRelache).
  _carteSites.on('singleclick', evt => {
    let hit = false;
    _carteSites.forEachFeatureAtPixel(evt.pixel, feature => {
      if (hit) return;
      const role = feature.get('_role');
      if (!role) return; // trait/fleche — pas de popup dessus
      hit = true;
      const c = feature.getProperties();
      const estCapture = role === 'capture';

      popupEl.innerHTML = '';
      const strong = document.createElement('strong');
      strong.textContent = estCapture ? 'Site de capture' : 'Site de relâché';
      popupEl.appendChild(strong);

      const lignes = estCapture
        ? [
            ['Date', formaterDateHeure(c.capture_date, false)],
            ['Zone', c.capture_zone],
            ['Lieu-dit', c.capture_lieu_dit],
            ['Méthode', c.capture_methode],
            ['Objectif', c.capture_objectif]
          ]
        : [
            ['Date', formaterDateHeure(c.relache_date, false)],
            ['Zone', c.relache_zone],
            ['Lieu-dit', c.relache_lieu_dit]
          ];

      lignes.forEach(([label, valeur]) => {
        const div = document.createElement('div');
        div.className = 'popup-champ';
        div.textContent = `${label} : ${valeur || '-'}`;
        popupEl.appendChild(div);
      });

      _popupOverlaySites.setPosition(evt.coordinate);
      popupEl.style.display = 'block';
    });
    if (!hit) popupEl.style.display = 'none';
  });

  // Boutons zoom in/out/recentrer — memes parametres que le fit automatique de
  // renderPointsSites() (padding/maxZoom, extent combine capture+relache).
  document.getElementById('btnZoomInSites')?.addEventListener('click', () => {
    const view = _carteSites.getView();
    view.animate({ zoom: view.getZoom() + 1, duration: 200 });
  });
  document.getElementById('btnZoomOutSites')?.addEventListener('click', () => {
    const view = _carteSites.getView();
    view.animate({ zoom: view.getZoom() - 1, duration: 200 });
  });
  document.getElementById('btnZoomResetSites')?.addEventListener('click', () => {
    const extent = _sourceSitesPoints?.getExtent();
    if (extent && !ol.extent.isEmpty(extent)) {
      _carteSites.getView().fit(extent, { padding: [30, 30, 30, 30], maxZoom: 14, duration: 300 });
    } else {
      _carteSites.getView().animate({ center: ol.proj.fromLonLat(DEFAULT_CENTER), zoom: DEFAULT_ZOOM, duration: 300 });
    }
  });

  observerRedimensionnementCarte(_carteSites, 'ficheMapSites');
}

function creerFeaturePointSite(coordLambert93, c, role, forme, couleur) {
  return new ol.Feature({
    ...c,
    _role: role,
    _forme: forme,
    _couleur: couleur,
    geometry: new ol.geom.Point(lambert93VersEcran(coordLambert93))
  });
}

// Un evenement transloque produit 2 points ronds (capture+relache, meme couleur) relies
// par un trait fleche ; un evenement non transloque produit 1 seul carre (capture_site_geom
// uniquement — relache_site_geom ignoree, cf. discussion 2026-07-29 : censee etre identique
// quand translocation=false, donc redondante pour l'affichage carte).
function renderPointsSites(captures, couleurs) {
  if (!_sourceSitesPoints || !_sourceSitesLiens) return;

  _sourceSitesPoints.clear();
  _sourceSitesLiens.clear();

  const features = [];

  (captures || []).forEach(c => {
    const coordCapture = parseGeomPostGIS(c.capture_site_geom);

    if (c.translocation === true) {
      const coordRelache = parseGeomPostGIS(c.relache_site_geom);
      const couleur = couleurs?.couleurParEvenement.get(c.capture_relache_id) || getCouleurParIndex(0);

      if (coordCapture) features.push(creerFeaturePointSite(coordCapture, c, 'capture', 'rond', couleur));
      if (coordRelache) features.push(creerFeaturePointSite(coordRelache, c, 'relache', 'rond', couleur));
      if (coordCapture && coordRelache) {
        _sourceSitesLiens.addFeatures(creerFeaturesLienSite(coordCapture, coordRelache, couleur));
      }
    } else if (coordCapture) {
      const couleur = c.capture_objectif
        ? (couleurs?.couleurParObjectif.get(c.capture_objectif) || getCouleurParIndex(0))
        : '#9e9e9e';
      features.push(creerFeaturePointSite(coordCapture, c, 'capture', 'carre', couleur));
    }
  });

  _sourceSitesPoints.addFeatures(features);

  const extent = _sourceSitesPoints.getExtent();
  if (!ol.extent.isEmpty(extent)) {
    _carteSites.getView().fit(extent, { padding: [30, 30, 30, 30], maxZoom: 14, duration: 300 });
  }
}

// Nombre de decimales pour comparer deux points en Lambert-93 (EPSG:2154, unites en
// metres) — 1 decimale = marge d'environ 10cm. Initialement 3 (precision millimetrique),
// mais generait un faux positif en conditions reelles (id 354 : capture et relache a la
// meme date/zone/lieu-dit 'Soulcem'/'Orris du Carla', coordonnees differant de ~2mm,
// probablement un arrondi de saisie different entre les deux mesures) — 10cm absorbe ce
// bruit de saisie GPS tout en restant assez strict pour detecter une vraie divergence.
const DECIMALES_COMPARAISON_GEOM = 1;

/**
 * Compare deux geometries capture/relache (chacune GeoJSON ou EWKB hex, cf.
 * parseGeomPostGIS qui gere deja les deux formats indifferemment). Retourne :
 * - 'absentes' : les deux sont vides — rien a comparer, pas une incoherence.
 * - 'non_comparable' : au moins une des deux ne peut pas etre parsee (format non
 *   reconnu, ou une seule des deux geometries est renseignee) — couvre notamment le
 *   cas ou une colonne serait en EWKB et l'autre en GeoJSON, sans jamais lever d'erreur.
 * - 'identiques' / 'differentes' : les deux ont ete parsees, comparaison sur les
 *   coordonnees arrondies a DECIMALES_COMPARAISON_GEOM.
 */
function comparerGeometriesCaptureRelache(geomCapture, geomRelache) {
  if (!geomCapture && !geomRelache) return { statut: 'absentes' };

  const coordCapture = parseGeomPostGIS(geomCapture);
  const coordRelache = parseGeomPostGIS(geomRelache);

  if (!coordCapture || !coordRelache) {
    return { statut: 'non_comparable' };
  }

  const arrondi = (n) => Number(n.toFixed(DECIMALES_COMPARAISON_GEOM));
  const identiques = arrondi(coordCapture[0]) === arrondi(coordRelache[0]) &&
                      arrondi(coordCapture[1]) === arrondi(coordRelache[1]);
  return { statut: identiques ? 'identiques' : 'differentes', coordCapture, coordRelache };
}

/**
 * Verification de coherence (avertissement uniquement, ne bloque/ne modifie jamais le
 * rendu) : quand translocation === false, la regle metier (cf. commentaire de
 * creerCarteEvenementCaptureRelache) veut que capture_zone/capture_lieu_dit/capture_site_geom soient
 * identiques a relache_zone/relache_lieu_dit/relache_site_geom. Jamais verifie jusqu'ici —
 * confiance aveugle dans les donnees backend (cf. audit page Individus).
 */
function verifierCoherenceTranslocation(captures) {
  (captures || []).forEach(c => {
    if (c.translocation !== false) return;

    if (c.capture_zone !== c.relache_zone) {
      console.warn(
        `Incohérence capture/relâché (id ${c.capture_relache_id}) : translocation=false mais capture_zone ("${c.capture_zone}") ≠ relache_zone ("${c.relache_zone}").`,
        c
      );
    }

    if (c.capture_lieu_dit !== c.relache_lieu_dit) {
      console.warn(
        `Incohérence capture/relâché (id ${c.capture_relache_id}) : translocation=false mais capture_lieu_dit ("${c.capture_lieu_dit}") ≠ relache_lieu_dit ("${c.relache_lieu_dit}").`,
        c
      );
    }

    const { statut, coordCapture, coordRelache } = comparerGeometriesCaptureRelache(c.capture_site_geom, c.relache_site_geom);
    if (statut === 'non_comparable') {
      console.warn(
        `Incohérence capture/relâché (id ${c.capture_relache_id}) : translocation=false mais capture_site_geom/relache_site_geom non comparables (format non reconnu ou géométrie absente d'un seul côté).`,
        c
      );
    } else if (statut === 'differentes') {
      console.warn(
        `Incohérence capture/relâché (id ${c.capture_relache_id}) : translocation=false mais capture_site_geom (${coordCapture}) ≠ relache_site_geom (${coordRelache}).`,
        c
      );
    }
  });
}

/**
 * GRAPHIQUE DISTANCE (Chart.js).
 * N'affiche que les mois avec un collier actif — les mois sans collier sont retires
 * completement de l'axe (pas de grisage, pas de trou), pour eviter un axe demesurement
 * long sur un animal avec un grand vide entre deux poses (cf. cas Tilda, ~7 ans entre
 * 2 colliers, 2026-07-31). Une couleur differente par cor_id (palette Glasbey claire
 * partagee, cf. construireCouleursColliers).
 */

// Au-dela de cet ecart entre deux positions consecutives, la distance euclidienne entre
// les deux n'est plus un proxy fiable du trajet reellement parcouru (le capteur a pu ne pas
// transmettre pendant plusieurs jours ; l'animal a pu faire des allers-retours entretemps) —
// paire ignoree plutot que de fausser le mois avec un saut isole. A ajuster si les capteurs
// PNP ont un pas de transmission tres different de quelques heures (cf. prog_frequence).
const GAP_MAX_HEURES = 48;

// Mois avec collier actif (au moins un jour du mois), associes au cor_id de la pose
// responsable — remplace le parcours calendaire continu de l'ancienne version : n'inclut
// plus du tout les mois sans collier. Si deux poses se chevauchent sur un meme mois (cas
// non rencontre en pratique), la premiere pose rencontree (ordre du tableau capteurs)
// l'emporte.
function moisAvecColliersActifs(capteurs) {
  const corIdParMois = new Map();

  (capteurs || []).forEach(c => {
    if (!c.cor_date_debut) return;
    const debutPose = new Date(c.cor_date_debut);
    const finPose = c.cor_date_fin ? new Date(c.cor_date_fin) : new Date();

    const curseur = new Date(debutPose.getFullYear(), debutPose.getMonth(), 1);
    const finMoisPose = new Date(finPose.getFullYear(), finPose.getMonth(), 1);
    while (curseur <= finMoisPose) {
      const cle = `${curseur.getFullYear()}-${String(curseur.getMonth() + 1).padStart(2, '0')}`;
      if (!corIdParMois.has(cle)) corIdParMois.set(cle, c.cor_id);
      curseur.setMonth(curseur.getMonth() + 1);
    }
  });

  return corIdParMois;
}

// Distance = somme des segments euclidiens entre positions GPS consecutives (triees), sur
// coordonnees Lambert-93/EPSG:2154 (geom.coordinates, cf. lambert93VersEcran plus haut) —
// projection en metres, donc pas de reprojection necessaire pour ce calcul. Le calcul de
// segment reste identique a avant ; seul l'axe affiche change (limite aux mois avec collier
// actif, cf. moisAvecColliersActifs).
function agregerDistanceParMois(locations, capteurs) {
  const positionsValides = (locations || [])
    .filter(l => l.geom?.coordinates && (l.loc_datetime_local || l.loc_date_local))
    .map(l => ({
      date: new Date(l.loc_datetime_local || l.loc_date_local),
      coord: l.geom.coordinates
    }))
    .filter(p => !isNaN(p.date.getTime()))
    .sort((a, b) => a.date - b.date);

  const distanceParMois = new Map();

  for (let i = 1; i < positionsValides.length; i++) {
    const prev = positionsValides[i - 1];
    const curr = positionsValides[i];

    const ecartHeures = (curr.date - prev.date) / 3600000;
    if (ecartHeures <= 0 || ecartHeures > GAP_MAX_HEURES) continue;

    const dx = curr.coord[0] - prev.coord[0];
    const dy = curr.coord[1] - prev.coord[1];
    const distanceMetres = Math.sqrt(dx * dx + dy * dy);

    // Distance attribuee au mois du point d'arrivee (curr) — approximation raisonnable
    // vu le pas de transmission (heures), negligeable pres d'une frontiere de mois.
    const cle = `${curr.date.getFullYear()}-${String(curr.date.getMonth() + 1).padStart(2, '0')}`;
    distanceParMois.set(cle, (distanceParMois.get(cle) || 0) + distanceMetres);
  }

  const corIdParMois = moisAvecColliersActifs(capteurs);
  const categories = [...corIdParMois.keys()].sort();
  const valeurs = categories.map(cle => Math.round(((distanceParMois.get(cle) || 0) / 1000) * 10) / 10);
  const corIds = categories.map(cle => corIdParMois.get(cle));

  return { categories, valeurs, corIds };
}

// Couleur par pose de collier (cor_id distinct) — meme principe que
// construireCouleursCaptureRelache() (palette Glasbey claire partagee, cf. config.js) :
// index independant par cor_id, dans l'ordre chronologique des poses.
function construireCouleursColliers(capteurs) {
  const triees = [...(capteurs || [])]
    .filter(c => c.cor_date_debut)
    .sort((a, b) => a.cor_date_debut.localeCompare(b.cor_date_debut));

  const couleurParCorId = new Map();
  triees.forEach(c => {
    if (!couleurParCorId.has(c.cor_id)) {
      couleurParCorId.set(c.cor_id, getCouleurClaireParIndex(couleurParCorId.size));
    }
  });
  return couleurParCorId;
}

// Identifiant lisible par cor_id, pour le tooltip et la legende — capt_id_constructeur si
// disponible (embedding t_capteur, cf. fetchCapteurParAnimal), sinon repli sur le cor_id brut.
function identifiantsColliersParCorId(capteurs) {
  const map = new Map();
  (capteurs || []).forEach(c => {
    map.set(c.cor_id, c.t_capteur?.capt_id_constructeur || `Collier ${c.cor_id}`);
  });
  return map;
}

// Legende dynamique du graphique Distance — une entree par collier (cor_id), couleur +
// identifiant, meme principe que construireLegendeSites() (carte Sites) : conteneur peuple
// en JS, une pastille + un label par entree, dans l'ordre chronologique des poses.
function construireLegendeColliers(capteurs, couleurParCorId, identifiants) {
  const conteneur = document.getElementById('legendeColliersDistance');
  if (!conteneur) return;
  conteneur.innerHTML = '';

  const triees = [...(capteurs || [])]
    .filter(c => c.cor_date_debut)
    .sort((a, b) => a.cor_date_debut.localeCompare(b.cor_date_debut));

  if (triees.length === 0) return;

  const titre = document.createElement('span');
  titre.textContent = 'Colliers :';
  titre.style.fontWeight = '600';
  conteneur.appendChild(titre);

  const corIdsAffiches = new Set();
  triees.forEach(c => {
    if (corIdsAffiches.has(c.cor_id)) return;
    corIdsAffiches.add(c.cor_id);

    const couleur = couleurParCorId.get(c.cor_id);
    if (!couleur) return;

    const ligne = document.createElement('div');
    ligne.className = 'legende-item';

    const pastille = document.createElement('span');
    pastille.className = 'legende-pastille';
    pastille.style.background = couleur;

    const texte = document.createElement('span');
    texte.textContent = identifiants.get(c.cor_id) || `Collier ${c.cor_id}`;

    ligne.append(pastille, texte);
    conteneur.appendChild(ligne);
  });
}

function formaterMoisLabel(cle) {
  const [annee, mois] = cle.split('-').map(Number);
  return new Date(annee, mois - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

// Version longue (mois complet + annee sur 4 chiffres) — utilisee uniquement pour le
// sous-titre de periode du graphique Distance (#periodeDistanceMois), distincte de
// formaterMoisLabel() qui reste abregee pour les libelles de l'axe X (espace limite).
function formaterMoisLabelLong(cle) {
  const [annee, mois] = cle.split('-').map(Number);
  return new Date(annee, mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// ResizeObserver + dispatch d'un evenement resize global — ApexCharts ne redetecte
// pas automatiquement un changement de taille de son seul conteneur (uniquement
// window.resize en natif) ; meme risque que les cartes OpenLayers (cf.
// observerRedimensionnementCarte) quand la mise en page se stabilise apres coup
// (polices/images de l'entete charges de façon asynchrone).
function observerRedimensionnementGraphique(containerId) {
  if (!window.ResizeObserver) return;
  const el = document.getElementById(containerId);
  if (!el) return;
  const resizeObserver = new ResizeObserver(() => window.dispatchEvent(new Event('resize')));
  resizeObserver.observe(el);
  _resizeObserversGraphiques.push(resizeObserver);
}

function detruireGraphiquesSynthese() {
  _resizeObserversGraphiques.forEach(ro => ro.disconnect());
  _resizeObserversGraphiques = [];
  if (_chartDistanceMois) {
    _chartDistanceMois.destroy();
    _chartDistanceMois = null;
  }
  // Vide le sous-titre de periode pendant le rechargement — evite d'afficher
  // brievement la periode de l'individu precedent.
  const elPeriodeDistance = document.getElementById('periodeDistanceMois');
  if (elPeriodeDistance) elPeriodeDistance.textContent = '';
}

async function initGraphiquesSynthese(aniId, capteurs) {
  detruireGraphiquesSynthese();

  let locations;
  try {
    locations = await fetchLocalisationsAnimal(currentToken, aniId, {});
  } catch (err) {
    console.error('Erreur chargement données graphiques Synthèse:', err);
    return;
  }

  // L'individu affiché a pu changer pendant l'appel ci-dessus (async) — n'initialise
  // pas de graphique pour un individu qui n'est plus celui affiché a l'ecran.
  if (String(currentAniId) !== String(aniId)) return;

  const { categories, valeurs, corIds } = agregerDistanceParMois(locations, capteurs);

  // Sous-titre de periode — periode complete desormais (plus de fenetre glissante 12 mois).
  const elPeriodeDistance = document.getElementById('periodeDistanceMois');
  if (elPeriodeDistance) {
    elPeriodeDistance.textContent = categories.length === 0
      ? 'Aucune donnée disponible'
      : `Depuis ${formaterMoisLabelLong(categories[0])}`;
  }

  const ctx = document.getElementById('chartDistanceMois');
  if (ctx) {
    const couleurParCorId = construireCouleursColliers(capteurs);
    const identifiants = identifiantsColliersParCorId(capteurs);
    const couleurs = corIds.map(corId => couleurParCorId.get(corId) || '#9e9e9e');

    _chartDistanceMois = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: categories.map(formaterMoisLabel),
        datasets: [{
          label: 'Distance (km)',
          data: valeurs,
          backgroundColor: couleurs,
          borderRadius: 2,
          maxBarThickness: 40
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, ticks: { font: { size: 11 } } }
        }
      }
    });
    observerRedimensionnementGraphique('chartDistanceMoisWrapper');
    construireLegendeColliers(capteurs, couleurParCorId, identifiants);
  }
}

// Vide immediatement tous les champs de la fiche precedemment affichee (photo,
// identite, marquage, dates, cartes, graphique, captures/relaches) — appele avant
// tout nouveau chargement pour ne jamais laisser les donnees du precedent individu
// visibles pendant le fetch des nouvelles (cf. bug Alexa -> retour liste -> Anis).
function viderFiche() {
  const statutPhoto = document.getElementById('ficheIllustrationStatut');
  if (statutPhoto) { statutPhoto.className = 'fiche-illustration-statut'; statutPhoto.innerHTML = ''; }

  const fichePhoto = document.getElementById('fichePhoto');
  if (fichePhoto) fichePhoto.src = '../assets/img/bqt_profil_normal.jpg';
  document.querySelector('.fiche-illustration')?.classList.remove('fiche-illustration--femelle');
  document.querySelector('.fiche-illustration-collier')?.classList.add('fiche-illustration-masque');
  document.querySelector('.fiche-illustration-capteur')?.classList.add('fiche-illustration-masque');
  document.getElementById('useOreilleGauche')?.classList.add('fiche-illustration-masque');
  document.getElementById('useOreilleDroite')?.classList.add('fiche-illustration-masque');

  ['carteIdentitePrincipale', 'carteIdentiteMarquage', 'carteIdentiteDates', 'captureRelacheListe', 'legendeSitesCouleurs', 'legendeColliersDistance'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  const compteurPositions = document.getElementById('compteurPositionsLocalisations');
  if (compteurPositions) compteurPositions.textContent = '';

  const popupLocalisations = document.getElementById('popupLocalisations');
  if (popupLocalisations) popupLocalisations.style.display = 'none';
  const popupSites = document.getElementById('popupSites');
  if (popupSites) popupSites.style.display = 'none';

  _sourceLocalisations?.clear();
  _sourceSitesPoints?.clear();
  _sourceSitesLiens?.clear();

  detruireGraphiquesSynthese();
}

// Overlay de chargement pendant le fetch d'une nouvelle fiche (cf. viderFiche()).
function afficherChargementFiche() {
  const overlay = document.getElementById('ficheLoading');
  if (overlay) overlay.style.display = 'flex';
}

function masquerChargementFiche() {
  const overlay = document.getElementById('ficheLoading');
  if (overlay) overlay.style.display = 'none';
}

async function afficherFiche(aniId) {
  const ficheEtaitActive = estVueFicheActive();
  if (!ficheEtaitActive) filtresListeAvantFiche = memoriserFiltresListe();

  currentAniId = aniId;
  const animal = animals.find(a => String(a.ani_id) === String(aniId));
  const ficheNom = document.getElementById('ficheNom');
  if (ficheNom) ficheNom.textContent = animal?.ani_nom || `Individu ${aniId}`;

  viderFiche();

  document.getElementById('vueListe').style.display = 'none';
  document.getElementById('vueFiche').style.display = 'flex';
  definirModeSidebarFiche(true);

  afficherChargementFiche();

  try {
    const [detail, capteurs, captures] = await Promise.all([
      fetchAnimalDetail(currentToken, aniId),
      fetchCapteurParAnimal(currentToken, aniId),
      fetchCaptureRelacheParAnimal(currentToken, aniId)
    ]);

    // Collier actif = pose la plus recente (capteurs[0], deja trie cor_date_debut.desc)
    // sans date de fin — critere explicite de Ludovic (cor_date_fin IS NULL). Coherent
    // avec colliersActifs/computeStatut (liste Individus) depuis le 2026-07-30 — meme
    // critere strict, independant des positions GPS transmises, sur les deux pages.
    // Calcule ici (avant remplirIdentite()) pour rester la source unique partagee
    // avec appliquerCouleursMarquage() plus bas.
    const collierActif = capteurs.length > 0 && capteurs[0].cor_date_fin == null;

    remplirIdentite(detail, collierActif, capteurs);
    remplirPastilleStatutPhoto(detail);
    const couleursCaptureRelache = construireCouleursCaptureRelache(captures);
    remplirEvenementsCaptureRelache(captures, capteurs, couleursCaptureRelache);
    construireLegendeSites(captures, couleursCaptureRelache);
    verifierCoherenceTranslocation(captures);
    appliquerCouleursMarquage(detail, collierActif, capteurs);

    initCarteSites();
    renderPointsSites(captures, couleursCaptureRelache);

    initCarteLocalisations();
    const locations = await chargerEtRenderLocalisations(aniId);
    remplirDatesCles(captures, locations);
    await initGraphiquesSynthese(aniId, capteurs);

    setTimeout(() => {
      _carteLocalisations?.updateSize();
      _carteSites?.updateSize();
    }, 50);
  } catch (err) {
    console.error('Erreur chargement fiche individu:', err);
  } finally {
    masquerChargementFiche();
  }
}

function afficherListe({ restaurerFiltres = true } = {}) {
  document.getElementById('vueFiche').style.display = 'none';
  viderFiche();
  document.getElementById('vueListe').style.display = 'flex';
  definirModeSidebarFiche(false);
  if (restaurerFiltres && filtresListeAvantFiche) {
    restaurerFiltresListe(filtresListeAvantFiche);
    filtresListeAvantFiche = null;
    appliquerFiltresListe();
  }
}

document.getElementById('btnRetourListe')?.addEventListener('click', afficherListe);

/**
 * INITIALISATION
 */

async function initPage(token) {
  currentToken = token;
  sessionStorage.setItem('bqt_token', token);
  masquerLoginScreen();
  afficherSession(token);

  try {
    [animals, colliersActifs] = await Promise.all([
      fetchAnimals(token),
      fetchColliersActifs(token)
    ]);

    // Derniere position par animal en suivi actif — un seul appel RPC (limit_par_animal:1),
    // meme mecanisme que fetchAnimauxSuivis() (api.js), restreint aux ids colliersActifs
    // (necessite colliersActifs deja resolu, donc sequence apres le Promise.all ci-dessus,
    // pas en parallele). Un animal actif sans aucune position n'apparait simplement pas
    // dans le resultat (cf. computeFraicheur, cas 'aucune').
    dernierePositionParAnimal = new Map();
    const idsActifs = [...colliersActifs];
    if (idsActifs.length > 0) {
      const positions = await fetchLocalisationsRPC(token, { ani_id: idsActifs, limit_par_animal: 1 });
      positions.forEach(loc => {
        const cle = String(loc.ani_id);
        const date = loc.loc_datetime_local || loc.loc_date_local;
        if (!date) return;
        const dateActuelle = dernierePositionParAnimal.get(cle);
        if (!dateActuelle || date > dateActuelle) dernierePositionParAnimal.set(cle, date);
      });
    }

    peuplerTableauListe();
  } catch (err) {
    console.error('Erreur chargement individus:', err);
  }
}

const tokenSauvegarde = sessionStorage.getItem('bqt_token');
if (tokenSauvegarde) {
  initPage(tokenSauvegarde).catch(() => deconnecter());
} else {
  afficherLoginScreen();
}
