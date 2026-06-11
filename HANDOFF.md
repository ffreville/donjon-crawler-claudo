# donjon-crawler-claudo — Project handoff / état du projet

> Document de passation pour reprendre le développement (humain ou autre agent).
> Date de rédaction : run en cours. Tests au vert : **135 passing**, lint + typecheck + build OK.

---

## 1. Ce qu'est le projet

Roguelite *twin-stick* 2D dans l'esprit de *The Binding of Isaac* : étages générés
procéduralement, combat temps réel, items à synergies, permadeath, **runs
reproductibles par seed**. Projet **perso** (sans rapport avec l'employeur).

Stack : **TypeScript strict + Vite + Phaser 3**, tests **Vitest** (unitaires sur le
cœur) + **Playwright** (smoke e2e). CI GitHub Actions (lint + typecheck + test + build).

## 2. LA règle qui gouverne tout : garder le cœur pur

Le code est en deux couches, la frontière est **sacrée** :

- **`src/core/` — la simulation.** TypeScript pur, **déterministe**. Le jeu EST ce
  code. **Aucune** dépendance à Phaser / DOM / navigateur. **Jamais** de
  `Math.random()`, `Date.now()`, horloge ni état ambiant — l'aléa passe par un `Rng`
  seedé. Même seed + mêmes entrées ⇒ même run.
- **`src/render/` — la couche Phaser.** Lit `GameState` et le dessine ; traduit
  l'input en mutations du cœur. **Ne possède aucun état de gameplay.**

Cet invariant est **vérifié par ESLint** (`no-restricted-imports` sur `src/core/**` :
un import Phaser/DOM/render dans le cœur = erreur de build). Le déterminisme rend le
cœur testable et rejouable en headless (sans GPU/navigateur) — c'est ce qui permet
aux agents IA de boucler.

## 3. Commandes & "definition of done"

```
npm run dev         # Vite, http://localhost:5173
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint (impose la pureté du cœur)
npm test            # Vitest (cœur)
npm run test:e2e    # Playwright (boot headless)
npm run build       # typecheck + build prod
```
DoD de tout changement : `npm run lint && npm run typecheck && npm test` au vert,
+ `npm run build` si render/config touché.

## 4. ⚠️ Pièges de tooling appris à la dure (À LIRE si tu es un agent)

1. **Ne PAS lancer `npm install` dans le dépôt depuis un sandbox Linux** : les
   binaires natifs (esbuild/rollup) seraient ceux de Linux et casseraient
   `npm run dev` sur le Mac de l'utilisateur. Le `node_modules` du repo appartient à
   la machine de l'utilisateur (macOS).
2. **Vérifier dans un scratch séparé.** Pattern utilisé : copier le projet dans
   `/tmp/verify`, y faire `npm install` (Linux), puis y copier `src`/`tests` et lancer
   lint/typecheck/test/build. Ça laisse le `node_modules` de l'utilisateur intact.
   `/tmp` peut être recyclé entre commandes → reconstruire si absent.
3. **Phaser réutilise les instances de scène** entre `scene.start/stop`. Les **champs
   d'instance survivent** (touches maintenues, flags `paused`/`endShown`, accumulateur).
   Toujours les réinitialiser dans `startRun()` (déjà fait) — ce piège nous a mordus 3 fois
   (touche collée, menu de fin fantôme, jeu relancé en pause).
4. **L'écriture dans `.claude/` est bloquée par le tool Write** (dossier protégé) :
   passer par le shell pour ces fichiers.

## 5. Architecture — fichiers du cœur (`src/core/`)

- **`rng.ts`** — `Rng` seedé (mulberry32) : `next/int/range/pick/chance/shuffle`.
- **`types.ts`** — `Vec2`, `Room`, `Dungeon`, `Direction`, `Door`, `Combatant`,
  `RoomType = 'start'|'normal'|'treasure'|'boss'|'shop'|'miniboss'`.
- **`physics.ts`** — collision AABB-vs-tuiles (`moveBody`), `aabbHitsWall`,
  `circlesOverlap`. (Hypothèse : déplacement < 1 tuile/tick — voir note knockback.)
- **`room.ts`** — grille de room (ring de murs), portes (`doorOpeningTile`,
  `doorWorldPos`, `carveDoor`, `entryPosition`, `opposite`). `ROOM_W=15, ROOM_H=9`.
- **`dungeon.ts`** — `generateDungeon(rng, opts)` : random-walk connexe ; boss =
  room la plus lointaine ; puis attribution des spéciales via un pool (feuilles
  d'abord) : `minibossRooms`, 1 shop, `treasureRooms`. `computeDoors`, `bfsDistances`,
  `directionTo`, `isConnected`.
- **`entities.ts`** — `Enemy` (kind, hp, vel, effects, knockback, bossVariant,
  bossSpin), `Projectile` (piercing/homing/hits/applies), `Pickup` (union discriminée :
  `ItemPickup|HeartPickup|CoinPickup|KeyPickup`), `StatusSpec/StatusEffect`,
  `ENEMY_ARCHETYPES`, factories `makeEnemy/makeProjectile/makePickup/makeHeart/makeCoin/makeKey`.
- **`status.ts`** — `applyStatuses` (refresh, pas de stacking infini), `slowFactor`,
  `hasStatus`.
- **`combat.ts`** — `resolveAttack`, `applyDamage`, `isDead`, `heal`.
- **`items.ts`** — `Item` (modifiers + `tearEffect` + `tearMods`), `ITEMS`,
  `ITEM_POOL`, `applyItem`, `MutableStats`.
- **`gameState.ts`** — LE cœur intégrateur : `GameState`, `Player`, `createGame`,
  `buildFloor`, `descendToNextFloor`, `populateRoom`, `enterRoom`, et `tick(state,
  input, dt)` qui orchestre tous les sous-systèmes (`stepPlayerMovement`,
  `stepPickups`, `stepFiring`, `stepEnemies`+`stepBossAttacks`, `stepProjectiles`,
  `stepStatuses`, `stepContactDamage`, `stepTraps`, `stepRoomClear`, `stepTeleporter`,
  `stepDoors`). Toutes les constantes de tuning y sont (voir §7).
- **`balance.ts`** — harness de simulation headless : `botPolicy` (bot kiter
  déterministe), `simulateEncounter`, `aggregateRuns`, `composeEnemies`. Sert à
  équilibrer par mesure, pas à l'œil.
- **`index.ts`** — surface publique ; **le render n'importe QUE depuis `../core/index.js`**.

### Render (`src/render/`)
- **`main.ts`** — config Phaser (`pixelArt: true`) ; scènes `[MenuScene, OptionsScene,
  GameScene]` ; canvas = `ROOM_W*TILE + PANEL_W` × `ROOM_H*TILE`.
- **`textures.ts`** — **toutes les textures sont générées procéduralement au boot**
  (pixel maps en chaînes + canvas, zéro asset externe, assets originaux) : tuiles
  sol/mur par thème (3 thèmes : étages 1-3 / 4-6 / 7-10, 4 variantes de sol seedées),
  sprites joueur + 5 archétypes d'ennemis, boss en gris clair (teinté par variante de
  pattern au rendu), larmes joueur/ennemi, cœurs plein/demi/vide, pièce, clé, orbe
  d'item (teinte stable par hash d'id) + piédestal, pics, portes ouverte/fermée
  (arche orientée par rotation), ombre, téléporteur, vignette. Idempotent
  (`textures.exists` guard — le TextureManager survit aux restarts de scène).
