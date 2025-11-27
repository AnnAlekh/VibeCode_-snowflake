// Инициализация кастомных скроллбаров
function initializeCustomScrollbars() {
    initializeScrollbarForElement('task-view');
    initializeScrollbarForElement('chat-messages');
}

function initializeScrollbarForElement(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const verticalScrollbar = element.querySelector('.custom-scrollbar-vertical');
    const horizontalScrollbar = element.querySelector('.custom-scrollbar-horizontal');
    const verticalThumb = verticalScrollbar?.querySelector('.scrollbar-thumb');
    const horizontalThumb = horizontalScrollbar?.querySelector('.scrollbar-thumb');
    const verticalTrack = verticalScrollbar?.querySelector('.scrollbar-track');
    const horizontalTrack = horizontalScrollbar?.querySelector('.scrollbar-track');

    if (!verticalScrollbar || !horizontalScrollbar) return;

    let isDraggingVertical = false;
    let isDraggingHorizontal = false;

    function updateScrollbars() {
        // Вертикальный скроллбар
        const scrollTop = element.scrollTop;
        const scrollHeight = element.scrollHeight;
        const clientHeight = element.clientHeight;
        
        if (scrollHeight > clientHeight) {
            const thumbHeight = Math.max((clientHeight / scrollHeight) * 100, 10);
            const thumbPosition = (scrollTop / scrollHeight) * 100;
            
            verticalThumb.style.height = thumbHeight + '%';
            verticalThumb.style.top = thumbPosition + '%';
            verticalScrollbar.style.opacity = '1';
        } else {
            verticalScrollbar.style.opacity = '0';
        }

        // Горизонтальный скроллбар
        const scrollLeft = element.scrollLeft;
        const scrollWidth = element.scrollWidth;
        const clientWidth = element.clientWidth;
        
        if (scrollWidth > clientWidth) {
            const thumbWidth = Math.max((clientWidth / scrollWidth) * 100, 10);
            const thumbPosition = (scrollLeft / scrollWidth) * 100;
            
            horizontalThumb.style.width = thumbWidth + '%';
            horizontalThumb.style.left = thumbPosition + '%';
            horizontalScrollbar.style.opacity = '1';
        } else {
            horizontalScrollbar.style.opacity = '0';
        }
    }

    // Обработчики для вертикального скроллбара
    verticalThumb.addEventListener('mousedown', (e) => {
        isDraggingVertical = true;
        verticalThumb.classList.add('active');
        e.preventDefault();
    });

    // Обработчики для горизонтального скроллбара
    horizontalThumb.addEventListener('mousedown', (e) => {
        isDraggingHorizontal = true;
        horizontalThumb.classList.add('active');
        e.preventDefault();
    });

    // Обработчик перемещения мыши
    document.addEventListener('mousemove', (e) => {
        if (isDraggingVertical) {
            const trackRect = verticalTrack.getBoundingClientRect();
            const clickY = e.clientY - trackRect.top;
            const trackHeight = trackRect.height;
            const thumbHeight = verticalThumb.offsetHeight;
            const newTop = Math.max(0, Math.min(clickY - thumbHeight / 2, trackHeight - thumbHeight));
            const scrollPercentage = newTop / (trackHeight - thumbHeight);
            
            element.scrollTop = scrollPercentage * (element.scrollHeight - element.clientHeight);
        }
        
        if (isDraggingHorizontal) {
            const trackRect = horizontalTrack.getBoundingClientRect();
            const clickX = e.clientX - trackRect.left;
            const trackWidth = trackRect.width;
            const thumbWidth = horizontalThumb.offsetWidth;
            const newLeft = Math.max(0, Math.min(clickX - thumbWidth / 2, trackWidth - thumbWidth));
            const scrollPercentage = newLeft / (trackWidth - thumbWidth);
            
            element.scrollLeft = scrollPercentage * (element.scrollWidth - element.clientWidth);
        }
    });

    // Обработчик отпускания мыши
    document.addEventListener('mouseup', () => {
        isDraggingVertical = false;
        isDraggingHorizontal = false;
        verticalThumb.classList.remove('active');
        horizontalThumb.classList.remove('active');
    });

    // Обновление при скролле
    element.addEventListener('scroll', updateScrollbars);
    
    // Обновление при изменении размера
    const resizeObserver = new ResizeObserver(updateScrollbars);
    resizeObserver.observe(element);

    // Инициализация
    updateScrollbars();
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', initializeCustomScrollbars);