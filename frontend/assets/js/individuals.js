import { login, fetchAnimals, fetchAnimauxSuivis, fetchAnimalDetail, fetchCapteurParAnimal, fetchCaptureRelacheParAnimal, fetchLocalisationsAnimal } from './api.js';
import { ROLE_LABELS, ROLE_INITIALES, LAMBERT93, DEFAULT_CENTER, DEFAULT_ZOOM, IGN_API_KEY, BASEMAPS_CONFIG, SAISONS_CONFIG } from './config.js';

let currentToken = null;
let currentAniId = null;
let animals = [];
let idsSuivis = new Set();
let loginEnCours = false;

// Cartes de la fiche individu — instances OpenLayers autonomes, independantes du
// singleton de map.js (page separee, pas de conflit de contexte JS possible)
let _carteLocalisations = null;
let _sourceLocalisations = null;
// Carte "sites de capture/relache" fusionnee — deux sources vectorielles (couleurs
// distinctes) sur une seule instance OpenLayers, plutot que deux cartes separees.
let _carteSites = null;
let _sourceSitesCapture = null;
let _sourceSitesRelache = null;
let _projRegistered = false;

// Dernieres positions chargees pour la mini-carte de localisations —
// reutilisees par initGraphiquesSynthese() si leur plage couvre suffisamment de mois
// ET si la limite de nombre de positions appliquee lors de ce chargement n'a
// vraisemblablement rien tronque (cf. obtenirLocalisationsPourGraphiques), pour
// eviter un appel API redondant.
let _dernieresLocalisationsChargees = [];
// Valeur de "Nombre de dernieres positions" (var_limit_par_animal) utilisee lors du
// dernier chargement de _dernieresLocalisationsChargees — toujours definie (defaut 25),
// cf. chargerEtRenderLocalisations().
let _dernieresLocalisationsLimiteAppliquee = null;

// Graphiques ApexCharts (ligne Distance/Altitude)
let _chartDistanceMois = null;
let _chartAltitudeSaison = null;
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

async function deconnecter() {
  sessionStorage.removeItem('bqt_token');
  currentToken = null;

  afficherLoginScreen();
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('loginError').textContent = '';

  const menu = document.getElementById('sessionMenu');
  if (menu) menu.style.display = 'none';

  afficherListe();
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
    await initPage(token);
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

// Statut — priorite : mort (ani_date_mort renseignee) > actif (collier avec
// cor_date_fin IS NULL, cf. fetchAnimauxSuivis) > non_suivi par defaut.
function computeStatut(ani, idsSuivisSet) {
  if (ani.ani_date_mort) return 'mort';
  if (idsSuivisSet.has(ani.ani_id)) return 'actif';
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
  const statutKey = computeStatut(detail || {}, idsSuivis);
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

/**
 * Combine les filtres par colonne (ET logique) — filtrage purement client, sur les
 * donnees deja chargees par fetchAnimals() (aucun appel API).
 */
function appliquerFiltresListe() {
  const filtreNom = (document.getElementById('filtreColNom')?.value || '').trim().toLowerCase();
  const filtreCode = (document.getElementById('filtreColCode')?.value || '').trim().toLowerCase();
  const filtreSexe = document.getElementById('filtreColSexe')?.value || '';
  const filtreAnnee = (document.getElementById('filtreColAnnee')?.value || '').trim();
  const filtrePopulation = document.getElementById('filtreColPopulation')?.value || '';
  const filtreGestionnaire = document.getElementById('filtreColGestionnaire')?.value || '';
  const filtreStatut = document.getElementById('filtreColStatut')?.value || '';

  document.querySelectorAll('#indivTableBody .indiv-row').forEach(row => {
    const ani = animals.find(a => String(a.ani_id) === row.dataset.aniId);
    if (!ani) return;

    const nom = (ani.ani_nom || '').toLowerCase();
    const code = String(ani.ani_code || '').toLowerCase();
    const population = ani.ani_pop_rattach || '';
    const gestionnaire = ani.ani_gestionnaire || '';
    const annee = String(ani.ani_annee_naissance ?? '');

    const matchNom = !filtreNom || nom.includes(filtreNom);
    const matchCode = !filtreCode || code.includes(filtreCode);
    const matchSexe = !filtreSexe || ani.ani_sexe === filtreSexe;
    const matchAnnee = !filtreAnnee || annee.includes(filtreAnnee);
    const matchPopulation = !filtrePopulation || population === filtrePopulation;
    const matchGestionnaire = !filtreGestionnaire || gestionnaire === filtreGestionnaire;
    const matchStatut = !filtreStatut || row.dataset.statut === filtreStatut;

    const visible = matchNom && matchCode && matchSexe &&
      matchAnnee && matchPopulation && matchGestionnaire && matchStatut;
    row.style.display = visible ? '' : 'none';
  });
}

['filtreColNom', 'filtreColCode', 'filtreColAnnee'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', appliquerFiltresListe);
});
['filtreColSexe', 'filtreColPopulation', 'filtreColGestionnaire', 'filtreColStatut'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', appliquerFiltresListe);
});

