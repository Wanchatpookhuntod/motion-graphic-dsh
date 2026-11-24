# Attribution

## HyperFrames skills

`skills/hyperframes/` and `skills/hyperframes-cli/` are copied **unmodified**
from the HyperFrames project:

- Project: HyperFrames — <https://github.com/heygen-com/hyperframes>
- Package: `hyperframes` 0.9.81 (npm), license **Apache-2.0**
- Source of this copy: the installed `hyperframes` agent skill, `skills/hyperframes`
  and `skills/hyperframes-cli` folders of the same release.
- License text: `LICENSES/Apache-2.0.txt`.

They are bundled so a machine that has never installed HyperFrames can still
build a composition: the skill body carries the render contract and the CLI
procedures, and `skills/hyperframes/scripts/plugin-cli.mjs` is the launcher the
`motion-graphics` skill delegates to. The bundle's `plugin.json` uses the
HyperFrames plugin manifest format only to pin the launcher to CLI **0.9.81**
(the release these skills were copied from); it is not an official HyperFrames
distribution.

Two things to know about the bundled vendor skill:

- It instructs the agent to send the vendor's **usage beacon**
  (`hyperframes events --skill=…`) once per skill start; the CLI's own telemetry
  settings and opt-out apply.
- It names companion skills that this bundle does **not** ship —
  `hyperframes-registry`, `media-use`, `reverse-any-video`, `style-sampling`,
  `/slideshow`, `/remotion-to-hyperframes`, `/figma`. Install them with
  `npx hyperframes skills add` on that machine if the work needs them; the
  bundle works without them.

`hyperframes`, `HyperFrames` and the HyperFrames logo are trademarks of their
owner. This bundle is not affiliated with or endorsed by that project; the name
here is descriptive only.

## The rest of the bundle

`skills/motion-graphics/` (the pipeline skill, its references and scripts) and
the Host plugin (`index.js`), locale files, icon and detail image are the
owner's own work, published in this repository. No separate license is declared
for them; all rights are reserved by the owner. `references/script-style.md`,
`references/art.md`, `references/music.md`, `scripts/txt_to_json.mjs` and
`scripts/make_music.mjs` come from the owner's own `script-writing` skill; the
`.mjs` tools are Node ports of the original Python/NumPy scripts, which remain in
`scripts/` for reference.

## Test copy changes (motion-graphic-dsh-fast)

- `skills/motion-graphics/references/creative/house-style.md`, `video-composition.md`, `data-in-motion.md` and `skills/motion-graphics/references/palettes/*.md` are copied **unmodified** from the `hyperframes-creative` skill of the HyperFrames project (<https://github.com/heygen-com/hyperframes>, Apache-2.0), taken from the copy installed in `~/.agents/skills` on the build machine. Confirm the licence of that skill folder upstream before publishing.

- `skills/hyperframes/SKILL.md` and `skills/hyperframes-cli/SKILL.md` are **modified** from upstream: the launcher line points at `motion-graphics/scripts/hf.mjs`, and the usage beacon and `usage --json` instructions are removed. Apache-2.0 requires stating that these files were changed.
- `skills/motion-graphics/assets/fonts/Kanit-Regular.ttf`, `Kanit-Bold.ttf`: Kanit by Cadson Demak, SIL Open Font License 1.1. License text: `LICENSES/OFL-Kanit.txt`.
- `docs/art-original.md` is the previous `references/art.md`, kept for comparison only; no skill reads it.
