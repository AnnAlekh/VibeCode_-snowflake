#!/bin/bash
cd "$(dirname "$0")"

echo "=== Создание ветки admin_panel и пуш изменений ==="
echo ""

# Проверка статуса
echo "1. Проверка статуса git..."
git status --short
echo ""

# Создание новой ветки
echo "2. Создание ветки admin_panel..."
git checkout -b admin_panel 2>/dev/null || git checkout admin_panel
echo "✅ Ветка admin_panel создана/переключена"
echo ""

# Добавление всех изменений
echo "3. Добавление всех изменений..."
git add -A
echo "✅ Изменения добавлены"
echo ""

# Коммит
echo "4. Создание коммита..."
git commit -m "добавлена админка"
echo "✅ Коммит создан"
echo ""

# Пуш в удаленный репозиторий
echo "5. Отправка ветки в удаленный репозиторий..."
git push -u origin admin_panel
echo ""

echo "✅ Готово! Ветка admin_panel запушена в удаленный репозиторий"
echo ""
echo "Текущая ветка:"
git branch --show-current

