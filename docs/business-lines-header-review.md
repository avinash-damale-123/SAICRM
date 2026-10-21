# Business Lines header review - 21 October 2026

This review approves only two presentation changes in Business Lines:

1. Move the existing search control into the top global bar immediately before the notifications bell. Keep its This module / Global scope, results, shortcut and existing search behavior. Do not add a second input. Keep independent Records and Overview query restoration.
2. Highlight the selected Records or Overview tab with a filled green background and white text/icon, not just an underline. Preserve active-tab semantics, visibility permissions and keyboard focus indicators.

The module title, Add Business Line, Filter, Import, Export, Customize, tables, forms, nineteen-field master and backend permissions are unchanged. Narrow viewports wrap the same search within the global header to keep typing and the account controls usable. Other modules keep their current layouts.

Regression coverage: header geometry across 42 viewport/module/sidebar scenarios; selected-tab colors on both tabs; original search DOM node and handlers retained; per-view search restored on switching; clearing a restored query updates records; existing browser and authenticated real-database tests.

Local geometry, Records Framework and Business Lines browser checks passed before this pull request's final CI run. Deployment requires the normal passing Node 22/24 pipeline and screenshot review.
