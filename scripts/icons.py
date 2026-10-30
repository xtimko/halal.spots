# Делает иконки для «На экран Домой» из одной картинки.
# Запуск: python3 scripts/icons.py path/to/icon.png
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BG = (242, 242, 247)  # фон под прозрачные места: iOS заливает прозрачность чёрным


def square(img):
    w, h = img.size
    side = min(w, h)
    return img.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))


def flat(img, size, pad=0.0):
    canvas = Image.new("RGB", (size, size), BG)
    inner = round(size * (1 - 2 * pad))
    pic = img.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(pic, (off, off), pic)
    return canvas


src = square(Image.open(sys.argv[1]).convert("RGBA"))
flat(src, 180).save(ROOT / "apple-touch-icon.png", optimize=True)
flat(src, 192).save(ROOT / "icon-192.png", optimize=True)
flat(src, 512).save(ROOT / "icon-512.png", optimize=True)
# Android обрезает иконку кругом/«каплей» — оставляем поля, чтобы рисунок не срезался
flat(src, 512, pad=0.1).save(ROOT / "icon-maskable-512.png", optimize=True)
flat(src, 32).save(ROOT / "favicon.png", optimize=True)
print("ok")
