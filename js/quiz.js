// =============================================================================
// MOTOR DEL GENERADOR DE EXÁMENES - DAC: DISEÑO Y ADAPTACIÓN CURRICULAR (MÁSTER EN PROFESORADO)
// Soporte directo sin servidor (file://) y localhost
// Selector maquetable de preguntas de 5 en 5 (5, 10, 15, 20, 25, etc.)
// Navegación bidireccional (Anterior, Pasar Pregunta, Tira interactiva de números)
// Repetición exclusiva de preguntas falladas y Reporte completo con filtros e impresión
// =============================================================================

class QuizEngine {
  constructor() {
    this.questionsData = null;
    this.topicsMetadata = null;

    this.config = {
      mode: 'all',
      selectedTopic: 1,
      excludedTopics: new Set(),
      questionCount: 20
    };

    this.state = {
      isActive: false,
      isFinished: false,
      questions: [],
      currentIndex: 0,
      userAnswers: [], // { selectedIndex, isCorrect, correctIndex, question } | { isSkipped: true, question } | undefined
      correctCount: 0,
      incorrectCount: 0,
      skippedCount: 0,
      startTime: null,
      endTime: null,
      timerInterval: null,
      reviewModeTitle: null,
      reviewFilter: 'all', // 'all', 'correct', 'incorrect', 'skipped'
      reviewSearchQuery: ''
    };

    this.initDOMElements();
    this.bindEvents();
    this.initStepper();
    document.addEventListener('dac-questions-ready', () => this.loadData());
    this.loadData();
  }

  initDOMElements() {
    this.quizSetupSection = document.getElementById('quiz-setup');
    this.quizActiveSection = document.getElementById('quiz-active');
    this.quizResultsSection = document.getElementById('quiz-results');

    this.modeAllRadio = document.getElementById('mode-all');
    this.modeTopicRadio = document.getElementById('mode-topic');
    this.topicSelectContainer = document.getElementById('topic-select-container');
    this.topicRadioGroup = document.getElementById('topic-radio-group');
    this.exclusionsContainer = document.getElementById('exclusions-container');
    this.exclusionsCheckboxes = document.getElementById('exclusions-checkboxes');
    this.startQuizBtn = document.getElementById('btn-start-quiz');

    // Stepper y Presets
    this.countDisplayEl = document.getElementById('question-count-display');
    this.countMinusBtn = document.getElementById('btn-count-minus');
    this.countPlusBtn = document.getElementById('btn-count-plus');
    this.presetPills = document.querySelectorAll('.count-preset-pill');

    // Header del examen en vivo
    this.quizProgressText = document.getElementById('quiz-progress-text');
    this.quizRemainingBadge = document.getElementById('quiz-remaining-badge');
    this.quizProgressBar = document.getElementById('quiz-progress-bar');
    this.quizLiveGrade = document.getElementById('quiz-live-grade');
    this.quizTimer = document.getElementById('quiz-timer');
    this.quizTopicTag = document.getElementById('quiz-topic-tag');
    this.quizQuestionText = document.getElementById('quiz-question-text');
    this.quizOptionsContainer = document.getElementById('quiz-options-container');
    this.quizFeedbackCard = document.getElementById('quiz-feedback-card');
    this.quizFeedbackTitle = document.getElementById('quiz-feedback-title');
    this.quizFeedbackExplanation = document.getElementById('quiz-feedback-explanation');

    // Navegación en vivo
    this.quizNavPillsTrack = document.getElementById('quiz-nav-pills-track');
    this.quizPrevBtn = document.getElementById('quiz-btn-prev');
    this.quizSkipBtn = document.getElementById('quiz-btn-skip');
    this.quizNextBtn = document.getElementById('quiz-btn-next');
    this.quizFinishDirectBtn = document.getElementById('quiz-btn-finish-direct');
    this.quizQuitBtn = document.getElementById('quiz-btn-quit');

    // Modal de preguntas pendientes
    this.quizPendingModal = document.getElementById('quiz-pending-modal');
    this.quizPendingModalDesc = document.getElementById('quiz-pending-modal-desc');
    this.modalReviewPendingBtn = document.getElementById('modal-btn-review-pending');
    this.modalConfirmFinishBtn = document.getElementById('modal-btn-confirm-finish');

    // Pantalla de Resultados
    this.resFinalGrade = document.getElementById('res-final-grade');
    this.resGradeBadge = document.getElementById('res-grade-badge');
    this.resCorrectCount = document.getElementById('res-correct-count');
    this.resIncorrectCount = document.getElementById('res-incorrect-count');
    this.resTotalQuestions = document.getElementById('res-total-questions');
    this.resTimeTaken = document.getElementById('res-time-taken');
    this.resTopicBreakdown = document.getElementById('res-topic-breakdown');

    // Botones de acción de Resultados
    this.resRepeatErrorsBtn = document.getElementById('res-btn-repeat-errors');
    this.resRepeatErrorsLabel = document.getElementById('res-repeat-errors-label');
    this.resRestartBtn = document.getElementById('res-btn-restart');
    this.resNewRandomBtn = document.getElementById('res-btn-new-random');
    this.resDashboardBtn = document.getElementById('res-btn-dashboard');
    this.resPrintBtn = document.getElementById('res-btn-print');
    this.resPrintSecondaryBtn = document.getElementById('res-btn-print-secondary');
    this.resConfigBtn = document.getElementById('res-btn-config');

    // Filtros y Buscador de Reporte
    this.resReviewList = document.getElementById('res-review-list');
    this.resReviewFilterGroup = document.getElementById('res-review-filter-group');
    this.resReviewSearchInput = document.getElementById('res-review-search-input');
    this.revCountAll = document.getElementById('rev-count-all');
    this.revCountCorrect = document.getElementById('rev-count-correct');
    this.revCountIncorrect = document.getElementById('rev-count-incorrect');
    this.revCountSkipped = document.getElementById('rev-count-skipped');
  }

