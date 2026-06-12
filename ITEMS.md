# Objets du jeu

Catalogue des objets actuellement implémentés dans `src/core/items.ts`, plus le
format à respecter pour en ajouter. Ce fichier est une référence de design — la
source de vérité reste `items.ts`.

## Comment fonctionnent les objets

- **Données déclaratives.** Un objet est un ensemble de modificateurs appliqués
  au joueur au moment du ramassage (`applyItem`). Pas de code par objet : on
  décrit l'effet via des champs, ce qui les rend faciles à ajouter et à équilibrer.
- **Passifs ou actifs.** La plupart des objets sont des bonus passifs permanents
  qui s'empilent. Les objets **actifs** (champ `active`) sont *utilisables* : ils
  occupent un **slot unique**, se rechargent en nettoyant des salles, et
  produisent leur effet à la demande (touche Espace).
- **Un seul objet actif à la fois.** Ramasser un second objet actif **échange**
  les deux : l'ancien est déposé au sol, **gratuitement** (utile en boutique : ce
  qu'on repose ne se repaie pas). L'objet déposé n'est re-ramassable qu'après
  s'être écarté une fois (pas d'échange en boucle sous les pieds).
- **Un seul exemplaire par run.** Les objets sont tirés sans remise depuis un
  « sac » constitué au début de la partie : chaque objet n'est proposé qu'une
  fois sur toute la run (treasure + shop confondus).
