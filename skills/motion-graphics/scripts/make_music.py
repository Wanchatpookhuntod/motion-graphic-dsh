#!/usr/bin/env python3
"""Synthesise a royalty-free music bed for a clip (no samples, no external libraries).

Every sound is generated from code: additive sines with harmonic weights, exponential
envelopes, seeded noise for the shaker, an FFT-convolution reverb from a synthetic
impulse, then a soft tanh limiter. Layers are balanced by measured RMS, not by ear,
because an agent cannot listen.

Usage
-----
    python3 scripts/make_music.py music.wav --dur 30
    python3 scripts/make_music.py bed.wav --dur 12 --mood calm --key F
    python3 scripts/make_music.py out.wav --dur 30 --mood bright --bpm 104 --seed 3

Then normalise and mux (ffmpeg is only used for loudness + muxing, never for synthesis):
    ffmpeg -y -i video.mp4 -i music.wav -map 0:v:0 -map 1:a:0 -c:v copy \
      -c:a aac -b:a 192k -ar 48000 -af "loudnorm=I=-16:TP=-2:LRA=9" \
      -shortest -movflags +faststart out.mp4

Design notes, level targets and the QA you can do without hearing the result live in
references/music.md.
"""
import argparse
import wave

import numpy as np

SR = 44100

# key -> semitones above D
KEY_OFFSET = {"C": 10, "C#": 11, "D": 0, "D#": 1, "E": 2, "F": 3, "F#": 4,
              "G": 5, "G#": 6, "A": 7, "A#": 8, "B": 9}

# chord voicings as semitone offsets from the chord root (maj9 / m9 / maj9 / 6-9)
VOICINGS = {
    0: [0, 7, 11, 14, 4],     # I maj9
    9: [0, 3, 7, 10, 14],     # vi m9
    5: [0, 4, 7, 11, 14],     # IV maj9
    7: [0, 4, 7, 9, 14],      # V 6/9
}

MOODS = {
    # order = the four bars of the loop, as semitone offsets of the chord root
    "warm":   dict(bpm=88,  order=[0, 9, 5, 7], pluck=0.26, shaker=1.00, pad_attack=1.0),
    "calm":   dict(bpm=72,  order=[0, 5, 9, 7], pluck=0.34, shaker=0.60, pad_attack=1.4),
    "bright": dict(bpm=104, order=[0, 7, 9, 5], pluck=0.22, shaker=1.25, pad_attack=0.7),
}

# melodic motif: indices into the 9-note pentatonic ladder, None = rest (8th notes)
MOTIFS = [
    [4, None, 2, 3, None, 4, None, 1],
    [5, None, 4, 2, None, 3, None, None],
    [2, 3, None, 4, None, 5, 4, None],
    [None, 4, None, 2, None, 3, None, 1],
]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def rms(x):
    return float(np.sqrt((x ** 2).mean()))


def norm_to(x, target_db):
    r = rms(x)
    return x if r == 0 else x * (10 ** (target_db / 20.0) / r)


