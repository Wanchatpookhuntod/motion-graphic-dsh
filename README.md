# Motion graphics — a DeepSeek Harness plugin

Creates a motion graphic from a topic to a previewed HyperFrames project: spoken
script → drawn visuals → optional composed music bed → HTML composition →
`check` → Studio preview → MP4 only when you ask for it.

The plugin is self-contained. Copying this folder to another machine and adding
it in **Plugins** is the whole installation — the HyperFrames contract, its CLI
launcher and the writing/drawing/music guides travel inside the folder.

## What it installs

Three skills, registered on `ctx.skills` by the bundle's Host plugin:

| Skill | Use |
|---|---|
| `mg-fast` | The pipeline: design direction, storyboard, build, check, preview, render hand-off, with a short path for clips of 20 s or less. Start here. Folder: `skills/motion-graphics`. |
| `mg-hyperframes` | The composition contract and work loop (HTML → video); launcher and beacon lines modified, see `ATTRIBUTION.md`. |
| `mg-hyperframes-cli` | Every CLI command, `--json`, timeline edits, recovery; launcher and beacon lines modified. |

Nothing else is added: no tools, no UI, no client code, no settings.

The three skills carry an `mg-` prefix so they are not shadowed by the standalone HyperFrames skills (`motion-graphics`, `hyperframes`, `hyperframes-cli`) when those are installed in `~/.agents/skills`. Name the skill in the request ("ใช้ skill mg-fast ทำ…") to be sure the agent loads this one.

## Requirements on the target machine

Built and verified on DeepSeek Harness **0.2.2-rc.5** (Desktop profile); the
bundle only uses the `ctx.skills` provider API.

| Need | Why | If missing |
|---|---|---|
| Node.js 22+ | Runs the CLI launcher (`node …/scripts/hf.mjs`) | Install Node.js LTS |
| FFmpeg | Rendering and probing MP4; `snapshot` uses it too | The launcher installs it on request (`hf.mjs doctor --install-ffmpeg`); manual: macOS `brew install ffmpeg`, Windows `winget install Gyan.FFmpeg`, Debian/Ubuntu `sudo apt install ffmpeg` |
| Network (first run only) | `npx` downloads the pinned HyperFrames CLI and a headless Chrome into the shared per-user cache (`<tools>/cache`) | Connect once; later runs are offline |

No Python and no NumPy: the script and music tools are plain Node
(`scripts/txt_to_json.mjs`, `scripts/make_music.mjs`). The original Python
versions ship alongside them for reference only.

### Complete install on a new machine

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

macOS / Linux:

```sh
bash install.sh
```

The installer adds, in order: **Node.js 22+** (only when missing), **FFmpeg +
FFprobe**, the **HyperFrames CLI with a headless Chrome**, and **Python 3**.
That is the whole list — the bundle carries everything else. `-SkipPython` /
`--skip-python` leaves Python out; `-SkipNode` / `--skip-node` refuses to install
Node and fails instead.

The same steps without the Node bootstrap:

```sh
node "<plugin>/skills/motion-graphics/scripts/setup.mjs" --install --all
```

Without flags it only reports. `--json` gives a machine-readable report and a
non-zero exit when the machine is not ready.

| Flag | Effect |
|---|---|
| `--install` | fix what is missing (asks before each download) |
| `--yes` | unattended: FFmpeg + HyperFrames + Chrome |
| `--all` | also install Python 3 |
| `--python` | install Python 3 only |
| `--json` | machine-readable report, non-zero exit when not ready |

Check the machine with:

```sh
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" doctor
```

### FFmpeg is installed for you, on request

`render`, `snapshot` and `beats` need FFmpeg, so `hf.mjs` checks for it before it
delegates. When it is missing the launcher asks once and installs it properly on
the machine with `scripts/ensure-ffmpeg.mjs`:

- `winget` (Windows), `brew` (macOS) or `apt-get` (Debian/Ubuntu) when the machine
  has one of them;
- otherwise a per-user static build (`ffmpeg-static` + `ffprobe-static` from npm),
  no admin rights and no changes to `PATH`;
- the result is recorded in `<tools>/ffmpeg/state.json` and its paths are exported
  as `HYPERFRAMES_FFMPEG_PATH` / `HYPERFRAMES_FFPROBE_PATH` for every later run.

`<tools>` is `%LOCALAPPDATA%\motion-graphics` on Windows,
`~/Library/Application Support/motion-graphics` on macOS and
`~/.local/share/motion-graphics` on Linux; override it with
`MOTION_GRAPHICS_TOOLS_DIR`. The install survives cache clears and project
deletion, and is shared by every project.

