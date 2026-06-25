# CHANGELOG

## [0.39.0] - 2026-06-25

### Ajouts
- fetchAniCalendrier() - cache leger ani_id vers Set(mois_jour) pour filtrage instantane liste individus
- fetchAniIdsAvecGeom() - construit idsAvecGeom depuis v_localisation au lieu de v_animal_last_loc
- Filtre saisonnier loc_mois_jour_local dans fetchAnimalIdsParPeriode() - coherence avec fetchLocations()
- Trajectoire outliers - filtre saisonnier applique aussi sur la branche include_outliers
- Clic table vers carte - recentrage sans zoom (suppression parametre zoom)
- Clic carte vers table - scroll vers la ligne exacte (ani_id + datetime)
- Sous-filtrage visuel - filtres colonnes tableau masquent les points carte en temps reel
- filtrerPointsParVisibilite() exportee depuis map.js
- Export CSV - bouton dans toolbar panneau, requete dedicee tous champs sauf geom, separateur point-virgule, BOM UTF-8
- mettreAJourListeParDate() synchrone pour saison sans annee - zero requete API grace au cache calendrier

### Corrections
- RangeError Maximum call stack exceeded - Math.min/max spread remplace par reduce dans preparerCouleurs()
- Animaux inactifs avec positions valides desormais visibles dans la liste (idsAvecGeom depuis v_localisation)
- Bergon et animaux sans positions dans la saison selectionnee masques immediatement sans clic Appliquer
- fetchAnimalIdsParPeriode() filtre desormais par loc_mois_jour_local comme fetchLocations()
- Double clic checkSuivis corrige - mise a jour synchrone immediate

## [0.38.0] - 2026-06-24

### Ajouts
- Filtre Classe d age a la capture - Option A (liste fixe) et Option B (dynamique selon sexe)
- CLASSES_AGE dans config.js - classes configurables par sexe (F/M/TOUS)
- calculerAgeCapture() et getClasseAge() dans filters.js - calcul depuis ani_date_relache avec regle 1er mai
- ani_date_relache ajoute au select= de fetchAnimals() dans api.js
- peuplerSelectClasseAge() dans app.js - repeuple dynamiquement le select selon le sexe selectionne
- Liste TOUS avec Eterle et Eterlou comme entrees separees

### Corrections
- Eterle et Eterlou separes dans la liste TOUS - matching exact avec dataset.classe
- Suppression du suffixe (F)/(M) dans les labels du select
- config.example.js mis a jour avec CLASSES_AGE, et IGN_API_KEY remplace par un placeholder

## [0.37.0] - 2026-06-23

### Modifications
- Scroll automatique en haut du tableau lors d un changement de page
- Suppression de tous les delais d ouverture et fermeture des panneaux sidebar gauche et droite
- Ouverture et fermeture instantanees des deux panneaux
- Suppression des transitions CSS sur sidebar, sidebar-right et mapScreen
- Suppression des setTimeout lies aux transitions de panneau dans app.js

## [0.36.0] - 2026-06-23

### Ajouts
- Barre d outils verticale unifiee sur la carte - zoom, recentrer, positions, trajectoire, filtre spatial
- Bouton toggle sidebar gauche integre dans la barre d outils (remplace l ancien toggle)
- Icones SVG custom : location-dot, route, draw-polygon, crosshairs
- Fonds de carte externalises dans config.js via BASEMAPS_CONFIG
- Nouveaux fonds : Satellite ESRI, Topo ESRI, Photos aeriennes IGN, Carte topo IGN, Carte du relief IGN, IGN Espagne
- Boutons zoom custom HTML remplacant les controles OpenLayers natifs
- Bouton recentrer - recentre sur l emprise des donnees GPS

### Modifications
- Ancien toggle sidebar masque - remplace par le bouton dans la toolbar
- Sidebar collapsed - border-right supprime pour eviter le trait residuel
- Boutons Positions/Trajectoire deplaces de la barre du bas vers la toolbar verticale
- Bouton Dessiner un perimetre retire de la sidebar
- initToolbarCarte() - nouvelle fonction dediee aux listeners toolbar
- Toggle sidebar droite (panneau attributaire) restyle - pleine hauteur, icone ronde

### Corrections
- Trait blanc residuel a la fermeture de la sidebar supprime

## [0.35.0] - 2026-06-23

### Ajouts
- Clic sur une ligne du tableau Localisations recentre la carte sur le point GPS correspondant
- Ligne cliquee mise en surbrillance verte dans le tableau

### Modifications
- Onglet Donnees renomme en Localisations
- Onglet Individus observes masque temporairement en attendant validation
- Colonnes par defaut Localisations : Individu, Date de localisation, Population, Gestionnaire
- Colonnes masquees par defaut : ID, Sexe, Altitude, Temp., DOP
- Format date de localisation : JJ/MM/AAAA HH:MM au lieu du format ISO
- ani_nom, ani_pop_rattach, ani_sexe, ani_gestionnaire ajoutes a colonnesDisponibles
- Label 'Date de localisation' applique de facon coherente via setLabelDatetime() dans app.js et filters.js, remplace l ancien 'Derniere position'

## [0.34.0] - 2026-06-20

### Ajouts
- Palette Glasbey 32 pour les couleurs individus - maximise la distance perceptuelle entre toutes les couleurs
- Contours variables (blanc/noir/jaune/cyan) pour differencier les individus avec couleurs proches
- Legende dynamique en mode Individu - liste scrollable des individus affiches avec pastille coloree et contour
- getCouleursIndividus(), getIndicesIndividus(), getContourParIndex() exportes depuis map.js

### Modifications
- Fleches directionnelles trajectoire - seuil distance reduit de 800 a 100 pour plus de fleches visibles
- Legende mode Position - section legendeMode masquee (Point de depart, Direction, Derniere position redondants)
- Legende mode Trajectoire - Derniere position masquee, Point de depart/Direction affiches
- Correction timing legende Position/Trajectoire - mettreAJourLegende() accepte modeForce en parametre
- Taille des points mode Position reduite a 6

