import { login, fetchAnimals, fetchLocations, fetchLastLocations, fetchLastLocationsInactifs, fetchLastLocationsParPeriode, fetchAnimalIdsParPeriode, fetchProgrammations } from './api.js?v=1.1.0';
import { ROLES, DEV_PASSWORD } from './config.js?v=1.1.0';
import { initMap, renderPoints, clearMap, clearMapPoints, updateMapSize, switchBasemap, getMap, getGpsSource, renderTrajectoire, clearTrajectoire, highlightPoint, zoomToPoint } from './map.js?v=1.1.0';
import { initPanneau, mettreAJourPanneau, setLabelDatetime, ouvrirPanneauSiNecessaire, setPanneauFermeManuel, mettreAJourIndividus } from './panel.js';

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

/**
 * ENRICHISSEMENT DES DONNÉES
 * Les tables de positions GPS ne contiennent pas toujours les métadonnées (sexe, etc.).
 * Cette fonction fusionne les positions avec les informations de la table t_animal.
 */
function enrichirLocations(locations) {
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

function initSidebarRight() {
  const sidebarRight = document.getElementById('sidebarRight');
  const sidebarRightToggle = document.getElementById('sidebarRightToggle');

  sidebarRightToggle?.addEventListener('click', () => {
  const icon = sidebarRightToggle.querySelector('.toggle-icon');
  sidebarRight.classList.toggle('visible');
  const estVisible = sidebarRight.classList.contains('visible');
  icon.textContent = estVisible ? '›' : '‹';
  setPanneauFermeManuel(!estVisible);
  if (!estVisible) {
    sidebarRight.style.width = '';
  }
  const mapScreen = document.getElementById('mapScreen');
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
      const icon = sidebarRightToggle?.querySelector('.toggle-icon');
      if (icon) icon.textContent = '›';
      return;
    }

    const maxWidth = window.innerWidth * 0.85;
    if (newWidth <= maxWidth) {
      sidebarRight.style.width = `${newWidth}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      sidebarRight.style.transition = 'right 0.3s ease';
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
    window._afficherPositionsIndividu = (aniId) => {
      const features = getGpsSource().getFeatures();
      const feature = features.find(f => String(f.get('ani_id')) === String(aniId));
      if (!feature) return;
      const geom = feature.getGeometry();
      if (!geom) return;
      const coord = geom.getCoordinates();
      getMap().getView().animate({ center: coord, zoom: 14, duration: 400 });
    };

    // Récupération des données depuis l'API via le module api.js
    animals = await fetchAnimals(token);
    console.log('Premier individu :', animals[0]);

    currentToken = token;

    const programmations = await fetchProgrammations(token);
    programmations.forEach(p => {
      if (!programmationsMap.has(String(p.ani_id))) {
        programmationsMap.set(String(p.ani_id), p.prog_id);
      }
    });
    window._progMap = programmationsMap; // ← debug temporaire

    // ← initPanneau() ici — après les données, avant le rendu
    initPanneau();
    // mettreAJourIndividus(animals);

    // Chargement initial (Tous par défaut : actifs + inactifs)
    const [actifs, inactifs] = await Promise.all([
      fetchLastLocations(token),
      fetchLastLocationsInactifs(token, { ani_id: animals.map(a => a.ani_id) })
    ]);
    const actifsIds = new Set(actifs.map(l => l.ani_id));
    const locations = [...actifs, ...inactifs.filter(l => !actifsIds.has(l.ani_id))];
    const locationsEnrichies = enrichirLocations(locations);
    const count = renderPoints(locationsEnrichies);
    mettreAJourPanneau(locationsEnrichies);
    document.getElementById('positionsCount').textContent = count;
    const animauxAffiches = animals.filter(a =>
   locationsEnrichies.some(l => String(l.ani_id) === String(a.ani_id))
);
mettreAJourIndividus(animauxAffiches);
    mettreAJourLegende();
    setLabelDatetime('Dernière position');



    activeIds = new Set(actifs.map(l => l.ani_id));

    // Identifier tous les animaux qui ont au moins une géométrie
    const idsAvecGeom = new Set([
      ...actifs.map(l => String(l.ani_id)),
      ...inactifs.map(l => String(l.ani_id))
    ]);

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
    searchIndividu.addEventListener('input', (e) => {
      const val = e.target.value.toLowerCase().trim();
      listeIndividus.querySelectorAll('.checkbox-label').forEach(label => {
        if (label.dataset.sansGeom === 'true') {
          label.style.display = 'none';
          return;
        }
        const match = label.textContent.toLowerCase().includes(val);
        label.style.display = match ? 'flex' : 'none';
      });
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
              getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 14, duration: 400 });
            } else if (selectedIds.length > 1) {
              getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 12, duration: 400 });
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
  let dateDebounceTimer = null;

  ['dateFrom', 'dateTo'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prefix = id === 'dateFrom' ? 'Du ' : 'Au ';

    // Événement change — souris ou touche Tab
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

    // Événement input — saisie manuelle avec debounce
    el.addEventListener('input', () => {
      clearTimeout(dateDebounceTimer);
      dateDebounceTimer = setTimeout(() => {
        // Ne lancer que si la date est complète ou vide
        if (!el.value || estDateValide(el.value)) {
          supprimerBadgeById(id);
          if (el.value) {
            const [y, m, d] = el.value.split('-');
            ajouterBadge(`${prefix}${d}/${m}/${y}`, () => {
              el.value = '';
              mettreAJourListeParDate();
            }, id);
          }
          mettreAJourListeParDate();
        }
      }, 800);
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

/**
 * APPLICATION DES FILTRES
 * Récupère les données filtrées depuis l'API et met à jour la carte.
 */
async function applyFilters(token) {
  const btnApply = document.getElementById('btnApplyFilters');
  showMapLoading();
  lockSidebar();

  // Collecte des filtres
  const filters = {
    ani_id: Array.from(document.querySelectorAll('#listeIndividus input:checked')).map(cb => cb.value),
    date_from: document.getElementById('dateFrom').value,
    date_to: document.getElementById('dateTo').value,
    sexe: document.getElementById('selectSexe').value,
    gestionnaire: document.getElementById('selectGestionnaire').value,
    population: document.getElementById('selectPopulation').value,
    include_outliers: document.getElementById('checkAberrantes')?.checked || false,
    programmation: document.getElementById('selectProgrammation').value
  };

  if (btnApply) {
    btnApply.disabled = true;
    btnApply.textContent = 'Chargement...';
  }

  try {
    const isPositionMode = document.getElementById('btnPositions').classList.contains('active');
    const selectedIds = filters.ani_id;
    const suivisSeulement = document.getElementById('checkSuivis')?.checked || false;

    let locations;

    if (isPositionMode) {
      // Si une date est sélectionnée → filtrer par période
      if (filters.date_from || filters.date_to) {
        console.log('Mode période détecté — date_from:', filters.date_from, 'date_to:', filters.date_to);

        const idsAInterroger = selectedIds.length > 0
          ? selectedIds
          : animals.map(a => String(a.ani_id));

        console.log('IDs à interroger:', idsAInterroger.length);

        locations = await fetchLastLocationsParPeriode(token, {
          ani_id: idsAInterroger,
          date_from: filters.date_from,
          date_to: filters.date_to,
          sexe: filters.sexe,
          gestionnaire: filters.gestionnaire,
          population: filters.population,
          include_outliers: filters.include_outliers
        });

        console.log('Locations retournées:', locations.length);

        locations = enrichirLocations(locations);

        clearMapPoints();
        const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
        const count = renderPoints(locations, true, false, modeCouleur);
        mettreAJourPanneau(locations);
        mettreAJourIndividus(animals.filter(a => locations.some(l => String(l.ani_id) === String(a.ani_id))));
        ouvrirPanneauSiNecessaire();
        document.getElementById('positionsCount').textContent = count;
        mettreAJourLegende();
        setLabelDatetime('Date/Heure');

        const extent = getGpsSource().getExtent();
        if (selectedIds.length === 1 && locations.length > 0) {
          const loc = locations[0];
          const geom = typeof loc.geom === 'string' ? JSON.parse(loc.geom) : loc.geom;
          if (geom?.coordinates) {
            const wgs84 = proj4('EPSG:2154', 'EPSG:4326', geom.coordinates);
            const coord = ol.proj.fromLonLat(wgs84);
            getMap().getView().animate({ center: coord, zoom: 13, duration: 400 });
          }
        } else if (locations.length > 1 && extent && !ol.extent.isEmpty(extent)) {
          getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 13, duration: 400 });
        }

        return; // ← sortir du bloc isPositionMode
      }

      const fetchParams = {
        ani_id: selectedIds,
        sexe: filters.sexe,
        gestionnaire: filters.gestionnaire,
        population: filters.population,
        include_outliers: filters.include_outliers
      };

      if (suivisSeulement) {
        locations = await fetchLastLocations(token, fetchParams);
        if (filters.sexe) {
          locations = locations.filter(l => {
            const ani = animals.find(a => String(a.ani_id) === String(l.ani_id));
            return ani && ani.ani_sexe === filters.sexe;
          });
        }
        if (filters.gestionnaire) {
          locations = locations.filter(l => {
            const ani = animals.find(a => String(a.ani_id) === String(l.ani_id));
            return ani && ani.ani_gestionnaire === filters.gestionnaire;
          });
        }
        if (filters.population) {
          locations = locations.filter(l => {
            const ani = animals.find(a => String(a.ani_id) === String(l.ani_id));
            return ani && ani.ani_pop_rattach === filters.population;
          });
        }
      } else {
        // Tous — actifs + inactifs
        const actifs = await fetchLastLocations(token, fetchParams);
        const actifsIds = new Set(actifs.map(l => String(l.ani_id)));
        const inactifsIds = animals
          .filter(a => !actifsIds.has(String(a.ani_id)))
          .map(a => String(a.ani_id));
        const inactifs = await fetchLastLocationsInactifs(token, {
          ...fetchParams,
          ani_id: selectedIds.length > 0 ? selectedIds : inactifsIds
        });
        let actifsFiltered = actifs;
        if (filters.sexe) {
          actifsFiltered = actifsFiltered.filter(l => {
            const ani = animals.find(a => String(a.ani_id) === String(l.ani_id));
            return ani && ani.ani_sexe === filters.sexe;
          });
        }
        if (filters.gestionnaire) {
          actifsFiltered = actifsFiltered.filter(l => {
            const ani = animals.find(a => String(a.ani_id) === String(l.ani_id));
            return ani && ani.ani_gestionnaire === filters.gestionnaire;
          });
        }
        if (filters.population) {
          actifsFiltered = actifsFiltered.filter(l => {
            const ani = animals.find(a => String(a.ani_id) === String(l.ani_id));
            return ani && ani.ani_pop_rattach === filters.population;
          });
        }
        const seen = new Set(actifsFiltered.map(l => l.ani_id));

        // Filtrer aussi les inactifs par population côté client si nécessaire
        let inactifsFiltered = inactifs;
        if (filters.population) {
          inactifsFiltered = inactifsFiltered.filter(l => {
            const ani = animals.find(a => String(a.ani_id) === String(l.ani_id));
            return ani && ani.ani_pop_rattach === filters.population;
          });
        }

        locations = [...actifsFiltered, ...inactifsFiltered.filter(l => !seen.has(l.ani_id))];
      }
      if (filters.programmation) {
        locations = locations.filter(l =>
          String(programmationsMap.get(String(l.ani_id))) === filters.programmation
        );
      }
      locations = enrichirLocations(locations);
      clearMapPoints();
      const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
      const count = renderPoints(locations, true, false, modeCouleur);
      mettreAJourPanneau(locations);
      mettreAJourIndividus(animals.filter(a => locations.some(l => String(l.ani_id) === String(a.ani_id))));
      ouvrirPanneauSiNecessaire();
      document.getElementById('positionsCount').textContent = count;
      mettreAJourLegende();
      setLabelDatetime('Dernière position');

      const extent = getGpsSource().getExtent();
      if (selectedIds.length === 1 && locations.length > 0) {
        // 1 individu → zoom vers son point
        const loc = locations[0];
        const geom = typeof loc.geom === 'string' ? JSON.parse(loc.geom) : loc.geom;
        if (geom?.coordinates) {
          const wgs84 = proj4('EPSG:2154', 'EPSG:4326', geom.coordinates);
          const coord = ol.proj.fromLonLat(wgs84);
          getMap().getView().animate({ center: coord, zoom: 13, duration: 400 });
        }
      } else if (locations.length > 1 && extent && !ol.extent.isEmpty(extent)) {
        // Plusieurs points → zoom adaptatif pour tous les voir
        getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 13, duration: 400 });
      }
    } else {
      // Mode Trajectoire — on ne vide pas les points existants
      if (filters.date_from && filters.date_to) {
        // Avec période → une seule requête, toutes les positions sur la plage
        const trajFilters = {
          ...filters,
          limit: 999999
        };
        locations = await fetchLocations(token, trajFilters);
      } else {
        // Sans période → 100 dernières positions PAR individu sélectionné
        if (selectedIds.length === 0) {
          showToast('Sélectionnez un individu pour afficher sa trajectoire');
          hideMapLoading();
          unlockSidebar();
          if (btnApply) {
            btnApply.disabled = false;
            btnApply.textContent = 'Appliquer les filtres';
          }
          return;
        }

        if (filters.include_outliers && (!filters.date_from || !filters.date_to)) {
          showToast('Veuillez sélectionner une période');
          filters.include_outliers = false;
        }

        const promises = selectedIds.map(async id => {
          // Requête 1 — positions valides
          const valides = await fetchLocations(token, {
            ...filters,
            ani_id: [id],
            limit: 500,
            include_outliers: false
          });

          // Requête 2 — outliers uniquement si case cochée
          let outliers = [];
          if (filters.include_outliers) {
            const toutesPositions = await fetchLocations(token, {
              ...filters,
              ani_id: [id],
              limit: 999999,
              include_outliers: true,
              only_outliers: true
            });
            outliers = toutesPositions.filter(l =>
              l.loc_outlier !== null || l.loc_anomalie === true
            );
          }

          return [...valides, ...outliers];
        });

        const results = await Promise.all(promises);
        locations = results.flat();
      }
      locations = enrichirLocations(locations);
      clearMapPoints();
      clearTrajectoire();
      const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
      const count = renderPoints(locations, true, true, modeCouleur);
      mettreAJourPanneau(locations);
      mettreAJourIndividus(animals.filter(a => locations.some(l => String(l.ani_id) === String(a.ani_id))));
      ouvrirPanneauSiNecessaire();
      renderTrajectoire(locations, modeCouleur);
      document.getElementById('positionsCount').textContent = count;
      mettreAJourLegende();

      setTimeout(() => {
        const extent = getGpsSource().getExtent();
        if (!extent || ol.extent.isEmpty(extent)) return;
        if (selectedIds.length === 1) {
          getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 14, duration: 400 });
        } else if (selectedIds.length > 1) {
          getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 12, duration: 400 });
        }
      }, 300);
    }

  } catch (err) {
    console.error('Erreur filtrage:', err);
    alert('Erreur lors du chargement des données');
  } finally {
    hideMapLoading();
    unlockSidebar();
    if (btnApply) {
      btnApply.disabled = false;
      btnApply.textContent = 'Appliquer les filtres';
    }

  }

}

function showMapLoading() {
  const el = document.getElementById('mapLoading');
  if (el) el.style.display = 'flex';
}

function hideMapLoading() {
  const el = document.getElementById('mapLoading');
  if (el) el.style.display = 'none';
}

function lockSidebar() {
  document.querySelectorAll('.sidebar-input, .sidebar-select, .checkbox-label input, input[name="statutCollier"], #checkSuivis, #searchIndividu, #btnApplyFilters, #btnResetFilters, #btnReinitialiser').forEach(el => {
    el.disabled = true;
  });
  // Verrouillage du contenu des sections et du bouton, sans toucher aux titres (summary)
  document.querySelectorAll('.accordion .details-content, #btnApplyFilters').forEach(el => {
    el.classList.add('section-locked');
  });
}

function unlockSidebar() {
  document.querySelectorAll('.sidebar-input, .sidebar-select, .checkbox-label input, input[name="statutCollier"], #checkSuivis, #searchIndividu, #btnApplyFilters, #btnResetFilters, #btnReinitialiser').forEach(el => {
    el.disabled = false;
  });
  // Déverrouillage du contenu et du bouton
  document.querySelectorAll('.accordion .details-content, #btnApplyFilters').forEach(el => {
    el.classList.remove('section-locked');
  });
}

/**
 * FONCTIONS UTILITAIRES DE FILTRAGE
 */

/**
 * Filtre la liste des individus par classe d'âge (Cabri, Éterlou, Adulte)
 * Cache ou affiche les éléments en fonction de l'attribut data-classe
 */
function initBasemapSelector() {
  const btnLayers = document.getElementById('btnLayers');
  const layersModal = document.getElementById('layersModal');
  const layersModalClose = document.getElementById('layersModalClose');
  const layersGrid = document.getElementById('layersGrid');

  // Définition des fonds de carte
  const basemapsList = [
    {
      index: 0,
      nom: 'SCAN25 IGN',
      apercu: 'assets/img/ign.png'
    },
    {
      index: 1,
      nom: 'OpenTopoMap',
      apercu: 'assets/img/opentopomap.png'
    },
    {
      index: 2,
      nom: 'OpenStreetMap',
      apercu: 'assets/img/openstreetmap.png'
    }
  ];

  // Rendu des vignettes
  if (layersGrid) {
    layersGrid.innerHTML = '';
    basemapsList.forEach(bm => {
      const card = document.createElement('div');
      card.className = 'layers-card';
      card.dataset.index = bm.index;
      if (bm.index === 0) card.classList.add('active');

      card.innerHTML = `
        <div class="layers-card-img">
          <img src="${bm.apercu}" alt="${bm.nom}" onerror="this.style.background='#eee'">
        </div>
        <div class="layers-card-label">${bm.nom}</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.layers-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        switchBasemap(bm.index);
        layersModal.style.display = 'none';
      });

      layersGrid.appendChild(card);
    });
  }

  btnLayers?.addEventListener('click', (e) => {
    e.stopPropagation();
    layersModal.style.display = layersModal.style.display === 'none' ? 'flex' : 'none';
  });

  layersModalClose?.addEventListener('click', () => {
    layersModal.style.display = 'none';
  });

  layersModal?.addEventListener('click', (e) => {
    if (e.target === layersModal) layersModal.style.display = 'none';
  });
}

