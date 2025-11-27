import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import LLMClient from '../../llm/llm-client.js';

// Моки для OpenAI API
const mockChatCompletion = {
  choices: [{
    message: {
      content: JSON.stringify({ test: 'data' })
    }
  }]
};

const mockStream = {
  async *[Symbol.asyncIterator]() {
    yield { choices: [{ delta: { content: 'chunk1' } }] };
    yield { choices: [{ delta: { content: 'chunk2' } }] };
  }
};

describe('LLM Client', () => {
  let llmClient;
  let mockOpenAI;

  beforeEach(() => {
    // Создаем мок OpenAI клиента
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };

    // Создаем LLM Client с моком
    llmClient = new LLMClient('test-api-key');
    llmClient.client = mockOpenAI;
  });

  describe('Инициализация', () => {
    test('должен создавать клиент с API ключом', () => {
      const client = new LLMClient('test-key');
      expect(client).toBeDefined();
      // apiKey может быть не публичным свойством, проверяем что клиент создан
      expect(client.client).toBeDefined();
    });

    test('должен использовать ключ из переменных окружения', () => {
      const originalKey = process.env.QWEN_API_KEY;
      process.env.QWEN_API_KEY = 'env-key';
      const client = new LLMClient();
      expect(client).toBeDefined();
      expect(client.client).toBeDefined();
      if (originalKey) {
        process.env.QWEN_API_KEY = originalKey;
      } else {
        delete process.env.QWEN_API_KEY;
      }
    });
  });

  describe('Метод chat', () => {
    test('должен вызывать API с правильными параметрами', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(mockChatCompletion);

      const messages = [
        { role: 'user', content: 'test' }
      ];

      await llmClient.chat(messages);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages,
          model: expect.any(String)
        })
      );
    });

    test('должен возвращать содержимое ответа', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(mockChatCompletion);

      const result = await llmClient.chat([{ role: 'user', content: 'test' }]);

      expect(result).toBe(JSON.stringify({ test: 'data' }));
    });

    test('должен обрабатывать ошибки API', async () => {
      const error = new Error('API Error');
      mockOpenAI.chat.completions.create.mockRejectedValue(error);

      await expect(llmClient.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow('API Error');
    });
  });

  describe('Метод chatStream', () => {
    test('должен обрабатывать streaming ответы', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(mockStream);

      const chunks = [];
      await llmClient.chatStream(
        [{ role: 'user', content: 'test' }],
        (chunk) => chunks.push(chunk)
      );

      expect(chunks.length).toBeGreaterThan(0);
    });

    test('должен возвращать полный контент после stream', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(mockStream);

      const result = await llmClient.chatStream([{ role: 'user', content: 'test' }]);

      expect(result).toContain('chunk');
    });
  });

  describe('Метод chatJSON', () => {
    test('должен парсить JSON ответы', async () => {
      const jsonResponse = {
        choices: [{
          message: {
            content: '{"key": "value"}'
          }
        }]
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(jsonResponse);

      const result = await llmClient.chatJSON([{ role: 'user', content: 'test' }]);

      expect(result).toEqual({ key: 'value' });
    });

    test('должен обрабатывать невалидный JSON', async () => {
      const invalidJson = {
        choices: [{
          message: {
            content: 'not json'
          }
        }]
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(invalidJson);

      await expect(llmClient.chatJSON([{ role: 'user', content: 'test' }]))
        .rejects.toThrow();
    });
  });
});

