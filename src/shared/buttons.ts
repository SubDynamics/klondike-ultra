import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { ColorTheme } from '../types/themeTypes';

/**
 * Creates a themed, scaled top-bar button.
 *
 * @param theme - Colours used for the button and label.
 * @param scale - Scale relative to the design viewport.
 * @param text - Button label.
 * @param width - Button width at the design scale.
 * @param fontSize - Label font size at the design scale.
 * @param onPress - Handler for pointer presses.
 * @returns The interactive button container.
 */
export function makeButton(
  theme: ColorTheme,
  scale: number,
  text: string,
  width: number,
  fontSize: number,
  onPress: () => void
): Container {
  const btnW = Math.round(width * scale);
  const btnH = Math.round(28 * scale);
  const btn = new Container();
  const bg = new Graphics();
  bg.roundRect(0, 0, btnW, btnH, Math.round(6 * scale))
    .fill({ color: theme.newGameButtonFill })
    .stroke({ color: theme.newGameButtonStroke, width: 1 });
  const label = new Text({
    text,
    style: new TextStyle({
      fontSize: Math.round(fontSize * scale),
      fill: theme.newGameButtonTextColor,
      fontWeight: 'bold'
    })
  });
  label.anchor.set(0.5);
  label.position.set(btnW / 2, btnH / 2);
  btn.addChild(bg, label);
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.on('pointerdown', onPress);
  return btn;
}