- **`GameScene.ts`** — boucle fixed-timestep (accumulateur), input physique
  (`event.code` → AZERTY ZQSD pour bouger, pavé num/flèches pour tirer), rendu de tout
  l'état en **sprites pixel-art** (joueur/ennemis/projectiles/pickups/pièges/
  téléporteur, ombres portées sous les entités), **HUD à la Isaac** (rangée de cœurs,
  compteurs pièces/clés à icônes, étage, bannière nom+description d'item au ramassage),
  **portes dessinées** (dalle de bois si salle non clear, cadre teinté par destination :
  rouge boss / orange mini-boss / or trésor / cyan shop), panneau de stats (toggle
  Options), minimap adaptative, barre de vie du boss, **feedback de hit** (chiffres de
  dégâts, flash blanc via `setTintFill`, screenshake ; statuts burn/slow rendus en
  tint orange/bleu — priorité : flash > burn > slow > variante boss), menu pause,
  menu de fin.
- **`MenuScene.ts` / `OptionsScene.ts` / `ui.ts`** — menus + boutons stylés partagés,
  réglages dans le `registry` Phaser (toggle "stats à droite").

## 6. État des fonctionnalités (TOUT ce qui est implémenté)

Boucle complète et jouable :

- **M1 — Simulation temps réel** : tick à pas fixe (1/60), joueur continu, collisions murs.
- **M2 — Combat** : tir twin-stick, projectiles, ennemis, dégâts de contact + i-frames.
- **M3 — Navigation** : portes calculées du graphe, salles verrouillées tant que pas
  *clear*, transitions, spawn par room seedé (`roomSeed(seed, floor, roomId)`,
  path-independent).
- **M4 — Cycle de run** : `status playing/dead/won`, mort à 0 PV, gel à la fin, restart.
- **M5 — Items & pickups** : items en données, treasure room donne un item, pickups
  (items/cœurs/pièces/clés).
- **M6 — Effets de statut** : `burn` (DoT) / `slow`, items fire-tears/frost-tears,
  **synergie** burn+slow = +50% (`BURN_SLOW_SYNERGY`).
- **M7 — Étages** : `MAX_FLOORS = 10`, donjon qui grossit par étage, HP/nombre
  d'ennemis qui montent, **téléporteur** posé quand le boss tombe → descend (ou victoire
  au dernier étage).
