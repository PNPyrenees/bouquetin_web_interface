# CHANGELOG

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
- Carte coupée ou mal dimensionnée sur petit écran — `ResizeObserver` ajouté dans `map.js` pour appeler `map.updateSize()` à chaque redimensionnement du conteneur `#map`

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
