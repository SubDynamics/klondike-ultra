# Repository instructions

Use this file as the shared source of project guidance. Keep tool-specific
instruction files as short entrypoints that refer back here.

## Project overview

- This is a browser-based solitaire collection built with Vite, TypeScript, and
  PixiJS. Read `README.md` for current gameplay and architecture details.
- `src/Card.ts` and `src/Deck.ts` contain shared card and deck logic.
- `src/KlondikeState.ts` and `src/SpiderState.ts` contain game state and rules;
  `src/KlondikeGame.ts` and `src/SpiderGame.ts` render the games and handle
  interaction.
- Shared rendering utilities live in `src/shared/cardSprites.ts`, theme
  definitions in `src/themes/`, and shared theme types in `src/types/`.
- `src/main.ts` initializes PixiJS, loads themes, and selects the game.

## Development conventions

- Keep changes focused and follow the existing TypeScript structure and naming.
  Separate game rules/state from PixiJS rendering and interaction.
- Use the existing formatting style: two-space indentation, semicolons, single
  quotes, and no trailing commas.
- TypeScript is configured in strict mode. Preserve type safety and avoid
  introducing unused locals or parameters.
- Update `README.md` when a change affects documented gameplay, setup, or
  architecture.

## Validation

- Install dependencies with `npm ci` when needed.
- Run `npm run lint` to lint the TypeScript source.
- Run `npm run build` to type-check and build the application.
- Run `npm test` for the Vitest unit tests.
- `npm run dev` starts the local development server; `npm run preview` serves a
  production build.
- Validate focused changes with lint, build and test commands and manual checks
  as appropriate.
