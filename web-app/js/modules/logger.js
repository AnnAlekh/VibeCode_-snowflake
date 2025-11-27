// Comprehensive logging module for system testing
// Logs all user actions, system responses, API calls, and state changes

class SystemLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000; // Keep last 1000 logs
        this.enabled = true;
        this.startTime = Date.now();
        this.sessionId = `session-${Date.now()}`;
        
        // Initialize log storage
        this.loadLogs();
        
        // Auto-save logs periodically
        setInterval(() => this.saveLogs(), 5000);
        
        // Save logs on page unload
        window.addEventListener('beforeunload', () => this.saveLogs());
        
        this.log('system', 'Logger initialized', { sessionId: this.sessionId });
    }

    log(category, message, data = null, level = 'info') {
        if (!this.enabled) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            timeSinceStart: Date.now() - this.startTime,
            sessionId: this.sessionId,
            category, // 'user-action', 'system', 'api', 'state', 'error', 'ui'
            level, // 'info', 'success', 'warning', 'error'
            message,
            data: data ? JSON.parse(JSON.stringify(data)) : null // Deep clone
        };

        this.logs.push(logEntry);
        
        // Keep only last maxLogs entries
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Console output with formatting
        const emoji = this.getEmoji(level);
        const categoryColor = this.getCategoryColor(category);
        console.log(
            `%c${emoji} [${category.toUpperCase()}] ${message}`,
            `color: ${categoryColor}; font-weight: bold;`,
            data || ''
        );

        // Update UI if log viewer is visible
        this.updateLogViewer(logEntry);

        return logEntry;
    }

    getEmoji(level) {
        const emojis = {
            'info': 'ℹ️',
            'success': '✅',
            'warning': '⚠️',
            'error': '❌'
        };
        return emojis[level] || '📝';
    }

    getCategoryColor(category) {
        const colors = {
            'user-action': '#4ec9b0',
            'system': '#569cd6',
            'api': '#ce9178',
            'state': '#9cdcfe',
            'error': '#f48771',
            'ui': '#dcdcaa',
            'anti-cheat': '#c586c0'
        };
        return colors[category] || '#cccccc';
    }

    // Specific logging methods for different categories
    logUserAction(action, details = null) {
        return this.log('user-action', `User action: ${action}`, details, 'info');
    }

    logSystemEvent(event, details = null) {
        return this.log('system', `System event: ${event}`, details, 'info');
    }

    logAPI(method, endpoint, request = null, response = null, error = null) {
        const data = {
            method,
            endpoint,
            request,
            response,
            error: error ? error.message : null,
            status: error ? 'error' : 'success'
        };
        return this.log('api', `API ${method} ${endpoint}`, data, error ? 'error' : 'success');
    }

    logStateChange(component, oldState = null, newState = null) {
        return this.log('state', `State change: ${component}`, { oldState, newState }, 'info');
    }

    logError(error, context = null) {
        return this.log('error', `Error: ${error.message || error}`, { 
            error: error.toString(), 
            stack: error.stack,
            context 
        }, 'error');
    }

    logUI(component, action, details = null) {
        return this.log('ui', `UI ${component}: ${action}`, details, 'info');
    }

    logAntiCheat(event, details = null) {
        return this.log('anti-cheat', `Anti-cheat event: ${event}`, details, 'warning');
    }

    // Export logs
    exportLogs(format = 'json') {
        const exportData = {
            sessionId: this.sessionId,
            startTime: new Date(this.startTime).toISOString(),
            endTime: new Date().toISOString(),
            totalLogs: this.logs.length,
            logs: this.logs
        };

        if (format === 'json') {
            return JSON.stringify(exportData, null, 2);
        } else if (format === 'text') {
            return this.logs.map(log => 
                `[${log.timestamp}] [${log.category.toUpperCase()}] ${log.message}${log.data ? ' | ' + JSON.stringify(log.data) : ''}`
            ).join('\n');
        }
    }

    downloadLogs(format = 'json') {
        const content = this.exportLogs(format);
        const blob = new Blob([content], { 
            type: format === 'json' ? 'application/json' : 'text/plain' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `system-logs-${this.sessionId}-${Date.now()}.${format === 'json' ? 'json' : 'txt'}`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.log('system', 'Logs downloaded', { format });
    }

    clearLogs() {
        this.logs = [];
        this.log('system', 'Logs cleared');
        this.saveLogs();
    }

    getLogs(filter = null) {
        if (!filter) return this.logs;
        
        return this.logs.filter(log => {
            if (filter.category && log.category !== filter.category) return false;
            if (filter.level && log.level !== filter.level) return false;
            if (filter.search && !log.message.toLowerCase().includes(filter.search.toLowerCase())) return false;
            return true;
        });
    }

    // Save logs to localStorage
    saveLogs() {
        try {
            const data = {
                sessionId: this.sessionId,
                logs: this.logs.slice(-500), // Keep last 500 in localStorage
                timestamp: Date.now()
            };
            localStorage.setItem('systemLogs', JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save logs:', e);
        }
    }

    // Load logs from localStorage
    loadLogs() {
        try {
            const saved = localStorage.getItem('systemLogs');
            if (saved) {
                const data = JSON.parse(saved);
                // Only load if same session or recent
                if (data.sessionId === this.sessionId || (Date.now() - data.timestamp < 3600000)) {
                    this.logs = data.logs || [];
                }
            }
        } catch (e) {
            console.error('Failed to load logs:', e);
        }
    }

    // Update log viewer UI
    updateLogViewer(logEntry) {
        const viewer = document.getElementById('log-viewer-content');
        if (!viewer) return;

        const logElement = document.createElement('div');
        logElement.className = `log-entry log-${logEntry.category} log-${logEntry.level}`;
        logElement.innerHTML = `
            <span class="log-time">${new Date(logEntry.timestamp).toLocaleTimeString()}</span>
            <span class="log-category">[${logEntry.category}]</span>
            <span class="log-message">${logEntry.message}</span>
            ${logEntry.data ? `<span class="log-data">${JSON.stringify(logEntry.data).substring(0, 100)}</span>` : ''}
        `;

        viewer.appendChild(logElement);
        
        // Auto-scroll if at bottom
        if (viewer.scrollHeight - viewer.scrollTop < viewer.clientHeight + 100) {
            viewer.scrollTop = viewer.scrollHeight;
        }

        // Keep only last 200 entries in UI
        while (viewer.children.length > 200) {
            viewer.removeChild(viewer.firstChild);
        }
    }

    // Get statistics
    getStats() {
        const stats = {
            totalLogs: this.logs.length,
            byCategory: {},
            byLevel: {},
            errors: this.logs.filter(l => l.level === 'error').length,
            warnings: this.logs.filter(l => l.level === 'warning').length,
            sessionDuration: Date.now() - this.startTime
        };

        this.logs.forEach(log => {
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
        });

        return stats;
    }
}

// Create singleton instance
export const logger = new SystemLogger();

// Export convenience functions
export function logUserAction(action, details) {
    return logger.logUserAction(action, details);
}

export function logSystemEvent(event, details) {
    return logger.logSystemEvent(event, details);
}

export function logAPI(method, endpoint, request, response, error) {
    return logger.logAPI(method, endpoint, request, response, error);
}

export function logStateChange(component, oldState, newState) {
    return logger.logStateChange(component, oldState, newState);
}

export function logError(error, context) {
    return logger.logError(error, context);
}

export function logUI(component, action, details) {
    return logger.logUI(component, action, details);
}

export function logAntiCheat(event, details) {
    return logger.logAntiCheat(event, details);
}

// Make logger available globally for debugging
if (typeof window !== 'undefined') {
    window.systemLogger = logger;
}

