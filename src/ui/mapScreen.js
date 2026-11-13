import { ICONS, badgeFor } from './icons.js';
import logoUrl from '../../Game Logo/Glossy Gifsolitaire Wordmark.png';

/**
 * The level map: the home screen. A full-screen page with the game's logo
 * and progress at the top, then every level in one centred 4-column
 * grid, in play order, showing which are finished, unlocked or locked; the
 * player picks one to play. Built from DOM elements; it reads progress but
 * never changes it.
 *
 * Each card shows the level's own GIF, supplied by setThumbnail() from the same
 * media the level plays, so a card can never show a different picture from its
 * puzzle. Unlocked cards animate; locked cards (blurred) show the first frame.
 * Until the picture arrives the card shows a loading shimmer.
 *
 * @example
 * const map = new MapScreen({ root, levels, config, onPlay, onLocked });
 * map.render(progress);
 * map.show();
 * map.setThumbnail('fireside-cat', { animated, still });
 */
export class MapScreen {
  /**
   * @param {object} deps
   * @param {HTMLElement} deps.root The element to build the map inside.
   * @param {object[]} deps.levels Every level in play order, from normalizeLevels().
   * @param {object} deps.config The game CONFIG.
   * @param {(levelIndex: number) => void} deps.onPlay The player picked an unlocked level.
   * @param {(levelIndex: number) => void} [deps.onLocked] The player picked a locked level.
   */
  constructor({ root, levels, config, onPlay, onLocked }) {
    this.root = root;
    this.levels = levels;
    this.config = config;
    this.onPlay = onPlay;
    this.onLocked = onLocked ?? (() => {});
    /** Card pictures by level id: { animated, still }. */
    this.thumbnails = new Map();

    // Header: the game's logo, then the progress bar.
    this.header = el('header', 'map-header');
    const title = el('h1', 'map-logo');
    const logo = el('img');
    logo.src = logoUrl;
    logo.alt = config.ui.gameTitle;
    logo.draggable = false;
    title.append(logo);
    const progressRow = el('div', 'map-progress');
    const bar = el('div', 'map-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    this.bar = bar;
    this.barFill = el('div', 'map-bar-fill');
    bar.append(this.barFill);
    progressRow.append(bar);
    this.header.append(title, progressRow);

    this.list = el('div', 'map-levels');
    this.playButton = el('button', 'map-play');
    this.playButton.type = 'button';
    this.playButton.addEventListener('click', () => {
      const index = Number(this.playButton.dataset.index);
      if (index >= 0) this.onPlay(index);
    });
    root.replaceChildren(this.header, this.list, this.playButton);
  }

  /** Whether the map is on screen. */
  get isShown() {
    return this.root.classList.contains('shown');
  }

  /** Bring the map up over the game, with the cards dealing in. */
  show() {
    this.root.classList.remove('entering');
    // Reading layout restarts the entrance animation.
    void this.root.offsetWidth;
    this.root.classList.add('shown', 'entering');
  }

  /** Take the map away. */
  hide() {
    this.root.classList.remove('shown');
  }

  /**
   * Give a level's card its pictures.
   * @param {string} levelId
   * @param {{animated: string, still: string, view?: object}} pictures From createLevelThumbnail().
   */
  setThumbnail(levelId, pictures) {
    this.thumbnails.set(levelId, pictures);
    const tile = this.list.querySelector(`.map-level[data-id="${CSS.escape(levelId)}"]`);
    if (tile) this.#applyPicture(tile.querySelector('.map-picture'), this.#pictureFor(levelId, tile.classList.contains('locked')));
  }

  /**
   * The animated picture for a playable card, the still one for a locked card.
   * The still is already cut to the level's square; the animated file is the
   * whole picture, so it comes with where to place it to show that square.
   */
  #pictureFor(levelId, locked) {
    const pictures = this.thumbnails.get(levelId);
    if (!pictures) return null;
    return locked ? { url: pictures.still, view: null } : { url: pictures.animated, view: pictures.view ?? null };
  }

