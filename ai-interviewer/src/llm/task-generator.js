import LLMClient from './llm-client.js';
import PROMPTS from '../prompts/interview-prompts.js';

class TaskGenerator {
  constructor(apiKey = null, options = {}) {
    this.llmClient = new LLMClient(apiKey, options);
  }

  async generateTask(params) {
    const { level = 'Junior', topic = 'algorithms', language = 'python' } = params;

    console.log(`Generating ${level}-level task for ${topic} in ${language}...`);

    const prompt = PROMPTS.generateTask(level, topic, language);

    try {
      const response = await this.llmClient.generateTask([
        {
          role: 'system',
          content: 'Создай задачу уровня ${level} по теме ${topic}. Верни ТОЛЬКО JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.7,
        max_tokens: 600 // Оптимизировано
      });

      // Валидация и дополнение задачи
      const enhancedTask = this.enhanceTask(response, level, topic, language);
      
      console.log(`Task generated successfully: ${enhancedTask.id}`);
      return enhancedTask;
    } catch (error) {
      console.error('Error generating task:', error);
      throw error;
    }
  }

  async generateTaskStream(params, onChunk) {
    const { 
      level = 'Middle', 
      topic = 'algorithms', 
      language = 'python',
      previousTask = null,
      candidatePerformance = null
    } = params;

    console.log(`Generating ${level}-level task with streaming...`);

    const prompt = PROMPTS.generateNextTask(level, topic, language, previousTask, candidatePerformance);

    let fullContent = '';

    try {
      // Используем streaming для real-time отображения
      await this.llmClient.chatStream(
        [
          {
            role: 'system',
            content: 'Создай задачу уровня ${level} по теме ${topic}. Верни ТОЛЬКО JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        (chunk, accumulated) => {
          fullContent = accumulated;
          if (onChunk) {
            onChunk(chunk, accumulated);
          }
        },
        {
          model: this.llmClient.models.taskStreaming,
          response_format: { type: 'json_object' },
          temperature: 0.7,
          max_tokens: 500 // Уменьшено для ускорения
        }
      );

      // Парсим JSON после завершения stream
      try {
        // Очищаем контент от возможных markdown блоков
        let jsonContent = fullContent.trim();
        
        // Удаляем markdown code blocks если есть
        jsonContent = jsonContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        
        // Пытаемся найти JSON объект в тексте
        const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
        }
        
        const task = JSON.parse(jsonContent);
        
        // Проверяем, что это правильный формат задачи
        if (!task.description && task.task) {
          // Если модель вернула другой формат, адаптируем
          task.description = task.task;
        }
        
        const enhancedTask = this.enhanceTask(task, level, topic, language);
        console.log(`Streaming task generated successfully: ${enhancedTask.id}`);
        return enhancedTask;
      } catch (parseError) {
        console.error('Error parsing streamed task JSON:', parseError.message);
        console.log('Raw content (first 500 chars):', fullContent.substring(0, 500));
        // Fallback: генерируем без streaming
        console.log('Falling back to non-streaming generation...');
        return await this.generateTask({ level, topic, language });
      }
    } catch (error) {
      console.error('Error in streaming generation:', error);
      // Fallback: генерируем без streaming
      return await this.generateTask({ level, topic, language });
    }
  }

  enhanceTask(task, level, topic, language) {
    // Поддержка разных форматов задачи
    if (!task) {
      throw new Error('Task is required');
    }
    
    // Нормализуем формат - если есть "task", используем его как "description"
    if (task.task && !task.description) {
      task.description = task.task;
    }
    
    if (!task.description && !task.task) {
      throw new Error('Task must have a description or task field');
    }

    // Генерируем уникальный ID
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Обработка requirements как constraints
    const constraints = task.constraints || task.requirements || [];
    
    // Обработка example как examples
    let examples = task.examples || [];
    if (task.example && examples.length === 0) {
      examples = [{ input: '', output: '', explanation: task.example }];
    }

    return {
      id: taskId,
      level,
      topic,
      language,
      description: task.description || task.task,
      examples: examples,
      constraints: constraints,
      hints: task.hints || (task.hint ? [task.hint] : []),
      visibleTestCases: task.visibleTestCases || this.generateDefaultTestCases(task),
      hiddenTestCases: this.generateHiddenTestCases(task, level),
      expectedComplexity: task.expectedComplexity || 'O(n)',
      estimatedTime: this.estimateTime(level),
      difficulty: task.difficulty || level,
      createdAt: new Date().toISOString(),
      // Сохраняем дополнительные поля
      starterCode: task.starterCode || null
    };
  }

  generateDefaultTestCases(task) {
    // Генерируем базовые тесты из examples, если visibleTestCases не предоставлены
    if (task.examples && task.examples.length > 0) {
      return task.examples.map(example => ({
        input: example.input,
        output: example.output
      }));
    }
    return [];
  }

  generateHiddenTestCases(task, level) {
    // Генерируем скрытые тесты (граничные случаи, большие данные)
    const hiddenTests = [];

    // Граничный случай
    hiddenTests.push({
      input: this.generateBoundaryInput(task),
      expectedOutput: null, // Вычисляется при проверке
      description: 'Boundary case test',
      type: 'boundary'
    });

    // Большие входные данные
    hiddenTests.push({
      input: this.generateLargeInput(task),
      expectedOutput: null,
      description: 'Large input performance test',
      type: 'performance'
    });

    // Edge cases для среднего и высокого уровня
    if (level === 'Middle' || level === 'Senior') {
      hiddenTests.push({
        input: this.generateEdgeCase(task),
        expectedOutput: null,
        description: 'Edge case test',
        type: 'edge_case'
      });
    }

    return hiddenTests;
  }

  generateBoundaryInput(task) {
    // Упрощенная генерация граничных значений
    // В реальной реализации нужен более сложный анализ constraints
    return {
      type: 'boundary',
      note: 'Boundary values based on constraints',
      // Конкретные значения будут генерироваться на основе constraints задачи
    };
  }

  generateLargeInput(task) {
    return {
      type: 'large',
      note: 'Large input for performance testing',
      size: 'max_constraint'
    };
  }

  generateEdgeCase(task) {
    return {
      type: 'edge',
      note: 'Edge case scenario',
    };
  }

  estimateTime(level) {
    const times = {
      'Junior': 15,
      'Middle': 30,
      'Senior': 45
    };
    return times[level] || 30;
  }
}

export default TaskGenerator;

