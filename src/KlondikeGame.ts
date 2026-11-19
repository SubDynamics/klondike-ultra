import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  Ticker,
  FederatedPointerEvent
} from 'pixi.js';
import { Card } from './Card';
import type { ColorTheme } from './types/themeTypes';
import { defaultTheme } from './themes/defaultTheme';
import { makeButton } from './shared/buttons';
import { easingValue } from './shared/easing';
import {
  type GameState,
  createGameState,
  drawFromStock,
  moveWasteToFoundation,
  removeTopWasteCard,
  moveTableauToFoundation,
  canPlaceOnTableau,
  canPlaceOnFoundation,
  foundationIndexForSuit,
  isWon,
  TABLEAU_COUNT,
  FOUNDATION_COUNT
} from './KlondikeState';
import {
  type CardDims,
  makeCardBack,
  makeCardFace,
  makeEmptySlot,
  CardView
} from './shared/cardSprites';

// ─── Base layout values (design reference at 750 px wide) ─────────────────────
const BASE_W = 750;
const BASE_CARD_W = 80;
const BASE_CARD_H = 112;
const BASE_CARD_RADIUS = 8;
const BASE_TABLEAU_X_START = 20;
const BASE_TABLEAU_Y = 180;
const BASE_COL_SPACING = 100;
const BASE_FACE_UP_OFFSET = 28;
const BASE_FACE_DOWN_OFFSET = 14;
const BASE_STOCK_X = 20;
const BASE_WASTE_X = 130;
const BASE_WASTE_OFFSET = 60;
const BASE_TOP_Y = 40;
const BASE_FOUNDATION_X_START = 330;
const BASE_DROP_ZONE_EXPANSION = 30;
const BASE_DROP_ZONE_BOTTOM = 60;
const BASE_CLICK_DISTANCE = 6;
const FOUNDATION_ANIMATION_MS = 250;
const THREE_CARD_DRAW_COUNT = 3;
const HALF = 0.5;
const TWO = 2;
const BUTTON_FONT_SIZE = 13;

// ─── Drag state ───────────────────────────────────────────────────────────────
interface DragInfo {
  views: CardView[];
  /** tableau col the drag started from, or -1 for waste */
  fromCol: number;
  /** row within tableau column, or -1 */
  fromRow: number;
  /** foundation index or -1 */
  fromFoundation: number;
  /** original container position before drag */
  origX: number;
  origY: number;
  /** mouse offset inside card */
  offX: number;
  offY: number;
  /** container that holds the dragged views during drag */
  container: Container;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

// ─── KlondikeGame ─────────────────────────────────────────────────────────────

/**
 * Top-level game controller that owns the PixiJS scene graph and all game logic.
 *
 * **Responsibilities**
 * - Maintains the `GameState` and reacts to user input (tap, drag & drop).
 * - Scales every layout value from a single `scale` factor (`viewportWidth / 750`),
 *   so the game fills any viewport without fixed pixel assumptions.
 * - Rebuilds the entire scene on each state change or viewport resize via `renderAll()`.
 *
 * **Scene structure**
 * ```
 * app.stage
 *   ├── background (Graphics)
 *   ├── mainLayer  (Container) — all static game elements
 *   └── dragLayer  (Container) — cards being dragged (always on top)
 * ```
 *
 * **Key methods by category**
 * - _Lifecycle_: `constructor`, `onResize`, `build`, `renderAll`
 * - _Rendering_: `renderStock`, `renderWaste`, `renderFoundations`, `renderTableau`
 * - _UI controls_: `buildNewGameButton`, `buildThemeButton`, `cycleTheme`, `newGame`
 * - _Interaction_: `startDragWaste`, `startDragTableau`, `beginDrag`,
 *                  `onDragMove`, `onDragEnd`, `tryDrop`
 * - _Tap shortcuts_: `autoPlayDrag`
 * - _Win detection_: `checkWin`, `showWinScreen`
 */
export class KlondikeGame {
  private app: Application;
  private state: GameState;
  private themes: ColorTheme[];
  private currentThemeIndex: number;
  private drawCount: 1 | typeof THREE_CARD_DRAW_COUNT = 1;
  private settingsOpen = false;
  private tableauViews: CardView[][] = [];
  private drag: DragInfo | null = null;
  private animation: ((ticker: Ticker) => void) | null = null;
  private foundationViews: Container[] = [];
  private mainLayer!: Container;
  private dragLayer!: Container;

