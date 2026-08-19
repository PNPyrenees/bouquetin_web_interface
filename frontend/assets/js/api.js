import { API_URL } from './config.js';

export async function login(username, password) {
  // Appel à une fonction RPC (Remote Procedure Call) définie côté serveur
  const res = await fetch(`${API_URL}/rpc/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Le header Accept-Profile indique le schéma de base de données à utiliser (ici 'bouquetin')
      'Accept-Profile': 'bouquetin'
    },
    body: JSON.stringify({ username, password })
  });
  
  if (!res.ok) throw new Error('Échec authentification');
  
  // Le serveur renvoie un objet contenant le token
  const { token } = await res.json();
  return token;
}

export async function fetchAnimals(token) {
  // On sélectionne uniquement les colonnes nécessaires pour alléger la réponse
  const res = await fetch(
    `${API_URL}/t_animal?select=ani_id,ani_nom,ani_code,ani_annee_naissance,ani_date_relache,ani_date_mort,ani_sexe,ani_gestionnaire,ani_pop_rattach,ani_marquage_oreille_droite,ani_marquage_oreille_gauche&order=ani_nom`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Profile': 'bouquetin'
      }
    }
  );
  if (!res.ok) throw new Error('Échec chargement animaux');
  return res.json();
}

export async function fetchCountAnimaux(token, filters = {}, signal = null) {
  const params = new URLSearchParams();
  params.append('select', 'ani_id');
  if (filters.population) params.append('ani_pop_rattach', `eq.${filters.population}`);
  if (filters.gestionnaire) params.append('ani_gestionnaire', `eq.${filters.gestionnaire}`);
  if (filters.sexe) params.append('ani_sexe', `eq.${filters.sexe}`);

  const res = await fetch(`${API_URL}/t_animal?${params.toString()}`, {
    method: 'HEAD',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin',
      'Prefer': 'count=exact'
    },
    signal
  });
  if (!res.ok) throw new Error(`fetchCountAnimaux error: ${res.status}`);
  const contentRange = res.headers.get('content-range');
  const total = contentRange ? Number(contentRange.split('/')[1]) : 0;
  return Number.isFinite(total) ? total : 0;
}

export async function fetchAnimalIdsParPeriode(token, filters = {}, signal = null) {
  const params = new URLSearchParams();

  params.append('select', 'ani_id');
  params.append('geom', 'not.is.null');

  if (!filters.include_outliers) {
    params.append('loc_anomalie', 'not.is.true');
    params.append('loc_outlier', 'is.null');
  }

  if (filters.date_from) params.append('loc_datetime_local', `gte.${filters.date_from}`);
  if (filters.date_to) params.append('loc_datetime_local', `lte.${filters.date_to}`);

  // Filtrage saisonnier direct via loc_mois_jour_local (format 'MM-JJ')
  if (filters.saisonFrom && filters.saisonTo) {
    const chevauchante = filters.saisonFrom > filters.saisonTo;
    if (chevauchante) {
      params.append('or', `(loc_mois_jour_local.gte.${filters.saisonFrom},loc_mois_jour_local.lte.${filters.saisonTo})`);
    } else {
      params.append('loc_mois_jour_local', `gte.${filters.saisonFrom}`);
      params.append('loc_mois_jour_local', `lte.${filters.saisonTo}`);
    }
  }

  const res = await fetch(`${API_URL}/v_localisation?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin',
      'Prefer': 'count=none'
    },
    signal
  });

  if (!res.ok) throw new Error('Échec récupération IDs par période');
  const data = await res.json();

  // Retourner uniquement les ani_id distincts
  const ids = [...new Set(data.map(l => String(l.ani_id)))];
  return ids;
}

export async function fetchCountLocations(token, rpcFilters = {}, signal = null) {
  const body = construireBodyRPC(rpcFilters);
  body.var_limit = 1000000;

  const res = await fetch(`${API_URL}/rpc/f_get_localisation?select=count`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Profile': 'bouquetin'
    },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) throw new Error('Échec comptage positions');
  const data = await res.json();
  return data[0]?.count || 0;
}

export async function fetchProgrammations(token) {
  const res = await fetch(
    `${API_URL}/cor_animal_capteur?select=ani_id,prog_id,cor_date_debut&prog_id=not.is.null&order=cor_date_debut.desc`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Profile': 'bouquetin'
      }
    }
  );
  if (!res.ok) throw new Error('Échec chargement programmations');
  return res.json();
}

