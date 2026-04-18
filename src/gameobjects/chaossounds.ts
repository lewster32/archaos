/**
 * Emulates the ZX Spectrum beeper sound engine from the original game.
 *
 * The engine (Z80 routine at 49919) drives four pitch voices through a
 * three-level nested loop, toggling the speaker at timed intervals. Each
 * speaker flip is separated by a delay of (13 * pitchCounter + 139) T-states,
 * where 139 is the measured overhead of the surrounding instructions and
 * 13 is the cost of each DJNZ iteration in the busy-wait subroutine at 49978.
 *
 * T-state delays are converted to PCM samples via a moving-average filter then
 * played through the Web Audio API.
 *
 * Some sounds are designed to be called repeatedly by the game loop. For these,
 * a `repeat` count is provided: the engine state (pitch counters) carries over
 * between repeats, so the pitch continues to evolve across the full sequence
 * rather than resetting each time.
 * 
 * For sounds marked `variableDuration`, the engine is intended to be tied to an
 * animation of variable length such as a projectile.
 */

const CLOCK_SPEED = 3_500_000; // ZX Spectrum 48K: 3.5 MHz
const SAMPLE_RATE = 44_100; // Cleaner than you've ever heard it (possibly)
const DJNZ_TSTATES = 13; // Measured T-state cost of the DJNZ-based busy-wait loop at 49978, which is the main determinant of pitch.
const FLIP_OVERHEAD = 139; // measured T-state cost of all instructions surrounding the busy-wait
const VOLUME = 0.25; // scales final PCM amplitude to avoid blasting the listener's ears off

export interface SoundParams {
  outerCount: number;   // how many times the pitch table is updated
  middleCount: number;  // how many times the 4-voice block repeats per outer iteration
  pitch: [number, number, number, number];       // initial delay counters for each voice
  increments: [number, number, number, number];  // added to each pitch counter per outer loop
  repeat?: number;      // how many times the engine is called consecutively (default 1)
  /** If true, the sound is tied to an animation whose length is not fixed (e.g. a line-draw
   *  that depends on board distance). Pass `durationMs` to `playSound` to control how long
   *  it plays; defaults to 1000 ms. */
  variableDuration?: true;
  /** T-states of draw work between consecutive calls to the sound engine. Used by the
   *  beam/projectile family of sounds: on the Z80, the game's Bresenham line-draw routine
   *  at $B626 calls the sound engine once per pixel and then does N T-states of drawing
   *  work (erase-tail + draw-head + cross-pattern) before the next pixel. `repeat` is the
   *  pixel count. Ignored when `phases` is set. */
  gap?: number;
  /** Multi-phase schedule for beams that split into travel + retract phases (cast,
   *  lightning). Each phase has its own pixel count and per-pixel gap; pitch state
   *  carries across phases. When set, `repeat` and `gap` at the top level are ignored. */
  phases?: Array<{ repeat: number; gap: number }>;
  /** Approximate the ZX Spectrum ULA contention jitter that makes the real traced beam
   *  sounds buzzy / noisy rather than pure tones. Each gap delay is perturbed by a
   *  pseudo-random amount scaled by this percentage. Good values: ~5-15 for light
   *  contention (cast, lightning, magic-bolt), ~30-40 for heavy (dragon). Zero means
   *  no jitter — perfectly periodic gap timing. Only affects the gap T-states, not
   *  the voice flips, so pitch stays locked. */
  contentionFactor?: number;
  /** Per-voice jitter on top of `contentionFactor`. On real hardware the 4 voices
   *  in one engine call happen at different T-state offsets within the frame and
   *  each picks up a different amount of ULA contention, breaking the perfect
   *  4-symmetry of the flip pattern and producing a chord-like / dissonant texture
   *  even when all 4 pitch values are identical. Apply this when the trace has a
   *  multi-tone character that the gap jitter alone can't reproduce (wizard death
   *  asterisk, where increments are uniform). Typical values: 3-8. */
  voiceContentionFactor?: number;
}


