# Personnages jouables

Catalogue des personnages sélectionnables au début d'une run, définis dans
`src/core/characters.ts`. La source de vérité reste ce fichier `.ts` ; ce document
sert de référence de design.

## Comment ça fonctionne

- **Sélection au lancement.** Menu → « Nouvelle partie » → écran *Choisis ton
  personnage*. Chaque carte montre le sprite, les stats et l'équipement de départ.
  Le personnage choisi est conservé au « Rejouer ».
- **Données pures.** Un personnage est un ensemble de **stats de base absolues**
  (qui remplacent les valeurs par défaut) plus un **équipement de départ**
  optionnel (objets passifs/familiers, un objet actif, pièces, clés). Tout est
  appliqué dans `createGame` via `applyCharacter`.
- **Design unique.** Chaque personnage a sa propre texture pixel-art
  (`player-<id>`), utilisée en jeu comme sur l'écran de sélection.
- **Tous démarrent avec une Spyglass** (+1 portée). Le `createGame` sans
  `characterId` reste la *baseline neutre* (utilisée par les tests et les
  simulations d'équilibrage) ; un personnage n'est appliqué que lorsqu'il est
  explicitement choisi.

## Stats de base (référence)

| Stat | Base | Note |
|---|---|---|
| `maxHp` | 6 | PV max (et PV de départ). |
| `speed` | 6 | Déplacement (tuiles/s). |
| `tearDamage` | 3 | Dégâts de larme. |
| `tearRange` | 4 | Portée des larmes (tuiles). |
| `fireRate` | 3 | Cadence (tirs/s). |
| `shotCount` | 1 | Larmes par tir. |

## Champs d'un personnage (`Character`)

| Champ | Type | Rôle |
|---|---|---|
| `id` | `string` | Identifiant unique (kebab-case) ; sert de clé et de suffixe de texture. |
| `name` | `string` | Nom affiché. |
| `blurb` | `string` | Pitch d'une ligne sur l'écran de sélection. |
| `stats` | `CharacterStats?` | Surcharges **absolues** des stats de base (maxHp, speed, tearDamage, tearRange, fireRate, shotCount). |
| `items` | `string[]?` | Objets passifs/familiers de départ (ids), appliqués dans l'ordre. |
| `activeItem` | `string?` | Objet actif de départ (placé dans le slot, chargé à fond). |
| `coins` | `number?` | Pièces de départ. |
| `keys` | `number?` | Clés de départ. |

## Personnages existants (8)

| ID | Nom | Stats (vs base) | Départ | Design | Idée |
|---|---|---|---|---|---|
| `wanderer` | The Wanderer | — (base) | — | aventurier (peau claire / tunique brune) | équilibré, pour apprendre |
| `brute` | The Brute | PV 8, dmg 5, vit 5, **portée 3** | **Mom's Knife** (test, à retirer avant la v1) | casque acier + plastron rouge | tank cogneur, lent et courte portée |
| `scout` | The Scout | PV 4, vit 7.5, **portée 7**, dmg 2 | — | capuche verte pointue | rapide/longue portée, fragile |
| `tinker` | The Tinker | PV 5, cadence 4 | Reroll Die (actif) + 3 pièces | lunettes laiton | utilitaire, tir rapide |
| `hoarder` | The Hoarder | PV 5 | familier Flying Key + 4 pièces + 1 clé | robe dorée + emblème pièce | économie |
| `gemini` | The Twins | PV 5, **2 tirs**, dmg 2 | — | deux têtes violettes, un seul corps | spray de larmes, dégâts faibles par tir |
| `ember` | The Pyromancer | PV 5, dmg 2 | objet Fire Tears (brûlure) | flamme sur la tête + robe rouge | DoT/brûlure, hit direct faible |
| `wraith` | The Wraith | PV 4, vit 6.5 | objet Wings (vol) | fantôme pâle aux bords effilochés | ignore les pièges au sol, fragile |

> Note d'équilibrage : ce sont des chiffres de premier jet, faits pour être
> ajustés. Le Wanderer servant de baseline, les simulations d'équilibrage
> (`balance.ts`) tournent sur lui par défaut.

## Pour ajouter / modifier un personnage

Pour chaque personnage, fournis : un **id** unique, un **nom**, un **blurb**, les
**stats** voulues (en valeurs absolues, seulement celles qui changent), et
l'**équipement de départ** éventuel (objets/familiers via leurs ids, un objet
actif, pièces, clés).

Les objets et familiers de départ référencent les ids du catalogue `ITEMS.md`
(ex. `reroll-die`, `flying-key`, `sharp-tears`). Un objet de départ inexistant
est simplement ignoré. Pour un nouveau **design**, il faut aussi ajouter une
texture `player-<id>` (map pixel-art + palette) dans `src/render/textures.ts`.
