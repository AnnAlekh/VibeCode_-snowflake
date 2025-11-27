FROM node:20-alpine

WORKDIR /app

# Устанавливаем wget для healthcheck и python3 для выполнения кода
RUN apk add --no-cache wget python3 py3-pip

# Копируем package файлы
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY src/ ./src/

# Создаем директорию для данных (если её нет)
RUN mkdir -p src/data && \
    touch src/data/.gitkeep

# Открываем порт
EXPOSE 3000

# Переменные окружения по умолчанию
ENV NODE_ENV=production
ENV PORT=3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/admin/overview || exit 1

# Запускаем сервер
CMD ["node", "src/server.js"]

