# Business Lines popup and toolbar review - 21 October 2026

This approved change supersedes the earlier dedicated Read/Edit page choice **for Business Lines only**. Create, Read and Edit now use the same native modal service. Other CRM modules, backend authorization, field contracts, lifecycle rules and database schema remain unchanged.

## Record experience

- Create: compact popup with Name, Code and Description; default Active, Owner and audit metadata still handled by the backend. Successful create closes and refreshes the existing Records/Overview context.
- Read: larger responsive popup with all nineteen approved fields in Basic Information, Ownership Details, Record Information and Lifecycle Information, plus separately loaded audit history. Read-only values, not fake editable inputs.
- Edit: same popup, same field ordering; only existing authorized editable fields become inputs. ID, ownership and audit metadata stay read-only. Status changes require a reason. Save returns to Read within that popup and reloads underlying records and audit history. Cancel discards only after confirmation and returns to Read; Close returns to the originating workspace.
- Native background inertness, blurred backdrop, scroll lock, explicit Tab/Shift+Tab containment, Escape/Close/backdrop unsaved confirmation, browser-unload protection and opener focus restoration. Ctrl+K cannot send focus to background search.
- Footer Save and Cancel stay visible while long content scrolls. Prevent duplicate submissions and closing during a write. A failed save, including stale-version conflict, retains the draft and displays the server error; no blind overwrite.
- Preserve previous/next navigation, grouped sections, expand/collapse and saved section preferences. Guard asynchronous reads so closed or replaced popups do not reopen. Record-load retry and independently failing/retryable audit history are supported.
- Responsive two-column desktop and single-column mobile forms, bounded dynamic viewport height, mobile keyboard-friendly inputs, reduced-motion behavior and accessible labels/errors.

## Pending toolbar refinements included

Keep existing permission-authorized Filter, Import, Export and Customize controls in both Records and Overview. Import and column settings work from Overview without automatically changing the selected view. Overview Export continues exporting overview metrics; it does not silently export all underlying records. Column Selection continues controlling Records table columns.

The module card is slightly more compact with proper inner padding and rounded edges, subtle icon treatment and a larger readable title (20px desktop / 18px narrow viewports). Global topbar size, search placement and selected-tab green treatment remain unchanged.

## Release gate

Run existing Node 22/24 security/API/PostgreSQL and browser regressions, real authenticated PostgreSQL browser acceptance, header geometry and the new modal review suite. New coverage includes dirty X/Escape/Cancel, required reasons, in-flight write protection, stale-write drafts, focus wrapping, load/history failures and stale responses, both-tab permissions, original view preservation, and Create/Read/Edit at desktop, mobile and landscape dimensions. Inspect resulting screenshots before merging. No migration is required.

## Screenshot review follow-up

The first full CI run passed on Node 22 and Node 24 (run 39606179636). Inspecting its actual Create, Read, Edit and mobile screenshots revealed that an older global rule hid section-jump navigation. The popup-specific override now restores those controls, separates section cards and preserves a narrow-screen inset. The focused modal suite passed again locally after these refinements. The final head must pass the full CI gate again; an earlier passing run is not substituted for final-head verification.
