# Projet — Contrôleur web pour découpeuse laser (type OctoPrint, pour laser)

## Objectif

Application locale permettant de piloter une découpeuse laser Atomstack (firmware GRBL)
via USB : envoi de G-code, suivi temps réel, import SVG → G-code avec presets matériaux.
Équivalent d'OctoPrint mais pour laser, pas pour imprimante 3D.

## Stack technique

- **Monorepo** : Nx
- **Backend** : NestJS (choisi car connu par le dev, plutôt que .NET)
- **Frontend** : Angular + Optimus UI
- **Communication série** : `serialport` (Node) — équivalent de `pyserial` côté OctoPrint
- **Stockage** : SQLite via **TypeORM** — pas besoin de plus, usage local mono-utilisateur.
  Prisma a été essayé puis abandonné (frictions répétées avec Prisma 7) ; voir mémoire
  `project_prisma_materials_backend`.
- **Temps réel** : WebSocket via `@nestjs/websockets` + `@nestjs/platform-ws` (lib `ws`
  brute, pas socket.io), diffusant statut GRBL et trafic série brut à l'UI

NOTE: n'utilise JAMAIS pnpm, seulement npm.

## Matériel cible

- Découpeuse **Atomstack**, firmware **GRBL 1.1**, clone de carte
- Connexion **USB série**
- Sécurité déjà gérée au niveau matériel par la machine :
  - coupure automatique en cas de surchauffe
  - coupure automatique en cas d'ouverture de porte
  - **Confirmé physiquement** : sur cette machine, l'ouverture de la porte fait bien
    remonter un état `Door` (ex. `<Door:1|...>`) dans les rapports de statut (`?`) — le
    parsing gère ce cas (voir `grbl-status.parser.ts`). ⚠️ Seul l'_affichage_ du statut
    "Door open" est implémenté ; aucune logique de blocage automatique des opérations
    n'est encore construite sur cette base.
  - **Quirk confirmé de cette carte** : après une alarme matérielle (ex. `ALARM:1`,
    butée dure atteinte), la carte peut se réinitialiser silencieusement et se
    remettre à annoncer `Idle` sans que `$H`/`$X` n'ait été envoyé — il ne faut donc
    jamais se fier uniquement au dernier statut `?` pour savoir si la machine est en
    sécurité. Le logiciel maintient son propre verrou côté logiciel (voir
    `GrblConnection.alarmed` dans `grbl-connection.ts`) : une fois une `ALARM:` reçue,
    toute commande autre que `$H`/`$X` est rejetée avant même d'être envoyée sur le
    port série, jusqu'à ce que l'une des deux réussisse (réponse `ok`) — même si la
    machine se déclare "Idle" entre-temps. Le même verrou s'engage aussi après un
    arrêt d'urgence logiciel (`GrblConnection.abort()`, voir plus bas) : GRBL peut
    revenir en "Idle" après un reset temps réel sans avoir réellement rehominé.
  - **`$H` (homing)** : n'est **plus** injecté dans le G-code généré/téléchargé
    (`WorkspaceGcodeGeneratorService.generate()`) — certains visualisateurs G-code
    externes le rejettent comme commande invalide. C'est désormais `JobService.start()`
    qui envoie `$H` une seule fois, juste avant de streamer le fichier vers la
    découpeuse (voir plus bas). Le programme généré se termine par `M30` (pas `M5`) :
    fin de programme GRBL, qui coupe tout (laser, moteurs, ventilateur d'extraction,
    etc.), pas seulement le laser.

## Contraintes de déploiement

- Usage **local uniquement**
- **Pas d'authentification**, pas de gestion multi-utilisateurs
- Pas de besoin de sécurité applicative avancée (réseau non exposé)
- Un environnement de dev physique peut tourner en parallèle du tien (conteneur
  partagé, `--device=/dev/ttyUSB0` dans `.devcontainer/devcontainer.json`) avec la
  machine réelle branchée : ne jamais tuer un process sur les ports 3000/4200 sans
  vérifier au préalable (`sudo lsof -i:PORT`) qu'il ne s'agit pas de cette session-là,
  et ne jamais cliquer Connect/Disconnect/jog ou envoyer une commande arbitraire sans
  autorisation explicite si une vraie machine peut être branchée.

## Points techniques clés à ne pas oublier

