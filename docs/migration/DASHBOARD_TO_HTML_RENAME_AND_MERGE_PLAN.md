# Dashboard → html Rename and Move to frt-dashboard Plan 

Purpose: Outline the exact steps, files to move, and code/doc updates required to:
- Rename the current project's `dashboard/` folder to `html/`
- Move non-smart-contract assets to `/Users/davinci/code/frt-dashboard`
- Update all references across scripts and documentation

Status: In progress (html/ rename completed; docs/scripts updated; external frt-dashboard populated)
Owner: Migration task

---

## Goals
- Standardize web UI folder name from `dashboard/` to `html/`
- Keep the on-chain smart contract code untouched
- Ensure all scripts, docs, and references continue to work after rename

## Scope
- In-scope: HTML/JS/CSS, dashboard scripts, dashboard-related *.md docs, images, libs
- Out-of-scope: Rust program code, on-chain logic, tests unrelated to path references

---

## Inventory

### Current repository folder to rename
`dashboard/` contains:
- config.js
- dashboard.js
- data-service.js
- debug-localStorage.html
- images/
- index.html
- libs/
- liquidity.html
- liquidity.js
- pool-creation.html
- pool-creation.js
- pool-success.html
- README-Configuration.md
- README-UPGRADE.md
- shared-config.json
- swap.html
- swap.js
- test-basis-points.html
- test-dashboard-upgrade.js
- token-creation.html
- token-creation.js
- token-images-preview.html
- utils.js

### Destination repository
- Target destination root: `/Users/davinci/code/frt-dashboard` (local path)
  - Files will be moved into this destination preserving relative structure (see exceptions below)

---

## Planned Moves and Renames (with Destination Mapping)

1) Rename UI folder at destination:
- From: current repo `dashboard/`
- To:   destination `html/` under `/Users/davinci/code/frt-dashboard`

2) Move UI contents:
- Current: `dashboard/*`
- Destination: `/Users/davinci/code/frt-dashboard/html/*`

3) Folder structure preservation (non-dashboard):
- All other files and folders (outside `dashboard/`) move to `/Users/davinci/code/frt-dashboard/` keeping the same relative path.
  - Example: `docs/dashboard/DASHBOARD_USER_OPERATIONS_ONLY.md` → `/Users/davinci/code/frt-dashboard/docs/dashboard/DASHBOARD_USER_OPERATIONS_ONLY.md`

4) Exception – top-level `dashboard/` folder:
- The top-level `dashboard/` folder in the current repo does not become `dashboard/` at destination; it becomes `html/` at `/Users/davinci/code/frt-dashboard/html/`.

---

## References to Update (Repo-wide)
All references to `dashboard/` must be updated to `html/`. Confirmed locations:



- scripts/remote_build_and_deploy.sh
  - Output only to `/Users/davinci/code/fixed-ratio-trading/shared-config.json` (no move)
  - The UI at destination will use `/Users/davinci/code/frt-dashboard/html/config.json` (manually edited)

- scripts/remote_server_only/metaplex/manage_metaplex.sh
  - Should use `/Users/davinci/code/fixed-ratio-trading/shared-config.json` directly (no move)

- scripts/remote_server_only/metaplex/README.md
  - Update documentation to reflect the new config handling and html/ paths (file remains in place)

- docs/tests/LOCAL_TEST_DEPLOYMENT_GUIDE.md
  - Tree view shows `dashboard/` → update display to `html/` and moved to `/Users/davinci/code/frt-dashboard/docs/tests/LOCAL_TEST_DEPLOYMENT_GUIDE.md`

- docs/codepolicy/ONE_TO_MANY_POOL_DISPLAY_RULES.md
  - Should be updated: mentions several files under `dashboard/` (utils.js, liquidity.js, swap.js, dashboard.js, data-service.js) → `html/...` and moved to `/Users/davinci/code/frt-dashboard/docs/codepolicy/ONE_TO_MANY_POOL_DISPLAY_RULES.md`

- docs/FRT/SOLANA_BASIS_POINTS_AND_LOGICAL_RATIO_DISPLAY.md
  - Should be updated: mentions `dashboard/utils.js`, `dashboard/dashboard.js`, `dashboard/liquidity.js`, `dashboard/swap.js`, possibly `dashboard/state.json` → `html/...` and moved to `/Users/davinci/code/frt-dashboard/docs/FRT/SOLANA_BASIS_POINTS_AND_LOGICAL_RATIO_DISPLAY.md`

