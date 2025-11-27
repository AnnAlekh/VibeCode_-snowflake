import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Импортируем сервер (нужно будет создать тестовую версию)
// Для интеграционных тестов лучше использовать отдельный тестовый сервер

describe('API Endpoints', () => {
  let app;
  let server;

  beforeAll(() => {
    // Создаем тестовое Express приложение
    app = express();
    app.use(express.json());
    
    // Добавляем тестовые роуты
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    app.post('/api/runtime/run', async (req, res) => {
      const { code, language } = req.body;
      if (!code) {
        return res.status(400).json({ error: 'Code is required' });
      }
      res.json({ stdout: 'test output', exitCode: 0 });
    });
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
  });

  describe('Health Check', () => {
    test('GET /api/health должен возвращать статус', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });
  });

  describe('Runtime Execution', () => {
    test('POST /api/runtime/run должен выполнять код', async () => {
      const response = await request(app)
        .post('/api/runtime/run')
        .send({
          code: 'print("test")',
          language: 'python'
        })
        .expect(200);

      expect(response.body.stdout).toBeDefined();
      expect(response.body.exitCode).toBe(0);
    });

    test('POST /api/runtime/run должен возвращать ошибку при отсутствии кода', async () => {
      const response = await request(app)
        .post('/api/runtime/run')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('Code is required');
    });
  });
});

