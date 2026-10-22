# LUDUS — le jeu de lanistes (version numérique)

Jeu de **Séraphin Gaillard & Gabin Guyot**. Cette application permet de jouer à LUDUS dans un navigateur
(Edge, Chrome, Firefox…), sans rien installer.

## Lancer le jeu

Double-cliquez sur **`index.html`**. C'est tout.

## Les 3 façons de jouer

| Mode | Comment |
|---|---|
| **Contre l'ordinateur** | 3 niveaux : Facile, Normal, Difficile. |
| **Deux joueurs, même écran** | Un écran « Passez l'écran à… » masque les cartes cachées entre deux tours. |
| **En ligne avec un ami** | Chacun sur son appareil (ordinateur, tablette ou téléphone). |

### Jouer en ligne
1. Le premier joueur choisit **Jouer en ligne → Créer une partie**. Un code de 5 lettres apparaît.
2. Il envoie ce code à son ami (message, SMS…).
3. L'ami ouvre le jeu, choisit **Jouer en ligne → Rejoindre une partie** et saisit le code.
4. Quand l'ami est connecté, le créateur clique sur **Lancer la partie**.

Les deux joueurs ont besoin d'Internet. La connexion est directe entre les deux navigateurs
(technologie WebRTC, via le service gratuit PeerJS pour la mise en relation).
Elle peut être bloquée sur certains réseaux très protégés (wifi d'établissement, par exemple) :
dans ce cas, essayez en 4G/5G. Si la connexion est perdue, l'ami peut rejoindre avec le même code et la partie reprend.
Le créateur de la partie doit garder son onglet ouvert pendant toute la partie.

## L'ordinateur adverse
* **Il dépense toujours son argent au Forum** : après la phase d'achat, il lui reste en moyenne 0,1 denier, à tous les niveaux.
* Il a été **entraîné par auto-jeu** (des dizaines de milliers de parties ordinateur contre ordinateur, sur tous les cœurs du PC) :
  valeur de chaque gladiateur selon le contenu du ludus (PEGMA, SAGITTARIUS, HOPLOMAQUE…), valeur de chaque tactique, poids de l'argent selon la manche,
  choix des tactiques à poser au Colisée, utilisation des cartes ⚙.
* **Trois niveaux** : *Difficile* = réglages entraînés ; *Normal* = réglages à moitié oubliés + un peu de hasard (le Difficile le bat ≈ 65 % du temps) ;
  *Facile* = réglages d'origine + beaucoup de hasard + peu de tactiques (le Difficile le bat ≈ 84 % du temps).
* Pour ré-entraîner : `node tests/train.js 60 64 800` puis `node tests/apply-trained.js` ; pour recaler les niveaux : `node tests/calibrate.js 3000`.

## Utilisation en jeu
* **Survolez une carte** pour la voir en grand.
* **Préparation** : cliquez une carte du Forum pour l'acheter, ou une carte ⚙ de votre main pour l'utiliser.
* **Tactiques** : cliquez une tactique de votre main, puis un emplacement libre (ou glissez-la).
* Boutons en haut à droite : 🔊 sons · 📜 journal de la partie · 📖 règles et toutes les cartes · ☰ menu.
* **↩ Annuler mon dernier coup** (bouton en haut) : si vous avez joué une carte ou fait un achat par erreur, la partie revient juste avant votre dernier choix. Contre l'ordinateur c'est immédiat ; à deux (même écran ou en ligne) l'adversaire voit une petite fenêtre « X demande à annuler son dernier coup » et doit **accepter** ou **refuser**.
* **Édit de l'Empereur** : au début de chaque manche il s'affiche en grand au milieu de l'écran, et chaque joueur doit cliquer « J'ai lu » avant que ses effets ne s'appliquent.
* **Prix modifiés par un Édit** : quand un Édit change un prix (Déstockage, Austérité…), le nouveau prix s'affiche en **vert ▼** s'il baisse et en **rouge ▲** s'il monte, sur les cartes, sur la réserve et dans l'en-tête de chaque Quartier (avec « normalement X »).
* **Achats visibles** : pendant toute la phase de préparation, une bande sous les onglets montre les cartes achetées par vous et par votre adversaire (les gladiateurs tirés du dessus d'une réserve restent cachés, comme dans les règles). Survolez une carte pour la voir en grand.
* Quand un choix dépend du plateau (REPOSITIONNEMENT, MISSIO, RÉSERVATION…), la fenêtre de choix se range **sur le côté** pour laisser le plateau visible.
* « Mon ludus » et « Fosse » (en bas à gauche) permettent de consulter vos gladiateurs et les cartes défaussées.
* Les puissances affichées sur les gladiateurs sont calculées automatiquement (désactivable dans le menu).

## Contenu du dossier
* `index.html` — la page du jeu · `css/` — l'apparence · `js/` — le code (règles, ordinateur, interface, réseau)
* `assets/` — les images des cartes, extraites de vos PDF
* `tests/` — tests automatiques (`node tests/combat.test.js`, `node tests/flow.test.js`, `node tests/conformite.test.js`, `node tests/sim.js 200 normal normal`)

## Conformité avec le tableur des auteurs (onglets V4.x.10)
Le jeu a été comparé carte par carte au tableur `LUDUS_WORKSPACE` (onglets *V4.x.10 Gladiateurs / Tactiques / Edits* et feuilles maîtres).
`node tests/conformite.test.js` refait cette comparaison (nombre d'exemplaires, rang, coût, puissance, Avantage, cartes avancées, texte des effets, Édits).
Écarts corrigés lors de cette mise à jour :
* **NOBILE** : 3 exemplaires (la carte imprimée en comptait 5) → Quartier Aguerri = 21 cartes, comme annoncé dans le matériel.
* **CLEF DE LA FOSSE** et **RÉSERVATION** : coût **4** deniers dans le tableur (les images des cartes montrent 3 pièces ; le prix affiché dans le jeu est le bon).
* **ÉCHANGE FORCÉ** (manche 1) et **PRIME DE VICTOIRE** (manche 4) : le tableur indique « / » = **aucun effet** (les cartes du PDF affichaient « Révélez un nouvel Édit »).
Points restant à trancher par les auteurs :
* **ANDABATA** : la colonne « Abilities » du tableur dit « Gagne en cas d'égalité » (Avantage) mais son texte de carte et l'image n'ont pas d'Avantage → le jeu n'en met pas.
* La liste des fonctionnalités du tableur (colonne V4.14.x) indique des subventions limitées à 10, mais le retour de test n°118 (version 4.9.4.1) les a baissées à 7, comme le livret : **7** conservé.
* Retours « à débattre » (n°149 à 151) : variante de SOIF DE SANG et Édits « cartes avancées » : non appliqués.

## Points d'interprétation des règles (à valider par les auteurs)
Le livret laisse quelques cas ouverts ; voici comment ils sont codés (faciles à modifier dans `js/engine.js`) :

1. **PEGMA** existe en **3 exemplaires** (confirmé par les auteurs et le tableur).
2. **RÉSERVATION** : le gladiateur placé face cachée occupe un emplacement ; à la révélation, on ne tire que pour les emplacements encore vides. Si on désigne l'adversaire, on voit son ludus pour choisir.
3. **SUMMA RUDIS** : empêche les effets ⚡ de DATURA, DISPENSE et REPOSITIONNEMENT d'agir sur sa zone (les effets ⚔ des tactiques et MISSIO ne sont pas bloqués).
4. **DIMACHERUS** avec DATURA : le doublement des bonus/malus compte ×4 (le cas du renfort ne se pose pas : on ne peut pas mettre de gladiateur en renfort sur lui).
5. **SOIF DE SANG** : les deniers « par duel remporté » restent basés sur les duels ; seul le vainqueur du combat change.
6. **PROMOTION** peut recruter dans le Quartier Légendaire dès la manche 1 (c'est un recrutement, pas un achat).
7. **RETIARIUS** ne gagne pas son bonus face à un gladiateur de Départ ; **SAMNITE** subit son malus si un gladiateur de Départ est en combat, de n'importe quel côté.
8. **Réserve vide** : le dépôt est mélangé dès qu'on a besoin de piocher dans cette réserve.
9. **PRIME TACTIQUE** (manches 1 à 3) : le denier est versé au moment où la tactique est posée.
10. Le tirage au sort du premier laniste reproduit les deux poings (le résultat est aléatoire).

## Sons
Tous les sons sont synthétisés par le navigateur (aucun fichier audio) : cors romains, tambours de guerre, épées qui s'entrechoquent,
foule de l'arène, gong de l'Empereur, pièces, fanfare de victoire… Le bouton 🔊 (en haut, ou sur le menu principal) les coupe ;
le menu ☰ permet de régler le volume et l'ambiance de l'arène.

## Poké-Ludus (deuxième jeu)
Le menu d'accueil propose **LUDUS** ou **POKÉ-LUDUS**, une version Pokémon (projet de fans, non officiel) : les gladiateurs deviennent des Pokémon (ex. Hexadron pour PEGMA, Électrode pour VENEFICUS, Mewtwo pour DIMACHERUS ; tous les Légendaires du jeu sont des Pokémon légendaires), les tactiques des objets ou personnages (Ceinture Force pour MISSIO, Cloche Écho pour DATURA, Bandeau Choix pour LION APPRIVOISÉ, Rapide Ball pour RÉSERVATION, Officier Jenny pour SUMMA RUDIS, Team Rocket pour COMPLICES…), le Forum un Poké Marché, le Colisée une Arène, la fosse le PC, les Édits des décrets du Maître de la Ligue. Tous les pictogrammes sont aussi convertis (Poké Ball pour l'équipe, 🎴 pour la main, 💻-style PC, 🏟️ pour l'Arène, 🛒 pour le Poké Marché, 💥 / 💫 / ✨ / 🎒 pour les symboles Combat / K.O. / Révélation / Préparation, icône de l'onglet…). Un contrôle automatique (`poke-scan`) parcourt tous les écrans pour vérifier qu'il ne reste aucun mot ni image de LUDUS. **Choix du starter** : au lancement d'une partie Poké-Ludus, vous choisissez votre Pokémon de départ parmi les 27 starters des 9 générations ; la couleur de vos cartes de départ suit son type (🟢 Plante, 🔴 Feu, 🔵 Eau). Le Rival prend un starter d'un autre type ; à deux sur le même écran chacun choisit le sien, et en ligne l'invité choisit le sien en rejoignant. Les types des Pokémon ne sont pas affichés sur les cartes (ils n'ont pas d'effet dans le jeu). Les règles sont identiques. Le thème est dans `js/theme-poke.js` et `css/poke.css`. Les images (issues de PokeAPI/sprites) sont copiées dans `assets/poke/` : le jeu fonctionne hors ligne.
