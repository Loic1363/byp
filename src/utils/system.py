"""Boot-time environment setup: Wayland/XWayland env detection and mouseinfo mock."""
import os
import sys
import types


def setup_xauth() -> None:
    """Auto-detect the XWayland auth cookie (its name changes each session)."""
    if os.environ.get("XAUTHORITY") and os.path.exists(os.environ["XAUTHORITY"]):
        return
    run_dir = f"/run/user/{os.getuid()}"
    try:
        for f in os.listdir(run_dir):
            if "xwaylandauth" in f.lower() or "mutter" in f.lower() or "xauth" in f.lower():
                os.environ["XAUTHORITY"] = os.path.join(run_dir, f)
                return
    except OSError:
        pass


def setup_wayland() -> None:
    """Auto-detect WAYLAND_DISPLAY and XDG_RUNTIME_DIR if not already set."""
    run_dir = f"/run/user/{os.getuid()}"
    os.environ.setdefault("XDG_RUNTIME_DIR", run_dir)
    if os.environ.get("WAYLAND_DISPLAY"):
        return
    try:
        for f in os.listdir(run_dir):
            if f.startswith("wayland-") and not f.endswith(".lock"):
                os.environ["WAYLAND_DISPLAY"] = f
                return
    except OSError:
        pass


def mock_mouseinfo() -> None:
    """Inject a stub mouseinfo module to prevent pyautogui from crashing on import."""
    stub = types.ModuleType("mouseinfo")
    stub.mouseInfo = lambda: None
    sys.modules.setdefault("mouseinfo", stub)


setup_xauth()
setup_wayland()
mock_mouseinfo()
