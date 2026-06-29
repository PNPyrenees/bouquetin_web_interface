# API Endpoints - PostgREST

### Enrichissement côté frontend
Les vues `v_animal_last_loc` et les résultats de `fetchLastLocationsInactifs()` 
ne contiennent pas toujours `ani_sexe`, `ani_gestionnaire` et `ani_pop_rattach`.

La fonction `enrichirLocations()` dans app.js complète ces champs depuis le 
tableau `animals` chargé en mémoire via `fetchAnimals()` :

```javascript
function enrichirLocations(locations) {
  return locations.map(loc => {
    const ani = animals.find(a => String(a.ani_id) === String(loc.ani_id));
    return {
      ...loc,
      ani_sexe: loc.ani_sexe || ani?.ani_sexe || null,
      ani_gestionnaire: loc.ani_gestionnaire || ani?.ani_gestionnaire || null,
      ani_pop_rattach: loc.ani_pop_rattach || ani?.ani_pop_rattach || null
    };
  });
}
```

**Appeler systématiquement avant tout rendu sur la carte.**

### Filtre Population - nouveau paramètre API
GET /v_localisation?ani_pop_rattach=eq.Cauterets
GET /v_localisation?ani_pop_rattach=eq.Cagateille

Valeurs disponibles : Aspe, Aure, Beas, Cagateille, Cauterets, Gedre, 
Ossese, PNRPA_Massat, Soulcem

### Mode Positions avec période - dernière position par animal
Une requête par animal sélectionné via `Promise.all()` :
```
GET /v_localisation?ani_id=eq.{id}&geom=not.is.null&loc_datetime_local=gte.{date_from}&loc_datetime_local=lte.{date_to}&loc_anomalie=not.is.true&loc_outlier=is.null&order=loc_datetime_local.desc&limit=1
```
Utilisé par `fetchLastLocationsParPeriode()` - renvoie une position par individu sur la plage sélectionnée.

### Filtrage de la liste d'individus par période - IDs distincts
Une seule requête pour récupérer les `ani_id` distincts ayant des données sur une période :
```
GET /v_localisation?select=ani_id&geom=not.is.null&loc_anomalie=not.is.true&loc_outlier=is.null&loc_datetime_local=gte.{date_from}&loc_datetime_local=lte.{date_to}
```
Header supplémentaire : `Prefer: count=none`  
Utilisé par `fetchAnimalIdsParPeriode()` - permet de masquer dans la liste les individus sans données sur la période choisie sans recharger la carte.  
Filtres qualité appliqués par défaut (`loc_anomalie=not.is.true&loc_outlier=is.null`), retirés si `include_outliers: true` est passé dans les filtres.

### Programmations GPS - association animal ↔ programme
```
GET /cor_animal_capteur?select=ani_id,prog_id,cor_date_debut&prog_id=not.is.null&order=cor_date_debut.desc
```
Utilisé par `fetchProgrammations()` - construit une `Map(ani_id → prog_id)` pour le filtre "Programmation GPS" dans la sidebar.  
Valeurs `prog_id` : 1 (12 locs/j 180s), 2 (24 locs/j 70s), 3 (4 locs/j 90s), 4 (12 locs/j 120s), 5 (6 locs/j 90s), 6 (6 locs/j 90s)

### Mode Trajectoire - logique des requêtes

**Sans période :**
Une requête par individu sélectionné via Promise.all() :
GET /v_localisation?ani_id=eq.{id}&order=loc_datetime_utc.desc&limit=50

**Avec période :**
Une seule requête pour tous les individus :
GET /v_localisation?ani_id=in.(1,2,3)&loc_datetime_utc=gte.{date_from}&loc_datetime_utc=lte.{date_to}&limit=999999

---

**Base URL** : `https://your-postgrest-api.fr`  
**Header Requis** : `Accept-Profile: bouquetin` (à inclure dans toutes les requêtes)

---

## Authentification

### **Connexion Utilisateur**
*   **Action** : Récupérer le jeton JWT (Bearer Token)
*   **Méthode** : `POST`
*   **Endpoint** : `/rpc/login`
*   **Corps (JSON)** : `{ "username": "...", "password": "..." }`

---

## Gestion des Animaux (Individus)

### **Liste des Individus**
*   **Description** : Récupère la liste complète des bouquetins triée par nom.
*   **Méthode** : `GET`
*   **Endpoint** : `/t_animal`
*   **Paramètres** : `select=ani_id,ani_nom,ani_sexe,ani_gestionnaire,ani_pop_rattach&order=ani_nom`

### **Fiche Individu**
*   **Description** : Récupère les données d'un individu spécifique par son ID.
*   **Méthode** : `GET`
*   **Endpoint** : `/t_animal?ani_id=eq.{id}`

---

## Localisations & Tracking

## fetchAllLastLocations()

Remplace `fetchLastLocations()` + `fetchLastLocationsInactifs()` depuis la version 0.14.0.
GET /v_animal_last_loc?geom=not.is.null&loc_anomalie=not.is.true

