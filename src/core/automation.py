"""Core automation: CAPTCHA result checking, tab management, and the main launch cycle."""
import subprocess
import time
from pathlib import Path

import numpy as np
import pyautogui

from src.core.status import (
    launch_stop, set_status, sleep, wait_interruptible,
)
from src.utils.ocr import parse_global_count, parse_wait_seconds, read_text_region
from src.utils.screen import abs_point, grab_region, invalidate_screen_cache
from src.utils.streaming import broadcast
from src.utils.votes import record_vote

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
VERIFY_PATH   = _PROJECT_ROOT / "last_verify.png"


def check_status(mon_index: int, region: dict, debug: bool = False) -> str:
    """Inspect a screen region for green (success) or red (error) pixels.

    Saves the cropped image to last_verify.png and broadcasts a 'verify' SSE event
    so the monitor page can refresh the image in real time.

    Returns 'success', 'error', or 'unknown'.
    """
    img = grab_region(mon_index, region["x"], region["y"], region["w"], region["h"])
    img.save(VERIFY_PATH)
    broadcast("verify", "new")

    arr           = np.array(img).astype(np.float32)
    rr, g, b      = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    green_px      = int(((g > 100) & (g > rr * 1.3) & (g > b * 1.5)).sum())
    error_px      = int(((rr > 140) & (g < 55) & (b < 90)).sum())
    total         = arr.shape[0] * arr.shape[1]

    if debug:
        pct = error_px / total * 100 if total > 0 else 0
        print(f"    [vérif] green={green_px}  error={error_px} ({pct:.1f}%)  total={total}")

    if green_px > 15:
        return "success"
    if total > 0 and error_px / total > 0.02:
        return "error"
    return "unknown"


def close_pages(close_pre: bool) -> None:
    """Close the current vote tab (URL 2) and optionally the pre-step tab (URL 1)."""
    pyautogui.hotkey("ctrl", "w")
    print("  Page de vote fermée (Ctrl+W).")
    if close_pre:
        time.sleep(0.6)
        pyautogui.hotkey("ctrl", "w")
        print("  Page pré-étape fermée (Ctrl+W).")


