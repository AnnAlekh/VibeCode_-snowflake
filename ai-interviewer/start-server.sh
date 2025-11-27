#!/bin/bash
cd "$(dirname "$0")"
pkill -f "node src/server.js" 2>/dev/null
sleep 1
echo "Запуск backend сервера..."
node src/server.js

