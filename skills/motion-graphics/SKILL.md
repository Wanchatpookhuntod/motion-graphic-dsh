---
name: mg-fast
description: Fast motion graphics for DeepSeek Harness - the first skill to load for any request to make a motion graphic, explainer clip, title card, kinetic type, chart or social clip ("motion graphic", "วิดีโออธิบาย", "คลิปสอน", "ไตเติล", "แอนิเมชัน"). Carries its own HyperFrames contract and CLI launcher, has a short path for clips of 20 seconds or less, stops at the Studio preview and renders MP4 only when asked. Use it instead of the motion-graphics, hyperframes and general-video skills.
---

# Motion graphics

One motion graphic = **บท → ภาพ → เสียง → คอมโพสิชัน → ตรวจ → preview**. This plugin ships the whole chain: the writing guide, the drawing guide, the music recipe, the HyperFrames contract and the CLI launcher. A machine with only this plugin can make the video; nothing needs to be installed in advance except Node.js 22+ — FFmpeg is installed on request the first time a render or a snapshot needs it, and the script and music tools are plain Node.

## กฎเหล็ก (do not break these)

0. **This skill is self-contained.** Do not load the `motion-graphics`, `hyperframes`, `hyperframes-cli`, `hyperframes-*`, `general-video` or `media-use` skills, and read nothing under `~/.agents/skills`: they are a different, heavier workflow with a different launcher. The contract you need is this plugin's `mg-hyperframes` skill, the file `<this skill's directory>/../hyperframes/SKILL.md`. Do not install the CLI yourself (no `npm install hyperframes`, no `npx`): the launcher below is the only way to run it.

1. **จบงานที่ preview** — after `check` and `snapshot`, open the Studio preview, send the link, and stop. Never render on your own, even for a "finished" clip, even if the user said "ทำเลย" without naming a render. Render only when the user explicitly asks with words like render, เรนเดอร์, เอาวิดีโอ, export, ขอไฟล์, ส่งไฟล์.
2. **Every CLI call goes through the bundled launcher** below — never `npx hyperframes` directly, never a project wrapper.
3. **Nothing appears before it is spoken** — one line of script = one visual beat, and it enters when the line is spoken.
4. **Read before drawing, and only what the path names.** `references/art.md` before the first shape; the `mg-hyperframes` skill before the first composition. Everything else is read when its row in "Pick the path" says so, or when a command fails.
5. **Size the work to the clip.** A 15-second clip is not a small lesson film; it takes the fast path below.

## Pick the path first

| | **Fast path** | **Full pipeline** |
|---|---|---|
| When | 20 s or less, or a single title card / stat / logo sting / kinetic line, any length up to 30 s | longer than 20 s with narration, a lesson clip, a series episode |
| Read | this file, `references/creative/house-style.md`, `references/creative/video-composition.md`, `references/art.md`, `mg-hyperframes` (`../hyperframes/SKILL.md`) | add `references/script-style.md`, `mg-hyperframes-cli` (`../hyperframes-cli/SKILL.md`), and `references/music.md` if there is a bed |
| Brief | none: state your assumptions in one line and build | one round (phase 1) |
| Script | a storyboard table of 3–6 scenes, written to `STORYBOARD.md` and shown in the reply **before** any composition (see "Storyboard first") | `STORYBOARD.md`, then `script.txt` + `script.json` (phase 2) |
| Files | one `index.html`: every beat a timed `.clip` in the root, one timeline | one scene per sub-composition |
| Music | none unless asked; if asked, one `make_music.mjs` run and one `<audio>` tag, no further QA | phase 4 |
| Check | at most three `check --json` runs and one `snapshot --at` with three stills (first beat, middle, last hold); one fix pass each, no polishing | `check --json` + `snapshot --review` |
| Then | preview, send the link, stop | preview, send the link, stop |

On the fast path, skip everything the `mg-hyperframes` skill hangs on "a film over ~15 s": no `story.md`, no three storylines, no `SPEC.md`, no `REVIEW.md`, no sound unless asked. Do not open `mg-hyperframes-cli` or any `references/` file beyond the row above unless a command fails and its `Fix:` line is not enough. A fast-path clip should take about a dozen tool calls: init, write, check, fix, check, snapshot, preview.

## Design direction — read before the storyboard

On both paths, read these two files before you write the storyboard. They are what makes a frame look like video instead of a web page, and they decide the look:

- `references/creative/house-style.md` — interpret the prompt into real content, declare background / foreground / accent up front, the lazy defaults to question, the background layer every scene needs, the palette table (`references/palettes/*.md`).
- `references/creative/video-composition.md` — video scale (headlines 64–120 px and up, borders 2–4 px), density in three layers, colour presence, two focal points, fill the frame, anchor to edges, split frames.

Add `references/creative/data-in-motion.md` when a scene shows a number or a comparison.

How they fit with the rest:

- **Frame layout, scale, density, background and palette: these files win.** `references/art.md` governs how to draw the SVG objects and how to animate them on the timeline; where the two differ on layout, follow `video-composition.md`.
- They link to `typography.md` and `motion-principles.md`, which are not bundled: use the "Quick" line each link sits on and do not look for the files. Thai text always uses the bundled Kanit, whatever the pairing advice says.
- Do not read anything else from the `hyperframes-creative` skill; these copies are all this skill uses.

In `STORYBOARD.md`, the line above the table names the palette category you chose and the three colours (background, foreground, accent), and the background-layer elements shared by every scene.

## Storyboard first

Before writing any composition, on both paths, write the storyboard as a table, save it as `STORYBOARD.md` in the project folder, and show the same table in your reply. Write it in the user's language. One row per scene, these columns in this order:

| ฉาก | วินาที | ภาพ | การเคลื่อนไหว | ข้อความ | อารมณ์ |
|---|---|---|---|---|---|
| 1 | 0.0–3.4 | what is on screen: the hero object, where it sits, the background | what moves, from where to where, how it enters and leaves | the exact on-screen copy, word for word | the feeling and pace of the scene in a few words, plus the accent colour |

- Scenes are contiguous and their seconds add up to the clip length exactly. Fast path: 3–6 scenes.
- **ภาพ** names shapes you can actually draw (bars, numbers, rings, simple objects), one hero per scene. **ข้อความ** is final copy, not a description of copy. **การเคลื่อนไหว** names the move, not "animates in".
- Above the table, one line each: the one thing the viewer should remember, and the palette and font.
- Then **keep going without waiting**: one storyboard, no alternatives, no approval round — unless the user asked to see or approve the storyboard first ("ขอดู storyboard ก่อน", "รออนุมัติ", "storyboard only"), in which case stop after the table and wait.
- The composition must match the storyboard scene for scene: same times, same copy. If you change the plan while building, update `STORYBOARD.md` in the same edit. The hand-off repeats nothing from the table; it says only what differs from it.

**The fast path has a fixed budget — count as you go:**

0. `STORYBOARD.md` and the table in the reply: one write, before `index.html`.
1. Write `index.html` once, complete, scene for scene from the storyboard. Do not write a draft to improve later.
2. `check --json` → **one** fix pass for every error and for the warnings that are real defects (clipped or overlapping text, failed contrast, an empty first frame). Leave the structural warnings a single-file clip always gets (no sub-compositions, track kinds); name them in the hand-off instead of fixing them.
3. `check --json` again. If errors remain, one more fix pass; that is the last.
4. **One** `snapshot --at` call with three times. Fix only what is broken in those frames: text cut off, elements overlapping, something missing, something unreadable. One edit pass, then no second snapshot unless that edit moved or resized text.
5. `preview --background`, `preview --status --json`, send the link, stop.

Taste is not a defect. Brighter colours, a stronger ring, a softer exit, a bigger grid, a different wipe direction are things you **list in the hand-off as "could improve"** and do only if the user asks. If you notice yourself running `check` a fourth time or `snapshot` a third time, stop and open the preview.

**If you cannot view images**, do not run `snapshot` at all: rely on `check --json`, and say in the hand-off that nobody has looked at the frames.

## The CLI

**Sandbox:** `check`, `snapshot`, `preview` and `render` start a headless Chrome, which a restricted shell sandbox blocks. Do not probe or work around it: run those commands with the escalated / full-access permission from the first attempt, and tell the user once, up front, that they will be asked to approve it. `init` and `lint` need no escalation.

```sh
node "<this skill's directory>/scripts/hf.mjs" <command> [options]
```

Run it **in the project directory**. `<this skill's directory>` is the resource base reported when this skill loads (the folder holding this SKILL.md); keep the quotes — the path usually contains spaces. The launcher keeps npm, Chrome, history and temporary files in one per-user cache shared by every project (the folder `setup.mjs` pre-warms), so the CLI and Chrome download once per machine; when a shell sandbox cannot write there it falls back to `<project>/.hf-cache`. It turns Chrome's sandbox off, and after the first download it starts the installed CLI directly. This is the only launcher: where the `mg-hyperframes` skills write `npx hyperframes <command>`, run `... hf.mjs <command>`.

- Set `HF_CACHE_DIR=/a/writable/dir` to put the shared cache somewhere else.
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
| 5 | Build | HyperFrames project under the workspace | `mg-hyperframes` (+ `mg-hyperframes-cli`) |
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

Turn each line into one visual. Write the scene list first (`Sxx name — purpose — seconds`; the seconds must add up to the target), then read `references/art.md` before drawing: silhouette first, flat shapes, measured composition, QA in greyscale / two-tone / 64 px thumbnail. Thai lettering is drawn, not typed: ship the font as a file in the project's `assets/fonts/` and load it with `@font-face` — never rely on a family name the CLI does not bundle. Kanit Regular and Bold ship with this skill: copy `<this skill's directory>/assets/fonts/Kanit-*.ttf` into the project instead of downloading a font.

### 4. Music bed

Only when the clip needs one: **compose it, never download a track.**

```sh
node "<this skill's directory>/scripts/make_music.mjs" music.wav --dur <clip seconds> --mood warm|calm|bright --key D
```

Write it to `assets/music.wav` and place it in `index.html` as `<audio id="music" src="assets/music.wav" data-start="0" data-duration="<clip seconds>" data-volume="1"></audio>` (about `0.15` under a voice). Never mux it into a render yourself: the composition carries the sound, so the preview plays it and a later render includes it. Full pipeline only: levels and the QA you can do without hearing it are in `references/music.md`.

### 5. Build

```sh
... hf.mjs init <project-name> --skip-skills --non-interactive
```

Then read the bundled **`mg-hyperframes`** skill (`../hyperframes/SKILL.md`, the contract) before writing a line of composition. Open **`mg-hyperframes-cli`** (`../hyperframes-cli/SKILL.md`) only for the full pipeline, a timeline edit, or a failure whose `Fix:` line is not enough. In short:

- `index.html` is the root composition; media and fonts in `assets/`. Full pipeline: one scene per sub-composition under `compositions/`. Fast path: everything in `index.html`.
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
| `references/art.md` | How to draw the visuals: silhouette first, the SVG rules, composition numbers, colour, how to animate parts on the GSAP timeline. Short; read before drawing anything. |
| `references/creative/house-style.md`, `video-composition.md`, `data-in-motion.md` | Design direction for video frames, copied from the HyperFrames `hyperframes-creative` skill (Apache-2.0). Read the first two before every storyboard. |
| `references/palettes/*.md` | Nine palette categories of hex swatches, from the same source. |
| `references/design-principles.md` | How to decide: one message, hierarchy, Gestalt, eye path, colour schemes and meaning (Thai context, colour-blind safety), consistency and pacing across many scenes. Optional: read it only when the user asks for it or for colour-blind-safe or culturally careful design. |
| `assets/fonts/Kanit-*.ttf` | Thai + Latin font (SIL OFL) to copy into a project's `assets/fonts/`. |
| `references/music.md` | Music beds: when to compose instead of licensing, the synthesis recipe, level targets, syncing accents, QA without hearing it. |
| `scripts/hf.mjs` | Portable HyperFrames CLI launcher (caches inside the project, checks FFmpeg first). |
| `scripts/ensure-ffmpeg.mjs` | Finds FFmpeg/FFprobe, or installs them on the machine (package manager, else per-user static build). |
| `scripts/setup.mjs` | One-command preparation of a new machine: Node check, FFmpeg, HyperFrames + Chrome pre-download, optional Python. |
| `scripts/txt_to_json.mjs` | `script.txt` → `script.json` + timing report + long-line warnings. Pure Node. |
| `scripts/make_music.mjs` | `music.wav` from duration / mood / key / BPM — deterministic, pure Node (own FFT, no samples). |
| `scripts/txt_to_json.py`, `scripts/make_music.py` | Legacy Python/NumPy originals, kept for reference only; the `.mjs` versions are the supported path. |
| `assets/script_template.txt` | Skeleton with the standard scene order and prompts. |

## Working with a machine that is not yours

Everything the plugin needs is inside the plugin; only the project folder holds state. Downloads (npm, Chrome) live in the shared per-user cache and snapshots in `<project>/.hyperframes`; a project folder holds no machine state, so it can be copied to another machine and opened there. On a fresh machine run the bundle installer (`install.ps1` on Windows, `install.sh` on macOS/Linux) — it adds Node.js if missing, FFmpeg, the CLI and Chrome, and Python — or run `node "<skill>/scripts/setup.mjs" --install --all` once the machine already has Node. Every helper is Node, so the bundle itself needs only Node.js 22+. If FFmpeg is missing, run `... hf.mjs doctor --install-ffmpeg` (it asks before installing); when the machine cannot download or the user declines, say so and name the install command for the platform (macOS: `brew install ffmpeg`, Windows: `winget install Gyan.FFmpeg`, Debian/Ubuntu: `sudo apt install ffmpeg`) instead of rendering a broken file.

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
