#!/bin/bash
cd "$(dirname "$0")"

echo "=== Диагностика окружения ==="
echo "Проверка Node.js:"
node --version || echo "❌ Node.js не установлен"

echo ""
echo "Проверка .env файла:"
if [ -f .env ]; then
    echo "✅ .env файл существует"
    if grep -q "QWEN_API_KEY\|OPENAI_API_KEY" .env; then
        echo "✅ API ключ найден в .env"
    else
        echo "⚠️  API ключ не найден в .env"
    fi
else
    echo "❌ .env файл не найден"
    echo "Создайте .env файл на основе example.env"
fi

echo ""
echo "Проверка зависимостей:"
if [ -d node_modules ]; then
    echo "✅ node_modules существует"
else
    echo "❌ node_modules не найден, запустите: npm install"
    exit 1
fi

echo ""
echo "=== Запуск сервера ==="
echo "Остановка старых процессов..."
pkill -f "node src/server.js" 2>/dev/null
sleep 1

echo "Запуск сервера..."
node src/server.js 2>&1 | tee server.log &
SERVER_PID=$!

sleep 3

if ps -p $SERVER_PID > /dev/null; then
    echo "✅ Сервер запущен (PID: $SERVER_PID)"
    echo "Логи сохраняются в server.log"
    echo "Проверка доступности..."
    sleep 2
    if curl -s http://localhost:3000/api/admin/overview > /dev/null 2>&1; then
        echo "✅ Сервер отвечает на http://localhost:3000"
    else
        echo "⚠️  Сервер запущен, но не отвечает. Проверьте server.log"
    fi
else
    echo "❌ Сервер не запустился. Проверьте server.log для ошибок"
    if [ -f server.log ]; then
        echo "Последние строки лога:"
        tail -20 server.log
    fi
fi

