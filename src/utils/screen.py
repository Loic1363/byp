"""Screen capture utilities: grim (Wayland) → portal XDG fallback, per-frame cache."""
import base64
import glob as _glob
import io
import os
import subprocess
import threading
import time

import mss
import numpy as np
from PIL import Image

# Per-frame cache — avoids repeated captures within a short window
_screen_cache: list = [0.0, None]   # [timestamp, Image]
_SCREEN_TTL   = 3.0
_grab_lock    = threading.Lock()

_CAPTURE_TMP  = "/tmp/voteflow_capture.png"   # fixed path, overwritten each time


def invalidate_screen_cache() -> None:
    """Discard the cached frame so the next grab triggers a fresh capture."""
    _screen_cache[0] = 0.0
    _screen_cache[1] = None


def _grab_via_grim() -> "Image.Image | None":
    """Wayland-native full-screen capture via grim."""
    try:
        if os.path.exists(_CAPTURE_TMP):
            os.unlink(_CAPTURE_TMP)
        env = {**os.environ}
        env.setdefault("WAYLAND_DISPLAY", "wayland-0")
        env.setdefault("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
        result = subprocess.run(
            ["grim", _CAPTURE_TMP],
            capture_output=True, timeout=10, env=env,
        )
        if result.returncode == 0 and os.path.exists(_CAPTURE_TMP):
            img = Image.open(_CAPTURE_TMP).convert("RGB")
            img.load()
            if np.array(img).mean() > 5:
                print(f"  [capture] grim OK ({img.width}×{img.height})")
                return img
    except FileNotFoundError:
        pass   # grim not installed — silent
    except Exception as e:
        print(f"  [capture] grim échoué : {e}")
    return None


def _grab_via_portal() -> "Image.Image | None":
    """XDG Desktop Portal screenshot — file deleted immediately after reading."""
    from src.core.status import launch_stop

    pictures = os.path.expanduser("~/Pictures")
    os.makedirs(pictures, exist_ok=True)
    t_before = time.time() - 1

    token = f"t{os.getpid()}"
    call  = subprocess.run([
        "gdbus", "call", "--session",
        "--dest",        "org.freedesktop.portal.Desktop",
        "--object-path", "/org/freedesktop/portal/desktop",
        "--method",      "org.freedesktop.portal.Screenshot.Screenshot",
        "",
        f"{{'handle_token': <'{token}'>, 'interactive': <false>}}",
    ], capture_output=True, text=True, env=os.environ, timeout=15)

    if call.returncode != 0:
        print(f"  [capture] portail erreur : {call.stderr.strip()}")
        return None

    deadline = time.time() + 20
    while time.time() < deadline:
        if launch_stop.is_set():
            return None
        time.sleep(0.4)
        for pat in ["Screenshot*.png", "Screenshot*.jpg", "screenshot*.png", "Capture*.png"]:
            for f in _glob.glob(os.path.join(pictures, pat)):
                try:
                    if os.path.getmtime(f) >= t_before and os.path.getsize(f) > 0:
                        size = os.path.getsize(f)
                        time.sleep(0.3)
                        if os.path.getsize(f) == size:
                            img = Image.open(f).convert("RGB")
                            img.load()
                            os.unlink(f)   # supprime immédiatement — pas d'accumulation
                            if np.array(img).mean() > 5:
                                print(f"  [capture] portail OK ({img.width}×{img.height})")
                                return img
                except (FileNotFoundError, OSError):
                    continue
    print("  [capture] portail timeout")
    return None


def _grab_via_mss() -> "Image.Image | None":
    """X11 capture via mss (last resort — may return black on pure Wayland)."""
    try:
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            shot    = sct.grab(monitor)
            img     = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
            if np.array(img).mean() > 5:
                print(f"  [capture] mss OK ({img.width}×{img.height})")
                return img
    except Exception as e:
        print(f"  [capture] mss échoué : {e}")
    return None


def grab_full() -> Image.Image:
    """Return a full-screen PIL Image, using a short TTL cache.

    Capture chain: grim (Wayland) → portal XDG → mss (X11).
    """
    now = time.time()
    if _screen_cache[1] is not None and now - _screen_cache[0] < _SCREEN_TTL:
        return _screen_cache[1].copy()

    with _grab_lock:
        now = time.time()
        if _screen_cache[1] is not None and now - _screen_cache[0] < _SCREEN_TTL:
            return _screen_cache[1].copy()

        img = _grab_via_grim() or _grab_via_portal() or _grab_via_mss()

        if img is None:
            print("  [capture] toutes les méthodes ont échoué — image noire")
            img = Image.new("RGB", (1920, 1080), (0, 0, 0))

        _screen_cache[0] = time.time()
        _screen_cache[1] = img.copy()
        return img


def screen_size() -> tuple[int, int]:
    """Return the current screen resolution."""
    try:
        with mss.mss() as sct:
            m = sct.monitors[1]
            if m["width"] > 0 and m["height"] > 0:
                return m["width"], m["height"]
    except Exception:
        pass
    # Fallback: parse grim output dimensions from a quick capture
    try:
        img = _grab_via_grim()
        if img:
            return img.width, img.height
    except Exception:
        pass
    return 1920, 1080


def get_monitors() -> list[dict]:
    w, h = screen_size()
    return [{"index": 1, "left": 0, "top": 0, "width": w, "height": h}]


def grab_region(mon_index: int, rx: int, ry: int, rw: int, rh: int) -> Image.Image:
    return grab_full().crop((rx, ry, rx + rw, ry + rh))


def grab_monitor(mon_index: int) -> Image.Image:
    return grab_full()


def to_b64(img: Image.Image) -> str:
    """Encode a PIL Image to a base64 PNG string for JSON transport."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


def abs_point(mon_index: int, rx: int, ry: int) -> tuple[int, int]:
    return (rx, ry)
