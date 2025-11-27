#!/bin/sh
cd /home/ann/PROGECTS_MY/vibecode\ jam
git checkout -b admin_panel 2>/dev/null || git checkout admin_panel
git add -A
git commit -m "добавлена админка"
git push -u origin admin_panel