  /**
   * Creates and starts the game.
   *
   * @param app               - Initialised PixiJS Application instance.
   * @param themes            - Array of available colour themes (at least one required).
   * @param initialThemeIndex - Index of the theme to activate on startup (default `0`).
   */
  constructor(app: Application, themes: ColorTheme[], initialThemeIndex = 0) {
    this.app = app;
    this.themes = themes.length > 0 ? themes : [defaultTheme];
    this.currentThemeIndex = Math.min(
      Math.max(initialThemeIndex, 0),
      Math.max(this.themes.length - 1, 0)
    );
    this.state = createGameState();
    this.build();
  }

  private get theme(): ColorTheme {
    return this.themes[this.currentThemeIndex];
  }

  private get W(): number {
    return this.app.screen.width;
  }
  private get H(): number {
    return this.app.screen.height;
  }

  // ── Scaled layout values ─────────────────────────────────────────────────

  /**
   * Uniform scale factor derived from the current viewport width relative to
   * the 750 px design reference width. All other layout getters multiply their
   * `BASE_*` constant by this value so the game fills any screen size.
   */
  private get scale(): number {
    return this.W / BASE_W;
  }
  /** Scaled card width in pixels. */
  private get cardW(): number {
    return Math.round(BASE_CARD_W * this.scale);
  }
  /** Scaled card height in pixels. */
  private get cardH(): number {
    return Math.round(BASE_CARD_H * this.scale);
  }
  /** Scaled card corner radius in pixels. */
  private get cardRadius(): number {
    return Math.round(BASE_CARD_RADIUS * this.scale);
  }
  /** Convenience bundle of the three scaled card dimensions. */
  private get dims(): CardDims {
    return { w: this.cardW, h: this.cardH, r: this.cardRadius };
  }
  /** Horizontal distance between the left edges of adjacent columns/slots. */
  private get colSpacing(): number {
    return Math.round(BASE_COL_SPACING * this.scale);
  }
  /** X coordinate of the first (leftmost) tableau column. */
  private get tableauXStart(): number {
    return Math.round(BASE_TABLEAU_X_START * this.scale);
  }
  /** Y coordinate of the top of the tableau area. */
  private get tableauY(): number {
    return Math.round(BASE_TABLEAU_Y * this.scale);
  }
  /** Vertical offset between consecutive face-up cards in a tableau column. */
  private get faceUpOffset(): number {
    return Math.round(BASE_FACE_UP_OFFSET * this.scale);
  }
  /** Vertical offset between consecutive face-down cards in a tableau column. */
  private get faceDownOffset(): number {
    return Math.round(BASE_FACE_DOWN_OFFSET * this.scale);
  }
  /** X coordinate of the stock pile. */
  private get stockX(): number {
    return Math.round(BASE_STOCK_X * this.scale);
  }
  /** X coordinate of the waste pile. */
  private get wasteX(): number {
    return Math.round(BASE_WASTE_X * this.scale);
  }
  /** Y coordinate of the top row (stock, waste, foundations). */
  private get topY(): number {
    return Math.round(BASE_TOP_Y * this.scale);
  }
  /** X coordinate of the first (leftmost) foundation slot. */
  private get foundationXStart(): number {
    return Math.round(BASE_FOUNDATION_X_START * this.scale);
  }

  /**
   * Called by `main.ts` whenever the PixiJS renderer is resized (e.g. the
   * browser window changes size). Triggers a full scene rebuild so all
   * layout values are recalculated at the new viewport dimensions.
   */
  onResize(): void {
    const wasAnimating = !!this.animation;
    this.build();
    if (wasAnimating) this.checkWin();
  }

  // ── Build the scene ──────────────────────────────────────────────────────

  /**
   * Tears down the entire PixiJS scene and rebuilds it from scratch.
   * Creates the felt background, two rendering layers, and calls `renderAll()`.
   * Invoked on first load, theme change, new game, and viewport resize.
   */
  private build(): void {
    this.cancelInteraction();
    this.app.stage.removeChildren();

    // Background
    const bg = new Graphics();
    bg.rect(0, 0, this.W, this.H).fill({
      color: this.theme.feltGreenBg
    });
    this.app.stage.addChild(bg);

    this.mainLayer = new Container();
    this.dragLayer = new Container();
    this.app.stage.addChild(this.mainLayer, this.dragLayer);

    this.tableauViews = Array.from({ length: TABLEAU_COUNT }, () => []);

    this.buildStock();
    this.buildFoundationSlots();
    this.buildTableauSlots();
    this.renderAll();
  }

