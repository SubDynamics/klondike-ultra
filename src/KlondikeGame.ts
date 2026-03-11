import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  Sprite,
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
} from './GameState';

// ─── Layout constants ──────────────────────────────────────────────────────────
const CARD_W = 80;
const CARD_H = 112;
const CARD_RADIUS = 8;
const TABLEAU_X_START = 20;
const TABLEAU_Y = 180;
const COL_SPACING = 100;
const FACE_UP_OFFSET = 28;
const FACE_DOWN_OFFSET = 14;
const STOCK_X = 20;
const WASTE_X = 130;
const TOP_Y = 40;
const FOUNDATION_X_START = 330;
const FOUNDATION_Y = TOP_Y;

// ─── Helper: build card containers ────────────────────────────────────────────
function makeCardBack(theme: ColorTheme): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS)
    .fill({ color: theme.cardFaceDownColor })
    .stroke({ color: theme.cardBorderColor, width: 1 });
  // Pattern
  g.roundRect(4, 4, CARD_W - 8, CARD_H - 8, 6).stroke({
    color: theme.cardInteriorStrokeColor,
    width: 1
  });
  c.addChild(g);
  return c;
}

function getSuitIconAsset(suit: string): string {
  const assetMap: Record<string, string> = {
    spades: 'suit-spade',
    hearts: 'suit-heart',
    diamonds: 'suit-diamond',
    clubs: 'suit-club'
  };
  return assetMap[suit] || 'suit-spade';
}

function makeCardFace(card: Card, theme: ColorTheme): Container {
  const c = new Container();
  const textColor = card.isRed
    ? theme.playingCardsRed
    : theme.playingCardsBlack;
  const g = new Graphics();
  g.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS)
    .fill({ color: theme.playingCardsBackground })
    .stroke({ color: theme.cardBorderColor, width: 1 });
  c.addChild(g);

  const label = card.label;
  const iconAsset = getSuitIconAsset(card.suit);

  // Top-left label and icon
  const topStyle = new TextStyle({
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'BioRhymeExpanded-ExtraBold',
    fill: textColor
  });
  const topText = new Text({ text: label, style: topStyle });
  topText.x = 6;
  topText.y = 2;

  const topIcon = Sprite.from(iconAsset);
  topIcon.width = 14;
  topIcon.height = 14;
  topIcon.anchor.set(0.5, 0.5);
  topIcon.x = topText.x + topText.width + topIcon.width * 0.75;
  topIcon.y = 12;

  // Center icon
  const centerIcon = Sprite.from(iconAsset);
  centerIcon.width = 60;
  centerIcon.height = 60;
  centerIcon.anchor.set(0.5, 0.5);
  centerIcon.x = CARD_W / 2;
  centerIcon.y = CARD_H * 0.6;

  c.addChild(topText, topIcon, centerIcon);
  return c;
}

function makeEmptySlot(theme: ColorTheme, label = ''): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS)
    .fill({ color: theme.emptySlotFill })
    .stroke({ color: theme.emptySlotStroke, width: 1.5 });
  c.addChild(g);
  if (label) {
    const style = new TextStyle({
      fontSize: 22,
      fill: theme.emptySlotTextColor
    });
    const t = new Text({ text: label, style });
    t.anchor.set(0.5, 0.5);
    t.x = CARD_W / 2;
    t.y = CARD_H / 2;
    c.addChild(t);
  }
  return c;
}

// ─── CardView ─────────────────────────────────────────────────────────────────
class CardView extends Container {
  card: Card;
  private theme: ColorTheme;

  constructor(card: Card, theme: ColorTheme) {
    super();
    this.card = card;
    this.theme = theme;
    this.redraw();
  }

  redraw(): void {
    this.removeChildren();
    const inner = this.card.faceUp
      ? makeCardFace(this.card, this.theme)
      : makeCardBack(this.theme);
    this.addChild(inner);
  }
}

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
export class KlondikeGame {
  private app: Application;
  private state: GameState;
  private themes: ColorTheme[];
  private currentThemeIndex: number;
  private tableauViews: CardView[][] = [];
  private drag: DragInfo | null = null;
  private mainLayer!: Container;
  private dragLayer!: Container;

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

  // ── Build the scene ──────────────────────────────────────────────────────
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

