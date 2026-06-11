import Phaser from 'phaser';

/**
 * Procedural pixel-art textures, generated once at boot into the Phaser
 * TextureManager. No external assets: every sprite is an original pixel map
 * or canvas drawing, evoking a dark "basement crawler" look.
 *
 * All textures are tiny (7–16 px) and upscaled by the renderer with
 * `pixelArt: true` (nearest-neighbour), which gives the chunky retro look.
 */

/** Number of floor-tile variants generated per theme. */
export const FLOOR_VARIANTS = 4;

/** Visual theme per floor band: 1-3 basement, 4-6 caves, 7-10 depths. */
export function themeForFloor(floor: number): number {
  if (floor <= 3) return 0;
  if (floor <= 6) return 1;
  return 2;
}

export function floorTileKey(theme: number, variant: number): string {
  return `floor-${theme}-${variant}`;
}

export function wallTileKey(theme: number): string {
  return `wall-${theme}`;
}

interface Theme {
  floorBase: string;
  floorDark: string;
  floorLight: string;
  mortar: string;
  brick: string;
  brickHi: string;
  brickLo: string;
}

const THEMES: Theme[] = [
  {
    // Basement: warm browns.
    floorBase: '#3b3127',
    floorDark: '#312820',
    floorLight: '#453a2d',
    mortar: '#241c13',
    brick: '#4d3e2c',
    brickHi: '#5d4c37',
    brickLo: '#3a2e20',
  },
  {
    // Caves: cold blue-grays.
    floorBase: '#2e3239',
    floorDark: '#262a30',
    floorLight: '#383d46',
    mortar: '#1a1d22',
    brick: '#41474f',
    brickHi: '#4f565f',
    brickLo: '#32373e',
  },
  {
    // Depths: dark reds.
    floorBase: '#342227',
    floorDark: '#2b1b20',
    floorLight: '#3f2a30',
    mortar: '#1e1115',
    brick: '#4a2c33',
    brickHi: '#583640',
    brickLo: '#392127',
  },
];

/** Fixed-color tints for item orbs, picked by a stable hash of the item id. */
const ITEM_TINTS = [
  0xff6b6b, 0xffd23f, 0x7cffb2, 0x4ad6c8, 0x5b8cff, 0xb14aff, 0xff9f43, 0xf2f2f2,
];

/** Stable tint for an item pickup's orb, derived from its id. */
export function itemTint(itemId: string): number {
  let h = 0;
  for (let i = 0; i < itemId.length; i++) h = (h * 31 + itemId.charCodeAt(i)) >>> 0;
  return ITEM_TINTS[h % ITEM_TINTS.length] ?? 0xf2f2f2;
}

/** Tiny deterministic PRNG so noise tiles look identical on every boot. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type PixelPalette = Record<string, string>;

/** Draws a string pixel map ('.'=transparent) into a new canvas texture. */
function pixelTexture(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  palette: PixelPalette,
): void {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < w; x++) {
      const c = row[x] ?? '.';
      if (c === '.') continue;
      const color = palette[c];
      if (color === undefined) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

/** A 16x16 floor tile: flat base + seeded speckle noise (stains, grit). */
function floorTile(scene: Phaser.Scene, key: string, t: Theme, seed: number): void {
  const tex = scene.textures.createCanvas(key, 16, 16);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = t.floorBase;
  ctx.fillRect(0, 0, 16, 16);
  const rnd = lcg(seed);
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = rnd() < 0.5 ? t.floorDark : t.floorLight;
    ctx.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 1);
  }
  // A few wider specks / hairline cracks.
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = t.floorDark;
    ctx.fillRect(Math.floor(rnd() * 14), Math.floor(rnd() * 15), 2, 1);
  }
  tex.refresh();
}

