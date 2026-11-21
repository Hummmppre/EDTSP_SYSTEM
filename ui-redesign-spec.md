# UI Redesign — Full Visual Replacement Spec

> **Status: superseded in part.** The palette, shell and dashboard components
> were revised after this spec was written. The shipped direction is a light
> gray-blue ground with a maroon/pink accent, a fixed collapsible sidebar, soft
> shadow cards and a combined analytics chart. `DESIGN.md` is now the canonical
> reference; the token table in §5.1 below has been updated to match, while the
> rest of this document remains the historical rationale and inventory.

**Status:** Draft for approval
**Requested:** "redesign the UI"
**Scope agreed in interview:** All 19 production pages get a new visual direction — modern software rather than farm-themed, light only, sans-only typography, compact and scannable. Implemented as a **restyle of the three existing stylesheets**: no markup restructuring, no JS changes, no backend changes. Palette is carried over from the current public pages. Ships in three phases: public → admin → trainee.

---

## 1. Problem statement

Two problems were named in the interview, and the redesign is judged against them:

1. **Dated typography and spacing.** The public pages are set in Arial with loose leading, 14px copy at 20px gutters, 7px radii, 110px hero padding, and 34px section headings. The portal is set in Fraunces + Archivo at 15px/1.55 with 6px panel radii and 30–40px of panel padding. Neither is a modern software type system.
2. **The portals are dense and hard to scan.** The portal pages carry a sidebar, a breadcrumb topbar, a serif page header, a four-cell ledger, and two or three panels each — but the hierarchy is carried by heavy rules, uppercase micro-labels, and large section padding, so the eye has to work to find the primary number, the active record, and the next action.

The existing direction ("working farm ledger", documented in `DESIGN.md`) is **replaced**, not refined. The new direction is a modern admin dashboard: cool gray-blue structure, one maroon action colour with a pink accent, strong numeric hierarchy, soft card surfaces and quiet chrome.

---

## 2. Decisions locked in the interview

| Topic | Decision |
| --- | --- |
| Scope | Public pages **and** admin/trainee portals. All 19 production pages. |
| Existing direction | **Replace** the "working farm ledger" direction. `DESIGN.md` is rewritten to document the new one. |
| Anchor | Modern software, not farm-themed. Clean, data-forward, quiet chrome. |
| References | The named product family in §4.4 (Linear, Stripe, Vercel, GitHub Primer, Mercury, Attio, Ashby, Sentry, plus GOV.UK for form behaviour). Patterns only — no copied assets, fonts, icons, or dependencies. |
| Colour mode | **Light only.** No dark theme, no `prefers-color-scheme` branch. |
| Palette | **One maroon/pink system everywhere** (`#7c1d3d` primary, `#e58aa3` pink accent, `#f3f5f9` background, `#1f2430` text). All three stylesheets share the same token values. |
| Typography | **Sans-only system.** Fraunces is dropped; Archivo carries both display and UI. |
| Density | **Compact and scannable.** More rows per screen, tighter leading, smaller base size, clearer grouping. |
| Markup freedom | **Restyle only.** No renaming, moving, or removing elements/classes/ids that the JS reads. |
| CSS organisation | **Keep three files, restyled**: `portal.css`, `style.css`, `auth.css`. |
| Imagery | **Abstract graphics** drawn in CSS/SVG. No photography, no new image assets. |
| Brand mark | **Keep the existing mark** — the `E` badge on public pages, the house SVG + "Esperon / Dairy training" wordmark in the portal. Colour, size, and spacing may change. |
| Copy | **May be rewritten.** Headlines, decks, helper text, empty states. |
| Sequencing | Phase 1 public → Phase 2 admin → Phase 3 trainee. |
| Review | Desktop 1440px **and** mobile 390px screenshots of every page before sign-off. |

---

## 3. Inventory (verified)

### 3.1 Pages and stylesheets

| Surface | Count | Files | Stylesheet |
| --- | --- | --- | --- |
| Public | 5 | `index.html`, `login.html`, `signup.html`, `forgot-password.html`, `reset-password.html` | `css/style.css` (landing), `css/auth.css` (auth) |
| Admin portal | 8 | `dashboard`, `trainees`, `applications`, `programs`, `assessments`, `payments`, `cow-maintenance`, `settings` | `css/portal.css` |
| Trainee portal | 6 | `dashboard`, `assessments`, `payments`, `cow-maintenance`, `apply`, `profile` | `css/portal.css` |
| Scratch | 2 | `_gsi-test.html`, `_gsi-test2.html` | inline — **out of scope** |

**Totals:** 19 production pages, 3 production stylesheets, 21 HTML files.

### 3.2 Dead stylesheets

- `frontend/css/landing.css` — 0 lines, referenced by nothing.
- `frontend/css/responsive.css` — 0 lines, referenced by nothing.

Both are deleted as part of Phase 1. They are not referenced in any HTML file, so deletion is safe.

### 3.3 Fonts

`frontend/assets/fonts/` holds exactly two files: `archivo-latin-var.woff2` (weights 400–700, variable) and `fraunces-latin-var.woff2`. There are no licence files. After this change Fraunces is unused; its `@font-face` block is removed and the `.woff2` is deleted. Archivo stays as the single family, self-hosted as today — **no fonts are downloaded**, and no third-party font request is introduced.

### 3.4 Assets

`frontend/assets/icons/` and `frontend/assets/image/` are both empty. There is no existing icon sprite, logo file, or photography. All portal icons are inline SVG (1.6px stroke, `fill: none`, inherited `currentColor`); all public-page icons are emoji or symbol characters in markup.

### 3.5 Existing portal component inventory (`portal.css`, 2544 lines)

Sections present today, in file order — every one is in the restyle scope:

`Fonts` · `Tokens` · `Base` · `Shell` · `Page` · `Ledger` · `Layout grids` · `Panel` · `Meters / progress` · `Figures` · `Facts` · `Identity blocks` · `Care list` · `Assessment records` · `Process list` · `Buttons` · `Status badges` · `Tables` · `States` · `Modal` · `Forms` · `Application wizard` · `Admin lists` · `Motion` · `Responsive` · `Reduced motion` · `Application documents` · `Application start card`

Recurring class vocabulary the restyle must preserve: `shell`, `sidebar`, `brand`, `brand__mark`, `brand__type`, `who`, `avatar`, `nav`, `nav__label`, `nav__link`, `nav__badge`, `nav__link--quiet`, `sidebar__foot`, `scrim`, `main`, `topbar`, `topbar__left`, `topbar__where`, `topbar__user`, `icon-btn`, `page`, `page__head`, `page__deck`, `ledger`, `ledger__cell`, `ledger__cell--focus`, `ledger__label`, `ledger__value`, `ledger__note`, `grid`, `grid--record`, `stack`, `panel`, `panel__head`, `panel__head-actions`, `panel__meta`, `text-link`, `care-list`, `care`, `care__icon`, `state`, `state--inline`, `status-badge`, `field`, `field__label`, `field__hint`, `meter`, `fact`, `identity`.

### 3.6 Known inconsistencies to resolve

| Inconsistency | Where | Resolution |
| --- | --- | --- |
| Two palettes (paper/pasture/hay vs cream/forest/gold) | `portal.css` vs `style.css` + `auth.css` | One palette (public), remapped into both. |
| Two type systems (Fraunces+Archivo vs Arial) | portal vs public | One system: Archivo only. |
| Two radius languages (3/4/6/8px vs 7/10/12/18px) | portal vs public | One scale: 4/6/8px. |
| Shadows used decoratively on public pages; banned in the portal | `.hero-card`, `.program-card:hover`, `.header` | One rule: shadow only on overlays (modal, drawer, toast). |
| Emoji as icons on public pages | `index.html` (`🐄 🌾 🩺`), `login.html` (`☰`, `←`) | Drawn in CSS (see §8.2). |
| Topbar is translucent; DESIGN.md called it the only translucent surface | portal `topbar` | Solid surface with a hairline; no backdrop blur. |
| Page `theme-color` is `#f2ede1` (old paper) | all portal heads | `#f3f5f9`. This is a `<meta content>` value — see §8.3 for the exception rule. |
| Sidebar 272px with serif-ish brand block | portal | 240px, sans wordmark, tighter nav rows. |

---

## 4. The new direction

### 4.1 Principles

1. **The record is the interface.** Numbers, statuses, and dates are the primary visual material. Chrome (rules, headers, nav) recedes to a neutral grey-green.
2. **One action colour.** Maroon `#7c1d3d` marks the single primary action per view, the active nav item, and links. Nothing else is maroon.
3. **Pink is an accent, not a warning.** `#e58aa3` survives as the focus ring, chart bars and one supporting detail per page.
4. **Type does the hierarchy.** Weight and size, not boxes, borders, or uppercase labels everywhere. A heading is bigger and heavier; a caption is smaller and muted.
5. **Density where the work is.** Tables, lists, and record rows are compact (32–36px rows). Page headers, forms, and empty states get room to breathe.
6. **Quiet edges.** Hairline `#e2e6df` rules, 6px radii, no shadows on in-flow surfaces, no gradients, no glass, no texture, no emoji.
7. **Every state names its cause and its next action.** Loading, empty, error, filtered-to-nothing.

### 4.2 What it must not be

- Not a farm brochure: no paper texture, no hay-coloured blocks, no "ledger strip" with a dark feature cell, no serif display.
- Not a template: no floating cards with drop shadows, no gradient hero, no pill buttons, no emoji icons, no centred marketing headings on data pages.
- Not a density experiment: compact does not mean cramped. Minimum 40px control height, 44px tap targets on mobile, 1.45 line-height minimum for body copy.

### 4.3 Reference family

Modern software dashboards — the Linear / Stripe / Vercel / GitHub Primer family — rather than farm branding, editorial magazines, or admin templates. §4.4 turns that family into specific things to borrow and specific things to refuse.

### 4.4 References and moodboard

This section is the visual target in concrete terms. When a styling decision is ambiguous, resolve it here before inventing something.

#### 4.4.1 How to use these references

- **Patterns, not pixels.** Borrow structure, rhythm, and hierarchy. Never copy a layout wholesale, a screenshot, an icon set, or a font file.
- **Nothing is imported.** No asset, font, icon, CSS framework, or component library comes from these products. The palette is yours (`#7c1d3d` / `#e58aa3` / `#f3f5f9` / `#1f2430`), the type is Archivo, the icons are the existing inline SVG set.
- **References are sampled, not version-pinned.** At build time, open the live product at 1440×900 for a minute and apply the test in §4.4.5. If a reference has since changed its paint, the named pattern still holds.
- **The spec wins.** Where a reference conflicts with a locked constraint — the palette, one sans family, compact density, restyle-only — the constraint wins. No reference is a reason for dark mode, a second accent, or a markup change.

#### 4.4.2 Primary references

