// Haptic feedback using the Vibration API (supported on Android Chrome, partial iOS Safari)
const canVibrate = () => typeof navigator !== 'undefined' && 'vibrate' in navigator;

export const haptics = {
  /** Short tap - for firing */
  light: () => { if (canVibrate()) navigator.vibrate(15); },
  /** Medium pulse - for collecting power-ups */
  medium: () => { if (canVibrate()) navigator.vibrate(40); },
  /** Strong buzz - for losing a life */
  heavy: () => { if (canVibrate()) navigator.vibrate([60, 30, 80]); },
  /** Double pulse - for game over */
  gameOver: () => { if (canVibrate()) navigator.vibrate([100, 50, 100, 50, 150]); },
};
