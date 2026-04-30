# Conception

Ce dossier contient les documents de conception et les captures de tests du projet.

---

## Maquettes prototype (En attente validation)


- `Prototp_maquette_01_interface_principale.png` - Interface principale : carte, filtres gauche, trajectoire GPS avec gradient, header double bande

- `Prototp_maquette_02_panneau_donnees.png` - Panneau attributaire onglet Données : tableau avec 9 colonnes (Individu, Population, Date/Heure locale, Altitude, Température, DOP, Nb satellites, Pos. aberrante, Constructeur)

- `maquette_03_panneau_individus.png` - Panneau attributaire onglet Individus observés : liste des individus avec Nom, Sexe, Population, Gestionnaire, Nb positions, Première/Dernière obs.

- `Prototp_Barre_filtre_01 et 02.png`

---

## Captures de tests API

- `test_01_auth_postman.png` - Test authentification JWT via Postman (POST /rpc/login - 200 OK)

- `test_02_data_postman.png` - Test récupération données GPS via Postman (GET /v_localisation - 200 OK, 7.38 KB)

- `test_03_carte_openlayers.png` - Affichage des points GPS sur carte OpenLayers (vraies données, secteurs PNP et PNRPA)

---

## Documents

- `PNP_SIG_Documentation.pdf` - Documentation technique complète (architecture, stack, API)