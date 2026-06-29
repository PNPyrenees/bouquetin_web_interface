import { login, fetchAnimals, fetchLocations, fetchAnimalIdsParPeriode, fetchProgrammations, fetchAllLastLocations, fetchNDernieresLocalisations, viderCache, fetchPopulations, fetchGestionnaires,fetchBibliothequeProgrammations, fetchAniCalendrier, fetchAniIdsAvecGeom, fetchLocalisationsRPC, fetchAnneesDisponibles } from './api.js';
import { ZOOM_POINT_SINGLE, ZOOM_FILTER_SINGLE, ZOOM_FILTER_MULTI, ZOOM_TRAJECTOIRE_SINGLE, ZOOM_TRAJECTOIRE_MULTI, ZOOM_MAX_MANUAL, ZOOM_MIN_MANUAL, ROLE_LABELS, ROLE_INITIALES, SAISONS_CONFIG, BASEMAPS_CONFIG, CLASSES_AGE } from './config.js';
import { initMap, renderPoints, clearMap, clearMapPoints, updateMapSize, switchBasemap, getMap, getGpsSource, renderTrajectoire, clearTrajectoire, highlightPoint, zoomToPoint, getCouleursIndividus, getIndicesIndividus, getContourParIndex, filtrerPointsParVisibilite } from './map.js';
import { initPanneau, mettreAJourPanneau, setLabelDatetime, ouvrirPanneauSiNecessaire, setPanneauFermeManuel, mettreAJourIndividus, scrollToAniId, scrollToAniIdIndividus, setAniIdSelectionne } from './panel.js';
import { applyFilters, filtrerListeIndividus, mettreAJourListeParDate, getClasseAge, decocherCochesAutomatiques } from './filters.js';

/**
 * VARIABLES GLOBALES
 * 'animals' stockera la liste complète des individus pour le filtrage
 */

let animals = [];
let activeIds = new Set();
let currentToken = null;
const programmationsMap = new Map(); // ani_id → prog_id
let _aniCalendrier = new Map(); // ani_id -> Set(mois_jour 'MM-JJ') — index leger pour filtrage saison instantane

let sidebarRightInitialized = false;
let sidebarBadgesInitialized = false;
let basemapInitialized = false;
let toolbarCarteInitialized = false;
let mapListenersInitialized = false;
let mapInitialized = false;
let temporelInitialized = false;

let _dernierNPositions = '5';
let _dernierNTrajectoire = '25';
let _nEstToutes = false;
let _nModeManuel = false;

export function getAnimals() { return animals; }
export function getActiveIds() { return activeIds; }
export function getCurrentToken() { return currentToken; }
export function getProgrammationsMap() { return programmationsMap; }
export function getAniCalendrier() { return _aniCalendrier; }

export function setAnimals(val) { animals = val; }
export function setActiveIds(val) { activeIds = val; }
export function setCurrentToken(val) { currentToken = val; }
export function setDernierNPositions(val) { _dernierNPositions = val; }
export function setDernierNTrajectoire(val) { _dernierNTrajectoire = val; }

/**
 * ENRICHISSEMENT DES DONNÉES
 * Les tables de positions GPS ne contiennent pas toujours les métadonnées (sexe, etc.).
 * Cette fonction fusionne les positions avec les informations de la table t_animal.
 */
export function enrichirLocations(locations) {
  return locations.map(loc => {
    const ani = animals.find(a => String(a.ani_id) === String(loc.ani_id));
    return {
      ...loc,
      ani_sexe: loc.ani_sexe || ani?.ani_sexe || null,
      ani_gestionnaire: loc.ani_gestionnaire || ani?.ani_gestionnaire || null,
      ani_pop_rattach: loc.ani_pop_rattach || ani?.ani_pop_rattach || null
    };
  });
}

export function enrichirAnimauxAvecPositions(locations) {
  return animals
    .filter(a => locations.some(l => String(l.ani_id) === String(a.ani_id)))
    .map(a => {
      const locs = locations.filter(l => String(l.ani_id) === String(a.ani_id));
      const dates = locs
        .map(l => l.loc_datetime_local || l.loc_date_local)
        .filter(Boolean)
        .sort();
      return {
        ...a,
        premiere_position: dates[0] || null,
        derniere_position: dates[dates.length - 1] || null
      };
    });
}

function initSidebarRight() {
  if (sidebarRightInitialized) return;
  sidebarRightInitialized = true;
  const sidebarRight = document.getElementById('sidebarRight');
  const sidebarRightToggle = document.getElementById('sidebarRightToggle');

  sidebarRightToggle?.addEventListener('click', () => {
  const icon = sidebarRightToggle.querySelector('.toggle-icon');
  sidebarRight.classList.toggle('visible');
  const estVisible = sidebarRight.classList.contains('visible');
  icon.textContent = estVisible ? '›' : '‹';
  setPanneauFermeManuel(!estVisible);
  const mapScreen = document.getElementById('mapScreen');
  if (!estVisible) {
    sidebarRight.style.width = '';
    if (mapScreen) mapScreen.style.right = '';
  }
  if (estVisible) {
    mapScreen?.classList.add('panel-open');
  } else {
    mapScreen?.classList.remove('panel-open');
  }
  updateMapSize();
});

  const resizer = document.getElementById('sidebarRightResizer');
  let isResizing = false;
  const SNAP_CLOSE_THRESHOLD = 150;

  resizer?.addEventListener('mousedown', () => {
    isResizing = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    sidebarRight.style.transition = 'none';
    const mapScreen = document.getElementById('mapScreen');
    if (mapScreen) mapScreen.style.transition = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;

    if (newWidth < SNAP_CLOSE_THRESHOLD) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      sidebarRight.style.transition = 'none';
      sidebarRight.style.width = 'var(--panel-width)';
      sidebarRight.classList.remove('visible');
      const mapScreen = document.getElementById('mapScreen');
      if (mapScreen) {
        mapScreen.style.right = '';
        mapScreen.style.transition = '';
        mapScreen.classList.remove('panel-open');
      }
      const icon = sidebarRightToggle?.querySelector('.toggle-icon');
      if (icon) icon.textContent = '‹';
      setPanneauFermeManuel(true);
      updateMapSize();
      return;
    }

    const maxWidth = window.innerWidth * 0.85;
    if (newWidth <= maxWidth) {
      sidebarRight.style.width = `${newWidth}px`;
      const mapScreen = document.getElementById('mapScreen');
      if (mapScreen) mapScreen.style.right = `${newWidth}px`;
      updateMapSize();
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      sidebarRight.style.transition = 'right 0.3s ease';
      const mapScreen = document.getElementById('mapScreen');
      if (mapScreen) mapScreen.style.transition = '';
    }
  });
}

function mettreAJourLabelN() {
  const inputN = document.getElementById('inputNDernieres');
  const labelN = document.getElementById('labelNDernieres');
  if (!labelN) return;
  const n = parseInt(inputN?.value) || 1;
  labelN.textContent = n === 1 ? 'dernière position' : 'dernières positions';
}

function adapterSelectNPourMode(mode) {
  const inputN = document.getElementById('inputNDernieres');
  const nModeToutes = document.getElementById('nModeToutes');
  const nModeLimite = document.getElementById('nModeLimite');
  if (!inputN) return;

  _nModeManuel = false;
  const valeurCible = mode === 'trajectoire'
    ? (_dernierNPositions === 'toutes' ? 'toutes' : _dernierNTrajectoire)
    : _dernierNPositions;

  if (valeurCible === 'toutes') {
    _nEstToutes = true;
    if (nModeToutes) nModeToutes.checked = true;
    if (nModeLimite) nModeLimite.checked = false;
    inputN.disabled = false;
  } else {
    _nEstToutes = false;
    if (nModeLimite) nModeLimite.checked = true;
    if (nModeToutes) nModeToutes.checked = false;
    inputN.disabled = false;
    inputN.value = valeurCible || (mode === 'trajectoire' ? '25' : '5');
  }
  mettreAJourLabelN();
  mettreAJourBadgeNPositions();
}

function gererExclusiviteTemporel(actif) {
  const groupePeriode = document.getElementById('groupePeriode');
  const groupeSaisonnalite = document.getElementById('groupeSaisonnalite');

  if (actif === 'periode') {
    groupePeriode?.classList.remove('disabled');
    groupeSaisonnalite?.classList.add('disabled');
  } else if (actif === 'saisonnalite') {
    groupeSaisonnalite?.classList.remove('disabled');
    groupePeriode?.classList.add('disabled');
  } else {
    groupePeriode?.classList.remove('disabled');
    groupeSaisonnalite?.classList.remove('disabled');
  }
}

