# python3 scripts/check-qr.py /tmp/qr-cases.json  -> decodes each generated QR code with OpenCV
import json, sys, cv2, numpy as np
cases = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/qr-cases.json'))
det = cv2.QRCodeDetector(); det2 = cv2.QRCodeDetectorAruco(); bad = 0; fallback = 0
for c in cases:
    n = c['size'] + 8; s = 8
    img = np.full((n * s, n * s), 255, np.uint8)
    for y, row in enumerate(c['rows']):
        for x, ch in enumerate(row):
            if ch == '1': img[(y + 4) * s:(y + 5) * s, (x + 4) * s:(x + 5) * s] = 0
    txt, pts, _ = det.detectAndDecode(img)
    if txt != c['text']:                      # OpenCV's classic detector is picky about some layouts; try its second decoder
        txt, pts, _ = det2.detectAndDecode(img); fallback += txt == c['text']
    if txt != c['text']: bad += 1; print('FAIL', c['ecl'], 'len', c['len'], 'v', c['ver'], repr(txt[:30]))
print('decoded OK' if not bad else f'{bad} of {len(cases)} failed', f'({len(cases)} codes, {fallback} needed the second decoder)')
sys.exit(1 if bad else 0)
