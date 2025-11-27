import SolutionAnalyzer from './llm/solution-analyzer.js';
import TaskGenerator from './llm/task-generator.js';
import dotenv from 'dotenv';

dotenv.config();

async function testAdditionalQuestions() {
  console.log('=== Тест генерации дополнительных технических вопросов ===\n');

  const apiKey = process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY;
  const analyzer = new SolutionAnalyzer(apiKey);
  const taskGenerator = new TaskGenerator(apiKey);

  try {
    // 1. Генерируем первую задачу
    console.log('📋 ЭТАП 1: Генерация первой задачи\n');
    const firstTask = await taskGenerator.generateTask({
      level: 'Junior',
      topic: 'arrays',
      language: 'python'
    });

    console.log(`✅ Задача сгенерирована:`);
    console.log(`ID: ${firstTask.id}`);
    console.log(`Описание: ${firstTask.description.substring(0, 100)}...\n`);

    // Симуляция решения
    const candidateCode1 = `def solution(arr):
    result = []
    for num in arr:
        if num > 0:
            result.append(num)
    return result`;

    const testResults1 = {
      visiblePassed: true,
      hiddenPassed: true,
      allPassed: true
    };

    // Анализ решения
    const analysis1 = await analyzer.analyze({
      code: candidateCode1,
      task: firstTask,
      testResults: testResults1,
      previousAttempts: 0
    });

    console.log(`\n📊 Анализ решения:`);
    console.log(`Правильность: ${analysis1.correctness}/100`);
    console.log(`Оптимальность: ${analysis1.optimality}/100`);
    console.log(`Временная сложность: ${analysis1.timeComplexity}`);
    console.log(`Пространственная сложность: ${analysis1.spaceComplexity}\n`);

    // 2. Генерируем первый технический вопрос
    console.log('\n💬 ЭТАП 2: Генерация первого технического вопроса\n');
    const firstQuestion = await analyzer.generateFollowUpQuestion({
      task: firstTask,
      solution: candidateCode1,
      testResults: testResults1,
      analysis: analysis1
    });

    console.log(`✅ Первый технический вопрос:`);
    console.log(firstQuestion);
    console.log('');

    // 3. Симулируем недостаточный ответ
    console.log('\n📝 ЭТАП 3: Симуляция недостаточного ответа\n');
    const insufficientAnswer = "Я использовал цикл."; // Очень короткий и неинформативный ответ

    console.log(`Ответ кандидата: "${insufficientAnswer}"\n`);

    // Оценка ответа
    const evaluation1 = await analyzer.evaluateAnswer({
      question: firstQuestion,
      answer: insufficientAnswer,
      solution: candidateCode1
    });

    console.log(`📊 Оценка ответа:`);
    console.log(`Общая оценка: ${evaluation1.score}/100`);
    console.log(`Понимание: ${evaluation1.understanding}/100`);
    console.log(`Коммуникация: ${evaluation1.communication}/100`);
    console.log(`Достаточен ли ответ: ${evaluation1.isSufficient ? 'Да' : 'Нет'}\n`);

    if (!evaluation1.isSufficient) {
      console.log('⚠️  Ответ недостаточен! Генерируем дополнительный вопрос...\n');
      
      // 4. Генерация дополнительного вопроса для первой задачи
      console.log('💬 ЭТАП 4: Генерация дополнительного технического вопроса (первая задача)\n');
      const additionalQuestion1 = await analyzer.generateAdditionalTechnicalQuestion({
        task: firstTask,
        solution: candidateCode1,
        previousQuestion: firstQuestion,
        previousAnswer: insufficientAnswer,
        analysis: analysis1,
        questionNumber: 1
      });

      console.log(`✅ Дополнительный технический вопрос:`);
      console.log(additionalQuestion1);
      console.log('');

      // 5. Симулируем более подробный ответ на дополнительный вопрос
      console.log('\n📝 ЭТАП 5: Симуляция ответа на дополнительный вопрос\n');
      const betterAnswer = "Мой алгоритм использует один проход по массиву, поэтому временная сложность O(n), где n - длина массива. Пространственная сложность также O(n), так как создается новый список для хранения результатов.";

      console.log(`Ответ кандидата: "${betterAnswer}"\n`);

      const evaluation2 = await analyzer.evaluateAnswer({
        question: additionalQuestion1,
        answer: betterAnswer,
        solution: candidateCode1
      });

      console.log(`📊 Оценка ответа на дополнительный вопрос:`);
      console.log(`Общая оценка: ${evaluation2.score}/100`);
      console.log(`Понимание: ${evaluation2.understanding}/100`);
      console.log(`Коммуникация: ${evaluation2.communication}/100`);
      console.log(`Достаточен ли ответ: ${evaluation2.isSufficient ? 'Да' : 'Нет'}\n`);
    }

    // 6. Тест для второй задачи
    console.log('\n\n' + '='.repeat(60));
    console.log('📋 ЭТАП 6: Тест для второй задачи\n');
    console.log('='.repeat(60) + '\n');

    const secondTask = await taskGenerator.generateTask({
      level: 'Middle',
      topic: 'algorithms',
      language: 'python'
    });

    console.log(`✅ Вторая задача сгенерирована:`);
    console.log(`ID: ${secondTask.id}`);
    console.log(`Описание: ${secondTask.description.substring(0, 100)}...\n`);

    const candidateCode2 = `def solution(arr):
    if not arr:
        return -1
    max_diff = -1
    min_val = arr[0]
    for i in range(1, len(arr)):
        if arr[i] > min_val:
            max_diff = max(max_diff, arr[i] - min_val)
        min_val = min(min_val, arr[i])
    return max_diff`;

    const testResults2 = {
      visiblePassed: true,
      hiddenPassed: true,
      allPassed: true
    };

    const analysis2 = await analyzer.analyze({
      code: candidateCode2,
      task: secondTask,
      testResults: testResults2,
      previousAttempts: 0
    });

    // Технический вопрос для второй задачи
    console.log('\n💬 Генерация технического вопроса для второй задачи\n');
    const technicalQuestion = await analyzer.generateTechnicalFollowUpQuestion({
      task: secondTask,
      solution: candidateCode2,
      testResults: testResults2,
      analysis: analysis2
    });

    console.log(`✅ Технический вопрос:`);
    console.log(technicalQuestion);
    console.log('');

    // Недостаточный ответ
    const insufficientAnswer2 = "Это O(n).";
    console.log(`\n📝 Недостаточный ответ: "${insufficientAnswer2}"\n`);

    const evaluation3 = await analyzer.evaluateAnswer({
      question: technicalQuestion,
      answer: insufficientAnswer2,
      solution: candidateCode2
    });

    console.log(`📊 Оценка: Понимание=${evaluation3.understanding}/100, Достаточен=${evaluation3.isSufficient ? 'Да' : 'Нет'}\n`);

    if (!evaluation3.isSufficient) {
      console.log('⚠️  Ответ недостаточен! Генерируем дополнительный вопрос...\n');
      
      const additionalQuestion2 = await analyzer.generateAdditionalTechnicalQuestion({
        task: secondTask,
        solution: candidateCode2,
        previousQuestion: technicalQuestion,
        previousAnswer: insufficientAnswer2,
        analysis: analysis2,
        questionNumber: 2
      });

      console.log(`✅ Дополнительный технический вопрос для второй задачи:`);
      console.log(additionalQuestion2);
      console.log('');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Тестирование генерации дополнительных вопросов завершено!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Ошибка при тестировании:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Запуск теста
testAdditionalQuestions();