function _mettreAJourBadgeSaisonnalite() {
  const selectAnneeEl = document.getElementById('selectAnnee');
  const annees = selectAnneeEl?.tomselect
    ? Object.values(selectAnneeEl.tomselect.items).map(item => typeof item === 'string' ? item : item?.value).filter(Boolean)
    : Array.from(document.querySelectorAll('#selectAnnee option:checked'))
        .map(o => o.value).filter(Boolean);
  const saisonFrom = document.getElementById('saisonFrom')?.value;
  const saisonTo = document.getElementById('saisonTo')?.value;

  const toutesAnnees = annees.includes('toutes');
  const anneesReelles = annees.filter(a => a !== 'toutes');

  supprimerBadgeById('saisonnalite');

  if (!annees.length && !saisonFrom && !saisonTo) {
    gererExclusiviteTemporel(null);
    return;
  }

  let label = '';
  if (toutesAnnees) {
    if (saisonFrom && saisonTo) {
      label = `Du ${saisonFrom} au ${saisonTo} - toutes années`;
    } else {
      label = 'Toutes les années';
    }
  } else if (saisonFrom && saisonTo && anneesReelles.length > 0) {
    label = `Du ${saisonFrom} au ${saisonTo}/${anneesReelles.join('/')}`;
  } else if (saisonFrom && saisonTo) {
    label = `Du ${saisonFrom} au ${saisonTo}`;
  } else if (anneesReelles.length > 0) {
    label = anneesReelles.length === 1 ? `Année ${anneesReelles[0]}` : `Années ${anneesReelles.join(' - ')}`;
  }

  if (label) {
    ajouterBadge(label, () => {
      const el = document.getElementById('selectAnnee');
      if (el?.tomselect) {
        el.tomselect.clear(true);
      } else if (el) {
        el.value = '';
      }
      const sf = document.getElementById('saisonFrom');
      const st = document.getElementById('saisonTo');
      if (sf) { sf.value = ''; sf._flatpickr?.clear(); }
      if (st) { st.value = ''; st._flatpickr?.clear(); }
      document.querySelectorAll('input[name="saisonRadio"]').forEach(r => r.checked = false);
      gererExclusiviteTemporel(null);
      mettreAJourListeParDate();
      mettreAJourBoutonAppliquer();
    }, 'saisonnalite');
    gererExclusiviteTemporel('saisonnalite');
  }
}

function _mettreAJourBadgePeriode() {
  const from = document.getElementById('dateFrom')?.value;
  const to = document.getElementById('dateTo')?.value;

  // Gerer badge Du independamment
  supprimerBadgeById('periode-from');
  if (from && /^\d{2}\/\d{2}\/\d{4}$/.test(from)) {
    ajouterBadge(`Du ${from}`, () => {
      const df = document.getElementById('dateFrom');
      if (df) { df.value = ''; df._flatpickr?.clear(); }
      supprimerBadgeById('periode-from');
      const toVal = document.getElementById('dateTo')?.value;
      if (!toVal) gererExclusiviteTemporel(null);
      mettreAJourListeParDate();
      mettreAJourBoutonAppliquer();
    }, 'periode-from');
  }

  // Gerer badge Au independamment
  supprimerBadgeById('periode-to');
  if (to && /^\d{2}\/\d{2}\/\d{4}$/.test(to)) {
    ajouterBadge(`Au ${to}`, () => {
      const dt = document.getElementById('dateTo');
      if (dt) { dt.value = ''; dt._flatpickr?.clear(); }
      supprimerBadgeById('periode-to');
      const fromVal = document.getElementById('dateFrom')?.value;
      if (!fromVal) gererExclusiviteTemporel(null);
      mettreAJourListeParDate();
      mettreAJourBoutonAppliquer();
    }, 'periode-to');
  }

  // Exclusivite selon etat global
  if (from || to) {
    gererExclusiviteTemporel('periode');
  } else {
    gererExclusiviteTemporel(null);
  }
}