| Reference | Informs | Borrow | Do not borrow |
| --- | --- | --- | --- |
| **Linear** | Portal shell, navigation, list density | Chromeless shell: hairline separators instead of cards, 32–40px nav rows, muted 16px icons, one accent only on the active item, small radii, page title as a line of text rather than a hero, visible focus everywhere | Dark ground, glow and gradient effects, marketing flourishes inside the app, animated backgrounds, its exact type |
| **Stripe Dashboard** | Money surfaces (payments, balances, fees) and every numeric table | Right-aligned tabular figures, currency prefix in muted text, totals separated by a hairline rather than a box, one emphasised figure per view, empty states with a single action, restrained status colours | Its blue accent (colour is ours), shadowed card groupings, chart-heavy dashboards, multi-column widgets competing for attention |
| **Vercel dashboard** | Overall restraint, settings pages, dense lists | Monochrome structure, 1px borders doing all the grouping, sticky section headers, status dots small enough to read as punctuation, no decorative iconography | Near-black text on pure white (we keep gray-blue neutrals), the stark zero-radius black-button aesthetic, its monospace-everything voice |
| **GitHub (Primer)** | Settings forms, data tables, semantic status | 32px uppercase table headers on a tinted band, label-left / control-right settings rows with inline help beneath the label, semantic colour tokens for status, compact 34px rows, table headers that stay put while scrolling | Dense chrome on every row, bordered button clusters per row, its specific blue/green semantics, bordered boxes around every field group |
| **Mercury / Ramp** | Ledger rows, KPI strips, payment history | Compact record rows, muted secondary columns, one large figure with its delta beneath, totals pinned at the bottom of a list, numbers carrying the visual weight instead of labels | Dark marketing language, illustrations, multi-colour category tags, animated counters |
| **Attio** | Record pages: trainee, cow, program, application | Property rows as hairline-separated label/value pairs, a record header with identity on the left and actions on the right, inline status chips, compact detail density without boxed cards | Spreadsheet-editing everywhere, purple accents, empty decorative sidebars |
| **Ashby / Greenhouse** | Applications, trainee management, review modals | Applicant tables with text status pills, a review panel that separates facts, documents, and notes, decisions isolated in a footer so they are never triggered by accident | Friendly illustration, high-saturation status colours, card feeds, avatars as the primary identifier |
| **Sentry** | Empty states, error states, event tables | State copy that names the cause and the next action, timestamps in monospace, expandable row detail, error blocks that read as information rather than alarm | Dark default theme, multi-column widget grids, its purple accent |
| **GOV.UK Design System** *(behaviour only)* | Forms, validation, wizard errors | An error summary at the top of the step listing each failing field with a jump link, hint text directly under the label, one question per group, copy that says exactly what happens next | Its visual style, its type scale, its government palette |

Secondary references, used only to settle a single decision: **Cal.com** and **Clerk** for single-column auth with 40px inputs and visible labels; **PostHog** for a tab strip replacing stacked panels; **Shopify Polaris** for settings-page sectioning and destructive-action confirmation.

#### 4.4.3 Anti-references

Each of these is a failure mode to look for in the screenshot review, not a style to negotiate with:

1. **Bootstrap / AdminLTE admin templates** — gradient sidebar, 12px card shadows, pill badges, icon fonts, six widgets per row.
2. **Tailwind dashboard starters** — three stat cards with coloured icon tiles and sparklines, gradient hero with a tilted product screenshot, floating rounded cards with soft shadows.
3. **Our own previous look** — paper texture, the dark hay-gold feature cell in the ledger, serif page titles, translucent blurred topbar, 420ms drawer.
4. **Fintech marketing sites** — dark hero, lime accent, grain overlay, oversized claims.
5. **macOS app chrome** — translucency, 18px radii, bouncy spring motion, blurred materials.
6. **Farm brochure** — pasture photography, wood texture, rounded green badges, illustrated cows.

If a screenshot could be mistaken for any of these, the page fails review regardless of how clean it looks in isolation.

#### 4.4.4 Moodboard in composition

These are the target compositions for the three archetypes. They are wireframes for hierarchy and proportion — not markup, and not to be implemented literally beyond what the existing DOM allows.

**Landing hero, ≥1024px** (stacked below 1024px, motif hidden below 900px):

```text
┌───────────────────────────────────────────────────────────────────────┐
│ ▢ ESPERON / DAIRY TRAINING     Home  About  Programs  Contact [Sign in] │ 56px, --surface, hairline
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ESPERON DAIRY TRAINING                  ╭─────────────╮               │
│  Growing skills.                         │   ◎ rings   │  ← abstract   │
│  Producing excellence.                   │   ·  ·  ·   │    motif,     │
│                                          ╰─────────────╯    280px      │
│  One sentence of body copy, 52ch, muted.                              │
│                                                                       │
│  [ Get started ]   [ Learn more ]                                     │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
  hairline ──────────── 40px accent segment ─────────────────────────────
```

**Auth, ≥850px:**

```text
┌───────────────────────┬───────────────────────────────────────────────┐
│ ▢ ESPERON             │  ← Back to home                               │
│   DAIRY TRAINING      │                                               │
│                       │  WELCOME BACK                                 │
│  Welcome back.        │  Sign in to your account                      │
│  Body copy at 75%     │  ───────────────────────────────────          │
│  opacity, 42ch.       │  Email address                                │
│                       │  [                                         ]  │ 40px
│                       │  Password                        [ Show ]     │
│                       │  [                                         ]  │
│                       │  ☐ Remember me              Forgot password?  │
│                       │  [            Sign in                       ] │
│                       │  ──────────────── or ──────────────────      │
│                       │  [ Google button ]                            │
│                       │  New here? Create an account                  │
│  Footer line, 50%     │                                               │
└───────────────────────┴───────────────────────────────────────────────┘
   #151a24, 48px pad        #f3f5f9, 400px column, no card border
```

**Portal page, ≥1024px:**

```text
┌──────────┬────────────────────────────────────────────────────────────┐
│ ▢ brand  │ ☰   Admin portal › Trainees                 Ana   (A)      │ 56px, solid, hairline
├──────────┼────────────────────────────────────────────────────────────┤
│  ᗩ who   │ Trainee management                       [ Add trainee ]   │ 28px h1 · 40px button
│          │ Manage registrations, access, and records.                   │ 14px muted
│ RECORDS  │ ──────────────────────────────────────────────────────────  │ hairline
│ ▎Dashboard│ ┌────────┬────────┬────────┬────────┐                      │
│  Trainees│ │    42  │     6  │    38  │     2  │  ← one 28px figure │
│  Applics │ │ Total  │ Pend.  │ Active │ Inact. │    with gold marker│
│  Programs│ └────────┴────────┴────────┴────────┘                      │
│  Assess. │ [ Search…              ] [ Status ▾ ] [ Access ▾ ]        │ 40px controls
│  Payments│ ┌────┬───────────────┬─────────┬─────────┬───────────────┐ │
│  Cow     │ │ ID │ Name          │ Batch   │ Status  │               │ │ 32px header band
│          │ ├────┼───────────────┼─────────┼─────────┼───────────────┤ │
│ ACCOUNT  │ │001 │ Maria Santos  │ 2026-A  │ Ongoing │  Manage       │ │ 34px rows
│  Profile │ │002 │ …             │ …       │ …       │  Manage       │ │
│  Log out │ └────┴───────────────┴─────────┴─────────┴───────────────┘ │
└──────────┴────────────────────────────────────────────────────────────┘
   240px            content max 1320px, 28px 32px padding, --bg ground
```

#### 4.4.5 The screenshot test

One question, asked at arm's length on every screen, at 1440 and at 390:

> **Can I find the page's primary number, its current state, and its next action within two seconds, without reading a sentence?**

- **No** → hierarchy failure. Fix weight, size, and the single emphasis marker before touching anything else.
- **Yes**, then ask: *is anything on screen decorative without carrying information?* If yes, remove it. That answer covers gradients, shadows, icon tiles, oversized headers, and colour that only exists for decoration.

#### 4.4.6 Pattern to implementation map

Every borrowed pattern, expressed as a rule that already exists in this document.

| Reference pattern | Our implementation |
| --- | --- |
| Hairlines group surfaces, not shadows | `.panel` 1px `--line`, 6px radius, no shadow (§9.5) |
| Small radii everywhere | 3px tags, 4px controls, 6px surfaces, 8px modals (§5.4) |
| Compact record tables | 34px rows, 9px 12px cells, 13px text, 32px header band (§9.15) |
| Sticky table headers | `thead th` sticky inside the scroll wrapper at ≤900px (§9.15) |
| Monochrome structure, one accent | `--accent` on the primary action, active nav item, and links only (§5.1) |
| Muted iconography, marked active state | nav icons `--muted`, active row uses `--accent-soft` ground plus a 2px `--gold` marker (§9.1) |
| Numbers carry the weight | tabular numerals; currency in `--muted`; one 28px figure per view (§5.2, §9.3) |
| Settings as sections | stacked panels, max 720px, label-left / control-right rows with help text (§11.8) |
| Records as property rows | hairline-separated label/value grid, 140px label column (§9.8) |
| Error summary with jump links | `.state` block at the top of the wizard step listing failing field labels (§9.19) |
| Empty states with a cause and an action | `.state` block, 32px padding, one action link (§9.16, §13) |
| Review modal with facts, documents, footer | 560–640px dialog, facts rows, document rows, actions isolated in the footer (§9.17, §9.23, §11.3) |
| Status as a small dot plus text | `status-badge` with an optional 5px dot, functional colours only (§9.14) |
| No celebratory motion | one 180ms page entrance, 120ms modal, no stagger (§5.5) |
| Explicit focus, keyboard-first | 2px `--gold` outline plus ring on every interactive element (§5.5) |

#### 4.4.7 What the references must never justify

- A dependency, font download, icon library, or component framework. The work is hand-written CSS over existing markup.
- A markup change. If a reference layout needs different DOM, it is out of scope by definition (§8.1).
- Dark mode, a second accent, or a decorative illustration.
- Extra pages, extra panels, or extra metrics. Borrowing a pattern does not add content.

---

## 5. Design system

### 5.1 Colour tokens

