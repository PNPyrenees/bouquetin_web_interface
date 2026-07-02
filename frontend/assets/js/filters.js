import { fetchAnimalIdsParPeriode, fetchCountLocations, fetchLocalisationsRPC } from './api.js';
import { renderPoints, clearMapPoints, updateMapSize, getMap, getGpsSource, renderTrajectoire, clearTrajectoire } from './map.js';
import { mettreAJourPanneau, setLabelDatetime, ouvrirPanneauSiNecessaire, mettreAJourIndividus } from './panel.js';
import { ZOOM_FILTER_SINGLE, ZOOM_FILTER_MULTI, ZOOM_TRAJECTOIRE_SINGLE, ZOOM_TRAJECTOIRE_MULTI, SEUIL_ALERTE_VOLUME, SAISONS_CONFIG, CLASSES_AGE } from './config.js';
import {
  getAnimals, getActiveIds, getCurrentToken, getProgrammationsMap,
  enrichirLocations, enrichirAnimauxAvecPositions,
  showMapLoading, hideMapLoading,
  lockSidebar, unlockSidebar,
  showToast, mettreAJourLegende,
  ajouterBadge, supprimerBadgeById, mettreAJourFiltresActifs,
  mettreAJourSelectN, mettreAJourBoutonAppliquer,
  setDernierNPositions, setDernierNTrajectoire,
  mettreAJourBadgeNPositions,
  getAniCalendrier
} from './app.js';

// Convertit le format flatpickr JJ/MM en MM-JJ attendu par loc_mois_jour_local (PostgREST)
function formatSaisonPourAPI(dateJJMM) {
  if (!dateJJMM || !/^\d{2}\/\d{2}$/.test(dateJJMM)) return null;
  const [j, m] = dateJJMM.split('/');
  return `${m}-${j}`;
}

const BATCH_SIZE = 10000;

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
 * Masque dans #listeIndividus les animaux qui ne passent pas les filtres attributaires
 * actifs (suivis, sexe, gestionnaire, population), et — quand la requete couvrait tous
 * les animaux filtres (pas seulement des individus coches manuellement) — ceux absents
 * des resultats retournes par l API lorsqu un filtre temporel (periode, saison, annee)
 * est actif. requeteRestreinte indique que locations ne contient que les positions des
 * individus coches manuellement : dans ce cas on ne peut pas s en servir pour juger de
 * la presence de positions des autres individus, donc on ne les masque pas sur ce critere.
 */
function masquerIndividusSansPositions(locations, requeteRestreinte = false) {
  const aniIdsAvecPositions = new Set(locations.map(l => String(l.ani_id)));
  const suivisSeulement = document.getElementById('checkSuivis')?.checked;

  const filtreTemporelActif = !!(
    document.getElementById('dateFrom')?.value ||
    document.getElementById('dateTo')?.value ||
    document.getElementById('saisonFrom')?.value ||
    document.getElementById('saisonTo')?.value ||
    document.getElementById('selectAnnee')?.tomselect?.getValue()?.length
  );

  document.querySelectorAll('#listeIndividus .checkbox-label').forEach(label => {
    const checkbox = label.querySelector('input');
    if (!checkbox) return;
    const aniId = String(checkbox.value);

    if (label.dataset.sansGeom === 'true') return;

    // Verifier si l animal passe les filtres attributaires actifs
    const matchSuivis = !suivisSeulement || getActiveIds().has(Number(aniId));
    const sexeFiltreEl = document.getElementById('selectSexe');
    const sexeFiltre = sexeFiltreEl?.tomselect?.getValue() || sexeFiltreEl?.value || '';
    const matchSexe = !sexeFiltre || label.dataset.sexe === sexeFiltre;
    const gestFiltreEl = document.getElementById('selectGestionnaire');
    const gestFiltre = gestFiltreEl?.tomselect?.getValue() || gestFiltreEl?.value || '';
    const matchGest = !gestFiltre || label.dataset.gestionnaire === gestFiltre;
    const popFiltreEl = document.getElementById('selectPopulation');
    const popFiltre = popFiltreEl?.tomselect?.getValue() || popFiltreEl?.value || '';
    const matchPop = !popFiltre || label.dataset.population === popFiltre;

    const matchAttributs = matchSuivis && matchSexe && matchGest && matchPop;

    if (!matchAttributs) {
      // Masquer les animaux qui ne passent pas les filtres attributaires
      label.style.display = 'none';
      return;
    }

    if (filtreTemporelActif && !requeteRestreinte) {
      // Masquage par date uniquement si la requete couvrait tous les animaux filtres
      if (!aniIdsAvecPositions.has(aniId)) {
        label.style.display = 'none';
        label.dataset.masqueParDate = 'true';
        if (checkbox.checked) {
          checkbox.checked = false;
          label.dataset.cocheAuto = 'false';
          supprimerBadgeById(`ani-${aniId}`);
        }
      } else {
        label.style.display = 'flex';
        label.dataset.masqueParDate = 'false';
      }
    } else {
      // Pas de filtre temporel, ou requete restreinte aux coches — ne pas se baser sur
      // locations pour les non-coches, ils passent peut-etre quand meme les filtres attributaires
      label.style.display = 'flex';
      label.dataset.masqueParDate = 'false';
    }
  });
}

