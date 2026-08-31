# Template de projet MonoRepo full TypeScript

Le monorepo est initialisé avec Nx.dev.

# Prérequis

Sur votre poste, vous devez avoir :
- Visual Studio Code (https://code.visualstudio.com/download)
- Docker (https://www.docker.com/products/docker-desktop/)
- L'extension Devcontainers (https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

# Ouverture du projet

- Ouvrez le dossier sur Visual Studio Code.
- Ouvrez la console de commandes avec le raccourci `CTRL + MAJ + P`
- Choisissez l'option **Dev containers: Rebuild container and Reopen folder**

# Commandes disponibles

- `ng` : CLI d'Angular
- `nest` : CLI de Nest
- `nx` : CLI de Nx.dev
- `prek` : utilitaire de pre-commit

# Extensions VS Code pré-intégrées

- Claude Code
- Angular Language Service
- ESLint
- GitLens
- NX Console
- SCSS Everywherre

# Pour ajouter les composants

### Projet frontend Angular

``> nx g @nx/angular:app apps/frontend``

### Projet backend Nest.js

L'option `--frontendProject` permet à NX de générer automatiquement le fichier `proxy.config.js` nécessaire pour 'proxyfier' les requêtes de /api vers le webservice nest.

``> nx g @nx/nest:app apps/backend --frontendProject frontend``
