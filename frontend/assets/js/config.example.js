export const API_URL = 'https://votre-serveur-postgrest:port';
export const DEFAULT_LIMIT = 300;
export const DEFAULT_CENTER = [-0.15, 42.9];
export const DEFAULT_ZOOM = 9;
export const MAX_ZOOM = 18;

// TEMPORAIRE : force le select Annee des blocs Captures/Translocations (page
// Statistiques) sur la derniere annee au lieu de "Toutes les annees", tant que les
// points aberrants sur la carte ne sont pas corriges Repasser a false
// une fois les donnees corrigees (cf. initFiltreAnneeCaptures/Translocations dans
// reports.js).
export const REPORTS_ANNEE_PAR_DEFAUT_DERNIERE = true;

export const LAMBERT93 =
  '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 ' +
  '+x_0=700000 +y_0=6600000 +ellps=GRS80 ' +
  '+towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

export const ETRS89 = '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

export const PROJECTIONS_COORDONNEES_CONFIG = [
  {
    code: 'EPSG:2154',
    nom: 'Lambert-93',
    proj4def: LAMBERT93,
    parDefaut: true,
    format: c => `X : ${Math.round(c[0])}&nbsp;&nbsp;Y : ${Math.round(c[1])} (Lambert-93)`
  },
  {
    code: 'EPSG:4326',
    nom: 'WGS84',
    proj4def: null,
    parDefaut: false,
    format: c => `Lat : ${c[1].toFixed(5)}&nbsp;&nbsp;Lon : ${c[0].toFixed(5)} (WGS84)`
  },
  {
    code: 'EPSG:3035',
    nom: 'ETRS89',
    proj4def: ETRS89,
    parDefaut: false,
    format: c => `X : ${Math.round(c[0])}&nbsp;&nbsp;Y : ${Math.round(c[1])} (ETRS89)`
  }
];

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
  'pnp_bqt_reader': 'Lecteur',
  'pnp_bqt_writer': 'Administrateur',
};

export const ROLE_INITIALES = {
  'pnp_bqt_reader': 'LC',
  'pnp_bqt_writer': 'AD',
};

export const SEUIL_ALERTE_VOLUME = 40000;

// Deconnexion automatique par inactivite, appliquee aux 3 pages (cf. inactivity.js).
// 0 ou null desactive le mecanisme.
export const INACTIVITY_DELAY_MINUTES = 30;

export const N_POSITIONS_DEFAUT = 5;
export const N_POSITIONS_MIN_TRAJECTOIRE = 2;