Retourne la dernière position de tous les animaux ayant un collier associé (actifs ET inactifs).
La distinction actif/inactif se fait côté JS via `cor_date_fin === null`.

Filtres optionnels supportés :
- `ani_sexe=eq.{valeur}`
- `ani_gestionnaire=eq.{valeur}`  
- `ani_pop_rattach=eq.{valeur}`
- `loc_anomalie=not.is.true` retiré si `include_outliers: true`

### Prérequis serveur
- `v_animal_last_loc` sans `AND cor.cor_date_fin IS NULL`
- `cor_date_fin` présent dans le SELECT de la vue
- Index `idx_localisation_date` et `idx_localisation_capt_id` sur `t_localisation`

### **Colliers Actifs (Temps Réel)**
*   **Description** : Récupère la dernière position connue pour chaque animal ayant un collier actif.
*   **Méthode** : `GET`
*   **Endpoint** : `/v_animal_last_loc?geom=not.is.null`

### **Colliers Inactifs (Dernière position)**
*   **Description** : Récupère la toute dernière position archivée pour un animal inactif.
*   **Méthode** : `GET`
*   **Endpoint** : `/v_localisation?ani_id=eq.{id}&order=loc_datetime_utc.desc&limit=1`

### **Historique Complet**
*   **Description** : Récupère l'historique des positions avec filtrage temporel.
*   **Méthode** : `GET`
*   **Endpoint** : `/v_localisation?loc_datetime_utc=gte.{ISO_DATE}`

---

## RPC — get_localisation_with_json_filter

**Endpoint** : `POST /rpc/get_localisation_with_json_filter`
**Headers** : `Content-Profile: bouquetin`, `Content-Type: application/json`
**Fonction JS** : `fetchLocalisationsRPC(token, filters, onBatch)`

### Paramètres (body JSON — clé `filters`)

| Paramètre | Type | Description |
|---|---|---|
| `ani_id` | integer[] | Liste d'identifiants animaux |
| `date_min` | string | Date minimum ISO (YYYY-MM-DD) |
| `date_max` | string | Date maximum ISO (YYYY-MM-DD) |
| `annees` | integer[] | Années exactes |
| `periode_min` | string | Début saison format MM-JJ (ex: 06-01) |
| `periode_max` | string | Fin saison format MM-JJ (ex: 08-31) |
| `ani_sexe` | string | Sexe : M ou F |
| `ani_gestionnaire` | string[] | Gestionnaire(s) : PNP, PNRPA |
| `ani_pop_rattach` | string[] | Population(s) de rattachement |
| `prog_id` | integer[] | Identifiant(s) de programmation GPS |
| `without_loc_outlier` | boolean | Exclure les outliers (défaut : true) |
| `ani_is_followed` | boolean | Uniquement animaux en cours de suivi |
| `age_capture_min` | integer | Age minimum à la capture |
| `age_capture_max` | integer | Age maximum à la capture |
| `was_translocated` | boolean | Animaux transloques uniquement |
| `geom` | GeoJSON | Polygone de filtre spatial |
| `geom_src` | integer | SRID de la géométrie (défaut : 4326) |
| `limit_par_animal` | integer | N dernières positions par animal |
| `limit` | integer | Limite globale (défaut : 10000) |
| `offset` | integer | Offset pour pagination |

### Champs retournés

`loc_id`, `ani_id`, `ani_nom`, `ani_sexe`, `ani_pop_rattach`, `ani_gestionnaire`,
`loc_altitude_capteur`, `loc_temperature_capteur`, `loc_datetime_local`, `geom`, `loc_outlier`, `loc_anomalie`

### Notes
- Pagination par batches de 10 000 gérée automatiquement par `fetchLocalisationsRPC()`
- Saison à cheval (ex: Hiver nov→fev) : `periode_min > periode_max` détecté automatiquement

---

## Paramètres de Filtrage Recommandés

Appliquez ces filtres sur `/v_localisation` ou `/v_animal_last_loc` :

*   **Données valides** : `loc_anomalie=not.is.true` (Exclut les erreurs `true`, garde `false` et `NULL`)
*   **Sans Outliers** : `loc_outlier=is.null` (Exclut les points aberrants)
*   **Géo-référencement** : `geom=not.is.null` (Indispensable pour l'affichage carte)
*   **Sexe** : `ani_sexe=eq.M` ou `ani_sexe=eq.F`
*   **Gestionnaire** : `ani_gestionnaire=eq.PNP` ou `ani_gestionnaire=eq.PNRPA`
*   **Population** : `ani_pop_rattach=eq.Aspe` (Sélection unique)

---

## Matériel & Rapports

### **Liste des Capteurs**
*   **Description** : Inventaire du parc de capteurs (GPS/VHF).
*   **Endpoint** : `GET /t_capteur`

### **Synthèse par Animal**
*   **Description** : Rapport de synthèse des périodes de suivi.
*   **Endpoint** : `GET /v_periode_animal_suivi`
