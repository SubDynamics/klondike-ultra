import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  FederatedPointerEvent
} from 'pixi.js';
import { Card } from './Card';
import type { ColorTheme } from './types/themeTypes';
import { defaultTheme } from './themes/defaultTheme';
import {
  type GameState,
  createGameState,
  drawFromStock,
  moveWasteToFoundation,
  moveTableauToFoundation,
  canPlaceOnTableau,
  canPlaceOnFoundation,
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
const BASE_TOP_Y = 40;
const BASE_FOUNDATION_X_START = 330;
const BASE_DROP_ZONE_EXPANSION = 30;
const BASE_DROP_ZONE_BOTTOM = 60;

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
 *                  `onDragMove`, `onDragEnd`, `tryDrop`, `dropOnFoundation`, `dropOnTableau`
 * - _Tap shortcuts_: `autoPlayWaste`, `handleTableauTap`
 * - _Win detection_: `checkWin`, `showWinScreen`
 */
export class KlondikeGame {
  private app: Application;
  private state: GameState;
  private themes: ColorTheme[];
  private currentThemeIndex: number;
  private tableauViews: CardView[][] = [];
  private drag: DragInfo | null = null;
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
    this.build();
  }

  // ── Build the scene ──────────────────────────────────────────────────────

  /**
   * Tears down the entire PixiJS scene and rebuilds it from scratch.
   * Creates the felt background, two rendering layers, and calls `renderAll()`.
   * Invoked on first load, theme change, new game, and viewport resize.
   */
  private build(): void {
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
    const s = this.scale;
    const btnW = Math.round(90 * s);
    const btnH = Math.round(28 * s);
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, btnW, btnH, Math.round(6 * s))
      .fill({ color: this.theme.newGameButtonFill })
      .stroke({ color: this.theme.newGameButtonStroke, width: 1 });
    const label = new Text({
      text: 'New Game',
      style: new TextStyle({
        fontSize: Math.round(13 * s),
        fill: this.theme.newGameButtonTextColor,
        fontWeight: 'bold'
      })
    });
    label.anchor.set(0.5, 0.5);
    label.x = btnW / 2;
    label.y = btnH / 2;
    btn.addChild(bg, label);
    btn.x = this.W - Math.round(105 * s);
    btn.y = Math.round(8 * s);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerdown', () => this.newGame());
    this.mainLayer.addChild(btn);
  }

  /** Adds a "Theme: …" cycle button to the top-right area of the scene. */
  private buildThemeButton(): void {
    const s = this.scale;
    const btnW = Math.round(145 * s);
    const btnH = Math.round(28 * s);
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, btnW, btnH, Math.round(6 * s))
      .fill({ color: this.theme.newGameButtonFill })
      .stroke({ color: this.theme.newGameButtonStroke, width: 1 });
    const label = new Text({
      text: `Theme: ${this.theme.name}`,
      style: new TextStyle({
        fontSize: Math.round(12 * s),
        fill: this.theme.newGameButtonTextColor,
        fontWeight: 'bold'
      })
    });
    label.anchor.set(0.5, 0.5);
    label.x = btnW / 2;
    label.y = btnH / 2;
    btn.addChild(bg, label);
    btn.x = this.W - Math.round(260 * s);
    btn.y = Math.round(8 * s);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerdown', () => this.cycleTheme());
    this.mainLayer.addChild(btn);
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
    this.mainLayer.removeChildren();
    this.dragLayer.removeChildren();
    this.drag = null;

    this.tableauViews = Array.from({ length: TABLEAU_COUNT }, () => []);

    this.buildNewGameButton();
    this.buildThemeButton();
    this.renderStock();
    this.renderWaste();
    this.renderFoundations();
    this.renderTableau();
  }

  /**
   * Renders the stock pile (top-left). Shows the card back while cards remain;
   * shows a recycle `↺` slot when empty. Clicking draws one card to the waste pile.
   */
  private renderStock(): void {
    const sc = new Container();
    sc.x = this.stockX;
    sc.y = this.topY;
    sc.eventMode = 'static';
    sc.cursor = 'pointer';
    sc.on('pointerdown', () => {
      drawFromStock(this.state);
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
   * Shows only the top card (face-up) which can be dragged or tapped to auto-play.
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

    // Show top waste card
    const card = this.state.waste[this.state.waste.length - 1];
    const cv = new CardView(card, this.theme, this.dims);
    wc.addChild(cv);

    // Make draggable
    cv.eventMode = 'static';
    cv.cursor = 'pointer';
    cv.on('pointerdown', (e: FederatedPointerEvent) =>
      this.startDragWaste(e, cv)
    );
    // Tap to auto-send to foundation
    cv.on('pointertap', () => this.autoPlayWaste());
  }

  /**
   * Renders the four foundation slots (top-right).
   * Shows a suit symbol on each empty slot, or the top card when cards have been played.
   * Each slot also acts as a drop target for drag-and-drop.
   */
  private renderFoundations(): void {
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      const x = this.foundationXStart + fi * this.colSpacing;
      const fc = new Container();
      fc.x = x;
      fc.y = this.topY;
      this.mainLayer.addChild(fc);

      const fp = this.state.foundations[fi];
      if (fp.length === 0) {
        const suit = ['♠', '♥', '♦', '♣'][fi];
        fc.addChild(makeEmptySlot(this.theme, this.dims, suit));
      } else {
        const top = fp[fp.length - 1];
        fc.addChild(makeCardFace(top, this.theme, this.dims));
      }

      // Drop target
      fc.eventMode = 'static';
      fc.on('pointerup', () => this.dropOnFoundation(fi));
    }
  }

  /**
   * Renders all seven tableau columns.
   * Each column starts with an empty-slot drop-target at the base.
   * Face-up cards are interactive (draggable and tappable); face-down cards
   * are passive drop targets only. Card views are stored in `tableauViews`
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
      slot.eventMode = 'static';
      slot.on('pointerup', () => this.dropOnTableau(col));
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
          cv.on('pointertap', () => this.handleTableauTap(col, row));
          cv.on('pointerup', () => this.dropOnTableau(col));
        } else {
          cv.eventMode = 'static';
          cv.on('pointerup', () => this.dropOnTableau(col));
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
   * Handles a tap on the top waste card: attempts to move it directly to a
   * matching foundation pile. Triggers a re-render and win check on success.
   */
  private autoPlayWaste(): void {
    if (moveWasteToFoundation(this.state)) {
      this.renderAll();
      this.checkWin();
    }
  }

  /**
   * Handles a tap on a face-up tableau card: if it is the top card of its
   * column, attempts to move it directly to a matching foundation pile.
   *
   * @param col - Tableau column index (0–6).
   * @param row - Card row within that column.
   */
  private handleTableauTap(col: number, row: number): void {
    const pile = this.state.tableau[col];
    if (row !== pile.length - 1) return; // only top card taps
    if (moveTableauToFoundation(this.state, col)) {
      this.renderAll();
      this.checkWin();
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
      const previous = this.state.waste[this.state.waste.length - 2];
      topView.parent!.addChildAt(
        previous
          ? new CardView(previous, this.theme, this.dims)
          : makeEmptySlot(this.theme, this.dims),
        0
      );
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
      container: dragContainer
    };

    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointermove', this.onDragMove, this);
    this.app.stage.on('pointerup', this.onDragEnd, this);
    this.app.stage.on('pointerupoutside', this.onDragEnd, this);
  }

  /** Stage-level handler: repositions the drag container to follow the pointer. */
  private onDragMove = (e: FederatedPointerEvent): void => {
    if (!this.drag) return;
    this.drag.container.x = e.global.x - this.drag.offX;
    this.drag.container.y = e.global.y - this.drag.offY;
  };

  /**
   * Stage-level handler: fires when the pointer is released anywhere.
   * Detaches stage listeners, attempts to drop the dragged card(s) onto a
   * valid target, re-renders, and checks for a win condition.
   */
  private onDragEnd = (e: FederatedPointerEvent): void => {
    if (!this.drag) return;
    this.app.stage.off('pointermove', this.onDragMove, this);
    this.app.stage.off('pointerup', this.onDragEnd, this);
    this.app.stage.off('pointerupoutside', this.onDragEnd, this);

    const dropped = this.tryDrop(e.global.x, e.global.y);
    if (!dropped) {
      // Snap back (just re-render)
    }
    this.drag = null;
    this.renderAll();
    if (dropped) this.checkWin();
  };

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
      this.state.waste.pop();
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

  /**
   * `pointerup` handler attached to a foundation slot container.
   * Validates the move and commits it to the game state on success.
   *
   * @param fi - Foundation index (0–3).
   */
  private dropOnFoundation(fi: number): void {
    if (!this.drag) return;
    const cards = this.drag.views.map((v) => v.card);
    const card = cards[0];
    if (cards.length !== 1) return;
    if (canPlaceOnFoundation(card, this.state.foundations[fi])) {
      this.removeFromSource(
        this.drag.fromCol,
        this.drag.fromRow,
        this.drag.fromFoundation,
        1
      );
      this.state.foundations[fi].push(card);
      this.drag = null;
      this.renderAll();
      this.checkWin();
    }
  }

  /**
   * `pointerup` handler attached to a tableau slot or card container.
   * Validates the move and commits the full dragged stack on success.
   *
   * @param col - Tableau column index (0–6).
   */
  private dropOnTableau(col: number): void {
    if (!this.drag) return;
    const cards = this.drag.views.map((v) => v.card);
    const card = cards[0];
    const pile = this.state.tableau[col];
    if (canPlaceOnTableau(card, pile)) {
      this.removeFromSource(
        this.drag.fromCol,
        this.drag.fromRow,
        this.drag.fromFoundation,
        cards.length
      );
      pile.push(...cards);
      this.drag = null;
      this.renderAll();
      this.checkWin();
    }
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
      .roundRect(this.W / 2 - 150, this.H / 2 - 80, 300, 160, 16)
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
    title.anchor.set(0.5);
    title.x = this.W / 2;
    title.y = this.H / 2 - 30;
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
    btnLabel.anchor.set(0.5);
    btnLabel.x = 80;
    btnLabel.y = 20;
    btn.addChild(btnBg, btnLabel);
    btn.x = this.W / 2 - 80;
    btn.y = this.H / 2 + 20;
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerdown', () => this.newGame());
    overlay.addChild(btn);

    this.app.stage.addChild(overlay);
  }
}
