# bouquetin_web_interface

Interface web pour la consultation des données bancarisées dans la base de données de localisation GPS des bouquetins ibériques du Parc National des Pyrénées.

## Description

Cette interface permet aux agents du Parc National des Pyrénées de :
- Visualiser les positions GPS des bouquetins sur une carte (OpenLayers)
- Filtrer les données par individu, période, secteur géographique et qualité GPS
- Consulter les données attributaires dans un panneau interactif
- Saisir de nouveaux individus et capteurs
- Exporter les données filtrées (CSV, GeoJSON, PDF)

## Stack technique

- **Frontend** : HTML5 / CSS3 / JavaScript ES6+
- **Cartographie** : OpenLayers
- **API** : PostgREST (base PostgreSQL/PostGIS)
- **Base de données** : PostgreSQL + PostGIS - schema `bouquetin`

## Structure du projet

```
bouquetin_web_interface/
├── frontend/        # Interface utilisateur
├── backend/         # Configuration PostgREST et SQL
├── tests/           # Tests API et UI
└── docs/            # Documentation
```

## Installation

```bash
git clone https://github.com/PNPyrenees/bouquetin_web_interface
cd bouquetin_web_interface
# Ouvrir frontend/index.html dans un navigateur
```

## Configuration

Modifier l'URL de l'API dans `frontend/assets/js/config.js` :

```js
export const API_URL = 'https://votre-api-postgrest.fr';
```

