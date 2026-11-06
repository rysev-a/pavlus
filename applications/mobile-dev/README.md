# Mobile Dev

The Flow Studio board and the Visual Builder, made for a phone. There is no backend: the diagram and the interface live in the phone's own storage, so it works as a static site.

- **Board** (`/`): the diagram fills the screen. Drag an icon from the dock at the top of the board onto the plot to add a component; the toolbar above it is one row you swipe. Pinch or Shift + wheel zooms, drag the background to pan, drag a frame by its header and resize it by its corners.
- **Interface** (`/interface`): the Visual Builder, with its Library, Canvas and Inspector tabs.
- **Theme** switches light and dark.

It is built from the ui-kit's own components (`framework/ui-kit/frontend/templates/flow-studio` and `visual-builder`), unchanged; the shell here is a tab bar and a phone layout (`frontend/styles.css`).

## Run

```bash
npm run dev --workspace mobile-dev
```

`--host` is on, so the phone on the same Wi-Fi opens the address Vite prints under "Network".

## Published on GitHub Pages

`.github/workflows/ui-kit-pages.yml` builds this app next to the ui-kit and publishes it at `https://<user>.github.io/<repo>/mobile/` (for this repository: `https://rysev-a.github.io/pavlus/mobile/`). The deploy runs on pushes to `main`. One-time setup: Settings → Pages → Build and deployment → Source: "GitHub Actions".

On the phone: open the address, then "Add to Home Screen" for a full-screen app.

```bash
MOBILE_BASE=/pavlus/mobile/ npm run build --workspace mobile-dev   # what the workflow runs
```

The site has no history fallback, so the build writes the shell for every address of the app (`404.html` and `interface/index.html`).
