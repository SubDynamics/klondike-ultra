/**
 * @file Card.ts
 * Core playing-card model shared by all solitaire variants.
 *
 * Exports the {@link Suit} and {@link Rank} primitive types, the utility
 * constants {@link SUITS} and {@link RANKS}, helper functions
 * {@link isRedSuit}, {@link rankLabel}, and {@link suitSymbol}, and the
 * {@link Card} class itself.
 */

/** The four standard playing-card suits. */
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

/**
 * Card ranks 1 (Ace) through 13 (King).
 * 11 = Jack, 12 = Queen, 13 = King.
 */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/**
 * Ordered array of all four suits.
 * The order matches the foundation-slot order used in Klondike
 * (spades → hearts → diamonds → clubs).
 */
export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/**
 * Ordered array of all thirteen ranks, from Ace (1) to King (13).
 */
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/**
 * Returns `true` when `suit` is a red suit (hearts or diamonds).
 *
 * @param suit - The suit to test.
 */
export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

/**
 * Converts a numeric rank to its display label.
 * Ace → `'A'`, Jack → `'J'`, Queen → `'Q'`, King → `'K'`,
 * all other ranks → their decimal string representation.
 *
 * @param rank - The rank to convert.
 * @returns    A short string label suitable for display on a card face.
 */
export function rankLabel(rank: Rank): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

/**
 * Returns the Unicode symbol character for the given suit.
 *
 * | Suit     | Symbol |
 * |----------|--------|
 * | spades   | ♠      |
 * | hearts   | ♥      |
 * | diamonds | ♦      |
 * | clubs    | ♣      |
 *
 * @param suit - The suit to convert.
 * @returns    A single Unicode character.
 */
export function suitSymbol(suit: Suit): string {
  switch (suit) {
    case 'spades':
      return '♠';
    case 'hearts':
      return '♥';
    case 'diamonds':
      return '♦';
    case 'clubs':
      return '♣';
  }
}

/**
 * Immutable playing-card model used throughout every solitaire variant.
 *
 * A card has a fixed {@link Card.suit} and {@link Card.rank}.
 * The only mutable property is {@link Card.faceUp}, which tracks
 * whether the card is currently visible to the player.
 */
export class Card {
  /** The suit of this card. */
  readonly suit: Suit;

  /** The rank of this card (1 = Ace, 13 = King). */
  readonly rank: Rank;

  /** Whether the card is currently face-up (visible to the player). */
  faceUp: boolean;

  /**
   * @param suit   - The suit of the card.
   * @param rank   - The rank of the card (1–13).
   * @param faceUp - Initial face-up state (default `false`).
   */
  constructor(suit: Suit, rank: Rank, faceUp = false) {
    this.suit = suit;
    this.rank = rank;
    this.faceUp = faceUp;
  }

  /** `true` when this card belongs to a red suit (hearts or diamonds). */
  get isRed(): boolean {
    return isRedSuit(this.suit);
  }

  /**
   * Short display label for the card's rank
   * (`'A'`, `'2'`–`'10'`, `'J'`, `'Q'`, `'K'`).
   */
  get label(): string {
    return rankLabel(this.rank);
  }

  /** Unicode suit symbol character (`'♠'`, `'♥'`, `'♦'`, or `'♣'`). */
  get symbol(): string {
    return suitSymbol(this.suit);
  }

  /**
   * Returns a compact string representation of the card (e.g. `'A♠'`, `'K♥'`).
   * Useful for debugging and logging.
   */
  toString(): string {
    return `${this.label}${this.symbol}`;
  }
}
