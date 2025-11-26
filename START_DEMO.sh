#!/bin/bash

echo "🚀 Запуск демонстрации AI Interviewer Platform"
echo ""

# Проверка зависимостей
echo "📦 Проверка зависимостей..."
cd ai-interviewer
if [ ! -d "node_modules" ]; then
    echo "Установка зависимостей backend..."
    npm install
fi

cd ../electron-app
if [ ! -d "node_modules" ]; then
    echo "Установка зависимостей frontend..."
    npm install
fi

echo ""
echo "✅ Зависимости установлены"
echo ""

# Запуск backend
echo "🔧 Запуск backend сервера..."
cd ../ai-interviewer
npm run server &
BACKEND_PID=$!

# Ждем запуска сервера
sleep 3

# Запуск Electron
echo "🖥️  Запуск Electron приложения..."
cd ../electron-app
npm start

# Остановка backend при закрытии Electron
kill $BACKEND_PID 2>/dev/null

echo ""
echo "👋 Демонстрация завершена"