function peuplerTableauListe() {
  const corps = document.getElementById('indivTableBody');
  if (!corps) return;
  corps.innerHTML = '';

  animals.forEach(ani => {
    const row = document.createElement('div');
    row.className = 'indiv-row';
    row.dataset.aniId = ani.ani_id;
    const statutKey = computeStatut(ani, idsSuivis);
    row.dataset.statut = statutKey;

    const celluleNom = document.createElement('div');
    celluleNom.className = 'indiv-cell';
    celluleNom.appendChild(creerValeurNode(ani.ani_nom));

    const celluleCode = document.createElement('div');
    celluleCode.className = 'indiv-cell';
    celluleCode.appendChild(creerValeurNode(ani.ani_code));

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

    row.append(celluleNom, celluleCode, celluleSexe, celluleAnnee, cellulePopulation, celluleGestionnaire, celluleStatut);

    row.addEventListener('click', () => afficherFiche(ani.ani_id));
    corps.appendChild(row);
  });

  peuplerFiltresDynamiques();
  appliquerFiltresListe();
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
    span.textContent = 'N/A';
    return span;
  }
  return document.createTextNode(v);
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

function remplirIdentite(detail) {
  const corps = document.getElementById('carteIdentitePrincipale');
  if (!corps) return;
  corps.innerHTML = '';
  corps.appendChild(ligneInfo('Code', detail?.ani_code));
  corps.appendChild(ligneInfo('Sexe', detail?.ani_sexe));
  corps.appendChild(ligneInfo('Année de naissance', detail?.ani_annee_naissance));
  corps.appendChild(ligneInfo('Population', detail?.ani_pop_rattach));
  corps.appendChild(ligneInfo('Gestionnaire', detail?.ani_gestionnaire));
  corps.appendChild(ligneInfo('Commentaire', detail?.ani_commentaire));
}

/**
 * Dates cles — Date de premiere capture (min sur les captures deja chargees,
 * aucun nouvel appel API) et Derniere localisation (max sur le chargement initial
 * de la carte GPS, avant tout filtre manuel via Actualiser — pas recalculee ensuite
 * pour rester une donnee stable de l'animal plutot qu'un reflet du filtre courant).
 * Derniere transmission GPS : aucune source de donnee actuelle (ni t_capteur ni
 * cor_animal_capteur n'exposent de timestamp de derniere transmission) — reste N/A.
 */
function remplirDatesCles(captures, locations) {
  const corps = document.getElementById('carteIdentiteDates');
  if (!corps) return;
  corps.innerHTML = '';

  const datesCapture = (captures || []).map(c => c.capture_date).filter(Boolean);
  const premiereCapture = datesCapture.length > 0 ? datesCapture.reduce((min, d) => d < min ? d : min) : null;
  corps.appendChild(ligneInfo('Date de première capture', premiereCapture));

  const datesLocalisation = (locations || [])
    .map(l => l.loc_datetime_local || l.loc_date_local)
    .filter(Boolean);
  const derniereLocalisation = datesLocalisation.length > 0
    ? datesLocalisation.reduce((max, d) => d > max ? d : max)
    : null;
  corps.appendChild(ligneInfo('Dernière localisation', derniereLocalisation));

  corps.appendChild(ligneInfo('Dernière transmission GPS', null));
}

/**
 * ILLUSTRATION COMPOSEE (photo + collier/oreilles SVG recolores + capteur PNG fixe)
 * Couleurs texte libres en base (t_animal) — variantes de casse/accents/genre a normaliser.
 */
const COULEURS_MARQUAGE = {
  blanc: '#ffffff',
  bleu: '#2563eb',
  jaune: '#f2c14e',
  noir: '#1a1a1a',
  orange: '#e8720c',
  rouge: '#c0392b',
  vert: '#2D6A4F',
  verte: '#2D6A4F',
  violet: '#7b2d8e'
};

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
    console.warn(`Couleur de marquage non reconnue : "${brut}" (clé normalisée "${cle}") — fallback gris appliqué.`);
  }
  return couleur || null;
}

// Gris neutre de repli si la couleur est absente/non reconnue, pour ne pas garder
// la couleur de l'individu precedent affiche sur ces memes elements DOM partages.
// #9e9e9e — meme gris "non applicable" que le reste de l'app (badge translocation
// non transloque, pastille statut non-suivi) — choisi pour rester nettement
// distinct de #ffffff (valeur reelle possible dans COULEURS_MARQUAGE), a la
// difference du gris d'origine des SVG (#d8d9d9/#d9d9d9) trop proche du blanc.
const COULEUR_COLLIER_DEFAUT = '#9e9e9e';
const COULEUR_OREILLE_DEFAUT = '#9e9e9e';

