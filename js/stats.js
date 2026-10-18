// =============================================================================
// SERVICIO DE ESTADÍSTICAS Y DASHBOARD - DAC: DISEÑO Y ADAPTACIÓN CURRICULAR
// Persistencia centralizada en Cloud Firestore por usuario
// Métricas por temas (más fallados vs menos fallados), historial de tests y muro de errores
// =============================================================================

class QuizStatsService {
  constructor() {
    this.STORAGE_KEY = 'dac_quiz_stats_v2';
    this.stats = this.loadStats();
  }

  getDefaultStats() {
    return {
      version: 2,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      exams: [], // Historial de exámenes realizados
      topicStats: {
        1: { id: 1, answered: 0, correct: 0, incorrect: 0 },
        2: { id: 2, answered: 0, correct: 0, incorrect: 0 },
        3: { id: 3, answered: 0, correct: 0, incorrect: 0 },
        4: { id: 4, answered: 0, correct: 0, incorrect: 0 }
      },
      questionStats: {} // { [qId]: { id, topic, question, timesAnswered, timesCorrect, timesIncorrect, explanation, options, correct } }
    };
  }

  loadStats() {
    return this.getDefaultStats();
  }

  saveStats() {
    this.stats.lastUpdated = new Date().toISOString();
  }

  resetStats() {
    this.stats = this.getDefaultStats();
    this.saveStats();
    if (window.cloudSyncManager && typeof window.cloudSyncManager.resetRemoteStats === 'function') {
      window.cloudSyncManager.resetRemoteStats();
    }
  }

  recordExam(examData) {
    if (!examData) return;

    const {
      mode,
      selectedTopic,
      questions,
      userAnswers,
      correctCount,
      incorrectCount,
      skippedCount,
      grade,
      elapsedSeconds
    } = examData;

    const examId = 'exam_' + Date.now();
    const dateStr = new Date().toISOString();

    // 1. Procesar preguntas del examen y sus fallos
    const failedQuestions = [];
    const questionsBreakdown = [];

    questions.forEach((q, idx) => {
      const ans = userAnswers[idx];
      const isAnswered = ans && !ans.isSkipped;
      const isCorrect = isAnswered && ans.isCorrect;
      const qId = q.originalQuestionId || q.id;
      const topicId = q.topic;

      // Actualizar stats por tema
      if (!this.stats.topicStats[topicId]) {
        this.stats.topicStats[topicId] = { id: topicId, answered: 0, correct: 0, incorrect: 0 };
      }

      if (isAnswered) {
        this.stats.topicStats[topicId].answered++;
        if (isCorrect) {
          this.stats.topicStats[topicId].correct++;
        } else {
          this.stats.topicStats[topicId].incorrect++;
        }
      }

      // Actualizar registro de la pregunta individual
      if (!this.stats.questionStats[qId]) {
        this.stats.questionStats[qId] = {
          id: qId,
          topic: topicId,
          question: q.question,
          options: q.options,
          correct: q.correct,
          explanation: q.explanation,
          timesAnswered: 0,
          timesCorrect: 0,
          timesIncorrect: 0,
          lastAnswered: dateStr
        };
      }

      const qRecord = this.stats.questionStats[qId];
      if (isAnswered) {
        qRecord.timesAnswered++;
        if (isCorrect) {
          qRecord.timesCorrect++;
        } else {
          qRecord.timesIncorrect++;
          failedQuestions.push({
            id: qId,
            topic: topicId,
            question: q.question,
            options: q.options,
            correct: q.correct,
            explanation: q.explanation,
            userChoice: ans ? ans.selectedIndex : null
          });
        }
      } else {
        // Si fue pasada/saltada y no respondida, también la guardamos como fallo para repaso
        failedQuestions.push({
          id: qId,
          topic: topicId,
          question: q.question,
          options: q.options,
          correct: q.correct,
          explanation: q.explanation,
          userChoice: null,
          skipped: true
        });
      }

      questionsBreakdown.push({
        id: qId,
        topic: topicId,
        question: q.question,
        userAnswer: ans ? ans.selectedIndex : null,
        correctAnswer: q.correct,
        isCorrect: !!isCorrect,
        isSkipped: !!ans?.isSkipped
      });
    });

    // 2. Registrar examen en el historial (máximo 50 exámenes recientes)
    const examRecord = {
      id: examId,
      date: dateStr,
      mode: mode || 'all',
      selectedTopic: selectedTopic || null,
      totalQuestions: questions.length,
      correctCount: correctCount || 0,
      incorrectCount: incorrectCount || 0,
      skippedCount: skippedCount || 0,
      grade: typeof grade === 'number' ? grade : parseFloat(grade) || 0,
      elapsedSeconds: elapsedSeconds || 0,
      failedQuestions: failedQuestions,
      questionsBreakdown: questionsBreakdown
    };

    this.stats.exams.unshift(examRecord);
    if (this.stats.exams.length > 50) {
      this.stats.exams = this.stats.exams.slice(0, 50);
    }

    this.saveStats();

    // Notificar al gestor de sincronización en la nube si está activo
    if (window.cloudSyncManager && typeof window.cloudSyncManager.onExamRecorded === 'function') {
      try {
        window.cloudSyncManager.onExamRecorded();
      } catch (e) {
        console.warn('Auto-sync notification error:', e);
      }
    }

    return examRecord;
  }