export function mettreAJourBadgeNPositions() {
  const inputN = document.getElementById('inputNDernieres');
  const nModeToutes = document.getElementById('nModeToutes');

  supprimerBadgeById('nPositions');

  if (nModeToutes?.checked) {
    // Pas de badge en mode Toutes les positions
    return;
  }

  const n = parseInt(inputN?.value) || 1;
  const label = n === 1 ? `${n} dernière position` : `${n} dernières positions`;

  ajouterBadge(label, () => {
    // Suppression du badge = bascule sur Toutes les positions
    if (nModeToutes) {
      nModeToutes.checked = true;
      nModeToutes.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, 'nPositions');
}

/**
 * INITIALISATION DE L'APPLICATION
 * Orchestre le chargement des données et la configuration de l'interface.
 */
async function startApp(token) {
  initSidebarRight();
  // Masquer l'écran de login après authentification réussie
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.style.display = 'none';

  // Afficher la session utilisateur et le bouton déconnexion
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

  ['mousemove', 'keydown', 'click', 'scroll'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer, { passive: true });
  });
  resetInactivityTimer();

  showGlobalLoading();
  lockSidebar();
  try {
    if (!mapInitialized) {
      mapInitialized = true;
      initMap('map', 'popup');
    }
    window._highlightPoint = highlightPoint;
    window._zoomToPoint = zoomToPoint;
    window._getMap = getMap;
    window._filtrerPointsCarte = filtrerPointsParVisibilite;
    window._getGpsFeatures = () => getGpsSource().getFeatures();
    window._ZOOM_POINT_SINGLE = ZOOM_POINT_SINGLE;
    window._afficherPositionsIndividu = (aniId) => {
      const features = getGpsSource().getFeatures();
      const feature = features.find(f => String(f.get('ani_id')) === String(aniId));
      if (!feature) return;
      const geom = feature.getGeometry();
      if (!geom) return;
      const coord = geom.getCoordinates();
      getMap().getView().animate({ center: coord, duration: 400 });
    };

    // Récupération des données depuis l'API via le module api.js
    setCurrentToken(token);
    sessionStorage.setItem('bqt_token', token);

    const [animaux, populations, gestionnaires, programmations] = await Promise.all([
      fetchAnimals(token),
      fetchPopulations(token),
      fetchGestionnaires(token),
      fetchProgrammations(token)
    ]);

    setAnimals(animaux);

    const selectPop = document.getElementById('selectPopulation');
    if (selectPop) {
      if (selectPop.tomselect) {
        selectPop.tomselect.clearOptions();
        selectPop.tomselect.addOption({ value: '', text: 'Toutes les populations' });
        populations.forEach(p => selectPop.tomselect.addOption({ value: p, text: p }));
        selectPop.tomselect.refreshOptions(false);
      } else {
        while (selectPop.options.length > 1) selectPop.remove(1);
        populations.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p; opt.textContent = p;
          selectPop.appendChild(opt);
        });
      }
    }
    const selectGest = document.getElementById('selectGestionnaire');
    if (selectGest) {
      if (selectGest.tomselect) {
        selectGest.tomselect.clearOptions();
        selectGest.tomselect.addOption({ value: '', text: 'Tous' });
        gestionnaires.forEach(g => selectGest.tomselect.addOption({ value: g, text: g }));
        selectGest.tomselect.refreshOptions(false);
      } else {
        while (selectGest.options.length > 1) selectGest.remove(1);
        gestionnaires.forEach(g => {
          const opt = document.createElement('option');
          opt.value = g; opt.textContent = g;
          selectGest.appendChild(opt);
        });
      }
    }

    programmations.forEach(p => {
      if (!programmationsMap.has(String(p.ani_id))) {
        programmationsMap.set(String(p.ani_id), p.prog_id);
      }
    });

    await chargerProgrammationsGPS(token);
    
    // ← initPanneau() ici — après les données, avant le rendu
    initPanneau();
    window._scrollToAniId = scrollToAniId;
    window._scrollToAniIdIndividus = scrollToAniIdIndividus;
    window._setAniIdSelectionne = setAniIdSelectionne;
    window._showToast = showToast;
    // mettreAJourIndividus(animals);

    // Export CSV — requete dedicee tous champs
    document.getElementById('btnExportCSV')?.addEventListener('click', async () => {
      const { exporterCSV } = await import('./panel.js');
      // Recuperer les ani_id actuellement affiches sur la carte
      const aniIds = [...new Set(
        (window._getGpsFeatures?.() || [])
          .filter(f => f.get('ani_id'))
          .map(f => String(f.get('ani_id')))
      )];

      // Recuperer les params temporels actifs
      const params = {
        dateFrom: document.getElementById('dateFrom')?.value
          ? _parseDateFR(document.getElementById('dateFrom').value)
          : null,
        dateTo: document.getElementById('dateTo')?.value
          ? _parseDateFR(document.getElementById('dateTo').value)
          : null
      };

      await exporterCSV(currentToken, aniIds, params);
    });

    const n = parseInt(document.getElementById('inputNDernieres')?.value) || 5;

    // Deux requêtes en parallèle pour le chargement initial
    const [locationsAll, locationsSuiviesRaw] = await Promise.all([
      // Dernière position par animal suivi — pour activeIds, années, liste individus
      fetchLocalisationsRPC(currentToken, {
        ani_is_followed: true,
        limit_par_animal: 1
      }),
      // N dernières positions par animal suivi — pour le rendu carte
      fetchLocalisationsRPC(currentToken, {
        ani_is_followed: true,
        limit_par_animal: n
      })
    ]);

    // Calendrier en arrière-plan — ne bloque pas le rendu carte
    fetchAniCalendrier(currentToken).then(calendrier => {
      _aniCalendrier = calendrier;
    }).catch(err => console.warn('fetchAniCalendrier échoué:', err));

    // Années disponibles en arrière-plan — locationsAll ne couvre que les dernières positions
    fetchAnneesDisponibles(currentToken).then(annees => {
      const selectAnnee = document.getElementById('selectAnnee');
      if (selectAnnee) {
        if (selectAnnee.tomselect) {
          selectAnnee.tomselect.clearOptions();
          annees.forEach(annee => selectAnnee.tomselect.addOption({ value: String(annee), text: String(annee) }));
          selectAnnee.tomselect.addOption({ value: 'toutes', text: 'Toutes les années' });
          selectAnnee.tomselect.refreshOptions(false);
        } else {
          while (selectAnnee.options.length > 1) selectAnnee.remove(1);
          annees.forEach(annee => {
            const opt = document.createElement('option');
            opt.value = annee;
            opt.textContent = annee;
            selectAnnee.appendChild(opt);
          });
          const optToutes = document.createElement('option');
          optToutes.value = 'toutes';
          optToutes.textContent = 'Toutes les années';
          selectAnnee.appendChild(optToutes);
        }
        window._anneeOptions = annees.map(String);
      }
    }).catch(err => console.warn('fetchAnneesDisponibles échoué:', err));

    const locationsEnrichiesAll = enrichirLocations(locationsAll);
    const locationsSuivies = enrichirLocations(locationsSuiviesRaw);

    // activeIds = tous les ani_id retournés par la RPC ani_is_followed
    // (la RPC filtre déjà cor_date_fin IS NULL côté SQL)
    setActiveIds(new Set(locationsAll.map(l => l.ani_id)));

    adapterSelectNPourMode('positions');
    mettreAJourBadgeNPositions();
    const count = renderPoints(locationsSuivies);
    mettreAJourPanneau(locationsSuivies);
    const posEl = document.getElementById('positionsCount');
    if (posEl) posEl.textContent = count;
    mettreAJourIndividus(enrichirAnimauxAvecPositions(locationsSuivies));
    mettreAJourLegende();
    setLabelDatetime('Date de localisation');

    // Identifier tous les animaux qui ont au moins une géométrie — sur tout l historique
    // (v_localisation), pas seulement leur derniere position (v_animal_last_loc), pour ne pas
    // exclure un animal inactif dont la derniere position n a pas de geom valide
    const idsAvecGeom = await fetchAniIdsAvecGeom(currentToken);

    const listeIndividus = document.getElementById('listeIndividus');
    const searchIndividu = document.getElementById('searchIndividu');

    if (listeIndividus) {
      listeIndividus.innerHTML = '';
      // Tri alphabétique des animaux par nom
      animals.sort((a, b) => (a.ani_nom || '').localeCompare(b.ani_nom || ''))
        .forEach(ani => {
          // Création dynamique de chaque élément de la liste
          const label = document.createElement('label');
          label.className = 'checkbox-label';

          // Classe d'âge à la capture, par sexe — stockée dans un attribut de données (dataset)
          // Utilisée plus tard par la fonction filtrerListeIndividus
          label.dataset.classe = getClasseAge(ani) || '';
          label.dataset.sexe = ani.ani_sexe || '';
          label.dataset.gestionnaire = ani.ani_gestionnaire || '';
          label.dataset.population = ani.ani_pop_rattach || '';
          label.dataset.masqueParDate = 'false';

          const dernierePos = locationsEnrichiesAll.find(l => String(l.ani_id) === String(ani.ani_id));
          if (dernierePos) {
            const dateStr = dernierePos.loc_datetime_local || dernierePos.loc_date_local;
            if (dateStr) label.dataset.derniereDatePos = dateStr;
          }

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.value = ani.ani_id;
          const texte = document.createTextNode(' ' + (ani.ani_nom || ''));
          label.appendChild(checkbox);
          label.appendChild(texte);

          // Gestion du clic sur une checkbox d'individu
          checkbox.addEventListener('change', () => {
            if (!checkbox.checked) {
              label.dataset.cocheAuto = 'false';
              supprimerBadgeById(`ani-${ani.ani_id}`);
            } else {
              label.dataset.cocheAuto = 'false';
              ajouterBadge(ani.ani_nom, () => {
                checkbox.checked = false;
                label.dataset.cocheAuto = 'false';
                supprimerBadgeById(`ani-${ani.ani_id}`);
                mettreAJourSelectN();
                mettreAJourBoutonAppliquer();
              }, `ani-${ani.ani_id}`);
            }
            mettreAJourSelectN();
            mettreAJourBoutonAppliquer();
          });

          listeIndividus.appendChild(label);

          // Masquer les animaux sans géométrie
          if (!idsAvecGeom.has(String(ani.ani_id))) {
            label.style.display = 'none';
            label.dataset.sansGeom = 'true';
          }
        });

      listeIndividus.style.maxHeight = '300px';
      listeIndividus.style.overflowY = 'auto';

      // Peupler les classes d age au demarrage
      peuplerSelectClasseAge('TOUS');

      // Écouteur pour mettre à jour la liste des individus (masquer inactifs si coché)
      document.getElementById('checkSuivis')?.addEventListener('change', (e) => {
        const suivisSeulement = e.target.checked;

        if (suivisSeulement) {
          ajouterBadge('Individus suivis uniquement', () => {
            const cb = document.getElementById('checkSuivis');
            if (cb) cb.checked = false;
            mettreAJourListeParDate();
          }, 'checkSuivis');
        } else {
          supprimerBadgeById('checkSuivis');
        }

        decocherCochesAutomatiques();
        mettreAJourListeParDate();
        mettreAJourBoutonAppliquer();
      });
    }

    // Initialisation des filtres temporels (flatpickr + listeners) — une seule fois pour la duree de vie de la page
    if (!temporelInitialized) {
      temporelInitialized = true;

      // Filet de securite — detruire d eventuelles instances flatpickr residuelles avant d en recreer
      ['dateFrom', 'dateTo', 'saisonFrom', 'saisonTo'].forEach(id => {
        const el = document.getElementById(id);
        if (el?._flatpickr) el._flatpickr.destroy();
      });

      // Flatpickr — Periode (JJ/MM/AAAA)
      if (window.flatpickr) {
        flatpickr('#dateFrom', {
          dateFormat: 'd/m/Y',
          allowInput: true,
          locale: 'fr',
          onChange(selectedDates, dateStr) {
            document.getElementById('dateFrom').value = dateStr;
            document.getElementById('dateFrom').dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
        flatpickr('#dateTo', {
          dateFormat: 'd/m/Y',
          allowInput: true,
          locale: 'fr',
          onChange(selectedDates, dateStr) {
            document.getElementById('dateTo').value = dateStr;
            document.getElementById('dateTo').dispatchEvent(new Event('input', { bubbles: true }));
          }
        });

        // Flatpickr — Saisonnalite (JJ/MM uniquement, sans annee)
        flatpickr('#saisonFrom', {
          dateFormat: 'd/m',
          allowInput: true,
          locale: 'fr',
          disableMobile: true,
          onChange(selectedDates, dateStr) {
            document.getElementById('saisonFrom').value = dateStr;
            document.getElementById('saisonFrom').dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
        flatpickr('#saisonTo', {
          dateFormat: 'd/m',
          allowInput: true,
          locale: 'fr',
          disableMobile: true,
          onChange(selectedDates, dateStr) {
            document.getElementById('saisonTo').value = dateStr;
            document.getElementById('saisonTo').dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      }

      // Listeners radios saison
      document.querySelectorAll('input[name="saisonRadio"]').forEach(radio => {
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          const saison = radio.value;
          const config = SAISONS_CONFIG[saison];
          if (!config) return;

          const saisonFrom = document.getElementById('saisonFrom');
          const saisonTo = document.getElementById('saisonTo');
          if (saisonFrom) {
            saisonFrom.value = config.from;
            saisonFrom._flatpickr?.setDate(config.from, false, 'd/m');
          }
          if (saisonTo) {
            saisonTo.value = config.to;
            saisonTo._flatpickr?.setDate(config.to, false, 'd/m');
          }

          gererExclusiviteTemporel('saisonnalite');
          mettreAJourListeParDate();
          mettreAJourBoutonAppliquer();
          decocherCochesAutomatiques();
          _mettreAJourBadgeSaisonnalite();
        });
      });

      // Listeners saisonFrom / saisonTo
      ['saisonFrom', 'saisonTo'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener('input', () => {
          if (el.value === '') {
            const autreId = id === 'saisonFrom' ? 'saisonTo' : 'saisonFrom';
            const autre = document.getElementById(autreId);
            const selectAnneeEl2 = document.getElementById('selectAnnee');
            const aDesAnnees2 = selectAnneeEl2?.tomselect
              ? Object.values(selectAnneeEl2.tomselect.items).map(item => typeof item === 'string' ? item : item?.value).filter(Boolean).length > 0
              : !!selectAnneeEl2?.value;
            if (!autre?.value && !aDesAnnees2) {
              supprimerBadgeById('saisonnalite');
              gererExclusiviteTemporel(null);
            } else {
              _mettreAJourBadgeSaisonnalite();
            }
            mettreAJourListeParDate();
            mettreAJourBoutonAppliquer();
            return;
          }
          const isComplete = /^\d{2}\/\d{2}$/.test(el.value);
          if (isComplete) {
            document.querySelectorAll('input[name="saisonRadio"]').forEach(r => r.checked = false);
            mettreAJourListeParDate();
            mettreAJourBoutonAppliquer();
            decocherCochesAutomatiques();
            _mettreAJourBadgeSaisonnalite();
          }
        });

        el.addEventListener('blur', () => {
          const val = el.value;
          if (val && !/^\d{2}\/\d{2}$/.test(val)) {
            if (!el._flatpickr?.selectedDates?.length) {
              el.value = '';
              _mettreAJourBadgeSaisonnalite();
              mettreAJourBoutonAppliquer();
            } else {
              const d = el._flatpickr.selectedDates[0];
              const j = String(d.getDate()).padStart(2, '0');
              const m = String(d.getMonth() + 1).padStart(2, '0');
              el.value = `${j}/${m}`;
              _mettreAJourBadgeSaisonnalite();
              mettreAJourListeParDate();
              mettreAJourBoutonAppliquer();
            }
          }
        });
      });

      // Listener selectAnnee
      document.getElementById('selectAnnee')?.addEventListener('change', () => {
        decocherCochesAutomatiques();
        mettreAJourListeParDate();
        mettreAJourBoutonAppliquer();
        _mettreAJourBadgeSaisonnalite();
        const selectAnneeEl = document.getElementById('selectAnnee');
        const aDesAnnees = selectAnneeEl?.tomselect
          ? Object.values(selectAnneeEl.tomselect.items).map(item => typeof item === 'string' ? item : item?.value).filter(Boolean).length > 0
          : !!selectAnneeEl?.value;
        if (aDesAnnees || document.getElementById('saisonFrom')?.value || document.getElementById('saisonTo')?.value) {
          gererExclusiviteTemporel('saisonnalite');
        } else {
          gererExclusiviteTemporel(null);
        }
      });

      // Listeners sur dateFrom et dateTo
      ['dateFrom', 'dateTo'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener('input', () => {
          if (el.value === '') {
            // Ne pas supprimer les deux badges manuellement — appeler _mettreAJourBadgePeriode()
            // qui gere chaque badge selon l etat actuel de chaque champ
            _mettreAJourBadgePeriode();
            const autreId = id === 'dateFrom' ? 'dateTo' : 'dateFrom';
            const autre = document.getElementById(autreId);
            if (!autre?.value) {
              gererExclusiviteTemporel(null);
            }
            mettreAJourListeParDate();
            mettreAJourBoutonAppliquer();
            return;
          }
          // Ne pas reformater pendant la frappe — Flatpickr gere au blur
          const isComplete = /^\d{2}\/\d{2}\/\d{4}$/.test(el.value);
          if (isComplete) {
            gererExclusiviteTemporel('periode');
            mettreAJourListeParDate();
            mettreAJourBoutonAppliquer();
            decocherCochesAutomatiques();
            _mettreAJourBadgePeriode();
          }
        });

        el.addEventListener('blur', () => {
          const val = el.value;
          if (val && !/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
            // Laisser Flatpickr parser — si la valeur est invalide apres blur, vider
            if (!el._flatpickr?.selectedDates?.length) {
              el.value = '';
              // Appeler _mettreAJourBadgePeriode() qui gere les badges independamment
              _mettreAJourBadgePeriode();
              const autreId = id === 'dateFrom' ? 'dateTo' : 'dateFrom';
              const autre = document.getElementById(autreId);
              if (!autre?.value) gererExclusiviteTemporel(null);
              mettreAJourBoutonAppliquer();
            } else {
              // Flatpickr a une date valide — reformater proprement
              const d = el._flatpickr.selectedDates[0];
              const j = String(d.getDate()).padStart(2, '0');
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const a = d.getFullYear();
              el.value = `${j}/${m}/${a}`;
              gererExclusiviteTemporel('periode');
              _mettreAJourBadgePeriode();
              mettreAJourListeParDate();
              mettreAJourBoutonAppliquer();
            }
          }
        });
      });
    }

    // Listener sur le composant N dernières localisations
    const nModeToutes = document.getElementById('nModeToutes');
    const nModeLimite = document.getElementById('nModeLimite');
    const inputN = document.getElementById('inputNDernieres');

    nModeToutes?.addEventListener('change', () => {
      if (!nModeToutes.checked) return;
      _nEstToutes = true;
      _nModeManuel = true;
      // Ne pas modifier _dernierNPositions/_dernierNTrajectoire ici
      // Ces variables ne sont mises a jour qu apres un applyFilters() reussi
      mettreAJourLabelN();
      decocherCochesAutomatiques();
      mettreAJourBoutonAppliquer();
    });

    nModeLimite?.addEventListener('change', () => {
      if (!nModeLimite.checked) return;
      _nEstToutes = false;
      _nModeManuel = true;
      inputN.disabled = false;
      const isTrajectoire = document.getElementById('btnTrajectoire')?.classList.contains('active');
      const derniere = isTrajectoire ? _dernierNTrajectoire : _dernierNPositions;
      if (derniere && derniere !== 'toutes') inputN.value = derniere;
      mettreAJourLabelN();
      mettreAJourBoutonAppliquer();
    });

    if (inputN) {
      inputN.addEventListener('input', () => {
        const n = parseInt(inputN.value);
        if (n >= 1) {
          _nModeManuel = true;
          _nEstToutes = false;
          // Saisir une valeur commute toujours le DOM vers le mode Limite,
          // quelle que soit la radio active (y compris apres un auto-switch vers Toutes)
          if (nModeLimite && !nModeLimite.checked) {
            nModeLimite.checked = true;
            if (nModeToutes) nModeToutes.checked = false;
          }
          // Ne pas modifier _dernierNPositions/_dernierNTrajectoire ici
          // Ces variables ne sont mises a jour qu apres un applyFilters() reussi
          mettreAJourLabelN();
          mettreAJourBoutonAppliquer();
        }
      });
    }

    // Cocher 'Individus en cours de suivi' par défaut avec son badge
    const checkSuivisInit = document.getElementById('checkSuivis');
    if (checkSuivisInit && !checkSuivisInit.checked) {
      checkSuivisInit.checked = true;
      ajouterBadge('Individus en cours de suivi', () => {
        checkSuivisInit.checked = false;
        mettreAJourListeParDate();
      }, 'checkSuivis');
    }

    mettreAJourFiltresActifs();
    filtrerListeIndividus();

    const btnApply = document.getElementById('btnApplyFilters');
    if (btnApply) {
      btnApply.disabled = true;
      btnApply.classList.add('btn-disabled');
    }

    // Initialisation de la logique des badges pour tous les autres filtres de la sidebar
    initSidebarBadges(token);

    // Initialisation du sélecteur de fond de carte
    initBasemapSelector();

    // Initialisation des boutons de la barre d'outils carte (zoom + filtre spatial)
    initToolbarCarte();

    // TomSelect — initialisation au premier toggle de chaque details
    // Les selects natifs sont cachés via CSS (select.sidebar-select { display: none })
    // TomSelect injecte son propre widget au premier toggle
    // TomSelect — initialisation au premier toggle de chaque details (ou immédiatement si déjà ouvert)
    // Les selects natifs sont cachés via CSS (select.sidebar-select { display: none })
    // TomSelect injecte son propre widget
    // TomSelect multiple dédié pour selectAnnee
    {
      const selectAnneeEl = document.getElementById('selectAnnee');
      if (selectAnneeEl && !selectAnneeEl.tomselect) {
        const detailsAnnee = selectAnneeEl.closest('details');
        let anneeInitialized = false;
        const initTSAnnee = () => {
          if (anneeInitialized || selectAnneeEl.tomselect) return;
          anneeInitialized = true;
          new TomSelect(selectAnneeEl, {
            create: false,
            allowEmptyOption: false,
            placeholder: 'Ajouter une année...',
            plugins: ['remove_button'],
            hideSelected: false,
            render: {
              option(data, escape) {
                const isSelected = Object.values(selectAnneeEl.tomselect?.items || {}).map(item => typeof item === 'string' ? item : item?.value).includes(data.value);
                return `<div class="${isSelected ? 'ts-option-selected' : ''}">${escape(data.text)}</div>`;
              }
            },
            onChange() {
              selectAnneeEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        };
        if (detailsAnnee?.open) initTSAnnee();
        detailsAnnee?.addEventListener('toggle', () => { if (detailsAnnee.open) initTSAnnee(); });
      }
    }

    ['selectPopulation', 'selectSexe', 'selectClasseAge', 'selectGestionnaire', 'selectTranslocation', 'selectProgrammation'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      const details = el.closest('details');
      if (!details) return;

      let initialized = false;
      const initTS = () => {
        if (initialized) return;
        if (el.tomselect) return; // Déjà initialisé — éviter double init
        initialized = true;
        new TomSelect(el, {
          create: false,
          allowEmptyOption: true,
          onChange(value) {
            el.value = value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            if (id === 'selectAnnee') {
              setTimeout(() => mettreAJourListeParDate(), 50);
            }
          }
        });
      };

      if (details.open) {
        initTS();
      }
      details.addEventListener('toggle', () => {
        if (details.open) {
          initTS();
        }
      });
    });

    if (!mapListenersInitialized) {
      mapListenersInitialized = true;

      searchIndividu?.addEventListener('input', () => {
        decocherCochesAutomatiques();
        mettreAJourListeParDate();
        mettreAJourBoutonAppliquer();
      });

      // Gestion du basculement entre les modes Positions et Trajectoire
      const btnPos = document.getElementById('btnPositions');
      const btnTraj = document.getElementById('btnTrajectoire');
      if (btnPos && btnTraj) {
        btnPos.addEventListener('click', () => {
          decocherCochesAutomatiques();

          const nCiblePos = _dernierNPositions;

          applyFilters(currentToken, 'positions', nCiblePos).then(confirme => {
            if (confirme !== false) {
              adapterSelectNPourMode('positions');
              btnPos.classList.add('active');
              btnTraj.classList.remove('active');
              clearTrajectoire();
              setLabelDatetime('Date de localisation');
              mettreAJourLegende('positions'); // ← correction timing
            }
          });
        });
        btnTraj.addEventListener('click', () => {
          const nCibleTraj = _dernierNPositions === 'toutes' ? 'toutes' : _dernierNTrajectoire;

          applyFilters(currentToken, 'trajectoire', nCibleTraj).then(confirme => {
            if (confirme !== false) {
              adapterSelectNPourMode('trajectoire');
              btnTraj.classList.add('active');
              btnPos.classList.remove('active');
              setLabelDatetime('Date/Heure');
              mettreAJourLegende('trajectoire'); // ← correction timing
              setTimeout(() => {
                const ids = window._idsAChercherTraj || [];
                if (ids.length === 0) return;
                const extent = getGpsSource().getExtent();
                if (!extent || ol.extent.isEmpty(extent)) return;
                if (ids.length === 1) {
                  getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: ZOOM_TRAJECTOIRE_SINGLE, duration: 400 });
                } else {
                  getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: ZOOM_TRAJECTOIRE_MULTI, duration: 400 });
                }
              }, 800);
            }
          });
        });
      }

      document.getElementById('checkAll')?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('#listeIndividus .checkbox-label').forEach(label => {
          if (label.style.display === 'none') return;
          const checkbox = label.querySelector('input');
          if (!checkbox) return;
          checkbox.checked = checked;
          if (checked) {
            ajouterBadge(checkbox.closest('label').textContent.trim(), () => {
              checkbox.checked = false;
            }, `ani-${checkbox.value}`);
          } else {
            supprimerBadgeById(`ani-${checkbox.value}`);
          }
        });
      });
    }

  } catch (err) {
    console.error('Erreur chargement individus:', err);
  } finally {
    hideGlobalLoading();
    unlockSidebar();
    mettreAJourBoutonAppliquer();
    updateMapSize();
    // Déclencheurs progressifs pour sécuriser la mise en page après masquage des overlays
    setTimeout(() => updateMapSize(), 150);
    setTimeout(() => updateMapSize(), 350);

    // Zoom dynamique sur l'emprise des données — s'adapte à PNP, PNRPA ou les deux
    setTimeout(() => {
      const extent = getGpsSource().getExtent();
      if (extent && !ol.extent.isEmpty(extent)) {
        getMap().getView().fit(extent, {
          padding: [80, 80, 80, 80],
          maxZoom: 13,
          duration: 600
        });
      } else {
        // Fallback — aucune donnée → centrer sur les Pyrénées
        getMap().getView().animate({
          center: ol.proj.fromLonLat([0.2, 42.9]),
          zoom: 9,
          duration: 400
        });
      }
    }, 600); // 600ms pour laisser WebGL rendre les points avant de calculer l'emprise
  }
}

