import { DEFAULT_CENTER, DEFAULT_ZOOM, MAX_ZOOM, LAMBERT93, ZOOM_POINT_SINGLE, ZOOM_MAX_MANUAL, ZOOM_MIN_MANUAL, IGN_API_KEY } from './config.js';
let map;
let gpsSource;
let trajectoireSource;
let popupOverlay;
let basemaps = [];
let isAnimating = false;

const COULEURS_PALETTE = [
  '#2D6A4F', '#E07B39', '#3A86FF', '#9B2335', '#8338EC',
  '#FF006E', '#06D6A0', '#FB5607', '#FFBE0B', '#3D405B'
];

const couleursIndividus = new Map();
let _dateMin = null;
let _dateMax = null;

/**
 * Analyse les données avant rendu pour initialiser les échelles de couleurs.
 */
function preparerCouleurs(locations) {
  couleursIndividus.clear();
  const ids = [...new Set(locations.map(l => l.ani_id))];
  ids.forEach((id, i) => {
    couleursIndividus.set(id, COULEURS_PALETTE[i % COULEURS_PALETTE.length]);
  });

  const dates = locations
    .map(l => new Date(l.loc_datetime_local || l.loc_date_local))
    .filter(d => !isNaN(d));
  _dateMin = dates.length > 0 ? Math.min(...dates) : null;
  _dateMax = dates.length > 0 ? Math.max(...dates) : null;
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
function getCouleur(loc, mode) {
  switch (mode) {
    case 'individu':
    default:
      return couleursIndividus.get(loc.ani_id) || COULEURS_PALETTE[0];

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

  // Création de la couche des points GPS
  const gpsLayer = new ol.layer.Vector({
    source: gpsSource,
    style: new ol.style.Style({
      image: new ol.style.Circle({
        radius: 6,
        fill: new ol.style.Fill({ color: '#2D6A4F' }),
        stroke: new ol.style.Stroke({ color: 'white', width: 2 })
      })
    })
  });

  // Création de la couche des lignes (trajectoires)
  const trajectoireLayer = new ol.layer.Vector({
    source: trajectoireSource
  });

  // Définition des fonds de carte
  basemaps = [
    // IGN SCAN25 - fond de carte topographique
    new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: `https://data.geopf.fr/private/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&apikey=${IGN_API_KEY}&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN25TOUR&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
        attributions: '©IGN'
      }),
      visible: true
    }),
    // OpenTopoMap
    new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attributions: '© OpenTopoMap contributors'
      }),
      visible: false
    }),
    // OpenStreetMap
    new ol.layer.Tile({
      source: new ol.source.OSM(),
      visible: false
    })
  ];

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
    controls: ol.control.defaults.defaults({ zoom: false }).extend([
      new ol.control.Zoom({ className: 'ol-zoom-custom' }),
      new ol.control.ScaleLine({
        units: 'metric',
        type: 'scalebar',
        steps: 4,
        text: true,
        minWidth: 100,
        target: document.getElementById('scaleTarget')
      })
    ])
  });

  const fullscreenControl = new ol.control.FullScreen({
    className: 'ol-fullscreen-custom'
  });
  map.addControl(fullscreenControl);

  // Changement du curseur au survol d'un point
  map.on('pointermove', evt => {
    map.getViewport().style.cursor = map.hasFeatureAtPixel(evt.pixel) ? 'pointer' : '';
  });

  // Gestion du clic pour afficher le popup
  map.on('singleclick', evt => {
    let hit = false;
    let aniId = null;
    map.forEachFeatureAtPixel(evt.pixel, feature => {
      if (hit) return;
      // Ignorer les lignes de trajectoire et les flèches — uniquement les points GPS
      const geometry = feature.getGeometry();
      if (!geometry || geometry.getType() !== 'Point') return;
      // Ignorer les flèches directionnelles (pas de ani_id)
      if (!feature.get('ani_id')) return;
      hit = true;
      aniId = String(feature.get('ani_id'));
      showPopup(feature, evt.coordinate, popupEl);
    });
    if (!hit) popupEl.style.display = 'none';

    document.querySelectorAll('.panel-table-row.selected-carte').forEach(tr => {
      tr.classList.remove('selected-carte');
    });

    const panneauOuvert = document.getElementById('sidebarRight')?.classList.contains('visible');
    if (panneauOuvert && aniId) {
      window._scrollToAniId?.(aniId);
      window._scrollToAniIdIndividus?.(aniId);

      setTimeout(() => {
        document.querySelectorAll(`.panel-table-row[data-ani-id='${aniId}']`).forEach(tr => {
          tr.classList.add('selected-carte');
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

    const wgs84 = proj4('EPSG:2154', 'EPSG:4326', loc.geom.coordinates);
    const coord = ol.proj.fromLonLat(wgs84);

    const estDernier = modeTrajectoire &&
      derniereParIndividu[loc.ani_id]?.date === (loc.loc_datetime_local || loc.loc_date_local);
    const estPremier = modeTrajectoire &&
      premiereParIndividu[loc.ani_id]?.date === (loc.loc_datetime_local || loc.loc_date_local);

    const feature = new ol.Feature({
      geometry: new ol.geom.Point(coord),
      ...loc
    });

    const couleur = getCouleur(loc, modeCouleur);

    if (modeTrajectoire && estPremier && !estDernier) {
      // Point de départ — cercle creux
      feature.setStyle(new ol.style.Style({
        image: new ol.style.Circle({
          radius: 6,
          fill: new ol.style.Fill({ color: 'white' }),
          stroke: new ol.style.Stroke({ color: couleur, width: 2.5 })
        })
      }));
    } else if (modeTrajectoire && estDernier) {
      // Dernière position — cercle plein plus grand
      feature.setStyle(new ol.style.Style({
        image: new ol.style.Circle({
          radius: 8,
          fill: new ol.style.Fill({ color: couleur }),
        })
      }));
    } else if (modeTrajectoire) {
      // Points intermédiaires — petit cercle discret
      feature.setStyle(new ol.style.Style({
        image: new ol.style.Circle({
          radius: 4,
          fill: new ol.style.Fill({ color: couleur }),
          stroke: new ol.style.Stroke({ color: 'white', width: 1 })
        })
      }));
    } else {
      // Mode Positions classique
      feature.setStyle(new ol.style.Style({
        image: new ol.style.Circle({
          radius: 6,
          fill: new ol.style.Fill({ color: couleur }),
           stroke: new ol.style.Stroke({ color: 'white', width: 2 })
        })
      }));
    }

    gpsSource.addFeature(feature);
  });

  return gpsSource.getFeatures().length;
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
      : '—';

  popupEl.innerHTML = isTrajectoire ? `
    <div class="popup-content">
      <strong>${p.ani_nom || '—'}</strong>
      <div class="popup-info">
        <span>${dateStr}</span>
      </div>
    </div>
  ` : `
    <div class="popup-content">
      <strong>${p.ani_nom || '—'}</strong>
      <div class="popup-info">
        <span>Dernière position :</span>
        <div class="date-value">${dateStr}</div>
      </div>
    </div>
  `;

  popupOverlay.setPosition(coordinate);
  popupEl.style.display = 'block';
  isAnimating = true;
  map.getView().animate({ center: coordinate, zoom: ZOOM_POINT_SINGLE, duration: 400 }, () => {
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
    const couleur = getCouleur(points[0].loc, modeCouleur);

    const ligne = new ol.Feature({ geometry: new ol.geom.LineString(coords) });
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

      if (dist < 800) continue;

      const rotation = Math.atan2(dy, dx) - Math.PI / 2;
      const midpoint = [(coordA[0] + coordB[0]) / 2, (coordA[1] + coordB[1]) / 2];

      const fleche = new ol.Feature({ geometry: new ol.geom.Point(midpoint) });
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

export function highlightPoint(ani_id, actif) {
  const features = gpsSource.getFeatures();
  features.forEach(f => {
    if (String(f.get('ani_id')) === String(ani_id)) {
      const style = f.getStyle() || f.get('_styleOriginal');
      if (!f.get('_styleOriginal')) f.set('_styleOriginal', f.getStyle());

      if (actif) {
        const original = f.get('_styleOriginal');
        const image = original?.getImage?.();
        if (image) {
          const newStyle = new ol.style.Style({
            image: new ol.style.Circle({
              radius: (image.getRadius?.() || 6) + 3,
              fill: image.getFill?.(),
              stroke: image.getStroke?.()
            })
          });
          f.setStyle(newStyle);
        }
      } else {
        f.setStyle(f.get('_styleOriginal'));
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
  map.getView().animate({ center: coord, zoom: ZOOM_POINT_SINGLE, duration: 400 });
}