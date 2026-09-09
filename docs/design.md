# Same Page design guidelines

## Settings controls

Use inline previous/next arrow selectors (`< value >`) for settings with a fixed set of choices. Do not use dropdowns for these settings. Apply this rule to future games and features as well as existing game setup screens.

Reuse `SettingStepper` from `components/pixel/setting-stepper.tsx`. Keep the current value visible between the arrows, wrap around at either end, label both arrow buttons for assistive technology, and announce value changes. Place related controls inside a disabled fieldset when editing is unavailable. Allow long player names to wrap without covering the arrows.

Custom numeric values, such as board dimensions, can use labeled number inputs with explicit bounds and an Apply action.

## Minesweeper setup

Display settings in this order:

1. Starting player: Player 1 (name), Player 2 (name), Random.
2. Board size: Small, Standard, Large, Wide, Custom.
3. Difficulty: Easy, Medium, Hard.

Show the resulting mine count, but do not expose mine-density percentages in difficulty labels. Safe opening is always enabled; there is no timer setting.

## Game typography

Use the installed Pixelify Sans font for game counters and board numbers. In Minesweeper this includes the mine count, safe-tile count, and adjacent-mine numbers. Preserve readable number colors, square tiles, pixel borders, and visible keyboard focus. Use an explicit pixel font family or a CSS variable defined at runtime; do not rely on a Tailwind inline theme variable being emitted as a runtime custom property.
