# -*- coding: utf-8 -*-
import sys

# Check index.html for corruption
with open('/mnt/d/ShiZhe/ListenBook/index.html', 'rb') as f:
    raw = f.read()
text = raw.decode('utf-8', errors='replace')
print('index.html U+FFFD count:', text.count('\ufffd'))
print('membershipView in HTML:', 'id="membershipView"' in text)
print('membershipCurrent in HTML:', 'id="membershipCurrent"' in text)
print('pricingGrid in HTML:', 'id="pricingGrid"' in text)

# Check app.js
with open('/mnt/d/ShiZhe/ListenBook/js/app.js', 'r', encoding='utf-8') as f:
    js = f.read()
print('membershipView in JS:', 'membershipView' in js)
print('renderMembershipPage in JS:', 'renderMembershipPage' in js)
