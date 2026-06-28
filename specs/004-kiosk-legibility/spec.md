# Feature Specification: Wall-Kiosk Legibility

**Feature Branch**: `004-kiosk-legibility`

**Created**: 2026-06-26

**Status**: Draft

**Input**: User description: "Improve wall-kiosk legibility: self-hosted bundled web font for identical cross-platform rendering, a large-screen/kiosk breakpoint that enlarges ring gauges, text readouts, and current-condition icons for 3m viewing, and higher-contrast tokens so outlines like the rain-drop are clearly visible from a distance"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Readable from across the room (Priority: P1)

A household member glances at the wall-mounted weather display from ~3 metres (~10 ft) away while in the kitchen. They can immediately read the outdoor temperature, the other ring-gauge values, the wind readout, and recognise the current-condition icon (sun, cloud, rain drop, etc.) without walking closer or squinting.

**Why this priority**: The kiosk exists to be read at a glance from across the room. If the primary readouts are too small at that distance the product fails its core purpose. This is the single most valuable slice and is independently shippable (a large-screen treatment alone delivers the win).

**Independent Test**: Load the dashboard at the kiosk panel resolution (2160×1440) in a browser, stand back / simulate ~3 m viewing (or measure rendered element sizes against a distance-legibility threshold), and confirm the ring gauges, numeric readouts, and condition icon are comfortably legible. Phones (≤900px) and ordinary desktop windows are unaffected.

**Acceptance Scenarios**:

1. **Given** the dashboard is shown on a large display at 2160×1440, **When** it renders, **Then** the outdoor temperature and the other ring-gauge values, the wind readout, and all metric readouts are rendered at the enlarged kiosk sizes (materially larger than the default desktop sizes).
2. **Given** the dashboard is shown on a large display, **When** it renders, **Then** the current-condition icon is enlarged so its silhouette is recognisable from ~3 m.
3. **Given** the dashboard is shown on a large display, **When** elements are enlarged, **Then** the layout still fits the viewport with no scrolling and no clipped/overflowing content (it remains a fixed 100dvh, no-scroll kiosk).
4. **Given** a phone-width viewport (≤900px) or an ordinary desktop window (below the kiosk breakpoint), **When** the dashboard renders, **Then** its existing layout and sizes are unchanged (no regression).

---

### User Story 2 - Outlines and text stand out from the background (Priority: P1)

From across the room the viewer can distinguish shape outlines — the rain-drop outline, gauge tracks/rings, and dividers — and secondary ("muted") text from the dark background. Nothing important fades into the background.

**Why this priority**: The reporter specifically calls out that low contrast makes outlines like the rain drop nearly invisible from a distance. Size without contrast still fails the glance-test, so this ships alongside P1.

**Independent Test**: Compute the contrast ratio of the updated text/border tokens against the background and confirm the drop outline (and other structural outlines) clears the agreed legibility threshold; visually confirm in a screenshot that the drop outline and gauge tracks are clearly visible.

**Acceptance Scenarios**:

1. **Given** the dark kiosk theme, **When** the rain-drop is rendered, **Then** its outline is clearly distinguishable from the background from ~3 m (its outline no longer uses a near-background colour).
2. **Given** the dark kiosk theme, **When** muted/secondary text and structural dividers render, **Then** they meet the agreed minimum contrast ratio against the background.
3. **Given** the contrast tokens are raised, **When** the dashboard renders on any supported viewport, **Then** the visual design language (dark theme, accent colour, overall look) is preserved — only legibility improves.

---

### User Story 3 - Identical typeface on every platform (Priority: P2)

