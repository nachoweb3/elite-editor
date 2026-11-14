# Roadmap

Our priority is a useful, reliable free local editor. These are planned milestones, not features already shipped or promised delivery dates.

## 1. Trust the edit

- Reopen and export a 30-minute project without lost media, timing changes or broken audio sync.
- ~~Job cancellation and live progress~~ (shipped). Still to test: restart recovery, missing files, low disk space and GPU fallback.
- ~~Text-based editing, filler removal and caption downloads~~ (shipped). Next: word-level selection and speaker labels.
- Make every proposed cut individually reviewable in the timeline.
- Add visual regression and real browser playback/export coverage.

## 2. One editing experience

- Import generated explanations as editable timeline layers.
- Translate backend camera moves to native keyframes.
- Implement real cross-dissolves and richer audio automation.
- Improve source-versus-timeline status, onboarding and accessibility.
- Complete Spanish/English localization.

## 3. Easy to install and contribute

- Signed packaging and a dependency doctor with actionable fixes.
- Reproducible native/WASM builds and a broader hardware/browser matrix.
- Portable project backup/restore with explicit media inclusion.
- More curated assets with traceable licenses.

## 4. Optional hosted services, later

Remote GPU processing, storage, synchronization and collaboration may become optional services. There is no payment integration in this release. Hosted execution first needs real cost measurements, authentication, quotas, isolation and data deletion controls. Local editing should remain useful on its own.

Useful contributions now: reproducible bugs, small UI improvements, test coverage, documentation and translations. Please discuss large engine changes before implementation.