  getSummary() {
    const exams = this.stats.exams;
    const totalExams = exams.length;

    let totalAnswered = 0;
    let totalCorrect = 0;
    let totalIncorrect = 0;
    let totalTime = 0;
    let totalGrade = 0;

    exams.forEach(ex => {
      totalAnswered += (ex.correctCount + ex.incorrectCount);
      totalCorrect += ex.correctCount;
      totalIncorrect += ex.incorrectCount;
      totalTime += (ex.elapsedSeconds || 0);
      totalGrade += ex.grade;
    });

    const averageGrade = totalExams > 0 ? (totalGrade / totalExams).toFixed(2) : '0.00';
    const accuracyRate = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    // Métricas por temas
    const topicsArr = [1, 2, 3, 4].map(tId => {
      const t = this.stats.topicStats[tId] || { id: tId, answered: 0, correct: 0, incorrect: 0 };
      const accuracy = t.answered > 0 ? Math.round((t.correct / t.answered) * 100) : null;
      return {
        id: tId,
        answered: t.answered,
        correct: t.correct,
        incorrect: t.incorrect,
        accuracy: accuracy
      };
    });

    // Identificar temas con datos
    const topicsWithData = topicsArr.filter(t => t.answered > 0);

    let bestTopic = null; // Menor % de fallos (mayor acierto)
    let worstTopic = null; // Mayor % de fallos (menor acierto)

    if (topicsWithData.length > 0) {
      // Ordenar por accuracy desc: mayor accuracy es el mejor
      const sortedByAccuracy = [...topicsWithData].sort((a, b) => b.accuracy - a.accuracy);
      bestTopic = sortedByAccuracy[0];
      worstTopic = sortedByAccuracy[sortedByAccuracy.length - 1];
    }

    // Top preguntas más falladas (muro de fallos)
    const topFailedQuestions = Object.values(this.stats.questionStats)
      .filter(q => q.timesIncorrect > 0)
      .sort((a, b) => b.timesIncorrect - a.timesIncorrect)
      .slice(0, 15);

    return {
      totalExams,
      totalAnswered,
      totalCorrect,
      totalIncorrect,
      totalTime,
      averageGrade,
      accuracyRate,
      topics: topicsArr,
      bestTopic,
      worstTopic,
      topFailedQuestions,
      recentExams: exams.slice(0, 15)
    };
  }
}

// Instancia global
window.quizStats = new QuizStatsService();

// =============================================================================
// GESTOR DEL DASHBOARD DE RENDIMIENTO (RENDERIZADOR)
// =============================================================================

class DashboardManager {
  constructor() {
    this.statsService = window.quizStats;
    this.topicsMetadata = null;
    this.init();
  }

  init() {
    this.container = document.getElementById('view-dashboard');
    if (!this.container) return;

    // Vincular botón de reseteo si existe
    this.bindEvents();
  }