Light only. Every value below replaces the current `:root` block in `portal.css`, `style.css`, and `auth.css`; the three files share identical token names and values so a class behaves the same on any page.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#f3f5f9` | Page ground (all pages, including portals) |
| `--surface` | `#ffffff` | Cards, tables, modals, topbar |
| `--surface-2` | `#f7f8fb` | Table header rows, insets, disabled fields, progress tracks |
| `--surface-3` | `#eef1f7` | Hover on table rows, segmented-control track |
| `--ink` | `#1f2430` | Primary text |
| `--ink-2` | `#151a24` | Display text, dark brand panels, pressed states |
| `--muted` | `#6b7280` | Secondary text, labels, placeholders (≥4.5:1 on `--bg` and `--surface`) |
| `--muted-2` | `#9aa1ad` | Tertiary text, disabled text (**decorative only, never sole carrier of meaning**) |
| `--line` | `#e6e9f0` | Hairline borders, table rules |
| `--line-2` | `#d5dae4` | Strong border: focused inputs, active segments, table outer edge |
| `--accent` | `#7c1d3d` | Primary button, active nav, links |
| `--accent-hover` | `#631630` | Primary button hover, link hover |
| `--accent-soft` | `#fbeef2` | Active nav ground, selected row, quiet badge ground |
| `--maroon-deep` | `#5e1229` | Featured KPI card, chart bar depth |
| `--pink` | `#e58aa3` | Chart bars, focus ring, soft accents |
| `--pink-strong` | `#d95d80` | Pink hover and detail states |
| `--success` | `#1f7a4d` | Complete / verified text and icon |
| `--success-soft` | `#e8f5ee` | Success badge ground |
| `--warning` | `#9a6a13` | Pending / observation |
| `--warning-soft` | `#fdf3dd` | Warning badge ground |
| `--info` | `#2b5f8a` | Ongoing / in-progress |
| `--info-soft` | `#e8f1f9` | Info badge ground |
| `--danger` | `#b23a48` | Outstanding / treatment / destructive |
| `--danger-soft` | `#fbe9ec` | Danger badge ground |
| `--shadow-overlay` | `0 24px 56px -20px rgba(21, 26, 36, 0.3)` | Modal, drawer, toast only |
| `--shadow-card` | `0 1px 2px rgba(21,26,36,.04), 0 10px 28px -18px rgba(21,26,36,.18)` | Cards and KPI surfaces |
| `--focus-ring` | `0 0 0 4px rgba(229, 138, 163, 0.24)` | `:focus-visible` outer glow (paired with a 2px `--accent` outline) |

Rules:

- Old token names (`--paper`, `--field`, `--hay`, `--moss`, `--amber`, `--sky`, `--clay`, `--side-ink`, `--side-muted`, etc.) are kept as aliases to the new palette so existing selectors keep working.
- `#ffffff` on `#f3f5f9` is the card/page distinction. Cards get `1px solid var(--line)`, a 16px radius and `--shadow-card`; the featured KPI card is solid `--accent`.
- Status colour is functional only. A badge may use a soft ground + matching text; it never uses `--accent`.
- The sidebar is a light `--surface` panel with `--ink` text; the active item is `--accent-soft` with `--accent` text and a rounded highlight.

### 5.2 Typography

Single family: **Archivo** (self-hosted variable, 400–700). System monospace for identifiers only (`EDT-2026-001`, `COW-001`, `EDT-PAY-001`).

Scale (compact, scannable — deliberately smaller than today):

| Role | Size / line-height | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| Display | 28px / 1.15 | 600 | `-0.02em` | Portal page `h1` |
| Display L | `clamp(32px, 4vw, 44px)` / 1.1 | 600 | `-0.03em` | Public hero `h1` |
| Section | 18px / 1.3 | 600 | `-0.01em` | Panel `h2` |
| Section L | `clamp(22px, 2.4vw, 28px)` / 1.25 | 600 | `-0.02em` | Public section `h2` |
| Body | 14px / 1.45 | 400 | `0` | Default copy (was 15px/1.55) |
| Body strong | 14px / 1.45 | 600 | `0` | Emphasis, key values |
| Small | 13px / 1.4 | 400 | `0` | Table cells, helper text |
| Micro label | 11px / 1.2 | 600 | `0.06em`, uppercase | Field labels, table headers, `nav__label` |
| Figure | 22px / 1.1 | 600 | `-0.01em` | `ledger__value`, `figure` numbers |
| Figure L | 28px / 1 | 600 | `-0.02em` | The one attention figure per page |

Rules:

- All numerals in tables, ledgers, meters, and figures use `font-variant-numeric: tabular-nums`.
- IDs and reference codes use `--font-mono` at 12px, `0` tracking, `--muted` colour.
- No serif anywhere. Fraunces' `@font-face` is removed, and the display hierarchy is carried by weight (600–700) plus negative tracking instead of a second family.
- Uppercase is confined to micro labels and table headers. Headings are sentence case (today `page h1` is already sentence case; public eyebrows are all-caps and stay, but at 11px/0.06em).
- Maximum text measure: 68ch for prose, no max for tables.

### 5.3 Space and density

4px base unit. Steps: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`.

| Element | Value |
| --- | --- |
| Page padding (desktop) | `28px 32px 48px` (was ~40px+) |
| Page padding (≤900px) | `20px 18px 40px` |
| Panel padding | `16px` body, `14px 16px` head |
| Panel gap in grids | `16px` |
| Section gap | `24px` |
| Form field vertical gap | `14px` |
| Table cell padding | `9px 12px` (was taller) |
| Table row height | 34–36px |
| Table header height | 32px |
| Control height (`input`, `select`, `button`) | 40px desktop / 44px mobile |
| Ledger cell padding | `14px 16px` |
| Sidebar width | `240px` (was 272px) |
| Topbar height | `56px` (was 72px) |
| Content max width | `1320px`, centred, with `--page-max: 1320px` token |

Density rules:

- A viewport 900px tall should show the page header plus at least 12 table rows on list pages.
- Panels never nest scroll areas; the page scrolls.
- Grouping replaces whitespace: use `--line` rules, `--surface-2` header bands, and 11px micro labels instead of large gaps.
- Prose blocks keep 1.45 line-height and 14px size. Only the *structure* gets compact, never the reading copy.

### 5.4 Borders, radii, shadows

| Token | Value | Use |
| --- | --- | --- |
| `--r-sm` | `3px` | Tags, badges, tiny chips |
| `--r-md` | `4px` | Inputs, buttons, selects |
| `--r-lg` | `6px` | Panels, tables, cards, modals |
| `--r-full` | `999px` | Avatar only |

- Borders are `1px solid var(--line)`; focused/active surfaces use `--line-2`.
- Shadow is **only** on modal, off-canvas drawer, and toast, via `--shadow-overlay`.
- No gradients anywhere. No `backdrop-filter`. No texture. No `box-shadow` on `:hover` or `:focus` except the focus ring's `box-shadow`.

### 5.5 Focus, interaction, motion

- `:focus-visible`: `outline: 2px solid var(--gold); outline-offset: 2px; box-shadow: var(--focus-ring); border-radius: var(--r-md)`.
- Press feedback: `transform: translateY(1px)` at 90ms on buttons only.
- Hover on table row: background `--surface-3`, no transform.
- Hover on panel link: colour `--accent`, underline offset 3px.
- Page entrance: one 180ms fade/translate of `page__head` + first row of content (`translateY(4px)` → `0`). Ledger does not "rise"; no staggered cascade.
- Meters/progress bars animate width once at 240ms `ease-out`.
- Modal: 120ms fade + `scale(0.99)` → `1`.
- Drawer (mobile sidebar): 240ms (was 420ms).
- Everything collapses under `@media (prefers-reduced-motion: reduce)`.

### 5.6 Iconography

- Keep the existing inline SVG set exactly as authored. No icon is added, removed, or replaced in markup.
- Stroke stays `1.6`, `currentColor`, `fill: none`. Icon size: 18px in nav, 16px in buttons and table actions, 20px in empty states.
- Nav icons sit in a fixed 20px box so labels align; icon colour is `--muted`, and `--surface` when the item is active.

### 5.7 Abstract graphics (public pages)

No photography and no new image files. The landing page gets three CSS/SVG-drawn motifs:

1. **Hero motif** — a concentric "record" graphic: three thin `--line-2` rings plus a partial `--accent` arc and four tick marks, drawn with `border-radius: 50%`, `conic-gradient`-free layered borders, and inline SVG only where an arc is needed. Fixed 280px square, `aria-hidden`, decorative, sits to the right of the hero copy at ≥1024px and is hidden below.
2. **Program markers** — each of the three program cards gets a geometric marker instead of an emoji (see §8.2): a numbered rule, `01 / 02 / 03` in `--font-mono` at 11px above a 1px `--line-2` divider.
3. **Section rule** — a 1px full-bleed `--line` rule with a single 40px `--accent` segment as the section separator on the landing page, replacing the coloured section backgrounds.

Everything is decorative: `aria-hidden="true"` where the element exists in markup, `content` in pseudo-elements otherwise.

### 5.8 Layout and navigation

- **Portal shell:** fixed 240px sidebar (`--ink-2`), solid `--surface` topbar with hairline bottom rule, content on `--bg`. The sidebar collapses at ≤1024px into the existing off-canvas drawer + scrim (behaviour unchanged, `id="menuToggle"` untouched).
- **Topbar:** 56px, breadcrumb in 13px (`topbar__where`) with `--muted` separators, user block right-aligned with a 28px avatar. No blur, no translucency.
- **Page header:** `h1` 28px/600 + optional `page__deck` at 14px `--muted`, 16px gap, then a hairline. No eyebrow above portal `h1`s.
- **Ledger:** no longer a bordered strip with a dark feature cell. It becomes four equal cells on one `--surface` band with hairline dividers; the primary figure is 28px `--ink-2` with a 3px `--gold` underline segment 24px wide beneath it, and the other three are 22px. Cells are links with a `--surface-3` hover.
- **Public pages:** sticky 56px header on `--surface` with hairline, left wordmark, right nav + one primary button. No shadow. Hero at 72px vertical padding (was 110px), 2-column at ≥1024px, single column below.
- **Auth pages:** split 1:1 kept; left panel becomes solid `--ink-2` with a hairline divider and the existing wordmark, right panel on `--bg` with a 420px-max card, no card border (the page ground is the card). At ≤850px the brand panel becomes a 180px band and drops its body copy.

### 5.9 Responsive breakpoints

Consolidate to four breakpoints in all three files: **1280px**, **1024px**, **900px**, **560px**.

| Breakpoint | Behaviour |
| --- | --- |
| ≤1280px | Content padding 24px; ledger stays 4-up; grids go 2-up |
| ≤1024px | Sidebar becomes off-canvas drawer; topbar keeps breadcrumb; public hero stacked |
| ≤900px | Page padding 18px; ledger 2×2; tables switch to horizontal scroll with a sticky first column; forms single column |
| ≤560px | Controls 44px tall; page `h1` 24px; ledger 1-up or 2×2 at 15px figures; table action links stack; auth card padding 20px |

Rules: no horizontal page scroll at 320px; tables scroll inside their panel; tap targets ≥44px; `-webkit-tap-highlight-color: transparent` with an explicit `:active` state; inputs 16px minimum on mobile to prevent zoom (`font-size: 16px` for `input, select, textarea` at ≤560px).

---

## 6. Token migration map

Old name → new name. Implemented once per file, with the old names kept as aliases for one release so nothing visually breaks mid-migration.

| Old | New |
| --- | --- |
| `--paper` | `--bg` |
| `--paper-2` | `--surface-2` |
| `--surface` (`#fffdf7`) | `--surface` (`#ffffff`) |
| `--ink` | `--ink` (value changes to `#1f2430`) |
| `--ink-2` | `--ink-2` (dark brand panels `#151a24`) |
| `--muted` | `--muted` (value `#69756b`) |
| `--line` / `--line-2` | `--line` / `--line-2` |
| `--field` | `--accent` |
| `--field-2` | `--ink-2` |
| `--hay` | `--gold` (focus only) |
| `--hay-wash` | `--warning-soft` |
| `--moss` / `--moss-wash` | `--success` / `--success-soft` |
| `--amber` / `--amber-wash` | `--warning` / `--warning-soft` |
| `--sky` / `--sky-wash` | `--info` / `--info-soft` |
| `--clay` / `--clay-wash` | `--danger` / `--danger-soft` |
| `--side-ink` / `--side-muted` | `--surface` at 90% / `--muted-2` |
| `--font-display` | alias of `--font-ui` |
| `--primary`, `--primary-dark`, `--background`, `--text`, `--border`, `--white`, `--accent` (gold) | `--accent`, `--accent-hover`, `--bg`, `--ink`, `--line`, `--surface`, `--gold` |

