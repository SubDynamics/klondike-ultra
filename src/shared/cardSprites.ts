/**
 * @file cardSprites.ts
 * Shared PixiJS card-rendering utilities used by every solitaire variant.
 *
 * Exports:
 * - {@link CardDims}     — width/height/radius bundle for a scaled card
 * - {@link makeCardBack} — renders the back face of a card
 * - {@link makeCardFace} — renders the front face of a card
 * - {@link makeEmptySlot} — renders an empty card-slot placeholder
 * - {@link CardView}    — PixiJS Container that wraps a single Card
 * - {@link getSuitIconAsset} — maps a suit name to a Pixi asset alias
 */

import { Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { Card } from '../Card';
import type { ColorTheme } from '../types/themeTypes';

// ─── Card dimensions bundle ───────────────────────────────────────────────────

/**
 * Scaled pixel dimensions for a single playing card.
 * Every rendering helper accepts a `CardDims` so layout can be computed once
 * and passed around without reaching back into the game class.
 */
export interface CardDims {
  /** Card width in pixels (after scaling). */
  w: number;
  /** Card height in pixels (after scaling). */
  h: number;
  /** Corner radius in pixels (after scaling). */
  r: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the Pixi asset alias for a given suit name.
 * The alias must have been registered with `Assets.load` before calling this.
 *
 * @param suit - One of `'spades'`, `'hearts'`, `'diamonds'`, or `'clubs'`.
 * @returns    The asset alias string registered with Pixi's Assets system
 *             (e.g. `'suit-spade'`).
 */
export function getSuitIconAsset(suit: string): string {
  const assetMap: Record<string, string> = {
    spades: 'suit-spade',
    hearts: 'suit-heart',
    diamonds: 'suit-diamond',
    clubs: 'suit-club'
  };
  return assetMap[suit] ?? 'suit-spade';
}

// ─── Card containers ──────────────────────────────────────────────────────────

/**
 * Creates a PixiJS Container rendering the back face of a card.
 * Draws a filled rounded rectangle with a decorative inner border.
 *
 * @param theme - Active colour theme used for fill and stroke colours.
 * @param dims  - Scaled card dimensions (width, height, corner radius).
 * @returns     A new `Container` holding the card-back graphics.
 */
export function makeCardBack(theme: ColorTheme, dims: CardDims): Container {
  const { w, h, r } = dims;
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, w, h, r)
    .fill({ color: theme.cardFaceDownColor })
    .stroke({ color: theme.cardBorderColor, width: 1 });
  // Inner border inset by half the corner radius for a balanced decorative look.
  const inset = Math.round(r / 2);
  g.roundRect(
    inset,
    inset,
    w - inset * 2,
    h - inset * 2,
    Math.max(r - 2, 2)
  ).stroke({
    color: theme.cardInteriorStrokeColor,
    width: 1
  });
  c.addChild(g);
  return c;
}

/**
 * Creates a PixiJS Container rendering the front face of a card.
 * Draws the card background, rank label, and suit icons (top-left and centre).
 * All font and icon sizes are derived proportionally from the card dimensions.
 *
 * @param card  - The card data (rank, suit, red/black).
 * @param theme - Active colour theme.
 * @param dims  - Scaled card dimensions.
 * @returns     A new `Container` holding the card-face graphics and text.
 */
export function makeCardFace(
  card: Card,
  theme: ColorTheme,
  dims: CardDims
): Container {
  const { w, h, r } = dims;
  const c = new Container();
  const textColor = card.isRed
    ? theme.playingCardsRed
    : theme.playingCardsBlack;
  const g = new Graphics();
  g.roundRect(0, 0, w, h, r)
    .fill({ color: theme.playingCardsBackground })
    .stroke({ color: theme.cardBorderColor, width: 1 });
  c.addChild(g);

  const label = card.label;
  const iconAsset = getSuitIconAsset(card.suit);
  const fontSize = Math.round(w * 0.25);
  const iconSize = Math.round(w * 0.175);
  const padding = Math.round(w * 0.075);

  // Top-left rank label
  const topStyle = new TextStyle({
    fontSize,
    fontWeight: 'bold',
    fontFamily: 'BioRhymeExpanded-ExtraBold',
    fill: textColor
  });
  const topText = new Text({ text: label, style: topStyle });
  topText.x = padding;
  topText.y = Math.round(h * 0.018);

  // Top-left suit icon
  const topIcon = Sprite.from(iconAsset);
  topIcon.width = iconSize;
  topIcon.height = iconSize;
  topIcon.anchor.set(0.5, 0.5);
  topIcon.x = topText.x + topText.width + iconSize * 0.75;
  topIcon.y = Math.round(h * 0.107);

  // Centre suit icon
  const centerIcon = Sprite.from(iconAsset);
  centerIcon.width = Math.round(w * 0.75);
  centerIcon.height = Math.round(w * 0.75);
  centerIcon.anchor.set(0.5, 0.5);
  centerIcon.x = w / 2;
  centerIcon.y = h * 0.6;

  c.addChild(topText, topIcon, centerIcon);
  return c;
}

/**
 * Creates a PixiJS Container rendering an empty card-slot placeholder.
 * Used for stock recycle slots, waste placeholders, tableau column bases,
 * and foundation slots that have no cards yet.
 *
 * @param theme - Active colour theme.
 * @param dims  - Scaled card dimensions.
 * @param label - Optional text displayed in the centre of the slot
 *                (e.g. `'↺'`, `'♠'`, or `'K'`).
 * @returns     A new `Container` holding the slot graphics and optional label.
 */
export function makeEmptySlot(
  theme: ColorTheme,
  dims: CardDims,
  label = ''
): Container {
  const { w, h, r } = dims;
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, w, h, r)
    .fill({ color: theme.emptySlotFill })
    .stroke({ color: theme.emptySlotStroke, width: 1.5 });
  c.addChild(g);
  if (label) {
    const style = new TextStyle({
      fontSize: Math.round(h * 0.196),
      fill: theme.emptySlotTextColor
    });
    const t = new Text({ text: label, style });
    t.anchor.set(0.5, 0.5);
    t.x = w / 2;
    t.y = h / 2;
    c.addChild(t);
  }
  return c;
}

// ─── CardView ─────────────────────────────────────────────────────────────────

/**
 * A PixiJS `Container` that visually represents a single playing card.
 * Renders either the card face or card back depending on `card.faceUp`.
 * Call {@link CardView.redraw} whenever the face-up state changes.
 */
export class CardView extends Container {
  /** The card data this view represents. */
  card: Card;
  private theme: ColorTheme;
  private dims: CardDims;

  /**
   * Creates a new `CardView` and immediately renders the card.
   *
   * @param card  - The card data to display.
   * @param theme - Active colour theme.
   * @param dims  - Scaled card dimensions used to size the graphics.
   */
  constructor(card: Card, theme: ColorTheme, dims: CardDims) {
    super();
    this.card = card;
    this.theme = theme;
    this.dims = dims;
    this.redraw();
  }

  /**
   * Re-renders the card using its current face-up state.
   * Removes all existing children and replaces them with a fresh face or back.
   */
  redraw(): void {
    this.removeChildren();
    const inner = this.card.faceUp
      ? makeCardFace(this.card, this.theme, this.dims)
      : makeCardBack(this.theme, this.dims);
    this.addChild(inner);
  }
}