function filtrerListeIndividus() {
  const sexe = document.getElementById('selectSexe')?.value;
  const gestionnaire = document.getElementById('selectGestionnaire')?.value;
  const population = document.getElementById('selectPopulation')?.value;
  const classe = document.getElementById('selectClasseAge')?.value;
  const suivisSeulement = document.getElementById('checkSuivis')?.checked || false;
  const programmation = document.getElementById('selectProgrammation')?.value;

  document.querySelectorAll('#listeIndividus .checkbox-label').forEach(label => {
    if (label.dataset.sansGeom === 'true') {
      label.style.display = 'none';
      return;
    }
    const checkbox = label.querySelector('input');
    const aniId = checkbox?.value;
    if (!aniId) return;

    // Récupération des filtres depuis le dataset (alimenté dans startApp)
    const aniSexe = label.dataset.sexe || '';
    const aniGestionnaire = label.dataset.gestionnaire || '';
    const aniPopulation = label.dataset.population || '';
    const aniClasse = label.dataset.classe || '';

    const matchSexe = !sexe || aniSexe === sexe;
    const matchGestionnaire = !gestionnaire || aniGestionnaire === gestionnaire;
    const matchPopulation = !population || aniPopulation === population;
    const matchClasse = !classe || aniClasse === classe;
    const matchSuivis = !suivisSeulement || activeIds.has(Number(aniId));
    const matchProgrammation = !programmation ||
      String(programmationsMap.get(String(aniId))) === programmation;

    label.style.display = (matchSexe && matchGestionnaire && matchPopulation && matchClasse && matchSuivis && matchProgrammation) ? 'flex' : 'none';
  });
}

