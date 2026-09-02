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
- **Stockage** : SQLite (Prisma ou TypeORM) — pas besoin de plus, usage local mono-utilisateur
- **Temps réel** : WebSocket (`@nestjs/websockets`) pour diffuser statut/position à l'UI

NOTE: n'utilise JAMAIS pnpm, seulement npm.

## Matériel cible

- Découpeuse **Atomstack**, firmware **GRBL**
- Connexion **USB série**
- Sécurité déjà gérée au niveau matériel par la machine :
  - coupure automatique en cas de surchauffe
  - coupure automatique en cas d'ouverture de porte
  - **⚠️ à vérifier avant de concevoir la logique de détection côté logiciel** : GRBL 1.1+
    a une feature "Safety Door" qui remonte un état `Door` dans les rapports de statut
    (`?`), MAIS certains clones/cartes coupent au niveau matériel sans que GRBL ne le
    sache — dans ce cas rien ne remonte sur le port série. **Tester physiquement**
    (ouvrir la porte pendant un job, observer si l'état retourné par `?` change) avant
    de bâtir une quelconque logique dessus.

## Contraintes de déploiement

- Usage **local uniquement**
- **Pas d'authentification**, pas de gestion multi-utilisateurs
- Pas de besoin de sécurité applicative avancée (réseau non exposé)

## Points techniques clés à ne pas oublier

- **Protocole GRBL character-counting** : le buffer RX de GRBL fait 128 octets. Il faut
  compter les octets envoyés vs les `ok`/`error` reçus pour ne jamais le saturer — c'est
  le problème équivalent à celui résolu par OctoPrint côté Marlin. C'est la première
  brique technique à construire, tout le reste (streaming de jobs, statut temps réel)
  en dépend.
- Import **SVG → G-code** : parsing des tracés, application de presets
  (matériau + type d'opération [découpe / gravure] → puissance / vitesse / nombre de
  passes), génération du G-code.
- Bibliothèque de presets matériaux stockée en base (éditable depuis l'UI).

## Architecture backend (NestJS) envisagée

- `SerialService` — connexion série persistante, singleton hors cycle requête/réponse
- `GcodeStreamerService` — gestion du buffer GRBL, file de commandes, streaming de jobs
- `StatusGateway` — WebSocket, diffusion temps réel (position, état machine, avancement)
- `SvgToGcodeService` — parsing SVG + application presets + génération G-code
- Modules presets matériaux / historique de jobs (CRUD simple sur SQLite)

## Frontend (Angular) envisagé

- Dashboard : contrôle jog, console de commandes, statut live (via WebSocket)
- Import SVG + prévisualisation des trajectoires (Canvas)
- Gestionnaire de presets matériaux
- File d'attente de jobs + historique

## État d'avancement / prochaine étape

À définir ensemble au démarrage du dev : par quel bloc commencer parmi
communication série GRBL, pipeline SVG → G-code, ou structure globale du repo Nx.

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
