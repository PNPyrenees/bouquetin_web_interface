import { API_URL } from './config.js';

// Cache des requêtes API
const _cache = new Map();

function _cleCache(endpoint, filters = {}) {
  const filtresNormalises = Object.fromEntries(
    Object.entries(filters).filter(([_, v]) => v !== '' && v !== false && v !== null && v !== undefined)
  );
  return `${endpoint}:${JSON.stringify(filtresNormalises)}`;
}

function _getCache(cle) {
  return _cache.has(cle) ? _cache.get(cle) : null;
}

function _setCache(cle, data) {
  _cache.set(cle, data);
  return data;
}

export function viderCache() {
  _cache.clear();
}

/**
 * Gère l'authentification de l'utilisateur.
 * @param {string} username - Nom d'utilisateur
 * @param {string} password - Mot de passe
 * @returns {Promise<string>} - Jeton JWT (JSON Web Token)
 */
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

/**
 * Récupère tous les champs de v_localisation pour l'export CSV — sans limit,
 * indépendant de la pagination et des filtres colonnes du tableau.
 * @param {string} token - Jeton JWT pour l'autorisation
 * @param {Array<string>} aniIds - Identifiants des animaux à exporter
 * @param {Object} params - Filtres temporels optionnels (dateFrom, dateTo au format AAAA-MM-JJ)
 */
export async function fetchLocationsExportCSV(token, aniIds, params = {}) {
  if (!aniIds || aniIds.length === 0) return [];

  const CHAMPS_EXPORT = [
    'loc_id', 'ani_id', 'ani_code', 'ani_nom', 'ani_sexe',
    'ani_pop_rattach', 'ani_date_relache', 'ani_gestionnaire',
    'capt_id', 'capt_actif', 'capt_frequence', 'capt_constructeur', 'capt_id_constructeur',
    'loc_dop', 'fix_status_label', 'loc_nb_satellites', 'loc_outlier', 'loc_anomalie',
    'loc_altitude_capteur', 'loc_temperature_capteur',
    'loc_datetime_utc', 'loc_datetime_local', 'loc_date_local',
    'loc_mois_jour_local', 'loc_commentaire'
    // geom exclu volontairement — pas utile dans un CSV tabulaire
  ].join(',');

  const batchSize = 50;
  const results = [];

  for (let i = 0; i < aniIds.length; i += batchSize) {
    const batch = aniIds.slice(i, i + batchSize);
    const idsParam = `ani_id=in.(${batch.join(',')})`;

    let url = `${API_URL}/v_localisation?${idsParam}&select=${CHAMPS_EXPORT}&loc_anomalie=not.is.true&loc_outlier=is.null&order=ani_nom.asc,loc_datetime_local.desc`;

    // Appliquer les filtres temporels si presents
    if (params.dateFrom) url += `&loc_datetime_local=gte.${params.dateFrom}`;
    if (params.dateTo) url += `&loc_datetime_local=lte.${params.dateTo}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Profile': 'bouquetin'
      }
    });
    if (!res.ok) throw new Error(`Export CSV fetch error: ${res.status}`);
    const data = await res.json();
    results.push(...data);
  }

  return results;
}

/**
 * Récupère la liste complète des animaux et leurs métadonnées.
 */
export async function fetchAnimals(token) {
  // On sélectionne uniquement les colonnes nécessaires pour alléger la réponse
  const res = await fetch(
    `${API_URL}/t_animal?select=ani_id,ani_nom,ani_annee_naissance,ani_date_relache,ani_sexe,ani_gestionnaire,ani_pop_rattach&order=ani_nom`,
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

/**
 * Récupère uniquement les ani_id distincts ayant des positions sur une période.
 * Une seule requête au lieu de N requêtes par animal.
 */
export async function fetchAnimalIdsParPeriode(token, filters = {}) {
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
    }
  });

  if (!res.ok) throw new Error('Échec récupération IDs par période');
  const data = await res.json();

  // Retourner uniquement les ani_id distincts
  const ids = [...new Set(data.map(l => String(l.ani_id)))];
  return ids;
}

export async function fetchCountLocations(token, filters = {}) {
  const params = new URLSearchParams();

  if (Array.isArray(filters.ani_id) && filters.ani_id.length > 0) {
    params.append('ani_id', `in.(${filters.ani_id.join(',')})`);
  }

  if (filters.date_from) params.append('loc_datetime_local', `gte.${filters.date_from}`);
  if (filters.date_to) params.append('loc_datetime_local', `lte.${filters.date_to}`);

  if (!filters.include_outliers) {
    params.append('loc_anomalie', 'not.is.true');
    params.append('loc_outlier', 'is.null');
  }

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

  params.append('geom', 'not.is.null');
  params.append('limit', '0');

  const res = await fetch(`${API_URL}/v_localisation?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin',
      'Prefer': 'count=exact'
    }
  });

  if (!res.ok) throw new Error('Échec comptage positions');

  const contentRange = res.headers.get('Content-Range');
  const total = contentRange ? parseInt(contentRange.split('/')[1]) : 0;
  return total;
}

