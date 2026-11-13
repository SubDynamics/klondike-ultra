/**
 * @file SpiderGame.ts
 * PixiJS renderer and interaction controller for Spider Solitaire (4-suit).
 *
 * Imports shared card-rendering utilities from {@link module:shared/cardSprites}
 * and Spider game logic from {@link module:SpiderState}.
 *
 * **Scene structure**
 * ```
 * app.stage
 *   ├── background (Graphics)
 *   ├── mainLayer  (Container) — all static game elements
 *   └── dragLayer  (Container) — cards being dragged (always on top)
 * ```
 *
 * **Layout** (design reference: 750 px wide)
 * - 10 tableau columns, slightly narrower cards than Klondike to fit the screen.
 * - Stock pile (top-left) — click to deal 10 cards (one per column).
 * - Completed-sequences counter (top-right area).
 */

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
  type SpiderState,
  type SpiderSuitMode,
  createSpiderState,
  canPickUpStack,
  canPlaceOnSpiderTableau,
  moveSpiderStack,
  dealSpiderStock,
  isSpiderWon,
  SPIDER_TABLEAU_COUNT,
  SPIDER_SEQUENCES_TO_WIN
} from './SpiderState';
import {
  type CardDims,
  makeCardBack,
  makeEmptySlot,
  CardView
} from './shared/cardSprites';

// ─── Base layout values (design reference at 750 px wide) ─────────────────────
const BASE_W = 750;
/** Narrower cards than Klondike to fit 10 columns. */
const BASE_CARD_W = 65;
/** Proportional height (same aspect ratio as Klondike). */
const BASE_CARD_H = 91;
const BASE_CARD_RADIUS = 6;
const BASE_TABLEAU_X_START = 10;
const BASE_TABLEAU_Y = 120;
const BASE_COL_SPACING = 74;
const BASE_FACE_UP_OFFSET = 22;
const BASE_FACE_DOWN_OFFSET = 11;
/** Bottom padding below the stock pile. */
const BASE_STOCK_BOTTOM_PAD = 18;
const BASE_DROP_ZONE_EXPANSION = 25;
const BASE_DROP_ZONE_BOTTOM = 55;

// ─── Drag state ───────────────────────────────────────────────────────────────

/**
 * Transient state describing an in-progress card drag in the Spider renderer.
 * Created by {@link SpiderGame.beginDrag} and nulled after drop resolution.
 */
interface DragInfo {
  /** The ordered card views being dragged (first = bottom of stack). */
  views: CardView[];
  /** Tableau column the drag started from (0–9). */
  fromCol: number;
  /** Row index within the source column of the first card being dragged. */
  fromRow: number;
  /** Original global position of the drag container before movement. */
  origX: number;
  origY: number;
  /** Pointer offset within the card at drag start. */
  offX: number;
  offY: number;
  /** PixiJS container that holds the ghost card views during the drag. */
  container: Container;
}

// ─── SpiderGame ───────────────────────────────────────────────────────────────

/**
 * Top-level Spider Solitaire controller owning the PixiJS scene graph.
 *
 * **Responsibilities**
 * - Maintains the {@link SpiderState} and responds to pointer input (tap, drag & drop).
 * - Scales every layout value from a single {@link SpiderGame.scale} factor so the
 *   game fills any viewport without hardcoded pixel assumptions.
 * - Rebuilds the scene on every state change or viewport resize via `renderAll()`.
 *
 * **Key methods by category**
 * - _Lifecycle_: `constructor`, `onResize`, `build`, `renderAll`
 * - _Rendering_: `renderStock`, `renderTableau`, `renderHUD`
 * - _UI controls_: `buildNewGameButton`, `buildThemeButton`, `cycleTheme`, `newGame`
 * - _Interaction_: `startDrag`, `beginDrag`, `onDragMove`, `onDragEnd`, `tryDrop`, `dropOnTableau`
 * - _Win detection_: `checkWin`, `showWinScreen`
 */