/** A 16x16 stone-brick wall tile: two offset brick rows over mortar. */
function wallTile(scene: Phaser.Scene, key: string, t: Theme, seed: number): void {
  const tex = scene.textures.createCanvas(key, 16, 16);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = t.mortar;
  ctx.fillRect(0, 0, 16, 16);
  const brick = (x: number, y: number, w: number, h: number): void => {
    ctx.fillStyle = t.brick;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = t.brickHi;
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = t.brickLo;
    ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  };
  // Top row: two 8-wide bricks; bottom row offset by 4 for a bond pattern.
  brick(0, 0, 8, 8);
  brick(8, 0, 8, 8);
  brick(-4, 8, 8, 8);
  brick(4, 8, 8, 8);
  brick(12, 8, 8, 8);
  const rnd = lcg(seed);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = rnd() < 0.5 ? t.brickLo : t.brickHi;
    ctx.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 1);
  }
  tex.refresh();
}

/** Soft elliptical drop shadow, used under every living entity. */
function shadowTexture(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas('shadow', 16, 8);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
  ctx.beginPath();
  ctx.ellipse(8, 4, 7.5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  tex.refresh();
}

/** Swirling purple pit used as the floor-exit teleporter. */
function teleporterTexture(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas('teleporter', 16, 16);
  if (!tex) return;
  const ctx = tex.getContext();
  const disc = (r: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(8, 8, r, 0, Math.PI * 2);
    ctx.fill();
  };
  disc(7.5, '#1c0b2a');
  disc(6.2, '#b14aff');
  disc(4.6, '#2a0f3a');
  disc(2.8, '#0a0312');
  ctx.fillStyle = '#e7c6ff';
  ctx.fillRect(3, 5, 1, 1);
  ctx.fillRect(11, 10, 1, 1);
  ctx.fillRect(9, 3, 1, 1);
  tex.refresh();
}

/** A dark hole in the floor: the pit trap (sends the player back to the entrance). */
function pitTexture(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas('pit', 16, 16);
  if (!tex) return;
  const ctx = tex.getContext();
  const disc = (r: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(8, 8, r, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  disc(7.5, '#1a1410'); // rim shadow
  disc(6.2, '#0c0a09');
  disc(4.4, '#050404'); // black depths
  tex.refresh();
}

/** Dark radial vignette laid over the play area for the cave ambiance. */
function vignetteTexture(scene: Phaser.Scene, w: number, h: number): void {
  const tex = scene.textures.createCanvas('vignette', w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.62,
  );
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.48)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
}

/* ------------------------------------------------------------------ */
/* Pixel maps — all characters map to colors below; '.' is transparent. */
/* ------------------------------------------------------------------ */

const PLAYER_MAP = [
  '....######....',
  '..##aaaaaa##..',
  '.#aaaaaaaaaa#.',
  '.#aaaaaaaaaa#.',
  '#aaaaaaaaaaaa#',
  '#aaeeaaaaeeaa#',
  '#aaeeaaaaeeaa#',
  '#aaaaaaaaaaaa#',
  '.#aaaaaaaaaa#.',
  '..##tttttt##..',
  '..#tttttttt#..',
  '..#tttttttt#..',
  '...#t#..#t#...',
  '...##....##...',
];

/** The Brute: bulky steel helmet (m) over red plate armor (b). */
const BRUTE_MAP = [
  '....######....',
  '...#mmmmmm#...',
  '..#mmmmmmmm#..',
  '..#m##mm##m#..',
  '.#bbbbbbbbbb#.',
  '#bbbbbbbbbbbb#',
  '#bbbbbbbbbbbb#',
  '#bbbbbbbbbbbb#',
  '.#bbbbbbbbbb#.',
  '.#bb#bbbb#bb#.',
  '.##bb####bb##.',
  '..##......##..',
  '..............',
  '..............',
];

/** The Scout: pointed green hood (g) over a small face (s) with dark eyes (e). */
const SCOUT_MAP = [
  '......##......',
  '.....#gg#.....',
  '....#gggg#....',
  '...#gggggg#...',
  '..#ggssssgg#..',
  '..#gseesegg#..',
  '..#gssssssg#..',
  '...#gggggg#...',
  '...#gggggg#...',
  '...#gg##gg#...',
  '...#gg..gg#...',
  '...##....##...',
  '..............',
  '..............',
];

/** The Tinker: brass goggles (o) with dark lenses (e) over a tan coat (c). */
const TINKER_MAP = [
  '....######....',
  '..##tttttt##..',
  '.#tttttttttt#.',
  '#ssssssssssss#',
  '#ooeeooooeeoo#',
  '#ssssssssssss#',
  '#cccccccccccc#',
  '#cccccccccccc#',
  '.#cccccccccc#.',
  '.#cc#cccc#cc#.',
  '.##cc####cc##.',
  '..##......##..',
  '..............',
  '..............',
];

/** The Hoarder: gold hood (g) and robe (y) with a bright coin emblem ($). */
const HOARDER_MAP = [
  '....######....',
  '..##gggggg##..',
  '.#gggggggggg#.',
  '#ssssssssssss#',
  '#sseesssseess#',
  '#ssssssssssss#',
  '#yyyyyyyyyyyy#',
  '#yyyy$$$$yyyy#',
  '.#yy$$$$$$yy#.',
  '.#yyyyyyyyyy#.',
  '.#yy#yyyy#yy#.',
  '.##yy####yy##.',
  '..##......##..',
  '..............',
];

/** The Twins: two purple heads sharing one body. */
const GEMINI_MAP = [
  '..####..####..',
  '.#pppp##pppp#.',
  '.#peep##peep#.',
  '.#pppp##pppp#.',
  '#pppppppppppp#',
  '#pppppppppppp#',
  '#pppppppppppp#',
  '.#pppppppppp#.',
  '.#pp#pppp#pp#.',
  '.##pp####pp##.',
  '..##......##..',
  '..............',
  '..............',
  '..............',
];

/** The Pyromancer: a flame (f) crowning a face over a red robe (r). */
const EMBER_MAP = [
  '......##......',
  '.....#ff#.....',
  '....#ffff#....',
  '..#aaaaaaaa#..',
  '.#aaeeaaeeaa#.',
  '.#aaaaaaaaaa#.',
  '#rrrrrrrrrrrr#',
  '#rrrrrrrrrrrr#',
  '.#rrrrrrrrrr#.',
  '.#rr#rrrr#rr#.',
  '.##rr####rr##.',
  '..##......##..',
  '..............',
  '..............',
];

/** The Wraith: a pale, wispy ghost with a tattered hem. */
const WRAITH_MAP = [
  '....######....',
  '..##wwwwww##..',
  '.#wwwwwwwwww#.',
  '#wwwwwwwwwwww#',
  '#wweewwwweeww#',
  '#wwwwwwwwwwww#',
  '#wwwwwwwwwwww#',
  '.#wwwwwwwwww#.',
  '.#wwwwwwwwww#.',
  '..#wwwwwwww#..',
  '..#w#ww#w#w#..',
  '...#.#..#.#...',
  '..............',
  '..............',
];

const CHASER_MAP = [
  '...######...',
  '..#rrrrrr#..',
  '.#rrrrrrrr#.',
  '#rrrrrrrrrr#',
  '#reerrrreer#',
  '#reerrrreer#',
  '#rrrrrrrrrr#',
  '#rmmmmmmmmr#',
  '#rwmwmwmwmr#',
  '.#rrrrrrrr#.',
  '..#r#rr#r#..',
  '...#.##.#...',
];

const SWARMER_MAP = [
  '.ww....ww.',
  'wwww..wwww',
  '.wwxxxxww.',
  '..xxxxxx..',
  '..xpxxpx..',
  '..xxxxxx..',
  '...xxxx...',
  '...x..x...',
];

const SHOOTER_MAP = [
  '...######...',
  '..#wwwwww#..',
  '.#wwwwwwww#.',
  '#wwwwwwwwww#',
  '#wwwbbbbwww#',
  '#wwbbppbbww#',
  '#wwbbppbbww#',
  '#wwwbbbbwww#',
  '.#wwwwwwww#.',
  '..#wwwwww#..',
  '...######...',
];

const TANK_MAP = [
  '...########...',
  '..#gggggggg#..',
  '.#gggggggggg#.',
  '#gggggggggggg#',
  '#ggyyggggyygg#',
  '#gggggggggggg#',
  '#ggdgggggdggg#',
  '#gggggdgggggg#',
  '.#gggggggggg#.',
  '.#gg#gggg#gg#.',
  '..###....###..',
];

/** Drawn in light grays so the boss can be tinted per attack-pattern variant. */
const BOSS_MAP = [
  '.#............#.',
  '#f#..........#f#',
  '#ff#.######.#ff#',
  '.#ff#ffffff#ff#.',
  '.#ffffffffffff#.',
  '#ffffffffffffff#',
  '#ffeeffffffeeff#',
  '#ffeeffffffeeff#',
  '#ffffffffffffff#',
  '#ffmmmmmmmmmmff#',
  '#ffmwmwmwmwmmff#',
  '.#ffffffffffff#.',
  '..#ffffffffff#..',
  '...###....###...',
];

/** Attack Fly: dark body, pale buzzing wings, red eyes. */
const FLY_MAP = [
  'w.......w',
  'ww.....ww',
  '.ww...ww.',
  '..#####..',
  '.#rrrrr#.',
  '.#rkrkr#.',
  '.#rrrrr#.',
  '..#####..',
];

/** Charger: stocky brown bull with horns and angry red eyes. */
const CHARGER_MAP = [
  '#h........h#',
  '#hh......hh#',
  '.#bbbbbbbb#.',
  '#bbbbbbbbbb#',
  '#beebbbbeeb#',
  '#bbbbbbbbbb#',
  '#bbnnnnnnbb#',
  '.#bbbbbbbb#.',
  '..#b#bb#b#..',
  '...#.##.#...',
];

/** Boom Fly: round bomb body with a lit fuse and a hot glowing core. */
const EXPLODER_MAP = [
  '.....s.....',
  '....#f#....',
  '...#####...',
  '..#rrrrr#..',
  '.#ryyyyyr#.',
  '#rryyoyyrr#',
  '#rryyoyyrr#',
  '.#ryyyyyr#.',
  '..#rrrrr#..',
  '...#####...',
];

/** Splitter: green blob with a dark central seam where it splits. */
const SPLITTER_MAP = [
  '..######..',
  '.#gggggg#.',
  '#gggggggg#',
  '#ggkggkgg#',
  '#gggggggg#',
  '#ggg##ggg#',
  '#ggg##ggg#',
  '.#gggggg#.',
  '..#g##g#..',
  '...#..#...',
];

const TEAR_MAP = [
  '..###..',
  '.#bbb#.',
  '#bwbbb#',
  '#bbbbb#',
  '#bbbbb#',
  '.#bbb#.',
  '..###..',
];

const HEART_FULL_MAP = [
  '.##.##.',
  '#rw#rr#',
  '#rrrrr#',
  '#rrrrr#',
  '.#rrr#.',
  '..#r#..',
  '...#...',
];

const HEART_HALF_MAP = [
  '.##.##.',
  '#rw#dd#',
  '#rrrdd#',
  '#rrrdd#',
  '.#rrd#.',
  '..#r#..',
  '...#...',
];

const HEART_EMPTY_MAP = [
  '.##.##.',
  '#dd#dd#',
  '#ddddd#',
  '#ddddd#',
  '.#ddd#.',
  '..#d#..',
  '...#...',
];

const COIN_MAP = [
  '..####..',
  '.#yyyy#.',
  '#ywyyyd#',
  '#wyyyyd#',
  '#yyyyyd#',
  '#yyyddd#',
  '.#yyyd#.',
  '..####..',
];

const KEY_MAP = [
  '.####.',
  '#y..y#',
  '#y..y#',
  '.####.',
  '..yy..',
  '..yy..',
  '..yy..',
  '..yyy.',
  '..yy..',
  '..yyy.',
  '..yy..',
];

const SPIKE_MAP = [
  '.ww..ww..ww.',
  '.ss..ss..ss.',
  '.ss..ss..ss.',
  'wssdwssdwssd',
  'ssddssddssdd',
  'dddddddddddd',
];

const PEDESTAL_MAP = [
  '..##########..',
  '.#pPPPPPPPPp#.',
  '.#pppppppppp#.',
  '..#pppppppp#..',
  '...#pppppp#...',
  '...#pppppp#...',
  '..#pppppppp#..',
  '.#pppppppppp#.',
  '.############.',
];

/** Drawn near-white so each item id can tint it a distinct color. */
const ITEM_ORB_MAP = [
  '..#####..',
  '.#fffff#.',
  '#fwfffff#',
  '#fffffff#',
  '#fffffff#',
  '#fffffff#',
  '#ffffffs#',
  '.#fffss#.',
  '..#####..',
];

/** Door arch pointing up (rotated by the renderer for other walls). */
const DOOR_OPEN_MAP = [
  '..##########..',
  '.#FFFFFFFFFF#.',
  '#FF#oooooo#FF#',
  '#F#oooooooo#F#',
  '#F#oooooooo#F#',
  '#F#oooooooo#F#',
  '#F#oooooooo#F#',
  '#F#oooooooo#F#',
  '#F#oooooooo#F#',
  '#F#oooooooo#F#',
];

const DOOR_CLOSED_MAP = [
  '..##########..',
  '.#FFFFFFFFFF#.',
  '#FF#wwwdww#FF#',
  '#F#wwwdwwww#F#',
  '#F#wwwdwwww#F#',
  '#F#wwwdwwww#F#',
  '#F#wwwdwwww#F#',
  '#F#wwwdwwww#F#',
  '#F#wwwdwwww#F#',
  '#F#wwwdwwww#F#',
];

const OUTLINE = '#181218';

/**
 * Generates every texture used by the render layer. Idempotent: textures
 * live in the game-wide TextureManager, so scene restarts skip regeneration.
 *
 * @param playW width of the play area in pixels (for the vignette)
 * @param playH height of the play area in pixels (for the vignette)
 */
export function generateTextures(scene: Phaser.Scene, playW: number, playH: number): void {
  if (scene.textures.exists('player')) return;

  // Tiles per theme.
  for (let t = 0; t < THEMES.length; t++) {
    const theme = THEMES[t];
    if (!theme) continue;
    for (let v = 0; v < FLOOR_VARIANTS; v++) {
      floorTile(scene, floorTileKey(t, v), theme, t * 101 + v * 17 + 1);
    }
    wallTile(scene, wallTileKey(t), theme, t * 211 + 7);
  }

  // Characters. The base 'player' look is the Wanderer; each playable character
  // gets its own 'player-<id>' texture used both in-game and on the select screen.
  const wandererPalette = { '#': OUTLINE, a: '#e8d6b8', e: '#241c1a', t: '#6b4a2f' };
  pixelTexture(scene, 'player', PLAYER_MAP, wandererPalette);
  pixelTexture(scene, 'player-wanderer', PLAYER_MAP, wandererPalette);
  pixelTexture(scene, 'player-brute', BRUTE_MAP, {
    '#': OUTLINE,
    m: '#b9c0c9', // steel helmet
    b: '#8a3b34', // red plate
  });
  pixelTexture(scene, 'player-scout', SCOUT_MAP, {
    '#': OUTLINE,
    g: '#3f8f5a', // green hood/cloak
    s: '#e8d6b8', // skin
    e: '#1a1420',
  });
  pixelTexture(scene, 'player-tinker', TINKER_MAP, {
    '#': OUTLINE,
    t: '#5a4632', // hair
    s: '#e8d6b8', // skin
    o: '#caa15a', // brass goggle frame
    e: '#1a1420', // lens
    c: '#7a6a4a', // coat
  });
  pixelTexture(scene, 'player-hoarder', HOARDER_MAP, {
    '#': OUTLINE,
    g: '#caa15a', // gold hood
    s: '#e8d6b8', // skin
    e: '#241c1a',
    y: '#d4af37', // gold robe
    $: '#fff2a0', // bright coin emblem
  });
  pixelTexture(scene, 'player-gemini', GEMINI_MAP, {
    '#': OUTLINE,
    p: '#8a5cd0', // purple twins
    e: '#1a1420',
  });
  pixelTexture(scene, 'player-ember', EMBER_MAP, {
    '#': OUTLINE,
    f: '#ff7a3c', // flame
    a: '#e8d6b8', // skin
    e: '#241c1a',
    r: '#c0392b', // red robe
  });
  pixelTexture(scene, 'player-wraith', WRAITH_MAP, {
    '#': OUTLINE,
    w: '#c8d6e8', // pale spectral body
    e: '#2a2440',
  });
  pixelTexture(scene, 'enemy-chaser', CHASER_MAP, {
    '#': OUTLINE,
    r: '#c8403f',
    e: '#1c0f12',
    m: '#36090f',
    w: '#f2e6da',
  });
  pixelTexture(scene, 'enemy-swarmer', SWARMER_MAP, {
    x: '#3a3a44',
    w: '#cfd8e8',
    p: '#ff5d5d',
  });
  pixelTexture(scene, 'enemy-shooter', SHOOTER_MAP, {
    '#': OUTLINE,
    w: '#e8e4ee',
    b: '#4a7dff',
    p: '#10101c',
  });
  pixelTexture(scene, 'enemy-tank', TANK_MAP, {
    '#': '#2c261e',
    g: '#8a7a64',
    y: '#ffd23f',
    d: '#4a4036',
  });
  pixelTexture(scene, 'enemy-boss', BOSS_MAP, {
    '#': OUTLINE,
    f: '#d8d4de',
    e: '#1a1420',
    m: '#26101a',
    w: '#f2f2f2',
  });
  pixelTexture(scene, 'enemy-fly', FLY_MAP, {
    '#': OUTLINE,
    r: '#3a2a3a',
    k: '#ff5d5d',
    w: '#cfd6e0',
  });
  pixelTexture(scene, 'enemy-charger', CHARGER_MAP, {
    '#': OUTLINE,
    b: '#8a5a2c',
    h: '#d8d4de',
    e: '#ff3030',
    n: '#3a2418',
  });
  pixelTexture(scene, 'enemy-exploder', EXPLODER_MAP, {
    '#': OUTLINE,
    r: '#c0392b',
    y: '#ff7a3c',
    o: '#ffe08a',
    f: '#caa15a',
    s: '#fff2a0',
  });
  pixelTexture(scene, 'enemy-splitter', SPLITTER_MAP, {
    '#': OUTLINE,
    g: '#4caf50',
    k: '#10301a',
  });

  // Projectiles.
  pixelTexture(scene, 'tear', TEAR_MAP, { '#': '#7a98b8', b: '#d6ebff', w: '#ffffff' });
  pixelTexture(scene, 'enemy-tear', TEAR_MAP, { '#': '#7a1f24', b: '#ff5d5d', w: '#ffb0b0' });

  // Pickups & HUD icons.
  const heartPal = { '#': '#241016', r: '#e5484d', w: '#ff9aa0', d: '#3a2433' };
  pixelTexture(scene, 'heart-full', HEART_FULL_MAP, heartPal);
  pixelTexture(scene, 'heart-half', HEART_HALF_MAP, heartPal);
  pixelTexture(scene, 'heart-empty', HEART_EMPTY_MAP, heartPal);
  pixelTexture(scene, 'coin', COIN_MAP, {
    '#': '#6b4a12',
    y: '#ffd23f',
    w: '#fff3b0',
    d: '#c9961f',
  });
  pixelTexture(scene, 'key', KEY_MAP, { '#': '#6b5a1c', y: '#e8c95a' });
  pixelTexture(scene, 'item-orb', ITEM_ORB_MAP, {
    '#': '#3a3a48',
    f: '#e6e6ee',
    w: '#ffffff',
    s: '#b8b8c8',
  });
  pixelTexture(scene, 'pedestal', PEDESTAL_MAP, {
    '#': '#2a2e38',
    p: '#7a8294',
    P: '#a8b0c0',
  });

  // Room furniture.
  pixelTexture(scene, 'spike', SPIKE_MAP, { w: '#c8ccd4', s: '#8a909a', d: '#565c66' });
  const doorPal = { '#': '#1a1a22', F: '#9a9aa8', o: '#08060c', w: '#6a4a2c', d: '#4a3018' };
  pixelTexture(scene, 'door-open', DOOR_OPEN_MAP, doorPal);
  pixelTexture(scene, 'door-closed', DOOR_CLOSED_MAP, doorPal);

  // Effects.
  shadowTexture(scene);
  pitTexture(scene);
  teleporterTexture(scene);
  vignetteTexture(scene, playW, playH);
}
