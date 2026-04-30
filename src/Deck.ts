/**
 * @file Deck.ts
 * Deck creation and shuffling utilities shared by all solitaire variants.
 *
 * Exports {@link createDeck} to build a standard 52-card deck and
 * {@link shuffle} for an in-place Fisher-Yates array shuffle.
 * Spider Solitaire callers may invoke `createDeck` twice and concatenate the
 * results to obtain a 104-card double deck.
 */

import { Card, SUITS, RANKS } from './Card';

/**
 * Creates a standard ordered 52-card deck — all four suits × all thirteen ranks.
 * Cards are constructed face-down (`faceUp = false`) by default.
 * The order is suits-outer, ranks-inner (consistent with {@link SUITS} and {@link RANKS}).
 *
 * @returns A new array of 52 {@link Card} objects in a fixed order.
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(new Card(suit, rank));
    }
  }
  return deck;
}

/**
 * Returns a new array containing the same elements as `arr` in a uniformly
 * random order, using the Fisher-Yates (Knuth) shuffle algorithm.
 * The original array is **not** mutated.
 *
 * @typeParam T - Element type of the array.
 * @param arr  - The array to shuffle.
 * @returns    A new array with the same elements in a random order.
 */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