export class SpiderGame {
  private app: Application;
  private state: SpiderState;
  private suitMode: SpiderSuitMode;
  private themes: ColorTheme[];
  private currentThemeIndex: number;
  private tableauViews: CardView[][] = [];
  private drag: DragInfo | null = null;
  private mainLayer!: Container;
  private dragLayer!: Container;

  /**
   * Creates and starts the Spider game.
   *
   * @param app               - Initialised PixiJS Application instance.
   * @param themes            - Array of available colour themes (at least one required).
   * @param suitMode          - Number of suits to play with: 1, 2, or 4 (default `4`).
   * @param initialThemeIndex - Index of the theme to activate on startup (default `0`).
   */
  constructor(
    app: Application,
    themes: ColorTheme[],
    suitMode: SpiderSuitMode = 4,
    initialThemeIndex = 0
  ) {
    this.app = app;
    this.themes = themes.length > 0 ? themes : [defaultTheme];
    this.suitMode = suitMode;
    this.currentThemeIndex = Math.min(
      Math.max(initialThemeIndex, 0),
      Math.max(this.themes.length - 1, 0)
    );
    this.state = createSpiderState(suitMode);
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

  // ── Scaled layout values ──────────────────────────────────────────────────

  /**
   * Uniform scale factor derived from the current viewport width relative to
   * the 750 px design reference width.
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
  /** Horizontal distance between the left edges of adjacent columns. */
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
  /** X coordinate of the stock pile (horizontally centred). */
  private get stockX(): number {
    return Math.round(this.W / 2 - this.cardW / 2);
  }
  /** Y coordinate of the stock pile (bottom of the gameplay area). */
  private get stockY(): number {
    return Math.round(this.H - this.cardH - BASE_STOCK_BOTTOM_PAD * this.scale);
  }

  /**
   * Called by the application whenever the PixiJS renderer is resized.
   * Triggers a full scene rebuild so layout values are recalculated.
   */
  onResize(): void {
    this.build();
  }

  // ── Build / Render ────────────────────────────────────────────────────────

  /**
   * Tears down the entire PixiJS scene and rebuilds it from scratch.
   * Creates the felt background and two rendering layers, then calls `renderAll()`.
   * Invoked on first load, theme change, new game, and viewport resize.
   */
  private build(): void {
    this.app.stage.removeChildren();

    const bg = new Graphics();
    bg.rect(0, 0, this.W, this.H).fill({ color: this.theme.feltGreenBg });
    this.app.stage.addChild(bg);

    this.mainLayer = new Container();
    this.dragLayer = new Container();
    this.app.stage.addChild(this.mainLayer, this.dragLayer);

    this.tableauViews = Array.from({ length: SPIDER_TABLEAU_COUNT }, () => []);
    this.renderAll();
  }

  /**
   * Clears both rendering layers and redraws the complete game board:
   * buttons, HUD, stock, and all tableau columns.
   * Also cancels any active drag. Called after every game-state change.
   */
  renderAll(): void {
    this.mainLayer.removeChildren();
    this.dragLayer.removeChildren();
    this.drag = null;

    this.tableauViews = Array.from({ length: SPIDER_TABLEAU_COUNT }, () => []);

    this.buildNewGameButton();
    this.buildThemeButton();
    this.renderHUD();
    this.renderStock();
    this.renderTableau();
  }

  // ── UI buttons ────────────────────────────────────────────────────────────

  /** Adds a "New Game" button to the scene. */
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

  /** Adds a "Theme: …" cycle button to the scene. */
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

  /** Advances to the next theme and rebuilds the scene. No-op when only one theme is loaded. */
  private cycleTheme(): void {
    if (this.themes.length <= 1) return;
    this.currentThemeIndex = (this.currentThemeIndex + 1) % this.themes.length;
    this.drag = null;
    this.build();
  }

  /** Resets to a freshly shuffled Spider game and rebuilds the scene. */
  private newGame(): void {
    this.state = createSpiderState(this.suitMode);
    this.drag = null;
    this.build();
  }

  // ── HUD (heads-up display) ────────────────────────────────────────────────

  /**
   * Renders the completed-sequences counter and remaining stock deals counter
   * in the top area of the screen.
   */
  private renderHUD(): void {
    const s = this.scale;
    const stockDeals = Math.floor(this.state.stock.length / 10);

    const style = new TextStyle({
      fontSize: Math.round(14 * s),
      fill: this.theme.lightTextColor,
      fontWeight: 'bold'
    });

    const suitLabel =
      this.suitMode === 1
        ? '1-Suit'
        : this.suitMode === 2
          ? '2-Suit'
          : '4-Suit';
    const seqText = new Text({
      text: `${suitLabel} · Sequences: ${this.state.completedSequences}/${SPIDER_SEQUENCES_TO_WIN}`,
      style
    });
    seqText.x = Math.round(10 * s);
    seqText.y = Math.round(16 * s);
    this.mainLayer.addChild(seqText);

    const dealText = new Text({
      text: `Deals left: ${stockDeals}`,
      style
    });
    dealText.x = Math.round(330 * s);
    dealText.y = Math.round(16 * s);
    this.mainLayer.addChild(dealText);
  }

  // ── Stock ─────────────────────────────────────────────────────────────────

  /**
   * Renders the stock pile at the top-left.
   * Shows a stacked visual while cards remain; shows an empty slot when
   * the stock is exhausted. Clicking deals 10 cards (one per column).
   */
  private renderStock(): void {
    const sc = new Container();
    sc.x = this.stockX;
    sc.y = this.stockY;

    if (this.state.stock.length > 0) {
      // Draw up to 3 offset card-back layers for a "stack" effect.
      const layers = Math.min(3, Math.ceil(this.state.stock.length / 10));
      for (let i = 0; i < layers; i++) {
        const back = makeCardBack(this.theme, this.dims);
        back.x = i * 2;
        back.y = -i * 2;
        sc.addChild(back);
      }
      sc.eventMode = 'static';
      sc.cursor = 'pointer';
      sc.on('pointerdown', () => {
        dealSpiderStock(this.state);
        this.renderAll();
        this.checkWin();
      });
    } else {
      sc.addChild(makeEmptySlot(this.theme, this.dims, '✓'));
    }

    this.mainLayer.addChild(sc);
  }

  // ── Tableau ───────────────────────────────────────────────────────────────

  /**
   * Renders all ten tableau columns.
   * Each column starts with an empty-slot drop target at the base.
   * Face-up cards that are part of a moveable stack are interactive (draggable).
   * Card views are stored in `tableauViews` for use during drag resolution.
   */
  private renderTableau(): void {
    for (let col = 0; col < SPIDER_TABLEAU_COUNT; col++) {
      const x = this.tableauXStart + col * this.colSpacing;
      const pile = this.state.tableau[col];

      // Empty slot base (drop target for empty columns).
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

        if (card.faceUp && canPickUpStack(pile, row)) {
          cv.eventMode = 'static';
          cv.cursor = 'pointer';
          cv.on('pointerdown', (e: FederatedPointerEvent) =>
            this.startDrag(e, col, row, cv)
          );
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

  // ── Drag & drop ───────────────────────────────────────────────────────────

  /**
   * Initiates a drag from a face-up tableau card, lifting the card and any
   * valid same-suit sequence above it as a single stack.
   *
   * @param e   - The originating pointer event.
   * @param col - Tableau column index the drag starts from.
   * @param row - Row index of the card that was pressed.
   * @param cv  - The `CardView` that was pressed.
   */
  private startDrag(
    e: FederatedPointerEvent,
    col: number,
    row: number,
    cv: CardView
  ): void {
    const pile = this.state.tableau[col];
    if (!canPickUpStack(pile, row)) return;
    const cards = pile.slice(row);
    this.beginDrag(e, cards, cv, col, row);
  }

  /**
   * Core drag initialiser. Creates ghost `CardView`s in the `dragLayer`,
   * records the drag origin and mouse offset, then attaches stage-level
   * `pointermove` / `pointerup` listeners.
   *
   * @param e       - The originating pointer event.
   * @param cards   - Ordered array of cards being dragged (bottom-first).
   * @param topView - The `CardView` at the start position (used to align the ghost).
   * @param fromCol - Source tableau column index.
   * @param fromRow - Source row within the tableau column.
   */
  private beginDrag(
    e: FederatedPointerEvent,
    cards: Card[],
    topView: CardView,
    fromCol: number,
    fromRow: number
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

    dragContainer.x = globalPos.x;
    dragContainer.y = globalPos.y;

    this.drag = {
      views,
      fromCol,
      fromRow,
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
   * Detaches stage listeners, attempts to drop the dragged stack onto a valid
   * target, re-renders, and checks for a win condition.
   */
  private onDragEnd = (e: FederatedPointerEvent): void => {
    if (!this.drag) return;
    this.app.stage.off('pointermove', this.onDragMove, this);
    this.app.stage.off('pointerup', this.onDragEnd, this);
    this.app.stage.off('pointerupoutside', this.onDragEnd, this);

    const dropped = this.tryDrop(e.global.x, e.global.y);
    this.drag = null;
    this.renderAll();
    if (dropped) this.checkWin();
  };

  /**
   * Attempts to resolve a drag drop at the given global coordinates.
   * Checks each tableau column using an expanded hit zone.
   * Mutates {@link SpiderState} directly on a successful drop via
   * {@link moveSpiderStack}.
   *
   * @param gx - Global X coordinate of the pointer-up event.
   * @param gy - Global Y coordinate of the pointer-up event.
   * @returns  `true` if the cards were successfully placed.
   */
  private tryDrop(gx: number, gy: number): boolean {
    if (!this.drag) return false;
    const { fromCol, fromRow } = this.drag;
    const cards = this.drag.views.map((v) => v.card);
    const movingCard = cards[0];

    for (let col = 0; col < SPIDER_TABLEAU_COUNT; col++) {
      if (col === fromCol) continue; // skip source column
      const cx = this.tableauXStart + col * this.colSpacing;
      const pile = this.state.tableau[col];
      const colHeight = this.tableauColumnHeight(col);
      const dropZoneExpansion = Math.round(
        BASE_DROP_ZONE_EXPANSION * this.scale
      );
      const dropZoneBottom = Math.round(BASE_DROP_ZONE_BOTTOM * this.scale);

      if (
        this.hitTest(
          gx,
          gy,
          cx,
          Math.max(this.tableauY, colHeight - dropZoneExpansion),
          this.cardW,
          this.cardH + dropZoneBottom
        )
      ) {
        if (canPlaceOnSpiderTableau(movingCard, pile)) {
          return moveSpiderStack(this.state, fromCol, fromRow, col);
        }
        return false;
      }
    }
    return false;
  }

  /**
   * `pointerup` handler attached to a tableau slot or card container.
   * Validates the move and commits the full dragged stack on success.
   *
   * @param col - Tableau column index (0–9).
   */
  private dropOnTableau(col: number): void {
    if (!this.drag) return;
    const cards = this.drag.views.map((v) => v.card);
    const movingCard = cards[0];
    const pile = this.state.tableau[col];
    if (
      col !== this.drag.fromCol &&
      canPlaceOnSpiderTableau(movingCard, pile)
    ) {
      moveSpiderStack(this.state, this.drag.fromCol, this.drag.fromRow, col);
      this.drag = null;
      this.renderAll();
      this.checkWin();
    }
  }

  // ── Geometry helpers ──────────────────────────────────────────────────────

  /**
   * Computes the Y pixel coordinate of the bottom edge of the last card in a
   * tableau column. Used by `tryDrop` to position the drop zone.
   *
   * @param col - Tableau column index (0–9).
   * @returns   Y coordinate in pixels, relative to the stage.
   */
  private tableauColumnHeight(col: number): number {
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

  /** Checks whether all 8 sequences are complete and shows the win screen if so. */
  private checkWin(): void {
    if (isSpiderWon(this.state)) {
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
