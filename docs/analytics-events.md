# Analytics Events

Google Analytics 4 property. Measurement ID loaded from `PUBLIC_GA_MEASUREMENT_ID` env var.
GA only loads in production (`mazepuzzles.io`, `www.mazepuzzles.io`). Blocked on localhost and `.netlify.app`.

## Recommended Key Events (mark as conversions in GA4)
- `maze_completed`
- `maze_generated`
- `maze_printed`
- `maze_downloaded`
- `share_result`

---

## Parameter Conventions

| Parameter | Type | Values |
|---|---|---|
| `maze_context` | string | `daily` \| `library` \| `generator` \| `printable` |
| `maze_difficulty` | string | `small` \| `medium` \| `large` \| `expert` \| `hardcore` \| `custom` |
| `maze_size` | string | `WxH` format, e.g. `60x60` |
| `maze_id` | string | Library maze ID, e.g. `small-001`. Absent for non-library mazes. |

---

## Events

### `maze_started`
Fires when a player begins a fresh play session (not a resume).

| Parameter | Example |
|---|---|
| `maze_context` | `daily` |
| `maze_size` | `60x60` |
| `maze_difficulty` | `large` |
| `maze_id` | `small-001` *(library only)* |

**Fires in:** `DailyMazePlayer` (Play button, Restart button), `LibraryMazePlayer` (Play Fresh button), `MazeGenerator` (Play button).

---

### `maze_completed`
Fires when the player reaches the exit.

| Parameter | Example |
|---|---|
| `maze_context` | `library` |
| `maze_size` | `20x20` |
| `maze_difficulty` | `small` |
| `maze_id` | `small-001` |
| `elapsed_ms` | `45230` |
| `elapsed_sec` | `45` |
| `steps` | `312` |
| `hints_used` | `0` |

**Fires in:** `DailyMazePlayer.handleSolve`, `LibraryMazePlayer.handleSolve`, `MazeGenerator.handleSolve`.

---

### `session_resumed`
Fires when a player resumes a previously saved in-progress session. Does NOT fire `maze_started`.

| Parameter | Example |
|---|---|
| `maze_context` | `daily` |
| `maze_size` | `60x60` |
| `maze_difficulty` | `large` |
| `maze_id` | *(absent for daily/generator)* |

**Fires in:** `DailyMazePlayer.handleResume`, `LibraryMazePlayer.handleResumeCTA`, `MazeGenerator.handleResume`.

---

### `maze_reset`
Fires when a player confirms reset mid-game.

| Parameter | Example |
|---|---|
| `maze_context` | `generator` |

**Fires in:** `FullscreenMazePlayer` reset confirm button.

---

### `hint_toggled`
Fires when hint is toggled on or off.

| Parameter | Example |
|---|---|
| `visible` | `true` |
| `maze_context` | `daily` |

**Fires in:** `FullscreenMazePlayer.handleHint`.

---

### `solution_toggled`
Fires when solution path visibility is toggled.

| Parameter | Example |
|---|---|
| `visible` | `true` |
| `maze_context` | `library` |

**Fires in:** `FullscreenMazePlayer` TOGGLE_SOLUTION dispatch points.

---

### `traveled_path_toggled`
Fires when trail visibility is toggled.

| Parameter | Example |
|---|---|
| `visible` | `true` |
| `maze_context` | `daily` |

**Fires in:** `FullscreenMazePlayer.toggleShowTrail`.

---

### `maze_generated`
Fires when the user explicitly clicks "Generate New Maze" in the Maze Generator or Printable Mazes. Does NOT fire on initial page load auto-generation.

| Parameter | Example |
|---|---|
| `maze_context` | `generator` |
| `maze_difficulty` | `medium` |
| `maze_size` | `40x40` |
| `width` | `40` |
| `height` | `40` |

**Fires in:** `MazeGenerator.handleGenerate`, `PrintableMazeGenerator.handleGenerate`.

---

### `maze_size_selected`
Fires when the user selects a size preset in the generator or printable page.

| Parameter | Example |
|---|---|
| `maze_context` | `generator` |
| `maze_difficulty` | `large` |

