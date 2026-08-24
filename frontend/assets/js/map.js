import { DEFAULT_CENTER, DEFAULT_ZOOM, PROJECTIONS_COORDONNEES_CONFIG, ZOOM_MAX_MANUAL, ZOOM_MIN_MANUAL, IGN_API_KEY, BASEMAPS_CONFIG, GLASBEY_32, getCouleurParIndex } from './config.js';
let map;
let gpsSource;
let gpsLayer;
let haloSource;
let haloLayer;
let trajectoireSource;
let popupOverlay;
let basemaps = [];
let overlaysWmts = new Map();
let isAnimating = false;

const couleursIndividus = new Map();
const indicesIndividus = new Map();
const couleursPopulations = new Map();
const couleursAnnees = new Map();

let _webglContextLost = false;

// Ordre explicite des couches — necessaire car une couche avec zIndex explicite
// (import GeoJSON, dessin spatial) passe devant toute couche sans zIndex, quel que
// soit l'ordre du tableau `layers` de la carte.
const ZINDEX_BASEMAP = 0;
const ZINDEX_OVERLAY = 1;
const ZINDEX_IMPORT = 2;
const ZINDEX_TRAJECTOIRE = 3;
const ZINDEX_HALO = 4;
const ZINDEX_GPS = 5;

// Contours variables — 4 styles pour differencier les individus avec couleurs proches
const CONTOURS = [
  { strokeR: 255, strokeG: 255, strokeB: 255, strokeA: 1, strokeWidth: 2 }, // Blanc
  { strokeR: 0,   strokeG: 0,   strokeB: 0,   strokeA: 1, strokeWidth: 2 }, // Noir
  { strokeR: 255, strokeG: 220, strokeB: 0,   strokeA: 1, strokeWidth: 2 }, // Jaune
  { strokeR: 0,   strokeG: 200, strokeB: 255, strokeA: 1, strokeWidth: 2 }, // Cyan
];

const _stylesLigneParCouleur = new Map();
function getStyleLigne(couleur) {
  let style = _stylesLigneParCouleur.get(couleur);
  if (!style) {
    style = new ol.style.Style({
      stroke: new ol.style.Stroke({ color: couleur, width: 1.5, lineCap: 'round', lineJoin: 'round' })
    });
    _stylesLigneParCouleur.set(couleur, style);
  }
  return style;
}

const CONTOUR_OVERRIDE_PAR_COULEUR = {
  '#0000FF': CONTOURS[0], // Bleu
  '#000033': CONTOURS[0], // Bleu nuit
  '#005300': CONTOURS[0], // Vert fonce
  '#201A01': CONTOURS[0], // Noir-marron
  '#720055': CONTOURS[0], // Bordeaux
  '#A10300': CONTOURS[0], // Rouge fonce
  '#00478E': CONTOURS[0], // Bleu marine
};

// Contour fixe utilise par les modes Sexe/Population/Gestionnaire (cf. renderPoints) —
// expose pour que la legende (app.js) affiche exactement le meme contour que la carte.
export function getContourDefaut() {
  return CONTOURS[0];
}

export function getContourParIndex(index) {
  const couleur = GLASBEY_32[index % GLASBEY_32.length];
  if (CONTOUR_OVERRIDE_PAR_COULEUR[couleur]) return CONTOUR_OVERRIDE_PAR_COULEUR[couleur];
  // Changer de contour tous les 32 individus (une palette complete)
  return CONTOURS[Math.floor(index / GLASBEY_32.length) % CONTOURS.length];
}

function preparerCouleurs(locations) {
  couleursIndividus.clear();
  indicesIndividus.clear();
  const ids = [...new Set(locations.map(l => l.ani_id))];
  ids.forEach((id, i) => {
    couleursIndividus.set(id, getCouleurParIndex(i));
    indicesIndividus.set(id, i);
  });

  couleursPopulations.clear();
  const populations = [...new Set(locations.map(l => l.ani_pop_rattach).filter(Boolean))].sort();
  populations.forEach((pop, i) => couleursPopulations.set(pop, getCouleurParIndex(i)));

  couleursAnnees.clear();
  const anneeCourante = new Date().getFullYear();
  const ANNEE_MIN_PLAUSIBLE = anneeCourante - 20;
  const ANNEE_MAX_PLAUSIBLE = anneeCourante + 2;
  const anneesDistinctes = [...new Set(
    locations
      .map(l => new Date(l.loc_datetime_local || l.loc_date_local).getFullYear())
      .filter(a => Number.isFinite(a) && a >= ANNEE_MIN_PLAUSIBLE && a <= ANNEE_MAX_PLAUSIBLE)
  )].sort((a, b) => a - b);
  anneesDistinctes.forEach((annee, i) => couleursAnnees.set(annee, getCouleurParIndex(i)));
}

