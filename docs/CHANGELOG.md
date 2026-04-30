# CHANGELOG

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
- Documentation technique complète (README.md, docs/api/endpoints.md)
- PDF documentation architecture et technologies (PNP_SIG_Documentation V1.pdf) en attente
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
