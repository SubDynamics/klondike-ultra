import { describe, expect, it } from 'vitest';
import { easingValue, type EasingName } from './easing';

describe('easingValue', () => {
  const names: EasingName[] = [
    'quadraticIn', 'quadraticOut', 'quadraticInOut',
    'sineIn', 'sineOut', 'sineInOut'
  ];

  it.each(names)('%s starts at zero and ends at one', (name) => {
    expect(easingValue(name, 0)).toBeCloseTo(0);
    expect(easingValue(name, 1)).toBeCloseTo(1);
  });

  it('uses the expected quadratic and sine curves', () => {
    expect(easingValue('quadraticIn', 0.25)).toBeCloseTo(0.0625);
    expect(easingValue('quadraticOut', 0.25)).toBeCloseTo(0.4375);
    expect(easingValue('quadraticInOut', 0.75)).toBeCloseTo(0.875);
    expect(easingValue('sineIn', 0.5)).toBeCloseTo(1 - Math.SQRT1_2);
    expect(easingValue('sineOut', 0.5)).toBeCloseTo(Math.SQRT1_2);
    expect(easingValue('sineInOut', 0.5)).toBeCloseTo(0.5);
  });
});