/**
 * Récupère les ani_id et leur prog_id depuis cor_animal_capteur.
 * Utilisé pour le filtre Programmation GPS côté frontend.
 */
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

/**
 * Récupère les programmations GPS depuis bib_programmation
 */
export async function fetchBibliothequeProgrammations(token) {
  const res = await fetch(
    `${API_URL}/bib_programmation?select=prog_id,prog_frequence,prog_duree_acquisition&order=prog_id`,
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

/**
 * Precharge un index leger ani_id -> Set(mois_jour) pour filtrer la liste
 * individus instantanement cote client lors d'une selection de saison,
 * sans requete API supplementaire.
 */
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

/**
 * Recupere les ani_id distincts ayant au moins une position avec geometrie
 * valide dans tout l historique (v_localisation), pas seulement leur derniere
 * position (v_animal_last_loc) — un animal inactif dont la derniere position
 * n a pas de geom ne doit pas etre exclu s il a des positions valides ailleurs.
 */
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

/**
 * Appelle la fonction SQL get_localisation_with_json_filter via PostgREST RPC.
 * Gère la pagination par batches avec rendu progressif via onBatch.
 *
 * @param {string} token - Jeton JWT
 * @param {Object} filters - Filtres au format interne (date_from, date_to, saisonFrom...)
 * @param {Function} onBatch - Callback(batch, premierBatch) pour rendu progressif
 */
export async function fetchLocalisationsRPC(token, filters = {}, onBatch = null) {
  const BATCH_SIZE = 10000;
  let offset = 0;
  let premierBatch = true;
  let totalLocations = [];

  while (true) {
    const body = {};

    // Identifiants animaux
    if (Array.isArray(filters.ani_id) && filters.ani_id.length > 0) {
      body.ani_id = filters.ani_id.map(Number);
    }

    // Dates absolues — conversion date_from/date_to → date_min/date_max
    if (filters.date_from) body.date_min = filters.date_from;
    if (filters.date_to)   body.date_max = filters.date_to;

    // Années
    if (Array.isArray(filters.annees) && filters.annees.length > 0) {
      body.annees = filters.annees.map(Number);
    }

    // Saisonnalité — conversion saisonFrom/saisonTo → periode_min/periode_max
    if (filters.saisonFrom) body.periode_min = filters.saisonFrom;
    if (filters.saisonTo)   body.periode_max = filters.saisonTo;

    // Attributs animaux
    if (filters.sexe)          body.ani_sexe = filters.sexe;
    if (filters.gestionnaire)  body.ani_gestionnaire = [filters.gestionnaire];
    if (filters.population)    body.ani_pop_rattach = [filters.population];
    if (filters.programmation) body.prog_id = [Number(filters.programmation)];

    // Qualité des données
    if (!filters.include_outliers) body.without_loc_outlier = true;

    // Animaux en cours de suivi
    if (filters.ani_is_followed) body.ani_is_followed = true;

    // Âge à la capture
    if (filters.age_capture_min != null) body.age_capture_min = filters.age_capture_min;
    if (filters.age_capture_max != null) body.age_capture_max = filters.age_capture_max;

    // Translocation
    if (filters.was_translocated != null) body.was_translocated = filters.was_translocated;

    // Filtre spatial
    if (filters.geom) {
      body.geom     = filters.geom;
      body.geom_src = filters.geom_src || 4326;
    }

    // N dernières positions par animal
    if (filters.limit_par_animal) body.limit_par_animal = filters.limit_par_animal;

    // Pagination
    body.limit  = BATCH_SIZE;
    body.offset = offset;

    const res = await fetch(`${API_URL}/rpc/get_localisation_with_json_filter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Profile': 'bouquetin',
        'Prefer': 'count=none'
      },
      body: JSON.stringify({ filters: body })
    });

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
