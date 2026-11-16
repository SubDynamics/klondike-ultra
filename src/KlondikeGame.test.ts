import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { Card } from './Card';
import { KlondikeGame } from './KlondikeGame';
import {
  createGameState,
  drawFromStock,
  removeTopWasteCard
} from './KlondikeState';
import { defaultTheme } from './themes/defaultTheme';

vi.mock('./shared/cardSprites', async (importOriginal) => {
  const original = await importOriginal<typeof import('./shared/cardSprites')>();
  return {
    ...original,
    makeCardFace: () => new Container(),
    makeEmptySlot: () => new Container(),
    CardView: class extends Container {
      card: Card;
      constructor(card: Card) {
        super();
        this.card = card;
      }
    }
  };
});

describe('click to foundation', () => {
  function setup() {
    const stage = new Container();
    const ticker = { add: vi.fn(), remove: vi.fn() };
    const prototype = KlondikeGame.prototype as unknown as { build: () => void };
    const build = vi.spyOn(prototype, 'build').mockImplementation(() => {});
    const app = { stage, ticker, screen: { width: 750, height: 800 } };
    const game = new KlondikeGame(app as never, [defaultTheme]) as unknown as {
      state: ReturnType<typeof createGameState>;
      mainLayer: Container;
      dragLayer: Container;
      foundationViews: Container[];
      tableauViews: Container[][];
      renderAll: () => void;
      checkWin: () => void;
      startDragWaste: (event: unknown, view: Container) => void;
      startDragTableau: (event: unknown, col: number, row: number, view: Container) => void;
      onDragMove: (event: unknown) => void;
      onDragEnd: (event: unknown) => void;
      onResize: () => void;
      cancelInteraction: () => void;
    };
    build.mockRestore();
    game.mainLayer = new Container();
    game.dragLayer = new Container();
    game.tableauViews = Array.from({ length: 7 }, () => []);
    game.renderAll = vi.fn(() => {
      game.cancelInteraction();
      game.dragLayer.removeChildren();
      game.mainLayer.eventMode = 'auto';
      game.foundationViews = Array.from({ length: 4 }, () => {
        const foundation = new Container();
        foundation.addChild(new Container());
        return foundation;
      });
    });
    game.checkWin = vi.fn();
    game.state.tableau = Array.from({ length: 7 }, () => []);
    game.state.foundations = Array.from({ length: 4 }, () => []);
    game.state.waste = [];
    const event = (x: number, y: number, type = 'pointerup', pointerId = 1) =>
      ({ global: { x, y }, type, pointerId });
    return { game, ticker, event };
  }

  it('moves and animates the top waste card, then checks for a win', () => {
    const { game, ticker, event } = setup();
    const card = new Card('spades', 5, true);
    game.state.foundations[0] = [new Card('spades', 4, true)];
    game.state.waste = [new Card('hearts', 1, true), card];
    game.state.wasteVisibleCount = 2;
    const view = new Container();
    view.position.set(130, 40);
    game.mainLayer.addChild(view);
    game.startDragWaste(event(140, 50, 'pointerdown'), view);
    game.onDragEnd(event(140, 50));
    expect(game.state.foundations[0].at(-1)).toBe(card);
    expect(game.state.wasteVisibleCount).toBe(1);
    expect(game.mainLayer.eventMode).toBe('none');
    const animate = ticker.add.mock.calls[0][0];
    animate({ deltaMS: 125 });
    expect(game.dragLayer.children[0].x).toBeCloseTo(230);
    expect(game.checkWin).not.toHaveBeenCalled();
    animate({ deltaMS: 125 });
    expect(ticker.remove).toHaveBeenCalledWith(animate);
    expect(game.checkWin).toHaveBeenCalledOnce();
  });

  it('moves only a face-up bottom tableau card and reveals the card beneath', () => {
    const { game, event } = setup();
    const hidden = new Card('clubs', 9);
    const card = new Card('hearts', 1, true);
    game.state.tableau[0] = [hidden, card];
    const view = new Container();
    view.position.set(20, 194);
    game.tableauViews[0] = [new Container(), view];
    game.startDragTableau(event(25, 200, 'pointerdown'), 0, 1, view);
    game.onDragEnd(event(25, 200));
    expect(game.state.foundations[1]).toEqual([card]);
    expect(hidden.faceUp).toBe(true);
  });

  it('does not autoplay an ineligible or buried card, or after a drag', () => {
    const { game, event, ticker } = setup();
    const ace = new Card('spades', 1, true);
    const king = new Card('hearts', 13, true);
    game.state.tableau[0] = [ace, king];
    const first = new Container();
    const last = new Container();
    game.tableauViews[0] = [first, last];
    game.startDragTableau(event(5, 5, 'pointerdown'), 0, 0, first);
    game.onDragEnd(event(5, 5));
    expect(game.state.foundations[0]).toEqual([]);
    game.startDragTableau(event(5, 5, 'pointerdown'), 0, 1, last);
    game.onDragEnd(event(5, 5));
    expect(game.state.tableau[0]).toEqual([ace, king]);
    game.state.waste = [ace];
    const view = new Container();
    game.mainLayer.addChild(view);
    game.startDragWaste(event(5, 5, 'pointerdown'), view);
    game.onDragMove(event(30, 5, 'pointermove'));
    game.onDragEnd(event(5, 5));
    expect(game.state.waste).toEqual([ace]);
    expect(ticker.add).not.toHaveBeenCalled();
  });

  it('keeps legal drags working and ignores unrelated pointers', () => {
    const { game, event, ticker } = setup();
    const card = new Card('hearts', 5, true);
    game.state.waste = [card];
    game.state.wasteVisibleCount = 1;
    game.state.tableau[1] = [new Card('clubs', 6, true)];
    const view = new Container();
    view.position.set(130, 40);
    game.mainLayer.addChild(view);
    game.startDragWaste(event(150, 60, 'pointerdown'), view);
    game.onDragEnd(event(150, 60, 'pointerup', 2));
    expect(game.state.waste).toEqual([card]);
    game.onDragMove(event(140, 220, 'pointermove'));
    game.onDragEnd(event(140, 220));
    expect(game.state.tableau[1].at(-1)).toBe(card);
    expect(game.state.waste).toEqual([]);
    expect(ticker.add).not.toHaveBeenCalled();
  });

  it('cancels the animation when the board is redrawn', () => {
    const { game, event, ticker } = setup();
    const card = new Card('diamonds', 1, true);
    game.state.waste = [card];
    game.state.wasteVisibleCount = 1;
    const view = new Container();
    game.mainLayer.addChild(view);
    game.startDragWaste(event(5, 5, 'pointerdown'), view);
    game.onDragEnd(event(5, 5));
    const animate = ticker.add.mock.calls[0][0];
    game.renderAll();
    expect(ticker.remove).toHaveBeenCalledWith(animate);
    expect(game.state.foundations[2]).toEqual([card]);
    expect(game.mainLayer.eventMode).toBe('auto');
  });
});

