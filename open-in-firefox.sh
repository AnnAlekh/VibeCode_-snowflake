#!/bin/bash

echo "🚀 Запуск AI Interviewer Platform в Firefox"
echo ""

# Проверка backend
echo "🔧 Проверка backend сервера..."
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "⚠️  Backend сервер не запущен"
    echo "Запускаю backend..."
    cd ai-interviewer
    npm run server > /tmp/backend.log 2>&1 &
    BACKEND_PID=$!
    echo "Backend запущен (PID: $BACKEND_PID)"
    sleep 3
    cd ..
else
    echo "✅ Backend сервер работает"
fi

# Открытие в Firefox
echo ""
echo "🌐 Открытие в Firefox..."
cd web-app

if command -v firefox > /dev/null; then
    firefox index.html &
    echo "✅ Firefox открыт"
else
    echo "❌ Firefox не найден"
    echo "Откройте файл вручную:"
    echo "  $(pwd)/index.html"
fi

echo ""
echo "✅ Готово! Проверьте окно Firefox"