### Corrections
- Legende ne restait plus bloquee sur le mode precedent lors du changement Position/Trajectoire

## [0.33.0] - 2026-06-19

### Ajouts
- Badge dynamique pour le filtre N positions, mis a jour uniquement apres un Appliquer reussi (pas immediatement sur les interactions UI)
- mettreAJourBadgeNPositions() exportee depuis app.js et appelee dans applyFilters() apres chargement reussi
- Compteur d individus distincts affiche dans l onglet Individus observes, a cote du selecteur de taille de page

### Corrections
- Compte exact saisonnalite replique en mode Trajectoire - alerte volumetrique affiche le compte reel apres filtre saison au lieu du compte brut multi-annees
- Architecture a 4 chemins (A+C/D/B) desormais coherente entre mode Positions et mode Trajectoire pour le calcul du volume de donnees

## [0.32.0] - 2026-06-18

### Ajouts
- Synchronisation automatique des individus selectionnes manuellement avec la liste filtree - decochage automatique si un individu sort des resultats du filtre
- Synchronisation badge selecteur pour Sexe/Gestionnaire/Population/Classe d age/Programmation GPS - suppression du badge reinitialise le select TomSelect
- Badge dynamique pour le filtre N positions - synchronise sur l etat DOM immediat
- Badge absent en mode Toutes les positions
- Suppression du badge N positions bascule automatiquement sur Toutes les positions
- Badge N positions mis a jour a l initialisation, lors des changements de mode Positions/Trajectoire, et lors de la reinitialisation

### Modifications
- reinitialiserTousLesFiltres() corrige l ordre d appel de adapterSelectNPourMode apres le reset des variables N
- cocheAuto remis a false pour tous les individus lors de la reinitialisation
- setActiveIds() appele lors de la reinitialisation pour rafraichir les animaux actifs
- Recentrage automatique de la carte sur l emprise des donnees apres Reinitialiser

### Corrections
- Alerte volumetrique pour Saisonnalite affiche desormais le compte reel apres filtre saison au lieu du compte brut sur la plage de dates large
- Compte exact calcule via somme de COUNT par annee - aucun telechargement massif avant affichage de l alerte
- Coherence verifiee avec la base de donnees pour le filtre Hiver multi-annees

## [0.31.0] - 2026-06-18

### Ajouts
- Architecture 4 chemins dans applyFilters() branche periodes pour respecter N selon le type de saisonnalite
- Chemin A+C : periode exacte ou saison+annee precise - requete API directe par animal avec limit=N sans alerte volume
- Chemin D : saison sans annee (saisonnalite_all) + N - requetes par animal x par annee avec limit=N puis fusion et slice
- Chemin B : Toutes les positions ou cas residuel - count + alerte volume + filtre JS post-fetch
- Meme architecture 4 chemins portee au mode Trajectoire (saisonnaliteExacteTraj, saisonnaliteAllTraj)
- SEUIL_ALERTE_VOLUME = 15000 exporte depuis config.js et importe dans filters.js

### Modifications
- _dernierNPositions et _dernierNTrajectoire mis a jour uniquement apres un applyFilters() reussi via setDernierNPositions/setDernierNTrajectoire
- Bouton Appliquer toujours actif - logique de verrouillage geree exclusivement par lockSidebar/unlockSidebar
- Suppression du filtre JS redondant hasSaisonnaliteAll apres le bloc if/else - logique integree dans Chemin D et Chemin B

### Corrections
- N ignore apres auto-switch vers Toutes quand l utilisateur saisit une valeur sans cliquer nModeLimite - inputN.input commute desormais le DOM radio vers Limite
- Label derniere/dernieres positions efface lors de l auto-switch - mettreAJourLabelN() remplace labelN.textContent = ''
- Alerte volume declenchee a tort pour Annee+Saison+N - Chemin A+C court-circuite le count
- Telechargement massif pour saisonnalite sans annee + N - Chemin D fait des requetes ciblees par annee

## [0.30.0] - 2026-06-18

### Ajouts
- Selecteur N positions remplace par deux radios Toutes les positions / Limiter a N
- Champ numerique libre pour N - plus de liste fixe predefinie
- Flag _nModeManuel pour proteger le choix utilisateur contre les re-ecrasements async
- Flag _nEstToutes pour memoriser l etat du mode positions
- N respecte dans tous les cas de filtrage - API recoit directement limit=N

### Modifications
- Suppression du cochage automatique des individus apres applyFilters
- Suppression des badges individuels automatiques apres applyFilters
- Bouton Tout cocher masque
- Individus decoches a l initialisation - seul le filtre Individus en cours de suivi est actif
- Passage automatique a Toutes les positions lors de l ajout d un filtre - valeur par defaut non verrouillee
- Selecteur multi-annees TomSelect avec chips et annees grisees
- Option Toutes les annees dans le selecteur
- Selecteur N unifie avec valeurs par defaut 5 Positions et 25 Trajectoire

### Corrections
- inputN.disabled retire de toutesPositions dans applyFilters - lockSidebar ne force plus Toutes
- Branche filtreAttributaireActif respecte N via fetchLocations par animal avec limit=N
- Branche periodes respecte N via fetchLocations par animal avec date_from/date_to/limit=N
- Saison sans annee continue a utiliser le chemin complet avec filtre JS mois/jour
- Badge annees affiche les vraies valeurs et non les indices TomSelect
- Decocher un individu en selection manuelle ne decoche plus les autres
- Correction clearTrajectoire manquant en mode Positions

## [0.29.0] - 2026-06-17

