import { login, fetchAnimals, fetchLocations, fetchLastLocationsParPeriode, fetchAnimalIdsParPeriode, fetchProgrammations, fetchAllLastLocations, viderCache, fetchPopulations, fetchGestionnaires,fetchBibliothequeProgrammations } from './api.js';
import { ZOOM_POINT_SINGLE, ZOOM_FILTER_SINGLE, ZOOM_FILTER_MULTI, ZOOM_TRAJECTOIRE_SINGLE, ZOOM_TRAJECTOIRE_MULTI, ZOOM_MAX_MANUAL, ZOOM_MIN_MANUAL, ROLE_LABELS, ROLE_INITIALES } from './config.js';
import { initMap, renderPoints, clearMap, clearMapPoints, updateMapSize, switchBasemap, getMap, getGpsSource, renderTrajectoire, clearTrajectoire, highlightPoint, zoomToPoint } from './map.js';
import { initPanneau, mettreAJourPanneau, setLabelDatetime, ouvrirPanneauSiNecessaire, setPanneauFermeManuel, mettreAJourIndividus, scrollToAniId, scrollToAniIdIndividus, setAniIdSelectionne } from './panel.js';
import { applyFilters, filtrerListeIndividus, mettreAJourListeParDate, getClasse, decocherCochesAutomatiques } from './filters.js';

/**
 * VARIABLES GLOBALES
 * 'animals' stockera la liste complète des individus pour le filtrage
 * 'anneeActuelle' sert de référence pour calculer l'âge des animaux
 */

let animals = [];
let activeIds = new Set();
let currentToken = null;
const anneeActuelle = new Date().getFullYear();
const programmationsMap = new Map(); // ani_id → prog_id

let sidebarRightInitialized = false;
let sidebarBadgesInitialized = false;
let basemapInitialized = false;
let mapListenersInitialized = false;
let mapInitialized = false;

export function getAnimals() { return animals; }
export function getActiveIds() { return activeIds; }
export function getCurrentToken() { return currentToken; }
export function getProgrammationsMap() { return programmationsMap; }