`--sidebar-w` and `--topbar-h` are retuned (240px / 56px), not renamed. `--r-sm/md/lg/xl` stay; `--r-xl` becomes 8px and is only used by modals. `--shadow-overlay` is retuned.

---

## 7. Current type and spacing baseline (what changes)

| Surface | Today | After |
| --- | --- | --- |
| Body | 15px / 1.55 Archivo (portal); Arial 16px / 1.6 (public) | 14px / 1.45 Archivo everywhere |
| Portal `h1` | Fraunces, `clamp(28px…)`-ish, `-0.025em` | Archivo 600, 28px, `-0.02em` |
| Panel `h2` | Fraunces ~18px | Archivo 600, 18px |
| Public `h1` | Arial `clamp(38px, 5vw, 62px)`, 1.13 | Archivo 600, `clamp(32px, 4vw, 44px)`, 1.1 |
| Public `h2` | Arial 34px | Archivo 600, `clamp(22px, 2.4vw, 28px)` |
| Labels | 10–11px uppercase, `0.08em` | 11px / 600 / `0.06em` |
| Hero padding | 110px | 72px |
| Section padding | 85px | 56px |
| Radii | 3/4/6/8 (portal), 7/10/12/18 (public) | 3/4/6/8 only |
| Shadows | public: 3 decorative | overlays only |
| Sidebar | 272px | 240px |
| Topbar | 72px, translucent | 56px, solid |

---

## 8. Constraint handling — "restyle only"

### 8.1 Hard rules

1. **No markup changes** except the explicitly listed exceptions in §8.3. Element order, nesting, classes, ids, `data-*` attributes, `aria-*`, `name`, `type`, `href`, and form field ids stay byte-identical.
2. **No JS changes.** Every file in `frontend/js/` is untouched. Any selector a JS file depends on keeps working.
3. **No backend changes.** Nothing in `backend/` is touched.
4. **No new dependencies, no build step.** CSS is served as-is.

Verification for this section: `git diff --stat` must show changes only under `frontend/css/`, plus the files named in §8.3 and §8.4 D.

### 8.2 Emoji and symbol glyphs in markup

Markup contains emoji/symbol characters that the new direction forbids. Because markup cannot change, each is neutralised and redrawn in CSS:

| Element | Character today | CSS treatment |
| --- | --- | --- |
| `.program-icon` (×3 on `index.html`) | 🐄 🌾 🩺 | `font-size: 0; line-height: 0; color: transparent;` and a `::before` box `28px × 28px`, `border: 1px solid var(--line-2)`, containing the card's ordinal through a shared counter, plus a 1px `--accent` segment. Decorative; the card title carries the meaning. |
| `.hero-card-icon` (`index.html`) | 🐄 | Hidden (`font-size: 0`); the `.hero-card` gets the concentric-ring motif from §5.7 as `::before` instead. |
| `.menu-toggle` (`index.html`) | ☰ | `font-size: 0`; a CSS hamburger drawn with two `linear-gradient` bars on the button, 20px wide, 1.5px tall, `--ink`. |
| `.back-link` arrows (`login/signup/forgot/reset`) | ← / → | `::before` drawn chevron via a rotated 1px border box, 6px, `--muted`. |
| Any remaining `✓ ✓` status glyphs found during implementation | — | Hidden if decorative; if it carries meaning, the adjacent text badge supplies it. Each occurrence is listed in the delivery notes. |

Rule: **no emoji may be visible anywhere** after the redesign. This is checked with a page-by-page screenshot review, not a code scan.

### 8.3 Approved markup exceptions (three, all non-structural)

These are the only edits outside CSS. Each is a value/text change, not a structural one, and each is listed in the delivery notes:

- **A.** `meta[name="theme-color"]` changes from `#f2ede1` to `#f3f5f9` on the 14 portal pages. A meta content value has no CSS equivalent.
- **B.** The three emoji characters inside `.program-icon` on `index.html` may instead be deleted, if you prefer clean source over a hidden-glyph workaround. Default is **not** to delete; CSS hiding is the plan unless approved.
- **C.** Visible copy inside headings, decks, helper text, and empty-state text may be rewritten (§12). Copy lives in text nodes, so this does not touch structure.

If you would rather have zero markup edits, A and C can be dropped with two known consequences: a stale `theme-color` on mobile browser chrome, and copy that still reads in the old voice.

### 8.4 Things the constraint forces

These are honest limitations of restyling without restructuring. Each is accepted, not hidden:

- **A. The DOM order of `.page__head` is fixed.** On pages where the header's `state state--inline` element sits beside the `h1`, it cannot move below the title. CSS will place it as a right-aligned status line instead of a stacked notice at ≤900px.
- **B. Table markup is generated by JS** (`*.js` builds `<tr>`/`<td>` strings). Column count, order, and cell contents cannot change. Compact styling therefore has to work with the existing column set; no column can be hidden to reduce density. If a table still reads badly at 1440px after restyling, the fix is a later markup change, not this phase.
- **C. `.ledger` keeps its `ledger__cell--focus` element.** The "one feature cell" idea is retired, but the class remains in markup. It is restyled to be visually equal to its siblings except for the 28px figure and the 24px gold marker; it is not a dark block.
- **D. The Google sign-in iframe** (`.google-button-container`, `g_id_signin`) cannot be styled. Only its container is. It will keep Google's default 40px button, which is close to the new control height — this is acceptable and called out as a visual seam.
- **E. Status badge text** is emitted by JS (`status-badge ongoing` etc.). Badge wording stays; only colour, size, radius, and weight change.
- **F. The sidebar and topbar are duplicated across 14 pages.** Any structural idea for navigation cannot be applied once; only CSS is shared. This is exactly why the CSS is the single source of truth.

---

## 9. Component restyle specification

Every `portal.css` section, restated as the target. Values reference §5 tokens.

### 9.1 Shell

- `body`: `--bg`, 14px/1.45.
- `.shell`: `grid-template-columns: 240px 1fr`, `min-height: 100vh`.
- `.sidebar`: `--ink-2`, `border-right: 1px solid rgba(255,255,255,0.08)`, padding `16px 12px`, sticky full-height, internal scroll on short viewports.
- `.brand`: 36px row, 8px gap, wordmark 15px/600 at `--surface`, `small` 10px uppercase `0.08em` at 60% opacity. `.brand__mark`: 28px square, `--r-md`, 1px `rgba(255,255,255,0.14)` border, icon 16px. The mark itself is unchanged.
- `.who`: 40px row on `rgba(255,255,255,0.04)`, `--r-md`, 10px padding; `.avatar` 28px, `--r-full`, `--accent-soft` text on `rgba(255,255,255,0.1)`.
- `.nav__label`: 10px/600 `0.08em` uppercase, 55% opacity, 16px top margin, 6px bottom.
- `.nav__link`: 34px row, `--r-md`, 8px gap, 13px/500 text at 80% opacity, 16px icon at 70%. Hover: `rgba(255,255,255,0.06)` ground. `.is-active`: `rgba(214,168,95,0.10)` ground, full-opacity text, 2px `--gold` left marker inside the row's radius, icon `--gold`. No pill radius.
- `.nav__badge`: 18px min, `--r-sm`, `--gold` ground, `--ink-2` text, 10px/700.
- `.sidebar__foot`: 10px, 45% opacity, hairline top rule.
- `.topbar`: 56px, `--surface`, `border-bottom: 1px solid var(--line)`, padding `0 20px`, `position: sticky; top: 0`, no blur. `.topbar__where`: 13px, `--muted`, separators 12px at 50% opacity, current page `--ink` 500. `.topbar__user`: 13px, avatar 28px.
- `.icon-btn`: 32px square, `--r-md`, `--muted`, hover `--surface-3`.
- `.scrim`: `rgba(28,48,34,0.32)`, 160ms fade.

### 9.2 Page

- `.page`: `max-width: 1320px; margin: 0 auto; padding: 28px 32px 48px`.
- `.page__head`: flex, `space-between`, `align-items: flex-start`, `gap: 24px`, `padding-bottom: 16px`, `border-bottom: 1px solid var(--line)`, `margin-bottom: 16px`.
- `h1`: 28px/600/`-0.02em`, `--ink-2`.
- `.page__deck`: 14px, `--muted`, `max-width: 68ch`, `margin-top: 6px`.
- `.state--inline`: right-aligned, max-width 320px, 13px, `--r-md`, 8px 10px, soft ground by tone.

### 9.3 Ledger

- `.ledger`: `display: grid; grid-template-columns: repeat(4, 1fr)`, `--surface`, `border: 1px solid var(--line)`, `--r-lg`, `overflow: hidden`, no shadow.
- `.ledger__cell`: `padding: 14px 16px`, divider `border-left: 1px solid var(--line)` on cells 2–4, `display: block`, hover `--surface-3`, focus ring inside.
- `.ledger__label`: 11px/600 `0.06em` uppercase, `--muted`.
- `.ledger__value`: 22px/600 tabular, `--ink-2`, `margin-top: 6px`, `display: block`.
- `.ledger__note`: 12px, `--muted`, `margin-top: 4px`.
- `.ledger__cell--focus .ledger__value`: 28px and a `::after` 24px × 3px `--gold` rule 8px below.
- ≤900px: 2×2 grid, dividers adjusted to the new rows. ≤560px: 1 column, `border-left: none`, `border-top` between cells, values 20px.

### 9.4 Layout grids

- `.grid`: `display: grid; gap: 16px`.
- `.grid--record`: `grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr)` ≥1024px, single column below.
- `.stack`: `display: grid; gap: 16px`, `min-width: 0`.

