# CHANGELOG

## [0.21.1] - 2026-06-08

### Corrections
- Refonte complète du filtrage temporel via fonction getPeriodesActives() partagée entre mettreAJourListeParDate et applyFilters
- Multi-saisons + année : union correcte des individus et positions par saison au lieu de la dernière saison seulement
- Liste individus et carte toujours cohérentes en nombre et en individus
- applyFilters mode Positions : utilise getPeriodesActives pour construire les périodes, fetchLastLocationsParPeriode par période puis fusion avec position la plus récente par animal

## [0.21.0] - 2026-06-06

### Ajouts
- Filtrage liste individus en temps réel à la sélection année seule via fetchAnimalIdsParPeriode
- Filtrage liste individus en temps réel à la sélection saison + année via union des plages API
- Filtrage liste individus en temps réel à la sélection saison sans année via union toutes années
- Filtre année seule sur la carte au clic Appliquer
- Mode Positions avec filtre temporel utilise fetchLastLocationsParPeriode pour afficher la dernière position dans la période au lieu de la dernière position absolue
- Mécanisme anti-requête-obsolète via _derniereRequeteId pour éviter les écrasements de liste

### Modifications
- applyFilters mode Positions : bascule automatique entre fetchAllLastLocations et fetchLastLocationsParPeriode selon les filtres actifs
- mettreAJourListeParDate refactorisé avec gestion année seule, saison+année, saison sans année, dates seules
- TomSelect onChange selectAnnee appelle directement mettreAJourListeParDate via setTimeout
- reinitialiserTousLesFiltres réécrite pour garantir un état initial complet

### Corrections
- Badge-modifie saison préserve le listener onClick via manipulation nœuds texte
- Restauration dates mémorisées quand on revient à une seule saison cochée
- Filtre saison cumulatif correct en mode Positions
- Réinitialisation TomSelect selectAnnee via setValue vide

### Connu — à corriger
- Saison sans année : liste individus correcte mais carte peut manquer certains animaux (fetchLastLocationsParPeriode incomplet sur toutes années)

## [0.20.0] - 2026-06-04

### Ajouts
- Selecteur d'annee partage entre Periode et Saison - pilote les deux filtres
- Memorisation des dates personnalisees par saison via datesSaisonModifiees
- Badge saison cliquable - affiche les dates dans les inputs au clic sans supprimer le badge
- Badge badge-modifie - couleur differenciee quand les dates d'une saison ont ete modifiees manuellement
- Filtrage liste individus par jj/mm sur toutes les annees confondues quand aucune annee selectionnee
- dataset.derniereDatePos ajoute sur chaque label individu pour le filtrage cote JS
- Inputs Du/Au en format jj/mm avec masque automatique sans Flatpickr

### Modifications
- Saisons listener appelle mettreAJourListeParDate au lieu de filtrerListeIndividus
- selectAnnee listener appelle mettreAJourListeParDate si dates presentes
- mettreAJourListeParDate refactorise avec fonction _appliquerFiltreListeAvecIds
- selectTranslocation retire des badges car filtre non implemente cote liste et API

### Corrections
- Restauration dates memorisees quand on revient a une seule saison cochee
- Badge saison restaure la couleur badge-modifie apres decocher/recocher

## [0.19.0] - 2026-06-03

### Ajouts
- Contrôle FullScreen OpenLayers en haut à droite de la carte
- Échelle scalebar OpenLayers avec ratio et barre graphique dans legende wrapper
- Compteur positions totales dans la pagination du panneau attributaire

### Modifications UI
- Boutons zoom déplacés en haut à gauche
- Légende et échelle repositionnées en bas à gauche côte à côte
- Positions affichées retirées de la légende et intégrées dans la pagination
- Pagination simplifiée fenêtre glissante 2 pages avec ellipsis

### Corrections
- Filtres sexe et gestionnaire appliqués côté JS car absents de v_animal_last_loc
- Crash positionsCount corrigé via appels optionnels

## [0.18.0] - 2026-06-03

### Corrections
- Zoom au premier filtre avec plusieurs individus délai 400ms pour laisser le temps au redimensionnement du panneau
- Label Inconnu retiré de la légende en mode couleur Sexe
- Libellé prog id 5 corrigé 8 locs/j (3h/90s) au lieu de 6 locs/j

