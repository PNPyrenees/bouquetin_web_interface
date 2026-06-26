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
 * Récupère les positions GPS depuis la vue v_localisation.
 * PostgREST utilise une syntaxe de filtrage dans l'URL (ex: ?col=eq.valeur)
 * @param {string} token - Jeton JWT pour l'autorisation
 * @param {Object} filters - Objet contenant les critères de filtrage
 */
export async function fetchLocations(token, filters = {}) {
  const cle = _cleCache('v_localisation', filters);
  const cached = _getCache(cle);
  if (cached) return cached;


  const params  = new URLSearchParams();


  // Filtrage par ID d'individus (multi-sélection ou individuel)
  // Syntaxe PostgREST : in.(val1,val2,...) pour plusieurs valeurs
  if (Array.isArray(filters.ani_id) && filters.ani_id.length > 0) {
    params.append('ani_id', `in.(${filters.ani_id.join(',')})`);
  } else if (filters.ani_id && !Array.isArray(filters.ani_id)) {
    params.append('ani_id', `eq.${filters.ani_id}`);
    
  }

  // Filtrage par date (gte: greater than or equal, lte: lower than or equal)
  if (filters.date_from) params.append('loc_datetime_local', `gte.${filters.date_from}`);
  if (filters.date_to) params.append('loc_datetime_local', `lte.${filters.date_to}`);

  // Attributs de l'animal
  if (filters.sexe) params.append('ani_sexe', `eq.${filters.sexe}`);
  if (filters.gestionnaire) params.append('ani_gestionnaire', `eq.${filters.gestionnaire}`);
  if (filters.population) params.append('ani_pop_rattach', `eq.${filters.population}`);

  // Gestion de la qualité des données : exclusion des anomalies/outliers par défaut
  // PostgREST : 'not.is.true' permet de filtrer ce qui n'est pas TRUE (inclut FALSE et NULL)
  if (!filters.include_outliers) {
    params.append('loc_anomalie', 'not.is.true');
    params.append('loc_outlier', 'is.null');
  }

  // Si on veut uniquement les positions aberrantes
  if (filters.only_outliers) {
    params.append('or', '(loc_outlier.not.is.null,loc_anomalie.eq.true)');
  }

  // Filtrage saisonnier direct via loc_mois_jour_local (format 'MM-JJ')
  if (filters.saisonFrom && filters.saisonTo) {
    const chevauchante = filters.saisonFrom > filters.saisonTo; // ex: '11-01' > '02-28'
    if (chevauchante) {
      // Saison a cheval — ex: nov → fev
      params.append('or', `(loc_mois_jour_local.gte.${filters.saisonFrom},loc_mois_jour_local.lte.${filters.saisonTo})`);
    } else {
      // Saison simple — ex: mars → sept
      params.append('loc_mois_jour_local', `gte.${filters.saisonFrom}`);
      params.append('loc_mois_jour_local', `lte.${filters.saisonTo}`);
    }
  }

  // On s'assure de n'avoir que des données possédant une géométrie valide
  params.append('geom', 'not.is.null');

  // Paramètres de pagination et de tri
  // Si limit est fourni, l'utiliser — sinon pas de limit (laisser PostgREST décider)
  if (filters.limit) {
    params.append('limit', filters.limit);
  }
  if (filters.offset) {
    params.append('offset', filters.offset);
  }
  params.append('order', 'loc_datetime_local.desc');

  const res = await fetch(`${API_URL}/v_localisation?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin'
    }
  });
  
  if (!res.ok) throw new Error('Échec chargement données');
  const data = await res.json();
  if (data && data.length > 0) {
    _setCache(cle, data);
  }
  return data;
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
 * Récupère la dernière position connue pour chaque animal actif (via une vue dédiée).
 */
export async function fetchLastLocations(token, filters = {}) {
  const params = new URLSearchParams();
  params.append('geom', 'not.is.null');
  
  if (!filters.include_outliers) {
    params.append('loc_anomalie', 'not.is.true');
  }

  if (Array.isArray(filters.ani_id) && filters.ani_id.length > 0) {
    params.append('ani_id', `in.(${filters.ani_id.join(',')})`);
  } else if (filters.ani_id && !Array.isArray(filters.ani_id)) {
    params.append('ani_id', `eq.${filters.ani_id}`);
  }

  if (filters.ani_nom) params.append('ani_nom', `eq.${filters.ani_nom}`);

  const res = await fetch(`${API_URL}/v_animal_last_loc?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin'
    }
  });
  if (!res.ok) throw new Error('Échec chargement dernières positions');
  return res.json();
}

/**
 * Récupère les dernières positions pour les animaux inactifs.
 * Les animaux inactifs n'apparaissent pas dans v_animal_last_loc, 
 * on doit donc les chercher un par un dans v_localisation.
 */