/**
 * Met à jour la liste des individus selon les dates sélectionnées
 * sans recharger la carte — appelée au changement de date
 */
async function mettreAJourListeParDate() {
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;

  // Si aucune date — réafficher normalement
  if (!dateFrom && !dateTo) {
    filtrerListeIndividus();
    return;
  }

  try {
    // Une seule requête pour tous les ani_id distincts sur la période
    const idsAvecDonnees = new Set(
      await fetchAnimalIdsParPeriode(currentToken, {
        date_from: dateFrom,
        date_to: dateTo,
        include_outliers: false
      })
    );

    // Mettre à jour la liste
    document.querySelectorAll('#listeIndividus .checkbox-label').forEach(label => {
      if (label.dataset.sansGeom === 'true') {
        label.style.display = 'none';
        return;
      }
      const checkbox = label.querySelector('input');
      if (!checkbox) return;

      const sexe = document.getElementById('selectSexe')?.value;
      const gestionnaire = document.getElementById('selectGestionnaire')?.value;
      const population = document.getElementById('selectPopulation')?.value;
      const classe = document.getElementById('selectClasseAge')?.value;
      const suivisSeulement = document.getElementById('checkSuivis')?.checked || false;
      const programmation = document.getElementById('selectProgrammation')?.value;

      const matchPeriode = idsAvecDonnees.has(String(checkbox.value));
      const matchSexe = !sexe || label.dataset.sexe === sexe;
      const matchGestionnaire = !gestionnaire || label.dataset.gestionnaire === gestionnaire;
      const matchPopulation = !population || label.dataset.population === population;
      const matchClasse = !classe || label.dataset.classe === classe;
      const matchSuivis = !suivisSeulement || activeIds.has(Number(checkbox.value));
      const matchProgrammation = !programmation ||
        String(programmationsMap.get(String(checkbox.value))) === programmation;

      label.style.display = (matchPeriode && matchSexe && matchGestionnaire && matchPopulation && matchClasse && matchSuivis && matchProgrammation) ? 'flex' : 'none';
    });

  } catch (err) {
    console.error('Erreur mise à jour liste par date:', err);
  }
}

