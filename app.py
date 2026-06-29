"""Flask web server — route definitions and server entry point.

All heavy logic (screen capture, OCR, automation loop) lives in src/.
This file wires Flask routes to those modules and starts the server.
"""
import json
import logging as _logging
import queue as _queue_mod
import time
from pathlib import Path

_logging.getLogger('werkzeug').setLevel(_logging.ERROR)

import src.utils.system     # noqa: F401
import src.utils.streaming  # noqa: F401

import pyautogui
from flask import Flask, Response, jsonify, request, send_file, stream_with_context
from PIL import Image

from src.core.automation import VERIFY_PATH, run_launch_cycle
from src.core.status import get_status, launch_mutex, launch_stop
from src.utils.assets import ensure_placeholder
from src.utils.screen import get_monitors, grab_monitor, to_b64
from src.utils.streaming import log_history, log_lock, log_queues

app = Flask(__name__)
pyautogui.FAILSAFE = False

_ROOT                = Path(__file__).parent
SAVE_PATH            = _ROOT / "last_capture.png"
SCREENSHOT_PATH      = _ROOT / "last_screenshot.png"
SCREENSHOT_URL1_PATH = _ROOT / "last_screenshot_url1.png"
PLACEHOLDER_PATH     = _ROOT / "assets" / "placeholder.png"
CONFIG_PATH          = _ROOT / "config.json"
MESSAGE_PATH         = _ROOT / "last_message.png"

ensure_placeholder(PLACEHOLDER_PATH)


@app.route("/")
def index():
    return send_file(_ROOT / "templates" / "voteflow.html", mimetype="text/html")



@app.route("/monitors", methods=["GET"])
def monitors():
    return jsonify(get_monitors())


@app.route("/status", methods=["GET"])
def loop_status():
    return jsonify(get_status())


@app.route("/skip_wait", methods=["POST"])
def skip_wait():
    """Advance the inter-cycle timer to 'now + 3 s' so the loop restarts shortly."""
    status = get_status()
    if status["state"] == "waiting":
        status["wait_until"] = time.time() + 3
        print("  [monitor] Timer avancé — relance dans 3s…")
        return jsonify({"ok": True})
    return jsonify({"ok": False, "msg": "Pas en attente"})


@app.route("/config", methods=["GET"])
def get_config():
    """Return saved UI config (urls, delays, zones) — shared across all origins."""
    cfg = {}
    if CONFIG_PATH.exists():
        try:
            cfg = json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    cfg["_captures"] = {
        "url1": "done" if SCREENSHOT_URL1_PATH.exists() else None,
        "url2": "done" if SCREENSHOT_PATH.exists() else None,
    }
    return jsonify(cfg)


@app.route("/config", methods=["POST"])
def save_config():
    """Persist UI config sent by the browser."""
    CONFIG_PATH.write_text(json.dumps(request.json))
    return jsonify({"ok": True})


@app.route("/stop", methods=["POST"])
def stop():
    """Signal the running automation cycle to stop."""
    launch_stop.set()
    print("  [monitor] Arrêt demandé…")
    return jsonify({"ok": True})


