// Utility functions module

// Утилиты
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function formatDuration(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) {
        return '-';
    }
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
}

export function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

