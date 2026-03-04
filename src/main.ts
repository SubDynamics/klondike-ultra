import { Application } from 'pixi.js';
import { KlondikeGame } from './KlondikeGame';

async function main(): Promise<void> {
  const app = new Application();

  await app.init({
    width: 750,
    height: 700,
    backgroundColor: 0x276221,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
  });

  document.getElementById('app')!.appendChild(app.canvas);

  new KlondikeGame(app);
}

main().catch(console.error);
