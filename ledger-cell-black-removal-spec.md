# Ledger cell — remove the black fill — Spec

**Status:** Draft for approval
**Requested:** "remove the black color in the ledger_cell"
**Scope agreed in interview:** flatten `ledger__cell--focus` so it looks exactly like its three siblings — no dark fill, no reversed cream/hay text, no surviving emphasis — and soften the hairline dividers. CSS and documentation only; **no markup changes**, no other component touched.

---

## 1. Problem and outcome

Every admin and trainee page opens with a four-cell `.ledger` summary strip. One of those four cells carries `ledger__cell--focus`, and that class is the only thing on the strip that is painted black:

```css
/* frontend/css/portal.css:638-652, today */
.ledger__cell--focus {
  background: var(--ink);            /* #161c14 — the near-black block */
}

.ledger__cell--focus .ledger__label {
  color: rgba(241, 235, 220, 0.62);  /* cream, inverted for the dark ground */
}

.ledger__cell--focus .ledger__value {
  color: var(--hay);                 /* #e7b23f gold */
}

.ledger__cell--focus .ledger__note {
  color: rgba(241, 235, 220, 0.58);
}
```

Because the fill is dark, the cell also forces inverted text colours; removing only the `background` would leave cream and gold text on a white surface (≈1.1:1 and ≈1.6:1 — effectively invisible). The fix therefore has to remove the fill **and** the colour overrides together.

After this change:

- All four ledger cells on all 11 pages compute to the same background (`--surface`, i.e. nothing of their own) and the same text colours (`--muted` label/note, `--ink` value).
- The figures are already the same size everywhere — `.ledger__value` has a single `clamp(1.9rem, 1.25rem + 1.7vw, 2.7rem)` and `--focus` never changed it — so no size work is needed.
- The two dashboards that wrap the focus cell in an `<a>` no longer flip to a black hover.
- The ledger reads as one flat strip of four equal cells inside its white panel.

---

## 2. Current state, verified

**The only black in the ledger**

| Where | Lines | Declaration |
| --- | --- | --- |
| `.ledger__cell--focus` | 638–640 | `background: var(--ink)` |
| `.ledger__cell--focus .ledger__label` | 642–644 | `color: rgba(241, 235, 220, 0.62)` |
| `.ledger__cell--focus .ledger__value` | 646–648 | `color: var(--hay)` |
| `.ledger__cell--focus .ledger__note` | 650–652 | `color: rgba(241, 235, 220, 0.58)` |
| `a.ledger__cell--focus:hover, a.ledger__cell--focus:focus-visible` | 2311–2314 | `background: var(--ink)` |

(All line numbers are `frontend/css/portal.css` as it stands today. The file uses CRLF line endings.)

**Tokens involved**

| Token | Value | Declared |
| --- | --- | --- |
| `--surface` | `#fffdf7` | line 21 |
| `--ink` | `#161c14` | line 23 |
| `--muted` | `#69715f` | line 25 |
| `--line` | `#d9d1be` | line 27 |
| `--line-2` | `#c4baa2` | line 28 |
| `--hay` | `#e7b23f` | line 32 |
| `--paper` | `#f2ede1` | line 20 |

**Pages carrying the class (11)**

| Page | Line | Element | Cell label |
| --- | --- | --- | --- |
| `frontend/admin/applications.html` | 199 | `div` | (first cell — focus) |
| `frontend/admin/assessments.html` | 206 | `div` | Pending |
| `frontend/admin/cow-maintenance.html` | 187 | `div` | Pending activities |
| `frontend/admin/dashboard.html` | 195 | **`a`** → `assessments.html` | Pending assessments |
| `frontend/admin/payments.html` | 217 | `div` | Outstanding balance |
| `frontend/admin/programs.html` | 193 | `div` | Slots remaining |
| `frontend/admin/trainees.html` | 187 | `div` | Pending enrolment |
| `frontend/trainee/assessments.html` | 167 | `div` | Pending |
| `frontend/trainee/cow-maintenance.html` | 169 | `div` | Pending tasks |
| `frontend/trainee/dashboard.html` | 156 | **`a`** → `payments.html` | Payment balance |
| `frontend/trainee/payments.html` | 169 | `div` | Remaining balance |