### Ajouts
- Refonte filtres temporels - bloc fusionne Periode et Saisonnalite mutuellement exclusifs
- Filtre Periode avec champs Du/Au JJ/MM/AAAA et calendrier Flatpickr
- Filtre Saisonnalite avec selecteur annee, radio buttons saisons et champs Du/Au JJ/MM
- Saisons configurables depuis SAISONS_CONFIG dans config.js
- Badges independants Du/Au pour le filtre Periode
- Badge Saisonnalite au format Du JJ/MM au JJ/MM/AAAA
- Exclusivite automatique Periode/Saisonnalite via gererExclusiviteTemporel()
- Flag temporelInitialized pour eviter les listeners dupliques a la reconnexion
- Filtrage JS mois/jour pour saisonnalite_all en mode Trajectoire

### Modifications
- selectAnnee remplace selectAnnees - selection annee unique pour la Saisonnalite
- Boutons saison remplaces par radio buttons a selection unique
- Saisons disposees en grille 2x2 pour reduire la hauteur
- Champs Du/Au cote a cote via date-row
- autocomplete=off sur les 4 champs de date
- Saisie manuelle robuste - reformatage delegue au blur via Flatpickr

### Refonte visuelle sidebar
- Accordeons style institutionnel SIG - fond #e8efec, titres vert fonce uppercase
- Section Filtres temporels visuellement mise en avant
- Motif animalier opacity 0.02
- Bouton Appliquer vert primaire #2D6A4F
- Symbologie et footer fond #f3f6f5 coherent avec les accordeons
- Bordures champs accentuees #9ab5ac pour meilleure lisibilite
- Suppression des border-left residuels

### Ajouts
- Selecteur N positions unifie 1/5/10/15/20/25/50/Toutes pour les deux modes
- Variables _dernierNPositions et _dernierNTrajectoire pour memoriser les valeurs par mode
- Passage Positions Toutes vers Trajectoire conserve la valeur Toutes
- Retour mode Positions restaure la derniere valeur choisie
- Selecteur annees multi-valeurs TomSelect avec chips et annees grisees
- Option Toutes les annees dans le selecteur apres 2014
- Flag _selectionManuelleActive pour gestion independante des coches individus

### Corrections
- Badge annees affiche les vraies valeurs et non les indices TomSelect
- Annees deja selectionnees grisees sans fond colore dans le dropdown
- Decocher un individu en selection manuelle ne decoche plus les autres
- Suppression du soulignement sur le bouton Reinitialiser
- Separateur badge saisonnalite remplace par tiret simple
- Suppression autocomplete navigateur masquant le calendrier Flatpickr
- Badges Periode independants - supprimer Du ne supprime plus Au et vice versa
- Vidage manuel d'un champ ne supprime plus le badge de l'autre champ

## [0.28.0] - 2026-06-16

### Ajouts
- Selecteur N positions avec options differentes selon le mode - Positions 1/5/10/15/20/Toutes et Trajectoire 20/25/50/Toutes
- Valeur par defaut N=5 en mode Positions et N=25 en mode Trajectoire
- Flags independants modifieEnPositions et modifieEnTrajectoire pour memoriser les valeurs par mode
- Chargement initial avec N=5 positions par animal suivi via fetchNDernieresLocalisations
- Parametre nOverride dans applyFilters pour forcer la valeur N lors du changement de mode

### Corrections
- Deconnexion affiche le login immediatement sans avoir a actualiser la page
- Annulation de la modale volume conserve le mode precedent et son selecteur
- Passage entre modes Positions et Trajectoire utilise le N cible du nouveau mode via nOverride
- Deuxieme clic sur Appliquer en mode Positions sans filtre conserve la valeur N selectionnee
- Coches automatiques cocheAuto=true exclues de filtreAttributaireActif pour eviter bascule vers historique complet
- Recentrage sans zoom au clic sur point GPS et table attributaire
- forEachFeatureAtPixel utilise layerFilter pour cibler gpsLayer directement
- Legende refactorisee - structure HTML dans index.html couleurs dans main.css logique dans app.js
- clearTrajectoire ajoute en mode Positions pour effacer les traits residuels
- Ajout options selecteur N Positions et Trajectoire dans index.html

## [0.27.0] - 2026-06-12

### Ajouts
- Populations et gestionnaires chargés dynamiquement depuis t_animal (fetchPopulations, fetchGestionnaires) - plus de valeurs codées en dur dans index.html
- Programmations GPS chargées dynamiquement depuis bib_programmation (fetchBibliothequeProgrammations) - libellés calculés depuis prog_frequence et prog_duree_acquisition
- fetchProgrammations() associe à chaque animal sa programmation actuelle (cor_date_debut le plus récent)
- Chargement initial limité aux animaux en cours de suivi (cor_date_fin IS NULL) - carte et liste filtrées dès l'ouverture
- Checkbox Individus en cours de suivi cochée par défaut avec son badge au chargement
- Sélecteur N dernières localisations sous la checkbox - valeurs 1/5/10/15/20/Toutes
- Verrouillage automatique du sélecteur sur Toutes dès qu'un filtre ou individu est actif
- Mémorisation de la valeur choisie - restaurée quand les filtres sont retirés
- Coche automatique des individus affichés après application des filtres avec badges
- Mécanique cocheAuto=init sans badge et cocheAuto=true avec badge
- Cochage automatique des animaux suivis sans badge individuel à l'initialisation
- Décocher un individu décoche tous les autres pour repartir de zéro
- decocherCochesAutomatiques appelé à chaque changement de filtre
- Bouton Appliquer grisé au chargement et désactivé tant qu'aucune action manuelle n'est effectuée
- Annulation modale volume restaure le mode précédent visuellement

