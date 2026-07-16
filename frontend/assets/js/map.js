import { DEFAULT_CENTER, DEFAULT_ZOOM, MAX_ZOOM, LAMBERT93, ZOOM_POINT_SINGLE, ZOOM_MAX_MANUAL, ZOOM_MIN_MANUAL, IGN_API_KEY, BASEMAPS_CONFIG, coordonneesPlausibles } from './config.js';
let map;
let gpsSource;
let gpsLayer;
let trajectoireSource;
let popupOverlay;
let basemaps = [];
let isAnimating = false;

const couleursIndividus = new Map();
const indicesIndividus = new Map();

// Drapeau de perte de contexte WebGL — positionne a true par le handler
// webglcontextlost, repasse a false sur webglcontextrestored.
// Les listeners pointermove et singleclick le testent avant tout appel
// a hasFeatureAtPixel / forEachFeatureAtPixel pour ne pas appeler des
// methodes WebGL sur un contexte invalide (evite le crash en cascade).
let _webglContextLost = false;

// Mode de coloration actif — conserve entre deux appels pour que
// changerModeCouleur() sache quels attributs sont deja en place sur les features.
let _modeCouleurActif = 'individu';

// Palette Glasbey 32 — conçue pour maximiser la distance perceptuelle
// Source : Glasbey et al. (2007), utilisée en bioinformatique et cartographie SIG
const GLASBEY_32 = [
  '#0000FF', // 1  Bleu
  '#FF0000', // 2  Rouge
  '#00FF00', // 3  Vert
  '#000033', // 4  Bleu nuit
  '#FF00B6', // 5  Rose
  '#005300', // 6  Vert fonce
  '#FFD300', // 7  Jaune
  '#009FFF', // 8  Bleu ciel
  '#9A4D42', // 9  Marron
  '#00FFBE', // 10 Turquoise
  '#783FC1', // 11 Violet
  '#1F9698', // 12 Teal
  '#FFACFD', // 13 Rose clair
  '#B1CC71', // 14 Vert-jaune
  '#F1085C', // 15 Rouge-rose
  '#FE8F42', // 16 Orange
  '#DD00FF', // 17 Magenta
  '#201A01', // 18 Noir-marron
  '#720055', // 19 Bordeaux
  '#766C95', // 20 Gris-violet
  '#02AD24', // 21 Vert vif
  '#C8FF00', // 22 Vert citron
  '#886C00', // 23 Or fonce
  '#FFB79F', // 24 Saumon
  '#858567', // 25 Kaki
  '#A10300', // 26 Rouge fonce
  '#14F9FF', // 27 Cyan vif
  '#00478E', // 28 Bleu marine
  '#96F1FA', // 29 Bleu clair
  '#65FF00', // 30 Vert lime
  '#FF937E', // 31 Corail
  '#CB0076', // 32 Framboise
];

// Contours variables — 4 styles pour differencier les individus avec couleurs proches
const CONTOURS = [
  { strokeR: 255, strokeG: 255, strokeB: 255, strokeA: 1, strokeWidth: 2 }, // Blanc
  { strokeR: 0,   strokeG: 0,   strokeB: 0,   strokeA: 1, strokeWidth: 2 }, // Noir
  { strokeR: 255, strokeG: 220, strokeB: 0,   strokeA: 1, strokeWidth: 2 }, // Jaune
  { strokeR: 0,   strokeG: 200, strokeB: 255, strokeA: 1, strokeWidth: 2 }, // Cyan
];

// Suffixe normalise par mode — utilise par renderPoints() (mode actif uniquement)
// et changerModeCouleur() (injection des nouvelles couleurs a la volee).
const MODES_COULEUR_SUFFIXES = { individu: 'Individu', sexe: 'Sexe', gestionnaire: 'Gestionnaire' };

function getCouleurParIndex(index) {
  return GLASBEY_32[index % GLASBEY_32.length];
}

export function getContourParIndex(index) {
  // Changer de contour tous les 32 individus (une palette complete)
  return CONTOURS[Math.floor(index / GLASBEY_32.length) % CONTOURS.length];
}