export async function fetchAnimauxSuivis(token, filters = {}, signal = null) {
  const periodeActive = Boolean(filters.date_from || filters.date_to);

  if (periodeActive) {
    const idsPeriode = await fetchAnimalIdsParPeriode(token, { date_from: filters.date_from, date_to: filters.date_to }, signal);
    const aFiltresAttributs = Boolean(filters.population || filters.gestionnaire || filters.sexe);
    if (!aFiltresAttributs) return new Set(idsPeriode);

    const params = new URLSearchParams();
    params.append('select', 'ani_id');
    if (filters.population) params.append('ani_pop_rattach', `eq.${filters.population}`);
    if (filters.gestionnaire) params.append('ani_gestionnaire', `eq.${filters.gestionnaire}`);
    if (filters.sexe) params.append('ani_sexe', `eq.${filters.sexe}`);
    const res = await fetch(`${API_URL}/t_animal?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept-Profile': 'bouquetin', 'Prefer': 'count=none' },
      signal
    });
    if (!res.ok) throw new Error(`fetchAnimauxSuivis error (filtre animaux): ${res.status}`);
    const idsAutorises = new Set((await res.json()).map(a => String(a.ani_id)));
    return new Set(idsPeriode.filter(id => idsAutorises.has(id)));
  }

  const locations = await fetchLocalisationsRPC(token, {
    ani_is_followed: true,
    limit_par_animal: 1,
    sexe: filters.sexe,
    gestionnaire: filters.gestionnaire,
    population: filters.population
  }, null, signal);
  return new Set(locations.map(l => l.ani_id));
}

export async function fetchColliersActifs(token) {
  const res = await fetch(
    `${API_URL}/cor_animal_capteur?select=ani_id&cor_date_fin=is.null`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Profile': 'bouquetin',
        'Prefer': 'count=none'
      }
    }
  );
  if (!res.ok) throw new Error(`fetchColliersActifs error: ${res.status}`);
  const data = await res.json();
  return new Set(data.map(r => r.ani_id));
}

export async function fetchCouleursCollierParAnimal(token) {
  const res = await fetch(
    `${API_URL}/cor_animal_capteur?select=ani_id,t_capteur(capt_couleur_collier)&cor_date_fin=is.null`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Profile': 'bouquetin',
        'Prefer': 'count=none'
      }
    }
  );
  if (!res.ok) throw new Error(`fetchCouleursCollierParAnimal error: ${res.status}`);
  const data = await res.json();
  const couleurs = new Map();
  data.forEach(r => {
    const couleur = r.t_capteur?.capt_couleur_collier;
    if (couleur) couleurs.set(String(r.ani_id), couleur);
  });
  return couleurs;
}

export async function fetchCountAnimauxEquipes(token, filters = {}, signal = null) {
  const aFiltres = Boolean(filters.population || filters.gestionnaire || filters.sexe);
  let idsAutorises = null;

  if (aFiltres) {
    const params = new URLSearchParams();
    params.append('select', 'ani_id');
    if (filters.population) params.append('ani_pop_rattach', `eq.${filters.population}`);
    if (filters.gestionnaire) params.append('ani_gestionnaire', `eq.${filters.gestionnaire}`);
    if (filters.sexe) params.append('ani_sexe', `eq.${filters.sexe}`);
    const resAnimaux = await fetch(`${API_URL}/t_animal?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept-Profile': 'bouquetin', 'Prefer': 'count=none' },
      signal
    });
    if (!resAnimaux.ok) throw new Error(`fetchCountAnimauxEquipes error (filtre animaux): ${resAnimaux.status}`);
    idsAutorises = new Set((await resAnimaux.json()).map(a => a.ani_id));
    // Court-circuit : aucun animal ne correspond aux filtres, inutile d'interroger cor_animal_capteur.
    if (idsAutorises.size === 0) return 0;
  }

  const params = new URLSearchParams();
  params.append('select', 'ani_id');
  if (filters.date_from) params.append('cor_date_debut', `gte.${filters.date_from}`);
  if (filters.date_to) params.append('cor_date_debut', `lte.${filters.date_to}`);

  const res = await fetch(`${API_URL}/cor_animal_capteur?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin',
      'Prefer': 'count=none'
    },
    signal
  });
  if (!res.ok) throw new Error(`fetchCountAnimauxEquipes error: ${res.status}`);
  const data = await res.json();
  const lignes = aFiltres ? data.filter(r => idsAutorises.has(r.ani_id)) : data;
  return new Set(lignes.map(r => r.ani_id)).size;
}

export async function fetchTranslocationIds(token) {
  const res = await fetch(`${API_URL}/t_capture_relache?select=ani_id,translocation&translocation=eq.true`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin',
      'Prefer': 'count=none'
    }
  });
  if (!res.ok) throw new Error(`fetchTranslocationIds error: ${res.status}`);
  const data = await res.json();
  return new Set(data.map(r => r.ani_id));
}

export async function fetchNombreCaptureRelacheParAnimal(token) {
  const res = await fetch(`${API_URL}/t_capture_relache?select=ani_id`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin',
      'Prefer': 'count=none'
    }
  });
  if (!res.ok) throw new Error(`fetchNombreCaptureRelacheParAnimal error: ${res.status}`);
  const data = await res.json();
  const counts = new Map();
  data.forEach(r => {
    const cle = String(r.ani_id);
    counts.set(cle, (counts.get(cle) || 0) + 1);
  });
  return counts;
}

export async function fetchPopulations(token) {
  const res = await fetch(
    `${API_URL}/t_animal?select=ani_pop_rattach&ani_pop_rattach=not.is.null&order=ani_pop_rattach.asc`,
    { headers: { Authorization: `Bearer ${token}`, 'Accept-Profile': 'bouquetin' } }
  );
  if (!res.ok) throw new Error('Erreur fetchPopulations');
  const data = await res.json();
  return [...new Set(data.map(d => d.ani_pop_rattach))];
}

export async function fetchGestionnaires(token) {
  const res = await fetch(
    `${API_URL}/t_animal?select=ani_gestionnaire&ani_gestionnaire=not.is.null&order=ani_gestionnaire.asc`,
    { headers: { Authorization: `Bearer ${token}`, 'Accept-Profile': 'bouquetin' } }
  );
  if (!res.ok) throw new Error('Erreur fetchGestionnaires');
  const data = await res.json();
  return [...new Set(data.map(d => d.ani_gestionnaire))];
}

export async function fetchBibliothequeProgrammations(token) {
  const res = await fetch(
    `${API_URL}/bib_programmation?select=prog_id,prog_libelle,prog_frequence,prog_duree_acquisition&order=prog_id`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Profile': 'bouquetin'
      }
    }
  );

  if (!res.ok) {
    throw new Error('Échec chargement bibliotheque programmations');
  }

  return res.json();
}

export async function fetchAniCalendrier(token) {
  // Requete legere — uniquement ani_id + loc_mois_jour_local, pas de geom
  const url = `${API_URL}/v_localisation?select=ani_id,loc_mois_jour_local&loc_anomalie=not.is.true&loc_outlier=is.null&geom=not.is.null&order=ani_id.asc`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin',
      'Prefer': 'count=none'
    }
  });
  if (!res.ok) throw new Error(`fetchAniCalendrier error: ${res.status}`);
  const data = await res.json();

  // Construire Map ani_id -> Set de mois_jour
  const calendrier = new Map();
  data.forEach(row => {
    const id = String(row.ani_id);
    if (!calendrier.has(id)) calendrier.set(id, new Set());
    if (row.loc_mois_jour_local) {
      calendrier.get(id).add(row.loc_mois_jour_local);
    }
  });
  return calendrier;
}

export async function fetchAniIdsAvecGeom(token) {
  // Recupere uniquement les ani_id distincts ayant au moins une position avec geom
  const res = await fetch(
    `${API_URL}/v_localisation?select=ani_id&geom=not.is.null&loc_anomalie=not.is.true&loc_outlier=is.null`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Profile': 'bouquetin',
        'Prefer': 'count=none'
      }
    }
  );
  if (!res.ok) throw new Error(`fetchAniIdsAvecGeom error: ${res.status}`);
  const data = await res.json();
  return new Set(data.map(r => String(r.ani_id)));
}

export async function fetchAnimalDetail(token, aniId) {
  const res = await fetch(
    `${API_URL}/t_animal?ani_id=eq.${aniId}&select=ani_id,ani_nom,ani_code,ani_sexe,ani_annee_naissance,ani_date_mort,ani_gestionnaire,ani_pop_rattach,ani_marquage_oreille_droite,ani_marquage_oreille_gauche,ani_marquage_code_collier,ani_marquage_bande_laterale_collier,ani_commentaire`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Profile': 'bouquetin'
      }
    }
  );
  if (!res.ok) throw new Error(`fetchAnimalDetail error: ${res.status}`);
  const data = await res.json();
  return data[0] || null;
}

export async function fetchCapteurParAnimal(token, aniId) {
  const res = await fetch(
    `${API_URL}/cor_animal_capteur?ani_id=eq.${aniId}&select=cor_id,cor_date_debut,cor_date_fin,capt_id,prog_id,t_capteur(capt_id,capt_id_constructeur,capt_constructeur,capt_type,capt_frequence,capt_actif,capt_couleur_collier),bib_programmation(prog_libelle,prog_desciption,prog_frequence,prog_duree_acquisition)&order=cor_date_debut.desc`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Profile': 'bouquetin'
      }
    }
  );
  if (!res.ok) throw new Error(`fetchCapteurParAnimal error: ${res.status}`);
  return res.json();
}

export async function fetchCaptureRelacheParAnimal(token, aniId) {
  const res = await fetch(
    `${API_URL}/t_capture_relache?ani_id=eq.${aniId}&select=capture_relache_id,capture_date,capture_zone,capture_lieu_dit,capture_site_geom,relache_date,relache_zone,relache_lieu_dit,relache_site_geom,capture_methode,capture_objectif,translocation,capture_relache_commentaire&order=capture_date.desc`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Profile': 'bouquetin'
      }
    }
  );
  if (!res.ok) throw new Error(`fetchCaptureRelacheParAnimal error: ${res.status}`);
  return res.json();
}

export async function fetchCountCaptures(token, { date_from, date_to } = {}) {
  const params = new URLSearchParams();
  params.append('select', 'capture_relache_id');
  params.append('capture_date', 'not.is.null');
  params.append('translocation', 'eq.false');
  if (date_from) params.append('capture_date', `gte.${date_from}`);
  if (date_to) params.append('capture_date', `lte.${date_to}`);

  const res = await fetch(`${API_URL}/t_capture_relache?${params.toString()}`, {
    method: 'HEAD',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin',
      'Prefer': 'count=exact'
    }
  });
  if (!res.ok) throw new Error(`fetchCountCaptures error: ${res.status}`);
  const contentRange = res.headers.get('content-range');
  const total = contentRange ? Number(contentRange.split('/')[1]) : 0;
  return Number.isFinite(total) ? total : 0;
}

export async function fetchCountCapturesSanitaires(token, { date_from, date_to } = {}) {
  const params = new URLSearchParams();
  params.append('select', 'capture_relache_id');
  params.append('capture_objectif', 'eq.Veille sanitaire');
  if (date_from) params.append('capture_date', `gte.${date_from}`);
  if (date_to) params.append('capture_date', `lte.${date_to}`);

  const res = await fetch(`${API_URL}/t_capture_relache?${params.toString()}`, {
    method: 'HEAD',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin',
      'Prefer': 'count=exact'
    }
  });
  if (!res.ok) throw new Error(`fetchCountCapturesSanitaires error: ${res.status}`);
  const contentRange = res.headers.get('content-range');
  const total = contentRange ? Number(contentRange.split('/')[1]) : 0;
  return Number.isFinite(total) ? total : 0;
}

export async function fetchCountEvenementsTranslocation(token, { date_from, date_to } = {}) {
  const params = new URLSearchParams();
  params.append('select', 'relache_date');
  params.append('translocation', 'eq.true');
  params.append('relache_date', 'not.is.null');
  if (date_from) params.append('relache_date', `gte.${date_from}`);
  if (date_to) params.append('relache_date', `lte.${date_to}`);

  const res = await fetch(`${API_URL}/t_capture_relache?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin',
      'Prefer': 'count=none'
    }
  });
  if (!res.ok) throw new Error(`fetchCountEvenementsTranslocation error: ${res.status}`);
  const data = await res.json();
  const datesDistinctes = new Set(data.map(r => String(r.relache_date).slice(0, 10)));
  return datesDistinctes.size;
}

