import { Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { defaultTheme } from '../themes/defaultTheme';
import { makeButton } from './buttons';

describe('makeButton', () => {
  it.each([
    { scale: 1, width: 90, fontSize: 13 },
    { scale: 0.5, width: 145, fontSize: 12 }
  ])('creates a scaled, interactive button at scale $scale', ({ scale, width, fontSize }) => {
    const onPress = vi.fn();
    const button = makeButton(defaultTheme, scale, 'Example', width, fontSize, onPress);
    const [background, label] = button.children as [Graphics, Text];
    const bounds = background.getLocalBounds();

    expect(bounds.maxX - bounds.minX).toBe(Math.round(width * scale) + 1);
    expect(bounds.maxY - bounds.minY).toBe(Math.round(28 * scale) + 1);
    expect(label.text).toBe('Example');
    expect(label.style.fontSize).toBe(Math.round(fontSize * scale));
    expect(label.style.fontWeight).toBe('bold');
    expect(label.anchor.x).toBe(0.5);
    expect(label.anchor.y).toBe(0.5);
    expect(label.position.x).toBe(Math.round(width * scale) / 2);
    expect(label.position.y).toBe(Math.round(28 * scale) / 2);
    expect(button.eventMode).toBe('static');
    expect(button.cursor).toBe('pointer');
    button.emit('pointerdown', {} as FederatedPointerEvent);
    expect(onPress).toHaveBeenCalledOnce();
  });
});
