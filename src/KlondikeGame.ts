import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  FederatedPointerEvent
} from 'pixi.js';
import { Card } from './Card';
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
const CARD_FACE_DOWN_COLOR = 0x2255aa;
const CARD_FACE_UP_BG = 0xffffff;
const CARD_BORDER = 0x888888;
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
const GREEN_BG = 0x276221;

// ─── Helper: build card containers ────────────────────────────────────────────
function makeCardBack(): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS)
    .fill({ color: CARD_FACE_DOWN_COLOR })
    .stroke({ color: CARD_BORDER, width: 1 });
  // Pattern
  g.roundRect(4, 4, CARD_W - 8, CARD_H - 8, 6).stroke({
    color: 0x5588dd,
    width: 1
  });
  c.addChild(g);
  return c;
}

function makeCardFace(card: Card): Container {
  const c = new Container();
  const textColor = card.isRed ? 0xcc0000 : 0x111111;
  const g = new Graphics();
  g.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS)
    .fill({ color: CARD_FACE_UP_BG })
    .stroke({ color: CARD_BORDER, width: 1 });
  c.addChild(g);

  const label = card.label;
  const symbol = card.symbol;

  // Top-left label
  const topStyle = new TextStyle({
    fontSize: 13,
    fontWeight: 'bold',
    fill: textColor
  });
  const topText = new Text({ text: `${label}\n${symbol}`, style: topStyle });
  topText.x = 4;
  topText.y = 2;

  // Center symbol
  const centerStyle = new TextStyle({ fontSize: 32, fill: textColor });
  const centerText = new Text({ text: symbol, style: centerStyle });
  centerText.anchor.set(0.5, 0.5);
  centerText.x = CARD_W / 2;
  centerText.y = CARD_H / 2;

  // Bottom-right label (rotated 180°, anchor at (0,0) so text extends up-left, staying in bounds)
  const botText = new Text({ text: `${label}\n${symbol}`, style: topStyle });
  botText.anchor.set(0, 0);
  botText.rotation = Math.PI;
  botText.x = CARD_W - 4;
  botText.y = CARD_H - 2;

  c.addChild(topText, centerText, botText);
  return c;
}

function makeEmptySlot(label = ''): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS)
    .fill({ color: 0x1a4a18 })
    .stroke({ color: 0x55aa55, width: 1.5 });
  c.addChild(g);
  if (label) {
    const style = new TextStyle({ fontSize: 22, fill: 0x55aa55 });
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

  constructor(card: Card) {
    super();
    this.card = card;
    this.redraw();
  }

  redraw(): void {
    this.removeChildren();
    const inner = this.card.faceUp ? makeCardFace(this.card) : makeCardBack();
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
  private tableauViews: CardView[][] = [];
  private drag: DragInfo | null = null;
  private mainLayer!: Container;
  private dragLayer!: Container;

  constructor(app: Application) {
    this.app = app;
    this.state = createGameState();
    this.build();
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
    bg.rect(0, 0, this.W, this.H).fill({ color: GREEN_BG });
    this.app.stage.addChild(bg);

    this.mainLayer = new Container();
    this.dragLayer = new Container();
    this.app.stage.addChild(this.mainLayer, this.dragLayer);

    this.tableauViews = Array.from({ length: TABLEAU_COUNT }, () => []);

    this.buildStock();
    this.buildFoundationSlots();
    this.buildTableauSlots();
    this.renderAll();

    // New Game button
    this.buildNewGameButton();
  }

  private buildNewGameButton(): void {
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 90, 28, 6)
      .fill({ color: 0x1a3a18 })
      .stroke({ color: 0x55aa55, width: 1 });
    const label = new Text({
      text: 'New Game',
      style: new TextStyle({ fontSize: 13, fill: 0xaaffaa, fontWeight: 'bold' })
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
      this.state.stock.length > 0 ? makeCardBack() : makeEmptySlot('↺');
    sc.addChild(inner);
    this.mainLayer.addChild(sc);
  }

  private renderWaste(): void {
    const wc = new Container();
    wc.x = WASTE_X;
    wc.y = TOP_Y;
    this.mainLayer.addChild(wc);

    if (this.state.waste.length === 0) {
      wc.addChild(makeEmptySlot());
      return;
    }

    // Show top waste card
    const card = this.state.waste[this.state.waste.length - 1];
    const cv = new CardView(card);
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
        fc.addChild(makeEmptySlot(suit));
      } else {
        const top = fp[fp.length - 1];
        fc.addChild(makeCardFace(top));
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
      const slot = makeEmptySlot();
      slot.x = x;
      slot.y = TABLEAU_Y;
      slot.eventMode = 'static';
      slot.on('pointerup', () => this.dropOnTableau(col));
      this.mainLayer.addChild(slot);

      const colViews: CardView[] = [];
      let yOff = 0;
      for (let row = 0; row < pile.length; row++) {
        const card = pile[row];
        const cv = new CardView(card);
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
      const dv = new CardView(cards[i]);
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
    bg.rect(0, 0, this.W, this.H).fill({ color: 0x000000, alpha: 0.65 });
    overlay.addChild(bg);

    const panel = new Graphics();
    panel
      .roundRect(this.W / 2 - 150, this.H / 2 - 80, 300, 160, 16)
      .fill({ color: 0x276221 })
      .stroke({ color: 0x55ff55, width: 3 });
    overlay.addChild(panel);

    const title = new Text({
      text: '🎉 You Win! 🎉',
      style: new TextStyle({ fontSize: 32, fill: 0xffffff, fontWeight: 'bold' })
    });
    title.anchor.set(0.5);
    title.x = this.W / 2;
    title.y = this.H / 2 - 30;
    overlay.addChild(title);

    const btn = new Container();
    const btnBg = new Graphics();
    btnBg.roundRect(0, 0, 160, 40, 8).fill({ color: 0x55aa55 });
    const btnLabel = new Text({
      text: 'Play Again',
      style: new TextStyle({ fontSize: 18, fill: 0xffffff, fontWeight: 'bold' })
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
