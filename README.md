# ASTRALIS: The Aetheria Signal

Game source and runtime assets for **macOS** and **Windows**. The native hosts share the same JavaScript game code: Swift + WebKit on macOS, C# + Photino/WebView2 on Windows.

## Clone

Install Git LFS before cloning so the 3D models are downloaded:

```sh
git lfs install
git clone https://github.com/ThtsPiks/ASTRALIS.git
cd ASTRALIS
git lfs pull
```

The repository is private. GitHub access to this repository is required. Downloading a ZIP from GitHub may leave model pointers instead of the actual assets; use Git + LFS.

## macOS

Requirements: macOS 12+, Xcode Command Line Tools, Node.js 22+.

```sh
bash scripts/build_macos.sh
open dist/macos/ASTRALIS.app
```

The build uses the current Mac architecture. To build for Intel explicitly:

```sh
ASTRALIS_SWIFT_TARGET=x86_64-apple-macos12.0 bash scripts/build_macos.sh
```

The app bundles its game assets and is signed locally with an ad-hoc signature. Developer ID signing/notarization for public distribution is not configured.

## Windows

Requirements: 64-bit Windows, Node.js 22+, .NET 8 SDK, Microsoft Edge WebView2 Runtime.

```sh
node scripts/build-windows.mjs
```

Run `dist/windows/ASTRALIS.exe`. Keep the complete output folder together, including `www/` and supporting libraries. The build includes the .NET runtime; players still need WebView2.

The same script can cross-publish from macOS/Linux with the .NET SDK installed. If `dotnet` is outside PATH, set `DOTNET` to its executable path. Cross-compilation does not verify gameplay on Windows.

## Development

Native builds do not require `npm install`. Node is used only to stage and check resources.

```sh
node scripts/check.mjs
npm run test:logic
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765` for browser development. The native hosts provide desktop integration and save handling.

The existing Electron wrapper is also included as an alternative development path:

```sh
npm ci
npm start
```

`npm run dist:mac` and `npm run dist:win` use Electron Builder on the corresponding operating system. Native builds above are the primary desktop targets.

## Included

- `src/`, `index.html`, `styles.css`: game logic, story, rendering and interface.
- `native/`, `electron/`: desktop host source and app icons.
- `models/`: six GLB models currently referenced by the game, stored in Git LFS.
- `vendor/`, `guide/`, `ui/`: required libraries, local fonts and game imagery.
- `scripts/`: build, resource validation and existing game logic checks.
- `tools/bake_content.py`: optional planetary cache generator.

Builds, installed dependencies, saves, logs, UI mockups, videos, marketing captures and the generated 2.4 GB planetary cache are excluded. The original desktop game folder is not modified by this export.

To regenerate the optional legacy cache locally, install NumPy in a Python environment and run:

```sh
python3 -m venv .venv
# Activate the environment for your operating system, then:
python -m pip install numpy
python tools/bake_content.py --gb 2.35
```

The current surface renderer does not import `ChunkStore`; native packaging uses only the runtime asset list in `scripts/web-assets.json`. Generated `data/cache/` is not committed or bundled.

Third-party library and font license notices are kept with those assets. Bundled models remain subject to their original asset rights; this private source export does not grant a new asset license.
