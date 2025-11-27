// Configuration module
// API базовый URL - автоматически определяется в зависимости от окружения
// В Docker (порт 8081): использует относительный путь '/api' (проксируется через nginx на backend:3000)
// В локальной разработке (порт 8080): использует 'http://localhost:3000/api'
export const API_BASE = (typeof window !== 'undefined' && 
                  window.location.port === '8080' && 
                  window.location.hostname === 'localhost')
    ? 'http://localhost:3000/api'
    : '/api'; // Для Docker и других окружений используем прокси через nginx

