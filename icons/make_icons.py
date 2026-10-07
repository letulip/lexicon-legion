"""Regenerate PWA icons from icons/logo.svg (full-bleed, so one artwork serves normal + maskable).
macOS: uses qlmanage to rasterise, Pillow to resize.   python3 icons/make_icons.py"""
import os, subprocess, tempfile
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
def rasterize(svg, px=512):
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['qlmanage', '-t', '-s', str(px), '-o', tmp, svg], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return Image.open(os.path.join(tmp, os.path.basename(svg) + '.png')).convert('RGBA').copy()
base = rasterize(os.path.join(HERE, 'logo.svg'), 512)
for size, name in [(512, 'icon-512.png'), (512, 'icon-maskable-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png'), (32, 'favicon-32.png')]:
    base.resize((size, size), Image.LANCZOS).save(os.path.join(HERE, name))
print('icons regenerated')