// Helper — convertit JJ/MM/AAAA en AAAA-MM-JJ pour PostgREST
function _parseDateFR(dateStr) {
  if (!dateStr || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return null;
  const [j, m, a] = dateStr.split('/');
  return `${a}-${m}-${j}`;
}

function peuplerSelectClasseAge(sexe) {
  const select = document.getElementById('selectClasseAge');
  if (!select) return;

  const classes = CLASSES_AGE[sexe] || CLASSES_AGE['TOUS'];
  const valeurActuelle = select.tomselect
    ? select.tomselect.getValue()
    : select.value;

  if (select.tomselect) {
    select.tomselect.clearOptions();
    select.tomselect.addOption({ value: '', text: 'Toutes les classes' });
    classes.forEach(c => {
      select.tomselect.addOption({ value: c.label, text: c.label });
    });
    select.tomselect.refreshOptions(false);
    // Restaurer la valeur si elle existe encore dans les nouvelles options
    const exists = classes.find(c => c.label === valeurActuelle);
    if (exists) {
      select.tomselect.setValue(valeurActuelle, true);
    } else {
      select.tomselect.setValue('', true);
    }
  } else {
    select.innerHTML = '<option value="">Toutes les classes</option>';
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.label;
      opt.textContent = c.label;
      select.appendChild(opt);
    });
    select.value = classes.find(c => c.label === valeurActuelle) ? valeurActuelle : '';
  }
}