/**
 * Analyse les données avant rendu pour initialiser les échelles de couleurs.
 */
function preparerCouleurs(locations) {
  couleursIndividus.clear();
  indicesIndividus.clear();
  const ids = [...new Set(locations.map(l => l.ani_id))];
  ids.forEach((id, i) => {
    couleursIndividus.set(id, getCouleurParIndex(i));
    indicesIndividus.set(id, i);
  });
}

/**
 * Calcule une couleur sur un gradient multi-étapes.
 */
function getGradientColor(ratio) {
  const colors = [
    [255, 190, 11],  // Ancien : Jaune
    [251, 86, 7],    // Orange
    [155, 35, 53],   // Rouge
    [131, 56, 236]   // Récent : Violet
  ];
  const idx = Math.min(Math.floor(ratio * (colors.length - 1)), colors.length - 2);
  const localRatio = (ratio - idx / (colors.length - 1)) * (colors.length - 1);
  const c1 = colors[idx];
  const c2 = colors[idx + 1];
  const r = Math.round(c1[0] + localRatio * (c2[0] - c1[0]));
  const g = Math.round(c1[1] + localRatio * (c2[1] - c1[1]));
  const b = Math.round(c1[2] + localRatio * (c2[2] - c1[2]));
  return `rgb(${r},${g},${b})`;
}

/**
 * Retourne la couleur d'un point selon le mode de coloration.
 */
export function getCouleur(loc, mode) {
  switch (mode) {
    case 'individu':
    default:
      return couleursIndividus.get(loc.ani_id) || getCouleurParIndex(0);

    // case 'date': { ... } // Désactivé temporairement - à valider avec Ludovic/Alexandre
    // case 'saison': { ... } // Désactivé temporairement - à valider avec Ludovic/Alexandre

    case 'sexe':
      if (loc.ani_sexe === 'M') return '#3A86FF';
      if (loc.ani_sexe === 'F') return '#FF006E';
      return '#aaaaaa';

    case 'gestionnaire':
      if (loc.ani_gestionnaire === 'PNP') return '#2D6A4F';
      if (loc.ani_gestionnaire === 'PNRPA') return '#E07B39';
      return '#aaaaaa';
  }
}

/**
 * Initialise la carte et ses couches de base.
 * @param {string} targetId - ID de l'élément HTML contenant la carte
 * @param {string} popupId - ID de l'élément HTML servant de popup
 */
