import { API_URL, DEFAULT_LIMIT } from './config.js';

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

  const params = new URLSearchParams();

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

  // On s'assure de n'avoir que des données possédant une géométrie valide
  params.append('geom', 'not.is.null');
  
  // Paramètres de pagination et de tri
  params.append('limit', filters.limit || DEFAULT_LIMIT);
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
 * Récupère la liste complète des animaux et leurs métadonnées.
 */
export async function fetchAnimals(token) {
  // On sélectionne uniquement les colonnes nécessaires pour alléger la réponse
  const res = await fetch(
    `${API_URL}/t_animal?select=ani_id,ani_nom,ani_annee_naissance,ani_sexe,ani_gestionnaire,ani_pop_rattach&order=ani_nom`,
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
  const cle = _cleCache('v_localisation_periode', filters);
  const cached = _getCache(cle);
  if (cached) return cached;

  const ids = filters.ani_id || [];
  if (ids.length === 0) return [];

  const qualiteParams = !filters.include_outliers
    ? '&loc_anomalie=not.is.true&loc_outlier=is.null'
    : '';

  const dateFromParam = filters.date_from
    ? `&loc_datetime_local=gte.${filters.date_from}`
    : '';

  const dateToParam = filters.date_to
    ? `&loc_datetime_local=lte.${filters.date_to}`
    : '';

  const sexeParam = filters.sexe ? `&ani_sexe=eq.${filters.sexe}` : '';
  const gestionnaireParam = filters.gestionnaire ? `&ani_gestionnaire=eq.${filters.gestionnaire}` : '';
  const populationParam = filters.population ? `&ani_pop_rattach=eq.${filters.population}` : '';

  const promises = ids.map(ani_id =>
    fetch(
      `${API_URL}/v_localisation?ani_id=eq.${ani_id}&geom=not.is.null${qualiteParams}${dateFromParam}${dateToParam}${sexeParam}${gestionnaireParam}${populationParam}&order=loc_datetime_local.desc&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept-Profile': 'bouquetin'
        }
      }
    )
    .then(r => r.ok ? r.json() : [])
    .catch(() => [])
  );

  const results = await Promise.all(promises);
  const locations = results.flat().filter(l => l != null);
  if (locations.length > 0) {
    _setCache(cle, locations);
  }
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
