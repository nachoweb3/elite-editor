# Contributing

Thank you for helping make free local editing better.

1. Follow the README setup and reproduce the issue with a short synthetic or shareable clip.
2. Open an issue describing expected/actual behavior, OS, browser, GPU if relevant, and steps to reproduce. Remove secrets and personal paths from logs.
3. Keep pull requests focused. Explain the user-facing result, how you tested it, and known limitations.
4. Run `npm test`, `npm run test:ui` and the main editor TypeScript check. For processing changes, run the FFmpeg integration test. For GPU changes, test the Rust shader and keep WASM bindings in sync.
5. Preserve upstream licenses and attribution. Do not contribute assets or model weights without clear redistribution rights.

OpenCut's architecture instructions apply within its directory: portable core logic belongs in Rust; the UI shell owns presentation and interaction. Backend orchestration remains in `server/`. Never commit `.env` files, local configurations, recordings, caches, project data or credentials.

There is no contributor license agreement configured. Contributions to original project code are under its MIT license; third-party adaptations retain their original terms.