/**
 * Simulate the Z80 beeper routine and return a list of inter-flip intervals
 * in T-states. This matches what AudioTracer.get_delays() produces in SkoolKit.
 *
 * When `repeat` is greater than 1, the engine runs that many consecutive times.
 * Pitch state carries over between repeats — the first call uses CALL 49910 (LDIR
 * + engine) but subsequent calls use CALL 49921 (engine only, skipping the LDIR),
 * so the working RAM pitch counters accumulate across the full sequence.
 */
function generateDelays(params: SoundParams): number[] {
  const { outerCount, middleCount, increments } = params;

  const flipTimes: number[] = [];
  let t = 0;

  // Only the first repeat restores pitch from the saved block (CALL 49910 = LDIR + engine).
  // Subsequent repeats call 49921 directly, skipping the LDIR, so working RAM retains
  // whatever pitch values the previous run left behind.
  const pitch = [...params.pitch] as [number, number, number, number];

  // Seeded LCG. Used for both gap and voice jitter so the pseudo-random
  // pattern is reproducible per playback.
  let seed = 0x1357beef;
  const rand = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;          // 0..1
  };

  // Gap jitter: perturbs the inter-pixel/inter-tick gap. ULA contention on the
  // Bresenham draw work makes the pulse rate wobble; pitch stays locked.
  const gapPct = params.contentionFactor ?? 0;
  const jitterGap = (gap: number): number => {
    if (gapPct <= 0) return gap;
    return gap + Math.floor(gap * (gapPct / 100) * (rand() * 2 - 1));
  };

  // Voice jitter: perturbs each individual voice flip delay. Models the four
  // voices in one engine call landing at different T-state offsets within the
  // frame and picking up different contention amounts, breaking the perfect
  // 4-voice symmetry and producing a chord-like / dissonant texture when the
  // raw pitch values are identical.
  const voicePct = params.voiceContentionFactor ?? 0;
  const jitterVoice = (delay: number): number => {
    if (voicePct <= 0) return delay;
    return delay + Math.floor(delay * (voicePct / 100) * (rand() * 2 - 1));
  };

  const emitEngineTick = () => {
    // One full "outer iteration" of the engine: middleCount repetitions of the
    // 4-voice block, then increment the pitch table.
    for (let middle = 0; middle < middleCount; middle++) {
      for (let i = 0; i < 4; i++) {
        t += jitterVoice(DJNZ_TSTATES * pitch[i] + FLIP_OVERHEAD);
        flipTimes.push(t);
      }
    }
    for (let i = 0; i < 4; i++) {
      pitch[i] = (pitch[i] + increments[i]) & 0xFF;
    }
  };

  if (params.phases || params.gap !== undefined) {
    // Beam mode: each repeat is one pixel of the Bresenham line-draw routine,
    // which runs a single outer iteration of the sound engine followed by
    // `gap` T-states of drawing work before the next pixel. outerCount is
    // retained only for structural consistency — beam sound records always
    // have outerCount=1 since the game calls the engine once per pixel.
    const phases = params.phases ?? [{ repeat: params.repeat ?? 1, gap: params.gap ?? 0 }];
    for (const phase of phases) {
      for (let p = 0; p < phase.repeat; p++) {
        for (let outer = 0; outer < outerCount; outer++) {
          emitEngineTick();
        }
        t += jitterGap(phase.gap);
      }
    }
  } else {
    // Classic mode: `repeat` back-to-back full runs of the engine's outer loop.
    const repeat = params.repeat ?? 1;
    for (let r = 0; r < repeat; r++) {
      for (let outer = 0; outer < outerCount; outer++) {
        emitEngineTick();
      }
    }
  }

  // Convert absolute timestamps to intervals between consecutive flips.
  return flipTimes.slice(1).map((time, i) => time - flipTimes[i]);
}

/**
 * Convert T-state delay intervals to normalised PCM samples [0.0, 1.0] using
 * a moving-average (boxcar) filter. Matches SkoolKit's moving_average_filter().
 *
 * Each output sample represents the fraction of that sample window during which
 * the speaker was in the "up" state, giving a naturally low-pass-filtered
 * reconstruction of the square wave.
 */
