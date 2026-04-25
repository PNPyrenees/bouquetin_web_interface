import { DEFAULT_CENTER, DEFAULT_ZOOM, MAX_ZOOM, LAMBERT93 } from './config.js';

let map;
let gpsSource;
let popupOverlay;

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

  const popupEl = document.getElementById(popupId);
  popupOverlay = new ol.Overlay({
    element: popupEl,
    positioning: 'bottom-center',
    offset: [0, -10]
  });

  map = new ol.Map({
    target: targetId,
    layers: [
      new ol.layer.Tile({ source: new ol.source.OSM() }),
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
    const coord  = ol.proj.fromLonLat(wgs84);

    const feature = new ol.Feature({
      geometry: new ol.geom.Point(coord),
      ...loc
    });
    gpsSource.addFeature(feature);
  });

  if (gpsSource.getFeatures().length > 0) {
    map.getView().fit(gpsSource.getExtent(), {
      padding: [40, 40, 40, 40],
      maxZoom: MAX_ZOOM
    });
  }

  return gpsSource.getFeatures().length;
}

function showPopup(feature, coordinate, popupEl) {
  const p = feature.getProperties();
  popupEl.innerHTML = `
    <h4>${p.ani_nom || '—'}</h4>
    <p><b>Population :</b> ${p.ani_pop_rattach || '—'}</p>
    <p><b>Date UTC :</b> ${p.loc_datetime_utc ? p.loc_datetime_utc.replace('T', ' ') : '—'}</p>
    <p><b>Altitude :</b> ${p.loc_altitude_capteur != null ? p.loc_altitude_capteur + ' m' : '—'}</p>
    <p><b>Température :</b> ${p.loc_temperature_capteur != null ? p.loc_temperature_capteur + ' °C' : '—'}</p>
    <p><b>DOP :</b> ${p.loc_dop || '—'}</p>
  `;
  popupOverlay.setPosition(coordinate);
  popupEl.style.display = 'block';
}

export function clearMap() {
  gpsSource.clear();
}
