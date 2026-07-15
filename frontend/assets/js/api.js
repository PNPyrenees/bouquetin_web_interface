import { API_URL } from './config.js';

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
 * Récupère la liste complète des animaux et leurs métadonnées.
 */
export async function fetchAnimals(token) {
  // On sélectionne uniquement les colonnes nécessaires pour alléger la réponse
  const res = await fetch(
    `${API_URL}/t_animal?select=ani_id,ani_nom,ani_code,ani_annee_naissance,ani_date_relache,ani_date_mort,ani_sexe,ani_gestionnaire,ani_pop_rattach&order=ani_nom`,
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

/**
 * Récupère les ani_id "suivis" au sens de la page Carte : collier actif
 * (cor_date_fin IS NULL) ET au moins une position GPS transmise — dérivé du
 * résultat de f_get_localisation (var_ani_is_followed=true, var_limit_par_animal=1),
 * pas d'une requête directe sur cor_animal_capteur. Construction identique à
 * activeIds (app.js:543-545), pour que la page Individus retombe exactement sur
 * la même source de vérité que la page Carte. Un animal avec collier actif mais
 * 0 position (ex. capteur récemment posé ou en panne) n'apparaît PAS dans ce
 * Set — il reste 'non_suivi' côté page Individus, cohérent avec son absence de
 * la liste des individus suivis sur la page Carte.
 */
export async function fetchAnimauxSuivis(token) {
  const locations = await fetchLocalisationsRPC(token, {
    ani_is_followed: true,
    limit_par_animal: 1
  });
  return new Set(locations.map(l => l.ani_id));
}

/**
 * Récupère les ani_id ayant au moins une translocation (t_capture_relache.translocation = true).
 * Utilisé pour le filtre Translocation côté frontend.
 */
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
 * Détail complet d'un animal (t_animal) — champs identité + marquage pour la fiche individu.
 */
export async function fetchAnimalDetail(token, aniId) {
  const res = await fetch(
    `${API_URL}/t_animal?ani_id=eq.${aniId}&select=ani_id,ani_nom,ani_code,ani_sexe,ani_annee_naissance,ani_date_mort,ani_gestionnaire,ani_pop_rattach,ani_marquage_oreille_droite,ani_marquage_oreille_gauche,ani_marquage_couleur_collier,ani_marquage_code_collier,ani_marquage_bande_laterale_collier,ani_commentaire`,
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

/**
 * Capteur(s) associé(s) à l'animal, avec programmation — utilise l'embedding PostgREST
 * (t_capteur, bib_programmation), non teste ailleurs dans ce fichier : necessite des FK
 * entre cor_animal_capteur et ces deux tables cote schema.
 */
export async function fetchCapteurParAnimal(token, aniId) {
  const res = await fetch(
    `${API_URL}/cor_animal_capteur?ani_id=eq.${aniId}&select=cor_id,cor_date_debut,cor_date_fin,capt_id,prog_id,t_capteur(capt_id,capt_id_constructeur,capt_type,capt_frequence,capt_actif),bib_programmation(prog_libelle,prog_frequence,prog_duree_acquisition)&order=cor_date_debut.desc`,
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

/**
 * Historique captures/relâchés d'un animal.
 */
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

/**
 * Appelle la fonction SQL f_get_localisation via PostgREST RPC.
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
    if (filters.limit_par_animal) body.var_limit_par_animal = filters.limit_par_animal;
    body.var_limit  = BATCH_SIZE;
    body.var_offset = offset;

    const res = await fetch(`${API_URL}/rpc/f_get_localisation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Profile': 'bouquetin',
        'Prefer': 'count=none'
      },
      body: JSON.stringify(body)
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

/**
 * Localisations d'un seul animal via f_get_localisation — pour la mini-carte de la fiche individu.
 * Meme RPC que fetchLocalisationsRPC, sans pagination (usage borne a un animal).
 */
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
