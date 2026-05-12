import { DEFAULT_CENTER, DEFAULT_ZOOM, MAX_ZOOM, LAMBERT93 } from './config.js';
let map;
let gpsSource;
let trajectoireSource;
let popupOverlay;
let basemaps = [];

const COULEURS_PALETTE = [
  '#2D6A4F', '#E07B39', '#3A86FF', '#9B2335', '#8338EC',
  '#FF006E', '#06D6A0', '#FB5607', '#FFBE0B', '#3D405B'
];

const couleursIndividus = new Map();
let _dateMin = null;
let _dateMax = null;

function preparerCouleurs(locations) {
  couleursIndividus.clear();
  const ids = [...new Set(locations.map(l => l.ani_id))];
  ids.forEach((id, i) => {
    couleursIndividus.set(id, COULEURS_PALETTE[i % COULEURS_PALETTE.length]);
  });

  const dates = locations
    .map(l => new Date(l.loc_datetime_utc || l.loc_date_utc))
    .filter(d => !isNaN(d));
  _dateMin = Math.min(...dates);
  _dateMax = Math.max(...dates);
}

function getCouleur(loc, mode) {
  switch (mode) {
    case 'individu':
    default:
      return couleursIndividus.get(loc.ani_id) || COULEURS_PALETTE[0];

    case 'date': {
      if (!_dateMin || !_dateMax || _dateMin === _dateMax) return '#2D6A4F';
      const t = (new Date(loc.loc_datetime_utc || loc.loc_date_utc) - _dateMin) / (_dateMax - _dateMin);
      const palette = [[255,190,11],[251,86,7],[155,35,53],[131,56,236]];
      const seg = t * (palette.length - 1);
      const i = Math.min(Math.floor(seg), palette.length - 2);
      const f = seg - i;
      const r = Math.round(palette[i][0] + f * (palette[i+1][0] - palette[i][0]));
      const g = Math.round(palette[i][1] + f * (palette[i+1][1] - palette[i][1]));
      const b = Math.round(palette[i][2] + f * (palette[i+1][2] - palette[i][2]));
      return `rgb(${r},${g},${b})`;
    }

    case 'saison': {
      const mois = new Date(loc.loc_datetime_utc || loc.loc_date_utc).getMonth() + 1;
      if ([12,1,2].includes(mois)) return '#3A86FF';
      if ([3,4,5].includes(mois)) return '#06D6A0';
      if ([6,7,8].includes(mois)) return '#FFBE0B';
      return '#FB5607';
    }

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

export function initMap(targetId, popupId) {
  proj4.defs('EPSG:2154', LAMBERT93);
  ol.proj.proj4.register(proj4);
  gpsSource = new ol.source.Vector();
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

  trajectoireSource = new ol.source.Vector();
  const trajectoireLayer = new ol.layer.Vector({
    source: trajectoireSource,
    zIndex: 2
  });



  // Définition des fonds de carte
  basemaps = [
    // OSM — fond par défaut (fiable)
    new ol.layer.Tile({
      source: new ol.source.OSM(),
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

    // IGN Plan V2 — accès public sans clé
    new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
        attributions: '© IGN Géoportail'
      }),
      visible: false
    })
  ];

  const popupEl = document.getElementById(popupId);
  popupOverlay = new ol.Overlay({
    element: popupEl,
    positioning: 'bottom-center',
    offset: [0, -10]
  });
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
      zoom: DEFAULT_ZOOM
    }),
    controls: ol.control.defaults.defaults().extend([
      new ol.control.ScaleLine({ units: 'metric' })
    ])
  });
  map.on('pointermove', evt => {
    map.getViewport().style.cursor = map.hasFeatureAtPixel(evt.pixel) ? 'pointer' : '';
  });
  map.on('singleclick', evt => {
    let hit = false;
    map.forEachFeatureAtPixel(evt.pixel, feature => {
      if (hit) return;
      hit = true;
      showPopup(feature, evt.coordinate, popupEl);
    });
    if (!hit) popupEl.style.display = 'none';
  });
  return map;
}
export function renderPoints(locations, clearBefore = true, modeTrajectoire = false, modeCouleur = 'defaut') {
  if (clearBefore) gpsSource.clear();
  preparerCouleurs(locations);

  // Identifier première et dernière position par individu
  const premiereParIndividu = {};
  const derniereParIndividu = {};
  locations.forEach(loc => {
    const date = new Date(loc.loc_datetime_utc || loc.loc_date_utc);
    if (!premiereParIndividu[loc.ani_id] || date < new Date(premiereParIndividu[loc.ani_id].date)) {
      premiereParIndividu[loc.ani_id] = { date: loc.loc_datetime_utc || loc.loc_date_utc, loc };
    }
    if (!derniereParIndividu[loc.ani_id] || date > new Date(derniereParIndividu[loc.ani_id].date)) {
      derniereParIndividu[loc.ani_id] = { date: loc.loc_datetime_utc || loc.loc_date_utc, loc };
    }
  });

  locations.forEach(loc => {
    if (!loc.geom?.coordinates) return;
    const geom = typeof loc.geom === 'string' ? JSON.parse(loc.geom) : loc.geom;
    if (!geom?.coordinates) return;
    const wgs84 = proj4('EPSG:2154', 'EPSG:4326', geom.coordinates);
    const coord = ol.proj.fromLonLat(wgs84);

    const estDernier = modeTrajectoire &&
      derniereParIndividu[loc.ani_id]?.date === (loc.loc_datetime_utc || loc.loc_date_utc);
    const estPremier = modeTrajectoire &&
      premiereParIndividu[loc.ani_id]?.date === (loc.loc_datetime_utc || loc.loc_date_utc);

    // En mode Trajectoire — ignorer les points intermédiaires
    if (modeTrajectoire && !estDernier && !estPremier) return;

    const feature = new ol.Feature({
      geometry: new ol.geom.Point(coord),
      ...loc
    });

    if (modeTrajectoire && estPremier && !estDernier) {
      // Point de départ — cercle creux blanc bordure colorée
      const couleur = getCouleur(loc, modeCouleur);
      feature.setStyle(new ol.style.Style({
        image: new ol.style.Circle({
          radius: 6,
          fill: new ol.style.Fill({ color: 'white' }),
          stroke: new ol.style.Stroke({ color: couleur, width: 2.5 })
        })
      }));
    } else if (modeTrajectoire && estDernier) {
      // Dernière position — cercle plein coloré
      const couleur = getCouleur(loc, modeCouleur);
      feature.setStyle(new ol.style.Style({
        image: new ol.style.Circle({
          radius: 8,
          fill: new ol.style.Fill({ color: couleur }),
          stroke: new ol.style.Stroke({ color: 'white', width: 2.5 })
        })
      }));
    } else if (!modeTrajectoire) {
      // Mode Positions — appliquer couleur selon le mode
      const couleur = getCouleur(loc, modeCouleur);
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
function showPopup(feature, coordinate, popupEl) {
  const p = feature.getProperties();
  const dateStr = p.loc_datetime_utc ? p.loc_datetime_utc.replace('T', ' ').slice(0, 16) : p.loc_date_utc ? p.loc_date_utc.replace('T', ' ').slice(0, 16) : '—';

  popupEl.innerHTML = `
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

  // Zoom vers le point cliqué
  map.getView().animate({ center: coordinate, zoom: 13, duration: 400 });
}
export function clearMap() {
  gpsSource.clear();
}
export function updateMapSize() {
  if (map) map.updateSize();
}
export function switchBasemap(index) {
  basemaps.forEach((layer, i) => {
    layer.setVisible(i === index);
  });

}

export function getMap() { return map; }
export function getGpsSource() { return gpsSource; }

export function clearMapPoints() {
  gpsSource.clear();
}

export function renderTrajectoire(locations, modeCouleur = 'defaut') {
  trajectoireSource.clear();
  preparerCouleurs(locations);

  const parIndividu = {};
  locations.forEach(loc => {
    if (!loc.geom?.coordinates) return;
    const geom = typeof loc.geom === 'string' ? JSON.parse(loc.geom) : loc.geom;
    if (!geom?.coordinates) return;
    if (!parIndividu[loc.ani_id]) parIndividu[loc.ani_id] = [];
    const wgs84 = proj4('EPSG:2154', 'EPSG:4326', geom.coordinates);
    const coord = ol.proj.fromLonLat(wgs84);
    parIndividu[loc.ani_id].push({ coord, loc });
  });

  Object.entries(parIndividu).forEach(([ani_id, points]) => {
    if (points.length < 2) return;
    points.sort((a, b) => new Date(a.loc.loc_datetime_utc) - new Date(b.loc.loc_datetime_utc));
    const coords = points.map(p => p.coord);

    // Couleur du trait — basée sur le premier point de l'individu
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

    // Flèches directionnelles
    for (let i = 0; i < coords.length - 1; i++) {
      const coordA = coords[i];
      const coordB = coords[i + 1];
      const dx = coordB[0] - coordA[0];
      const dy = coordB[1] - coordA[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1500) continue;

      // Pour mode date — couleur par segment selon la date du point
      const couleurFleche = modeCouleur === 'date'
        ? getCouleur(points[i].loc, modeCouleur)
        : couleur;

      const rotation = Math.atan2(dy, dx) - Math.PI / 2;
      const midpoint = [(coordA[0] + coordB[0]) / 2, (coordA[1] + coordB[1]) / 2];
      const fleche = new ol.Feature({ geometry: new ol.geom.Point(midpoint) });
      fleche.setStyle(new ol.style.Style({
        image: new ol.style.RegularShape({
          points: 3,
          radius: 6,
          rotation: -rotation,
          fill: new ol.style.Fill({ color: couleurFleche }),
          stroke: new ol.style.Stroke({ color: 'white', width: 1 }),
          rotateWithView: false
        })
      }));
      trajectoireSource.addFeature(fleche);
    }
  });
}

export function clearTrajectoire() {
  if (trajectoireSource) trajectoireSource.clear();
}


