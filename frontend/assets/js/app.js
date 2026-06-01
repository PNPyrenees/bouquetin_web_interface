import { login, fetchAnimals, fetchLocations, fetchLastLocationsParPeriode, fetchAnimalIdsParPeriode, fetchProgrammations, fetchAllLastLocations, viderCache } from './api.js';
import { ROLES, DEV_PASSWORD, ZOOM_POINT_SINGLE, ZOOM_FILTER_SINGLE, ZOOM_FILTER_MULTI, ZOOM_TRAJECTOIRE_SINGLE, ZOOM_TRAJECTOIRE_MULTI, ZOOM_MAX_MANUAL, ZOOM_MIN_MANUAL } from './config.js';
import { initMap, renderPoints, clearMap, clearMapPoints, updateMapSize, switchBasemap, getMap, getGpsSource, renderTrajectoire, clearTrajectoire, highlightPoint, zoomToPoint } from './map.js';
import { initPanneau, mettreAJourPanneau, setLabelDatetime, ouvrirPanneauSiNecessaire, setPanneauFermeManuel, mettreAJourIndividus, scrollToAniId, scrollToAniIdIndividus, setAniIdSelectionne } from './panel.js';
import { applyFilters, filtrerListeIndividus, mettreAJourListeParDate, getClasse } from './filters.js';

const DEV_MODE = true;

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
  showGlobalLoading();
  lockSidebar();
  try {
    // Initialisation de la carte OpenLayers
    initMap('map', 'popup');
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

    const programmations = await fetchProgrammations(token);
    programmations.forEach(p => {
      if (!programmationsMap.has(String(p.ani_id))) {
        programmationsMap.set(String(p.ani_id), p.prog_id);
      }
    });
    window._progMap = programmationsMap; // ← debug temporaire

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

    const count = renderPoints(locationsEnrichies);
    mettreAJourPanneau(locationsEnrichies);
    document.getElementById('positionsCount').textContent = count;
    mettreAJourIndividus(enrichirAnimauxAvecPositions(locationsEnrichies));
    mettreAJourLegende();
    setLabelDatetime('Dernière position');

    // Identifier tous les animaux qui ont au moins une géométrie
    const idsAvecGeom = new Set(locations.map(l => String(l.ani_id)));

    const listeIndividus = document.getElementById('listeIndividus');
    const searchIndividu = document.getElementById('searchIndividu');

    if (listeIndividus) {
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

          label.innerHTML = `<input type="checkbox" value="${ani.ani_id}"> ${ani.ani_nom}`;

          // Gestion du clic sur une checkbox d'individu
          const checkbox = label.querySelector('input');
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
              // Ajout d'un badge visuel dans la zone de filtres actifs
              ajouterBadge(ani.ani_nom, () => {
                checkbox.checked = false; // Callback pour décocher si le badge est supprimé
              }, `ani-${ani.ani_id}`);
            } else {
              // Suppression du badge si on décoche manuellement
              supprimerBadgeById(`ani-${ani.ani_id}`);
            }
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

      // Injection du filtre statut collier (checkbox)
      const filtreStatut = document.createElement('div');
      filtreStatut.style.cssText = 'margin-bottom:6px;';
      filtreStatut.innerHTML = `
        <label class="checkbox-label" id="filtreStatutCollier">
          <input type="checkbox" id="checkSuivis"> Individus suivis uniquement
        </label>
      `;
      listeIndividus.before(filtreStatut);

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

        mettreAJourListeParDate();
      });
    }

    // Champ de recherche textuelle pour filtrer les noms d'individus
    searchIndividu.addEventListener('input', () => {
      mettreAJourListeParDate();
    });
    // Initialisation de la logique des badges pour tous les autres filtres de la sidebar
    initSidebarBadges(token);
    // Initialisation du sélecteur de fond de carte
    initBasemapSelector();

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
        const selectedIds = Array.from(document.querySelectorAll('#listeIndividus input:checked')).map(cb => cb.value);
        const dateFrom = document.getElementById('dateFrom').value;
        const dateTo = document.getElementById('dateTo').value;

        // Vérification individu sélectionné
        if (selectedIds.length === 0) {
          showToast('Sélectionnez un individu pour afficher sa trajectoire');
          hideMapLoading();
          unlockSidebar();
          return; // Reste en mode Positions
        }

        // Bascule en mode Trajectoire
        btnTraj.classList.add('active');
        btnPos.classList.remove('active');
        setLabelDatetime('Date/Heure');
        applyFilters(currentToken);

        if (selectedIds.length > 0) {
          setTimeout(() => {
            const extent = getGpsSource().getExtent();
            if (!extent || ol.extent.isEmpty(extent)) return;

            if (selectedIds.length === 1) {
              getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: ZOOM_TRAJECTOIRE_SINGLE, duration: 400 });
            } else if (selectedIds.length > 1) {
              getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: ZOOM_TRAJECTOIRE_MULTI, duration: 400 });
            }
          }, 800);
        }
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

  } catch (err) {
    console.error('Erreur chargement individus:', err);
  } finally {
    hideGlobalLoading();
    unlockSidebar();
    updateMapSize();
    // Déclencheurs progressifs pour sécuriser la mise en page après masquage des overlays
    setTimeout(() => updateMapSize(), 150);
    setTimeout(() => updateMapSize(), 350);
  }
}