- **Boutique** : monnaie (pièces), shop room avec stock à prix (achat au contact si
  solvable).
- **Variété d'ennemis** : `chaser`, `swarmer` (rapide/fragile), `shooter` (kite + tire),
  `tank` (lent/costaud), `boss`. Composition par étage.
- **Boss à patterns** : 3 variantes (`BOSS_VARIANTS=3`) — 0 Bombardier (radiales/gerbe),
  1 Spirale (salves rotatives), 2 Barrage (shotgun visé + anneau). Le boss d'étage cycle
  par étage ; les mini-boss tirent une variante au hasard seedé. Barre de vie boss au rendu.
- **Mini-boss rooms** : boss-pattern affaibli au centre, pas de téléporteur.
- **Pièges (pics)** : dans 40% des rooms normales, 2-5 pics, dégâts au contact, neutralisés
  pendant la grâce.
- **Modificateurs de tir** : multishot (`split-shot`/`triple-shot`), perçant
  (`piercing-tears`), homing (`homing-tears`).
- **Clés** : pickup `key`, ramassé par 1, drop 35% au clear. **Usage non défini** (à câbler).
- **Game feel** : grâce d'entrée 0,5 s (ennemis gelés), **knockback** (recul des ennemis
  touchés, boss résistant ×0,2), feedback de hit.