export async function fetchCountZonesTranslocation(token) {
  const res = await fetch(
    `${API_URL}/t_capture_relache?select=relache_zone&translocation=eq.true&relache_zone=not.is.null`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Profile': 'bouquetin',
        'Prefer': 'count=none'
      }
    }
  );
  if (!res.ok) throw new Error(`fetchCountZonesTranslocation error: ${res.status}`);
  const data = await res.json();
  return new Set(data.map(r => r.relache_zone)).size;
}

function construireBodyRPC(filters) {
  const body = {};

  if (Array.isArray(filters.ani_id) && filters.ani_id.length > 0) {
    body.var_ani_id = filters.ani_id.map(Number);
  }
  if (filters.date_from) body.var_date_min = filters.date_from;
  if (filters.date_to)   body.var_date_max = filters.date_to;
  if (Array.isArray(filters.annees) && filters.annees.length > 0) {
    body.var_annees = filters.annees.map(Number);
  }
  if (filters.saisonFrom) body.var_periode_min = filters.saisonFrom;
  if (filters.saisonTo)   body.var_periode_max = filters.saisonTo;
  if (filters.sexe)          body.var_ani_sexe = filters.sexe;
  if (filters.gestionnaire)  body.var_ani_gestionnaire = [filters.gestionnaire];
  if (filters.population)    body.var_ani_pop_rattach = [filters.population];
  if (filters.programmation) body.var_prog_id = [Number(filters.programmation)];
  if (!filters.include_outliers) body.var_without_loc_outlier = true;
  if (filters.ani_is_followed) body.var_ani_is_followed = true;
  if (filters.age_capture_min != null) body.var_age_capture_min = filters.age_capture_min;
  if (filters.age_capture_max != null) body.var_age_capture_max = filters.age_capture_max;
  if (filters.was_translocated != null) body.var_was_translocated = filters.was_translocated;
  if (filters.geom) {
    body.var_geom     = filters.geom;
    body.var_geom_src = filters.geom_src || 4326;
  }

  return body;
}