export function initMap(targetId, popupId) {
  // Définition de la projection Lambert-93 (France) via Proj4
  proj4.defs('EPSG:2154', LAMBERT93);
  ol.proj.proj4.register(proj4);

  // Initialisation des sources vectorielles (données géométriques)
  gpsSource = new ol.source.Vector();
  trajectoireSource = new ol.source.Vector();

  // Création de la couche des points GPS — style initial mode Individu (coherent avec
  // le radio coche par defaut dans index.html) ; voir changerModeCouleur() pour la bascule.
  // Reduction a 6 attributs GPU par feature (fillR/G/B, strokeR/G/B) au lieu de 18 —
  // le mode actif est le seul calcule et stocke sur les features.
  gpsLayer = new ol.layer.WebGLPoints({
    source: gpsSource,
    style: {
      'circle-radius': ['get', 'radius'],
      'circle-fill-color': ['color', ['get', 'fillR'], ['get', 'fillG'], ['get', 'fillB'], ['get', 'fillA']],
      'circle-stroke-color': ['color', ['get', 'strokeR'], ['get', 'strokeG'], ['get', 'strokeB'], ['get', 'strokeA']],
      'circle-stroke-width': ['get', 'strokeWidth']
    }
  });

  // Création de la couche des lignes (trajectoires)
  const trajectoireLayer = new ol.layer.Vector({
    source: trajectoireSource
  });

  // Définition des fonds de carte (générés depuis BASEMAPS_CONFIG)
  basemaps = BASEMAPS_CONFIG.map(bm => {
    let source;
    if (bm.type === 'osm') {
      source = new ol.source.OSM();
    } else if (bm.type === 'wms') {
      source = new ol.source.TileWMS({
        url: bm.url,
        params: bm.wmsParams || {},
        serverType: 'geoserver',
        attributions: bm.attributions
      });
    } else {
      source = new ol.source.XYZ({
        url: bm.url.includes('IGN_API_KEY')
          ? bm.url.replace('${IGN_API_KEY}', IGN_API_KEY)
          : bm.url,
        attributions: bm.attributions
      });
    }
    return new ol.layer.Tile({ source, visible: bm.visible });
  });

  // Préparation du popup (Overlay)
  const popupEl = document.getElementById(popupId);
  popupOverlay = new ol.Overlay({
    element: popupEl,
    positioning: 'bottom-center',
    offset: [0, -16]
  });

  // Création de l'objet Map principal
  map = new ol.Map({
    target: targetId,
    layers: [
      ...basemaps,
      trajectoireLayer,
      gpsLayer
    ],
    overlays: [popupOverlay],
    view: new ol.View({
      center: ol.proj.transform(DEFAULT_CENTER, 'EPSG:4326', 'EPSG:3857'),
      zoom: DEFAULT_ZOOM,
      maxZoom: ZOOM_MAX_MANUAL,
      minZoom: ZOOM_MIN_MANUAL
    }),
    controls: ol.control.defaults.defaults({ zoom: false, rotate: false }).extend([
      new ol.control.ScaleLine({
        units: 'metric',
        type: 'scalebar',
        steps: 4,
        text: true,
        minWidth: 100,
        target: document.getElementById('scaleTarget')
      }),
      new ol.control.FullScreen({
        className: 'ol-fullscreen-custom',
        tipLabel: 'Plein écran'
      })
    ])
  });

  // Handler webglcontextlost / webglcontextrestored — installe apres le premier
  // rendu d OpenLayers (evenement postrender, once:true), moment ou le canvas WebGL
  // est garanti existant. Un setTimeout(0) ne suffisait pas car OL cree le canvas
  // de facon asynchrone pendant son propre cycle de rendu.
  map.once('postrender', () => {
    const canvas = map.getViewport().querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('webglcontextlost', evt => {
        evt.preventDefault(); // indique a OL qu on gere l evenement
        _webglContextLost = true;
        console.warn('WebGL context lost — les interactions carte sont suspendues.');
        const msg = 'Volume de données trop important pour le GPU — la carte est ' +
          'temporairement indisponible. Réduisez les filtres ou rechargez la page.';
        if (window._showToast) {
          window._showToast(msg);
        } else {
          console.error(msg);
        }
      });
      canvas.addEventListener('webglcontextrestored', () => {
        _webglContextLost = false;
        console.info('WebGL context restored — les interactions carte sont restaurées.');
        if (window._showToast) {
          window._showToast('Contexte GPU restauré — la carte est de nouveau disponible.');
        }
      });
    } else {
      console.warn('initMap : canvas WebGL introuvable après postrender — le handler webglcontextlost ne peut pas être installé.');
    }
  });

  // Changement du curseur au survol d'un point.
  // Guard _webglContextLost : si le contexte GPU est perdu, hasFeatureAtPixel()
  // appelle en interne forEachFeatureAtCoordinate -> RenderTarget.readPixel et
  // plante sur this.helper undefined (PointsLayer.js:304). On coupe court ici.
  map.on('pointermove', evt => {
    if (_webglContextLost) return;
    try {
      map.getViewport().style.cursor = map.hasFeatureAtPixel(evt.pixel) ? 'pointer' : '';
    } catch (err) {
      // Le contexte peut etre perdu entre le guard et l appel reel (race condition)
      // — on absorbe silencieusement pour eviter la cascade de TypeError.
      console.warn('hasFeatureAtPixel echoue (contexte WebGL invalide ?) :', err.message);
    }
  });

  // Gestion du clic pour afficher le popup.
  // Meme guard que pointermove : forEachFeatureAtPixel appelle la meme chaine
  // WebGL interne et planterait sur un contexte perdu.
  map.on('singleclick', evt => {
    if (_webglContextLost) return;
    let hit = false;
    let aniId = null;
    let locDatetime = null;
    try {
      // Utiliser layerFilter pour cibler directement la couche GPS
      map.forEachFeatureAtPixel(evt.pixel, feature => {
        if (hit) return;
        hit = true;
        aniId = String(feature.get('ani_id'));
        locDatetime = feature.get('loc_datetime_local') || feature.get('loc_date_local');
        showPopup(feature, evt.coordinate, popupEl);
      }, {
        layerFilter: layer => layer === gpsLayer
      });
    } catch (err) {
      console.warn('forEachFeatureAtPixel echoue (contexte WebGL invalide ?) :', err.message);
      return;
    }
    if (!hit) popupEl.style.display = 'none';

    document.querySelectorAll('.panel-table-row.selected-carte').forEach(tr => {
      tr.classList.remove('selected-carte');
    });

    const panneauOuvert = document.getElementById('sidebarRight')?.classList.contains('visible');
    if (panneauOuvert && aniId) {
      window._scrollToAniId?.(aniId, locDatetime);
      window._scrollToAniIdIndividus?.(aniId);

      setTimeout(() => {
        document.querySelectorAll('.panel-table-row').forEach(tr => {
          if (tr.dataset.aniId === aniId && (!locDatetime || tr.dataset.locDatetime === locDatetime)) {
            tr.classList.add('selected-carte');
          }
        });
      }, 50);
      window._setAniIdSelectionne?.(aniId);
    }
  });

  // Fermer le popup uniquement au déplacement manuel (drag)
  map.on('movestart', () => {
    if (!isAnimating && popupEl) popupEl.style.display = 'none';
  });

  // Observateur de redimensionnement robuste pour synchroniser OpenLayers avec les dimensions réelles du DOM
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      if (map) {
        map.updateSize();
      }
    });
    const mapEl = document.getElementById(targetId);
    if (mapEl) {
      resizeObserver.observe(mapEl);
    }
  }

  setTimeout(() => map.updateSize(), 100);
  setTimeout(() => map.updateSize(), 300);
  setTimeout(() => map.updateSize(), 600);

  return map;
}

