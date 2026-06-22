import { fetchLocations, fetchLastLocationsParPeriode, fetchAnimalIdsParPeriode, fetchAllLastLocations, fetchCountLocations, fetchNDernieresLocalisations } from './api.js';
import { renderPoints, clearMapPoints, updateMapSize, getMap, getGpsSource, renderTrajectoire, clearTrajectoire } from './map.js';
import { mettreAJourPanneau, setLabelDatetime, ouvrirPanneauSiNecessaire, mettreAJourIndividus } from './panel.js';
import { ZOOM_FILTER_SINGLE, ZOOM_FILTER_MULTI, ZOOM_TRAJECTOIRE_SINGLE, ZOOM_TRAJECTOIRE_MULTI, SEUIL_ALERTE_VOLUME, SAISONS_CONFIG } from './config.js';
import {
  getAnimals, getActiveIds, getCurrentToken, getProgrammationsMap,
  enrichirLocations, enrichirAnimauxAvecPositions,
  showMapLoading, hideMapLoading,
  lockSidebar, unlockSidebar,
  showToast, mettreAJourLegende,
  ajouterBadge, supprimerBadgeById, mettreAJourFiltresActifs,
  mettreAJourSelectN, mettreAJourBoutonAppliquer,
  setDernierNPositions, setDernierNTrajectoire,
  mettreAJourBadgeNPositions
} from './app.js';

