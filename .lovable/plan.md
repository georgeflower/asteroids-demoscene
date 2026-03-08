

## Plan: Add Pause Menu (Escape / Gamepad Start Button)

### What to build
A pause menu overlay that appears when pressing **Escape** (keyboard) or **Start button** (gamepad button 9) during solo or duel gameplay. The game loop freezes, a semi-transparent overlay shows "PAUSED" with options to Resume or Quit to Menu, navigable by keyboard and gamepad.

### Changes (all in `src/pages/Game.tsx`)

1. **New state**: Add `const [isPaused, setIsPaused] = useState(false)` and a `isPausedRef` to track pause status. Add `pauseSelection` state (0=Resume, 1=Quit) for menu navigation.

2. **Toggle pause on Escape key**: In `handleKeyDown`, when `gameMode` is `"solo"` or `"duel"` and not in game-over/life-lost state, pressing `Escape` toggles `isPaused`/`isPausedRef`. When paused, arrow keys navigate the pause menu, Enter/Space confirms selection.

3. **Toggle pause on Gamepad Start button (button 9)**: In the gamepad polling `useEffect`, detect "just pressed" on button 9. Toggle pause. When paused, d-pad/stick navigates pause menu options, A button confirms.

4. **Freeze game loop**: At the top of `update()` and `updateDuel()`, add early return if `isPausedRef.current` is true. This stops all game logic while paused. The draw function still runs to show the frozen frame.

5. **Pause overlay UI**: Render a semi-transparent overlay on top of the canvas when `isPaused` is true, showing:
   - "PAUSED" title
   - "▸ RESUME" / "QUIT TO MENU" options with selection highlight
   - Controls hint: "ESC or START to resume"

6. **Resume/Quit actions**: Resume unpauses. Quit clears game state and returns to menu (reuse existing `quitToMenu` logic).

