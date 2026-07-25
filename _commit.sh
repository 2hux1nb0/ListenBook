#!/bin/bash
BASE=/mnt/d/ShiZhe/ListenBook
cd $BASE
rm -f _check.sh _final_check.sh _git_commit.sh _grep.sh _rename.sh _studio_debug.sh _fix_admin.py
git add -A
git commit -m "fix: restore db, rename ListenLeap->ListenBook globally, reset admin password

- Recreate db.sqlite3 with migrate + seed_data (git clean had wiped it)
- Reset admin password to admin123456 (seed used admin123)
- Global sed replace: ListenLeap -> ListenBook across all files
  (html, js, css, md, py, svg)
- Django server verified: studio login, admin podcasts 200, subtitles present"
git push
