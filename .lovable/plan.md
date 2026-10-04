# Persistent radio and menu fixes

## Changes
- Replace the two mounted audio tags with one lazily-created `HTMLAudioElement` owned by `Game`, and attach its play, pause, and error listeners once.
- Keep existing autoplay, manual pause, persistence, and now-playing behavior while making the mini-player read the audio element’s actual paused state when clicked.
- Initialize fine-pointer capability synchronously and subscribe to pointer capability changes, preventing a DUEL flash on touch-only devices.
- Let Enter activate focused menu controls normally while preserving Enter-to-launch for unfocused menu navigation.

## Verification
- Exercise menu → game → menu playback continuity and manual pause/resume.
- Check AUTO on/off behavior, phone DUEL visibility, focused Enter handling, one audio object, console output, and the production build.
