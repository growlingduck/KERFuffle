# Prompt 02 — Desktop App Shell and Design System

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompt 01 is done (`engine/` passes `npm test`).
> Prerequisite reading for the agent: `APPLICATION-VISION.md`, `docs/interaction-design.md`.

---

## Goal

Create the KERFuffle desktop app: a Tauri 2 window running a React + TypeScript
interface that imports the existing calculation engine. This prompt builds the
**shell and the design system only**: the window, navigation between four empty
screens, the drafting visual language, the shared components, motion, and the
keyboard-shortcut system. Later prompts fill in the screens.

Get the foundations right; every later screen is assembled from what you build
here.

## Context

- `engine/` is a standalone TypeScript package (`@kerfuffle/engine`): pure
  functions, integer 1/64″ `Ticks`, `parseDimension`, `formatDimension`,
  `calculateParts`, `validate`, rule presets. Do not change its behavior. You may
  add exports if the app needs them.
- `docs/interaction-design.md` is the behavior and visual spec. Sections 2
  (visual language and tokens), 3 (motion), 4 (shared components), 9 (keyboard)
  and 10 (accessibility) apply to this prompt.
- `docs/wireframes/*.dc.html` are interactive prototypes. Read their `<style>`
  blocks for exact tokens and component styling. They use a prototype format
  (`<x-dc>`, `{{holes}}`, `DCLogic`); don't copy that structure.

## Decisions already made

- **Tauri 2**, React 18+, TypeScript strict, Vite. Windows is the only target.
- **npm workspaces** at the repo root: `engine` and `app`. The app depends on
  `@kerfuffle/engine` through the workspace, not a copy.
- **No UI component library.** The look is custom; build the components here.
  Small headless helpers are fine if they earn their place (e.g. focus trapping);
  name each one in the summary.
- **Styling**: CSS modules or plain CSS with custom properties. Put all tokens
  in one `tokens.css` as CSS variables. No CSS-in-JS runtime.
- **Fonts**: IBM Plex Sans, IBM Plex Sans Condensed and IBM Plex Mono (SIL OFL),
  **bundled as local `woff2` files** with their licence. The app must not fetch
  anything from the network.
- **Routing**: four screens, Jobs, Workspace, Cut list and Settings. Hash
  routing is fine. Workspace and Cut list take a job id.
- **State**: a small store (Zustand or `useSyncExternalStore` with plain
  reducers). Keep domain state outside components so prompt 03 can attach
  persistence and prompt 05 can attach undo history.

## Deliverables

```
package.json                 # workspaces: ["engine", "app"]; root scripts: test, lint, dev
app/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    App.tsx                  # shell: header title block, tabs, routed outlet, toast host
    routes.tsx
    styles/
      tokens.css             # every token from interaction-design §2
      base.css               # grid-paper ground, typography, focus ring, reduced motion
      fonts/                 # Plex woff2 + OFL.txt
    components/
      Sheet.tsx              # panel with registration ticks
      ViewTitle.tsx          # bubble + caps title + mono sub-line
      TitleBlock.tsx         # ruled label/value grid
      Button.tsx, IconButton.tsx, SplitButton.tsx
      Segmented.tsx          # sliding thumb, aria-pressed
      Switch.tsx
      Stepper.tsx
      DimensionInput.tsx     # see below
      Stamp.tsx              # job status stamp
      Tooltip.tsx            # 400 ms intent delay, shows on focus
      Menu.tsx               # trigger + popover, roving focus, Esc/outside close
      Dialog.tsx             # modal with focus trap, Esc, restores focus
      Toast.tsx              # single toast, draining bar, one action, pauses on hover
      Kbd.tsx
      drawing/               # SVG primitives: DimensionLine, ChainDimension, Hatch defs,
                             # Balloon, Centerline, SectionMark (used by prompts 05–07)
    keyboard/
      shortcuts.ts           # registry: id, keys, scope, label; ignores keys while typing
      ShortcutsPopover.tsx
    screens/                 # Jobs, Workspace, CutList, Settings placeholders using the shell
    dev/
      Gallery.tsx            # every component in every state (dev-only route)
  src-tauri/                 # Tauri 2 project
  test/                      # Vitest + Testing Library + axe
```

### `DimensionInput`
This control is used everywhere, so build it fully here:
- Mono text input with a unit suffix and an optional symbol chip (W, H, D…).
- Parses with the engine's `parseDimension` only. Value in and out as `Ticks`.
- A fixed-height message line (no layout shift) with these states: focused hint
  (`Reads as 23 3/4″ · ↑↓ nudges 1/16″`), canonical read-back when the typed
  form differs, error (`⚠`, `aria-invalid`, `aria-describedby`), warning (`△`).
- ↑/↓ ±1/16″, Shift ±1″, exact to 1/64″. Enter commits, Esc reverts to the
  value it had when focused.
- Callbacks: `onLiveChange(ticks | null)` on every keystroke, `onCommit(ticks)`
  on blur or Enter only when the value changed. Prompt 05 relies on this split
  for undo and autosave.
- A `traced` prop for the blue "linked" ring (interaction-design §5.5).

### Drawing primitives
SVG components matching interaction-design §2: dimension line with 45° slash
ticks, extension lines with gaps and a label on a white box that moves beside
the line when the segment is too short; chain dimensions; section hatch and
light hatch `<pattern>` defs with unique ids per instance; balloon; centerline
with ℄; section-cut arrow. Each accepts `traced` and `faded` props and exposes
pointer and click handlers.

### Shell
- Header title block per the Workspace prototype: logo, tabs, then title-block
  cells (job, customer, status, saved state, undo/redo, shortcuts). The cells
  only appear on job screens. Use placeholder data for now.
- Window: minimum 1100 × 720, remembers its size and position, title
  "KERFuffle — {job name}".
- Global shortcuts from interaction-design §9 that make sense now: Ctrl+1…4
  and `?`. The registry must support scopes so later prompts can add theirs.

## Done when

- `npm install` at the root, then `npm run dev` opens the Tauri window with
  working navigation between the four screens, offline (check with the network
  disabled).
- `npm test` at the root runs the engine tests and the app tests, and both pass.
- The Gallery route shows every component in rest, hover (forced), focus,
  pressed, disabled, invalid and busy states, and passes an axe check with no
  serious or critical violations.
- `DimensionInput` has unit tests for parsing feedback, nudging, Enter/Esc, and
  for `onCommit` firing once per real change.
- Reduced motion is honored (test by toggling the media query).
- TypeScript strict, no `any`, ESLint clean.
- A short summary lists each dependency added and why, and anything in the spec
  you couldn't follow.

## Out of scope

Persistence, real job data, the screens' content, printing, installers.
