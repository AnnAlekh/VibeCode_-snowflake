import TaskGenerator from './llm/task-generator.js';
import dotenv from 'dotenv';

dotenv.config();

async function testTaskGeneration() {
  console.log('=== Тест генерации задач с Qwen ===\n');

  // Инициализация генератора с Qwen API ключом
  const apiKey = process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY || 'sk-BGVwEPnw8EDCVFVWRPBNHA';
  
  // Проверяем, указан ли кастомный endpoint
  const baseURL = process.env.QWEN_API_BASE;
  const provider = process.env.LLM_PROVIDER || 'qwen';
  
  console.log('Конфигурация:');
  console.log('- Provider:', provider);
  console.log('- Base URL:', baseURL || 'по умолчанию (DashScope)');
  console.log('- API Key:', apiKey ? `${apiKey.substring(0, 15)}...` : 'не установлен');
  console.log('');

  const generator = new TaskGenerator(apiKey, {
    provider: provider,
    baseURL: baseURL
  });

  try {
    // Тест 1: Генерация базовой задачи Junior уровня
    console.log('1. Генерация Junior задачи...');
    console.log('Попытка подключения к Qwen API...\n');
    
    const juniorTask = await generator.generateTask({
      level: 'Junior',
      topic: 'arrays',
      language: 'python'
    });

    console.log('\n✅ Задача сгенерирована через Qwen API:');
    console.log('ID:', juniorTask.id);
    console.log('Уровень:', juniorTask.level);
    console.log('Тема:', juniorTask.topic);
    console.log('Язык:', juniorTask.language);
    console.log('\n📝 Описание задачи:');
    console.log(juniorTask.description);
    console.log('\n💡 Примеры:');
    juniorTask.examples.forEach((example, i) => {
      console.log(`\nПример ${i + 1}:`);
      console.log(`  Вход: ${example.input}`);
      console.log(`  Выход: ${example.output}`);
      if (example.explanation) {
        console.log(`  Объяснение: ${example.explanation}`);
      }
    });
    console.log('\n📋 Ограничения:');
    juniorTask.constraints.forEach((constraint, i) => {
      console.log(`  ${i + 1}. ${constraint}`);
    });
    console.log('\n✅ Видимые тесты:', juniorTask.visibleTestCases.length);
    console.log('🔒 Скрытые тесты:', juniorTask.hiddenTestCases.length);
    console.log('⏱️  Ожидаемое время решения:', juniorTask.estimatedTime, 'минут');
    console.log('📊 Ожидаемая сложность:', juniorTask.expectedComplexity);
    
    console.log('\n\n📄 Полная структура задачи:');
    console.log(JSON.stringify(juniorTask, null, 2));

    // Тест 2: Streaming генерация Middle задачи
    console.log('\n\n2. Streaming генерация Middle задачи...');
    let streamedContent = '';
    
    const middleTask = await generator.generateTaskStream({
      level: 'Middle',
      topic: 'algorithms',
      language: 'python',
      previousTask: juniorTask,
      candidatePerformance: { score: 85, timeSpent: 12000 }
    }, (chunk, accumulated) => {
      // Real-time отображение
      process.stdout.write(chunk);
      streamedContent = accumulated;
    });

    console.log('\n\n✅ Streaming задача сгенерирована:');
    console.log('ID:', middleTask.id);
    console.log('Уровень:', middleTask.level);
    console.log('Описание:', middleTask.description.substring(0, 100) + '...');

  } catch (error) {
    console.log('\n⚠️  Ошибка при генерации задачи');
    console.log('Тип ошибки:', error.constructor.name);
    console.log('Сообщение:', error.message);
    
    if (error.status === 401) {
      console.log('\n❌ Проблема с авторизацией (401)');
      console.log('\nВозможные причины:');
      console.log('1. Неверный API ключ для выбранного endpoint');
      console.log('2. Ключ от другого провайдера (не DashScope)');
      console.log('3. Нужен другой endpoint');
      console.log('\n💡 Решения:');
      console.log('- Проверьте правильность API ключа');
      console.log('- Если используете другой провайдер Qwen, укажите QWEN_API_BASE в .env');
      console.log('- Пример для локального Ollama: QWEN_API_BASE=http://localhost:11434/v1');
      console.log('- Пример для другого провайдера: QWEN_API_BASE=https://ваш-endpoint.com/v1');
    } else if (error.status === 403) {
      console.log('\n❌ Доступ запрещен (403)');
      console.log('Возможно, проблема с регионом или правами доступа');
    } else {
      console.log('\n❌ Другая ошибка:', error.status || 'неизвестно');
    }

    console.log('\n\n📋 Демонстрация работы системы с мок-данными:\n');
    
    // Демонстрация с мок-данными
    const mockTask = {
      id: 'task_1732591759000_mock123',
      level: 'Junior',
      topic: 'arrays',
      language: 'python',
      description: 'Напишите функцию, которая находит максимальный элемент в массиве.\n\nДан массив целых чисел. Необходимо найти и вернуть максимальный элемент.',
      examples: [
        {
          input: '[1, 3, 5, 2, 4]',
          output: '5',
          explanation: 'Максимальный элемент в массиве [1, 3, 5, 2, 4] равен 5'
        },
        {
          input: '[-1, -5, -3]',
          output: '-1',
          explanation: 'Максимальный элемент в массиве отрицательных чисел равен -1'
        }
      ],
      constraints: [
        '1 <= arr.length <= 1000',
        '-1000 <= arr[i] <= 1000',
        'Массив не пустой'
      ],
      visibleTestCases: [
        { input: '[1, 3, 5, 2, 4]', output: '5' },
        { input: '[-1, -5, -3]', output: '-1' },
        { input: '[10]', output: '10' }
      ],
      hiddenTestCases: [
        { input: { type: 'boundary' }, expectedOutput: null, description: 'Boundary case test', type: 'boundary' },
        { input: { type: 'large' }, expectedOutput: null, description: 'Large input performance test', type: 'performance' }
      ],
      expectedComplexity: 'O(n)',
      estimatedTime: 15
    };

    console.log('✅ Пример сгенерированной задачи (мок):');
    console.log('ID:', mockTask.id);
    console.log('Уровень:', mockTask.level);
    console.log('Тема:', mockTask.topic);
    console.log('Язык:', mockTask.language);
    console.log('\n📝 Описание задачи:');
    console.log(mockTask.description);
    console.log('\n💡 Примеры:');
    mockTask.examples.forEach((example, i) => {
      console.log(`\nПример ${i + 1}:`);
      console.log(`  Вход: ${example.input}`);
      console.log(`  Выход: ${example.output}`);
      console.log(`  Объяснение: ${example.explanation}`);
    });
    console.log('\n📋 Ограничения:');
    mockTask.constraints.forEach((constraint, i) => {
      console.log(`  ${i + 1}. ${constraint}`);
    });
    console.log('\n✅ Видимые тесты:', mockTask.visibleTestCases.length);
    console.log('🔒 Скрытые тесты:', mockTask.hiddenTestCases.length);
    console.log('\n⏱️  Ожидаемое время решения:', mockTask.estimatedTime, 'минут');
    console.log('📊 Ожидаемая сложность:', mockTask.expectedComplexity);
  }
}

// Запуск теста
testTaskGeneration();
