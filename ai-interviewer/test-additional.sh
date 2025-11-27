#!/bin/bash
cd "$(dirname "$0")"
echo "Запуск теста генерации дополнительных вопросов..."
node src/test-additional-questions.js