  /** Adds a "New Game" button to the top-right area of the scene. */
  private buildNewGameButton(): void {
    const BUTTON_WIDTH = 90;
    const gameScale = this.scale;
    const btn = makeButton(
      this.theme,
      gameScale,
      'New Game',
      BUTTON_WIDTH,
      BUTTON_FONT_SIZE,
      () => this.newGame()
    );
    const horizOffset = 105;
    const vertOffset = 8;
    btn.x = this.W - Math.round(horizOffset * gameScale);
    btn.y = Math.round(vertOffset * gameScale);
    this.mainLayer.addChild(btn);
  }

  /** Adds a "Theme: …" cycle button to the top-right area of the scene. */
  private buildThemeButton(): void {
    const gameScale = this.scale;
    const btn = makeButton(
      this.theme,
      gameScale,
      `Theme: ${this.theme.name}`,
      145,
      BUTTON_FONT_SIZE,
      () => this.cycleTheme()
    );
    btn.x = this.W - Math.round(260 * gameScale);
    btn.y = Math.round(8 * gameScale);
    this.mainLayer.addChild(btn);
  }

  /** Adds the settings button to the top bar. */
  private buildSettingsButton(): void {
    const gameScale = this.scale;
    const btn = makeButton(
      this.theme,
      gameScale,
      'Settings',
      85,
      BUTTON_FONT_SIZE,
      () => {
        this.settingsOpen = true;
        this.renderAll();
      }
    );
    btn.position.set(
      this.W - Math.round(355 * gameScale),
      Math.round(8 * gameScale)
    );
    this.mainLayer.addChild(btn);
  }

  /** Renders the settings overlay and its list of gameplay options. */
  private renderSettings(): void {
    const options = [
      {
        label: '3-Card draw',
        enabled: this.drawCount === THREE_CARD_DRAW_COUNT,
        toggle: (): void => {
          this.drawCount =
            this.drawCount === THREE_CARD_DRAW_COUNT
              ? 1
              : THREE_CARD_DRAW_COUNT;
        }
      }
    ];
    const s = Math.min(this.scale, this.H / (160 + options.length * 50));
    const panelW = 340 * s;
    const panelH = (140 + options.length * 50) * s;
    const x = (this.W - panelW) * HALF;
    const y = (this.H - panelH) * HALF;
    const overlay = new Container();
    overlay.zIndex = 1000;
    const backdrop = new Graphics();
    backdrop.rect(0, 0, this.W, this.H).fill({ color: 0x000000, alpha: 0.65 });
    backdrop.eventMode = 'static';
    overlay.addChild(backdrop);

    const panel = new Graphics();
    panel
      .roundRect(x, y, panelW, panelH, 12 * s)
      .fill({ color: this.theme.winScreenPanelFill })
      .stroke({ color: this.theme.winScreenPanelStroke, width: TWO * s });
    panel.eventMode = 'static';
    overlay.addChild(panel);

    const title = new Text({
      text: 'Settings',
      style: new TextStyle({
        fontSize: 24 * s,
        fill: this.theme.lightTextColor,
        fontWeight: 'bold'
      })
    });
    title.anchor.set(HALF);
    title.position.set(this.W * HALF, y + 30 * s);
    overlay.addChild(title);

    options.forEach((option, i) => {
      const row = new Container();
      const rowBg = new Graphics();
      rowBg
        .roundRect(0, 0, 300 * s, 40 * s, 6 * s)
        .fill({ color: this.theme.newGameButtonFill })
        .stroke({ color: this.theme.newGameButtonStroke, width: s });
      const label = new Text({
        text: `${option.label}: ${option.enabled ? 'On' : 'Off'}`,
        style: new TextStyle({
          fontSize: 16 * s,
          fill: this.theme.newGameButtonTextColor
        })
      });
      label.anchor.set(0, HALF);
      label.position.set(12 * s, 20 * s);
      row.addChild(rowBg, label);
      row.position.set(x + 20 * s, y + (55 + i * 50) * s);
      row.eventMode = 'static';
      row.cursor = 'pointer';
      row.on('pointerdown', () => {
        option.toggle();
        this.renderAll();
      });
      overlay.addChild(row);
    });

    const close = new Text({
      text: 'Close',
      style: new TextStyle({
        fontSize: 16 * s,
        fill: this.theme.lightTextColor,
        fontWeight: 'bold'
      })
    });
    close.anchor.set(HALF);
    close.position.set(this.W * HALF, y + panelH - 25 * s);
    close.eventMode = 'static';
    close.cursor = 'pointer';
    close.on('pointerdown', () => {
      this.settingsOpen = false;
      this.renderAll();
    });
    overlay.addChild(close);
    this.mainLayer.addChild(overlay);
  }