  #applyPicture(picture, shown) {
    if (!shown) {
      picture.classList.add('loading');
      picture.removeAttribute('src');
      return;
    }
    picture.classList.remove('loading');
    if (picture.getAttribute('src') !== shown.url) picture.src = shown.url;
    const { view } = shown;
    picture.classList.toggle('placed', Boolean(view));
    if (view) {
      picture.style.left = `${view.left}%`;
      picture.style.top = `${view.top}%`;
      picture.style.width = `${view.width}%`;
      picture.style.height = `${view.height}%`;
      // Grow on hover around the card's centre, not the whole picture's.
      picture.style.transformOrigin = `${((50 - view.left) / view.width) * 100}% ${((50 - view.top) / view.height) * 100}%`;
    } else {
      picture.removeAttribute('style');
    }
  }

  /**
   * Redraw the map for the current progress.
   * @param {import('../core/progress.js').Progress} progress
   * @param {{justCompleted?: number}} [options] A level finished just now, to celebrate on the map.
   * @example map.render(progress, { justCompleted: 2 });
   */
  render(progress, { justCompleted = -1 } = {}) {
    const next = progress.nextPlayable();
    const total = this.levels.length;
    // The bar's numbers are for screen readers; the map no longer prints "N / total".
    this.bar.setAttribute('aria-valuemax', String(total));
    this.bar.setAttribute('aria-valuenow', String(progress.completedCount));
    this.bar.classList.toggle('bump', justCompleted >= 0);
    this.barFill.style.width = `${total ? (progress.completedCount / total) * 100 : 0}%`;

    this.list.replaceChildren(
      ...this.levels.map((level, index) => {
        const tile = this.#levelTile(index, progress, index === next);
        tile.style.setProperty('--i', String(index + 1));
        if (index === justCompleted) tile.classList.add('just-completed');
        if (justCompleted >= 0 && index === next && index !== justCompleted) tile.classList.add('just-unlocked');
        return tile;
      }),
    );

    this.playButton.dataset.index = String(next);
    this.playButton.textContent = next >= 0 ? this.config.ui.playLabel : this.config.ui.allDoneLabel;
    this.playButton.disabled = next < 0;
  }

  /** One level on the map: its picture, number, type badge and state. */
  #levelTile(index, progress, isNext) {
    const level = this.levels[index];
    const completed = progress.isCompleted(index);
    const unlocked = progress.isUnlocked(index);

    const tile = el('button', 'map-level');
    tile.type = 'button';
    tile.dataset.index = String(index);
    tile.dataset.id = level.id;
    tile.classList.toggle('completed', completed);
    tile.classList.toggle('locked', !unlocked);
    tile.classList.toggle('next', isNext);
    tile.classList.toggle('bonus', Boolean(level.isBonus || level.type === 'bonus'));
    // Locked cards stay clickable (aria-disabled, not disabled) so they can answer with a shake.
    if (!unlocked) tile.setAttribute('aria-disabled', 'true');
    const { levelWord, finishedWord, lockedWord } = this.config.ui;
    const status = completed ? `, ${finishedWord}` : unlocked ? '' : `, ${lockedWord}`;
    tile.setAttribute('aria-label', `${levelWord} ${level.number}${status}`);
    tile.addEventListener('click', () => {
      if (unlocked) {
        this.onPlay(index);
        return;
      }
      tile.classList.remove('shake');
      void tile.offsetWidth;
      tile.classList.add('shake');
      this.onLocked(index);
    });

    const picture = el('img', 'map-picture');
    picture.alt = '';
    picture.draggable = false;
    this.#applyPicture(picture, this.#pictureFor(level.id, !unlocked));
    tile.append(picture);

    const isBonus = Boolean(level.isBonus || level.type === 'bonus');
    const iconUrl = badgeFor(isBonus ? 'bonus' : level.type);
    if (iconUrl) {
      const badge = el('img', 'map-badge');
      badge.alt = '';
      badge.src = iconUrl;
      tile.append(badge);
    }

    if (completed || !unlocked) {
      const state = el('img', 'map-state');
      state.alt = '';
      state.draggable = false;
      state.src = completed ? ICONS.check : ICONS.lock;
      tile.append(state);
    }
    return tile;
  }
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
