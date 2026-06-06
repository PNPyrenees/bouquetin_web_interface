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

  const saisons = {
  rut: document.getElementById('checkRut')?.checked || false,
  hiver: document.getElementById('checkHiver')?.checked || false,
  printemps: document.getElementById('checkPrintemps')?.checked || false,
  ete: document.getElementById('checkEte')?.checked || false
};

  if (btnApply) {
    btnApply.disabled = true;
    btnApply.textContent = 'Chargement...';
  }

  try {
    const isPositionMode = document.getElementById('btnPositions').classList.contains('active');
    const selectedIds = filters.ani_id;
    const suivisSeulement = document.getElementById('checkSuivis')?.checked || false;

    const dateFromRaw = filters.date_from; // format jj/mm
    const dateToRaw = filters.date_to;     // format jj/mm
    const anneeSelectionnee = document.getElementById('selectAnnee')?.value;
    const aDateFrom = dateFromRaw && /^\d{2}\/\d{2}$/.test(dateFromRaw);
    const aDateTo = dateToRaw && /^\d{2}\/\d{2}$/.test(dateToRaw);

    const saisonActive = Object.values(saisons).some(v => v);
    const aFiltreTemporel = saisonActive || aDateFrom || aDateTo || anneeSelectionnee;

    let locations;

    if (isPositionMode) {
      if (aFiltreTemporel) {
        let dateFromApi = null;
        let dateToApi = null;
        const anneeRequete = anneeSelectionnee || '';

        if (saisonActive && !aDateFrom && !aDateTo) {
          const SAISONS_BORNES = {
            hiver:     { from: '01-01', to: '03-31' },
            printemps: { from: '04-01', to: '06-30' },
            ete:       { from: '07-01', to: '10-15' },
            rut:       { from: '10-16', to: '12-31' }
          };
          const saisonsCochees = Object.entries(saisons).filter(([, v]) => v).map(([k]) => k);
          const bornes = saisonsCochees.map(k => SAISONS_BORNES[k]);
          const fromMin = bornes.map(b => b.from).sort()[0];
          const toMax = bornes.map(b => b.to).sort().reverse()[0];
          if (anneeRequete) {
            dateFromApi = `${anneeRequete}-${fromMin}`;
            dateToApi = `${anneeRequete}-${toMax}`;
          }
        } else if (aDateFrom || aDateTo) {
          const annee = anneeRequete || new Date().getFullYear();
          if (aDateFrom) {
            const [j, m] = dateFromRaw.split('/');
            dateFromApi = `${annee}-${m}-${j}`;
          }
          if (aDateTo) {
            const [j, m] = dateToRaw.split('/');
            dateToApi = `${annee}-${m}-${j}`;
          }
        } else if (anneeSelectionnee) {
          dateFromApi = `${anneeSelectionnee}-01-01`;
          dateToApi = `${anneeSelectionnee}-12-31`;
        }

        const idsVisibles = Array.from(
          document.querySelectorAll('#listeIndividus .checkbox-label')
        ).filter(l => l.style.display !== 'none' && l.dataset.sansGeom !== 'true')
         .map(l => l.querySelector('input')?.value)
         .filter(Boolean);

        const idsAChercher = selectedIds.length > 0 ? selectedIds : idsVisibles;

        if (idsAChercher.length === 0) {
          locations = [];
        } else if (dateFromApi && dateToApi) {
          locations = await fetchLastLocationsParPeriode(token, {
            ani_id: idsAChercher,
            date_from: dateFromApi,
            date_to: dateToApi,
            include_outliers: filters.include_outliers
          });
        } else {
          // Saison sans année → une requête par année × saison cochée, garder la plus récente par animal
          const anneeOptions = Array.from(
            document.querySelectorAll('#selectAnnee option')
          ).map(o => o.value).filter(v => v !== '');

          if (anneeOptions.length > 0) {
            const SAISONS_BORNES = {
              hiver:     { from: '01-01', to: '03-31' },
              printemps: { from: '04-01', to: '06-30' },
              ete:       { from: '07-01', to: '10-15' },
              rut:       { from: '10-16', to: '12-31' }
            };
            const saisonsCochees = Object.entries(saisons).filter(([, v]) => v).map(([k]) => k);
            const promises = [];
            anneeOptions.forEach(annee => {
              saisonsCochees.forEach(saisonKey => {
                const bornes = SAISONS_BORNES[saisonKey];
                promises.push(
                  fetchLastLocationsParPeriode(token, {
                    ani_id: idsAChercher,
                    date_from: `${annee}-${bornes.from}`,
                    date_to: `${annee}-${bornes.to}`,
                    include_outliers: filters.include_outliers
                  })
                );
              });
            });
            const results = await Promise.all(promises);
            const locParAnimal = new Map();
            results.flat().forEach(loc => {
              const existing = locParAnimal.get(String(loc.ani_id));
              const dateNew = loc.loc_datetime_local || loc.loc_date_local || '';
              const dateExisting = existing ? (existing.loc_datetime_local || existing.loc_date_local || '') : '';
              if (!existing || dateNew > dateExisting) {
                locParAnimal.set(String(loc.ani_id), loc);
              }
            });
            locations = Array.from(locParAnimal.values());
          } else {
            locations = await fetchAllLastLocations(token, {
              population: filters.population,
              include_outliers: filters.include_outliers
            });
          }
        }
      } else {
        locations = await fetchAllLastLocations(token, {
          population: filters.population,
          include_outliers: filters.include_outliers
        });
      }

      // Filtres côté JS (sexe, gestionnaire, programmation, suivis)
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
      if (filters.programmation) {
        locations = locations.filter(l =>
          String(getProgrammationsMap().get(String(l.ani_id))) === filters.programmation
        );
      }

      if (suivisSeulement) locations = locations.filter(l => l.cor_date_fin === null);

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
      let dateFromApi = null;
      let dateToApi = null;
      const anneeRequete = anneeSelectionnee || new Date().getFullYear();
      if (aDateFrom) {
        const [j, m] = dateFromRaw.split('/');
        dateFromApi = `${anneeRequete}-${m}-${j}`;
      }
      if (aDateTo) {
        const [j, m] = dateToRaw.split('/');
        dateToApi = `${anneeRequete}-${m}-${j}`;
      }

      if (aDateFrom && aDateTo) {
        // Avec période → une seule requête, toutes les positions sur la plage
        const trajFilters = {
          ...filters,
          date_from: dateFromApi,
          date_to: dateToApi,
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

        if (filters.include_outliers && (!aDateFrom || !aDateTo)) {
          showToast('Veuillez sélectionner une période');
          filters.include_outliers = false;
        }

        const promises = selectedIds.map(async id => {
          // Requête 1 — positions valides
          const valides = await fetchLocations(token, {
            ...filters,
            date_from: dateFromApi,
            date_to: dateToApi,
            ani_id: [id],
            limit: 30,
            include_outliers: false
          });

          // Requête 2 — outliers uniquement si case cochée
          let outliers = [];
          if (filters.include_outliers) {
            const toutesPositions = await fetchLocations(token, {
              ...filters,
              date_from: dateFromApi,
              date_to: dateToApi,
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

function toMMJJ(ddmm) {
  const [j, m] = ddmm.split('/');
  return parseInt(m) * 100 + parseInt(j);
}

function correspondALaSaison(date, saisons) {
  const mois = date.getMonth() + 1; // 1 à 12
  const jour = date.getDate();

  const estHiver =
    (mois >= 1 && mois <= 3);

  const estPrintemps =
    (mois === 4 || mois === 5) ||
    (mois === 6 && jour <= 30);

  const estEte =
    (mois === 7) ||
    (mois === 8) ||
    (mois === 9) ||
    (mois === 10 && jour <= 15);

  const estRut =
    (mois === 10 && jour >= 16) ||
    mois === 11 ||
    mois === 12;

  return (
    (saisons.hiver && estHiver) ||
    (saisons.printemps && estPrintemps) ||
    (saisons.ete && estEte) ||
    (saisons.rut && estRut)
  );
}

function toMMJJfilters(ddmm) {
  const [j, m] = ddmm.split('/');
  return parseInt(m) * 100 + parseInt(j);
}

function correspondALaSaisonJS(date, saisons) {
  const mois = date.getMonth() + 1;
  const jour = date.getDate();
  const estHiver = mois >= 1 && mois <= 3;
  const estPrintemps = (mois === 4 || mois === 5) || (mois === 6 && jour <= 30);
  const estEte = mois === 7 || mois === 8 || mois === 9 || (mois === 10 && jour <= 15);
  const estRut = (mois === 10 && jour >= 16) || mois === 11 || mois === 12;
  return (saisons.hiver && estHiver) || (saisons.printemps && estPrintemps) ||
         (saisons.ete && estEte) || (saisons.rut && estRut);
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

let _derniereRequeteId = 0;

/**
 * Met à jour la liste des individus selon les dates sélectionnées
 * sans recharger la carte — appelée au changement de date
 */
export async function mettreAJourListeParDate() {
  if (window._filtreListeDirectIds) {
    const ids = window._filtreListeDirectIds;
    window._filtreListeDirectIds = null;
    _appliquerFiltreListeAvecIds(ids);
    return;
  }

  const requeteId = ++_derniereRequeteId;
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  const annee = document.getElementById('selectAnnee')?.value;

  const saisons = {
    rut: document.getElementById('checkRut')?.checked || false,
    hiver: document.getElementById('checkHiver')?.checked || false,
    printemps: document.getElementById('checkPrintemps')?.checked || false,
    ete: document.getElementById('checkEte')?.checked || false
  };
  const saisonActive = Object.values(saisons).some(v => v);

  if (!dateFrom && !dateTo && !saisonActive && !annee) {
    if (requeteId !== _derniereRequeteId) return;
    filtrerListeIndividus();
    return;
  }

  if (annee && !dateFrom && !dateTo && !saisonActive) {
    try {
      const idsAvecDonnees = new Set(
        await fetchAnimalIdsParPeriode(getCurrentToken(), {
          date_from: `${annee}-01-01`,
          date_to: `${annee}-12-31`,
          include_outliers: false
        })
      );
      if (requeteId !== _derniereRequeteId) return;
      _appliquerFiltreListeAvecIds(idsAvecDonnees);
    } catch (err) {
      console.error('Erreur mise à jour liste par date:', err);
    }
    return;
  }

  if (annee) {
    try {
      let dateFromApi = null;
      let dateToApi = null;

      if (dateFrom && /^\d{2}\/\d{2}$/.test(dateFrom)) {
        const [j, m] = dateFrom.split('/');
        dateFromApi = `${annee}-${m}-${j}`;
      }
      if (dateTo && /^\d{2}\/\d{2}$/.test(dateTo)) {
        const [j, m] = dateTo.split('/');
        dateToApi = `${annee}-${m}-${j}`;
      }

      if (saisonActive && !dateFromApi && !dateToApi) {
        const SAISONS_BORNES = {
          hiver:     { from: `${annee}-01-01`, to: `${annee}-03-31` },
          printemps: { from: `${annee}-04-01`, to: `${annee}-06-30` },
          ete:       { from: `${annee}-07-01`, to: `${annee}-10-15` },
          rut:       { from: `${annee}-10-16`, to: `${annee}-12-31` }
        };
        const idsUnion = new Set();
        const promises = Object.entries(saisons)
          .filter(([, cochee]) => cochee)
          .map(([key]) => {
            const bornes = SAISONS_BORNES[key];
            return fetchAnimalIdsParPeriode(getCurrentToken(), {
              date_from: bornes.from,
              date_to: bornes.to,
              include_outliers: false
            });
          });
        const results = await Promise.all(promises);
        results.forEach(ids => ids.forEach(id => idsUnion.add(String(id))));
        if (requeteId !== _derniereRequeteId) return;
        _appliquerFiltreListeAvecIds(idsUnion);
        return;
      }

      if (dateFromApi || dateToApi) {
        const idsAvecDonnees = new Set(
          await fetchAnimalIdsParPeriode(getCurrentToken(), {
            date_from: dateFromApi,
            date_to: dateToApi,
            include_outliers: false
          })
        );
        if (requeteId !== _derniereRequeteId) return;
        _appliquerFiltreListeAvecIds(idsAvecDonnees);
        return;
      }

    } catch (err) {
      console.error('Erreur mise à jour liste par date:', err);
    }
  } else {
    // Sans année → fetchAnimalIdsParPeriode union sur toutes les années disponibles
    try {
      const SAISONS_BORNES = {
        hiver:     { from: '01-01', to: '03-31' },
        printemps: { from: '04-01', to: '06-30' },
        ete:       { from: '07-01', to: '10-15' },
        rut:       { from: '10-16', to: '12-31' }
      };

      const anneeOptions = Array.from(
        document.querySelectorAll('#selectAnnee option')
      ).map(o => o.value).filter(v => v !== '');

      const aDateFrom = dateFrom && /^\d{2}\/\d{2}$/.test(dateFrom);
      const aDateTo = dateTo && /^\d{2}\/\d{2}$/.test(dateTo);
      const idsUnion = new Set();

      if (saisonActive && anneeOptions.length > 0) {
        const saisonsCochees = Object.entries(saisons).filter(([, v]) => v).map(([k]) => k);
        const promises = [];
        anneeOptions.forEach(annee => {
          saisonsCochees.forEach(saisonKey => {
            const bornes = SAISONS_BORNES[saisonKey];
            promises.push(
              fetchAnimalIdsParPeriode(getCurrentToken(), {
                date_from: `${annee}-${bornes.from}`,
                date_to: `${annee}-${bornes.to}`,
                include_outliers: false
              })
            );
          });
        });
        const results = await Promise.all(promises);
        results.forEach(ids => ids.forEach(id => idsUnion.add(String(id))));

      } else if (aDateFrom || aDateTo) {
        const promises = anneeOptions.map(annee => {
          let dateFromApi = null;
          let dateToApi = null;
          if (aDateFrom) {
            const [j, m] = dateFrom.split('/');
            dateFromApi = `${annee}-${m}-${j}`;
          }
          if (aDateTo) {
            const [j, m] = dateTo.split('/');
            dateToApi = `${annee}-${m}-${j}`;
          }
          return fetchAnimalIdsParPeriode(getCurrentToken(), {
            date_from: dateFromApi,
            date_to: dateToApi,
            include_outliers: false
          });
        });
        const results = await Promise.all(promises);
        results.forEach(ids => ids.forEach(id => idsUnion.add(String(id))));
      }

      if (requeteId !== _derniereRequeteId) return;
      _appliquerFiltreListeAvecIds(idsUnion);

    } catch (err) {
      console.error('Erreur mise à jour liste par date:', err);
    }
  }
}

function _appliquerFiltreListeAvecIds(idsAvecDonnees) {
  const searchVal = document.getElementById('searchIndividu')?.value?.toLowerCase()?.trim() || '';
  document.querySelectorAll('#listeIndividus .checkbox-label').forEach(label => {
    if (label.dataset.sansGeom === 'true') { label.style.display = 'none'; return; }
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

    const visible = matchPeriode && matchSexe && matchGestionnaire && matchPopulation && matchClasse && matchSuivis && matchProgrammation;
    label.dataset.masqueParDate = visible ? 'false' : 'true';
    label.style.display = (visible && (!searchVal || label.textContent.toLowerCase().includes(searchVal))) ? 'flex' : 'none';
  });
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
