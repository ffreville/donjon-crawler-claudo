# Ennemis du jeu

Catalogue des ennemis « normaux » implémentés dans `src/core/entities.ts`
(données : `ENEMY_ARCHETYPES`) et `src/core/gameState.ts` (IA : `stepEnemies`,
hooks de mort). Les boss et mini-boss sont décrits à part dans `BOSSES.md`.

## Comment fonctionnent les ennemis

- **Archétypes en données.** Chaque type a des stats de base dans
  `ENEMY_ARCHETYPES` (PV, vitesse, rayon, dégâts de contact). Le comportement est
  piloté par le champ `kind` dans `stepEnemies`.
- **Dégâts de contact.** Toucher le joueur inflige `touchDamage`, puis le joueur
  est invulnérable un court instant (`PLAYER_IFRAMES = 0.8 s`). Aucun ennemi de
  base n'utilise `attack`/`defense` (réservés, à 0).
- **Apparition.** Les ennemis ne spawnent que dans les salles de combat
  (`normal`). Le nombre de base **scale avec l'aire de la salle** (≈ 1 ennemi
  par `TILES_PER_ENEMY = 70` tuiles), plus `+1 par étage`.
- **Montée en puissance.** Les PV augmentent de `ENEMY_HP_PER_FLOOR = 2` par
  étage (étage 1 = valeurs de base).
- **Knockback.** Toute larme touchée applique un recul qui s'amortit.
- **Période de grâce.** À l'entrée d'une salle, les ennemis sont figés
  `GRACE_PERIOD = 0.5 s` (ils encaissent le recul mais ne bougent/n'attaquent pas).

## Champs d'un archétype (`ENEMY_ARCHETYPES[kind]`)

| Champ | Type | Rôle |
|---|---|---|
| `hp` | `number` | Points de vie de base (avant scaling d'étage). |
| `speed` | `number` | Vitesse de déplacement (tuiles/seconde). |
| `radius` | `number` | Rayon de collision (tuiles). |
| `touchDamage` | `number` | Dégâts infligés au joueur au contact. |
| `attack` / `defense` | `number` | Réservés, à 0 pour tous les ennemis actuels. |

## Ennemis existants (8)

| `kind` | PV | Vitesse | Rayon | Contact | Comportement |
|---|---|---|---|---|---|
| `chaser` | 6 | 2.5 | 0.40 | 1 | Fonce en ligne droite sur le joueur. La menace de mêlée de base. |
| `swarmer` | 3 | 4.2 | 0.28 | 1 | Rapide et fragile ; submerge en nombre. |
| `shooter` | 5 | 1.8 | 0.40 | 1 | Garde ses distances et tire des projectiles. |
| `tank` | 14 | 1.2 | 0.60 | 2 | Lent, gros sac à PV, frappe fort. |
| `fly` | 2 | 3.6 | 0.26 | 1 | Vole vers le joueur avec une oscillation latérale (erratique). |
| `charger` | 8 | 1.6 | 0.42 | 1 | Télégraphe puis charge en ligne droite, puis récupère. |
| `exploder` | 4 | 2.6 | 0.34 | 1 | Poursuit, puis explose à la mort (dégâts de zone). |
| `splitter` | 8 | 2.2 | 0.42 | 1 | Poursuit, puis se scinde en deux `fly` à la mort. |

### Détails de comportement

- **shooter** : tente de tenir une distance de 5 tuiles (recule si trop près,
  avance si trop loin) et tire si le joueur est à moins de 8 tuiles. Projectiles :
  vitesse 7, 1 dégât, durée de vie 2.5 s, un tir toutes les 1.6 s
  (cadences décalées entre shooters).
- **fly** : oscillation perpendiculaire au cap (`FLY_WOBBLE_FREQ = 9`,
  `FLY_WOBBLE_AMP = 0.8`) → trajectoire non rectiligne.
- **charger** : cycle de 1.8 s — verrouille une direction, télégraphe 0.45 s
  (immobile), charge 0.4 s à la vitesse 9, puis dérive vers le joueur jusqu'au
  prochain cycle.
- **exploder** (Boom Fly) : à la mort, explosion qui touche le joueur s'il est
  dans un rayon de 1.6 tuile (1 dégât, respecte les i-frames). Ne touche pas les
  autres ennemis (pas de réaction en chaîne).
- **splitter** : à la mort, remplacé par `SPLITTER_CHILDREN = 2` `fly` (PV mis à
  l'échelle de l'étage), disposés autour de sa position.

## Apparition par étage (`kindPool`)

Le pool d'archétypes s'élargit avec la profondeur :

| À partir de l'étage | Types ajoutés au pool |
|---|---|
| 1 | `chaser`, `swarmer`, `fly` |
| 2 | `shooter`, `charger` |
| 3 | `tank`, `exploder` |
| 4 | `splitter` |

## Pour ajouter un ennemi

1. **kind** — ajoute la valeur au type `EnemyKind` (`entities.ts`).
2. **stats de base** — ajoute une entrée dans `ENEMY_ARCHETYPES` :
   `hp`, `speed`, `radius`, `touchDamage` (et `attack`/`defense` à 0).
3. **comportement** — décris l'IA voulue. Si elle se résume à « foncer sur le
   joueur », rien à coder (cas par défaut). Sinon, ajoute une branche dans
   `stepEnemies` (et, pour un effet à la mort, un hook dans `onEnemyDeath`).
   Les champs génériques `aiTimer` et `aiDir` sont disponibles pour la temporisation.
4. **apparition** — ajoute le `kind` au `kindPool` dans `populateRoom`, avec le
   palier d'étage souhaité.

Si l'ennemi a besoin d'un mécanisme inédit (téléportation, invocation, bouclier,
projectiles spéciaux, etc.), **signale-le** : il faudra étendre le cœur avant.

Pour chaque nouvel ennemi, fournis au minimum : un **nom/kind**, ses **stats**
(PV, vitesse, rayon, dégâts de contact), son **comportement**, et l'**étage**
d'apparition.