  private buildNewGameButton(): void {
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 90, 28, 6)
      .fill({ color: this.theme.newGameButtonFill })
      .stroke({ color: this.theme.newGameButtonStroke, width: 1 });
    const label = new Text({
      text: 'New Game',
      style: new TextStyle({
        fontSize: 13,
        fill: this.theme.newGameButtonTextColor,
        fontWeight: 'bold'
      })
    });
    label.anchor.set(0.5, 0.5);
    label.x = 45;
    label.y = 14;
    btn.addChild(bg, label);
    btn.x = this.W - 105;
    btn.y = 8;
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerdown', () => this.newGame());
    this.mainLayer.addChild(btn);
  }

  private buildThemeButton(): void {
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 145, 28, 6)
      .fill({ color: this.theme.newGameButtonFill })
      .stroke({ color: this.theme.newGameButtonStroke, width: 1 });
    const label = new Text({
      text: `Theme: ${this.theme.name}`,
      style: new TextStyle({
        fontSize: 12,
        fill: this.theme.newGameButtonTextColor,
        fontWeight: 'bold'
      })
    });
    label.anchor.set(0.5, 0.5);
    label.x = 72.5;
    label.y = 14;
    btn.addChild(bg, label);
    btn.x = this.W - 260;
    btn.y = 8;
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerdown', () => this.cycleTheme());
    this.mainLayer.addChild(btn);
  }

  private cycleTheme(): void {
    if (this.themes.length <= 1) return;
    this.currentThemeIndex = (this.currentThemeIndex + 1) % this.themes.length;
    this.drag = null;
    this.build();
  }

  private newGame(): void {
    this.state = createGameState();
    this.drag = null;
    this.build();
  }

  // ── Stock ────────────────────────────────────────────────────────────────
  private buildStock(): void {
    // Stock is rendered via renderAll; this is a no-op placeholder
  }

  // ── Foundation slots ─────────────────────────────────────────────────────
  private buildFoundationSlots(): void {
    // Slots are just visual placeholders; actual cards drawn in renderAll
  }

  // ── Tableau slots ────────────────────────────────────────────────────────
  private buildTableauSlots(): void {
    // Slots are just visual placeholders; actual cards drawn in renderAll
  }

  // ── Render all ───────────────────────────────────────────────────────────
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

  private renderStock(): void {
    const sc = new Container();
    sc.x = STOCK_X;
    sc.y = TOP_Y;
    sc.eventMode = 'static';
    sc.cursor = 'pointer';
    sc.on('pointerdown', () => {
      drawFromStock(this.state);
      this.renderAll();
    });

    const inner =
      this.state.stock.length > 0
        ? makeCardBack(this.theme)
        : makeEmptySlot(this.theme, '↺');
    sc.addChild(inner);
    this.mainLayer.addChild(sc);
  }

  private renderWaste(): void {
    const wc = new Container();
    wc.x = WASTE_X;
    wc.y = TOP_Y;
    this.mainLayer.addChild(wc);

    if (this.state.waste.length === 0) {
      wc.addChild(makeEmptySlot(this.theme));
      return;
    }

    // Show top waste card
    const card = this.state.waste[this.state.waste.length - 1];
    const cv = new CardView(card, this.theme);
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

  private renderFoundations(): void {
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      const x = FOUNDATION_X_START + fi * COL_SPACING;
      const fc = new Container();
      fc.x = x;
      fc.y = FOUNDATION_Y;
      this.mainLayer.addChild(fc);

      const fp = this.state.foundations[fi];
      if (fp.length === 0) {
        const suit = ['♠', '♥', '♦', '♣'][fi];
        fc.addChild(makeEmptySlot(this.theme, suit));
      } else {
        const top = fp[fp.length - 1];
        fc.addChild(makeCardFace(top, this.theme));
      }

      // Drop target
      fc.eventMode = 'static';
      fc.on('pointerup', () => this.dropOnFoundation(fi));
    }
  }

  private renderTableau(): void {
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const x = TABLEAU_X_START + col * COL_SPACING;
      const pile = this.state.tableau[col];

      // Empty slot placeholder (drop target for empty columns)
      const slot = makeEmptySlot(this.theme);
      slot.x = x;
      slot.y = TABLEAU_Y;
      slot.eventMode = 'static';
      slot.on('pointerup', () => this.dropOnTableau(col));
      this.mainLayer.addChild(slot);

      const colViews: CardView[] = [];
      let yOff = 0;
      for (let row = 0; row < pile.length; row++) {
        const card = pile[row];
        const cv = new CardView(card, this.theme);
        cv.x = x;
        cv.y = TABLEAU_Y + yOff;
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
        yOff += card.faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET;
      }
      this.tableauViews[col] = colViews;
    }
  }

  // ── Tap handlers ──────────────────────────────────────────────────────────
  private autoPlayWaste(): void {
    if (moveWasteToFoundation(this.state)) {
      this.renderAll();
      this.checkWin();
    }
  }

  private handleTableauTap(col: number, row: number): void {
    const pile = this.state.tableau[col];
    if (row !== pile.length - 1) return; // only top card taps
    if (moveTableauToFoundation(this.state, col)) {
      this.renderAll();
      this.checkWin();
    }
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  private startDragWaste(e: FederatedPointerEvent, cv: CardView): void {
    const card = this.state.waste[this.state.waste.length - 1];
    this.beginDrag(e, [card], cv, -1, -1, -1);
  }

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
      const dv = new CardView(cards[i], this.theme);
      dv.y = i * FACE_UP_OFFSET;
      dragContainer.addChild(dv);
      views.push(dv);
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

  private onDragMove = (e: FederatedPointerEvent): void => {
    if (!this.drag) return;
    this.drag.container.x = e.global.x - this.drag.offX;
    this.drag.container.y = e.global.y - this.drag.offY;
  };

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

  private tryDrop(gx: number, gy: number): boolean {
    if (!this.drag) return false;
    const { fromCol, fromRow, fromFoundation } = this.drag;
    const cards = this.drag.views.map((v) => v.card);
    const card = cards[0];

    // Check foundation drop
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      const fx = FOUNDATION_X_START + fi * COL_SPACING;
      if (this.hitTest(gx, gy, fx, FOUNDATION_Y)) {
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
      const cx = TABLEAU_X_START + col * COL_SPACING;
      const pile = this.state.tableau[col];
      const colHeight = this.tableauHeight(col);
      const cy = colHeight;

      if (
        this.hitTest(
          gx,
          gy,
          cx,
          Math.max(TABLEAU_Y, cy - 30),
          CARD_W,
          CARD_H + 60
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

  private tableauHeight(col: number): number {
    const pile = this.state.tableau[col];
    let h = TABLEAU_Y;
    for (const card of pile) {
      h += card.faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET;
    }
    return h;
  }

  private hitTest(
    gx: number,
    gy: number,
    rx: number,
    ry: number,
    rw = CARD_W,
    rh = CARD_H
  ): boolean {
    return gx >= rx && gx <= rx + rw && gy >= ry && gy <= ry + rh;
  }

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
  private checkWin(): void {
    if (isWon(this.state)) {
      this.showWinScreen();
    }
  }

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