function initSidebarBadges(token) {
  if (sidebarBadgesInitialized) return;
  sidebarBadgesInitialized = true;
  // TODO legacy saison — flag enCoursDeRestauration, peut être retire apres validation
  let enCoursDeRestauration = false;

  // Inclure les outliers
  const checkOutliers = document.getElementById('checkAberrantes');
  if (checkOutliers) {
    checkOutliers.addEventListener('change', () => {
      if (checkOutliers.checked) {
        const dateFrom = document.getElementById('dateFrom').value;
        const dateTo = document.getElementById('dateTo').value;

        // Bloquer si pas de période sélectionnée
        if (!dateFrom || !dateTo) {
          showToast('Veuillez sélectionner une période');
          checkOutliers.checked = false; // Décocher automatiquement
          return;
        }

        ajouterBadge('Inclure les outliers', () => {
          checkOutliers.checked = false;
        }, 'checkAberrantes');
      } else {
        supprimerBadgeById('checkAberrantes');
      }
      mettreAJourBoutonAppliquer();
    });
  }

  // Selects
  ['selectSexe', 'selectGestionnaire', 'selectClasseAge', 'selectPopulation', 'selectProgrammation'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      supprimerBadgeById(id);
      if (el.value) {
        const label = el.options[el.selectedIndex]?.text || el.tomselect?.options[el.value]?.text || el.value;
        ajouterBadge(label, () => {
          if (el.tomselect) {
            el.tomselect.clear(true);
            el.tomselect.setValue('', true);
          } else {
            el.value = '';
          }
          decocherCochesAutomatiques();
          mettreAJourListeParDate();
          mettreAJourBoutonAppliquer();
        }, id);
      }
      decocherCochesAutomatiques();
      mettreAJourListeParDate();
      mettreAJourBoutonAppliquer();
    });
  });

  // Option B — classes d age dynamiques selon sexe
  document.getElementById('selectSexe')?.addEventListener('change', () => {
    const sexe = document.getElementById('selectSexe')?.tomselect
      ? document.getElementById('selectSexe').tomselect.getValue()
      : document.getElementById('selectSexe')?.value;
    peuplerSelectClasseAge(sexe || 'TOUS');
    // Remettre a zero le filtre classe age si la classe n existe plus
    supprimerBadgeById('selectClasseAge');
    mettreAJourListeParDate();
    mettreAJourBoutonAppliquer();
  });

  const btnResetBadges = document.getElementById('btnReinitialiser');
  if (btnResetBadges) btnResetBadges.addEventListener('click', () => reinitialiserTousLesFiltres());

  const btnResetFooter = document.getElementById('btnResetFilters');
  if (btnResetFooter) btnResetFooter.addEventListener('click', () => reinitialiserTousLesFiltres());

  const btnApply = document.getElementById('btnApplyFilters');
  if (btnApply) {
    btnApply.addEventListener('click', () => applyFilters(token));
  }

  document.querySelectorAll('input[name="modeCouleur"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
      const features = window._getGpsFeatures?.() || [];
      if (features.length > 0) {
        const locations = features
          .filter(f => f.get('ani_id'))
          .map(f => f.getProperties());
        const isTrajectoire = document.getElementById('btnTrajectoire')?.classList.contains('active');
        clearMapPoints();
        renderPoints(locations, true, isTrajectoire, modeCouleur);
        if (isTrajectoire) renderTrajectoire(locations, modeCouleur);
      }
      mettreAJourLegende();
    });
  });

  // Toggle affichage légende
  document.getElementById('btnLegende')?.addEventListener('click', function () {
    const contenu = document.getElementById('legendeContenu');
    if (!contenu) return;
    const isVisible = contenu.style.display !== 'none';
    contenu.style.display = isVisible ? 'none' : 'block';
    this.textContent = isVisible ? '+' : '−';
  });

  // Fermeture du panneau
  document.getElementById('panneauClose')?.addEventListener('click', () => {
    const panneau = document.getElementById('panneau-attributaire');
    if (panneau) {
      panneau.style.display = 'none';
      panneau.classList.remove('collapsed');
      const icon = document.querySelector('#panneauToggle .toggle-icon');
      if (icon) icon.textContent = '›';
    }
  });

  // Basculement (Masquer/Afficher) du panneau droit
  document.getElementById('panneauToggle')?.addEventListener('click', function () {
    const panneau = document.getElementById('panneau-attributaire');
    const icon = this.querySelector('.toggle-icon');
    if (!panneau) return;

    panneau.classList.toggle('collapsed');

    updateMapSize();

    if (panneau.classList.contains('collapsed')) {
      if (icon) icon.textContent = '‹'; // pointe vers la gauche pour déplier
    } else {
      if (icon) icon.textContent = '›'; // pointe vers la droite pour replier
    }
  });

  document.getElementById('tabDonnees')?.addEventListener('click', () => {
    document.getElementById('tabDonnees').classList.add('active');
    document.getElementById('tabIndividus').classList.remove('active');
  });

  document.getElementById('tabIndividus')?.addEventListener('click', () => {
    document.getElementById('tabIndividus').classList.add('active');
    document.getElementById('tabDonnees').classList.remove('active');
  });

}

