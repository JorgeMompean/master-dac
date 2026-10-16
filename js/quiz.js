// =============================================================================
// MOTOR DEL GENERADOR DE EXÁMENES - DAC: DISEÑO Y ADAPTACIÓN CURRICULAR (MÁSTER EN PROFESORADO)
// Soporte directo sin servidor (file://) y localhost
// Selector maquetable de preguntas de 5 en 5 (5, 10, 15, 20, 25, etc.)
// Barajado completo de preguntas y opciones en cada intento
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
      userAnswers: [],
      correctCount: 0,
      incorrectCount: 0,
      startTime: null,
      endTime: null,
      timerInterval: null
    };

    this.initDOMElements();
    this.bindEvents();
    this.initStepper();
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
    this.quizNextBtn = document.getElementById('quiz-btn-next');
    this.quizQuitBtn = document.getElementById('quiz-btn-quit');

    this.resFinalGrade = document.getElementById('res-final-grade');
    this.resGradeBadge = document.getElementById('res-grade-badge');
    this.resCorrectCount = document.getElementById('res-correct-count');
    this.resIncorrectCount = document.getElementById('res-incorrect-count');
    this.resTotalQuestions = document.getElementById('res-total-questions');
    this.resTimeTaken = document.getElementById('res-time-taken');
    this.resTopicBreakdown = document.getElementById('res-topic-breakdown');
    this.resRestartBtn = document.getElementById('res-btn-restart');
    this.resNewRandomBtn = document.getElementById('res-btn-new-random');
    this.resConfigBtn = document.getElementById('res-btn-config');
    this.resReviewList = document.getElementById('res-review-list');
  }

  async loadData() {
    try {
      // 1. Prioridad: ventana global precargada desde script (funciona 100% offline sin localhost)
      if (window.DAC_DATA) {
        this.questionsData = window.DAC_DATA.questions;
        this.topicsMetadata = window.DAC_DATA.topics;
      } else {
        // 2. Fallback: fetch a questions.json (si se sirve mediante un servidor web)
        const response = await fetch('data/questions.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        this.questionsData = data.questions;
        this.topicsMetadata = data.topics;
        window.DAC_DATA = data;
      }

      this.renderExclusionCheckboxes();
      this.updateQuestionPoolCount();
    } catch (err) {
      console.warn("No se pudo cargar JSON por fetch, verificando window.DAC_DATA:", err);
      if (window.DAC_DATA) {
        this.questionsData = window.DAC_DATA.questions;
        this.topicsMetadata = window.DAC_DATA.topics;
        this.renderExclusionCheckboxes();
        this.updateQuestionPoolCount();
      } else {
        console.error("No se encontraron preguntas disponibles.");
      }
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
    // Redondear al múltiplo de 5 más cercano
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
      this.startQuizBtn.addEventListener('click', () => this.startQuiz());
    }

    if (this.quizNextBtn) {
      this.quizNextBtn.addEventListener('click', () => this.nextQuestion());
    }

    if (this.quizQuitBtn) {
      this.quizQuitBtn.addEventListener('click', () => {
        if (confirm("¿Deseas salir del examen actual? Perderás el progreso de este intento.")) {
          this.endQuizSession();
          this.showSection('setup');
        }
      });
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

    // Atajos de teclado: 1-4 para responder, Enter / Espacio para avanzar
    window.addEventListener('keydown', (e) => {
      if (!this.state.isActive || this.state.isFinished) return;

      const key = e.key;
      const isAnswered = this.state.userAnswers[this.state.currentIndex] !== undefined;

      if (!isAnswered) {
        if (['1', '2', '3', '4'].includes(key)) {
          const index = parseInt(key, 10) - 1;
          const buttons = this.quizOptionsContainer.querySelectorAll('.quiz-option-btn');
          if (buttons[index]) {
            buttons[index].click();
          }
        }
      } else {
        if (key === 'Enter' || key === ' ' || key === 'ArrowRight') {
          e.preventDefault();
          this.nextQuestion();
        }
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

  // Generación y mezcla aleatoria de preguntas Y respuestas
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

    // 1. MEZCLA ALEATORIA DE PREGUNTAS (Fisher-Yates)
    const shuffledPool = this.shuffleArray(pool);
    const targetCount = Math.min(this.config.questionCount, shuffledPool.length);
    const selected = shuffledPool.slice(0, targetCount);

    // 2. MEZCLA ALEATORIA DE LAS OPCIONES PARA CADA PREGUNTA
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
      userAnswers: [],
      correctCount: 0,
      incorrectCount: 0,
      startTime: Date.now(),
      endTime: null,
      timerInterval: null
    };

    this.startTimer();
    this.showSection('active');
    this.renderCurrentQuestion();
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
    const q = this.state.questions[this.state.currentIndex];
    const total = this.state.questions.length;
    const currentNum = this.state.currentIndex + 1;
    const remaining = total - currentNum;

    if (this.quizProgressText) {
      this.quizProgressText.innerHTML = `Pregunta <strong>${currentNum}</strong> de <strong>${total}</strong>`;
    }
    if (this.quizRemainingBadge) {
      this.quizRemainingBadge.innerHTML = `<span>Quedan <strong>${remaining}</strong></span>`;
    }
    if (this.quizProgressBar) {
      const pct = (currentNum / total) * 100;
      this.quizProgressBar.style.width = `${pct}%`;
    }

    this.updateLiveGrade();

    const meta = this.topicsMetadata ? this.topicsMetadata[q.topic] : null;
    if (this.quizTopicTag && meta) {
      this.quizTopicTag.textContent = `Tema ${q.topic}: ${meta.badge}`;
      this.quizTopicTag.style.backgroundColor = `${meta.color}20`;
      this.quizTopicTag.style.borderColor = meta.color;
      this.quizTopicTag.style.color = meta.color;
    }

    if (this.quizQuestionText) {
      this.quizQuestionText.textContent = q.question;
    }

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

        btn.addEventListener('click', () => this.handleOptionSelection(index, btn));
        this.quizOptionsContainer.appendChild(btn);
      });
    }

    if (this.quizFeedbackCard) {
      this.quizFeedbackCard.style.display = 'none';
      this.quizFeedbackCard.className = 'quiz-feedback-card';
    }
    if (this.quizNextBtn) {
      this.quizNextBtn.style.display = 'none';
    }
  }

  handleOptionSelection(selectedIndex, clickedBtn) {
    if (this.state.userAnswers[this.state.currentIndex] !== undefined) return;

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
    this.renderFeedback(isCorrect, q);

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
    const answeredCount = this.state.userAnswers.filter(a => a !== undefined).length;
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

  nextQuestion() {
    if (this.state.currentIndex < this.state.questions.length - 1) {
      this.state.currentIndex++;
      this.renderCurrentQuestion();
      window.scrollTo({ top: this.quizActiveSection.offsetTop - 80, behavior: 'smooth' });
    } else {
      this.finishQuiz();
    }
  }

  finishQuiz() {
    this.state.isFinished = true;
    this.state.endTime = Date.now();
    if (this.state.timerInterval) clearInterval(this.state.timerInterval);

    this.renderResults();
    this.showSection('results');
    window.scrollTo({ top: this.quizResultsSection.offsetTop - 80, behavior: 'smooth' });
  }

  renderResults() {
    const total = this.state.questions.length;
    const corrects = this.state.correctCount;
    const incorrects = total - corrects;
    const finalGradeNum = ((corrects / total) * 10);
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
    if (this.resIncorrectCount) this.resIncorrectCount.textContent = incorrects;
    if (this.resTotalQuestions) this.resTotalQuestions.textContent = total;

    if (this.resTimeTaken && this.state.startTime) {
      const elapsed = Math.floor((this.state.endTime - this.state.startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      this.resTimeTaken.textContent = `${mins}m ${secs}s`;
    }

    if (this.resTopicBreakdown) {
      this.resTopicBreakdown.innerHTML = '';
      const topicStats = {};

      this.state.questions.forEach((q, idx) => {
        const tId = q.topic;
        if (!topicStats[tId]) {
          topicStats[tId] = { total: 0, correct: 0 };
        }
        topicStats[tId].total++;
        if (this.state.userAnswers[idx] && this.state.userAnswers[idx].isCorrect) {
          topicStats[tId].correct++;
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
            <strong>Tema ${tId}</strong>: ${meta.shortTitle}
          </div>
          <div class="stat-score">${stat.correct} / ${stat.total} aciertos (${pct}%)</div>
          <div class="stat-progress">
            <div class="stat-bar" style="width: ${pct}%; background-color: ${meta.color}"></div>
          </div>
        `;
        this.resTopicBreakdown.appendChild(card);
      });
    }

    if (this.resReviewList) {
      this.resReviewList.innerHTML = '';
      const letters = ['A', 'B', 'C', 'D'];

      this.state.questions.forEach((q, idx) => {
        const ans = this.state.userAnswers[idx];
        const isCorrect = ans && ans.isCorrect;
        const meta = this.topicsMetadata ? this.topicsMetadata[q.topic] : null;

        const item = document.createElement('div');
        item.className = `review-item ${isCorrect ? 'was-correct' : 'was-incorrect'}`;
        item.innerHTML = `
          <div class="review-item-header">
            <span class="review-index">#${idx + 1}</span>
            <span class="review-status-badge ${isCorrect ? 'ok' : 'ko'}">
              ${isCorrect ? 'Acierto' : 'Fallo'}
            </span>
            <span class="review-topic-tag" style="color: ${meta ? meta.color : '#6366f1'}">Tema ${q.topic}</span>
          </div>
          <div class="review-question">${this.escapeHTML(q.question)}</div>
          <div class="review-answers-grid">
            <div class="review-user-answer ${isCorrect ? 'ok' : 'ko'}">
              <strong>Tu respuesta:</strong> ${ans ? letters[ans.selectedIndex] + ') ' + this.escapeHTML(q.options[ans.selectedIndex]) : 'No contestada'}
            </div>
            ${!isCorrect ? `
              <div class="review-correct-answer">
                <strong>Respuesta correcta:</strong> ${letters[q.correct]}) ${this.escapeHTML(q.options[q.correct])}
              </div>
            ` : ''}
          </div>
          <div class="review-explanation">
            <strong>Justificación:</strong> ${this.escapeHTML(q.explanation)}
          </div>
        `;
        this.resReviewList.appendChild(item);
      });
    }
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
