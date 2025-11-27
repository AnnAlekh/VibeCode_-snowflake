#!/bin/bash

# Скрипт для запуска HTTP сервера для тестирования
# Решает проблему CORS при открытии через file://

PORT=${1:-8080}
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Запуск HTTP сервера для тестирования..."
echo "📁 Директория: $DIR"
echo "🌐 Порт: $PORT"
echo ""
echo "Откройте в браузере:"
echo "   http://localhost:$PORT/test-runner.html"
echo ""
echo "Для остановки нажмите Ctrl+C"
echo ""

cd "$DIR"

# Проверяем наличие Python
if command -v python3 &> /dev/null; then
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer $PORT
elif command -v php &> /dev/null; then
    php -S localhost:$PORT
else
    echo "❌ Ошибка: не найден Python или PHP для запуска HTTP сервера"
    echo "Установите Python: sudo apt-get install python3"
    exit 1
fi