The display renders the same designed typeface regardless of the operating system driving it (Linux kiosk, the designer's macOS, or Windows), so what the designer approves is exactly what appears on the wall.

**Why this priority**: The Linux kiosk currently falls through to a generic system font because the stack lists only Windows/macOS fonts, so the wall display looks different (and muddier) than the design. Self-hosting removes the OS dependency. It is P2 because it compounds the legibility win but the size/contrast pass alone already restores a readable display.

**Independent Test**: Disable/blank all OS-installed fonts (or inspect the computed `font-family` and confirm the bundled font is the resolved face), load the dashboard, and confirm the bundled self-hosted font is used; confirm the font asset is served by the app itself.

**Acceptance Scenarios**:

1. **Given** the app is served to a Linux/Chromium kiosk with none of the legacy stack fonts installed, **When** the dashboard loads, **Then** text is rendered in the bundled self-hosted font (not the generic system fallback).
2. **Given** the same build is opened on macOS and on Windows, **When** the dashboard loads, **Then** the resolved typeface is the same bundled font on all three platforms.
3. **Given** the kiosk loads the page, **When** the font loads, **Then** there is no visible flash of unstyled/invisible text (the font is preloaded/bundled so the kiosk does not flicker between faces).

---

### Edge Cases

- What happens on a display between the desktop and kiosk thresholds (e.g. a 1080p TV)? The enlargement MUST degrade gracefully (scale with the viewport) rather than only switching at a single hard pixel width.
- What happens if the bundled font asset fails to load? The system MUST fall back to a sensible cross-platform sans-serif so text is never absent.
- What happens at the kiosk's exact 2160×1440 with the largest readouts? Content MUST still fit without scrolling or clipping.
- Does enlarging type break the no-scroll fixed layout? Sizes MUST be chosen so the fixed 100dvh grid still contains everything.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The web app MUST bundle and self-host its primary UI font so rendering does not depend on fonts installed on the host operating system.
- **FR-002**: The self-hosted font MUST be the resolved typeface on Linux, macOS, and Windows for the same build.
- **FR-003**: The app MUST retain a generic cross-platform sans-serif fallback so text is still shown if the bundled font fails to load.
- **FR-004**: Font loading MUST NOT produce a visible flash of unstyled or invisible text on the kiosk (preload/bundle so the displayed face does not change after load).
- **FR-005**: The app MUST provide a large-screen/kiosk presentation (triggered at a defined large-viewport threshold appropriate for the 2160×1440 Surface Pro 3) that enlarges the ring gauges, the numeric/text readouts, and the current-condition icon relative to the default desktop sizes.
- **FR-006**: Enlargement MUST scale with the viewport (not a single abrupt pixel switch) so intermediate large displays also benefit and the design degrades gracefully.
- **FR-007**: The current-condition icon MUST be enlarged at the kiosk presentation so its silhouette is recognisable from ~3 m.
- **FR-008**: At the kiosk presentation the layout MUST remain a fixed, non-scrolling 100dvh view with no clipped or overflowing content at 2160×1440.
- **FR-009**: Contrast tokens MUST be raised so secondary ("muted") text and structural dividers meet the agreed minimum contrast ratio against the dark background.
- **FR-010**: Shape outlines that are currently drawn with a near-background colour — notably the rain-drop outline and gauge tracks/rings — MUST be raised to a clearly visible contrast against the background from ~3 m.
- **FR-011**: The existing phone (≤900px) and ordinary desktop layouts MUST NOT regress; the changes are additive (a large-screen treatment, a font swap, and contrast token tuning).
- **FR-012**: The established visual design language (dark default theme, accent colour, overall look) MUST be preserved; only legibility (size and contrast) changes.

### Key Entities

- **Design tokens**: The shared colour/contrast variables (background, text, muted text, soft text, border, border-strong) whose values determine contrast against the background.
- **Self-hosted font asset**: The bundled font file(s) served by the app and declared as the primary UI typeface.
- **Kiosk presentation**: The large-viewport treatment that scales gauges, readouts, and the condition icon for distance viewing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the kiosk panel resolution (2160×1440), the primary outdoor temperature readout and the other ring-gauge values are rendered materially larger than at the default desktop sizes (target: the largest readouts scale up by roughly one-third or more at the kiosk breakpoint), sufficient to be read from ~3 m.
- **SC-002**: The current-condition icon at the kiosk presentation is enlarged enough that its silhouette is recognisable from ~3 m (target: at least ~1.3× its default rendered size).
- **SC-003**: Muted/secondary text and structural dividers reach a contrast ratio of at least 4.5:1 against the background; the rain-drop outline and gauge tracks reach a contrast ratio of at least 3:1 against the background.
- **SC-004**: With all legacy-stack OS fonts unavailable, the dashboard still renders in the bundled self-hosted font (verified via computed style), and the same face renders on macOS and Windows.
- **SC-005**: At 2160×1440 the kiosk view shows all content with no scrollbar and no clipped elements.
- **SC-006**: Phone (≤900px) and ordinary desktop layouts are pixel-unchanged from before the feature (no regression in existing snapshot/e2e expectations).
- **SC-007**: The app's existing 100% test-coverage gate, typecheck, and Playwright e2e suite all pass.

## Assumptions

- The kiosk hardware is a Surface Pro 3 at native 2160×1440 (3:2) running Ubuntu/Chromium; "large-screen" thresholds are tuned for that panel but expressed responsively so similar large displays benefit.
- ~3 m / ~10 ft is the representative viewing distance for the glance-test.
- A single bundled, openly-licensed sans-serif (e.g. an Inter/Roboto-class face) is acceptable as the designed typeface; exact face to be selected in planning/research.
- Dark theme remains the kiosk default and the primary verification target.
- The change is confined to the `apps/web` front-end (CSS, a bundled font asset, and possibly an index.html preload); no API, data-model, or timezone changes.
- Contrast targets follow WCAG-style ratios (≥4.5:1 for normal text, ≥3:1 for large text and meaningful graphical outlines) as the objective legibility bar.
