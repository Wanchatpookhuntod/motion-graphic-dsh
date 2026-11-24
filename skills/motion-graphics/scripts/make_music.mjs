#!/usr/bin/env node
/**
 * Synthesise a royalty-free music bed for a clip. Pure Node, no samples, no
 * Python, no NumPy.
 *
 *   node make_music.mjs music.wav --dur 30
 *   node make_music.mjs bed.wav --dur 12 --mood calm --key F
 *   node make_music.mjs out.wav --dur 30 --mood bright --bpm 104 --seed 3
 *
 * Every sound is generated from code: additive sines with harmonic weights,
 * exponential envelopes, seeded noise for the shaker, an FFT-convolution reverb
 * from a synthetic impulse, then a soft tanh limiter. Layers are balanced by
 * measured RMS, not by ear, because an agent cannot listen.
 *
 * Then normalise and mux (ffmpeg is only used for loudness + muxing, never for
 * synthesis):
 *   ffmpeg -y -i video.mp4 -i music.wav -map 0:v:0 -map 1:a:0 -c:v copy \
 *     -c:a aac -b:a 192k -ar 48000 -af "loudnorm=I=-16:TP=-2:LRA=9" \
 *     -shortest -movflags +faststart out.mp4
 *
 * Design notes, level targets and the QA you can do without hearing the result
 * live in references/music.md.
 */

import { writeFileSync } from 'node:fs'

const SR = 44100

/** key -> semitones above D */
const KEY_OFFSET = {
  C: 10, 'C#': 11, D: 0, 'D#': 1, E: 2, F: 3, 'F#': 4,
  G: 5, 'G#': 6, A: 7, 'A#': 8, B: 9,
}

/** chord voicings as semitone offsets from the chord root (maj9 / m9 / maj9 / 6-9) */
const VOICINGS = {
  0: [0, 7, 11, 14, 4], // I maj9
  9: [0, 3, 7, 10, 14], // vi m9
  5: [0, 4, 7, 11, 14], // IV maj9
  7: [0, 4, 7, 9, 14], // V 6/9
}

const MOODS = {
  // order = the four bars of the loop, as semitone offsets of the chord root
  warm: { bpm: 88, order: [0, 9, 5, 7], pluck: 0.26, shaker: 1.0, padAttack: 1.0 },
  calm: { bpm: 72, order: [0, 5, 9, 7], pluck: 0.34, shaker: 0.6, padAttack: 1.4 },
  bright: { bpm: 104, order: [0, 7, 9, 5], pluck: 0.22, shaker: 1.25, padAttack: 0.7 },
}

/** melodic motif: indices into the 9-note pentatonic ladder, null = rest (8th notes) */
const MOTIFS = [
  [4, null, 2, 3, null, 4, null, 1],
  [5, null, 4, 2, null, 3, null, null],
  [2, 3, null, 4, null, 5, 4, null],
  [null, 4, null, 2, null, 3, null, 1],
]

function hz(midi) {
  return 440.0 * 2 ** ((midi - 69) / 12)
}

function rms(x) {
  let sum = 0
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i]
  return Math.sqrt(sum / x.length)
}

function normTo(x, targetDb) {
  const r = rms(x)
  if (r === 0) return x
  const gain = 10 ** (targetDb / 20.0) / r
  const out = new Float64Array(x.length)
  for (let i = 0; i < x.length; i++) out[i] = x[i] * gain
  return out
}

/** Deterministic PRNG (mulberry32) with Box–Muller normals; same output per seed. */
function makeRng(seed) {
  let state = (seed >>> 0) || 1
  let spare
  const uniform = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = () => {
    if (spare !== undefined) {
      const value = spare
      spare = undefined
      return value
    }
    const u = Math.max(uniform(), 1e-12)
    const v = uniform()
    const radius = Math.sqrt(-2 * Math.log(u))
    spare = radius * Math.sin(2 * Math.PI * v)
    return radius * Math.cos(2 * Math.PI * v)
  }
  return { uniform, normal }
}

function place(buffer, start, signal) {
  const offset = Math.round(start * SR)
  if (offset >= buffer.length) return
  const count = Math.min(signal.length, buffer.length - offset)
  for (let i = 0; i < count; i++) buffer[offset + i] += signal[i]
}

