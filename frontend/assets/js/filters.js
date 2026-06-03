import { fetchLocations, fetchLastLocationsParPeriode, fetchAnimalIdsParPeriode, fetchAllLastLocations } from './api.js';
import { renderPoints, clearMapPoints, updateMapSize, getMap, getGpsSource, renderTrajectoire, clearTrajectoire } from './map.js';
import { mettreAJourPanneau, setLabelDatetime, ouvrirPanneauSiNecessaire, mettreAJourIndividus } from './panel.js';
import { ZOOM_FILTER_SINGLE, ZOOM_FILTER_MULTI, ZOOM_TRAJECTOIRE_SINGLE, ZOOM_TRAJECTOIRE_MULTI } from './config.js';
import {
  getAnimals, getActiveIds, getCurrentToken, getProgrammationsMap,
  enrichirLocations, enrichirAnimauxAvecPositions,
  showMapLoading, hideMapLoading,
  lockSidebar, unlockSidebar,
  showToast, mettreAJourLegende,
  ajouterBadge, supprimerBadgeById, mettreAJourFiltresActifs
} from './app.js';

/**
 * APPLICATION DES FILTRES
 * Récupère les données filtrées depuis l'API et met à jour la carte.
 */
export async function applyFilters(token) {
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
        const idsAInterroger = selectedIds.length > 0
          ? selectedIds
          : getAnimals().map(a => String(a.ani_id));

        locations = await fetchLastLocationsParPeriode(token, {
          ani_id: idsAInterroger,
          date_from: filters.date_from,
          date_to: filters.date_to,
          population: filters.population,
          include_outliers: filters.include_outliers
        });

        // Filtres sexe et gestionnaire côté JS car absents de v_animal_last_loc
        if (filters.sexe) {
          locations = locations.filter(l => {
            const ani = getAnimals().find(a => String(a.ani_id) === String(l.ani_id));
            return ani?.ani_sexe === filters.sexe;
          });
        }
        if (filters.gestionnaire) {
          locations = locations.filter(l => {
            const ani = getAnimals().find(a => String(a.ani_id) === String(l.ani_id));
            return ani?.ani_gestionnaire === filters.gestionnaire;
          });
        }

        locations = enrichirLocations(locations);

        clearMapPoints();
        const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
        const count = renderPoints(locations, true, false, modeCouleur);
        mettreAJourPanneau(locations);
        mettreAJourIndividus(enrichirAnimauxAvecPositions(locations));

        ouvrirPanneauSiNecessaire();
        const mapScreen = document.getElementById('mapScreen');
        if (document.getElementById('sidebarRight')?.classList.contains('visible')) {
          mapScreen?.classList.add('panel-open');
          setTimeout(() => updateMapSize(), 310);
        }
        const posEl = document.getElementById('positionsCount');
        if (posEl) posEl.textContent = count;
        mettreAJourLegende();
        setLabelDatetime('Date/Heure');

        setTimeout(() => {
          const extent = getGpsSource().getExtent();
          if (selectedIds.length === 1 && locations.length > 0) {
            const loc = locations[0];
            const geom = typeof loc.geom === 'string' ? JSON.parse(loc.geom) : loc.geom;
            if (geom?.coordinates) {
              const wgs84 = proj4('EPSG:2154', 'EPSG:4326', geom.coordinates);
              const coord = ol.proj.fromLonLat(wgs84);
              getMap().getView().animate({ center: coord, zoom: ZOOM_FILTER_SINGLE, duration: 400 });
            }
          } else if (locations.length > 1 && extent && !ol.extent.isEmpty(extent)) {
            getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: ZOOM_FILTER_MULTI, duration: 400 });
          }
        }, 400); // augmenté de 0 à 400ms pour laisser le temps au redimensionnement

        return; // ← sortir du bloc isPositionMode
      }

      if (suivisSeulement) {
        locations = await fetchAllLastLocations(token, {
          population: filters.population,
          include_outliers: filters.include_outliers
        });
        // Filtrer uniquement les actifs côté JS
        locations = locations.filter(l => l.cor_date_fin === null);
      } else {
        locations = await fetchAllLastLocations(token, {
          population: filters.population,
          include_outliers: filters.include_outliers
        });
      }

      // Filtres supplémentaires côté JS
      if (filters.sexe) {
        locations = locations.filter(l => {
          const ani = getAnimals().find(a => String(a.ani_id) === String(l.ani_id));
          return ani?.ani_sexe === filters.sexe;
        });
      }
      if (filters.gestionnaire) {
        locations = locations.filter(l => {
          const ani = getAnimals().find(a => String(a.ani_id) === String(l.ani_id));
          return ani?.ani_gestionnaire === filters.gestionnaire;
        });
      }
      if (selectedIds.length > 0) {
        locations = locations.filter(l => selectedIds.includes(String(l.ani_id)));
      }
      if (filters.programmation) {
        locations = locations.filter(l =>
          String(getProgrammationsMap().get(String(l.ani_id))) === filters.programmation
        );
      }

      locations = enrichirLocations(locations);
      clearMapPoints();
      const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
      const count = renderPoints(locations, true, false, modeCouleur);
      mettreAJourPanneau(locations);
      mettreAJourIndividus(getAnimals().filter(a => locations.some(l => String(l.ani_id) === String(a.ani_id))));

      ouvrirPanneauSiNecessaire();
      const mapScreen = document.getElementById('mapScreen');
      if (document.getElementById('sidebarRight')?.classList.contains('visible')) {
        mapScreen?.classList.add('panel-open');
        setTimeout(() => updateMapSize(), 310);
      }
      const posEl = document.getElementById('positionsCount');
      if (posEl) posEl.textContent = count;
      mettreAJourLegende();
      setLabelDatetime('Dernière position');

      setTimeout(() => {
        const extent = getGpsSource().getExtent();
        if (selectedIds.length === 1 && locations.length > 0) {
          const loc = locations[0];
          const geom = typeof loc.geom === 'string' ? JSON.parse(loc.geom) : loc.geom;
          if (geom?.coordinates) {
            const wgs84 = proj4('EPSG:2154', 'EPSG:4326', geom.coordinates);
            const coord = ol.proj.fromLonLat(wgs84);
            getMap().getView().animate({ center: coord, zoom: ZOOM_FILTER_SINGLE, duration: 400 });
          }
        } else if (locations.length > 1 && extent && !ol.extent.isEmpty(extent)) {
          getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: ZOOM_FILTER_MULTI, duration: 400 });
        }
      }, 400); // augmenté de 0 à 400ms pour laisser le temps au redimensionnement
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
            limit: 30,
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
      mettreAJourIndividus(getAnimals().filter(a => locations.some(l => String(l.ani_id) === String(a.ani_id))));
      ouvrirPanneauSiNecessaire();
      const mapScreenTraj = document.getElementById('mapScreen');
      if (document.getElementById('sidebarRight')?.classList.contains('visible')) {
        mapScreenTraj?.classList.add('panel-open');
        setTimeout(() => updateMapSize(), 310);
      }
      renderTrajectoire(locations, modeCouleur);

      const posEl = document.getElementById('positionsCount');
      if (posEl) posEl.textContent = count;
      mettreAJourLegende();

      setTimeout(() => {
        const extent = getGpsSource().getExtent();
        if (!extent || ol.extent.isEmpty(extent)) return;
        if (selectedIds.length === 1) {
          getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: ZOOM_TRAJECTOIRE_SINGLE, duration: 400 });
        } else if (selectedIds.length > 1) {
          getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: ZOOM_TRAJECTOIRE_MULTI, duration: 400 });
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

