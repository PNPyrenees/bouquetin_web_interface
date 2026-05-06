# API Endpoints - PostgREST

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
*   **Paramètres** : `select=ani_id,ani_nom,ani_sexe,ani_gestionnaire&order=ani_nom`

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

---

## Matériel & Rapports

### **Liste des Capteurs**
*   **Description** : Inventaire du parc de capteurs (GPS/VHF).
*   **Endpoint** : `GET /t_capteur`

### **Synthèse par Animal**
*   **Description** : Rapport de synthèse des périodes de suivi.
*   **Endpoint** : `GET /v_periode_animal_suivi`