### Modifications
- Modale volume de données simplifiée à deux boutons : Annuler / Afficher tout
- Seuil de déclenchement de l'avertissement relevé de 10 000 à 15 000 positions, basé sur une analyse de performance WebGLPoints (rendu fluide jusqu'à 100 000+ points, goulot réseau réel autour de 15-20k lignes JSON)
- Bouton Afficher tout charge réellement l'intégralité des résultats sans plafond fonctionnel - garde-fou serveur à 500 000 uniquement
- Texte de la modale enrichi - invite à affiner la recherche par date, saison, sexe, population ou individu
- Retrait du bouton intermédiaire Afficher les 10 000 dernières
- Uniformisation du mode Positions sans période (point 3.1) - dès qu'un ou plusieurs filtres attributaires sont actifs (sexe, gestionnaire, population, classe d'âge, programmation GPS, individu, suivis, qualité GPS), l'affichage bascule sur toutes les positions historiques correspondantes au lieu de la seule dernière position par animal
- Même mécanisme de comptage préalable et avertissement à 15 000 positions (modale Annuler/Afficher tout) appliqué à ce nouveau cas
- Garde-fou ajouté - si aucun individu ne correspond aux filtres actifs, affichage direct de 0 résultat sans requête de comptage
- Seul le cas sans aucun filtre actif conserve le comportement initial (dernière position par animal, ~51 lignes, sans avertissement)
- Validation croisée avec la base - filtre cumulé Sexe=Femelle + Programmation 12 locs/j (180s) + Année 2025 + Population Cauterets retourne 16 876 positions, cohérent entre frontend et base
- reinitialiserTousLesFiltres ramène exactement à l'état initial - checkbox suivis cochée, sélecteur N à 1, carte avec animaux suivis
- Mode Trajectoire harmonisé avec mode Positions - mêmes filtres, même logique, même système COUNT modal
- Retrait du blocage obligatoire d'un individu pour le mode Trajectoire
- Cohérence temporelle entre mode Positions et mode Trajectoire via getPeriodesActives
- Valeur par défaut N=20 en mode Trajectoire N=1 en mode Positions
- Passage Trajectoire vers Positions nettoie les coches auto et restaure l'état initial
- Retour mode Positions depuis Trajectoire sans modale volume
- Légende refactorisée - structure HTML dans index.html couleurs dans main.css logique dans app.js
- clearTrajectoire ajouté en mode Positions pour effacer les traits résiduels

### Investigation
- Validation du filtre Programmation GPS - chaîne base vers frontend cohérente (49 individus pour 12 locs/j 180s)
- Anomalie de données identifiée pour Arbizon (ani_id=558) - position aberrante datée 2068 avec geom NULL dans v_localisation, masque ses positions réelles dans v_animal_last_loc

### Corrections
- Clic sur un point GPS recentre sans changer le niveau de zoom actuel
- Clic sur une ligne de la table attributaire recentre sans changer le niveau de zoom
- forEachFeatureAtPixel utilise layerFilter pour cibler gpsLayer directement au lieu de verifier les attributs du feature

## [0.26.0] - 2026-06-11

### Corrections
- Guard mapInitialized ajouté - initMap() n'est plus appelée qu'une seule fois, la même instance ol.Map est réutilisée à chaque reconnexion
- Conflit de contexte WebGL au deuxième login résolu - points GPS de nouveau visibles après reconnexion
- Barre d'échelle ScaleLine ne s'accumule plus dans #scaleTarget à chaque reconnexion
- Options selectAnnee vidées avant d'être repeuplées - plus d'accumulation des années à la reconnexion
- Guards sidebarRightInitialized, sidebarBadgesInitialized, basemapInitialized, mapListenersInitialized ajoutés - listeners ne s'accumulent plus à chaque reconnexion
- listeIndividus vidé avant d'être repeuplé - plus de doublons d'individus à la reconnexion
- État DOM panneau attributaire remis à zéro à la déconnexion - classe visible, width, panel-open, icône toggle
- Carte nettoyée avant setCurrentToken(null) dans deconnecter() - plus de flash de l'ancienne session
- Suppression complète de DEV_MODE, DEV_PASSWORD, ROLES et config.local.js - login toujours via formulaire
- Filtres et interface remis à zéro à la déconnexion - nouvelle session propre
- Accordéons sidebar remis à zéro à la déconnexion - tous fermés sauf Période ouvert par défaut

## [0.25.0] - 2026-06-11

### Sécurité
- Mise à jour de la gestion des fichiers de configuration

### Nettoyage
- Modale volume de données déplacée de filters.js vers index.html - JS ne fait plus que remplir le compteur et gérer les clics
- Bloc filtreStatutCollier déplacé de app.js vers index.html - plus aucune création de DOM statique en JS
- label.innerHTML dans la boucle animals remplacé par createElement - élimine le risque XSS sur ani_nom
- badge.innerHTML dans ajouterBadge() remplacé par createElement/textContent
- showPopup() dans map.js réécrit avec createElement pour éliminer le risque XSS sur ani_nom et dateStr

## [0.24.0] - 2026-06-10

### Ajouts
- Écran de login production dans `index.html` — layout deux colonnes : image bouquetin ibérique (Cabra_montés_2.jpg) à gauche sur fond vert, formulaire à droite avec logos PNP et République Française
- Formulaire `#loginForm` avec champs `#username` / `#password`, message d'erreur `#loginError` et bouton "Se connecter"
- Protection contre les soumissions concurrentes du formulaire de connexion
- Guard `if (el.tomselect) return` dans la boucle TomSelect pour éviter la double initialisation

### Modifications
- L'application démarre en mode production avec authentification par formulaire
- `startApp()` masque `#loginScreen` en tout début d'exécution après authentification réussie
- Zoom initial dynamique dans `startApp()` — `getView().fit()` sur l'emprise réelle des données (padding 80px, maxZoom 13, délai 600 ms pour WebGL) avec fallback sur les Pyrénées si aucun point
- `#loginScreen` en `position: fixed; width: 100vw; height: 100vh; z-index: 99999; background: #2D6A4F` — couverture complète de la page pendant la phase de login

### Corrections
- Suppression du `<div id="loginScreen" style="display:none">` en double dans `index.html` qui faisait pointer `getElementById` vers le mauvais élément
- Couleur du titre `.login-card h2` corrigée — `#2D6A4F` → `#423d3c` (cohérent avec `.header-title`)
- Logo PNP corrigé — `logo_pnp.png` (inexistant) → `logo-parc.svg`
- Suppression de l'ancien bloc CSS login dans `map.css` (lignes 2-102) — `#loginScreen`, `.login-box`, `.login-logo`, `#loginError` — qui écrasait les styles de `main.css` et affichait l'ancienne image `Bouquetin+ibérique+_+Arnaud+Saguer.webp` en fond

