import { Application, Assets, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { KlondikeGame } from './KlondikeGame';
import { SpiderGame } from './SpiderGame';
import type { ColorTheme } from './types/themeTypes';
import { defaultTheme } from './themes/defaultTheme';
import spadeIcon from './assets/icons/spade.png';
import heartIcon from './assets/icons/heart.png';
import diamondIcon from './assets/icons/diamond.png';
import clubIcon from './assets/icons/club.png';

function isColorTheme(value: unknown): value is ColorTheme {
  if (!value || typeof value !== 'object') return false;
  const theme = value as Partial<ColorTheme>;
  return (
    typeof theme.name === 'string' &&
    typeof theme.feltGreenBg === 'string' &&
    typeof theme.playingCardsBackground === 'string'
  );
}

function loadThemes(): ColorTheme[] {
  const themeModules = import.meta.glob('./themes/*.ts', { eager: true });
  const themes: ColorTheme[] = [];

  for (const mod of Object.values(themeModules)) {
    if (!mod || typeof mod !== 'object') continue;
    for (const exported of Object.values(mod as Record<string, unknown>)) {
      if (isColorTheme(exported)) {
        themes.push(exported);
      }
    }
  }

  return themes.length > 0 ? themes : [defaultTheme];
}

/**
 * Displays a full-screen PixiJS game-selection menu that lets the player
 * choose between Klondike Solitaire and Spider Solitaire.
 * Resolves with `'klondike'` or `'spider'` when the player makes a choice.
 *
 * @param app    - The initialised PixiJS Application.
 * @param themes - Array of loaded colour themes; the first theme styles the menu.
 * @returns      A promise resolving to the chosen game identifier.
 */
function showGameMenu(
  app: Application,
  themes: ColorTheme[]
): Promise<'klondike' | 'spider'> {
  return new Promise((resolve) => {
    const theme = themes[0] ?? defaultTheme;
    const W = app.screen.width;
    const H = app.screen.height;

    // Background
    const overlay = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, W, H).fill({ color: theme.feltGreenBg });
    overlay.addChild(bg);

    // Title
    const titleStyle = new TextStyle({
      fontSize: Math.round(Math.min(W, H) * 0.065),
      fill: theme.lightTextColor,
      fontWeight: 'bold',
      fontFamily: 'BioRhymeExpanded-ExtraBold'
    });
    const title = new Text({ text: 'Solitaire Ultra', style: titleStyle });
    title.anchor.set(0.5, 0);
    title.x = W / 2;
    title.y = H * 0.12;
    overlay.addChild(title);

    // Subtitle
    const subStyle = new TextStyle({
      fontSize: Math.round(Math.min(W, H) * 0.03),
      fill: theme.emptySlotTextColor
    });
    const subtitle = new Text({ text: 'Choose a game to play', style: subStyle });
    subtitle.anchor.set(0.5, 0);
    subtitle.x = W / 2;
    subtitle.y = title.y + title.height + H * 0.02;
    overlay.addChild(subtitle);

    const btnW = Math.round(Math.min(W * 0.38, 240));
    const btnH = Math.round(btnW * 0.38);
    const gap = Math.round(W * 0.05);
    const totalBtnsW = btnW * 2 + gap;
    const btnY = H * 0.42;

    /**
     * Creates a styled game-choice button.
     *
     * @param label    - Primary button label (game name).
     * @param sublabel - Descriptive subtitle shown below the label.
     * @param x        - Left edge X position of the button.
     */
    function makeButton(label: string, sublabel: string, x: number): Container {
      const btn = new Container();
      const btnBg = new Graphics();
      btnBg
        .roundRect(0, 0, btnW, btnH, Math.round(btnH * 0.12))
        .fill({ color: theme.newGameButtonFill })
        .stroke({ color: theme.newGameButtonStroke, width: 2 });
      btn.addChild(btnBg);

      const labelStyle = new TextStyle({
        fontSize: Math.round(btnH * 0.3),
        fill: theme.newGameButtonTextColor,
        fontWeight: 'bold',
        fontFamily: 'BioRhymeExpanded-ExtraBold'
      });
      const labelText = new Text({ text: label, style: labelStyle });
      labelText.anchor.set(0.5, 0.5);
      labelText.x = btnW / 2;
      labelText.y = btnH * 0.38;
      btn.addChild(labelText);

      const subLabelStyle = new TextStyle({
        fontSize: Math.round(btnH * 0.17),
        fill: theme.emptySlotTextColor
      });
      const subText = new Text({ text: sublabel, style: subLabelStyle });
      subText.anchor.set(0.5, 0.5);
      subText.x = btnW / 2;
      subText.y = btnH * 0.7;
      btn.addChild(subText);

      btn.x = x;
      btn.y = btnY;
      btn.eventMode = 'static';
      btn.cursor = 'pointer';
      return btn;
    }

    const klondikeBtn = makeButton(
      'Klondike',
      '7 columns · 1 deck',
      W / 2 - totalBtnsW / 2
    );
    klondikeBtn.on('pointerdown', () => {
      app.stage.removeChildren();
      resolve('klondike');
    });
    overlay.addChild(klondikeBtn);

    const spiderBtn = makeButton(
      'Spider',
      '10 columns · 2 decks',
      W / 2 - totalBtnsW / 2 + btnW + gap
    );
    spiderBtn.on('pointerdown', () => {
      app.stage.removeChildren();
      resolve('spider');
    });
    overlay.addChild(spiderBtn);

    app.stage.addChild(overlay);
  });
}

async function main(): Promise<void> {
  // Register suit icons with Pixi's Assets system
  await Assets.load([
    { alias: 'suit-spade', src: spadeIcon },
    { alias: 'suit-heart', src: heartIcon },
    { alias: 'suit-diamond', src: diamondIcon },
    { alias: 'suit-club', src: clubIcon }
  ]);

  const themes = loadThemes();
  const app = new Application();

  await app.init({
    resizeTo: window,
    backgroundColor: themes[0].feltGreenBg,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl'
  });

  document.getElementById('app')!.appendChild(app.canvas);

  const choice = await showGameMenu(app, themes);

  const game =
    choice === 'spider'
      ? new SpiderGame(app, themes)
      : new KlondikeGame(app, themes);

  app.renderer.on('resize', () => game.onResize());
}

main().catch(console.error);
