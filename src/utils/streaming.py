"""Server-Sent Events broadcast and stdout tee for the /stream endpoint."""
import queue as _queue_mod
import sys
import threading
from collections import deque
from datetime import datetime

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
        return len(msg)

    def flush(self):    self._orig.flush()
    def isatty(self):   return False
    def fileno(self):   return self._orig.fileno()


sys.stdout = TeeStream(sys.stdout)
