/**
 * Every tuning value for the game lives here. Gameplay code reads from CONFIG
 * and never hardcodes a number of its own.
 */
export const CONFIG = {
  /**
   * Every level, in play order, on one continuous map. Each level is one
   * animated GIF from assets/gifs/ (a video or still image also works).
   * A level's type and grid size come from its place in the list (see
   * difficulty below), so the game always ramps up in the same steps; a level
   * may still set cols, rows or type itself, but then it must keep to the
   * sequence (checkDifficultySequence in core/difficulty.js, run by the tests).
   * Every level needs an id that never changes, because saved progress is
   * stored by id. trim cuts fractions off the picture's edges before its
   * square is taken (to hide a watermark or a see-through margin).
   *
   * Picture order (levels 12 onward): hard slots get the flattest pictures
   * (fewest clues, so hardest to place), bonus slots the most detailed ones
   * (a flat tile is guesswork to rotate), and normal levels go from most to
   * least detailed inside each block. Levels 1-11 keep their pictures so
   * saved progress stays where it was.
   */
  levels: [
    // Block 1: 3x3, hard 4x4, bonus 3x3.
    // This GIF has a see-through margin, which would show black on the board.
    { id: 'fireside-cat', mediaSrc: 'fireside-cat.gif', trim: { left: 0.045, right: 0.045, top: 0.05, bottom: 0.05 } },
    { id: 'reading-nook', mediaSrc: 'reading-nook.gif' },
    { id: 'bookworm', mediaSrc: 'bookworm.gif' },
    { id: 'cozy-blanket', mediaSrc: 'cozy-blanket.gif' },
    { id: 'garden-cat', mediaSrc: 'garden-cat.gif' },
    { id: 'rainy-window', mediaSrc: 'rainy-window.gif' },
    { id: 'white-dove', mediaSrc: 'white-dove.gif' },
    { id: 'bird-closeup', mediaSrc: 'bird-closeup.gif', trim: { left: 0.01, top: 0.01 } },
    // The trim hides the artist's URL in the bottom-left corner.
    { id: 'pixel-pets', mediaSrc: 'pixel-pets.gif', trim: { bottom: 0.08 } },
    { id: 'lion-cliff', mediaSrc: 'lion-cliff.gif' },
    // Block 2: 4x4, hard 5x5, bonus 4x4.
    { id: 'raccoon-run', mediaSrc: 'raccoon-run.gif' },
    { id: 'armchair-cat', mediaSrc: 'armchair-cat.gif' },
    { id: 'pixel-river', mediaSrc: 'pixel-river.webp' },
    { id: 'jolly-rower', mediaSrc: 'jolly-rower.gif' },
    { id: 'little-goat', mediaSrc: 'little-goat.gif' },
    { id: 'kangaroo-hop', mediaSrc: 'kangaroo-hop.gif' },
    { id: 'snowy-walk', mediaSrc: 'snowy-walk.gif' },
    { id: 'frog-pond', mediaSrc: 'frog-pond.gif' },
    { id: 'bedtime-cat', mediaSrc: 'bedtime-cat.gif' },
    { id: 'jellyfish', mediaSrc: 'jellyfish.gif' },
    // Block 3: 5x5, hard 5x5 (the flattest pictures), bonus 4x4.
    { id: 'sunny-bird', mediaSrc: 'sunny-bird.gif' },
    { id: 'happy-cow', mediaSrc: 'happy-cow.gif' },
    { id: 'window-nap', mediaSrc: 'window-nap.gif' },
    { id: 'dino-pals', mediaSrc: 'dino-pals.gif' },
    { id: 'baby-whale', mediaSrc: 'baby-whale.gif' },
    { id: 'octopus-desk', mediaSrc: 'octopus-desk.gif' },
    { id: 'fireplace-cat', mediaSrc: 'fireplace-cat.gif' },
    { id: 'giraffe-run', mediaSrc: 'giraffe-run.gif' },
    { id: 'white-stork', mediaSrc: 'white-stork.gif' },
    { id: 'nest-birds', mediaSrc: 'nest-birds.gif' },
  ],

  /**
   * The difficulty sequence. Levels come in blocks of blockSize; inside a
   * block the types follow pattern (a sawtooth: hard spikes at the middle and
   * end, bonus levels as breathers). Each entry in blocks gives that block's
   * grid size per type (size x size tiles; bonus levels must be square).
   * Levels past the last block keep its sizes.
   */
  difficulty: {
    blockSize: 10,
    pattern: ['normal', 'normal', 'bonus', 'normal', 'hard', 'normal', 'bonus', 'normal', 'normal', 'hard'],
    blocks: [
      { normal: 3, hard: 4, bonus: 3 },
      { normal: 4, hard: 5, bonus: 4 },
      { normal: 5, hard: 5, bonus: 4 },
    ],
  },

  /** Background music and sound effects in assets/audio/. */
  audio: {
    bgmFile: 'geoffharvey-ping-pong-427889.mp3',
    /** Music level (0-1) and how long it takes to fade in when it starts. */
    bgmVolume: 0.22,
    bgmFadeInMs: 1500,
    /** While the win fanfare plays, the music drops to this share of its level. */
    duck: { level: 0.3, ms: 1900 },
    /** Overall sound-effect level (0-1). */
    sfxVolume: 0.7,
    /** The same sound cannot restart sooner than this; at most maxVoices play at once. */
    minIntervalMs: 40,
    maxVoices: 8,
    /**
     * Every sound effect. A file sound plays part of a file from assets/audio/sfx/:
     * offset skips its silent start, duration trims its tail, gain evens out
     * loudness between files. A synth sound is generated (see audio/synth.js).
     */
    sfx: {
      pickup: { file: 'Moving Single Tile.mp3', gain: 1.9, offset: 0.045, duration: 0.5 },
      pickupGroup: { file: 'Moving Merged tiles.mp3', gain: 1.05, offset: 0.04, duration: 0.5 },
      rotate: { file: 'Moving Single Tile.mp3', gain: 1.6, offset: 0.045, duration: 0.42, rate: 1.2 },
      swap: { synth: 'drop', gain: 0.6 },
      invalid: { synth: 'invalid', gain: 0.45 },
      merge: { synth: 'merge', gain: 0.5 },
      win: { synth: 'win', gain: 0.55 },
      hint: { synth: 'hint', gain: 0.42 },
      click: { synth: 'click', gain: 0.32 },
      locked: { synth: 'locked', gain: 0.4 },
      banner: { synth: 'whoosh', gain: 0.3 },
    },
    /** Each merge in a level plays a step higher on this scale (semitones). */
    mergeScale: [0, 2, 4, 7, 9, 12, 14, 16],
  },

  /** How touch and motion feel. Springs use stiffness/damping; impulses kick a spring. */
  juice: {
    spring: { stiffness: 420, damping: 23 },
    /** A tile (or group) under the pointer grows to this size. */
    hoverScale: 1.035,
    /** The kick a tile gets when it is picked up, on top of growing to drag.liftScale. */
    liftImpulse: 3.2,
    /** How far a dropped tile overshoots its cell before settling (0 = no overshoot). */
    dropOvershoot: 1.15,
    /** The squash when a dropped tile lands (negative = shrink first). */
    landImpulse: -2.4,
    /** The bounce when tiles lock together into a group. */
    mergeImpulse: 2.8,
    /** How bright a merging group glows (0 = none), and how fast the glow fades. */
    mergeGlow: 0.6,
    glowHalfLifeMs: 140,
    /** A single dragged tile leans into its movement, up to maxTilt radians. */
    maxTilt: 0.16,
    tiltPerSpeed: 0.03,
    /** Tiles pop in one after another when a level starts. */
    introTileMs: 380,
    introStaggerMs: 32,
  },

  /** The Hint button. */
  hint: {
    /** How far the hinted tile nudges toward its target, in world units, and how often. */
    nudge: 0.13,
    periodMs: 950,
    sourceColor: '#ffd54a',
    targetColor: '#ffffff',
    /** Size of the arrow icon between the piece and its place, as a fraction of a tile. */
    arrowIconSize: 0.55,
    /** Size of the spinning rotate icon on bonus levels, as a fraction of a tile. */
    rotateIconSize: 0.6,
  },

  /** Where progress is saved in the browser. Change the key to start everyone fresh. */
  save: {
    key: 'gifsolitaire-progress',
    /** Older save keys. A save found under one is migrated to `key` once, then removed. */
    legacyKeys: [],
    /**
     * Older save keys that are deleted, not migrated: listing a key here resets
     * every player's progress once. The levels were all reset on 2026-11-13.
     */
    discardKeys: ['picture-swap-progress', 'picture-swap-progress-v1'],
  },

  /** The banner that opens a bonus or hard level. Its badge comes from ui/icons.js. */
  banner: {
    /** How long the banner stays up before play starts. */
    showMs: 1500,
    labels: { hard: 'Hard Level', bonus: 'Bonus Level' },
  },

  /** Board geometry, in world units. The board is centred on the origin. */
  board: {
    /** Smallest number of columns or rows a level may have. */
    minGrid: 2,
    /** Outer edge length of the board frame. */
    size: 6,
    /** Space between the frame edge and the outermost tiles. */
    padding: 0.12,
    /** Space between neighbouring tiles. */
    gap: 0.05,
    /** Corner radius of a tile. */
    tileRadius: 0.14,
    /** Corner radius of the frame. */
    frameRadius: 0.24,
    /** Visible area as a multiple of the board size (1 = board fills the view). */
    viewScale: 1.3,
  },

  /** How a held tile looks. */
  drag: {
    /** Scale of the tile while it is held. */
    liftScale: 1.08,
    /** How far the shadow sits down and to the right of a held tile. */
    shadowOffset: 0.1,
    /** Opacity of the held tile's shadow. */
    shadowOpacity: 0.35,
  },

  /** Animation durations, in milliseconds. */
  anim: {
    /** A tile sliding into its new cell after a swap. */
    slideMs: 220,
    /** A tile returning home after an invalid drop. */
    returnMs: 180,
    /** A bonus tile rotating 90 degrees clockwise on tap. */
    rotateMs: 160,
  },

  /** What happens when the puzzle is solved. */
  win: {
    /** How long the white flash over the picture takes to fade. */
    flashMs: 650,
    /** Opacity of the flash at its brightest. */
    flashOpacity: 0.85,
    /** How big the board gets at the peak of its pop (1 = no pop). */
    popScale: 1.04,
    /** How long the pop takes, out and back. */
    popMs: 450,
    /** Wait between solving the puzzle and the Next button appearing. */
    nextDelayMs: 2500,
    /** A band of light sweeps across the finished picture. */
    shineDelayMs: 220,
    shineMs: 800,
    /** Every tile glows this much as the puzzle completes. */
    tileGlow: 0.4,
  },

  /** Visual effects. None of these change how the game plays. */
  effects: {
    /** When tiles merge into a group. */
    merge: {
      /** How long the gold outline takes to fade. */
      outlineMs: 550,
      /** Thickness of the gold outline, in world units. */
      outlineWidth: 0.09,
      /** Sparkles scattered over the new group. */
      sparkleCount: 9,
      /** How long one sparkle lasts. */
      sparkleMs: 550,
      /** Size of an average sparkle, in world units. */
      sparkleSize: 0.26,
    },
    /** When the puzzle is solved. */
    win: {
      /** Stars thrown outward from the edge of the picture (they never start over it). */
      starCount: 14,
      /** How long the stars stay on screen. */
      starsMs: 1150,
      /** Size of an average star, in world units. */
      starSize: 0.19,
      /** How fast the stars fly out, in world units per second. */
      starSpeed: 3.6,
      /** How hard the stars are pulled back down, in world units per second squared. */
      gravity: 5,
      /** Paper confetti thrown with the stars. */
      confettiCount: 16,
      confettiColors: ['#ff5d73', '#ffc531', '#4cc9f0', '#7bd389', '#b388ff', '#ffffff'],
    },
  },

  /** On-screen text. */
  ui: {
    nextLabel: 'Next',
    hintLabel: 'Hint',
    muteLabel: 'Mute sound (M)',
    unmuteLabel: 'Turn sound on (M)',
    hintTitle: 'Show the next move (H)',
    playLabel: 'Play',
    homeLabel: 'Home',
    homeTitle: 'Back to the level map (Esc)',
    /** The game's name: the logo's alt text on the level map. */
    gameTitle: 'Gifsolitaire',
    /** The word before a level's number. */
    levelLabel: 'Level',
    /** Shown on the map when every level is finished. */
    allDoneLabel: 'All done!',
    /** Words read out by screen readers for each level on the map. */
    levelWord: 'level',
    finishedWord: 'finished',
    lockedWord: 'locked',
    /** Furthest the Next button may sit below the board, in pixels (matters on tall screens). */
    nextMaxOffsetPx: 70,
    /** Furthest the level heading may sit above the board, in pixels (matters on tall screens). */
    hudMaxOffsetPx: 50,
  },

  /** Shuffle seed. null = a different shuffle every load; a number = repeatable. */
  shuffle: { seed: null },

  colors: {
    background: '#a8dc8c',
    /** The frame, which also shows through as the empty slot under a held tile. */
    frame: '#f3ead2',
    shadow: '#000000',
    /** The flash that plays over the finished picture. */
    winFlash: '#ffffff',
    /** The outline around a newly merged group. */
    mergeOutline: '#ffcc33',
  },
};
