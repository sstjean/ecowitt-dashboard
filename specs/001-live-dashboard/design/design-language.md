# Ecowitt Dashboard — Design Language

**Status:** Living source of truth for UI development of the Live Dashboard (feature `001-live-dashboard`).
**Last updated:** 2026-06-21
**Companion artifact:** [prototype.html](prototype.html) — the working reference implementation of everything below.

> This document is authoritative for layout, hierarchy, color, typography, components, and
> data-state behavior. When the prototype and this document disagree, **this document wins** and
> the prototype is corrected. Code (CSS variables, component specs) must trace back to a rule here.

---

## 1. Product intent (why the UI looks the way it does)

The dashboard is a **wall-mounted, always-on weather console** for the kitchen, plus a phone view.
Its single most important job answers one question at a glance, from across the room:

> **"What is it like outside right now?"**

Everything else (indoor comfort, rain totals, sky, pressure) is **supporting context**, not the headline.
This intent drives every hierarchy and sizing decision below.

### Core principles

| # | Principle | What it means in practice |
|---|-----------|---------------------------|
| P1 | **Glanceability first** | The outdoor "now" reading is legible in < 1 second from ~3 m away. |
| P2 | **One screen, no scroll (kiosk)** | On the kiosk/landscape view, *all* panels are visible at once. Scrolling is a failure state, mirroring the physical console. |
| P3 | **Hierarchy by size** | Importance is encoded by area and type scale. The top gauge band (Outdoor + Indoor) carries the largest type; the lower context band (rain, sky, pressure) is smaller. |
| P4 | **Calm, ambient** | A display you glance at, not a UI you operate. Minimal motion, no attention-grabbing animation. |
| P5 | **Honest data** | Missing/stale values are shown as missing — never as a misleading `0`. |
| P6 | **Color carries meaning** | Data colors (temperature, trend, UV) encode values; chrome colors stay neutral so data colors pop. |

---

## 2. Layout system

### 2.1 The hierarchy tiers

Panels are assigned to one of two tiers. Tier dictates size, type scale, and placement.

| Tier | Panels | Visual weight | Rationale |
|------|--------|---------------|-----------|
| **Tier 1 — primary gauges** | **Outdoors** (temperature + wind) as two large primary dials filling the **left column**; **Indoors** (temperature + humidity) as two *smaller* companion dials at the top of the **right column** | Outdoor rings are the largest type on screen; indoor rings ~57% of their diameter | Outdoor conditions are the headline (read first, from across the room); indoor temp/humidity are a quick secondary glance, deliberately smaller — mirroring the reference console the household already likes. |
| **Tier 2 — context** | Solar & Sky (under Outdoors, left column); Rainfall + Barometer (stacked under Indoors, right column) | Medium cards | Context you check after the headline dials. |

> **Design decision — two columns, not horizontal bands.**
> Mimics the reference console exactly. The **left column** is Outdoors (large temp + wind dials,
> metric strip) with Solar & Sky beneath. The **right column** stacks the small Indoor temp/humidity
> rings on top, then Rainfall, then Barometer. Indoor is intentionally *not* co-equal: the reference
> sizes the indoor rings at roughly 57% of the outdoor rings, and the single requirement —
> *legible at 10 ft* — is satisfied by the big outdoor dials while indoor stays a calmer secondary
> read at the top of the context stack. Solar,
> rainfall, and pressure drop to the lower band.

### 2.2 Kiosk (landscape) grid — the canonical layout

A fixed, non-scrolling grid that fills the viewport (`100dvh`, `overflow: hidden`).

```
┌───────────────────────────── header (slim) ─────────────────────────────┐
│ ☰ menu                Sunday, June 21st                    10:29:14 pm    │
├──────────────────────────────────────────┬───────────────────────────────┤
│  OUTDOORS (tier 1, large)                │  Indoor temp + humidity (small)│
│  temp ring + wind compass                ├───────────────────────────────┤
│  + metric strips                         │  Rainfall (tier 2)             │
│                                          │  droplet + totals              │
│  Solar & Sky (tier 2)                    ├───────────────────────────────┤
│  day arc + sun / moon                    │  Barometer (tier 2)            │
└──────────────────────────────────────────┴───────────────────────────────┘
```

