---
name: motion-graphics
description: Create a motion graphic end to end — spoken script, drawn SVG visuals, composed music bed, and a HyperFrames HTML-to-MP4 composition — then check it and open a Studio preview. Use for explainers, lesson clips, title cards, kinetic type, charts, maps and social clips, or when the user says "motion graphic", "วิดีโออธิบาย", "คลิปสอน", "ไตเติล", "แอนิเมชัน". Stops at preview and renders MP4 only when asked.
---

# Motion graphics

One motion graphic = **บท → ภาพ → เสียง → คอมโพสิชัน → ตรวจ → preview**. This plugin ships the whole chain: the writing guide, the drawing guide, the music recipe, the HyperFrames contract and the CLI launcher. A machine with only this plugin can make the video; nothing needs to be installed in advance except Node.js 22+ — FFmpeg is installed on request the first time a render or a snapshot needs it, and the script and music tools are plain Node.

## กฎเหล็ก (do not break these)

1. **จบงานที่ preview** — after `check` and `snapshot`, open the Studio preview, send the link, and stop. Never render on your own, even for a "finished" clip, even if the user said "ทำเลย" without naming a render. Render only when the user explicitly asks with words like render, เรนเดอร์, เอาวิดีโอ, export, ขอไฟล์, ส่งไฟล์.
2. **Every CLI call goes through the bundled launcher** below — never `npx hyperframes` directly, never a project wrapper.
3. **Nothing appears before it is spoken** — one line of script = one visual beat, and it enters when the line is spoken.
4. **Read before drawing.** `references/art.md` before the first shape; the `hyperframes` skill before the first composition.

## The CLI

```sh
node "<this skill's directory>/scripts/hf.mjs" <command> [options]
```

Run it **in the project directory**. `<this skill's directory>` is the resource base reported when this skill loads (the folder holding this SKILL.md); keep the quotes — the path usually contains spaces. The launcher keeps npm, Chrome, history and temporary files inside `<project>/.hf-cache` (a shell sandbox cannot write the home folder), turns Chrome's sandbox off, and delegates to the HyperFrames CLI launcher bundled in the sibling `hyperframes` skill.

- Set `HF_CACHE_DIR=/a/writable/dir` to share one cache (and one downloaded Chrome) across projects.
- Set `HF_CLI=/path/to/hyperframes.mjs` to use a CLI that is already on the machine instead of the npm download.
- First run downloads the CLI and a headless Chrome — needs network. Check the machine once per machine with `... hf.mjs doctor` before the first render.
- `--json` on most commands; a failure prints `✗ …`, a `Fix:` line and exits non-zero.

### FFmpeg — checked and installed for you

`render`, `snapshot` and `beats` cannot produce output without FFmpeg, so the launcher checks before it delegates:

- **present** → its paths are exported as `HYPERFRAMES_FFMPEG_PATH` / `HYPERFRAMES_FFPROBE_PATH` and the command runs;
- **missing** → it asks once, then installs on the machine (`scripts/ensure-ffmpeg.mjs`): `winget`/`brew`/`apt-get` when available, otherwise a per-user static build with no admin rights. `--install-ffmpeg` answers yes up front; `--no-install-ffmpeg` refuses and prints the manual path. Non-interactive runs without either flag stop with a `Fix:` line instead of installing silently.
- The install lives outside the project (`%LOCALAPPDATA%\motion-graphics\ffmpeg\bin` on Windows, `~/Library/Application Support/motion-graphics/ffmpeg/bin` on macOS, `~/.local/share/motion-graphics/ffmpeg/bin` on Linux), survives cache clears, and can be moved with `MOTION_GRAPHICS_TOOLS_DIR`.
- On a machine that has never run this bundle, run `node "<this skill's directory>/scripts/setup.mjs" --install` once: it checks Node, installs FFmpeg, and pre-downloads the CLI and a headless Chrome into one shared cache. `--json` reports without changing anything; `--python` is optional and never required.
- Check what the machine has at any time with `node "<skill>/scripts/ensure-ffmpeg.mjs" --check`; install ahead of the first render with `... hf.mjs doctor --install-ffmpeg` (the flag installs, then `doctor` reports the result). Never work around a missing encoder by weakening the composition.

