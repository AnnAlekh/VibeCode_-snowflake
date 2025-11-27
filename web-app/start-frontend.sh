#!/bin/bash
cd "$(dirname "$0")"

echo "=== Запуск фронтенда ==="
echo ""

# Остановка старого процесса
echo "Остановка старых процессов на порту 8080..."
pkill -f "python.*http.server.*8080" 2>/dev/null
pkill -f "http-server.*8080" 2>/dev/null
sleep 1

# Проверка Python
if command -v python3 &> /dev/null; then
    echo "✅ Python3 найден"
    echo "Запуск HTTP сервера на порту 8080..."
    echo ""
    echo "🌐 Фронтенд доступен по адресу:"
    echo "   http://localhost:8080"
    echo ""
    echo "Нажмите Ctrl+C для остановки"
    echo ""
    python3 -m http.server 8080
elif command -v python &> /dev/null; then
    echo "✅ Python найден"
    echo "Запуск HTTP сервера на порту 8080..."
    echo ""
    echo "🌐 Фронтенд доступен по адресу:"
    echo "   http://localhost:8080"
    echo ""
    echo "Нажмите Ctrl+C для остановки"
    echo ""
    python -m http.server 8080
else
    echo "❌ Python не найден!"
    echo ""
    echo "Альтернативные способы запуска:"
    echo "1. Откройте index.html напрямую в браузере:"
    echo "   firefox index.html"
    echo ""
    echo "2. Установите http-server:"
    echo "   npm install -g http-server"
    echo "   http-server -p 8080"
    exit 1
fi