- **Two columns (flexbox).** Left column ≈ 1.45fr: Outdoors (large temp + wind rings + metric strip) on top, Solar & Sky beneath. Right column ≈ 1fr: small Indoor rings (~57% of outdoor), then Rainfall (grows to fill), then a short Barometer row.
- The sky-condition icon lives in the Barometer card. The **header** is a three-zone row: a hamburger menu button (left), the **centered date** with a superscript ordinal (e.g. *June 21ˢᵗ*), and the **right-aligned time** (Eastern, seconds, lowercase am/pm) — no location text and no timezone label.
- Columns and cards use `flex` ratios so the layout always fits the viewport exactly; gauges scale with `clamp()`/aspect-ratio and are capped so they never force a scrollbar.

> **Design decision — flex columns + capped gauges instead of fixed pixel sizes.**
> A wall kiosk and a laptop preview differ in resolution; flex-ratio columns keep the
> "everything visible, no scroll" guarantee across sizes without per-device tuning.

### 2.3 Responsive strategy (the one place scrolling is allowed)

| Breakpoint | Behavior |
|------------|----------|
| **≥ 900px (landscape / kiosk)** | Canonical fixed grid above. **No scroll.** |
| **< 900px (phone, portrait)** | Single-column stack, **outdoor first** (Outdoors → Solar & Sky → Indoors → Rainfall → Barometer), scrolling permitted. The phone cannot honor "no scroll" without making text unreadable, so we prioritize P1/P3 (outdoor-first, legible) over P2 here. Below ~540px the header keeps its hamburger / date / time row but shrinks the date and time to 14px. |

> **Design decision — kiosk gets "no scroll"; phone gets "outdoor-first scroll."**
> *Chosen* over forcing one layout everywhere. Cramming the full console onto a phone with no
> scroll would shrink type below legibility. The phone is a glance-and-go secondary surface, so a
> short scroll with the headline pinned at top is the better trade.

---

## 3. Spacing & shape

- **Base unit:** 4px. All gaps/padding are multiples (4, 8, 12, 16, 20, 24).
- **Outer app padding:** 16px (kiosk), 12px (phone).
- **Inter-card gap:** 12px.
- **Card padding:** 14px (all cards); inner controls 10px.
- **Card radius:** 16px (cards), 10px (inner controls/buttons).
- **Card shadow:** subtle only — `0 0 2px rgba(0,0,0,.12), 0 1px 2px rgba(0,0,0,.14)`. No dramatic glassmorphism.
- **Density rule:** tier-2 context cards drop section titles to a single inline label to save vertical space.

---

## 4. Typography

- **Primary font:** `"Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif`.
- **Numeric/mono (optional, for fixed-width readouts):** `Consolas, "Courier New", monospace`. Avoid for AM/PM clock strings (narrow-space spacing looks broken in mono).

### Type scale (legibility-at-distance driven)

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| `display` | clamp ~44–72px | 600 | The outdoor temperature number (the headline). |
| `value-lg` | 32–40px | 600 | Wind speed, indoor temp, daily rain, pressure. |
| `value` | 18–22px | 600 | Metric-strip values (dewpoint, gust…). |
| `label` | 11–12px | 600, uppercase, +0.1em tracking | Field labels, card titles. |
| `meta` | 13–14px | 400 | Secondary text (condition phrase, times). |

> **Design decision — one oversized display number, everything else stepped down.**
> A single dominant numeral is what makes the headline readable across the room (P1). Competing
> large numbers would flatten the hierarchy.

---

## 5. Color system

Chrome (backgrounds, surfaces, borders, text) uses the **Clawpilot** theme tokens so the app stays
neutral and theme-able. **Data colors** are a separate, semantic palette layered on top — they are
the only saturated colors on screen, so they read as meaningful.

### 5.1 Theme & chrome (tokens)

Dark is the **default** (wall console). Light is supported via `?clawpilotTheme=light`. All chrome
colors reference `var(--cp-*)` tokens (see prototype `:root`/`[data-theme="dark"]`). Never hardcode
chrome colors.

### 5.2 Data palette (semantic — these may be literal values)

