#!/bin/bash
cd /mnt/d/ShiZhe/ListenBook

# Get token
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('access',''))")

echo "Token length: ${#TOKEN}"

# Get membership status
echo "Testing membership status endpoint..."
curl -s -m 10 -w "HTTP_CODE:%{http_code}\n" \
  http://127.0.0.1:8000/api/membership/status/ \
  -H "Authorization: Bearer $TOKEN"
