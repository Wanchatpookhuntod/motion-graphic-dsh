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
| `motion-graphics` | The pipeline: brief, script, picture plan, music, build, check, preview, render hand-off. Start here. |
| `hyperframes` | The composition contract and work loop (HTML → video), bundled unmodified. |
| `hyperframes-cli` | Every CLI command, `--json`, timeline edits, recovery, bundled unmodified. |

Nothing else is added: no tools, no UI, no client code, no settings.

## Requirements on the target machine

Built and verified on DeepSeek Harness **0.2.2-rc.5** (Desktop profile); the
bundle only uses the `ctx.skills` provider API.

| Need | Why | If missing |
|---|---|---|
| Node.js 22+ | Runs the CLI launcher (`node …/scripts/hf.mjs`) | Install Node.js LTS |
| FFmpeg | Rendering and probing MP4; `snapshot` uses it too | macOS `brew install ffmpeg`, Windows `winget install Gyan.FFmpeg`, Debian/Ubuntu `sudo apt install ffmpeg` |
| Network (first run only) | `npx` downloads the pinned HyperFrames CLI and a headless Chrome into the project's `.hf-cache` | Connect once; later runs are offline |
| Python 3 + NumPy | `scripts/txt_to_json.py` and `scripts/make_music.py` | Use the bundled Python from `load_workspace_dependencies`, or run the CLI-only path |

Check the machine with:

```sh
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" doctor
```

## Install on another machine

1. Copy the whole `motion-graphics-plugin` folder (or unzip the delivered
   `motion-graphics-plugin.zip`) anywhere readable, for example
   `~/Downloads/motion-graphics-plugin`. The repository root **is** the plugin
   folder, so `git clone https://github.com/Wanchatpookhuntod/motion-graphic-dsh.git`
   gives you an installable directory as well.
2. In DeepSeek Harness: open **Plugins** in the sidebar → **Add plugin** →
   choose that folder (**local directory**).
   From a session you can also ask the agent: *"install the bundle at
   /path/to/motion-graphics-plugin"* — the agent calls `plugin_manager`
   `install_bundle` with the absolute folder path.
3. Make sure the `Motion graphics` row is enabled, then open a **new session**
   (the skill catalog is built per session).
4. Ask for work in plain language: *"ทำ motion graphic 30 วินาที เรื่อง…"*,
   *"เขียนบทคลิปสอนเรื่อง…"*, *"ทำไตเติลร้าน…"*. The agent loads the skill and
   follows it.

If the profile already has the same package name installed, remove the old one
first (**Plugins → remove**) and add the new folder.

## Use it

```sh
# inside a project directory, from a normal shell
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" init my-clip --skip-skills --non-interactive
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" check --json
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" snapshot --review
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" preview --background
node "<plugin>/skills/motion-graphics/scripts/hf.mjs" preview --status
```

The launcher keeps npm, Chrome, history and temporary files inside
`<project>/.hf-cache` — a DSH shell sandbox can write the workspace but not the
home folder — and turns Chrome's sandbox off. It delegates to the bundled
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
- Caches: `<project>/.hf-cache`, `<project>/.hyperframes`, or `HF_CACHE_DIR`.
- No configuration keys and no credentials.

## Remove

**Plugins → Motion graphics → Remove**, or ask the agent to remove the bundle.
Removing the plugin removes the three skills; project folders, caches and
rendered files stay where they are.

## License and attribution

The bundle's own code and guides are private, unpublished work. The two
HyperFrames skills are copied unmodified from the HyperFrames project
(Apache-2.0); see `ATTRIBUTION.md` and `LICENSES/Apache-2.0.txt`.
