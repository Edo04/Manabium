# Redesign checkpoint — 2026-09-06

## Request / invariants
Rebuild the design substantially; enlarge the lake; redesign the homepage; diagnose unavailable operations room. Preserve anonymous community, bottles, notes, authentication and server-side admin authorization. Plain HTML/CSS/JS. Checkpoint and commit bounded steps so interruption is recoverable.

## Starting point
- Branch main, base 96804ef; origin https://github.com/Edo04/Manabium.git.
- Unrelated root .DS_Store remains untracked; never include it.
- Preview server at http://127.0.0.1:4174, app subdirectory root; preview=1 is synthetic data only.

## Findings
- Previous lake was limited to 48dvh (340px on mobile), with three stacked header/control sections. Rebuild as a wide, tall lake with compact controls.
- Conflicting old 900px and newer 768px navigation breakpoints cause tablet header overlap. Use one consistent navigation breakpoint in replacement styles.
- Admin requests require a server secret following prior security hardening. Existing errors disappear into a toast and leave a blank panel. Need persistent actionable errors and safe key-format compatibility, without granting public RPC access.
- Production admin failure not yet reproduced with an authorized account. Asked user for exact symptom; do not claim it fixed without verification.

## Plan / resume
1. Admin API/error handling tests, then commit independently.
2. Replace community.css and homepage markup/styles/motion, retaining feature IDs and data hooks.
3. Browser QA at mobile/tablet/desktop; test lake interactions, bottles, notes and login. Update this file, commit and push only verified changes.

## Current status — 2026-09-07
Admin robustness implemented and 17 tests passing (10 API + 7 existing UX). Shared verification still validates user JWT and admin role before any privileged request; supports new secret keys and legacy server-role environment keys. Persistent Japanese error/retry state replaces blank dashboard. No SQL or production data changed.

User confirmed exact failure: `Admin API is not configured.` Cloudflare configuration is the production blocker. Public API exists and returned 401 correctly without authentication. User needs to add the same project's Supabase server secret to Cloudflare Production; do NOT bypass authorization or request a secret in chat. Production admin success not verified.

Design implementation is NEXT: replace community.css, homepage sections and motion, preserving auth and feature hooks. Current styles are still the old design. Commit the admin milestone before starting.