### 9.5 Panel

- `.panel`: `--surface`, `1px solid var(--line)`, `--r-lg`, no shadow, `overflow: hidden`.
- `.panel__head`: `padding: 14px 16px`, `border-bottom: 1px solid var(--line)`, flex, 12px gap, `h2` 18px/600.
- `.panel__head-actions`: 12px gap, `.panel__meta` 12px `--muted` in a `--surface-2` chip `--r-sm`, `.text-link` 13px `--accent` 500.
- Panel body padding: 16px; padding is 0 where the body is a table or list with its own row rules.
- ≤560px: head stacks, actions wrap below.

### 9.6 Meters / progress

- Track: 6px height (`--surface-2`), `--r-full`.
- Fill: `--accent`, `--r-full`, 240ms width transition.
- Label row: 12px, `--muted` left, tabular value right.
- No gradient fill. Values over 100% clamp visually and show the real number in text.

### 9.7 Figures

- `.figure` values: 28px/600 tabular `--ink-2`; unit suffix 12px `--muted`.
- Delta indicators: 11px, `--success`/`--danger` text with a 6px triangle drawn in CSS; no coloured chips.
- Exactly one figure per page may carry the 24px gold marker (the same one as `.ledger__cell--focus` if the ledger is present; otherwise the first figure).

### 9.8 Facts (definition rows)

- Two-column `grid-template-columns: 140px 1fr`, `gap: 6px 16px`, `padding: 8px 0`, `border-bottom: 1px solid var(--line)` on all but the last.
- Term: 11px/600 uppercase `0.06em`, `--muted`. Description: 13px, `--ink`.
- IDs rendered in `--font-mono` 12px.
- ≤560px: single column, term above value, gap 2px.

### 9.9 Identity blocks

- 40px avatar or mark, 12px gap, name 14px/600, subtitle 12px `--muted`.
- Hairline bottom rule instead of a card.
- No circular highlight ring.

### 9.10 Care list

- Row: `padding: 10px 0`, `border-bottom: 1px solid var(--line)`, grid `24px 1fr auto`.
- `.care__icon`: 24px box, `--muted`, 1px `--line` border, `--r-sm`, icon 14px.
- Title 13px/600, meta 12px `--muted`.
- Trailing action: 13px `--accent` text link. Status at the row end uses `status-badge` at 11px.

### 9.11 Assessment records

- Card-less rows: `grid-template-columns: 1fr auto auto`, `padding: 12px 16px`, hairline between.
- Title 14px/600, subject 12px `--muted`, score 15px/600 tabular `--ink-2`, status badge right.
- Score denominator 12px `--muted`.
- Empty state uses `.state`.

### 9.12 Process list (how-it-works blocks)

- Horizontal at ≥900px: `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))`, `gap: 16px`.
- Each step: index `01` in `--font-mono` 11px `--accent`, title 13px/600, body 12px `--muted`, top hairline per step.
- No numbered circles, no connectors, no arrows.

### 9.13 Buttons

| Variant | Ground | Text | Border |
| --- | --- | --- | --- |
| Primary (`.btn`, `.btn--primary`) | `--accent` | `--surface` | none |
| Secondary (`.btn--ghost`) | `--surface` | `--ink` | `1px var(--line-2)` |
| Quiet (`.btn--quiet`) | transparent | `--accent` | none |
| Danger | `--danger` | `--surface` | none |

- Height 40px (44px ≤560px), padding `0 14px`, `--r-md`, 13px/600, icon 16px + 6px gap.
- Hover: primary `--accent-hover`; secondary ground `--surface-3`; quiet underline.
- Active: `translateY(1px)` 90ms.
- Disabled: `--surface-2` ground, `--muted-2` text, `cursor: not-allowed`, no transform.
- No pill buttons. No gradient. No shadow.

### 9.14 Status badges

- 11px/600, `0.02em`, padding `2px 8px`, `--r-sm`, `1px solid transparent`, display inline-flex, 4px gap for a dot.
- Complete/verified: `--success` text on `--success-soft`, border `rgba(44,107,63,0.18)`.
- Pending/observation: `--warning` on `--warning-soft`.
- Ongoing/info: `--info` on `--info-soft`.
- Outstanding: `--danger` on `--danger-soft`.
- Neutral: `--muted` on `--surface-2`.
- A 5px leading dot is optional per variant and drawn with `border-radius: 50%`. All four status colours are readable at 11px on their own wash (verified ≥4.5:1).

### 9.15 Tables

- Container: `--surface`, hairline outer border, `--r-lg`, `overflow: hidden`, horizontal scroll wrapper at ≤900px.
- `thead th`: 11px/600 uppercase `0.06em` `--muted`, `--surface-2` ground, `height: 32px`, `padding: 0 12px`, `border-bottom: 1px solid var(--line)`, `position: sticky; top: 0` inside scroll containers.
- `tbody td`: 13px, `padding: 9px 12px`, `border-bottom: 1px solid var(--line)`, `vertical-align: middle`.
- Row hover: `--surface-3`. Selected row: `--accent-soft` with a 2px `--accent` left inset.
- Numeric columns: right-aligned, `tabular-nums`. ID columns: `--font-mono` 12px `--muted`.
- Row actions: 13px `--accent` text buttons, 10px gap, no bordered icon buttons.
- Last row: no bottom border.
- `.table--compact` (list pages): 8px vertical cell padding, 34px rows.
- Empty state below the header: `.state` centred, 40px vertical padding, cause + next action copy.
- Never zebra-stripe. Grouping comes from `--surface-2` sub-header rows or spacing only.

### 9.16 States (`.state`)

- Inline: 13px, soft ground by tone, `--r-md`, 8px 10px, 1px border at 18% of the tone colour, icon 14px.
- Block/empty: `--surface`, hairline dashed `--line-2` (only dashed border in the system), `--r-lg`, padding 32px, centred, max-width 420px, title 14px/600, body 13px `--muted`, one action link.
- Loading: 14px skeleton bars (`--surface-2`, 4px radius, 1.2s pulse, disabled under reduced motion) or a single-line 13px `--muted` "Loading …" per existing markup capabilities.
- Error: `--danger` text, `--danger-soft` ground, cause + retry link.

### 9.17 Modal

- Overlay `rgba(28,48,34,0.36)`, 120ms fade.
- Dialog: `--surface`, `--r-lg` (8px), `--shadow-overlay`, `max-width: 560px` (640px for wide forms), `max-height: 88vh`, internal scroll body, head `padding: 14px 20px`, hairline, title 18px/600, close button 28px.
- Footer: `padding: 14px 20px`, hairline top, actions right-aligned, primary last.
- Open animation: `scale(0.99)` + fade 120ms. No bounce.

### 9.18 Forms

- `.field`: `margin-bottom: 14px`.
- `.field__label`: 12px/600, `--ink`, `4px` below, sentence case (uppercase removed).
- `.field__hint`: 12px `--muted`, `4px` top; errors 12px `--danger` with a 12px alert icon.
- `input, select, textarea`: 40px (textarea auto, min 88px), `1px solid var(--line-2)`, `--r-md`, `--surface`, 13px, `padding: 0 10px`, placeholder `--muted-2`.
- Focus: border `--accent`, `box-shadow: var(--focus-ring)`, no layout shift (border colour only).
- Invalid: border `--danger`, `aria-invalid` styling only (no new attributes).
- Select: native arrow retained; `appearance` untouched for reliability.
- Checkbox/radio: 16px, `accent-color: var(--accent)`.
- Fieldset/legend: legend 13px/600, hairline above the group, 16px vertical gap.
- Password reveal button (`.toggle-password`): 12px `--accent` 600, positioned inside the field, 10px from the right.
- Mobile: all inputs `font-size: 16px` at ≤560px to prevent iOS zoom.

### 9.19 Application wizard

- Step indicator: horizontal hairline with 3 segments; completed `--accent`, current `--ink-2` with a 2px underline, upcoming `--line`. Numbers in `--font-mono` 11px, labels 12px/600. No circles, no connectors.
- Step body: panels from §9.5, `padding: 16px`.
- Wizard footer: 16px gap, hairline above, secondary left, primary right, sticky at ≥900px (`bottom: 0`, `--surface`, hairline top).
- Review step: `facts` rows (§9.8), no card-in-card.
- Validation summary: `.state` error block at the top of the step with a list of field labels in `--danger`.

### 9.20 Admin lists

- Toolbar: 40px, flex, 8px gap, search input 240px max, filters as a `select` at 40px, primary action right.
- Search input: leading 16px magnifier icon; the icon is decorative CSS, not new markup.
- Applied filters: 24px chips, `--surface-2`, `--r-sm`, 12px, `×` affordance 12px.
- Bulk action row (where markup exists): 40px bar, `--accent-soft`, 13px, appears above the table without moving it.

### 9.21 Motion

Exactly the animations listed in §5.5. Remove: ledger rise, staggered panel entrance, `translateY(-5px)` card lifts, shadow-on-hover, `420ms` drawer. Total added animation code must be smaller than what it replaces.

### 9.22 Reduced motion

`@media (prefers-reduced-motion: reduce)`: `animation: none !important; transition-duration: 1ms !important; scroll-behavior: auto`. No layout-dependent motion remains.

### 9.23 Application documents

- Upload rows: 40px, hairline between, file icon 16px `--muted`, name 13px/600, meta 12px `--muted`, action link 13px `--accent`.
- Uploaded/verified state: a `status-badge` at the row end.
- Drop area (if present in markup): dashed `--line-2`, `--r-lg`, `--surface-2`, 48px padding, centred 13px copy.
- Document preview thumbnails (if any): 40px square, `--r-sm`, hairline.

### 9.24 Application start card

- `--surface`, hairline, `--r-lg`, `padding: 24px`, `max-width: 560px`.
- Title 18px/600, body 14px `--muted`, primary button 40px.
- No illustration. Optional 40px abstract marker (three stacked hairlines) via `::before`.

---

## 10. Phase 1 — Public pages

Target: the public face matches the portal, and neither uses Arial, emoji, gradients, or decorative shadows.

### 10.1 `frontend/css/style.css` (landing)

Scope: rewrite tokens + every section. Sections in the file: General, Navigation, Hero, General Sections (about, programs), CTA, Footer, Responsive.

#### 10.1.1 Page composition — exact section order

`index.html` has six bands. Their order is fixed, because it is the markup order and Phase 1 does not restructure markup.