## Pipeline

| # | Phase | Output | Read / run |
|---|---|---|---|
| 1 | Brief | 6 answers, one round | this file |
| 2 | Script | `script.txt` + `script.json` + timing table | `references/script-style.md`, `scripts/txt_to_json.mjs` |
| 3 | Picture plan | scene list `Sxx — purpose — seconds`; `SPEC.md` for a film | `references/art.md` |
| 4 | Music | `music.wav` (only if the clip needs a bed) | `references/music.md`, `scripts/make_music.mjs` |
| 5 | Build | HyperFrames project under the workspace | `hyperframes` + `hyperframes-cli` skills |
| 6 | Check | `check --json` clean, snapshots looked at | `... hf.mjs check`, `snapshot` |
| 7 | Preview | Studio URL in the reply, then wait | `... hf.mjs preview --background` + `--status` |
| 8 | Render | `out.mp4` — **only on an explicit request** | `... hf.mjs render` |

### 1. Brief — one round, options with a recommended default

Topic, audience, target length, language, aspect ratio and where the clip sits in its series. Default 1920×1080 at 30 fps unless the request or the source says otherwise. Ask only what cannot be inferred from the conversation or from earlier scripts in the same series (read those first and match their voice). If the user says "เขียนเลย", proceed on stated assumptions.

### 2. Script

Read `references/script-style.md` and follow its lesson shape, voice and line rules. The output is two files with the same content: `script.txt` (human) and `script.json` (voice/visual pipeline).

```sh
node "<this skill's directory>/scripts/txt_to_json.mjs" script.txt script.json
```

It prints characters, estimated seconds per scene and lines that are too long — measure, don't guess (≈ 10.2 Thai characters per second, ≈ 2.5 English words per second). For a clip that is only a title card or a data piece, skip the lesson shape and write the on-screen copy as variables instead.

### 3. Picture plan

Turn each line into one visual. Write the scene list first (`Sxx name — purpose — seconds`; the seconds must add up to the target), then read `references/art.md` before drawing: silhouette first, flat shapes, measured composition, QA in greyscale / two-tone / 64 px thumbnail. Thai lettering is drawn, not typed: ship the font as a file in `assets/fonts/` and load it with `@font-face` — never rely on a family name the CLI does not bundle (`hyperframes/references/format.md`).

### 4. Music bed

Only when the clip needs one: **compose it, never download a track.**

```sh
node "<this skill's directory>/scripts/make_music.mjs" music.wav --dur <clip seconds> --mood warm|calm|bright --key D
```

Balance by measured RMS, not by ear, and mux with `loudnorm=I=-16:TP=-2:LRA=9`. Method, layer targets and the QA you can do without hearing it: `references/music.md`.

### 5. Build

```sh
... hf.mjs init <project-name> --skip-skills --non-interactive
```

Then read the bundled **`hyperframes`** skill (composition contract, work loop, what each kind of video needs) and **`hyperframes-cli`** (commands, `--json`, timeline edits, recovery) before writing a line of composition. In short:

- `index.html` is the root composition; one scene per sub-composition under `compositions/`; media and fonts in `assets/`.
- Every timed element is `class="clip"` with `data-start` / `data-duration`; the root's `data-duration` is the video length.
- Each composition registers its paused timeline as `window.__timelines["<data-composition-id>"]`.
- No `Date.now()`, unseeded `Math.random()`, network fetches, timers or infinite repeats — everything is a function of timeline time.
- Copy, colours and swappable media are variables (`data-var-text`, `--id`), so the user can edit in Studio.
- Reuse a registry block (`catalog`, `add`) before hand-building a named effect.

### 6. Check — this is the gate, not an optional step

```sh
... hf.mjs check --json        # lint + runtime + layout + contrast
... hf.mjs snapshot --review   # or --at/--range/--composition for a small change
```

Fix every error and weigh every warning; read the snapshot PNGs (they land under `.hyperframes/artifacts/snapshots/`) — that is how you see the video. Look for Thai text that is clipped, overlapping or unmatched in weight, for a missing hero, and for any scene that does not change. Passing checks alone is not a reason to render.