@app.route("/stream")
def log_stream():
    """Server-Sent Events endpoint; replays recent history then streams live logs."""
    def gen():
        q = _queue_mod.Queue(maxsize=300)
        with log_lock:
            log_queues.append(q)
        try:
            for line in list(log_history):
                yield f"event: log\ndata: {line}\n\n"
            while True:
                try:
                    yield q.get(timeout=25)
                except _queue_mod.Empty:
                    yield ": keepalive\n\n"
        finally:
            with log_lock:
                try:
                    log_queues.remove(q)
                except ValueError:
                    pass

    return Response(
        stream_with_context(gen()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/img/capture")
def img_capture_route():
    """Serve the last captured CAPTCHA image, or the placeholder if none exists."""
    path = SAVE_PATH if SAVE_PATH.exists() else PLACEHOLDER_PATH
    return send_file(path, mimetype="image/png")


@app.route("/img/message")
def img_message_route():
    """Serve the last OCR region snapshot (last_message.png) for debugging."""
    path = MESSAGE_PATH if MESSAGE_PATH.exists() else PLACEHOLDER_PATH
    return send_file(path, mimetype="image/png")


@app.route("/img/verify")
def img_verify_route():
    """Serve the last verification-zone snapshot, or the placeholder if none exists."""
    path = VERIFY_PATH if VERIFY_PATH.exists() else PLACEHOLDER_PATH
    return send_file(path, mimetype="image/png")


@app.route("/img/screenshot")
def img_screenshot_route():
    """Serve the last full-page screenshot (url1 or url2) as PNG for the config preview."""
    which = request.args.get("which", "url2")
    path  = SCREENSHOT_URL1_PATH if which == "url1" else SCREENSHOT_PATH
    if not path.exists():
        return send_file(PLACEHOLDER_PATH, mimetype="image/png")
    return send_file(path, mimetype="image/png")


@app.route("/screenshot", methods=["POST"])
def screenshot():
    mon_index = int(request.json.get("monitor", 1))
    which     = request.json.get("which", "url2")
    img  = grab_monitor(mon_index)
    path = SCREENSHOT_URL1_PATH if which == "url1" else SCREENSHOT_PATH
    img.save(path)
    return jsonify({"image": to_b64(img), "width": img.width, "height": img.height})


@app.route("/last_screenshot", methods=["GET"])
def last_screenshot():
    which = request.args.get("which", "url2")
    path  = SCREENSHOT_URL1_PATH if which == "url1" else SCREENSHOT_PATH
    if not path.exists():
        return jsonify(None)
    img = Image.open(path)
    return jsonify({"image": to_b64(img), "width": img.width, "height": img.height})


@app.route("/launch", methods=["POST"])
def launch():
    """Start (or restart) the automation cycle with the parameters from the UI."""
    data           = request.json
    url            = data["url"]
    url_pre        = data.get("url_pre", "").strip()
    pt_pre         = data.get("point_pre")
    delay_pre      = float(data.get("delay_pre", 3.0))
    r_pre_timer    = data.get("region_pre_timer")
    r_decompte     = data.get("region_decompte")
    pt_try         = data.get("point_try")
    pt_exten       = data.get("point_exten")
    r_check1       = data.get("region_check1")
    pt_validate    = data.get("point_validate")
    delay          = int(data.get("delay", 3))
    delay_click    = float(data.get("delay_click",    1.0))
    delay_exten    = float(data.get("delay_exten",    4.0))
    delay_final_ok = float(data.get("delay_final_ok", 5.0))
    delay_retry    = int(data.get("delay_retry", 5400))
    delay_error    = int(data.get("delay_error", 300))
    mon_index      = int(data.get("monitor", 1))

    if CONFIG_PATH.exists():
        try:
            cfg_data  = json.loads(CONFIG_PATH.read_text())
            cfg_zones = {z["id"]: z for z in cfg_data.get("zones") or []}
            mons = get_monitors()
            W = mons[0]["width"]  if mons else 1920
            H = mons[0]["height"] if mons else 1080

            def _reg(zid):
                z = cfg_zones.get(zid)
                if not z or z.get("type") != "zone": return None
                return {"x": round(z["x"]/100*W), "y": round(z["y"]/100*H),
                        "w": round(z["w"]/100*W),  "h": round(z["h"]/100*H)}

            def _pt(zid):
                z = cfg_zones.get(zid)
                if not z or z.get("type") != "click": return None
                return {"x": round(z["x"]/100*W), "y": round(z["y"]/100*H)}

            r_pre_timer = _reg("timer1")   or r_pre_timer
            r_decompte  = _reg("decompte") or r_decompte
            r_check1    = _reg("captcha")  or r_check1
            pt_pre      = _pt("preetape")  or pt_pre
            pt_try      = _pt("try")       or pt_try
            pt_exten    = _pt("ext")       or pt_exten
            pt_validate = _pt("valider")   or pt_validate

            print(f"  [config] Zones rechargées depuis config.json (timer1 w={cfg_zones.get('timer1',{}).get('w','?')}%)")
        except Exception as e:
            print(f"  [config] Impossible de lire config.json : {e}")

    launch_stop.set()
    if not launch_mutex.acquire(timeout=30.0):
        return jsonify({"error": "Impossible d'arrêter le cycle précédent"}), 503
    launch_stop.clear()

    try:
        final_status, cycle = run_launch_cycle(
            url=url, url_pre=url_pre, pt_pre=pt_pre, delay_pre=delay_pre,
            r_pre_timer=r_pre_timer, r_decompte=r_decompte,
            pt_try=pt_try, pt_exten=pt_exten,
            r_check1=r_check1, pt_validate=pt_validate,
            delay=delay, delay_click=delay_click, delay_exten=delay_exten,
            delay_final_ok=delay_final_ok, delay_retry=delay_retry, delay_error=delay_error, mon_index=mon_index,
        )
    finally:
        launch_mutex.release()

    return jsonify({"status": final_status, "cycles": cycle})


def _get_lan_ip() -> str:
    try:
        import socket as _sock
        s = _sock.socket(_sock.AF_INET, _sock.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


if __name__ == "__main__":
    print("Écrans détectés :")
    for m in get_monitors():
        print(f"  Écran {m['index']} — {m['width']}×{m['height']}  offset({m['left']},{m['top']})")
    lan = _get_lan_ip()
    print(f"\nInterfaces disponibles :")
    print(f"  Local   → http://127.0.0.1:5000")
    print(f"  Réseau  → http://{lan}:5000")
    app.run(debug=False, host="0.0.0.0", port=5000, threaded=True)
