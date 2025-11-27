.PHONY: help build up down restart logs clean test

help: ## Показать справку
	@echo "Доступные команды:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Собрать Docker образы
	docker-compose build

up: ## Запустить контейнеры
	docker-compose up -d

down: ## Остановить контейнеры
	docker-compose down

restart: ## Перезапустить контейнеры
	docker-compose restart

logs: ## Показать логи
	docker-compose logs -f

logs-backend: ## Показать логи backend
	docker-compose logs -f backend

logs-frontend: ## Показать логи frontend
	docker-compose logs -f frontend

status: ## Показать статус контейнеров
	docker-compose ps

clean: ## Остановить и удалить контейнеры, сети, образы
	docker-compose down -v --rmi all

rebuild: clean build up ## Полная пересборка

test: ## Запустить тесты полного цикла
	node test-full-cycle.js

test-coverage: ## Запустить тесты покрытия по критериям оценивания
	node test-evaluation-coverage.js

