import { Card, type Suit, SUITS } from './Card';
import { createDeck, shuffle } from './Deck';

export const TABLEAU_COUNT = 7;
export const FOUNDATION_COUNT = 4;
// Draw 1 card at a time from the stock
export const DRAW_COUNT = 1;

export interface GameState {
  tableau: Card[][];       // 7 columns
  foundations: Card[][];   // 4 piles (one per suit, ordered spades/hearts/diamonds/clubs)
  stock: Card[];
  waste: Card[];
}

export function createGameState(): GameState {
  const deck = shuffle(createDeck());
  const tableau: Card[][] = [];
  let idx = 0;

  for (let col = 0; col < TABLEAU_COUNT; col++) {
    const pile: Card[] = [];
    for (let row = 0; row <= col; row++) {
      const card = deck[idx++];
      card.faceUp = row === col; // only top card face up
      pile.push(card);
    }
    tableau.push(pile);
  }

  const stock = deck.slice(idx).map(c => { c.faceUp = false; return c; });
  const waste: Card[] = [];
  const foundations: Card[][] = [[], [], [], []];

  return { tableau, foundations, stock, waste };
}

// ---------- move validation ----------

export function canPlaceOnTableau(card: Card, pile: Card[]): boolean {
  if (pile.length === 0) {
    // Only Kings can start empty columns
    return card.rank === 13;
  }
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return card.isRed !== top.isRed && card.rank === top.rank - 1;
}

export function canPlaceOnFoundation(card: Card, pile: Card[]): boolean {
  if (pile.length === 0) {
    return card.rank === 1; // Ace starts a foundation
  }
  const top = pile[pile.length - 1];
  return card.suit === top.suit && card.rank === top.rank + 1;
}

export function foundationIndexForSuit(suit: Suit): number {
  return SUITS.indexOf(suit);
}

// ---------- actions ----------

/** Draw DRAW_COUNT cards from stock to waste. If stock empty, recycle waste. */
export function drawFromStock(state: GameState): void {
  if (state.stock.length === 0) {
    // Recycle
    state.stock = state.waste.reverse();
    state.waste = [];
    state.stock.forEach(c => (c.faceUp = false));
    return;
  }
  const toDraw = Math.min(DRAW_COUNT, state.stock.length);
  for (let i = 0; i < toDraw; i++) {
    const card = state.stock.pop()!;
    card.faceUp = true;
    state.waste.push(card);
  }
}

/** Attempt to move the top waste card to a foundation. Returns true on success. */
export function moveWasteToFoundation(state: GameState): boolean {
  if (state.waste.length === 0) return false;
  const card = state.waste[state.waste.length - 1];
  const fi = foundationIndexForSuit(card.suit);
  if (canPlaceOnFoundation(card, state.foundations[fi])) {
    state.waste.pop();
    state.foundations[fi].push(card);
    return true;
  }
  return false;
}

/** Attempt to move the top waste card to a tableau pile. Returns true on success. */
export function moveWasteToTableau(state: GameState, col: number): boolean {
  if (state.waste.length === 0) return false;
  const card = state.waste[state.waste.length - 1];
  if (canPlaceOnTableau(card, state.tableau[col])) {
    state.waste.pop();
    state.tableau[col].push(card);
    return true;
  }
  return false;
}

/** Move a stack of face-up cards from one tableau column to another. */
export function moveTableauToTableau(
  state: GameState,
  fromCol: number,
  fromRow: number,
  toCol: number
): boolean {
  const from = state.tableau[fromCol];
  const to = state.tableau[toCol];
  if (fromRow < 0 || fromRow >= from.length) return false;
  const moving = from.slice(fromRow);
  if (!canPlaceOnTableau(moving[0], to)) return false;
  state.tableau[fromCol] = from.slice(0, fromRow);
  // Flip newly exposed top card
  if (state.tableau[fromCol].length > 0) {
    const newTop = state.tableau[fromCol][state.tableau[fromCol].length - 1];
    newTop.faceUp = true;
  }
  to.push(...moving);
  return true;
}

/** Move the top card of a tableau column to a foundation. */
export function moveTableauToFoundation(state: GameState, col: number): boolean {
  const pile = state.tableau[col];
  if (pile.length === 0) return false;
  const card = pile[pile.length - 1];
  if (!card.faceUp) return false;
  const fi = foundationIndexForSuit(card.suit);
  if (canPlaceOnFoundation(card, state.foundations[fi])) {
    pile.pop();
    state.foundations[fi].push(card);
    if (pile.length > 0) pile[pile.length - 1].faceUp = true;
    return true;
  }
  return false;
}

/** Move the top foundation card back to a tableau column (needed for some strategies). */
export function moveFoundationToTableau(
  state: GameState,
  fi: number,
  col: number
): boolean {
  const fp = state.foundations[fi];
  if (fp.length === 0) return false;
  const card = fp[fp.length - 1];
  if (canPlaceOnTableau(card, state.tableau[col])) {
    fp.pop();
    state.tableau[col].push(card);
    return true;
  }
  return false;
}

export function isWon(state: GameState): boolean {
  return state.foundations.every(f => f.length === 13);
}

/** Try to auto-move a single card to any foundation. Returns true if a move was made. */
export function autoMoveToFoundation(state: GameState): boolean {
  // Check waste
  if (moveWasteToFoundation(state)) return true;
  // Check each tableau column
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    if (moveTableauToFoundation(state, col)) return true;
  }
  return false;
}
