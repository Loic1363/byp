"""Server-side vote tracking — persists outcomes to votes.json."""
import json
import threading
from datetime import datetime
from pathlib import Path

_VOTES_PATH = Path(__file__).resolve().parent.parent.parent / "votes.json"
_lock = threading.Lock()


def _today() -> str:
    return datetime.now().strftime('%Y-%m-%d')


def record_vote(outcome: str) -> None:
    from src.utils.streaming import broadcast
    key = _today()
    with _lock:
        data = {}
        if _VOTES_PATH.exists():
            try:
                data = json.loads(_VOTES_PATH.read_text())
            except Exception:
                pass
        day = data.get(key, {'s': 0, 'f': 0})
        if outcome == 'success':
            day['s'] += 1
        else:
            day['f'] += 1
        data[key] = day
        _VOTES_PATH.write_text(json.dumps(data))
    broadcast('vote', json.dumps({'date': key, 's': day['s'], 'f': day['f']}))


def get_votes() -> dict:
    if not _VOTES_PATH.exists():
        return {}
    try:
        return json.loads(_VOTES_PATH.read_text())
    except Exception:
        return {}