- **Direction artistique pixel-art** (style évocateur d'Isaac, assets 100% originaux
  générés au boot, voir `textures.ts`) : sols/murs texturés par thème d'étage, vignette,
  sprites distincts par archétype, ombres, portes visibles ouvertes/fermées teintées par
  destination, items sur piédestal, HUD cœurs/pièces/clés, bannière d'item ramassé.
  Sprites **statiques** (pas d'animations de marche/mort), menus non restylés.
- **Menus** : principal (Nouvelle partie / Options), pause (Échap : Reprendre / Options /
  Menu principal), options (toggle stats), fin de run (Rejouer / Menu principal).
- **Minimap** : graphe des rooms, room courante, types colorés, visitées vs inconnues,
  marqueurs de porte boss (rouge) / mini-boss (orange), taille adaptative.

## 7. Constantes de tuning (toutes dans `gameState.ts`)

| Constante | Valeur | Rôle |
|---|---|---|
| `FIXED_DT` | 1/60 | pas de simulation |
| `PLAYER_SPEED` / `PLAYER_RADIUS` | 6 / 0.35 | joueur |
| `PLAYER_TEAR_DAMAGE` / `PLAYER_FIRE_RATE` | 3 / 3 | tir de base |
| `PLAYER_IFRAMES` | 0.8 | invulnérabilité après coup |
| `PROJECTILE_SPEED` / `PROJECTILE_LIFE` | 12 / 1.2 | tirs joueur |
| `GRACE_PERIOD` | 0.5 | délai d'entrée (ennemis gelés) |
| `KNOCKBACK_SPEED` | 12 | recul (friction interne 14/s) |
| `MAX_FLOORS` | 10 | étages pour finir |
| `ENEMY_HP_PER_FLOOR` | 2 | scaling PV ennemis |
| `HEART_DROP_CHANCE` / `HEART_HEAL` | 0.3 / 1 | cœurs |
| `COIN_DROP_MAX` | 3 | pièces (1..3 par clear) |
| `KEY_DROP_CHANCE` | 0.35 | clés (1 par clear, chance) |
| `TRAP_ROOM_CHANCE` / `TRAP_MIN..MAX` / `TRAP_DAMAGE` | 0.4 / 2..5 / 1 | pièges |
| `ENEMY_SHOT_*` | 7 / 1 / 2.5 / 1.6 | projectiles ennemis (shooter) |
| `BOSS_VARIANTS` | 3 | nb de patterns de boss |
| `BURN_SLOW_SYNERGY` | 1.5 | synergie |
| `MULTISHOT_SPREAD` / `HOMING_TURN_RATE` | 0.26 / 7 | mods de tir |

Scaling spéciales (dans `buildFloor`) : `roomCount +3/étage`, `mapSize +2/étage`,
`treasureRooms` 1(ét.1-3)→2(4-6)→3(7-10), `minibossRooms` 1(1-4)→2(5-10).
Boss HP 30 + 15/étage ; mini-boss 16 + 8/étage (non exportés, dans `gameState.ts`).

## 8. Inventaire de contenu

- **Items** (`ITEMS`) : `sharp-tears` (+3 dmg), `swift-boots` (+1.5 vitesse),
  `rapid-fire` (+1.5 cadence), `vitality` (+2 PV max), `fire-tears` (burn),
  `frost-tears` (slow), `split-shot` (+1 tir), `triple-shot` (+2 tirs),
  `piercing-tears` (perçant), `homing-tears` (homing).
- **Ennemis** : chaser/swarmer/shooter/tank/boss (`ENEMY_ARCHETYPES`).
- **Rooms** : start/normal/treasure/shop/miniboss/boss.

## 9. Tests (135, Vitest) — `src/core/*.test.ts`

rng, physics, combat, combatSystems, dungeon, roomNav, gameState, runLifecycle,
items, hearts, shop, status, floors, enemyTypes, boss, tearMods, knockback, grace,
traps, keys, balance. + `tests/e2e/smoke.spec.ts` (boot/canvas).
Chaque système a un test de **déterminisme** (même seed → même résultat).

## 10. L'équipe d'agents (`.claude/`)

Subagents = coutures d'archi, pas des métiers : `procgen-engineer`,
`content-balance-designer`, `code-reviewer` (lecture seule), `qa-tester`. Commandes :
`/test`, `/build`, `/new-system`.
**Important** : en **Claude Code (CLI)** ils sont auto-routés. En **Cowork** ils ne se
déclenchent PAS automatiquement — le thread principal lit le brief
`.claude/agents/<name>.md` et délègue à un worker générique amorcé avec ce brief.
Le `CLAUDE.md` documente cette convention.

## 11. Conventions de code

- TS strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` (`import type` pour les
  types). Imports relatifs en `.js`.
- Cœur : fonctions pures, état mutable threadé explicitement, `Rng` passé en paramètre.
- Patterns récurrents à respecter :
  - **Runtime par room** : `roomRuntimes: Map<RoomId, RoomRuntime>` (enemies/pickups/traps),
    `state.enemies/pickups/traps` **aliasent** le runtime courant → suppression **en place**
    (`splice`), jamais de réassignation (sinon désync de l'alias).
  - **Aléa de contenu** : `roomSeed(seed, floor, roomId)` / `rewardSeed(...)` — local et
    déterministe, **jamais** le `state.rng` partagé dans `tick`.
  - **Grâce** : `stepEnemies(state, dt, active)` gèle IA/attaques quand `!active` mais le
    knockback s'applique toujours ; dégâts contact/pièges gelés via `if (enemiesActive)`.
  - **i-frames partagées** : contact puis pièges, dans cet ordre (commentés).

## 12. Décisions ouvertes / pistes restantes (À DONNER AU PROCHAIN CHAT)

**Décisions en attente :**
- **Usage des clés** : ramassées et comptées (`player.keys`), HUD OK, mais ne servent à
  rien encore. À câbler (portes/coffres verrouillés). `KEY_DROP_CHANCE` ajustable.
- **Plusieurs vrais boss par étage ?** Demandé mais ambigu : actuellement **1 boss
  d'étage** (= sortie/téléporteur, gardé unique) + N mini-boss. Si on veut plusieurs
  vrais boss, repenser la sortie (téléporteur seulement après le dernier boss tué).
- **Mini-boss = sprite boss teinté par variante** (réutilise `kind:'boss'`, donc même
  texture/teinte que le boss d'étage) alors que sa porte/minimap sont orange : petite
  incohérence visuelle assumée. À distinguer au niveau entité si gênant.
- **Équilibrage profond** : `frost-tears` quasi inerte en solo (intérêt = synergie) ;
  `vitality`/`swift-boots` invisibles à la métrique `hpLost` (faudrait une métrique
  "morts évitées"). PV au boss étage 10 ≈ 165 — vérifier que ça reste fun.

**Pistes non commencées (par valeur perçue, mon avis) :**
1. **Dash/esquive** — explicitement **réservé comme pouvoir futur** (pas par défaut).
2. **Méta/rejouabilité** (bon marché grâce au déterminisme) : saisie de seed + run du
   jour, écran de score/run, personnages multiples, sauvegarde (le `GameState` est
   sérialisable par design).
3. **Polish** : ~~sprites~~ (fait, procédural — voir `textures.ts`) ; restent
   **animations** (bob de marche, mort, splash de larme à l'impact, frames d'ennemis),
   particules, son/musique, restyle des menus. Le pipeline pixel-map rend les frames
   d'animation faisables en procédural ; le son reste la vraie zone faible des agents.
   Vérification visuelle praticable : screenshots Playwright headless (pattern utilisé :
   `vite preview` + script playwright dans `/tmp/verify`).
4. **Tests e2e Playwright** sur les flux menus/pause (zone qui a régressé plusieurs fois).
5. **Effets de statut** supplémentaires (poison, étourdissement), plus de synergies nommées.
6. **Obstacles intérieurs** dans les rooms (les pièces sont des rectangles vides) — les
   shooters tirent sans ligne de vue car rien à bloquer aujourd'hui.

## 13. Démarrage rapide pour reprendre

```
git clone … && cd donjon-crawler-claudo
npm install          # (sur ta machine ; pas dans un sandbox Linux)
npm run dev          # jouer : ZQSD bouge, flèches/pavé num tire, Échap pause
npm test             # 135 tests
```
Pour ajouter un système : `/new-system <nom>` (ou lire un brief d'agent), garder le cœur
pur + déterministe, ajouter un test de déterminisme, faire passer lint+typecheck+test.
