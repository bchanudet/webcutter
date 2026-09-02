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
(`apps/backend/src/app/workspace-check/`) avec le corps `{ "svg": "<...>" }`. La réponse est
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