// Supprimé: fonctions individuelles devenues obsolètes car centralisées dans filtrerListeIndividus
function filtrerIndividusParClasse(classe) { filtrerListeIndividus(); }
function filtrerIndividusParSexe(sexe) { filtrerListeIndividus(); }
function filtrerIndividusParGestionnaire(gestionnaire) { filtrerListeIndividus(); }
function filtrerIndividusParPopulation(population) { filtrerListeIndividus(); }

function getClasse(age) {
  if (age <= 1) return 'Cabri';
  if (age <= 2) return 'Éterlou';
  return 'Adulte';
}

function supprimerBadgeById(id) {
  document.querySelectorAll(`.filtre-badge[data-id="${id}"]`).forEach(badge => {
    badge.remove();
  });
  mettreAJourFiltresActifs();
}

/**
 * SYSTÈME DE BADGES
 * Affiche un badge amovible pour chaque filtre actif.
 */
function ajouterBadge(label, onRemove, id = null) {
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

function mettreAJourFiltresActifs() {
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

        const [actifs, inactifs] = await Promise.all([
          fetchLastLocations(currentToken),
          fetchLastLocationsInactifs(currentToken, { ani_id: animals.map(a => a.ani_id) })
        ]);
        const actifsIds = new Set(actifs.map(l => l.ani_id));
        const locations = [...actifs, ...inactifs.filter(l => !actifsIds.has(l.ani_id))];
        const locationsEnrichies = enrichirLocations(locations);
        clearMapPoints();
        clearTrajectoire();
        renderPoints(locationsEnrichies, false);
        mettreAJourPanneau(locationsEnrichies);
        mettreAJourIndividus(animals.filter(a => locationsEnrichies.some(l => String(l.ani_id) === String(a.ani_id))));
        document.getElementById('positionsCount').textContent = locations.length;
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
function mettreAJourLegende() {
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
    case 'saison':
      legendeCouleur = `
        <div class="legende-section-titre">Saison</div>
        <div class="legende-item"><div class="legende-pastille" style="background:#3A86FF"></div><span>Hiver (déc-fév)</span></div>
        <div class="legende-item"><div class="legende-pastille" style="background:#06D6A0"></div><span>Printemps (mar-mai)</span></div>
        <div class="legende-item"><div class="legende-pastille" style="background:#FFBE0B"></div><span>Été (juin-août)</span></div>
        <div class="legende-item"><div class="legende-pastille" style="background:#FB5607"></div><span>Rude (sep-nov)</span></div>
      `;
      break;
    case 'date':
      legendeCouleur = `
        <div class="legende-section-titre">Date</div>
        <div style="width:100%;height:10px;border-radius:4px;background:linear-gradient(to right,#FFBE0B,#FB5607,#9B2335,#8338EC);margin:4px 0"></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#888">
          <span>Ancien</span><span>Récent</span>
        </div>
      `;
      break;
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

function showToast(message) {
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