Exactly two ledgers put the class on an anchor (`admin/dashboard.html`, `trainee/dashboard.html`); the other nine use a plain `div`. `frontend/css/portal.css` is the only stylesheet that mentions `ledger` — `auth.css` and `style.css` do not.

**Related rules that must keep working**

- `.ledger` (590–598): grid, `background: var(--surface)`, `1px solid var(--line)`, `--r-lg`, `overflow: hidden`, `rise` animation.
- `.ledger__cell` (601–608): flex column, `gap: 6px`, `padding: 22px 22px 20px`, `border-inline-start: 1px solid var(--line)`.
- `.ledger__cell:first-child` (610–612): no start border.
- `.ledger__label` (614–620), `.ledger__value` (622–630), `.ledger__note` (632–636).
- ≤980px (2016–2026): ledger 2×2, `nth-child(2n+1)` drops the start border, `nth-child(n+3)` adds `border-top: 1px solid var(--line)`.
- ≤600px (2141–2143): cell padding `18px`.
- ≤480px (2183–2192): ledger 1-up, `.ledger__cell { border-inline-start: 0 }`, `nth-child(n+2) { border-top: 1px solid var(--line) }`.
- `a.ledger__cell` (2301–2304): `color: inherit; text-decoration: none`.
- `a.ledger__cell:hover, :focus-visible` (2306–2309): `background: var(--paper)`.
- Reduced motion (2219–2223): `.ledger` animation off — nothing to change.
- `@media (prefers-contrast: more)` (2233–2247): overrides `--line: #a89e89`, `--line-2: #8e846f`, `--muted: #4d5546`.

**Doc drift worth knowing:** `ui-redesign-spec.md` and `DESIGN.md` describe a 28px focus figure with a 24px gold marker under it. **That styling was never implemented** — the current `--focus` cell only changes colours. Nothing in this change needs to delete a marker, and the implementation must not "restore" one.

---

## 3. Decisions locked in the interview

| Topic | Decision |
| --- | --- |
| What "black" means | The `var(--ink)` fill behind `ledger__cell--focus` **and** the cream/hay colours it forces. Not body text or other `--ink` uses |
| Replacement surface | **Same as its siblings** — no fill of its own, the shared `--surface` shows through |
| Emphasis on the focus cell | **None.** Visually identical to the other three cells in every respect |
| Text colours | Reset to the sibling tokens: label/note `var(--muted)`, value `var(--ink)` |
| Selectors | **Kept in place as empty no-ops**, each group with a short comment saying the focus cell is intentionally unstyled |
| Linked focus cells | `a.ledger__cell--focus:hover/:focus-visible` must behave **exactly like any other linked cell** (`--paper`) |
| Dividers | Vertical hairline **softened** to `--line` at ~55% strength; the ≤980px / ≤480px `border-top` row rules **stay at full `--line`** |
| Ledger container | Unchanged: `--surface` panel, `1px solid var(--line)` outer border, `--r-lg`, `rise` animation |
| Markup | Unchanged on all 11 pages — the class stays where it is |
| Documentation | Update the ledger-specific sentences in `DESIGN.md`, `ui-redesign-spec.md`, `dashboard-live-data-spec.md`. **Do not** touch `DESIGN.md`'s palette table or fix the wider doc/token drift |
| Verification | Static review of the final CSS — no browser/screenshot pass requested |

---

## 4. Implementation — exact CSS

All edits are in `frontend/css/portal.css`. Apply in this order; the printed line numbers refer to the file **before** any edit.

### 4.1 Add a soft divider token to `:root`

After line 28 (`--line-2: #c4baa2;`):

```css
  --line: #d9d1be;
  --line-2: #c4baa2;
  --line-soft: rgba(217, 209, 190, 0.55);
```

A token rather than an inline `rgba()` because `prefers-contrast: more` already redefines `--line`; the soft divider has to be able to follow it (see 4.5). Do **not** use `color-mix()` — a literal token keeps the declaration identical in every engine the portal supports.

