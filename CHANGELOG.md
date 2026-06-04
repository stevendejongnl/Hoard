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
