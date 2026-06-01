import { getMap, getGpsSource } from '../../frontend/assets/js/map.js';
import { ZOOM_POINT_SINGLE } from '../../frontend/assets/js/config.js';
import { getProgrammationsMap } from '../../frontend/assets/js/app.js';

/**
 * EXPOSITIONS GLOBALES POUR LE DÉBOGAGE & LES TESTS DE LA CARTE
 * 
 * Ces variables et fonctions de test étaient précédemment exposées directement 
 * dans le fichier de production app.js. Elles ont été déplacées ici afin d'isoler 
 * le code de debug hors de l'environnement de production.
 */
window._getMap = getMap;
window._getGpsFeatures = () => getGpsSource().getFeatures();
window._ZOOM_POINT_SINGLE = ZOOM_POINT_SINGLE;
window._progMap = getProgrammationsMap();

console.log("Test Map JS chargé avec succès - Outils de débogage exposés sur window.");
