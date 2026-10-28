## [1.39.4](https://github.com/stevendejongnl/Hoard/compare/v1.39.3...v1.39.4) (2026-10-28)

### Bug Fixes

* **dashboard:** the lists say they are loading or failed, and keep the print action ([75a604a](https://github.com/stevendejongnl/Hoard/commit/75a604afb30d29cab0712ac38d65c85a0c0c76c1))
* **projects:** the page says it is loading, and that loading failed ([baecab1](https://github.com/stevendejongnl/Hoard/commit/baecab1c525020755e4f502d40c97001d72f30b7))

## [1.39.3](https://github.com/stevendejongnl/Hoard/compare/v1.39.2...v1.39.3) (2026-10-28)

### Bug Fixes

* **k8s:** the data volume is pinned to worker-pve2, where the data is ([09f1046](https://github.com/stevendejongnl/Hoard/commit/09f10464f626f410bd685f3a6a4661c172ae93ef))

## [1.39.2](https://github.com/stevendejongnl/Hoard/compare/v1.39.1...v1.39.2) (2026-10-28)

### Bug Fixes

* **config:** uploaded project files go next to the database, so they survive a restart ([e6776aa](https://github.com/stevendejongnl/Hoard/commit/e6776aaada1fa42289551566d569b806a57191c0))

## [1.39.1](https://github.com/stevendejongnl/Hoard/compare/v1.39.0...v1.39.1) (2026-10-28)

### Code Refactoring

* rename the app internals from printer to Hoard ([5077e6c](https://github.com/stevendejongnl/Hoard/commit/5077e6c2df4e843d80c7ecd1859171dfaa8e91e1))

## [1.39.0](https://github.com/stevendejongnl/Hoard/compare/v1.38.0...v1.39.0) (2026-10-28)

### Features

* **parity:** a script takes the README screenshots from the sample data ([05c8c20](https://github.com/stevendejongnl/Hoard/commit/05c8c20a70b3e96973087a1eeeb9a34a279e5f0e))

### Documentation

* README with screenshots, license, and a clean tree ([414bf3a](https://github.com/stevendejongnl/Hoard/commit/414bf3a879ab48ef6fee3405031c6b4d2cc998f7))

## [1.38.0](https://github.com/stevendejongnl/Hoard/compare/v1.37.0...v1.38.0) (2026-10-28)

### Features

* **bottom-tabs:** the phone tab bar with icons, shown only at phone width ([07c9dd6](https://github.com/stevendejongnl/Hoard/commit/07c9dd6d66119c0385faadf4d3bd43ebf7add30e))
* **brand:** installed app icons rendered from the Hoard mark, with a separate maskable icon ([1ce982f](https://github.com/stevendejongnl/Hoard/commit/1ce982f2059d9fad1a4fb260fd6278b5d7e016e0))
* **brand:** name the installed app, page and notifications Hoard ([d527e67](https://github.com/stevendejongnl/Hoard/commit/d527e672d34917e9a7c45f4490cff2e8b64ab384))
* **dashboard:** camera panel with stream, fallback and buttons ([19c2ce4](https://github.com/stevendejongnl/Hoard/commit/19c2ce4f012c0522ffda4165a6d5a6843d2459ea))
* **dashboard:** collapsible cost predictor ([f796e31](https://github.com/stevendejongnl/Hoard/commit/f796e3190787e465f217d9fb15e978047a9b60ae))
* **dashboard:** dashboard page composes the panels for desktop and phone ([7c32cb7](https://github.com/stevendejongnl/Hoard/commit/7c32cb7fc799d34ffdb1303362dcfcc9a63b5a07))
* **dashboard:** dashboard styles, page wired into the app, and its parity fixtures ([f8786d9](https://github.com/stevendejongnl/Hoard/commit/f8786d9302efa5aa63b31aed843a6b90c48b5c12))
* **dashboard:** lists panel with recent prints and spools tabs ([22322b4](https://github.com/stevendejongnl/Hoard/commit/22322b45723cb165a58fbf2969f2470b0bdf09b9))
* **dashboard:** parameter panel with print job, temperatures, power and Raspberry Pi ([8404ba1](https://github.com/stevendejongnl/Hoard/commit/8404ba139f358a8570ffbdecc1592e62c777819e))
* **dashboard:** phone print summary and temperature section ([e442689](https://github.com/stevendejongnl/Hoard/commit/e44268994008993431af3abf744e6dda9238d663))
* **dashboard:** print job metrics and temperature status ([6fd84e9](https://github.com/stevendejongnl/Hoard/commit/6fd84e97444ce8e926e63d94528bc952e620dcb9))
* **dashboard:** print timeline ([3020f19](https://github.com/stevendejongnl/Hoard/commit/3020f198ed87c0026385f123396902c2369bcd0f))
* **dashboard:** temperature chart component with history refresh ([8b2a5f7](https://github.com/stevendejongnl/Hoard/commit/8b2a5f7680529751a33852ebb934d1274ea164a7))
* **dashboard:** temperature chart geometry ([88a159a](https://github.com/stevendejongnl/Hoard/commit/88a159a90ddb8d8d32ff256d0cc429fc67c8adc3))
* **favicon:** use the Hoard mark as an SVG favicon instead of the printer emoji ([ff7b3b7](https://github.com/stevendejongnl/Hoard/commit/ff7b3b7e79a09855cb017229570b9be7b6500ab2))
* **files:** file browser dialog as a table with search, upload and select ([e0231d3](https://github.com/stevendejongnl/Hoard/commit/e0231d38f32f4d0e1e89b130c4c8ff9cb2fcb2cb))
* **files:** file browser dialog at pixel parity, starting with the predictor's file selected ([c6cb781](https://github.com/stevendejongnl/Hoard/commit/c6cb781657b4aecd3b343c11bbe52543f3eb5496))
* **files:** the file browser opens from the cost predictor menu and the empty prints list ([9f647ac](https://github.com/stevendejongnl/Hoard/commit/9f647ac1633c260072478f838002968b4784e26f))
* **history:** desktop history screen at pixel parity, with the design's chosen print ([7069fa1](https://github.com/stevendejongnl/Hoard/commit/7069fa17a19552ebfe31b40c78c123f69e4e5bb3))
* **history:** format, filter and sort the print list ([829c287](https://github.com/stevendejongnl/Hoard/commit/829c2878a1ef4bfe6250993bea5b91492bea8f99))
* **history:** phone history screen at pixel parity, with class names that stay in the page ([7cb806e](https://github.com/stevendejongnl/Hoard/commit/7cb806e943c1775175f1500b00069b9f25116b89))
* **history:** short print date without the year ([756fea7](https://github.com/stevendejongnl/Hoard/commit/756fea7694bb219b35e3b6f3fa4b94108d4564a6))
* **history:** three panel history page with filters, selected print and load more ([3c24d3f](https://github.com/stevendejongnl/Hoard/commit/3c24d3fc813e53a5049de9cfda4ecb7f2e6c824e))
* **icons:** the design's icon set as decorative inline SVG with full names ([ae73db7](https://github.com/stevendejongnl/Hoard/commit/ae73db7cfe9bef7f7ce2fca88f810393e8037616))
* **logo:** render the Hoard mark with a small variant and unique layer-line masks ([3490609](https://github.com/stevendejongnl/Hoard/commit/349060979a8a4d0ab142fdad7d8b0aee5c75760b))
* **markdown-editor:** notes panel with edit, save, cancel and a visible save failure ([d1f7008](https://github.com/stevendejongnl/Hoard/commit/d1f700803071ad9f5a02617c8df20f09fc4b37c8))
* **navigation:** map routes to sections and follow links without reloading ([3784fa6](https://github.com/stevendejongnl/Hoard/commit/3784fa64116ad017a2235966a9df9f22a1d7635d))
* **nfc:** read the next tag with Web NFC ([3233600](https://github.com/stevendejongnl/Hoard/commit/3233600fd98a32dbd2cb77f8b1ec00e4340e8846))
* **nfc:** scan a spool tag, and link or unlink it on the spools screen ([8faa119](https://github.com/stevendejongnl/Hoard/commit/8faa119a5a451a4c827fd1579aab4404fe0d2393))
* **nfc:** spools can be linked to a tag and found by it ([d645e31](https://github.com/stevendejongnl/Hoard/commit/d645e31d776fd35d63c124476d537b2ca4a63558))
* **parity:** compare screenshots with references using a channel tolerance and a share limit ([0255f43](https://github.com/stevendejongnl/Hoard/commit/0255f4364ac7d05818f058abe30a57359e726bf6))
* **parity:** fixtures for the print detail, search and file browser screens ([f939d47](https://github.com/stevendejongnl/Hoard/commit/f939d47911bb46eeb45ae5ae28d0ee893c45d841))
* **parity:** mock backend serving the design's data over JSON and server-sent events ([df1fa42](https://github.com/stevendejongnl/Hoard/commit/df1fa4246d80a0256567bbee8f4cb0cd65744fa5))
* **parity:** read the backend and app ports from the environment ([6660612](https://github.com/stevendejongnl/Hoard/commit/6660612d88d3b646162e2f409cdb389c6d953bca))
* **parity:** run every screen against the design and report how far it is ([39f6fa3](https://github.com/stevendejongnl/Hoard/commit/39f6fa3893a9c1f77aedd70921c04f8e5c89cac1))
* **parity:** the bell is a measured screen on the desktop and the phone header ([23246c2](https://github.com/stevendejongnl/Hoard/commit/23246c2e208bf255b1e7c1e52fe59d760b5e7622))
* **parity:** the mock backend answers paged lists by limit and offset ([9aee493](https://github.com/stevendejongnl/Hoard/commit/9aee493adff884914029ba435c41629e0bb7ebc8))
* **print-detail:** print detail at pixel parity, with Hoard styled photos ([a80b7e6](https://github.com/stevendejongnl/Hoard/commit/a80b7e69e8f6cd72a45bf7967d635239ba4caf65))
* **print-detail:** three panel print detail with facts, slicer info, photos, notes and cost ([341e17e](https://github.com/stevendejongnl/Hoard/commit/341e17ec8cdfd1ad2358c1666aa2291cf4593fe8))
* **printer-app:** top bar, page, status bar and phone tabs wired to the route and printer state ([4167109](https://github.com/stevendejongnl/Hoard/commit/4167109c10598c83e073ca8f00cfdf063468e46e))
* **print:** print dialog at pixel parity ([ec355c4](https://github.com/stevendejongnl/Hoard/commit/ec355c4626f4bb5adbc8e99c4fde6ef623eb9a93))
* **print:** print dialog with a confirm step and the steps to get the printer ready ([8f1e099](https://github.com/stevendejongnl/Hoard/commit/8f1e0998679ebe8f1da20e7d9d08743b7441c7fc))
* **project-detail-page:** totals, notes, links, files and prints panels, delete with confirmation, desktop and phone ([25c6f44](https://github.com/stevendejongnl/Hoard/commit/25c6f44d205dee1b4b29a6f745916a27433abfa0))
* **project-files-section:** files panel with G-code picker, model upload and remove ([9ea0e2e](https://github.com/stevendejongnl/Hoard/commit/9ea0e2e8c6f3e3f7f19a8040a368625ebd11f1c3))
* **project-prints-panel:** prints of a project with a picker to add or remove prints from history ([c65a876](https://github.com/stevendejongnl/Hoard/commit/c65a87691737e0f461d526c82632df1efc719e0f))
* **projects-page:** search, sort, totals, cards and new project, desktop and phone ([6c9561b](https://github.com/stevendejongnl/Hoard/commit/6c9561b0431d97e1feacb3f7f4e68bb8143d1a57))
* **projects:** sort, filter, totals and formatting of the project list ([1a4efa7](https://github.com/stevendejongnl/Hoard/commit/1a4efa760c7ca2b8b512d4e243396d6c681f2d76))
* **push:** the print notification bell in the top bar ([a34bb42](https://github.com/stevendejongnl/Hoard/commit/a34bb42b48e7ce6f0f27fe1cf9f6e751c89ca62a))
* **search:** command palette with grouped results, keyboard and scopes ([f55e1c3](https://github.com/stevendejongnl/Hoard/commit/f55e1c3ff59af3aae47d977d2d8a905663614db1))
* **search:** search palette at pixel parity ([839a735](https://github.com/stevendejongnl/Hoard/commit/839a73501a188c2465fa9ffda03e1faf70a524f9))
* **spools-page:** spools screen from the design, desktop and phone ([0d4a71d](https://github.com/stevendejongnl/Hoard/commit/0d4a71d8c513feb7c14a56d5e727d5a04e9db6cb))
* **spools:** filtering, summary, labels and form parsing ([46a8d1f](https://github.com/stevendejongnl/Hoard/commit/46a8d1f649bd9c586aeb4685e45c355e1a7d70ad))
* **spools:** spool sheet board shows the full sheet, at pixel parity ([1fb3e2e](https://github.com/stevendejongnl/Hoard/commit/1fb3e2e9d8e83b276c34e3531d1daa528267927b))
* **spools:** the phone edit form is a bottom sheet over a dimmed list ([2399931](https://github.com/stevendejongnl/Hoard/commit/2399931e6b4a31d7984e88d0f0230345ef59358a))
* **status-bar:** accent picker opened from the version text ([ccd8747](https://github.com/stevendejongnl/Hoard/commit/ccd8747159917adccc083ea0b26877e0c3870886))
* **status-bar:** connection, Klipper state, freshness and version along the bottom edge ([d5a60ea](https://github.com/stevendejongnl/Hoard/commit/d5a60ead02332ead32667b05f510086ffd1e2055))
* **stream:** expose connection status and reconnect through an injected event source ([2af0b07](https://github.com/stevendejongnl/Hoard/commit/2af0b0715b73daff811902271b12b46f6b3189fc))
* **styles:** design tokens, shared component styles, bundled fonts and accent restore ([9041ed2](https://github.com/stevendejongnl/Hoard/commit/9041ed2a5173ef76299c7e5090cb21312aa6053b))
* **temperatures:** history endpoint from Moonraker's temperature store ([0fcaaea](https://github.com/stevendejongnl/Hoard/commit/0fcaaea651d24f9398da19344b9aab644a5e91b9))
* **theme:** apply, store and restore the accent color through injected storage and root element ([bc55201](https://github.com/stevendejongnl/Hoard/commit/bc5520176a4728e13b663f07cdf2085ecf9e6869))
* **theme:** derive accent text color and selection tint with full names and small functions ([7049aaf](https://github.com/stevendejongnl/Hoard/commit/7049aaf016e6a7be6e9b525084502bc139866997))
* **theme:** normalize accent hex input ([51e6998](https://github.com/stevendejongnl/Hoard/commit/51e69982cfe94dd2970b875799d147ac6baa1045))
* **top-navigation:** always-visible emergency stop that asks first and reports failures ([e261e67](https://github.com/stevendejongnl/Hoard/commit/e261e67ab75ce3e7ecd1b94d4f3175ab60142188))
* **top-navigation:** brand and tabs with the current page, styled from the design ([cf653cb](https://github.com/stevendejongnl/Hoard/commit/cf653cbb0848f90312c22e605cb48e48c75c9312))
* **top-navigation:** phone header with page title and back link, and a search button ([c285bd0](https://github.com/stevendejongnl/Hoard/commit/c285bd06ba40ff55e65cfe64b2882e709c8ae6e9))
* **top-navigation:** show the printer state as a badge while printing, paused or in error ([c0205a2](https://github.com/stevendejongnl/Hoard/commit/c0205a2c0c1b2e5fad8bbc4ba28584cf168c8757))

### Bug Fixes

* **brand:** read the public files relative to the project in the brand metadata test ([a280b24](https://github.com/stevendejongnl/Hoard/commit/a280b24927a66c410716c131aadca91c5726d8f5))
* **chart:** only a quarter value is an exact tie; total label colour on the dashboard ([a596c9a](https://github.com/stevendejongnl/Hoard/commit/a596c9a238b254c4b7e18a461e862b99b7dd34cc))
* **chart:** round ties like the design and feed the chart the design's own series ([723e622](https://github.com/stevendejongnl/Hoard/commit/723e62232f8e8adc4d9aadf4147be9c958507875))
* **chart:** the x of a point is computed like the design computes it ([b7fee66](https://github.com/stevendejongnl/Hoard/commit/b7fee6649a890b2691dff3622d3fd08e60c12591))
* **config:** ignore unrelated values in the env file ([7fd302a](https://github.com/stevendejongnl/Hoard/commit/7fd302a93ddd955cc790181abf636033272c93b3))
* **dashboard:** dashboard screens at pixel parity, with the parity clock fixed in UTC ([1371be5](https://github.com/stevendejongnl/Hoard/commit/1371be59b3f89358b051b2b47ebd23c2beb5692d))
* **dashboard:** phone header edge and stop icon match the design ([59acfc3](https://github.com/stevendejongnl/Hoard/commit/59acfc3aa31dc9c387735daf858c35d149242c3d))
* **design:** delete icon, file search placeholder and a mouse that stays out of the screens ([a6568d4](https://github.com/stevendejongnl/Hoard/commit/a6568d414c6439e5ec50b3ad29b6e27daa31a1af))
* **design:** predicted filament unit, print back button and dashboard title match the design ([60e3a88](https://github.com/stevendejongnl/Hoard/commit/60e3a88950a43a961a418aae35c4a0deeefcefa7))
* **history:** the selected print's spool sits on one flex line ([2420e65](https://github.com/stevendejongnl/Hoard/commit/2420e652981ae20244ea87233e4e09b1408650b4))
* **parity:** the print ready board's third backdrop row is the helicopter blade ([9b9b926](https://github.com/stevendejongnl/Hoard/commit/9b9b926f1d4cd3fcfc4b171ca8d44c87e883f9dd))
* **parity:** the temperature series satisfies both the desktop and the phone chart ([efd268c](https://github.com/stevendejongnl/Hoard/commit/efd268c3cbaf02f9ecb85bc97fe3d5f651327d26))
* **parity:** zero pixels may differ; history search icon and phone close icon match ([39b8235](https://github.com/stevendejongnl/Hoard/commit/39b823580ebd724ce31a9c1697653ba6877b2ad4))
* **phone:** project title gap, file buttons and assign link match the design ([206b6de](https://github.com/stevendejongnl/Hoard/commit/206b6de551cb0e4ee44c9cab9417a96f13201857))
* **release:** point semantic-release at the renamed Hoard repository ([448a580](https://github.com/stevendejongnl/Hoard/commit/448a5807407551f67b0f169fbb1c2b50ac8e9e73))
* **search:** the palette element takes no room in the top bar ([5e2dbe9](https://github.com/stevendejongnl/Hoard/commit/5e2dbe977169da6421824275d558f541717dbc87))
* **spools:** empty field units take room on the phone sheet only ([a0f9ec6](https://github.com/stevendejongnl/Hoard/commit/a0f9ec6ca59def382b94cc042c5f2491ea9d45f7))
* **spools:** phone filter row padding matches the design again ([1f870f3](https://github.com/stevendejongnl/Hoard/commit/1f870f30425e1ffe2b7e8d1a3dfa67039f3f0cd4))
* **spools:** phone sheet fields, notes box and edit button match the design ([4e05183](https://github.com/stevendejongnl/Hoard/commit/4e051831179832ea704a7c7f9fd61716b0d5276a))
* **status-bar:** hide the status bar on phone again after the accent picker styles ([9c2d11a](https://github.com/stevendejongnl/Hoard/commit/9c2d11a98639ea5a5b69d543906ac4ee14259bbf))
* **styles:** buttons reset letter spacing like a button element ([c637c95](https://github.com/stevendejongnl/Hoard/commit/c637c95df2fe75aca44994c792a73d641d0cd4e9))
* **styles:** buttons size with their border and spool inputs stay on their page ([a99932d](https://github.com/stevendejongnl/Hoard/commit/a99932d4a438bcb57593e5353e64a55045fdee96))
* **styles:** history search field and print detail units stay true to the design ([704da74](https://github.com/stevendejongnl/Hoard/commit/704da7472034bd0171e1ffa0a8da93788554b14b))
* **top-navigation:** match the design's icon sizes and phone title color ([8efdb82](https://github.com/stevendejongnl/Hoard/commit/8efdb82f8d9605ae0252328c01ee3b6fa8f65348))

### Code Refactoring

* **frontend:** names without abbreviations, lint warnings 79 to 0 ([6f40455](https://github.com/stevendejongnl/Hoard/commit/6f40455ed4fbe151b10916ba7b091cbf4562396a))
* **frontend:** short functions without nesting; limits depth 2, callbacks 1, 30 lines ([1f1102e](https://github.com/stevendejongnl/Hoard/commit/1f1102ea30e60c8f3405589cb292a954d9077c55))

### Documentation

* **design:** the top bar board shows the notification bell ([0f625a5](https://github.com/stevendejongnl/Hoard/commit/0f625a503d35fed626dd257718219e233ae737e6))

## [1.37.0](https://github.com/stevendejongnl/printer/compare/v1.36.3...v1.37.0) (2026-08-28)

### Features

* add installable PWA support with push notifications ([da063b5](https://github.com/stevendejongnl/printer/commit/da063b5c77b66452d49f2c10714a40d4a70513e5))

### Bug Fixes

* redraw PWA icon as an actual 3D printer, pin release-notes-generator dep ([faf1afc](https://github.com/stevendejongnl/printer/commit/faf1afc252d37ec9b494598a054e6cd762eb81b4))

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
