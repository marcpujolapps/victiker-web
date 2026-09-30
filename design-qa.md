# Design QA — Victiker home page refresh

## Comparison target

- Source visual truth: `/Users/marc/.codex/generated_images/01a0cdd5-d209-78a1-96ae-a078cdfdca75/exec-58f3142f-e2a2-402d-9e79-90b7a310d82a.png` (883 × 1781 px; selected first concept, with the user's requested section order).
- Implementation: `http://127.0.0.1:5176/`, rendered in the Codex in-app browser.
- Implementation screenshot: captured in the in-app browser and visually reviewed in this task; the CUA capture was not saved as a project file.
- Browser viewport: 1264 × 712 px; desktop, initial page state.
- State: hero idle, privacy notice dismissed, no catalogue request open.
- Normalization: the source is a long page concept and the browser capture is a viewport. Compared section by section at the available browser width; no pixel-level overlay was produced.

## Full-view comparison evidence

The implementation retains the existing hero, AI consultation, navigation, and brand colors. The sections below it follow the requested order: mobile workshop, photo-based motorcycle and boat catalogue entrances, four service and trust columns, then the coastal «Más kilómetros. Más historias.» close. Each section was inspected in the rendered local page while scrolling.

## Focused region and interaction evidence

- Workshop section: copy, photo crop, and appointment pathway reviewed at desktop width.
- Catalogue entrances: both photo tiles and labels are visible; clicking Moto opens `/repuestos/moto` and clicking Embarcación opens `/repuestos/barco`. Each route showed its matching catalogue heading.
- Parallax: gentle vertical movement was reviewed while scrolling across the motorcycle and marine photo tiles. The same effect is wired to the workshop image and scales with image height up to 5.5% of its height.
- Four-column strip and closing image: rendered and reviewed while scrolling.
- Responsive implementation: narrow-layout rules stack the workshop, vehicle tiles, and closing content and turn the four-column strip into two columns. A mobile browser viewport capture was not available in this review.
- Build: `npm run build` completed successfully. The existing >500 kB JavaScript chunk warning remains.
- Console: no console inspection was performed.

## Required fidelity surfaces

- Typography: current Victiker display type and navy/orange hierarchy remain consistent with the hero; supporting copy is restrained and readable at the reviewed desktop width.
- Spacing and layout: workshop first, split vehicle tiles, evenly divided trust columns, and a wide closing banner match the selected concept and requested order.
- Colors: existing navy, cool white, royal blue, and orange accents are retained.
- Motion: the scroll effect is skipped in JavaScript and removed in CSS for `prefers-reduced-motion: reduce`.
- Imagery: four newly generated, photographic assets provide distinct workshop, motorcycle, marine, and coastal scenes. All loaded in the rendered page capture.
- Copy: the four information columns describe repair and maintenance, mobile service, diagnosis, and direct contact with Víctor; no unconfirmed shipping or payment claims were added.

## Findings

No actionable P0, P1, or P2 issues were visible in the desktop review. The two catalogue entrances worked as requested.

### Follow-up polish

- Capture and compare the 390 px mobile rendering in a browser viewport, since this review could inspect the responsive CSS but not emulate a narrow viewport.
- Save a persistent implementation screenshot for future visual comparison.

## Implementation checklist

- [x] Preserve the existing AI hero.
- [x] Place the mobile workshop directly below the hero.
- [x] Add real photo-led catalogue links for motorcycle and boat parts.
- [x] Add four factual information columns.
- [x] Finish with «Más kilómetros. Más historias.».
- [x] Build the site and verify both category destinations in the browser.

## Final result

passed
