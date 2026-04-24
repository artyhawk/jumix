#!/usr/bin/env python3
"""
Placeholder assets для Jumix mobile. Brand orange bg + white 'J'.
Replace с dizayner'скими asset'ами перед M8 store submission.

Sizes:
  icon.png          — 1024x1024 (Apple + Google standard master)
  splash.png        — 2048x2048 (centered, resize'ится по aspect automatically)
  adaptive-icon.png — 1024x1024 (Android foreground — брендованный круг
                      composites на backgroundColor из app.json)
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

BRAND = (249, 123, 16)  # #F97B10
LAYER0 = (10, 10, 11)   # #0A0A0B
WHITE = (255, 255, 255)

FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ASSETS = Path(__file__).parent.parent / "assets"
ASSETS.mkdir(exist_ok=True)


def draw_letter(img: Image.Image, letter: str, color: tuple[int, int, int], font_size: int):
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = draw.textbbox((0, 0), letter, font=font, anchor="lt")
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (img.width - text_w) // 2 - bbox[0]
    y = (img.height - text_h) // 2 - bbox[1]
    draw.text((x, y), letter, font=font, fill=color)


def make_icon(path: Path, size: int, bg: tuple[int, int, int], letter_color: tuple[int, int, int]):
    img = Image.new("RGBA", (size, size), (*bg, 255))
    draw_letter(img, "J", letter_color, int(size * 0.6))
    img.save(path, "PNG")
    print(f"  ✓ {path.relative_to(ASSETS.parent)} ({size}×{size})")


def main():
    print("Generating placeholder assets…")
    # 1) icon.png — главная иконка app
    make_icon(ASSETS / "icon.png", 1024, BRAND, WHITE)

    # 2) adaptive-icon.png — Android foreground, композитится на bg из app.json
    make_icon(ASSETS / "adaptive-icon.png", 1024, BRAND, WHITE)

    # 3) splash.png — splash screen (dark theme)
    make_icon(ASSETS / "splash.png", 2048, LAYER0, BRAND)

    print("Done. Replace перед store submission (M8).")


if __name__ == "__main__":
    main()
