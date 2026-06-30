"""Watchdog — monitors the automation cycle and restarts it if stuck."""
import threading
import time

STUCK_THRESHOLD = 300  # seconds without heartbeat before considered stuck

_stop_event = threading.Event()
_thread: threading.Thread | None = None


def start(launch_fn, launch_kwargs: dict) -> None:
    """Start the watchdog, saving launch params for auto-restart."""
    global _thread
    stop()
    _stop_event.clear()
    _thread = threading.Thread(
        target=_run, args=(launch_fn, launch_kwargs), daemon=True, name="watchdog"
    )
    _thread.start()
    print(f"  [watchdog] Démarré — seuil {STUCK_THRESHOLD}s")


def stop() -> None:
    """Signal the watchdog to stop."""
    _stop_event.set()


def _run(launch_fn, launch_kwargs: dict) -> None:
    from src.core.status import get_status, launch_stop, launch_mutex

    while not _stop_event.is_set():
        _stop_event.wait(timeout=30)
        if _stop_event.is_set():
            break

        status = get_status()
        if status["state"] != "running":
            continue

        elapsed = time.time() - status["last_heartbeat"]
        if elapsed < STUCK_THRESHOLD:
            continue

        print(f"  [watchdog] ⚠ Cycle bloqué depuis {int(elapsed)}s — relance en cours…")
        launch_stop.set()

        def _restart():
            if not launch_mutex.acquire(timeout=30.0):
                print("  [watchdog] Mutex non acquis — abandon du redémarrage")
                return
            launch_stop.clear()
            print("  [watchdog] Relance du cycle…")
            try:
                launch_fn(**launch_kwargs)
            finally:
                launch_mutex.release()

        threading.Thread(target=_restart, daemon=True, name="watchdog-restart").start()
        _stop_event.wait(timeout=60)
