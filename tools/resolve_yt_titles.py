#!/usr/bin/env python3
"""
resolve_yt_titles.py — attach `id` fields to top_1000_youtube_videos.json

Queries public Piped/Invidious instances to convert each entry's title into
a real 11-char YouTube video ID, then writes the JSON back in place.

Usage:
    python tools/resolve_yt_titles.py
    python tools/resolve_yt_titles.py --pace=800 --max=100
    python tools/resolve_yt_titles.py --instances=https://yewtu.be,https://invidious.fdn.fr

Flags:
    --pace=MS          delay between requests, ms (default 600)
    --max=N            stop after resolving N new entries
    --in=PATH          input JSON (default assets/json/top_1000_youtube_videos.json)
    --instances=A,B,C  comma-separated piped/invidious bases
    --redo             ignore existing `id` fields, re-resolve everything
    --help             this message

Realities:
  * Public instances rot — when the script starts erroring across the board,
    grab fresh URLs from https://piped-instances.kavin.rocks or
    https://api.invidious.io and pass them with --instances=...
  * 1000 entries × 600ms ≈ 10 minutes. Drop --pace if you don't mind being
    rude. Below ~200ms you'll start getting rate-limited.
  * Resumable: re-run anytime; already-resolved entries skip.
  * The first search result is *usually* the canonical video, not always.

Deps: Python 3.8+ stdlib only — no pip install.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

# Windows consoles default to cp1252 — force UTF-8 so the script can print
# any character that shows up in a video title (emoji, em-dashes, CJK, etc.)
# without bombing with UnicodeEncodeError.
for _stream_name in ("stdout", "stderr"):
    _stream = getattr(sys, _stream_name, None)
    if _stream is not None and hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            pass

DEFAULT_JSON = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "assets", "json", "top_1000_youtube_videos.json",
)

# Current Piped/Invidious bases (verified live at script-write time).
# These will rot — when erroring across the board, fetch fresh URLs from
# https://piped-instances.kavin.rocks or https://api.invidious.io and pass
# them via --instances=A,B,C.
DEFAULT_INSTANCES = [
    ("invidious", "https://inv.thepixora.com"),
    ("piped",     "https://api.piped.private.coffee"),
]

YT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
URL_VID_RE = re.compile(r"[?&]v=([A-Za-z0-9_-]{11})")

USER_AGENT = "doublehappiness-resolver/1.0 (+sinnerbox)"
REQUEST_TIMEOUT = 12  # seconds


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument("--pace", type=int, default=600)
    p.add_argument("--max", type=int, default=0)
    p.add_argument("--in", dest="in_path", default=DEFAULT_JSON)
    p.add_argument("--instances", default="")
    p.add_argument("--redo", action="store_true")
    p.add_argument("--help", "-h", action="store_true", dest="help")
    return p.parse_args()


def guess_instance(url: str) -> tuple[str, str]:
    # Allow bare URLs in --instances; guess kind from host.
    kind = "piped" if re.search(r"pipedapi|piped\.video", url, re.I) else "invidious"
    return (kind, url)


def fetch_json(url: str) -> Any:
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
        body = resp.read()
    return json.loads(body.decode("utf-8"))


def search_piped(base: str, query: str) -> str | None:
    url = f"{base}/search?q={urllib.parse.quote(query)}&filter=videos"
    data = fetch_json(url)
    items = (data or {}).get("items") or []
    for it in items:
        u = it.get("url")
        if isinstance(u, str):
            m = URL_VID_RE.search(u)
            if m:
                return m.group(1)
    return None


def search_invidious(base: str, query: str) -> str | None:
    url = f"{base}/api/v1/search?q={urllib.parse.quote(query)}&type=video"
    data = fetch_json(url)
    if not isinstance(data, list):
        return None
    for it in data:
        vid = (it or {}).get("videoId")
        if isinstance(vid, str) and YT_ID_RE.match(vid):
            return vid
    return None


def resolve_one(query: str, instances: list[tuple[str, str]]) -> tuple[str | None, str | None]:
    last_err: str | None = None
    for kind, base in instances:
        try:
            if kind == "piped":
                vid = search_piped(base, query)
            else:
                vid = search_invidious(base, query)
            if vid:
                return vid, base
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, OSError) as e:
            last_err = f"{base}: {e}"
        except Exception as e:  # noqa: BLE001
            last_err = f"{base}: {e}"
    return None, last_err


def main() -> int:
    args = parse_args()
    if args.help:
        print(__doc__)
        return 0

    instances: list[tuple[str, str]]
    if args.instances:
        instances = [guess_instance(u.strip()) for u in args.instances.split(",") if u.strip()]
    else:
        instances = list(DEFAULT_INSTANCES)

    pace_ms = max(0, args.pace)
    max_new = args.max if args.max > 0 else float("inf")
    in_path = os.path.abspath(args.in_path)

    print("Resolver — Piped/Invidious title-to-ID")
    print(f"Input:     {in_path}")
    print(f"Pace:      {pace_ms} ms")
    print(f"Max new:   {'∞' if max_new == float('inf') else int(max_new)}")
    print(f"Instances: {', '.join(b for _, b in instances)}")
    print()

    try:
        with open(in_path, "r", encoding="utf-8") as f:
            raw = f.read()
    except OSError as e:
        print(f"Cannot read {in_path}: {e}", file=sys.stderr)
        return 1
    doc = json.loads(raw)
    if not isinstance(doc.get("videos"), list):
        print("Invalid JSON: expected { videos: [...] }", file=sys.stderr)
        return 1

    # Snapshot before mutating.
    backup_path = f"{in_path}.backup.{int(time.time())}"
    with open(backup_path, "w", encoding="utf-8") as f:
        f.write(raw)
    print(f"Backup written: {backup_path}")
    print()

    # Save partial progress on Ctrl-C.
    state: dict[str, Any] = {"dirty": False, "interrupted": False}

    def write_back() -> None:
        if not state["dirty"]:
            return
        with open(in_path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, indent=2, ensure_ascii=False)
        state["dirty"] = False

    def on_sigint(_signum: int, _frame: Any) -> None:
        if state["interrupted"]:
            os._exit(130)
        state["interrupted"] = True
        print("\nInterrupted — saving partial progress…")
        write_back()
        sys.exit(130)

    signal.signal(signal.SIGINT, on_sigint)

    total = len(doc["videos"])
    resolved = 0
    skipped = 0
    failed = 0
    processed_new = 0

    for i, v in enumerate(doc["videos"]):
        if state["interrupted"]:
            break
        if not args.redo and isinstance(v.get("id"), str) and YT_ID_RE.match(v["id"]):
            skipped += 1
            continue
        title = (v.get("title") or "").strip()
        if not title:
            failed += 1
            continue

        vid, err = resolve_one(title, instances)
        if vid:
            v["id"] = vid
            resolved += 1
            state["dirty"] = True
        else:
            failed += 1
            if err:
                short = title[:50] + ("…" if len(title) > 50 else "")
                print(f"  rank {v.get('rank', '?')} \"{short}\" — {err}")

        processed_new += 1
        if processed_new % 25 == 0:
            print(f"  [{i + 1:4d}/{total}] resolved={resolved} failed={failed}   (saving…)")
            write_back()

        if processed_new >= max_new:
            print(f"Hit --max={int(max_new)}, stopping.")
            break

        time.sleep(pace_ms / 1000.0)

    write_back()
    print()
    print(f"Done. resolved={resolved} skipped={skipped} failed={failed}")
    print(f"Output: {in_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
