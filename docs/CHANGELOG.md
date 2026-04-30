# CHANGELOG

## [0.3.0] — 2026-04-30

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

## [0.2.0] — 2026-04-29

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

## [0.1.0] — 2026-04-24

### Added
- Structure initiale du projet (frontend / backend / tests / docs)
- Test carte OpenLayers avec vraies données GPS (test_map.html)
- Authentification JWT via PostgREST /rpc/login
- Conversion coordonnées EPSG:2154 → WGS84 via proj4js
- Affichage points GPS sur fond OSM
- Popup au clic (nom, date, altitude, température, DOP)
- Premier commit GitHub
