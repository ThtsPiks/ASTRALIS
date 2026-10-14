#!/usr/bin/env python3
"""Bake ASTRALIS planetary cache: albedos, height chunks, sky cubes.
Default target ~2.4 GB (disk has limited free space). Use --gb 8 if you have room.
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache"

PAL = {
    "exotic": ((226, 90, 168), (122, 29, 106), (255, 154, 212)),
    "terra": ((47, 125, 79), (26, 77, 46), (203, 189, 147)),
    "ocean": ((30, 144, 200), (8, 48, 79), (191, 233, 245)),
    "desert": ((211, 154, 78), (168, 111, 52), (255, 240, 198)),
    "ice": ((195, 216, 232), (143, 168, 189), (255, 255, 255)),
    "lava": ((255, 90, 18), (122, 29, 5), (255, 210, 87)),
    "rocky": ((156, 138, 114), (90, 74, 60), (194, 179, 154)),
    "barren": ((109, 102, 94), (74, 69, 64), (179, 169, 155)),
    "toxic": ((168, 198, 44), (63, 74, 23), (223, 240, 122)),
    "carbon": ((58, 58, 72), (14, 14, 18), (91, 91, 110)),
    "gas": ((201, 143, 74), (138, 90, 43), (246, 230, 192)),
    "icegiant": ((42, 110, 168), (27, 63, 107), (182, 236, 255)),
}
TYPES = list(PAL.keys())


def fbm(h: int, w: int, seed: int, octaves: int = 6) -> np.ndarray:
    rng = np.random.RandomState(seed & 0x7FFFFFFF)
    y, x = np.ogrid[0:h, 0:w]
    acc = np.zeros((h, w), np.float32)
    amp, freq = 1.0, 1.0
    nrm = 0.0
    for _ in range(octaves):
        px, py = rng.rand() * 80.0, rng.rand() * 80.0
        acc += amp * np.sin((x.astype(np.float32) + px) * 0.0062 * freq) * np.cos(
            (y.astype(np.float32) + py) * 0.0062 * freq
        )
        nrm += amp
        amp *= 0.52
        freq *= 2.07
    return acc / nrm


def colorize(height: np.ndarray, t: str) -> np.ndarray:
    a, b, c = (np.array(PAL[t], np.float32) / 255.0)
    h = (height - height.min()) / (float(np.ptp(height)) + 1e-6)
    rgb = b + (a - b) * h[..., None] + (c - a) * (h[..., None] ** 2) * 0.35
    return np.clip(rgb * 255.0, 0, 255).astype(np.uint8)


def write_albedo(path: Path, rgb: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    h, w, _ = rgb.shape
    with path.open("wb") as f:
        f.write(b"ASTRALB1")
        f.write(struct.pack("<HH", w, h))
        f.write(rgb.tobytes(order="C"))


def write_chunk(path: Path, height: np.ndarray, rgb: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    res = height.shape[0]
    with path.open("wb") as f:
        f.write(b"ASTRCH01")
        f.write(struct.pack("<H", res))
        f.write(b"\x00\x00")  # pad so float32 heights start at byte 12
        f.write(height.astype(np.float32).tobytes(order="C"))
        f.write(rgb.tobytes(order="C"))


def write_sky_face(path: Path, rgb: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    h, w, _ = rgb.shape
    with path.open("wb") as f:
        f.write(b"ASTRSKY1")
        f.write(struct.pack("<HH", w, h))
        f.write(rgb.tobytes(order="C"))


def dir_size(p: Path) -> int:
    total = 0
    if not p.exists():
        return 0
    for root, _, files in os.walk(p):
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                pass
    return total


def bake(target_gb: float, max_gb: float) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    target = int(target_gb * (1024 ** 3))
    cap = int(max_gb * (1024 ** 3))
    t0 = time.time()
    worlds = []
    n = 0
    ALB = 2048
    CH = 128
    CHUNKS = 12

    while dir_size(CACHE) < target and dir_size(CACHE) < cap:
        kind = TYPES[n % len(TYPES)]
        seed = 10007 + n * 7919
        pid = f"w{n:04d}_{kind}"
        alb_path = CACHE / "planets" / pid / "albedo.bin"
        if not alb_path.exists():
            hmap = fbm(ALB, ALB, seed, 7)
            rgb = colorize(hmap, kind)
            write_albedo(alb_path, rgb)
        cdir = CACHE / "chunks" / pid
        for k in range(CHUNKS):
            ix, iz = (k % 4) - 1, (k // 4) - 1
            cp = cdir / f"{ix}_{iz}.bin"
            if cp.exists():
                continue
            hh = fbm(CH, CH, seed + k * 17, 5) * 90.0 + 28.0
            rgb = colorize(hh, kind)
            write_chunk(cp, hh, rgb)
        if n < 16:
            sky = CACHE / "sky" / f"gal{n:02d}"
            for face in range(6):
                fp = sky / f"face{face}.bin"
                if fp.exists():
                    continue
                sm = fbm(768, 768, seed + 400 + face, 5)
                rgb = colorize(sm, "exotic" if face % 2 == 0 else "carbon")
                write_sky_face(fp, rgb)
        worlds.append({"id": pid, "type": kind, "seed": seed})
        n += 1
        if n % 8 == 0:
            gb = dir_size(CACHE) / (1024 ** 3)
            print(f"[bake] worlds={n}  cache={gb:.2f} GB  elapsed={time.time()-t0:.0f}s", flush=True)

    gb = dir_size(CACHE) / (1024 ** 3)
    manifest = {
        "version": 1,
        "worlds": n,
        "bytes": dir_size(CACHE),
        "gb": round(gb, 3),
        "albedo": ALB,
        "chunkRes": CH,
        "chunksPerWorld": CHUNKS,
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "planets": worlds[-40:],
    }
    (CACHE / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"[bake] DONE {gb:.2f} GB · {n} worlds · {CACHE}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gb", type=float, default=2.35, help="minimum cache size in GB")
    ap.add_argument("--max-gb", type=float, default=4.0, help="hard cap (this volume is tight)")
    args = ap.parse_args()
    bake(args.gb, args.max_gb)


if __name__ == "__main__":
    main()
