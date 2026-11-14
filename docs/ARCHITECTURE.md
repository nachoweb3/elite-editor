# Technical architecture

## Execution

`npm run dev` runs `scripts/opencut-dev.mjs`. It starts the Node backend on loopback port 4310 and the adapted Next.js editor on loopback port 5181, or reuses healthy services already there. Next forwards `/nacho-api/:path*` to the backend. Do not run two different checkouts on these same ports: a healthy existing instance will be reused.

The Node API validates local host/origin and uses a session token for mutation requests. These controls are for a local app, not an authentication or tenancy system. HTTPS, user accounts, distributed storage and remote job isolation are not implemented.

## Data and editing

The browser core stores projects and media in IndexedDB/OPFS. Backend projects are JSON plus source/artifact files in local directories. Both systems have their own editing history.

`server/opencut-bridge.mjs` produces a transport manifest in seconds. The assistant converts it to native MediaTime, imports the source and appends clips/captions with one undoable snapshot. The reverse adapter accepts supported main-track clips linked to one original at normal speed with no gaps. Unsupported compositions are rejected rather than silently flattened.

Source enhancement processes the original recording, checks duration/dimensions, and replaces references to linked media while preserving timeline timing and other layers. Backend decorative rendering and browser timeline rendering remain different paths.

Prompt preview creates a cached plan bound to project, revision and instruction. The client supplies the reviewed plan ID when applying. Expired/mismatched plans fail; stale revisions and running jobs also block unsafe mutations.

Plans come from two interpreters with the same output shape, validated by the same `applyPlan`:

- `server/rule-planner.mjs` — deterministic Spanish/English rules. Cuts require explicit numbers (seconds, minutes, `mm:ss`, ranges, first/last N); settings move in bounded steps with intensity words ("un poco", "mucho") or explicit values ("zoom al 110%"). It reports clauses it did not understand.
- `server/ollama.mjs` + the model prompt — used for nuanced requests.

`promptEngine: "auto"` (default) uses the rules first when they fully understand an instruction that contains cuts (small models are unreliable with timestamps), the model otherwise, and the rules again when Ollama is unreachable or returns an invalid plan. The preview reports which engine produced it.

Text-based editing (`server/transcript-tools.mjs`) works on word timestamps in source time: filler/stutter detection never uses estimated timings, pads cuts without crossing neighbouring words, and only proposes intervals still present in the edit. Restoring a phrase re-enables only the missing gap and is limited to single-source edits in source order. `/subtitles?format=srt|vtt|txt` builds captions of the current montage on the fly, resolving each clip against its own recording.

Pacing, transcript correction, statistics and the publishing draft live in `server/insights.mjs` (pure functions). Corrections keep real word timings when the word count is unchanged and otherwise mark words as estimated, so they are never used to cut. `server/publish.mjs` asks the model only to reword the rule draft, with item counts enforced by the JSON schema, and validates every field; the result is cached per project revision. Rendering requires an explicit approval (`/approve`), which changes no cut or setting.

The interface uses the Xeno design language (`apps/web/src/app/xeno.css`): dark tokens, glass panels with HUD corners, aurora background and energy buttons. It relies on system fonts (Bahnschrift, Cascadia, Segoe UI Variable) to stay offline, and disables motion under `prefers-reduced-motion`.

Asset registry paths inside the checkout are stored relative (`resources/...`, `input/assets/...`) and older absolute entries are re-anchored, so the folder can be moved or cloned. The server creates its data folders at startup.

## Optional processing

- FFmpeg: probing, silence detection, audio filters, source enhancement and backend render.
- Python: faster-whisper, MediaPipe/OpenCV and Pillow stickman drawing.
- Ollama: structured editing plans and concept selection. Some fallbacks use deterministic speech rules and report that limitation.
- MuAPI: explicit optional image/video generation; uncertain submissions are not automatically resubmitted to avoid duplicate provider charges.

The job queue is local/in-process with persisted status. It is not a durable distributed GPU queue. Restart recovery does not make the service multi-user safe.

Each job runs inside an `AsyncLocalStorage` context carrying an `AbortSignal`; every `run()` call made by the job inherits it, so `POST /projects/:id/cancel` stops the whole FFmpeg/Python process tree (`taskkill /T` on Windows) and later steps refuse to start. Queued jobs are simply removed. Progress is derived from output the tools already print (fragment counters, Whisper timestamps, FFmpeg `time=`) and exposed per job as `{stage, fraction|null}`; unknown stages are indeterminate rather than guessed. `GET /capabilities` summarizes FFmpeg, transcription, Ollama, face model and NVENC availability with actionable hints, cached for a minute.

Facial retouching is optional at render time: without the Python runtime or `models/face_landmarker.task` the original is used and the job reports it.

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
