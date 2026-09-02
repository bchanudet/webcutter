# Format du SVG exporté ("Save workspace SVG")

Ce document décrit le format du fichier SVG produit par le bouton **Save workspace SVG** de
l'onglet **Gcode** (`apps/frontend/src/app/features/svg-to-gcode/svg-to-gcode.page.ts`,
méthode `buildWorkspaceSvg()`). Il sert de référence si ce format doit évoluer, et de
documentation pour toute réimportation future de ce fichier dans l'application.

## Vue d'ensemble

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400mm" height="300mm" viewBox="0 0 400 300">
  <metadata>
    <webcutter xmlns="https://webcutter.infogones.com/ns/workspace">
      <version>1</version>
      <profiles>
        <profile id="3" materialId="1" name="Découpe 3mm" color="#ff0000" type="LINE"
                  powerPercent="80" speedMmPerSec="12" passes="1" />
        <profile id="5" materialId="1" name="Gravure" color="#0000ff" type="FILL"
                  powerPercent="40" speedMmPerSec="150" passes="1" lineSpacingMm="0.1" />
      </profiles>
      <material id="1" name="Contreplaqué" thicknessMm="3" />
    </webcutter>
  </metadata>
  <g id="content">
    <path id="doc-0:shape:0" d="M 0 0 L 10 0 L 10 10 L 0 10 Z" fill-rule="evenodd"
          transform="matrix(1 0 0 1 0 0)" fill="none" stroke="#ff0000" stroke-width="0.3" profile="3" />
    <path id="doc-0:shape:1" d="M 20 20 L 30 20 L 30 30 L 20 30 Z" fill-rule="evenodd"
          transform="matrix(1 0 0 1 0 0)" fill="none" stroke="#FF7300" stroke-width="0.3" />
  </g>
</svg>
```

## Taille du document

- `width` / `height` (avec l'unité `mm`) et `viewBox="0 0 <width> <height>"` correspondent à la
  taille de la surface de la machine configurée (`Machine.bedWidthMm` / `Machine.bedHeightMm`,
  cf. `apps/frontend/src/app/features/configuration/machine/machine.model.ts`), **pas** à la
  taille du contenu dessiné. Un document exporté a donc toujours la taille du plateau de découpe,
  quelle que soit la taille réelle des tracés qu'il contient.
- Le repère est le même que celui affiché dans le visualisateur : origine en haut à gauche
  (0, 0), axe Y vers le bas, une unité SVG = 1 mm.

## `<metadata><webcutter>`

Toutes les métadonnées propres à Webcutter sont regroupées dans un unique noeud `<webcutter>`,
dans le namespace `https://webcutter.infogones.com/ns/workspace`, lui-même dans le `<metadata>`
standard du SVG. Cela permet à un lecteur SVG générique d'ignorer ce bloc sans erreur, tout en
gardant les données de session identifiables et non ambiguës pour Webcutter.

### `<version>`

Version du format de ces métadonnées (entier, actuellement `1`). À incrémenter si la structure
ci-dessous change de façon incompatible, pour permettre une éventuelle migration lors d'une
réimportation.

### `<profiles>` / `<profile>`

Un noeud `<profile>` par profil de découpe/gravure **effectivement utilisé** par au moins une
forme du document de travail (pas la bibliothèque complète des profils du matériau — seulement
ceux réellement assignés à une forme). Attributs, reflétant l'interface `Profile`
(`apps/frontend/src/app/features/configuration/materials/material.model.ts`) :

| Attribut         | Type   | Description                                                        |
|------------------|--------|----------------------------------------------------------------------|
| `id`             | number | Identifiant du profil en base                                       |
| `materialId`     | number | Identifiant du matériau auquel appartient ce profil                 |
| `name`           | string | Nom du profil                                                        |
| `color`          | string | Couleur (code CSS, ex. `#ff0000`) utilisée pour l'affichage          |
| `type`           | string | Mode de découpe : `LINE` (contour, la forme est découpée) ou `FILL` (surface, la forme est gravée/remplie) |
| `powerPercent`   | number | Puissance laser, en pourcentage                                     |
| `speedMmPerSec`  | number | Vitesse de déplacement, en mm/s                                     |
| `passes`         | number | Nombre de passes                                                     |
| `lineSpacingMm`  | number | *(optionnel)* Espacement des lignes de hachurage, si mode `FILL`     |

Un profil peut appartenir à un matériau différent du matériau sélectionné pour le document (s'il
a été assigné avant un changement de matériau) : la liste est construite en cherchant l'id du
profil dans l'ensemble des matériaux connus, pas uniquement dans le matériau courant.

### `<material>`

Un unique noeud `<material>` si un matériau est sélectionné pour le document de travail
(absent sinon) :