| # | Section (selector) | Anchor | Ground | Vertical padding | Content (as it exists) |
| --- | --- | --- | --- | --- | --- |
| 1 | Header `.header` | — | `--surface` | 56px, sticky top 0 | Wordmark (`.logo` + `.logo-icon`), `.menu-toggle`, 4 nav links, `.login-btn` "Student Login"; 1px `--line` bottom |
| 2 | Hero `.hero#home` | `#home` | `--bg` | 72px 0 | `.hero-text`: eyebrow, `h1` with `<span>`, 14px copy, two `.hero-actions` links. `.hero-card`: motif panel |
| 3 | About `.section#about` | `#about` | `--bg` | 56px 0 | `.about-content`: left column (eyebrow + `h2`), right column (two body paragraphs) |
| 4 | Programs `.section.programs#programs` | `#programs` | `--bg` | 56px 0 | `.section-heading` (eyebrow, `h2`, deck) then `.program-grid` with 3 `.program-card` items |
| 5 | Portal CTA `.cta-section` | — | `--accent`, flat | 56px 0 | `.cta-content`: `h2`, paragraph, inverted `.primary-btn` |
| 6 | Footer `.footer#contact` | `#contact` | `--ink-2` | 32px 0 | `.footer-content`: `h3` + tagline left, copyright line right (`#currentYear` stays) |

Composition rules for the order:

- **Order is not negotiable in Phase 1.** Hero → About → Programs → CTA → Footer. No section is merged, moved, or hidden at any breakpoint.
- **Anchors must land correctly under the sticky header.** Add `scroll-margin-top: 72px` (56px header + 16px) to `#home`, `#about`, `#programs`, and `#contact` — note that `#contact` is the *footer*, so it needs the offset too. Keep `html { scroll-behavior: smooth }` and let it collapse under reduced motion.
- **Two colour fields only:** `.cta-section` on `--accent` and `.footer` on `--ink-2`. Every other band is `--bg`. The `#eff2eb` Programs band is removed; Programs is separated by a hairline, not a tint.
- **Section rules:** one full-bleed 1px `--line` rule with a single 40px `--accent` segment (§5.7) above About and above Programs, drawn with `::before` on `.about-content` and `.section-heading` so no element is added. No rule above the CTA: the ground change *is* the separator, and a `--line` rule there would disappear against `--accent`.
- **Header metrics:** `.navbar { height: 56px; min-height: 0 }`, no `box-shadow`, 1px `--line` bottom. The mobile sheet opens from the header's bottom edge via `top: 100%` (`.header` is `position: sticky`, so it is the positioned ancestor) — the `78px` magic number must not survive in either the header or the media query.
- **Nav list:** `Home / About / Programs / Contact` at 13px/500 `--ink`, 24px gaps; `.login-btn` is a 40px primary button, not a padded green block. Below 1024px the four links plus the button become the sheet, each row 44px with a `--line` rule between.

#### 10.1.2 Hero composition

`.hero-content` is a two-column grid at ≥1024px and a single column below. `.hero-card` is the right-hand motif panel; it is never a floating card with a shadow, and its 65px emoji is never visible.

| Viewport | Hero padding | Columns | Copy measure | `h1` | `.hero-card` | Motif | `.hero-actions` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ≥1281px | `72px 0` | `1.15fr 0.85fr`, gap 48px | 616px column, `52ch` max | 44px / 1.1 / `-0.03em` | 456px, `--surface`, hairline, `--r-lg`, 24px padding | 280px, top of panel | inline, 8px gap, 40px |
| 1024–1280px | `72px 0` | `1.15fr 0.85fr`, gap 32px | ~590px column | 41–44px (`4vw`) | ~430px, 20px padding | 240px | inline, 8px gap, 40px |
| 901–1023px | `56px 0` | single, gap 24px | full width, `52ch` max | 40px (`4vw`) | full width, `max-width: 560px` | hidden (§5.7) | inline, 8px gap |
| 561–900px | `48px 0` | single, gap 20px | full width | 36px (`4vw`) | full width, 20px padding | hidden | inline, 8px gap |
| ≤560px | `40px 0` | single, gap 16px | full width | 32px (clamp floor) | full width, 16px padding | hidden | stacked, full width, 44px |

At 1440px:

```text
container min(1120px, 90%) · header 56px · hero padding 72px 0
┌──────────────────────────────────────────────────────────────────────────┐
│ ▢E ESPERON / DAIRY TRAINING     Home  About  Programs  Contact [Sign in] │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ESPERON DAIRY TRAINING                 ┌─────────────────────────────┐   │
│  Growing Skills.                        │              ◎              │   │
│  Producing Excellence.                  │         ◎         ◎         │   │ 280px
│                                         │              ◎              │   │ motif
│  Develop your knowledge and practical   │  ───────────────────────    │   │
│  skills in modern dairy farming.        │  Learn. Train. Grow.        │   │ 15/600
│  (14px, --muted, 52ch)                  │  Your journey toward better │   │ 13px
│                                         │  dairy farming starts here. │   │
│  [ Get Started ]   [ Learn More ]       │                             │   │
│                                         └─────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
  ├────────────── 616px ──────────────┤   ├──────── 456px ────────┤
```

At 390px:

```text
padding 40px 0 · single column · actions stacked
┌─────────────────────────────────────────┐
│ ▢E ESPERON                  ☰ (CSS)     │ 56px
├─────────────────────────────────────────┤
│ ESPERON DAIRY TRAINING                  │ 11px 0.06em
│                                         │
│ Growing Skills.                         │ 32px / 1.1
│ Producing Excellence.                   │
│                                         │
│ Develop your knowledge and practical    │ 14px
│ skills in modern dairy farming.         │
│                                         │
│ [          Get Started              ]   │ 44px
│ [          Learn More               ]   │ 44px
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Learn. Train. Grow.        15px/600 │ │ no motif
│ │ Your journey toward better dairy…   │ │ 13px
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

Hero rules:

- `h1` keeps both lines and the `<span>`: line 1 `--ink-2`, line 2 (`Growing Skills.` is the plain text, `<span>` wraps `Producing Excellence.`) `--accent`. No gradient text, no drop cap.
- The eyebrow is 11px/600 `0.06em` uppercase `--accent`, plain — not a pill.
- The primary action goes to `signup.html`, the secondary to `#about`; keep those targets.
- The arrow glyphs `→` in the two CTA labels are text, not emoji; they stay, at 13px inside the button.
- Motif is a `::before` on `.hero-card`, `aria-hidden` by construction (pseudo-element), clipped by the panel's `overflow: hidden`, and absent below 1024px — no layout shift when it disappears.
- No `radial-gradient`, no `linear-gradient`, no `box-shadow` on the hero at any width.

#### 10.1.3 Section-by-section rules

- **Header:** 56px sticky `--surface`, hairline bottom, no shadow. `.logo`: 28px square mark with `--accent` ground and `--surface` "E", wordmark 14px/600 `--ink-2` + 10px uppercase subline. `.nav-links a`: 13px/500 `--ink`, hover `--accent`; `.login-btn`: primary button 40px (§9.13) instead of a 7px-radius green block.
- **`.menu-toggle`:** ☰ hidden, CSS hamburger (§8.2). 32px box, `--r-md`.
- **Mobile nav:** the existing `.nav-links.active` dropdown becomes a full-width `--surface` sheet with hairline rules, 13px links, 44px rows, 160ms slide. No shadow; a `--line-2` bottom border.
- **Hero:** remove both gradients. Ground `--bg`, 2-column at ≥1024px — padding, column split, gaps, and card widths come from the breakpoint table in §10.1.2, not from a single value here. `.eyebrow`: 11px/600 `0.06em` `--accent`, no pill. `h1`: display L (§5.2), `--ink-2`; the `<span>` accent line becomes `--accent`. Copy 14px `--muted`, `max-width: 52ch`. Actions: primary + secondary (§9.13), 8px gap.
- **`.hero-card`:** no longer a floating 18px-radius card with a 65px emoji and shadow. It becomes the hero motif panel: `--surface`, hairline, `--r-lg`, 24px padding, the emoji hidden, the concentric-record graphic (§5.7) at 160px as `::before`, `h3` 15px/600, `p` 13px `--muted`.
- **About:** 2-column `160px 1fr` label/body at ≥900px (eyebrow as a left column), gap 32px, hairline above, 56px padding. `h2` section L, body 14px `--muted` 60ch.
- **Programs:** remove the `#eff2eb` band; use a full-width hairline + `--bg`. 3-up grid at ≥900px with 16px gaps, no cards: each `.program-card` becomes a column with a top hairline, the geometric marker (§8.2), `h3` 15px/600, `p` 13px `--muted`. Hover: hairline becomes `--accent`, no lift, no shadow.
- **CTA:** keep `--accent` ground but flat (no gradient): 56px padding, `h2` 24px/600 `--surface`, copy 14px at 85% opacity, button inverted (`--surface` ground, `--accent` text).
- **Footer:** `--ink-2` ground, 32px padding, 13px text at 70% opacity, hairline top, 2-column flex.
- **Responsive:** replace the single 768px block with 1024/900/560 per §5.9.

### 10.2 `frontend/css/auth.css` (login, signup, forgot-password, reset-password)

Scope: tokens + all auth sections, including Google sign-in, toasts, and messages.

#### 10.2.1 Layout at each breakpoint

The 1fr/1fr split survives down to 850px, then the brand panel becomes a top band. `.auth-container` is `min-height: 100dvh` with a `100vh` fallback, and it is the only element that is ever taller than the viewport.

| Viewport | Grid | `.auth-brand` | `.auth-form-section` | `.auth-card` |
| --- | --- | --- | --- | --- |
| ≥1024px | `1fr 1fr`, `min-height: 100dvh` | `--ink-2`, `48px` padding, content `max-width: 500px`, `justify-content: space-between` | centred, `48px 24px` | `max-width: 420px`, no border, no shadow |
| 851–1023px | `1fr 1fr` | `32px` padding, `h1` 32px, `.brand-footer` hidden | centred, `32px 20px` | `max-width: 420px` |
| 561–850px | single column, `align-items: start` | 180px band: `20px 24px` padding, wordmark + `h1` 24px only (eyebrow, body copy, footer hidden) | `32px 24px 40px` | `max-width: 420px`, top-aligned |
| ≤560px | single column, `align-items: start` | 120px band: `16px 20px`, wordmark (28px mark) + `h1` 22px | `24px 20px 40px` | full width |

At 1440px:

```text
┌────────────────────────────┬─────────────────────────────────────────────┐
│ ▢E ESPERON                 │                                             │
│    DAIRY TRAINING          │  ← Back to Home                   12px      │
│                            │                                             │
│                            │  WELCOME BACK                    11px .06em│
│  Welcome Back!             │  Sign In to Your Account         22px/600  │
│                            │  Enter your account information… 13px      │
│  Continue your learning    │  ───────────────────────────────────────    │
│  journey and manage your   │  Email Address                   12px/600  │
│  dairy training…           │  [                                     ]    │ 40px
│  14px · 75% · 42ch         │  Password                      [ Show ]     │
│                            │  [                                     ]    │
│                            │  ☐ Remember me        Forgot Password?     │
│                            │  ┌ reCAPTCHA (third-party) ─────────────┐   │
│                            │  [              Sign In                ]   │ 40px
│                            │  ───────────────  OR  ─────────────────    │
│                            │  [          Google button             ]    │
│                            │  Don't have an account? Create Account     │
│  Building knowledge.       │                                             │
└────────────────────────────┴─────────────────────────────────────────────┘
  --ink-2 · 48px padding       --bg · 420px card centred in the column
```

