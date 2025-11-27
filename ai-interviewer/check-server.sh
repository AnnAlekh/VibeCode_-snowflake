#!/bin/bash
echo "=== Проверка сервера ==="
echo ""

# Проверка процесса
if ps aux | grep -q "[n]ode src/server.js"; then
    echo "✅ Процесс сервера запущен"
    ps aux | grep "[n]ode src/server.js" | grep -v grep
else
    echo "❌ Процесс сервера не найден"
fi

echo ""
echo "Проверка доступности API:"
if curl -s http://localhost:3000/api/admin/overview > /dev/null 2>&1; then
    echo "✅ Сервер отвечает на http://localhost:3000"
    echo ""
    echo "Ответ API:"
    curl -s http://localhost:3000/api/admin/overview | head -c 200
    echo ""
else
    echo "❌ Сервер не отвечает на http://localhost:3000"
    echo ""
    echo "Проверьте логи. Запустите сервер:"
    echo "  node src/server.js"
fi