| Datum | Encoding | Notes |
|-------|----------|-------|
| **Temperature** | Cold→hot gradient (table §5.3) | Drives both outdoor and indoor rings, rendered as a **closed full ring** whose stroke is a light↔dark gradient of the §5.3 color — value is encoded by hue, not by an arc fraction (see decision below). |
| **Humidity** | Single violet `#7c6cf0` | Distinct from temperature so the two rings never read as the same scale. |
| **Wind needle** | Accent `var(--cp-accent)` for the pointer, neutral tail | Direction is shape-encoded (needle), not color-dependent. |
| **Rain fill** | Water blue `#4da6ff`, escalating amber→red on overflow | Droplet fill encodes the daily total. Once daily rain exceeds the 4 in cap the (already full) droplet shifts blue→amber→red to flag an extreme day. |
| **UV index** | Standard WHO bands (green/yellow/orange/red/violet) | Reserved for a future UV chip; document now for consistency. |
| **Pressure trend** | `--cp-success` rising / `--cp-text-muted` steady / `--cp-danger` falling | Paired with ↗ → ↘ arrow glyphs so it never relies on color alone (P6 + a11y). |

### 5.3 Temperature → color scale (resolves spec CL-001)

Anchor stops in °F; the ring color is **linearly interpolated** between adjacent stops for a smooth
sweep across the **visible spectrum — violet (coldest) → red (hottest)**. Bands are named for shared
vocabulary, not hard edges. The scale runs to **120°F** so summer "feels like" heat-index values that
exceed 100°F still map to a distinct hot color.

| °F | Color | Band |
|----|-------|------|
| ≤ 10 | `#8a2be2` violet | Frigid |
| 25 | `#4a4fe0` indigo | Very cold |
| 38 | `#2274e0` blue | Cold |
| 50 | `#14b8c4` cyan | Cool |
| 62 | `#34c759` green | Mild |
| 74 | `#f2c200` yellow | Warm |
| 86 | `#ff8c1a` orange | Hot |
| 100 | `#f0492b` red-orange | Very hot |
| ≥ 120 | `#d61f1f` red | Extreme |

> **Design decision — smooth interpolation across the visible spectrum, not hard color steps.**
> A continuous violet→red gradient communicates "trending warmer/colder" subtly as the value drifts, which
> a stepped scale cannot. Anchors are spaced across the rainbow (violet=frigid, blues/cyan=cold, green=mild,
> yellow=warm, orange/red=heat-stress) and the ramp extends to 120°F to cover summer heat-index values.

> **Design decision — indoor ring shares the outdoor temperature scale (resolves CL-002).**
> *Chosen* so "73°F" looks the same color whether inside or out — one mental color key for the whole
> screen. *Alternative considered:* a separate, muted indoor scale (to reinforce hierarchy); rejected
> because two temperature color languages is a memory tax for marginal benefit. Indoor is de-emphasized
> by **size**, not by a different color system.

> **Design decision — temperature is a closed gradient ring, not a partial value arc.**
> The temp rings render as a *full* circle stroked with a light↔dark gradient of the §5.3 color, rather
> than an arc that fills proportionally to where the reading falls in the local record range. *Chosen*
> because hue already carries the temperature meaning (P6) and a complete ring reads as a calm, finished
> object from across the room; a partially-filled arc invited "how full is it?" questions that the color
> answers better. This supersedes the earlier "fill range 18…103°F" mapping (CL-001) for the temp rings —
> the §5.3 anchors now define the **color** at a given temperature, not an arc length. (Indoor *humidity*
> keeps a partial arc, since 0–100% is a true bounded fraction.)

---

## 6. Iconography

- **Style:** rounded line icons, 2px stroke, `currentColor`. Filled shapes only for weather glyphs
  (sun disc, cloud, droplet, moon) where fill aids recognition.
- **Condition icon:** sun / partly-cloudy / cloud / rain / storm / snow / night variants.
- **Moon phase:** 8-phase shaded disc.
- **Nav icons:** Live (clock), History (line chart), Trends (bars), Records (target), Settings (gear).

---

## 7. Component specifications

### 7.1 Outdoors (tier 1)

- **Internal layout:** three gauges in a row — **temperature ring** (left, large), **Feels Like ring**
  (center, small) and **wind compass** (right, large) — above a divided **metric strip**.
- **Temperature ring:** a **closed full ring** stroked with a two-stop gradient of the §5.3 temperature
  color (a darker shade at the bottom-right easing to a lighter shade at the top-left). Temperature is
  encoded by **hue** — *not* by a partial arc fraction — so the value reads instantly by color from across
  the room; the center shows the `display` temperature with `↑high` (warning) / `↓low` (link) beneath.
