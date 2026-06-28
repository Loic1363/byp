# byp

Browser automation tool with a local web interface. Handles click orchestration, OCR-based timer detection, and CAPTCHA verification through a browser extension — controlled from a Flask server running on the local network.

This runs on a Raspberry Pi 5, 24/7. The target OS is **Ubuntu 26.04 LTS** — Ubuntu 24 is not compatible. A dedicated **HDMI dummy plug** is required so the display server stays active when no monitor is connected; without it, screen capture and pyautogui will not work.

## Requirements

- Raspberry Pi 5, Ubuntu 26.04 LTS
- Python 3.10+
- X11 display (HDMI dummy plug required for headless operation)
- A Chromium-based browser with the solver extension installed

## Setup

```bash
bash setup.sh
```

Installs system packages (`libgl1`, `xdg-utils`, `scrot`...) and creates a virtualenv with all Python dependencies.

## Usage

```bash
bash run.sh
```

Open `http://localhost:5000` or the LAN address printed at startup.

**Configuration tab** — take a screenshot of each target page, then place zones and click points on the canvas:

- Pre-step click and timer zone (URL 1)
- Try / Extension / Validate click points (URL 2)
- CAPTCHA verification zone (green pixel detection)

Adjust delay sliders to match your setup, then hit Start.

**Dashboard** — live vote count, success rate, and captcha stats, broken down by day / week / month.

**Terminal** — real-time log stream from the worker.

## How it works

The automation loop opens URL 1, reads any cooldown timer via EasyOCR, then proceeds to URL 2 where it triggers the solver extension and waits for a green pixel in the CAPTCHA zone. On success it clicks validate and waits for the configured retry interval before the next cycle. Timers up to 6 hours are respected; anything above is treated as an OCR misread and falls back to the default interval.

## Dependencies

Flask, EasyOCR, Pillow, mss, pyautogui, numpy, opencv-python.
