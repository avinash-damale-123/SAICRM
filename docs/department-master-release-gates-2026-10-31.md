## Department Master approval and release gate update — 2026-10-31

All five business confirmations explicitly received: (1) direct Department → Team permitted, three levels maximum; (2) Active/Inactive/Archived/Deleted lifecycle approved with dependency guards and controlled restore; (3) generated DP-/SD-/TM- identifiers and uniqueness approved; (4) two separate Central/Branch catalogs with shared Branch definitions and independent activation per Branch approved; (5) production deploy authorized ONLY after complete safety and acceptance gates pass.

Approved specification: `docs/department-master-reconciled-v2.md` at commit `52365f0`.

**Release blockers (do not merge into main while outstanding):**
- Neon connector currently returns zero accessible projects; exact production database, migration 011 and backup/restore evidence cannot be verified.
- Department UI requires shared Records Framework parity and full authorized CSV/XLSX transfer jobs; current export only handles visible page.
- Complete regression and browser tests; current CI for the approval commit was queued when checked.
- Execute real signed-in production UAT, verify exact commit and production alias, plus rollback readiness.

Any failed or unverified release gate blocks production. Do not claim previews are live or apply unreviewed schema changes.