function initSidebarBadges(token) {
  // Dates
  function estDateValide(valeur) {
    if (!valeur || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
    const annee = parseInt(valeur.split('-')[0]);
    return annee >= 1900 && annee <= 2100;
  }
  ['dateFrom', 'dateTo'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prefix = id === 'dateFrom' ? 'Du ' : 'Au ';

    // Événement change — fonctionne à la fois avec le sélecteur et la saisie manuelle (au blur)
    el.addEventListener('change', () => {
      supprimerBadgeById(id);
      if (el.value && estDateValide(el.value)) {
        const [y, m, d] = el.value.split('-');
        ajouterBadge(`${prefix}${d}/${m}/${y}`, () => {
          el.value = '';
          mettreAJourListeParDate();
        }, id);
        mettreAJourListeParDate();
      } else if (!el.value) {
        mettreAJourListeParDate();
      }
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
  ['selectSexe', 'selectGestionnaire', 'selectTranslocation', 'selectClasseAge', 'selectPopulation', 'selectProgrammation'].forEach(id => {
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
      mettreAJourListeParDate();
    });
  });



  // Saisons checkboxes
  ['checkRude', 'checkHiver', 'checkPrintemps', 'checkEte'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const label = el.nextSibling?.textContent?.trim() || id;
    el.addEventListener('change', () => {
      if (el.checked) {
        ajouterBadge(label, () => {
          el.checked = false;
        }, id);
      } else {
        supprimerBadgeById(id);
      }
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
      applyFilters(currentToken);
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
  });
  // Verrouillage du contenu des sections et du bouton, sans toucher aux titres (summary)
  document.querySelectorAll('.accordion .details-content, #btnApplyFilters').forEach(el => {
    el.classList.add('section-locked');
  });
}

export function unlockSidebar() {
  document.querySelectorAll('.sidebar-input, .sidebar-select, .checkbox-label input, input[name="statutCollier"], #checkSuivis, #searchIndividu, #btnApplyFilters, #btnResetFilters, #btnReinitialiser').forEach(el => {
    el.disabled = false;
  });
  // Déverrouillage du contenu et du bouton
  document.querySelectorAll('.accordion .details-content, #btnApplyFilters').forEach(el => {
    el.classList.remove('section-locked');
  });
}

function initBasemapSelector() {
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
export function ajouterBadge(label, onRemove, id = null) {
  const badge = document.createElement('div');
  badge.className = 'filtre-badge';
  if (id) badge.dataset.id = id;
  badge.innerHTML = `${label} <button>×</button>`;

  // Si on clique sur le petit 'x', on supprime le badge et on reset le filtre
  badge.querySelector('button').addEventListener('click', () => {
    badge.remove();
    onRemove(); // Exécute l'action de réinitialisation spécifique (ex: décocher la case)
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

let isResetting = false;

async function reinitialiserTousLesFiltres() {
  if (isResetting) return;
  isResetting = true;
  viderCache();

  showMapLoading();
  lockSidebar();

  try {
    document.querySelectorAll('.filtre-badge').forEach(badge => badge.remove());

    // Revenir en mode Positions par défaut
    const btnPos = document.getElementById('btnPositions');
    const btnTraj = document.getElementById('btnTrajectoire');
    if (btnPos && btnTraj) {
      btnPos.classList.add('active');
      btnTraj.classList.remove('active');
      clearTrajectoire();
    }

    // Réinitialiser la recherche textuelle
    const searchIndividu = document.getElementById('searchIndividu');
    if (searchIndividu) searchIndividu.value = '';

    ['dateFrom', 'dateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const checkOutliers = document.getElementById('checkAberrantes');
    if (checkOutliers) checkOutliers.checked = false;
    supprimerBadgeById('checkAberrantes');

    ['selectSexe', 'selectGestionnaire', 'selectTranslocation', 'selectClasseAge', 'selectPopulation', 'selectProgrammation'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    mettreAJourListeParDate();

    ['checkRude', 'checkHiver', 'checkPrintemps', 'checkEte'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });

    document.querySelectorAll('#listeIndividus input').forEach(cb => {
      cb.checked = false;
      const label = cb.closest('label');
      if (!label) return;
      label.dataset.masqueParDate = 'false';
      if (label.dataset.sansGeom === 'true') {
        label.style.display = 'none';
        return;
      }
      label.style.display = 'flex';
    });

    mettreAJourFiltresActifs();

    // Réactualiser la carte (Tous par défaut)
    if (currentToken) {

      try {
        const checkSuivis = document.getElementById('checkSuivis');
        if (checkSuivis) checkSuivis.checked = false;
        supprimerBadgeById('checkSuivis');

        const locations = await fetchAllLastLocations(currentToken);
        const locationsEnrichies = enrichirLocations(locations);
        clearMapPoints();
        clearTrajectoire();
        const count = renderPoints(locationsEnrichies, false);
        mettreAJourPanneau(locationsEnrichies);
        mettreAJourIndividus(animals.filter(a => locationsEnrichies.some(l => String(l.ani_id) === String(a.ani_id))));
        document.getElementById('positionsCount').textContent = count;
        mettreAJourLegende();
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

if (DEV_MODE) {
  login(ROLES.READER, DEV_PASSWORD).then(token => startApp(token));
} else {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
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
    }
  });
}

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
        <div class="legende-item"><div class="legende-pastille" style="background:#888888"></div><span>Inconnu</span></div>
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