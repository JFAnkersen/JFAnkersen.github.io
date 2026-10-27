# CLAUDE.md: guide for Claude working on this site

This is Jesper Ankersen's (GitHub: JFAnkersen) personal engineering portfolio,
published with GitHub Pages at **https://jfankersen.github.io**.

## Who you're working with

- Jesper is an engineer (control, automation, mathematical modelling, test engineering,
  embedded/STM32, KiCad, 3D printing). He is **new to web development and git**.
- He usually writes in **Danish**. Answer in the language he writes in, in plain words,
  and explain web/git terms briefly when they come up.
- The agreed workflow is **"describe it → Claude does it"**: he describes changes in his
  own words, drops images in a folder and says where they go. You make the change,
  show it in the preview, and publish it.
- Don't make him upload files through the GitHub website. That failed for him before
  (folders were left out). Publish with git instead.

## Setting up on a new PC (first time only)

1. Git must be installed (`git --version`). If it isn't, ask him to install
   Git for Windows from https://git-scm.com.
2. Clone the repo into his Documents folder:
   `git clone https://github.com/JFAnkersen/JFAnkersen.github.io.git "$HOME\Documents\GitHub-hjemmeside"`
3. Check that `git config --global user.name` / `user.email` are set
   (name `JFAnkersen`, email `jfankersen@gmail.com`). If they're missing, ask before setting them.
4. Open the Claude session in that folder. The first `git push` may open a GitHub sign-in
   window: **he signs in himself**. Never type his credentials.

## Workflow for every change

1. `git pull` first. He may have edited from the other PC.
2. Make the change.
3. Preview it locally (see below) and check it on desktop and mobile width (375 px):
   no horizontal scroll, no console errors.
4. Tell him what changed (and show it in the preview pane) and get his OK.
   If he already said "commit and push" in the same request, that counts as the OK.
5. Commit with a short English message describing the change, then `git push` to `main`.
6. GitHub Pages is live after about 30–60 s. Verify on https://jfankersen.github.io
   (fetch with a cache-busting `?t=` query). Tell him to press **Ctrl + F5** if he
   still sees the old version.

There is no build step. The files in the repo are exactly what gets served.

## Local preview

Python and Node are **not** installed on his PCs. A tiny PowerShell server is included:

- `.claude/launch.json` has a `portfolio` config → use `preview_start` with name `portfolio`
  (http://localhost:8123).
- Or by hand: `powershell -ExecutionPolicy Bypass -File tools\serve.ps1 -Root . -Port 8123`

The server sends `Cache-Control: no-store`. If the preview still shows old content, check
which folder the server is serving from (an old server may still be running on that port).

## File structure

```
index.html                 Front page: hero, featured project, all projects, about, contact
css/style.css              All styling. Colors are CSS variables in :root (+ dark mode block)
js/projects.js             ← THE PROJECT LIST. Most content changes happen here
js/main.js                 Builds the featured project, filter buttons and cards from projects.js
projects/<name>.html       One page per project (flight-controller.html is the template)
img/frontpage/             Images for the front page (hero, about, etc.)
img/<project>/             One image folder per project, named like its page (img/flight-controller/)
tools/serve.ps1            Local preview server (not part of the site)
```

### Adding or editing a project: `js/projects.js`

Each project is one object in `PROJECTS`:

| Field | Meaning |
|---|---|
| `title`, `summary` | Card title and one- or two-sentence description |
| `category` | A key from `CATEGORIES` (embedded, pcb, control, software, other). Filter buttons only appear for categories in use |
| `tags` | Short labels, e.g. `["STM32", "C"]` |
| `image` | `"img/<project>/file.jpg"` or `""` |
| `video` | Any YouTube link or 11-char ID. Without an `image`, the card uses the YouTube thumbnail and gets a "▶ Video" link |
| `page` | `"projects/<name>.html"` or `""` |
| `repo` | GitHub link or `""` |
| `featured` | `true` = the big block at the top. Only the first featured project is used |
| `parts` | Optional `[{icon, title, text}]`, shown as boxes under the featured project |

For a new project page: copy `projects/flight-controller.html`, rename it, change the text,
set `page` in projects.js, and create a matching `img/<name>/` folder (with a short README.txt
so git keeps the folder while it's empty).

### Images

- Front-page images go in `img/frontpage/`, project images in that project's folder
  (`img/flight-controller/`). He drops them there, or tells you where they are
  (e.g. Desktop or Downloads) and you copy them in.
- From a project page, the path is relative: `../img/flight-controller/pcb.jpg`.
- Use lowercase file names without spaces (`pcb.jpg`).
- Large photos: scale them down to about 1600 px wide before committing so the site stays fast.
  Use PowerShell/.NET `System.Drawing`, since no Python is available.
- Always set a meaningful `alt` text.

### YouTube videos

- On a card: set `video` in projects.js.
- Inside a project page: the `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/VIDEO_ID">`
  block. Replace `VIDEO_ID` with the 11 characters after `watch?v=` / `youtu.be/`.

## Design

- Fonts: Inter (text) and JetBrains Mono (eyebrows, tags), loaded from Google Fonts.
- Accent blue `--accent` plus teal `--accent-2`, used in the headline gradient (`.accent`).
- "Blueprint" grid background in the hero and placeholders (`--grid-line`).
- Light and dark mode follow the visitor's system setting. Change colors in both blocks.
- Keep the look clean and technical. Make the layout work from 375 px phone width up.

## Current status (update this list as things change)

- Headline: "Control, automation, mathematical modelling & Test Engineering."
- Hero buttons: GitHub + LinkedIn (https://www.linkedin.com/in/jesper-ankersen-898b02195).
- The hero no longer has the three skill boxes, and the featured block has no "Featured project" label.
- Featured project: **Flight Controller** ("Universal Quad Controller Rev1" + a separate PDB,
  two wiring setups: minimal and GPS & wireless telemetry to a laptop "bench app").
  Uses his photos, KiCad renders and wiring diagrams in `img/flight-controller/`.
  The project page has dashed `.todo` paragraphs where his own text is still missing
  (idea, firmware, PDB, bench app, 3D print, results, lessons). No video yet.
- Full-size originals of his photos are kept in `img/<project>/originals/`, which is git-ignored.
  Put scaled copies with clean names next to it.
- `img/frontpage/` is still empty.
- The other projects (Optimizer, Dynamic system model, Automation script)
  are **example placeholders**. The Roblox example was removed at his request. Replace or remove them when he gives real projects.
- About section text, the contact email (`you@example.com`) and the YouTube channel link
  are still placeholders.
