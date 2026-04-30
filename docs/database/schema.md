# Database Schema - bouquetin

PostgreSQL / PostGIS - Schema `bouquetin`

---

## Tables principales

| Table | Description |
|---|---|
| `t_animal` | Informations descriptives des bouquetins suivis |
| `t_capteur` | Caractéristiques des capteurs GPS/VHF |
| `cor_animal_capteur` | Association animal ↔ capteur sur une période |
| `t_localisation` | Positions GPS (alimentation automatique via scripts) |
| `t_capture_relache` | Historique des opérations de capture et relâché |
| `bib_programmation` | Programmations d'acquisition des capteurs |
| `bib_fix_status` | Référentiel des types de signal GPS |

---

## Vues principales

| Vue | Description |
|---|---|
| `v_localisation` | Vue centrale : jointure animal + capteur + positions |
| `v_animal_last_loc` | Dernière position connue par animal |
| `v_periode_animal_suivi` | Synthèse par animal : période, durée, nb positions |

---

## Rôles

| Rôle | Identifiant | Droits |
|---|---|---|
| Lecture | `pnp_bqt_reader` | SELECT sur toutes les vues et tables |
| Écriture | `pnp_bqt_writer` | SELECT + INSERT + UPDATE sur les tables |

---

## Scripts de synchronisation

- `lotek2db` - colliers Lotek → [github.com/PNPyrenees/lotek_data_sync](https://github.com/PNPyrenees/lotek_data_sync)
- `vectronic2db` - colliers VecTronic → [github.com/PNPyrenees/vectronic2db](https://github.com/PNPyrenees/vectronic2db)