  /** Advances to the next available theme and rebuilds the scene. No-op when only one theme is loaded. */
  private cycleTheme(): void {
    if (this.themes.length <= 1) return;
    this.currentThemeIndex = (this.currentThemeIndex + 1) % this.themes.length;
    this.drag = null;
    this.build();
  }

  /** Resets to a freshly shuffled game and rebuilds the scene. */
  private newGame(): void {
    this.state = createGameState();
    this.drag = null;
    this.build();
  }

  // ── Stock ────────────────────────────────────────────────────────────────
  /** No-op placeholder; stock is rendered entirely via `renderAll` → `renderStock`. */
  private buildStock(): void {
    // Stock is rendered via renderAll; this is a no-op placeholder
  }

  // ── Foundation slots ─────────────────────────────────────────────────────
  /** No-op placeholder; foundation slots are rendered entirely via `renderAll` → `renderFoundations`. */
  private buildFoundationSlots(): void {
    // Slots are just visual placeholders; actual cards drawn in renderAll
  }

  // ── Tableau slots ────────────────────────────────────────────────────────
  /** No-op placeholder; tableau slots are rendered entirely via `renderAll` → `renderTableau`. */
  private buildTableauSlots(): void {
    // Slots are just visual placeholders; actual cards drawn in renderAll
  }

  // ── Render all ───────────────────────────────────────────────────────────

  /**
   * Clears both rendering layers and redraws the complete game board:
   * buttons, stock, waste, foundations, and all tableau columns.
   * Also cancels any active drag. Called after every game-state change.
   */
  renderAll(): void {
    const wasAnimating = !!this.animation;
    this.cancelInteraction();
    this.mainLayer.removeChildren();
    this.dragLayer.removeChildren();
    this.mainLayer.eventMode = 'auto';

    this.tableauViews = Array.from({ length: TABLEAU_COUNT }, () => []);
    this.foundationViews = [];

    this.buildNewGameButton();
    this.buildThemeButton();
    this.buildSettingsButton();
    this.renderStock();
    this.renderWaste();
    this.renderFoundations();
    this.renderTableau();
    if (this.settingsOpen) this.renderSettings();
    if (wasAnimating) this.checkWin();
  }

  /**
   * Renders the stock pile (top-left). Shows the card back while cards remain;
   * shows a recycle `↺` slot when empty. Clicking draws to the waste pile.
   */
  private renderStock(): void {
    const sc = new Container();
    sc.x = this.stockX;
    sc.y = this.topY;
    sc.eventMode = 'static';
    sc.cursor = 'pointer';
    sc.on('pointerdown', () => {
      drawFromStock(this.state, this.drawCount);
      this.renderAll();
    });

    const inner =
      this.state.stock.length > 0
        ? makeCardBack(this.theme, this.dims)
        : makeEmptySlot(this.theme, this.dims, '↺');
    sc.addChild(inner);
    this.mainLayer.addChild(sc);
  }