## [0.23.0] - 2026-06-09

### Ajouts
- `fetchCountLocations` dans `api.js` — requête COUNT sans téléchargement de données via `Prefer: count=exact` et header `Content-Range`
- Popup d'avertissement volume de données dans `applyFilters` — se déclenche si COUNT > 10 000 positions, 3 boutons : Annuler / Afficher les 10 000 dernières / Afficher tout
- Migration OpenLayers 8.2.0 → 10.9.0 CDN

### Modifications
- Mode Positions avec filtre temporel : affiche désormais toutes les positions de la période (comme trajectoire sans traits) au lieu de la dernière position par animal
- Mode Positions sans filtre temporel : comportement inchangé — dernière position par animal via `fetchAllLastLocations`
- Changement de symbologie (sexe/gestionnaire/individu) : re-rendu des features existantes sans nouvelle requête API
- Migration `gpsLayer` de `ol.layer.Vector` vers `ol.layer.WebGLPoints` pour améliorer les performances de rendu avec de nombreux points
- Couleurs WebGL stockées comme 4 attributs scalaires séparés (`fillR`, `fillG`, `fillB`, `fillA`, `strokeR`, `strokeG`, `strokeB`, `strokeA`) pour compatibilité avec le pipeline attribute-buffer WebGL
- Désactivation de l'effet de grossissement au survol dans la table attributaire (`highlightPoint`) — trop coûteux avec de nombreux points

### Corrections
- `DEFAULT_LIMIT` dans `config.js` mis à 10 000
- Suppression des logs de debug dans `mettreAJourListeParDate`

## [0.22.0] - 2026-06-09

### Ajouts
- Fonction `getPeriodesActives()` exportée dans `filters.js` — source unique de vérité pour tous les filtres temporels (liste individus et carte)
- Variable globale `window._anneeOptions` stockée au chargement pour éviter la dépendance au DOM TomSelect
- Variable globale `window._saisonDatesModifiees` pour distinguer dates auto-remplies par saison et dates modifiées manuellement
- Filtre saison sans année dans `mettreAJourListeParDate` via `fetchAnimalIdsParPeriode` par année × saison en parallèle

### Modifications
- `applyFilters` mode Positions : utilise `fetchLastLocationsParPeriode` pour afficher la dernière position dans la période (année, année+saison)
- `applyFilters` mode Positions saison sans année : 13 requêtes parallèles `fetchLastLocationsParPeriode` par année × saison, fusion avec position la plus récente par animal
- `fetchLastLocationsParPeriode` dans `api.js` : refactorisée en une seule requête `ani_id=in.(...)` + `limit=999999` + déduplication JS au lieu de N requêtes une par animal
- `getPeriodesActives()` Cas 3 saison sans année : retourne une période large unique pour `mettreAJourListeParDate` via `fetchAnimalIdsParPeriode`
- `mettreAJourListeParDate` : bloc spécial saison sans année traité en dehors de `getPeriodesActives()` avec union par année × saison

### Corrections
- Liste individus cohérente avec la carte pour tous les cas : année seule, année+saison, saison seule
- Saison sans année : liste affiche ~177 animaux (animaux ayant eu une position en hiver sur toutes les années)
- `window._anneeOptions` résout le bug TomSelect qui vidait les `<option>` du DOM natif
- Arbizon (558) absent de la carte : géométrie null dans `v_animal_last_loc` + date aberrante 2068 → à corriger côté base par Ludovic
- Blanca (120) et Nat (140) absents : `loc_datetime_local` null dans `v_localisation` pour leurs positions 2025 → à corriger côté base par Ludovic

### Connu — à implémenter
- Popup d'avertissement si COUNT > 10 000 positions avant chargement
- Nouvelle logique mode Positions : toutes les positions (comme trajectoire sans traits) au lieu de dernière position par animal
- Vue PostgreSQL `v_last_loc_par_saison` avec `DISTINCT ON` à créer avec Ludovic pour optimiser les performances
- `fetchLastLocationsParPeriode` toujours lente pour saison sans année (13 × `limit=999999`) en attendant la vue

## [0.21.1] - 2026-06-08

### Corrections
- Refonte complète du filtrage temporel via fonction getPeriodesActives() partagée entre mettreAJourListeParDate et applyFilters
- Multi-saisons + année : union correcte des individus et positions par saison au lieu de la dernière saison seulement
- Liste individus et carte toujours cohérentes en nombre et en individus
- applyFilters mode Positions : utilise getPeriodesActives pour construire les périodes, fetchLastLocationsParPeriode par période puis fusion avec position la plus récente par animal

## [0.21.0] - 2026-06-06

### Ajouts
- Filtrage liste individus en temps réel à la sélection année seule via fetchAnimalIdsParPeriode
- Filtrage liste individus en temps réel à la sélection saison + année via union des plages API
- Filtrage liste individus en temps réel à la sélection saison sans année via union toutes années
- Filtre année seule sur la carte au clic Appliquer
- Mode Positions avec filtre temporel utilise fetchLastLocationsParPeriode pour afficher la dernière position dans la période au lieu de la dernière position absolue
- Mécanisme anti-requête-obsolète via _derniereRequeteId pour éviter les écrasements de liste

### Modifications
- applyFilters mode Positions : bascule automatique entre fetchAllLastLocations et fetchLastLocationsParPeriode selon les filtres actifs
- mettreAJourListeParDate refactorisé avec gestion année seule, saison+année, saison sans année, dates seules
- TomSelect onChange selectAnnee appelle directement mettreAJourListeParDate via setTimeout
- reinitialiserTousLesFiltres réécrite pour garantir un état initial complet