| Attribut       | Type   | Description                                   |
|----------------|--------|------------------------------------------------|
| `id`           | number | Identifiant du matériau en base                 |
| `name`         | string | Nom du matériau                                 |
| `thicknessMm`  | number | Épaisseur du matériau, en mm                    |

## `<g id="content">`

Reprend exactement les formes affichées dans le groupe `id="content"` du visualisateur
(`svg-to-gcode.page.html`) : un `<path>` par `FlattenedShape` de chaque document chargé dans le
workspace, dans le même ordre, avec :

- `id` : identifiant stable de la forme (`FlattenedShape.id`, ex. `doc-0:shape:3`). C'est ce
  qu'utilise le point d'entrée de vérification (voir plus bas) pour nommer le path concerné par
  une erreur.
- `d` : la géométrie effective de la forme — la version compensée par le décalage laser (kerf)
  si un offset a été appliqué, sinon la géométrie brute. **Toujours composée uniquement de
  commandes `M`/`L`/`Z`** (pas de courbes ni d'arcs) : le flattener du frontend
  (`svg-flattener.service.ts`) échantillonne déjà toute courbe source en segments de ligne droite
  avant qu'un SVG de workspace ne soit produit — c'est ce qui permet au point d'entrée de
  vérification de rester une simple géométrie 2D côté serveur, sans réimplémenter de maths de
  courbes de Bézier/arcs en Node.
- `fill-rule="evenodd"` : permet aux sous-tracés imbriqués (trous) de se comporter comme de vrais
  trous.
- `transform` : la matrice combinant l'échelle du document (mise à l'échelle vers la largeur
  cible définie dans le formulaire de paramètres de découpe) et la transformation
  déplacement/rotation appliquée à son groupe dans le workspace.
- `fill` / `stroke` : couleur du profil assigné au groupe de la forme (`fill` pour un profil en
  mode `FILL`, `stroke` pour un profil en mode `LINE`) ; en l'absence de profil assigné,
  `stroke` retombe sur une couleur par défaut (`#FF7300`) — contrairement au visualisateur, ce
  fichier autonome n'a pas accès aux variables CSS de l'application.
- `profile` *(optionnel)* : si une forme a un profil assigné, cet attribut contient l'`id` de ce
  profil (référence au `<profile id="...">` correspondant dans `<metadata>`). Absent si aucun
  profil n'a été assigné à la forme.