  async loadData() {
    try {
      if (window.cloudSyncManager?.ready) await window.cloudSyncManager.ready;
      if (window.cloudSyncManager?.db) {
        this.questionsData = await window.cloudSyncManager.loadQuestionsFromFirestore();
        this.topicsMetadata = window.DAC_DATA?.topics || {};
      } else {
        throw new Error('Firebase todavía no está inicializado.');
      }

      this.renderExclusionCheckboxes();
      this.updateQuestionPoolCount();
    } catch (err) {
      console.error("No se pudieron cargar las preguntas desde Firestore:", err);
      this.questionsData = null;
    }
  }

  initStepper() {
    if (this.countMinusBtn && this.countPlusBtn) {
      this.countMinusBtn.addEventListener('click', () => this.adjustCount(-5));
      this.countPlusBtn.addEventListener('click', () => this.adjustCount(5));
    }

    this.presetPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const val = parseInt(pill.dataset.count, 10);
        this.setQuestionCount(val);
      });
    });

    this.updateStepperDisplay();
  }

  adjustCount(delta) {
    const current = this.config.questionCount;
    const max = this.getAvailablePoolCount() || 80;
    const next = Math.max(5, Math.min(max, current + delta));
    this.setQuestionCount(next);
  }

  setQuestionCount(count) {
    const max = this.getAvailablePoolCount() || 80;
    let rounded = Math.round(count / 5) * 5;
    if (rounded < 5) rounded = 5;
    if (rounded > max) rounded = max;

    this.config.questionCount = rounded;
    this.updateStepperDisplay();
  }

  updateStepperDisplay() {
    if (this.countDisplayEl) {
      this.countDisplayEl.textContent = this.config.questionCount;
    }

    this.presetPills.forEach(pill => {
      const val = parseInt(pill.dataset.count, 10);
      pill.classList.toggle('active', val === this.config.questionCount);
    });
  }

  bindEvents() {
    if (this.modeAllRadio && this.modeTopicRadio) {
      this.modeAllRadio.addEventListener('change', () => this.handleModeChange('all'));
      this.modeTopicRadio.addEventListener('change', () => this.handleModeChange('topic'));
    }

    if (this.startQuizBtn) {
      this.startQuizBtn.addEventListener('click', () => this.startQuiz(true));
    }

    // Controles de navegación en vivo
    if (this.quizPrevBtn) {
      this.quizPrevBtn.addEventListener('click', () => this.prevQuestion());
    }

    if (this.quizSkipBtn) {
      this.quizSkipBtn.addEventListener('click', () => this.skipCurrentQuestion());
    }

    if (this.quizNextBtn) {
      this.quizNextBtn.addEventListener('click', () => this.nextQuestion());
    }

    if (this.quizFinishDirectBtn) {
      this.quizFinishDirectBtn.addEventListener('click', () => this.requestFinishQuiz());
    }

    if (this.quizQuitBtn) {
      this.quizQuitBtn.addEventListener('click', () => {
        if (confirm("¿Deseas salir del examen actual? Perderás el progreso de este intento.")) {
          this.endQuizSession();
          this.showSection('setup');
        }
      });
    }

    // Modal de confirmación pendientes
    if (this.modalReviewPendingBtn) {
      this.modalReviewPendingBtn.addEventListener('click', () => this.goToFirstPendingQuestion());
    }
    if (this.modalConfirmFinishBtn) {
      this.modalConfirmFinishBtn.addEventListener('click', () => {
        if (this.quizPendingModal) this.quizPendingModal.style.display = 'none';
        this.finishQuiz();
      });
    }

    // Resultados
    if (this.resRepeatErrorsBtn) {
      this.resRepeatErrorsBtn.addEventListener('click', () => this.repeatFailedQuestions());
    }
    if (this.resRestartBtn) {
      this.resRestartBtn.addEventListener('click', () => this.startQuiz(false));
    }
    if (this.resNewRandomBtn) {
      this.resNewRandomBtn.addEventListener('click', () => this.startQuiz(true));
    }
    if (this.resConfigBtn) {
      this.resConfigBtn.addEventListener('click', () => this.showSection('setup'));
    }
    if (this.resDashboardBtn) {
      this.resDashboardBtn.addEventListener('click', () => {
        if (window.dacApp) window.dacApp.switchTab('view-dashboard');
      });
    }
    if (this.resPrintBtn) {
      this.resPrintBtn.addEventListener('click', () => this.printExamReport());
    }
    if (this.resPrintSecondaryBtn) {
      this.resPrintSecondaryBtn.addEventListener('click', () => this.printExamReport());
    }

    // Filtros de Reporte
    if (this.resReviewFilterGroup) {
      this.resReviewFilterGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.rev-filter-pill');
        if (!btn) return;
        this.resReviewFilterGroup.querySelectorAll('.rev-filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.reviewFilter = btn.dataset.filter || 'all';
        this.filterReviewList();
      });
    }

    // Buscador en Reporte
    if (this.resReviewSearchInput) {
      this.resReviewSearchInput.addEventListener('input', (e) => {
        this.state.reviewSearchQuery = e.target.value.trim().toLowerCase();
        this.filterReviewList();
      });
    }

    // Atajos de teclado: 1-4 para responder, Flechas Izq/Der para navegar, Enter / Espacio
    window.addEventListener('keydown', (e) => {
      if (!this.state.isActive || this.state.isFinished) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      const key = e.key;
      const isAnswered = this.state.userAnswers[this.state.currentIndex] !== undefined &&
                         !this.state.userAnswers[this.state.currentIndex].isSkipped;

      if (!isAnswered) {
        if (['1', '2', '3', '4'].includes(key)) {
          const index = parseInt(key, 10) - 1;
          const buttons = this.quizOptionsContainer.querySelectorAll('.quiz-option-btn');
          if (buttons[index]) buttons[index].click();
        } else if (key === 'p' || key === 'P' || key === 's' || key === 'S') {
          this.skipCurrentQuestion();
        }
      }

      if (key === 'ArrowLeft') {
        e.preventDefault();
        this.prevQuestion();
      } else if (key === 'ArrowRight' || key === 'Enter') {
        e.preventDefault();
        this.nextQuestion();
      }
    });
  }

  handleModeChange(mode) {
    this.config.mode = mode;
    if (mode === 'all') {
      this.topicSelectContainer.style.display = 'none';
      this.exclusionsContainer.style.display = 'block';
    } else {
      this.topicSelectContainer.style.display = 'block';
      this.exclusionsContainer.style.display = 'none';
    }
    this.updateQuestionPoolCount();
  }

  renderExclusionCheckboxes() {
    if (!this.exclusionsCheckboxes || !this.topicsMetadata || !this.questionsData) return;
    this.exclusionsCheckboxes.innerHTML = '';

    [1, 2, 3, 4].forEach(topicId => {
      const meta = this.topicsMetadata[topicId];
      const count = this.questionsData.filter(q => q.topic === topicId).length;

      const label = document.createElement('label');
      label.className = 'exclusion-checkbox-label';
      label.innerHTML = `
        <input type="checkbox" value="${topicId}" checked class="exclusion-checkbox" />
        <span class="custom-checkbox"></span>
        <span class="exclusion-text">
          <strong>Tema ${topicId}</strong>: ${meta.badge}
          <small>(${count} preguntas)</small>
        </span>
      `;

      const input = label.querySelector('input');
      input.addEventListener('change', () => {
        if (input.checked) {
          this.config.excludedTopics.delete(topicId);
        } else {
          if (this.config.excludedTopics.size >= 3) {
            alert("Debes mantener al menos un tema seleccionado.");
            input.checked = true;
            return;
          }
          this.config.excludedTopics.add(topicId);
        }
        this.updateQuestionPoolCount();
      });

      this.exclusionsCheckboxes.appendChild(label);
    });

    if (this.topicRadioGroup) {
      this.topicRadioGroup.innerHTML = '';
      [1, 2, 3, 4].forEach(topicId => {
        const meta = this.topicsMetadata[topicId];
        const count = this.questionsData.filter(q => q.topic === topicId).length;
        const radioLabel = document.createElement('label');
        radioLabel.className = 'topic-radio-card';
        radioLabel.innerHTML = `
          <input type="radio" name="selected-topic-radio" value="${topicId}" ${topicId === 1 ? 'checked' : ''} />
          <div class="topic-radio-content">
            <span class="topic-num" style="background-color: ${meta.color}">Tema ${topicId}</span>
            <div class="topic-title">${meta.title}</div>
            <div class="topic-meta-badge">${count} preguntas disponibles</div>
          </div>
        `;
        const rInput = radioLabel.querySelector('input');
        rInput.addEventListener('change', () => {
          this.config.selectedTopic = topicId;
          this.updateQuestionPoolCount();
        });
        this.topicRadioGroup.appendChild(radioLabel);
      });
    }

    this.updateQuestionPoolCount();
  }

  getAvailablePoolCount() {
    if (!this.questionsData) return 0;
    if (this.config.mode === 'all') {
      return this.questionsData.filter(q => !this.config.excludedTopics.has(q.topic)).length;
    } else {
      return this.questionsData.filter(q => q.topic === this.config.selectedTopic).length;
    }
  }

  updateQuestionPoolCount() {
    const poolCount = this.getAvailablePoolCount();
    const availableSpan = document.getElementById('available-pool-count');
    if (availableSpan) {
      availableSpan.textContent = `(Disponibles en el banco: ${poolCount})`;
    }

    if (this.config.questionCount > poolCount && poolCount > 0) {
      this.setQuestionCount(poolCount);
    }
  }

  shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  generateQuestions() {
    if (!this.questionsData) return [];

    let pool = [];
    if (this.config.mode === 'all') {
      pool = this.questionsData.filter(q => !this.config.excludedTopics.has(q.topic));
    } else {
      pool = this.questionsData.filter(q => q.topic === this.config.selectedTopic);
    }

    if (pool.length === 0) {
      alert("No hay preguntas disponibles con la selección actual.");
      return [];
    }

    const shuffledPool = this.shuffleArray(pool);
    const targetCount = Math.min(this.config.questionCount, shuffledPool.length);
    const selected = shuffledPool.slice(0, targetCount);

    return selected.map(q => {
      const originalCorrectText = q.options[q.correct];
      const randomizedOptions = this.shuffleArray(q.options);
      const newCorrectIndex = randomizedOptions.indexOf(originalCorrectText);

      return {
        ...q,
        options: randomizedOptions,
        correct: newCorrectIndex,
        originalQuestionId: q.id
      };
    });
  }

  startQuiz(isFresh = true) {
    const questions = this.generateQuestions();
    if (!questions || questions.length === 0) return;

    this.state = {
      isActive: true,
      isFinished: false,
      questions: questions,
      currentIndex: 0,
      userAnswers: new Array(questions.length).fill(undefined),
      correctCount: 0,
      incorrectCount: 0,
      skippedCount: 0,
      startTime: Date.now(),
      endTime: null,
      timerInterval: null,
      reviewModeTitle: null,
      reviewFilter: 'all',
      reviewSearchQuery: ''
    };

    this.startTimer();
    this.showSection('active');
    this.renderCurrentQuestion();
    window.scrollTo({ top: this.quizActiveSection.offsetTop - 80, behavior: 'smooth' });
  }

  // Lanzar examen con preguntas específicas (p. ej. repetición de fallos)
  startQuizWithCustomQuestions(customQuestions, title = "Repetición de Fallos") {
    if (!customQuestions || customQuestions.length === 0) return;

    // Barajar opciones de nuevo para consolidar el aprendizaje sin memoria mecánica
    const preparedQuestions = customQuestions.map(q => {
      const originalCorrectText = q.options[q.correct];
      const randomizedOptions = this.shuffleArray(q.options);
      const newCorrectIndex = randomizedOptions.indexOf(originalCorrectText);

      return {
        ...q,
        options: randomizedOptions,
        correct: newCorrectIndex,
        originalQuestionId: q.originalQuestionId || q.id
      };
    });

    this.state = {
      isActive: true,
      isFinished: false,
      questions: preparedQuestions,
      currentIndex: 0,
      userAnswers: new Array(preparedQuestions.length).fill(undefined),
      correctCount: 0,
      incorrectCount: 0,
      skippedCount: 0,
      startTime: Date.now(),
      endTime: null,
      timerInterval: null,
      reviewModeTitle: title,
      reviewFilter: 'all',
      reviewSearchQuery: ''
    };

    this.startTimer();
    this.showSection('active');
    this.renderCurrentQuestion();
    window.scrollTo({ top: this.quizActiveSection.offsetTop - 80, behavior: 'smooth' });
  }

  startTimer() {
    if (this.state.timerInterval) clearInterval(this.state.timerInterval);
    const startTime = this.state.startTime;

    const updateDisplay = () => {
      if (!this.state.isActive || this.state.isFinished) return;
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
      const secs = String(elapsedSec % 60).padStart(2, '0');
      if (this.quizTimer) {
        this.quizTimer.textContent = `${mins}:${secs}`;
      }
    };

    updateDisplay();
    this.state.timerInterval = setInterval(updateDisplay, 1000);
  }

  renderCurrentQuestion() {
    if (!this.state.questions || this.state.questions.length === 0) return;

    const q = this.state.questions[this.state.currentIndex];
    const total = this.state.questions.length;
    const currentNum = this.state.currentIndex + 1;
    const answeredCount = this.state.userAnswers.filter(a => a && !a.isSkipped).length;
    const remaining = total - answeredCount;

    // Header del test
    if (this.quizProgressText) {
      const modePrefix = this.state.reviewModeTitle ? `<span class="review-mode-tag">🔁 ${this.state.reviewModeTitle}</span> · ` : '';
      this.quizProgressText.innerHTML = `${modePrefix}Pregunta <strong>${currentNum}</strong> de <strong>${total}</strong>`;
    }
    if (this.quizRemainingBadge) {
      this.quizRemainingBadge.innerHTML = `<span>Quedan <strong>${remaining}</strong> por contestar</span>`;
    }
    if (this.quizProgressBar) {
      const pct = (answeredCount / total) * 100;
      this.quizProgressBar.style.width = `${pct}%`;
    }

    this.updateLiveGrade();
    this.renderNavigationPills();

    // Etiqueta de tema
    const meta = this.topicsMetadata ? this.topicsMetadata[q.topic] : null;
    if (this.quizTopicTag) {
      if (meta) {
        this.quizTopicTag.textContent = `Tema ${q.topic}: ${meta.badge}`;
        this.quizTopicTag.style.backgroundColor = `${meta.color}20`;
        this.quizTopicTag.style.borderColor = meta.color;
        this.quizTopicTag.style.color = meta.color;
      } else {
        this.quizTopicTag.textContent = `Tema ${q.topic}`;
      }
    }

    // Texto de la pregunta
    if (this.quizQuestionText) {
      this.quizQuestionText.textContent = q.question;
    }

    // Estado de la pregunta actual (¿respondida, saltada o virgen?)
    const currentAnswer = this.state.userAnswers[this.state.currentIndex];
    const isAnswered = currentAnswer && !currentAnswer.isSkipped;

    // Botón Anterior: deshabilitado en la primera pregunta
    if (this.quizPrevBtn) {
      const isFirst = this.state.currentIndex === 0;
      this.quizPrevBtn.disabled = isFirst;
      this.quizPrevBtn.classList.toggle('disabled', isFirst);
    }

    // Renderizar Opciones A, B, C, D
    if (this.quizOptionsContainer) {
      this.quizOptionsContainer.innerHTML = '';
      const letters = ['A', 'B', 'C', 'D'];

      q.options.forEach((optText, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quiz-option-btn';
        btn.innerHTML = `
          <span class="option-letter">${letters[index]}</span>
          <span class="option-text">${this.escapeHTML(optText)}</span>
          <span class="option-status-icon"></span>
        `;

        if (isAnswered) {
          btn.disabled = true;
          if (index === q.correct) {
            btn.classList.add('correct');
            btn.querySelector('.option-status-icon').innerHTML = `
              <span class="status-pill status-correct">
                <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Correcta
              </span>
            `;
          }
          if (index === currentAnswer.selectedIndex && !currentAnswer.isCorrect) {
            btn.classList.add('incorrect');
            btn.querySelector('.option-status-icon').innerHTML = `
              <span class="status-pill status-incorrect">
                <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Tu respuesta
              </span>
            `;
          }
        } else {
          btn.addEventListener('click', () => this.handleOptionSelection(index, btn));
        }

        this.quizOptionsContainer.appendChild(btn);
      });
    }

    // Feedback Drawer y Botón Pasar Pregunta
    if (isAnswered) {
      this.renderFeedback(currentAnswer.isCorrect, q);
      if (this.quizSkipBtn) this.quizSkipBtn.style.display = 'none';
      if (this.quizNextBtn) {
        this.quizNextBtn.style.display = 'inline-flex';
        const isLast = this.state.currentIndex === this.state.questions.length - 1;
        this.quizNextBtn.innerHTML = isLast
          ? `<span>Finalizar Examen</span> <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`
          : `<span>Siguiente Pregunta</span> <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
      }
    } else {
      if (this.quizFeedbackCard) this.quizFeedbackCard.style.display = 'none';
      if (this.quizSkipBtn) {
        this.quizSkipBtn.style.display = 'inline-flex';
        if (currentAnswer && currentAnswer.isSkipped) {
          this.quizSkipBtn.innerHTML = `
            <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/>
            </svg>
            <span>Volver a Pasar</span>
          `;
        } else {
          this.quizSkipBtn.innerHTML = `
            <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/>
            </svg>
            <span>Pasar Pregunta</span>
          `;
        }
      }
      if (this.quizNextBtn) {
        // Permitir avanzar aunque no esté respondida
        this.quizNextBtn.style.display = 'inline-flex';
        const isLast = this.state.currentIndex === this.state.questions.length - 1;
        this.quizNextBtn.innerHTML = isLast
          ? `<span>Finalizar Examen</span> <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`
          : `<span>Siguiente Pregunta</span> <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
      }
    }
  }

  // Tira de Píldoras de Navegación Rápida
  renderNavigationPills() {
    if (!this.quizNavPillsTrack) return;
    this.quizNavPillsTrack.innerHTML = '';

    this.state.questions.forEach((q, idx) => {
      const ans = this.state.userAnswers[idx];
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'quiz-nav-pill';
      pill.textContent = idx + 1;

      if (idx === this.state.currentIndex) {
        pill.classList.add('current');
      }

      if (ans) {
        if (ans.isSkipped) {
          pill.classList.add('skipped');
          pill.title = `Pregunta ${idx + 1}: Saltada / Pensar más adelante`;
        } else if (ans.isCorrect) {
          pill.classList.add('correct');
          pill.title = `Pregunta ${idx + 1}: Acierto`;
        } else {
          pill.classList.add('incorrect');
          pill.title = `Pregunta ${idx + 1}: Fallo`;
        }
      } else {
        pill.classList.add('unvisited');
        pill.title = `Pregunta ${idx + 1}: Sin responder`;
      }

      pill.addEventListener('click', () => this.goToQuestion(idx));
      this.quizNavPillsTrack.appendChild(pill);
    });

    // Auto-scroll para mantener la píldora actual visible
    const activePill = this.quizNavPillsTrack.querySelector('.quiz-nav-pill.current');
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  goToQuestion(idx) {
    if (idx < 0 || idx >= this.state.questions.length) return;
    this.state.currentIndex = idx;
    this.renderCurrentQuestion();
    window.scrollTo({ top: this.quizActiveSection.offsetTop - 80, behavior: 'smooth' });
  }

  prevQuestion() {
    if (this.state.currentIndex > 0) {
      this.goToQuestion(this.state.currentIndex - 1);
    }
  }

  skipCurrentQuestion() {
    // Si la pregunta no está contestada, la marcamos como saltada
    if (!this.state.userAnswers[this.state.currentIndex] || this.state.userAnswers[this.state.currentIndex].isSkipped) {
      this.state.userAnswers[this.state.currentIndex] = {
        isSkipped: true,
        question: this.state.questions[this.state.currentIndex]
      };
    }

    // Avanzar a la siguiente pregunta o buscar la siguiente pendiente
    if (this.state.currentIndex < this.state.questions.length - 1) {
      this.goToQuestion(this.state.currentIndex + 1);
    } else {
      // Estamos en la última pregunta: buscar si queda alguna pendiente anterior
      const firstPending = this.findFirstPendingIndex();
      if (firstPending !== -1 && firstPending !== this.state.currentIndex) {
        this.goToQuestion(firstPending);
      } else {
        this.requestFinishQuiz();
      }
    }
  }

  nextQuestion() {
    if (this.state.currentIndex < this.state.questions.length - 1) {
      this.goToQuestion(this.state.currentIndex + 1);
    } else {
      this.requestFinishQuiz();
    }
  }

  findFirstPendingIndex() {
    return this.state.questions.findIndex((q, idx) => {
      const a = this.state.userAnswers[idx];
      return !a || a.isSkipped;
    });
  }

  requestFinishQuiz() {
    // Verificar si quedan preguntas pendientes o sin responder
    const pendingQuestions = [];
    this.state.questions.forEach((q, idx) => {
      const a = this.state.userAnswers[idx];
      if (!a || a.isSkipped) {
        pendingQuestions.push(idx + 1);
      }
    });

    if (pendingQuestions.length > 0) {
      if (this.quizPendingModal) {
        const listStr = pendingQuestions.slice(0, 8).join(', ') + (pendingQuestions.length > 8 ? '...' : '');
        if (this.quizPendingModalDesc) {
          this.quizPendingModalDesc.innerHTML = `
            Tienes <strong>${pendingQuestions.length}</strong> pregunta(s) sin responder: (Preguntas: <strong>${listStr}</strong>).<br><br>
            ¿Prefieres revisarlas y contestarlas ahora, o entregar el examen de todos modos?
          `;
        }
        this.quizPendingModal.style.display = 'flex';
      } else {
        if (confirm(`Tienes ${pendingQuestions.length} pregunta(s) sin contestar. ¿Deseas entregar el examen de todos modos?`)) {
          this.finishQuiz();
        }
      }
    } else {
      this.finishQuiz();
    }
  }

  goToFirstPendingQuestion() {
    if (this.quizPendingModal) this.quizPendingModal.style.display = 'none';
    const firstPending = this.findFirstPendingIndex();
    if (firstPending !== -1) {
      this.goToQuestion(firstPending);
    }
  }

  handleOptionSelection(selectedIndex, clickedBtn) {
    const current = this.state.userAnswers[this.state.currentIndex];
    if (current && !current.isSkipped) return;

    const q = this.state.questions[this.state.currentIndex];
    const isCorrect = selectedIndex === q.correct;

    if (isCorrect) {
      this.state.correctCount++;
    } else {
      this.state.incorrectCount++;
    }

    this.state.userAnswers[this.state.currentIndex] = {
      selectedIndex: selectedIndex,
      isCorrect: isCorrect,
      correctIndex: q.correct,
      question: q
    };

    // Bloquear opciones y marcar estilos visuales
    const allButtons = this.quizOptionsContainer.querySelectorAll('.quiz-option-btn');
    allButtons.forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === q.correct) {
        btn.classList.add('correct');
        btn.querySelector('.option-status-icon').innerHTML = `
          <span class="status-pill status-correct">
            <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Correcta
          </span>
        `;
      }
      if (idx === selectedIndex && !isCorrect) {
        btn.classList.add('incorrect');
        btn.querySelector('.option-status-icon').innerHTML = `
          <span class="status-pill status-incorrect">
            <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Tu respuesta
          </span>
        `;
      }
    });

    this.updateLiveGrade();
    this.renderNavigationPills();
    this.renderFeedback(isCorrect, q);

    if (this.quizSkipBtn) this.quizSkipBtn.style.display = 'none';

    if (this.quizNextBtn) {
      this.quizNextBtn.style.display = 'inline-flex';
      const isLast = this.state.currentIndex === this.state.questions.length - 1;
      this.quizNextBtn.innerHTML = isLast
        ? `<span>Finalizar Examen y Ver Nota</span> <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`
        : `<span>Siguiente Pregunta</span> <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
      this.quizNextBtn.focus();
    }
  }

  updateLiveGrade() {
    if (!this.quizLiveGrade) return;
    const answeredCount = this.state.userAnswers.filter(a => a && !a.isSkipped).length;
    if (answeredCount === 0) {
      this.quizLiveGrade.innerHTML = `<span class="grade-pill neutral">Nota: - / 10 (0 aciertos)</span>`;
      return;
    }

    const currentGrade = ((this.state.correctCount / answeredCount) * 10).toFixed(1);
    let badgeClass = 'grade-pass';
    if (currentGrade >= 8.5) badgeClass = 'grade-excellent';
    else if (currentGrade >= 7.0) badgeClass = 'grade-good';
    else if (currentGrade >= 5.0) badgeClass = 'grade-pass';
    else badgeClass = 'grade-fail';

    this.quizLiveGrade.innerHTML = `
      <span class="grade-pill ${badgeClass}">
        Nota actual: <strong>${currentGrade} / 10</strong>
        <small>(${this.state.correctCount} de ${answeredCount} aciertos)</small>
      </span>
    `;
  }

  renderFeedback(isCorrect, question) {
    if (!this.quizFeedbackCard) return;

    this.quizFeedbackCard.style.display = 'block';
    this.quizFeedbackCard.className = `quiz-feedback-card ${isCorrect ? 'is-correct' : 'is-incorrect'}`;

    if (this.quizFeedbackTitle) {
      this.quizFeedbackTitle.innerHTML = isCorrect
        ? `<div class="feedback-badge correct">
            <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Respuesta Correcta
          </div>`
        : `<div class="feedback-badge incorrect">
            <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Respuesta Incorrecta
          </div>`;
    }

    if (this.quizFeedbackExplanation) {
      const correctLetter = ['A', 'B', 'C', 'D'][question.correct];
      const correctText = question.options[question.correct];
      this.quizFeedbackExplanation.innerHTML = `
        <div class="feedback-correct-answer">
          <strong>Opción correcta: ${correctLetter})</strong> ${this.escapeHTML(correctText)}
        </div>
        <div class="feedback-rationale">
          <strong>Justificación teórica:</strong> ${this.escapeHTML(question.explanation)}
        </div>
      `;
    }
  }

  finishQuiz() {
    this.state.isFinished = true;
    this.state.endTime = Date.now();
    if (this.state.timerInterval) clearInterval(this.state.timerInterval);

    // Calcular estadísticas definitivas
    let corrects = 0;
    let incorrects = 0;
    let skipped = 0;

    this.state.questions.forEach((q, idx) => {
      const a = this.state.userAnswers[idx];
      if (!a || a.isSkipped) {
        skipped++;
      } else if (a.isCorrect) {
        corrects++;
      } else {
        incorrects++;
      }
    });

    this.state.correctCount = corrects;
    this.state.incorrectCount = incorrects;
    this.state.skippedCount = skipped;

    const total = this.state.questions.length;
    const finalGradeNum = (corrects / total) * 10;
    const elapsedSec = Math.floor((this.state.endTime - this.state.startTime) / 1000);

    // Registrar en el servicio de analítica para el Dashboard histórico
    if (window.quizStats) {
      window.quizStats.recordExam({
        mode: this.config.mode,
        selectedTopic: this.config.selectedTopic,
        questions: this.state.questions,
        userAnswers: this.state.userAnswers,
        correctCount: corrects,
        incorrectCount: incorrects,
        skippedCount: skipped,
        grade: finalGradeNum,
        elapsedSeconds: elapsedSec
      });

      // Refrescar dashboard si está cargado
      if (window.dashboardManager) {
        window.dashboardManager.render();
      }
    }

    this.renderResults();
    this.showSection('results');
    window.scrollTo({ top: this.quizResultsSection.offsetTop - 80, behavior: 'smooth' });
  }

  // ==========================================
  // REPETICIÓN EXCLUSIVA DE PREGUNTAS FALLADAS
  // ==========================================
  repeatFailedQuestions() {
    const failedQuestions = [];

    this.state.questions.forEach((q, idx) => {
      const ans = this.state.userAnswers[idx];
      // Si la falló o no la contestó/saltó, se incluye en la tanda de repaso
      if (!ans || ans.isSkipped || !ans.isCorrect) {
        failedQuestions.push({
          id: q.originalQuestionId || q.id,
          topic: q.topic,
          topicName: q.topicName,
          question: q.question,
          options: q.options,
          correct: q.correct,
          explanation: q.explanation
        });
      }
    });

    if (failedQuestions.length === 0) {
      alert("¡Enhorabuena! Has respondido correctamente el 100% de las preguntas. No tienes ningún fallo pendiente.");
      return;
    }

    this.startQuizWithCustomQuestions(failedQuestions, `Repaso de ${failedQuestions.length} fallos`);
  }

  renderResults() {
    const total = this.state.questions.length;
    const corrects = this.state.correctCount;
    const incorrects = this.state.incorrectCount;
    const skipped = this.state.skippedCount;
    const finalGradeNum = (corrects / total) * 10;
    const finalGradeStr = finalGradeNum.toFixed(2);

    if (this.resFinalGrade) {
      this.resFinalGrade.textContent = finalGradeStr;
    }

    if (this.resGradeBadge) {
      let badgeText = "SUSPENSO";
      let badgeClass = "badge-fail";
      if (finalGradeNum >= 9.0) {
        badgeText = "SOBRESALIENTE / MATRÍCULA";
        badgeClass = "badge-excellent";
      } else if (finalGradeNum >= 7.0) {
        badgeText = "NOTABLE";
        badgeClass = "badge-good";
      } else if (finalGradeNum >= 5.0) {
        badgeText = "APROBADO";
        badgeClass = "badge-pass";
      }
      this.resGradeBadge.textContent = badgeText;
      this.resGradeBadge.className = `results-badge ${badgeClass}`;
    }

    if (this.resCorrectCount) this.resCorrectCount.textContent = corrects;
    if (this.resIncorrectCount) this.resIncorrectCount.textContent = incorrects + skipped;
    if (this.resTotalQuestions) this.resTotalQuestions.textContent = total;

    if (this.resTimeTaken && this.state.startTime) {
      const elapsed = Math.floor((this.state.endTime - this.state.startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      this.resTimeTaken.textContent = `${mins}m ${secs}s`;
    }

    // Botón de Repetir Fallos con contador
    const totalFailedOrSkipped = incorrects + skipped;
    if (this.resRepeatErrorsBtn) {
      if (totalFailedOrSkipped > 0) {
        this.resRepeatErrorsBtn.style.display = 'inline-flex';
        this.resRepeatErrorsBtn.disabled = false;
        if (this.resRepeatErrorsLabel) {
          this.resRepeatErrorsLabel.textContent = `Repetir Solo Fallos (${totalFailedOrSkipped})`;
        }
      } else {
        this.resRepeatErrorsBtn.style.display = 'inline-flex';
        this.resRepeatErrorsBtn.disabled = true;
        if (this.resRepeatErrorsLabel) {
          this.resRepeatErrorsLabel.textContent = `¡100% Perfecto! Sin fallos 🎉`;
        }
      }
    }

    // Rendimiento por Tema en este examen
    if (this.resTopicBreakdown) {
      this.resTopicBreakdown.innerHTML = '';
      const topicStats = {};

      this.state.questions.forEach((q, idx) => {
        const tId = q.topic;
        if (!topicStats[tId]) {
          topicStats[tId] = { total: 0, correct: 0, incorrect: 0 };
        }
        topicStats[tId].total++;
        const ans = this.state.userAnswers[idx];
        if (ans && !ans.isSkipped && ans.isCorrect) {
          topicStats[tId].correct++;
        } else {
          topicStats[tId].incorrect++;
        }
      });

      Object.keys(topicStats).forEach(tId => {
        const stat = topicStats[tId];
        const meta = this.topicsMetadata ? this.topicsMetadata[tId] : { shortTitle: `Tema ${tId}`, color: '#6366f1' };
        const pct = Math.round((stat.correct / stat.total) * 100);

        const card = document.createElement('div');
        card.className = 'topic-stat-card';
        card.innerHTML = `
          <div class="stat-header">
            <span class="topic-dot" style="background-color: ${meta.color}"></span>
            <strong>Tema ${tId}</strong>: ${meta.shortTitle || meta.title}
          </div>
          <div class="stat-score">${stat.correct} de ${stat.total} aciertos (${pct}%)</div>
          <div class="stat-progress">
            <div class="stat-bar" style="width: ${pct}%; background-color: ${meta.color}"></div>
          </div>
        `;
        this.resTopicBreakdown.appendChild(card);
      });
    }

    // Actualizar contadores de las píldoras de filtro en el Reporte
    if (this.revCountAll) this.revCountAll.textContent = total;
    if (this.revCountCorrect) this.revCountCorrect.textContent = corrects;
    if (this.revCountIncorrect) this.revCountIncorrect.textContent = incorrects;
    if (this.revCountSkipped) this.revCountSkipped.textContent = skipped;

    // Resetear filtro a 'all' y renderizar lista
    this.state.reviewFilter = 'all';
    this.state.reviewSearchQuery = '';
    if (this.resReviewFilterGroup) {
      this.resReviewFilterGroup.querySelectorAll('.rev-filter-pill').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === 'all');
      });
    }
    if (this.resReviewSearchInput) this.resReviewSearchInput.value = '';

    this.filterReviewList();
  }

  // ==========================================
  // REPORTE DE TODAS LAS PREGUNTAS (FILTROS Y BUSCADOR)
  // ==========================================
  filterReviewList() {
    if (!this.resReviewList) return;
    this.resReviewList.innerHTML = '';

    const letters = ['A', 'B', 'C', 'D'];
    const filter = this.state.reviewFilter || 'all';
    const query = this.state.reviewSearchQuery || '';

    let renderedCount = 0;

    this.state.questions.forEach((q, idx) => {
      const ans = this.state.userAnswers[idx];
      const isAnswered = ans && !ans.isSkipped;
      const isCorrect = isAnswered && ans.isCorrect;
      const isSkipped = !ans || ans.isSkipped;

      // Filtrado por estado
      if (filter === 'correct' && !isCorrect) return;
      if (filter === 'incorrect' && (isCorrect || isSkipped)) return;
      if (filter === 'skipped' && !isSkipped) return;

      // Filtrado por buscador de texto
      if (query) {
        const textToSearch = (q.question + ' ' + (q.explanation || '') + ' ' + q.options.join(' ')).toLowerCase();
        if (!textToSearch.includes(query)) return;
      }

      renderedCount++;
      const meta = this.topicsMetadata ? this.topicsMetadata[q.topic] : null;

      let statusBadge = '';
      let statusClass = '';
      if (isSkipped) {
        statusBadge = 'Pasada / Sin responder';
        statusClass = 'skip';
      } else if (isCorrect) {
        statusBadge = 'Acierto';
        statusClass = 'ok';
      } else {
        statusBadge = 'Fallo';
        statusClass = 'ko';
      }

      const item = document.createElement('div');
      item.className = `review-item was-${statusClass}`;
      item.innerHTML = `
        <div class="review-item-header">
          <span class="review-index">#${idx + 1}</span>
          <span class="review-status-badge ${statusClass}">
            ${statusBadge}
          </span>
          <span class="review-topic-tag" style="color: ${meta ? meta.color : '#6366f1'}">
            Tema ${q.topic}: ${meta ? meta.badge : ''}
          </span>
        </div>

        <div class="review-question">${this.escapeHTML(q.question)}</div>

        <!-- Vista exhaustiva de las 4 opciones de respuesta -->
        <div class="review-options-grid">
          ${q.options.map((opt, optIdx) => {
            const isSelected = ans && !ans.isSkipped && ans.selectedIndex === optIdx;
            const isTheCorrectOption = optIdx === q.correct;
            let optClass = 'review-opt';
            let badgeHtml = '';

            if (isTheCorrectOption) {
              optClass += ' opt-correct';
              badgeHtml = `<span class="opt-tag tag-correct">✓ Opción Correcta</span>`;
            }
            if (isSelected) {
              if (isCorrect) {
                optClass += ' opt-user-correct';
                badgeHtml = `<span class="opt-tag tag-correct">✓ Tu respuesta (Correcta)</span>`;
              } else {
                optClass += ' opt-user-incorrect';
                badgeHtml = `<span class="opt-tag tag-incorrect">✗ Tu respuesta elegida</span>`;
              }
            }

            return `
              <div class="${optClass}">
                <div class="opt-main">
                  <span class="opt-letter-tag">${letters[optIdx]}</span>
                  <span class="opt-content">${this.escapeHTML(opt)}</span>
                </div>
                ${badgeHtml}
              </div>
            `;
          }).join('')}
        </div>

        <div class="review-explanation">
          <strong>Justificación teórica oficial:</strong> ${this.escapeHTML(q.explanation)}
        </div>
      `;

      this.resReviewList.appendChild(item);
    });

    if (renderedCount === 0) {
      this.resReviewList.innerHTML = `
        <div class="review-no-results">
          <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p>No hay preguntas que coincidan con el filtro o búsqueda seleccionados.</p>
        </div>
      `;
    }
  }

  // Imprimir o Exportar a PDF el Reporte Completo
  printExamReport() {
    window.print();
  }

  endQuizSession() {
    if (this.state.timerInterval) clearInterval(this.state.timerInterval);
    this.state.isActive = false;
  }

  showSection(sec) {
    if (this.quizSetupSection) this.quizSetupSection.style.display = sec === 'setup' ? 'block' : 'none';
    if (this.quizActiveSection) this.quizActiveSection.style.display = sec === 'active' ? 'block' : 'none';
    if (this.quizResultsSection) this.quizResultsSection.style.display = sec === 'results' ? 'block' : 'none';
  }

  escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.quizApp = new QuizEngine();
});