- **Distribution.** Les objets apparaissent dans les *treasure rooms* (1 objet
  gratuit) et les *boutiques* (jusqu'à 2 objets payants). Les deux types de
  salles sont verrouillés et nécessitent une clé.

## Champs d'un objet (`Item`)

| Champ | Type | Rôle |
|---|---|---|
| `id` | `string` | Identifiant unique, en kebab-case (sert de clé et au tirage). |
| `name` | `string` | Nom affiché. |
| `description` | `string` | Texte affiché au ramassage. |
| `modifiers.maxHp` | `number?` | Ajout aux PV max (soigne d'autant). |
| `modifiers.speed` | `number?` | Ajout à la vitesse (tuiles/seconde). |
| `modifiers.tearDamage` | `number?` | Ajout aux dégâts de larme. |
| `modifiers.range` | `number?` | Ajout à la portée des larmes (en tuiles ; base 4). |
| `modifiers.fireRate` | `number?` | Ajout à la cadence (tirs/seconde). |
| `tearEffect` | `StatusSpec?` | Statut appliqué aux ennemis touchés (`burn` ou `slow`). |
| `tearMods.shotCount` | `number?` | Larmes supplémentaires par tir (spread). |
| `tearMods.piercing` | `boolean?` | Les larmes traversent les ennemis. |
| `tearMods.homing` | `boolean?` | Les larmes s'orientent vers les ennemis. |
| `flying` | `boolean?` | Vol : immunité aux pièges au sol (pics et trous). |
| `active.charge` | `number` | (objet actif) Salles à nettoyer pour se recharger. |
| `active.heal` | `number?` | (objet actif) Soigne ces PV à l'utilisation. |
| `active.coins` | `number?` | (objet actif) Donne ces pièces à l'utilisation. |
| `active.reroll` | `boolean?` | (objet actif) Re-tire les objets de la salle (treasure / shop). |
| `active.revealMap` | `boolean?` | (objet actif) Révèle tout l'étage sur la minimap (jusqu'à l'étage suivant). |
| `familiar.kind` | `FamiliarKind` | (familier) Type : droppers (`key/heart/coin-dropper`) ou tireurs (`wisp`, `owl`, `hornet`). |
| `familiar.interval` | `number?` | (dropper) Lâche son butin toutes les N salles nettoyées. |
| `familiar.damage` | `number?` | (tireur) Dégâts par larme. |
| `familiar.fireInterval` | `number?` | (tireur) Secondes entre deux salves. |
| `familiar.shots` | `number?` | (tireur) Larmes par salve (>1 = éventail). |
| `familiar.piercing` | `boolean?` | (tireur) Larmes perçantes. |
| `familiar.range` | `number?` | (tireur) Portée des larmes (tuiles). |
| `knife` | `boolean?` | Remplace les larmes par le couteau (lame de mêlée, voir plus bas). |
| `orbital` | `boolean?` | Accorde un orbital (mouche qui tourne autour du joueur et bloque un peu les tirs). |

`StatusSpec` = `{ kind: 'burn' | 'slow', duration: number /* s */, magnitude: number }`.
Pour `burn`, `magnitude` = dégâts/seconde ; pour `slow`, `magnitude` = multiplicateur
de vitesse dans `(0, 1)`.

## Objets existants (32)

### Stats de base

| ID | Nom | Effet | Champ(s) |
|---|---|---|---|
| `sharp-tears-xs` | Honed Tears | +1 dégât de larme | `modifiers.tearDamage: 1` |
| `sharp-tears-s` | Keen Tears | +2 dégâts de larme | `modifiers.tearDamage: 2` |
| `sharp-tears` | Sharp Tears | +3 dégâts de larme (passe le seuil one-shot sur les ennemis de base à 6 PV) | `modifiers.tearDamage: 3` |
| `swift-boots` | Swift Boots | +1.5 vitesse de déplacement | `modifiers.speed: 1.5` |
| `spyglass` | Spyglass | +1 portée des larmes | `modifiers.range: 1` |
| `telescope` | Telescope | +1.5 portée des larmes | `modifiers.range: 1.5` |
| `rapid-fire` | Rapid Fire | +1.5 cadence de tir | `modifiers.fireRate: 1.5` |
| `small-vitality-1` | Snack | +1 PV max (et soin équivalent) | `modifiers.maxHp: 1` |
| `small-vitality-2` | Sandwich | +1 PV max (et soin équivalent) | `modifiers.maxHp: 1` |
| `small-vitality-3` | Hot Soup | +1 PV max (et soin équivalent) | `modifiers.maxHp: 1` |
| `vitality` | Vitality | +2 PV max (et soin équivalent) | `modifiers.maxHp: 2` |

### Effets de larme (statuts)

| ID | Nom | Effet | Champ(s) |
|---|---|---|---|
| `fire-tears` | Fire Tears | Les larmes enflamment : 2 dégâts/s pendant 2 s | `tearEffect: { kind: 'burn', duration: 2, magnitude: 2 }` |
| `frost-tears` | Frost Tears | Les larmes ralentissent : vitesse ×0.5 pendant 2 s | `tearEffect: { kind: 'slow', duration: 2, magnitude: 0.5 }` |

> **Synergie burn + slow** : un ennemi à la fois en feu *et* ralenti subit +50 %
> de dégâts de brûlure (`BURN_SLOW_SYNERGY = 1.5`).

### Mise en forme des tirs

| ID | Nom | Effet | Champ(s) |
|---|---|---|---|
| `split-shot` | Split Shot | +1 larme en éventail | `tearMods.shotCount: 1` |
| `triple-shot` | Triple Shot | +2 larmes en éventail | `tearMods.shotCount: 2` |
| `piercing-tears` | Piercing Tears | Les larmes traversent les ennemis | `tearMods.piercing: true` |
| `homing-tears` | Homing Tears | Les larmes s'orientent vers les ennemis | `tearMods.homing: true` |

### Mobilité

| ID | Nom | Effet | Champ(s) |
|---|---|---|---|
| `wings` | Wings | Vol : immunité aux pics et aux trous | `flying: true` |

### Objets utilisables (actifs)

| ID | Nom | Effet | Champ(s) |
|---|---|---|---|
| `med-kit` | Med Kit | Actif : soigne 1 PV. Se recharge en 3 salles nettoyées. | `active: { charge: 3, heal: 1 }` |
| `reroll-die` | Reroll Die | Actif : re-tire les objets de la treasure room / shop courant. Recharge en 5 salles. | `active: { charge: 5, reroll: true }` |
| `lucky-coin` | Lucky Coin | Actif : donne 1 pièce. Recharge en 1 salle nettoyée. | `active: { charge: 1, coins: 1 }` |
| `dungeon-map` | Dungeon Map | Actif : révèle tout l'étage sur la minimap. Recharge en 6 salles. | `active: { charge: 6, revealMap: true }` |

### Tir spécial

| ID | Nom | Effet | Champ(s) |
|---|---|---|---|
| `knife` | Mom's Knife | Remplace les larmes par une **lame de mêlée** courte et de longueur fixe, orientée selon la direction prise, qui inflige des dégâts au contact (sans tirer). Maintenir une touche de tir **charge** (la lame **ne s'allonge pas**, elle reste en place) ; **relâcher la lance** : le couteau part dans la **direction chargée** (même si le joueur s'éloigne dans l'autre sens), file sur une distance proportionnelle à la charge, puis **revient** (touche chaque ennemi une fois à l'aller, une fois au retour). | `knife: true` |

> Réglages dans `gameState.ts` : `KNIFE_BASE_REACH` (portée au repos), `KNIFE_MAX_REACH`
> (chargée), `KNIFE_CHARGE_TIME` (durée de charge), `KNIFE_HALF_WIDTH` (épaisseur),
> `KNIFE_HIT_INTERVAL` (cadence de la lame tenue), `KNIFE_THROW_SPEED` (vitesse du
> lancer). Le couteau **bénéficie** des dégâts (`tearDamage`), des effets de larme
> (`tearEffect` brûlure/gel, appliqués au contact comme au lancer) et de la portée
> (`tearRange` étire la lame et la distance de jet). Il **ignore** cadence,
> multishot, perçant et autoguidage.

### Orbitaux

Tournent autour du joueur (espacés régulièrement : 2 = opposés, 3 = à 120°) et
**bloquent les projectiles ennemis** qu'ils interceptent. Hitbox volontairement
petite (`ORBITAL_BLOCK_RADIUS`) pour ne pas être trop fort. La **mouche** existe
en 3 exemplaires (ids distincts) → on peut en cumuler jusqu'à 3 par run.

| ID | Nom | Effet | Champ(s) |
|---|---|---|---|
| `orbital-fly-1` | Orbital Fly | Une mouche en orbite qui bloque un peu les tirs. | `orbital: true` |
| `orbital-fly-2` | Orbital Fly | (2ᵉ exemplaire) | `orbital: true` |
| `orbital-fly-3` | Orbital Fly | (3ᵉ exemplaire) | `orbital: true` |

> Réglages dans `gameState.ts` : `ORBITAL_RADIUS` (distance), `ORBITAL_SPEED`
> (vitesse de rotation), `ORBITAL_BLOCK_RADIUS` (taille de la hitbox de blocage).

### Familiers

Les familiers suivent le joueur. Les **droppers** lâchent un butin toutes les N
salles nettoyées ; les **tireurs** visent l'ennemi le plus proche à portée et
tirent à chaque tick selon leur cadence (leurs larmes sont « player-source »,
donc soumises à la collision habituelle). Tous sont permanents (conservés entre
les étages).

| ID | Nom | Effet | Champ(s) |
|---|---|---|---|
| `flying-key` | Flying Key | Familier : clé volante grise qui lâche une clé toutes les 3 salles nettoyées. | `familiar: { kind: 'key-dropper', interval: 3 }` |
| `beating-heart` | Beating Heart | Familier : petit cœur qui lâche un cœur toutes les 4 salles nettoyées. | `familiar: { kind: 'heart-dropper', interval: 4 }` |
| `gold-bug` | Gold Bug | Familier : insecte qui lâche une pièce toutes les 2 salles nettoyées. | `familiar: { kind: 'coin-dropper', interval: 2 }` |
| `spectral-wisp` | Spectral Wisp | Tireur : larmes régulières mono-cible (dmg 2, 0.6 s, portée 5). | `familiar: { kind: 'wisp', damage: 2, fireInterval: 0.6, range: 5 }` |
| `stone-owl` | Stone Owl | Tireur : tirs lents, lourds et perçants (dmg 5, 1.6 s, portée 7). | `familiar: { kind: 'owl', damage: 5, fireInterval: 1.6, piercing: true, range: 7 }` |
| `hornet-nest` | Hornet Nest | Tireur : éventail rapide et faible de 3 larmes (dmg 1, 0.5 s, portée 4). | `familiar: { kind: 'hornet', damage: 1, fireInterval: 0.5, shots: 3, range: 4 }` |

## Pour ajouter un objet

Pour chaque nouvel objet, fournis au minimum :

1. **id** — kebab-case, unique.
2. **nom** — affiché en jeu.
3. **description** — courte, affichée au ramassage.
4. **effet mécanique** — exprimé avec les champs ci-dessus si possible
   (`tearDamage`, `fireRate`, `speed`, `maxHp`, `shotCount`, `piercing`,
   `homing`, `flying`, ou un `tearEffect` `burn`/`slow`).

Si l'effet voulu n'est pas exprimable avec les champs existants (ex. : bombes,
larmes rebondissantes, bouclier, objet actif à charge, dégâts de contact, etc.),
**signale-le explicitement** : il faudra alors étendre le cœur (`items.ts` +
le système concerné) avant de pouvoir l'ajouter.
