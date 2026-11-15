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
    CardView: class extends Container {
      card: Card;
      constructor(card: Card) {
        super();
        this.card = card;
      }
    }
  };
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