export function filtrerListeIndividus() {
  const sexe = document.getElementById('selectSexe')?.value;
  const gestionnaire = document.getElementById('selectGestionnaire')?.value;
  const population = document.getElementById('selectPopulation')?.value;
  const classe = document.getElementById('selectClasseAge')?.value;
  const suivisSeulement = document.getElementById('checkSuivis')?.checked || false;
  const programmation = document.getElementById('selectProgrammation')?.value;

  const searchVal = document.getElementById('searchIndividu')?.value?.toLowerCase()?.trim() || '';

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
    const matchSuivis = !suivisSeulement || getActiveIds().has(Number(aniId));
    const matchProgrammation = !programmation ||
      String(getProgrammationsMap().get(String(aniId))) === programmation;

    const visible = (matchSexe && matchGestionnaire && matchPopulation && matchClasse && matchSuivis && matchProgrammation);
    label.dataset.masqueParDate = visible ? 'false' : 'true';

    const matchSearch = !searchVal || label.textContent.toLowerCase().includes(searchVal);
    label.style.display = (visible && matchSearch) ? 'flex' : 'none';
  });
}

/**
 * Met à jour la liste des individus selon les dates sélectionnées
 * sans recharger la carte — appelée au changement de date
 */
export async function mettreAJourListeParDate() {
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
      await fetchAnimalIdsParPeriode(getCurrentToken(), {
        date_from: dateFrom,
        date_to: dateTo,
        include_outliers: false
      })
    );

    const searchVal = document.getElementById('searchIndividu')?.value?.toLowerCase()?.trim() || '';

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
      const matchSuivis = !suivisSeulement || getActiveIds().has(Number(checkbox.value));
      const matchProgrammation = !programmation ||
        String(getProgrammationsMap().get(String(checkbox.value))) === programmation;

      const visible = (matchPeriode && matchSexe && matchGestionnaire && matchPopulation && matchClasse && matchSuivis && matchProgrammation);
      label.dataset.masqueParDate = visible ? 'false' : 'true';

      const matchSearch = !searchVal || label.textContent.toLowerCase().includes(searchVal);
      label.style.display = (visible && matchSearch) ? 'flex' : 'none';
    });

  } catch (err) {
    console.error('Erreur mise à jour liste par date:', err);
  }
}

// Supprimé: fonctions individuelles devenues obsolètes car centralisées dans filtrerListeIndividus
export function filtrerIndividusParClasse(classe) { filtrerListeIndividus(); }
export function filtrerIndividusParSexe(sexe) { filtrerListeIndividus(); }
export function filtrerIndividusParGestionnaire(gestionnaire) { filtrerListeIndividus(); }
export function filtrerIndividusParPopulation(population) { filtrerListeIndividus(); }

export function getClasse(age) {
  if (age <= 1) return 'Cabri';
  if (age <= 2) return 'Éterlou';
  return 'Adulte';
}
