import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import TaskGenerator from '../../llm/task-generator.js';

describe('Task Generator', () => {
  let taskGenerator;
  let mockLLMClient;

  beforeEach(() => {
    taskGenerator = new TaskGenerator('test-api-key');
    mockLLMClient = {
      chatJSON: jest.fn(),
      chatStream: jest.fn(),
      chat: jest.fn(),
      generateTask: jest.fn(), // TaskGenerator использует generateTask
      models: {
        taskStreaming: 'test-model',
        taskGeneration: 'test-model'
      }
    };
    taskGenerator.llmClient = mockLLMClient;
  });

  describe('enhanceTask', () => {
    test('должен добавлять ID к задаче', () => {
      const task = { description: 'Test task' };
      const enhanced = taskGenerator.enhanceTask(task, 'Junior', 'algorithms', 'python');

      expect(enhanced.id).toBeDefined();
      expect(enhanced.id).toMatch(/^task_\d+_/);
    });

    test('должен устанавливать уровень задачи', () => {
      const task = { description: 'Test' };
      const enhanced = taskGenerator.enhanceTask(task, 'Middle', 'algorithms', 'python');

      expect(enhanced.level).toBe('Middle');
    });

    test('должен устанавливать тему и язык', () => {
      const task = { description: 'Test' };
      const enhanced = taskGenerator.enhanceTask(task, 'Junior', 'data-structures', 'javascript');

      expect(enhanced.topic).toBe('data-structures');
      expect(enhanced.language).toBe('javascript');
    });
  });

  describe('generateTask', () => {
    test('должен генерировать задачу через LLM', async () => {
      const mockTask = {
        description: 'Test task description',
        requirements: ['req1', 'req2'],
        examples: [{ input: 'test', output: 'result' }]
      };

      // generateTask использует llmClient.generateTask
      mockLLMClient.generateTask.mockResolvedValue(mockTask);

      const result = await taskGenerator.generateTask({
        level: 'Junior',
        topic: 'algorithms',
        language: 'python'
      });

      expect(result.description).toBe('Test task description');
      expect(result.id).toBeDefined();
      expect(mockLLMClient.generateTask).toHaveBeenCalled();
    });

    test('должен обрабатывать ошибки генерации', async () => {
      mockLLMClient.generateTask.mockRejectedValue(new Error('API Error'));

      await expect(taskGenerator.generateTask({
        level: 'Junior',
        topic: 'algorithms',
        language: 'python'
      })).rejects.toThrow('API Error');
    });
  });

  describe('generateTaskStream', () => {
    test('должен генерировать задачу через stream', async () => {
      const mockTask = {
        description: 'Streamed task',
        requirements: []
      };
      const mockStreamContent = JSON.stringify(mockTask);

      // chatStream вызывается с (messages, onChunk, options)
      // где onChunk вызывается как onChunk(chunk, accumulated)
      mockLLMClient.chatStream.mockImplementation(async (messages, onChunk, options) => {
        // Симулируем stream - вызываем onChunk несколько раз
        if (onChunk) {
          onChunk('{"description":', '{"description":');
          onChunk(' "Streamed task"', '{"description": "Streamed task"');
          onChunk(', "requirements": []}', mockStreamContent);
        }
        // Возвращаем полный контент
        return mockStreamContent;
      });

      const chunks = [];
      const result = await taskGenerator.generateTaskStream({
        level: 'Middle',
        topic: 'algorithms',
        language: 'python'
      }, (chunk) => chunks.push(chunk));

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(mockLLMClient.chatStream).toHaveBeenCalled();
    });

    test('должен парсить JSON из stream', async () => {
      const mockTask = { description: 'Test', requirements: [] };
      const jsonContent = JSON.stringify(mockTask);
      
      mockLLMClient.chatStream.mockImplementation(async (messages, onChunk, options) => {
        if (onChunk) {
          onChunk(jsonContent, jsonContent);
        }
        return jsonContent;
      });

      const result = await taskGenerator.generateTaskStream({
        level: 'Junior',
        topic: 'algorithms',
        language: 'python'
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      // enhanceTask может изменить структуру, проверяем что задача создана
      expect(result.description || result.task).toBeDefined();
    });

    test('должен обрабатывать ошибки парсинга JSON', async () => {
      // Симулируем ошибку парсинга - chatStream возвращает невалидный JSON
      mockLLMClient.chatStream.mockResolvedValue('invalid json');

      // Должен fallback на обычную генерацию через generateTask
      // generateTask возвращает объект задачи (не JSON строку)
      mockLLMClient.generateTask.mockResolvedValue({
        description: 'Fallback task',
        requirements: [],
        examples: []
      });

      const result = await taskGenerator.generateTaskStream({
        level: 'Junior',
        topic: 'algorithms',
        language: 'python'
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.description).toBe('Fallback task');
    });
  });
});