/**
 * Construit l'objet de filtres attendu par fetchLocalisationsRPC() depuis l'etat
 * courant des filtres UI (deja resolus : ids, dates/saisons consolidees, attributs).
 */
function construireFiltersRPC(token, idsAnimaux, filters, suivisSeulement) {
  const rpcFilters = {};

  // Animaux
  if (idsAnimaux && idsAnimaux.length > 0) {
    rpcFilters.ani_id = idsAnimaux.map(Number);
  } else if (suivisSeulement) {
    rpcFilters.ani_is_followed = true;
  }

  // Dates absolues
  if (filters.date_from) rpcFilters.date_from = filters.date_from;
  if (filters.date_to)   rpcFilters.date_to   = filters.date_to;

  // Années
  if (Array.isArray(filters.annees) && filters.annees.length > 0) {
    rpcFilters.annees = filters.annees.map(Number);
  }

  // Saisonnalité
  if (filters.saisonFrom) rpcFilters.saisonFrom = filters.saisonFrom;
  if (filters.saisonTo)   rpcFilters.saisonTo   = filters.saisonTo;

  // Attributs
  if (filters.sexe)          rpcFilters.sexe          = filters.sexe;
  if (filters.gestionnaire)  rpcFilters.gestionnaire  = filters.gestionnaire;
  if (filters.population)    rpcFilters.population    = filters.population;
  if (filters.programmation) rpcFilters.programmation = filters.programmation;

  // Qualité
  rpcFilters.include_outliers = filters.include_outliers || false;

  // Age capture
  if (filters.age_capture_min != null) rpcFilters.age_capture_min = filters.age_capture_min;
  if (filters.age_capture_max != null) rpcFilters.age_capture_max = filters.age_capture_max;

  return rpcFilters;
}

/**
 * APPLICATION DES FILTRES
 * Récupère les données filtrées depuis l'API et met à jour la carte.
 */