- **Feels Like ring:** a smaller closed gradient ring (**same diameter as the indoor rings**, ~57% of the
  big outdoor ring) using the identical §5.3 temperature color treatment, sited between the temperature and
  wind dials with a "Feels Like" label beneath. Because the heat index regularly exceeds 100°F in summer,
  its color reads on the §5.3 scale that now extends to 120°F.
- **Wind compass:** circular dial with **N/E/S/W cardinal labels pulled inward from the rim** (so they
  never merge with the ring) while the 30° **tick marks sit at the rim**, plus an accent **rim marker**
  rotated to the bearing the wind comes *from*. The ring outline and ticks use `--cp-text-muted`
  (≥ 3:1 contrast — see §10). The marker sits on the outer ring (apex at the rim) so it never overlaps the
  center readout; center shows speed + `mph`, cardinal + degrees, and gust.
- **Metric strip:** left group = Dewpoint · Humidity; right group = 10-Min Avg · Max Daily Gust.
- **Sub-grouping** (thin divider between temp metrics and wind metrics) keeps the dense card scannable.
- **Whole-number temperatures:** all temperature readouts (outdoor, feels-like, dewpoint, hi/lo, indoor) are
  rounded to whole degrees and rendered with a bare `°` — "hot is hot," and shorter strings never overflow the ring.

### 7.1b Indoors (tier 1, smaller)

- **Internal layout:** two rings side by side — **indoor temperature** (left, a closed gradient ring
  per §5.3, identical treatment to the outdoor temp ring) and **indoor humidity** (right, a *partial*
  arc gauge in violet `#7c6cf0`) — each with a label beneath ("Indoor Temperature" / "Indoor Humidity").
- The rings are **~57% of the outdoor gauge diameter**: indoor is a *secondary* companion read, not a co-equal
  peer. The big outdoor dials carry the 10-ft legibility requirement; indoor stays a calmer glance, matching the
  reference console's proportions.
- Stale/missing indoor data follows P5 (dashed muted ring + `—`), never a misleading `0`.

### 7.2 Rainfall (tier 2)

- **Three-column body:** the enlarged **droplet** (left) whose fill height = `min(dailyRain / capacity, 1)`.
  Capacity = **4.0 in** for a full droplet — an engineered cap for ZIP 32833, set above the 3.65 in 2025
  wettest day and the 2.00 in calendar-day record (resolves CL-003). Beyond the cap the droplet stays full
  and its **color escalates blue→amber→red** across the next 4 in of overage to flag an extreme rain day.
- Center column: the prominent **Daily Rain** value. Right column: a compact list for
  Event / Hourly / Weekly / Monthly / Yearly (inches), sized at 15px with extra left spacing so it reads
  clearly and sits apart from the daily total. On narrow phones (< 540px) the list drops below.

### 7.3 Solar & Sky (tier 2)

- **Solar** (W/m²) and **UV Index** readouts.
- An enlarged **day arc** spanning the **full card width** (endpoints reach the left/right edges), with a
  **sun marker** positioned by `f = clamp((now − sunrise)/(sunset − sunrise), 0, 1)`, placed on a
  half-ellipse (`θ = π(1 − f)`). The dome is deliberately **flat** (a wide-short card needs a flat dome
  so the full-width arc stays short enough to fit). Marker dims below the horizon line after sunset.
- **Two vertical levels, mirroring the reference console:** **Solar** (W/m²) and **UV Index** overlay the
  **dome interior**, vertically centered — these are the primary readouts. **Sunrise** and **Sunset** times
  sit **inside the dome on the baseline** at its left/right feet (sunrise left-aligned, sunset right-aligned),
  rendered **smaller and lighter** so they read as secondary to Solar/UV. The **moon-phase** glyph sits in
  the **top-right corner** of the card.

### 7.4 Indoor — see §7.1b

Indoor temperature + humidity are **smaller companion dials within the tier-1 top band**, specified in §7.1b
(two rings ~57% of the outdoor gauge size, labels beneath). They are secondary to — not co-equal with — Outdoors.

> **Design decision — indoor sized as a smaller companion, not a co-equal peer.**
> An interim revision briefly made indoor the same size as outdoor; that was corrected to match the
> household's reference console, where the indoor rings are ~57% of the outdoor rings. Outdoor temp +
> wind are the large headline dials (they carry the 10-ft legibility requirement); indoor temp +
> humidity sit to their right as smaller secondary dials. The top band is laid out with flexbox so the
> two groups can differ in size, rather than an equal-split grid.

### 7.5 Barometer (tier 2)

