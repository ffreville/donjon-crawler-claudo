/**
 * Background music, on its own track (separate from the WebAudio sound effects in
 * audio.ts). The tracks below play back-to-back as a looping playlist (track 1,
 * then track 2, then back to track 1, ...). Vite bundles the files from the
 * repo's `music/` folder.
 */

const TRACKS = [
  new URL('../../music/cave-01.mp3', import.meta.url).href,
  new URL('../../music/cave-02.mp3', import.meta.url).href,
  new URL('../../music/cave-03.mp3', import.meta.url).href,
  new URL('../../music/cave-04.mp3', import.meta.url).href,
] as const;
let musicVolume = 0.4;

let el: HTMLAudioElement | null = null;
let index = 0;

function element(): HTMLAudioElement {
  if (!el) {
    el = new Audio(TRACKS[0]);
    el.loop = false; // we advance manually so the playlist cycles
    el.volume = musicVolume;
    el.addEventListener('ended', () => {
      index = (index + 1) % TRACKS.length;
      const next = TRACKS[index];
      if (!el || !next) return;
      el.src = next;
      void el.play().catch(() => {});
    });
  }
  return el;
}

/** Starts the playlist from the first track when a run begins (respects the setting). */
export function playMusicFromStart(on: boolean): void {
  const a = element();
  index = 0;
  a.src = TRACKS[0];
  if (!on) {
    a.pause();
    return;
  }
  a.currentTime = 0;
  void a.play().catch(() => {}); // autoplay needs a gesture; the menu click provides one
}

/** Sets the music volume (0..1), applied live. Volume 0 pauses; >0 (re)starts it. */
export function setMusicVolume(v: number): void {
  musicVolume = Math.max(0, Math.min(1, v));
  const a = element();
  a.volume = musicVolume;
  if (musicVolume > 0) void a.play().catch(() => {});
  else a.pause();
}

/** Pauses the music (e.g. when leaving the game scene for the menu). */
export function stopMusic(): void {
  el?.pause();
}