- **Protocole GRBL** : plutôt que le character-counting façon OctoPrint (remplir le
  buffer RX de 128 octets de GRBL en comptant les octets en vol), l'implémentation
  actuelle (`GrblConnection`) envoie les commandes **une par une** et attend le
  `ok`/`error:N` correspondant avant d'envoyer la suivante (file d'attente FIFO
  interne). Plus simple et plus sûr, au prix d'un débit de commandes plus faible —
  suffisant pour du jog/pilotage manuel et du streaming de programmes ligne à ligne.
  À revisiter seulement si le débit devient un problème réel (ex. gravure avec
  beaucoup de petits segments).
  - En parallèle de cette file `ok`/`error`, trois octets **temps réel** GRBL sont
    envoyés directement sur le port, hors file d'attente, sans attendre de réponse :
    `!` (feed hold, `GrblConnection.pause()`), `~` (cycle start/resume,
    `GrblConnection.resume()`), et `Ctrl-X`/`0x18` (soft reset, `GrblConnection.abort()`
    — l'arrêt d'urgence, voir `JobService` plus bas). `abort()` engage aussi le verrou
    d'alarme logiciel (comme une vraie `ALARM:`), `pause()`/`resume()` non — rien n'est
    considéré en défaut lors d'un simple feed hold.
- Import **SVG → G-code** : le pipeline actuel se limite à des segments de ligne
  droite (M/L) — les courbes/arcs ne sont pas supportés (`UNSUPPORTED_PATH_COMMAND`
  dans `WorkspaceCheckService`). Le flattening SVG → sous-chemins mm se fait
  entièrement côté frontend (`SvgFlattenerService`) ; le backend ne fait que valider
  un "workspace SVG" déjà aplati et annoté (voir `docs/workspace-svg-format.md`) avant
  génération du G-code.
- Bibliothèque de presets matériaux (`Material` → plusieurs `Profile` : mode
  LIGNE/REMPLISSAGE, puissance %, vitesse en **mm/min**, passes, espacement de
  hachures) stockée en base et éditable depuis la page Configuration. Toutes les
  vitesses de l'application (profils, machine, générateur de pattern de test) sont en
  mm/min — unité native du feed rate G-code (`F`), alignée sur le standard des autres
  logiciels (LightBurn, etc.) plutôt que sur mm/s.
- La puissance d'un profil est un **pourcentage**, converti en valeur `S` du G-code en
  la mettant à l'échelle du `$30` (max spindle/laser) de GRBL, stocké côté `Machine`
  (`sMax`).
- **Décalage d'origine machine** (`Machine.offsetXMm`/`offsetYMm`) : écart fixe entre
  l'origine réellement homée par GRBL (butées physiques) et le "zéro logique" de la
  machine — ajouté à toutes les coordonnées X/Y émises en G-code
  (`WorkspaceGcodeGeneratorService.toMachinePoint()`), donc `G0 X0 Y0` n'atterrit pas
  forcément au coin de la surface. Visualisé sur la page Gcode par un point bleu séparé
  du repère habituel (`SvgToGcodePage.homePoint()`, distinct de `originPoint()` qui
  reste ancré au coin/à l'origine choisie et ne bouge jamais avec l'offset — flèches
  d'axe et légende du quadrillage restent donc alignées sur le bord de la surface, qui
  elle-même ne bouge pas). Les coordonnées G-code peuvent désormais être négatives
  (offset négatif) : volontaire, GRBL s'en accommode très bien.
