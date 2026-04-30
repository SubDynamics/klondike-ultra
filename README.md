# klondike-ultra

Klondike Solitaire built with **Vite**, **TypeScript**, and **PixiJS**.

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## How to Play

- **Stock** (top-left blue card): Click to draw a card to the waste pile. Click again when empty to recycle.
- **Waste** (top-left empty slot): Top card can be dragged to the tableau or foundations, or tapped to auto-send to a foundation.
- **Foundations** (top-right 4 slots): Build up each suit from Ace to King. Drag or tap cards onto the matching foundation.
- **Tableau** (7 columns): Build down in alternating colours. Drag face-up cards (and stacks) between columns. Only Kings can be placed on empty columns.
- **New Game** button: Start a fresh game at any time.

## Architecture

| File                  | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `src/Card.ts`         | Card model — suit, rank, face-up state, label/symbol helpers     |
| `src/Deck.ts`         | Deck creation and Fisher-Yates shuffle                           |
| `src/GameState.ts`    | All game logic — move validation, state mutations, win detection |
| `src/KlondikeGame.ts` | PixiJS renderer and drag-and-drop interaction (see below)        |
| `src/main.ts`         | Application entry point                                          |

### KlondikeGame.ts structure

`KlondikeGame` is the top-level class that owns the PixiJS scene graph and responds to player input. It is organised into the following sections:

| Section | Methods | Description |
| ------- | ------- | ----------- |
| **Lifecycle** | `constructor`, `onResize`, `build`, `renderAll` | Create and rebuild the scene. `build` tears down the stage and recreates the background layers; `renderAll` redraws all game elements within those layers. |
| **Scaled layout** | `scale`, `cardW`, `cardH`, `dims`, `colSpacing`, … | Read-only getters that derive every pixel value from a single `scale` factor (see _Scaling_ below). |
| **Rendering** | `renderStock`, `renderWaste`, `renderFoundations`, `renderTableau` | Draw individual areas of the board. Each method creates fresh PixiJS `Container` objects and attaches event listeners. |
| **UI controls** | `buildNewGameButton`, `buildThemeButton`, `cycleTheme`, `newGame` | Top-bar buttons. |
| **Tap shortcuts** | `autoPlayWaste`, `handleTableauTap` | Move the top waste/tableau card directly to a matching foundation on tap. |
| **Drag & drop** | `startDragWaste`, `startDragTableau`, `beginDrag`, `onDragMove`, `onDragEnd`, `tryDrop`, `dropOnFoundation`, `dropOnTableau` | Full pointer-drag pipeline: ghost creation → move → drop resolution. |
| **Win detection** | `checkWin`, `showWinScreen` | Check all four foundations and overlay the win screen. |

Module-level helper functions (`makeCardBack`, `makeCardFace`, `makeEmptySlot`) build PixiJS `Container` objects for individual card states. They are pure — they only receive a theme and a `CardDims` struct and return a new container.

### Scaling

The canvas always fills the browser window because the PixiJS application is initialised with `resizeTo: window`. Whenever the window is resized the renderer fires a `resize` event which calls `KlondikeGame.onResize()`, triggering a full scene rebuild.

All layout values are derived from a single **scale factor**:

```
scale = currentViewportWidth / 750
```

The number `750` is the design reference width (`BASE_W`). Every `BASE_*` constant in `KlondikeGame.ts` stores a pixel value at that reference width; each is multiplied by `scale` at render time. For example:

```ts
private get scale(): number   { return this.W / BASE_W; }
private get cardW(): number   { return Math.round(BASE_CARD_W   * this.scale); }
private get colSpacing(): number { return Math.round(BASE_COL_SPACING * this.scale); }
```

This means:
- On a 1500 px wide screen, `scale = 2` and all cards are twice as large.
- On a 375 px wide screen (mobile), `scale = 0.5` and all cards are half size.
- Font sizes, icon sizes, button dimensions, and drop-zone hit areas all follow the same pattern.

No manual configuration is required — the game adapts automatically to any viewport size.