export function setAnimals(val) { animals = val; }
export function setActiveIds(val) { activeIds = val; }
export function setCurrentToken(val) { currentToken = val; }

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
  setTimeout(() => updateMapSize(), 310);
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
      sidebarRight.style.transition = 'right 0.3s ease, width 0.3s ease';
      sidebarRight.style.width = 'var(--panel-width)';
      sidebarRight.classList.remove('visible');
      const mapScreen = document.getElementById('mapScreen');
      if (mapScreen) {
        mapScreen.style.right = '';
        mapScreen.style.transition = '';
        mapScreen.classList.remove('panel-open');
      }
      const icon = sidebarRightToggle?.querySelector('.toggle-icon');
      if (icon) icon.textContent = '›';
      setPanneauFermeManuel(true);
      setTimeout(() => updateMapSize(), 310);
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
    window._getGpsFeatures = () => getGpsSource().getFeatures();
    window._ZOOM_POINT_SINGLE = ZOOM_POINT_SINGLE;
    window._afficherPositionsIndividu = (aniId) => {
      const features = getGpsSource().getFeatures();
      const feature = features.find(f => String(f.get('ani_id')) === String(aniId));
      if (!feature) return;
      const geom = feature.getGeometry();
      if (!geom) return;
      const coord = geom.getCoordinates();
      getMap().getView().animate({ center: coord, zoom: ZOOM_POINT_SINGLE, duration: 400 });
    };

    // Récupération des données depuis l'API via le module api.js
    setAnimals(await fetchAnimals(token));
    setCurrentToken(token);
    sessionStorage.setItem('bqt_token', token);

    const [populations, gestionnaires] = await Promise.all([
      fetchPopulations(token),
      fetchGestionnaires(token)
    ]);
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

    const programmations = await fetchProgrammations(token);
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
    // mettreAJourIndividus(animals);

    // Une seule requête pour tout
    const locations = await fetchAllLastLocations(currentToken);
    const locationsEnrichies = enrichirLocations(locations);

    // Calculer activeIds directement depuis les données - cor_date_fin null = actif
    setActiveIds(new Set(
      locations.filter(l => l.cor_date_fin === null).map(l => l.ani_id)
    ));

    const locationsSuivies = locationsEnrichies.filter(l => l.cor_date_fin === null);

    const count = renderPoints(locationsSuivies);
    mettreAJourPanneau(locationsSuivies);
    const posEl = document.getElementById('positionsCount');
    if (posEl) posEl.textContent = count;
    mettreAJourIndividus(enrichirAnimauxAvecPositions(locationsSuivies));
    mettreAJourLegende();
    setLabelDatetime('Dernière position');

    // Peupler le select d'années depuis les positions disponibles
    const annees = [...new Set(
      locationsEnrichies
        .map(l => l.loc_datetime_local || l.loc_date_local)
        .filter(Boolean)
        .map(d => new Date(d).getFullYear())
        .filter(y => !isNaN(y))
    )].sort((a, b) => b - a);

    const selectAnnee = document.getElementById('selectAnnee');
    if (selectAnnee) {
      if (selectAnnee.tomselect) {
        selectAnnee.tomselect.clearOptions();
        selectAnnee.tomselect.addOption({ value: '', text: 'Toutes les années' });
        annees.forEach(annee => selectAnnee.tomselect.addOption({ value: String(annee), text: String(annee) }));
        selectAnnee.tomselect.refreshOptions(false);
      } else {
        while (selectAnnee.options.length > 1) selectAnnee.remove(1);
        annees.forEach(annee => {
          const opt = document.createElement('option');
          opt.value = annee;
          opt.textContent = annee;
          selectAnnee.appendChild(opt);
        });
      }
    }
    window._anneeOptions = annees.map(String);

    // Identifier tous les animaux qui ont au moins une géométrie
    const idsAvecGeom = new Set(locations.map(l => String(l.ani_id)));

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

          // Calcul de la classe d'âge et stockage dans un attribut de données (dataset)
          // Utilisé plus tard par la fonction filtrerIndividusParClasse
          const age = anneeActuelle - (ani.ani_annee_naissance || anneeActuelle);
          label.dataset.classe = getClasse(age);
          label.dataset.sexe = ani.ani_sexe || '';
          label.dataset.gestionnaire = ani.ani_gestionnaire || '';
          label.dataset.population = ani.ani_pop_rattach || '';
          label.dataset.masqueParDate = 'false';

          const dernierePos = locationsEnrichies.find(l => String(l.ani_id) === String(ani.ani_id));
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
            label.dataset.cocheAuto = 'false';
            if (checkbox.checked) {
              ajouterBadge(ani.ani_nom, () => {
                checkbox.checked = false;
                mettreAJourSelectN();
              }, `ani-${ani.ani_id}`);
            } else {
              supprimerBadgeById(`ani-${ani.ani_id}`);
            }
            mettreAJourSelectN();
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
      });
    }

    // Listener sur le select N dernières localisations
    const inputN = document.getElementById('inputNDernieres');
    const labelN = document.getElementById('labelNDernieres');

    function mettreAJourLabelN() {
      if (!inputN || !labelN) return;
      if (inputN.disabled) {
        labelN.textContent = 'les positions';
        return;
      }
      const val = inputN.value;
      if (val === 'toutes') {
        labelN.textContent = 'les positions';
      } else {
        const n = parseInt(val) || 1;
        labelN.textContent = n === 1 ? 'dernière position' : 'dernières positions';
      }
    }

    if (inputN) {
      inputN.addEventListener('change', () => {
        inputN.dataset.valeurManuelle = inputN.value;
        mettreAJourLabelN();
        decocherCochesAutomatiques();
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

    // Initialisation de la logique des badges pour tous les autres filtres de la sidebar
    initSidebarBadges(token);
    // Initialisation du sélecteur de fond de carte
    initBasemapSelector();

    // TomSelect — initialisation au premier toggle de chaque details
    // Les selects natifs sont cachés via CSS (select.sidebar-select { display: none })
    // TomSelect injecte son propre widget au premier toggle
    // TomSelect — initialisation au premier toggle de chaque details (ou immédiatement si déjà ouvert)
    // Les selects natifs sont cachés via CSS (select.sidebar-select { display: none })
    // TomSelect injecte son propre widget
    ['selectAnnee', 'selectPopulation', 'selectSexe', 'selectClasseAge', 'selectGestionnaire', 'selectTranslocation', 'selectProgrammation'].forEach(id => {
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

    // Listeners sur dateFrom et dateTo (masque automatique et validation sur blur)
    ['dateFrom', 'dateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      el.addEventListener('input', () => {
        let val = el.value.replace(/\D/g, '');
        if (val.length >= 3) val = val.slice(0, 2) + '/' + val.slice(2, 4);
        el.value = val;

        if (/^\d{2}\/\d{2}$/.test(el.value)) {
          mettreAJourListeParDate();
        }
      });

      el.addEventListener('blur', () => {
        if (el.value && !/^\d{2}\/\d{2}$/.test(el.value)) {
          el.value = ''; // vider si format invalide
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    if (!mapListenersInitialized) {
      mapListenersInitialized = true;

      searchIndividu?.addEventListener('input', () => {
        decocherCochesAutomatiques();
        mettreAJourListeParDate();
      });

      // Gestion du basculement entre les modes Positions et Trajectoire
      const btnPos = document.getElementById('btnPositions');
      const btnTraj = document.getElementById('btnTrajectoire');
      if (btnPos && btnTraj) {
        btnPos.addEventListener('click', () => {
          btnPos.classList.add('active');
          btnTraj.classList.remove('active');
          clearTrajectoire();
          setLabelDatetime('Dernière position');
          applyFilters(currentToken);
        });
        btnTraj.addEventListener('click', () => {
          btnTraj.classList.add('active');
          btnPos.classList.remove('active');
          setLabelDatetime('Date/Heure');
          applyFilters(currentToken);

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

function initSidebarBadges(token) {
  if (sidebarBadgesInitialized) return;
  sidebarBadgesInitialized = true;
  const SAISONS_DATES = {
    checkHiver:     { from: '01/01', to: '31/03', label: 'Hiver' },
    checkPrintemps: { from: '01/04', to: '30/06', label: 'Printemps' },
    checkEte:       { from: '01/07', to: '15/10', label: 'Été' },
    checkRut:      { from: '16/10', to: '31/12', label: 'Rut' }
  };

  const datesSaisonModifiees = {
    checkHiver: null,
    checkPrintemps: null,
    checkEte: null,
    checkRut: null
  };

  // Flag pour éviter que le listener change de dateFrom/dateTo
  // écrase datesSaisonModifiees pendant une restauration programmatique
  let enCoursDeRestauration = false;
  // Saison actuellement en édition (cible des modifications dateFrom/dateTo)
  let saisonEnEdition = null;

  function mettreAJourBadgeSaison(id, label, estModifie) {
    const badge = document.querySelector(`.filtre-badge[data-id='${id}']`);
    if (badge) {
      const btn = badge.querySelector('button');
      Array.from(badge.childNodes).forEach(node => {
        if (node !== btn) node.remove();
      });
      badge.insertBefore(document.createTextNode(label + ' '), btn);
      badge.classList.toggle('badge-modifie', estModifie);
    }
  }

  // Badges pour dateFrom et dateTo
  ['dateFrom', 'dateTo'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prefix = id === 'dateFrom' ? 'Du ' : 'Au ';

    el.addEventListener('change', () => {
      const saisonsCochees = ['checkHiver', 'checkPrintemps', 'checkEte', 'checkRut']
        .filter(sid => document.getElementById(sid)?.checked);

      if (!enCoursDeRestauration && saisonsCochees.length > 0) {
        window._saisonDatesModifiees = true;
      }

      if (!enCoursDeRestauration) {
        // Déterminer quelle saison mettre à jour :
        // - 1 saison cochée : c'est elle
        // - plusieurs cochées : c'est saisonEnEdition (dernière cochée ou cliquée)
        let cible = null;
        if (saisonsCochees.length === 1) {
          cible = saisonsCochees[0];
        } else if (saisonsCochees.length > 1 && saisonEnEdition && saisonsCochees.includes(saisonEnEdition)) {
          cible = saisonEnEdition;
        }

        if (cible) {
          const saisonCible = SAISONS_DATES[cible];
          const dateFromVal = document.getElementById('dateFrom')?.value;
          const dateToVal = document.getElementById('dateTo')?.value;
          const estModifie = dateFromVal !== saisonCible.from || dateToVal !== saisonCible.to;
          datesSaisonModifiees[cible] = estModifie ? { from: dateFromVal, to: dateToVal } : null;
          const annee = document.getElementById('selectAnnee')?.value;
          const badgeLabel = annee ? `${saisonCible.label} ${annee}` : saisonCible.label;
          mettreAJourBadgeSaison(cible, badgeLabel, estModifie);
        }
      }

      const saisonCochee = saisonsCochees.length > 0;
      supprimerBadgeById(id);
      if (el.value && /^\d{2}\/\d{2}$/.test(el.value) && !saisonCochee) {
        const annee = document.getElementById('selectAnnee')?.value;
        const affichage = annee ? `${el.value}/${annee}` : el.value;
        ajouterBadge(`${prefix}${affichage}`, () => {
          el.value = '';
          filtrerListeIndividus();
        }, id);
      }
      decocherCochesAutomatiques();
      mettreAJourListeParDate();
    });
  });

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
    });
  }

  // Selects
  ['selectSexe', 'selectGestionnaire', 'selectClasseAge', 'selectPopulation', 'selectProgrammation'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      supprimerBadgeById(id);
      if (el.value) {
        const label = el.options[el.selectedIndex].text;
        ajouterBadge(label, () => {
          el.value = '';
          mettreAJourListeParDate();
        }, id);
      }
      decocherCochesAutomatiques();
      mettreAJourListeParDate();
    });
  });


  // Select année — partagé Période/Saison
  document.getElementById('selectAnnee')?.addEventListener('change', (e) => {
    supprimerBadgeById('selectAnnee');
    if (e.target.value) {
      ajouterBadge(`Année ${e.target.value}`, () => {
        e.target.value = '';
        e.target.dispatchEvent(new Event('change'));
      }, 'selectAnnee');
    }
    // Si des dates jj/mm sont remplies, mettre à jour leurs badges
    ['dateFrom', 'dateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value) {
        el.dispatchEvent(new Event('change'));
      }
    });
    // Si une saison est cochée, mettre à jour les dates jj/mm et son badge
    ['checkHiver', 'checkPrintemps', 'checkEte', 'checkRut'].forEach(id => {
      const cb = document.getElementById(id);
      if (cb?.checked) cb.dispatchEvent(new Event('change'));
    });
    const dateFrom = document.getElementById('dateFrom')?.value;
    const dateTo = document.getElementById('dateTo')?.value;
    decocherCochesAutomatiques();
    if (dateFrom || dateTo) {
      mettreAJourListeParDate();
    } else {
      filtrerListeIndividus();
    }
  });

  // Saisons
  ['checkHiver', 'checkPrintemps', 'checkEte', 'checkRut'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const saison = SAISONS_DATES[id];

    el.addEventListener('change', () => {
      supprimerBadgeById(id);

      if (el.checked) {
        const annee = document.getElementById('selectAnnee')?.value;
        const badgeLabel = annee ? `${saison.label} ${annee}` : saison.label;
        const datesMemoisees = datesSaisonModifiees[id];

        const saisonsCochees = ['checkHiver', 'checkPrintemps', 'checkEte', 'checkRut']
          .filter(sid => document.getElementById(sid)?.checked);

        // Toujours afficher les dates de CETTE saison et la définir comme saison en édition
        const dateFromEl = document.getElementById('dateFrom');
        const dateToEl = document.getElementById('dateTo');
        const fromVal = datesMemoisees?.from || saison.from;
        const toVal = datesMemoisees?.to || saison.to;
        window._saisonDatesModifiees = false;
        if (dateFromEl) { supprimerBadgeById('dateFrom'); dateFromEl.value = fromVal; }
        if (dateToEl) { supprimerBadgeById('dateTo'); dateToEl.value = toVal; }
        saisonEnEdition = id;

        ajouterBadge(badgeLabel, () => {
          el.checked = false;
          supprimerBadgeById(id);
          datesSaisonModifiees[id] = null;
          if (saisonEnEdition === id) saisonEnEdition = null;

          const saisonsRestantes = ['checkHiver', 'checkPrintemps', 'checkEte', 'checkRut']
            .filter(sid => document.getElementById(sid)?.checked);

          if (saisonsRestantes.length >= 1) {
            const prochaineSaisonId = (saisonEnEdition === null || !saisonsRestantes.includes(saisonEnEdition))
              ? saisonsRestantes[0]
              : saisonEnEdition;
            saisonEnEdition = prochaineSaisonId;
            const saisonSuivante = SAISONS_DATES[prochaineSaisonId];
            const datesMemoiseesSuivante = datesSaisonModifiees[prochaineSaisonId];
            const fromVal = datesMemoiseesSuivante?.from || saisonSuivante.from;
            const toVal = datesMemoiseesSuivante?.to || saisonSuivante.to;
            const dateFromEl = document.getElementById('dateFrom');
            const dateToEl = document.getElementById('dateTo');
            enCoursDeRestauration = true;
            if (dateFromEl) {
              supprimerBadgeById('dateFrom');
              dateFromEl.value = fromVal;
              dateFromEl.dispatchEvent(new Event('input', { bubbles: true }));
              dateFromEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (dateToEl) {
              supprimerBadgeById('dateTo');
              dateToEl.value = toVal;
              dateToEl.dispatchEvent(new Event('input', { bubbles: true }));
              dateToEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            enCoursDeRestauration = false;
            const annee = document.getElementById('selectAnnee')?.value;
            const badgeLabelSuivant = annee ? `${saisonSuivante.label} ${annee}` : saisonSuivante.label;
            mettreAJourBadgeSaison(prochaineSaisonId, badgeLabelSuivant, !!datesMemoiseesSuivante);
          } else {
            saisonEnEdition = null;
            const dateFromEl = document.getElementById('dateFrom');
            const dateToEl = document.getElementById('dateTo');
            if (dateFromEl) { supprimerBadgeById('dateFrom'); dateFromEl.value = ''; dateFromEl.dispatchEvent(new Event('change', { bubbles: true })); }
            if (dateToEl) { supprimerBadgeById('dateTo'); dateToEl.value = ''; dateToEl.dispatchEvent(new Event('change', { bubbles: true })); }
          }

          setTimeout(() => mettreAJourListeParDate(), 100);
        }, id, () => {
          // Clic sur le badge : afficher les dates de cette saison et la marquer en édition
          saisonEnEdition = id;
          const dateFromEl = document.getElementById('dateFrom');
          const dateToEl = document.getElementById('dateTo');
          const datesMemoisees = datesSaisonModifiees[id];
          const fromVal = datesMemoisees?.from || saison.from;
          const toVal = datesMemoisees?.to || saison.to;
          if (dateFromEl) { dateFromEl.value = fromVal; }
          if (dateToEl) { dateToEl.value = toVal; }
        });
        if (datesMemoisees) {
          mettreAJourBadgeSaison(id, badgeLabel, true);
        }

      } else {
        const saisonsRestantes = ['checkHiver', 'checkPrintemps', 'checkEte', 'checkRut']
          .filter(sid => document.getElementById(sid)?.checked);

        if (saisonsRestantes.length >= 1) {
          const prochaineSaisonId = (saisonEnEdition === id || !saisonsRestantes.includes(saisonEnEdition))
            ? saisonsRestantes[0]
            : saisonEnEdition;
          saisonEnEdition = prochaineSaisonId;
          const saisonSuivante = SAISONS_DATES[prochaineSaisonId];
          const datesMemoiseesSuivante = datesSaisonModifiees[prochaineSaisonId];
          const fromVal = datesMemoiseesSuivante?.from || saisonSuivante.from;
          const toVal = datesMemoiseesSuivante?.to || saisonSuivante.to;
          const dateFromEl = document.getElementById('dateFrom');
          const dateToEl = document.getElementById('dateTo');
          enCoursDeRestauration = true;
          if (dateFromEl) {
            supprimerBadgeById('dateFrom');
            dateFromEl.value = fromVal;
            dateFromEl.dispatchEvent(new Event('input', { bubbles: true }));
            dateFromEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (dateToEl) {
            supprimerBadgeById('dateTo');
            dateToEl.value = toVal;
            dateToEl.dispatchEvent(new Event('input', { bubbles: true }));
            dateToEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
          enCoursDeRestauration = false;
          const annee = document.getElementById('selectAnnee')?.value;
          const badgeLabel = annee ? `${saisonSuivante.label} ${annee}` : saisonSuivante.label;
          mettreAJourBadgeSaison(prochaineSaisonId, badgeLabel, !!datesMemoiseesSuivante);
        } else {
          saisonEnEdition = null;
          window._saisonDatesModifiees = false;
          const dateFromEl = document.getElementById('dateFrom');
          const dateToEl = document.getElementById('dateTo');
          if (dateFromEl) { supprimerBadgeById('dateFrom'); dateFromEl.value = ''; dateFromEl.dispatchEvent(new Event('change', { bubbles: true })); }
          if (dateToEl) { supprimerBadgeById('dateTo'); dateToEl.value = ''; dateToEl.dispatchEvent(new Event('change', { bubbles: true })); }
        }
      }

      decocherCochesAutomatiques();
      mettreAJourListeParDate();
    });
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

    // Mettre à jour la taille de la carte après la transition
    setTimeout(() => {
      updateMapSize();
    }, 310);

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

  window._reinitialiserEtatSaisons = () => {
    datesSaisonModifiees.checkHiver = null;
    datesSaisonModifiees.checkPrintemps = null;
    datesSaisonModifiees.checkEte = null;
    datesSaisonModifiees.checkRut = null;
    saisonEnEdition = null;
    window._saisonDatesModifiees = false;
  };

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
  document.querySelectorAll('.sidebar-input, .sidebar-select, .checkbox-label input, input[name="statutCollier"], #checkSuivis, #searchIndividu, #btnApplyFilters, #btnResetFilters, #btnReinitialiser').forEach(el => {
    el.disabled = true;
    if (el.tomselect) el.tomselect.disable();
  });
  // Verrouillage du contenu des sections et du bouton, sans toucher aux titres (summary)
  document.querySelectorAll('.accordion .details-content, #btnApplyFilters').forEach(el => {
    el.classList.add('section-locked');
  });
}

export function unlockSidebar() {
  document.querySelectorAll('.sidebar-input, .sidebar-select, .checkbox-label input, input[name="statutCollier"], #checkSuivis, #searchIndividu, #btnApplyFilters, #btnResetFilters, #btnReinitialiser').forEach(el => {
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
  const basemaps = [
    { index: 0, nom: 'IGN SCAN25',    apercu: 'assets/img/ign.png' },
    { index: 1, nom: 'OpenTopoMap',   apercu: 'assets/img/opentopomap.png' },
    { index: 2, nom: 'OpenStreetMap', apercu: 'assets/img/openstreetmap.png' }
  ];

  const basemapActive = document.getElementById('basemapActive');
  const basemapOptions = document.getElementById('basemapOptions');
  const activeImg = document.getElementById('basemapActiveImg');
  const activeLabel = document.getElementById('basemapActiveLabel');

  basemapActive?.addEventListener('click', (e) => {
    e.stopPropagation();
    basemapOptions.classList.toggle('open');
  });

  document.querySelectorAll('.basemap-card').forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index);
      const bm = basemaps[index];

      activeImg.src = bm.apercu;
      activeLabel.textContent = bm.nom;

      document.querySelectorAll('.basemap-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      switchBasemap(index);
      basemapOptions.classList.remove('open');
    });
  });

  document.addEventListener('click', () => {
    basemapOptions.classList.remove('open');
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
}

export function mettreAJourSelectN() {
  const inputN = document.getElementById('inputNDernieres');
  const labelN = document.getElementById('labelNDernieres');
  if (!inputN || !labelN) return;

  const filtreActif =
    !!document.getElementById('selectSexe')?.value ||
    !!document.getElementById('selectGestionnaire')?.value ||
    !!document.getElementById('selectPopulation')?.value ||
    !!document.getElementById('selectClasseAge')?.value ||
    !!document.getElementById('selectProgrammation')?.value ||
    !!document.getElementById('selectAnnee')?.value ||
    document.getElementById('checkHiver')?.checked ||
    document.getElementById('checkPrintemps')?.checked ||
    document.getElementById('checkEte')?.checked ||
    document.getElementById('checkRut')?.checked ||
    !!(document.getElementById('dateFrom')?.value) ||
    !!(document.getElementById('dateTo')?.value) ||
    Array.from(document.querySelectorAll('#listeIndividus input:checked')).length > 0;

  if (filtreActif) {
    inputN.value = 'toutes';
    inputN.disabled = true;
    labelN.textContent = 'les positions';
  } else {
    inputN.disabled = false;
    const valeursValides = ['1', '5', '10', '15', '20', 'toutes'];
    if (!valeursValides.includes(inputN.value)) {
      inputN.value = inputN.dataset.valeurManuelle || '1';
    }
    const val = inputN.value;
    if (val === 'toutes') {
      labelN.textContent = 'les positions';
    } else {
      const n = parseInt(val) || 1;
      labelN.textContent = n === 1 ? 'dernière position' : 'dernières positions';
    }
  }
}

let isResetting = false;

async function reinitialiserTousLesFiltres() {
  if (isResetting) return;
  isResetting = true;
  viderCache();

  showMapLoading();
  lockSidebar();

  try {
    // 1. Réinitialiser états internes saisons
    if (window._reinitialiserEtatSaisons) window._reinitialiserEtatSaisons();

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

    // 5. Saisons décochées
    ['checkRut', 'checkHiver', 'checkPrintemps', 'checkEte'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });

    // 6. Dates vidées SANS dispatcher change (pour éviter les effets de bord)
    ['dateFrom', 'dateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // 7. Tous les selects — valeur native + TomSelect
    ['selectSexe', 'selectGestionnaire', 'selectTranslocation', 'selectClasseAge',
     'selectPopulation', 'selectProgrammation', 'selectAnnee'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.value = '';
        if (el.tomselect) {
          el.tomselect.clear(true);
          el.tomselect.setValue('', true);
        }
      }
    });

    // 8. Checkboxes
    const checkOutliers = document.getElementById('checkAberrantes');
    if (checkOutliers) checkOutliers.checked = false;
    const checkSuivis = document.getElementById('checkSuivis');
    if (checkSuivis) checkSuivis.checked = true;

    const inputNReinit = document.getElementById('inputNDernieres');
    if (inputNReinit) {
      inputNReinit.value = '1';
      inputNReinit.disabled = false;
      delete inputNReinit.dataset.valeurManuelle;
    }
    const labelNReinit = document.getElementById('labelNDernieres');
    if (labelNReinit) labelNReinit.textContent = 'dernière position';

    // 9. Individus
    document.querySelectorAll('#listeIndividus input').forEach(cb => {
      cb.checked = false;
      const label = cb.closest('label');
      if (!label) return;
      label.dataset.masqueParDate = 'false';
      label.style.display = label.dataset.sansGeom === 'true' ? 'none' : 'flex';
    });

    // 10. Mettre à jour compteur filtres
    mettreAJourFiltresActifs();

    // 11. Recharger la carte
    if (currentToken) {
      try {
        const locations = await fetchAllLastLocations(currentToken);
        const locationsEnrichies = enrichirLocations(locations);
        const locationsSuivies = locationsEnrichies.filter(l => l.cor_date_fin === null);
        clearMapPoints();
        clearTrajectoire();
        const count = renderPoints(locationsSuivies, false);
        mettreAJourPanneau(locationsSuivies);
        mettreAJourIndividus(animals.filter(a => locationsSuivies.some(l => String(l.ani_id) === String(a.ani_id))));
        const posEl = document.getElementById('positionsCount');
        if (posEl) posEl.textContent = count;
        mettreAJourLegende();
        setLabelDatetime('Dernière position');
        filtrerListeIndividus();
      } catch (err) {
        console.error('Erreur reset map:', err);
      }
    }
  } finally {
    hideMapLoading();
    unlockSidebar();
    isResetting = false;
  }
}

document.getElementById('sidebarToggle').addEventListener('click', function () {
  const sidebar = document.getElementById('sidebar');
  const headerBottom = document.querySelector('.header-bottom');
  const icon = this.querySelector('.toggle-icon');

  sidebar.classList.toggle('collapsed');

  // On attend la fin de la transition CSS (0.3s) pour mettre à jour la taille de la carte
  setTimeout(() => {
    updateMapSize();
  }, 310);

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

  clearMapPoints();
  clearTrajectoire();

  setCurrentToken(null);
  viderCache();

  await reinitialiserTousLesFiltres();

  document.querySelectorAll('details').forEach(d => {
    d.removeAttribute('open');
  });
  const detailsPeriode = document.getElementById('detailsPeriode');
  if (detailsPeriode) detailsPeriode.setAttribute('open', '');

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
  if (toggleIcon) toggleIcon.textContent = '›';
  setPanneauFermeManuel(false);

  const userChip = document.getElementById('userChip');
  if (userChip) userChip.style.display = 'none';
  const menu = document.getElementById('sessionMenu');
  if (menu) menu.style.display = 'none';

  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.style.display = 'flex';
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('loginError').textContent = '';
  loginEnCours = false;
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
export function mettreAJourLegende() {
  const contenu = document.getElementById('legendeContenu');
  if (!contenu) return;

  const isTrajectoire = document.getElementById('btnTrajectoire')?.classList.contains('active');
  const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';

  // Couleur de la pastille selon le mode
  let couleurPastille = '#2D6A4F';
  let legendeCouleur = '';

  switch (modeCouleur) {
    case 'sexe':
      legendeCouleur = `
        <div class="legende-section-titre">Sexe</div>
        <div class="legende-item"><div class="legende-pastille" style="background:#3A86FF"></div><span>Mâle</span></div>
        <div class="legende-item"><div class="legende-pastille" style="background:#FF006E"></div><span>Femelle</span></div>
      `;
      break;
    case 'gestionnaire':
      legendeCouleur = `
        <div class="legende-section-titre">Gestionnaire</div>
        <div class="legende-item"><div class="legende-pastille" style="background:#2D6A4F"></div><span>PNP</span></div>
        <div class="legende-item"><div class="legende-pastille" style="background:#E07B39"></div><span>PNRPA</span></div>
      `;
      break;
    // case 'saison': { ... } // Désactivé temporairement - à valider avec Ludovic/Alexandre
    // case 'date': { ... } // Désactivé temporairement - à valider avec Ludovic/Alexandre
    default:
      legendeCouleur = ''; // Individu — pas de légende couleur
      break;
  }

  contenu.innerHTML = `
    ${isTrajectoire ? `
      <div class="legende-section-titre">Trajectoire</div>
      <div class="legende-item">
        <div class="legende-pastille-creux"></div>
        <span>Point de départ</span>
      </div>
      <div class="legende-item">
        <div class="legende-pastille" style="background:${couleurPastille}"></div>
        <span>Dernière position</span>
      </div>
      <div class="legende-item">
        <span style="font-size:14px;color:${couleurPastille}">→</span>
        <span>Direction</span>
      </div>
    ` : `
      <div class="legende-section-titre">Positions</div>
      <div class="legende-item">
        <div class="legende-pastille" style="background:${couleurPastille}"></div>
        <span>Dernière position</span>
      </div>
    `}
    ${legendeCouleur}
  `;
}

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