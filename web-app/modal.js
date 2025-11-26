 document.addEventListener('DOMContentLoaded', function() {
            const modalOverlay = document.getElementById('modal-overlay');
            const openModalBtn = document.getElementById('open-modal-btn');
            const closeModalBtn = document.getElementById('close-modal-btn');
            const prevBtn = document.getElementById('prev-btn');
            const nextBtn = document.getElementById('next-btn');
            
            let currentStage = 0;
            const totalStages = 6;
            const stageTimes = Array(totalStages).fill(0);
            let timers = Array(totalStages).fill(null);
            
            // Открытие модального окна
            openModalBtn.addEventListener('click', function() {
                modalOverlay.classList.add('active');
                resetStages();
            });
            
            // Закрытие модального окна
            closeModalBtn.addEventListener('click', function() {
                modalOverlay.classList.remove('active');
                resetStages();
            });
            
            // Закрытие модального окна при клике вне его
            modalOverlay.addEventListener('click', function(e) {
                if (e.target === modalOverlay) {
                    modalOverlay.classList.remove('active');
                    resetStages();
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
                }
            });
            
            // Переход к предыдущему этапу
            prevBtn.addEventListener('click', function() {
                if (currentStage > 1) {
                    // Отменяем текущий этап
                    deactivateStage(currentStage);
                    
                    // Переходим к предыдущему этапу
                    currentStage--;
                    
                    // Активируем предыдущий этап
                    activateStage(currentStage);
                    
                    updateButtons();
                }
            });
            
            // Функция активации этапа
            function activateStage(stage) {
                const stageElement = document.getElementById(`stage-${stage}`);
                const stageIcon = stageElement.querySelector('.stage-icon');
                const stageTimeElement = document.getElementById(`stage-${stage}-time`);
                
                // Обновляем визуальное состояние
                stageIcon.classList.remove('pending', 'completed');
                stageIcon.classList.add('active');
                
                // Запускаем таймер для этапа
                stageTimes[stage-1] = 0;
                updateTimeDisplay(stageTimeElement, stageTimes[stage-1]);
                
                timers[stage-1] = setInterval(() => {
                    stageTimes[stage-1]++;
                    updateTimeDisplay(stageTimeElement, stageTimes[stage-1]);
                }, 1000);
            }
            
            // Функция завершения этапа
            function completeStage(stage) {
                const stageElement = document.getElementById(`stage-${stage}`);
                const stageIcon = stageElement.querySelector('.stage-icon');
                
                // Обновляем визуальное состояние
                stageIcon.classList.remove('pending', 'active');
                stageIcon.classList.add('completed');
                
                // Останавливаем таймер
                if (timers[stage-1]) {
                    clearInterval(timers[stage-1]);
                    timers[stage-1] = null;
                }
            }
            
            // Функция деактивации этапа
            function deactivateStage(stage) {
                const stageElement = document.getElementById(`stage-${stage}`);
                const stageIcon = stageElement.querySelector('.stage-icon');
                const stageTimeElement = document.getElementById(`stage-${stage}-time`);
                
                // Обновляем визуальное состояние
                stageIcon.classList.remove('active', 'completed');
                stageIcon.classList.add('pending');
                
                // Останавливаем таймер
                if (timers[stage-1]) {
                    clearInterval(timers[stage-1]);
                    timers[stage-1] = null;
                }
                
                // Сбрасываем время
                stageTimes[stage-1] = 0;
                updateTimeDisplay(stageTimeElement, stageTimes[stage-1]);
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
                    nextBtn.addEventListener('click', function() {
                        modalOverlay.classList.remove('active');
                        resetStages();
                    });
                } else {
                    nextBtn.textContent = 'Следующий этап';
                }
            }
            
            // Функция сброса всех этапов
            function resetStages() {
                // Останавливаем все таймеры
                timers.forEach((timer, index) => {
                    if (timer) {
                        clearInterval(timer);
                        timers[index] = null;
                    }
                });
                
                // Сбрасываем время
                stageTimes.fill(0);
                
                // Сбрасываем визуальное состояние
                for (let i = 1; i <= totalStages; i++) {
                    const stageElement = document.getElementById(`stage-${i}`);
                    const stageIcon = stageElement.querySelector('.stage-icon');
                    const stageTimeElement = document.getElementById(`stage-${i}-time`);
                    
                    stageIcon.classList.remove('active', 'completed');
                    stageIcon.classList.add('pending');
                    stageTimeElement.textContent = '—';
                }
                
                // Сбрасываем текущий этап
                currentStage = 0;
                updateButtons();
            }
        });