- Absolute pressure (**hPa**) + 3-hour **trend** (↗ rising / → steady / ↘ falling arrow + delta, colored per §5.2).
- **Three-column layout** (`40% / 20% / 40%`): the pressure block sits in the left column, the center
  column is intentionally empty as breathing room, and the enlarged **sky-condition icon** (sun / cloud /
  rain…) — moved out of the header — sits in the right column.
- The pressure block is **stacked**: a small right-aligned `ABS` / `hPa` unit label column (both 13px,
  same size) to the left of the large pressure value, with the trend arrow + delta on a row beneath it.
  The left column has a small left padding so the content sits slightly right of the card edge.
- The card is sized **shorter than Rainfall** (it was reduced ~25%; Rainfall grew ~25% to fill the
  freed space), so its centered content fits the bottom of the right column without crowding.

### 7.6 Navigation (hamburger menu)

- A **hamburger button** in the top-left of the header opens a small menu panel. **Live** is the active
  page; **History / Trends / Records / Settings** are placeholders for future visualizations (the
  console's hardware-button labels become real nav here).
- Active state uses the accent fill; the menu closes on item click or outside click.
- Each menu item is a ≥ 44px touch target (per WCAG 2.5.5 AAA) and shows a keyboard focus outline (§10).

---

## 8. Data states (resolves spec CL-004)

| State | Trigger | Visual treatment |
|-------|---------|------------------|
| **Fresh** | Reading age ≤ refresh interval | Normal. |
| **Stale** | Reading age > 2× interval (suggest ~3 min) | Dim the affected panel to ~45% and show a small `STALE` tag. Value stays but is clearly downgraded. |
| **Missing** | No value available | Show an em-dash `—` and a neutral (grey) gauge — **never `0`** (P5). |

> **Design decision — degrade per-panel, not whole-screen.**
> One dead sensor shouldn't blank the dashboard. Dimming localizes the problem and keeps good data useful.

---

## 9. Motion

- **Gauge transitions:** ease value/color changes over ~0.5s so updates feel calm, not jumpy.
- **Clock:** ticks each second; the **date** (centered, with a superscript ordinal e.g. *21ˢᵗ*) and the
  **time** (right-aligned, seconds, lowercase am/pm) sit in the header, rendered in Eastern
  (`America/New_York`, which handles DST automatically) with **no timezone label**.
  **Sun position** recomputed each minute.
- **No** looping, bouncing, or attention-seeking animation (P4).

---

## 10. Accessibility & kiosk legibility

- Target legibility at ~3 m: display number ≥ ~44px effective; labels ≥ 11px.
- Maintain ≥ 4.5:1 contrast for text against card surfaces.
- **Never rely on color alone:** pair every color signal with a glyph or number (trend arrows, UV value,
  cardinal direction text).
- **Non-text contrast (≥ 3:1):** gauge outlines, ticks, and the wind dial use `--cp-text-muted` so the
  dial geometry is visible (the earlier `--cp-surface-soft` ring / `--cp-border-strong` ticks failed 3:1).
- **Keyboard focus:** interactive controls (hamburger, nav items, settings FAB, drawer inputs) show a
  2px accent `:focus-visible` outline with 2px offset — the dashboard is usable from a laptop, not just touch.
- **Touch targets:** nav items are ≥ 44px (12px padding, `min-height: 44px`) per WCAG 2.5.5 (AAA).
- Old hardware (2014 Surface Pro 3): avoid heavy blur/filters; cap chart windows elsewhere in the app.

---

## 11. Open decisions awaiting sign-off

These are the only unresolved choices; each has a recommended default already reflected in the prototype.

| ID | Decision | Recommended default |
|----|----------|---------------------|
| D-1 (CL-001) | Temperature→color anchors (§5.3 table) — now drive ring **hue**, not arc fill | The 9-anchor violet→red scale above. |
| D-2 (CL-002) | Indoor ring shares outdoor temp scale | Yes, shared. |
| D-3 (CL-003) | Rain inches for a "full" droplet | 4.0 in (engineered cap; overflow escalates color blue→amber→red). |
| D-4 (CL-004) | Stale/missing presentation | Per-panel dim + `STALE` tag; `—` for missing. |
| D-5 | Indoor card treatment (§7.4) | (A) two mini-rings at ~60% scale. |
| D-6 | Theme palette | Clawpilot dark default; can be retuned toward the console's navy if desired. |