export async function applyFilters(token, modeForce = null, nOverride = null) {
  const btnApply = document.getElementById('btnApplyFilters');
  showMapLoading();
  lockSidebar();
  const progEl = document.getElementById('mapLoadingProgress');
  if (progEl) progEl.style.display = 'none';

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

      const idsAChercher = selectedIds.length > 0 ? selectedIds :
        Array.from(document.querySelectorAll('#listeIndividus .checkbox-label'))
          .filter(l => l.style.display !== 'none' && l.dataset.sansGeom !== 'true' && l.dataset.masqueParDate !== 'true')
          .map(l => l.querySelector('input')?.value)
          .filter(Boolean);

      // Extraire les années sélectionnées précisément (si source annee ou saisonnalite)
      const anneesSelectionnees = [...new Set(
        periodes
          .filter(p => p.annee)
          .map(p => parseInt(p.annee))
      )];

      // Bornes de dates absolues (source periode uniquement — dateFrom/dateTo saisis en JJ/MM/AAAA)
      const periodeDateOnly = periodes.filter(p => p.source === 'periode');
      const dateMin = periodeDateOnly.length > 0
        ? periodeDateOnly.reduce((min, p) => p.from && p.from < min ? p.from : min, periodeDateOnly[0].from || '')
        : '';
      const dateMax = periodeDateOnly.length > 0
        ? periodeDateOnly.reduce((max, p) => p.to && p.to > max ? p.to : max, periodeDateOnly[0].to || '')
        : '';

      // Saisonnalité
      const hasSaisonnalite = periodes.some(p => p.source === 'saisonnalite' || p.source === 'saisonnalite_all');
      // Bornes saisonnieres MM-JJ pour filtrage direct via loc_mois_jour_local (RPC)
      const saisonFromApi = hasSaisonnalite ? formatSaisonPourAPI(document.getElementById('saisonFrom')?.value) : null;
      const saisonToApi = hasSaisonnalite ? formatSaisonPourAPI(document.getElementById('saisonTo')?.value) : null;

      const rpcFilters = construireFiltersRPC(token, idsAChercher, {
        ...filters,
        date_from: dateMin || null,
        date_to: dateMax || null,
        saisonFrom: saisonFromApi,
        saisonTo: saisonToApi,
        annees: anneesSelectionnees.length > 0 ? anneesSelectionnees : null
      }, suivisSeulement);

      if (!toutesPositions && n) {
        // Chemin A — N dernieres positions par animal via RPC (un seul batch attendu)
        rpcFilters.limit_par_animal = n;
        locations = await fetchLocalisationsRPC(token, rpcFilters, () => {
          const bar = document.getElementById('mapLoadingBar');
          const pctEl = document.getElementById('mapLoadingPct');
          if (progEl) progEl.style.display = 'block';
          if (bar) bar.style.width = '100%';
          if (pctEl) pctEl.textContent = '100%';
        });
      } else {
        // Chemin B — Toutes positions, avec modal volume + pagination RPC
        const totalPositions = await fetchCountLocations(token, {
          ani_id: rpcFilters.ani_id,
          date_from: rpcFilters.date_from,
          date_to: rpcFilters.date_to,
          saisonFrom: rpcFilters.saisonFrom,
          saisonTo: rpcFilters.saisonTo,
          include_outliers: rpcFilters.include_outliers
        });

        let confirmed = true;
        if (totalPositions > SEUIL_ALERTE_VOLUME) {
          const modal = document.getElementById('modalVolume');
          document.getElementById('modalVolumeCount').textContent = totalPositions.toLocaleString('fr-FR');
          modal.style.display = 'flex';

          confirmed = await new Promise(resolve => {
            document.getElementById('modalVolumeBtnAnnuler').onclick = () => { modal.style.display = 'none'; resolve(false); };
            document.getElementById('modalVolumeBtnConfirmer').onclick = () => { modal.style.display = 'none'; resolve(true); };
          });

          if (!confirmed) {
            hideMapLoading();
            unlockSidebar();
            if (btnApply) { btnApply.textContent = 'Appliquer les filtres'; }
            mettreAJourBoutonAppliquer();
            return false;
          }
        }

        let _batchTotal = 0;
        locations = await fetchLocalisationsRPC(
          token,
          rpcFilters,
          (batch, clearBefore) => {
            // Rendu progressif (apercu) — le rendu final est fait plus bas une fois tous les batches recus
            const enrichis = enrichirLocations(batch);
            const modeCouleurPreview = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
            renderPoints(enrichis, clearBefore, false, modeCouleurPreview);
            // Mettre a jour le compteur en temps reel
            const posEl = document.getElementById('positionsCount');
            if (posEl) {
              const current = parseInt(posEl.textContent) || 0;
              posEl.textContent = clearBefore ? batch.length : current + batch.length;
            }
            // Barre de progression overlay — toujours affichee, sans condition de volume
            _batchTotal = clearBefore ? batch.length : _batchTotal + batch.length;
            if (progEl) progEl.style.display = 'block';
            const pct = totalPositions > 0
              ? Math.min(100, Math.round((_batchTotal / totalPositions) * 100))
              : 100;
            const bar = document.getElementById('mapLoadingBar');
            const pctEl = document.getElementById('mapLoadingPct');
            if (bar) bar.style.width = pct + '%';
            if (pctEl) pctEl.textContent = pct + '%';
          }
        );
      }

      if (toutesPositions) { setDernierNPositions('toutes'); }
      else if (n) { setDernierNPositions(String(n)); }
      mettreAJourBadgeNPositions();

      // Rendu carte
      locations = enrichirLocations(locations);
      clearTrajectoire();
      clearMapPoints();
      const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
      const count = renderPoints(locations, true, false, modeCouleur);
      const idsSelectionnesManuel = selectedIds.length > 0;
      masquerIndividusSansPositions(locations, idsSelectionnesManuel);
      mettreAJourPanneau(locations);
      const idsPresents = new Set(locations.map(l => String(l.ani_id)));
      mettreAJourIndividus(getAnimals().filter(a => idsPresents.has(String(a.ani_id))));

      ouvrirPanneauSiNecessaire();
      const mapScreen = document.getElementById('mapScreen');
      if (document.getElementById('sidebarRight')?.classList.contains('visible')) {
        mapScreen?.classList.add('panel-open');
        setTimeout(() => updateMapSize(), 310);
      }
      const posEl = document.getElementById('positionsCount');
      if (posEl) posEl.textContent = count;
      mettreAJourLegende('positions');
      setLabelDatetime('Date de localisation');

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

      window._derniersFiltresAppliques = {
        ani_id: idsAChercher,
        date_from: dateMin || null,
        date_to: dateMax || null,
        saisonFrom: saisonFromApi || null,
        saisonTo: saisonToApi || null,
        annees: anneesSelectionnees.length > 0 ? anneesSelectionnees : null,
        sexe: filters.sexe || null,
        gestionnaire: filters.gestionnaire || null,
        population: filters.population || null,
        programmation: filters.programmation || null,
        limit_par_animal: toutesPositions ? null : n,
        suivisSeulement: suivisSeulement
      };
    } else {
      // Mode Trajectoire — on ne vide pas les points existants
      const periodesT = getPeriodesActives();

      // Extraire les années sélectionnées précisément (si source annee ou saisonnalite)
      const anneesSelectionneesTraj = [...new Set(
        periodesT
          .filter(p => p.annee)
          .map(p => parseInt(p.annee))
      )];

      // Bornes de dates absolues (source periode uniquement — dateFrom/dateTo saisis en JJ/MM/AAAA)
      const periodeDateOnlyTraj = periodesT.filter(p => p.source === 'periode');
      const dateFromApi = periodeDateOnlyTraj.length > 0
        ? periodeDateOnlyTraj.reduce((min, p) => p.from && p.from < min ? p.from : min, periodeDateOnlyTraj[0].from || '')
        : null;
      const dateToApi = periodeDateOnlyTraj.length > 0
        ? periodeDateOnlyTraj.reduce((max, p) => p.to && p.to > max ? p.to : max, periodeDateOnlyTraj[0].to || '')
        : null;

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

      // Bornes saisonnieres MM-JJ pour filtrage direct via loc_mois_jour_local (API)
      const saisonFromApiTraj = hasSaisonnaliteTraj ? formatSaisonPourAPI(document.getElementById('saisonFrom')?.value) : null;
      const saisonToApiTraj = hasSaisonnaliteTraj ? formatSaisonPourAPI(document.getElementById('saisonTo')?.value) : null;

      const rpcFiltersTraj = construireFiltersRPC(token, idsAChercher, {
        ...filters,
        date_from: dateFromApi || null,
        date_to: dateToApi || null,
        saisonFrom: saisonFromApiTraj,
        saisonTo: saisonToApiTraj,
        annees: anneesSelectionneesTraj.length > 0 ? anneesSelectionneesTraj : null
      }, suivisSeulement);

      if (!toutesPositionsTraj && nTraj) {
        // Chemin C — N dernieres positions par animal via RPC (un seul batch attendu)
        rpcFiltersTraj.limit_par_animal = nTraj;
        locations = await fetchLocalisationsRPC(token, rpcFiltersTraj, () => {
          const bar = document.getElementById('mapLoadingBar');
          const pctEl = document.getElementById('mapLoadingPct');
          if (progEl) progEl.style.display = 'block';
          if (bar) bar.style.width = '100%';
          if (pctEl) pctEl.textContent = '100%';
        });
      } else {
        // Chemin D — Toutes positions, avec modal volume + pagination RPC
        const totalTrajPositions = await fetchCountLocations(token, {
          ani_id: rpcFiltersTraj.ani_id,
          date_from: rpcFiltersTraj.date_from,
          date_to: rpcFiltersTraj.date_to,
          saisonFrom: rpcFiltersTraj.saisonFrom,
          saisonTo: rpcFiltersTraj.saisonTo,
          include_outliers: rpcFiltersTraj.include_outliers
        });

        let confirmedTraj = true;

        if (totalTrajPositions > SEUIL_ALERTE_VOLUME) {
          const modal = document.getElementById('modalVolume');
          document.getElementById('modalVolumeCount').textContent = totalTrajPositions.toLocaleString('fr-FR');

          const sousTexte = modal.querySelector('.modal-volume-sous');
          const texteOriginalSous = sousTexte.textContent;
          sousTexte.textContent = 'Afficher un grand nombre de trajectoires peut rendre la carte illisible avec de nombreux traits superposés, en plus d\'entraîner des lenteurs importantes. Vous pouvez affiner votre recherche avec les filtres de date, saison, sexe, population ou individu pour réduire le nombre de résultats.';

          modal.style.display = 'flex';

          confirmedTraj = await new Promise(resolve => {
            document.getElementById('modalVolumeBtnAnnuler').onclick = () => { modal.style.display = 'none'; resolve(false); };
            document.getElementById('modalVolumeBtnConfirmer').onclick = () => { modal.style.display = 'none'; resolve(true); };
          });

          sousTexte.textContent = texteOriginalSous;

          if (!confirmedTraj) {
            hideMapLoading();
            unlockSidebar();
            if (btnApply) { btnApply.textContent = 'Appliquer les filtres'; }
            mettreAJourBoutonAppliquer();
            return false;
          }
        }

        let _batchTotal = 0;
        locations = await fetchLocalisationsRPC(
          token,
          rpcFiltersTraj,
          (batch, clearBefore) => {
            // Rendu progressif (apercu) — le rendu final est fait plus bas une fois tous les batches recus
            const enrichis = enrichirLocations(batch);
            const modeCouleurPreview = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
            renderPoints(enrichis, clearBefore, true, modeCouleurPreview);
            // Mettre a jour le compteur en temps reel
            const posEl = document.getElementById('positionsCount');
            if (posEl) {
              const current = parseInt(posEl.textContent) || 0;
              posEl.textContent = clearBefore ? batch.length : current + batch.length;
            }
            // Barre de progression overlay — toujours affichee, sans condition de volume
            _batchTotal = clearBefore ? batch.length : _batchTotal + batch.length;
            if (progEl) progEl.style.display = 'block';
            const pct = totalTrajPositions > 0
              ? Math.min(100, Math.round((_batchTotal / totalTrajPositions) * 100))
              : 100;
            const bar = document.getElementById('mapLoadingBar');
            const pctEl = document.getElementById('mapLoadingPct');
            if (bar) bar.style.width = pct + '%';
            if (pctEl) pctEl.textContent = pct + '%';
          }
        );
      }

      if (toutesPositionsTraj) { setDernierNTrajectoire('toutes'); }
      else if (nTraj) { setDernierNTrajectoire(String(nTraj)); }
      mettreAJourBadgeNPositions();

      locations = enrichirLocations(locations);
      clearMapPoints();
      clearTrajectoire();
      const modeCouleur = document.querySelector('input[name="modeCouleur"]:checked')?.value || 'individu';
      const count = renderPoints(locations, true, true, modeCouleur);
      const idsSelectionnesManuelTraj = selectedIds.length > 0;
      masquerIndividusSansPositions(locations, idsSelectionnesManuelTraj);
      mettreAJourPanneau(locations);
      const idsPresentsTraj = new Set(locations.map(l => String(l.ani_id)));
      mettreAJourIndividus(getAnimals().filter(a => idsPresentsTraj.has(String(a.ani_id))));
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

      window._derniersFiltresAppliques = {
        ani_id: idsAChercher,
        date_from: dateFromApi || null,
        date_to: dateToApi || null,
        saisonFrom: saisonFromApiTraj || null,
        saisonTo: saisonToApiTraj || null,
        annees: anneesSelectionneesTraj.length > 0 ? anneesSelectionneesTraj : null,
        sexe: filters.sexe || null,
        gestionnaire: filters.gestionnaire || null,
        population: filters.population || null,
        programmation: filters.programmation || null,
        limit_par_animal: toutesPositionsTraj ? null : nTraj,
        suivisSeulement: suivisSeulement
      };
    }

  } catch (err) {
    console.error('Erreur filtrage:', err);
    alert('Erreur lors du chargement des données');
  } finally {
    hideMapLoading();
    if (progEl) progEl.style.display = 'none';
    const bar = document.getElementById('mapLoadingBar');
    if (bar) bar.style.width = '0%';
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
let _derniereCleperiode = null;
let _dernierIdsperiode = null;

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

  // Invalider le cache si la période a changé
  const cleperiode = JSON.stringify(periodes);
  if (cleperiode !== _derniereCleperiode) {
    _dernierIdsperiode = null;
  }

  if (periodes.length === 0) {
    // Guard — si les champs sont renseignés mais périodes est vide, log pour diagnostic
    const df = document.getElementById('dateFrom')?.value;
    const dt = document.getElementById('dateTo')?.value;
    if (df || dt) {
      console.warn('[mettreAJourListeParDate] Périodes vides malgré dateFrom/dateTo :', df, dt);
    }
    if (requeteId !== _derniereRequeteId) return;
    filtrerListeIndividus();
    return;
  }

  // Saison seule, sans annee precise — le calendrier preloade (ani_id -> Set(mois_jour))
  // suffit a verifier la presence, aucune requete API necessaire, mise a jour instantanee
  const saisonSansAnnee = periodes.every(p => p.source === 'saisonnalite_all');
  if (saisonSansAnnee) {
    const calendrier = getAniCalendrier();

    // Calendrier pas encore disponible (chargement en arrière-plan) — ne pas filtrer
    // par saison, afficher tous les individus en attendant qu'il soit prêt
    if (calendrier.size === 0) {
      document.querySelectorAll('#listeIndividus .checkbox-label').forEach(label => {
        label.style.display = label.dataset.sansGeom === 'true' ? 'none' : 'flex';
      });
      return;
    }

    const saisonFromApi = formatSaisonPourAPI(document.getElementById('saisonFrom')?.value);
    const saisonToApi = formatSaisonPourAPI(document.getElementById('saisonTo')?.value);
    const chevauchante = !!(saisonFromApi && saisonToApi && saisonFromApi > saisonToApi);

    const idsAvecPositions = new Set();
    calendrier.forEach((mjSet, aniId) => {
      const aDesPositions = [...mjSet].some(mj => chevauchante
        ? (mj >= saisonFromApi || mj <= saisonToApi)
        : (mj >= saisonFromApi && mj <= saisonToApi));
      if (aDesPositions) idsAvecPositions.add(aniId);
    });

    _appliquerFiltreListeAvecIds(idsAvecPositions);
    return;
  }

  // Periode simple, annee precise, ou saison + annee precise — le calendrier (mois_jour seul,
  // sans annee) ne suffit pas a verifier la precision exacte, on interroge l API comme avant

  // Si la période n'a pas changé et qu'on a déjà un résultat — réutiliser sans requête réseau
  if (cleperiode === _derniereCleperiode && _dernierIdsperiode !== null) {
    if (requeteId !== _derniereRequeteId) return;
    _appliquerFiltreListeAvecIds(_dernierIdsperiode);
    return;
  }

  // Affichage immédiat pendant le chargement — évite la liste figée
  document.querySelectorAll('#listeIndividus .checkbox-label').forEach(label => {
    if (label.dataset.sansGeom !== 'true') label.style.opacity = '0.4';
  });

  try {
    const idsUnion = new Set();

    const hasSaisonnalite = periodes.some(p =>
      p.source === 'saisonnalite' || p.source === 'saisonnalite_all'
    );
    const saisonFromApi = hasSaisonnalite ? formatSaisonPourAPI(document.getElementById('saisonFrom')?.value) : null;
    const saisonToApi = hasSaisonnalite ? formatSaisonPourAPI(document.getElementById('saisonTo')?.value) : null;

    // Pour chaque periode, recuperer les ani_id ayant des donnees dans la saison
    const promises = periodes.map(p =>
      fetchAnimalIdsParPeriode(getCurrentToken(), {
        date_from: p.from,
        date_to: p.to,
        saisonFrom: saisonFromApi,
        saisonTo: saisonToApi,
        include_outliers: false
      })
    );

    const results = await Promise.all(promises);
    results.forEach(ids => ids.forEach(id => idsUnion.add(String(id))));

    if (requeteId !== _derniereRequeteId) return;

    // Mettre en cache le résultat
    _derniereCleperiode = cleperiode;
    _dernierIdsperiode = new Set(idsUnion);

    _appliquerFiltreListeAvecIds(idsUnion);

    document.querySelectorAll('#listeIndividus .checkbox-label').forEach(label => {
      label.style.opacity = '';
    });
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

/**
 * Réapplique le dernier résultat de période en cache si disponible, sans requête réseau —
 * sinon retombe sur le filtrage attributaire pur (aucune période active).
 */
export function appliquerFiltreAvecCachePeriode() {
  if (_dernierIdsperiode !== null) {
    _appliquerFiltreListeAvecIds(_dernierIdsperiode);
  } else {
    filtrerListeIndividus();
  }
}

// Supprimé: fonctions individuelles devenues obsolètes car centralisées dans filtrerListeIndividus
export function filtrerIndividusParClasse(classe) { filtrerListeIndividus(); }
export function filtrerIndividusParSexe(sexe) { filtrerListeIndividus(); }
export function filtrerIndividusParGestionnaire(gestionnaire) { filtrerListeIndividus(); }
export function filtrerIndividusParPopulation(population) { filtrerListeIndividus(); }

export function calculerAgeCapture(animal) {
  if (!animal.ani_date_relache || !animal.ani_annee_naissance) return null;
  const dateRelache = new Date(animal.ani_date_relache);
  const mois = dateRelache.getMonth() + 1; // getMonth() retourne 0-11
  const anneeRelache = dateRelache.getFullYear();
  const age = mois < 5
    ? anneeRelache - animal.ani_annee_naissance - 1
    : anneeRelache - animal.ani_annee_naissance;
  return age;
}

export function getClasseAge(animal) {
  const age = calculerAgeCapture(animal);
  if (age === null) return null;
  const sexe = animal.ani_sexe || 'TOUS';
  const classes = CLASSES_AGE[sexe] || CLASSES_AGE['TOUS'];
  const classe = classes.find(c =>
    age >= c.min && (c.max === null || age <= c.max)
  );
  return classe ? classe.label : null;
}