// Memoise — la palette ne compte qu une poignee de couleurs distinctes, mais renderPoints()
// appelle desormais cssToRgba() pour les 3 modes de coloration sur chaque point
const _rgbaCache = new Map();
function cssToRgba(css) {
  if (_rgbaCache.has(css)) return _rgbaCache.get(css);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  const rgba = [d[0], d[1], d[2], d[3] / 255];
  _rgbaCache.set(css, rgba);
  return rgba;
}

/**
 * Dessine les points GPS sur la carte.
 * @param {Array} locations - Liste des positions (Lambert-93)
 * @param {boolean} clearBefore - Si vrai, efface les points existants
 * @param {boolean} modeTrajectoire - Si vrai, applique le style spécifique trajectoire
 * @param {string} modeCouleur - Mode de coloration actif
 */
export function renderPoints(locations, clearBefore = true, modeTrajectoire = false, modeCouleur = 'individu') {
  if (clearBefore) gpsSource.clear();

  preparerCouleurs(locations);

  // Identification du premier et du dernier point pour chaque animal
  const premiereParIndividu = {};
  const derniereParIndividu = {};
  locations.forEach(loc => {
    const date = new Date(loc.loc_datetime_local || loc.loc_date_local);
    if (!premiereParIndividu[loc.ani_id] || date < new Date(premiereParIndividu[loc.ani_id].date)) {
      premiereParIndividu[loc.ani_id] = { date: loc.loc_datetime_local || loc.loc_date_local, loc };
    }
    if (!derniereParIndividu[loc.ani_id] || date > new Date(derniereParIndividu[loc.ani_id].date)) {
      derniereParIndividu[loc.ani_id] = { date: loc.loc_datetime_local || loc.loc_date_local, loc };
    }
  });

  locations.forEach(loc => {
    if (!loc.geom?.coordinates) return;

    // Garde-fou donnees corrompues (ex: notation scientifique aberrante en base, cf.
    // meme validation dans individuals.js/config.js) — point ignore silencieusement
    // (console.warn de diagnostic) plutot qu'ajoute a gpsSource, pour ne pas fausser
    // le recentrage automatique (getExtent()) ni le rendu WebGL.
    if (!coordonneesPlausibles(loc.geom.coordinates)) {
      console.warn('Position GPS avec coordonnees hors plage plausible, ignoree :', loc.geom.coordinates, loc);
      return;
    }

    const wgs84 = proj4('EPSG:2154', 'EPSG:4326', loc.geom.coordinates);
    const coord = ol.proj.fromLonLat(wgs84);

    const estDernier = modeTrajectoire &&
      derniereParIndividu[loc.ani_id]?.date === (loc.loc_datetime_local || loc.loc_date_local);
    const estPremier = modeTrajectoire &&
      premiereParIndividu[loc.ani_id]?.date === (loc.loc_datetime_local || loc.loc_date_local);
    const estDepart = modeTrajectoire && estPremier && !estDernier;

    const idx = indicesIndividus.get(loc.ani_id) ?? 0;
    const contour = getContourParIndex(idx);

    let radius, strokeWidth;
    if (estDepart) {
      radius = 6;
      strokeWidth = 2.5;
    } else if (modeTrajectoire && estDernier) {
      // Meme contour par index que les autres points — coherent avec la legende
      radius = 8;
      strokeWidth = contour.strokeWidth;
    } else if (modeTrajectoire) {
      // Contour variable selon l index de l individu — coherent avec la legende et le mode Positions
      radius = 4;
      strokeWidth = 1;
    } else {
      // Mode Positions — contour variable selon l index de l individu
      radius = 6;
      strokeWidth = contour.strokeWidth;
    }

    // 6 attributs GPU uniquement (mode actif) — reduit la charge memoire GPU
    // par rapport a l ancienne approche (18 attributs pour les 3 modes precalcules).
    // changerModeCouleur() re-parcourt les features pour injecter les nouvelles
    // couleurs a la volee au changement de mode (cout CPU negligeable vs gain GPU).
    const [cR, cG, cB] = cssToRgba(getCouleur(loc, modeCouleur));
    const featureAttrs = {
      geometry: new ol.geom.Point(coord),
      ...loc,
      radius,
      strokeWidth,
      fillA: 1,
      strokeA: 1
    };

    if (estDepart) {
      featureAttrs.fillR = 255;
      featureAttrs.fillG = 255;
      featureAttrs.fillB = 255;
      featureAttrs.strokeR = cR;
      featureAttrs.strokeG = cG;
      featureAttrs.strokeB = cB;
    } else {
      featureAttrs.fillR = cR;
      featureAttrs.fillG = cG;
      featureAttrs.fillB = cB;
      featureAttrs.strokeR = contour.strokeR;
      featureAttrs.strokeG = contour.strokeG;
      featureAttrs.strokeB = contour.strokeB;
    }

    const feature = new ol.Feature(featureAttrs);
    gpsSource.addFeature(feature);
  });

  _modeCouleurActif = modeCouleur;
  // Pas d appel a changerModeCouleur() ici — les features viennent d etre crees
  // avec les bons attributs fillR/G/B, le style de gpsLayer pointe deja sur ces
  // attributs generiques (cf. initMap). Un setStyle redondant forcerait un re-rendu
  // inutile apres le addFeature massif.

  return gpsSource.getFeatures().length;
}

