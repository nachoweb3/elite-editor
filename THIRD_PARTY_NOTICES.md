# Third-party notices

This file describes source and assets included in this distribution. Preserve the original license files when redistributing. Packages installed through npm, Bun, pip or Cargo and optional model weights remain governed by their own licenses; the root MIT license applies to Elite Editor's original contributions.

| Component | Origin | Included license / scope |
|---|---|---|
| OpenCut Classic | [OpenCut-app/opencut-classic](https://github.com/OpenCut-app/opencut-classic), base commit `cf5e79e919144200294fb9fed22a222592a0aeea` | [Original MIT notice](vendor/opencut-classic/LICENSE). Adapted UI/core plus custom effects. Upstream is archived; this is an independent adaptation. |
| Open Generative AI | [anil-matcha/open-generative-ai](https://github.com/anil-matcha/open-generative-ai), base commit `1abf71705f100eea4a2dafe68512c36883d606b6` | [MIT](vendor/open-generative-ai/LICENSE). Only the catalog and capability/dimension helpers are included, not the full application. |
| Face Beautifier | [CTBot000/face-beautifier](https://github.com/CTBot000/face-beautifier), base commit `ca5ad40b58e2d0133de6b22282b29000d3667046` | [MIT](vendor/face-beautifier/LICENSE). Landmark regions and temporal-filter adaptation in the portrait worker. |
| Kenney Interface Sounds | [Kenney](https://kenney.nl/assets/interface-sounds), distribution from [Calinou](https://github.com/Calinou/kenney-interface-sounds) | [CC0 notice](resources/kenney-interface-sounds/LICENSE.txt), 100 WAV sounds. |
| Kenney Music Jingles | [Kenney](https://kenney.nl/assets/music-jingles) | [CC0 notice](resources/kenney-music-jingles/License.txt), 85 OGG jingles. |
| Shadow | [James Gargette / cinameng](https://opengameart.org/content/shadow-2) | [CC0 notice](resources/music-shadow/LICENSE.txt), three ambient variants. |

The bundled `sound_effects/soft-whoosh.wav` was synthesized for this project without third-party samples and is included under the project license.

## Installed or optional dependencies

- FFmpeg/ffprobe are not bundled. Build-specific FFmpeg licensing applies to whichever binaries you install.
- Whisper/faster-whisper, Ollama and MediaPipe are optional execution dependencies; model weights are not bundled. Consult the upstream project and the selected model's license before redistribution or hosted use.
- The legacy `web/` interface uses Remotion packages. Remotion has its own licensing terms; the presence of an MIT license at this repository root does not relicense it. The main editor is the adapted OpenCut interface.
- MuAPI and Pexels are optional external services. Their API terms, costs and asset terms are separate from the source license. No API credentials are included.
- Upstream OpenCut packages and included public assets keep their upstream notices. Lockfiles record the installed dependency graph.

Elite Editor does not imply endorsement by any upstream project or ownership of third-party trademarks. User-imported media is not licensed by this repository.
