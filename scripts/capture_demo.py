#!/usr/bin/env python3
"""
Glass-Box Checkout — scripted demo-video capture (no human required).

Drives the running app (http://localhost:8787, `npm run build && npm run server`)
in headless Chromium via Playwright's recordVideo, following the SUBMISSION.md
walkthrough beats:

    clean payment -> trap rubber-stamped in Black-Box mode
                  -> trap caught from provenance in Glass-Box mode -> debrief

Timed captions are written to an .srt alongside the recording and burned into
the final MP4 with ffmpeg (libass). No narration and no music: captions carry
the script, which also keeps the video clear of third-party audio.

Usage:
    python3 scripts/capture_demo.py --dry-run     # ~30 s pipeline proof (MOCK ok)
    python3 scripts/capture_demo.py               # full <3 min submission cut

Output: video-out/glassbox-demo[-dryrun].mp4 (+ .webm source and .srt)
Preconditions: app built; server running on :8787 (MOCK without .env,
LIVE Sandbox once .env holds the sandbox credentials).
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "video-out"
BASE = "http://localhost:8787"
W, H = 1280, 720

OVERRIDE_REASON = (
    "Payee mismatch — instruction names a look-alike payee; "
    "verified storefront name differs."
)


def srt_ts(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


class Capture:
    def __init__(self, page):
        self.page = page
        self.t0 = time.monotonic()
        self.captions = []  # (start, end, text)

    def now(self) -> float:
        return time.monotonic() - self.t0

    def caption(self, text: str, hold: float):
        """Show `text` as a caption for the next `hold` seconds while waiting."""
        start = self.now()
        self.page.wait_for_timeout(int(hold * 1000))
        self.captions.append((start, self.now(), text))

    def wait(self, seconds: float):
        self.page.wait_for_timeout(int(seconds * 1000))

    # -- UI primitives ------------------------------------------------------
    def set_mode(self, mode: str):
        label = "Glass-Box" if mode == "glass" else "Black-Box"
        self.page.get_by_role("button", name=label, exact=True).click()
        self.wait(0.6)

    def reset(self):
        self.page.get_by_role("button", name="Reset run").click()
        self.wait(0.6)

    def accept(self):
        self.page.get_by_role("button", name="Accept recommendation").click()
        self.wait(0.8)

    def override_trap(self):
        self.page.get_by_placeholder("Override reason").fill(OVERRIDE_REASON)
        self.wait(0.8)
        self.page.get_by_role("button", name="Override", exact=True).click()
        self.wait(0.8)

    def goto(self):
        self.page.goto(BASE, wait_until="networkidle")
        self.page.get_by_role("heading", name="POISONED CHECKOUT").wait_for()
        # Fit the provenance block (incl. the payee-MISMATCH row) above the fold.
        self.page.evaluate("document.body.style.zoom = '0.82'")
        self.wait(1.0)

    # -- Beat sequences -----------------------------------------------------
    def run_dry(self):
        self.goto()
        self.caption(
            "Glass-Box Checkout — measuring whether the human supervising an AI "
            "payment agent can tell a good payment from a diverted one.",
            5,
        )
        self.caption(
            "DP-1, a clean restock payment. In Glass-Box mode every confidence "
            "driver is decomposed, with provenance, on the surface.",
            6,
        )
        self.accept()
        self.caption(
            "Accepted — the payment executes (MOCK transport in this dry run; "
            "live PayPal Sandbox once credentials are configured).",
            5,
        )
        self.set_mode("black")
        self.caption(
            "Black-Box mode: the same recommendation as a bare confidence "
            "number — the industry default.",
            5,
        )

    def run_full(self):
        self.goto()
        self.caption(
            "Glass-Box Checkout — can the human supervising an AI payment agent "
            "tell a good payment from a diverted one? This instrument measures it.",
            6,
        )
        # Beat 1 — clean payment, Glass-Box.
        self.caption(
            "A clean payment. The agent's confidence decomposes into visible "
            "drivers — price vs. the 90-day median, seller record, authority, "
            "evidence — each with provenance.",
            7,
        )
        self.accept()
        self.caption("Accepted, and executed through the PayPal Sandbox.", 3)
        # Beat 2 — the trap in Black-Box mode (fresh run, fast-forward DP-1/2).
        self.reset()
        self.set_mode("black")
        self.caption(
            "Now the ablation: Black-Box mode. Identical scenario, instruments "
            "removed — a recommendation and a confidence number only.",
            6,
        )
        self.accept()  # DP-1
        self.accept()  # DP-2
        self.caption(
            "The trap: an instruction injected into listing content — a "
            "look-alike payee, a price 38% over median, a claimed 'updated "
            "payment account'. The agent confidently recommends PAY.",
            7,
        )
        self.accept()  # DP-3 — rubber-stamped
        self.caption(
            "Rubber-stamped. Nothing on the Black-Box surface could catch it — "
            "the diverted payment executes.",
            5,
        )
        # Beat 3 — the trap in Glass-Box mode (fresh run, fast-forward DP-1/2).
        self.reset()
        self.set_mode("glass")
        self.accept()  # DP-1
        self.accept()  # DP-2
        self.caption(
            "Same trap, Glass-Box surface: contradictions on record, stale and "
            "flagged provenance — and payee of record: MISMATCH. The instruction "
            "names a look-alike; the verified storefront name differs.",
            8,
        )
        self.override_trap()
        self.caption(
            "Caught. The operator overrides; the reason is written to the "
            "forensic log. No payment executes.",
            5,
        )
        # Finish the run correctly -> debrief.
        self.accept()  # DP-4
        self.accept()  # DP-5
        self.page.get_by_text("Debrief — scored against ground truth").wait_for()
        # Beat 4 — debrief.
        self.caption(
            "The debrief scores the run against ground truth: appropriate-"
            "reliance rate, over- and under-reliance, decision latency — and "
            "the DP-3 diversion trap: CAUGHT. Transparency is the difference.",
            9,
        )


def write_srt(captions, path: Path):
    lines = []
    for i, (start, end, text) in enumerate(captions, 1):
        lines += [str(i), f"{srt_ts(start)} --> {srt_ts(end)}", text, ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="short pipeline proof")
    args = ap.parse_args()

    tag = "dryrun" if args.dry_run else "full"
    OUT.mkdir(exist_ok=True)
    raw_dir = OUT / f"raw-{tag}"
    raw_dir.mkdir(exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": W, "height": H},
            record_video_dir=str(raw_dir),
            record_video_size={"width": W, "height": H},
        )
        page = ctx.new_page()
        cap = Capture(page)
        if args.dry_run:
            cap.run_dry()
        else:
            cap.run_full()
        video_path = Path(page.video.path())
        ctx.close()  # finalizes the .webm
        browser.close()

    srt_path = OUT / f"glassbox-demo-{tag}.srt"
    write_srt(cap.captions, srt_path)

    mp4_path = OUT / f"glassbox-demo-{tag}.mp4"
    # Burn captions, H.264/yuv420p for YouTube, silent AAC track for player safety.
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-vf", f"subtitles={srt_path.name}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-shortest", "-movflags", "+faststart",
        str(mp4_path),
    ]
    proc = subprocess.run(cmd, cwd=OUT, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stderr[-3000:], file=sys.stderr)
        sys.exit("ffmpeg failed")
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration,size", "-of", "default=noprint_wrappers=1", str(mp4_path)],
        capture_output=True, text=True,
    )
    print(f"WEBM: {video_path}")
    print(f"SRT:  {srt_path}")
    print(f"MP4:  {mp4_path}")
    print(probe.stdout.strip())


if __name__ == "__main__":
    main()