/**
 * Bascule la couche de points GPS sur un autre mode de coloration (individu/sexe/gestionnaire).
 * Recalcule et injecte les couleurs a la volee sur chaque feature existante — les features
 * ne stockent plus que 6 attributs GPU (fillR/G/B + strokeR/G/B pour le mode actif),
 * contre 18 dans l ancienne approche (3 modes precalcules simultanement).
 */
export function changerModeCouleur(modeCouleur) {
  if (!gpsLayer || !gpsSource) return;

  // Re-injection des couleurs sur chaque feature existante.
  // preparerCouleurs() a ete appele par renderPoints() avant nous — couleursIndividus
  // et indicesIndividus sont a jour. On relit les metadonnees de chaque feature
  // plutot que de conserver une reference au loc d origine (features deja en gpsSource).
  const features = gpsSource.getFeatures();
  features.forEach(f => {
    const loc = {
      ani_id: f.get('ani_id'),
      ani_sexe: f.get('ani_sexe'),
      ani_gestionnaire: f.get('ani_gestionnaire')
    };
    const [cR, cG, cB] = cssToRgba(getCouleur(loc, modeCouleur));
    const idx = indicesIndividus.get(loc.ani_id) ?? 0;
    const contour = getContourParIndex(idx);

    // Point de depart (trajectoire) : fond blanc, contour colore — identifie par strokeA != fillA
    // heuristique : on detecte le "depart" par le fait que fillR/G/B valent 255/255/255
    // ET strokeR/G/B ne valent pas 255/255/255 (contour colore, pas blanc).
    // On ne peut pas relire estDepart directement (non stocke sur la feature) — mais
    // renderPoints() a stocke fillA=1 pour tous, donc on detecte via les valeurs RGB.
    const estDepart = f.get('fillR') === 255 && f.get('fillG') === 255 && f.get('fillB') === 255 &&
      !(f.get('strokeR') === 255 && f.get('strokeG') === 255 && f.get('strokeB') === 255);

    if (estDepart) {
      f.set('fillR', 255);
      f.set('fillG', 255);
      f.set('fillB', 255);
      f.set('strokeR', cR);
      f.set('strokeG', cG);
      f.set('strokeB', cB);
    } else {
      f.set('fillR', cR);
      f.set('fillG', cG);
      f.set('fillB', cB);
      f.set('strokeR', contour.strokeR);
      f.set('strokeG', contour.strokeG);
      f.set('strokeB', contour.strokeB);
    }
  });

  _modeCouleurActif = modeCouleur;

  // Le style WebGL pointe toujours sur fillR/G/B et strokeR/G/B (generiques) —
  // les f.set() ci-dessus declenchent automatiquement le re-rendu OL via changed().
  // Pas besoin de setStyle() ni de recreer la couche.
}