At 390px:

```text
┌─────────────────────────────────────────┐
│ ▢E ESPERON DAIRY TRAINING               │ 120px band, --ink-2
│ Welcome Back!                    22px   │ h1 stays visible
├─────────────────────────────────────────┤
│ ← Back to Home                          │
│ WELCOME BACK                            │
│ Sign In to Your Account          22px   │
│ Enter your account information…         │
│ Email Address                           │
│ [                                     ] │ 44px
│ Password                     [ Show ]   │
│ [                                     ] │
│ ☐ Remember me     Forgot Password?      │ 13px, wraps to 2 lines if needed
│ [               Sign In               ] │ 44px
│ ───────────────  OR  ────────────────   │
│ [             Google button            ]│
│ Don't have an account? Create Account    │
└─────────────────────────────────────────┘
  padding 20px · page scrolls · nothing clipped
```

#### 10.2.2 Column composition

- **Brand panel (left):** `.brand-logo` top, `.brand-content` (`eyebrow`, `h1`, one paragraph) vertically centred by `justify-content: space-between` plus `margin: auto 0`, `.brand-footer` bottom. Flat `--ink-2`; the `linear-gradient(145deg, …)` is removed entirely. A 1px `--line` at 12% opacity separates it from the form column at ≥851px.
- **`h1` in the band:** keeps a single line at every width (`white-space: nowrap` is not needed; the copy is short). At 180px and 120px band heights it is the only large text, so the band reads as a masthead, not a colour block.
- **Form column (right):** `.back-link`, 20px gap, `.form-heading` (eyebrow, `h2` 22px, one-line deck), 20px gap, `<form>`, `.google-divider`, `.google-button-container`, `.auth-switch`. Card is `padding: 0` — the page ground is the card. No border, no shadow, no `--surface` panel.
- **Vertical rhythm inside the form:** 14px between `.form-group`s, 12px inside a `.form-row`, 20px above the submit button, 22px around `.google-divider`, 25px above `.auth-switch`.
- **Toast region:** fixed, `top: 16px; right: 16px`, `width: min(360px, calc(100vw - 32px))`, above everything (`z-index` stays the highest in the file). It is the only element on these pages with `--shadow-overlay`.

#### 10.2.3 Login vs signup — what differs

The shell, tokens, and control heights are identical; only the form body changes.

| | `login.html` | `signup.html` |
| --- | --- | --- |
| Fields | Email, Password | First + Last in one `.form-row`, Email, Account Role `<select>`, Password, Confirm Password |
| Extra rows | `.form-options` (Remember me + Forgot Password) | `.field-note` under the role select |
| CAPTCHA | `.captcha-container` (empty div, filled by JS) | `.captcha-container` wrapping `.g-recaptcha` |
| Height at 390px | Fits one screen | ~1.9 screens — must scroll, never clip |
| Switch line | "Don't have an account? Create Account" | "Already have an account? Sign In" |

- `.form-row` is two columns ≥561px and one column ≤560px. At 390px the two name fields stack with a 14px gap (not 0 — the current `gap: 0` rule leaves them visually merged).
- `forgot-password.html` and `reset-password.html` reuse the login shell. Their field sets are untouched and need no layout rules beyond the shared ones; the `.form-message` styling below covers their result states.
- The signup page is the tallest page in the app. `.auth-form-section` must not use `align-items: center` below 851px (the current rule centres a taller-than-viewport column and clips its top); use `align-items: start` with top padding.
- The Google iframe keeps its authored size. `.google-button-container` is `min-height: 40px`, centred, and the iframe is capped at `max-width: 100%`; nothing else is done to it (§8.4 D).

#### 10.2.4 Section-by-section rules

- **Layout:** keep the 1fr/1fr grid. Left `.auth-brand` becomes flat `--ink-2`, 48px padding, no gradient; wordmark uses `--surface`. `.brand-icon`: 32px square, `--surface` ground, `--accent` "E", `--r-md`. `.brand-content h1`: display L, `--surface`, max 2 lines. Body 14px at 75% opacity, 42ch. `.brand-footer` 12px at 50% opacity.
- **Right panel:** `--bg`, content `max-width: 420px` (matches §5.8), `.auth-card` no border, no shadow, `padding: 0`. Layout per breakpoint in §10.2.1.
- **`.back-link`:** 12px `--muted`, hover `--accent`, CSS chevron before (§8.2).
- **`.form-heading`:** eyebrow 11px `--accent`, `h2` 22px/600 (was 28px Arial), body 13px `--muted`, 20px gap.
- **Fields:** §9.18. 40px inputs, `--line-2` border, 13px, `--r-md`; focus `--accent` + ring; labels 12px/600.
- **`.form-row`:** 12px gap, single column ≤560px.
- **`.toggle-password`:** 12px 600 `--accent`.
- **`.form-options` / `.remember-option`:** 12px, `accent-color: var(--accent)`, links `--accent` 600.
- **`.auth-button`:** primary button, full width, 40px (44px mobile), 13px/600, `--r-md`.
- **`.auth-switch`:** 13px `--muted`, link `--accent`.
- **`.field-note`:** 11px `--muted`.
- **`.form-message`:** success `--success` on `--success-soft` with `rgba` border; error `--danger` on `--danger-soft`; `--r-md`, 12px 14px padding, 13px, 1px border. No rounded-7px blocks.
- **`.google-divider`:** 11px/600 `0.06em` uppercase `--muted`, hairlines `--line`.
- **`.google-button-container`:** min-height 40px, centred; iframe untouched (§8.4 D).
- **`.edtsp-toast`:** `--surface`, hairline, `--shadow-overlay`, `--ink` text, 13px, `--r-md`, 12px 14px, left 2px accent bar by type (error `--danger`, success `--success`); region top-right 16px, 8px gap, max 360px.

### 10.3 Phase 1 acceptance

- [ ] No Arial, no Fraunces, no gradient, no emoji visible on `index.html` or the four auth pages.
- [ ] Landing page and login page share the exact token values and control heights with the portal.
- [ ] Landing hero is single column below 1024px with no horizontal scroll at 320px.
- [ ] The signed-out auth flow still works: login, signup, forgot-password, reset-password, Google button, password reveal, inline form messages, toasts.
- [ ] `landing.css` and `responsive.css` are deleted; `fraunces-latin-var.woff2` is deleted.
- [ ] Screenshots at 1440×900 and 390×844 for all five pages.
- [ ] Landing section order and anchors are intact: Home, About, Programs, and Contact all stop 72px below the sticky header (Contact is the footer).
- [ ] Hero motif appears only at ≥1024px, is a pseudo-element, and its removal below that width causes no layout shift.
- [ ] At 390×844 the signup page scrolls from the top band to the switch line with no clipping and no horizontal scroll; the auth `h1` is visible on all four pages.
- [ ] The mobile nav sheet is flush with the header's bottom edge (`top: 100%`), with no leftover 78px offset.

---

## 11. Phase 2 — Admin portal

Shared work first (this section is where the whole `portal.css` rewrite lands, §9 in full), then per-page.

### 11.1 `admin/dashboard.html` — "Administrator dashboard"

- Header: `h1` 28px, deck 14px.
- Ledger: four metrics, one 28px focus figure with gold marker (whichever metric is the actionable one — pending applications).
- `Recent assessments` panel: table at `--table--compact`, 34px rows.
- Any secondary panels: `grid--record` 1.55/1 split.

### 11.2 `admin/trainees.html` — "Trainee management", panel "Registered trainees"

- Toolbar (§9.20): search + status filter + account filter, primary action right.
- Table: compact rows, ID column monospace, status badge, row action "Manage" as an accent text link.
- Manage modal (§9.17): 560px, `facts` rows for trainee ID/phone/address/account, read-only status block, primary "Save" last.
- The computed-status text is JS-injected; badge and reason styling only.

### 11.3 `admin/applications.html` — "Training applications", panel "Applications"

- Toolbar with pending count as a `--surface-2` chip.
- Table: applicant, program, batch, submitted date, decision, action. Date column tabular 12px `--muted`.
- Application modal: wide 640px, document rows (§9.23), decision form with approve/reject as primary/secondary and a `--danger` reject, note textarea 88px.

### 11.4 `admin/programs.html` — "Programs & batches"

- Program list: rows or table with name, fee (tabular, right-aligned), status badge, assessment requirement as a small `--muted` note.
- New program / New batch modals: 560px, §9.18 fields, fieldset rules with 13px legends, end-date hint 12px `--muted`.
- Batch metadata: `Ends <date>` in 12px `--muted`, `End date missing` as a `--warning` badge.
- No card grid; hairline-separated groups.

### 11.5 `admin/assessments.html` — "Assessment management", panel "Assessment records"

- Table: trainee, title, subject, program, due, score (tabular), status badge.
- Create assessment modal: 560px, multi-select trainee list 120px scroll with 34px rows, note text = 12px `--muted`.
- Grade modal: score inputs 40px, fraction display 12px `--muted`, primary "Save grade".

### 11.6 `admin/payments.html` — "Payment management", panels "Payment records", "Recent payment transactions"

- Ledger or figures row: total collected, outstanding, transactions — one gold-marked focus figure.
- Payment records table with right-aligned tabular amounts and a `--muted` currency prefix.
- Record payment modal + Payment details modal: 560px, `facts` rows, amounts at 15px/600 tabular.
- Outstanding amounts use `--danger` text; settled uses `--success`.

### 11.7 `admin/cow-maintenance.html` — "Cow maintenance", panels "Google Calendar", "Cow records", "Daily maintenance activities"

- Calendar panel: container hairline + 16px padding; any iframe keeps its intrinsic size with `max-width: 100%`.
- Cow records table: tag ID monospace, status badge (`Healthy` success, `Observation` warning, `Treatment` danger).
- Activity table: date tabular, cow tag monospace, action, note truncated with `text-overflow: ellipsis` at 240px.
- Add cow record / Add maintenance activity modals: 560px, §9.18.

### 11.8 `admin/settings.html` — "System settings", panels "Authentication settings", "Email settings", "Security settings"

- Three stacked panels, max-width 720px, 16px gap, `padding: 16px` bodies.
- Each panel gets a 13px `--muted` intro line and 14px field gaps.
- Save bar: sticky bottom at ≥900px, `--surface`, hairline top, 40px button right.
- Toggle/checkbox rows: 40px, label 13px/600, helper 12px `--muted`, control right-aligned, `accent-color: var(--accent)`.

### 11.9 Phase 2 acceptance

