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

// Drapeau de perte de contexte WebGL — positionne a true par le handler
// webglcontextlost, repasse a false sur webglcontextrestored.
// Les listeners pointermove et singleclick le testent avant tout appel
// a hasFeatureAtPixel / forEachFeatureAtPixel pour ne pas appeler des
// methodes WebGL sur un contexte invalide (evite le crash en cascade).
let _webglContextLost = false;

// Contours variables — 4 styles pour differencier les individus avec couleurs proches
const CONTOURS = [
  { strokeR: 255, strokeG: 255, strokeB: 255, strokeA: 1, strokeWidth: 2 }, // Blanc
  { strokeR: 0,   strokeG: 0,   strokeB: 0,   strokeA: 1, strokeWidth: 2 }, // Noir
  { strokeR: 255, strokeG: 220, strokeB: 0,   strokeA: 1, strokeWidth: 2 }, // Jaune
  { strokeR: 0,   strokeG: 200, strokeB: 255, strokeA: 1, strokeWidth: 2 }, // Cyan
];

// Styles de ligne de trajectoire, mis en cache par couleur — evite de recreer un
// ol.style.Style/ol.style.Stroke par run partage entre plusieurs individus/annees
// (cf. renderTrajectoire, regroupement MultiLineString par couleur). Cardinalite
// bornee (palette GLASBEY_32 + quelques couleurs fixes Sexe/Gestionnaire) — jamais
// videe, comme _rgbaCache plus bas.
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

// Override — couleurs de remplissage de GLASBEY_32 assez sombres (luminance percue
// ITU-R BT.601 <= 58, seuil fixe par #00478E) pour que le contour cyclique (Blanc/Noir/
// Jaune/Cyan, cf. CONTOURS) tombe parfois sur Noir et rende le point quasi invisible sur
// fond satellite avec ombrage de montagne — signale par Ludovic sur #00478E (bleu marine).
// Contour force en Blanc (coherent avec le contour par defaut du 1er cycle), quel que
// soit le rang d'apparition de l'individu, pour ces couleurs uniquement.
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

/**
 * Analyse les données avant rendu : palettes Individu/Population/Année.
 */
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

  // Palette Année — plausibilite dynamique (relative a l'annee courante, jamais figee
  // en dur) pour ecarter les valeurs aberrantes connues en base (annee 2000, et 2068
  // sur Arbizon — coquille de saisie), qui creeraient sinon une entree de legende
  // parasite. Combine avec le scope existant de cette fonction (donnees affichees
  // uniquement).
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

/**
 * Retourne la couleur d'un point selon le mode de coloration.
 */
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

/**
 * Change la projection d'affichage des coordonnees curseur et rafraichit immediatement
 * le texte affiche - coordinateFormat n'etant invoque par ol.control.MousePosition que
 * sur mouvement de souris, un changement de selection a souris immobile resterait sinon
 * affiche dans l'ancienne projection jusqu'au prochain pointermove.
 */
export function setProjectionCoordonnees(code) {
  if (!PROJECTIONS_PAR_CODE.has(code)) return;
  _projectionCoordonnees = code;
  if (_derniereCoordonneeSouris) {
    const el = document.querySelector('#mouseCoordsTarget .ol-mouse-position-custom');
    if (el) el.innerHTML = formatMouseCoordinates(_derniereCoordonneeSouris);
  }
}

/**
 * Formate la position du curseur pour ol.control.MousePosition, dans la projection
 * actuellement selectionnee (_projectionCoordonnees, cf. setProjectionCoordonnees()).
 * La vue est nativement en EPSG:3857 (Web Mercator, cf. ol.proj.fromLonLat dans
 * renderPoints) — la coordonnee recue ici est donc deja en EPSG:3857.
 */
function formatMouseCoordinates(coordonnee) {
  _derniereCoordonneeSouris = coordonnee;
  const projection = PROJECTIONS_PAR_CODE.get(_projectionCoordonnees);
  const coord = proj4('EPSG:3857', projection.code, coordonnee);
  return projection.format(coord);
}

// Cache du GetCapabilities WMTS IGN — un seul fetch reel partage par toutes les
// couches WMTS (fonds + overlays), meme si plusieurs sont construites en parallele
// au chargement de la carte (promesse memoisee, jamais re-fetchee par couche).
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