### 7. Preview — the hand-off point

```sh
... hf.mjs preview --background
... hf.mjs preview --status --json
```

The status JSON reports one server per project: `result.port`, `result.host` and `result.studioUrl` (usually `http://127.0.0.1:<port>/#project/<name>`). Send `result.studioUrl` exactly as reported — do not guess the port — and, in a few lines, what you built, what you checked, and what remains unverified. Keep the preview running while they review; `... hf.mjs preview --stop` when the review is over or the user asks.

### 8. Render — only on an explicit request

```sh
... hf.mjs render --quality delivery -o out.mp4
```

Use `--quality draft` while iterating. After the render, confirm the file is non-empty, `ffprobe` its duration against the root's `data-duration`, look at a few decoded frames, then report the path, size and length. Never publish, upload or share a render unless asked.

## Files

| Path | What |
|---|---|
| `references/script-style.md` | Lesson shape, scene recipes, line rules, voice, writing for the picture, checklist. |
| `references/art.md` | How to draw the visuals: silhouette-first, the SVG rules, five-pass drawing, composition numbers, palettes, the 3-image QA. Read before drawing anything. |
| `references/music.md` | Music beds: when to compose instead of licensing, the synthesis recipe, level targets, syncing accents, QA without hearing it. |
| `scripts/hf.mjs` | Portable HyperFrames CLI launcher (caches inside the project, checks FFmpeg first). |
| `scripts/ensure-ffmpeg.mjs` | Finds FFmpeg/FFprobe, or installs them on the machine (package manager, else per-user static build). |
| `scripts/setup.mjs` | One-command preparation of a new machine: Node check, FFmpeg, HyperFrames + Chrome pre-download, optional Python. |
| `scripts/txt_to_json.mjs` | `script.txt` → `script.json` + timing report + long-line warnings. Pure Node. |
| `scripts/make_music.mjs` | `music.wav` from duration / mood / key / BPM — deterministic, pure Node (own FFT, no samples). |
| `scripts/txt_to_json.py`, `scripts/make_music.py` | Legacy Python/NumPy originals, kept for reference only; the `.mjs` versions are the supported path. |
| `assets/script_template.txt` | Skeleton with the standard scene order and prompts. |

## Working with a machine that is not yours

Everything the plugin needs is inside the plugin; only the project folder holds state. Caches, npm downloads, Chrome, history and snapshots stay in `<project>/.hf-cache` and `<project>/.hyperframes`, so a project folder can be copied to another machine and opened there. On a fresh machine run the bundle installer (`install.ps1` on Windows, `install.sh` on macOS/Linux) — it adds Node.js if missing, FFmpeg, the CLI and Chrome, and Python — or run `node "<skill>/scripts/setup.mjs" --install --all` once the machine already has Node. Every helper is Node, so the bundle itself needs only Node.js 22+. If FFmpeg is missing, run `... hf.mjs doctor --install-ffmpeg` (it asks before installing); when the machine cannot download or the user declines, say so and name the install command for the platform (macOS: `brew install ffmpeg`, Windows: `winget install Gyan.FFmpeg`, Debian/Ubuntu: `sudo apt install ffmpeg`) instead of rendering a broken file.

## script.txt format

```
## S01 คำถามเปิด
คลิปหนึ่งมียอดวิวหนึ่งล้าน
Impression || อิมเพรสชัน
```

- `## Sxx name` starts a scene; every following non-empty line is one spoken line.
- `display || spoken`: left = on screen / subtitles, right = what the voice or TTS reads. Use it for English terms, digits, symbols, abbreviations. Without `||` both are the same.
- Lines starting with `#` (not `##`) are notes and are dropped.
- `[[INSTRUCTOR]]` alone on a line marks the instructor / title card (kept as a marker scene in json).

`script.json` is `[{"n": "S01 …", "p": [["a", "display", "spoken (only if different)"], …]}]`; the keys `a, b, c, …` are stable anchors that visuals and timing refer to, and a marker becomes `{"n": "INSTRUCTOR", "marker": true, "p": []}`.
