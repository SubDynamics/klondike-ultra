import { describe, expect, it } from 'vitest';
import { Card } from './Card';
import { canPlaceOnTableau } from './KlondikeState';

describe('canPlaceOnTableau', () => {
  it('accepts only a king on an empty column', () => {
    expect(canPlaceOnTableau(new Card('hearts', 13), [])).toBe(true);
    expect(canPlaceOnTableau(new Card('clubs', 12), [])).toBe(false);
    expect(canPlaceOnTableau(new Card('spades', 1), [])).toBe(false);
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