export function showMapLoading() {
  const el = document.getElementById('mapLoading');
  if (el) el.style.display = 'flex';
}

export function hideMapLoading() {
  const el = document.getElementById('mapLoading');
  if (el) el.style.display = 'none';
}

export function lockSidebar() {
  document.querySelectorAll('.sidebar-input, .sidebar-select, .checkbox-label input:not(#inputNDernieres):not(#nModeToutes):not(#nModeLimite), input[name="statutCollier"], #checkSuivis, #searchIndividu, #btnApplyFilters, #btnResetFilters, #btnReinitialiser').forEach(el => {
    el.disabled = true;
    if (el.tomselect) el.tomselect.disable();
  });
  // Verrouillage du contenu des sections et du bouton, sans toucher aux titres (summary)
  document.querySelectorAll('.accordion .details-content, #btnApplyFilters').forEach(el => {
    el.classList.add('section-locked');
  });
}

export function unlockSidebar() {
  document.querySelectorAll('.sidebar-input, .sidebar-select, .checkbox-label input:not(#inputNDernieres):not(#nModeToutes):not(#nModeLimite), input[name="statutCollier"], #checkSuivis, #searchIndividu, #btnApplyFilters, #btnResetFilters, #btnReinitialiser').forEach(el => {
    el.disabled = false;
    if (el.tomselect) el.tomselect.enable();
  });
  // Déverrouillage du contenu et du bouton
  document.querySelectorAll('.accordion .details-content, #btnApplyFilters').forEach(el => {
    el.classList.remove('section-locked');
  });
}

function initBasemapSelector() {
  if (basemapInitialized) return;
  basemapInitialized = true;

  const basemapSelector = document.getElementById('basemapSelector');
  const basemapOptions = document.getElementById('basemapOptions');
  const btnFondsCarte = document.getElementById('btnFondsCarte');

  // Generer dynamiquement les cartes depuis BASEMAPS_CONFIG
  if (basemapOptions) {
    basemapOptions.innerHTML = '';
    BASEMAPS_CONFIG.forEach((bm, index) => {
      const card = document.createElement('div');
      card.className = `basemap-card${bm.visible ? ' active' : ''}`;
      card.dataset.index = index;
      card.innerHTML = `
        <div class="basemap-card-img">
          <img src='${bm.apercu}' alt='${bm.nom}' onerror="this.style.display='none'">
        </div>
        <span>${bm.nom}</span>
      `;
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.basemap-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        switchBasemap(index);
      });
      basemapOptions.appendChild(card);
    });
  }

  btnFondsCarte?.addEventListener('click', (e) => {
    e.stopPropagation();
    basemapSelector?.classList.toggle('open');
    basemapOptions?.classList.toggle('open', basemapSelector?.classList.contains('open'));
    btnFondsCarte.classList.toggle('active', basemapSelector?.classList.contains('open'));
  });

  // Gestion du défilement avec les boutons
  const scrollLeftBtn = document.getElementById('basemapScrollLeft');
  const scrollRightBtn = document.getElementById('basemapScrollRight');
  
  function updateScrollButtons() {
    if (!basemapOptions || !scrollLeftBtn || !scrollRightBtn) return;
    const scrollLeft = basemapOptions.scrollLeft;
    const maxScroll = basemapOptions.scrollWidth - basemapOptions.clientWidth;
    
    scrollLeftBtn.disabled = (scrollLeft <= 1);
    scrollRightBtn.disabled = (scrollLeft >= maxScroll - 1);
  }

  if (scrollLeftBtn && scrollRightBtn && basemapOptions) {
    scrollLeftBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      basemapOptions.scrollBy({ left: -350, behavior: 'smooth' });
    });
    scrollRightBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      basemapOptions.scrollBy({ left: 350, behavior: 'smooth' });
    });

    basemapOptions.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);
    
    // Initialiser les boutons après le chargement des vignettes
    setTimeout(updateScrollButtons, 100);
  }

  document.addEventListener('click', (e) => {
    if (basemapSelector && !basemapSelector.contains(e.target) && !btnFondsCarte?.contains(e.target)) {
      basemapOptions?.classList.remove('open');
      basemapSelector?.classList.remove('open');
      btnFondsCarte?.classList.remove('active');
    }
  });
}

function initToolbarCarte() {
  if (toolbarCarteInitialized) return;
  toolbarCarteInitialized = true;

  document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const headerBottom = document.querySelector('.header-bottom');
    const btn = document.getElementById('btnToggleSidebar');

    sidebar.classList.toggle('collapsed');
    const collapsed = sidebar.classList.contains('collapsed');

    btn.classList.toggle('active', !collapsed);

    if (collapsed) {
      if (headerBottom) headerBottom.style.marginLeft = '0';
    } else {
      if (headerBottom) headerBottom.style.marginLeft = '330px';
    }
    updateMapSize();
  });

  document.getElementById('btnZoomIn')?.addEventListener('click', () => {
    const view = getMap().getView();
    view.animate({ zoom: view.getZoom() + 1, duration: 200 });
  });

  document.getElementById('btnZoomOut')?.addEventListener('click', () => {
    const view = getMap().getView();
    view.animate({ zoom: view.getZoom() - 1, duration: 200 });
  });

  document.getElementById('btnZoomReset')?.addEventListener('click', () => {
    const extent = getGpsSource().getExtent();
    if (extent && !ol.extent.isEmpty(extent)) {
      getMap().getView().fit(extent, {
        padding: [80, 80, 80, 80],
        maxZoom: 13,
        duration: 400
      });
    } else {
      getMap().getView().animate({
        center: ol.proj.fromLonLat([0.2, 42.9]),
        zoom: 9,
        duration: 400
      });
    }
  });

  document.getElementById('btnFiltreSpatial')?.addEventListener('click', () => {
    showToast('Filtre spatial/fonctionnalité à venir');
  });
}

export function supprimerBadgeById(id) {
  document.querySelectorAll(`.filtre-badge[data-id="${id}"]`).forEach(badge => {
    badge.remove();
  });
  mettreAJourFiltresActifs();
}

/**
 * SYSTÈME DE BADGES
 * Affiche un badge amovible pour chaque filtre actif.
 */
export function ajouterBadge(label, onRemove, id = null, onClick = null) {
  if (id) {
    const existing = document.querySelector(`#badgesFiltres .filtre-badge[data-id='${id}']`);
    if (existing) existing.remove();
  }
  const badge = document.createElement('div');
  badge.className = 'filtre-badge';
  if (id) badge.dataset.id = id;
  const texteNode = document.createTextNode(label + ' ');
  const btn = document.createElement('button');
  btn.textContent = '×';
  badge.appendChild(texteNode);
  badge.appendChild(btn);

  if (onClick) {
    badge.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      onClick();
    });
    badge.style.cursor = 'pointer';
  }

  btn.addEventListener('click', () => {
    badge.remove();
    onRemove();
    mettreAJourFiltresActifs();
  });

  document.getElementById('badgesFiltres').appendChild(badge);
  mettreAJourFiltresActifs();
}

