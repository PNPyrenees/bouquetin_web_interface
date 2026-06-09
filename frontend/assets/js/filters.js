import { fetchLocations, fetchLastLocationsParPeriode, fetchAnimalIdsParPeriode, fetchAllLastLocations, fetchCountLocations } from './api.js';
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

export function getPeriodesActives() {
  const annee = document.getElementById('selectAnnee')?.value || '';
  const dateFrom = document.getElementById('dateFrom')?.value || '';
  const dateTo = document.getElementById('dateTo')?.value || '';

  const saisons = {
    hiver: document.getElementById('checkHiver')?.checked || false,
    printemps: document.getElementById('checkPrintemps')?.checked || false,
    ete: document.getElementById('checkEte')?.checked || false,
    rut: document.getElementById('checkRut')?.checked || false
  };

  const SAISONS_BORNES = {
    hiver: { from: '01-01', to: '03-31' },
    printemps: { from: '04-01', to: '06-30' },
    ete: { from: '07-01', to: '10-15' },
    rut: { from: '10-16', to: '12-31' }
  };

  const saisonsCochees = Object.entries(saisons).filter(([, v]) => v).map(([k]) => k);
  const saisonActive = saisonsCochees.length > 0;

  if (saisonActive && saisonsCochees.length > 1) {
    if (annee) {
      return saisonsCochees.map(k => ({
        from: `${annee}-${SAISONS_BORNES[k].from}`,
        to: `${annee}-${SAISONS_BORNES[k].to}`,
        source: k
      }));
    }

    const anneeOptions = (window._anneeOptions || []).map(String);
    const periodes = [];
    anneeOptions.forEach(a => {
      saisonsCochees.forEach(k => {
        periodes.push({
          from: `${a}-${SAISONS_BORNES[k].from}`,
          to: `${a}-${SAISONS_BORNES[k].to}`,
          source: k
        });
      });
    });
    return periodes;
  }

  if (saisonActive && saisonsCochees.length === 1 && dateFrom && dateTo &&
      /^\d{2}\/\d{2}$/.test(dateFrom) && /^\d{2}\/\d{2}$/.test(dateTo) &&
      window._saisonDatesModifiees === true) {
    if (annee) {
      const [jFrom, mFrom] = dateFrom.split('/');
      const [jTo, mTo] = dateTo.split('/');
      return [{ from: `${annee}-${mFrom}-${jFrom}`, to: `${annee}-${mTo}-${jTo}`, source: 'custom' }];
    }

    const anneeOptions = Array.from(
      document.querySelectorAll('#selectAnnee option')
    ).map(o => o.value).filter(v => v !== '');
    return anneeOptions.map(a => {
      const [jFrom, mFrom] = dateFrom.split('/');
      const [jTo, mTo] = dateTo.split('/');
      return { from: `${a}-${mFrom}-${jFrom}`, to: `${a}-${mTo}-${jTo}`, source: 'custom' };
    });
  }

if (saisonActive && saisonsCochees.length === 1) {
  const k = saisonsCochees[0];

  // Si une année est choisie → comportement actuel
  if (annee) {
    return [{
      from: `${annee}-${SAISONS_BORNES[k].from}`,
      to: `${annee}-${SAISONS_BORNES[k].to}`,
      source: k
    }];
  }

  // Sinon une seule période globale au lieu de 13 requêtes
  const annees = (window._anneeOptions || [])
    .map(Number)
    .sort((a, b) => a - b);

  if (annees.length === 0) return [];

  return [{
    from: `${annees[0]}-${SAISONS_BORNES[k].from}`,
    to: `${annees[annees.length - 1]}-${SAISONS_BORNES[k].to}`,
    source: k
  }];
}

  if (dateFrom || dateTo) {
    if (annee) {
      let from = null;
      let to = null;
      if (dateFrom && /^\d{2}\/\d{2}$/.test(dateFrom)) {
        const [j, m] = dateFrom.split('/');
        from = `${annee}-${m}-${j}`;
      }
      if (dateTo && /^\d{2}\/\d{2}$/.test(dateTo)) {
        const [j, m] = dateTo.split('/');
        to = `${annee}-${m}-${j}`;
      }
      return [{ from, to, source: 'dates' }];
    }

    const anneeOptions = (window._anneeOptions || []).map(String);
    return anneeOptions.map(a => {
      let from = null;
      let to = null;
      if (dateFrom && /^\d{2}\/\d{2}$/.test(dateFrom)) {
        const [j, m] = dateFrom.split('/');
        from = `${a}-${m}-${j}`;
      }
      if (dateTo && /^\d{2}\/\d{2}$/.test(dateTo)) {
        const [j, m] = dateTo.split('/');
        to = `${a}-${m}-${j}`;
      }
      return { from, to, source: 'dates' };
    });
  }

  if (annee) {
    return [{ from: `${annee}-01-01`, to: `${annee}-12-31`, source: 'annee' }];
  }

  return [];
}

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

    const dateFromRaw = filters.date_from; // format jj/mm
    const dateToRaw = filters.date_to;     // format jj/mm
    const anneeSelectionnee = document.getElementById('selectAnnee')?.value;
    const aDateFrom = dateFromRaw && /^\d{2}\/\d{2}$/.test(dateFromRaw);
    const aDateTo = dateToRaw && /^\d{2}\/\d{2}$/.test(dateToRaw);

    let locations;

    if (isPositionMode) {
      const periodes = getPeriodesActives();

      if (periodes.length === 0) {
        // Sans filtre temporel → dernière position par animal (comportement initial)
        locations = await fetchAllLastLocations(token, {
          population: filters.population,
          include_outliers: filters.include_outliers
        });
        if (selectedIds.length > 0) {
          const selectedSet = new Set(selectedIds.map(String));
          locations = locations.filter(l => selectedSet.has(String(l.ani_id)));
        }
      } else {
        // Avec filtre temporel → toutes les positions (comme trajectoire mais sans traits)
        const periode = periodes.length === 1 ? periodes[0] : {
          from: periodes.reduce((min, p) => p.from < min ? p.from : min, periodes[0].from),
          to: periodes.reduce((max, p) => p.to > max ? p.to : max, periodes[0].to)
        };

        const idsAChercher = selectedIds.length > 0 ? selectedIds :
          Array.from(document.querySelectorAll('#listeIndividus .checkbox-label'))
            .filter(l => l.style.display !== 'none' && l.dataset.sansGeom !== 'true' && l.dataset.masqueParDate !== 'true')
            .map(l => l.querySelector('input')?.value)
            .filter(Boolean);

        const countFilters = {
          ani_id: idsAChercher,
          date_from: periode.from,
          date_to: periode.to,
          include_outliers: filters.include_outliers
        };

        // Étape 1 — Compter les résultats AVANT de télécharger
        const totalPositions = await fetchCountLocations(token, countFilters);
        const SEUIL = 10000;
        let confirmed = 999999;

        if (totalPositions > SEUIL) {
          confirmed = await new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
              position: fixed; top: 0; left: 0; width: 100%; height: 100%;
              background: rgba(0,0,0,0.5); z-index: 9999;
              display: flex; align-items: center; justify-content: center;
            `;
            overlay.innerHTML = `
              <div style="
                background: white; border-radius: 2px; padding: 24px;
                max-width: 440px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
              ">
                <h3 style="margin: 0 0 12px; color: #2D6A4F; font-size: 16px;">
                  Volume de données important
                </h3>
                <p style="margin: 0 0 8px; color: #333; font-size: 14px;">
                  Votre requête retourne <strong>${totalPositions.toLocaleString('fr-FR')} positions</strong>.
                </p>
                <p style="margin: 0 0 20px; color: #666; font-size: 13px;">
                  L'affichage de ce volume peut entraîner des lenteurs importantes selon les performances de votre ordinateur.
                  Nous vous recommandons d'affiner vos filtres (période, individus, saison) pour réduire le nombre de résultats.
                </p>
                <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
                  <button id="popupAnnuler" style="
                    padding: 8px 16px; border: 1px solid #ccc;
                    border-radius: 4px; background: white; cursor: pointer;
                    font-size: 13px; color: #666;
                  ">Annuler</button>
                  <button id="popupLimiter" style="
                    padding: 8px 16px; border: none;
                    border-radius: 4px; background: #E07B39; cursor: pointer;
                    font-size: 13px; color: white;
                  ">Afficher les 10 000 dernières</button>
                  <button id="popupConfirmer" style="
                    padding: 8px 16px; border: none;
                    border-radius: 4px; background: #2D6A4F; cursor: pointer;
                    font-size: 13px; color: white;
                  ">Afficher tout</button>
                </div>
              </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('popupAnnuler').onclick = () => {
              overlay.remove();
              resolve(null);
            };
            document.getElementById('popupLimiter').onclick = () => {
              overlay.remove();
              resolve(10000);
            };
            document.getElementById('popupConfirmer').onclick = () => {
              overlay.remove();
              resolve(999999);
            };
          });

          if (confirmed === null) {
            hideMapLoading();
            unlockSidebar();
            if (btnApply) {
              btnApply.disabled = false;
              btnApply.textContent = 'Appliquer les filtres';
            }
            return;
          }
        }

        // Étape 2 — Télécharger toutes les positions
        locations = await fetchLocations(token, {
          ...countFilters,
          limit: confirmed
        });

        // Filtrer par saisons cochées si nécessaire (pour saison sans année)
        const saisonActive = Object.values({
          hiver: document.getElementById('checkHiver')?.checked || false,
          printemps: document.getElementById('checkPrintemps')?.checked || false,
          ete: document.getElementById('checkEte')?.checked || false,
          rut: document.getElementById('checkRut')?.checked || false
        }).some(Boolean);

        if (saisonActive) {
          const saisons = {
            hiver: document.getElementById('checkHiver')?.checked || false,
            printemps: document.getElementById('checkPrintemps')?.checked || false,
            ete: document.getElementById('checkEte')?.checked || false,
            rut: document.getElementById('checkRut')?.checked || false
          };
          locations = locations.filter(loc => {
            const d = loc.loc_datetime_local || loc.loc_date_local;
            if (!d) return false;
            return correspondALaSaisonJS(new Date(d), saisons);
          });
        }
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

      // Rendu carte
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
      }, 400);
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

  const annee = document.getElementById('selectAnnee')?.value || '';
  const saisons = {
    hiver: document.getElementById('checkHiver')?.checked || false,
    printemps: document.getElementById('checkPrintemps')?.checked || false,
    ete: document.getElementById('checkEte')?.checked || false,
    rut: document.getElementById('checkRut')?.checked || false
  };
  const saisonActive = Object.values(saisons).some(Boolean);

  if (saisonActive && !annee) {
    try {
      const SAISONS_BORNES = {
        hiver:     { from: '01-01', to: '03-31' },
        printemps: { from: '04-01', to: '06-30' },
        ete:       { from: '07-01', to: '10-15' },
        rut:       { from: '10-16', to: '12-31' }
      };
      const saisonsCochees = Object.entries(saisons)
        .filter(([, v]) => v).map(([k]) => k);
      const anneesSorted = (window._anneeOptions || []).map(String);

      const promises = [];
      anneesSorted.forEach(a => {
        saisonsCochees.forEach(k => {
          promises.push(
            fetchAnimalIdsParPeriode(getCurrentToken(), {
              date_from: `${a}-${SAISONS_BORNES[k].from}`,
              date_to: `${a}-${SAISONS_BORNES[k].to}`,
              include_outliers: false
            })
          );
        });
      });

      const results = await Promise.all(promises);
      const idsUnion = new Set();
      results.forEach(ids => ids.forEach(id => idsUnion.add(String(id))));
      if (requeteId !== _derniereRequeteId) return;
      _appliquerFiltreListeAvecIds(idsUnion);
    } catch (err) {
      console.error('Erreur mettreAJourListeParDate saison sans année:', err);
    }
    return;
  }

  const periodes = getPeriodesActives();

  console.log('[mettreAJourListeParDate] requeteId:', requeteId, '_derniereRequeteId:', _derniereRequeteId);
  console.log('[mettreAJourListeParDate] periodes:', JSON.stringify(periodes));

  if (periodes.length === 0) {
    if (requeteId !== _derniereRequeteId) return;
    console.log('[mettreAJourListeParDate] → aucune période, filtrerListeIndividus');
    filtrerListeIndividus();
    return;
  }

  try {
    console.log('[mettreAJourListeParDate] → lancement', periodes.length, 'requête(s) fetchAnimalIdsParPeriode');
    const idsUnion = new Set();
    const promises = periodes.map(p =>
      fetchAnimalIdsParPeriode(getCurrentToken(), {
        date_from: p.from,
        date_to: p.to,
        include_outliers: false
      })
    );
    const results = await Promise.all(promises);
    console.log('[mettreAJourListeParDate] → résultats reçus, tailles:', results.map(r => r.length));
    results.forEach(ids => ids.forEach(id => idsUnion.add(String(id))));
    console.log('[mettreAJourListeParDate] → idsUnion.size:', idsUnion.size);
    if (requeteId !== _derniereRequeteId) {
      console.log('[mettreAJourListeParDate] → requête obsolète, abandon');
      return;
    }
    _appliquerFiltreListeAvecIds(idsUnion);
    console.log('[mettreAJourListeParDate] → liste mise à jour');
  } catch (err) {
    console.error('[mettreAJourListeParDate] Erreur:', err);
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
