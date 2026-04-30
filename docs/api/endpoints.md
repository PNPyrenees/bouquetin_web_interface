# API Endpoints - PostgREST

Base URL : `https://your-postgrest-api.fr`

---

## Animaux

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/t_animal?select=ani_id,ani_nom&order=ani_nom` | Liste des animaux (dropdown) |
| GET | `/t_animal?ani_id=eq.{id}` | Fiche d'un animal |
| POST | `/t_animal` | Créer un animal *(writer uniquement)* |

---

## Localisations

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/v_localisation` | Toutes les positions |
| GET | `/v_localisation?ani_id=eq.{id}` | Positions d'un animal |
| GET | `/v_localisation?loc_datetime_utc=gte.{date}` | Depuis une date |
| GET | `/v_localisation?loc_anomalie=is.null` | Données valides uniquement |
| GET | `/v_localisation?limit=100&offset=0` | Pagination |
| GET | `/v_localisation?order=loc_datetime_utc.desc` | Tri par date décroissante |
| GET | `/v_animal_last_loc` | Dernière position par animal |

---

## Rapports

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/v_periode_animal_suivi` | Synthèse par animal |

---

## Capteurs

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/t_capteur` | Liste des capteurs |
| GET | `/cor_animal_capteur?ani_id=eq.{id}` | Capteurs d'un animal |
| POST | `/t_capteur` | Créer un capteur *(writer uniquement)* |

---

## Captures / Relâchés

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/t_capture_relache?ani_id=eq.{id}` | Historique captures d'un animal |
