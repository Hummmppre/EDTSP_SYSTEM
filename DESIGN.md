# EDTSP — Design Direction

Neutral modern software, not a farm brochure. One palette, one type family, one
action colour, compact data density, quiet chrome. The full rationale, inventory
and per-component rules live in `ui-redesign-spec.md`; this file is the short
version a new contributor reads first.

## Principles

1. **The record is the interface.** Numbers, statuses and dates carry the visual
   weight; rules, headers and navigation recede.
2. **One action colour.** Forest green marks the single primary action per view,
   the active nav item, and links. Nothing else is green.
3. **Gold is not decoration.** It survives as the focus ring and one attention
   marker per page.
4. **Type does the hierarchy.** Weight and size, not boxes, borders or uppercase
   everywhere.
5. **Density where the work is.** Compact tables and lists; room to breathe in
   page headers, forms and empty states.
6. **Quiet edges.** Hairlines, 3–6px radii, no shadows on in-flow surfaces, no
   gradients, no glass, no texture, no emoji.
7. **Every state names its cause and its next action.**

## Typography

One family: **Archivo** (self-hosted variable, 400–700, `assets/fonts/`). No
third-party font request, no serif, no downloads. System monospace for IDs only.

| Role                    | Size / line-height                | Weight | Tracking          |
| ----------------------- | --------------------------------- | ------ | ----------------- |
| Display                 | 28px / 1.15                       | 600    | -0.02em           |
| Display L (public hero) | `clamp(32px, 4vw, 44px)` / 1.1    | 600    | -0.03em           |
| Section                 | 18px / 1.3                        | 600    | -0.01em           |
| Section L (public)      | `clamp(22px, 2.4vw, 28px)` / 1.25 | 600    | -0.02em           |
| Body                    | 14px / 1.45                       | 400    | 0                 |
| Small                   | 13px / 1.4                        | 400    | 0                 |
| Micro label             | 11px / 1.2                        | 600    | 0.06em, uppercase |
| Figure                  | 22px / 1.1                        | 600    | -0.01em           |
| Figure L                | 28px / 1                          | 600    | -0.02em           |

Numerals in tables, ledgers, meters and figures are `tabular-nums`. Uppercase is
confined to micro labels, table headers and the public eyebrow.

## Palette

| Token            | Value     | Use                                               |
| ---------------- | --------- | ------------------------------------------------- |
| `--bg`           | `#f8f7f0` | Page ground on every page                         |
| `--surface`      | `#ffffff` | Panels, tables, topbar, inputs                    |
| `--surface-2`    | `#f1f2ec` | Table headers, insets, tracks                     |
| `--surface-3`    | `#e9ece3` | Row and control hover                             |
| `--ink`          | `#27352a` | Primary text                                      |
| `--ink-2`        | `#1c3022` | Display text, sidebar and auth brand ground       |
| `--muted`        | `#69756b` | Secondary text (≥4.5:1 on `--bg` and `--surface`) |
| `--muted-2`      | `#8b948a` | Tertiary text, never the only carrier of meaning  |
| `--line`         | `#e2e6df` | Hairline borders                                  |
| `--line-2`       | `#cfd5cb` | Focused inputs, table outer edge                  |
| `--accent`       | `#315c3b` | Primary button, active nav, links                 |
| `--accent-hover` | `#21452b` | Hover state of the above                          |
| `--accent-soft`  | `#eff2eb` | Selected row, quiet badge ground                  |
| `--gold`         | `#d6a85f` | Focus ring and the one attention marker           |

Status colour is functional only: `--success` complete, `--warning` pending,
`--info` ongoing, `--danger` outstanding, each on its own soft wash.

## Layout and surfaces

- 4px spacing scale. Page padding `28px 32px 48px`, `20px 18px 40px` below 900px.
  Content max 1320px in the portal, `min(1120px, 90%)` on public pages.
- Public header 56px sticky, solid `--surface`, hairline — no shadow. Hero
  `72px` vertical padding, two columns above 1024px, one below.
- Auth: 1fr/1fr split, flat `--ink-2` brand panel, 420px form column sitting
  directly on `--bg` — the page ground is the card.
- Portal shell: 240px `--ink-2` sidebar, 56px solid topbar, `--bg` content.
- Panels: `--surface`, 1px `--line`, 6px radius, no shadow. Shadow is reserved
  for modal, drawer and toast (`--shadow-overlay`).
- Radii: 3px tags, 4px controls, 6px surfaces, 8px dialogs, pill only for
  avatars. No gradients, no `backdrop-filter`, no decorative `box-shadow`.
- Tables: 32px uppercase header band on `--surface-2`, 34px rows, tabular
  numerals, monospace IDs, accent text-link row actions, no zebra striping.
- Motion: 180ms page entrance, 120ms modal, 240ms drawer, 90ms press feedback.
  All of it collapses under `prefers-reduced-motion`.
- Focus: 2px `--gold` outline plus a 3px ring, on every interactive element,
  never removed and never signalled by colour alone.

## Illustration

No photography and no new image files. Public motifs are drawn in CSS: a
concentric "record" dial in the hero panel, numbered 01/02/03 markers on program
columns, and a 1px section rule with a 40px accent segment. Emoji and symbol
glyphs in markup are neutralised in CSS and redrawn (hamburger, program
markers); anything carrying meaning keeps adjacent text.

## Honesty

Pages whose figures are static keep a visible **Sample data** tag, restyled as a
neutral `--surface-2` chip and never removed. Values that come from the API are
not tagged. Invented people, feeds or metrics are never added.

## Anti-slop decisions

- Four identical stat cards replaced by one ledger with a single focus figure.
- Gradient hero, gradient brand panel, decorative card shadows and pill badges
  removed.
- Emoji icons replaced by drawn geometry, not an icon font.
- No serif display face, no uppercase everywhere, no centred marketing heading
  on a data page.
- Copy states the cause and the next action, in sentence case, with units on
  every number.
