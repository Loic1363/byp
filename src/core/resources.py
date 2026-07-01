"""RAM monitoring — /proc/meminfo, no display dependency."""
import threading

RAM_WARN_MB     = 300
RAM_CRITICAL_MB = 150
CHECK_INTERVAL  = 20


def get_free_ram_mb() -> int:
    try:
        for line in open("/proc/meminfo"):
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) // 1024
    except Exception:
        pass
    return -1


class ResourceMonitor:
    def __init__(self):
        self._stop   = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="resource-monitor"
        )
        self._thread.start()
        print("  [ressources] Moniteur RAM démarré")

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        while not self._stop.is_set():
            self._stop.wait(timeout=CHECK_INTERVAL)
            if self._stop.is_set():
                break
            self._check()

    def _check(self) -> None:
        from src.core.status import launch_stop

        ram = get_free_ram_mb()
        if ram == -1:
            return

        if ram < RAM_CRITICAL_MB:
            print(f"  [ressources] RAM critique : {ram} Mo libre — arrêt du cycle")
            launch_stop.set()
        elif ram < RAM_WARN_MB:
            print(f"  [ressources] RAM faible : {ram} Mo libre")


_monitor = ResourceMonitor()
