document.addEventListener('DOMContentLoaded', function() {
    const modalOverlay = document.getElementById('modal-overlay');
    const openModalBtn = document.getElementById('open-modal-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    let currentStage = 0;
    const totalStages = 6;
    
    // Восстанавливаем данные из localStorage или инициализируем новые
    let stageTimes = JSON.parse(localStorage.getItem('stageTimes')) || Array(totalStages).fill(0);
    let stageStatuses = JSON.parse(localStorage.getItem('stageStatuses')) || Array(totalStages).fill('pending'); // 'pending', 'active', 'completed'
    let savedCurrentStage = parseInt(localStorage.getItem('currentStage')) || 0;
    
    let timers = Array(totalStages).fill(null);
    
    // Функция для сохранения состояния в localStorage
    function saveState() {
        localStorage.setItem('stageTimes', JSON.stringify(stageTimes));
        localStorage.setItem('stageStatuses', JSON.stringify(stageStatuses));
        localStorage.setItem('currentStage', currentStage.toString());
    }
    
    // Открытие модального окна
    openModalBtn.addEventListener('click', function() {
        modalOverlay.classList.add('active');
        restoreStages();
    });
    
    // Закрытие модального окна
    closeModalBtn.addEventListener('click', function() {
        modalOverlay.classList.remove('active');

        // останавливаем таймеры
        stopAllTimers();
        saveState(); 
    });
    
    // Закрытие модального окна при клике вне его
    modalOverlay.addEventListener('click', function(e) {
        if (e.target === modalOverlay) {
            modalOverlay.classList.remove('active');

            //останавливаем таймеры
            stopAllTimers();
            saveState(); 
        }
    });
    
    // Переход к следующему этапу
    nextBtn.addEventListener('click', function() {
        if (currentStage < totalStages) {
            // Завершаем текущий этап
            if (currentStage > 0) {
                completeStage(currentStage);
            }
            
            // Переходим к следующему этапу
            currentStage++;
            
            if (currentStage <= totalStages) {
                activateStage(currentStage);
            }
            
            updateButtons();
            saveState();
        } else if (currentStage === totalStages) {
            // Если это последний этап, завершаем его и закрываем модальное окно
            completeStage(currentStage);
            modalOverlay.classList.remove('active');
            stopAllTimers();
            saveState();
        }
    });
    
    // Переход к предыдущему этапу
    prevBtn.addEventListener('click', function() {
        if (currentStage > 1) {
            deactivateStage(currentStage);
            currentStage--;
            activateStage(currentStage);
            
            updateButtons();
            saveState();
        }
    });

    function activateStage(stage) {
        const stageElement = document.getElementById(`stage-${stage}`);
        const stageIcon = stageElement.querySelector('.stage-icon');
        const stageTimeElement = document.getElementById(`stage-${stage}-time`);
        
        stageIcon.classList.remove('pending', 'completed');
        stageIcon.classList.add('active');
        stageStatuses[stage-1] = 'active';
        
        // Обновляем отображение времени
        updateTimeDisplay(stageTimeElement, stageTimes[stage-1]);
        
        // Запускаем таймер только если этап еще не был завершен
        if (stageStatuses[stage-1] !== 'completed') {
            timers[stage-1] = setInterval(() => {
                stageTimes[stage-1]++;
                updateTimeDisplay(stageTimeElement, stageTimes[stage-1]);
                saveState(); // Сохраняем каждую секунду
            }, 1000);
        }
    }
    
    // Функция завершения этапа
    function completeStage(stage) {
        const stageElement = document.getElementById(`stage-${stage}`);
        const stageIcon = stageElement.querySelector('.stage-icon');
        
        // Обновляем визуальное состояние
        stageIcon.classList.remove('pending', 'active');
        stageIcon.classList.add('completed');
        stageStatuses[stage-1] = 'completed';
        
        // Останавливаем таймер
        if (timers[stage-1]) {
            clearInterval(timers[stage-1]);
            timers[stage-1] = null;
        }
        
        saveState(); // Сохраняем при завершении этапа
    }
    
    // Функция деактивации этапа
    function deactivateStage(stage) {
        const stageElement = document.getElementById(`stage-${stage}`);
        const stageIcon = stageElement.querySelector('.stage-icon');
        const stageTimeElement = document.getElementById(`stage-${stage}-time`);
        
        // Обновляем визуальное состояние
        stageIcon.classList.remove('active', 'completed');
        stageIcon.classList.add('pending');
        stageStatuses[stage-1] = 'pending';
        
        // Останавливаем таймер
        if (timers[stage-1]) {
            clearInterval(timers[stage-1]);
            timers[stage-1] = null;
        }
        
        // Сохраняем состояние
        saveState();
    }
    
    // Функция обновления отображения времени
    function updateTimeDisplay(element, seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        element.textContent = `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }
    
    // Функция обновления состояния кнопок
    function updateButtons() {
        prevBtn.disabled = currentStage <= 1;
        
        if (currentStage >= totalStages) {
            nextBtn.textContent = 'Завершить';
        } else {
            nextBtn.textContent = 'Следующий этап';
        }
    }
    
    // Функция восстановления этапов из сохраненного состояния
    function restoreStages() {
        // Восстанавливаем текущий этап
        currentStage = savedCurrentStage;
        
        // Восстанавливаем визуальное состояние и время для всех этапов
        for (let i = 1; i <= totalStages; i++) {
            const stageElement = document.getElementById(`stage-${i}`);
            const stageIcon = stageElement.querySelector('.stage-icon');
            const stageTimeElement = document.getElementById(`stage-${i}-time`);
            
            // Восстанавливаем статус
            stageIcon.classList.remove('active', 'completed', 'pending');
            stageIcon.classList.add(stageStatuses[i-1]);
            
            // Восстанавливаем время
            if (stageTimes[i-1] > 0 || stageStatuses[i-1] === 'completed') {
                updateTimeDisplay(stageTimeElement, stageTimes[i-1]);
            } else {
                stageTimeElement.textContent = '—';
            }
        }
        
        // Активируем текущий этап (если есть активный и он не завершен)
        if (currentStage > 0 && currentStage <= totalStages && stageStatuses[currentStage-1] !== 'completed') {
            activateStage(currentStage);
        }
        
        updateButtons();
    }
    
    // Функция остановки всех таймеров
    function stopAllTimers() {
        timers.forEach((timer, index) => {
            if (timer) {
                clearInterval(timer);
                timers[index] = null;
            }
        });
    }
    
    // Функция полного сброса (если нужна для каких-то случаев)
    function resetStages() {
        stopAllTimers();
        
        // Сбрасываем данные
        stageTimes = Array(totalStages).fill(0);
        stageStatuses = Array(totalStages).fill('pending');
        currentStage = 0;
        savedCurrentStage = 0;
        
        // Очищаем localStorage
        localStorage.removeItem('stageTimes');
        localStorage.removeItem('stageStatuses');
        localStorage.removeItem('currentStage');
        
        // Сбрасываем визуальное состояние
        for (let i = 1; i <= totalStages; i++) {
            const stageElement = document.getElementById(`stage-${i}`);
            const stageIcon = stageElement.querySelector('.stage-icon');
            const stageTimeElement = document.getElementById(`stage-${i}-time`);
            
            stageIcon.classList.remove('active', 'completed');
            stageIcon.classList.add('pending');
            stageTimeElement.textContent = '—';
        }
        
        updateButtons();
    }
    
    // Инициализация при загрузке страницы
    restoreStages();
});