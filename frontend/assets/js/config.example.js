export const API_URL = 'https://votre-serveur-postgrest:port';
export const DEFAULT_LIMIT = 300;
export const DEFAULT_CENTER = [-0.15, 42.9];
export const DEFAULT_ZOOM = 9;
export const MAX_ZOOM = 18;

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

export const IGN_API_KEY = 'VOTRE_CLE_IGN';

export const ROLE_LABELS = {
  'role_lecture': 'Lecteur',
  'role_ecriture': 'Administrateur',
};

export const ROLE_INITIALES = {
  'role_lecture': 'LC',
  'role_ecriture': 'AD',
};

export const SEUIL_ALERTE_VOLUME = 40000;

// Nombre de positions par defaut (champ #inputNDernieres, partage entre les modes
// Positions et Trajectoire) et minimum impose au mode Trajectoire — une trajectoire
// necessite au moins 2 points pour tracer un segment.
export const N_POSITIONS_DEFAUT = 5;
export const N_POSITIONS_MIN_TRAJECTOIRE = 2;

export const CLASSES_AGE = {
  F: [
    { label: 'Cabri',      min: 0, max: 0 },
    { label: 'Éterle',     min: 1, max: 1 },
    { label: '2 à 4 ans',  min: 2, max: 3 },
    { label: '4 ans et +', min: 4, max: null }
  ],
  M: [
    { label: 'Cabri',      min: 0, max: 0 },
    { label: 'Éterlou',    min: 1, max: 1 },
    { label: '2 à 3 ans',  min: 2, max: 3 },
    { label: '4 à 8 ans',  min: 4, max: 7 },
    { label: '8 ans et +', min: 8, max: null }
  ],
  TOUS: [
    { label: 'Cabri',      min: 0, max: 0 },
    { label: 'Éterle',     min: 1, max: 1 },
    { label: 'Éterlou',    min: 1, max: 1 },
    { label: '2 à 3 ans',  min: 2, max: 3 },
    { label: '4 à 8 ans',  min: 4, max: 7 },
    { label: '8 ans et +', min: 8, max: null }
  ]
};

export const SAISONS_CONFIG = {
  hiver:     { label: 'Hiver',     from: '01/01', to: '31/03' },
  printemps: { label: 'Printemps', from: '01/04', to: '30/06' },
  ete:       { label: 'Ete',       from: '01/07', to: '15/10' },
  rut:       { label: 'Rut',       from: '16/10', to: '31/12' }
};

export const BASEMAPS_CONFIG = [
  {
    id: 'ign_scan25',
    nom: 'IGN SCAN25',
    apercu: 'assets/img/ign.png',
    type: 'xyz',
    url: `https://data.geopf.fr/private/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&apikey=${IGN_API_KEY}&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN25TOUR&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
    attributions: '©IGN',
    visible: false
  },
  {
    id: 'opentopomap',
    nom: 'OpenTopoMap',
    apercu: 'assets/img/opentopomap.png',
    type: 'xyz',
    url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attributions: '© OpenTopoMap contributors',
    visible: false
  },
  {
    id: 'openstreetmap',
    nom: 'OpenStreetMap',
    apercu: 'assets/img/openstreetmap.png',
    type: 'osm',
    url: null,
    attributions: '© OpenStreetMap contributors',
    visible: false
  },
  {
    id: 'esri_satellite',
    nom: 'Satellite ESRI',
    apercu: 'assets/img/esri_satellite.png',
    type: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attributions: '© Esri, Maxar, Earthstar Geographics',
    visible: true
  },
  {
    id: 'esri_topo',
    nom: 'Topo ESRI',
    apercu: 'assets/img/esri_topo.png',
    type: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attributions: '© Esri, HERE, DeLorme',
    visible: false
  },
  
  {
    id: 'ign_ortho',
    nom: 'Photos aériennes IGN',
    apercu: 'assets/img/ign_ortho.png',
    type: 'xyz',
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attributions: '© IGN Géoportail',
    visible: false
  },
  {
  id: 'ign_topo',
  nom: 'Carte topo IGN',
  apercu: 'assets/img/ign_topo.png',
  type: 'xyz',
  url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
  attributions: '© IGN Géoportail',
  visible: false
  },
  {
    id: 'ign_relief',
    nom: 'Carte du relief IGN',
    apercu: 'assets/img/ign_relief.png',
    type: 'xyz',
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW&STYLE=estompage_grayscale&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attributions: '© IGN Géoportail',
    visible: false
  },


];