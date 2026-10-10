"""Prints the app version on the icon's cheek, under its left eye, and writes every icon size to public/.

The clean artwork is kept here (base-dark.png, base-light.png, 512 px, never stamped); run this after every version bump:
    python3 scripts/icon/stamp-icons.py
It also writes public/icon-version.txt, which a test compares with package.json so a forgotten stamp fails the tests.
"""
import json
import pathlib
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PUBLIC = ROOT / "public"
FONT = HERE / "Fredoka.ttf"  # rounded bold sans, as the user's 1.0.4 example (variable font, set to Bold below)

# Where the number sits on the 512 px artwork: centred under the viewer's left eye, sloping down to the right like the user's 1.0.4 example.
CENTRE = (186, 288)
ANGLE = -32  # degrees (PIL turns counter-clockwise, so negative slopes it down to the right)
SIZE = 32  # px, the font size (digits about 22 px tall)
INK = (22, 20, 20, 255)
SUPER = 4  # drawn this many times larger and scaled down, for smooth edges


def stamp(base: Image.Image, text: str) -> Image.Image:
    font = ImageFont.truetype(str(FONT), SIZE * SUPER)
    font.set_variation_by_axes([700, 100])  # weight, width
    box = font.getbbox(text)
    w, h = box[2] - box[0], box[3] - box[1]
    pad = 20 * SUPER
    layer = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((pad - box[0], pad - box[1]), text, font=font, fill=INK)
    layer = layer.rotate(ANGLE, resample=Image.BICUBIC, expand=True)
    layer = layer.resize((layer.width // SUPER, layer.height // SUPER), Image.LANCZOS)
    out = base.convert("RGBA")
    out.alpha_composite(layer, (CENTRE[0] - layer.width // 2, CENTRE[1] - layer.height // 2))
    return out.convert("RGB")


def main() -> None:
    version = json.loads((ROOT / "package.json").read_text())["version"]
    for suffix, base in (("", "base-dark.png"), ("-light", "base-light.png")):
        icon = stamp(Image.open(HERE / base), version)
        for name, size in (("pwa-512", 512), ("pwa-192", 192), ("apple-touch-icon", 180), ("favicon", 64)):
            icon.resize((size, size), Image.LANCZOS).save(PUBLIC / f"{name}{suffix}.png", optimize=True)
    (PUBLIC / "icon-version.txt").write_text(version + "\n")
    print(f"icons stamped with {version}")


if __name__ == "__main__":
    main()
