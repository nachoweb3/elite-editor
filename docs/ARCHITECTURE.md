# Technical architecture

## Execution

`npm run dev` runs `scripts/opencut-dev.mjs`. It starts the Node backend on loopback port 4310 and the adapted Next.js editor on loopback port 5181, or reuses healthy services already there. Next forwards `/nacho-api/:path*` to the backend. Do not run two different checkouts on these same ports: a healthy existing instance will be reused.

The Node API validates local host/origin and uses a session token for mutation requests. These controls are for a local app, not an authentication or tenancy system. HTTPS, user accounts, distributed storage and remote job isolation are not implemented.

## Data and editing

The browser core stores projects and media in IndexedDB/OPFS. Backend projects are JSON plus source/artifact files in local directories. Both systems have their own editing history.

`server/opencut-bridge.mjs` produces a transport manifest in seconds. The assistant converts it to native MediaTime, imports the source and appends clips/captions with one undoable snapshot. The reverse adapter accepts supported main-track clips linked to one original at normal speed with no gaps. Unsupported compositions are rejected rather than silently flattened.

Source enhancement processes the original recording, checks duration/dimensions, and replaces references to linked media while preserving timeline timing and other layers. Backend decorative rendering and browser timeline rendering remain different paths.

Prompt preview creates a cached plan bound to project, revision and instruction. The client supplies the reviewed plan ID when applying. Expired/mismatched plans fail; stale revisions and running jobs also block unsafe mutations.

## Optional processing

- FFmpeg: probing, silence detection, audio filters, source enhancement and backend render.
- Python: faster-whisper, MediaPipe/OpenCV and Pillow stickman drawing.
- Ollama: structured editing plans and concept selection. Some fallbacks use deterministic speech rules and report that limitation.
- MuAPI: explicit optional image/video generation; uncertain submissions are not automatically resubmitted to avoid duplicate provider charges.

The job queue is local/in-process with persisted status. It is not a durable distributed GPU queue. Restart recovery does not make the service multi-user safe.

## Rust and WASM

`vendor/opencut-classic/rust/wasm/pkg` contains the custom compiled WASM package used by this checkout, so first-time users do not need a Rust toolchain. Source is included, including `rust/crates/effects/src/shaders/elite.wgsl` and the native GPU regression test.

To rebuild, install Rust, the `wasm32-unknown-unknown` target and a compatible wasm-pack/wasm-bindgen toolchain, then run from `vendor/opencut-classic`:

```sh
cargo test -p effects --test elite_gpu --release
wasm-pack build rust/wasm --target bundler --out-dir pkg
```

The shipped JS/WASM pair was generated with wasm-bindgen 0.2.116. Keep generated bindings and the binary together. Preserve the package name `opencut-wasm` and local `file:` dependencies when rebuilding; do not accidentally substitute the published upstream WASM package, which lacks these custom effects. Refresh the Bun installation after rebuilding. Native GPU tests require an available compatible graphics adapter.

## Verification

The public package includes synthetic unit tests, reviewed-plan tests, a DOM assistant test with mocked core/media, and an FFmpeg enhancement smoke test. Tests using the author's private transcript fixtures are deliberately excluded. Unit/DOM checks do not validate GPU behavior in every browser or long-video export.

`npm run build` builds the earlier Vite interface only. The primary editor has its own Next.js scripts under `vendor/opencut-classic/apps/web`. A production SaaS deployment is outside this release.