/** In-place radix-2 FFT; both arrays must have a power-of-two length. */
function fft(re, im, inverse) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let tmp = re[i]
      re[i] = re[j]
      re[j] = tmp
      tmp = im[i]
      im[i] = im[j]
      im[j] = tmp
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len
    const wr = Math.cos(angle)
    const wi = Math.sin(angle)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let curR = 1
      let curI = 0
      for (let j = 0; j < half; j++) {
        const aR = re[i + j]
        const aI = im[i + j]
        const bR = re[i + j + half]
        const bI = im[i + j + half]
        const vR = bR * curR - bI * curI
        const vI = bR * curI + bI * curR
        re[i + j] = aR + vR
        im[i + j] = aI + vI
        re[i + j + half] = aR - vR
        im[i + j + half] = aI - vI
        const nextR = curR * wr - curI * wi
        curI = curR * wi + curI * wr
        curR = nextR
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
  }
}

/** Convolve `x` with `impulse` (FFT), returning the first `length` samples. */
function convolve(x, impulse, size, length) {
  const xR = new Float64Array(size)
  const xI = new Float64Array(size)
  const iR = new Float64Array(size)
  const iI = new Float64Array(size)
  xR.set(x.subarray(0, Math.min(x.length, size)))
  iR.set(impulse.subarray(0, Math.min(impulse.length, size)))
  fft(xR, xI, false)
  fft(iR, iI, false)
  for (let i = 0; i < size; i++) {
    const r = xR[i] * iR[i] - xI[i] * iI[i]
    const m = xR[i] * iI[i] + xI[i] * iR[i]
    xR[i] = r
    xI[i] = m
  }
  fft(xR, xI, true)
  return xR.subarray(0, length)
}

