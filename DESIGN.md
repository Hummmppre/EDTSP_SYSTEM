# EDTSP — Design Direction

A modern admin dashboard: light gray-blue ground, white cards with soft shadows,
one maroon action colour with a pink secondary. Data-forward, calm chrome, and a
fixed collapsible sidebar shell. This file is the short canonical version;
`ui-redesign-spec.md` keeps the earlier long-form rationale and is historical.

## Principles

1. **The record is the interface.** Numbers, statuses and dates carry the visual
   weight; chrome recedes into a quiet gray-blue.
2. **One action colour.** Maroon `#7c1d3d` marks the primary action per view, the
   active nav item, links and the featured KPI card. Pink is its supporting
   accent, never a second competing action colour.
3. **Pink is an accent, not a warning.** It is used for chart bars, focus rings,
   quiet highlights and the featured card's secondary detail.
4. **Type does the hierarchy.** Weight and size carry structure; borders stay
   hairline and shadows stay soft.
5. **Cards, not rules.** Groups are separated by white surfaces, 16px radii and
   a soft shadow, not by heavy borders or uppercase bands.
6. **Density where the work is.** Compact tables and lists; generous padding in
   page headers, KPI cards and empty states.
7. **Every state names its cause and its next action.**

## Typography

One family: **Archivo** (self-hosted variable, 400–700, `assets/fonts/`). No
third-party font request, no serif, no downloads. System monospace for IDs only.

| Role          | Size / line-height                | Weight | Tracking          |
| ------------- | --------------------------------- | ------ | ----------------- |
| Page title    | 26px / 1.15                       | 700    | -0.03em           |
| Display       | 30px / 1.1                        | 700    | -0.03em           |
| Section       | 17px / 1.3                        | 650    | -0.02em           |
| Body          | 14px / 1.45                       | 400    | 0                 |
| Small         | 13px / 1.4                        | 400    | 0                 |
| Micro label   | 11px / 1.2                        | 600    | 0.06em, uppercase |
| KPI figure    | `clamp(30px, 3vw, 38px)` / 1.05   | 700    | -0.04em           |
| Analytics figure | 24px / 1                       | 700    | -0.03em           |

Numerals in tables, ledgers, KPI cards and charts are `tabular-nums`. Uppercase
is confined to micro labels and table headers.

## Palette

| Token            | Value     | Use                                               |
| ---------------- | --------- | ------------------------------------------------- |
| `--bg`           | `#f3f5f9` | Page ground on every page                         |
| `--surface`      | `#ffffff` | Cards, tables, topbar, inputs                     |
| `--surface-2`    | `#f7f8fb` | Table headers, insets, tracks                     |
| `--surface-3`    | `#eef1f7` | Row and control hover                             |
| `--ink`          | `#1f2430` | Primary text                                      |
| `--ink-2`        | `#151a24` | Display text, dark brand panels                   |
| `--muted`        | `#6b7280` | Secondary text (≥4.5:1 on `--bg` and `--surface`) |
| `--muted-2`      | `#9aa1ad` | Tertiary text, never the only carrier of meaning  |
| `--line`         | `#e6e9f0` | Hairline borders                                  |
| `--line-2`       | `#d5dae4` | Focused inputs, table outer edge                  |
| `--accent`       | `#7c1d3d` | Primary button, active nav, links                 |
| `--accent-hover` | `#631630` | Hover state of the above                          |
| `--accent-soft`  | `#fbeef2` | Selected row, quiet badge ground                  |
| `--maroon-deep`  | `#5e1229` | Featured KPI card, chart bar depth                |
| `--pink`         | `#e58aa3` | Focus ring, chart bars, soft accents              |
| `--pink-strong`  | `#d95d80` | Hover/detail pink                                 |

Status colour is functional only: `--success` complete, `--warning` pending,
`--info` ongoing, `--danger` outstanding, each on its own soft wash. Status
colour never replaces the maroon action colour.

## Layout and surfaces

- 4px spacing scale. Page padding `28px 32px 48px`, `20px 18px 40px` below 900px.
  Content max 1440px in the portal, `min(1120px, 90%)` on public pages.
- Public header 56px sticky, solid `--surface`, hairline — no shadow. Hero is a
  two-column split above 1024px, one below.
- Auth: 1fr/1fr split, flat `--ink-2` brand panel, form column on `--bg`.
- Portal shell: 248px fixed sidebar, 64px solid topbar, `--bg` content. The
  desktop sidebar collapses to an 84px icon rail; below 1080px it becomes an
  off-canvas drawer with a scrim.
- Sidebar: brand mark, grouped vertical nav with outline icons, rounded active
  highlight in `--accent-soft` with maroon text, footer account block.
- Topbar: sidebar toggle, page title, global nav search, notification bell with
  dropdown, profile link, user menu.
- Cards: `--surface`, 1px `--line`, 16px radius, `--shadow-card`. Hover lifts to
  `--shadow-card-hover`. Overlay surfaces use `--shadow-overlay`.
- Radii: 8px tags/controls, 10px inputs, 16px cards, 20px large panels, pill for
  avatars and status chips. No gradients on content surfaces.
- KPI row: four cards; one featured card is solid maroon with white text. Each
  card carries a label, large figure, status pill, trend, timestamp and a faint
  decorative icon.
- Analytics panel: summary metrics above a combined chart. Pink rounded bars for
  monthly volume, a smooth gray line and soft area for the average score, dotted
  gridlines, month labels, centred legend.
- Tables: 36px header band on `--surface-2`, 40px rows, tabular numerals,
  monospace IDs, accent text-link row actions, no zebra striping.
- Motion: 180ms card and page entrance, 120ms modal, 240ms drawer, 90ms press
  feedback, all on `cubic-bezier(0.32, 0.72, 0, 1)`. Everything collapses under
  `prefers-reduced-motion`.
- Focus: 2px `--accent` outline plus a 4px pink ring, on every interactive
  element, never removed and never signalled by colour alone.

## Charts

Charts are drawn as inline SVG by `window.EDTSP.renderActivityChart` in
`frontend/js/portal.js`, using real API data only. Bars are monthly assessment
volume; the line/area is the monthly average score. The global
`svg { stroke: currentColor; fill: none; }` base rule means chart primitives must
set `stroke: none` explicitly. An empty or failed load shows a written state in
`#activityChartEmpty` rather than an empty panel.

## Illustration

No photography and no new image files. Public motifs are drawn in CSS: a
concentric "record" dial in the hero panel, numbered 01/02/03 markers on program
columns, and a 1px section rule with a 40px accent segment. Emoji and symbol
glyphs in markup are neutralised in CSS and redrawn (hamburger, program
markers); anything carrying meaning keeps adjacent text.

## Honesty

Pages whose figures are static keep a visible **Sample data** tag, restyled as a
neutral `--surface-2` chip and never removed. Values that come from the API are
not tagged. KPI trends and timestamps are computed from real records and load
time; invented people, feeds or metrics are never added.

## Anti-slop decisions

- Four identical stat cards are differentiated by one featured maroon card, not
  four competing colours.
- No gradient hero, no decorative card shadows on in-flow text blocks, no pill
  badges used as decoration.
- Emoji icons replaced by drawn outline SVG geometry, not an icon font.
- No serif display face, no uppercase everywhere, no centred marketing heading
  on a data page.
- Copy states the cause and the next action, in sentence case, with units on
  every number.
