#!/usr/bin/env python3
"""script.txt -> script.json + timing report.

Usage: python3 txt_to_json.py script.txt script.json [--cps 10.2] [--max 46]

script.txt:
  ## Sxx name          scene header
  display || spoken    one line (spoken part optional)
  # note               dropped
  [[INSTRUCTOR]]       marker scene
"""
import argparse, json, string, sys

KEYS = string.ascii_lowercase


def key(i):
    return KEYS[i] if i < 26 else KEYS[i // 26 - 1] + KEYS[i % 26]


def parse(text):
    scenes, cur = [], None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("##"):
            cur = {"n": line.lstrip("#").strip(), "p": []}
            scenes.append(cur)
        elif line.startswith("#"):
            continue
        elif line == "[[INSTRUCTOR]]":
            scenes.append({"n": "INSTRUCTOR", "marker": True, "p": []})
            cur = None
        else:
            if cur is None:
                sys.exit(f"line outside a scene: {line}")
            disp, _, spoken = (x.strip() for x in line.partition("||"))
            item = [key(len(cur["p"])), disp]
            if spoken and spoken != disp:
                item.append(spoken)
            cur["p"].append(item)
    return scenes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--cps", type=float, default=10.2, help="characters per second (Thai default 10.2)")
    ap.add_argument("--max", type=int, default=46, help="max characters per line")
    a = ap.parse_args()

    scenes = parse(open(a.src, encoding="utf-8").read())
    json.dump(scenes, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    total, warn = 0, []
    print(f"{'scene':<28}{'lines':>6}{'chars':>7}{'sec':>6}")
    for s in scenes:
        if s.get("marker"):
            print(f"{'[' + s['n'] + ']':<28}")
            continue
        n = 0
        for p in s["p"]:
            spoken = p[2] if len(p) > 2 else p[1]
            n += len(spoken.replace(" ", ""))
            if len(p[1]) > a.max:
                warn.append(f"{s['n']} {p[0]}: {len(p[1])} chars: {p[1]}")
        total += n
        sec = n / a.cps
        flag = "  <- over 40 s, split?" if sec > 40 else ""
        print(f"{s['n'][:27]:<28}{len(s['p']):>6}{n:>7}{sec:>6.0f}{flag}")
    t = total / a.cps
    print(f"\ntotal {total} chars ~ {int(t // 60)}:{int(t % 60):02d} (+ instructor card)")
    if warn:
        print(f"\n{len(warn)} line(s) over {a.max} chars:")
        print("\n".join("  " + w for w in warn))


if __name__ == "__main__":
    main()