  /**
   * Renders the waste pile (top area, next to stock).
   * Fans up to three face-up cards in three-card mode; only the top is interactive.
   * Shows an empty slot when the waste pile is empty.
   */
  private renderWaste(): void {
    const wc = new Container();
    wc.x = this.wasteX;
    wc.y = this.topY;
    this.mainLayer.addChild(wc);

    if (this.state.waste.length === 0) {
      wc.addChild(makeEmptySlot(this.theme, this.dims));
      return;
    }

    const visible = this.state.waste.slice(
      -Math.min(this.drawCount, this.state.wasteVisibleCount)
    );
    visible.forEach((card, i) => {
      const cv = new CardView(card, this.theme, this.dims);
      cv.x = Math.round(i * BASE_WASTE_OFFSET * this.scale);
      wc.addChild(cv);
      if (i === visible.length - 1) {
        cv.eventMode = 'static';
        cv.cursor = 'pointer';
        cv.on('pointerdown', (e: FederatedPointerEvent) =>
          this.startDragWaste(e, cv)
        );
      }
    });
  }

  /**
   * Renders the four foundation slots (top-right).
   * Shows a suit symbol on each empty slot, or the top card when cards have been played.
   * Each slot also acts as a drop target for drag-and-drop through `tryDrop`.
   */
  private renderFoundations(): void {
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      const x = this.foundationXStart + fi * this.colSpacing;
      const fc = new Container();
      fc.x = x;
      fc.y = this.topY;
      this.mainLayer.addChild(fc);
      this.foundationViews.push(fc);

      const fp = this.state.foundations[fi];
      if (fp.length === 0) {
        const suit = ['♠', '♥', '♦', '♣'][fi];
        fc.addChild(makeEmptySlot(this.theme, this.dims, suit));
      } else {
        const top = fp[fp.length - 1];
        fc.addChild(makeCardFace(top, this.theme, this.dims));
      }
    }
  }

