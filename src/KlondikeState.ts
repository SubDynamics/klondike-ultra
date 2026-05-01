/**
 * @file KlondikeState.ts
 * Klondike Solitaire game state, move validation, and action functions.
 *
 * The {@link GameState} interface owns all mutable state for a single Klondike
 * game session. All mutation functions accept a `GameState` reference and
 * modify it in-place, making it straightforward to undo/redo or serialise.
 */

import { Card, type Suit, SUITS } from './Card';
import { createDeck, shuffle } from './Deck';

/** Number of tableau columns in a Klondike game. */
export const TABLEAU_COUNT = 7;

/** Number of foundation piles in a Klondike game (one per suit). */
export const FOUNDATION_COUNT = 4;

/** Number of cards drawn from the stock on each click. */
export const DRAW_COUNT = 1;

/**
 * Complete mutable state for a single Klondike Solitaire game session.
 * All pile arrays are ordered so that `pile[0]` is the card placed first
 * (visually at the top/left) and `pile[pile.length - 1]` is the topmost
 * visible card.
 */
export interface GameState {
  /** Seven tableau columns; each column is a stack of cards. */
  tableau: Card[][];
  /**
   * Four foundation piles, one per suit ordered spades / hearts / diamonds / clubs.
   * Each pile builds from Ace (index 0) up to King.
   */
  foundations: Card[][];
  /** The remaining draw pile (face-down). Popped from the end when drawing. */
  stock: Card[];
  /** Cards drawn from the stock and available for play (last element is "on top"). */
  waste: Card[];
}

/**
 * Creates a freshly shuffled {@link GameState} for a new Klondike game.
 *
 * Deal layout:
 * - Column 0 gets 1 card, column 1 gets 2, …, column 6 gets 7 (standard Klondike triangle).
 * - Only the top card of each column is face-up.
 * - Remaining cards go to the stock pile (face-down).
 *
 * @returns A ready-to-play initial game state.
 */
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

  const stock = deck.slice(idx).map((c) => {
    c.faceUp = false;
    return c;
  });
  const waste: Card[] = [];
  const foundations: Card[][] = [[], [], [], []];

  return { tableau, foundations, stock, waste };
}

// ---------- move validation ----------

/**
 * Returns `true` if `card` can legally be placed on `pile` according to
 * Klondike tableau rules:
 * - An empty pile only accepts a King.
 * - Otherwise the top card must be face-up, the colour must alternate, and
 *   the rank must be exactly one lower than the top card's rank.
 *
 * @param card - The card (or the topmost card of a stack) to place.
 * @param pile - The destination tableau column.
 */
export function canPlaceOnTableau(card: Card, pile: Card[]): boolean {
  if (pile.length === 0) {
    // Only Kings can start empty columns
    return card.rank === 13;
  }
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return card.isRed !== top.isRed && card.rank === top.rank - 1;
}

/**
 * Returns `true` if `card` can legally be placed on foundation pile `pile`:
 * - An empty foundation only accepts an Ace.
 * - Otherwise the top card must be the same suit and exactly one rank lower.
 *
 * @param card - The card to place.
 * @param pile - The destination foundation pile.
 */
export function canPlaceOnFoundation(card: Card, pile: Card[]): boolean {
  if (pile.length === 0) {
    return card.rank === 1; // Ace starts a foundation
  }
  const top = pile[pile.length - 1];
  return card.suit === top.suit && card.rank === top.rank + 1;
}

/**
 * Returns the index (0–3) of the foundation pile that corresponds to `suit`.
 * The order matches {@link SUITS}: spades=0, hearts=1, diamonds=2, clubs=3.
 *
 * @param suit - The suit to look up.
 */
export function foundationIndexForSuit(suit: Suit): number {
  return SUITS.indexOf(suit);
}

// ---------- actions ----------

/**
 * Draws {@link DRAW_COUNT} cards from the stock to the waste pile, turning them
 * face-up. If the stock is empty, the entire waste pile is recycled back into
 * the stock (face-down) and no cards are drawn this call.
 *
 * @param state - The game state to mutate.
 */
export function drawFromStock(state: GameState): void {
  if (state.stock.length === 0) {
    // Recycle
    state.stock = state.waste.reverse();
    state.waste = [];
    state.stock.forEach((c) => (c.faceUp = false));
    return;
  }
  const toDraw = Math.min(DRAW_COUNT, state.stock.length);
  for (let i = 0; i < toDraw; i++) {
    const card = state.stock.pop()!;
    card.faceUp = true;
    state.waste.push(card);
  }
}

/**
 * Attempts to move the top waste card to its matching foundation pile.
 *
 * @param state - The game state to mutate.
 * @returns     `true` if the move succeeded; `false` if the waste is empty or
 *              the top card cannot yet go on its foundation.
 */
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

/**
 * Attempts to move the top waste card to tableau column `col`.
 *
 * @param state - The game state to mutate.
 * @param col   - Target tableau column index (0–6).
 * @returns     `true` if the move succeeded.
 */
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

/**
 * Moves a stack of face-up cards starting at `fromRow` in column `fromCol`
 * to column `toCol`. Automatically flips the newly exposed top card of the
 * source column face-up.
 *
 * @param state   - The game state to mutate.
 * @param fromCol - Source tableau column index.
 * @param fromRow - Row index of the topmost card to move.
 * @param toCol   - Destination tableau column index.
 * @returns       `true` if the move was valid and succeeded.
 */
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

/**
 * Attempts to move the top card of tableau column `col` to its matching
 * foundation pile. Flips the newly exposed top card face-up on success.
 *
 * @param state - The game state to mutate.
 * @param col   - Source tableau column index (0–6).
 * @returns     `true` if the move succeeded.
 */
export function moveTableauToFoundation(
  state: GameState,
  col: number
): boolean {
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

/**
 * Attempts to move the top card of foundation pile `fi` back to tableau
 * column `col`. Needed for certain advanced strategies.
 *
 * @param state - The game state to mutate.
 * @param fi    - Source foundation index (0–3).
 * @param col   - Destination tableau column index (0–6).
 * @returns     `true` if the move succeeded.
 */
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

/**
 * Returns `true` when all four foundation piles each contain 13 cards
 * (i.e. the game has been won).
 *
 * @param state - The game state to inspect.
 */
export function isWon(state: GameState): boolean {
  return state.foundations.every((f) => f.length === 13);
}

/**
 * Attempts to auto-move a single card from the waste or any tableau column
 * directly to its matching foundation pile.
 * Checks the waste first, then columns left to right.
 *
 * @param state - The game state to mutate.
 * @returns     `true` if at least one card was moved.
 */
export function autoMoveToFoundation(state: GameState): boolean {
  // Check waste
  if (moveWasteToFoundation(state)) return true;
  // Check each tableau column
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    if (moveTableauToFoundation(state, col)) return true;
  }
  return false;
}