  bindEvents() {
    document.addEventListener('click', (e) => {
      const resetBtn = e.target.closest('#btn-reset-stats');
      if (resetBtn) {
        if (confirm("¿Estás seguro de que deseas reiniciar todas tus estadísticas históricas y tu historial de exámenes? Esta acción no se puede deshacer.")) {
          this.statsService.resetStats();
          this.render();
          alert("Estadísticas reiniciadas con éxito.");
        }
      }

      // Botón para repetir fallos desde el historial del dashboard
      const repeatExamErrorsBtn = e.target.closest('.btn-dash-repeat-errors');
      if (repeatExamErrorsBtn) {
        const examId = repeatExamErrorsBtn.dataset.examId;
        this.repeatExamErrors(examId);
      }

      // Botón para lanzar test de un tema concreto desde el dashboard
      const launchTopicTestBtn = e.target.closest('.btn-dash-test-topic');
      if (launchTopicTestBtn) {
        const topicId = parseInt(launchTopicTestBtn.dataset.topic, 10);
        this.launchTopicTest(topicId);
      }

      // Acordeón en preguntas más falladas
      const failedHeader = e.target.closest('.failed-q-header');
      if (failedHeader) {
        const item = failedHeader.closest('.failed-question-item');
        if (item) {
          item.classList.toggle('expanded');
        }
      }
    });
  }

  repeatExamErrors(examId) {
    const exam = this.statsService.stats.exams.find(e => e.id === examId);
    if (!exam || !exam.failedQuestions || exam.failedQuestions.length === 0) {
      alert("Este examen no tiene preguntas falladas para repetir.");
      return;
    }

    if (window.quizApp) {
      // Cambiar a la pestaña de examen
      if (window.dacApp) window.dacApp.switchTab('view-quiz');
      window.quizApp.startQuizWithCustomQuestions(exam.failedQuestions, `Repaso Fallos Examen (${new Date(exam.date).toLocaleDateString()})`);
    }
  }

  launchTopicTest(topicId) {
    if (window.dacApp) window.dacApp.switchTab('view-quiz');
    if (window.quizApp) {
      window.quizApp.config.mode = 'topic';
      window.quizApp.config.selectedTopic = topicId;
      if (window.quizApp.modeTopicRadio) window.quizApp.modeTopicRadio.checked = true;
      window.quizApp.handleModeChange('topic');
      // Marcar radio button visual
      const radios = document.querySelectorAll('input[name="selected-topic-radio"]');
      radios.forEach(r => {
        if (parseInt(r.value, 10) === topicId) r.checked = true;
      });
      window.quizApp.startQuiz(true);
    }
  }

