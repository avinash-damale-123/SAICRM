# SCRM responsive UI update - 15 October 2026

## Scope

Only avinash-damale-123/SAICRM is updated. The intended existing portal is saicrm.vercel.app. This change does not create or configure a Vercel project, change domains, or alter Git connections.

The CRM remains a frontend demonstration. This is a presentation/accessibility update, not authentication, server authorization, database integration or a Salesforce implementation. Existing app.js and the scrm_demo_v1 record store remain unchanged. UI preferences use a separate scrm_ui_v1 key.

## Implemented

- 220 px desktop sidebar, collapsible to a 58 px icon rail; narrower tablets default to the rail. Users can override and retain their preference.
- Expandable navigation sections; Workspace and Sales & Relationships open initially. Enterprise and Administration remain accessible through their section headings.
- 54 px compact sticky header, reduced page padding, system-font stack, consistent SVG icons and smaller desktop headings.
- Phone layout below 768 px: off-canvas navigation, backdrop, close/Escape handling, background scroll lock, focus containment and 44 px primary controls.
- Responsive 4/2/1-column metrics and single-column content on smaller screens. Record tables become labelled cards below 601 px; all displayed fields are retained.
- Wide tables and pipeline boards scroll inside their containers, not the whole page.
- Mobile forms use 16 px input text, single-column fields and viewport-bounded scrollable dialogs with reachable actions.
- Compact expandable demo warning; no warning about authentication or shared storage has been removed.
- Record shortcuts from Overview and My Work open the owning module's record.
- Keyboard-visible focus, labelled controls, skip link, live status messages, dialog focus containment and reduced-motion support.

## Browser verification

Executed 210 route/layout checks: all 15 existing module pages across 14 CSS viewport sizes. Sizes: 1920x1080, 1440x900, 1366x589, 1280x600, 1024x768, 820x1180, 768x1024, 767x900, 600x800, 430x932, 390x844, 360x740, 320x568 and 844x390. No page-wide horizontal overflow or JavaScript page errors were recorded in these checks.

At 1366x589 and 390x844, additionally tested lead creation, opening record/edit controls, search, status filtering, board navigation, CSV export, module search, modal keyboard focus, drawer closing and persisted sidebar preferences. Screenshots were inspected at laptop and phone sizes.

Harness: headless Chromium rendered the actual source via local DOM/style/script injection. A test-only storage adapter was used because the execution environment prohibits origin navigation. The baseline app.js was verified against repository blob 9468e98b51d78baca731620bb7ce884efed8fd4b before testing. These tests are not physical-device, Safari, production authorization, real storage persistence or hosted-deployment certification. Verify the final deployment on saicrm.vercel.app.

## Design reference

Original SCRM markup, styles and SVG paths apply common compact CRM layout patterns. References: Salesforce's public responsive-page, display-density and vertical-navigation documentation. No Salesforce source, proprietary fonts or brand assets are included.

## Regression checks for future changes

Check all menus, category expansion, icon-rail labels, mobile backdrop/Escape, focus return, very long names, empty tables, phone form scrolling, horizontal board scrolling, and text at increased browser zoom. Do not remove the demo disclaimer or reset CRM data as part of a UI change.