export async function fetchLastLocationsInactifs(token, filters = {}) {
  const inactifsIds = filters.ani_id || [];
  if (inactifsIds.length === 0) return [];

  // Paramètres de qualité partagés
  const qualiteParams = !filters.include_outliers
    ? '&loc_anomalie=not.is.true&loc_outlier=is.null'
    : '';

  const sexeParam = filters.sexe ? `&ani_sexe=eq.${filters.sexe}` : '';
  const gestionnaireParam = filters.gestionnaire ? `&ani_gestionnaire=eq.${filters.gestionnaire}` : '';
  const populationParam = filters.population ? `&ani_pop_rattach=eq.${filters.population}` : '';

  /**
   * Pour chaque ID, on crée une promesse (requête fetch).
   * On utilise Promise.all pour lancer toutes les requêtes en parallèle,
   * ce qui est beaucoup plus rapide qu'une boucle séquentielle.
   */
  const promises = inactifsIds.map(ani_id =>
    fetch(
      `${API_URL}/v_localisation?ani_id=eq.${ani_id}&geom=not.is.null${qualiteParams}${sexeParam}${gestionnaireParam}${populationParam}&order=loc_datetime_local.desc&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept-Profile': 'bouquetin'
        }
      }
    )
    .then(r => r.ok ? r.json() : []) // On transforme en JSON si OK, sinon tableau vide
    .catch(() => []) // Gestion des erreurs réseau par individu
  );

  const results = await Promise.all(promises);
  // results est un tableau de tableaux (ex: [[{loc1}], [], [{loc2}]]), on doit l'aplatir (flat)
  return results.flat().filter(l => l != null);
}

/**
 * Récupère la dernière position de tous les animaux en une seule requête
 * depuis la vue v_animal_last_loc modifiée (actifs + inactifs).
 */
export async function fetchAllLastLocations(token, filters = {}) {
  const cle = _cleCache('v_animal_last_loc', filters);
  const cached = _getCache(cle);
  if (cached) return cached;

  const params = new URLSearchParams();
  params.append('geom', 'not.is.null');

  if (!filters.include_outliers) {
    params.append('loc_anomalie', 'not.is.true');
  }

  if (filters.sexe) params.append('ani_sexe', `eq.${filters.sexe}`);
  if (filters.gestionnaire) params.append('ani_gestionnaire', `eq.${filters.gestionnaire}`);
  if (filters.population) params.append('ani_pop_rattach', `eq.${filters.population}`);

  const res = await fetch(`${API_URL}/v_animal_last_loc?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin'
    }
  });

  if (!res.ok) throw new Error('Échec chargement positions');
  const data = await res.json();
  if (data && data.length > 0) {
    _setCache(cle, data);
  }
  return data;
}

/**
 * Récupère la dernière position de chaque individu sur une période donnée.
 * Utilisé en mode Positions quand une date est sélectionnée.
 */
export async function fetchLastLocationsParPeriode(token, filters = {}) {
  // Vérification du cache — si même requête déjà faite, retourner résultat en mémoire
  const cle = _cleCache('v_localisation_periode', filters);
  const cached = _getCache(cle);
  if (cached) return cached;

  const ids = filters.ani_id || [];
  if (ids.length === 0) return []; // Rien à chercher

  const params = new URLSearchParams();

  // Une seule requête pour tous les animaux — ani_id=in.(548,543,542,...)
  // Au lieu de 200 requêtes une par animal comme avant
  params.append('ani_id', `in.(${ids.join(',')})`);
  params.append('geom', 'not.is.null'); // Exclure positions sans coordonnées

  // Qualité des données — exclure anomalies et outliers par défaut
  if (!filters.include_outliers) {
    params.append('loc_anomalie', 'not.is.true');
    params.append('loc_outlier', 'is.null');
  }

  // Filtre temporel — bornes de la période demandée
  if (filters.date_from) params.append('loc_datetime_local', `gte.${filters.date_from}`);
  if (filters.date_to) params.append('loc_datetime_local', `lte.${filters.date_to}`);

  // Tri décroissant + limit très élevé pour récupérer toutes les positions
  // Nécessaire car PostgreSQL/PostgREST ne supporte pas DISTINCT ON via URL
  params.append('order', 'loc_datetime_local.desc');
  params.append('limit', '999999'); // ← PROBLÈME DE PERFORMANCE ici

  const res = await fetch(`${API_URL}/v_localisation?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin',
      'Prefer': 'count=none' // Ne pas compter le total — plus rapide
    }
  });

  if (!res.ok) throw new Error('Échec chargement positions par période');
  const data = await res.json();

  // Déduplication côté JavaScript — garder uniquement la dernière position par animal
  // Car PostgREST ne peut pas faire DISTINCT ON (ani_id) directement
  const locParAnimal = new Map();
  data.forEach(loc => {
    const existing = locParAnimal.get(String(loc.ani_id));
    const dateNew = loc.loc_datetime_local || loc.loc_date_local || '';
    const dateExisting = existing ? (existing.loc_datetime_local || existing.loc_date_local || '') : '';
    if (!existing || dateNew > dateExisting) {
      locParAnimal.set(String(loc.ani_id), loc); // Garder la plus récente
    }
  });

  const locations = Array.from(locParAnimal.values());
  if (locations.length > 0) _setCache(cle, locations); // Mettre en cache
  return locations;
}

/**
 * Récupère uniquement les ani_id distincts ayant des positions sur une période.
 * Une seule requête au lieu de N requêtes par animal.
 */
export async function fetchAnimalIdsParPeriode(token, filters = {}) {
  const cle = _cleCache('v_localisation_ids', filters);
  const cached = _getCache(cle);
  if (cached) return cached;

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
  if (ids.length > 0) {
    _setCache(cle, ids);
  }
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
 * Récupère les N dernières localisations de chaque animal spécifié
 */
export async function fetchNDernieresLocalisations(token, ids, n) {
  const promises = ids.map(id =>
    fetchLocations(token, {
      ani_id: id,
      limit: n,
      include_outliers: false
    })
  );
  const results = await Promise.all(promises);
  return results.flat();
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
