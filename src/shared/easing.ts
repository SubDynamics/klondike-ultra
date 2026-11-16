const TWO = 2;
const HALF = 0.5;

/** Names of the supported easing curves. */
export type EasingName = 'quadraticIn' | 'quadraticOut' | 'quadraticInOut'
  | 'sineIn' | 'sineOut' | 'sineInOut';

/**
 * Returns an easing curve value for normalized progress between 0 and 1.
 *
 * @param name - The easing curve to use.
 * @param progress - Normalized animation progress.
 * @returns The eased progress.
 */
export function easingValue(name: EasingName, progress: number): number {
  switch (name) {
    case 'quadraticIn': return progress * progress;
    case 'quadraticOut': return 1 - (1 - progress) * (1 - progress);
    case 'quadraticInOut':
      return progress < HALF
        ? TWO * progress * progress
        : 1 - ((-TWO * progress + TWO) ** TWO) / TWO;
    case 'sineIn': return 1 - Math.cos((progress * Math.PI) / TWO);
    case 'sineOut': return Math.sin((progress * Math.PI) / TWO);
    case 'sineInOut': return -(Math.cos(Math.PI * progress) - 1) / TWO;
  }
}
