export const API_URL = 'https://votre-serveur-postgrest:port';
export const DEV_PASSWORD = 'votre-mot-de-passe';

export const DEFAULT_LIMIT = 300;
export const DEFAULT_CENTER = [-0.15, 42.9];
export const DEFAULT_ZOOM = 9;
export const MAX_ZOOM = 18;

export const ROLES = {
  READER: 'votre_role_reader',
  WRITER: 'votre_role_writer',
};

export const LAMBERT93 =
  '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 ' +
  '+x_0=700000 +y_0=6600000 +ellps=GRS80 ' +
  '+towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

// Niveaux de zoom
export const ZOOM_POINT_SINGLE = 14;
export const ZOOM_FILTER_SINGLE = 13;
export const ZOOM_FILTER_MULTI = 13;
export const ZOOM_TRAJECTOIRE_SINGLE = 14;
export const ZOOM_TRAJECTOIRE_MULTI = 12;
export const ZOOM_MAX_MANUAL = 18;
export const ZOOM_MIN_MANUAL = 6;

export const IGN_API_KEY = 'ign_scan_ws'; 