function delaysToSamples(delays: number[]): Float32Array {
  const sampleDelay = CLOCK_SPEED / SAMPLE_RATE; // ~79.4 T-states per output sample
  let s0 = 0;
  let s1 = sampleDelay;
  let t = 0;
  let t1 = Math.ceil(s1);
  let bit = 0;  // speaker state: 0 = down, 1 = up
  let bits = 0; // T-states spent in "up" state within the current sample window
  const samples: number[] = [];

  for (let d of delays) {
    while (true) {
      if (t + d < t1) {
        if (bit) bits += d;
        t += d;
        break;
      }
      const i = t1 - t;
      if (bit) bits += i;
      d -= i;
      samples.push(bits / (t1 - s0)); // amplitude: fraction of window speaker was "up"
      s0 = t = t1;
      s1 += sampleDelay;
      t1 = Math.ceil(s1);
      bits = 0;
    }
    bit = 1 - bit;
  }

  return new Float32Array(samples);
}

/**
 * Play a sequence of PCM samples through the Web Audio API.
 * Input samples are in [0,1] (duty-cycle representation); we centre them to
 * [-1,1] here so Web Audio plays them at full amplitude without relying on
 * hardware AC-coupling. Returns a Promise that resolves when playback finishes.
 */
function playSamples(samples: Float32Array, context: AudioContext): Promise<void> {
  const centred = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) centred[i] = (samples[i] - 0.5) * 2 * VOLUME;

  const buffer = context.createBuffer(1, centred.length, SAMPLE_RATE);
  buffer.copyToChannel(centred, 0);

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();

  return new Promise((resolve) => {
    source.addEventListener("ended", () => resolve(), { once: true });
  });
}

/**
 * Main entry point. Pass a SoundParams object (or one of the exported
 * constants) to generate and play the corresponding beeper sound.
 *
 * An AudioContext is created on first call and reused thereafter.
 * Returns a Promise that resolves when playback finishes.
 *
 * For sounds marked `variableDuration: true`, the engine output is looped
 * seamlessly for `durationMs` milliseconds (default 1000). Pass the actual
 * animation duration to match the original game behaviour.
 *
 * Sound records live in assets/data/chaossounds.json; load that and pass an
 * entry directly, e.g.:
 *
 * @example
 * import sounds from '@/assets/data/chaossounds.json';
 * import { playSound } from './chaossounds';
 * const newTurn = sounds.find(s => s.id === 'new-turn')!;
 * await playSound(newTurn);
 */
let sharedContext: AudioContext | null = null;

export async function playSound(params: SoundParams, durationMs = 1000): Promise<void> {
  if (!sharedContext) {
    sharedContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  }
  // AudioContext may be suspended if created before a user gesture.
  if (sharedContext.state === 'suspended') {
    await sharedContext.resume();
  }

  let delays: number[];
  if (params.variableDuration) {
    // Re-run the engine repeatedly with carrying pitch state until the T-state
    // budget for durationMs is exhausted. This matches CALL 49921 being invoked
    // once per animation frame: pitch evolves continuously across the full duration.
    const { outerCount, middleCount, increments } = params;
    const budgetTStates = (durationMs / 1000) * CLOCK_SPEED;
    const pitch = [...params.pitch] as [number, number, number, number];
    const flipTimes: number[] = [];
    let t = 0;
    while (t < budgetTStates) {
      for (let outer = 0; outer < outerCount; outer++) {
        for (let middle = 0; middle < middleCount; middle++) {
          for (let i = 0; i < 4; i++) {
            t += DJNZ_TSTATES * pitch[i] + FLIP_OVERHEAD;
            flipTimes.push(t);
          }
        }
        for (let i = 0; i < 4; i++) {
          pitch[i] = (pitch[i] + increments[i]) & 0xFF;
        }
      }
    }
    delays = flipTimes.slice(1).map((time, i) => time - flipTimes[i]);
  } else {
    delays = generateDelays(params);
  }

  const samples = delaysToSamples(delays);
  await playSamples(samples, sharedContext);
}
