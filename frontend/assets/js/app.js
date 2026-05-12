import { login, fetchAnimals, fetchLocations, fetchLastLocations, fetchLastLocationsInactifs } from './api.js';
import { ROLES, DEV_PASSWORD } from './config.js';
import { initMap, renderPoints, clearMap, clearMapPoints, updateMapSize, switchBasemap, getMap, getGpsSource, renderTrajectoire, clearTrajectoire } from './map.js';

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

/**
 * Enrichit les positions avec les métadonnées de l'animal (sexe, gestionnaire, population)
 * @param {Array} locations - Liste des positions à enrichir
 * @returns {Array} - Liste des positions enrichies
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

/**
 * Point d'entrée principal de l'application après connexion
 * @param {string} token - Jeton d'authentification API
 */
async function startApp(token) {
  showGlobalLoading();
  lockSidebar();
  try {
    // Initialisation de la carte OpenLayers
    initMap('map', 'popup');

    // Récupération des données depuis l'API via le module api.js
    animals = await fetchAnimals(token);
    console.log('Premier individu :', animals[0]);

    currentToken = token;

    // Chargement initial (Tous par défaut : actifs + inactifs)
    const [actifs, inactifs] = await Promise.all([
      fetchLastLocations(token),
      fetchLastLocationsInactifs(token, { ani_id: animals.map(a => a.ani_id) })
    ]);
    const actifsIds = new Set(actifs.map(l => l.ani_id));
    const locations = [...actifs, ...inactifs.filter(l => !actifsIds.has(l.ani_id))];
    const locationsEnrichies = enrichirLocations(locations);
    const count = renderPoints(locationsEnrichies);
    document.getElementById('positionsCount').textContent = count;
    mettreAJourLegende();

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

        // Gestion du badge
        if (suivisSeulement) {
          ajouterBadge('Individus suivis uniquement', () => {
            const cb = document.getElementById('checkSuivis');
            if (cb) cb.checked = false;
            filtrerListeIndividus();
          }, 'checkSuivis');
        } else {
          supprimerBadgeById('checkSuivis');
        }

        // Mise à jour de la liste des individus
        document.querySelectorAll('#listeIndividus .checkbox-label').forEach(label => {
          if (label.dataset.sansGeom === 'true') {
            label.style.display = 'none';
            return;
          }
          const checkbox = label.querySelector('input');
          const ani = animals.find(a => String(a.ani_id) === String(checkbox?.value));
          if (suivisSeulement && ani && !activeIds.has(ani.ani_id)) {
            label.style.display = 'none';
          } else {
            label.style.display = 'flex';
          }
        });
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
  }
}

function initSidebarBadges(token) {
  // Dates
  ['dateFrom', 'dateTo'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prefix = id === 'dateFrom' ? 'Du ' : 'Au ';
    el.addEventListener('change', () => {
      supprimerBadgeById(id);
      if (el.value) {
        const [y, m, d] = el.value.split('-');
        ajouterBadge(`${prefix}${d}/${m}/${y}`, () => {
          el.value = '';
        }, id);
      }
    });
  });

  // Inclure les outliers
  const checkOutliers = document.getElementById('checkAberrantes');
  if (checkOutliers) {
    checkOutliers.addEventListener('change', () => {
      if (checkOutliers.checked) {
        ajouterBadge('Inclure les outliers', () => {
          checkOutliers.checked = false;
        }, 'checkAberrantes');
      } else {
        supprimerBadgeById('checkAberrantes');
      }
    });
  }

  // Selects
  ['selectSexe', 'selectGestionnaire', 'selectTranslocation', 'selectClasseAge', 'selectPopulation'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      supprimerBadgeById(id);
      if (el.value) {
        const label = el.options[el.selectedIndex].text;
        ajouterBadge(label, () => {
          el.value = '';
          filtrerListeIndividus();
        }, id);
      }
      filtrerListeIndividus();
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
}

/**
 * Fonction centrale pour collecter les filtres et mettre à jour la carte
 * @param {string} token 
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
    include_outliers: document.getElementById('checkAberrantes')?.checked || false
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
      locations = enrichirLocations(locations);
      clearMapPoints();
      const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
      const count = renderPoints(locations, true, false, modeCouleur);
      document.getElementById('positionsCount').textContent = count;
      mettreAJourLegende();

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

        const promises = selectedIds.map(id =>
          fetchLocations(token, {
            ...filters,
            ani_id: [id],
            limit: 50
          })
        );
        const results = await Promise.all(promises);
        locations = results.flat();
      }
      locations = enrichirLocations(locations);
      clearMapPoints();
      clearTrajectoire();
      const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
      const count = renderPoints(locations, true, true, modeCouleur);
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

    // Mettre à jour la liste des individus selon les filtres actifs
    filtrerListeIndividus();

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
  const layersPanel = document.getElementById('layersPanel');

  if (btnLayers && layersPanel) {
    // Toggle de l'affichage du panneau
    btnLayers.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = layersPanel.style.display === 'none';
      layersPanel.style.display = isHidden ? 'flex' : 'none';
    });

    // Changement de fond de carte via les boutons radio
    const radios = document.querySelectorAll('input[name="basemap"]');
    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        const index = parseInt(radio.value);
        switchBasemap(index);
        layersPanel.style.display = 'none'; // Ferme le panneau après sélection
      });
    });

    // Fermer le panneau si on clique ailleurs sur la page
    document.addEventListener('click', (e) => {
      if (!layersPanel.contains(e.target) && !btnLayers.contains(e.target)) {
        layersPanel.style.display = 'none';
      }
    });
  }
}

function filtrerListeIndividus() {
  const sexe = document.getElementById('selectSexe')?.value;
  const gestionnaire = document.getElementById('selectGestionnaire')?.value;
  const population = document.getElementById('selectPopulation')?.value;
  const classe = document.getElementById('selectClasseAge')?.value;
  const suivisSeulement = document.getElementById('checkSuivis')?.checked || false;

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

    label.style.display = (matchSexe && matchGestionnaire && matchPopulation && matchClasse && matchSuivis) ? 'flex' : 'none';
  });
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

    ['dateFrom', 'dateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const checkOutliers = document.getElementById('checkAberrantes');
    if (checkOutliers) checkOutliers.checked = false;

    ['selectSexe', 'selectGestionnaire', 'selectTranslocation', 'selectClasseAge', 'selectPopulation'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    filtrerListeIndividus();

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
 * Met à jour dynamiquement le contenu de la légende selon le mode actif
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