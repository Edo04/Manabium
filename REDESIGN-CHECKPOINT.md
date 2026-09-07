# Redesign checkpoint — 2026-09-07

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
- User confirmed production admin error: `Admin API is not configured.` Authorized success still requires production configuration; do not claim it fixed without verification.

## Plan / resume
1. Admin API/error handling tests, then commit independently.
2. Replace community.css and homepage markup/styles/motion, retaining feature IDs and data hooks.
3. Browser QA at mobile/tablet/desktop; test lake interactions, bottles, notes and login. Update this file, commit and push only verified changes.

## Current status — 2026-09-07
Admin robustness implemented and 17 tests passing (10 API + 7 existing UX). Shared verification still validates user JWT and admin role before any privileged request; supports new secret keys and legacy server-role environment keys. Persistent Japanese error/retry state replaces blank dashboard. No SQL or production data changed.

User confirmed exact failure: `Admin API is not configured.` Cloudflare configuration is the production blocker. Public API exists and returned 401 correctly without authentication. User needs to add the same project's Supabase server secret to Cloudflare Production; do NOT bypass authorization or request a secret in chat. Production admin success not verified.

Admin milestone 4732ffd was committed and pushed to main. Public Cloudflare HTML was verified to contain the persistent adminError panel. The missing server secret is still a user action, not a design bug.

## Design implementation / verification
- Replaced community.css layout: full-width lake (660px tall at 1440x900; previously ~432px), compact horizontal desktop navigation, one 760px mobile breakpoint and fixed mobile interaction dock above bottom navigation.
- Kept fish presence, anonymous visit names, status, preset reactions, bottles, library, replies/bookmarks, profile/auth and authorization. No database changes.
- Desktop bottle list uses open separated rows instead of boxed cards; library retains distinct note covers/shelf filters. Forms and fish profile drawer use more readable spacing.
- Library entry is now a compact book sign, not overlapping imitation stone/plant shapes. Raises above mobile controls.
- Smaller bounded fish paths on phone/tablet and breakpoint reflow on resize. No change to participant selection or live counts.
- Rebuilt homepage HTML with existing watercolor assets and new homepage.css: split editorial hero, interactive demo, three feature sections, safety explanation, native FAQs and registration links. Replaced perpetual JS animation loops with CSS motion, intersection reveals and coalesced scroll updates respecting reduced motion.
- 21 automated tests pass: 10 admin API, 7 draft/filter regressions, 4 homepage controls/motion/HTML-hook tests. JS syntax and diff whitespace checks pass.
- In-app browser checked at 320x640, 390x844, 820x900 and 1440x900. Checked lake mobile controls above navigation, drawer/profile, preset greeting displayed on own fish, library entry, note filter/detail, bottle search/detail/replies/composer, mypage, homepage demo, FAQ, login/signup tab switch. No actual account creation or live content writes.
- Preview uses synthetic data; real multi-account realtime, production authenticated admin and iOS Safari have NOT been verified in this pass. Test/browser results do not establish those guarantees.
- Screenshots stored outside deploy directory: /Users/nakamura/Downloads/Manabium/design-review-20260907/.

## Finish / resume
Design implementation, final screenshot capture and 21 tests completed. Browser console errors were empty on final lake and homepage previews. Temporary viewport was reset. Ready for normal commit/push/public asset verification. Stage only index.html, community.css, homepage.css, app.js, tests/homepage-motion.test.cjs and this checkpoint. Leave unrelated .DS_Store alone. No SQL needs execution. Do not weaken admin RLS/RPC permissions to resolve missing deployment secrets.
