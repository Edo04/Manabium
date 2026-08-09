# Manabium lake reply notification — Design QA

- Source visual truth: `/Users/nakamura/.codex/generated_images/019fe07a-a1dc-7491-aafc-68646bdbafbc/exec-006fbfa4-947b-410e-add9-e4f0c39f6a52.png`
- Implementation screenshot: `implementation-lake-desktop.jpg`
- Side-by-side evidence: `design-qa-comparison.jpg`
- Source pixels: 1536 × 1024; lake region cropped and normalized to 1048 × 650 for comparison.
- Implementation pixels: 1048 × 650 lake crop from a 1265 × 1340 full-page browser capture.
- Browser CSS viewport: 1280 × 720, device pixel ratio 2.
- State: preview mode, five fish present, four original-post bottles, two unread replies.

## Findings

No actionable P0, P1, or P2 differences remain for the selected reply-notification concept.

- Fonts and typography: Existing Manabium display/body typography is preserved. The new `届いた返事` label uses the existing body font, remains secondary to fish names, and stays readable against the water.
- Spacing and layout rhythm: The lily is anchored at the upper-right surface edge, leaves open water around fish and bottles, and keeps a mobile-sized tap target. Desktop shows four bottles; mobile shows three.
- Colors and visual tokens: Muted sage leaves and a pale blush flower match the current watercolor palette. The coral unread count reuses the product's warm accent without reading as an error.
- Image quality and asset fidelity: The notification uses a generated, transparent watercolor raster asset rather than CSS-drawn plant art. No visible white box or hard edge appears in the browser capture.
- Copy and content: `届いた返事` plus the unread count communicates persistence more clearly than a reply-colored bottle. The accessible label announces the exact unread count and action.

## Interaction and motion checks

- Fish motion sampled twice 1.8 seconds apart: positions changed continuously and facing transforms stayed at `scaleX(1)` or `scaleX(-1)`; the previous near-zero squash during turning is gone.
- Bottle motion sampled twice 1.8 seconds apart: all four transforms changed gradually within the smaller travel range.
- Animation duration is now 27–37 seconds for fish and roughly 18–25 seconds for bottles.
- Re-render animation delays are derived from the current timeline, reducing visible jumps after presence refreshes.
- Clicking the lily opened the latest related bottle thread and cleared both unread replies for that thread in preview mode.
- Clicking a moving fish still opened its profile drawer.
- Mobile viewport 390 × 844: three bottles, lily visible, no horizontal document overflow.
- Browser console: no warnings or errors during the verification run.
- `prefers-reduced-motion` rules include fish, bottle, lily, and ripple animations.

## Comparison history

1. Initial implementation: the lily matched the concept but appeared larger than the selected mock.
2. Fix: reduced the desktop width from a maximum of 186px to 160px while retaining a large transparent button hit area.
3. Post-fix evidence: `design-qa-comparison.jpg`; the notification remains visible but no longer dominates the upper-right corner.

## Follow-up polish

- P3: Actual motion should also be observed after Cloudflare deployment on a lower-powered smartphone, because animation smoothness can vary by device.

final result: passed