  /**
   * Renders all seven tableau columns.
   * Each column starts with an empty-slot drop-target at the base.
   * Face-up cards are interactive (draggable and tappable). Card views are stored in `tableauViews`
   * for later reference during drag resolution.
   */
  private renderTableau(): void {
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const x = this.tableauXStart + col * this.colSpacing;
      const pile = this.state.tableau[col];

      // Empty slot placeholder (drop target for empty columns)
      const slot = makeEmptySlot(this.theme, this.dims);
      slot.x = x;
      slot.y = this.tableauY;
      this.mainLayer.addChild(slot);

      const colViews: CardView[] = [];
      let yOff = 0;
      for (let row = 0; row < pile.length; row++) {
        const card = pile[row];
        const cv = new CardView(card, this.theme, this.dims);
        cv.x = x;
        cv.y = this.tableauY + yOff;
        cv.zIndex = row;

        if (card.faceUp) {
          cv.eventMode = 'static';
          cv.cursor = 'pointer';
          cv.on('pointerdown', (e: FederatedPointerEvent) =>
            this.startDragTableau(e, col, row, cv)
          );
        }

        this.mainLayer.addChild(cv);
        colViews.push(cv);
        yOff += card.faceUp ? this.faceUpOffset : this.faceDownOffset;
      }
      this.tableauViews[col] = colViews;
    }
  }

  // ── Tap handlers ──────────────────────────────────────────────────────────

  /**
   * Moves an eligible clicked card to its foundation and animates the result.
   *
   * @param drag - The source card and its original position.
   * @returns Whether the card was moved.
   */
  private autoPlayDrag(drag: DragInfo): boolean {
    const card = drag.views[0].card;
    const moved =
      drag.fromCol < 0
        ? moveWasteToFoundation(this.state)
        : drag.fromRow === this.state.tableau[drag.fromCol].length - 1 &&
          moveTableauToFoundation(this.state, drag.fromCol);
    if (!moved) return false;

    const fi = foundationIndexForSuit(card.suit);
    this.renderAll();
    const foundation = this.foundationViews[fi];
    foundation.children[0].visible = false;
    const pile = this.state.foundations[fi];
    foundation.addChild(
      pile.length > 1
        ? makeCardFace(pile[pile.length - TWO], this.theme, this.dims)
        : makeEmptySlot(this.theme, this.dims, ['♠', '♥', '♦', '♣'][fi])
    );
    const view = new CardView(card, this.theme, this.dims);
    view.position.set(drag.origX, drag.origY);
    this.dragLayer.addChild(view);
    this.mainLayer.eventMode = 'none';
    let elapsed = 0;
    this.animation = (ticker: Ticker): void => {
      elapsed += ticker.deltaMS;
      const progress = easingValue(
        'sineInOut',
        Math.min(elapsed / FOUNDATION_ANIMATION_MS, 1)
      );
      view.x =
        drag.origX +
        (this.foundationXStart + fi * this.colSpacing - drag.origX) * progress;
      view.y = drag.origY + (this.topY - drag.origY) * progress;
      if (elapsed >= FOUNDATION_ANIMATION_MS) {
        this.app.ticker.remove(this.animation!);
        this.animation = null;
        this.renderAll();
        this.checkWin();
      }
    };
    this.app.ticker.add(this.animation);
    return true;
  }

  /** Stops any active drag or animation before rebuilding the board. */
  private cancelInteraction(): void {
    this.app.stage.off('pointermove', this.onDragMove, this);
    this.app.stage.off('pointerup', this.onDragEnd, this);
    this.app.stage.off('pointerupoutside', this.onDragEnd, this);
    this.app.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.drag = null;
    if (this.animation) {
      this.app.ticker.remove(this.animation);
      this.animation = null;
    }
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────

  /**
   * Initiates a drag from the top waste card.
   *
   * @param e  - The originating pointer event.
   * @param cv - The `CardView` that was pressed.
   */
  private startDragWaste(e: FederatedPointerEvent, cv: CardView): void {
    const card = this.state.waste[this.state.waste.length - 1];
    this.beginDrag(e, [card], cv, -1, -1, -1);
  }

  /**
   * Initiates a drag from a face-up tableau card, lifting the pressed card
   * and all cards above it in the column as a single stack.
   *
   * @param e   - The originating pointer event.
   * @param col - Tableau column index the drag starts from.
   * @param row - Row index of the topmost card being dragged.
   * @param cv  - The `CardView` that was pressed.
   */
  private startDragTableau(
    e: FederatedPointerEvent,
    col: number,
    row: number,
    cv: CardView
  ): void {
    const pile = this.state.tableau[col];
    const cards = pile.slice(row);
    this.beginDrag(e, cards, cv, col, row, -1);
  }

  /**
   * Core drag initialiser. Creates ghost `CardView`s in the `dragLayer`,
   * records the drag origin and mouse offset, then attaches stage-level
   * `pointermove` / `pointerup` listeners.
   *
   * @param e             - The originating pointer event.
   * @param cards         - Ordered array of cards being dragged (top first).
   * @param topView       - The `CardView` at the start position (used to align the ghost).
   * @param fromCol       - Source tableau column, or `-1` if from waste/foundation.
   * @param fromRow       - Source row within the tableau column, or `-1`.
   * @param fromFoundation - Source foundation index, or `-1`.
   */
  private beginDrag(
    e: FederatedPointerEvent,
    cards: Card[],
    topView: CardView,
    fromCol: number,
    fromRow: number,
    fromFoundation: number
  ): void {
    if (this.drag || this.animation) return;
    const globalPos = topView.getGlobalPosition();
    const mousePos = e.global;

    const dragContainer = new Container();
    dragContainer.zIndex = 1000;
    this.dragLayer.addChild(dragContainer);

    const views: CardView[] = [];
    for (let i = 0; i < cards.length; i++) {
      const dv = new CardView(cards[i], this.theme, this.dims);
      dv.y = i * this.faceUpOffset;
      dragContainer.addChild(dv);
      views.push(dv);
    }

    if (fromCol >= 0) {
      for (const view of this.tableauViews[fromCol].slice(fromRow)) {
        view.renderable = false;
      }
    } else if (fromFoundation < 0) {
      const previous = this.state.waste[this.state.waste.length - TWO];
      if (this.drawCount === 1 || this.state.wasteVisibleCount === 1) {
        topView.parent!.addChildAt(
          previous
            ? new CardView(previous, this.theme, this.dims)
            : makeEmptySlot(this.theme, this.dims),
          0
        );
      }
      topView.renderable = false;
    }

    dragContainer.x = globalPos.x;
    dragContainer.y = globalPos.y;

    this.drag = {
      views,
      fromCol,
      fromRow,
      fromFoundation,
      origX: globalPos.x,
      origY: globalPos.y,
      offX: mousePos.x - globalPos.x,
      offY: mousePos.y - globalPos.y,
      container: dragContainer,
      pointerId: e.pointerId,
      startX: mousePos.x,
      startY: mousePos.y,
      moved: false
    };

    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointermove', this.onDragMove, this);
    this.app.stage.on('pointerup', this.onDragEnd, this);
    this.app.stage.on('pointerupoutside', this.onDragEnd, this);
    this.app.canvas.addEventListener('pointercancel', this.onPointerCancel);
  }

  /** Restores the board when the browser cancels the active pointer. */
  private onPointerCancel = (e: PointerEvent): void => {
    if (this.drag && e.pointerId === this.drag.pointerId) this.renderAll();
  };

  /** Stage-level handler: repositions the drag container to follow the pointer. */
  private onDragMove = (e: FederatedPointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.markDragMovement(e);
    this.drag.container.x = e.global.x - this.drag.offX;
    this.drag.container.y = e.global.y - this.drag.offY;
  };

  /**
   * Stage-level handler: fires when the pointer is released anywhere.
   * Detaches stage listeners, attempts to drop the dragged card(s) onto a
   * valid target, re-renders, and checks for a win condition.
   */
  private onDragEnd = (e: FederatedPointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.markDragMovement(e);
    const drag = this.drag;
    this.app.stage.off('pointermove', this.onDragMove, this);
    this.app.stage.off('pointerup', this.onDragEnd, this);
    this.app.stage.off('pointerupoutside', this.onDragEnd, this);
    this.app.canvas.removeEventListener('pointercancel', this.onPointerCancel);

    if (
      !drag.moved &&
      e.type !== 'pointerupoutside' &&
      this.hitTest(e.global.x, e.global.y, drag.origX, drag.origY)
    ) {
      if (this.autoPlayDrag(drag)) return;
      this.renderAll();
      return;
    }
    const dropped = this.tryDrop(e.global.x, e.global.y);
    this.drag = null;
    this.renderAll();
    if (dropped) this.checkWin();
  };

  /** Records whether the pointer has moved far enough to count as a drag. */
  private markDragMovement(e: FederatedPointerEvent): void {
    if (!this.drag) return;
    const dx = e.global.x - this.drag.startX;
    const dy = e.global.y - this.drag.startY;
    const threshold = BASE_CLICK_DISTANCE * this.scale;
    if (dx * dx + dy * dy > threshold * threshold) this.drag.moved = true;
  }

  /**
   * Attempts to resolve a drag drop at the given global coordinates.
   * Checks foundation slots first, then tableau columns (using an expanded
   * hit zone so cards can be dropped near the top of a column stack).
   * Mutates `GameState` directly on a successful drop.
   *
   * @param gx - Global X coordinate of the pointer-up event.
   * @param gy - Global Y coordinate of the pointer-up event.
   * @returns  `true` if the cards were successfully placed; `false` otherwise.
   */
  private tryDrop(gx: number, gy: number): boolean {
    if (!this.drag) return false;
    const { fromCol, fromRow, fromFoundation } = this.drag;
    const cards = this.drag.views.map((v) => v.card);
    const card = cards[0];

    // Check foundation drop
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      const fx = this.foundationXStart + fi * this.colSpacing;
      if (this.hitTest(gx, gy, fx, this.topY)) {
        if (
          cards.length === 1 &&
          fi === foundationIndexForSuit(card.suit) &&
          canPlaceOnFoundation(card, this.state.foundations[fi])
        ) {
          // Remove from source
          this.removeFromSource(fromCol, fromRow, fromFoundation, 1);
          this.state.foundations[fi].push(card);
          return true;
        }
        return false;
      }
    }

    // Check tableau drop
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const cx = this.tableauXStart + col * this.colSpacing;
      const pile = this.state.tableau[col];
      const colHeight = this.tableauHeight(col);
      const cy = colHeight;
      const dropZoneExpansion = Math.round(
        BASE_DROP_ZONE_EXPANSION * this.scale
      );
      const dropZoneBottom = Math.round(BASE_DROP_ZONE_BOTTOM * this.scale);

      if (
        this.hitTest(
          gx,
          gy,
          cx,
          Math.max(this.tableauY, cy - dropZoneExpansion),
          this.cardW,
          this.cardH + dropZoneBottom
        )
      ) {
        if (canPlaceOnTableau(card, pile)) {
          this.removeFromSource(fromCol, fromRow, fromFoundation, cards.length);
          pile.push(...cards);
          return true;
        }
        return false;
      }
    }

    return false;
  }

  /**
   * Removes the dragged cards from their source location in the game state.
   * Automatically flips the new top card of a tableau column face-up when cards
   * are removed from it.
   *
   * @param fromCol        - Source tableau column, or `-1`.
   * @param fromRow        - Source row within the tableau column, or `-1`.
   * @param fromFoundation - Source foundation index, or `-1`.
   * @param count          - Number of cards to remove.
   */
  private removeFromSource(
    fromCol: number,
    fromRow: number,
    fromFoundation: number,
    count: number
  ): void {
    if (fromCol >= 0) {
      // From tableau
      this.state.tableau[fromCol].splice(fromRow, count);
      const pile = this.state.tableau[fromCol];
      if (pile.length > 0) pile[pile.length - 1].faceUp = true;
    } else if (fromFoundation >= 0) {
      this.state.foundations[fromFoundation].pop();
    } else {
      // From waste
      removeTopWasteCard(this.state);
    }
  }

  /**
   * Computes the Y pixel coordinate of the bottom edge of the last card in a
   * tableau column. Used by `tryDrop` to determine the drop-zone position.
   *
   * @param col - Tableau column index (0–6).
   * @returns   Y coordinate in pixels, relative to the stage.
   */
  private tableauHeight(col: number): number {
    const pile = this.state.tableau[col];
    let h = this.tableauY;
    for (const card of pile) {
      h += card.faceUp ? this.faceUpOffset : this.faceDownOffset;
    }
    return h;
  }

  /**
   * AABB point-in-rectangle hit test.
   * Defaults to the current scaled card dimensions when `rw`/`rh` are omitted.
   *
   * @param gx - Point X.
   * @param gy - Point Y.
   * @param rx - Rectangle left edge X.
   * @param ry - Rectangle top edge Y.
   * @param rw - Rectangle width (default: `this.cardW`).
   * @param rh - Rectangle height (default: `this.cardH`).
   * @returns  `true` if the point lies inside the rectangle.
   */
  private hitTest(
    gx: number,
    gy: number,
    rx: number,
    ry: number,
    rw?: number,
    rh?: number
  ): boolean {
    const w = rw ?? this.cardW;
    const h = rh ?? this.cardH;
    return gx >= rx && gx <= rx + w && gy >= ry && gy <= ry + h;
  }

  // ── Win ───────────────────────────────────────────────────────────────────

  /** Checks whether all four foundations are complete and shows the win screen if so. */
  private checkWin(): void {
    if (isWon(this.state)) {
      this.showWinScreen();
    }
  }

  /**
   * Overlays the stage with a win screen: a semi-transparent backdrop,
   * a congratulatory panel, and a "Play Again" button that starts a new game.
   */
  private showWinScreen(): void {
    const overlay = new Container();

    const bg = new Graphics();
    bg.rect(0, 0, this.W, this.H).fill({
      color: this.theme.winScreenBGColor,
      alpha: 0.65
    });
    overlay.addChild(bg);

    const panel = new Graphics();
    panel
      .roundRect(this.W * HALF - 150, this.H * HALF - 80, 300, 160, 16)
      .fill({ color: this.theme.winScreenPanelFill })
      .stroke({ color: this.theme.winScreenPanelStroke, width: 3 });
    overlay.addChild(panel);

    const title = new Text({
      text: '🎉 You Win! 🎉',
      style: new TextStyle({
        fontSize: 32,
        fill: this.theme.lightTextColor,
        fontWeight: 'bold'
      })
    });
    title.anchor.set(HALF);
    title.x = this.W * HALF;
    title.y = this.H * HALF - 30;
    overlay.addChild(title);

    const btn = new Container();
    const btnBg = new Graphics();
    btnBg
      .roundRect(0, 0, 160, 40, 8)
      .fill({ color: this.theme.winScreenButtonColor });
    const btnLabel = new Text({
      text: 'Play Again',
      style: new TextStyle({
        fontSize: 18,
        fill: this.theme.lightTextColor,
        fontWeight: 'bold'
      })
    });
    btnLabel.anchor.set(HALF);
    btnLabel.x = 80;
    btnLabel.y = 20;
    btn.addChild(btnBg, btnLabel);
    btn.x = this.W * HALF - 80;
    btn.y = this.H * HALF + 20;
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerdown', () => this.newGame());
    overlay.addChild(btn);

    this.app.stage.addChild(overlay);
  }
}