### 4.2 Soften the vertical divider

Replace line 607 inside `.ledger__cell`:

```css
  border-inline-start: 1px solid var(--line);
```

with:

```css
  border-inline-start: 1px solid var(--line-soft);
```

Nothing else in `.ledger__cell` changes (padding, gap, flex column stay). `.ledger__cell:first-child { border-inline-start: 0 }` and the `.ledger` outer border keep the full-strength `--line`.

### 4.3 Neutralise the focus cell

Replace lines 638–652 (the four `--focus` rule blocks) with:

```css
/* The focus cell is intentionally unstyled: the ledger reads as four equal
   cells. `--focus` stays in the markup as a no-op — do not re-add a fill. */
.ledger__cell--focus {
}

.ledger__cell--focus .ledger__label {
}

.ledger__cell--focus .ledger__value {
}

.ledger__cell--focus .ledger__note {
}
```

Keep the four selectors in this order and in this position inside the `Ledger` section so a future contributor finds the retired highlight next to the component it belongs to. No `background`, no `color`, no `font-size`, no `::after`, no `::before`.

### 4.4 Neutralise the linked focus-cell hover

Replace lines 2311–2314 with:

```css
/* Linked focus cells hover exactly like every other linked cell. */
a.ledger__cell--focus:hover,
a.ledger__cell--focus:focus-visible {
}
```

The generic `a.ledger__cell:hover, a.ledger__cell:focus-visible { background: var(--paper) }` above it (2306–2309) now supplies the only hover treatment. The global `:focus-visible` gold outline at lines 128–132 still applies — do not remove it.

### 4.5 Keep high-contrast dividers full strength

In the existing `@media (prefers-contrast: more)` block (2233–2247), after `--line-2: #8e846f;` add:

```css
  :root {
    --line: #a89e89;
    --line-2: #8e846f;
    --line-soft: var(--line);
    --muted: #4d5546;
  }
```

A user who asks for more contrast gets 1px `#a89e89` dividers, not the softened wash.

### 4.6 Full replacement block for the `Ledger` section (for reference)

```css
.ledger {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 20px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  animation: rise 0.5s var(--ease-out) 0.05s both;
}

.ledger__cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 22px 22px 20px;
  border-inline-start: 1px solid var(--line-soft);
}

.ledger__cell:first-child {
  border-inline-start: 0;
}

.ledger__label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--muted);
}

.ledger__value {
  font-family: var(--font-display);
  font-size: clamp(1.9rem, 1.25rem + 1.7vw, 2.7rem);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

.ledger__note {
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--muted);
}

/* The focus cell is intentionally unstyled: the ledger reads as four equal
   cells. `--focus` stays in the markup as a no-op — do not re-add a fill. */
.ledger__cell--focus {
}

.ledger__cell--focus .ledger__label {
}

.ledger__cell--focus .ledger__value {
}

.ledger__cell--focus .ledger__note {
}
```

---

## 5. What must not change

- **No HTML/JS edits.** Not one of the 11 pages loses `ledger__cell--focus`; the class stays as a hook (and as the record of which metric is the actionable one). `git diff` should show `frontend/css/portal.css` plus markdown only.
- **No other `--ink` use.** Body text, `.page__head`, `.avatar--sm`, `.nav__link.is-active`, sidebar surfaces and the rest stay exactly as they are. Only the five declarations in §2 change.
- **The `.ledger` container** keeps its `--surface` ground, `--line` outer border, radius and `rise` animation.
- **Row dividers stay full strength.** The ≤980px 2×2 `border-top: 1px solid var(--line)` and the ≤480px 1-up equivalent are untouched.
- **Responsive padding rules** (≤600px `18px`) and the ledger grid column changes are untouched.
- **The reduced-motion block** needs no change — it only names `.ledger` for the entrance animation.
- **Other components that use `--hay`** — selection highlight, `:focus-visible` outline, brand mark, avatars, active nav marker, badge counts, `.assessment-*` styling — are untouched. Removing the ledger's use of `--hay` does not retire the token.

---

## 6. Resulting appearance

