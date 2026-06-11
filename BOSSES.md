# Boss et mini-boss

Catalogue des boss implémentés dans `src/core/gameState.ts` (spawn dans
`populateRoom`, patterns dans `stepBossAttacks` et `bossBombardier` /
`bossSpiral` / `bossBarrage`). Les ennemis normaux sont décrits dans `ENEMIES.md`.

## Comment fonctionnent les boss

- **Un seul `kind`, des variantes.** Boss et mini-boss partagent le `kind: 'boss'`
  et la même mécanique de patterns ; ils diffèrent par leurs PV et leur
  `bossVariant` (0, 1, 2).
- **Trois phases par variante.** L'agressivité monte par paliers de PV : phase 1
  au-dessus de 66 % PV, phase 2 entre 33 % et 66 %, phase 3 sous 33 %. La cadence
  de tir se raccourcit à mesure que le boss est blessé.
- **Déterministe.** Le pattern dépend de `bossVariant` + ratio de PV, la
  temporisation de `fireCooldown` — aucune randomisation pendant le tick.
- **Projectiles de boss** : vitesse 6, 1 dégât, durée de vie 3 s.
- **Salle à une seule porte.** Les salles de boss et de mini-boss n'ont qu'une
  entrée (cul-de-sac).

## Boss d'étage

- **Un par étage**, dans la salle la plus éloignée du départ.
- **PV** : `BOSS_HP_BASE (30) + (étage − 1) × BOSS_HP_PER_FLOOR (15)`
  → 30 à l'étage 1, 45 à l'étage 2, etc.
- **Variante** : cycle déterministe par étage, `(étage − 1) % 3`.
- **Placement** : le boss apparaît en haut au centre (`BOSS_SPAWN`), le joueur
  entre toujours en bas au centre (`BOSS_ROOM_ENTRY`), loin de lui — quelle que
  soit la porte empruntée.
- **Récompense** : à sa mort, il **lâche un objet** (réservé depuis le sac de la
  run, donc unique ; un cœur si le sac est vide), déposé au centre de la salle,
  gratuit. Un **téléporteur** apparaît aussi là où il se tenait ; l'atteindre
  descend à l'étage suivant (ou gagne la partie au dernier étage). La salle reste
  ouverte pour permettre un retour en arrière avant de descendre.

## Mini-boss

- **1 par étage jusqu'à l'étage 4, puis 2.**
- **PV** : `MINIBOSS_HP_BASE (16) + (étage − 1) × MINIBOSS_HP_PER_FLOOR (8)`.
- **Stats** : rayon 0.55, vitesse 1.6, dégâts de contact 2.
- **Variante** : tirée au hasard (seedé) dans la salle — un même étage peut donc
  montrer des patterns différents d'une salle de mini-boss à l'autre.
- **Pas de téléporteur ni de drop d'objet** : seul le boss d'étage en fait
  apparaître un et lâche un objet (les mini-boss peuvent juste lâcher cœur/pièce/clé
  via le tirage de récompense des salles).

## Les trois variantes de pattern

Toutes tirent des projectiles ; `radial(n, offset)` = `n` projectiles répartis
sur un cercle, `aimed(n, spread)` = `n` projectiles en éventail vers le joueur.

### Variante 0 — Bombardier

| Phase (PV) | Attaque | Cadence |
|---|---|---|
| > 66 % | Salve radiale de 8 | toutes les 1.8 s |
| 33–66 % | Éventail visé de 5 (spread 0.28) | toutes les 1.3 s |
| < 33 % | Salve radiale dense de 12 (légèrement tournée) | toutes les 0.9 s |

### Variante 1 — Spirale

| Phase (PV) | Attaque | Cadence |
|---|---|---|
| > 66 % | Radiale de 3 bras, angle de base qui tourne (+0.5 rad/volée) | toutes les 0.4 s |
| 33–66 % | Radiale de 4 bras tournants | toutes les 0.4 s |
| < 33 % | Radiale de 5 bras tournants | toutes les 0.28 s |

### Variante 2 — Barrage

| Phase (PV) | Attaque | Cadence |
|---|---|---|
| > 66 % | Éventail visé de 3 (spread 0.16) | toutes les 1.1 s |
| 33–66 % | Éventail visé de 5 | toutes les 1.1 s |
| < 33 % | Éventail visé de 7 **+ anneau radial de 10** (panique) | toutes les 0.7 s |

## Pour ajouter un boss / une variante

Deux cas :

1. **Nouvelle variante de pattern** (le plus simple) : passe `BOSS_VARIANTS` à 4,
   ajoute une fonction `bossXxx(state, boss, aim, ratio)` sur le modèle des trois
   existantes (3 phases, cadence décroissante), et branche-la dans
   `stepBossAttacks`. Elle entrera automatiquement dans le cycle des étages et
   dans le tirage des mini-boss.

2. **Boss à mécanique inédite** (invocation d'adds, charge, zones au sol,
   plusieurs phases de déplacement, etc.) : **signale-le** — il faudra étendre le
   cœur (mouvement du boss, nouveaux types de projectiles/effets) au-delà du
   simple ajout de pattern.

Pour chaque proposition, fournis au minimum : le **rôle/thème**, le **comportement
par phase** (idéalement les 3 paliers de PV), les **PV** voulus (ou la formule de
scaling), et si c'est un **boss d'étage** (avec téléporteur) ou un **mini-boss**.
