import { API_URL, DEFAULT_LIMIT } from './config.js';

export async function login(username, password) {
  const res = await fetch(`${API_URL}/rpc/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Profile': 'bouquetin'
    },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error('Échec authentification');
  const { token } = await res.json();
  return token;
}

export async function fetchLocations(token, filters = {}) {
  const params = new URLSearchParams();

  // Individus
  if (Array.isArray(filters.ani_id) && filters.ani_id.length > 0) {
    params.append('ani_id', `in.(${filters.ani_id.join(',')})`);
  } else if (filters.ani_id && !Array.isArray(filters.ani_id)) {
    params.append('ani_id', `eq.${filters.ani_id}`);
  }

  // Période
  if (filters.date_from) params.append('loc_datetime_utc', `gte.${filters.date_from}`);
  if (filters.date_to) params.append('loc_datetime_utc', `lte.${filters.date_to}`);

  // Attributs animal
  if (filters.sexe) params.append('ani_sexe', `eq.${filters.sexe}`);
  if (filters.gestionnaire) params.append('ani_gestionnaire', `eq.${filters.gestionnaire}`);
  if (filters.population) params.append('ani_pop_rattach', `eq.${filters.population}`);

  // Qualité GPS — si inclure_outliers coché, on retire tous les filtres qualité
  if (!filters.include_outliers) {
    params.append('loc_anomalie', 'not.is.true');
    params.append('loc_outlier', 'is.null');
  }

  params.append('geom', 'not.is.null');
  params.append('limit', filters.limit || DEFAULT_LIMIT);
  params.append('order', 'loc_datetime_utc.desc');

  const res = await fetch(`${API_URL}/v_localisation?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': 'bouquetin'
    }
  });
  if (!res.ok) throw new Error('Échec chargement données');
  return res.json();
}

export async function fetchAnimals(token) {
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

export async function fetchLastLocationsInactifs(token, filters = {}) {
  const inactifsIds = filters.ani_id || [];

  if (inactifsIds.length === 0) return [];

  // Une requête par animal inactif — récupère uniquement sa dernière position
  const qualiteParams = !filters.include_outliers
    ? '&loc_anomalie=not.is.true&loc_outlier=is.null'
    : '';

  const sexeParam = filters.sexe ? `&ani_sexe=eq.${filters.sexe}` : '';
  const gestionnaireParam = filters.gestionnaire ? `&ani_gestionnaire=eq.${filters.gestionnaire}` : '';
  const populationParam = filters.population ? `&ani_pop_rattach=eq.${filters.population}` : '';

  const promises = inactifsIds.map(ani_id =>
    fetch(
      `${API_URL}/v_localisation?ani_id=eq.${ani_id}&geom=not.is.null${qualiteParams}${sexeParam}${gestionnaireParam}${populationParam}&order=loc_datetime_utc.desc&limit=1`,
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
  return results.flat().filter(l => l != null);
}