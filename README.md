# VibeCode_-snowflake

## Быстрый запуск через Docker

1. Перейдите в корень проекта `vibecode jam`.
2. Остановите предыдущие контейнеры (если они запущены):
   ```bash
   docker compose down
   ```
3. Пересоберите образы, чтобы подтянуть актуальные изменения:
   ```bash
   docker compose build --no-cache
   ```
4. Запустите всю платформу:
   ```bash
   docker compose up -d
   ```
5. Проверьте статус сервисов:
   ```bash
   docker compose ps
   ```
   - backend: `http://localhost:3001` (проксирует порт 3000 контейнера)
   - frontend: `http://localhost:8081` (порт 80 контейнера)

## Версии используемых инструментов

- Docker `28.5.1` (build `e180ab8`)
- Docker Compose `v2.39.4-desktop.1`
- Node.js `v22.21.1`
- npm `10.9.4`
- Git `2.48.1`

Демонстрация и другое лежит в этой ссылке: https://drive.google.com/drive/folders/1Vo4KOkk8YdHYjUceThH28mtsEVRgv1v4?usp=sharing
