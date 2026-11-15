import { describe, expect, it } from 'vitest';
import { Card } from './Card';
import {
  canPlaceOnTableau,
  createGameState,
  drawFromStock,
  moveWasteToFoundation,
  moveWasteToTableau
} from './KlondikeState';

describe('canPlaceOnTableau', () => {
  it('accepts only a king on an empty column', () => {
    expect(canPlaceOnTableau(new Card('hearts', 13), [])).toBe(true);
    expect(canPlaceOnTableau(new Card('clubs', 12), [])).toBe(false);
    expect(canPlaceOnTableau(new Card('spades', 1), [])).toBe(false);
  });

  describe('drawFromStock', () => {
    it('draws one card by default', () => {
      const state = createGameState();
      const top = state.stock[state.stock.length - 1];

      drawFromStock(state);

      expect(state.waste).toEqual([top]);
      expect(top.faceUp).toBe(true);
      expect(state.stock).toHaveLength(23);
    });

    it('draws three cards in order, or the remaining cards if fewer than three', () => {
      const state = createGameState();
      const cards = [
        new Card('spades', 1),
        new Card('hearts', 2),
        new Card('clubs', 3),
        new Card('diamonds', 4)
      ];
      state.stock = [...cards];

      drawFromStock(state, 3);
      expect(state.waste).toEqual([cards[3], cards[2], cards[1]]);
      expect(state.waste.every((card) => card.faceUp)).toBe(true);
      expect(state.stock).toEqual([cards[0]]);

      drawFromStock(state, 3);
      expect(state.waste).toEqual([cards[3], cards[2], cards[1], cards[0]]);
      expect(state.stock).toEqual([]);
    });

    it('recycles the waste face-down without drawing and preserves the draw order', () => {
      const state = createGameState();
      const cards = [new Card('spades', 1), new Card('hearts', 2)];
      state.stock = [...cards];
      drawFromStock(state, 3);

      drawFromStock(state, 3);
      expect(state.waste).toEqual([]);
      expect(state.stock).toEqual(cards);
      expect(state.stock.every((card) => !card.faceUp)).toBe(true);

      drawFromStock(state, 3);
      expect(state.waste).toEqual([cards[1], cards[0]]);
    });

    it('only moves the top waste card and exposes the previous card', () => {
      const state = createGameState();
      const ace = new Card('spades', 1, true);
      const king = new Card('hearts', 13, true);
      state.waste = [ace, king];
      state.tableau[0] = [];

      expect(moveWasteToFoundation(state)).toBe(false);
      expect(moveWasteToTableau(state, 0)).toBe(true);
      expect(state.tableau[0]).toEqual([king]);
      expect(moveWasteToFoundation(state)).toBe(true);
      expect(state.foundations[0]).toEqual([ace]);
      expect(state.waste).toEqual([]);
    });
  });

  it('accepts a card one rank lower with the opposite colour', () => {
    expect(
      canPlaceOnTableau(new Card('hearts', 12), [new Card('spades', 13, true)])
    ).toBe(true);
    expect(
      canPlaceOnTableau(new Card('clubs', 1), [new Card('diamonds', 2, true)])
    ).toBe(true);
  });

  it('rejects cards of the same colour, even when their suits differ', () => {
    expect(
      canPlaceOnTableau(new Card('diamonds', 6), [new Card('hearts', 7, true)])
    ).toBe(false);
    expect(
      canPlaceOnTableau(new Card('clubs', 6), [new Card('spades', 7, true)])
    ).toBe(false);
  });

  it('rejects equal, higher, or more than one rank lower cards', () => {
    const pile = [new Card('spades', 7, true)];
    expect(canPlaceOnTableau(new Card('hearts', 7), pile)).toBe(false);
    expect(canPlaceOnTableau(new Card('hearts', 8), pile)).toBe(false);
    expect(canPlaceOnTableau(new Card('hearts', 5), pile)).toBe(false);
    expect(
      canPlaceOnTableau(new Card('hearts', 13), [new Card('spades', 1, true)])
    ).toBe(false);
  });

  it('rejects an otherwise valid move onto a face-down card', () => {
    expect(
      canPlaceOnTableau(new Card('hearts', 6), [new Card('spades', 7)])
    ).toBe(false);
  });

  it('uses the last card of the pile without changing the cards or pile', () => {
    const bottom = new Card('hearts', 9);
    const top = new Card('spades', 7, true);
    const card = new Card('diamonds', 6, true);
    const pile = [bottom, top];

    expect(canPlaceOnTableau(card, pile)).toBe(true);
    expect(pile).toEqual([bottom, top]);
    expect([bottom.faceUp, top.faceUp, card.faceUp]).toEqual([
      false,
      true,
      true
    ]);
  });
});
