import SolutionAnalyzer from './llm/solution-analyzer.js';
import TaskGenerator from './llm/task-generator.js';
import dotenv from 'dotenv';

dotenv.config();

async function testSolutionAnalyzer() {
  console.log('=== Тест анализатора решений ===\n');

  const apiKey = process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY;
  const analyzer = new SolutionAnalyzer(apiKey);
  const taskGenerator = new TaskGenerator(apiKey);

  try {
    // 1. Генерируем задачу
    console.log('1. Генерация тестовой задачи...\n');
    const task = await taskGenerator.generateTask({
      level: 'Junior',
      topic: 'arrays',
      language: 'python'
    });

    console.log('✅ Задача сгенерирована:');
    console.log(`ID: ${task.id}`);
    console.log(`Описание: ${task.description.substring(0, 100)}...\n`);

    // 2. Примеры решений для тестирования
    const solutions = [
      {
        name: 'Правильное решение',
        code: `def filter_positive(arr):
    result = []
    for num in arr:
        if num > 0:
            result.append(num)
    return result`,
        testResults: {
          visiblePassed: true,
          hiddenPassed: true,
          allPassed: true
        }
      },
      {
        name: 'Решение с ошибкой (не учитывает 0)',
        code: `def filter_positive(arr):
    result = []
    for num in arr:
        if num >= 0:  # Ошибка: включает 0
            result.append(num)
    return result`,
        testResults: {
          visiblePassed: true,  // Может пройти видимые тесты
          hiddenPassed: false,   // Но не пройдет скрытые
          allPassed: false
        }
      },
      {
        name: 'Неоптимальное решение',
        code: `def filter_positive(arr):
    result = []
    for i in range(len(arr)):
        for j in range(i, len(arr)):  # Неоптимально: O(n²)
            if arr[j] > 0 and arr[j] not in result:
                result.append(arr[j])
    return result`,
        testResults: {
          visiblePassed: true,
          hiddenPassed: true,
          allPassed: true
        }
      }
    ];

    // 3. Анализ каждого решения
    for (let i = 0; i < solutions.length; i++) {
      const solution = solutions[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Решение ${i + 1}: ${solution.name}`);
      console.log(`${'='.repeat(60)}\n`);

      // Анализ решения
      console.log('📊 Анализ решения...\n');
      const analysis = await analyzer.analyze({
        code: solution.code,
        task: task,
        testResults: solution.testResults,
        previousAttempts: 0
      });

      console.log('\n✅ Результаты анализа:');
      console.log(`Правильность: ${analysis.correctness}/100`);
      console.log(`Оптимальность: ${analysis.optimality}/100`);
      console.log(`Качество кода: ${analysis.codeQuality}/100`);
      console.log(`Общая оценка: ${analysis.overallScore}/100`);
      console.log(`\nВременная сложность: ${analysis.timeComplexity}`);
      console.log(`Пространственная сложность: ${analysis.spaceComplexity}`);
      
      console.log(`\n💬 Фидбек:`);
      console.log(analysis.feedback);
      
      if (analysis.strengths.length > 0) {
        console.log(`\n✅ Сильные стороны:`);
        analysis.strengths.forEach((strength, idx) => {
          console.log(`  ${idx + 1}. ${strength}`);
        });
      }
      
      if (analysis.weaknesses.length > 0) {
        console.log(`\n⚠️  Слабые стороны:`);
        analysis.weaknesses.forEach((weakness, idx) => {
          console.log(`  ${idx + 1}. ${weakness}`);
        });
      }
      
      if (analysis.suggestions.length > 0) {
        console.log(`\n💡 Предложения:`);
        analysis.suggestions.forEach((suggestion, idx) => {
          console.log(`  ${idx + 1}. ${suggestion}`);
        });
      }

      // Если есть ошибки, анализируем их
      if (!solution.testResults.allPassed && solution.testResults.visiblePassed) {
        console.log(`\n\n🔍 Анализ ошибок...\n`);
        const errorAnalysis = await analyzer.analyzeError({
          code: solution.code,
          task: task,
          failedTests: [
            {
              description: 'Hidden test case',
              type: 'boundary',
              input: '[0, -1, 1]',
              expectedOutput: '[1]',
              actualOutput: '[0, 1]'
            }
          ],
          visiblePassed: true
        });

        console.log(`Тип ошибки: ${errorAnalysis.errorType}`);
        console.log(`\n📝 Объяснение:`);
        console.log(errorAnalysis.explanation);
        console.log(`\n💡 Подсказка для исправления:`);
        console.log(errorAnalysis.suggestedFix);
      }

      // Генерация вопроса о решении
      if (solution.testResults.allPassed) {
        console.log(`\n\n💬 Генерация вопроса о решении...\n`);
        const question = await analyzer.generateFollowUpQuestion({
          task: task,
          solution: solution.code,
          testResults: solution.testResults
        });

        console.log(`Вопрос интервьюера:`);
        console.log(question);

        // Симуляция ответа кандидата
        const candidateAnswer = "Я использовал простой цикл для фильтрации положительных элементов. Сложность O(n) по времени и O(n) по памяти.";
        
        console.log(`\nОтвет кандидата: ${candidateAnswer}`);
        console.log(`\n📝 Оценка ответа...\n`);

        const answerEvaluation = await analyzer.evaluateAnswer({
          question: question,
          answer: candidateAnswer,
          solution: solution.code
        });

        console.log(`Оценка ответа: ${answerEvaluation.score}/100`);
        console.log(`Понимание: ${answerEvaluation.understanding}/100`);
        console.log(`Коммуникация: ${answerEvaluation.communication}/100`);
        console.log(`\nФидбек:`);
        console.log(answerEvaluation.feedback);
      }
    }

    console.log(`\n\n${'='.repeat(60)}`);
    console.log('✅ Тестирование анализатора завершено!');
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('\n❌ Ошибка при тестировании:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Запуск теста
testSolutionAnalyzer();

