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
