import { Application } from 'pixi.js';
import { KlondikeGame } from './KlondikeGame';
import type { ColorTheme } from './types/themeTypes';
import { defaultTheme } from './themes/defaultTheme';

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

async function main(): Promise<void> {
  const themes = loadThemes();
  const app = new Application();

  await app.init({
    width: 750,
    height: 700,
    backgroundColor: themes[0].feltGreenBg,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl'
  });

  document.getElementById('app')!.appendChild(app.canvas);

  new KlondikeGame(app, themes);
}

main().catch(console.error);
