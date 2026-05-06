import { DEFAULT_CENTER, DEFAULT_ZOOM, MAX_ZOOM, LAMBERT93 } from './config.js';
let map;
let gpsSource;
let popupOverlay;
let basemaps = [];

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

  // Définition des fonds de carte
  basemaps = [
    new ol.layer.Tile({
      source: new ol.source.OSM(),
      visible: true
    }),
    new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
        attributions: '© IGN Géoportail'
      }),
      visible: false
    }),
    new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
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
export function renderPoints(locations) {
  gpsSource.clear();
  locations.forEach(loc => {
    if (!loc.geom?.coordinates) return;
    const wgs84 = proj4('EPSG:2154', 'EPSG:4326', loc.geom.coordinates);
    const coord = ol.proj.fromLonLat(wgs84);
    const feature = new ol.Feature({
      geometry: new ol.geom.Point(coord),
      ...loc
    });
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
        <span>Date et heure UTC :</span>
        <div class="date-value">${dateStr}</div>
      </div>
    </div>
  `;
  popupOverlay.setPosition(coordinate);
  popupEl.style.display = 'block';
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

