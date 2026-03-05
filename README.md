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
| `src/KlondikeGame.ts` | PixiJS renderer and drag-and-drop interaction                    |
| `src/main.ts`         | Application entry point                                          |
