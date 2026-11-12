# Solitaire Ultra

A multi-game solitaire collection built with **Vite**, **TypeScript**, and **PixiJS**.
Currently includes **Klondike** and **Spider** solitaire.

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

## Testing and coverage plan

Run `npm test` for the Vitest unit tests and `npm run build` for type-checking
and the production build. The initial tests cover Klondike tableau placement.

Grow coverage incrementally, prioritising the pure game logic in `Card.ts`,
`Deck.ts`, `KlondikeState.ts`, and `SpiderState.ts`: first move validation,
then state transitions (dealing, drawing, recycling, moves, and automatic
actions), and finally win conditions. Aim for at least 80% line and branch
coverage across those modules, including legal and illegal moves, boundary
cases, and state invariants. This is a future target, not a current CI gate;
add a Vitest-compatible coverage provider and measurement command before
enforcing it.

Pull requests changing game rules or state should include focused tests for
the new behaviour, rejected actions, and any relevant regression; bug fixes
should reproduce the bug in a test. Run the tests and build, and describe
manual checks or explain any justified test omission in the pull request.
UI display is primarily play-tested and is not included in the unit coverage
target. A higher-risk interaction is drag-and-drop: a future browser integration
test should drag a legal card or stack to a valid destination and verify both
the rendered positions and game state, then attempt an invalid drop and verify
the cards return unchanged. Exercise mouse and touch input and a resized
viewport to catch hit-area and coordinate regressions.

## How to Play

At startup a game-selection menu lets you choose **Klondike** or **Spider**.

### Klondike

- **Stock** (top-left): Click to draw a card to the waste pile. Click again when empty to recycle.
- **Waste**: Top card can be dragged to the tableau or foundations, or tapped to auto-send to a foundation.
- **Foundations** (top-right 4 slots): Build up each suit from Ace to King.
- **Tableau** (7 columns): Build down in alternating colours. Only Kings can start an empty column.
- **New Game** button: Start a fresh game at any time.

### Spider

- **Stock** (top-left): Click to deal one card to each of the 10 columns (5 deals available). All columns must be non-empty before dealing.
- **Tableau** (10 columns): Move any face-up card onto a column whose top card is one rank higher. Stacks of same-suit descending cards can be moved as a group.
- **Sequences**: When a King-through-Ace run of the same suit forms at the bottom of a column it is automatically removed. Remove all 8 sequences to win.
- **HUD**: The top bar shows completed sequences (0/8) and remaining stock deals.

## Architecture

### Shared modules

| File                        | Description                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `src/Card.ts`               | Card model — suit, rank, face-up state, label/symbol helpers                           |
| `src/Deck.ts`               | Deck creation and Fisher-Yates shuffle                                                 |
| `src/shared/cardSprites.ts` | Shared PixiJS card-rendering utilities: `CardDims`, `makeCardBack`, `makeCardFace`, `makeEmptySlot`, `CardView` |
| `src/types/themeTypes.ts`   | `ColorTheme` interface shared by all game renderers                                    |
| `src/themes/`               | Theme objects implementing `ColorTheme`                                                |

### Game-specific modules

| File                  | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `src/GameState.ts`    | Klondike game logic — move validation, state mutations, win check  |
| `src/KlondikeGame.ts` | Klondike PixiJS renderer and drag-and-drop interaction             |
| `src/SpiderState.ts`  | Spider game logic — move validation, stock deal, sequence removal  |
| `src/SpiderGame.ts`   | Spider PixiJS renderer and drag-and-drop interaction               |
| `src/main.ts`         | Application entry point + game-selection menu                      |

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

### SpiderGame.ts structure

`SpiderGame` follows the same architectural pattern as `KlondikeGame` and shares card-rendering utilities from `src/shared/cardSprites.ts`.

| Section | Methods | Description |
| ------- | ------- | ----------- |
| **Lifecycle** | `constructor`, `onResize`, `build`, `renderAll` | Same pattern as Klondike. |
| **Rendering** | `renderStock`, `renderTableau`, `renderHUD` | 10-column tableau, stacked stock visual, sequences/deals HUD. |
| **UI controls** | `buildNewGameButton`, `buildThemeButton`, `cycleTheme`, `newGame` | Same top-bar buttons. |
| **Drag & drop** | `startDrag`, `beginDrag`, `onDragMove`, `onDragEnd`, `tryDrop`, `dropOnTableau` | Same pipeline; respects same-suit stack rules. |
| **Win detection** | `checkWin`, `showWinScreen` | All 8 sequences removed. |

### Scaling

The canvas always fills the browser window because the PixiJS application is initialised with `resizeTo: window`. Whenever the window is resized the renderer fires a `resize` event which calls the active game's `onResize()`, triggering a full scene rebuild.

All layout values are derived from a single **scale factor**:

```
scale = currentViewportWidth / 750
```

The number `750` is the design reference width (`BASE_W`). Every `BASE_*` constant stores a pixel value at that reference width; each is multiplied by `scale` at render time.

This means:
- On a 1500 px wide screen, `scale = 2` and all cards are twice as large.
- On a 375 px wide screen (mobile), `scale = 0.5` and all cards are half size.
- Font sizes, icon sizes, button dimensions, and drop-zone hit areas all follow the same pattern.

No manual configuration is required — the game adapts automatically to any viewport size.