/**
 * Cree une couche ol.layer.Tile pour un fond ou overlay WMTS IGN. La couche existe
 * immediatement (necessaire pour l'ordre des layers dans new ol.Map(), construit de
 * facon synchrone), mais sa source est affectee de facon asynchrone (setSource) une
 * fois le GetCapabilities resolu et la couche/matrixSet/style valides.
 * Isolation des pannes : un echec (reseau, ou layer/matrixSet/style introuvable dans
 * le GetCapabilities) est capture ici et n'affecte que CETTE couche — jamais
 * initMap() ni les autres fonds/overlays, qui restent utilisables normalement.
 */
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

/**
 * Cree une couche ol.layer.Tile a partir d'une entree BASEMAPS_CONFIG, quel que soit
 * son type (xyz/osm/wms/wmts) — factorise la logique auparavant inline dans initMap(),
 * reutilisee a la fois pour les fonds exclusifs et les overlays.
 */
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

/**
 * Initialise la carte et ses couches de base.
 * @param {string} targetId - ID de l'élément HTML contenant la carte
 * @param {string} popupId - ID de l'élément HTML servant de popup
 */
export function initMap(targetId, popupId) {
  // Enregistrement dynamique de chaque projection de PROJECTIONS_COORDONNEES_CONFIG dont
  // proj4def n'est pas null (config.js) — EPSG:4326/EPSG:3857 sont deja connus nativement
  // par proj4js, jamais besoin de les enregistrer.
  PROJECTIONS_COORDONNEES_CONFIG.forEach(p => {
    if (p.proj4def) proj4.defs(p.code, p.proj4def);
  });
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

  // Halo de surbrillance — feature separee (Canvas2D, pas WebGL) car un seul point a
  // la fois : aucun enjeu de performance, et ca isole totalement la surbrillance du
  // pipeline WebGLPoints (gpsLayer) — le point reel n'est jamais modifie, ni couleur
  // ni rayon, cf. highlightPoint()/clearHighlight().
  haloSource = new ol.source.Vector();
  haloLayer = new ol.layer.Vector({
    source: haloSource
  });

  // Création de la couche des lignes (trajectoires)
  const trajectoireLayer = new ol.layer.Vector({
    source: trajectoireSource
  });

  // Definition des fonds de carte exclusifs et des overlays superposables, generes
  // depuis BASEMAPS_CONFIG — category absente ou 'basemap' => fond exclusif
  // (retrocompatibilite avec les entrees existantes sans ce champ), 'overlay' =>
  // superposable independamment (cf. toggleOverlay()). basemaps reste un tableau
  // parallele aux entrees 'basemap' de BASEMAPS_CONFIG, dans le meme ordre — c'est
  // ce sur quoi switchBasemap(index) s'appuie, inchange.
  const basemapConfigs = BASEMAPS_CONFIG.filter(bm => (bm.category || 'basemap') === 'basemap');
  const overlayConfigs = BASEMAPS_CONFIG.filter(bm => bm.category === 'overlay');
  basemaps = basemapConfigs.map(creerCoucheFond);
  overlaysWmts = new Map(overlayConfigs.map(bm => [bm.id, creerCoucheFond(bm)]));

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
      // Pas de target: ici, contrairement a MousePosition — ce controle ne partage
      // pas de conteneur de mise en page avec lui (.legende-wrapper est le cluster
      // bas-gauche coordonnees/legende ; FullScreen reste en haut-droite, positionne
      // independamment via .ol-fullscreen-custom en absolu dans main.css). L'y
      // deplacer casserait le placement visuel actuel et l'espacement de
      // #toolbarZoom, prevu pour laisser la place a ce bouton juste au-dessus de
      // lui (cf. audit controles carte, point 2).
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
    if (!hit) {
      popupEl.style.display = 'none';
      clearHighlight();
    } else {
      // Surbrillance du point cliqué directement sur la carte — symétrique au clic
      // sur une ligne du tableau (panel.js), pour que les deux entrées se comportent
      // de façon cohérente.
      highlightPoint(aniId, locDatetime);
    }

    document.querySelectorAll('.panel-table-row.selected-carte').forEach(tr => {
      tr.classList.remove('selected-carte');
    });
    // .selected-click n'est jamais pose ici (uniquement par panel.js sur clic tableau)
    // mais doit etre retire ici : sinon une ancienne ligne selectionnee via le tableau
    // reste visuellement marquee apres un clic direct sur la carte.
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

/**
 * Dessine les points GPS sur la carte.
 * @param {Array} locations - Liste des positions (Lambert-93)
 * @param {boolean} clearBefore - Si vrai, efface les points existants
 * @param {boolean} modeTrajectoire - Si vrai, applique le style spécifique trajectoire
 * @param {string} modeCouleur - Mode de coloration actif
 */
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

    // Contour uniforme Blanc en modes Sexe/Gestionnaire — le cycle par index
    // (getContourParIndex) n a de sens qu en mode Individu, ou il differencie
    // les couleurs Glasbey proches ; applique aux autres modes il produit un
    // contour Noir/Blanc incoherent au sein d une meme categorie (cf. audit).
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
      ani_gestionnaire: f.get('ani_gestionnaire'),
      ani_pop_rattach: f.get('ani_pop_rattach'),
      loc_datetime_local: f.get('loc_datetime_local'),
      loc_date_local: f.get('loc_date_local')
    };
    const [cR, cG, cB] = cssToRgba(getCouleur(loc, modeCouleur));
    // Meme regle qu en renderPoints() : contour uniforme Blanc hors mode Individu.
    const idx = indicesIndividus.get(loc.ani_id) ?? 0;
    const contour = modeCouleur === 'individu' ? getContourParIndex(idx) : CONTOURS[0];

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
    if (!parIndividu[loc.ani_id]) parIndividu[loc.ani_id] = [];

    const wgs84 = proj4('EPSG:2154', 'EPSG:4326', loc.geom.coordinates);
    const coord = ol.proj.fromLonLat(wgs84);
    parIndividu[loc.ani_id].push({ coord, loc });
  });

  Object.entries(parIndividu).forEach(([ani_id, points]) => {
    if (points.length < 2) return;

    points.sort((a, b) => new Date(a.loc.loc_datetime_local) - new Date(b.loc.loc_datetime_local));
    const coords = points.map(p => p.coord);

    // Couleur du segment i (entre coords[i] et coords[i+1]) : par annee du point de
    // depart en mode Annee — seul mode ou l'attribut source (date de la position)
    // varie le long de la trajectoire d'un meme individu (Sexe/Gestionnaire/
    // Population/Individu sont des attributs fixes de l'animal, identiques sur
    // tous ses points).
    const couleurUnique = modeCouleur === 'annee' ? null : getCouleur(points[0].loc, modeCouleur);
    const couleurSegmentAt = i => modeCouleur === 'annee' ? getCouleur(points[i].loc, modeCouleur) : couleurUnique;

    // Regroupement des segments consecutifs de meme couleur en runs — une seule
    // Feature MultiLineString par couleur (au lieu d'une Feature LineString par
    // segment). Les positions etant triees chronologiquement, l'annee est croissante
    // au fil de la sequence : tous les segments d'une meme annee sont necessairement
    // contigus, donc le nombre de runs est borne par le nombre d'annees distinctes de
    // l'individu — jamais par son nombre de positions (memes modes Individu/Sexe/
    // Gestionnaire/Population : une seule couleur -> un seul run -> une seule Feature,
    // comportement identique a avant).
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

/**
 * Alterne entre les différents fonds de carte disponibles.
 * @param {number} index - Index de la couche dans le tableau basemaps
 */
export function switchBasemap(index) {
  basemaps.forEach((layer, i) => {
    layer.setVisible(i === index);
  });
}

/**
 * Active/desactive un overlay WMTS par id (courbes de niveau, pentes, hydrographie,
 * routes) — independant de switchBasemap(), plusieurs overlays actifs simultanement.
 */
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

// Halo de surbrillance (feature independante dans haloSource, Canvas2D) + agrandissement
// du point reel lui-meme (attribut radius uniquement — jamais fillR/G/B/strokeR/G/B,
// donc son contour/couleur d'origine reste toujours intact quel que soit le mode de
// symbologie actif).
let _featureSurlignee = null;

// locDatetime (loc_datetime_local ou loc_date_local selon la position) distingue les
// positions d'un meme animal — sans lui, un individu ayant plusieurs positions
// affichees surlignerait toujours la meme feature (la premiere trouvee), quelle que
// soit la ligne du tableau reellement cliquee.
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
      stroke: new ol.style.Stroke({ color: 'rgba(255, 0, 0, 0.9)', width: 2 })
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

/**
 * Capture toutes les couches rendues de la carte dans un blob JPEG.
 * @returns {Promise<Blob>}
 */
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

        // Ratio reel utilise par OpenLayers pour dimensionner physiquement les canvas
        // sources (option Map.pixelRatio, par defaut window.devicePixelRatio). Sans ce
        // facteur, le canvas de sortie (size = pixels CSS) et les canvas sources
        // (pixels physiques = CSS x dpr) sont a des echelles differentes des que
        // dpr > 1 (ecran avec mise a l'echelle OS) -> points/traits mal places.
        const pixelRatio = window.devicePixelRatio || 1;

        // Surechantillonnage supplementaire au-dela du devicePixelRatio ecran — sur un
        // ecran dpr=1 (projecteur), la sortie serait sinon limitee a la taille d'affichage
        // CSS et paraitrait floue/pixelisee au zoom. Limite reelle : ne peut pas ajouter
        // de detail au-dela de ce que le navigateur a deja rendu (tuiles de fond plafonnees
        // par la resolution chargee au zoom courant) — le gain porte sur le lissage des
        // traits/points vectoriels et la marge de zoom avant pixellisation visible.
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

          // Taille CSS reelle affichee de ce canvas precis (independante de sa resolution
          // interne, qui peut differer d'une couche a l'autre — ex. le canvas des tuiles
          // de fond n'a pas forcement exactement size*pixelRatio en physique). offsetWidth/
          // offsetHeight ignorent le transform CSS (contrairement a getBoundingClientRect),
          // donnant la taille "avant transform" voulue ici.
          const cssWidth = canvas.offsetWidth || canvas.width;
          const cssHeight = canvas.offsetHeight || canvas.height;

          const transform = canvas.style.transform;
          const match = transform?.match(/^matrix\(([^()]*)\)$/);
          const [a, b, c, d, e, f] = match ? match[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];

          // scale s applique a toute la matrice (echelle ET translation) : il fait
          // passer du repere CSS px (ou vivent a,b,c,d,e,f et cssWidth/cssHeight) au
          // repere physique (suréchantillonné) du canvas de sortie.
          mapContext.setTransform(a * scale, b * scale, c * scale, d * scale, e * scale, f * scale);

          mapContext.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, cssWidth, cssHeight);
        });

        mapContext.globalAlpha = 1;

        // Barre d'echelle — absente par construction de la capture (ol.control.ScaleLine
        // est un element DOM hors du viewport carte, cf. target: scaleTarget dans
        // initMap()). Calcul independant de ScaleLine (pas de lecture DOM) pour rester
        // fiable quelle que soit sa config — meme API (getPointResolution) que celle
        // utilisee en interne par ScaleLine pour corriger la distorsion Web Mercator
        // selon la latitude du centre.
        const view = map.getView();
        const resolutionSol = ol.proj.getPointResolution(
          view.getProjection(), view.getResolution(), view.getCenter(), 'm'
        );

        // Meme algorithme que ol.control.ScaleLine.updateElement_ (verifie dans le bundle
        // OL charge par l'app — UP=[1,2,5], boucle ascendante). minWidthCss (100, meme
        // valeur que minWidth dans la config ScaleLine d'initMap) est un PLANCHER : on
        // cherche le plus PETIT nombre rond dont la largeur resultante atteint ou depasse
        // minWidthCss, pas le plus grand qui reste en dessous (bug precedent = un cran
        // systematique sous la valeur reellement affichee par ScaleLine).
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
        // Halo blanc dessine AVANT le noir (legerement plus grand que la barre) plutot
        // qu'un strokeRect a cheval sur les bords — un contour de 1px a cheval sur une
        // barre de 4px de haut mangeait 50% de sa hauteur (25% par bord), donnant une
        // barre a majorite blanche plutot que noire avec liseré (cf. bug precedent).
        mapContext.fillStyle = '#ffffff';
        mapContext.fillRect(xCss - 1, yCss - hauteurBarreCss - 1, largeurBarreCss + 2, hauteurBarreCss + 2);
        mapContext.fillStyle = '#000000';
        mapContext.fillRect(xCss, yCss - hauteurBarreCss, largeurBarreCss, hauteurBarreCss);

        // Fond semi-transparent derriere le texte — espacement de 4px avec la barre
        // defini explicitement (independant du padding), pour eviter que le fond ne
        // vienne toucher la barre (cf. bug precedent : le padding mangeait l'espace).
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

        // Legende depart/direction — comme #scaleTarget, #legendePanel est un <div> HTML
        // hors du viewport carte (cf. .legende-wrapper dans index.html), donc absent de
        // la capture. Dessinee UNIQUEMENT si le mode Trajectoire est actif (ces notions
        // n'existent pas en mode Positions) — meme lecture d'etat que showPopup() (map.js)
        // et mettreAJourLegende() (app.js), pas de nouveau parametre a propager dans toute
        // la chaine d'export. Reproduit fidelement la legende ecran (map.css : en mode
        // Trajectoire, seuls depart et direction sont visibles — "Derniere position" y
        // est masquee).
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
