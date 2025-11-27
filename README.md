# VibeCode_-snowflake

Перейди в корень проекта vibecode jam.

Останови старые контейнеры (если нужно): docker compose down.

Пересобери образы (при необходимости обновления): docker compose build --no-cache.

Запусти всю платформу: docker compose up -d.

Проверь статус: docker compose ps (backend слушает http://localhost:3001, frontend — http://localhost:8081).


Актуальные версии ключевых инструментов в этой среде:

Docker 28.5.1 (build e180ab8)

Docker Compose v2.39.4-desktop.1

Node.js v22.21.1

npm 10.9.4

Git 2.48.1
