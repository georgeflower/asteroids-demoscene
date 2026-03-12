

# Rename "Home Page" → "Main Menu" and Return to In-Game Menu

## Change

In `src/pages/Game.tsx` around line 3903-3908, the button currently says "home page" and navigates to `"/"` (the Index splash page). Instead:

1. Rename the label from `home page` to `main menu`
2. Change the `onClick` handler from `navigate("/")` to reset game state and call `setGameMode("menu")` — matching the same pattern used elsewhere (e.g., lines 2943-2947): clear `gameStateRef`, `duelStateRef`, reset `showGameOver`, `showLifeLost`, disconnect multiplayer if needed, and set game mode to `"menu"`

This returns the player to the in-game menu where they choose Solo, Duel, or Online.

