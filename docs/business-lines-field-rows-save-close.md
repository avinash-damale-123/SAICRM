# Business Lines field rows and Save-close review - 21 October 2026

This user-approved review applies to Business Lines Create, Read and Edit. It supersedes the previous successful Edit -> Read-in-the-same-popup behavior. Successful Create and Edit now close the popup and return to the existing workspace. Other modules, database, field master, permissions and lifecycle rules are unchanged.

## Presentation

- Distinct two-part field surfaces: shaded bold label on the left, clearly separated value on the right. Read-only values remain text, not fake editable inputs; editable fields retain white bordered inputs. Hints and field errors are grouped with their control.
- Preserve all nineteen Read/Edit fields, three Create fields, four approved sections and existing desktop field pairings. Labels/values align on one row where space permits. Medium screens use one field-pair per row; narrow screens stack each label/value to preserve readability. Long values and descriptions wrap without truncation.
- Record popup width is capped at 920px; reduce unnecessary vertical field stacking without reducing desktop label/value sizes below 12px/13px. Mobile inputs retain 16px sizing. Keep centered green titles, top Edit shortcut, section controls, scrollable body and accessible footer.
- X and Cancel are red with contrasting white icons/text, hover and focus indicators. Save remains green. Unsaved-change confirmations and in-flight write protection are retained.

## Save behavior

- Validation and failed writes (including stale-version conflicts) keep the popup open with the draft intact. No automatic retry of writes.
- Successful Edit closes the popup automatically; no manual Close and no intermediate Read popup. The originating view, search, filters, sorting, pagination and column choices remain; underlying records refresh.
- Save feedback is visible in both Records and Overview. A failed list refresh after a successful write is a list-loading error, not a failed save, and does not reopen or resubmit the completed form. Restore useful keyboard focus after rerender when the original opener no longer exists.
- Cancel still returns Edit to Read after the existing discard confirmation. Close/X/Escape still dismiss with unsaved protection. This request changes successful Save, not the meaning of Cancel.

## Verification gate

Retain existing API/permission/authenticated-PostgreSQL and browser suites. Test automatic close only on successful writes, persisted values on reopening, stale-write drafts, mandatory reasons, one submission while saving, saved search/sort/page/columns, Overview create, refresh failure without duplicate writes, labels vs value surfaces, inline and stacked alignment, red action contrast, all fields, long values and seven desktop/mobile/landscape sizes. Full CI on Node 22/24 and actual screenshot inspection required before deployment. No migration required.
