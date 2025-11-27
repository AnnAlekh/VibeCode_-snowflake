#!/bin/bash
cd "$(dirname "$0")"

# Остановка старого процесса
echo "Остановка старых процессов..."
pkill -f "node.*server.js" 2>/dev/null
sleep 1

# Запуск сервера
echo "Запуск backend сервера на порту 3000..."
echo "Логи будут в server.log"
echo ""

node src/server.js > server.log 2>&1 &
SERVER_PID=$!

sleep 2

# Проверка
if ps -p $SERVER_PID > /dev/null 2>&1; then
    echo "✅ Сервер запущен (PID: $SERVER_PID)"
    echo "Проверьте логи: tail -f server.log"
    echo "Или откройте: http://localhost:3000/api/admin/overview"
else
    echo "❌ Сервер не запустился. Проверьте server.log:"
    tail -20 server.log 2>/dev/null || echo "Лог файл не создан"
fi