export async function fetchLocalisationsRPC(token, filters = {}, onBatch = null, signal = null) {
  const BATCH_SIZE = 10000;
  let offset = 0;
  let premierBatch = true;
  let totalLocations = [];

  while (true) {
    if (signal?.aborted) break;

    const body = construireBodyRPC(filters);
    if (filters.limit_par_animal) body.var_limit_par_animal = filters.limit_par_animal;
    body.var_limit  = BATCH_SIZE;
    body.var_offset = offset;

    let res;
    try {
      res = await fetch(`${API_URL}/rpc/f_get_localisation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Profile': 'bouquetin',
          'Prefer': 'count=none'
        },
        body: JSON.stringify(body),
        signal
      });
    } catch (err) {
      // Annulation en vol — on garde ce qui a deja ete accumule plutot que de propager
      // l'erreur (cf. AbortError, comportement volontaire du bouton Annuler)
      if (err.name === 'AbortError') break;
      throw err;
    }

    if (!res.ok) throw new Error(`fetchLocalisationsRPC error: ${res.status}`);
    const batch = await res.json();

    if (!Array.isArray(batch) || batch.length === 0) break;

    // Rendu progressif si callback fourni
    if (onBatch) onBatch(batch, premierBatch);

    totalLocations = totalLocations.concat(batch);
    premierBatch = false;

    // Dernier batch si inférieur à BATCH_SIZE
    if (batch.length < BATCH_SIZE) break;

    // Si limit_par_animal défini — une seule requête suffit
    if (filters.limit_par_animal) break;

    offset += BATCH_SIZE;
  }

  return totalLocations;
}

export async function fetchLocalisationsAnimal(token, aniId, options = {}) {
  const body = { var_ani_id: [Number(aniId)] };
  if (options.limitParAnimal) body.var_limit_par_animal = options.limitParAnimal;
  if (options.dateMin) body.var_date_min = options.dateMin;
  if (options.dateMax) body.var_date_max = options.dateMax;
  body.var_limit = 10000;

  const res = await fetch(`${API_URL}/rpc/f_get_localisation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Profile': 'bouquetin'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`fetchLocalisationsAnimal error: ${res.status}`);
  return res.json();
}
