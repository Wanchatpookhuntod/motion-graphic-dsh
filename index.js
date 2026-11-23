/**
 * Host half of the motion-graphics bundle.
 *
 * The bundle ships plain skill folders under `skills/`. This plugin registers
 * them on `ctx.skills` as one provider, so installing the bundle is enough for
 * any DSH agent to write a script, draw the visuals, compose a music bed and
 * build a HyperFrames composition — no other machine setup, no global skill
 * directory, no absolute paths.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Provider label shown to the registry; must stay unique in the profile. */
const PROVIDER_NAME = 'motion-graphics-bundle'
/** Rank 600 is the packaged/bundled tier, below project and user skills. */
const RANK = 600
const SKILLS_DIR = fileURLToPath(new URL('./skills/', import.meta.url))
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const INVOCATION = { modelInvocable: true, userInvocable: true }

/** Strip one layer of YAML quotes. */
function unquote(value) {
  const trimmed = value.trim()
  if (trimmed.length < 2) return trimmed
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if (first === '"' && last === '"') return trimmed.slice(1, -1).replace(/\\"/g, '"')
  if (first === "'" && last === "'") return trimmed.slice(1, -1).replace(/''/g, "'")
  return trimmed
}

/**
 * Read the `name`, `description` and `whenToUse` frontmatter fields of a skill
 * file. Only the flat keys this bundle's skills use are supported, including
 * plain wrapped values; the body is returned unchanged.
 */
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!match) return { meta: {}, body: text }
  const meta = {}
  let key = null
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const pair = /^([A-Za-z0-9_-]+):(.*)$/.exec(line)
    if (pair) {
      key = pair[1]
      meta[key] = unquote(pair[2])
      continue
    }
    if (key && /^\s/.test(line)) {
      meta[key] = `${meta[key]} ${line.trim()}`.trim()
      continue
    }
    key = null
  }
  return { meta, body: text.slice(match[0].length) }
}

/** Read one skill folder, or return undefined when its SKILL.md is unusable. */
function readSkill(directory) {
  let raw
  try {
    raw = readFileSync(join(directory, 'SKILL.md'), 'utf8')
  } catch {
    return undefined
  }
  const { meta, body } = parseFrontmatter(raw)
  const name = meta.name
  const description = meta.description
  if (!name || !SKILL_NAME.test(name) || !description) return undefined
  if (!body.trim()) return undefined
  return { name, description, whenToUse: meta.whenToUse, content: body.trim() }
}

/** Summaries for every usable skill folder, in directory order. */
function listSkills() {
  let entries
  try {
    entries = readdirSync(SKILLS_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  const candidates = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const directory = join(SKILLS_DIR, entry.name)
    const skill = readSkill(directory)
    if (!skill) continue
    candidates.push({
      name: skill.name,
      description: skill.description,
      ...(skill.whenToUse ? { whenToUse: skill.whenToUse } : {}),
      invocation: INVOCATION,
      provider: PROVIDER_NAME,
      source: 'bundled',
      resourceBase: { kind: 'directory', path: directory },
      rank: RANK,
      locator: directory,
    })
  }
  return candidates
}

const provider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve(listSkills()),
  async get(candidate) {
    const skill = typeof candidate?.locator === 'string' ? readSkill(candidate.locator) : undefined
    if (!skill) throw new Error(`Motion graphics skill is unreadable: ${candidate?.name ?? 'unknown'}`)
    return {
      name: skill.name,
      description: skill.description,
      ...(skill.whenToUse ? { whenToUse: skill.whenToUse } : {}),
      invocation: INVOCATION,
      provider: PROVIDER_NAME,
      source: 'bundled',
      resourceBase: candidate.resourceBase,
      content: skill.content,
    }
  },
}

/** Cordis plugin name. */
export const name = 'motion-graphics'
/** The skill registry must be mounted for this provider to register. */
export const inject = ['skills']

/** Register the bundled skill provider; dispose removes it again. */
export function apply(ctx) {
  ctx.effect(() => ctx.skills.registerProvider(() => provider), 'motion-graphics skills')
}