function appliquerCouleursMarquage(detail) {
  const pathCollier = document.getElementById('pathColorCollier');
  if (pathCollier) {
    pathCollier.style.fill = normaliserCouleur(detail?.ani_marquage_couleur_collier) || COULEUR_COLLIER_DEFAUT;
  }

  // Mapping direct — l'inversion gauche/droite (point de vue anatomique du bouquetin
  // vs position ecran) est geree cote CSS (.fiche-illustration-oreille-gauche/droite).
  const pathOreilleGauche = document.getElementById('pathColorOreilleGauche');
  if (pathOreilleGauche) {
    pathOreilleGauche.style.fill = normaliserCouleur(detail?.ani_marquage_oreille_gauche) || COULEUR_OREILLE_DEFAUT;
  }

  const pathOreilleDroite = document.getElementById('pathColorOreilleDroite');
  if (pathOreilleDroite) {
    pathOreilleDroite.style.fill = normaliserCouleur(detail?.ani_marquage_oreille_droite) || COULEUR_OREILLE_DEFAUT;
  }
}

function remplirMarquage(detail) {
  const corps = document.querySelector('#carteMarquage .fiche-carte-corps');
  if (!corps) return;
  corps.innerHTML = '';
  corps.appendChild(ligneInfo('Oreille droite', detail?.ani_marquage_oreille_droite));
  corps.appendChild(ligneInfo('Oreille gauche', detail?.ani_marquage_oreille_gauche));
  corps.appendChild(ligneInfo('Couleur collier', detail?.ani_marquage_couleur_collier));
  corps.appendChild(ligneInfo('Code collier', detail?.ani_marquage_code_collier));
}

/**
 * Carte "Informations GPS" — champs t_capteur/bib_programmation disponibles
 * via fetchCapteurParAnimal, cf. mail Ludovic.
 */
