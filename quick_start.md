# ViveCode Snowflake — быстрый старт

## Вариант 1: Docker (рекомендуется)

1. **Настройте переменные окружения**
   ```bash
   cp .env.example .env
   # Отредактируйте .env и добавьте QWEN_API_KEY
   ```

2. **Запустите через Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Откройте в браузере**
   ```
   http://localhost:8080
   ```

Backend будет доступен на `http://localhost:3000`, Frontend на `http://localhost:8080`.

Подробнее: см. [DOCKER.md](DOCKER.md)

## Вариант 2: Локальный запуск

1. **Backend**
   ```bash
   cd ai-interviewer
   npm install
   cp example.env .env   # заполните QWEN_API_KEY и QWEN_API_BASE
   npm run server         # сервер запустится на http://localhost:3000
   ```

2. **Frontend**
   ```bash
   cd ../web-app
   python3 -m http.server 8080  # или используйте start-frontend.sh
   # Откройте http://localhost:8080 в браузере
   ```

3. Выберите уровень интервью (Junior/Middle/Senior) и следуйте сценарию.

## Тестирование полного цикла

```bash
# Из корневой директории проекта
node test-full-cycle.js
```

Тестирует работу системы для всех уровней: генерацию задач, анализ решений, оценку ответов, генерацию отчетов.

> Backend — Node.js сервер, фронтенд — статическая страница. Никакой сборки не требуется.




