#!/usr/bin/env python3
"""Genera el QR y el volante para pedir reseñas en Google.

Uso (desde la raíz del repo):  python3 scripts/volante-resena.py
Requiere: pip install qrcode pillow
Salida: resenas/qr/qr-resena-google.png, volante-resena-google.png y .pdf
"""
import math
import os

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

REVIEW_URL = "https://g.page/r/CTICTiD1vviIECE/review"
OUT = "resenas/qr"
W, H = 1800, 2700
PURPLE = (108, 43, 217)
PINK = (236, 72, 153)
LILAC = (243, 232, 255)
INK = (30, 27, 46)
MUTED = (85, 80, 105)
GOLD = (251, 188, 5)

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(size, bold=False):
    try:
        return ImageFont.truetype(BOLD if bold else FONT, size)
    except OSError:
        # Sin DejaVu (macOS/Windows): fuente básica de Pillow para no fallar
        try:
            return ImageFont.load_default(size)  # Pillow 10.1 o más nuevo
        except TypeError:
            return ImageFont.load_default()


def center_text(draw, y, text, f, fill):
    w = draw.textlength(text, font=f)
    draw.text(((W - w) / 2, y), text, font=f, fill=fill)


def star(draw, cx, cy, r, fill):
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rad = r if i % 2 == 0 else r * 0.42
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    draw.polygon(pts, fill=fill)


def make_qr(size):
    """QR de como máximo `size` px, con cada cuadrito del mismo tamaño exacto."""
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=1, border=4)
    qr.add_data(REVIEW_URL)
    qr.make(fit=True)
    qr.box_size = size // (qr.modules_count + 2 * qr.border)
    return qr.make_image(fill_color=PURPLE, back_color="white").convert("RGB")


def main():
    os.makedirs(OUT, exist_ok=True)

    # QR suelto, para usar en otros diseños
    make_qr(820).save(f"{OUT}/qr-resena-google.png")

    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    # Encabezado con degradado morado → rosa
    head_h = 620
    for x in range(W):
        t = x / (W - 1)
        c = tuple(round(PURPLE[i] + (PINK[i] - PURPLE[i]) * t) for i in range(3))
        d.line([(x, 0), (x, head_h)], fill=c)

    logo = Image.open("images/logo_estefani_amza_white.png").convert("RGBA")
    lw = 680
    logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    img.paste(logo, ((W - lw) // 2, 60), logo)

    center_text(d, 340, "¿Cómo fue tu experiencia?", font(92, True), "white")
    center_text(d, 470, "Cuéntanos en Google", font(54), "white")

    # Estrellas
    for i in range(5):
        star(d, W / 2 + (i - 2) * 150, 760, 62, GOLD)

    # QR con marco
    qs = 900
    qx, qy = (W - qs) // 2, 880
    d.rounded_rectangle([qx - 50, qy - 50, qx + qs + 50, qy + qs + 50], radius=40, outline=PURPLE, width=8, fill="white")
    q = make_qr(qs)
    img.paste(q, (qx + (qs - q.width) // 2, qy + (qs - q.height) // 2))

    center_text(d, qy + qs + 90, "Escanea con la cámara de tu celular", font(56, True), INK)

    # Pasos
    by = qy + qs + 200
    d.rounded_rectangle([90, by, W - 90, by + 470], radius=36, fill=LILAC)
    steps = [
        "1.  Abre la cámara y apunta al código",
        "2.  Toca el enlace que aparece",
        "3.  Elige tus estrellas y cuéntanos tu experiencia",
    ]
    sy = by + 60
    for s in steps:
        d.text((170, sy), s, font=font(48), fill=INK)
        sy += 95
    center_text(d, sy + 20, "¡Solo toma un minuto y nos ayuda a mejorar!", font(46, True), PURPLE)

    # Pie
    center_text(d, H - 230, "Gracias por confiar en nosotros", font(62, True), PURPLE)
    center_text(d, H - 135, "Sierravista 133, Lindavista  ·  WhatsApp 55 7354 1129", font(42), MUTED)
    center_text(d, H - 75, "Instagram: @dra.estefaniamza", font(40), MUTED)

    img.save(f"{OUT}/volante-resena-google.png")
    img.save(f"{OUT}/volante-resena-google.pdf", resolution=300)
    print("Listo:", OUT)


if __name__ == "__main__":
    main()
