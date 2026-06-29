"""Server-Sent Events broadcast and stdout tee for the /stream endpoint."""
import logging
import logging.handlers
import queue as _queue_mod
import sys
import threading
from collections import deque
from datetime import datetime
from pathlib import Path

_LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)
_file_handler = logging.handlers.TimedRotatingFileHandler(
    _LOG_DIR / "bpcp.log", when="midnight", backupCount=7, encoding="utf-8",
)
_file_handler.setFormatter(logging.Formatter("%(message)s"))
_file_logger = logging.getLogger("bpcp.stream")
_file_logger.addHandler(_file_handler)
_file_logger.setLevel(logging.DEBUG)
_file_logger.propagate = False

log_lock:    threading.Lock = threading.Lock()
log_history: deque          = deque(maxlen=2000)
log_queues:  list           = []


def broadcast(event: str, data: str) -> None:
    """Push an SSE message to every connected /stream client."""
    msg = f"event: {event}\ndata: {data}\n\n"
    with log_lock:
        dead = []
        for q in log_queues:
            try:
                q.put_nowait(msg)
            except _queue_mod.Full:
                dead.append(q)
        for q in dead:
            log_queues.remove(q)


class TeeStream:
    """Forward every print() both to the real stdout and to all SSE clients."""

    def __init__(self, orig):
        self._orig = orig
        self._buf  = ""

    def write(self, msg: str) -> int:
        self._orig.write(msg)
        self._buf += msg
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            clean = line.rstrip()
            if clean:
                ts    = datetime.now().strftime('%H:%M:%S')
                entry = f"[{ts}] {clean}"
                log_history.append(entry)
                broadcast("log", entry)
                _file_logger.info(entry)
        return len(msg)

    def flush(self):    self._orig.flush()
    def isatty(self):   return False
    def fileno(self):   return self._orig.fileno()


sys.stdout = TeeStream(sys.stdout)