### Corrections
- Badge-modifie saison préserve le listener onClick via manipulation nœuds texte
- Restauration dates mémorisées quand on revient à une seule saison cochée
- Filtre saison cumulatif correct en mode Positions
- Réinitialisation TomSelect selectAnnee via setValue vide

### Connu — à corriger
- Saison sans année : liste individus correcte mais carte peut manquer certains animaux (fetchLastLocationsParPeriode incomplet sur toutes années)

## [0.20.0] - 2026-06-04

### Ajouts
- Selecteur d'annee partage entre Periode et Saison - pilote les deux filtres
- Memorisation des dates personnalisees par saison via datesSaisonModifiees
- Badge saison cliquable - affiche les dates dans les inputs au clic sans supprimer le badge
- Badge badge-modifie - couleur differenciee quand les dates d'une saison ont ete modifiees manuellement
- Filtrage liste individus par jj/mm sur toutes les annees confondues quand aucune annee selectionnee
- dataset.derniereDatePos ajoute sur chaque label individu pour le filtrage cote JS
- Inputs Du/Au en format jj/mm avec masque automatique sans Flatpickr

### Modifications
- Saisons listener appelle mettreAJourListeParDate au lieu de filtrerListeIndividus
- selectAnnee listener appelle mettreAJourListeParDate si dates presentes
- mettreAJourListeParDate refactorise avec fonction _appliquerFiltreListeAvecIds
- selectTranslocation retire des badges car filtre non implemente cote liste et API

### Corrections
- Restauration dates memorisees quand on revient a une seule saison cochee
- Badge saison restaure la couleur badge-modifie apres decocher/recocher

## [0.19.0] - 2026-06-03

### Ajouts
- Contrôle FullScreen OpenLayers en haut à droite de la carte
- Échelle scalebar OpenLayers avec ratio et barre graphique dans legende wrapper
- Compteur positions totales dans la pagination du panneau attributaire

### Modifications UI
- Boutons zoom déplacés en haut à gauche
- Légende et échelle repositionnées en bas à gauche côte à côte
- Positions affichées retirées de la légende et intégrées dans la pagination
- Pagination simplifiée fenêtre glissante 2 pages avec ellipsis

### Corrections
- Filtres sexe et gestionnaire appliqués côté JS car absents de v_animal_last_loc
- Crash positionsCount corrigé via appels optionnels

## [0.18.0] - 2026-06-03

### Corrections
- Zoom au premier filtre avec plusieurs individus délai 400ms pour laisser le temps au redimensionnement du panneau
- Label Inconnu retiré de la légende en mode couleur Sexe
- Libellé prog id 5 corrigé 8 locs/j (3h/90s) au lieu de 6 locs/j

### Modifications UI
- Traits sous les en-têtes de colonnes du tableau retirés
- Trait sous les onglets Individus/Données retiré trait vert actif conservé via after
- Vignettes fonds de carte sans border radius
- En-tête Légende masqué

## [0.17.0] - 2026-06-02

