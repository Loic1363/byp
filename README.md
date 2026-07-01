<img src="static/img/byp-mark.svg" width="36" height="36" alt="byp"> byp
===

Browser automation tool with a local web interface, built to run 24/7 on a Raspberry Pi 5.

The target OS is **Ubuntu 26.04 LTS** (Ubuntu 24 is not compatible). A dedicated **HDMI dummy plug** is required so the display server stays active when no monitor is connected.

## Requirements

- Raspberry Pi 5, Ubuntu 26.04 LTS
- Python 3.10+
- X11 display (HDMI dummy plug for headless operation)
- A Chromium-based browser with the solver extension installed

## Setup

```bash
bash setup.sh
```

Installs system packages and creates a virtualenv with all Python dependencies.

## Usage

```bash
bash run.sh
```

Open `http://localhost:5000` or the LAN address printed at startup.

## Features

**Dashboard** — live vote count, success rate, and hourly breakdown across multiple time ranges (day, week, month, all-time).

**Configuration** — screenshot each target page, then place zones and click points directly on the canvas. Delay sliders let you tune timing per step.

**Terminal** — real-time log stream from the worker thread.

**Watchdog** — background thread that detects stuck automation cycles and restarts them automatically.

**RAM monitor** — stops the cycle before the system runs out of memory.

**Flyer mode** — alternate click and zone positions for a configurable period each month, when the target page layout shifts.

## Architecture

Flask server on the backend, single-page JS frontend communicating over SSE for live log streaming and vote events. Vote counts are persisted server-side so they survive browser closes and reboots.

## Dependencies

Flask, EasyOCR, Pillow, mss, pyautogui, numpy, opencv-python.
