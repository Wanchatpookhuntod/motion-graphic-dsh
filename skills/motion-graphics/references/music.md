# Music beds (composing in code)

Use this when a clip needs background music and there is no licensed track: the bed is
synthesised from code, so it is royalty-free, deterministic and re-makeable. `scripts/make_music.py`
is the reference implementation; it needs only Python 3 + NumPy (the WAV is written with the
standard-library `wave` module). ffmpeg is used **only** for loudness measurement and muxing.

Proven on: the 30 s title `เมืองไทย เมืองอาหาร` (88 BPM, D major, warm mood, `-16 LUFS`,
true peak `-1.0 dBTP`) — the same recipe at 7 s also worked.

## When this applies

- The clip needs a bed and the user has no track, or the track's licence is unclear.
- The music must be safe to publish, loop, or cut to length.
- Never download a song and never imitate a specific artist's track. If the user wants a
  real track, say the bed is a placeholder and they can swap `music.wav` later — the mux
  step is 10 seconds.

## Pipeline

1. **Time it.** The bed is exactly as long as the picture. List the visual beats and their
   seconds first — the accents in the music must land on them (see "Sync" below).
2. **Choose mood, key, tempo** from the topic:

   | Topic / tone | `--mood` | Tempo | Key |
   |---|---|---|---|
   | food, craft, culture, warm explainer | `warm` | 88 | D or F |
   | calm / institutional / finance / health | `calm` | 72 | C, F, or B♭ |
   | playful, education for kids, social | `bright` | 104 | G or A |

3. **Generate:** `python3 scripts/make_music.py music.wav --dur 30 --mood warm --key D`
4. **Measure** (never trust it blind): `ffmpeg -i music.wav -af ebur128=peak=true -f null -`
   and `astats=metadata=1:reset=0`. The raw render typically lands -14 to -17 LUFS; that is
   fine, the loudnorm pass in step 5 sets the delivery level. Targets for the delivered mix:
   **-16 LUFS** for a bed under narration, **-14 LUFS** standalone, true peak **≤ -1 dBTP**,
   zero clipped samples.
5. **Mux** with a loudness pass so the delivery is predictable:
   ```bash
   ffmpeg -y -i video.mp4 -i music.wav -map 0:v:0 -map 1:a:0 -c:v copy \
     -c:a aac -b:a 192k -ar 48000 -af "loudnorm=I=-16:TP=-2:LRA=9" \
     -shortest -movflags +faststart out.mp4
   ```

## How the bed is built (the recipe)

| Layer | Construction | Why |
|---|---|---|
| Pad | additive sines at f, 2f, 3f (1, 0.20, 0.05), attack ~1 s, exponential release; voices lean L/R by a few % | gives harmony without a sample library; slow attack keeps it out of the way of speech |
| Bass | sine + weak 2nd harmonic, decay 0.30 s, beats 1 and 3, at the **chord root's own octave** (D3/B2/G2/A2) | a real bass note, not sub-bass: laptops cannot reproduce 30 Hz but will still clip on it |
| Melody | 9-note pentatonic ladder (D4…A5), khim-like pluck (sines + 2f + 3f, `exp(-t/0.26)`), 8th-note motif with rests, velocity 0.72–1.0 | pentatonic never clashes with the pad; plucking reads as "warm", and the rests keep it from turning into a ringtone |
| Shaker | white noise → `np.diff` (cheap high-pass) → 9 ms envelope, every 8th, accents on downbeats | keeps time without a drum kit |
| Bells | 3 partials (1, 2.76, 5.40) with different decays, at 40 % and 68 % of the length | two moments of colour; place them on real beats |
| Reverb | FFT convolution with a synthetic IR (noise × `exp(-t/0.40)`, 1.2 s), wet 0.16, decorrelated L/R | glue; more than ~0.25 wet turns to mush |
| Limiter | `tanh(x*1.1)/tanh(1.1)`, then normalise to 0.89 peak | no hard clipping, no pumping |
| Fades | 1.4 s in, 2.6 s out | the bed starts and ends with the picture |

Progressions are four bars: **I maj9 → vi m9 → IV maj9 → V 6/9** (warm), reordered per mood.
One loop = 4 bars; a 30 s bed at 88 BPM is ~11 bars, so the loop repeats with variation from
the motif cycle (four motifs, so it does not sound copy-pasted).

## Why the levels are measured, not guessed

An agent cannot listen, so mixing by "feel" is a guess. `make_music.py` renders each layer
separately, measures its RMS and scales it to a target before summing:

| Layer | RMS target |
|---|---|
| pad | -27 dBFS |
| bass | -25 dBFS |
| melody | -25.5 dBFS |
| shaker | -40 dBFS |
| bell | -30 dBFS |

This fixed a real defect: the first version had bass amplitude 0.16 vs melody 0.075, so the
melody sat about 6 dB under the bass and the mix read as a low rumble. After RMS-balancing
(headroom-normalised) the melody sits clearly above the pad.

## Sync: the accents must land on the visual beats

Compute the grid before placing anything: `beat = 60/BPM`, `bar = 4*beat`. At 88 BPM:
bar starts are `0, 2.73, 5.45, 8.18, 10.91, 13.64, 16.36, 19.09, 21.82, 24.55, 27.27`.

- Put bell/SFX accents on a visual accent second, or move the visual accent to the nearest
  bar start — change **one** side, then re-render or re-synthesise, never both blindly.
- In the 30 s title the two visual "garnish bounce" beats are at 12.0 s and 20.0 s, so the
  bells were placed at exactly 12.0 s and 20.0 s (`for t0 in (12.0, 20.0)`).
- If the picture is still being edited, write the beat table into the project README so the
  next revision keeps the same grid.

## QA you can do without hearing the file

1. **Loudness + peaks** — `ebur128` integrated LUFS, true peak; `astats` peak/RMS per channel.
2. **Per-second RMS curve** — confirms the fades and that no second is silent or spiking.
3. **Clipping count** — `(np.abs(x) > 0.999).sum()` must be 0 in the 16-bit file.
4. **Structure** — a log-frequency spectrogram should show horizontal pad bands and vertical
   pluck stripes; a flat white wall means noise is dominating.
5. **Band balance** — low end should not sit 15 dB above the mids.

State plainly what was not checked: nobody listened, so musicality and taste are unverified.
Offer the user a listen and a re-synthesis with different `--mood` / `--bpm` / `--key`.

## Rules

- **Deterministic:** same `--seed` produces the same file. Record seed, BPM, key and mood in
  the project README so the bed can be rebuilt after an edit.
- **No copyrighted material, no samples, no music AI service** in this pipeline — say the
  bed is synthetic when you deliver it.
- Keep the WAV (44.1 kHz, 16-bit, stereo) as the master and mux a 48 kHz AAC copy for the
  video; if a voice-over is added later, drop the bed to **-18 LUFS** and duck it under speech.
- If the user supplies a real track, keep the same file name and mux step so nothing else
  in the project changes.

## Checklist

- [ ] Bed length equals picture length (sample-exact, e.g. 900 frames = 30.000 s)
- [ ] Mood/key/tempo chosen from the topic table, recorded in the README
- [ ] Accents land on the visual beat seconds
- [ ] Per-layer RMS balanced; melody above pad; no sub-bass
- [ ] Zero clipped samples, peak ≤ 0.89, fades in/out
- [ ] Integrated loudness and true peak measured and reported
- [ ] Muxed with `-ar 48000` and `loudnorm` (not a raw copy of 44.1 kHz audio)
- [ ] Told the user it is synthesised and that nobody has judged it by ear