### Modifications UI
- Traits sous les en-têtes de colonnes du tableau retirés
- Trait sous les onglets Individus/Données retiré trait vert actif conservé via after
- Vignettes fonds de carte sans border radius
- En-tête Légende masqué

## [0.17.0] - 2026-06-02

### Ajouts
- TomSelect intégré sur tous les selects de la sidebar (Population, Sexe, Classe d'âge, Gestionnaire, Translocation, Programmation GPS)
- Initialisation lazy au premier toggle de chaque accordéon - évite les problèmes de dimensions sur éléments cachés
- Flatpickr intégré sur les champs date Du/Au - calendrier stylisé, locale fr, format d/m/Y, placeholder jj/mm/aaaa
- `static: true` sur Flatpickr - calendrier stable sans déplacement au scroll
- Logo `logo_tramnoir.png` en fond semi-transparent sur la sidebar (opacité 0.08 via ::before)
- Spinner de chargement remplacé par le logo PNP rotatif avec filtre CSS vert

### Modifications UI
- Override CSS `.ts-wrapper.sidebar-select` - corrige l'héritage des styles sidebar-select sur le wrapper TomSelect
- Variables root ajoutées : `--select-border-radius`, `--select-dropdown-radius`, `--select-hover-bg`, `--select-selected-bg`, `--select-color`, `--input-border-radius`, `--select-width`
- Hover TomSelect harmonisé avec Flatpickr : `--select-hover-bg: #d1e5df`
- Largeur selects réduite à `--select-width: 85%`
- Z-index dropdowns TomSelect et Flatpickr à 9999
- Options sélectionnées et au survol en couleur primaire `#099469`

## [0.16.0] - 2026-06-02

### Modifications UI
- Couleur primaire : `#099469`, hover : `#006B4A`
- Logo PNP agrandi (`height: 64px`) et repositionné (`margin-left: -20px`)
- Bouton 'Appliquer les filtres' et bouton spatial : `border-radius: 18px`
- Toggle sidebar : repositionné (`top: 30%`), hauteur augmentée (`min-height: 100px`), border-radius réduit à `1px`
- Mode buttons Positions/Trajectoire : `border-radius: 1px`
- Checkbox et range : `accent-color: var(--color-primary)`
- Bouton 'Appliquer' hover : `background-color: var(--color-primary-hover)`
- Positions count panel : séparateur `border-top` retiré
- Badge filtre : border corrigé (`1px solid #b2d8bf`)
- Basemap active : border `color-primary-hover`, vignette réduite à `1px`
- Lien 'Réinitialiser' : `text-decoration: none`
- Onglets panneau : trait actif via `::after` centré à `60%`

### Modifications panel.js
- Libellé dropdown colonnes : 'Colonnes visibles' → 'Colonnes'

## [0.15.0] - 2026-06-01

### Ajouts
- Système de cache des requêtes API dans `api.js` - les résultats sont mémorisés par endpoint et combinaison de filtres
- Fonction `viderCache()` exportée depuis `api.js` - appelée automatiquement à la réinitialisation des filtres
- Normalisation des clés de cache - les filtres vides sont ignorés pour partager le cache entre `startApp()` et `applyFilters()`

### Performances
- Premier clic 'Appliquer les filtres' : 2580ms → 18ms (cache alimenté au chargement initial)
- Clics suivants avec mêmes filtres : instantané (< 30ms)
- Gain global : x100 à x1000 selon les cas

### Corrections
- Retrait des `console.time` et `console.log` de debug dans `filters.js`
- Retrait de `window._currentToken` temporaire dans `app.js`

## [0.14.0] - 2026-06-01

### Ajouts
- Fonction `fetchAllLastLocations()` dans `api.js` - récupère la dernière position de tous les animaux en une seule requête depuis `v_animal_last_loc`
- Clé API IGN `IGN_API_KEY` dans `config.js` et `config.example.js` - URL privée SCAN25 activée
- Index `idx_localisation_date` et `idx_localisation_capt_id` créés sur `t_localisation` côté serveur
- Champ `cor_date_fin` ajouté dans `v_animal_last_loc` - permet de calculer `activeIds` sans requête supplémentaire

### Modifications
- `v_animal_last_loc` modifiée côté serveur - retrait de `AND cor.cor_date_fin IS NULL`, retourne désormais 200 animaux (actifs + inactifs) au lieu de 52
- Chargement initial - `fetchAllLastLocations` remplace `fetchLastLocations` + `fetchLastLocationsInactifs` (230 requêtes → 1 requête)
- `activeIds` calculé directement depuis `cor_date_fin === null` sans appel supplémentaire à `fetchLastLocations`
- `applyFilters()` mode Positions - source unique `fetchAllLastLocations`, filtrage `suivisSeulement` via `cor_date_fin === null` côté JS
- `reinitialiserTousLesFiltres()` - utilise `fetchAllLastLocations` uniquement
- `fetchLastLocations` et `fetchLastLocationsInactifs` retirés des imports de `app.js` et `filters.js`

### Performances
- Chargement initial : 230 requêtes → 1 requête
- Temps de chargement : 15-30 secondes → moins de 2 secondes
- Index sur `t_localisation` - suppression du scan complet de 996 000 lignes à chaque requête

## [0.13.0] - 2026-05-29

### Ajouts
- Image de fond personnalisée dans le header (`header_top.png`) - dégradé turquoise cohérent avec la thématique nature/montagne
- Interaction carte ↔ tableau attributaire - clic sur un point carte surligne la ligne correspondante en vert dans les onglets Données et Individus observés
- Navigation automatique vers la page du tableau contenant la donnée sélectionnée avec centrage de la ligne
- Persistance de la sélection lors du changement d'onglet ou de l'application des filtres
- Sélection exclusive - une seule ligne surlignée à la fois, retiré automatiquement à la sélection suivante
- Fonction `scrollToAniId()` et `scrollToAniIdIndividus()` exportées depuis `panel.js`
- Variable `aniIdSelectionne` mémorisée dans `panel.js` pour maintenir la sélection après rendu

### Modifications
- Symbologie : options Date et Saison retirées temporairement - à valider avec Ludovic et Alexandre, code commenté pour réactivation future
- Seuil des flèches directionnelles en mode Trajectoire réduit de 1500m à 800m
- Bordure arrondie du sélecteur de fonds de carte réduite (`border-radius: 4px`)
- Retrait du survol point carte sur les lignes du tableau - uniquement au clic

### Corrections
- Tri de la colonne Dernière position en mode Positions - fallback sur `loc_date_local` si `loc_datetime_local` est null
- Fond gris visible pendant le drag de fermeture du panneau droit - `right` de `#mapScreen` synchronisé en temps réel avec la largeur du panneau
- Retrait du `console.log('Premier individu')` restant dans `app.js`

## [0.12.0] - 2026-05-28

### Ajouts
- Sélecteur de fonds de carte style Google Maps - vignette active toujours visible, menu qui s'ouvre vers la gauche avec transition scale + opacity
- Vignettes agrandies (64px), bordure verte sur le fond actif, noms réels affichés : IGN SCAN25, OpenTopoMap, OpenStreetMap
- Mise à jour `config.example.js` - ajout constantes de zoom et DEV_PASSWORD
- Nouveau module `filters.js` - regroupe toute la logique de filtrage extraite de `app.js`

### Modifications
- Retrait du cache-busting `?v=1.1.0` de tous les imports JS et CSS
- Variables partagées `animals`, `activeIds`, `currentToken`, `programmationsMap` accessibles via getters/setters exportés depuis `app.js`
- Zoom OpenLayers remonté (`bottom: 180px`) pour ne plus être masqué par le sélecteur de fonds de carte
- Suppression de la modal `#layersModal` et de tous ses styles associés
- `app.js` allégé - logique de filtrage déplacée dans `filters.js`

### Corrections
- Recherche textuelle filtre uniquement parmi les animaux de la période sélectionnée
- Listener `searchIndividu` simplifié - délègue entièrement à `mettreAJourListeParDate()`
- Suppression du listener `input` sur les dates - seul `change` conservé car `<input type=date>` ne retourne pas `value` pendant la frappe manuelle
- Double listener `searchIndividu` supprimé
- Imports ES6 de variables `let` non réactifs entre modules - remplacés par getters/setters

## [0.11.0] - 2026-05-27

### Ajouts
- Onglet 'Individus observés' dans le panneau droit - tableau synthétique par animal avec colonnes configurables (Individu, ID, Sexe, Population, Gestionnaire + optionnelles : Année naissance, Première position, Dernière position, Code, Date lâcher, Date mort)
- Synchronisation carte ↔ panneau droit - les deux onglets se mettent à jour après chaque application de filtres avec uniquement les animaux/positions visibles sur la carte
- Clic sur une ligne 'Individus observés' → zoom sur le point de l'animal sans filtrer la carte
- Survol d'une ligne tableau (mode Positions uniquement) → grossissement du point sur la carte
- `#mapScreen.panel-open` - la carte se réduit quand le panneau droit s'ouvre, les éléments bas droite restent visibles
- Colonnes 'Première position' et 'Dernière position' calculées côté JS dans l'onglet Individus observés
- Fonction utilitaire `enrichirAnimauxAvecPositions()` dans `app.js`
- Constantes de zoom centralisées dans `config.js` : `ZOOM_POINT_SINGLE`, `ZOOM_FILTER_SINGLE`, `ZOOM_FILTER_MULTI`, `ZOOM_TRAJECTOIRE_SINGLE`, `ZOOM_TRAJECTOIRE_MULTI`, `ZOOM_MAX_MANUAL`, `ZOOM_MIN_MANUAL`
- Limites de zoom manuel définies dans la vue OpenLayers (`minZoom`, `maxZoom`)
- Stylisation personnalisée du popup cartographique dans `map.css` (fond blanc, ombre, typographie, taille min/max)
- Variables globales de commodité sur `window` (`_getMap`, `_getGpsFeatures`, `_ZOOM_POINT_SINGLE`)

### Modifications
- Onglet 'Individus observés' affiché en premier dans le panneau droit
- `ouvrirPanneauSiNecessaire()` ouvre sur l'onglet 'Individus observés' par défaut
- Colonnes par défaut de l'onglet 'Données' : ID, Dernière position, Altitude, Temp. (°C)
- `formaterValeur()` - fallback `loc_date_local` si `loc_datetime_local` est null
- `mettreAJourIndividus()` appelé après `renderPoints()` dans `startApp()` - synchronisé avec les points affichés
- `window._afficherPositionsIndividu` simplifié - zoom uniquement sur le point sans filtrer la carte
- Listener toggle sidebar droite unifié - suppression du doublon, ajout `updateMapSize()` après transition
- Popup retiré au clic sur une ligne tableau - uniquement au clic sur un point carte
- Popup fermé au déplacement manuel de la carte (`movestart`) sans interférer avec les animations programmatiques
- Popup uniquement sur les points GPS - ignoré sur les lignes de trajectoire et flèches directionnelles
- Contour blanc retiré des points GPS en mode Positions et Trajectoire
- Tous les niveaux de zoom hardcodés remplacés par les constantes de `config.js`
- `mettreAJourIndividus(animals.filter(...))` remplacé par `enrichirAnimauxAvecPositions(locations)` dans `applyFilters()` et `reinitialiserTousLesFiltres()`
- Survol désactivé en mode Trajectoire pour éviter le sautillement des points
- Offset vertical du popup augmenté de -10 à -16 dans `map.js`
- Clic sur l'onglet 'Données' appelle `mettreAJourColonnes()` pour rafraîchir l'affichage
- Formatage spécifique des dates de première et dernière position dans `formaterValeurIndividu()`
- Limite de positions par segment ramenée de 500 à 10 lors du chargement des trajectoires sans période
- Inversion de l'ordre des onglets dans `index.html` pour cohérence avec l'ordre par défaut

### Corrections
- Double listener sur `sidebarRightToggle` fusionné en un seul bloc
- `MIN_ZOOM` non importé dans `map.js` causant carte blanche - remplacé par `ZOOM_MIN_MANUAL`

## [0.10.0] - 2026-05-26

### Changed
- Suppression complète de la `.map-toolbar` - layout simplifié, `#mapScreen` part désormais de `top: 60px` (juste sous le header)
- Boutons **Positions** et **Trajectoire** déplacés sur la carte en bas à droite (style Google Maps)
- **Symbologie** déplacée dans la sidebar gauche juste au-dessus du bouton Appliquer
- **Légende** repositionnée en haut à gauche de la carte
- **Compteur de positions** collé sous la légende en bas
- Contrôles zoom OpenLayers repositionnés en bas à droite avec style épuré (fond blanc, ombre légère)
- Bouton couches `#mapLayersWrapper` repositionné en bas à droite au-dessus des boutons mode
- Navigation header en majuscules, sans fond au hover, soulignement actif uniquement
- `.sidebar-right` et `.sidebar` mis à jour pour `top: 60px`
- Boutons radio **Symbologie** remplacés visuellement par des cases carrées (`appearance: none` + style carré CSS, radio conservés pour la sélection unique)

### Removed
- `.map-toolbar` et tous ses styles associés (`.toolbar-left`, `.toolbar-right`, `.toolbar-couleur`, `.toolbar-label`, `.pill-btn`)

## [0.9.0] - 2026-05-13 au 22

### Added
- **Panneau données (sidebar droite)** - nouveau module `panel.js` complet :
  - Tableau attributaire avec 11 colonnes configurables (4 actives par défaut : Individu, ID, Sexe, Date/Heure locale)
  - Dropdown "Filtres colonnes" pour afficher/masquer les colonnes (Population, Altitude, Temp., DOP, Nb sat., Pos. Abe., Constructeur)
  - Tri par colonne au clic sur l'en-tête avec icônes ▲▼ (actif/inactif)
  - Filtres textuels par colonne en temps réel, fusionnés dans la même cellule que le titre
  - Pagination avec sélecteur de taille de page (25 / 50 / Tous)
  - En-têtes de tableau épinglés en haut (`position: sticky`) pendant le défilement
- **Sélecteur de fonds de carte** (`initBasemapSelector`) avec modal et vignettes : SCAN25 IGN (clé `ign_scan_ws` à demander), OpenTopoMap, OpenStreetMap
- **Sidebar droite redimensionnable** par glisser depuis le bord gauche, avec snap-close en dessous de 150px
- **Filtre Programmation GPS** dans `applyFilters()` et `filtrerListeIndividus()` - map `ani_id → prog_id` chargée au démarrage via `fetchProgrammations()`
- **Toast de notification** (`showToast`) pour les erreurs de sélection (trajectoire sans individu, outliers sans période)
- **`fetchLastLocationsParPeriode()`** - une position par animal sur une plage de dates (mode Positions avec période)
- **`fetchAnimalIdsParPeriode()`** - IDs distincts ayant des données sur une période, pour filtrer la liste d'individus sans recharger la carte
- **`fetchProgrammations()`** - lecture de `cor_animal_capteur` pour le filtre de programmation GPS

### Changed
- `initSidebarRight()` extrait avant le bloc `try` de `startApp()` - le toggle de la sidebar droite est garanti même en cas d'erreur API
- Mode Positions avec période : utilise désormais `fetchLastLocationsParPeriode` (une position par animal) au lieu de `fetchLocations` (toutes les positions)
- `mettreAJourListeParDate()` utilise `fetchAnimalIdsParPeriode()` (une seule requête) pour filtrer la liste d'individus par période
- `rendrePagination()` refactorisé via `DocumentFragment` (suppression du bug `insertBefore`)
- Structure HTML de `initPanneau()` : sous-titre de comptage supprimé, toolbar réduit au bouton "Filtres colonnes"
- En-têtes du tableau : deux lignes fusionnées en une seule (`<th>` avec `.th-label` + `.th-filter`), fond blanc conservé

### Fixed
- Toggle sidebar droite non fonctionnel si une erreur survenait avant `initSidebarBadges()`
- Boutons de pagination dans le mauvais ordre à cause d'un `insertBefore` sur un élément pas encore dans le DOM
- Carte coupée ou mal dimensionnée sur petit écran - `ResizeObserver` ajouté dans `map.js` pour appeler `map.updateSize()` à chaque redimensionnement du conteneur `#map`

### UI/UX
- En-têtes du tableau avec fond vert et texte blanc, filtres blancs intégrés sous chaque titre
- Icônes de tri ▲▼ grises par défaut, actif en vert vif (`var(--color-primary-hover)`)
- `.panel-table-wrapper` avec `min-height: 0` et `overflow: auto` pour un scroll interne correct dans la flexbox
- **Media queries responsive** ajoutées dans `main.css` pour adapter la mise en page sur petits écrans (sidebar, toolbar, header)

## [0.8.0] - 2026-05-12

### Added
- Nouveau système de **Légende dynamique** sur la carte, contextuel au mode couleur choisi
- Contrôle d'affichage de la légende (bouton minimiser/agrandir)

### Changed
- Refonte des modes couleurs : suppression du mode "Défaut", remplacé par le mode "Individu" actif par défaut
- Déplacement du sélecteur de couches (basemaps) en bas à gauche de la carte
- Uniformisation du style de la légende (bords droits, style "Old School" sans arrondis)
- Mise à jour de la barre d'outils couleur : espacement et séparateur visuel améliorés dans `main.css`

## [0.7.1] - 2026-05-11

### Added
- Système de rendu des **Trajectoires** avec traits arrondis et flèches directionnelles par segment
- Moteur de coloration multi-mode intégrant Individu, Date (gradient), Saison, Sexe et Gestionnaire
- Filtre **Population** ajouté dans la sidebar et branché à l'API
- Fonction `enrichirLocations()` - complète les métadonnées (`ani_sexe`, `ani_gestionnaire`, `ani_pop_rattach`) côté client
- Zoom adaptatif selon le nombre d'individus sélectionnés

### Changed
- Optimisation du filtrage de la liste d'individus via l'utilisation des attributs `dataset`
- `checkSuivis` - ne recharge plus la carte automatiquement, requiert un clic sur "Appliquer"
- `clearTrajectoire()` appelé au retour en mode Positions
- Mode Trajectoire - efface et recharge à chaque application de filtre
- Compteur positions mis à jour correctement sans doublon

### Fixed
- Couleurs incorrectes en mode Sexe/Gestionnaire - champs absents de la vue API corrigés via `enrichirLocations()`
- Points intermédiaires masqués en mode Trajectoire - seuls départ et arrivée sont marqués
- Seuil des flèches directionnelles ajusté (dist < 1500) pour éviter la surcharge visuelle

## [0.7.0] - 2026-05-07

### Added
- Support du paramètre `ani_pop_rattach` dans les appels API
- Ajout du champ `ani_pop_rattach` dans la récupération initiale des animaux (`fetchAnimals`)

### Changed
- Refonte de la fonction `filtrerIndividusParPopulation()` pour une intégration fluide avec la sidebar
- Mise à jour de `applyFilters()` pour intégrer la logique de filtrage par population (côté client et serveur)
- Réinitialisation globale incluant désormais le menu de population


## [0.6.0] - 2026-05-06

### Added
- Filtre "Individus suivis uniquement" (case à cocher) dans la section Individu
- Chargement initial en mode "Tous" - actifs + inactifs affichés par défaut
- Masquage automatique des animaux sans géométrie GPS dans la liste individus
- Overlay de chargement sur la carte + verrouillage sidebar pendant les requêtes
- Mise à jour synchronisée de la liste individus lors de l'application des filtres sexe/gestionnaire
- Fonction `fetchLastLocationsInactifs()` - une requête par animal inactif via `Promise.all()`
- Variable globale `activeIds` pour identifier les animaux avec collier actif
- **Removed**: Lien "Voir la trajectoire →" dans le popup

### Changed
- Chargement initial basé sur `v_animal_last_loc` (actifs) + `v_localisation` (inactifs)
- Filtre `loc_anomalie` corrigé : `is.false` → `not.is.true` (couvre NULL et false)
- Filtre outlier retiré de `fetchLastLocations()` - colonne absente de `v_animal_last_loc`
- Application automatique des filtres sexe/gestionnaire désactivée - uniquement au clic Appliquer
- Comparaison `ani_id` corrigée : `===` → `String() === String()`

### Fixed
- Animaux sans géométrie (Alto, Yao...) masqués dans la liste des filtres
- Réaffichage incorrect des animaux sans géométrie lors de la recherche et réinitialisation
- Filtre "Individus suivis" ne masquait pas correctement les inactifs après application d'autres filtres

### Investigated
- Petite lenteur du chargement mode "Tous" - causée par ~230 requêtes individuelles sur v_localisation
- Comportement loc_anomalie/loc_outlier validé avec Ludovic

## [0.5.0] - 2026-05-05

### API (api.js)
- **Fixed**: Correction du filtre `loc_anomalie` (`is.false` → `not.is.true`)
- **Fixed**: Correction du champ filtre gestionnaire (`gestionnaire` → `ani_gestionnaire`)
- **Fixed**: Correction de la comparaison `ani_id` via conversion en String (`String() === String()`)
- **Added**: Ajout du champ `ani_gestionnaire` dans `fetchAnimals()`
- **Added**: Nouvelle fonction `fetchLastLocations()` pour la vue `v_animal_last_loc`
- **Added**: Filtrage conditionnel des outliers selon le paramètre `include_outliers`
- **Removed**: Suppression du champ `loc_outlier` de `fetchLastLocations()` (absent de la vue)

### Carte (map.js)
- **Changed**: Intégration d'OpenLayers déplacée dans `index.html`
- **Changed**: Popup simplifié (nom animal + date UTC)
- **Added**: Lien "Voir la trajectoire →" dans le popup
- **Added**: Overlay de chargement
- **Removed**: Suppression du zoom automatique

### Interface (app.js)
- **Changed**: Chargement initial via `v_animal_last_loc` (52 animaux actifs)
- **Added**: Coloration bronze des animaux inactifs
- **Added**: Filtrage automatique de la carte sur changement de sexe ou gestionnaire
- **Changed**: Centralisation de la logique via `applyFilters()`
- **Added**: Fonction `reinitialiserTousLesFiltres()` avec réactualisation de la carte
- **Added**: Gestion des modes Positions vs Trajectoire

---


## [0.4.0] - 2026-05-01

### Added
- Barre de filtres latérale (sidebar) avec effet masquer/afficher
- Sections accordéon : Période, Sexe, Classe d'âge, Gestionnaire, Translocation, Programmation GPS, Qualité GPS, Filtre spatial
- Section Individu : liste de cases à cocher alimentée par l'API avec champ de recherche en temps réel
- Section Saison : cases à cocher (Rude, Hiver, Printemps, Été)
- Compteur de filtres actifs + boutons Appliquer / Réinitialiser

### Changed
- Filtres Individu et Saisons retirés de la bande verte
- Bande verte épurée : uniquement dernière synchronisation + titre plateforme

## [0.3.1] - 2026-04-30

### Added
- Nouveau panneau latéral (Sidebar) avec accordéon de filtres avancés (Période, Sexe, Classe d'âge, Gestionnaire, Translocation, Programmation GPS, Qualité GPS, Filtre spatial)
- Menu déroulant personnalisé pour la sélection des individus avec chargement dynamique via l'API
- Nouvelles icônes pour la navigation principale (Carte, Individus, Rapports)
- Script de basculement (toggle) pour l'affichage/masquage de la sidebar

### Fixed
- Alignement vertical des éléments entre la bande blanche et la bande verte

### Changed
- Refonte visuelle du header selon la maquette finale (icons, typographie Bebas Neue)
- Amélioration de la navigation : liens centrés avec icônes
- Préparation de la gestion des rôles : masquage par défaut du bouton "+ Ajouter" et de la session admin (display:none pour pilotage via JWT)
- Optimisation du bandeau vert : image bouquetin (bqt_header.png) redimensionnée et contenue, filtres rapides avec style semi-transparent blanc
- Mise à jour des couleurs et espacements pour une meilleure cohérence "nature/faune"

## [0.3.0] - 2026-04-30

### Added
- Captures de tests API Postman et carte OpenLayers (docs/conception/)
- Maquettes prototype interface d'accueil (en attente validation PNP)


### Changed
- Onglet "Positions GPS" renommé "Données"
- Onglet "Taxons observés" renommé "Individus observés"
- "Secteur" remplacé par "Population" (champ réel : ani_pop_rattach)
- Boutons pill (border-radius 999px) pour modes carte
- Couleur principale : brun → vert #2D6A4F
- Header : logo PNP réel + bande verte avec filtres rapides Individu et Saison
- Navigation : suppression Capteurs, Paramètres, Aide
- Déplacement "+ Ajouter" dans la navigation principale

---

## [0.2.0] - 2026-04-29

### Added
- Header double bande : navigation blanc + bandeau vert "Plateforme de suivi des bouquetins"
- Filtres rapides (Individu + Saison) dans la bande verte
- Page de connexion JWT (login/mot de passe)
- Mode DEV_MODE dans app.js (connexion automatique sans formulaire)
- Prototype maquette

### Changed
- Arborescence projet complète initialisée
- config.js retiré du dépôt Git (.gitignore)
- postgrest.conf retiré du dépôt Git (.gitignore)

---

## [0.1.0] - 2026-04-24

### Added
- Structure initiale du projet (frontend / backend / tests / docs)
- Test carte OpenLayers avec vraies données GPS (test_map.html)
- Authentification JWT via PostgREST /rpc/login
- Conversion coordonnées EPSG:2154 → WGS84 via proj4js
- Affichage points GPS sur fond OSM
- Popup au clic (nom, date, altitude, température, DOP)
- Premier commit GitHub