| Want | Command |
|---|---|
| Look only | `node "<plugin>/skills/motion-graphics/scripts/ensure-ffmpeg.mjs" --check` |
| Install ahead of time | `node "<plugin>/skills/motion-graphics/scripts/hf.mjs" doctor --install-ffmpeg` |
| Never install, just fail | `... hf.mjs render --no-install-ffmpeg` |

Nothing installs silently: a non-interactive run without `--install-ffmpeg`
stops and prints the manual commands instead.

## Install on another machine

1. Copy the whole `motion-graphics-plugin` folder (or unzip the delivered
   `motion-graphics-plugin.zip`) anywhere readable, for example
   `~/Downloads/motion-graphics-plugin`. The repository root **is** the plugin
   folder, so `git clone https://github.com/Wanchatpookhuntod/motion-graphic-dsh.git`
   gives you an installable directory as well.
2. Prepare the machine — one command, installs Node.js if missing, FFmpeg, the
   HyperFrames CLI with Chrome, and Python:
   - Windows: `powershell -ExecutionPolicy Bypass -File install.ps1`
   - macOS/Linux: `bash install.sh`
3. In DeepSeek Harness: open **Plugins** in the sidebar → **Add plugin** →
   choose that folder (**local directory**).
   From a session you can also ask the agent: *"install the bundle at
   /path/to/motion-graphics-plugin"* — the agent calls `plugin_manager`
   `install_bundle` with the absolute folder path.
4. Make sure the `Motion graphics` row is enabled, then open a **new session**
   (the skill catalog is built per session).
5. Ask for work in plain language: *"ทำ motion graphic 30 วินาที เรื่อง…"*,
   *"เขียนบทคลิปสอนเรื่อง…"*, *"ทำไตเติลร้าน…"*. The agent loads the skill and
   follows it.

If the profile already has the same package name installed, remove the old one
first (**Plugins → remove**) and add the new folder.

### What the target machine needs

The installer at the root of this folder adds everything, Node.js included when
it is missing. Manually, the bundle itself needs only **Node.js 22+**:

| Need | Handled by |
|---|---|
| Node.js 22+ | `install.ps1` / `install.sh` (winget, chocolatey, brew, apt, dnf, pacman) |
| HyperFrames CLI + headless Chrome | pre-downloaded by the installer into one shared cache; otherwise downloaded on the first run |
| FFmpeg / FFprobe | installed by the installer, or by `hf.mjs` on request before `render`/`snapshot`/`beats` |
| Script → JSON, music bed | `scripts/txt_to_json.mjs`, `scripts/make_music.mjs` (pure Node) |
| Python, NumPy | not required by the bundle; the installer adds Python 3 anyway (`--all`), for other skills |

## Use it

```sh
# inside a project directory, from a normal shell
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" init my-clip --skip-skills --non-interactive
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" check --json
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" snapshot --review
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" preview --background
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" preview --status
```

The launcher keeps npm, Chrome, history and temporary files in one per-user cache
(`<tools>/cache`) shared by every project, falling back to `<project>/.hf-cache`
when a sandbox cannot write there, and turns Chrome's sandbox off. After the first
download it starts the installed CLI directly instead of going through `npx`. It delegates to the bundled
HyperFrames launcher, and the bundle's `plugin.json` pins the CLI release to
**0.9.81**, the same release the bundled skills document, so the instructions and
the CLI cannot drift apart. `skills` subcommands are therefore refused through
`hf.mjs`; install companion skills outside it with `npx hyperframes skills add`.

| Variable | Effect |
|---|---|
| `HF_CACHE_DIR` | One cache (and one Chrome download) shared by every project |
| `HF_CLI` | Path to an existing `hyperframes.mjs`; skips the npm download |
| `HYPERFRAMES_*` | Passed through when set explicitly |

## Stand-down rule baked into the skill

The `motion-graphics` skill stops at the Studio preview: after `check` and
`snapshot` it opens `preview --background`, sends
`http://127.0.0.1:<port>/#project/<name>`, and waits. It renders MP4 only when
the user explicitly asks (render / เรนเดอร์ / เอาวิดีโอ / export / ขอไฟล์ /
ส่งไฟล์), and it never publishes or uploads on its own.

## Where things live

- Plugin files: this folder (treat it as read-only while installed).
- Project files: whatever directory the project was created in — copy that
  folder to another machine and the project still opens.
- Caches: `<tools>/cache` (shared), `<project>/.hyperframes`, or `HF_CACHE_DIR`.
- No configuration keys and no credentials.

## Remove

**Plugins → Motion graphics → Remove**, or ask the agent to remove the bundle.
Removing the plugin removes the three skills; project folders, caches and
rendered files stay where they are.

## License and attribution

The bundle's own code and guides are private, unpublished work. The two
HyperFrames skills are copied from the HyperFrames project, with the changes listed in `ATTRIBUTION.md`,
(Apache-2.0); see `ATTRIBUTION.md` and `LICENSES/Apache-2.0.txt`.
