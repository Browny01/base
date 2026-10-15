#!/usr/bin/env python3
"""Package assets/icon.png into platform icon sizes; requires Pillow for release tooling only."""
from pathlib import Path
import json
from PIL import Image, ImageOps
root = Path(__file__).resolve().parents[1]
source = Image.open(root / 'assets/icon.png').convert('RGBA')
canvas = ImageOps.pad(source, (1024, 1024), method=Image.Resampling.LANCZOS, color=(0,0,0,0))
def save(relative, size, opaque=False):
    image=canvas.resize((size,size),Image.Resampling.LANCZOS)
    if opaque:
        background=Image.new('RGB',image.size,'#191918'); background.paste(image,mask=image.getchannel('A')); image=background
    image.save(root / relative, optimize=True)
for relative,size in [('public/base-icon-transparent.png',256),('public/base-icon-rounded.png',512),('public/icon-192.png',192),('public/icon-512.png',512),('app/icon.png',512),('app/apple-icon.png',180)]:
    save(relative,size)
icons=root/'apps/desktop/src-tauri/icons'
for name,size in [('icon.png',1024),('128x128@2x.png',256),('128x128.png',128),('64x64.png',64),('32x32.png',32)]: save(icons.relative_to(root)/name,size)
canvas.save(icons/'icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
canvas.save(icons/'icon.icns')
canvas.save(root/'public/favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64)])
for path in [root/'macos/Base/Assets.xcassets/AppIcon.appiconset', root/'ios/App/App/Assets.xcassets/AppIcon.appiconset']:
    for item in json.loads((path/'Contents.json').read_text())['images']:
        if 'filename' not in item: continue
        size=round(float(item['size'].split('x')[0])*float(item.get('scale','1x').removesuffix('x')))
        save(path.relative_to(root)/item['filename'],size,opaque=item.get('platform')=='ios')
assert Image.open(root/'public/icon-192.png').getextrema()[-1][0] == 0
print('Generated web, Tauri, macOS and iOS icons. Transparency retained; iOS uses its required opaque canvas.')
