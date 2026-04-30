/**
 * @file SpiderState.ts
 * Spider Solitaire (4-suit) game state, move validation, and action functions.
 *
 * **Rules implemented**
 * - 2 standard decks (104 cards total).
 * - 10 tableau columns: columns 0–3 have 6 cards each; columns 4–9 have 5 cards each.
 *   All cards are face-down except the top card of each column.
 * - Stock: 50 remaining cards dealt 10 at a time (one per column per deal).
 * - A "moveable stack" is a consecutive group of face-up cards at the end of a
 *   column that share the same suit and decrease in rank by 1 per card.
 * - A single face-up card or a moveable same-suit stack can be placed on any
 *   column whose top card is exactly one rank higher (any suit is accepted as target).
 * - When the bottom 13 cards of a column form a King-to-Ace same-suit sequence,
 *   they are automatically removed (one completed sequence).
 * - Win condition: all 8 sequences have been completed and removed.
 */

import { Card } from './Card';
import { createDeck, shuffle } from './Deck';

/** Number of tableau columns in a Spider game. */
export const SPIDER_TABLEAU_COUNT = 10;

/** Total completed sequences needed to win (2 decks ÷ 13 cards = 8). */
export const SPIDER_SEQUENCES_TO_WIN = 8;

/** Number of cards dealt to each column from the stock on a single deal. */
export const SPIDER_DEAL_SIZE = 10;

/**
 * Complete mutable state for a single Spider Solitaire game session.
 * All pile arrays are ordered so that `pile[0]` is the card placed first
 * (visually highest) and `pile[pile.length - 1]` is the topmost visible card.
 */
