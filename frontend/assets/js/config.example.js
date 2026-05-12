export const API_URL = 'https://votre-serveur-postgrest:port';

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