export function mettreAJourFiltresActifs() {
  const zone = document.getElementById('filtresActifs');
  const badges = document.getElementById('badgesFiltres');
  const count = badges ? badges.children.length : 0;
  if (zone) zone.style.display = count > 0 ? 'block' : 'none';

  const filterCountEl = document.querySelector('.filter-count');
  if (filterCountEl) {
    filterCountEl.textContent = `${count} filtre${count > 1 ? 's' : ''} actif${count > 1 ? 's' : ''}`;
  }
  mettreAJourBoutonAppliquer();
}

export function mettreAJourSelectN() {
  const inputN = document.getElementById('inputNDernieres');
  const nModeToutes = document.getElementById('nModeToutes');
  const nModeLimite = document.getElementById('nModeLimite');
  const labelN = document.getElementById('labelNDernieres');
  if (!inputN || !labelN) return;

  const filtreActif =
    !!document.getElementById('selectSexe')?.value ||
    !!document.getElementById('selectGestionnaire')?.value ||
    !!document.getElementById('selectPopulation')?.value ||
    !!document.getElementById('selectClasseAge')?.value ||
    !!document.getElementById('selectProgrammation')?.value ||
    !!(document.getElementById('selectAnnee')?.tomselect
      ? Object.values(document.getElementById('selectAnnee').tomselect.items).filter(Boolean).length > 0
      : document.getElementById('selectAnnee')?.value) ||
    !!(document.getElementById('dateFrom')?.value) ||
    !!(document.getElementById('dateTo')?.value) ||
    !!(document.getElementById('saisonFrom')?.value) ||
    !!(document.getElementById('saisonTo')?.value) ||
    Array.from(document.querySelectorAll('#listeIndividus input:checked'))
      .filter(cb => cb.closest('label')?.dataset.cocheAuto !== 'true')
      .length > 0;

  if (filtreActif && !_nEstToutes && !_nModeManuel) {
    // Auto-switch uniquement si l utilisateur n a pas choisi manuellement
    _nEstToutes = true;
    if (nModeToutes) nModeToutes.checked = true;
    if (nModeLimite) nModeLimite.checked = false;
    mettreAJourLabelN();
  } else if (!filtreActif && !_nEstToutes && !_nModeManuel) {
    // Pas de filtre et utilisateur n a pas choisi Toutes — mode Limite
    if (nModeLimite) nModeLimite.checked = true;
    if (nModeToutes) nModeToutes.checked = false;
    inputN.disabled = false;
    const isTrajectoire = document.getElementById('btnTrajectoire')?.classList.contains('active');
    const derniere = isTrajectoire ? _dernierNTrajectoire : _dernierNPositions;
    if (derniere && derniere !== 'toutes') {
      inputN.value = derniere;
    }
    mettreAJourLabelN();
  }
  // Si _nModeManuel = true → ne rien changer, respecter le choix utilisateur
}

export function mettreAJourBoutonAppliquer() {
  const btn = document.getElementById('btnApplyFilters');
  if (!btn) return;
  // Bouton toujours actif — la logique de verrouillage est geree uniquement
  // par lockSidebar() pendant les chargements
  btn.disabled = false;
  btn.classList.remove('btn-disabled');
}

let isResetting = false;

async function reinitialiserTousLesFiltres() {
  if (isResetting) return;
  isResetting = true;
  viderCache();

  showMapLoading();
  lockSidebar();

  try {
    // 2. Supprimer tous les badges
    document.querySelectorAll('.filtre-badge').forEach(badge => badge.remove());
    ajouterBadge('Individus en cours de suivi', () => {
      const cb = document.getElementById('checkSuivis');
      if (cb) cb.checked = false;
      mettreAJourListeParDate();
    }, 'checkSuivis');

    // 3. Mode Positions par défaut
    const btnPos = document.getElementById('btnPositions');
    const btnTraj = document.getElementById('btnTrajectoire');
    if (btnPos && btnTraj) {
      btnPos.classList.add('active');
      btnTraj.classList.remove('active');
      clearTrajectoire();
    }

    // 4. Recherche textuelle
    const searchIndividu = document.getElementById('searchIndividu');
    if (searchIndividu) searchIndividu.value = '';

    // 6. Dates vidées SANS dispatcher change (pour éviter les effets de bord)
    ['dateFrom', 'dateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // 7. Tous les selects — valeur native + TomSelect
    ['selectSexe', 'selectGestionnaire', 'selectTranslocation', 'selectClasseAge',
     'selectPopulation', 'selectProgrammation'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.value = '';
        if (el.tomselect) {
          el.tomselect.clear(true);
          el.tomselect.setValue('', true);
        }
      }
    });
    peuplerSelectClasseAge('TOUS');
    // selectAnnee — mode multiple : clear() suffit, pas de setValue('')
    const selectAnneeReinit = document.getElementById('selectAnnee');
    if (selectAnneeReinit) {
      if (selectAnneeReinit.tomselect) {
        selectAnneeReinit.tomselect.clear(true);
      } else {
        selectAnneeReinit.value = '';
      }
    }

    // 8. Checkboxes
    const checkOutliers = document.getElementById('checkAberrantes');
    if (checkOutliers) checkOutliers.checked = false;
    const checkSuivis = document.getElementById('checkSuivis');
    if (checkSuivis) checkSuivis.checked = true;

    _nModeManuel = false;
    _nEstToutes = false;
    _dernierNPositions = '5';
    _dernierNTrajectoire = '25';
    adapterSelectNPourMode('positions');

    const inputNReinit = document.getElementById('inputNDernieres');
    const nModeLimiteReinit = document.getElementById('nModeLimite');
    const nModeToutesReinit = document.getElementById('nModeToutes');
    if (inputNReinit) {
      inputNReinit.value = '5';
      inputNReinit.disabled = false;
      delete inputNReinit.dataset.modifieEnPositions;
      delete inputNReinit.dataset.modifieEnTrajectoire;
      delete inputNReinit.dataset.valeurManuelle;
      delete inputNReinit.dataset.modifieParUtilisateur;
    }
    if (nModeLimiteReinit) { nModeLimiteReinit.checked = true; nModeLimiteReinit.disabled = false; }
    if (nModeToutesReinit) { nModeToutesReinit.checked = false; nModeToutesReinit.disabled = false; }
    const labelNReinit = document.getElementById('labelNDernieres');
    if (labelNReinit) labelNReinit.textContent = 'dernières positions';
    mettreAJourBadgeNPositions();

    // 9. Individus
    document.querySelectorAll('#listeIndividus input').forEach(cb => {
      cb.checked = false;
      const label = cb.closest('label');
      if (!label) return;
      label.dataset.masqueParDate = 'false';
      label.dataset.cocheAuto = 'false';
      label.style.display = label.dataset.sansGeom === 'true' ? 'none' : 'flex';
    });

    // Reset filtres temporels
    const df = document.getElementById('dateFrom');
    const dt = document.getElementById('dateTo');
    const sf = document.getElementById('saisonFrom');
    const st = document.getElementById('saisonTo');
    if (df) { df.value = ''; df._flatpickr?.clear(); }
    if (dt) { dt.value = ''; dt._flatpickr?.clear(); }
    if (sf) { sf.value = ''; sf._flatpickr?.clear(); }
    if (st) { st.value = ''; st._flatpickr?.clear(); }
    document.querySelectorAll('input[name="saisonRadio"]').forEach(r => r.checked = false);
    supprimerBadgeById('periode-from');
    supprimerBadgeById('periode-to');
    supprimerBadgeById('saisonnalite');
    gererExclusiviteTemporel(null);

    // 10. Mettre à jour compteur filtres
    mettreAJourFiltresActifs();

    // 11. Recharger la carte
    if (currentToken) {
      try {
        const locationsAll = await fetchAllLastLocations(currentToken);
        const idsActifsReinit = Array.from(
          new Set(locationsAll.filter(l => l.cor_date_fin === null).map(l => String(l.ani_id)))
        );
        setActiveIds(new Set(
          locationsAll.filter(l => l.cor_date_fin === null).map(l => l.ani_id)
        ));
        const n = parseInt(document.getElementById('inputNDernieres')?.value) || 5;
        const locationsN = await fetchNDernieresLocalisations(currentToken, idsActifsReinit, n);
        const locationsSuivies = enrichirLocations(locationsN);
        clearMapPoints();
        clearTrajectoire();
        const count = renderPoints(locationsSuivies, false);
        mettreAJourPanneau(locationsSuivies);
        mettreAJourIndividus(animals.filter(a => locationsSuivies.some(l => String(l.ani_id) === String(a.ani_id))));
        const posEl = document.getElementById('positionsCount');
        if (posEl) posEl.textContent = count;
        mettreAJourLegende();
        setLabelDatetime('Date de localisation');
        filtrerListeIndividus();

        setTimeout(() => {
          const extent = getGpsSource().getExtent();
          if (extent && !ol.extent.isEmpty(extent)) {
            getMap().getView().fit(extent, {
              padding: [80, 80, 80, 80],
              maxZoom: 13,
              duration: 600
            });
          }
        }, 300);
      } catch (err) {
        console.error('Erreur reset map:', err);
      }
    }
  } finally {
    hideMapLoading();
    unlockSidebar();
    mettreAJourBoutonAppliquer();
    isResetting = false;
  }
}

