"""Server-side vote tracking — persists outcomes to votes.json and hours.json."""
import json
import threading
from datetime import datetime
from pathlib import Path

_ROOT       = Path(__file__).resolve().parent.parent.parent
_VOTES_PATH = _ROOT / "votes.json"
_HOURS_PATH = _ROOT / "hours.json"
_lock = threading.Lock()


def _today() -> str:
    return datetime.now().strftime('%Y-%m-%d')


def record_vote(outcome: str) -> None:
    from src.utils.streaming import broadcast
    key = _today()
    hour = datetime.now().hour
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

        hrs = {'date': key, 'h': [0] * 24}
        if _HOURS_PATH.exists():
            try:
                stored = json.loads(_HOURS_PATH.read_text())
                if stored.get('date') == key:
                    hrs = stored
            except Exception:
                pass
        if outcome == 'success':
            hrs['h'][hour] += 1
        _HOURS_PATH.write_text(json.dumps(hrs))

    broadcast('vote', json.dumps({'date': key, 's': day['s'], 'f': day['f'], 'hrs': hrs['h']}))


def get_votes() -> dict:
    if not _VOTES_PATH.exists():
        return {}
    try:
        return json.loads(_VOTES_PATH.read_text())
    except Exception:
        return {}


def get_hours() -> dict:
    if not _HOURS_PATH.exists():
        return {}
    try:
        return json.loads(_HOURS_PATH.read_text())
    except Exception:
        return {}
