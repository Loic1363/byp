# bp_captcha

Automated CAPTCHA solving and browser click orchestration, controlled through a
local Flask web interface.

## Setup

Install system dependencies and create the Python virtualenv:

```bash
bash setup.sh
```

## Run

```bash
bash run.sh
```

Then open **http://localhost:5000** in your browser.
The live log monitor is at **http://localhost:5000/monitor**.

## Usage

1. Go to the **Configuration** tab.
2. Click **Capturer URL 1** (optional) or **Capturer URL 2** to take a screenshot of the target page.
3. On the screenshot canvas, mark the click points and verification zones:
   - Pre-step click (optional URL 1 button)
   - timer zone on URL 1 (optional)
   - Try click — opens the CAPTCHA widget
   - Extension click — triggers the solver extension
   - Verification zone — green pixels confirm the CAPTCHA is solved
   - Validate click — submits the form
   - Result zone — contains the timer or success message
4. Adjust the delay sliders as needed.
5. Click **▶ Lancer** to start the loop.
6. Open **/monitor** in a second tab for a real-time log view.

## Dependencies

See [requirements.txt](requirements.txt).
Key packages: Flask · EasyOCR · OpenCV · Pillow · mss · pyautogui