export const SEUILS_FRAICHEUR_POSITION = {
  jaune: 24,   // pas de position depuis 24h
  orange: 48,  // pas de position depuis 2 jours
  rouge: 72    // pas de position depuis 3 jours
};

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
    category: 'basemap',
    url: `https://data.geopf.fr/private/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&apikey=${IGN_API_KEY}&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN25TOUR&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
    attributions: '©IGN',
    visible: false
  },
  {
    id: 'openstreetmap',
    nom: 'OpenStreetMap',
    apercu: 'assets/img/openstreetmap.png',
    type: 'osm',
    category: 'basemap',
    url: null,
    attributions: '© OpenStreetMap contributors',
    visible: false
  },
  {
    id: 'esri_satellite',
    nom: 'Satellite ESRI',
    apercu: 'assets/img/esri_satellite.png',
    type: 'xyz',
    category: 'basemap',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attributions: '© Esri, Maxar, Earthstar Geographics',
    visible: false
  },

  // Fonds IGN WMTS (Geoplateforme) — upgrade en place de ign_ortho/ign_topo (memes id,
  // meme visible par defaut) plutot que des entrees dupliquees.
  {
    id: 'ign_ortho',
    nom: 'Photos aériennes IGN',
    apercu: 'assets/img/ign_ortho.png',
    type: 'wmts',
    category: 'basemap',
    layer: 'HR.ORTHOIMAGERY.ORTHOPHOTOS',
    matrixSet: 'PM_6_19',
    style: 'normal',
    format: 'image/jpeg',
    attributions: '© IGN Géoportail',
    visible: true
  },
  {
    id: 'ign_topo',
    nom: 'Plan IGN',
    apercu: 'assets/img/ign_plan.png',
    type: 'wmts',
    category: 'basemap',
    layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2',
    matrixSet: 'PM_0_19',
    style: 'normal',
    format: 'image/png',
    attributions: '© IGN Géoportail',
    visible: false
  },
  {
    id: 'ign_relief',
    nom: 'Carte du relief IGN',
    apercu: 'assets/img/ign_relief.png',
    type: 'xyz',
    category: 'basemap',
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW&STYLE=estompage_grayscale&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attributions: '© IGN Géoportail',
    visible: false
  },
  {
    id: 'ign_relief_slopes',
    nom: 'Relief altitude',
    apercu: 'assets/img/ign_relief_slopes.png',
    type: 'wmts',
    category: 'basemap',
    layer: 'ELEVATION.SLOPES',
    matrixSet: 'PM_6_14',
    style: 'normal',
    format: 'image/jpeg',
    attributions: '© IGN Géoportail',
    visible: false
  },
  {
    id: 'ign_scan50_1950',
    nom: 'Carte historique 1950',
    apercu: 'assets/img/ign_scan50_1950.png',
    type: 'wmts',
    category: 'basemap',
    layer: 'GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950',
    matrixSet: 'PM_3_15',
    style: 'SCAN50_1950',
    format: 'image/jpeg',
    attributions: '© IGN Géoportail',
    visible: false
  },

  // Overlays IGN WMTS — superposables independamment des fonds ci-dessus (category
  // 'overlay'), plusieurs actifs simultanement via toggleOverlay().
  {
    id: 'ign_contours',
    nom: 'Courbes de niveau',
    apercu: 'assets/img/ign_contours.png',
    type: 'wmts',
    category: 'overlay',
    layer: 'ELEVATION.CONTOUR.LINE',
    matrixSet: 'PM_6_18',
    style: 'normal',
    format: 'image/png',
    attributions: '© IGN Géoportail',
    visible: false,
    opacity: 1
  },
  {
    id: 'ign_pentes',
    nom: 'Carte des pentes',
    apercu: 'assets/img/ign_pentes.png',
    type: 'wmts',
    category: 'overlay',
    layer: 'GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN',
    matrixSet: 'PM_0_17',
    style: 'normal',
    format: 'image/png',
    attributions: '© IGN Géoportail',
    visible: false,
    opacity: 0.7
  },
  {
    id: 'ign_hydro',
    nom: 'Hydrographie',
    apercu: 'assets/img/ign_hydro.png',
    type: 'wmts',
    category: 'overlay',
    layer: 'HYDROGRAPHY.HYDROGRAPHY',
    matrixSet: 'PM_6_18',
    style: 'normal',
    format: 'image/png',
    attributions: '© IGN Géoportail',
    visible: false
  },
  {
    id: 'ign_routes',
    nom: 'Réseau routier',
    apercu: 'assets/img/ign_routes.png',
    type: 'wmts',
    category: 'overlay',
    layer: 'TRANSPORTNETWORKS.ROADS',
    matrixSet: 'PM_6_18',
    style: 'normal',
    format: 'image/png',
    attributions: '© IGN Géoportail',
    visible: false
  },
  {
    id: 'ign_occupation_sol',
    nom: 'Occupation du sol',
    apercu: 'assets/img/ign_occupation_sol.png',
    type: 'wmts',
    category: 'overlay',
    layer: 'LANDCOVER.CLC18_FR',
    matrixSet: 'PM_0_16',
    style: 'CORINE Land Cover - France métropolitaine',
    format: 'image/png',
    attributions: '© IGN Géoportail',
    visible: false,
    opacity: 0.7
  },
  {
    id: 'ign_limites_admin',
    nom: 'Limites administratives',
    apercu: 'assets/img/ign_limites_admin.png',
    type: 'wmts',
    category: 'overlay',
    layer: 'ADMINEXPRESS-COG-CARTO.LATEST',
    matrixSet: 'PM_6_16',
    style: 'normal',
    format: 'image/png',
    attributions: '© IGN Géoportail',
    visible: false
  },
  {
    id: 'ign_parcs_nationaux',
    nom: 'Parcs nationaux (France)',
    apercu: 'assets/img/ign_parcs_nationaux.png',
    type: 'wmts',
    category: 'overlay',
    layer: 'Patrinat_PN',
    matrixSet: 'PM_6_16',
    style: 'normal',
    format: 'image/png',
    attributions: '© IGN Géoportail / Patrinat',
    visible: false
  },
  {
    id: 'ign_forets',
    nom: 'Forêts (BD Forêt)',
    apercu: 'assets/img/ign_forets.png',
    type: 'wmts',
    category: 'overlay',
    layer: 'LANDCOVER.FORESTINVENTORY.V2',
    matrixSet: 'PM_6_16',
    style: 'normal',
    format: 'image/png',
    attributions: '© IGN Géoportail',
    visible: false
  },
  {
    id: 'ign_lidar_hd',
    nom: 'Estompage LiDAR HD',
    apercu: 'assets/img/ign_lidar_hd.png',
    type: 'wmts',
    category: 'overlay',
    layer: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW',
    matrixSet: 'PM_0_18',
    style: 'normal',
    format: 'image/png',
    attributions: '© IGN Géoportail',
    visible: false,
    opacity: 0.6
  }
];

export const COULEURS_MARQUAGE = {
  blanc: '#ffffff',
  bleu: '#2563eb',
  jaune: '#f2c14e',
  noir: '#1a1a1a',
  orange: '#e8720c',
  rouge: '#c0392b',
  vert: '#2D6A4F',
  verte: '#2D6A4F',
  violet: '#7b2d8e'
};

export const GLASBEY_32 = [
  '#0000FF', '#FF0000', '#00FF00', '#000033', '#FF00B6', '#005300', '#FFD300', '#009FFF',
  '#9A4D42', '#00FFBE', '#783FC1', '#1F9698', '#FFACFD', '#B1CC71', '#F1085C', '#FE8F42',
  '#DD00FF', '#201A01', '#720055', '#766C95', '#02AD24', '#C8FF00', '#886C00', '#FFB79F',
  '#858567', '#A10300', '#14F9FF', '#00478E', '#96F1FA', '#65FF00', '#FF937E', '#CB0076'
];

export function getCouleurParIndex(index) {
  return GLASBEY_32[index % GLASBEY_32.length];
}