- **Optimisation du G-code en mode FILL** (hachurage) : historiquement, chaque segment
  de hachurage coupait le laser (`M5`/`G0`/`M4`) même entre deux segments très proches
  (ex. petites courbes d'un caractère de texte), ce qui donnait une découpe en
  pointillés et sollicitait inutilement les moteurs par à-coups. Désormais, un seul
  `M4` est émis en tête de chaque passe (la puissance reste constante sur toute la
  passe), et un `G0` entre deux segments coupe nativement le laser (mode laser
  dynamique GRBL) sans `M5` explicite. En dessous de `MIN_TRAVEL_DISTANCE_MM`
  (constante dans `workspace-gcode-generator.service.ts`) entre la fin d'un segment et
  le début du suivant, le déplacement se fait via un simple `G1` (au feed rate de
  déplacement de la machine) au lieu d'un `G0`, laser resté allumé en continu à travers
  l'écart. Valeur ajustée après tests réels sur la machine — ne pas la modifier sans
  demande explicite.

## Architecture backend (NestJS)

- `apps/backend/src/app/cutter/` — `CutterController` (REST : `/cutter/ports`,
  `/connect`, `/disconnect`, `/status`, `/command`) et `CutterGateway` (WebSocket temps
  réel, voir ci-dessous). Les deux appellent `CutterCommunicationService`.
  - `JobService` — streame le fichier G-code actuellement uploadé vers la découpeuse,
    une ligne à la fois (même primitive `send`/ok-error que `CheckService`/
    `FramingService`), en trackant `currentLine`/`totalLines` pour la progression.
    Envoie `$H` une fois avant de démarrer. Supporte pause (`pause()`, feed hold GRBL
    `!`, la boucle d'envoi attend sur un signal de reprise sans envoyer la ligne
    suivante), reprise (`resume()`, `~`), et arrêt d'urgence (`stop()`,
    `GrblConnection.abort()` — reset temps réel, ne rejoint le `ok`/`error` normal,
    voir plus haut). Émet `changed` à chaque démarrage/pause/reprise/avancement/fin.
  - `AutoConnectService` — poll toutes les secondes (`OnModuleInit`) : si aucune
    connexion active et que le port série configuré (`Machine.serialPortPath`) est
    accessible (`fs.access`), tente une connexion automatiquement (mêmes options que
    le bouton "Connect" manuel, via `machine-connection-options.ts` partagé). Ne fait
    rien si la machine est éteinte/débranchée (le port n'existe juste pas). Un flag
    `connecting` dans `GrblConnection` évite qu'une tentative manuelle et une tentative
    automatique n'ouvrent le port en même temps.
- `libs/cutter-communication` — lib partagée, indépendante de NestJS :
  - `GrblConnection` — connexion série bas niveau (`serialport`), file de commandes
    ok/error, requêtes de statut temps réel (`?`), verrou logiciel d'alarme (voir
    plus haut), commandes temps réel `pause`/`resume`/`abort` (voir plus haut). Émet
    `sent`/`received` (trafic brut, pour le terminal), `status`, `alarm`, `data`,
    `error`, `disconnected`.
  - `grbl-status.parser.ts` — parse un rapport `<État|MPos:...|WPos:...>`, y compris
    les sous-états `Door:n`/`Hold:n`.
  - `CutterCommunicationService` — wrapper Nest-injectable de `GrblConnection`.
- `apps/backend/src/app/machine/` — CRUD (TypeORM/SQLite) des réglages machine :
  nom, dimensions du plateau, port série, bauds/dataBits/stopBits/parité, miroirs X/Y,
  origine, décalage d'origine (`offsetXMm`/`offsetYMm`, voir plus haut), accélérations
  max, vitesse de travail (`maxSpeedXMmPerMin`/`YMmPerMin`, utilisée pour les `G1`
  laser allumé) et vitesse de déplacement (`travelSpeedXMmPerMin`/`YMmPerMin`, utilisée
  pour les `G0`), `sMax`. `machine-connection-options.ts` centralise la conversion
  `Machine` → options de connexion série, partagée entre `CutterGateway` (connexion
  manuelle) et `AutoConnectService`.
- `apps/backend/src/app/materials/` — CRUD matériaux + profils de découpe/gravure.
- `apps/backend/src/app/gcode/` — CRUD des blocs de G-code personnalisés injectés en
  début (`start`) / fin (`end`) de programme, avec un ordre d'exécution (`order`).
- `apps/backend/src/app/workspace-check/` — parse et valide un "workspace SVG" exporté
  par le frontend (profils manquants/inconnus, matériau non sélectionné, path hors
  plateau, paths qui se croisent, commandes de path non supportées) avant génération
  de G-code.
- `apps/backend/src/app/workspace/workspace-gcode-generator.service.ts` — génère le
  G-code final à partir d'un workspace validé (voir `docs/workspace-svg-format.md`
  pour la structure exacte du programme).
- Pas encore construit : file d'attente de jobs (un seul job actif à la fois,
  `JobService` n'a pas de notion de queue) et historique de jobs.

### WebSocket (`CutterGateway`, `@nestjs/websockets` + `@nestjs/platform-ws`)

- Un seul gateway, chemin `/api/ws/cutter`, adapter `WsAdapter` (lib `ws` brute, pas
  socket.io) enregistré dans `main.ts`. Convention de message : `{ event, data }`.
- La connexion à la découpeuse ne s'ouvre pas uniquement sur un message `connect` —
  voir `AutoConnectService` plus haut, qui l'ouvre de lui-même dès que le port série
  configuré redevient accessible.
