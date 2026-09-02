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
    parsing gère ce cas (voir `grbl-status.parser.ts`). ⚠️ Seul l'*affichage* du statut
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
    machine se déclare "Idle" entre-temps.

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
- Import **SVG → G-code** : le pipeline actuel se limite à des segments de ligne
  droite (M/L) — les courbes/arcs ne sont pas supportés (`UNSUPPORTED_PATH_COMMAND`
  dans `WorkspaceCheckService`). Le flattening SVG → sous-chemins mm se fait
  entièrement côté frontend (`SvgFlattenerService`) ; le backend ne fait que valider
  un "workspace SVG" déjà aplati et annoté (voir `docs/workspace-svg-format.md`) avant
  génération du G-code.
- Bibliothèque de presets matériaux (`Material` → plusieurs `Profile` : mode
  LIGNE/REMPLISSAGE, puissance %, vitesse, passes, espacement de hachures) stockée en
  base et éditable depuis la page Configuration.
- La puissance d'un profil est un **pourcentage**, converti en valeur `S` du G-code en
  la mettant à l'échelle du `$30` (max spindle/laser) de GRBL, stocké côté `Machine`
  (`sMax`).

## Architecture backend (NestJS)

- `apps/backend/src/app/cutter/` — `CutterController` (REST : `/cutter/ports`,
  `/connect`, `/disconnect`, `/status`, `/command`) et `CutterGateway` (WebSocket temps
  réel, voir ci-dessous). Les deux appellent `CutterCommunicationService`.
- `libs/cutter-communication` — lib partagée, indépendante de NestJS :
  - `GrblConnection` — connexion série bas niveau (`serialport`), file de commandes
    ok/error, requêtes de statut temps réel (`?`), verrou logiciel d'alarme (voir
    plus haut). Émet `sent`/`received` (trafic brut, pour le terminal), `status`,
    `alarm`, `data`, `error`, `disconnected`.
  - `grbl-status.parser.ts` — parse un rapport `<État|MPos:...|WPos:...>`, y compris
    les sous-états `Door:n`/`Hold:n`.
  - `CutterCommunicationService` — wrapper Nest-injectable de `GrblConnection`.
- `apps/backend/src/app/machine/` — CRUD (TypeORM/SQLite) des réglages machine
  (dimensions du plateau, port série, bauds/dataBits/stopBits/parité, miroirs X/Y,
  origine, accélérations/vitesses max, `sMax`).
- `apps/backend/src/app/materials/` — CRUD matériaux + profils de découpe/gravure.
- `apps/backend/src/app/gcode/` — CRUD des blocs de G-code personnalisés injectés en
  début (`start`) / fin (`end`) de programme, avec un ordre d'exécution (`order`).
- `apps/backend/src/app/workspace-check/` — parse et valide un "workspace SVG" exporté
  par le frontend (profils manquants/inconnus, matériau non sélectionné, path hors
  plateau, paths qui se croisent, commandes de path non supportées) avant génération
  de G-code.
- Pas encore construit : génération effective du G-code à partir du workspace validé,
  streaming de jobs (file d'attente, avancement), historique de jobs.

### WebSocket (`CutterGateway`, `@nestjs/websockets` + `@nestjs/platform-ws`)

- Un seul gateway, chemin `/api/ws/cutter`, adapter `WsAdapter` (lib `ws` brute, pas
  socket.io) enregistré dans `main.ts`. Convention de message : `{ event, data }`.
- Client → serveur : `connect`, `disconnect`, `sendCommand({ command })`.
- Serveur → client :
  - `status` (`MachineStatusPayload { connected, grbl }`) — poll every 1s tant que
    connecté + broadcast immédiat sur tout changement d'alarme, dédupliqué sinon.
  - `serial` (`SerialMessagePayload { direction: 'sent'|'received', timestampMs,
    dataBase64 }`) — rejoue en direct absolument tout ce qui transite sur le port
    série (alimente l'onglet Terminal). Le payload est encodé en base64 pour rester
    "binary-safe" même si GRBL renvoie un jour des octets non-ASCII.
- Le statut renvoyé applique le verrou d'alarme logiciel (`applyAlarmLatch`) : tant que
  `CutterCommunicationService.isAlarmed()` est vrai, l'état renvoyé au client est forcé
  à `Alarm`, quoi que rapporte réellement GRBL.

## Frontend (Angular + Optimus UI)

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
- **Page "Operation"** (`/operation`, `OperationPage`) — toolbar + `p-splitter`
  25/75 :
  - Barre latérale gauche : `MachineStatusCard` (statut connexion/GRBL, boutons
    Connect/Disconnect, confirmation avant déconnexion) et `PositionCard` (position
    X/Y depuis `MPos`, D-pad de jog avec bouton central `$H`, pas réglable en mm).
  - Panneau droit : onglets routés (`/operation/gcode` par défaut, `/operation/terminal`)
    — `GcodeViewerPanel` (placeholder, pas encore implémenté) et `TerminalPanel`.
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
  - `CutterSocketService` — client WebSocket unique (`providedIn: 'root'`), signal de
    statut + `Subject` de messages série, reconnexion automatique.
- **Page "Configuration"** (`/configuration`) — réglages machine, bibliothèque de
  matériaux/profils, blocs de G-code personnalisés (start/end).
- Icônes : système Tabler "fait main" (`tabler-icon-paths.ts`), tracés SVG copiés
  directement depuis le package `@tabler/icons` plutôt qu'une dépendance dédiée (voir
  mémoire `project_frontend_stack_choices`).

## Pas encore fait

- Génération effective du G-code à partir d'un workspace validé, puis streaming du
  programme vers la machine avec suivi d'avancement en temps réel.
- File d'attente de jobs et historique.
- `GcodeViewerPanel` (contenu de l'onglet "G-code viewer" de la page Operation).
- Logique de blocage automatique basée sur l'état `Door` (seul l'affichage existe).

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

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