document.getElementById('sidebarToggle').addEventListener('click', function () {
  const sidebar = document.getElementById('sidebar');
  const headerBottom = document.querySelector('.header-bottom');
  const icon = this.querySelector('.toggle-icon');

  sidebar.classList.toggle('collapsed');

  updateMapSize();

  if (sidebar.classList.contains('collapsed')) {
    if (icon) icon.textContent = '›';
    if (headerBottom) headerBottom.style.marginLeft = '0';
  } else {
    if (icon) icon.textContent = '‹';
    if (headerBottom) headerBottom.style.marginLeft = '330px';
  }
});

window.addEventListener('resize', () => {
  updateMapSize();
});

let loginEnCours = false;

let inactivityTimer = null;
const INACTIVITY_DELAY = 30 * 60 * 1000;

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    deconnecter();
  }, INACTIVITY_DELAY);
}

async function deconnecter() {
  clearTimeout(inactivityTimer);
  sessionStorage.removeItem('bqt_token');

  // Afficher login immédiatement
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.style.display = 'flex';
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('loginError').textContent = '';

  const userChip = document.getElementById('userChip');
  if (userChip) userChip.style.display = 'none';
  const menu = document.getElementById('sessionMenu');
  if (menu) menu.style.display = 'none';

  clearMapPoints();
  clearTrajectoire();

  setCurrentToken(null);
  viderCache();

  try {
    // Réinitialiser sans recharger depuis l'API (token null)
    await reinitialiserTousLesFiltres();

    document.querySelectorAll('details').forEach(d => d.removeAttribute('open'));
    const detailsTemporel = document.getElementById('detailsTemporel');
    if (detailsTemporel) detailsTemporel.setAttribute('open', '');

    const sidebarRight = document.getElementById('sidebarRight');
    const mapScreen = document.getElementById('mapScreen');
    if (sidebarRight) {
      sidebarRight.classList.remove('visible');
      sidebarRight.style.width = '';
    }
    if (mapScreen) {
      mapScreen.style.right = '';
      mapScreen.classList.remove('panel-open');
    }
    const toggleIcon = document.querySelector('#sidebarRightToggle .toggle-icon');
    if (toggleIcon) toggleIcon.textContent = '‹';
    setPanneauFermeManuel(false);
  } finally {
    loginEnCours = false;
  }
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

const tokenSauvegarde = sessionStorage.getItem('bqt_token');
if (tokenSauvegarde) {
  startApp(tokenSauvegarde).catch(() => deconnecter());
}

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
    await startApp(token);
  } catch (err) {
    errorEl.textContent = 'Identifiants incorrects ou serveur inaccessible.';
    console.error(err);
    loginEnCours = false;
  }
});

/**
 * MISE À JOUR DE LA LÉGENDE
 * Adapte la légende selon le mode d'affichage et de coloration.
 */
export function mettreAJourLegende(modeForce = null) {
  const contenu = document.getElementById('legendeContenu');
  if (!contenu) return;

  // Utiliser modeForce si fourni, sinon lire le DOM comme avant
  const isTrajectoire = modeForce !== null
    ? modeForce === 'trajectoire'
    : document.getElementById('btnTrajectoire')?.classList.contains('active');
  const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';

  contenu.classList.toggle('legende-mode-trajectoire', isTrajectoire);
  contenu.classList.toggle('legende-mode-positions', !isTrajectoire);

  const titreModeEl = document.getElementById('legendeModeTitre');
  if (titreModeEl) titreModeEl.textContent = isTrajectoire ? 'Trajectoire' : 'Positions';

  const sectionCouleur = document.getElementById('legendeCouleur');
  const titreCouleur = document.getElementById('legendeCouleurTitre');

  if (modeCouleur === 'individu') {
    // Retire liste existante si present
    document.getElementById('legendeIndividusList')?.remove();
    sectionCouleur?.classList.remove('visible');

    const couleursMap = getCouleursIndividus();
    if (couleursMap.size === 0) return;

    const liste = document.createElement('div');
    liste.id = 'legendeIndividusList';

    const animalsData = getAnimals();

    couleursMap.forEach((couleur, aniId) => {
      const animal = animalsData.find(a => String(a.ani_id) === String(aniId));
      const nom = animal?.ani_nom || `ID ${aniId}`;

      const ligne = document.createElement('div');
      ligne.className = 'legende-individu-ligne';

      const idx = getIndicesIndividus().get(aniId) ?? 0;
      const contour = getContourParIndex(idx);
      const contourCss = `rgb(${contour.strokeR}, ${contour.strokeG}, ${contour.strokeB})`;

      const pastille = document.createElement('span');
      pastille.className = 'legende-individu-pastille';
      pastille.style.background = couleur;
      pastille.style.border = `2px solid ${contourCss}`;
      pastille.style.width = '12px';
      pastille.style.height = '12px';

      const label = document.createElement('span');
      label.className = 'legende-individu-label';
      label.textContent = nom;

      ligne.appendChild(pastille);
      ligne.appendChild(label);
      liste.appendChild(ligne);
    });

    contenu.appendChild(liste);

  } else if (modeCouleur === 'sexe') {
    document.getElementById('legendeIndividusList')?.remove();
    sectionCouleur?.classList.add('visible');
    if (titreCouleur) titreCouleur.textContent = 'Sexe';
    const pastille1 = document.getElementById('legendeCouleurPastille1');
    const label1 = document.getElementById('legendeCouleurLabel1');
    const pastille2 = document.getElementById('legendeCouleurPastille2');
    const label2 = document.getElementById('legendeCouleurLabel2');
    if (pastille1) pastille1.className = 'legende-pastille legende-pastille-male';
    if (label1) label1.textContent = 'Mâle';
    if (pastille2) pastille2.className = 'legende-pastille legende-pastille-femelle';
    if (label2) label2.textContent = 'Femelle';

  } else if (modeCouleur === 'gestionnaire') {
    document.getElementById('legendeIndividusList')?.remove();
    sectionCouleur?.classList.add('visible');
    if (titreCouleur) titreCouleur.textContent = 'Gestionnaire';
    const pastille1 = document.getElementById('legendeCouleurPastille1');
    const label1 = document.getElementById('legendeCouleurLabel1');
    const pastille2 = document.getElementById('legendeCouleurPastille2');
    const label2 = document.getElementById('legendeCouleurLabel2');
    if (pastille1) pastille1.className = 'legende-pastille legende-pastille-pnp';
    if (label1) label1.textContent = 'PNP';
    if (pastille2) pastille2.className = 'legende-pastille legende-pastille-pnrpa';
    if (label2) label2.textContent = 'PNRPA';
  }
}
// Calcule le nombre de localisations par jour à partir de la fréquence d'acquisition
function calculerLocsParJour(frequence) {
  const heures = parseInt(
    String(frequence).replace('h', ''),
    10
  );

  if (!heures || heures <= 0) {
    return null;
  }

  return Math.round(24 / heures);
}

async function chargerProgrammationsGPS(token) {
  const select = document.getElementById('selectProgrammation');
  if (!select) return;

  try {
    const programmations = await fetchBibliothequeProgrammations(token);

    if (select.tomselect) {
      select.tomselect.clearOptions();
      select.tomselect.addOption({ value: '', text: 'Toutes' });
      programmations.forEach(prog => {
        const locsParJour = calculerLocsParJour(prog.prog_frequence);
        const duree = prog.prog_duree_acquisition ?? '?';
        select.tomselect.addOption({
          value: String(prog.prog_id),
          text: `${locsParJour} locs/j (${duree}s)`
        });
      });
      select.tomselect.refreshOptions(false);
    } else {
      select.innerHTML = '';
      const optDefault = document.createElement('option');
      optDefault.value = '';
      optDefault.textContent = 'Toutes';
      select.appendChild(optDefault);

      programmations.forEach(prog => {
        const opt = document.createElement('option');
        const locsParJour = calculerLocsParJour(prog.prog_frequence);
        const duree = prog.prog_duree_acquisition ?? '?';
        opt.value = prog.prog_id;
        opt.textContent = `${locsParJour} locs/j (${duree}s)`;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Erreur chargement programmations GPS:', err);
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Indisponible';
    select.appendChild(opt);
  }
}

function showGlobalLoading() {
  showMapLoading();
}

function hideGlobalLoading() {
  hideMapLoading();
}

export function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}