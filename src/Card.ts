export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function rankLabel(rank: Rank): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

export function suitSymbol(suit: Suit): string {
  switch (suit) {
    case 'spades':   return '♠';
    case 'hearts':   return '♥';
    case 'diamonds': return '♦';
    case 'clubs':    return '♣';
  }
}

export class Card {
  readonly suit: Suit;
  readonly rank: Rank;
  faceUp: boolean;

  constructor(suit: Suit, rank: Rank, faceUp = false) {
    this.suit = suit;
    this.rank = rank;
    this.faceUp = faceUp;
  }

  get isRed(): boolean {
    return isRedSuit(this.suit);
  }

  get label(): string {
    return rankLabel(this.rank);
  }

  get symbol(): string {
    return suitSymbol(this.suit);
  }

  toString(): string {
    return `${this.label}${this.symbol}`;
  }
}