def run_launch_cycle(
    *,
    url: str,
    url_pre: str,
    pt_pre,
    delay_pre: float,
    r_pre_timer,
    r_decompte,
    pt_try,
    pt_exten,
    r_check1,
    pt_validate,
    delay: int,
    delay_click: float,
    delay_exten: float,
    delay_final_ok: float,
    delay_retry: int,
    delay_error: int,
    mon_index: int,
) -> tuple[str, int]:
    """Run the full automation cycle loop until launch_stop is set.

    Each iteration opens the target URL, clicks through the configured points,
    checks the CAPTCHA result, then waits before the next cycle.

    Returns (final_status, cycle_count).
    The caller is responsible for acquiring/releasing launch_mutex around this call.
    """
    use_pre      = bool(url_pre and pt_pre)
    final_status = "unknown"
    cycle        = 0
    open_pages   = 0

    set_status("running", "Démarrage…")

    while True:
        if launch_stop.is_set():
            break

        cycle     += 1
        open_pages = 0

        print(f"\n{'─'*50}")
        print(f"  CYCLE {cycle}  |  Écran {mon_index}  |  Délai {delay}s")
        set_status("running", f"Cycle {cycle} — ouverture navigateur…", cycle)

        try:
            if use_pre:
                subprocess.Popen(["xdg-open", url_pre])
                open_pages = 1
                print(f"  URL pré-étape ouverte — attente {delay_pre}s...")
                if not sleep(delay_pre):
                    continue
                invalidate_screen_cache()

                if r_pre_timer:
                    set_status("running", f"Cycle {cycle} — lecture timer URL 1…", cycle)
                    timer_text = read_text_region(mon_index, r_pre_timer)
                    parse_global_count(timer_text)
                    wait_pre   = parse_wait_seconds(timer_text)
                    if wait_pre is not None:
                        print(f"  Timer URL 1 détecté ({wait_pre}s) — fermeture & attente…")
                        pyautogui.hotkey("ctrl", "w")
                        open_pages = 0
                        until     = time.time() + wait_pre
                        until_str = time.strftime("%H:%M:%S", time.localtime(until))
                        set_status("waiting", f"Timer URL 1 — réessai à {until_str}", cycle, until)
                        wait_interruptible()
                        continue

                if r_decompte:
                    set_status("running", f"Cycle {cycle} — lecture décompte global…", cycle)
                    count_text = read_text_region(mon_index, r_decompte)
                    count      = parse_global_count(count_text)
                    if count is not None:
                        n, total = count
                        if n >= total:
                            print(f"  Décompte global {n}/{total} — quota atteint, fermeture & attente {delay_retry}s…")
                            pyautogui.hotkey("ctrl", "w")
                            open_pages = 0
                            until     = time.time() + delay_retry
                            until_str = time.strftime("%H:%M:%S", time.localtime(until))
                            set_status("waiting", f"Quota {n}/{total} atteint — retry à {until_str}", cycle, until)
                            wait_interruptible()
                            continue
                        print(f"  Décompte global {n}/{total} — OK, clic pré-étape…")
                    else:
                        print("  Décompte global illisible — on continue quand même…")

                px, py = abs_point(mon_index, pt_pre["x"], pt_pre["y"])
                pyautogui.click(px, py)
                open_pages = 2
                print(f"  Clic pré-étape ({px}, {py}) — attente {delay}s (chargement URL 2)...")
            else:
                subprocess.Popen(["xdg-open", url])
                open_pages = 1
                print(f"  Navigateur ouvert — attente {delay}s...")
            if not sleep(delay):
                continue
            invalidate_screen_cache()

            if pt_try:
                set_status("running", f"Cycle {cycle} — clic try…", cycle)
                tx, ty = abs_point(mon_index, pt_try["x"], pt_try["y"])
                pyautogui.click(tx, ty)
                print(f"  Clic try ({tx}, {ty}) — attente {delay_click}s...")
                if not sleep(delay_click):
                    continue

            if pt_exten:
                set_status("running", f"Cycle {cycle} — clic extension…", cycle)
                ex, ey = abs_point(mon_index, pt_exten["x"], pt_exten["y"])
                pyautogui.click(ex, ey)
                print(f"  Clic extension ({ex}, {ey}) — attente {delay_exten}s (extension en cours)...")
                if not sleep(delay_exten):
                    continue

            if r_check1:
                set_status("running", f"Cycle {cycle} — vérif zone captcha…", cycle)
                invalidate_screen_cache()
                check1 = "unknown"
                for tick in range(25):
                    check1 = check_status(mon_index, r_check1, debug=(tick == 24))
                    if check1 != "unknown":
                        break
                    time.sleep(0.2)
                icon1 = "✅ vert" if check1 == "success" else "❌ pas vert"
                print(f"  Zone captcha : {icon1}")

                if check1 != "success":
                    record_vote('failure')
                    close_pages(use_pre)
                    open_pages = 0
                    until      = time.time() + delay_error
                    until_str  = time.strftime("%H:%M:%S", time.localtime(until))
                    print(f"  Captcha non résolu — retry dans {delay_error}s à {until_str}")
                    set_status("waiting", f"Captcha non résolu — retry à {until_str}", cycle, until)
                    wait_interruptible()
                    continue

            if pt_validate:
                set_status("running", f"Cycle {cycle} — clic valider…", cycle)
                vx, vy = abs_point(mon_index, pt_validate["x"], pt_validate["y"])
                pyautogui.click(vx, vy)
                print(f"  Clic valider ({vx}, {vy}) — attente {delay_final_ok}s...")
                if not sleep(delay_final_ok):
                    continue

            if launch_stop.is_set():
                continue

            close_pages(use_pre)
            open_pages   = 0
            record_vote('success')
            final_status = "success"
            until        = time.time() + delay_retry
            until_str    = time.strftime("%H:%M:%S", time.localtime(until))
            print(f"  Vote réussi ✅ → prochain cycle à {until_str}")
            set_status("waiting", f"Vote réussi ✅ — retry à {until_str}", cycle, until)
            wait_interruptible()

        except Exception as exc:
            print(f"  ⚠ Erreur inattendue cycle {cycle} : {exc}")
            if open_pages > 0:
                close_pages(open_pages >= 2 and use_pre)
                open_pages = 0
            until     = time.time() + delay_error
            until_str = time.strftime("%H:%M:%S", time.localtime(until))
            set_status("waiting", f"Erreur — retry à {until_str}", cycle, until)
            wait_interruptible()
        continue

    set_status("idle", f"Terminé — cycle {cycle}")
    return final_status, cycle
