#!/usr/bin/env bash
set -e

echo "=== Installation des dépendances système ==="
sudo apt-get update -qq
sudo apt-get install -y \
    python3-pip \
    python3-venv \
    python3-dev \
    libgl1 \
    libglib2.0-0 \
    xclip \
    xdg-utils \
    scrot

PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "=== Création du virtualenv ==="
python3 -m venv "$PROJ_DIR/.venv"

echo ""
echo "=== Activation et installation des packages Python ==="
source "$PROJ_DIR/.venv/bin/activate"

pip install --upgrade pip wheel

# numpy < 2 pour compatibilité easyocr
pip install "numpy<2"
pip install flask pillow mss pyautogui
pip install opencv-python-headless
pip install easyocr

echo ""
echo "=== Installation terminée ==="
echo "Pour lancer le projet :"
echo "  bash $PROJ_DIR/run.sh"
