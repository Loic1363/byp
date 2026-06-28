"""CAPTCHA image preprocessing and EasyOCR-based text solving.

Preprocessing generates 8 image variants (contrast, threshold, sharpening, denoising)
so EasyOCR can vote across multiple representations of the same input.
"""
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

_reader = None

# Debug variants are written here when solve_captcha(save_debug=True) is used
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEBUG_DIR     = _PROJECT_ROOT / "assets" / "debug"


def get_reader():
    """Return the shared EasyOCR Reader, initialising it on first call."""
    global _reader
    if _reader is None:
        import easyocr   # lazy — PyTorch takes several seconds to load
        _reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    return _reader


def _load_image(image_input) -> np.ndarray:
    """Normalise any supported input type to a BGR numpy array."""
    if isinstance(image_input, str):
        return cv2.imread(image_input)
    if isinstance(image_input, bytes):
        arr = np.frombuffer(image_input, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if isinstance(image_input, Image.Image):
        return cv2.cvtColor(np.array(image_input.convert("RGB")), cv2.COLOR_RGB2BGR)
    if isinstance(image_input, np.ndarray):
        return image_input.copy()
    raise ValueError(f"Type d'image non supporté : {type(image_input)}")


def preprocess_image(image_input, save_debug: bool = False) -> list[np.ndarray]:
    """Upscale the input image and return 8 preprocessed variants for OCR.

    Each variant emphasises different image features to maximise the chance that
    at least one of them yields a clean OCR reading of the CAPTCHA text.
    """
    img   = _load_image(image_input)
    scale = 2.5
    img   = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))

    # Variant 1: CLAHE contrast enhancement on greyscale
    v1_clahe    = clahe.apply(gray)
    # Variant 2: global Otsu threshold
    _, v2_otsu  = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Variant 3: adaptive Gaussian threshold
    v3_adaptive = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    # Variant 4: HSV value channel + CLAHE
    hsv        = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    v4_v_clahe = clahe.apply(hsv[:, :, 2])
    # Variant 5: original colour image (no preprocessing)
    v5_color   = img

    # Variant 6: sharpen kernel + Otsu
    sharpen_k     = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    v6_sharp      = cv2.filter2D(gray, -1, sharpen_k)
    v6_sharp_otsu = cv2.threshold(v6_sharp, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    # Variant 7: bilateral filter (edge-preserving smoothing) + CLAHE
    v7_bilateral  = cv2.bilateralFilter(gray, 9, 75, 75)
    v7            = clahe.apply(v7_bilateral)
    # Variant 8: fast non-local means denoising + Otsu
    v8_denoised   = cv2.fastNlMeansDenoising(gray, h=10)
    v8            = cv2.threshold(v8_denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

    variants = [v1_clahe, v2_otsu, v3_adaptive, v4_v_clahe, v5_color,
                v6_sharp_otsu, v7, v8]

    if save_debug:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        names = ["v1_clahe", "v2_otsu", "v3_adaptive", "v4_hsv_v", "v5_color",
                 "v6_sharp_otsu", "v7_bilateral_clahe", "v8_denoise_otsu"]
        for name, v in zip(names, variants):
            cv2.imwrite(str(DEBUG_DIR / f"{name}.png"), v)
        print(f"  Variantes debug sauvegardées ({len(variants)}) → {DEBUG_DIR}/")

    return variants


def _clean_text(raw: str) -> str:
    """Strip non-alphanumeric characters and upper-case the result."""
    return re.sub(r'[^A-Za-z0-9]', '', raw).upper()


def solve_captcha(image_input, min_confidence: float = 0.2, save_debug: bool = False) -> str:
    """Solve a CAPTCHA image and return the best-scoring text candidate in uppercase.

    Runs EasyOCR over all 8 preprocessing variants.  Confidence scores for each
    unique text candidate are summed across variants; the candidate with the highest
    total score wins.

    Set save_debug=True to write the preprocessing variants to assets/debug/.
    """
    reader     = get_reader()
    variants   = preprocess_image(image_input, save_debug=save_debug)
    candidates: list[tuple[str, float]] = []

    for i, variant in enumerate(variants):
        results = reader.readtext(
            variant,
            allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            detail=1,
            paragraph=False,
        )
        for _, text, conf in results:
            cleaned = _clean_text(text)
            if cleaned and conf >= min_confidence:
                candidates.append((cleaned, conf))
                if save_debug:
                    print(f"    variante {i+1} → '{cleaned}'  conf={conf:.2f}")

    if not candidates:
        return ""

    # Sum confidences per unique candidate and pick the highest
    scores: dict[str, float] = {}
    for text, conf in candidates:
        scores[text] = scores.get(text, 0.0) + conf

    return max(scores, key=lambda t: scores[t])


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage : python -m src.solvers.captcha <chemin_image>")
        sys.exit(1)

    result = solve_captcha(sys.argv[1], save_debug=True)
    print(f"Texte détecté : {result}")