function remplirInformationsGPS(capteur) {
  const corps = document.querySelector('#carteInformationsGPS .fiche-carte-corps');
  if (!corps) return;
  corps.innerHTML = '';

  if (!capteur) {
    corps.textContent = 'Aucun capteur associé';
    return;
  }

  // t_capteur / bib_programmation — objets embarques par PostgREST (relation many-to-one),
  // absents (undefined) si l embedding echoue ou si capt_id/prog_id est null sur la ligne
  const t = capteur.t_capteur || {};
  const prog = capteur.bib_programmation || {};

  corps.appendChild(ligneInfo('ID capteur', t.capt_id));
  corps.appendChild(ligneInfo('ID constructeur', t.capt_id_constructeur));
  corps.appendChild(ligneInfo('Type', t.capt_type));
  corps.appendChild(ligneInfo('Fréquence capteur', t.capt_frequence));
  corps.appendChild(ligneInfo('Actif', t.capt_actif === true ? 'Oui' : t.capt_actif === false ? 'Non' : null));
  corps.appendChild(ligneInfo('Programmation', prog.prog_libelle));
  corps.appendChild(ligneInfo('Fréquence programmation', prog.prog_frequence));
  corps.appendChild(ligneInfo('Durée acquisition', prog.prog_duree_acquisition));
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

/**
 * Carte-evenement pour la colonne Capture — un champ 'jambe' (leg) capture par
 * evenement, independante de la colonne Relache (cf. creerCarteLegRelache).
 * Meme quand translocation=false (capture_zone/lieu_dit/site_geom garantis
 * identiques a relache_zone/lieu_dit/site_geom, regle metier Ludovic), chaque
 * colonne affiche son propre champ — pas de fusion, redondant mais coherent.
 * Badge translocation affiche uniquement ici (pas sur la carte Relache
 * correspondante, cf. creerCarteLegRelache) — un seul badge par evenement,
 * l'info etant la meme des deux cotes.
 */
function creerCarteLegCapture(c) {
  const carte = document.createElement('div');
  carte.className = 'capture-event-carte';

  const entete = document.createElement('div');
  entete.className = 'capture-event-entete';
  const dateEl = document.createElement('span');
  dateEl.className = 'capture-event-date-principale';
  dateEl.appendChild(creerValeurNode(c.capture_date));
  const badge = document.createElement('span');
  badge.className = `capture-event-badge-translocation ${c.translocation ? 'oui' : 'non'}`;
  badge.textContent = c.translocation ? 'Transloqué' : 'Non transloqué';
  entete.append(dateEl, badge);

  const corps = document.createElement('div');
  corps.className = 'capture-event-corps';
  corps.appendChild(creerChampCaptureRelache('Zone', c.capture_zone));
  corps.appendChild(creerChampCaptureRelache('Lieu-dit', c.capture_lieu_dit));
  corps.appendChild(creerChampCaptureRelache('Méthode', c.capture_methode));
  corps.appendChild(creerChampCaptureRelache('Objectif', c.capture_objectif));

  carte.append(entete, corps);
  return carte;
}

// Carte-evenement pour la colonne Relache — pas de methode/objectif (champs
// propres au leg capture uniquement).
function creerCarteLegRelache(c) {
  const carte = document.createElement('div');
  carte.className = 'capture-event-carte';

  const entete = document.createElement('div');
  entete.className = 'capture-event-entete';
  const dateEl = document.createElement('span');
  dateEl.className = 'capture-event-date-principale';
  dateEl.appendChild(creerValeurNode(c.relache_date));
  entete.append(dateEl);

  const corps = document.createElement('div');
  corps.className = 'capture-event-corps';
  corps.appendChild(creerChampCaptureRelache('Zone', c.relache_zone));
  corps.appendChild(creerChampCaptureRelache('Lieu-dit', c.relache_lieu_dit));

  carte.append(entete, corps);
  return carte;
}

function remplirListeCaptures(captures) {
  const conteneur = document.getElementById('captureListe');
  if (!conteneur) return;
  conteneur.innerHTML = '';

  if (!captures || captures.length === 0) {
    const vide = document.createElement('p');
    vide.className = 'fiche-placeholder';
    vide.textContent = 'Aucune capture enregistrée';
    conteneur.appendChild(vide);
    return;
  }

  const triees = [...captures].sort((a, b) => (b.capture_date || '').localeCompare(a.capture_date || ''));
  triees.forEach(c => conteneur.appendChild(creerCarteLegCapture(c)));
}

function remplirListeRelaches(captures) {
  const conteneur = document.getElementById('relacheListe');
  if (!conteneur) return;
  conteneur.innerHTML = '';

  if (!captures || captures.length === 0) {
    const vide = document.createElement('p');
    vide.className = 'fiche-placeholder';
    vide.textContent = 'Aucun relâché enregistré';
    conteneur.appendChild(vide);
    return;
  }

  const triees = [...captures].sort((a, b) => (b.relache_date || '').localeCompare(a.relache_date || ''));
  triees.forEach(c => conteneur.appendChild(creerCarteLegRelache(c)));
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

function creerCoucheFond() {
  const config = BASEMAPS_CONFIG.find(bm => bm.visible) || BASEMAPS_CONFIG[0];
  const url = config.url && config.url.includes('IGN_API_KEY')
    ? config.url.replace('${IGN_API_KEY}', IGN_API_KEY)
    : config.url;
  return new ol.layer.Tile({
    source: new ol.source.XYZ({ url, attributions: config.attributions })
  });
}

// EPSG:2154 (Lambert-93) — coherent avec le reste du schema (t_animal/v_localisation
// via f_get_localisation). Utilise pour l'avertissement de coherence du CRS/SRID dans
// parseGeomPostGIS() (branche GeoJSON, format reellement recu en pratique pour
// capture_site_geom/relache_site_geom, confirme le 2026-07-15) et parseEwkbHexPoint()
// (branche EWKB hex, conservee par securite si le format change un jour cote serveur).
const SRID_ATTENDU = 2154;

// Bornes approximatives de la France metropolitaine + Espagne en Lambert-93 (EPSG:2154)
// — garde-fou cote frontend contre des donnees corrompues en base (287/367 lignes de
// t_capture_relache ont un capture_site_geom en notation scientifique aberrante, ex:
// 1e+237, confirme le 2026-07-15 ; probleme de donnees signale separement, cf. audit
// page Individus). Y_MIN volontairement bas (marge sous la frontiere espagnole, ou
// certaines populations suivies par le PNP sont situees) plutot que cale strictement
// sur la France metropolitaine.
const LAMBERT93_X_MIN = 0;
const LAMBERT93_X_MAX = 1300000;
const LAMBERT93_Y_MIN = 5800000;
const LAMBERT93_Y_MAX = 7200000;

function coordonneesPlausibles(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return false;
  const [x, y] = coords;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= LAMBERT93_X_MIN && x <= LAMBERT93_X_MAX && y >= LAMBERT93_Y_MIN && y <= LAMBERT93_Y_MAX;
}

/**
 * Parse une geometrie Point PostGIS renvoyee par PostgREST pour une colonne lue via
 * un SELECT de table brute (capture_site_geom/relache_site_geom). Gere deux formats :
 * - GeoJSON avec crs explicite (objet {coordinates, crs}) — format reellement recu en
 *   pratique, confirme le 2026-07-15 (ex: {"type":"Point","crs":{"type":"name",
 *   "properties":{"name":"EPSG:2154"}},"coordinates":[...]}).
 * - EWKB hex (chaine) — comportement par defaut de PostgREST pour une colonne geometry
 *   non castee, jamais observe en pratique sur ces deux colonnes a ce jour, mais gere par
 *   securite si le format change cote serveur (cf. parseEwkbHexPoint).
 * Les deux branches valident les coordonnees extraites via coordonneesPlausibles() avant
 * de les retourner — une geometrie hors plage (donnee corrompue en base) est traitee
 * exactement comme une geometrie absente (retour null), filtree ensuite par
 * .filter(Boolean) dans renderPointsSites().
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
    if (!coordonneesPlausibles(geom.coordinates)) {
      console.warn('Coordonnées hors plage plausible, géométrie ignorée :', geom.coordinates);
      return null;
    }
    return geom.coordinates;
  }

  if (typeof geom === 'string') {
    const coords = parseEwkbHexPoint(geom);
    if (coords && !coordonneesPlausibles(coords)) {
      console.warn('Coordonnées hors plage plausible, géométrie ignorée :', coords);
      return null;
    }
    return coords;
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

  _carteLocalisations = new ol.Map({
    target: 'ficheMapLocalisations',
    layers: [creerCoucheFond(), coucheLocalisations],
    view: new ol.View({ center: ol.proj.fromLonLat(DEFAULT_CENTER), zoom: DEFAULT_ZOOM })
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
  if (!_sourceLocalisations) return;
  _sourceLocalisations.clear();

  const features = (locations || [])
    .filter(loc => loc.geom?.coordinates)
    .map(loc => new ol.Feature({
      geometry: new ol.geom.Point(lambert93VersEcran(loc.geom.coordinates))
    }));

  _sourceLocalisations.addFeatures(features);

  const extent = _sourceLocalisations.getExtent();
  if (!ol.extent.isEmpty(extent)) {
    _carteLocalisations.getView().fit(extent, { padding: [40, 40, 40, 40], maxZoom: 15, duration: 300 });
  }
}

function parseDateFR(str) {
  if (!str || !/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return null;
  const [j, m, a] = str.split('/');
  return `${a}-${m}-${j}`;
}

async function chargerEtRenderLocalisations(aniId) {
  const n = parseInt(document.getElementById('ficheInputN')?.value) || 25;
  const dateMin = parseDateFR(document.getElementById('ficheDateFrom')?.value);
  const dateMax = parseDateFR(document.getElementById('ficheDateTo')?.value);

  const locations = await fetchLocalisationsAnimal(currentToken, aniId, {
    limitParAnimal: n,
    dateMin,
    dateMax
  });
  renderPointsLocalisations(locations);
  _dernieresLocalisationsChargees = locations;
  _dernieresLocalisationsLimiteAppliquee = n;
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

// --- Carte fusionnee sites de capture + sites de relache ---

function creerCoucheSitesCaptureRelache(source, couleur) {
  return new ol.layer.Vector({
    source,
    style: new ol.style.Style({
      image: new ol.style.Circle({
        radius: 6,
        fill: new ol.style.Fill({ color: couleur }),
        stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.5 })
      })
    })
  });
}

function initCarteSites() {
  if (_carteSites) return;
  assurerProjectionLambert93();

  _sourceSitesCapture = new ol.source.Vector();
  _sourceSitesRelache = new ol.source.Vector();
  _carteSites = new ol.Map({
    target: 'ficheMapSites',
    layers: [
      creerCoucheFond(),
      creerCoucheSitesCaptureRelache(_sourceSitesCapture, '#c0392b'),
      creerCoucheSitesCaptureRelache(_sourceSitesRelache, '#2D6A4F')
    ],
    view: new ol.View({ center: ol.proj.fromLonLat(DEFAULT_CENTER), zoom: DEFAULT_ZOOM })
  });

  observerRedimensionnementCarte(_carteSites, 'ficheMapSites');
}

function creerFeaturePointSite(coordLambert93) {
  return new ol.Feature({ geometry: new ol.geom.Point(lambert93VersEcran(coordLambert93)) });
}

// Fit sur l'etendue combinee des deux sources (capture + relache) — un individu
// avec uniquement des relaches (ou uniquement des captures) reste bien cadre.
function renderPointsSites(captures) {
  if (!_sourceSitesCapture || !_sourceSitesRelache) return;

  const coordsCapture = (captures || []).map(c => parseGeomPostGIS(c.capture_site_geom)).filter(Boolean);
  const coordsRelache = (captures || []).map(c => parseGeomPostGIS(c.relache_site_geom)).filter(Boolean);

  _sourceSitesCapture.clear();
  _sourceSitesCapture.addFeatures(coordsCapture.map(creerFeaturePointSite));
  _sourceSitesRelache.clear();
  _sourceSitesRelache.addFeatures(coordsRelache.map(creerFeaturePointSite));

  const extent = ol.extent.createEmpty();
  ol.extent.extend(extent, _sourceSitesCapture.getExtent());
  ol.extent.extend(extent, _sourceSitesRelache.getExtent());
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
 * creerCarteLegCapture) veut que capture_zone/capture_lieu_dit/capture_site_geom soient
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
 * GRAPHIQUES DISTANCE/ALTITUDE (ApexCharts).
 * Deux besoins de donnees distincts, recuperes en parallele dans initGraphiquesSynthese :
 * - Distance/mois : fenetre roulante de 12 mois (obtenirLocalisationsPourGraphiques, reutilise
 *   _dernieresLocalisationsChargees seulement si sa limite de nombre de positions n'a
 *   rien tronque ET si sa plage couvre au moins ~11 mois, sinon requete independante non
 *   bornee en nombre) — sous-titre de periode affiche sous le titre (#periodeDistanceMois).
 * - Altitude/saison : historique complet de l'animal (pas limite a 12 mois — une migration
 *   altitudinale saisonniere n'est parlante que sur plusieurs annees), donc appel dedie
 *   fetchLocalisationsAnimal(aniId, {}) sans aucune borne de date. NB : ce dernier reste
 *   plafonne par var_limit=10000 côte RPC (api.js, hors perimetre ici) — largement suffisant
 *   pour une moyenne saisonniere mais a garder en tete pour un individu suivi tres longtemps.
 */

function calculerDateMinDouzeMois() {
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  return d.toISOString().slice(0, 10);
}

// Reutilise les positions deja chargees pour la carte "Dernieres localisations" si :
// 1) leur limite de nombre de positions (limitParAnimal, cf. chargerEtRenderLocalisations)
//    n'a vraisemblablement rien tronque — heuristique : si le nombre de positions
//    renvoyees est INFERIEUR a la limite demandee, tout ce qui existait dans la plage
//    a ete renvoye (rien de coupe) ; si le nombre renvoye ATTEINT la limite, on ne peut
//    pas exclure qu'il y ait eu d'autres positions au-dela — traite comme tronque par
//    prudence (faux positif possible seulement si le total reel tombe pile sur la limite,
//    auquel cas on refait un appel independant pour rien — sans consequence, juste un
//    appel API en plus) ;
// 2) ET leur plage temporelle couvre au moins ~11 mois (330 jours — marge sous 365 pour
//    ne pas refaire un appel a quelques jours pres).
// Sinon (limite tronquee OU plage insuffisante) : requete independante et non bornee en
// nombre sur les 12 derniers mois, pour ne jamais sous-estimer la distance parcourue.
async function obtenirLocalisationsPourGraphiques(aniId, locationsInitiales, limiteAppliquee) {
  const limiteTronquee = limiteAppliquee != null && (locationsInitiales || []).length >= limiteAppliquee;
  if (limiteTronquee) {
    return fetchLocalisationsAnimal(currentToken, aniId, { dateMin: calculerDateMinDouzeMois() });
  }

  const dates = (locationsInitiales || [])
    .map(l => l.loc_datetime_local || l.loc_date_local)
    .filter(Boolean)
    .sort();

  const spanJours = dates.length >= 2
    ? (new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000
    : 0;

  if (spanJours >= 330) {
    return locationsInitiales;
  }

  return fetchLocalisationsAnimal(currentToken, aniId, { dateMin: calculerDateMinDouzeMois() });
}

// Au-dela de cet ecart entre deux positions consecutives, la distance euclidienne entre
// les deux n'est plus un proxy fiable du trajet reellement parcouru (le capteur a pu ne pas
// transmettre pendant plusieurs jours ; l'animal a pu faire des allers-retours entretemps) —
// paire ignoree plutot que de fausser le mois avec un saut isole. A ajuster si les capteurs
// PNP ont un pas de transmission tres different de quelques heures (cf. prog_frequence).
const GAP_MAX_HEURES = 48;

// Fenetre roulante de 12 mois maximum, mais demarre au premier mois reellement
// couvert par les donnees si celles-ci sont plus recentes (moins d'un an d'historique).
// Distance = somme des segments euclidiens entre positions GPS consecutives (triees), sur
// coordonnees Lambert-93/EPSG:2154 (geom.coordinates, cf. lambert93VersEcran plus haut) —
// projection en metres, donc pas de reprojection necessaire pour ce calcul.
function agregerDistanceParMois(locations) {
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

  if (distanceParMois.size === 0) return { categories: [], valeurs: [] };

  const premiereCleDonnees = [...distanceParMois.keys()].sort()[0];

  const maintenant = new Date();
  const finFenetre = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  const debutRoulant = new Date(finFenetre);
  debutRoulant.setMonth(debutRoulant.getMonth() - 11);

  const [anneeDonnees, moisDonnees] = premiereCleDonnees.split('-').map(Number);
  const debutDonnees = new Date(anneeDonnees, moisDonnees - 1, 1);

  const debut = debutDonnees > debutRoulant ? debutDonnees : debutRoulant;

  const categories = [];
  const valeurs = [];
  const curseur = new Date(debut);
  while (curseur <= finFenetre) {
    const cle = `${curseur.getFullYear()}-${String(curseur.getMonth() + 1).padStart(2, '0')}`;
    categories.push(cle);
    const metres = distanceParMois.get(cle) || 0;
    valeurs.push(Math.round((metres / 1000) * 10) / 10); // km, 1 decimale
    curseur.setMonth(curseur.getMonth() + 1);
  }

  return { categories, valeurs };
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

// Ordre calendaire d'affichage — memes bornes que SAISONS_CONFIG (config.js), deja utilisees
// par les boutons radio "Saisonnalite" de la page Carte (filters.js) et l'entete du site.
// Libelles avec accents corrects (SAISONS_CONFIG.ete.label vaut 'Ete' sans accent — pas repris
// tel quel pour l'affichage, mais les bornes from/to restent la source de verite).
const SAISONS_ORDRE = ['hiver', 'printemps', 'ete', 'rut'];
const SAISONS_LABELS_AFFICHAGE = { hiver: 'Hiver', printemps: 'Printemps', ete: 'Été', rut: 'Rut' };

function parseJJMMVersMoisJour(jjmm) {
  const [j, m] = jjmm.split('/').map(Number);
  return m * 100 + j;
}

function determinerSaison(date) {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  for (const cle of SAISONS_ORDRE) {
    const config = SAISONS_CONFIG[cle];
    if (!config) continue;
    const from = parseJJMMVersMoisJour(config.from);
    const to = parseJJMMVersMoisJour(config.to);
    const correspond = from <= to ? (md >= from && md <= to) : (md >= from || md <= to);
    if (correspond) return cle;
  }
  return null;
}

// Altitude moyenne par saison, sur l'historique complet (pas la fenetre roulante 12 mois
// du graphique de distance) — positions sans loc_altitude_capteur exclues du calcul (pas
// comptees comme 0, sinon la moyenne serait faussee vers le bas).
function calculerAltitudeParSaison(locations) {
  const sommeParSaison = { hiver: 0, printemps: 0, ete: 0, rut: 0 };
  const compteParSaison = { hiver: 0, printemps: 0, ete: 0, rut: 0 };

  (locations || []).forEach(l => {
    const altitude = l.loc_altitude_capteur;
    if (altitude === null || altitude === undefined) return;

    const dateStr = l.loc_datetime_local || l.loc_date_local;
    if (!dateStr) return;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return;

    const saison = determinerSaison(date);
    if (!saison) return;

    sommeParSaison[saison] += altitude;
    compteParSaison[saison] += 1;
  });

  const categories = SAISONS_ORDRE.map(cle => SAISONS_LABELS_AFFICHAGE[cle]);
  const valeurs = SAISONS_ORDRE.map(cle =>
    compteParSaison[cle] > 0 ? Math.round(sommeParSaison[cle] / compteParSaison[cle]) : null
  );

  return { categories, valeurs };
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
  if (_chartAltitudeSaison) {
    _chartAltitudeSaison.destroy();
    _chartAltitudeSaison = null;
  }
  // Vide le sous-titre de periode pendant le rechargement — evite d'afficher
  // brievement la periode de l'individu precedent.
  const elPeriodeDistance = document.getElementById('periodeDistanceMois');
  if (elPeriodeDistance) elPeriodeDistance.textContent = '';
}

const APEXCHARTS_OPTIONS_COMMUNES = {
  chart: {
    toolbar: { show: false },
    animations: { enabled: false },
    fontFamily: 'Source Sans 3, sans-serif',
    foreColor: '#666666',
    zoom: { enabled: false }
  },
  grid: { borderColor: '#e0e0e0', strokeDashArray: 3 },
  dataLabels: { enabled: false },
  colors: ['#2D6A4F'],
  tooltip: { theme: 'light' }
};

async function initGraphiquesSynthese(aniId) {
  detruireGraphiquesSynthese();

  let locationsRoulantes, locationsCompletes;
  try {
    [locationsRoulantes, locationsCompletes] = await Promise.all([
      obtenirLocalisationsPourGraphiques(aniId, _dernieresLocalisationsChargees, _dernieresLocalisationsLimiteAppliquee),
      fetchLocalisationsAnimal(currentToken, aniId, {})
    ]);
  } catch (err) {
    console.error('Erreur chargement données graphiques Synthèse:', err);
    return;
  }

  // L'individu affiché a pu changer pendant l'appel ci-dessus (async) — n'initialise
  // pas des graphiques pour un individu qui n'est plus celui affiché a l'ecran.
  if (String(currentAniId) !== String(aniId)) return;

  const { categories, valeurs } = agregerDistanceParMois(locationsRoulantes);
  const { categories: categoriesSaisons, valeurs: valeursAltitude } = calculerAltitudeParSaison(locationsCompletes);

  // Sous-titre de periode du graphique Distance — dynamique : periode reelle si
  // l'historique de l'individu est plus court que 12 mois, sinon libelle fixe.
  const elPeriodeDistance = document.getElementById('periodeDistanceMois');
  if (elPeriodeDistance) {
    if (categories.length === 0) {
      elPeriodeDistance.textContent = 'Aucune donnée disponible';
    } else if (categories.length < 12) {
      elPeriodeDistance.textContent = `Depuis ${formaterMoisLabelLong(categories[0])}`;
    } else {
      elPeriodeDistance.textContent = '12 derniers mois';
    }
  }

  const elDistance = document.getElementById('chartDistanceMois');
  if (elDistance) {
    _chartDistanceMois = new ApexCharts(elDistance, {
      ...APEXCHARTS_OPTIONS_COMMUNES,
      chart: { ...APEXCHARTS_OPTIONS_COMMUNES.chart, type: 'bar', height: '100%' },
      series: [{ name: 'Distance (km)', data: valeurs }],
      xaxis: {
        categories: categories.map(formaterMoisLabel),
        labels: { style: { fontSize: '11px' } }
      },
      yaxis: {
        labels: { style: { fontSize: '11px' }, formatter: (v) => v.toFixed(1) },
        forceNiceScale: true
      },
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 2 } }
    });
    await _chartDistanceMois.render();
    observerRedimensionnementGraphique('chartDistanceMois');
  }

  const elAltitudeSaison = document.getElementById('chartAltitudeSaison');
  if (elAltitudeSaison) {
    _chartAltitudeSaison = new ApexCharts(elAltitudeSaison, {
      ...APEXCHARTS_OPTIONS_COMMUNES,
      chart: { ...APEXCHARTS_OPTIONS_COMMUNES.chart, type: 'bar', height: '100%' },
      series: [{ name: 'Altitude moyenne (m)', data: valeursAltitude }],
      xaxis: {
        categories: categoriesSaisons,
        labels: { style: { fontSize: '11px' } }
      },
      yaxis: { title: { text: 'Altitude (m)' }, labels: { style: { fontSize: '11px' } } },
      plotOptions: { bar: { columnWidth: '45%', borderRadius: 2 } }
    });
    await _chartAltitudeSaison.render();
    observerRedimensionnementGraphique('chartAltitudeSaison');
  }
}

async function afficherFiche(aniId) {
  currentAniId = aniId;
  const animal = animals.find(a => String(a.ani_id) === String(aniId));
  const ficheNom = document.getElementById('ficheNom');
  if (ficheNom) ficheNom.textContent = animal?.ani_nom || `Individu ${aniId}`;

  document.getElementById('vueListe').style.display = 'none';
  document.getElementById('vueFiche').style.display = 'flex';

  try {
    const [detail, capteurs, captures] = await Promise.all([
      fetchAnimalDetail(currentToken, aniId),
      fetchCapteurParAnimal(currentToken, aniId),
      fetchCaptureRelacheParAnimal(currentToken, aniId)
    ]);

    remplirIdentite(detail);
    remplirPastilleStatutPhoto(detail);
    remplirMarquage(detail);
    remplirInformationsGPS(capteurs[0]);
    remplirListeCaptures(captures);
    remplirListeRelaches(captures);
    verifierCoherenceTranslocation(captures);
    appliquerCouleursMarquage(detail);

    initCarteSites();
    renderPointsSites(captures);

    initCarteLocalisations();
    const locations = await chargerEtRenderLocalisations(aniId);
    remplirDatesCles(captures, locations);
    await initGraphiquesSynthese(aniId);

    setTimeout(() => {
      _carteLocalisations?.updateSize();
      _carteSites?.updateSize();
    }, 50);
  } catch (err) {
    console.error('Erreur chargement fiche individu:', err);
  }
}

function afficherListe() {
  document.getElementById('vueFiche').style.display = 'none';
  document.getElementById('vueListe').style.display = 'block';
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
    [animals, idsSuivis] = await Promise.all([
      fetchAnimals(token),
      fetchAnimauxSuivis(token)
    ]);
    peuplerTableauListe();
  } catch (err) {
    console.error('Erreur chargement individus:', err);
  }
}

const tokenSauvegarde = sessionStorage.getItem('bqt_token');
if (tokenSauvegarde) {
  initPage(tokenSauvegarde).catch(() => deconnecter());
}
