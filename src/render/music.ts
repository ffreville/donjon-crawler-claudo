/**
 * Background music, on its own track (separate from the WebAudio sound effects in
 * audio.ts). A single looping <audio> element; Vite bundles the file referenced
 * below from the repo's `music/` folder. Volume/enable is independent of SFX.
 */

const MUSIC_URL = new URL('../../music/Sous La Cave.mp3', import.meta.url).href;
const MUSIC_VOLUME = 0.4;

let el: HTMLAudioElement | null = null;

function element(): HTMLAudioElement {
  if (!el) {
    el = new Audio(MUSIC_URL);
    el.loop = true;
    el.volume = MUSIC_VOLUME;
  }
  return el;
}

/** Starts the loop from the beginning when a run begins (respects the setting). */
export function playMusicFromStart(on: boolean): void {
  const a = element();
  if (!on) {
    a.pause();
    return;
  }
  a.currentTime = 0;
  void a.play().catch(() => {}); // autoplay needs a gesture; the menu click provides one
}

/** Live enable/disable from the Options menu. */
export function setMusicEnabled(on: boolean): void {
  const a = element();
  if (on) void a.play().catch(() => {});
  else a.pause();
}

/** Pauses the music (e.g. when leaving the game scene for the menu). */
export function stopMusic(): void {
  el?.pause();
}
