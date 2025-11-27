document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modal-overlay');
  const openBtn = document.getElementById('open-modal-btn');
  const closeBtn = document.getElementById('close-modal-btn');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  if (!modal || !openBtn) return;

  let currentStage = 1;
  const totalStages = 6;

  function syncState() {
    let lastCompleted = 0;
    let hasActive = false;

    for (let i = 1; i <= totalStages; i++) {
      const icon = document.querySelector(`#stage-${i} .stage-icon`);
      if (icon?.classList.contains('active')) {
        currentStage = i;
        hasActive = true;
      }
      if (icon?.classList.contains('completed')) {
        lastCompleted = i;
      }
    }
    if (!hasActive) currentStage = lastCompleted + 1;
    if (currentStage > totalStages) currentStage = totalStages;

    prevBtn.disabled = currentStage <= 1;
    nextBtn.textContent =
      currentStage >= totalStages ? 'Завершить' : 'Следующий этап';
  }

  openBtn.addEventListener('click', () => {
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('active'), 10);
    syncState();
  });

  closeBtn.addEventListener('click', () => (modal.style.display = 'none'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  nextBtn.addEventListener('click', () => {
    if (currentStage >= totalStages) return (modal.style.display = 'none');
    updateStage(currentStage + 1, 'active');
    syncState();
  });

  prevBtn.addEventListener('click', () => {
    if (currentStage > 1) {
      updateStage(currentStage - 1, 'active');
      syncState();
    }
  });

  window.addEventListener('stageUpdated', () => {
    if (modal.style.display === 'block') syncState();
  });
});