/**
 * Affiche le popup d'information au-dessus d'un point cliqué.
 */
function showPopup(feature, coordinate, popupEl) {
  const p = feature.getProperties();
  const isTrajectoire = document.getElementById('btnTrajectoire')?.classList.contains('active');

  const dateStr = p.loc_datetime_local
    ? p.loc_datetime_local.replace('T', ' ').slice(0, 16)
    : p.loc_date_local
      ? p.loc_date_local.replace('T', ' ').slice(0, 16)
      : 'N/A';

  popupEl.innerHTML = '';
  const content = document.createElement('div');
  content.className = 'popup-content';

  const strong = document.createElement('strong');
  strong.textContent = p.ani_nom || 'N/A';
  content.appendChild(strong);

  const info = document.createElement('div');
  info.className = 'popup-info';

  if (isTrajectoire) {
    const span = document.createElement('span');
    span.textContent = dateStr;
    info.appendChild(span);
  } else {
    const labelEl = document.createElement('span');
    labelEl.textContent = 'Dernière position :';
    const dateDiv = document.createElement('div');
    dateDiv.className = 'date-value';
    dateDiv.textContent = dateStr;
    info.appendChild(labelEl);
    info.appendChild(dateDiv);
  }

  content.appendChild(info);
  popupEl.appendChild(content);

  popupOverlay.setPosition(coordinate);
  popupEl.style.display = 'block';
  isAnimating = true;
  map.getView().animate({ center: coordinate, duration: 400 }, () => {
    isAnimating = false;
  });
}

/**
 * Dessine les lignes reliant les points GPS pour former une trajectoire.
 */