- Along the strip: no cell has a fill; the white `--surface` of the `.ledger` panel shows through all four.
- Vertical separators: `1px` of `rgba(217, 209, 190, 0.55)` over `#fffdf7`, i.e. roughly `#eae5d8` — visible as a hairline, appreciably quieter than the `#d9d1be` outer border.
- Labels: `10.5px` uppercase `#69715f` on `#fffdf7` — ≈5.0:1 contrast, passes AA for small text.
- Values: `clamp(1.9rem … 2.7rem)` `#161c14` on `#fffdf7` — ≈17.3:1.
- Hover on the two linked ledgers: `--paper` `#f2ede1` for every cell, focus cell included; keyboard focus shows the existing 2px `--hay` outline and nothing else.
- ≤980px (2×2): soft verticals between columns, full-strength `#d9d1be` horizontal rules between rows.
- ≤480px (1 column): all vertical rules removed by the existing block, full-strength `#d9d1be` rules between rows.

---

## 7. Documentation updates

Only the sentences that describe the focus cell / dark cell. The stale palette table in `DESIGN.md` (`--bg`, `--surface #ffffff`, `--line #e2e6df`, `--gold`, which `portal.css` does not actually use) is deliberately left alone — it is a separate issue.

### 7.1 `DESIGN.md`

| Line | Today | Change to |
| --- | --- | --- |
| 14–15 | `3. **Gold is not decoration.** It survives as the focus ring and one attention marker per page.` | `3. **Gold is not decoration.** It survives as the focus ring.` — the ledger's marker is gone and no other component carries one |
| 102 | `- Four identical stat cards replaced by one ledger with a single focus figure.` | `- Four identical stat cards replaced by one flat ledger of four equal cells.` |

Leave line 39 (`Figure L`) and line 61 (`--gold`) as they are — they describe type/global tokens, not the ledger.

### 7.2 `ui-redesign-spec.md`

| Line | Today | Change to |
| --- | --- | --- |
| 514 (constraint C) | "…It is restyled to be visually equal to its siblings except for the 28px figure and the 24px gold marker; it is not a dark block." | "…It is styled exactly like its siblings: no fill, no larger figure, no gold marker. The class remains in markup as a no-op." |
| 555 | "`.ledger__cell--focus .ledger__value`: 28px and a `::after` 24px × 3px `--gold` rule 8px below." | "`.ledger__cell--focus`: no declarations. The focus cell is intentionally unstyled and equals its siblings in fill, colour and figure size." |
| 583 | "Exactly one figure per page may carry the 24px gold marker (the same one as `.ledger__cell--focus` if the ledger is present; otherwise the first figure)." | Drop the ledger clause: "The ledger carries no gold marker; `.ledger__cell--focus` is a no-op." |
| 963 | "Ledger: four metrics, one 28px focus figure with gold marker (whichever metric is the actionable one — pending applications)." | "Ledger: four equal metrics, no focus figure or marker." |
| 995 | "Ledger or figures row: total collected, outstanding, transactions — one gold-marked focus figure." | "Ledger: total collected, outstanding, transactions — four equal cells, no marker." |
| 1032 | "Ledger: payment balance as the 28px focus figure with gold marker; assessment average, pending assessments, enrolment status at 22px." | "Ledger: payment balance, assessment average, pending assessments, enrolment status — four equal cells, uniform figure size." |

Also add the divider decision where the ledger is specified (§9.3, around line 551): `.ledger__cell` divider is `1px solid var(--line-soft)` and row dividers at narrow widths remain `1px solid var(--line)`.

Lines 107 and 148 ("no ledger strip with a dark feature cell", "the dark hay-gold feature cell in the ledger") are historical anti-goals that remain true — leave them.

### 7.3 `dashboard-live-data-spec.md`

| Line | Today | Change to |
| --- | --- | --- |
| 285 | "The `ledger__cell--focus` highlight stays on the Balance card." | "The `ledger__cell--focus` class stays on the Balance card as a marker only; it carries no styling." |

---

## 8. Acceptance criteria

