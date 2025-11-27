// Anti-cheat system module
import { interviewState, adminState } from './state.js';
import { API_BASE } from './api.js';
import { logAntiCheat } from './logger.js';

const antiCheatCooldown = {};

// Storage for anti-cheat event handlers
const antiCheatHandlers = {
    copy: null,
    paste: null,
    blur: null,
    visibilitychange: null,
    keydown: null
};

export function reportAntiCheatEvent(type, details = {}) {
    // If anti-cheat is disabled in candidate mode, ignore events
    if (!interviewState.antiCheatEnabled) {
        return;
    }

    const now = Date.now();
    if (antiCheatCooldown[type] && now - antiCheatCooldown[type] < 2000) {
        return;
    }
    antiCheatCooldown[type] = now;

    const event = {
        id: `client-${now}`,
        type,
        details,
        createdAt: new Date(now).toISOString()
    };
    interviewState.antiCheatEvents = [...(interviewState.antiCheatEvents || []), event].slice(-50);
    adminState.antiCheatEvents = [...(adminState.antiCheatEvents || []), event].slice(-50);
    
    logAntiCheat(type, details);

    fetch(`${API_BASE}/anti-cheat/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, details })
    }).catch(error => console.error('anti-cheat event', error));
}

export function setupAntiCheatTracking() {
    // Remove old handlers if they exist
    removeAntiCheatTracking();
    
    // Add handlers only if anti-cheat is enabled
    if (!interviewState.antiCheatEnabled) {
        return;
    }
    
    // Create handlers
    antiCheatHandlers.copy = () => reportAntiCheatEvent('clipboard-copy');
    antiCheatHandlers.paste = () => reportAntiCheatEvent('clipboard-paste');
    antiCheatHandlers.blur = () => reportAntiCheatEvent('window-blur');
    antiCheatHandlers.visibilitychange = () => {
        if (document.hidden) {
            reportAntiCheatEvent('tab-hidden');
        }
    };
    antiCheatHandlers.keydown = (event) => {
        const key = event.key.toLowerCase();
        if (key === 'f12' || (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key))) {
            reportAntiCheatEvent('devtools');
        }
    };
    
    // Add handlers
    document.addEventListener('copy', antiCheatHandlers.copy);
    document.addEventListener('paste', antiCheatHandlers.paste);
    window.addEventListener('blur', antiCheatHandlers.blur);
    document.addEventListener('visibilitychange', antiCheatHandlers.visibilitychange);
    window.addEventListener('keydown', antiCheatHandlers.keydown);
}

export function removeAntiCheatTracking() {
    // Remove all handlers if they were set
    if (antiCheatHandlers.copy) {
        document.removeEventListener('copy', antiCheatHandlers.copy);
        antiCheatHandlers.copy = null;
    }
    if (antiCheatHandlers.paste) {
        document.removeEventListener('paste', antiCheatHandlers.paste);
        antiCheatHandlers.paste = null;
    }
    if (antiCheatHandlers.blur) {
        window.removeEventListener('blur', antiCheatHandlers.blur);
        antiCheatHandlers.blur = null;
    }
    if (antiCheatHandlers.visibilitychange) {
        document.removeEventListener('visibilitychange', antiCheatHandlers.visibilitychange);
        antiCheatHandlers.visibilitychange = null;
    }
    if (antiCheatHandlers.keydown) {
        window.removeEventListener('keydown', antiCheatHandlers.keydown);
        antiCheatHandlers.keydown = null;
    }
}

export function updateAntiCheatStatus() {
    const statusEl = document.getElementById('anti-cheat-status');
    if (!statusEl) {
        // If element not created yet, try after small delay
        setTimeout(updateAntiCheatStatus, 100);
        return;
    }
    
    if (interviewState.antiCheatEnabled) {
        statusEl.textContent = 'античит включен';
        statusEl.className = 'anti-cheat-status enabled';
    } else {
        statusEl.textContent = 'античит выключен';
        statusEl.className = 'anti-cheat-status disabled';
    }
    console.log('Anti-cheat status updated:', interviewState.antiCheatEnabled);
}

export function handleAntiCheatToggle() {
    const checkbox = document.getElementById('antiCheatEnabled');
    if (!checkbox) return;
    
    interviewState.antiCheatEnabled = checkbox.checked;
    setupAntiCheatTracking(); // Re-setup handlers
    updateAntiCheatStatus();
    console.log('Anti-cheat toggled:', interviewState.antiCheatEnabled);
}