describe('waste fan rendering', () => {
  it('shows only the remaining cards in the latest fan and then the previous top', () => {
    const state = createGameState();
    const cards = ([1, 2, 3, 4, 5, 6, 7] as const).map(
      (rank) => new Card('spades', rank)
    );
    state.stock = [...cards].reverse();
    drawFromStock(state, 3);
    drawFromStock(state, 3);
    const game = Object.assign(Object.create(KlondikeGame.prototype), {
      app: { screen: { width: 750, height: 800 } },
      themes: [defaultTheme],
      currentThemeIndex: 0,
      drawCount: 3,
      state,
      mainLayer: new Container()
    }) as {
      mainLayer: Container;
      renderWaste: () => void;
    };

    const fans = [
      cards.slice(3, 6),
      cards.slice(3, 5),
      cards.slice(3, 4),
      cards.slice(2, 3)
    ];
    fans.forEach((expected, step) => {
      game.mainLayer.removeChildren();
      game.renderWaste();
      const views = game.mainLayer.children[0].children as (Container & {
        card: Card;
      })[];
      expect(views.map((view) => view.card)).toEqual(expected);
      expect(views.map((view) => view.eventMode)).toEqual(
        expected.map((_, i) => (i === expected.length - 1 ? 'static' : undefined))
      );
      if (step < fans.length - 1) removeTopWasteCard(state);
    });
    expect(state.stock).toEqual([cards[6]]);
  });
});
