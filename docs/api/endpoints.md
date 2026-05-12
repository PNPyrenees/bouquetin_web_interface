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
