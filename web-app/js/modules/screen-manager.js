// Screen navigation management module

export function setActiveScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        if (screen.id === screenId) {
            screen.classList.add('active');
        } else {
            screen.classList.remove('active');
        }
    });

    const hideChrome = screenId === 'admin-panel';
    document.querySelector('.progress-bar-container')?.classList.toggle('hidden', hideChrome);
    document.getElementById('status-notification')?.classList.toggle('hidden', hideChrome);
    document.getElementById('stage-indicator')?.classList.toggle('hidden', hideChrome);
}

