import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Board, createRng } from './core/board.js';
import { joinMasks, findGroups, groupSignatures, findNewGroups } from './core/groups.js';
import { GameSession } from './core/session.js';
import { normalizeLevels, bannerFor, validateLevels } from './core/levels.js';
import { applyDifficulty, checkDifficultySequence } from './core/difficulty.js';
import { loadProgress, saveProgress } from './core/progress.js';
import { findHint, refreshHint } from './core/hint.js';
import { BoardView } from './render/boardView.js';
import { Effects } from './render/effects.js';
import { createLevelMedia, createLevelThumbnail } from './render/animatedMedia.js';
import { DragController } from './input/drag.js';
import { MapScreen } from './ui/mapScreen.js';
import { ICONS, badgeFor } from './ui/icons.js';
import { AudioManager } from './audio/audioManager.js';

/** Longest step the game advances in one frame, so a hidden tab does not jump ahead. */
const MAX_FRAME_MS = 100;

/** Turn a Vite glob of files into { fileName: url }. */
const byFileName = (modules) =>
  Object.fromEntries(Object.entries(modules).map(([path, url]) => [path.split('/').pop(), url]));

/** Every picture a level can play, from assets/gifs/ (GIFs, plus videos or stills if added). */
const mediaUrls = byFileName(
  import.meta.glob('../assets/gifs/*.{gif,mp4,webm,jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }),
);
const audioUrls = byFileName(
  import.meta.glob('../assets/audio/**/*.{mp3,wav,ogg}', { eager: true, query: '?url', import: 'default' }),
);

/** The browser's storage, or null where it is switched off. */
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function start() {
  const levels = normalizeLevels(applyDifficulty(CONFIG.levels, CONFIG.difficulty));
  const problems = validateLevels(levels, Object.keys(mediaUrls), CONFIG.board.minGrid);
  if (problems.length > 0) throw new Error(`The levels in config.js have problems:\n${problems.join('\n')}`);
  // A level that overrides its grid or type can break the ramp; say so (the tests fail on it too).
  const offCurve = checkDifficultySequence(levels);
  if (offCurve.length > 0) console.warn(`[levels] Off the difficulty sequence:\n${offCurve.join('\n')}`);

  const storage = browserStorage();
  // Saves that were reset are deleted, so they cannot come back.
  for (const oldKey of CONFIG.save.discardKeys ?? []) {
    try {
      storage?.removeItem(oldKey);
    } catch {
      // Storage switched off part-way: nothing to clean up.
    }
  }
  // Saves from before the single level list are migrated here, once.
  const progress = loadProgress(storage, CONFIG.save.key, levels.map((level) => level.id), {
    legacyKeys: CONFIG.save.legacyKeys,
  });
  // Players who ask their system for less motion get the game without particles and bounces.
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // ---- Audio: starts on the first gesture (browsers block it before that).
  const audio = new AudioManager({ audioUrls, config: CONFIG.audio, storage });
  const unlockAudio = () => audio.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  const muteButton = document.getElementById('mute');
  const muteIcon = muteButton.querySelector('img');
  const syncMuteButton = (muted) => {
    muteIcon.src = muted ? ICONS.soundOff : ICONS.soundOn;
    muteButton.setAttribute('aria-pressed', String(muted));
    const label = muted ? CONFIG.ui.unmuteLabel : CONFIG.ui.muteLabel;
    muteButton.setAttribute('aria-label', label);
    muteButton.title = label;
    muteButton.classList.remove('flip');
    void muteButton.offsetWidth;
    muteButton.classList.add('flip');
  };
  syncMuteButton(audio.muted);
  audio.onMuteChange(syncMuteButton);
  muteButton.addEventListener('click', () => {
    audio.toggleMute();
    audio.play('click');
  });

  // ---- Renderer and camera.
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.colors.background);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;

  const hud = document.getElementById('hud');
  const levelName = document.getElementById('level-name');
  const levelNameIcon = levelName.querySelector('img');
  const levelNameText = levelName.querySelector('.text');
  const levelCount = document.getElementById('level-count');
  const homeButton = document.getElementById('home');
  homeButton.querySelector('img').src = ICONS.home;
  homeButton.querySelector('.text').textContent = CONFIG.ui.homeLabel;
  homeButton.title = CONFIG.ui.homeTitle;
  const nextButton = document.getElementById('next');
  nextButton.textContent = CONFIG.ui.nextLabel;
  const hintButton = document.getElementById('hint');
  hintButton.querySelector('.text').textContent = CONFIG.ui.hintLabel;
  hintButton.querySelector('.bulb').src = ICONS.hint;
  hintButton.title = CONFIG.ui.hintTitle;
  const banner = document.getElementById('banner');
  const bannerIcon = banner.querySelector('img');
  const bannerLabel = banner.querySelector('.label');

  // Keep the whole board in view at any window shape.
  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    const span = CONFIG.board.size * CONFIG.board.viewScale;
    const viewH = aspect >= 1 ? span : span / aspect;
    const viewW = viewH * aspect;
    camera.left = -viewW / 2;
    camera.right = viewW / 2;
    camera.top = viewH / 2;
    camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);

    // Level heading above the board; Next and Hint below it.
    const halfBoard = (CONFIG.board.size / 2 / viewH) * height;
    const boardTop = height / 2 - halfBoard;
    const boardBottom = height / 2 + halfBoard;
    hud.style.top = `${Math.max(boardTop / 2, boardTop - CONFIG.ui.hudMaxOffsetPx)}px`;
    const below = `${Math.min((boardBottom + height) / 2, boardBottom + CONFIG.ui.nextMaxOffsetPx)}px`;
    nextButton.style.top = below;
    hintButton.style.top = below;
  };
  window.addEventListener('resize', resize);
  resize();

  /** The puzzle being played: its board, view, input, session and live media. */
  let level = null;
  let loading = false;
  /** The winning move has been made; the win effect starts when the tiles come to rest. */
  let winPending = false;
  /**
   * The hint the player asked for, kept until its tile merges with another or
   * reaches the suggested place (see refreshHint). null when there is none.
   */
  let activeHint = null;
  /** Milliseconds until the Next button appears; 0 or less = not counting. */
  let nextTimer = 0;
  /** Milliseconds until the opening banner goes away; 0 or less = no banner up. */
  let bannerTimer = 0;
  /** A level finished in this visit, to celebrate on the map next time it opens. */
  let justCompleted = -1;
  /** Merges so far in this level: each one chimes a step higher. */
  let mergeCount = 0;

  const map = new MapScreen({
    root: document.getElementById('map'),
    levels,
    config: CONFIG,
    onPlay: (index) => {
      audio.play('click');
      playLevel(index);
    },
    onLocked: () => audio.play('locked'),
  });

  // Every card shows a picture made from its own level's media. One at a time,
  // in play order, so the first cards fill in first and nothing competes for the network.
  (async () => {
    for (const def of levels) {
      try {
        map.setThumbnail(def.id, await createLevelThumbnail(def, { mediaUrls }));
      } catch (error) {
        console.warn(`[map] No thumbnail for ${def.id}`, error);
      }
    }
  })();

  /** Show which level is being played: "Level N", its type badge, and "N / total". */
  function renderHud(index) {
    const def = levels[index];
    levelNameText.textContent = `${CONFIG.ui.levelLabel} ${def.number}`;
    const iconUrl = badgeFor(def.type);
    levelNameIcon.hidden = !iconUrl;
    if (iconUrl) levelNameIcon.src = iconUrl;
    levelCount.textContent = `${def.number} / ${levels.length}`;
    levelCount.classList.remove('won');
  }

  function hideBanner() {
    banner.classList.remove('shown');
    bannerTimer = 0;
  }

  /** Put up the opening banner for a level. */
  function showBanner(info) {
    banner.classList.remove('hard', 'bonus');
    banner.classList.add(info.kind, 'shown');
    bannerLabel.replaceChildren();
    if (info.heading) {
      const heading = document.createElement('small');
      heading.textContent = info.heading;
      bannerLabel.append(heading);
    }
    bannerLabel.append(info.label);
    const iconUrl = badgeFor(info.kind);
    bannerIcon.hidden = !iconUrl;
    if (iconUrl) bannerIcon.src = iconUrl;
    bannerTimer = Math.max(1, CONFIG.banner.showMs);
    audio.play('banner');
  }

  /** Show the right button under the board: Hint while playing, Next after a win. */
  function syncBoardButtons() {
    const playing = level && !map.isShown && !level.session.isWon && !loading;
    hintButton.classList.toggle('shown', Boolean(playing));
    hintButton.classList.toggle('waiting', Boolean(playing) && (!level.drag.enabled || bannerTimer > 0));
  }

  /** Take the hint overlay and nudge off the board (the hint itself is kept). */
  function hideHint() {
    if (!level) return;
    level.effects.clearHint();
    level.view.clearHintMotion();
  }

  /** Forget the hint entirely. */
  function dropHint() {
    activeHint = null;
    hideHint();
  }

  /** Draw the active hint: what to pick up and where it goes. */
  function drawHint() {
    if (!level || !activeHint) return;
    const { board, view, effects } = level;
    effects.showHint(activeHint, joinMasks(board));
    if (activeHint.kind === 'move') {
      const dx = activeHint.dCol * view.pitchX;
      const dy = -activeHint.dRow * view.pitchY;
      const length = Math.hypot(dx, dy) || 1;
      view.setHintMotion(activeHint.tileIds, { dx: dx / length, dy: dy / length });
    } else {
      view.setHintMotion(activeHint.tileIds, null);
    }
  }

  /**
   * After the tiles come to rest: keep showing the hint, re-aimed from where its
   * tile is now, until the tile has merged or reached the suggested place.
   */
  function updateHintAfterMove() {
    if (!level || !activeHint) return;
    activeHint = refreshHint(level.board, activeHint);
    if (activeHint && !level.session.isWon) drawHint();
    else dropHint();
  }

  /**
   * The Hint button: point out the next move. Pressing it again while a hint is
   * still being followed shows that same hint again rather than a new one.
   */
  function showHint() {
    if (!level || map.isShown || level.session.isWon || !level.drag.enabled || level.drag.isHolding) return;
    const { board, def } = level;
    activeHint =
      refreshHint(board, activeHint) ?? findHint(board, { allowDrag: !def.isBonus, allowRotate: Boolean(def.isBonus) });
    if (!activeHint) return;
    drawHint();
    audio.play('hint');
    hintButton.classList.remove('pop');
    void hintButton.offsetWidth;
    hintButton.classList.add('pop');
  }

  /** Throw away the current puzzle (if any) and start the level at this index. */
  async function startLevel(index) {
    if (loading) return;
    loading = true;
    nextButton.classList.remove('shown');
    hideBanner();
    nextTimer = 0;
    winPending = false;
    mergeCount = 0;
    activeHint = null;
    syncBoardButtons();

    const def = levels[index];
    const media = await createLevelMedia(def, {
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      mediaUrls,
    });

    if (level) {
      level.drag.dispose();
      level.effects.dispose();
      level.view.dispose();
      level.media.dispose();
    }

    const board = new Board(def.cols, def.rows);
    const rng = createRng(CONFIG.shuffle.seed ?? Date.now());
    if (def.isBonus) {
      // Bonus levels keep tiles in their solved grid positions and scramble rotations only.
      board.randomizeRotations(rng);
    } else {
      board.shuffle(rng);
    }
    const session = new GameSession();
    const view = new BoardView({ scene, texture: media.texture, board, config: CONFIG, reducedMotion, trim: def.trim });
    const effects = new Effects({ parent: view.root, view, config: CONFIG });
    const drag = new DragController({
      dom: renderer.domElement,
      camera,
      board,
      view,
      config: CONFIG,
      allowDrag: !def.isBonus,
      allowRotate: Boolean(def.isBonus),
      onPickUp: (cells) => {
        hideHint();
        audio.play(cells.length > 1 ? 'pickupGroup' : 'pickup');
      },
      onRotate: () => {
        hideHint();
        audio.play('rotate');
      },
      onDrop: () => audio.play('swap'),
      onInvalid: () => audio.play('invalid'),
      onMove: () => {
        if (session.recordMove(board)) {
          drag.enabled = false;
          winPending = true;
          // Save straight away, so a win counts even if the page is closed mid-celebration.
          if (progress.complete(index)) {
            saveProgress(storage, CONFIG.save.key, progress);
            justCompleted = index;
          }
          syncBoardButtons();
        }
      },
    });

    // Joined tiles fuse and move as one piece. Joins are worked out again each
    // time the tiles come to rest, and that is also when a win is celebrated.
    view.setJoins(joinMasks(board));
    let signatures = groupSignatures(board);
    view.onSettle = () => {
      const masks = joinMasks(board);
      view.setJoins(masks);
      const fresh = findNewGroups(board, signatures);
      signatures = groupSignatures(board);
      for (const cells of fresh) {
        view.pulseGroup(cells.map((cell) => board.tileAt(cell)));
        // The winning merge gets the outline only; the win celebration takes over from there.
        if (!reducedMotion) effects.mergeFlash(cells, masks, { sparkles: !winPending });
      }
      if (winPending) {
        winPending = false;
        view.playWin();
        if (!reducedMotion) effects.winBurst();
        audio.play('win');
        audio.duckMusic();
        levelCount.classList.add('won');
        nextTimer = Math.max(1, CONFIG.win.nextDelayMs);
      } else if (fresh.length > 0) {
        const scale = CONFIG.audio.mergeScale;
        const step = scale[Math.min(mergeCount, scale.length - 1)];
        mergeCount += 1;
        audio.play('merge', { pitch: Math.pow(2, step / 12) });
      }
      // A hint stays up until its tile merges or reaches the suggested place.
      updateHintAfterMove();
    };

    level = { board, view, effects, drag, session, media, def, index };
    renderHud(index);

    // Some levels open with a banner; play starts when it goes away.
    const info = bannerFor(def, CONFIG.banner);
    if (info) {
      drag.enabled = false;
      showBanner(info);
    }

    loading = false;
    // If the player went back to the map while this level was loading, keep it paused.
    if (map.isShown) drag.enabled = false;
    syncBoardButtons();
    exposeForDev();
  }

  /** Leave the map and play a level. */
  function playLevel(index) {
    if (loading || !progress.isUnlocked(index)) return;
    map.hide();
    startLevel(index);
  }

  /** Go back to the level map, leaving whatever level was on screen. */
  function goToMap() {
    if (level) {
      level.drag.enabled = false;
      dropHint();
    }
    nextButton.classList.remove('shown');
    hideBanner();
    nextTimer = 0;
    map.render(progress, { justCompleted });
    justCompleted = -1;
    map.show();
    syncBoardButtons();
  }

  /** Advance the game by a number of milliseconds. */
  function tick(deltaMs) {
    if (!level) return;
    level.media.update(deltaMs);
    level.view.update(deltaMs);
    level.effects.update(deltaMs);
    if (bannerTimer > 0) {
      bannerTimer -= deltaMs;
      if (bannerTimer <= 0) {
        hideBanner();
        if (!level.session.isWon && !map.isShown) level.drag.enabled = true;
        syncBoardButtons();
      }
    }
    if (nextTimer > 0) {
      nextTimer -= deltaMs;
      if (nextTimer <= 0 && !map.isShown) {
        nextButton.classList.add('shown');
        syncBoardButtons();
      }
    }
  }

  /** In development only: hand the game's parts to the browser console and to scripted checks. */
  function exposeForDev() {
    if (!import.meta.env.DEV) return;
    window.__game = {
      ...(level ?? {}),
      config: CONFIG,
      levels,
      progress,
      storage,
      map,
      audio,
      camera,
      joinMasks,
      findGroups,
      findHint,
      tick,
      nextButton,
      hintButton,
      banner,
      hud,
      startLevel,
      playLevel,
      goToMap,
      showHint,
      getActiveHint: () => activeHint,
      getLevel: () => level,
    };
  }

  // After a win, Next returns to the map, where the following level is now unlocked.
  nextButton.addEventListener('click', () => {
    if (!nextButton.classList.contains('shown')) return;
    audio.play('click');
    goToMap();
  });
  homeButton.addEventListener('click', () => {
    audio.play('click');
    goToMap();
  });
  hintButton.addEventListener('click', showHint);

  // Keyboard: M mutes, H shows a hint, Esc goes home to the map.
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'escape' && !map.isShown) {
      homeButton.click();
      return;
    }
    if (key === 'm') {
      audio.toggleMute();
      audio.play('click');
    } else if (key === 'h') {
      showHint();
    }
  });

  exposeForDev();
  goToMap();

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const deltaMs = Math.min(now - last, MAX_FRAME_MS);
    last = now;
    // While the map covers the screen the level is paused: no animation work, no drawing.
    if (map.isShown) return;
    tick(deltaMs);
    renderer.render(scene, camera);
  });
}

start();