1. `frontend/css/portal.css` contains no declaration inside any `.ledger__cell--focus` selector. A grep for `--focus` in the file returns only empty rule blocks plus their comments.
2. No `var(--ink)`, `var(--hay)` or `rgba(241, 235, 220, …)` remains in the ledger section.
3. `--line-soft` is declared once in `:root`, used once on `.ledger__cell`, and overridden once in `@media (prefers-contrast: more)`.
4. `a.ledger__cell--focus:hover` / `:focus-visible` resolve to the same background as `a.ledger__cell:hover` (`--paper`).
5. The ≤980px and ≤480px blocks are byte-identical to before (`var(--line)` row rules, no soft token).
6. `git diff --stat` lists `frontend/css/portal.css` and the three markdown files; no `.html` or `.js` file is modified.
7. The six doc lines in §7 read as specified.
8. Verification is by reading the final CSS and the diff — no browser run, no screenshots (as agreed).

---

## 9. Known consequences and risks

1. **Deliberate asymmetry at narrow widths.** From 980px down, vertical separators are soft (`--line-soft`) while horizontal row separators are full-strength (`--line`). This follows the decision to leave row rules as-is; it looks like a table with stronger row bands than column rules. Easy to revisit by switching the two `border-top` declarations, but it is out of scope here.
2. **The class becomes semantically empty.** `--focus` no longer marks anything visually, so the "actionable metric" cue on each page disappears. That is the requested outcome; the class is kept in markup only as a hook and as documentation of intent. A future pass could use it for a non-colour cue (e.g. an earlier plan for a gold rule) — the empty selectors are left as the place to do that.
3. **Two dashboards lose their primary-action emphasis.** `admin/dashboard.html` (Pending assessments) and `trainee/dashboard.html` (Payment balance) were the only *linked* cells whose dark fill advertised "start here". After the change they are ordinary links: `cursor` plus the `--paper` hover plus the gold focus outline. If discoverability becomes a complaint, the fix is a separate affordance (underline on the label, a chevron, an arrow link), not a reinstated fill.
4. **Empty CSS rules.** Lint or minification tooling that strips empty rules will remove them; the comment above the group explains why they must not be re-added with declarations. If a linter fails the build on empty rules, the acceptable alternative is to keep the comment and delete the selectors — do not add placeholder declarations.
5. **Doc drift left in place.** `DESIGN.md`'s palette table still documents `--bg`, `--surface #ffffff`, `--line #e2e6df`, `--gold`, none of which `portal.css` uses. This spec intentionally does not fix that; it only corrects what it directly makes false.
6. **No visual regression check.** Verification is static, per the interview. A screenshot review of one admin ledger and one trainee ledger at desktop / 900px / 480px would be the obvious follow-up if the flat strip looks wrong in practice.

---

## 10. Assumptions

1. "The ledger_cell" means `.ledger__cell--focus` — the only element in `.ledger` painted with a dark colour. No other black exists in the ledger.
2. "Make all the cells the same color" refers to the cell surfaces, not to borders, labels or values.
3. The pale `--line-soft` value (`rgba(217, 209, 190, 0.55)`) is the chosen 55% strength; it was described in the interview as "roughly half opacity of the current `--line`".
4. High-contrast users should see full-strength dividers — hence `--line-soft: var(--line)` inside `prefers-contrast: more` rather than a lighter fixed value.
5. No new tokens, font sizes, animations or components are introduced beyond `--line-soft`.
6. The two markdown specs are living documents that get corrected when the implementation contradicts them; `ui-redesign-spec.md`'s historical anti-goal lines are not rewritten.

---

## 11. File map

| File | Change |
| --- | --- |
| `frontend/css/portal.css` | 4 edits: `:root` token (after 28), `.ledger__cell` border (607), focus block (638–652), linked hover block (2311–2314), plus the contrast override (inside 2233–2247) |
| `DESIGN.md` | 2 lines: 14–15, 102 |
| `ui-redesign-spec.md` | 6 lines: 514, 555, 583, 963, 995, 1032, plus the ledger divider rule in §9.3 |
| `dashboard-live-data-spec.md` | 1 line: 285 |
| 11 HTML pages | **No change** — the class stays |
