## [1.36.3](https://github.com/stevendejongnl/printer/compare/v1.36.2...v1.36.3) (2026-06-16)

### Bug Fixes

* **link-preview-card:** popup intercept blocks open-btn on mobile ([d3e3813](https://github.com/stevendejongnl/printer/commit/d3e3813a57b98888b36f41dc8cee5ec90ae2dabc))

## [1.36.2](https://github.com/stevendejongnl/printer/compare/v1.36.1...v1.36.2) (2026-06-16)

### Bug Fixes

* **link-preview-card:** open link btn on mobile closes popup instead of navigating ([27cc3a6](https://github.com/stevendejongnl/printer/commit/27cc3a641ae931f2aa3c2a86eb2afa1f7bfd0434))

## [1.36.1](https://github.com/stevendejongnl/printer/compare/v1.36.0...v1.36.1) (2026-06-16)

### Bug Fixes

* **db:** enable WAL mode and 5s busy_timeout to fix concurrent lock errors ([4f555c5](https://github.com/stevendejongnl/printer/commit/4f555c5566232d23c4e55b1b3c8fa627a58f5f04))

## [1.36.0](https://github.com/stevendejongnl/printer/compare/v1.35.0...v1.36.0) (2026-06-16)

### Features

* **k8s:** add Redis deployment and wire REDIS_URL into printer ([2f085c5](https://github.com/stevendejongnl/printer/commit/2f085c5af4167134477f9bea31bedc63bac874e8))

### Bug Fixes

* **cache:** fix 6 correctness bugs found in code review ([370202f](https://github.com/stevendejongnl/printer/commit/370202fdf8283c60a562dcefd807f4ab019e6217))

## [1.35.0](https://github.com/stevendejongnl/printer/compare/v1.34.3...v1.35.0) (2026-06-16)

### Features

* **cache:** add Redis cache module with get_or_set and invalidation ([6137935](https://github.com/stevendejongnl/printer/commit/613793591962d13d9a7bd62b9ddb6b94ff7bdf98))
* **cache:** cache /api/history with TTL-by-offset strategy ([e6e2d52](https://github.com/stevendejongnl/printer/commit/e6e2d5281c857453f65b749cd826c9a6a7498469))
* **cache:** cache /api/prints/{job_id} with 1h TTL ([9928dd0](https://github.com/stevendejongnl/printer/commit/9928dd06d71eaf842263f023ed0374569f5f4566))
* **cache:** cache /api/projects with 5min TTL and mutation invalidation ([5364756](https://github.com/stevendejongnl/printer/commit/5364756c405b67d92ec1b9fda10e91b2401705e5))
* **cache:** cache /api/spools with 30min TTL and mutation invalidation ([bd8c7c2](https://github.com/stevendejongnl/printer/commit/bd8c7c2c10dfe17b9f92854d11879f8f0cfbdf92))
* **cache:** init Redis in lifespan, invalidate history on print-end ([5da946e](https://github.com/stevendejongnl/printer/commit/5da946e68c9eff34a0f004372990c08570f8adfd))
* **config:** add REDIS_URL setting ([ef1f201](https://github.com/stevendejongnl/printer/commit/ef1f2017e3450df29979b5b8087624b5896af3a1))

### Bug Fixes

* **cache:** fire-and-forget history invalidation in WS handler ([d0244e8](https://github.com/stevendejongnl/printer/commit/d0244e86cf10074d4168ccd7d247327e4b892019))
* **cache:** guard spool invalidation on empty PATCH body ([b454c2f](https://github.com/stevendejongnl/printer/commit/b454c2f8c96007b689438f6a51dfa736817cc62c))
* **cache:** invalidate project cache after enrich_link cover update ([05cec29](https://github.com/stevendejongnl/printer/commit/05cec2976ba14ed0cf324340b1da0acda7e98e8b))
* **cache:** skip invalidation on empty PATCH body in update_print ([2c3decd](https://github.com/stevendejongnl/printer/commit/2c3decde0fe7ad3d9395c1185bc157f5c62946c5))
* **cache:** use SCAN instead of KEYS, fix test mock types ([2ed48c3](https://github.com/stevendejongnl/printer/commit/2ed48c371b52535ce97b71fb3b3b094bd66efab1))

### Documentation

* add Redis caching design spec ([5523c28](https://github.com/stevendejongnl/printer/commit/5523c28fc58d75ab6e50affd512d10f619b232da))
* add Redis caching implementation plan ([03c3729](https://github.com/stevendejongnl/printer/commit/03c37296c27b75f2aabbfadb222097172208f190))

## [1.34.3](https://github.com/stevendejongnl/printer/compare/v1.34.2...v1.34.3) (2026-06-07)

### Bug Fixes

* **data:** fix webcam misattribution, stale project stats, and orphaned cover links ([00178e8](https://github.com/stevendejongnl/printer/commit/00178e812affdf05cbefc2e2760084a06e6a47d5))

## [1.34.2](https://github.com/stevendejongnl/printer/compare/v1.34.1...v1.34.2) (2026-06-07)

### Bug Fixes

* **prints:** include project info in print detail response ([a269ef9](https://github.com/stevendejongnl/printer/commit/a269ef9e5cf9df8357208fb1ad42719a1f71dda1))

## [1.34.1](https://github.com/stevendejongnl/printer/compare/v1.34.0...v1.34.1) (2026-06-07)

### Bug Fixes

* **recorder:** use moonraker filament_used in reconcile zero-cost check ([5437bde](https://github.com/stevendejongnl/printer/commit/5437bde6dba6562468f7bde622ae47419ba83d3e))

## [1.34.0](https://github.com/stevendejongnl/printer/compare/v1.33.1...v1.34.0) (2026-06-07)

### Features

* **ui:** add recalculate cost button on print detail page ([9a96a34](https://github.com/stevendejongnl/printer/commit/9a96a3438b0138a80126d537525a6a8036ea964b))

## [1.33.1](https://github.com/stevendejongnl/printer/compare/v1.33.0...v1.33.1) (2026-06-07)

### Bug Fixes

* **ui:** remove tags from src — fix history page URL pagination ([1cf8c98](https://github.com/stevendejongnl/printer/commit/1cf8c98497334f6f18e4371673b59e8fd3b2a352))

## [1.33.0](https://github.com/stevendejongnl/printer/compare/v1.32.0...v1.33.0) (2026-06-07)

### Features

* **prints:** remove tags — drop column migration + clean API/DB ([c7849af](https://github.com/stevendejongnl/printer/commit/c7849af274f6af5d18d12987d56b50dae89287c6))

## [1.32.0](https://github.com/stevendejongnl/printer/compare/v1.31.0...v1.32.0) (2026-06-07)

### Features

* **ui:** make print settings and slicer info read-only, add tag remove button ([5b9aed2](https://github.com/stevendejongnl/printer/commit/5b9aed2ba490915ab20c81e200bbbaf78eee3595))

## [1.31.0](https://github.com/stevendejongnl/printer/compare/v1.30.1...v1.31.0) (2026-06-07)

### Features

* **gcode-meta:** parse gcode header for slicer info, add old Cura M-code temp support ([044047a](https://github.com/stevendejongnl/printer/commit/044047a474093eee443ffbde831699e8a9fce4d5))

## [1.30.1](https://github.com/stevendejongnl/printer/compare/v1.30.0...v1.30.1) (2026-06-06)

### Bug Fixes

* auto-stage prettier fixes in pre-commit hook ([ec57112](https://github.com/stevendejongnl/printer/commit/ec5711250dd03e1171e7516a4c6cfcc9f8c8e874))

## [1.30.0](https://github.com/stevendejongnl/printer/compare/v1.29.0...v1.30.0) (2026-06-06)

### Features

* add cost breakdown to print detail page, remove printer field ([dad5c0f](https://github.com/stevendejongnl/printer/commit/dad5c0f65621583d2e56b4ba700dd44476f82e8b))
* add gcode metadata extraction module ([daa6fd3](https://github.com/stevendejongnl/printer/commit/daa6fd3502ae9cbce72c8f12cd76b05b3438a8ac))
* add gcode_meta column to print_jobs ([cd406c5](https://github.com/stevendejongnl/printer/commit/cd406c5308c5ee9b73140ae433ce2636b8586a86))
* display gcode metadata on print detail page ([35be64d](https://github.com/stevendejongnl/printer/commit/35be64d10aef85b602774d470188244874c65478))
* extract gcode metadata at job completion ([0b75d9c](https://github.com/stevendejongnl/printer/commit/0b75d9c016b9a30186c43ab6ecc2d3d892428e54))
* lazy gcode metadata extraction on first print detail view ([b74ae0f](https://github.com/stevendejongnl/printer/commit/b74ae0f314d05a1d34ba7feb4a328d5ea6f0a9a8))

### Bug Fixes

* prettier formatting on print-detail-page ([54ed6c5](https://github.com/stevendejongnl/printer/commit/54ed6c59b29655218e000725c0227122244c8de7))
* prints PATCH accepts list for tags and dict for settings, deserialize JSON from DB ([7c8d36b](https://github.com/stevendejongnl/printer/commit/7c8d36b73682ea620c19022a539f7019cf41897f))
* robust empty check and url validation in gcode meta renderer ([62e8734](https://github.com/stevendejongnl/printer/commit/62e8734c2f7a4fc1f9527168660ba14b6d9d4c07))
* skip empty list values in map_moonraker_meta, add empty list test ([e3dcd6d](https://github.com/stevendejongnl/printer/commit/e3dcd6d2381c58284a79c653b5c7ba3ce0623494))
* store empty gcode_meta to prevent re-extraction, move moonraker import to module level ([00ece8f](https://github.com/stevendejongnl/printer/commit/00ece8fe338d887e6c1b8d808b4bd79a844c50c7))

### Documentation

* add gcode metadata design spec with Cura setup instructions ([6f2f57b](https://github.com/stevendejongnl/printer/commit/6f2f57bc87c16d50277d2ee8e1ae7afc9c68a35f))

## [1.29.0](https://github.com/stevendejongnl/printer/compare/v1.28.1...v1.29.0) (2026-06-06)

### Features

* add print job detail pages at /prints/:job_id ([7c09964](https://github.com/stevendejongnl/printer/commit/7c099643073ba51fd4f3dba78065372395acfbeb))

### Documentation

* add print detail pages design spec ([8a948dc](https://github.com/stevendejongnl/printer/commit/8a948dc60e7d7f59a573a774a904bc2b5c3b4911))

## [1.28.1](https://github.com/stevendejongnl/printer/compare/v1.28.0...v1.28.1) (2026-06-06)

### Bug Fixes

* use constant additional_costs=0.10 matching HA nordpool entity config 3_10_021 ([3db5f71](https://github.com/stevendejongnl/printer/commit/3db5f71da75e693e039f53fd0473f6c820c7079c))

## [1.28.0](https://github.com/stevendejongnl/printer/compare/v1.27.0...v1.28.0) (2026-06-06)

### Features

* Nord Pool NL price backfill + InfluxDB price recorder for historical cost accuracy ([e787bee](https://github.com/stevendejongnl/printer/commit/e787bee23e0a94f2c1f9fed01bcd3c1bd54f0ea0))

## [1.27.0](https://github.com/stevendejongnl/printer/compare/v1.26.0...v1.27.0) (2026-06-06)

### Features

* warn in cost breakdown when electricity data is missing ([5774574](https://github.com/stevendejongnl/printer/commit/577457475de130eabcb284f3416e86758f0dc146))

### Bug Fixes

* switch HA energy statistics to WebSocket — REST endpoint removed in HA 2026 ([fc0c69c](https://github.com/stevendejongnl/printer/commit/fc0c69ce0f4fdc18bfb5b739e3c974aa6742c25e))

## [1.26.0](https://github.com/stevendejongnl/printer/compare/v1.25.4...v1.26.0) (2026-06-06)

### Features

* global search with !h/!s/!p prefix filters — nav icon + / shortcut ([dd5d6d4](https://github.com/stevendejongnl/printer/commit/dd5d6d4fc2ce75769c88347564b9a057bba33d6b))
* Prettier formatting for TypeScript — pre-commit hook + CI check ([226791a](https://github.com/stevendejongnl/printer/commit/226791a0092a56bdbae258107a19bd900b77d294))
* ruff + mypy in CI and pre-commit; fix inline imports; equal card heights per row; outside-click closes hover card ([3ba2ed8](https://github.com/stevendejongnl/printer/commit/3ba2ed8e6ffd12163c08695a8604553c418d94b4))

### Bug Fixes

* load spools in history-page so spool picker dropdown isn't empty ([6977a80](https://github.com/stevendejongnl/printer/commit/6977a80c626c944361de0a610ee4caae46501b8e))
* pre-commit — remove warn_return_any, fix files.py type assert, drop broken type stubs ([f5de6ed](https://github.com/stevendejongnl/printer/commit/f5de6ed58ea583b06796daa5eea61eb8b92bd7c2))
* reconcile also fixes zero-filament-cost prints; spool cost update triggers recalculate ([58590a0](https://github.com/stevendejongnl/printer/commit/58590a0040f21b2cc3818dca24052f20fc4716b7))
* replace type ignores and as-any casts with proper types ([3dce307](https://github.com/stevendejongnl/printer/commit/3dce3077ac3ae04f48cf799e9d598ce5b8870b3f))

## [1.25.4](https://github.com/stevendejongnl/printer/compare/v1.25.3...v1.25.4) (2026-06-06)

### Bug Fixes

* strip HTML tags from enrichment description in hover card ([f4ad996](https://github.com/stevendejongnl/printer/commit/f4ad996878fc50501ec3dce962f56c645383ab0d))

## [1.25.3](https://github.com/stevendejongnl/printer/compare/v1.25.2...v1.25.3) (2026-06-06)

### Bug Fixes

* parse meta JSON string to object when returning project links ([960a5e3](https://github.com/stevendejongnl/printer/commit/960a5e3f5af6d2793cf04f2012a84ac55e9b3497))

## [1.25.2](https://github.com/stevendejongnl/printer/compare/v1.25.1...v1.25.2) (2026-06-06)

### Bug Fixes

* link card via host-level capture click; sort projects by most recent job_id ([8c8ca03](https://github.com/stevendejongnl/printer/commit/8c8ca03f71c0da1697d55dd0f04fae781f3737ac))

## [1.25.1](https://github.com/stevendejongnl/printer/compare/v1.25.0...v1.25.1) (2026-06-06)

### Bug Fixes

* link card mobile/desktop + sort projects by last print time ([a6ed0ea](https://github.com/stevendejongnl/printer/commit/a6ed0eacdd59d8614492115c932d872526866853))

## [1.25.0](https://github.com/stevendejongnl/printer/compare/v1.24.0...v1.25.0) (2026-06-06)

### Features

* link hover card — tap on mobile, always shows open button, fixed position on small screens ([1832299](https://github.com/stevendejongnl/printer/commit/183229944a5da4ac02c34482f966e57d6d5c4aad))

## [1.24.0](https://github.com/stevendejongnl/printer/compare/v1.23.0...v1.24.0) (2026-06-06)

### Features

* hover card on project links — shows cover image, title, description and print settings ([dadbf3c](https://github.com/stevendejongnl/printer/commit/dadbf3c30b67cb3969ac03369f9ad9065e08dc21))

## [1.23.0](https://github.com/stevendejongnl/printer/compare/v1.22.0...v1.23.0) (2026-06-06)

### Features

* support any file type in project uploads (3mf, scad, step, obj, f3d…) ([cc8d38b](https://github.com/stevendejongnl/printer/commit/cc8d38bd7891393f4df192eadcaa3b971b29c3e8))

## [1.22.0](https://github.com/stevendejongnl/printer/compare/v1.21.2...v1.22.0) (2026-06-06)

### Features

* extract print settings from MakerWorld and Printables, display as chips on project links ([5307115](https://github.com/stevendejongnl/printer/commit/53071158223b1ba6abcd25cba839ff49a3c00224))

## [1.21.2](https://github.com/stevendejongnl/printer/compare/v1.21.1...v1.21.2) (2026-06-06)

### Bug Fixes

* readiness probe → /api/version, remove keel annotations (using GitHub Actions) ([244ea57](https://github.com/stevendejongnl/printer/commit/244ea573e050203034be89eb6f306a559b8a771f))

## [1.21.1](https://github.com/stevendejongnl/printer/compare/v1.21.0...v1.21.1) (2026-06-06)

### Bug Fixes

* MakerWorld enrichment via public API (bypasses bot protection) ([4391028](https://github.com/stevendejongnl/printer/commit/4391028b339787182498b32c8b99dd6b556b2d1f))

## [1.21.0](https://github.com/stevendejongnl/printer/compare/v1.20.0...v1.21.0) (2026-06-06)

### Features

* auto-enrich existing project links on startup ([1c7ade1](https://github.com/stevendejongnl/printer/commit/1c7ade1e4e094139f6981e71226339fabceb88db))

## [1.20.0](https://github.com/stevendejongnl/printer/compare/v1.19.2...v1.20.0) (2026-06-06)

### Features

* enrich projects from link OG metadata — cover image, ask on delete ([71c8645](https://github.com/stevendejongnl/printer/commit/71c86453c3dcc1bcdd758b4bc913735753c5d2f6))

## [1.19.2](https://github.com/stevendejongnl/printer/compare/v1.19.1...v1.19.2) (2026-06-06)

### Bug Fixes

* compact idle state row with distinct off/disconnected/idle/complete indicators ([3a57a9e](https://github.com/stevendejongnl/printer/commit/3a57a9eb547eef8bc10fb215f7f26f00e0d7010d))

## [1.19.1](https://github.com/stevendejongnl/printer/compare/v1.19.0...v1.19.1) (2026-06-05)

### Bug Fixes

* poll printer state every 10s — live status always accurate regardless of WS subscription gaps ([0d9bc78](https://github.com/stevendejongnl/printer/commit/0d9bc7855b33d364d1bad6648fbdf0a88a46c10b))

## [1.19.0](https://github.com/stevendejongnl/printer/compare/v1.18.2...v1.19.0) (2026-06-05)

### Features

* auto-refresh project stats + full stat breakdown (avg cost, avg time, longest, avg filament) ([7425428](https://github.com/stevendejongnl/printer/commit/7425428fc5a604ab57457c57f2005941464e6797))

## [1.18.2](https://github.com/stevendejongnl/printer/compare/v1.18.1...v1.18.2) (2026-06-05)

### Bug Fixes

* periodic reconcile every 5min — costs auto-update without manual intervention after missed WS events ([f6b364a](https://github.com/stevendejongnl/printer/commit/f6b364aa31b27de76961f79a8e6323143aa649c1))

## [1.18.1](https://github.com/stevendejongnl/printer/compare/v1.18.0...v1.18.1) (2026-06-05)

### Bug Fixes

* WS watchdog — force reconnect after 90s silence, catches silent subscription loss after Klipper restart ([93dca4f](https://github.com/stevendejongnl/printer/commit/93dca4f2fde7b6f5f2e584735fbcfe5915105699))

## [1.18.0](https://github.com/stevendejongnl/printer/compare/v1.17.0...v1.18.0) (2026-06-04)

### Features

* backfill all prints — energy sensor statistics for accurate historical costs, concurrent reconcile ([e6b388e](https://github.com/stevendejongnl/printer/commit/e6b388e7d5f766045960f9a1a7eda16031cee4e5))

## [1.17.0](https://github.com/stevendejongnl/printer/compare/v1.16.2...v1.17.0) (2026-06-04)

### Features

* page select dropdown in history pagination ([d657c8b](https://github.com/stevendejongnl/printer/commit/d657c8b836523abbc652140671592fa8ccf18d76))

## [1.16.2](https://github.com/stevendejongnl/printer/compare/v1.16.1...v1.16.2) (2026-06-04)

### Bug Fixes

* mobile popup hidden — use :not(.open) so explicit open state isn't overridden ([bf95747](https://github.com/stevendejongnl/printer/commit/bf95747f566d81f4ce5740fd7686fca23098ac44))

## [1.16.1](https://github.com/stevendejongnl/printer/compare/v1.16.0...v1.16.1) (2026-06-04)

### Bug Fixes

* full history — correct total from Moonraker totals endpoint, extend InfluxDB range to 10y ([9480347](https://github.com/stevendejongnl/printer/commit/94803475c3459a9b978d179dd54abc7e70f4d1ef))

## [1.16.0](https://github.com/stevendejongnl/printer/compare/v1.15.2...v1.16.0) (2026-06-04)

### Features

* startup reconciliation — restore costs for prints missed due to pod restarts ([647ad06](https://github.com/stevendejongnl/printer/commit/647ad069fd4e0a0cb02636d771cd8b54fa778650))

## [1.15.2](https://github.com/stevendejongnl/printer/compare/v1.15.1...v1.15.2) (2026-06-04)

### Bug Fixes

* disable hover-open on mobile — prevents double modal on tap ([4c2e5a6](https://github.com/stevendejongnl/printer/commit/4c2e5a6c901f2e8e0378dd6f95a85002e9690ddd))

## [1.15.1](https://github.com/stevendejongnl/printer/compare/v1.15.0...v1.15.1) (2026-06-04)

### Bug Fixes

* project link under filename instead of next to play button, truncated ([6b49bc2](https://github.com/stevendejongnl/printer/commit/6b49bc25e42ff5f29fb594529272d8a2ddbd8579))

## [1.15.0](https://github.com/stevendejongnl/printer/compare/v1.14.5...v1.15.0) (2026-06-04)

### Features

* show project link in history instead of + proj when already linked ([4d0d44d](https://github.com/stevendejongnl/printer/commit/4d0d44d2214bb850d8926647f61cbd8610dcc818))

## [1.14.5](https://github.com/stevendejongnl/printer/compare/v1.14.4...v1.14.5) (2026-06-04)

### Bug Fixes

* disable viewport zoom on input focus on mobile (maximum-scale=1.0) ([78043a0](https://github.com/stevendejongnl/printer/commit/78043a09c700e253f02f2c189f80ef204f8e2d56))

## [1.14.4](https://github.com/stevendejongnl/printer/compare/v1.14.3...v1.14.4) (2026-06-04)

### Bug Fixes

* per-print InfluxDB isolation — timestamp delete, timestamp matching, restore endpoint, job_id tag ([d94a282](https://github.com/stevendejongnl/printer/commit/d94a28288f82f68fde5ba6daeb52c23ec09b316b))

## [1.14.3](https://github.com/stevendejongnl/printer/compare/v1.14.2...v1.14.3) (2026-06-04)

### Bug Fixes

* cost breakdown modal on mobile — bottom sheet with backdrop to close ([28d68ca](https://github.com/stevendejongnl/printer/commit/28d68cae556d6d29315da1effae0dd97a3515c87))

## [1.14.2](https://github.com/stevendejongnl/printer/compare/v1.14.1...v1.14.2) (2026-06-04)

### Bug Fixes

* mobile responsive — nav, projects grid, stats bar, modal widths ([3468c2b](https://github.com/stevendejongnl/printer/commit/3468c2b0f19b72690a5d0dbf7bc9548fab00f70c))

## [1.14.1](https://github.com/stevendejongnl/printer/compare/v1.14.0...v1.14.1) (2026-06-04)

### Bug Fixes

* per-print cost lookup by timestamp — prevents same-file prints sharing one InfluxDB entry ([88b7430](https://github.com/stevendejongnl/printer/commit/88b74306931ed1ee08d108e563b6c64e6b954f7e))

## [1.14.0](https://github.com/stevendejongnl/printer/compare/v1.13.4...v1.14.0) (2026-06-04)

### Features

* assign print to project from history page ([0a8b456](https://github.com/stevendejongnl/printer/commit/0a8b456afeeceb9627f98ace94d57e12c27bddde))
* project detail page — markdown editor, files, links, print picker ([f06d269](https://github.com/stevendejongnl/printer/commit/f06d269f4a8685663514f7cdc38372e899e4a4b4))
* projects API — CRUD, files, links, print association ([8aa2149](https://github.com/stevendejongnl/printer/commit/8aa2149b306e8d665090be25783ab09c6ec67a5a))
* projects grid page, router extension, nav link ([1a60455](https://github.com/stevendejongnl/printer/commit/1a60455d9f16ae59a93657e47933a520efef5d0f))

### Bug Fixes

* markdown prose styles + history button alignment ([ea8d19d](https://github.com/stevendejongnl/printer/commit/ea8d19d2ba6b94d9470b75fd112bc12e35c5a609))

### Documentation

* add projects feature design spec ([d119871](https://github.com/stevendejongnl/printer/commit/d119871b5b0f8aae9099de1ae6a28a7d83345c1a))
* add projects feature implementation plan ([94d4067](https://github.com/stevendejongnl/printer/commit/94d4067389879c5c4be2cb079fa9d01e0746fc3c))

## [1.13.4](https://github.com/stevendejongnl/printer/compare/v1.13.3...v1.13.4) (2026-06-04)

### Bug Fixes

* webcam stream resilience — pause on hidden, 5-error threshold before unavailable ([89a4e0d](https://github.com/stevendejongnl/printer/commit/89a4e0d30b0f90899ae8234a9dbdfec1e7a3a055))

## [1.13.3](https://github.com/stevendejongnl/printer/compare/v1.13.2...v1.13.3) (2026-06-04)

### Bug Fixes

* correct moonraker.get call for disk usage query param ([4532c6b](https://github.com/stevendejongnl/printer/commit/4532c6b82ef6547d7b594005a5e39f1aca426164))

## [1.13.2](https://github.com/stevendejongnl/printer/compare/v1.13.1...v1.13.2) (2026-06-04)

### Bug Fixes

* disk usage from Moonraker files/directory, all-in electricity price sensor ([de36ac5](https://github.com/stevendejongnl/printer/commit/de36ac5f498c64624b7f0fb7581f1fa0a65d6c28))

## [1.13.1](https://github.com/stevendejongnl/printer/compare/v1.13.0...v1.13.1) (2026-06-04)

### Bug Fixes

* use all-in electricity price sensor (spot + energiebelasting + BTW) ([94d7792](https://github.com/stevendejongnl/printer/commit/94d7792b1bd6aadca80bb0d500ad18c41ac2d690))

## [1.13.0](https://github.com/stevendejongnl/printer/compare/v1.12.3...v1.13.0) (2026-06-04)

### Features

* layer from Z+metadata, progress+finish in page title ([2915d85](https://github.com/stevendejongnl/printer/commit/2915d85a5c6eeacbb3bcb13b371087c898d0012a))

## [1.12.3](https://github.com/stevendejongnl/printer/compare/v1.12.2...v1.12.3) (2026-06-04)

### Bug Fixes

* proxy webcam URLs + suppress standby idle flash + fix 0s elapsed display ([59e044b](https://github.com/stevendejongnl/printer/commit/59e044bc66019fa2611faf5a7a6cb2b8d6cf3500))

## [1.12.2](https://github.com/stevendejongnl/printer/compare/v1.12.1...v1.12.2) (2026-06-04)

### Bug Fixes

* print-ready modal — correct flow when Pi stays on, plug toggle → firmware step → klippy wait ([a185316](https://github.com/stevendejongnl/printer/commit/a18531627408d452818f86751bf952eb7cda57b9))

## [1.12.1](https://github.com/stevendejongnl/printer/compare/v1.12.0...v1.12.1) (2026-06-04)

### Bug Fixes

* power-on modal retries print every 5s, handle klippy_ready event, no more infinite spinner ([4098abd](https://github.com/stevendejongnl/printer/commit/4098abda67924fe7380075e8fb9e9d982561359d))

### Code Refactoring

* move all inline imports to module top level ([b90236e](https://github.com/stevendejongnl/printer/commit/b90236e556cb2ec738750f4779bc6cd1e5ba6f07))

## [1.12.0](https://github.com/stevendejongnl/printer/compare/v1.11.2...v1.12.0) (2026-06-04)

### Features

* STL upload button on history rows + fix always-inject (drop already_has_thumbnails guard) ([3f7a201](https://github.com/stevendejongnl/printer/commit/3f7a201471ba9a81ebb8b5d27fef510acf104bee))

## [1.11.2](https://github.com/stevendejongnl/printer/compare/v1.11.1...v1.11.2) (2026-06-04)

### Bug Fixes

* remove loading=lazy from file browser thumbnails so [@error](https://github.com/error) fires and ⊕ button shows ([7a7c590](https://github.com/stevendejongnl/printer/commit/7a7c5907f60b55a876c5bdcdaa6a66c48c8678cc))

## [1.11.1](https://github.com/stevendejongnl/printer/compare/v1.11.0...v1.11.1) (2026-06-04)

### Reverts

* remove toolpath fallback — show nothing if no thumbnail, use STL upload instead ([9702104](https://github.com/stevendejongnl/printer/commit/9702104220df4e86e0c4380f993d16369737cffd))

## [1.11.0](https://github.com/stevendejongnl/printer/compare/v1.10.0...v1.11.0) (2026-06-04)

### Features

* add DELETE /api/files/thumbnail/cache endpoint for cache invalidation ([3942fe9](https://github.com/stevendejongnl/printer/commit/3942fe9a3fced257ef9d681269232cbc5603364c))

## [1.10.0](https://github.com/stevendejongnl/printer/compare/v1.9.0...v1.10.0) (2026-06-04)

### Features

* isometric 3D toolpath preview with height-based colour gradient ([f0e3b1b](https://github.com/stevendejongnl/printer/commit/f0e3b1b790c57119e5f68985536511e24601dcb9))

## [1.9.0](https://github.com/stevendejongnl/printer/compare/v1.8.3...v1.9.0) (2026-06-04)

### Features

* print-ready modal — power on + firmware restart flow before starting a print ([d7077dd](https://github.com/stevendejongnl/printer/commit/d7077dd67fe6fb50d163efbe552956ec0eced1fb))

## [1.8.3](https://github.com/stevendejongnl/printer/compare/v1.8.2...v1.8.3) (2026-06-04)

### Bug Fixes

* use Moonraker .thumbs/ (3D preview) as primary thumbnail source, fall back to embedded then toolpath ([309dfbb](https://github.com/stevendejongnl/printer/commit/309dfbbe4f98adf188e2e58727fe84852db98319))

## [1.8.2](https://github.com/stevendejongnl/printer/compare/v1.8.1...v1.8.2) (2026-06-04)

### Bug Fixes

* catch httpx.HTTPStatusError directly to properly convert Moonraker 404 to HTTP 404 ([89597e5](https://github.com/stevendejongnl/printer/commit/89597e50115fe296994b33d72869189b22110e7f))

## [1.8.1](https://github.com/stevendejongnl/printer/compare/v1.8.0...v1.8.1) (2026-06-04)

### Bug Fixes

* return 404 (not 502) when gcode file not found on printer, use 128KB read ([96a0ca8](https://github.com/stevendejongnl/printer/commit/96a0ca87c4e47835624bec368af10e4454f9a42f))

## [1.8.0](https://github.com/stevendejongnl/printer/compare/v1.7.4...v1.8.0) (2026-06-04)

### Features

* render gcode toolpath as thumbnail fallback when no embedded thumbnail exists ([a990b0c](https://github.com/stevendejongnl/printer/commit/a990b0c614f69af06d77db418f16a89f5668695e))

## [1.7.4](https://github.com/stevendejongnl/printer/compare/v1.7.3...v1.7.4) (2026-06-04)

### Bug Fixes

* handle CRLF line endings and thumbnail_JPG format (OrcaSlicer/BambuStudio) ([f4aa88c](https://github.com/stevendejongnl/printer/commit/f4aa88c6d96d409080e9891a352e6a8274bfda67))

## [1.7.3](https://github.com/stevendejongnl/printer/compare/v1.7.2...v1.7.3) (2026-06-04)

### Bug Fixes

* increase partial gcode read to 128KB for large Cura thumbnails ([a6d0af2](https://github.com/stevendejongnl/printer/commit/a6d0af28aea4c386d6ab54c454a09f883b27795c))

## [1.7.2](https://github.com/stevendejongnl/printer/compare/v1.7.1...v1.7.2) (2026-06-04)

### Bug Fixes

* don't render file list when modal closed — prevents 180 thumbnail requests on page load ([8d77e14](https://github.com/stevendejongnl/printer/commit/8d77e14a8390dc77c0ff4c7f4ae9bb3f07b8268f))

## [1.7.1](https://github.com/stevendejongnl/printer/compare/v1.7.0...v1.7.1) (2026-06-04)

### Performance Improvements

* lazy-load thumbnails to avoid flooding server with 180 simultaneous requests ([b859f35](https://github.com/stevendejongnl/printer/commit/b859f35b3d124568bf0a91dcb4566038cf74d49f))

## [1.7.0](https://github.com/stevendejongnl/printer/compare/v1.6.1...v1.7.0) (2026-06-04)

### Features

* thumbnails in history/recent-prints, partial gcode fetch, in-memory cache ([92e2506](https://github.com/stevendejongnl/printer/commit/92e2506e658bccf40282b22aede7b2072973d936))

## [1.6.1](https://github.com/stevendejongnl/printer/compare/v1.6.0...v1.6.1) (2026-06-04)

### Bug Fixes

* **thumbnails:** extract directly from embedded gcode comments, bypass Moonraker extraction ([0a299eb](https://github.com/stevendejongnl/printer/commit/0a299eb43a2b8096f7b2e4827548be257dd80c94))

## [1.6.0](https://github.com/stevendejongnl/printer/compare/v1.5.4...v1.6.0) (2026-06-04)

### Features

* version badge in topbar, fix thumbnail 404 (inline base64 + dual URL fallback) ([3dc0ed9](https://github.com/stevendejongnl/printer/commit/3dc0ed9abf1d840cdffa3f9fe8a67288aa292004))

## [1.5.4](https://github.com/stevendejongnl/printer/compare/v1.5.3...v1.5.4) (2026-06-03)

### Bug Fixes

* **webcam:** iOS snapshot polling fallback — MJPEG not supported in iOS Safari ([4440adb](https://github.com/stevendejongnl/printer/commit/4440adbb0a692d72851541429492a86174e704ad))

## [1.5.3](https://github.com/stevendejongnl/printer/compare/v1.5.2...v1.5.3) (2026-06-03)

### Bug Fixes

* recalculate cost button, HA fallback in recorder, history dynamic refresh ([bbbe357](https://github.com/stevendejongnl/printer/commit/bbbe35722588e45a2babff8a500cac13c5c1832f))

## [1.5.2](https://github.com/stevendejongnl/printer/compare/v1.5.1...v1.5.2) (2026-06-03)

### Bug Fixes

* 30s HA settle delay, broadcast history_updated SSE, auto-refresh history on print complete ([4993e9c](https://github.com/stevendejongnl/printer/commit/4993e9c6a706ba784ad8159805b565d34a1a5d27))

## [1.5.1](https://github.com/stevendejongnl/printer/compare/v1.5.0...v1.5.1) (2026-06-03)

### Bug Fixes

* **printer:** seed full state via REST after WS connect to always populate layer info ([d784f4c](https://github.com/stevendejongnl/printer/commit/d784f4cf99f66bff44efc286b4e202d7dfb64f7f))

## [1.5.0](https://github.com/stevendejongnl/printer/compare/v1.4.0...v1.5.0) (2026-06-03)

### Features

* **ui:** Fluidd-style live status — speed, filament, layers, finish time, progress ring ([a027a25](https://github.com/stevendejongnl/printer/commit/a027a25c393781968d07c80a3f4c8e3d7f9e6c09))

## [1.4.0](https://github.com/stevendejongnl/printer/compare/v1.3.2...v1.4.0) (2026-06-03)

### Features

* **ci:** add self-hosted k8s deploy job after docker push ([22eb3eb](https://github.com/stevendejongnl/printer/commit/22eb3eb1745ec30ab0b426bedd7414c078e158b2))

## [1.3.2](https://github.com/stevendejongnl/printer/compare/v1.3.1...v1.3.2) (2026-06-03)

### Bug Fixes

* subscribe to display_status for progress, merge partial updates for layer/state ([f0a426a](https://github.com/stevendejongnl/printer/commit/f0a426a068dce560b9daafb039ffaf6f1911b4ec))

## [1.3.1](https://github.com/stevendejongnl/printer/compare/v1.3.0...v1.3.1) (2026-06-03)

### Bug Fixes

* merge partial Moonraker status updates to prevent temp/state flipping to zero ([f7d6adb](https://github.com/stevendejongnl/printer/commit/f7d6adbe45368d8e56ddb5192a34937e6a9a1c02))
* read initial printer state from WS subscription result ([afcf431](https://github.com/stevendejongnl/printer/commit/afcf43196e70d0e195feff35e9e033855ac8fca2))

## [1.3.0](https://github.com/stevendejongnl/printer/compare/v1.2.0...v1.3.0) (2026-06-03)

### Features

* **files:** generate STL thumbnail and embed into gcode on-demand ([0309357](https://github.com/stevendejongnl/printer/commit/0309357b8c14831f87b44d163d8db536a88a777f))

## [1.2.0](https://github.com/stevendejongnl/printer/compare/v1.1.4...v1.2.0) (2026-06-03)

### Features

* **files:** thumbnail preview in file browser for Cura gcode files ([f2b04f0](https://github.com/stevendejongnl/printer/commit/f2b04f017b6862b6bef2437bf8bd82815f9aa158))

## [1.1.4](https://github.com/stevendejongnl/printer/compare/v1.1.3...v1.1.4) (2026-06-02)

### Bug Fixes

* full mobile responsive pass — history cards, spools grid, touch popup ([afaacdd](https://github.com/stevendejongnl/printer/commit/afaacddcbf75257d7de006bf4e582bacf4862544))

## [1.1.3](https://github.com/stevendejongnl/printer/compare/v1.1.2...v1.1.3) (2026-06-02)

### Bug Fixes

* read Cura filament_total mm not filament_weight_total ([d5d447b](https://github.com/stevendejongnl/printer/commit/d5d447b040330fdeff5c22f4ac22620ad6226fff))

## [1.1.2](https://github.com/stevendejongnl/printer/compare/v1.1.1...v1.1.2) (2026-06-02)

### Bug Fixes

* **security:** cap chunk count/size, stream assembly to tempfile ([c16164b](https://github.com/stevendejongnl/printer/commit/c16164b7e59a1bfcead04b1b8fde6cb50fcc4dec))

## [1.1.1](https://github.com/stevendejongnl/printer/compare/v1.1.0...v1.1.1) (2026-06-02)

### Bug Fixes

* **security:** prevent path traversal in chunked upload endpoint ([7a35da8](https://github.com/stevendejongnl/printer/commit/7a35da8c2e2b484ff862243b10e582ceec28d4e3))

## [1.1.0](https://github.com/stevendejongnl/printer/compare/v1.0.11...v1.1.0) (2026-06-02)

### Features

* chunked upload bypasses Cloudflare 100MB limit ([6e1447f](https://github.com/stevendejongnl/printer/commit/6e1447f52e13918d648898c6616a10f4dbd371de))

## [1.0.11](https://github.com/stevendejongnl/printer/compare/v1.0.10...v1.0.11) (2026-06-02)

### Bug Fixes

* enforce 100MB Cloudflare free plan upload limit ([46dc191](https://github.com/stevendejongnl/printer/commit/46dc191b83435b4b75bc12146d61e6b198ce3d83))

## [1.0.10](https://github.com/stevendejongnl/printer/compare/v1.0.9...v1.0.10) (2026-06-02)

### Bug Fixes

* nginx 256m body-size limit and 300s upload timeout ([fe2d125](https://github.com/stevendejongnl/printer/commit/fe2d12553d6f79713823f1c32dca16c512c081a6))

## [1.0.9](https://github.com/stevendejongnl/printer/compare/v1.0.8...v1.0.9) (2026-06-02)

### Bug Fixes

* prevent parent re-render from overwriting uploaded filename ([f36d113](https://github.com/stevendejongnl/printer/commit/f36d113a97c582359b326382de4645ff33bcd92d))

## [1.0.8](https://github.com/stevendejongnl/printer/compare/v1.0.7...v1.0.8) (2026-06-02)

### Bug Fixes

* add 60s timeout to file upload, improve error messages ([2faba58](https://github.com/stevendejongnl/printer/commit/2faba58b5dc12d35d994cc7986e17b1cd89bc9e7))

## [1.0.7](https://github.com/stevendejongnl/printer/compare/v1.0.6...v1.0.7) (2026-06-02)

### Bug Fixes

* add drag-and-drop support to gcode upload zone ([6d6ed23](https://github.com/stevendejongnl/printer/commit/6d6ed236f17e8dba97a0476c8778878c0ca02a55))

## [1.0.6](https://github.com/stevendejongnl/printer/compare/v1.0.5...v1.0.6) (2026-06-02)

### Bug Fixes

* actually upload file to Moonraker instead of dispatching unhandled event ([9ed1cc0](https://github.com/stevendejongnl/printer/commit/9ed1cc0147261bf619425f3632c7363a3ef77d9d))

## [1.0.5](https://github.com/stevendejongnl/printer/compare/v1.0.4...v1.0.5) (2026-06-02)

### Bug Fixes

* file input display:none blocks programmatic click ([5ae79b6](https://github.com/stevendejongnl/printer/commit/5ae79b6d35497306e84775eb3bef4add0b767f8b))

## [1.0.4](https://github.com/stevendejongnl/printer/compare/v1.0.3...v1.0.4) (2026-06-02)

### Bug Fixes

* file upload click not working in cost predictor ([13d8a70](https://github.com/stevendejongnl/printer/commit/13d8a70871c3b265d3cb0234fbdb5a6887f3fc19))

## [1.0.3](https://github.com/stevendejongnl/printer/compare/v1.0.2...v1.0.3) (2026-06-02)

### Bug Fixes

* **ci:** use gh api to get release SHA instead of git fetch ([49b8cc4](https://github.com/stevendejongnl/printer/commit/49b8cc426d05093809d27f33bcddfdca75ebe829))

## [1.0.2](https://github.com/stevendejongnl/printer/compare/v1.0.1...v1.0.2) (2026-06-02)

### Bug Fixes

* **ci:** use GITHUB_TOKEN instead of expired PAT for semantic-release ([e7597db](https://github.com/stevendejongnl/printer/commit/e7597db60eb824d465f52f11a3f40502fe3e278a))

## [1.0.1](https://github.com/stevendejongnl/printer/compare/v1.0.0...v1.0.1) (2026-06-02)


### Bug Fixes

* restore git credentials for semantic-release changelog push ([2be4a2e](https://github.com/stevendejongnl/printer/commit/2be4a2edc0112eae7ca7b9e4510137f4acb7c2d2))

# 1.0.0 (2026-06-02)


### Bug Fixes

* k8s PV, imagePullSecret, storage class, SSE ingress annotations ([833bcac](https://github.com/stevendejongnl/printer/commit/833bcac63b44e9130555a1fcd8a8fcef3f6d7b94))
* mobile responsive layout across all components ([b3afa77](https://github.com/stevendejongnl/printer/commit/b3afa775c72c2748f090c9a030168103683c5838))


### Features

* add print buttons to history, history-page, and cost predictor ([fb06c05](https://github.com/stevendejongnl/printer/commit/fb06c0520e1cdb5a37eecca10cffef8a35055080))
* controls, webcam, history, spools, k8s deployment ([72f5f85](https://github.com/stevendejongnl/printer/commit/72f5f85d381cb8aa13095196304ce349928bd392))
* implement printer dashboard — FastAPI + Lit + SSE ([2ac854b](https://github.com/stevendejongnl/printer/commit/2ac854b012ca5463bf529c5073565bf2ff0aef52))
* semantic versioning + Keel auto-deploy ([837a515](https://github.com/stevendejongnl/printer/commit/837a5153f722b7acf0faf847e824abef8a052d51))