function build(dur, mood, key, bpmOverride, seed, fadeIn, fadeOut) {
  const cfg = MOODS[mood]
  const bpm = bpmOverride || cfg.bpm
  const beat = 60.0 / bpm
  const bar = 4 * beat
  const n = Math.round(dur * SR)
  const bars = Math.ceil(dur / bar) + 1
  const rng = makeRng(seed)
  const offset = KEY_OFFSET[key]

  const prog = (b) => cfg.order[b % 4]
  const chordMidi = (b) => {
    const root = 50 + offset + prog(b)
    return VOICINGS[prog(b)].map((v) => root + v)
  }

  // ------------------------------------------------------------------ pad ---
  const pad = new Float64Array(n)
  for (let b = 0; b < bars; b++) {
    const notes = chordMidi(b)
    const t0 = b * bar
    for (let v = 0; v < notes.length; v++) {
      const length = Math.trunc(bar * 1.3 * SR)
      const f = hz(notes[v])
      const det = 1.0 + 0.0006 * (v % 2)
      const pan = 0.5 + 0.22 * ((v % 3) - 1)
      const signal = new Float64Array(length)
      for (let s = 0; s < length; s++) {
        const t = s / SR
        const env = Math.min(1, t / cfg.padAttack) * Math.exp(-Math.max(0, t - bar * 0.9) / 1.1)
        const a =
          Math.sin(2 * Math.PI * f * t) +
          0.2 * Math.sin(2 * Math.PI * 2 * f * t + 0.4) +
          0.05 * Math.sin(2 * Math.PI * 3 * f * t + 1.1)
        const bSig =
          Math.sin(2 * Math.PI * f * det * t + 0.7) +
          0.2 * Math.sin(2 * Math.PI * 2 * f * det * t + 1.0) +
          0.05 * Math.sin(2 * Math.PI * 3 * f * det * t + 1.7)
        signal[s] = ((a * (1 - pan) + bSig * pan) / notes.length) * env
      }
      place(pad, t0 + 0.004 * v, signal)
    }
  }

  // ----------------------------------------------------------------- bass ---
  const bass = new Float64Array(n)
  for (let b = 0; b < bars; b++) {
    const root = 50 + offset + prog(b)
    const length = Math.trunc(0.75 * SR)
    for (const k of [0, 2]) {
      const f = hz(root)
      const signal = new Float64Array(length)
      for (let s = 0; s < length; s++) {
        const t = s / SR
        const env = Math.min(1, t / 0.014) * Math.exp(-t / 0.3)
        signal[s] =
          (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * 2 * f * t)) * env
      }
      place(bass, b * bar + k * beat, signal)
    }
  }

  // --------------------------------------------------------------- melody ---
  const tonic = 62 + offset
  const ladder = [0, 2, 4, 7, 9, 12, 14, 16, 19].map((d) => tonic + d)
  const melL = new Float64Array(n)
  const melR = new Float64Array(n)
  for (let b = 0; b < bars; b++) {
    const motif = MOTIFS[b % 4]
    for (let k = 0; k < motif.length; k++) {
      const degree = motif[k]
      if (degree === null) continue
      const f = hz(ladder[degree])
      const length = Math.trunc(0.95 * SR)
      const signal = new Float64Array(length)
      for (let s = 0; s < length; s++) {
        const t = s / SR
        const env = Math.min(1, t / 0.005) * Math.exp(-t / cfg.pluck)
        signal[s] =
          (Math.sin(2 * Math.PI * f * t) +
            0.28 * Math.sin(2 * Math.PI * 2 * f * t + 0.3) +
            0.07 * Math.sin(2 * Math.PI * 3 * f * t + 0.9)) *
          env
      }
      const velocity = 0.72 + 0.28 * rng.uniform()
      const pan = 0.42 + 0.26 * (k % 2)
      const start = b * bar + (k * beat) / 2
      const left = new Float64Array(length)
      const right = new Float64Array(length)
      for (let s = 0; s < length; s++) {
        left[s] = signal[s] * velocity * (1 - pan)
        right[s] = signal[s] * velocity * pan
      }
      place(melL, start, left)
      place(melR, start, right)
    }
  }

  // --------------------------------------------------------------- shaker ---
  const shaker = new Float64Array(n)
  const noise = new Float64Array(n)
  for (let i = 0; i < n; i++) noise[i] = rng.normal()
  const burstLen = Math.trunc(0.04 * SR)
  const decay = Math.exp(-1 / (0.009 * SR))
  for (let b = 0; b < bars; b++) {
    for (let k = 0; k < 8; k++) {
      const i = Math.round((b * bar + (k * beat) / 2) * SR)
      if (i + burstLen >= n) continue
      let previous = 0
      let envelope = 1
      for (let j = 0; j < burstLen; j++) {
        const burst = (noise[i + j] - previous) * envelope
        previous = noise[i + j]
        envelope *= decay
        shaker[i + j] += burst * (k % 2 === 0 ? 1.0 : 0.55) * cfg.shaker
      }
    }
  }

  // ---------------------------------------------------------------- bells ---
  const bell = new Float64Array(n)
  const bellLen = Math.trunc(2.4 * SR)
  for (const frac of [0.4, 0.68]) {
    const t0 = dur * frac
    const signal = new Float64Array(bellLen)
    for (const [mult, dec, amp] of [
      [1.0, 1.4, 1.0],
      [2.76, 0.75, 0.34],
      [5.4, 0.42, 0.12],
    ]) {
      const f = hz(tonic + 12) * mult
      for (let s = 0; s < bellLen; s++) {
        const t = s / SR
        signal[s] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / dec) * amp
      }
    }
    place(bell, t0, signal)
  }

  // level targets measured from a mix that read clearly on laptop speakers
  const padN = normTo(pad, -27.0)
  const bassN = normTo(bass, -25.0)
  const melLN = normTo(melL, -25.5)
  const melRN = normTo(melR, -25.5)
  const shakerN = normTo(shaker, -40.0)
  const bellN = normTo(bell, -30.0)
  const left = new Float64Array(n)
  const right = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    left[i] = padN[i] * 0.5 + bassN[i] + melLN[i] + shakerN[i] * 0.85 + bellN[i]
    right[i] = padN[i] * 0.5 + bassN[i] + melRN[i] + shakerN[i] * 1.0 + bellN[i] * 0.95
  }

  // --------------------------------------------------------------- reverb ---
  const irLen = Math.trunc(1.2 * SR)
  const ir = new Float64Array(irLen)
  let energy = 0
  for (let i = 0; i < irLen; i++) {
    ir[i] = rng.normal() * Math.exp(-i / SR / 0.4)
    energy += ir[i] * ir[i]
  }
  energy = Math.sqrt(energy)
  const ramp = Math.trunc(0.015 * SR)
  for (let i = 0; i < irLen; i++) {
    if (i < ramp) ir[i] *= ramp > 1 ? i / (ramp - 1) : 0
    ir[i] /= energy
  }

  const size = 1 << Math.ceil(Math.log2(n + irLen))
  const wetLeft = convolve(left, ir, size, n)
  const rolled = new Float64Array(irLen)
  for (let i = 0; i < irLen; i++) rolled[i] = ir[(i - 211 + irLen) % irLen]
  const wetRight = convolve(right, rolled, size, n)

  const mixLeft = new Float64Array(n)
  const mixRight = new Float64Array(n)
  const limit = Math.tanh(1.1)
  for (let i = 0; i < n; i++) {
    mixLeft[i] = Math.tanh((left[i] * 0.84 + wetLeft[i] * 0.16) * 1.1) / limit
    mixRight[i] = Math.tanh((right[i] * 0.84 + wetRight[i] * 0.16) * 1.1) / limit
  }

  let peak = 0
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, Math.abs(mixLeft[i]), Math.abs(mixRight[i]))
  }
  const scale = peak === 0 ? 1 : 0.89 / peak
  for (let i = 0; i < n; i++) {
    mixLeft[i] *= scale
    mixRight[i] *= scale
  }

  const fadeInSamples = Math.min(Math.trunc(fadeIn * SR), n)
  for (let i = 0; i < fadeInSamples; i++) {
    const g = fadeInSamples > 1 ? (i / (fadeInSamples - 1)) ** 0.7 : 0
    mixLeft[i] *= g
    mixRight[i] *= g
  }
  const fadeOutSamples = Math.min(Math.trunc(fadeOut * SR), n)
  for (let i = 0; i < fadeOutSamples; i++) {
    const g = (fadeOutSamples > 1 ? 1 - i / (fadeOutSamples - 1) : 0) ** 1.3
    const at = n - fadeOutSamples + i
    mixLeft[at] *= g
    mixRight[at] *= g
  }

  return { mixLeft, mixRight, bpm, n }
}

