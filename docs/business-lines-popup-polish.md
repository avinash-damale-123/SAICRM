# Business Lines popup polish - 21 October 2026

Scope: presentation refinements to Business Lines Create, Read and Edit only. No table, global header, field-master, database, permission or lifecycle changes.

- Center the existing two-line popup title within a dark Satguru-green header. Reserve symmetric space so adding the right-side Edit shortcut does not shift the title. White type, visible keyboard focus, compact but usable Close/Edit targets.
- Add a pencil Edit action beside Close in Read, retaining the footer Edit. Both use the same permission-checked transition. Never show Edit during Create/Edit/loading, on archived/deleted records, or to users without edit permission. Do not introduce a second write path.
- Reduce redundant whitespace, not data: compact the record identity strip, put section navigation and Expand/Collapse All in one wrapping row, remove duplicate section margins and reduce excess value padding. Keep all nineteen fields, four sections, pairings, descriptions, hints, audit history and saved section state.
- Use bordered, clearly highlighted navigation controls and large chevron indicators. Native summary remains the clickable, keyboard-operable disclosure; no nested fake buttons or inaccessible icon-only toggles. Indicator direction and hover instruction follow the actual open state.
- Preserve readable 12px labels and 13px values on desktop, 36px fields, mobile 16px inputs, scrollable body with visible footer, existing error summaries and dirty-state/in-flight safeguards. Long content wraps without horizontal overflow; no forced all-collapsed state to claim less scrolling.

Verification: full existing browser/permission regression suite plus title alignment/contrast/target-size geometry, header shortcut and footer behavior, native Space/Enter disclosure operation, previous/next, mobile/landscape layouts, and real PostgreSQL authenticated top-Edit flow. Final screenshot review and passing Node22/24 CI are release prerequisites.