- Client → serveur : `connect`, `disconnect`, `sendCommand({ command })`,
  `deleteGcodeFile`, `startFrame`, `stopFrame`, `startCheck`, `startJob`, `stopJob`,
  `pauseJob`, `resumeJob`.
- Serveur → client :
  - `status` (`MachineStatusPayload { connected, grbl }`) — poll every 1s tant que
    connecté + broadcast immédiat sur tout changement d'alarme, dédupliqué sinon.
  - `serial` (`SerialMessagePayload { direction: 'sent'|'received', timestampMs,
dataBase64 }`) — rejoue en direct absolument tout ce qui transite sur le port
    série (alimente l'onglet Terminal). Le payload est encodé en base64 pour rester
    "binary-safe" même si GRBL renvoie un jour des octets non-ASCII.
  - `gcodeFile` (fichier G-code actuellement uploadé), `checkResult` (état d'un run
    `$C`), `jobStatus` (`JobStatusPayload { running, paused, fileName, currentLine,
totalLines, error }` — progression d'un job en cours, voir `JobService` plus
    haut ; surfacé à la fois par la flashcard du menubar et la card "Gcode file" de la
    page Operation).
- Le statut renvoyé applique le verrou d'alarme logiciel (`applyAlarmLatch`) : tant que
  `CutterCommunicationService.isAlarmed()` est vrai, l'état renvoyé au client est forcé
  à `Alarm`, quoi que rapporte réellement GRBL.

## Frontend (Angular + Optimus UI)

- **Shell** (`apps/frontend/src/app/shell/`) — menubar commun à toutes les pages, avec
  `MachineStatusFlashcard` à droite (`ng-template pTemplate="end"` du menubar) :
  visible depuis n'importe quelle page, affiche nom de la machine, statut GRBL sous
  forme de tag coloré (couleurs/libellés partagés avec `MachineStatusCard` via
  `GRBL_STATE_LABELS`/`GRBL_STATE_SEVERITIES` dans `machine-status.model.ts`), nom du
  fichier chargé, et — si un job est en cours — barre de progression + bouton d'arrêt
  d'urgence (icône octogone plein rouge, sans confirmation : un vrai bouton d'arrêt
  d'urgence n'attend pas de "êtes-vous sûr").
- **Page "Gcode"** (`/gcode`, `SvgToGcodePage`) — import SVG multi-documents, arbre des
  calques/groupes, sélection/déplacement/rotation des formes (drag + poignée de
  rotation), pan/zoom du canvas (molette + clic molette), undo/redo, "explode" d'un
  groupe en entités indépendantes, offset laser (compensation de trait de découpe,
  via `polygon-offset`, en tenant compte de l'imbrication des sous-chemins pour
  distinguer contour extérieur/trou), assignation de profils matériau par
  glisser-clic, export/vérification d'un "workspace SVG" (voir
  `docs/workspace-svg-format.md`). État persisté en `sessionStorage`
  (`webcutter.svg-to-gcode.workspace`) : sources SVG ré-aplaties au chargement plutôt
  que désérialisées telles quelles, pour rester cohérentes avec le code de parsing.
  - Visualisateur : quadrillage + légende + flèches d'axe toujours ancrés au coin/à
    l'origine choisie (`originPoint()`), inchangés par le décalage machine — un point
    bleu séparé (`homePoint()`) montre où `G0 X0 Y0` atterrit réellement compte tenu du
    décalage (voir plus haut).
  - Générateur de "pattern de test" (`TestPatternGeneratorService`) : grille de formes
    avec profils interpolant puissance/vitesse, légendes optionnelles. Profil des
    légendes/étiquette matériau fixé à 50% de puissance et 6000 mm/min, indépendant de
    la plage testée. L'unité "mm/min" (qui prend beaucoup de place) n'est plus répétée
    sur chaque ligne : un seul libellé en haut à gauche de la grille, au-dessus de la
    plus grande valeur.
  - Boutons "Save workspace SVG"/"Download G-code" : ouvrent un popover
    (`FilenamePopover`, `app-filename-popover`) demandant un nom de fichier avant le
    téléchargement, au lieu de toujours nommer "workspace.svg"/"workspace.gcode" (ce
    qui créait des doublons dans le dossier de téléchargement). ⚠️ Un `<form>` avec un
    champ lié par un simple `[formControl]` (sans `[formGroup]` sur le `<form>`
    lui-même) ne bloque pas la soumission native : `(ngSubmit)` ne se déclenche jamais
    et le navigateur recharge la page — toujours envelopper dans un vrai `FormGroup` +
    `[formGroup]` sur le `<form>`, jamais un `FormControl` nu avec `(ngSubmit)`.
