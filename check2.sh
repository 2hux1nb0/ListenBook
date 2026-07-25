#!/usr/bin/env bash
rm -f /mnt/d/ShiZhe/ListenBook/test_api.sh /mnt/d/ShiZhe/ListenBook/test_api2.sh /mnt/d/ShiZhe/ListenBook/check.sh
echo cleaned
echo '=== media audio dir ==='
ls -la /mnt/d/ShiZhe/ListenBook/backend/media/episodes/audio/ 2>/dev/null || echo 'no audio dir'
echo '=== podcasts ==='
curl -s http://127.0.0.1:8000/api/podcasts/
echo
echo '=== episodes of podcast 1 (audio fields) ==='
curl -s 'http://127.0.0.1:8000/api/episodes/?podcast=1' | head -c 400
echo