export function getCouleur(loc, mode) {
  switch (mode) {
    case 'individu':
    default:
      return couleursIndividus.get(loc.ani_id) || getCouleurParIndex(0);

    case 'annee': {
      const annee = new Date(loc.loc_datetime_local || loc.loc_date_local).getFullYear();
      return couleursAnnees.get(annee) || getCouleurParIndex(0);
    }

    case 'population':
      return couleursPopulations.get(loc.ani_pop_rattach) || '#aaaaaa';

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

// Acces O(1) par code EPSG a une entree de PROJECTIONS_COORDONNEES_CONFIG (config.js).
const PROJECTIONS_PAR_CODE = new Map(PROJECTIONS_COORDONNEES_CONFIG.map(p => [p.code, p]));

let _projectionCoordonnees = PROJECTIONS_COORDONNEES_CONFIG.find(p => p.parDefaut)?.code
  ?? PROJECTIONS_COORDONNEES_CONFIG[0]?.code;
let _derniereCoordonneeSouris = null; // derniere coordonnee brute (EPSG:3857) recue

export function setProjectionCoordonnees(code) {
  if (!PROJECTIONS_PAR_CODE.has(code)) return;
  _projectionCoordonnees = code;
  if (_derniereCoordonneeSouris) {
    const el = document.querySelector('#mouseCoordsTarget .ol-mouse-position-custom');
    if (el) el.innerHTML = formatMouseCoordinates(_derniereCoordonneeSouris);
  }
}

function formatMouseCoordinates(coordonnee) {
  _derniereCoordonneeSouris = coordonnee;
  const projection = PROJECTIONS_PAR_CODE.get(_projectionCoordonnees);
  const coord = proj4('EPSG:3857', projection.code, coordonnee);
  return projection.format(coord);
}

let _wmtsCapabilitiesPromise = null;
function chargerCapacitesWMTS() {
  if (!_wmtsCapabilitiesPromise) {
    _wmtsCapabilitiesPromise = fetch('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetCapabilities')
      .then(res => {
        if (!res.ok) throw new Error(`GetCapabilities IGN : HTTP ${res.status}`);
        return res.text();
      })
      .then(texte => new ol.format.WMTSCapabilities().read(texte));
  }
  return _wmtsCapabilitiesPromise;
}

function creerCoucheWMTS(bm) {
  const layer = new ol.layer.Tile({ visible: bm.visible, opacity: bm.opacity ?? 1 });
  chargerCapacitesWMTS()
    .then(capacites => {
      const options = ol.source.WMTS.optionsFromCapabilities(capacites, {
        layer: bm.layer,
        matrixSet: bm.matrixSet,
        style: bm.style,
        format: bm.format,
        crossOrigin: 'anonymous'
      });
      if (!options) {
        throw new Error(`Couche introuvable dans le GetCapabilities IGN : layer="${bm.layer}" matrixSet="${bm.matrixSet}" style="${bm.style}"`);
      }
      layer.setSource(new ol.source.WMTS(options));
    })
    .catch(err => {
      console.error(`Fond/overlay WMTS "${bm.nom}" indisponible :`, err.message);
      if (window._showToast) window._showToast(`"${bm.nom}" n'a pas pu être chargé.`);
    });
  return layer;
}

function creerCoucheFond(bm) {
  if (bm.type === 'wmts') {
    return creerCoucheWMTS(bm);
  }

  let source;
  if (bm.type === 'osm') {
    source = new ol.source.OSM({ crossOrigin: 'anonymous' });
  } else if (bm.type === 'wms') {
    source = new ol.source.TileWMS({
      url: bm.url,
      params: bm.wmsParams || {},
      serverType: 'geoserver',
      attributions: bm.attributions,
      crossOrigin: 'anonymous'
    });
  } else {
    source = new ol.source.XYZ({
      url: bm.url.includes('IGN_API_KEY')
        ? bm.url.replace('${IGN_API_KEY}', IGN_API_KEY)
        : bm.url,
      attributions: bm.attributions,
      crossOrigin: 'anonymous'
    });
  }
  return new ol.layer.Tile({ source, visible: bm.visible, opacity: bm.opacity ?? 1 });
}

export function initMap(targetId, popupId) {
  PROJECTIONS_COORDONNEES_CONFIG.forEach(p => {
    if (p.proj4def) proj4.defs(p.code, p.proj4def);
  });
  ol.proj.proj4.register(proj4);

  // Initialisation des sources vectorielles (données géométriques)
  gpsSource = new ol.source.Vector();
  trajectoireSource = new ol.source.Vector();

  gpsLayer = new ol.layer.WebGLPoints({
    source: gpsSource,
    zIndex: ZINDEX_GPS,
    style: {
      'circle-radius': ['get', 'radius'],
      'circle-fill-color': ['color', ['get', 'fillR'], ['get', 'fillG'], ['get', 'fillB'], ['get', 'fillA']],
      'circle-stroke-color': ['color', ['get', 'strokeR'], ['get', 'strokeG'], ['get', 'strokeB'], ['get', 'strokeA']],
      'circle-stroke-width': ['get', 'strokeWidth']
    }
  });

  haloSource = new ol.source.Vector();
  haloLayer = new ol.layer.Vector({
    source: haloSource,
    zIndex: ZINDEX_HALO
  });

  // Création de la couche des lignes (trajectoires)
  const trajectoireLayer = new ol.layer.Vector({
    source: trajectoireSource,
    zIndex: ZINDEX_TRAJECTOIRE
  });

  const basemapConfigs = BASEMAPS_CONFIG.filter(bm => (bm.category || 'basemap') === 'basemap');
  const overlayConfigs = BASEMAPS_CONFIG.filter(bm => bm.category === 'overlay');
  basemaps = basemapConfigs.map(creerCoucheFond);
  basemaps.forEach(layer => layer.setZIndex(ZINDEX_BASEMAP));
  overlaysWmts = new Map(overlayConfigs.map(bm => [bm.id, creerCoucheFond(bm)]));
  overlaysWmts.forEach(layer => layer.setZIndex(ZINDEX_OVERLAY));

  // Préparation du popup (Overlay)
  const popupEl = document.getElementById(popupId);
  popupOverlay = new ol.Overlay({
    element: popupEl,
    positioning: 'bottom-center',
    offset: [0, -28],
    autoPan: {
      margin: 16,
      animation: { duration: 250 }
    }
  });

  // Création de l'objet Map principal
  map = new ol.Map({
    target: targetId,
    layers: [
      ...basemaps,
      ...overlaysWmts.values(),
      trajectoireLayer,
      haloLayer,
      gpsLayer
    ],
    overlays: [popupOverlay],
    view: new ol.View({
      center: ol.proj.transform(DEFAULT_CENTER, 'EPSG:4326', 'EPSG:3857'),
      zoom: DEFAULT_ZOOM,
      maxZoom: ZOOM_MAX_MANUAL,
      minZoom: ZOOM_MIN_MANUAL
    }),
    // Zoom uniquement via les boutons +/- personnalises — molette/pincement/double-clic desactives.
    interactions: ol.interaction.defaults.defaults({ mouseWheelZoom: false, doubleClickZoom: true, pinchZoom: false, shiftDragZoom: false }),
    controls: ol.control.defaults.defaults({ zoom: false, rotate: false }).extend([
      new ol.control.ScaleLine({
        units: 'metric',
        type: 'scalebar',
        steps: 4,
        text: true,
        minWidth: 100,
        target: document.getElementById('scaleTarget')
      }),
      new ol.control.MousePosition({
        className: 'ol-mouse-position-custom',
        target: document.getElementById('mouseCoordsTarget'),
        coordinateFormat: formatMouseCoordinates,
        undefinedHTML: ''
      }),
      new ol.control.FullScreen({
        className: 'ol-fullscreen-custom',
        tipLabel: 'Plein écran',
        label: (() => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('width', '16');
          svg.setAttribute('height', '16');
          const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
          use.setAttribute('href', 'assets/img/sprite.svg#icon-fullscreen-enter');
          svg.appendChild(use);
          return svg;
        })(),
        labelActive: (() => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('width', '16');
          svg.setAttribute('height', '16');
          const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
          use.setAttribute('href', 'assets/img/sprite.svg#icon-fullscreen-exit');
          svg.appendChild(use);
          return svg;
        })()
      })
    ])
  });

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
        showPopup(feature, feature.getGeometry().getCoordinates(), popupEl);
      }, {
        layerFilter: layer => layer === gpsLayer
      });
    } catch (err) {
      console.warn('forEachFeatureAtPixel echoue (contexte WebGL invalide ?) :', err.message);
      return;
    }
    if (!hit) {
      popupEl.style.display = 'none';
      clearHighlight();
    } else {
      highlightPoint(aniId, locDatetime);
    }

    document.querySelectorAll('.panel-table-row.selected-carte').forEach(tr => {
      tr.classList.remove('selected-carte');
    });
    document.querySelectorAll('.panel-table-row.selected-click').forEach(tr => {
      tr.classList.remove('selected-click');
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

export function renderPoints(locations, clearBefore = true, modeTrajectoire = false, modeCouleur = 'individu') {
  if (clearBefore) { gpsSource.clear(); haloSource?.clear(); _featureSurlignee = null; }

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

    const wgs84 = proj4('EPSG:2154', 'EPSG:4326', loc.geom.coordinates);
    const coord = ol.proj.fromLonLat(wgs84);

    const estDernier = modeTrajectoire &&
      derniereParIndividu[loc.ani_id]?.date === (loc.loc_datetime_local || loc.loc_date_local);
    const estPremier = modeTrajectoire &&
      premiereParIndividu[loc.ani_id]?.date === (loc.loc_datetime_local || loc.loc_date_local);
    const estDepart = modeTrajectoire && estPremier && !estDernier;

    const idx = indicesIndividus.get(loc.ani_id) ?? 0;
    const contour = modeCouleur === 'individu' ? getContourParIndex(idx) : CONTOURS[0];

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


  return gpsSource.getFeatures().length;
}

export function changerModeCouleur(modeCouleur) {
  if (!gpsLayer || !gpsSource) return;

  const features = gpsSource.getFeatures();
  features.forEach(f => {
    const loc = {
      ani_id: f.get('ani_id'),
      ani_sexe: f.get('ani_sexe'),
      ani_gestionnaire: f.get('ani_gestionnaire'),
      ani_pop_rattach: f.get('ani_pop_rattach'),
      loc_datetime_local: f.get('loc_datetime_local'),
      loc_date_local: f.get('loc_date_local')
    };
    const [cR, cG, cB] = cssToRgba(getCouleur(loc, modeCouleur));
    // Meme regle qu en renderPoints() : contour uniforme Blanc hors mode Individu.
    const idx = indicesIndividus.get(loc.ani_id) ?? 0;
    const contour = modeCouleur === 'individu' ? getContourParIndex(idx) : CONTOURS[0];

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

}

function showPopup(feature, coordinate, popupEl) {
  const p = feature.getProperties();
  const isTrajectoire = document.getElementById('btnTrajectoire')?.classList.contains('active');

  const dateStr = p.loc_datetime_local
    ? p.loc_datetime_local.replace('T', ' ').slice(0, 16)
    : p.loc_date_local
      ? p.loc_date_local.replace('T', ' ').slice(0, 16)
      : '-';

  popupEl.innerHTML = '';
  const content = document.createElement('div');
  content.className = 'popup-content';

  const strong = document.createElement('strong');
  strong.textContent = p.ani_nom || '-';
  content.appendChild(strong);

  const info = document.createElement('div');
  info.className = 'popup-info';

  if (isTrajectoire) {
    const span = document.createElement('span');
    span.textContent = dateStr;
    info.appendChild(span);
  } else {
    const labelEl = document.createElement('span');
    labelEl.textContent = 'Dernière position :';
    const dateDiv = document.createElement('div');
    dateDiv.className = 'date-value';
    dateDiv.textContent = dateStr;
    info.appendChild(labelEl);
    info.appendChild(dateDiv);
  }

  content.appendChild(info);
  popupEl.appendChild(content);

  popupEl.style.display = 'block';
  popupOverlay.setPosition(coordinate);
  isAnimating = true;
  map.getView().animate({ center: coordinate, duration: 400 }, () => {
    isAnimating = false;
  });
}

export function renderTrajectoire(locations, modeCouleur = 'individu') {
  trajectoireSource.clear();
  preparerCouleurs(locations);

  // Groupement des points par individu
  const parIndividu = {};
  locations.forEach(loc => {
    if (!loc.geom?.coordinates) return;
    if (!parIndividu[loc.ani_id]) parIndividu[loc.ani_id] = [];

    const wgs84 = proj4('EPSG:2154', 'EPSG:4326', loc.geom.coordinates);
    const coord = ol.proj.fromLonLat(wgs84);
    parIndividu[loc.ani_id].push({ coord, loc });
  });

  Object.entries(parIndividu).forEach(([ani_id, points]) => {
    if (points.length < 2) return;

    points.sort((a, b) => new Date(a.loc.loc_datetime_local) - new Date(b.loc.loc_datetime_local));
    const coords = points.map(p => p.coord);

    const couleurUnique = modeCouleur === 'annee' ? null : getCouleur(points[0].loc, modeCouleur);
    const couleurSegmentAt = i => modeCouleur === 'annee' ? getCouleur(points[i].loc, modeCouleur) : couleurUnique;

    const parCouleur = new Map(); // couleur -> Array<Array<coord>> (runs de cette couleur)
    let coloreurCourant = null;
    let runCourant = null;
    for (let i = 0; i < coords.length - 1; i++) {
      const couleur = couleurSegmentAt(i);
      if (couleur === coloreurCourant) {
        runCourant.push(coords[i + 1]);
      } else {
        runCourant = [coords[i], coords[i + 1]];
        if (!parCouleur.has(couleur)) parCouleur.set(couleur, []);
        parCouleur.get(couleur).push(runCourant);
        coloreurCourant = couleur;
      }
    }
    parCouleur.forEach((runs, couleur) => {
      const feature = new ol.Feature({ geometry: new ol.geom.MultiLineString(runs) });
      feature.set('ani_id', ani_id);
      feature.setStyle(getStyleLigne(couleur));
      trajectoireSource.addFeature(feature);
    });

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
          fill: new ol.style.Fill({ color: couleurSegmentAt(i) }),
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

export function switchBasemap(index) {
  basemaps.forEach((layer, i) => {
    layer.setVisible(i === index);
  });
}

export function toggleOverlay(id, visible) {
  overlaysWmts.get(id)?.setVisible(visible);
}

/** Ajuste l'opacite d'un overlay WMTS par id (0 a 1). */
export function setOverlayOpacity(id, opacity) {
  overlaysWmts.get(id)?.setOpacity(opacity);
}

export function getMap() { return map; }
export function getGpsSource() { return gpsSource; }
export function getCouleursIndividus() { return couleursIndividus; }
export function getIndicesIndividus() { return indicesIndividus; }
export function getCouleursPopulations() { return couleursPopulations; }
export function getCouleursAnnees() { return couleursAnnees; }

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
      if (geom?.getType() === 'LineString' || geom?.getType() === 'MultiLineString') {
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

let _featureSurlignee = null;

export function highlightPoint(ani_id, locDatetime = null) {
  const dejaCePoint = _featureSurlignee &&
    String(_featureSurlignee.get('ani_id')) === String(ani_id) &&
    (!locDatetime || (_featureSurlignee.get('loc_datetime_local') || _featureSurlignee.get('loc_date_local')) === locDatetime);
  if (dejaCePoint) return;

  clearHighlight();

  const feature = gpsSource.getFeatures().find(f => {
    if (String(f.get('ani_id')) !== String(ani_id)) return false;
    if (!locDatetime) return true;
    return (f.get('loc_datetime_local') || f.get('loc_date_local')) === locDatetime;
  });
  if (!feature) return;

  const geom = feature.getGeometry();
  if (!geom) return;

  feature.set('_radiusAvantSurbrillance', feature.get('radius'));
  feature.set('radius', (feature.get('radius') || 4) + 3);

  const haloRayon = feature.get('radius') + 2;
  const halo = new ol.Feature({ geometry: new ol.geom.Point(geom.getCoordinates()) });
  halo.setStyle(new ol.style.Style({
    image: new ol.style.Circle({
      radius: haloRayon,
      fill: new ol.style.Fill({ color: 'rgba(233, 152, 82, 0.89)' }),
      stroke: new ol.style.Stroke({ color: 'rgba(255, 0, 0, 0.9)', width: 4 })
    })
  }));
  haloSource.addFeature(halo);

  _featureSurlignee = feature;
}

function clearHighlight() {
  if (!_featureSurlignee) return;
  const radiusOriginal = _featureSurlignee.get('_radiusAvantSurbrillance');
  if (radiusOriginal !== undefined) _featureSurlignee.set('radius', radiusOriginal);
  haloSource.clear();
  _featureSurlignee = null;
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


// Palette cyclique simple (pas la Glasbey des points GPS, trop chargee pour de simples
// couches de reference importees) — une couleur differente a chaque nouvel import.
const PALETTE_COUCHES_IMPORTEES = ['#e63946', '#1d7874', '#f4a261', '#6a4c93', '#2a9d8f', '#e76f51', '#4361ee', '#9c6644'];
function getCouleurImportParIndex(index) {
  return PALETTE_COUCHES_IMPORTEES[index % PALETTE_COUCHES_IMPORTEES.length];
}

function hexVersRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// L'opacite globale de la couche passe par layer.setOpacity() (cf. setOpaciteCoucheGeoJSONImportee)
// — le style, lui, ne code que la couleur assignee, pas de recalcul a chaque changement de slider.
function creerStyleCoucheImportee(couleur) {
  const stylePoint = new ol.style.Style({
    image: new ol.style.Circle({
      radius: 6,
      fill: new ol.style.Fill({ color: hexVersRgba(couleur, 0.85) }),
      stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.5 })
    })
  });
  const styleLigne = new ol.style.Style({
    stroke: new ol.style.Stroke({ color: couleur, width: 2 })
  });
  const stylePolygone = new ol.style.Style({
    fill: new ol.style.Fill({ color: hexVersRgba(couleur, 0.25) }),
    stroke: new ol.style.Stroke({ color: couleur, width: 2 })
  });

  return (feature) => {
    const type = feature.getGeometry()?.getType() || '';
    if (type.includes('Point')) return stylePoint;
    if (type.includes('Line')) return styleLigne;
    return stylePolygone;
  };
}

// id -> { id, nom, layer, couleur, opacite } — plusieurs couches importees simultanement.
const _couchesGeoJSONImportees = new Map();
let _prochainIdCoucheImportee = 0;

function detecterProjectionGeoJSON(geojson) {
  const nomCrs = geojson?.crs?.properties?.name;
  if (!nomCrs) return 'EPSG:4326';
  if (/CRS84/i.test(nomCrs)) return 'EPSG:4326';
  const match = nomCrs.match(/EPSG[:]{1,2}(\d+)/i);
  return match ? `EPSG:${match[1]}` : null;
}

export function importerCoucheGeoJSON(file) {
  return new Promise((resolve) => {
    if (!map || !file) { resolve(null); return; }

    const reader = new FileReader();

    reader.onerror = () => {
      console.error('Import GeoJSON : lecture du fichier echouee', reader.error);
      if (window._showToast) window._showToast(`Impossible de lire le fichier "${file.name}".`);
      resolve(null);
    };

    reader.onload = () => {
      let geojson;
      try {
        geojson = JSON.parse(reader.result);
      } catch (err) {
        console.error('Import GeoJSON : JSON invalide', err);
        if (window._showToast) window._showToast(`"${file.name}" n'est pas un fichier GeoJSON valide.`);
        resolve(null);
        return;
      }

      const dataProjection = detecterProjectionGeoJSON(geojson);
      if (!dataProjection || !ol.proj.get(dataProjection)) {
        console.error(`Import GeoJSON : CRS non reconnu (${dataProjection || 'absent du fichier'})`);
        if (window._showToast) window._showToast(`"${file.name}" utilise un système de coordonnées non reconnu.`);
        resolve(null);
        return;
      }

      let features;
      try {
        features = new ol.format.GeoJSON({
          dataProjection,
          featureProjection: map.getView().getProjection()
        }).readFeatures(geojson);
      } catch (err) {
        console.error('Import GeoJSON : lecture des features echouee', err);
        if (window._showToast) window._showToast(`"${file.name}" n'a pas pu être interprété comme GeoJSON.`);
        resolve(null);
        return;
      }

      if (!features.length) {
        if (window._showToast) window._showToast(`"${file.name}" ne contient aucune géométrie.`);
        resolve(null);
        return;
      }

      const id = _prochainIdCoucheImportee++;
      const couleur = getCouleurImportParIndex(_couchesGeoJSONImportees.size);

      const layer = new ol.layer.Vector({
        source: new ol.source.Vector({ features }),
        zIndex: ZINDEX_IMPORT,
        style: creerStyleCoucheImportee(couleur)
      });
      layer.set('layer_name', file.name);
      map.addLayer(layer);

      _couchesGeoJSONImportees.set(id, { id, nom: file.name, layer, couleur, opacite: 1 });

      resolve({ id, nom: file.name, couleur });
    };

    reader.readAsText(file);
  });
}

/** Retire une couche GeoJSON importee par id. */
export function retirerCoucheGeoJSONImportee(id) {
  const entree = _couchesGeoJSONImportees.get(id);
  if (!entree) return false;
  map?.removeLayer(entree.layer);
  _couchesGeoJSONImportees.delete(id);
  return true;
}

/** Bascule la visibilite d'une couche importee (case a cocher du panneau). */
export function toggleCoucheGeoJSONImportee(id, visible) {
  _couchesGeoJSONImportees.get(id)?.layer.setVisible(visible);
}

/** Ajuste l'opacite d'une couche importee par id (0 a 1). */
export function setOpaciteCoucheGeoJSONImportee(id, opacite) {
  const entree = _couchesGeoJSONImportees.get(id);
  if (!entree) return;
  entree.opacite = opacite;
  entree.layer.setOpacity(opacite);
}

export function capturerCarteEnBlob() {
  return new Promise((resolve, reject) => {
    if (!map) {
      reject(new Error('Carte non initialisee'));
      return;
    }

    map.once('rendercomplete', () => {
      try {
        const size = map.getSize();
        if (!size) throw new Error('Taille de carte indisponible');

        const pixelRatio = window.devicePixelRatio || 1;

        const SURECHANTILLONNAGE = 2;
        const scale = pixelRatio * SURECHANTILLONNAGE;

        const mapCanvas = document.createElement('canvas');
        mapCanvas.width = size[0] * scale;
        mapCanvas.height = size[1] * scale;
        const mapContext = mapCanvas.getContext('2d');
        if (!mapContext) throw new Error('Contexte canvas indisponible');
        mapContext.imageSmoothingEnabled = true;
        mapContext.imageSmoothingQuality = 'high';

        map.getViewport().querySelectorAll('.ol-layer canvas, canvas.ol-layer').forEach(canvas => {
          if (!canvas.width) return;

          const opacity = canvas.parentNode?.style.opacity || canvas.style.opacity;
          mapContext.globalAlpha = opacity === '' ? 1 : Number(opacity);

          const cssWidth = canvas.offsetWidth || canvas.width;
          const cssHeight = canvas.offsetHeight || canvas.height;

          const transform = canvas.style.transform;
          const match = transform?.match(/^matrix\(([^()]*)\)$/);
          const [a, b, c, d, e, f] = match ? match[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];

          mapContext.setTransform(a * scale, b * scale, c * scale, d * scale, e * scale, f * scale);

          mapContext.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, cssWidth, cssHeight);
        });

        mapContext.globalAlpha = 1;

        const view = map.getView();
        const resolutionSol = ol.proj.getPointResolution(
          view.getProjection(), view.getResolution(), view.getCenter(), 'm'
        );

        const minWidthCss = 100;
        const paliers = [1, 2, 5];
        let resolutionUnite = resolutionSol;
        let suffixe = 'm';
        if (minWidthCss * resolutionSol >= 1000) {
          suffixe = 'km';
          resolutionUnite = resolutionSol / 1000;
        }

        let p = 3 * Math.floor(Math.log10(minWidthCss * resolutionUnite));
        let distanceEchelle, largeurBarreCss, exposant;
        for (;;) {
          exposant = Math.floor(p / 3);
          distanceEchelle = paliers[((p % 3) + 3) % 3] * Math.pow(10, exposant);
          largeurBarreCss = Math.round(distanceEchelle / resolutionUnite);
          if (largeurBarreCss >= minWidthCss) break;
          p++;
        }
        const labelEchelle = `${distanceEchelle.toFixed(exposant < 0 ? -exposant : 0)} ${suffixe}`;

        const margeCss = 12;
        const hauteurBarreCss = 4;
        const xCss = margeCss;
        const yCss = size[1] - margeCss;

        mapContext.setTransform(scale, 0, 0, scale, 0, 0);
        mapContext.fillStyle = '#ffffff';
        mapContext.fillRect(xCss - 1, yCss - hauteurBarreCss - 1, largeurBarreCss + 2, hauteurBarreCss + 2);
        mapContext.fillStyle = '#000000';
        mapContext.fillRect(xCss, yCss - hauteurBarreCss, largeurBarreCss, hauteurBarreCss);

        const espacementBarreTexte = 4;
        const paddingFond = 3;
        mapContext.font = '12px sans-serif';
        mapContext.textBaseline = 'bottom';
        const largeurTexte = mapContext.measureText(labelEchelle).width;
        const boiteBas = yCss - hauteurBarreCss - espacementBarreTexte;
        const boiteHaut = boiteBas - 12 - paddingFond * 2;
        mapContext.fillStyle = 'rgba(255, 255, 255, 0.75)';
        mapContext.fillRect(xCss - paddingFond, boiteHaut, largeurTexte + paddingFond * 2, boiteBas - boiteHaut);
        mapContext.fillStyle = '#000000';
        mapContext.fillText(labelEchelle, xCss, boiteBas - paddingFond);

        const modeTrajectoireActif = document.getElementById('btnTrajectoire')?.classList.contains('active');

        if (modeTrajectoireActif) {
          mapContext.font = '11px sans-serif';
          const itemsLegende = [
            { type: 'depart', label: 'Point de départ' },
            { type: 'direction', label: 'Direction' }
          ];
          const rayonPastille = 5;
          const ligneHauteurLegende = 16;
          const largeurLegende = Math.max(
            ...itemsLegende.map(item => rayonPastille * 2 + 6 + mapContext.measureText(item.label).width)
          ) + paddingFond * 2;
          const hauteurLegende = itemsLegende.length * ligneHauteurLegende + paddingFond * 2;

          const legendeBas = boiteHaut - espacementBarreTexte;
          const legendeHaut = legendeBas - hauteurLegende;

          mapContext.fillStyle = 'rgba(255, 255, 255, 0.75)';
          mapContext.fillRect(xCss - paddingFond, legendeHaut, largeurLegende, hauteurLegende);

          mapContext.textBaseline = 'middle';
          itemsLegende.forEach((item, i) => {
            const cy = legendeHaut + paddingFond + ligneHauteurLegende * i + ligneHauteurLegende / 2;
            const cx = xCss + rayonPastille;

            if (item.type === 'depart') {
              mapContext.beginPath();
              mapContext.arc(cx, cy, rayonPastille, 0, Math.PI * 2);
              mapContext.fillStyle = '#ffffff';
              mapContext.fill();
              mapContext.strokeStyle = '#2D6A4F';
              mapContext.lineWidth = 2;
              mapContext.stroke();
            } else {
              mapContext.fillStyle = '#000000';
              mapContext.font = 'bold 12px sans-serif';
              mapContext.textAlign = 'center';
              mapContext.fillText('→', cx, cy);
              mapContext.textAlign = 'left';
              mapContext.font = '11px sans-serif';
            }

            mapContext.fillStyle = '#000000';
            mapContext.fillText(item.label, xCss + rayonPastille * 2 + 6, cy);
          });
          mapContext.textBaseline = 'bottom';
        }

        mapContext.setTransform(1, 0, 0, 1, 0, 0);
        mapCanvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Echec de generation du blob JPEG'));
        }, 'image/jpeg', 0.92);
      } catch (err) {
        reject(err);
      }
    });

    map.renderSync();
  });
}
