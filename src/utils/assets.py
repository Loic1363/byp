"""Asset generation: placeholder images shown before any real capture exists."""
from pathlib import Path

from PIL import Image, ImageDraw


def ensure_placeholder(path: Path) -> None:
    """Create a dark grey placeholder PNG at *path* if it does not already exist.

    The placeholder is served by /img/capture and /img/verify in place of a 404
    when no real screen capture has been taken yet.
    """
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    img  = Image.new("RGB", (320, 120), color=(18, 18, 18))
    draw = ImageDraw.Draw(img)
    draw.rectangle([1, 1, 318, 118], outline=(38, 38, 38))
    draw.text((100, 52), "no capture yet", fill=(64, 64, 64))
    img.save(path)