export function renderTrajectoire(locations, modeCouleur = 'individu') {
  trajectoireSource.clear();
  preparerCouleurs(locations);

  // Groupement des points par individu
  const parIndividu = {};
  locations.forEach(loc => {
    if (!loc.geom?.coordinates) return;
    if (!coordonneesPlausibles(loc.geom.coordinates)) {
      console.warn('Position GPS avec coordonnees hors plage plausible, ignoree (trajectoire) :', loc.geom.coordinates, loc);
      return;
    }
    if (!parIndividu[loc.ani_id]) parIndividu[loc.ani_id] = [];

    const wgs84 = proj4('EPSG:2154', 'EPSG:4326', loc.geom.coordinates);
    const coord = ol.proj.fromLonLat(wgs84);
    parIndividu[loc.ani_id].push({ coord, loc });
  });

  Object.entries(parIndividu).forEach(([ani_id, points]) => {
    if (points.length < 2) return;

    points.sort((a, b) => new Date(a.loc.loc_datetime_local) - new Date(b.loc.loc_datetime_local));
    const coords = points.map(p => p.coord);
    const couleur = getCouleur(points[0].loc, modeCouleur);

    const ligne = new ol.Feature({ geometry: new ol.geom.LineString(coords) });
    ligne.set('ani_id', ani_id);
    ligne.setStyle(new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: couleur,
        width: 1.5,
        lineCap: 'round',
        lineJoin: 'round'
      })
    }));
    trajectoireSource.addFeature(ligne);

    // Ajout de flèches directionnelles sur les segments assez longs
    for (let i = 0; i < coords.length - 1; i++) {
      const coordA = coords[i];
      const coordB = coords[i + 1];
      const dx = coordB[0] - coordA[0];
      const dy = coordB[1] - coordA[1];
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 100) continue;

      const rotation = Math.atan2(dy, dx) - Math.PI / 2;
      const midpoint = [(coordA[0] + coordB[0]) / 2, (coordA[1] + coordB[1]) / 2];

      const fleche = new ol.Feature({ geometry: new ol.geom.Point(midpoint) });
      fleche.set('ani_id', ani_id);
      fleche.setStyle(new ol.style.Style({
        image: new ol.style.RegularShape({
          points: 3,
          radius: 6,
          rotation: -rotation,
          fill: new ol.style.Fill({ color: couleur }),
          stroke: new ol.style.Stroke({ color: 'white', width: 1 }),
          rotateWithView: false
        })
      }));
      trajectoireSource.addFeature(fleche);
    }
  });
}

// --- Fonctions utilitaires d'export ---

export function clearMap() {
  gpsSource.clear();
  trajectoireSource.clear();
}

export function clearMapPoints() {
  gpsSource.clear();
}

export function clearTrajectoire() {
  if (trajectoireSource) trajectoireSource.clear();
}

export function updateMapSize() {
  if (map) map.updateSize();
}

/**
 * Alterne entre les différents fonds de carte disponibles.
 * @param {number} index - Index de la couche dans le tableau basemaps
 */
export function switchBasemap(index) {
  basemaps.forEach((layer, i) => {
    layer.setVisible(i === index);
  });
}

export function getMap() { return map; }
export function getGpsSource() { return gpsSource; }
export function getCouleursIndividus() { return couleursIndividus; }
export function getIndicesIndividus() { return indicesIndividus; }

/**
 * Masque/affiche les points GPS selon les lignes visibles dans le tableau Localisations.
 * @param {Set<string>|null} visiblesSet - cles 'ani_id__datetime' visibles, ou null pour tout restaurer
 */