- [ ] Every portal page uses only Archivo + system mono; no serif glyph renders.
- [ ] Sidebar 240px, topbar 56px, page padding 28/32, all 14 portal pages identical in shell metrics.
- [ ] A 900px-tall viewport shows the header plus ≥12 rows on `trainees`, `applications`, `payments`, `assessments`.
- [ ] No decorative shadow or gradient remains in `portal.css`.
- [ ] All modals, drawers, filters, tables, badges, and forms still function (manual pass on all 8 admin pages).
- [ ] `git diff --stat` shows no changes in `frontend/js/` or `backend/`.
- [ ] Screenshots at 1440×900 and 390×844 for all 8 admin pages.

---

## 12. Phase 3 — Trainee portal

Same component system as Phase 2; the differences are page-specific.

### 12.1 `trainee/dashboard.html` — "Welcome back, {name}."

- Ledger: payment balance as the 28px focus figure with gold marker; assessment average, pending assessments, enrolment status at 22px.
- `Cow maintenance` panel: care list rows (§9.10) with `Sample data` as a `--surface-2` chip.
- `Training application` panel: `facts` rows + status badge + one action link.
- `Profile` panel: identity block (§9.9) + `facts` rows.
- `Training fee` panel: meter (§9.6) with paid/total in tabular figures.
- Right column (if two-column) at 1.55/1; single column ≤1024px.

### 12.2 `trainee/assessments.html` — "My assessments", panel "Assigned assessments" + "How an assessment runs"

- Assessment rows (§9.11): title, subject, assigned/due dates 12px `--muted`, score tabular, badge.
- Process list (§9.12): horizontal at ≥900px, `01–03` mono indices.
- Empty state: dashed block, "No assessments assigned yet", one link back to dashboard.

### 12.3 `trainee/payments.html` — "My payment balance", panels "Payment history", "Training fee progress", "How a payment is recorded"

- Balance figure 28px with gold marker; outstanding amount in `--danger`.
- History table: date tabular, reference monospace, amount right-aligned, method `--muted`, status badge.
- Fee progress meter with remaining balance as a 13px line beneath.
- Process list for the recording flow.

### 12.4 `trainee/cow-maintenance.html` — "Cow maintenance", panels "Assigned animal", "Today's care", "How a care activity is recorded"

- Assigned animal: identity block with tag in mono, plus `facts` rows (breed, age, pen).
- Today's care: care list with completion state per row (`--success` dot + `--success` text for done, `--warning` for due).
- No animal assigned: dashed empty state with a 13px note that assignment is done by the training office (copy may be rewritten).
- Process list closes the page.

### 12.5 `trainee/apply.html` — "Apply for training", "Ready to apply?", "Your application", "Application form", "Before you apply"

- Start card (§9.24) for "Ready to apply?" with one primary CTA.
- "Your application" status block: badge + `facts` rows + timeline of decision in 13px text (no new markup).
- Wizard (§9.19): 3-step indicator, sticky footer, 560px max form width inside a 720px container.
- Documents step: §9.23 rows with upload controls at 40px.
- "Before you apply" panel: 13px list with 8px gaps, hairline above each item.
- Read-only enrolled/completed states must keep their existing gating behaviour and styling.

### 12.6 `trainee/profile.html` — "My profile", panels "Personal information", "Training details"

- Two-column `grid--record`: personal identity block + editable fields; training `facts` rows (ID mono, program, batch, status badge, dates).
- Read-only values 13px `--ink`; editable fields §9.18; save button primary, 40px.
- No avatar upload affordance is added (markup has none).

### 12.7 Phase 3 acceptance

- [ ] All six trainee pages match the admin shell metrics exactly.
- [ ] Wizard, document upload, and application gating still work end to end for a trainee account.
- [ ] Scores, balances, dates, and IDs all use tabular numerals / monospace respectively.
- [ ] Empty, loading, error, and read-only states are visually distinct in all four state variants.
- [ ] Screenshots at 1440×900 and 390×844 for all 6 trainee pages.

---

## 13. Copy rules

Copy may be rewritten under these constraints:

- Keep every factual claim true to the system. Don't promise features that don't exist.
- Keep the human-facing tone plain and direct. No exclamation marks, no marketing superlatives on data pages.
- Sentence case for headings and buttons. Uppercase survives only in micro labels, table headers, and the public eyebrow.
- Numbers always carry units or currency (`₱`, `%`, `of 3`), never a bare figure where ambiguity is possible.
- State copy names the cause and the next action, e.g. "No payment recorded yet. The training office posts payments once received."
- The public hero keeps the brand line "Growing skills. Producing excellence." unless you want it changed; the new UI does not require new headline copy.
- The `Sample data` / demo-data convention is preserved: any page whose figures are static keeps a visible tag, restyled as a `--surface-2` chip, never removed.
- Placeholder copy inside `placeholder=""` attributes is attribute text; changing it is allowed under exception **C** only if you approve. Default: leave placeholders untouched.

---

## 14. Accessibility requirements

- Contrast: body and table text ≥4.5:1 against `--bg`/`--surface`; large text and badge text ≥4.5:1 (badges are small, so they are held to the text threshold on their wash); UI borders ≥3:1 for focusable boundaries.
- Focus is visible on every interactive element, never removed, and never signalled by colour alone (`outline` + ring).
- Status is never colour-only in a table row: the badge text carries the state.
- Tap targets ≥44×44px at ≤560px.
- `prefers-reduced-motion` fully honoured.
- No content hidden at zoom 200%: tables scroll, they don't clip.
- Icon-only buttons keep their existing `aria-label`; no new icon-only controls are introduced.
- Hidden emoji are hidden visually only where they are decorative; anything carrying meaning has adjacent text.

---

## 15. Verification plan

There is no test framework in this repository and none is added.

### Per phase

1. **Scope guard:** `git diff --stat` — only `frontend/css/*` plus the approved files in §8.3. Fail if `frontend/js/`, `backend/`, or any HTML structure changed beyond exception A.
2. **Token guard:** `grep -n "font-family" frontend/css/*.css` returns Archivo/system mono only; `grep -n "linear-gradient\|radial-gradient" frontend/css/*.css` returns nothing; `grep -n "box-shadow"` returns only `--shadow-overlay` usages and the focus ring.
3. **Emoji guard:** list the glyphs with a UTF-8 locale (`LC_ALL=C.UTF-8 grep -n '🐄\|🌾\|🩺\|☰\|←\|→' ...`). A plain `grep` may silently miss multi-byte characters in this environment, so treat the **screenshots** as the authoritative check: no emoji may be visible on any page. Known glyphs today: `☰` at `index.html:25`, plus the three `.program-icon` characters and two `.hero-card-icon` glyphs.
4. **Syntax:** no JS is touched, so no `node --check` is required; run `npx prettier --check frontend/css` for CSS parse validity is **not** useful (files are unformatted today) — instead confirm the browser console is free of CSS parse warnings during the screenshot pass.
5. **Screenshots:** 1440×900 and 390×844 for every page in the phase, captured with the local API running so real data renders. Static/demo pages captured with their tags visible.
6. **Interaction pass:** for the phase's pages only — open every modal, submit an empty form to see validation, trigger one empty state, exercise the mobile drawer, tab through the page once.
7. **Contrast spot-check:** the muted text, badge text, placeholder text, and focus ring against their grounds.

### Sign-off

A phase is done when its acceptance checklist passes, the screenshots are attached for review, and the scope guard shows no unintended files changed.

---

## 16. Out of scope

- Any change to `frontend/js/**` or `backend/**`.
- Markup restructuring beyond the three approved value/copy exceptions.
- New pages, new components, new icons, new fonts, new image assets.
- Dark mode, theme switching, or `prefers-color-scheme` support.
- Photography or illustration sourcing.
- Changing the Google sign-in iframe's appearance.
- `_gsi-test.html`, `_gsi-test2.html`.
- Copy for legal, policy, or fee text that must match an official document.
- Any feature behaviour: filters, pagination, sorting, status derivation, validation rules.
- Reformatting the codebase with Prettier (separate, already-scaffolded work).

---

## 17. Risks and deliberate consequences

1. **"Restyle only" caps what density can fix.** The dashboards keep their current DOM: if a panel's markup forces a stack of long text blocks, CSS can tighten it but not reorder or collapse it. Table columns cannot be dropped. If a page still reads badly at 1440px, that is a markup change for a later phase, not a styling failure to hide.
2. **One sans family means hierarchy comes from weight.** Removing Fraunces removes the strongest existing differentiator. Archivo 600 at 28px with `-0.02em` must do that work; if headings still feel flat in screenshots, the fix is size/tracking, not a new font.
3. **Hidden emoji are a workaround, not a solution.** `font-size: 0` + `color: transparent` leaves the characters in the HTML and in the accessibility tree unless the element is `aria-hidden` in markup (which cannot be added). A screen reader may still announce the glyph. Exception **B** (deleting the three characters) is the clean fix and should be approved if the emoji count grows.
4. **One accent, new structure.** Maroon `#7c1d3d` with pink `#e58aa3` on a gray-blue ground `#f3f5f9` keeps the chrome neutral: near-white surfaces, gray-blue hairlines, one accent, no gradients.
5. **`theme-color` and copy edits are markup edits.** They are declared exceptions; if you want a truly zero-markup change, both stay stale and the mobile browser bar keeps the old paper colour.
6. **Google's button is a fixed seam.** The sign-in iframe will remain Google-styled in the middle of the new form. Acceptable, but visible.
7. **`DESIGN.md` is rewritten.** The farm-ledger rationale, palette table, and anti-slop list are replaced with the new direction. The old document is not preserved in the repo; `git log` is the record. If you want it kept, say so and it moves to `DESIGN-farm-ledger.md`.

---

## 18. Open questions and assumptions

Assumptions I made and will proceed on unless corrected:

1. **`DESIGN.md` is rewritten in Phase 1** to document the new direction (typography, palette, density, component rules), replacing the farm-ledger text.
2. **`fraunces-latin-var.woff2` is deleted** and its `@font-face` removed. Archivo stays exactly as shipped.
3. **The sidebar is a light surface** (`--surface`) with `--ink` text and a rounded `--accent-soft` active item; the dark ground is reserved for the auth brand panel.
4. **The `Sample data` tag survives**, restyled as a neutral chip.
5. **Gold stays as the focus colour.** If you'd rather the focus ring be green, contrast remains fine and the rename is one token.
6. **The public hero keeps its current headline** unless you supply replacement copy.
7. **Screenshots are taken by me running the app locally** (frontend static server + backend API with seeded data) and attached per phase for review.
8. **Phase 1 is the first implementation deliverable.** Phases 2 and 3 are detailed here but built after Phase 1 sign-off.
9. **The references in §4.4 are pattern-level, not version-pinned.** If any of those products has changed its look by build time, borrow the named pattern from the table rather than its current paint.
