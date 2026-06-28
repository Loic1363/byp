#!/usr/bin/env bash
set -e

# Trouve le cookie XWayland (fichiers cachés)
XAUTH_FILE=$(ls -a /run/user/$(id -u)/ 2>/dev/null | grep -i -E "mutter|xwaylandauth|xauth" | head -1)
if [ -n "$XAUTH_FILE" ]; then
    export XAUTHORITY="/run/user/$(id -u)/$XAUTH_FILE"
    echo "XAUTHORITY=$XAUTHORITY"
fi

xhost +local: 2>/dev/null || true

source "$(dirname "$0")/.venv/bin/activate"
python3 "$(dirname "$0")/app.py"