function writeWav(path, left, right, n) {
  const bytesPerSample = 2
  const dataBytes = n * 2 * bytesPerSample
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(2, 22) // stereo
  buffer.writeUInt32LE(SR, 24)
  buffer.writeUInt32LE(SR * 2 * bytesPerSample, 28)
  buffer.writeUInt16LE(2 * bytesPerSample, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)
  let offset = 44
  for (let i = 0; i < n; i++) {
    for (const channel of [left, right]) {
      const value = Math.max(-1, Math.min(1, channel[i])) * 32767
      buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.trunc(value))), offset)
      offset += 2
    }
  }
  writeFileSync(path, buffer)
}

function parseArgs(argv) {
  const options = {
    out: undefined,
    dur: 30,
    mood: 'warm',
    key: 'D',
    bpm: 0,
    seed: 7,
    fadeIn: 1.4,
    fadeOut: 2.6,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dur') options.dur = Number(argv[++i])
    else if (arg === '--mood') options.mood = argv[++i]
    else if (arg === '--key') options.key = argv[++i]
    else if (arg === '--bpm') options.bpm = Number(argv[++i])
    else if (arg === '--seed') options.seed = Number(argv[++i])
    else if (arg === '--fade-in') options.fadeIn = Number(argv[++i])
    else if (arg === '--fade-out') options.fadeOut = Number(argv[++i])
    else if (arg === '-h' || arg === '--help') options.help = true
    else if (!arg.startsWith('-')) options.out = arg
  }
  return options
}

function main(argv) {
  const options = parseArgs(argv)
  if (options.help) {
    console.log('usage: node make_music.mjs <out.wav> [--dur 30] [--mood warm|calm|bright] [--key D] [--bpm 0] [--seed 7]')
    return 0
  }
  if (!options.out) {
    console.error('✗ missing output path')
    console.error('  usage: node make_music.mjs <out.wav> [--dur 30] [--mood warm|calm|bright] [--key D]')
    return 2
  }
  if (!MOODS[options.mood]) {
    console.error(`✗ unknown mood: ${options.mood} (warm, calm, bright)`)
    return 2
  }
  if (KEY_OFFSET[options.key] === undefined) {
    console.error(`✗ unknown key: ${options.key} (${Object.keys(KEY_OFFSET).join(' ')})`)
    return 2
  }
  if (!(options.dur > 0)) {
    console.error('✗ --dur must be a positive number of seconds')
    return 2
  }

  const { mixLeft, mixRight, bpm, n } = build(
    options.dur,
    options.mood,
    options.key,
    options.bpm,
    options.seed,
    options.fadeIn,
    options.fadeOut,
  )
  writeWav(options.out, mixLeft, mixRight, n)

  let peak = 0
  let energy = 0
  let clipped = 0
  for (let i = 0; i < n; i++) {
    for (const value of [mixLeft[i], mixRight[i]]) {
      const magnitude = Math.abs(value)
      peak = Math.max(peak, magnitude)
      energy += value * value
      if (magnitude > 0.999) clipped++
    }
  }
  const mixRms = Math.sqrt(energy / (2 * n))
  const dbfs = mixRms > 0 ? 20 * Math.log10(mixRms) : -Infinity

  console.log(`${options.out}  ${(n / SR).toFixed(2)}s  ${bpm} BPM  key ${options.key}  mood ${options.mood}`)
  console.log(`peak ${peak.toFixed(3)}  rms ${dbfs.toFixed(1)} dBFS  clipped ${clipped}`)
  console.log('next: ffmpeg ... -af "loudnorm=I=-16:TP=-2:LRA=9"  (see references/music.md)')
  return 0
}

process.exitCode = main(process.argv.slice(2))