  render() {
    if (!this.container) return;
    if (window.DAC_DATA) {
      this.topicsMetadata = window.DAC_DATA.topics;
    }

    const summary = this.statsService.getSummary();
    const meta = this.topicsMetadata || {};

    const formatTime = (secs) => {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      if (m > 60) {
        const h = Math.floor(m / 60);
        const remM = m % 60;
        return `${h}h ${remM}m`;
      }
      return `${m}m ${s}s`;
    };

    // Nombres descriptivos de temas
    const getTopicName = (id) => {
      if (meta[id]) return meta[id].badge || `Tema ${id}`;
      return `Tema ${id}`;
    };

    const getTopicColor = (id) => {
      if (meta[id]) return meta[id].color || '#6366f1';
      const colors = { 1: '#6366f1', 2: '#06b6d4', 3: '#10b981', 4: '#f59e0b' };
      return colors[id] || '#6366f1';
    };

    // Formato de notas
    const gradeClass = (grade) => {
      const g = parseFloat(grade);
      if (g >= 8.5) return 'grade-excellent';
      if (g >= 7.0) return 'grade-good';
      if (g >= 5.0) return 'grade-pass';
      return 'grade-fail';
    };

    // Renderizado del HTML completo
    this.container.innerHTML = `
      <div class="dash-header">
        <div class="dash-title-group">
          <div class="dash-badge-pill">
            <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
              <path d="M22 12A10 10 0 0 0 12 2v10z"/>
            </svg>
            <span>Analítica de Aprendizaje</span>
          </div>
          <h2>Dashboard de Rendimiento & Análisis por Temas</h2>
          <p>Métricas acumuladas de aciertos, detección de temas críticos y muro de preguntas falladas para optimizar tu estudio del Máster DAC.</p>
        </div>
        <div class="dash-header-actions">
          <button type="button" class="btn-dash-reset" id="btn-reset-stats" title="Borrar historial y métricas">
            <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>Reiniciar Métricas</span>
          </button>
        </div>
      </div>

      ${summary.totalExams === 0 ? `
        <!-- Estado Vacío (Sin exámenes realizados) -->
        <div class="dash-empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <h3>Aún no hay datos de examen registrados</h3>
          <p>Realiza tu primer examen tipo test en el <strong>Generador de Exámenes</strong> para desbloquear aquí el análisis de tus temas más y menos fallados, tu nota media y tus preguntas a repasar.</p>
          <button type="button" class="btn-primary-gradient" onclick="window.dacApp && window.dacApp.switchTab('view-quiz')">
            <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2.2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>Ir al Generador y Hacer un Test</span>
          </button>
        </div>
      ` : `
        <!-- 1. Tarjetas de Resumen Global -->
        <div class="dash-metrics-grid">
          <div class="dash-metric-card">
            <div class="dash-card-icon icon-exams">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            </div>
            <div class="dash-card-val">${summary.totalExams}</div>
            <div class="dash-card-label">Exámenes Completados</div>
            <div class="dash-card-sub">${summary.totalAnswered} preguntas respondidas</div>
          </div>

          <div class="dash-metric-card">
            <div class="dash-card-icon icon-grade">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="8" r="7"/>
                <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
              </svg>
            </div>
            <div class="dash-card-val grade-accent">${summary.averageGrade}</div>
            <div class="dash-card-label">Nota Media Global</div>
            <div class="dash-card-sub">Escala oficial de 0 a 10</div>
          </div>

          <div class="dash-metric-card">
            <div class="dash-card-icon icon-accuracy">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div class="dash-card-val" style="color: #10b981;">${summary.accuracyRate}%</div>
            <div class="dash-card-label">Tasa Global de Aciertos</div>
            <div class="dash-card-sub">${summary.totalCorrect} aciertos · ${summary.totalIncorrect} fallos</div>
          </div>

          <div class="dash-metric-card">
            <div class="dash-card-icon icon-time">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div class="dash-card-val">${formatTime(summary.totalTime)}</div>
            <div class="dash-card-label">Tiempo Total en Tests</div>
            <div class="dash-card-sub">Media: ${summary.totalExams > 0 ? formatTime(Math.round(summary.totalTime / summary.totalExams)) : '0s'} / test</div>
          </div>
        </div>

        <!-- 2. Comparativa Clave: Tema Más Dominado vs Tema Más Fallado -->
        <div class="dash-insights-section">
          <div class="dash-section-header">
            <h3>Diagnóstico de Rendimiento por Temas</h3>
            <span class="dash-section-desc">Identifica de un vistazo tus fortalezas y las áreas donde necesitas incidir para el examen final.</span>
          </div>

          <div class="insights-grid">
            <!-- TEMA MÁS DOMINADO -->
            <div class="insight-card best-topic-card">
              <div class="insight-badge badge-best">
                <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span>Tema Mejor Dominado (Menos Fallos)</span>
              </div>
              ${summary.bestTopic ? `
                <div class="insight-topic-meta">
                  <div class="insight-topic-title">
                    <span class="topic-dot" style="background-color: ${getTopicColor(summary.bestTopic.id)}"></span>
                    <strong>Tema ${summary.bestTopic.id}:</strong> ${getTopicName(summary.bestTopic.id)}
                  </div>
                  <div class="insight-stat-row">
                    <div class="insight-stat-val text-success">${summary.bestTopic.accuracy}% de acierto</div>
                    <div class="insight-stat-sub">(${summary.bestTopic.correct} aciertos de ${summary.bestTopic.answered})</div>
                  </div>
                  <div class="insight-progress-bar">
                    <div class="insight-progress-fill fill-success" style="width: ${summary.bestTopic.accuracy}%"></div>
                  </div>
                  <p class="insight-tip">¡Gran trabajo! Tienes este bloque bien consolidado. Mantén la frescura repasando ocasionalmente.</p>
                </div>
              ` : `
                <p class="insight-none">Aún no hay suficientes datos para determinar tu tema fuerte.</p>
              `}
            </div>

            <!-- TEMA MÁS FALLADO / CRÍTICO -->
            <div class="insight-card worst-topic-card">
              <div class="insight-badge badge-worst">
                <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>Tema Más Fallado (Requiere Refuerzo)</span>
              </div>
              ${summary.worstTopic ? `
                <div class="insight-topic-meta">
                  <div class="insight-topic-title">
                    <span class="topic-dot" style="background-color: ${getTopicColor(summary.worstTopic.id)}"></span>
                    <strong>Tema ${summary.worstTopic.id}:</strong> ${getTopicName(summary.worstTopic.id)}
                  </div>
                  <div class="insight-stat-row">
                    <div class="insight-stat-val text-danger">${summary.worstTopic.accuracy !== null ? summary.worstTopic.accuracy + '%' : '0%'} de acierto</div>
                    <div class="insight-stat-sub">(${summary.worstTopic.incorrect} fallos de ${summary.worstTopic.answered})</div>
                  </div>
                  <div class="insight-progress-bar">
                    <div class="insight-progress-fill fill-danger" style="width: ${summary.worstTopic.accuracy || 0}%"></div>
                  </div>
                  <p class="insight-tip">Atención prioritaria: este tema acumula la mayor tasa de errores. Pulsa para entrenarlo.</p>
                  <button type="button" class="btn-dash-test-topic btn-topic-focus" data-topic="${summary.worstTopic.id}">
                    <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <span>Entrenar Tema ${summary.worstTopic.id} Ahora</span>
                  </button>
                </div>
              ` : `
                <p class="insight-none">Aún no hay suficientes datos para determinar el tema crítico.</p>
              `}
            </div>
          </div>
        </div>

        <!-- 3. Desglose Exhaustivo de los 4 Temas -->
        <div class="dash-topics-section">
          <div class="dash-section-header">
            <h3>Desglose Detallado por Temas</h3>
            <span class="dash-section-desc">Volumen de preguntas estudiadas, aciertos, fallos y botón de entrenamiento directo por bloque.</span>
          </div>

          <div class="dash-topics-grid">
            ${summary.topics.map(t => {
              const topicMeta = meta[t.id] || { title: `Tema ${t.id}`, shortTitle: `Tema ${t.id}`, badge: `Tema ${t.id}`, color: '#6366f1' };
              const acc = t.accuracy !== null ? t.accuracy : null;
              let statusLabel = 'Sin datos';
              let statusClass = 'status-nodata';
              if (acc !== null) {
                if (acc >= 80) { statusLabel = 'Dominado'; statusClass = 'status-expert'; }
                else if (acc >= 60) { statusLabel = 'Aceptable'; statusClass = 'status-medium'; }
                else { statusLabel = 'Reforzar'; statusClass = 'status-low'; }
              }

              return `
                <div class="dash-topic-card" style="--topic-accent: ${topicMeta.color}">
                  <div class="dash-topic-top">
                    <span class="dash-topic-pill" style="background-color: ${topicMeta.color}25; color: ${topicMeta.color}; border: 1px solid ${topicMeta.color}50;">
                      Tema ${t.id}
                    </span>
                    <span class="dash-status-badge ${statusClass}">${statusLabel}</span>
                  </div>

                  <h4 class="dash-topic-name">${topicMeta.shortTitle || topicMeta.title}</h4>
                  <div class="dash-topic-badge-name">${topicMeta.badge}</div>

                  <div class="dash-topic-stats-row">
                    <div class="stat-col">
                      <span class="stat-num">${t.answered}</span>
                      <span class="stat-lbl">Respondidas</span>
                    </div>
                    <div class="stat-col">
                      <span class="stat-num text-success">${t.correct}</span>
                      <span class="stat-lbl">Aciertos</span>
                    </div>
                    <div class="stat-col">
                      <span class="stat-num text-danger">${t.incorrect}</span>
                      <span class="stat-lbl">Fallos</span>
                    </div>
                    <div class="stat-col">
                      <span class="stat-num font-bold">${acc !== null ? acc + '%' : '-'}</span>
                      <span class="stat-lbl">% Éxito</span>
                    </div>
                  </div>

                  <div class="dash-topic-progress-track">
                    <div class="dash-topic-progress-fill" style="width: ${acc !== null ? acc : 0}%; background-color: ${topicMeta.color};"></div>
                  </div>

                  <div class="dash-topic-action">
                    <button type="button" class="btn-dash-test-topic" data-topic="${t.id}">
                      <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      <span>Hacer Test Tema ${t.id}</span>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 4. Top Preguntas Más Falladas (Muro de Errores) -->
        <div class="dash-failed-questions-section">
          <div class="dash-section-header">
            <div class="header-with-badge">
              <h3>Muro de Errores: Preguntas Más Falladas</h3>
              <span class="badge-count">${summary.topFailedQuestions.length} detectadas</span>
            </div>
            <span class="dash-section-desc">Las preguntas específicas que más se te han atragantado. Haz clic en cualquiera para ver su solución y justificación teórica.</span>
          </div>

          ${summary.topFailedQuestions.length === 0 ? `
            <div class="dash-all-passed-box">
              <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>¡Excelente! No tienes preguntas con fallos reiterados. Sigue practicando.</span>
            </div>
          ` : `
            <div class="failed-questions-list">
              ${summary.topFailedQuestions.map((q, idx) => {
                const topicColor = getTopicColor(q.topic);
                const letters = ['A', 'B', 'C', 'D'];
                const correctLetter = letters[q.correct] || 'A';
                const correctText = q.options && q.options[q.correct] ? q.options[q.correct] : '';

                return `
                  <div class="failed-question-item">
                    <div class="failed-q-header">
                      <div class="failed-q-left">
                        <span class="failed-q-rank">#${idx + 1}</span>
                        <span class="failed-q-topic" style="color: ${topicColor};">Tema ${q.topic}</span>
                        <span class="failed-times-badge">
                          ${q.timesIncorrect} ${q.timesIncorrect === 1 ? 'fallo' : 'fallos'}
                        </span>
                        <span class="failed-q-preview">${this.escapeHTML(q.question)}</span>
                      </div>
                      <div class="failed-q-arrow">
                        <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </div>
                    </div>

                    <div class="failed-q-body">
                      <div class="failed-full-question">${this.escapeHTML(q.question)}</div>
                      <div class="failed-options-box">
                        <div class="failed-correct-pill">
                          <strong>Opción correcta: ${correctLetter})</strong> ${this.escapeHTML(correctText)}
                        </div>
                        <div class="failed-explanation-pill">
                          <strong>Justificación teórica:</strong> ${this.escapeHTML(q.explanation)}
                        </div>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- 5. Historial Reciente de Exámenes -->
        <div class="dash-history-section">
          <div class="dash-section-header">
            <h3>Historial de Exámenes Realizados</h3>
            <span class="dash-section-desc">Registro cronológico de los últimos intentos. Puedes repetir exclusivamente los fallos de cualquiera de ellos.</span>
          </div>

          <div class="dash-history-table-wrapper">
            <table class="dash-history-table">
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Modo / Tema</th>
                  <th>Preguntas</th>
                  <th>Aciertos / Fallos</th>
                  <th>Nota Final</th>
                  <th>Tiempo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${summary.recentExams.map(ex => {
                  const d = new Date(ex.date);
                  const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const modeStr = ex.mode === 'topic' ? `Tema ${ex.selectedTopic}` : 'Todos los Temas';
                  const failedCount = ex.failedQuestions ? ex.failedQuestions.length : ex.incorrectCount;

                  return `
                    <tr>
                      <td class="history-date">${dateStr}</td>
                      <td><span class="history-mode-pill">${modeStr}</span></td>
                      <td class="text-center">${ex.totalQuestions}</td>
                      <td class="text-center">
                        <span class="text-success font-bold">${ex.correctCount}</span> / 
                        <span class="text-danger font-bold">${ex.incorrectCount}</span>
                      </td>
                      <td>
                        <span class="history-grade-badge ${gradeClass(ex.grade)}">
                          ${ex.grade.toFixed(1)} / 10
                        </span>
                      </td>
                      <td class="text-dim text-center">${formatTime(ex.elapsedSeconds)}</td>
                      <td class="text-center">
                        ${failedCount > 0 ? `
                          <button type="button" class="btn-dash-repeat-errors" data-exam-id="${ex.id}" title="Repetir solo las preguntas que fallaste en este intento">
                            <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                              <polyline points="23 4 23 10 17 10"/>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                            <span>Repetir ${failedCount} fallos</span>
                          </button>
                        ` : `
                          <span class="text-success font-bold" style="font-size: 0.82rem;">100% Perfecto</span>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;
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

// Instancia global
window.dashboardManager = new DashboardManager();