Les groupes `id="ghost"` (aperçu du contour avant compensation de kerf) et `id="selection"`
(poignées de sélection de l'UI) du visualisateur ne sont **pas** exportés : ce sont des éléments
d'interface, pas du contenu du document de travail.

## Point d'entrée de vérification (`POST /api/workspace/check`)

Avant de générer un G-code, ce SVG peut être envoyé à `POST /api/workspace/check`
(`apps/backend/src/app/workspace/`) avec le corps `{ "svg": "<...>" }`. La réponse est
`{ "errors": [...] }` — un tableau vide signifie que le document est prêt pour la génération.
Chaque erreur a la forme :

```json
{ "code": "OUT_OF_BOUNDS", "message": "Le path \"doc-0:shape:1\" dépasse de la surface de découpe (400 x 300 mm).", "pathIds": ["doc-0:shape:1"] }
```

`pathIds` référence le(s) `id` de `<path>` concerné(s) (deux pour `PATH_INTERSECTION`, un seul
pour les autres codes). Codes possibles :

| Code                       | Condition                                                                 |
|----------------------------|-----------------------------------------------------------------------------|
| `MISSING_PROFILE`          | Un `<path>` n'a pas d'attribut `profile`.                                    |
| `UNSUPPORTED_PATH_COMMAND` | Le `d` d'un `<path>` contient autre chose que `M`/`L`/`Z` (courbe, arc).     |
| `UNKNOWN_PROFILE`          | L'`id` référencé par `profile` ne correspond à aucun `<profile>` déclaré.    |
| `NO_MATERIAL_SELECTED`     | Aucun `<material>` n'est présent alors qu'au moins un `<path>` référence un profil résolu. |
| `PROFILE_MATERIAL_MISMATCH`| Le `materialId` du profil utilisé par un `<path>` ne correspond pas à l'`id` du `<material>`. |
| `OUT_OF_BOUNDS`            | Au moins un point (après application du `transform`) tombe hors de `[0, width] x [0, height]`. |
| `PATH_INTERSECTION`        | Deux `<path>` indépendants ont des segments qui se croisent (ou se touchent en un point). Les sous-tracés d'un même `<path>` — p. ex. un contour et son trou — ne sont jamais comparés entre eux. |

Le serveur ne renvoie une erreur HTTP (400) que si le SVG lui-même est structurellement invalide
(XML illisible, `viewBox` absente, `<g id="content">` introuvable...) — les 7 règles ci-dessus
sont, elles, retournées en 200 sous forme de liste, puisqu'il s'agit de constats sur le contenu
et non d'une requête invalide.

## Point d'entrée de génération (`POST /api/workspace/generate`)

Même corps que `/check` (`{ "svg": "<...>" }`), même parsing et mêmes règles de validation —
`WorkspaceGcodeGeneratorService.generate()` (`apps/backend/src/app/workspace/`) commence par
appeler `WorkspaceCheckService.checkParsed()` sur le SVG déjà parsé, plus une règle
supplémentaire, propre à la génération :

| Code                  | Condition                                                                          |
|-----------------------|-----------------------------------------------------------------------------------|
| `INVALID_LINE_SPACING`| Un `<path>` utilise un profil `type="FILL"` dont `lineSpacingMm` est absent ou ≤ 0. |

La réponse est `{ "errors": [...], "gcode": "..." }` : si `errors` n'est pas vide, `gcode` vaut
`null` et rien n'est généré. Sinon, `gcode` contient le programme complet, structuré ainsi :

1. `$H` — homing, pour garantir que la tête est à l'origine avant de commencer.
2. Le code des hooks `start` (table `gcode`, `apps/backend/src/app/gcode/`), triés par leur champ
   `order` croissant.
3. Pour chaque `<path>`, dans l'ordre du document, le G-code de découpe/gravure (voir plus bas).
4. Le code des hooks `end`, triés par `order` croissant.
5. `M5` final, pour garantir que le laser est coupé même si un hook `end` a oublié de le faire.

### G-code par path

Pour chaque `<path>`, le profil résolu via son attribut `profile` fournit `powerPercent`,
`speedMmPerSec`, `passes` et (en mode `FILL`) `lineSpacingMm` :

- La puissance devient une valeur `S` : `S = round(powerPercent / 100 * machine.sMax)`
  (`sMax`, la config machine — voir la configuration de la machine dans l'UI).
- La vitesse devient un feed rate `F = round(speedMmPerSec * 60)` (mm/s → mm/min).
- Tout est répété `passes` fois.

**Profil `type="LINE"`** : chaque sous-tracé du path est suivi tel quel (`G0` jusqu'au premier
point, `M4 S<power>`, un `G1 ... F<feed>` par point suivant, puis `M5`) ; un sous-tracé fermé
reçoit un point de retour final identique à son point de départ, pour que la découpe boucle
réellement (la liste de points elle-même ne répète jamais le premier point).

**Profil `type="FILL"`** : la surface de la forme est remplie par des segments orientés à 45°,
espacés de `lineSpacingMm`, calculés par un algorithme de balayage (scanline) classique appliqué
dans un repère tourné de -45° : chaque ligne de balayage est intersectée avec tous les bords de
tous les sous-tracés du path, et les intersections triées sont appariées deux à deux
(pair = "dedans", impair = "dehors") — exactement la règle `evenodd` déjà utilisée pour l'affichage,
ce qui exclut nativement les trous (sous-tracés imbriqués) sans traitement particulier. Chaque
segment de hachurage est parcouru comme une ligne indépendante (`G0`/`M4`/`G1`/`M5`), et les
lignes de balayage successives alternent de sens pour limiter les déplacements à vide.

## Point d'entrée "Send to Operation" (`POST /api/workspace/send-to-operation`)

Même corps que `/check` et `/generate` (`{ "svg": "<...>" }`) et mêmes règles de validation —
`WorkspaceSendToOperationController` (`apps/backend/src/app/workspace/`) appelle directement
`WorkspaceGcodeGeneratorService.generate()` et, seulement si `errors` est vide, stocke le G-code
obtenu via `GcodeFileService.save()` (`apps/backend/src/app/gcode-file/`) : c'est le **même
service** que celui utilisé par l'upload manuel de l'onglet Operation, donc le fichier généré
devient immédiatement le "fichier G-code courant" de l'onglet Operation, et déclenche la même
diffusion WebSocket (`CutterGateway` écoute l'évènement `changed` de `GcodeFileService`) vers tous
les navigateurs connectés — sans que le G-code n'ait jamais à transiter par le navigateur qui a
fait la demande (contrairement à `/generate`, dont la réponse contient le G-code en clair).

Réponse : `{ "errors": [...], "file": ... }` — si `errors` n'est pas vide, `file` vaut `null` et
rien n'est stocké. Sinon, `file` est le `GcodeFileInfo` (`fileName`, `sizeBytes`, `commandCount`)
du fichier désormais actif, identique à ce que renvoie l'upload manuel.
