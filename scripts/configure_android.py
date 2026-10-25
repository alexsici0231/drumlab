#!/usr/bin/env python3
"""Configure generated Capacitor 8 Android project: microphone, API 36, icons."""
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from PIL import Image

repo=Path(__file__).resolve().parents[1]
android=repo/'android'
manifest=android/'app/src/main/AndroidManifest.xml'
if not manifest.is_file():
    raise SystemExit('Run npx cap add android before configure_android.py')
content=manifest.read_text(encoding='utf-8')
for permission in ['android.permission.RECORD_AUDIO','android.permission.MODIFY_AUDIO_SETTINGS']:
    if permission not in content:
        content=content.replace('<application',f'<uses-permission android:name="{permission}" />\n    <application',1)
if 'android.hardware.microphone' not in content:
    content=content.replace('<application','<uses-feature android:name="android.hardware.microphone" android:required="false" />\n    <application',1)
manifest.write_text(content,encoding='utf-8')
ET.parse(manifest)
variables=(android/'variables.gradle').read_text(encoding='utf-8')
for key in ['compileSdkVersion','targetSdkVersion']:
    found=re.search(r'\b'+key+r'\s*=\s*(\d+)',variables)
    if not found or int(found.group(1))!=36:
        raise SystemExit(f'{key} must be 36, got {found.group(1) if found else "missing"}')
logo=Image.open(repo/'icons'/'icon-512.png').convert('RGBA')
for bucket,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    dst=android/f'app/src/main/res/mipmap-{bucket}'
    dst.mkdir(parents=True,exist_ok=True)
    art=logo.resize((size,size),Image.Resampling.LANCZOS)
    art.save(dst/'ic_launcher.png')
    art.save(dst/'ic_launcher_round.png')
for bucket,size in [('mdpi',108),('hdpi',162),('xhdpi',216),('xxhdpi',324),('xxxhdpi',432)]:
    dst=android/f'app/src/main/res/mipmap-{bucket}'
    dst.mkdir(parents=True,exist_ok=True)
    safe=Image.new('RGBA',(size,size),(0,0,0,0))
    inner=logo.resize((int(size*.64),int(size*.64)),Image.Resampling.LANCZOS)
    safe.alpha_composite(inner,((size-inner.width)//2,(size-inner.height)//2))
    safe.save(dst/'ic_launcher_foreground.png')
print('API 36 / microphone permissions / launcher icons OK')