export function getPeriodesActives() {
  // CHEMIN 1 — Periode (champs dateFrom/dateTo avec JJ/MM/AAAA)
  const dateFrom = document.getElementById('dateFrom')?.value || '';
  const dateTo = document.getElementById('dateTo')?.value || '';
  const isPeriode = /^\d{2}\/\d{2}\/\d{4}$/.test(dateFrom) || /^\d{2}\/\d{2}\/\d{4}$/.test(dateTo);

  if (isPeriode) {
    let from = null;
    let to = null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateFrom)) {
      const [j, m, a] = dateFrom.split('/');
      from = `${a}-${m}-${j}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateTo)) {
      const [j, m, a] = dateTo.split('/');
      to = `${a}-${m}-${j}`;
    }
    return [{ from, to, source: 'periode' }];
  }

  // CHEMIN 2 — Saisonnalite (selectAnnee + saisonFrom/saisonTo JJ/MM)
  const selectAnneeEl = document.getElementById('selectAnnee');
  const annees = selectAnneeEl?.tomselect
    ? Object.values(selectAnneeEl.tomselect.items).map(item => typeof item === 'string' ? item : item?.value).filter(Boolean)
    : (selectAnneeEl?.value ? [selectAnneeEl.value] : []);

  const toutesAnnees = annees.includes('toutes');
  const anneesReelles = annees.filter(a => a !== 'toutes');
  const anneesEffectives = toutesAnnees ? [] : anneesReelles;

  const saisonFrom = document.getElementById('saisonFrom')?.value || '';
  const saisonTo = document.getElementById('saisonTo')?.value || '';
  const hasSaisonPeriode = /^\d{2}\/\d{2}$/.test(saisonFrom) && /^\d{2}\/\d{2}$/.test(saisonTo);

  if (anneesEffectives.length > 0 && hasSaisonPeriode) {
    // N annees x 1 periode recurrente
    const [jFrom, mFrom] = saisonFrom.split('/');
    const [jTo, mTo] = saisonTo.split('/');

    // Gestion periode a cheval (ex: Hiver 01/01 -> 31/03 : meme annee)
    // ou periode chevauchant deux annees (ex: 21/12 -> 20/03)
    const fromMonthDay = parseInt(mFrom) * 100 + parseInt(jFrom);
    const toMonthDay = parseInt(mTo) * 100 + parseInt(jTo);
    const chevauche = fromMonthDay > toMonthDay; // ex: 12/21 > 03/20

    const periodes = [];
    anneesEffectives.forEach(annee => {
      const a = parseInt(annee);
      if (chevauche) {
        // Periode a cheval : debut en annee A, fin en annee A+1
        periodes.push({
          from: `${a}-${mFrom}-${jFrom}`,
          to: `${a + 1}-${mTo}-${jTo}`,
          source: 'saisonnalite',
          annee: annee
        });
      } else {
        periodes.push({
          from: `${a}-${mFrom}-${jFrom}`,
          to: `${a}-${mTo}-${jTo}`,
          source: 'saisonnalite',
          annee: annee
        });
      }
    });
    return periodes;
  }

  if (anneesEffectives.length > 0 && !hasSaisonPeriode) {
    // Annees seules sans periode saisonniere — une periode par annee (01/01 -> 31/12)
    return anneesEffectives.map(annee => ({
      from: `${annee}-01-01`,
      to: `${annee}-12-31`,
      source: 'annee',
      annee
    }));
  }

  if (hasSaisonPeriode && anneesEffectives.length === 0) {
    // Periode saisonniere sans annee — toutes les annees disponibles
    const [jFrom, mFrom] = saisonFrom.split('/');
    const [jTo, mTo] = saisonTo.split('/');
    const fromMonthDay = parseInt(mFrom) * 100 + parseInt(jFrom);
    const toMonthDay = parseInt(mTo) * 100 + parseInt(jTo);
    const chevauche = fromMonthDay > toMonthDay;

    const anneeOptions = (window._anneeOptions || []).map(String).map(Number).sort((a, b) => a - b);
    if (anneeOptions.length === 0) return [];

    if (chevauche) {
      return anneeOptions.map(a => ({
        from: `${a}-${mFrom}-${jFrom}`,
        to: `${a + 1}-${mTo}-${jTo}`,
        source: 'saisonnalite_all'
      }));
    } else {
      return [{
        from: `${anneeOptions[0]}-${mFrom}-${jFrom}`,
        to: `${anneeOptions[anneeOptions.length - 1]}-${mTo}-${jTo}`,
        source: 'saisonnalite_all'
      }];
    }
  }

  return [];
}

/**
 * APPLICATION DES FILTRES
 * Récupère les données filtrées depuis l'API et met à jour la carte.
 */
export async function applyFilters(token, modeForce = null, nOverride = null) {
  const btnApply = document.getElementById('btnApplyFilters');
  showMapLoading();
  lockSidebar();

  // Collecte des filtres
  const filters = {
    ani_id: Array.from(document.querySelectorAll('#listeIndividus input:checked'))
      .filter(cb => {
        const label = cb.closest('label');
        return !label || label.dataset.cocheAuto !== 'true';
      })
      .map(cb => cb.value),
    date_from: document.getElementById('dateFrom')?.value || '',
    date_to: document.getElementById('dateTo')?.value || '',
    sexe: document.getElementById('selectSexe')?.value || '',
    gestionnaire: document.getElementById('selectGestionnaire')?.value || '',
    population: document.getElementById('selectPopulation')?.value || '',
    include_outliers: document.getElementById('checkAberrantes')?.checked || false,
    programmation: document.getElementById('selectProgrammation')?.value || ''
  };

  if (btnApply) {
    btnApply.disabled = true;
    btnApply.textContent = 'Chargement...';
  }

  try {
    const isPositionMode = modeForce !== null
      ? modeForce === 'positions'
      : document.getElementById('btnPositions').classList.contains('active');
    const selectedIds = filters.ani_id;
    const suivisSeulement = document.getElementById('checkSuivis')?.checked || false;

    let locations;

    if (isPositionMode) {
      const periodes = getPeriodesActives();
      const inputN = document.getElementById('inputNDernieres');
      const nModeToutes = document.getElementById('nModeToutes');
      const nVal = nOverride !== null ? String(nOverride) : (inputN?.value || '5');
      const toutesPositions = nModeToutes?.checked || nVal === 'toutes';
      const n = toutesPositions ? null : (parseInt(nVal) || 5);

      if (periodes.length === 0) {
        const filtreAttributaireActif =
          !!filters.sexe || !!filters.gestionnaire || !!filters.population ||
          !!document.getElementById('selectClasseAge')?.value ||
          !!filters.programmation ||
          Array.from(document.querySelectorAll('#listeIndividus input:checked'))
            .filter(cb => {
              const label = cb.closest('label');
              return label && label.dataset.cocheAuto !== 'true';
            }).length > 0 ||
          !!filters.include_outliers;

        if (!filtreAttributaireActif) {

          let idsActifs = suivisSeulement
            ? Array.from(getActiveIds()).map(String)
            : getAnimals().map(a => String(a.ani_id));

          if (toutesPositions) {
            const countFilters = {
              ani_id: idsActifs,
              include_outliers: filters.include_outliers
            };
            const totalPositions = await fetchCountLocations(token, countFilters);
            const SEUIL = SEUIL_ALERTE_VOLUME;
            let confirmed = 500000;
            if (totalPositions > SEUIL) {
              const modal = document.getElementById('modalVolume');
              document.getElementById('modalVolumeCount').textContent = totalPositions.toLocaleString('fr-FR');
              modal.style.display = 'flex';
              confirmed = await new Promise(resolve => {
                document.getElementById('modalVolumeBtnAnnuler').onclick = () => { modal.style.display = 'none'; resolve(null); };
                document.getElementById('modalVolumeBtnConfirmer').onclick = () => { modal.style.display = 'none'; resolve(500000); };
              });
              if (confirmed === null) {
                hideMapLoading();
                unlockSidebar();
                if (btnApply) { btnApply.textContent = 'Appliquer les filtres'; }
                mettreAJourBoutonAppliquer();
                return false;
              }
            }
            locations = await fetchLocations(token, { ...countFilters, limit: confirmed });
          } else if (n === 1) {
            locations = await fetchAllLastLocations(token, {
              population: filters.population,
              include_outliers: filters.include_outliers
            });
            if (suivisSeulement) {
              locations = locations.filter(l => getActiveIds().has(Number(l.ani_id)));
            }
          } else {
            locations = await fetchNDernieresLocalisations(token, idsActifs, n);
          }
        } else {
          // Un ou plusieurs filtres actifs → positions historiques correspondantes
          const idsAChercher = selectedIds.length > 0 ? selectedIds :
            Array.from(document.querySelectorAll('#listeIndividus .checkbox-label'))
              .filter(l => l.style.display !== 'none' && l.dataset.sansGeom !== 'true' && l.dataset.masqueParDate !== 'true')
              .map(l => l.querySelector('input')?.value)
              .filter(Boolean);

          if (idsAChercher.length === 0) {
            locations = [];
          } else if (!toutesPositions && n) {
            // N positions par animal — appel API direct, pas de comptage ni de modale
            const nPromises = idsAChercher.map(id =>
              fetchLocations(token, { ani_id: id, include_outliers: filters.include_outliers, limit: n })
            );
            locations = (await Promise.all(nPromises)).flat();
          } else {
            const countFilters = {
              ani_id: idsAChercher,
              include_outliers: filters.include_outliers
            };

            const totalPositions = await fetchCountLocations(token, countFilters);
            const SEUIL = SEUIL_ALERTE_VOLUME;
            let confirmed = 500000;

            if (totalPositions > SEUIL) {
              const modal = document.getElementById('modalVolume');
              document.getElementById('modalVolumeCount').textContent = totalPositions.toLocaleString('fr-FR');
              modal.style.display = 'flex';

              confirmed = await new Promise(resolve => {
                document.getElementById('modalVolumeBtnAnnuler').onclick = () => { modal.style.display = 'none'; resolve(null); };
                document.getElementById('modalVolumeBtnConfirmer').onclick = () => { modal.style.display = 'none'; resolve(500000); };
              });

              if (confirmed === null) {
                hideMapLoading();
                unlockSidebar();
                if (btnApply) { btnApply.textContent = 'Appliquer les filtres'; }
                mettreAJourBoutonAppliquer();
                return false;
              }
            }

            locations = await fetchLocations(token, {
              ...countFilters,
              limit: confirmed
            });
          }
        }
      } else {
        // Avec periodes — consolider en une seule plage min/max
        const dateMin = periodes.reduce((min, p) => p.from && p.from < min ? p.from : min,
          periodes.find(p => p.from)?.from || '');
        const dateMax = periodes.reduce((max, p) => p.to && p.to > max ? p.to : max,
          periodes.find(p => p.to)?.to || '');
        const hasSaisonnalite = periodes.some(p => p.source === 'saisonnalite' || p.source === 'saisonnalite_all');

        const idsAChercher = selectedIds.length > 0 ? selectedIds :
          Array.from(document.querySelectorAll('#listeIndividus .checkbox-label'))
            .filter(l => l.style.display !== 'none' && l.dataset.sansGeom !== 'true' && l.dataset.masqueParDate !== 'true')
            .map(l => l.querySelector('input')?.value)
            .filter(Boolean);

        const saisonnaliteExacte = hasSaisonnalite
          && periodes.length === 1
          && periodes[0].source === 'saisonnalite';

        const saisonnaliteAllSansAnnee = hasSaisonnalite
          && periodes.some(p => p.source === 'saisonnalite_all');

        if (!toutesPositions && n && (!hasSaisonnalite || saisonnaliteExacte)) {
          // Chemin A+C — API direct par animal, limit:n, dates exactes
          // Couvre : periode dateFrom/dateTo ET saison+1annee precise
          const nPromises = idsAChercher.map(id =>
            fetchLocations(token, {
              ani_id: id,
              date_from: dateMin || null,
              date_to: dateMax || null,
              include_outliers: filters.include_outliers,
              limit: n
            })
          );
          locations = (await Promise.all(nPromises)).flat();

          // Filtre JS saison en finition de precision si saisonnaliteExacte
          if (saisonnaliteExacte) {
            const [jFrom, mFrom] = (document.getElementById('saisonFrom')?.value || '').split('/');
            const [jTo, mTo] = (document.getElementById('saisonTo')?.value || '').split('/');
            if (jFrom && mFrom && jTo && mTo) {
              const fromMD = parseInt(mFrom) * 100 + parseInt(jFrom);
              const toMD = parseInt(mTo) * 100 + parseInt(jTo);
              const chevauche = fromMD > toMD;
              locations = locations.filter(loc => {
                const d = loc.loc_datetime_local || loc.loc_date_local;
                if (!d) return false;
                const date = new Date(d);
                const md = (date.getMonth() + 1) * 100 + date.getDate();
                return chevauche ? (md >= fromMD || md <= toMD) : (md >= fromMD && md <= toMD);
              });
            }
          }
        } else if (!toutesPositions && n && saisonnaliteAllSansAnnee) {
          // Chemin D — saisonnalite sans annee + N : requete par animal x par annee, limit:n chacune
          // Evite le download massif sur toute la plage multi-annees
          const saisonFromVal = document.getElementById('saisonFrom')?.value || '';
          const saisonToVal = document.getElementById('saisonTo')?.value || '';
          const [jFrom, mFrom] = saisonFromVal.split('/');
          const [jTo, mTo] = saisonToVal.split('/');
          const fromMD = parseInt(mFrom) * 100 + parseInt(jFrom);
          const toMD = parseInt(mTo) * 100 + parseInt(jTo);
          const chevauche = fromMD > toMD;

          const anneeOptions = (window._anneeOptions || []).map(Number).sort((a, b) => a - b);

          // Une requete par animal x par annee avec les bornes exactes de la saison
          const requetes = [];
          idsAChercher.forEach(id => {
            anneeOptions.forEach(a => {
              const from = `${a}-${mFrom}-${jFrom}`;
              const to = chevauche ? `${a + 1}-${mTo}-${jTo}` : `${a}-${mTo}-${jTo}`;
              requetes.push(
                fetchLocations(token, {
                  ani_id: id,
                  date_from: from,
                  date_to: to,
                  include_outliers: filters.include_outliers,
                  limit: n
                })
              );
            });
          });

          const resultats = (await Promise.all(requetes)).flat();

          // Fusionner par animal et garder les N plus recentes toutes annees confondues
          const parAnimal = new Map();
          resultats.forEach(loc => {
            const id = String(loc.ani_id);
            if (!parAnimal.has(id)) parAnimal.set(id, []);
            parAnimal.get(id).push(loc);
          });
          locations = Array.from(parAnimal.values()).flatMap(locs =>
            locs.sort((a, b) => {
              const da = a.loc_datetime_local || a.loc_date_local || '';
              const db = b.loc_datetime_local || b.loc_date_local || '';
              return db < da ? -1 : db > da ? 1 : 0;
            }).slice(0, n)
          );
        } else {
          let totalPositions;
          let countFilters;

          if (hasSaisonnalite) {
            // Compte exact par annee — somme de COUNT par tranche saisonniere, aucun download
            const [jFromC, mFromC] = (document.getElementById('saisonFrom')?.value || '').split('/');
            const [jToC, mToC] = (document.getElementById('saisonTo')?.value || '').split('/');
            const fromMDC = parseInt(mFromC) * 100 + parseInt(jFromC);
            const toMDC = parseInt(mToC) * 100 + parseInt(jToC);
            const chevaucheC = fromMDC > toMDC;
            const anneeOptionsCount = (window._anneeOptions || []).map(Number).sort((a, b) => a - b);

            const countPromises = anneeOptionsCount.map(a => {
              const from = `${a}-${mFromC}-${jFromC}`;
              const to = chevaucheC ? `${a + 1}-${mToC}-${jToC}` : `${a}-${mToC}-${jToC}`;
              return fetchCountLocations(token, {
                ani_id: idsAChercher,
                date_from: from,
                date_to: to,
                include_outliers: filters.include_outliers
              });
            });

            const countsParAnnee = await Promise.all(countPromises);
            totalPositions = countsParAnnee.reduce((sum, c) => sum + c, 0);

            countFilters = {
              ani_id: idsAChercher,
              date_from: dateMin || null,
              date_to: dateMax || null,
              include_outliers: filters.include_outliers
            };
          } else {
            countFilters = {
              ani_id: idsAChercher,
              date_from: dateMin || null,
              date_to: dateMax || null,
              include_outliers: filters.include_outliers
            };
            totalPositions = await fetchCountLocations(token, countFilters);
          }
          let confirmed = 500000;

          if (totalPositions > SEUIL_ALERTE_VOLUME) {
            const modal = document.getElementById('modalVolume');
            document.getElementById('modalVolumeCount').textContent = totalPositions.toLocaleString('fr-FR');
            modal.style.display = 'flex';

            confirmed = await new Promise(resolve => {
              document.getElementById('modalVolumeBtnAnnuler').onclick = () => { modal.style.display = 'none'; resolve(null); };
              document.getElementById('modalVolumeBtnConfirmer').onclick = () => { modal.style.display = 'none'; resolve(500000); };
            });

            if (confirmed === null) {
              hideMapLoading();
              unlockSidebar();
              if (btnApply) { btnApply.textContent = 'Appliquer les filtres'; }
              mettreAJourBoutonAppliquer();
              return false;
            }
          }

          locations = await fetchLocations(token, { ...countFilters, limit: confirmed });

          if (hasSaisonnalite) {
            const [jFrom, mFrom] = (document.getElementById('saisonFrom')?.value || '').split('/');
            const [jTo, mTo] = (document.getElementById('saisonTo')?.value || '').split('/');
            if (jFrom && mFrom && jTo && mTo) {
              const fromMD = parseInt(mFrom) * 100 + parseInt(jFrom);
              const toMD = parseInt(mTo) * 100 + parseInt(jTo);
              const chevauche = fromMD > toMD;
              locations = locations.filter(loc => {
                const d = loc.loc_datetime_local || loc.loc_date_local;
                if (!d) return false;
                const date = new Date(d);
                const md = (date.getMonth() + 1) * 100 + date.getDate();
                return chevauche ? (md >= fromMD || md <= toMD) : (md >= fromMD && md <= toMD);
              });
            }
          }

          if (!toutesPositions && n) {
            const nMap = new Map();
            locations.forEach(l => {
              const id = String(l.ani_id);
              if (!nMap.has(id)) nMap.set(id, []);
              nMap.get(id).push(l);
            });
            locations = Array.from(nMap.values()).flatMap(locs =>
              locs.sort((a, b) => {
                const da = a.loc_datetime_local || a.loc_date_local || '';
                const db = b.loc_datetime_local || b.loc_date_local || '';
                return db < da ? -1 : db > da ? 1 : 0;
              }).slice(0, n)
            );
          }
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
      if (suivisSeulement) locations = locations.filter(l => getActiveIds().has(Number(l.ani_id)));

      if (toutesPositions) { setDernierNPositions('toutes'); }
      else if (n) { setDernierNPositions(String(n)); }
      mettreAJourBadgeNPositions();

      // Rendu carte
      locations = enrichirLocations(locations);
      clearTrajectoire();
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
      mettreAJourLegende('positions');
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
      const periodesT = getPeriodesActives();
      let dateFromApi = null;
      let dateToApi = null;
      if (periodesT.length > 0) {
        const p = periodesT.length === 1 ? periodesT[0] : {
          from: periodesT.reduce((min, p) => p.from < min ? p.from : min, periodesT[0].from),
          to: periodesT.reduce((max, p) => p.to > max ? p.to : max, periodesT[0].to)
        };
        dateFromApi = p.from;
        dateToApi = p.to;
      }

      // idsAChercher : individus cochés, sinon individus visibles après filtres (comme en mode Positions)
      const idsAChercher = selectedIds.length > 0 ? selectedIds :
        Array.from(document.querySelectorAll('#listeIndividus .checkbox-label'))
          .filter(l => l.style.display !== 'none' && l.dataset.sansGeom !== 'true' && l.dataset.masqueParDate !== 'true')
          .map(l => l.querySelector('input')?.value)
          .filter(Boolean);
      window._idsAChercherTraj = idsAChercher;

      const inputNTraj = document.getElementById('inputNDernieres');
      const nModeToutesCheck = document.getElementById('nModeToutes');
      const nValTraj = nOverride !== null ? String(nOverride) : (inputNTraj?.value || '25');
      const toutesPositionsTraj = nValTraj === 'toutes' || nModeToutesCheck?.checked;
      const nTraj = toutesPositionsTraj ? null : (parseInt(nValTraj) || 25);

      const hasSaisonnaliteTraj = periodesT.some(p => p.source === 'saisonnalite' || p.source === 'saisonnalite_all');
      const saisonnaliteExacteTraj = hasSaisonnaliteTraj && periodesT.length === 1 && periodesT[0].source === 'saisonnalite';
      const saisonnaliteAllTraj = hasSaisonnaliteTraj && periodesT.some(p => p.source === 'saisonnalite_all');

      if (!dateFromApi && !dateToApi && !toutesPositionsTraj) {
        // Pas de periode — N dernieres localisations par individu, pas de COUNT ni modale
        locations = await fetchNDernieresLocalisations(token, idsAChercher, nTraj);

      } else if (!toutesPositionsTraj && nTraj && (!hasSaisonnaliteTraj || saisonnaliteExacteTraj)) {
        // Chemin A+C Trajectoire — periode simple ou saison+1annee + N
        const nPromisesTraj = idsAChercher.map(id =>
          fetchLocations(token, {
            ani_id: id,
            date_from: dateFromApi,
            date_to: dateToApi,
            include_outliers: false,
            limit: nTraj
          })
        );
        locations = (await Promise.all(nPromisesTraj)).flat();

        if (saisonnaliteExacteTraj) {
          const [jFrom, mFrom] = (document.getElementById('saisonFrom')?.value || '').split('/');
          const [jTo, mTo] = (document.getElementById('saisonTo')?.value || '').split('/');
          if (jFrom && mFrom && jTo && mTo) {
            const fromMD = parseInt(mFrom) * 100 + parseInt(jFrom);
            const toMD = parseInt(mTo) * 100 + parseInt(jTo);
            const chevauche = fromMD > toMD;
            locations = locations.filter(loc => {
              const d = loc.loc_datetime_local || loc.loc_date_local;
              if (!d) return false;
              const date = new Date(d);
              const md = (date.getMonth() + 1) * 100 + date.getDate();
              return chevauche ? (md >= fromMD || md <= toMD) : (md >= fromMD && md <= toMD);
            });
          }
        }

      } else if (!toutesPositionsTraj && nTraj && saisonnaliteAllTraj) {
        // Chemin D Trajectoire — saisonnalite sans annee + N : requete par animal x par annee, limit:n
        const saisonFromVal = document.getElementById('saisonFrom')?.value || '';
        const saisonToVal = document.getElementById('saisonTo')?.value || '';
        const [jFrom, mFrom] = saisonFromVal.split('/');
        const [jTo, mTo] = saisonToVal.split('/');
        const fromMD = parseInt(mFrom) * 100 + parseInt(jFrom);
        const toMD = parseInt(mTo) * 100 + parseInt(jTo);
        const chevauche = fromMD > toMD;
        const anneeOptionsTraj = (window._anneeOptions || []).map(Number).sort((a, b) => a - b);

        const requetesTraj = [];
        idsAChercher.forEach(id => {
          anneeOptionsTraj.forEach(a => {
            const from = `${a}-${mFrom}-${jFrom}`;
            const to = chevauche ? `${a + 1}-${mTo}-${jTo}` : `${a}-${mTo}-${jTo}`;
            requetesTraj.push(
              fetchLocations(token, {
                ani_id: id,
                date_from: from,
                date_to: to,
                include_outliers: false,
                limit: nTraj
              })
            );
          });
        });

        const resultatsTraj = (await Promise.all(requetesTraj)).flat();
        const parAnimalTraj = new Map();
        resultatsTraj.forEach(loc => {
          const id = String(loc.ani_id);
          if (!parAnimalTraj.has(id)) parAnimalTraj.set(id, []);
          parAnimalTraj.get(id).push(loc);
        });
        locations = Array.from(parAnimalTraj.values()).flatMap(locs =>
          locs.sort((a, b) => {
            const da = a.loc_datetime_local || a.loc_date_local || '';
            const db = b.loc_datetime_local || b.loc_date_local || '';
            return db < da ? -1 : db > da ? 1 : 0;
          }).slice(0, nTraj)
        );

      } else {
        // Chemin B Trajectoire — Toutes positions ou cas residuels
        const trajCountFilters = {
          ani_id: idsAChercher,
          date_from: dateFromApi,
          date_to: dateToApi,
          include_outliers: false
        };

        let totalTrajPositions;

        if (hasSaisonnaliteTraj) {
          // Compte exact par annee — somme de COUNT, aucun download
          const saisonFromValTraj = document.getElementById('saisonFrom')?.value || '';
          const saisonToValTraj = document.getElementById('saisonTo')?.value || '';
          const [jFromT, mFromT] = saisonFromValTraj.split('/');
          const [jToT, mToT] = saisonToValTraj.split('/');
          const fromMDT = parseInt(mFromT) * 100 + parseInt(jFromT);
          const toMDT = parseInt(mToT) * 100 + parseInt(jToT);
          const chevaucheT = fromMDT > toMDT;
          const anneeOptionsCountTraj = (window._anneeOptions || []).map(Number).sort((a, b) => a - b);

          const countPromisesTraj = anneeOptionsCountTraj.map(a => {
            const from = `${a}-${mFromT}-${jFromT}`;
            const to = chevaucheT ? `${a + 1}-${mToT}-${jToT}` : `${a}-${mToT}-${jToT}`;
            return fetchCountLocations(token, {
              ani_id: idsAChercher,
              date_from: from,
              date_to: to,
              include_outliers: false
            });
          });

          const countsParAnneeTraj = await Promise.all(countPromisesTraj);
          totalTrajPositions = countsParAnneeTraj.reduce((sum, c) => sum + c, 0);
        } else {
          totalTrajPositions = await fetchCountLocations(token, trajCountFilters);
        }

        let confirmedTraj = 500000;

        if (totalTrajPositions > SEUIL_ALERTE_VOLUME) {
          const modal = document.getElementById('modalVolume');
          document.getElementById('modalVolumeCount').textContent = totalTrajPositions.toLocaleString('fr-FR');

          const sousTexte = modal.querySelector('.modal-volume-sous');
          const texteOriginalSous = sousTexte.textContent;
          sousTexte.textContent = 'Afficher un grand nombre de trajectoires peut rendre la carte illisible avec de nombreux traits superposés, en plus d\'entraîner des lenteurs importantes. Vous pouvez affiner votre recherche avec les filtres de date, saison, sexe, population ou individu pour réduire le nombre de résultats.';

          modal.style.display = 'flex';

          confirmedTraj = await new Promise(resolve => {
            document.getElementById('modalVolumeBtnAnnuler').onclick = () => { modal.style.display = 'none'; resolve(null); };
            document.getElementById('modalVolumeBtnConfirmer').onclick = () => { modal.style.display = 'none'; resolve(500000); };
          });

          sousTexte.textContent = texteOriginalSous;

          if (confirmedTraj === null) {
            hideMapLoading();
            unlockSidebar();
            if (btnApply) { btnApply.textContent = 'Appliquer les filtres'; }
            mettreAJourBoutonAppliquer();
            return false;
          }
        }

        locations = await fetchLocations(token, {
          ...trajCountFilters,
          limit: confirmedTraj
        });

        if (hasSaisonnaliteTraj) {
          const [jFrom, mFrom] = (document.getElementById('saisonFrom')?.value || '').split('/');
          const [jTo, mTo] = (document.getElementById('saisonTo')?.value || '').split('/');
          if (jFrom && mFrom && jTo && mTo) {
            const fromMD = parseInt(mFrom) * 100 + parseInt(jFrom);
            const toMD = parseInt(mTo) * 100 + parseInt(jTo);
            const chevauche = fromMD > toMD;
            locations = locations.filter(loc => {
              const d = loc.loc_datetime_local || loc.loc_date_local;
              if (!d) return false;
              const date = new Date(d);
              const md = (date.getMonth() + 1) * 100 + date.getDate();
              return chevauche ? (md >= fromMD || md <= toMD) : (md >= fromMD && md <= toMD);
            });
          }
        }
      }

      // Outliers - requête séparée, inchangée
      if (filters.include_outliers) {
        if (!dateFromApi || !dateToApi) {
          showToast('Veuillez sélectionner une période pour inclure les outliers');
        } else {
          const outlierPromises = idsAChercher.map(async id => {
            const toutesPositions = await fetchLocations(token, {
              ani_id: [id],
              date_from: dateFromApi,
              date_to: dateToApi,
              limit: 999999,
              include_outliers: true,
              only_outliers: true
            });
            return toutesPositions.filter(l => l.loc_outlier !== null || l.loc_anomalie === true);
          });
          const outlierResults = await Promise.all(outlierPromises);
          locations = [...locations, ...outlierResults.flat()];
        }
      }

      if (toutesPositionsTraj) { setDernierNTrajectoire('toutes'); }
      else if (nTraj) { setDernierNTrajectoire(String(nTraj)); }
      mettreAJourBadgeNPositions();

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
      mettreAJourLegende('trajectoire');

      setTimeout(() => {
        const extent = getGpsSource().getExtent();
        if (!extent || ol.extent.isEmpty(extent)) return;
        if (idsAChercher.length === 1) {
          getMap().getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: ZOOM_TRAJECTOIRE_SINGLE, duration: 400 });
        } else if (idsAChercher.length > 1) {
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
      btnApply.textContent = 'Appliquer les filtres';
    }
    mettreAJourBoutonAppliquer();
  }

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

export function decocherCochesAutomatiques() {
  document.querySelectorAll('#listeIndividus .checkbox-label[data-coche-auto="true"]').forEach(label => {
    const checkbox = label.querySelector('input');
    if (checkbox) checkbox.checked = false;
    label.dataset.cocheAuto = 'false';
    const aniId = checkbox?.value;
    if (aniId) supprimerBadgeById(`ani-${aniId}`);
  });
  mettreAJourSelectN();
  mettreAJourBoutonAppliquer();
}

export function filtrerListeIndividus() {
  mettreAJourSelectN();
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
    const afficheFinal = visible && matchSearch;
    label.style.display = afficheFinal ? 'flex' : 'none';

    // Synchronisation — decocher les coches manuelles devenues invisibles
    if (!afficheFinal && checkbox.checked && label.dataset.cocheAuto !== 'true') {
      checkbox.checked = false;
      label.dataset.cocheAuto = 'false';
      supprimerBadgeById(`ani-${aniId}`);
    }
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
  const periodes = getPeriodesActives();

  if (periodes.length === 0) {
    if (requeteId !== _derniereRequeteId) return;
    filtrerListeIndividus();
    return;
  }

  try {
    const idsUnion = new Set();

    // Pour chaque periode, recuperer les ani_id ayant des donnees
    const promises = periodes.map(p =>
      fetchAnimalIdsParPeriode(getCurrentToken(), {
        date_from: p.from,
        date_to: p.to,
        include_outliers: false
      })
    );

    const results = await Promise.all(promises);
    results.forEach(ids => ids.forEach(id => idsUnion.add(String(id))));

    if (requeteId !== _derniereRequeteId) return;

    // Si saisonnalite — filtrer JS par mois/jour
    const hasSaisonnalite = periodes.some(p =>
      p.source === 'saisonnalite' || p.source === 'saisonnalite_all'
    );

    if (hasSaisonnalite) {
      const saisonFrom = document.getElementById('saisonFrom')?.value || '';
      const saisonTo = document.getElementById('saisonTo')?.value || '';
      if (/^\d{2}\/\d{2}$/.test(saisonFrom) && /^\d{2}\/\d{2}$/.test(saisonTo)) {
        // Le filtrage JS fin par mois/jour est fait dans applyFilters
        // Ici on garde juste l union des IDs par periode
      }
    }

    _appliquerFiltreListeAvecIds(idsUnion);
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
    const programmation = document.getElementById('selectProgrammation')?.value;

    const matchPeriode = idsAvecDonnees.has(String(checkbox.value));
    const matchSexe = !sexe || label.dataset.sexe === sexe;
    const matchGestionnaire = !gestionnaire || label.dataset.gestionnaire === gestionnaire;
    const matchPopulation = !population || label.dataset.population === population;
    const matchClasse = !classe || label.dataset.classe === classe;
    const matchSuivis = !document.getElementById('checkSuivis')?.checked || getActiveIds().has(Number(checkbox.value));
    const matchProgrammation = !programmation ||
      String(getProgrammationsMap().get(String(checkbox.value))) === programmation;

    const visible = matchPeriode && matchSexe && matchGestionnaire && matchPopulation && matchClasse && matchSuivis && matchProgrammation;
    label.dataset.masqueParDate = visible ? 'false' : 'true';
    const afficheFinal = visible && (!searchVal || label.textContent.toLowerCase().includes(searchVal));
    label.style.display = afficheFinal ? 'flex' : 'none';

    // Synchronisation — decocher les coches manuelles devenues invisibles
    const aniId = checkbox.value;
    if (!afficheFinal && checkbox.checked && label.dataset.cocheAuto !== 'true') {
      checkbox.checked = false;
      label.dataset.cocheAuto = 'false';
      supprimerBadgeById(`ani-${aniId}`);
    }
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
