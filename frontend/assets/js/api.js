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
  if (filters.ani_id)     params.append('ani_id', `eq.${filters.ani_id}`);
  if (filters.date_from)  params.append('loc_datetime_utc', `gte.${filters.date_from}`);
  if (filters.date_to)    params.append('loc_datetime_utc', `lte.${filters.date_to}`);
  if (filters.valid_only !== false) params.append('loc_anomalie', 'is.null');
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
    `${API_URL}/t_animal?select=ani_id,ani_nom&order=ani_nom`,
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