### Ajouts
- TomSelect intégré sur tous les selects de la sidebar (Population, Sexe, Classe d'âge, Gestionnaire, Translocation, Programmation GPS)
- Initialisation lazy au premier toggle de chaque accordéon - évite les problèmes de dimensions sur éléments cachés
- Flatpickr intégré sur les champs date Du/Au - calendrier stylisé, locale fr, format d/m/Y, placeholder jj/mm/aaaa
- `static: true` sur Flatpickr - calendrier stable sans déplacement au scroll
- Logo `logo_tramnoir.png` en fond semi-transparent sur la sidebar (opacité 0.08 via ::before)
- Spinner de chargement remplacé par le logo PNP rotatif avec filtre CSS vert

### Modifications UI
- Override CSS `.ts-wrapper.sidebar-select` - corrige l'héritage des styles sidebar-select sur le wrapper TomSelect
- Variables root ajoutées : `--select-border-radius`, `--select-dropdown-radius`, `--select-hover-bg`, `--select-selected-bg`, `--select-color`, `--input-border-radius`, `--select-width`
- Hover TomSelect harmonisé avec Flatpickr : `--select-hover-bg: #d1e5df`
- Largeur selects réduite à `--select-width: 85%`
- Z-index dropdowns TomSelect et Flatpickr à 9999
- Options sélectionnées et au survol en couleur primaire `#099469`

## [0.16.0] - 2026-06-02

### Modifications UI
- Couleur primaire : `#099469`, hover : `#006B4A`
- Logo PNP agrandi (`height: 64px`) et repositionné (`margin-left: -20px`)
- Bouton 'Appliquer les filtres' et bouton spatial : `border-radius: 18px`
- Toggle sidebar : repositionné (`top: 30%`), hauteur augmentée (`min-height: 100px`), border-radius réduit à `1px`
- Mode buttons Positions/Trajectoire : `border-radius: 1px`
- Checkbox et range : `accent-color: var(--color-primary)`
- Bouton 'Appliquer' hover : `background-color: var(--color-primary-hover)`
- Positions count panel : séparateur `border-top` retiré
- Badge filtre : border corrigé (`1px solid #b2d8bf`)
- Basemap active : border `color-primary-hover`, vignette réduite à `1px`
- Lien 'Réinitialiser' : `text-decoration: none`
- Onglets panneau : trait actif via `::after` centré à `60%`

### Modifications panel.js
- Libellé dropdown colonnes : 'Colonnes visibles' → 'Colonnes'

## [0.15.0] - 2026-06-01

### Ajouts
- Système de cache des requêtes API dans `api.js` - les résultats sont mémorisés par endpoint et combinaison de filtres
- Fonction `viderCache()` exportée depuis `api.js` - appelée automatiquement à la réinitialisation des filtres
- Normalisation des clés de cache - les filtres vides sont ignorés pour partager le cache entre `startApp()` et `applyFilters()`

### Performances
- Premier clic 'Appliquer les filtres' : 2580ms → 18ms (cache alimenté au chargement initial)
- Clics suivants avec mêmes filtres : instantané (< 30ms)
- Gain global : x100 à x1000 selon les cas

### Corrections
- Retrait des `console.time` et `console.log` de debug dans `filters.js`
- Retrait d'une variable temporaire de session dans `app.js`

## [0.14.0] - 2026-06-01

### Ajouts
- Fonction `fetchAllLastLocations()` dans `api.js` - récupère la dernière position de tous les animaux en une seule requête depuis `v_animal_last_loc`
- Intégration de la clé API IGN dans la configuration - fond SCAN25 activé
- Index `idx_localisation_date` et `idx_localisation_capt_id` créés sur `t_localisation` côté serveur
- Champ `cor_date_fin` ajouté dans `v_animal_last_loc` - permet de calculer `activeIds` sans requête supplémentaire

### Modifications
- `v_animal_last_loc` modifiée côté serveur - retrait de `AND cor.cor_date_fin IS NULL`, retourne désormais 200 animaux (actifs + inactifs) au lieu de 52
- Chargement initial - `fetchAllLastLocations` remplace `fetchLastLocations` + `fetchLastLocationsInactifs` (230 requêtes → 1 requête)
- `activeIds` calculé directement depuis `cor_date_fin === null` sans appel supplémentaire à `fetchLastLocations`
- `applyFilters()` mode Positions - source unique `fetchAllLastLocations`, filtrage `suivisSeulement` via `cor_date_fin === null` côté JS
- `reinitialiserTousLesFiltres()` - utilise `fetchAllLastLocations` uniquement
- `fetchLastLocations` et `fetchLastLocationsInactifs` retirés des imports de `app.js` et `filters.js`

### Performances
- Chargement initial : 230 requêtes → 1 requête
- Temps de chargement : 15-30 secondes → moins de 2 secondes
- Index sur `t_localisation` - suppression du scan complet de 996 000 lignes à chaque requête

## [0.13.0] - 2026-05-29

### Ajouts
- Image de fond personnalisée dans le header (`header_top.png`) - dégradé turquoise cohérent avec la thématique nature/montagne
- Interaction carte ↔ tableau attributaire - clic sur un point carte surligne la ligne correspondante en vert dans les onglets Données et Individus observés
- Navigation automatique vers la page du tableau contenant la donnée sélectionnée avec centrage de la ligne
- Persistance de la sélection lors du changement d'onglet ou de l'application des filtres
- Sélection exclusive - une seule ligne surlignée à la fois, retiré automatiquement à la sélection suivante
- Fonction `scrollToAniId()` et `scrollToAniIdIndividus()` exportées depuis `panel.js`
- Variable `aniIdSelectionne` mémorisée dans `panel.js` pour maintenir la sélection après rendu

### Modifications
- Symbologie : options Date et Saison retirées temporairement - à valider avec Ludovic et Alexandre, code commenté pour réactivation future
- Seuil des flèches directionnelles en mode Trajectoire réduit de 1500m à 800m
- Bordure arrondie du sélecteur de fonds de carte réduite (`border-radius: 4px`)
- Retrait du survol point carte sur les lignes du tableau - uniquement au clic

### Corrections
- Tri de la colonne Dernière position en mode Positions - fallback sur `loc_date_local` si `loc_datetime_local` est null
- Fond gris visible pendant le drag de fermeture du panneau droit - `right` de `#mapScreen` synchronisé en temps réel avec la largeur du panneau
- Retrait du `console.log('Premier individu')` restant dans `app.js`

## [0.12.0] - 2026-05-28

### Ajouts
- Sélecteur de fonds de carte style Google Maps - vignette active toujours visible, menu qui s'ouvre vers la gauche avec transition scale + opacity
- Vignettes agrandies (64px), bordure verte sur le fond actif, noms réels affichés : IGN SCAN25, OpenTopoMap, OpenStreetMap
- Mise à jour `config.example.js` - ajout constantes de zoom et paramètres de développement
- Nouveau module `filters.js` - regroupe toute la logique de filtrage extraite de `app.js`

### Modifications
- Retrait du cache-busting `?v=1.1.0` de tous les imports JS et CSS
- Variables partagées `animals`, `activeIds`, `currentToken`, `programmationsMap` accessibles via getters/setters exportés depuis `app.js`
- Zoom OpenLayers remonté (`bottom: 180px`) pour ne plus être masqué par le sélecteur de fonds de carte
- Suppression de la modal `#layersModal` et de tous ses styles associés
- `app.js` allégé - logique de filtrage déplacée dans `filters.js`

### Corrections
- Recherche textuelle filtre uniquement parmi les animaux de la période sélectionnée
- Listener `searchIndividu` simplifié - délègue entièrement à `mettreAJourListeParDate()`
- Suppression du listener `input` sur les dates - seul `change` conservé car `<input type=date>` ne retourne pas `value` pendant la frappe manuelle
- Double listener `searchIndividu` supprimé
- Imports ES6 de variables `let` non réactifs entre modules - remplacés par getters/setters

## [0.11.0] - 2026-05-27

### Ajouts
- Onglet 'Individus observés' dans le panneau droit - tableau synthétique par animal avec colonnes configurables (Individu, ID, Sexe, Population, Gestionnaire + optionnelles : Année naissance, Première position, Dernière position, Code, Date lâcher, Date mort)
- Synchronisation carte ↔ panneau droit - les deux onglets se mettent à jour après chaque application de filtres avec uniquement les animaux/positions visibles sur la carte
- Clic sur une ligne 'Individus observés' → zoom sur le point de l'animal sans filtrer la carte
- Survol d'une ligne tableau (mode Positions uniquement) → grossissement du point sur la carte
- `#mapScreen.panel-open` - la carte se réduit quand le panneau droit s'ouvre, les éléments bas droite restent visibles
- Colonnes 'Première position' et 'Dernière position' calculées côté JS dans l'onglet Individus observés
- Fonction utilitaire `enrichirAnimauxAvecPositions()` dans `app.js`
- Constantes de zoom centralisées dans `config.js` : `ZOOM_POINT_SINGLE`, `ZOOM_FILTER_SINGLE`, `ZOOM_FILTER_MULTI`, `ZOOM_TRAJECTOIRE_SINGLE`, `ZOOM_TRAJECTOIRE_MULTI`, `ZOOM_MAX_MANUAL`, `ZOOM_MIN_MANUAL`
- Limites de zoom manuel définies dans la vue OpenLayers (`minZoom`, `maxZoom`)
- Stylisation personnalisée du popup cartographique dans `map.css` (fond blanc, ombre, typographie, taille min/max)
- Variables globales de commodité sur `window` (`_getMap`, `_getGpsFeatures`, `_ZOOM_POINT_SINGLE`)

### Modifications
- Onglet 'Individus observés' affiché en premier dans le panneau droit
- `ouvrirPanneauSiNecessaire()` ouvre sur l'onglet 'Individus observés' par défaut
- Colonnes par défaut de l'onglet 'Données' : ID, Dernière position, Altitude, Temp. (°C)
- `formaterValeur()` - fallback `loc_date_local` si `loc_datetime_local` est null
- `mettreAJourIndividus()` appelé après `renderPoints()` dans `startApp()` - synchronisé avec les points affichés
- `window._afficherPositionsIndividu` simplifié - zoom uniquement sur le point sans filtrer la carte
- Listener toggle sidebar droite unifié - suppression du doublon, ajout `updateMapSize()` après transition
- Popup retiré au clic sur une ligne tableau - uniquement au clic sur un point carte
- Popup fermé au déplacement manuel de la carte (`movestart`) sans interférer avec les animations programmatiques
- Popup uniquement sur les points GPS - ignoré sur les lignes de trajectoire et flèches directionnelles
- Contour blanc retiré des points GPS en mode Positions et Trajectoire
- Tous les niveaux de zoom hardcodés remplacés par les constantes de `config.js`
- `mettreAJourIndividus(animals.filter(...))` remplacé par `enrichirAnimauxAvecPositions(locations)` dans `applyFilters()` et `reinitialiserTousLesFiltres()`
- Survol désactivé en mode Trajectoire pour éviter le sautillement des points
- Offset vertical du popup augmenté de -10 à -16 dans `map.js`
- Clic sur l'onglet 'Données' appelle `mettreAJourColonnes()` pour rafraîchir l'affichage
- Formatage spécifique des dates de première et dernière position dans `formaterValeurIndividu()`
- Limite de positions par segment ramenée de 500 à 10 lors du chargement des trajectoires sans période
- Inversion de l'ordre des onglets dans `index.html` pour cohérence avec l'ordre par défaut

### Corrections
- Double listener sur `sidebarRightToggle` fusionné en un seul bloc
- `MIN_ZOOM` non importé dans `map.js` causant carte blanche - remplacé par `ZOOM_MIN_MANUAL`

## [0.10.0] - 2026-05-26

### Changed
- Suppression complète de la `.map-toolbar` - layout simplifié, `#mapScreen` part désormais de `top: 60px` (juste sous le header)
- Boutons **Positions** et **Trajectoire** déplacés sur la carte en bas à droite (style Google Maps)
- **Symbologie** déplacée dans la sidebar gauche juste au-dessus du bouton Appliquer
- **Légende** repositionnée en haut à gauche de la carte
- **Compteur de positions** collé sous la légende en bas
- Contrôles zoom OpenLayers repositionnés en bas à droite avec style épuré (fond blanc, ombre légère)
- Bouton couches `#mapLayersWrapper` repositionné en bas à droite au-dessus des boutons mode
- Navigation header en majuscules, sans fond au hover, soulignement actif uniquement
- `.sidebar-right` et `.sidebar` mis à jour pour `top: 60px`
- Boutons radio **Symbologie** remplacés visuellement par des cases carrées (`appearance: none` + style carré CSS, radio conservés pour la sélection unique)

### Removed
- `.map-toolbar` et tous ses styles associés (`.toolbar-left`, `.toolbar-right`, `.toolbar-couleur`, `.toolbar-label`, `.pill-btn`)

## [0.9.0] - 2026-05-13 au 22

### Added
- **Panneau données (sidebar droite)** - nouveau module `panel.js` complet :
  - Tableau attributaire avec 11 colonnes configurables (4 actives par défaut : Individu, ID, Sexe, Date/Heure locale)
  - Dropdown "Filtres colonnes" pour afficher/masquer les colonnes (Population, Altitude, Temp., DOP, Nb sat., Pos. Abe., Constructeur)
  - Tri par colonne au clic sur l'en-tête avec icônes ▲▼ (actif/inactif)
  - Filtres textuels par colonne en temps réel, fusionnés dans la même cellule que le titre
  - Pagination avec sélecteur de taille de page (25 / 50 / Tous)
  - En-têtes de tableau épinglés en haut (`position: sticky`) pendant le défilement
- **Sélecteur de fonds de carte** (`initBasemapSelector`) avec modal et vignettes : SCAN25 IGN, OpenTopoMap, OpenStreetMap
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
- Carte coupée ou mal dimensionnée sur petit écran - `ResizeObserver` ajouté dans `map.js` pour appeler `map.updateSize()` à chaque redimensionnement du conteneur `#map`

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
- Préparation de la gestion des droits : masquage par défaut du bouton "+ Ajouter" selon le profil connecté
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
- Écran de connexion (identifiant/mot de passe)
- Prototype maquette

### Changed
- Arborescence projet complète initialisée
- Fichiers de configuration locaux exclus du dépôt Git

---

## [0.1.0] - 2026-04-24

### Added
- Structure initiale du projet (frontend / backend / tests / docs)
- Test carte OpenLayers avec vraies données GPS (test_map.html)
- Authentification via l'API
- Conversion coordonnées EPSG:2154 → WGS84 via proj4js
- Affichage points GPS sur fond OSM
- Popup au clic (nom, date, altitude, température, DOP)
- Premier commit GitHub