export interface SpiderState {
  /** Ten tableau columns; each column is a stack of cards. */
  tableau: Card[][];
  /**
   * Remaining cards in the stock, stored as a flat array.
   * Cards are dealt from the end (pop) in groups of {@link SPIDER_DEAL_SIZE}.
   */
  stock: Card[];
  /** Number of complete King-through-Ace same-suit sequences removed so far (0–8). */
  completedSequences: number;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a freshly shuffled {@link SpiderState} for a new Spider Solitaire game.
 *
 * Deal layout (standard Spider):
 * - Columns 0–3: 6 cards each (5 face-down + 1 face-up).
 * - Columns 4–9: 5 cards each (4 face-down + 1 face-up).
 * - Remaining 50 cards form the stock for 5 future deals of 10.
 *
 * @returns A ready-to-play initial Spider game state.
 */
export function createSpiderState(): SpiderState {
  // Two standard decks shuffled together.
  const deck = shuffle([...createDeck(), ...createDeck()]);
  const tableau: Card[][] = [];
  let idx = 0;

  for (let col = 0; col < SPIDER_TABLEAU_COUNT; col++) {
    // Columns 0-3 get 6 cards; columns 4-9 get 5 cards.
    const count = col < 4 ? 6 : 5;
    const pile: Card[] = [];
    for (let i = 0; i < count; i++) {
      const card = deck[idx++];
      card.faceUp = i === count - 1; // only the top card starts face-up
      pile.push(card);
    }
    tableau.push(pile);
  }

  // Remaining 50 cards go to the stock (all face-down).
  const stock = deck.slice(idx).map((c) => {
    c.faceUp = false;
    return c;
  });

  return { tableau, stock, completedSequences: 0 };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Returns the number of cards in a contiguous same-suit descending sequence
 * at the **end** of `pile` (i.e. the visible "moveable stack").
 *
 * Examples:
 * - `[K♠, Q♠, J♠]` → 3 (entire column is one moveable stack).
 * - `[5♥, 4♠, 3♠]` → 2 (only the last two cards form a same-suit run).
 * - `[7♣]` → 1 (single card is always moveable).
 * - `[]` → 0 (empty column has no moveable cards).
 *
 * @param pile    - The tableau column to inspect.
 * @returns       The count of cards that form the moveable stack at the top.
 */
export function moveableStackSize(pile: Card[]): number {
  if (pile.length === 0) return 0;
  let count = 1;
  for (let i = pile.length - 1; i > 0; i--) {
    const top = pile[i];
    const below = pile[i - 1];
    if (!below.faceUp) break;
    if (below.suit !== top.suit) break;
    if (below.rank !== top.rank + 1) break;
    count++;
  }
  return count;
}

/**
 * Returns `true` if the stack of cards starting at index `fromRow` to the end
 * of `pile` forms a valid moveable stack (all face-up, same suit, descending rank).
 *
 * @param pile    - The source tableau column.
 * @param fromRow - The row index of the first card to pick up.
 */
export function canPickUpStack(pile: Card[], fromRow: number): boolean {
  if (fromRow < 0 || fromRow >= pile.length) return false;
  if (!pile[fromRow].faceUp) return false;
  const stackSize = moveableStackSize(pile);
  return fromRow >= pile.length - stackSize;
}

/**
 * Returns `true` if the card (or stack whose bottom card is `movingCard`)
 * can be placed on `pile` according to Spider tableau rules:
 * - An empty pile accepts any card.
 * - Otherwise, the top card of the pile must be face-up and exactly one rank
 *   higher than `movingCard` (any suit combination is accepted for placement).
 *
 * @param movingCard - The bottommost card of the stack being moved.
 * @param pile       - The destination tableau column.
 */
export function canPlaceOnSpiderTableau(movingCard: Card, pile: Card[]): boolean {
  if (pile.length === 0) return true; // any card may go on an empty column
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return top.rank === movingCard.rank + 1;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Moves the stack of cards starting at `fromRow` in column `fromCol` to column
 * `toCol`. Automatically flips the newly exposed top card of the source column
 * face-up, then checks whether a complete K-to-A same-suit sequence has been
 * formed at the bottom of `toCol` and removes it if so.
 *
 * @param state   - The game state to mutate.
 * @param fromCol - Source tableau column index (0–9).
 * @param fromRow - Row index of the first card to move.
 * @param toCol   - Destination tableau column index (0–9).
 * @returns       `true` if the move was valid and succeeded.
 */
export function moveSpiderStack(
  state: SpiderState,
  fromCol: number,
  fromRow: number,
  toCol: number
): boolean {
  const from = state.tableau[fromCol];
  const to = state.tableau[toCol];

  if (!canPickUpStack(from, fromRow)) return false;
  const moving = from.slice(fromRow);
  if (!canPlaceOnSpiderTableau(moving[0], to)) return false;

  state.tableau[fromCol] = from.slice(0, fromRow);
  // Flip newly exposed top card face-up.
  const srcPile = state.tableau[fromCol];
  if (srcPile.length > 0) srcPile[srcPile.length - 1].faceUp = true;

  to.push(...moving);

  // Check if placing these cards completed a K-to-A sequence.
  checkAndRemoveSequence(state, toCol);

  return true;
}

/**
 * Checks whether the last 13 cards of tableau column `col` form a King-to-Ace
 * same-suit sequence. If so, removes them and increments
 * {@link SpiderState.completedSequences}.
 *
 * This is called automatically by {@link moveSpiderStack} and
 * {@link dealSpiderStock} after every state change.
 *
 * @param state - The game state to mutate.
 * @param col   - Column index to inspect (0–9).
 * @returns     `true` if a complete sequence was found and removed.
 */
export function checkAndRemoveSequence(state: SpiderState, col: number): boolean {
  const pile = state.tableau[col];
  if (pile.length < 13) return false;

  const start = pile.length - 13;
  const bottom = pile[start];
  if (!bottom.faceUp || bottom.rank !== 13) return false; // must start with King

  for (let i = 1; i < 13; i++) {
    const card = pile[start + i];
    if (!card.faceUp) return false;
    if (card.suit !== bottom.suit) return false;
    if (card.rank !== 13 - i) return false;
  }

  // Valid K-to-A same-suit sequence found — remove it.
  state.tableau[col] = pile.slice(0, start);
  state.completedSequences++;

  // Flip the newly exposed top card face-up (if any remain).
  const remaining = state.tableau[col];
  if (remaining.length > 0) remaining[remaining.length - 1].faceUp = true;

  return true;
}

/**
 * Deals one card from the stock face-up to each tableau column.
 * After dealing, each column is checked for a newly completed sequence.
 *
 * Returns `false` without mutating state when:
 * - The stock is empty (no cards left to deal).
 * - Any tableau column is empty (Spider rules require all columns to have
 *   at least one card before dealing from the stock).
 *
 * @param state - The game state to mutate.
 * @returns     `true` if cards were dealt successfully.
 */
export function dealSpiderStock(state: SpiderState): boolean {
  if (state.stock.length < SPIDER_DEAL_SIZE) return false;
  // All columns must be non-empty before dealing.
  if (state.tableau.some((col) => col.length === 0)) return false;

  for (let col = 0; col < SPIDER_TABLEAU_COUNT; col++) {
    const card = state.stock.pop()!;
    card.faceUp = true;
    state.tableau[col].push(card);
  }

  // Check each column for a newly completed sequence.
  for (let col = 0; col < SPIDER_TABLEAU_COUNT; col++) {
    checkAndRemoveSequence(state, col);
  }

  return true;
}

/**
 * Returns `true` when all {@link SPIDER_SEQUENCES_TO_WIN} sequences have been
 * completed and removed (i.e. the game has been won).
 *
 * @param state - The game state to inspect.
 */
export function isSpiderWon(state: SpiderState): boolean {
  return state.completedSequences >= SPIDER_SEQUENCES_TO_WIN;
}