export function filtrerPointsParVisibilite(visiblesSet) {
  const features = gpsSource.getFeatures();
  features.forEach(f => {
    if (visiblesSet === null) {
      if (f.get('_fillAOriginal') !== undefined) {
        f.set('fillA', f.get('_fillAOriginal'));
        f.set('strokeA', f.get('_strokeAOriginal'));
      }
      return;
    }
    const key = `${f.get('ani_id')}__${f.get('loc_datetime_local') || f.get('loc_date_local')}`;
    const visible = visiblesSet.has(key);
    if (f.get('_fillAOriginal') === undefined) {
      f.set('_fillAOriginal', f.get('fillA'));
      f.set('_strokeAOriginal', f.get('strokeA'));
    }
    f.set('fillA', visible ? f.get('_fillAOriginal') : 0);
    f.set('strokeA', visible ? f.get('_strokeAOriginal') : 0);
  });

  // Filtrer les lignes et fleches de trajectoire (trajectoireSource, distinct de gpsSource)
  const trajFeatures = trajectoireSource?.getFeatures() || [];

  const aniIdsVisibles = visiblesSet === null
    ? null
    : new Set([...visiblesSet].map(k => k.split('__')[0]));

  trajFeatures.forEach(f => {
    const geom = f.getGeometry();
    const style = f.getStyle();
    if (!style) return;

    const aniId = String(f.get('ani_id') || '');

    if (visiblesSet === null) {
      if (f.get('_styleOriginal')) {
        f.setStyle(f.get('_styleOriginal'));
      }
      return;
    }

    // Sauvegarder style original si pas encore fait
    if (!f.get('_styleOriginal')) {
      f.set('_styleOriginal', style);
    }

    const visible = !aniId || aniIdsVisibles?.has(aniId);
    if (!visible) {
      if (geom?.getType() === 'LineString') {
        f.setStyle(new ol.style.Style({
          stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0)', width: 0 })
        }));
      } else {
        f.setStyle(new ol.style.Style({}));
      }
    } else {
      f.setStyle(f.get('_styleOriginal'));
    }
  });
}

export function highlightPoint(ani_id, actif) {
  const features = gpsSource.getFeatures();
  features.forEach(f => {
    if (String(f.get('ani_id')) === String(ani_id)) {
      if (actif) {
        f.set('_originalRadius', f.get('radius'));
        f.set('radius', (f.get('radius') || 6) + 3);
      } else {
        f.set('radius', f.get('_originalRadius') || 6);
      }
    }
  });
}

export function zoomToPoint(loc) {
  const features = gpsSource.getFeatures();
  const feature = features.find(f => String(f.get('ani_id')) === String(loc.ani_id));
  if (!feature) return;

  const geom = feature.getGeometry();
  if (!geom) return;

  const coord = geom.getCoordinates();
  map.getView().animate({ center: coord, duration: 400 });
}

// --- Filtre spatial par dessin de polygone ---

const _drawSource = new ol.source.Vector();
const _drawLayer = new ol.layer.Vector({
  source: _drawSource,
  style: new ol.style.Style({
    fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.3)' }),
    stroke: new ol.style.Stroke({
      color: 'rgba(0, 153, 255, 1)',
      width: 3,
      lineDash: [6, 4]
    })
  }),
  zIndex: 10
});

let _drawInteraction = null;

export function activerDessinSpatial(onPolygonDrawn, geometryType = 'Polygon') {
  if (!map) return;

  if (!map.getLayers().getArray().includes(_drawLayer)) {
    map.addLayer(_drawLayer);
  }

  if (_drawInteraction) {
    map.removeInteraction(_drawInteraction);
  }

  _drawSource.clear();

  // Pour le rectangle, utiliser createBox avec type Circle
  const isBox = geometryType === 'Box';
  _drawInteraction = new ol.interaction.Draw({
    source: _drawSource,
    type: isBox ? 'Circle' : 'Polygon',
    geometryFunction: isBox ? ol.interaction.Draw.createBox() : undefined,
    stopClick: true,
    condition: (e) => ol.events.condition.noModifierKeys(e) && ol.events.condition.primaryAction(e)
  });

  _drawInteraction.on('drawend', (e) => {
    // Désactiver l'interaction après le dessin
    map.removeInteraction(_drawInteraction);
    _drawInteraction = null;

    // Export WKT en EPSG:4326 — format attendu par f_get_localisation
    const writer = new ol.format.WKT();
    const geomClone = e.feature.getGeometry().clone().transform(
      map.getView().getProjection(),
      'EPSG:4326'
    );
    const wkt = writer.writeGeometry(geomClone);

    if (onPolygonDrawn) onPolygonDrawn(wkt);
  });

  map.addInteraction(_drawInteraction);
}

export function desactiverDessinSpatial() {
  if (!map) return;
  if (_drawInteraction) {
    map.removeInteraction(_drawInteraction);
    _drawInteraction = null;
  }
}

export function effacerDessinSpatial() {
  _drawSource.clear();
}