**Fires in:** `MazeGenerator.handleSizeChange`, `PrintableMazeGenerator.handleSizeChange`.

---

### `maze_printed`
Fires when the Print Maze button is clicked.

| Parameter | Example |
|---|---|
| `maze_context` | `printable` |
| `maze_difficulty` | `small` |
| `maze_size` | `20x20` |
| `source_page` | `/printable-mazes` |
| `include_answer_key` | `false` |

**Fires in:** `PrintableMazeGenerator.handlePrint`, `MazeGenerator.handlePrint`.

---

### `maze_downloaded`
Fires when the Download Maze SVG button is clicked.

| Parameter | Example |
|---|---|
| `maze_context` | `generator` |
| `maze_difficulty` | `medium` |
| `maze_size` | `40x40` |
| `source_page` | `/maze-generator` |
| `file_type` | `svg` |

**Fires in:** `PrintableMazeGenerator.handleDownloadSVG`, `MazeGenerator.handleDownloadSVG`.

---

### `printable_answer_key_toggled`
Fires when the Include Answer Key checkbox is toggled on the printable page.

| Parameter | Example |
|---|---|
| `visible` | `true` |

**Fires in:** `PrintableMazeGenerator` answer key checkbox onChange.

---

### `cta_clicked`
Fires when a key call-to-action link/button is clicked on the homepage.

| Parameter | Example |
|---|---|
| `cta_id` | `product_daily` |
| `source_page` | `/` |
| `destination` | `/maze-of-the-day` |

**CTA IDs:**
- `product_daily` — product grid "Play today →"
- `product_library` — product grid "Browse library →"
- `product_generator` — product grid "Generate a maze →"
- `product_printable` — product grid "Print mazes →"
- `bottom_cta_daily` — bottom section "Play Today's Maze"
- `bottom_cta_library` — bottom section "Maze Library"
- `bottom_cta_generator` — bottom section "Maze Generator"
- `sticky_mobile_play_now` — mobile sticky bar "Play Now"

**Fires in:** `index.astro` CTA links.

---

### `library_collection_viewed`
Fires once per page visit when a library collection page is loaded. Uses `sessionStorage` to prevent duplicate fires on re-renders.

| Parameter | Example |
|---|---|
| `difficulty` | `small` |

**Fires in:** `maze-library.astro` and collection pages (`small-mazes.astro`, etc.) via inline script.

---

### `library_play_next_clicked`
Fires when the user navigates to the next maze in a library collection via the prev/next arrows.

| Parameter | Example |
|---|---|
| `from_maze_id` | `small-001` |
| `to_maze_id` | `small-002` |
| `difficulty` | `small` |

**Fires in:** `LibraryMazePlayer` adjacent maze navigation links.

---

### `post_solve_action_clicked`
Fires when the user taps an action button on the post-solve overlay.

| Parameter | Example |
|---|---|
| `action` | `next_maze` |
| `maze_context` | `library` |

**Action values:** `share` · `next_maze` · `play_again` · `browse_collection` · `create_maze` · `new_maze`

**Fires in:** `PostSolveOverlay` action buttons.

---

### `share_result`
Fires when the player successfully shares or copies their result.

| Parameter | Example |
|---|---|
| `maze_context` | `daily` |
| `method` | `native_share` \| `copy_link` |

**Fires in:** `PostSolveOverlay.ShareButton.handleShare`.

---

### `daily_streak_milestone`
Fires after a daily maze is completed and the current streak is ≥ 3.

| Parameter | Example |
|---|---|
| `current_streak` | `7` |
| `longest_streak` | `7` |

**Fires in:** `DailyMazePlayer.handleSolve`.

---

## Deferred Events

### `maze_abandoned`
Intended to fire when a player exits mid-game without completing. Deferred due to false-positive risk:
- The `onClose` callback fires in multiple scenarios (post-solve, normal navigation, explicit exit).
- Reliable detection requires threading extra state to distinguish an in-progress exit from a post-solve close.

**Planned location:** `DailyMazePlayer.handleClose`, `LibraryMazePlayer.handleClose`, `MazeGenerator` inline `onClose`.
