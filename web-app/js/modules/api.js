// API communication module
import { API_BASE } from './config.js';
import { logger, logAPI } from './logger.js';

// Утилита для fetch с таймаутом и обработкой ошибок
export async function fetchWithTimeout(url, options = {}, timeout = 120000) {
    const normalizeTimeout = (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : 120000;
    };

    const effectiveTimeout = normalizeTimeout(timeout);
    const method = options.method || 'GET';
    const endpoint = url.replace(API_BASE, '').replace(/^\//, '');
    let requestBody = null;
    try {
        requestBody = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : null;
    } catch (e) {
        requestBody = options.body;
    }
    
    const startTime = Date.now();
    logAPI(method, endpoint, requestBody, null, null);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        const duration = Date.now() - startTime;
        let responseData = null;
        
        // Try to parse response
        try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const text = await response.text();
                responseData = JSON.parse(text);
                // Recreate response for caller
                const newResponse = new Response(text, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });
                
                if (!response.ok) {
                    logAPI(method, endpoint, requestBody, responseData, new Error(`HTTP ${response.status}`));
                    throw new Error(`HTTP error! status: ${response.status}`);
                } else {
                    logAPI(method, endpoint, requestBody, responseData, null);
                }
                
                return newResponse;
            }
        } catch (e) {
            // If parsing fails, continue with original response
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorJson.message || errorMessage;
            } catch (e) {
                if (errorText) {
                    errorMessage = errorText.substring(0, 200);
                }
            }
            logAPI(method, endpoint, requestBody, { error: errorMessage }, new Error(errorMessage));
            throw new Error(errorMessage);
        }
        
        logAPI(method, endpoint, requestBody, { status: response.status, duration }, null);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        
        if (error.name === 'AbortError') {
            const timeoutSeconds = Math.max(1, Math.round(effectiveTimeout / 1000));
            const timeoutError = new Error(`Запрос превысил время ожидания (${timeoutSeconds}с). Попробуйте еще раз.`);
            logAPI(method, endpoint, requestBody, null, timeoutError);
            throw timeoutError;
        }
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            const networkError = new Error('Не удалось подключиться к серверу. Убедитесь, что backend запущен на http://localhost:3000');
            logAPI(method, endpoint, requestBody, null, networkError);
            throw networkError;
        }
        logAPI(method, endpoint, requestBody, null, error);
        throw error;
    }
}

export { API_BASE };

