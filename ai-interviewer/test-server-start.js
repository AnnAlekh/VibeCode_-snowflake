import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

console.log('=== Тест запуска сервера ===\n');

// Проверка переменных окружения
console.log('Проверка переменных окружения:');
const apiKey = process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY;
if (apiKey) {
  console.log('✅ API ключ найден');
} else {
  console.log('❌ API ключ не найден (QWEN_API_KEY или OPENAI_API_KEY)');
}

// Проверка импортов
console.log('\nПроверка импортов:');
try {
  console.log('Импорт express...');
  const app = express();
  console.log('✅ Express импортирован');
  
  console.log('Импорт TaskGenerator...');
  const TaskGenerator = (await import('./llm/task-generator.js')).default;
  console.log('✅ TaskGenerator импортирован');
  
  console.log('Импорт SolutionAnalyzer...');
  const SolutionAnalyzer = (await import('./llm/solution-analyzer.js')).default;
  console.log('✅ SolutionAnalyzer импортирован');
  
  console.log('Импорт LevelAssessor...');
  const LevelAssessor = (await import('./core/level-assessor.js')).default;
  console.log('✅ LevelAssessor импортирован');
  
  console.log('Импорт AdaptiveTaskSelector...');
  const AdaptiveTaskSelector = (await import('./core/adaptive-selector.js')).default;
  console.log('✅ AdaptiveTaskSelector импортирован');
  
  console.log('Импорт ReportGenerator...');
  const ReportGenerator = (await import('./llm/report-generator.js')).default;
  console.log('✅ ReportGenerator импортирован');
  
  console.log('Импорт code-executor...');
  const { runCodeInSandbox } = await import('./runtime/code-executor.js');
  console.log('✅ code-executor импортирован');
  
  // Попытка создать экземпляры
  console.log('\nСоздание экземпляров:');
  const taskGenerator = new TaskGenerator(apiKey);
  console.log('✅ TaskGenerator создан');
  
  const solutionAnalyzer = new SolutionAnalyzer(apiKey);
  console.log('✅ SolutionAnalyzer создан');
  
  const levelAssessor = new LevelAssessor(apiKey);
  console.log('✅ LevelAssessor создан');
  
  const adaptiveSelector = new AdaptiveTaskSelector(apiKey);
  console.log('✅ AdaptiveTaskSelector создан');
  
  const reportGenerator = new ReportGenerator(apiKey);
  console.log('✅ ReportGenerator создан');
  
  console.log('\n✅ Все проверки пройдены! Сервер должен запуститься.');
  
} catch (error) {
  console.error('\n❌ Ошибка при проверке:');
  console.error('Сообщение:', error.message);
  console.error('Стек:', error.stack);
  process.exit(1);
}