- docs/FRT/PROCESSOR_REFACTORING_PLAN.md
  - This file can be deleted (no destination)

- dashboard/README-Configuration.md
  - Internal references to paths `dashboard/config.js` → `html/config.js` should be updated and moved to `/Users/davinci/code/frt-dashboard/docs/html/README-Configuration.md`; also upgrade config info with current date/time in the file

- dashboard/README-UPGRADE.md
  - This file should be deleted (no destination)

- dashboard/test-dashboard-upgrade.js
  - This file should be deleted (no destination)

- docs/codepolicy/UX_DESIGN_TOKEN_PAIR_DISPLAY.md
  - Line that reads `File: dashboard/utils.js (new file)` → `File: html/utils.js (new file)` and should be moved to `/Users/davinci/code/frt-dashboard/docs/codepolicy/UX_DESIGN_TOKEN_PAIR_DISPLAY.md`

- scripts/start_dashboard.sh
  - Path checks for `dashboard/index.html` and `dashboard/dashboard.js` → `html/index.html`, `html/dashboard.js` and moved to `/Users/davinci/code/frt-dashboard/scripts/start_dashboard.sh`

- coverage/tarpaulin-report.html
  - Contains historical references to `dashboard/` in embedded content. This is a generated artifact; do NOT modify.

Note: Tests (e.g., `tests/32_test_swaps.rs`) contain comments/log prints referencing dashboard files; these are non-functional references. Optional to update for clarity.

---

## Code Changes Required

- Shell scripts
  - `scripts/start_dashboard.sh`: update file existence checks to `html/`
  - `scripts/remote_build_and_deploy.sh`: write only to `/Users/davinci/code/fixed-ratio-trading/shared-config.json` (no copy/move into `html/`)
  - `scripts/remote_server_only/metaplex/manage_metaplex.sh`: use `/Users/davinci/code/fixed-ratio-trading/shared-config.json` directly (no move)

- JavaScript (in repo scripts referencing dashboard path literals)
  - `dashboard/test-dashboard-upgrade.js` → delete this file

- Documentation (*.md)
  - Systematically replace `dashboard/` → `html/` in the listed docs above, preserving context and examples
  - Move `dashboard/README-Configuration.md` to `/Users/davinci/code/frt-dashboard/docs/html/README-Configuration.md` and update internal references; also refresh/upgrade config info with current date/time
  - Delete `dashboard/README-UPGRADE.md` (no destination)

---

## Proposed Command Sequence (after approval)

1) Rename folder (git mv preserves history):
```
git mv dashboard html
```

2) Update paths in scripts:
- `scripts/start_dashboard.sh`: replace `dashboard/` → `html/` (dest: `/Users/davinci/code/frt-dashboard/scripts/start_dashboard.sh`)
- `scripts/remote_build_and_deploy.sh`: ensure it outputs only to `/Users/davinci/code/fixed-ratio-trading/shared-config.json` (no copy/move into UI)
- `scripts/remote_server_only/metaplex/manage_metaplex.sh`: ensure it reads `/Users/davinci/code/fixed-ratio-trading/shared-config.json` (no move)

3) Update docs references (non-interactive sed examples, macOS):
```
LC_ALL=C find docs -type f -name "*.md" -print0 | xargs -0 sed -i '' 's#dashboard/#html/#g'
```

4) JavaScript:
- Delete `dashboard/test-dashboard-upgrade.js` (no destination)

5) External merge:
- None. No external merges will be performed as part of this plan.

---

## Validation Checklist
- [ ] Build/serve the UI using `scripts/start_dashboard.sh` (now serving `html/`)
- [ ] Verify `html/index.html` loads and consoles show no 404s for libs/assets
- [ ] Confirm `html/shared-config.json` is read/written by deployment scripts
- [ ] Grep for remaining `dashboard/` references and review intentional ones only
```
rg -n "dashboard/" | cat
```
- [ ] Run metaplex helper scripts to ensure `shared-config.json` integration still works

---

## Rollback Plan
- If issues are found, revert rename:
```
git mv html dashboard
```
- Revert modified scripts/docs using `git checkout -- <paths>`

---

## Notes
- No external merges will be performed; only the in-repo folder rename and path updates are in scope.
- We will not touch Rust program code or on-chain logic.