def build(dur, mood, key, bpm, seed, fade_in, fade_out):
    cfg = MOODS[mood]
    bpm = bpm or cfg["bpm"]
    beat = 60.0 / bpm
    bar = 4 * beat
    n = int(round(dur * SR))
    bars = int(np.ceil(dur / bar)) + 1
    rng = np.random.default_rng(seed)
    off = KEY_OFFSET[key]

    def prog(b):
        return cfg["order"][b % 4]

    def chord_midi(b):
        root = 50 + off + prog(b)              # D3 register and up
        return [root + v for v in VOICINGS[prog(b)]]

    def place(buf, start, sig):
        i = int(round(start * SR))
        if i >= n:
            return
        m = min(len(sig), n - i)
        buf[i:i + m] += sig[:m]

    # ---------------------------------------------------------------- pad ----
    pad = np.zeros(n)
    for b in range(bars):
        t0 = b * bar
        notes = chord_midi(b)
        for v, m in enumerate(notes):
            length = bar * 1.3
            t = np.arange(int(length * SR)) / SR
            env = (np.minimum(1, t / cfg["pad_attack"])
                   * np.exp(-np.maximum(0, t - bar * 0.9) / 1.1))
            f = hz(m)
            sig = (np.sin(2 * np.pi * f * t)
                   + 0.20 * np.sin(2 * np.pi * 2 * f * t + 0.4)
                   + 0.05 * np.sin(2 * np.pi * 3 * f * t + 1.1)) * env
            det = 1.0 + 0.0006 * (v % 2)
            sig_r = (np.sin(2 * np.pi * f * det * t + 0.7)
                     + 0.20 * np.sin(2 * np.pi * 2 * f * det * t + 1.0)
                     + 0.05 * np.sin(2 * np.pi * 3 * f * det * t + 1.7)) * env
            pan = 0.5 + 0.22 * ((v % 3) - 1)
            place(pad, t0 + 0.004 * v, (sig * (1 - pan) + sig_r * pan) / len(notes))

    # --------------------------------------------------------------- bass ----
    bass = np.zeros(n)
    for b in range(bars):
        root = 50 + off + prog(b)
        for k in (0, 2):
            t = np.arange(int(0.75 * SR)) / SR
            env = np.minimum(1, t / 0.014) * np.exp(-t / 0.30)
            sig = (np.sin(2 * np.pi * hz(root) * t)
                   + 0.25 * np.sin(2 * np.pi * 2 * hz(root) * t)) * env
            place(bass, b * bar + k * beat, sig)

    # ------------------------------------------------------------- melody ----
    tonic = 62 + off
    ladder = [tonic + d for d in (0, 2, 4, 7, 9, 12, 14, 16, 19)]
    mel_l = np.zeros(n)
    mel_r = np.zeros(n)
    for b in range(bars):
        for k, deg in enumerate(MOTIFS[b % 4]):
            if deg is None:
                continue
            f = hz(ladder[deg])
            t = np.arange(int(0.95 * SR)) / SR
            env = np.minimum(1, t / 0.005) * np.exp(-t / cfg["pluck"])
            sig = (np.sin(2 * np.pi * f * t)
                   + 0.28 * np.sin(2 * np.pi * 2 * f * t + 0.3)
                   + 0.07 * np.sin(2 * np.pi * 3 * f * t + 0.9)) * env
            vel = 0.72 + 0.28 * rng.random()
            pan = 0.42 + 0.26 * (k % 2)
            start = b * bar + k * beat / 2
            place(mel_l, start, sig * vel * (1 - pan))
            place(mel_r, start, sig * vel * pan)

    # ------------------------------------------------------------- shaker ----
    sh = np.zeros(n)
    noise = rng.standard_normal(n)
    for b in range(bars):
        for k in range(8):
            i = int(round((b * bar + k * beat / 2) * SR))
            ln = int(0.04 * SR)
            if i + ln >= n:
                continue
            burst = np.diff(noise[i:i + ln], prepend=0.0)
            burst = burst * np.exp(-np.arange(ln) / (0.009 * SR))
            sh[i:i + ln] += burst * (1.0 if k % 2 == 0 else 0.55) * cfg["shaker"]

    # -------------------------------------------------------------- bells ----
    bell = np.zeros(n)
    for frac in (0.40, 0.68):                       # two accents, on the bar feel
        t0 = dur * frac
        t = np.arange(int(2.4 * SR)) / SR
        sig = np.zeros(len(t))
        for mult, dec, amp in ((1.0, 1.4, 1.0), (2.76, 0.75, 0.34), (5.40, 0.42, 0.12)):
            sig += np.sin(2 * np.pi * hz(tonic + 12) * mult * t) * np.exp(-t / dec) * amp
        place(bell, t0, sig)

    # level targets measured from a mix that read clearly on laptop speakers
    left = (norm_to(pad, -27.0) * 0.5 + norm_to(bass, -25.0)
            + norm_to(mel_l, -25.5) + norm_to(sh, -40.0) * 0.85 + norm_to(bell, -30.0))
    right = (norm_to(pad, -27.0) * 0.5 + norm_to(bass, -25.0)
             + norm_to(mel_r, -25.5) + norm_to(sh, -40.0) * 1.0 + norm_to(bell, -30.0) * 0.95)

    # -------------------------------------------------------------- reverb ---
    ir_len = int(1.2 * SR)
    ti = np.arange(ir_len) / SR
    ir = rng.standard_normal(ir_len) * np.exp(-ti / 0.40)
    ramp = int(0.015 * SR)
    ir[:ramp] *= np.linspace(0, 1, ramp)
    ir /= np.sqrt((ir ** 2).sum())

    size = 1 << int(np.ceil(np.log2(n + ir_len)))

    def wet(x, impulse):
        return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(impulse, size), size)[:n]

    left = left * 0.84 + wet(left, ir) * 0.16
    right = right * 0.84 + wet(right, np.roll(ir, 211)) * 0.16

    mix = np.stack([left, right], axis=1)
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    mix = mix / np.abs(mix).max() * 0.89

    fi = min(int(fade_in * SR), n)
    if fi:
        mix[:fi] *= np.linspace(0, 1, fi)[:, None] ** 0.7
    fo = min(int(fade_out * SR), n)
    if fo:
        mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.3
    return mix, bpm


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("out", help="output .wav path")
    ap.add_argument("--dur", type=float, default=30.0, help="length in seconds")
    ap.add_argument("--mood", choices=sorted(MOODS), default="warm")
    ap.add_argument("--key", choices=sorted(KEY_OFFSET), default="D")
    ap.add_argument("--bpm", type=int, default=0, help="override the mood tempo")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--fade-in", type=float, default=1.4)
    ap.add_argument("--fade-out", type=float, default=2.6)
    args = ap.parse_args()

    mix, bpm = build(args.dur, args.mood, args.key, args.bpm, args.seed,
                     args.fade_in, args.fade_out)
    pcm = (mix * 32767).astype(np.int16)
    with wave.open(args.out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())

    print("%s  %.2fs  %d BPM  key %s  mood %s"
          % (args.out, len(pcm) / SR, bpm, args.key, args.mood))
    print("peak %.3f  rms %.1f dBFS  clipped %d"
          % (np.abs(mix).max(), 20 * np.log10(rms(mix)), int((np.abs(mix) > 0.999).sum())))
    print("next: ffmpeg ... -af \"loudnorm=I=-16:TP=-2:LRA=9\"  (see references/music.md)")


if __name__ == "__main__":
    main()
