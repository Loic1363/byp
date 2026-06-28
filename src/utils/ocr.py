"""OCR helpers: read a screen region as text and parse wait durations from the result."""
import re
from pathlib import Path

import numpy as np
from PIL import Image

from src.utils.screen import grab_region
from src.utils.streaming import broadcast

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
MESSAGE_PATH  = _PROJECT_ROOT / "last_message.png"


def read_text_region(mon_index: int, region: dict) -> str:
    """Capture a rectangular screen region, run EasyOCR on it, and return joined text.

    The captured image is saved to last_message.png for debugging.
    The image is doubled in size before OCR to improve recognition accuracy.
    """
    from src.solvers.captcha import get_reader

    img = grab_region(mon_index, region["x"], region["y"], region["w"], region["h"])
    img.save(MESSAGE_PATH)
    broadcast("message_img", "new")

    w, h    = img.size
    img_big = img.resize((w * 3, h * 3), Image.LANCZOS)
    arr     = np.array(img_big)

    reader  = get_reader()
    results = reader.readtext(arr, detail=0, paragraph=True,
                              allowlist='0123456789:./hmHM ')
    text    = " ".join(results)
    print(f"  Message lu : {text!r}")
    return text


def parse_global_count(text: str) -> tuple[int, int] | None:
    """Extract a N/M global countdown from OCR text (e.g. '3/8' → (3, 8)).

    Returns (current, maximum) or None if no fraction is found.
    """
    m = re.search(r'(\d+)\s*/\s*(\d+)', text)
    if m:
        n, total = int(m.group(1)), int(m.group(2))
        print(f"  Décompte global : {n}/{total}")
        return n, total
    return None


def parse_wait_seconds(text: str) -> int | None:
    """Extract a wait duration from a vote-timer string.

    Handles both time-separated formats (HH:MM:SS, HH.MM.SS) and natural-language
    French descriptions ('1 heure', '30 minutes', '45 secondes').

    Returns the total seconds (plus a 15 s safety margin), or None if no timer
    is found — which means the vote was accepted immediately.
    """
    t = text.lower()
    hours = mins = secs = 0
    found = False

    m = re.search(r'(\d+)\s*[:.]\s*(\d+)\s*[:.]\s*(\d+)', t)
    if m:
        h_, mn, sc = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if mn <= 59 and sc <= 59:
            hours, mins, secs = h_, mn, sc
            found = True
    if not found and re.search(r'(\d+)\s*[:.]\s*(\d+)', t):
        m = re.search(r'(\d+)\s*[:.]\s*(\d+)', t)
        h_, mn = int(m.group(1)), int(m.group(2))
        if mn <= 59:
            hours, mins = h_, mn
            found = True
    if not found:
        m = re.search(r'(\d+)\s*heures?', t)
        if m:
            hours = int(m.group(1))
            found = True
        elif re.search(r'\bheure\b', t):
            hours = 1
            found = True

        m = re.search(r'(\d+)\s*(?:minutes?|min\.?)', t)
        if m:
            mins  = int(m.group(1))
            found = True

        m = re.search(r'(\d+)\s*(?:secondes?|sec\.?)', t)
        if m:
            secs  = int(m.group(1))
            found = True

    if not found:
        return None

    raw = hours * 3600 + mins * 60 + secs
    if raw > 6 * 3600:
        print(f"  Délai ignoré — {hours}h {mins}m {secs}s > 6h, OCR garbage")
        return None
    total = raw + 15
    print(f"  Délai parsé : {hours}h {mins}m {secs}s → {total}s")
    return total