- **Page "Operation"** (`/operation`, `OperationPage`) — toolbar + `p-splitter`
  25/75 :
  - Barre latérale gauche : `MachineStatusCard` (nom de la machine en header, statut
    connexion/GRBL sous forme de tag coloré, boutons Connect/Disconnect — désactivé
    pendant un job en cours, confirmation avant déconnexion) et `PositionCard`
    (position X/Y depuis `WPos` — relative à l'origine de la surface de découpe, donc
    négative si la tête est à gauche/en dessous de l'origine — avec repli sur
    `MPos` si le masque de rapport `$10` de la carte n'inclut pas `WPos`, D-pad
    de jog avec bouton central `$H`, pas réglable en mm ; jog désactivé pendant un job).
  - `GcodeFileCard` — infos du fichier chargé, boutons Start/Frame/Check quand rien ne
    tourne ; pendant un job : barre de progression + boutons Pause/Resume (feed
    hold/resume GRBL) et Abort (arrêt d'urgence, `JobService.stop()`, sans
    confirmation). Affiche l'erreur du dernier job en échec (arrêt anormal).
  - Panneau droit : onglets routés (`/operation/gcode` par défaut, `/operation/terminal`) :
    - `GcodeViewerPanel` — **implémenté** (n'est plus un placeholder) : prévisualisation
      du trajet du fichier G-code actuellement uploadé, rendu comme des `<line>` SVG
      dans le même composant de grille/caméra que la page Gcode
      (`gcode-program-parser.ts` parse le G-code — état modal X/Y/mode/F/S, un segment
      par `G0`/`G1`, arcs `G2`/`G3` non émis mais suivis pour la position — et
      `gcodeToBedPoint()` inverse la conversion bed→machine du générateur backend,
      décalage d'origine inclus). Filtres G0/G1 affichables, mode couleur
      plain/vitesse/puissance (dégradé sur toute la plage du fichier), slider limitant
      le nombre de segments affichés (utile sur un gros fichier).
    - `TerminalPanel` — historique complet des trames échangées avec la machine (icône
      de sens, timestamp HH:MM:SS.mmm, contenu ASCII ou hex si non imprimable), rendu
      via `p-scroller` (virtual scrolling, hauteur de ligne fixe 22px — donc le texte
      long est tronqué avec ellipsis plutôt que passer à la ligne) pour rester
      performant avec un historique important. Toggle "Autoscroll" (activé par défaut,
      désactivé par tout scroll manuel détecté en pixels, pas par index — le tolerance
      buffer du virtual scroller rend la détection par index peu fiable sur une petite
      liste), boutons "Clear" (vide l'historique en mémoire) et "Export" (télécharge
      `terminal.log`, une ligne par message : `[timestamp ISO 8601] -> ou <- contenu`),
      et champ de saisie pour envoyer une commande brute.
  - `CutterSocketService` — client WebSocket unique (`providedIn: 'root'`), signaux de
    statut/fichier/check/job (`jobStatus`) + `Subject` de messages série, reconnexion
    automatique.
- **Page "Configuration"** (`/configuration`) — réglages machine (card "Machine"
  organisée en accordéon par catégorie : Général, Coordinates, Laser, Speeds,
  Connection — voir les nouveaux champs machine plus haut), bibliothèque de
  matériaux/profils (vitesse en mm/min), blocs de G-code personnalisés (start/end).
  Libellés entièrement en anglais (langue officielle de l'application).
- Icônes : système Tabler "fait main" (`tabler-icon-paths.ts`), tracés SVG copiés
  directement depuis le package `@tabler/icons` plutôt qu'une dépendance dédiée (voir
  mémoire `project_frontend_stack_choices`).

## Pas encore fait

- File d'attente de jobs (un seul job actif à la fois) et historique des jobs passés.
- Logique de blocage automatique basée sur l'état `Door` (seul l'affichage existe).
- Application du miroir X/Y et de l'origine (`Machine.origin`, autre que le coin
  bas-gauche implicite) dans la génération réelle de G-code côté backend — ces
  réglages existent et s'affichent dans le visualisateur, mais
  `WorkspaceGcodeGeneratorService` ne les applique pas encore lui-même (seul le
  décalage `offsetXMm`/`offsetYMm` l'est).

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
