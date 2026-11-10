# EDTSP Portal — Design Direction

## Identity: the working farm ledger

The student and administrator portals are the farm's record book, not a generic
dashboard. Everything is built from that idea: warm paper, deep pasture ink, a
single hay-gold signal, hairline rules instead of floating cards, and large
editorial titles over dense, legible records.

- **Feeling:** calm, precise, agricultural. Confident rather than decorative.
- **Strongest motif:** the ledger strip — one bordered record surface split by
  hairlines, with the metric that needs attention printed as a dark block.
- **No motif borrowed from defaults:** no gradients, no glass cards, no emoji
  icons, no glow, no soft-shadow-everywhere, no background grid.

## Typography

Self-hosted variable fonts in `frontend/assets/fonts/` (no third-party request).

| Role | Face | Reason |
| --- | --- | --- |
| Display (page titles, figures) | **Fraunces** 400–700 | Warm, editorial, dairy-heritage character; made for large sizes. Tracking tightens as it grows (`-0.025em`). |
| Interface and data | **Archivo** 400–700 | Sturdy grotesque with excellent small-size legibility and tabular figures; reads like a record sheet, not a marketing site. |
| Identifiers and references | system monospace | IDs (`COW-001`, `EDT-PAY-001`) read as ledger entries and stay aligned. |

Body text is 15px/1.55. Labels are 10–11px uppercase with `0.08em` tracking.
Numbers in tables and ledgers are tabular.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#F2EDE1` | Page ground |
| `--paper-2` | `#EAE3D3` | Insets, progress tracks |
| `--surface` | `#FFFDF7` | Panels and records |
| `--ink` | `#161C14` | Text, focused ledger block |
| `--muted` | `#69715F` | Secondary text (≥4.5:1 on paper) |
| `--line` | `#D9D1BE` | Hairline rules |
| `--field` | `#235231` | Structure, primary action, progress |
| `--field-2` | `#173A22` | Sidebar |
| `--hay` | `#E7B23F` | The single accent: active marker, dark-block figure, focus ring |

Status colours are functional only, never decorative: moss (`#2C6B3F`) for
complete/verified, amber (`#7A5310`) for pending/observation, sky (`#2E566F`)
for ongoing, clay (`#9C3D25`) for outstanding/treatment.

Accent discipline: hay appears on the active navigation marker, the one
attention metric in each ledger, and focus rings. Nothing else.

## Layout and surface rules

- Fixed 272px sidebar on pasture ink; sticky glass topbar (the only translucent
  surface) with content scrolling beneath it.
- Page header: serif title, one-sentence deck, hairline base. No eyebrow pill
  above the headline.
- Ledger strip directly under the header: four metrics, hairline dividers, one
  dark focus cell per page.
- Panels: solid milk surface, 1px rule, 6px radius, **no shadow**. Shadow is
  reserved for overlays (modal, off-canvas drawer).
- Radii: 3px tags, 4px controls, 6px panels, 8px dialogs. No pill-shaped
  buttons or cards.
- Tables: uppercase hairline headers, tabular numerals, monospace IDs, quiet
  text-link row actions.
- Motion is purposeful: press feedback at 90ms, drawer 420ms, page header and
  ledger rise once on arrival, meters draw in. Modal opens with a short
  scale/fade. All of it collapses under `prefers-reduced-motion`.
- Every state (loading, empty, error, filtered-to-nothing) names the cause and
  the next action.

## Honesty

The demo dataset is labelled with a visible **Demo data** tag on pages whose
figures are static. Values that come from the API (trainee profile, assessment
records) are not tagged. Invented people, feeds or metrics are never added.

## Anti-slop decisions

- Emoji and symbol glyphs replaced with one hand-drawn 1.6px SVG set.
- Four identical stat cards replaced by a single ledger with hierarchy.
- Gradient welcome banners, soft shadows on every card, and pill badges removed.
- Decorative "View all" links that pointed to their own section removed or
  pointed at the real page.
- Controls with no behavior (Add trainee, Edit profile) are not shipped.
