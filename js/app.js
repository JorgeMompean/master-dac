// =============================================================================
// APLICACIÓN PRINCIPAL - DAC: DISEÑO Y ADAPTACIÓN CURRICULAR (MÁSTER EN PROFESORADO)
// Datos y progreso centralizados en Firebase
// Píldoras de filtro maquetables en el Banco de Estudio
// =============================================================================

class MasterDACApp {
  constructor() {
    this.currentTopicId = 1;
    this.currentFileIndex = 0;
    this.isViewerFullscreen = false;
    this.topicsMetadata = null;
    this.questionsData = null;
    this.bankFilterTopic = 'all';

    this.initElements();
    this.initTheme();
    this.bindEvents();
    this.bindMenu();
    document.addEventListener('dac-questions-ready', () => this.loadData());
    this.loadData();
  }

  bindMenu() {
    const menuButton = document.getElementById('menu-toggle-btn');
    const nav = document.getElementById('main-nav');
    if (!menuButton || !nav) return;

    menuButton.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('menu-open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
    });

    nav.addEventListener('click', (event) => {
      if (event.target.closest('.nav-tab')) {
        nav.classList.remove('menu-open');
        menuButton.setAttribute('aria-expanded', 'false');
      }
    });
  }

  initElements() {
    this.themeToggleBtn = document.getElementById('theme-toggle-btn');
    this.themeIconContainer = document.getElementById('theme-icon-container');

    this.navTabs = document.querySelectorAll('.nav-tab');
    this.tabSections = document.querySelectorAll('.view-section');

    this.topicPills = document.querySelectorAll('.topic-pill');
    this.topicTitleEl = document.getElementById('active-topic-title');
    this.topicBadgeEl = document.getElementById('active-topic-badge');
    this.topicDescEl = document.getElementById('active-topic-desc');
    this.fileListContainer = document.getElementById('topic-files-list');

    this.pdfViewerFrame = document.getElementById('pdf-viewer-frame');
    this.pdfFileNameEl = document.getElementById('viewer-file-name');
    this.pdfFileSizeEl = document.getElementById('viewer-file-size');
    this.pdfDownloadLink = document.getElementById('viewer-download-link');
    this.pdfFullscreenBtn = document.getElementById('viewer-fullscreen-btn');
    this.pdfFullscreenBtnText = document.getElementById('fullscreen-btn-text');
    this.pdfViewerContainer = document.getElementById('document-viewer-container');
    this.pdfQuickSwitchContainer = document.getElementById('viewer-quick-switch');

    // Píldoras de filtro en el banco
    this.bankFilterPills = document.querySelectorAll('.bank-pill-btn');
    this.bankSearchInput = document.getElementById('bank-search-input');
    this.bankQuestionsGrid = document.getElementById('bank-questions-grid');
    this.bankCountBadge = document.getElementById('bank-count-badge');
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

      this.renderTopicContent();
      this.renderStudyBank();
      if (window.dashboardManager) window.dashboardManager.render();
    } catch (e) {
      console.warn("Fallo cargando el banco de preguntas desde Firestore:", e);
      this.questionsData = null;
    }
  }

  initTheme() {
    const savedTheme = localStorage.getItem('dac_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'dark');

    this.setTheme(initialTheme);

    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.contains('theme-dark');
        const nextTheme = isDark ? 'light' : 'dark';
        this.setTheme(nextTheme);
      });
    }
  }

  setTheme(theme) {
    if (theme === 'dark') {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      if (this.themeIconContainer) {
        this.themeIconContainer.innerHTML = `
          <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        `;
      }
      localStorage.setItem('dac_theme', 'dark');
    } else {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      if (this.themeIconContainer) {
        this.themeIconContainer.innerHTML = `
          <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        `;
      }
      localStorage.setItem('dac_theme', 'light');
    }
  }

  bindEvents() {
    this.navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetViewId = tab.dataset.target;
        this.switchTab(targetViewId);
      });
    });

    this.topicPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const topicId = parseInt(pill.dataset.topic, 10);
        this.selectTopic(topicId);
      });
    });

    if (this.pdfFullscreenBtn) {
      this.pdfFullscreenBtn.addEventListener('click', () => this.toggleViewerFullscreen());
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isViewerFullscreen) {
        this.toggleViewerFullscreen(false);
      }
    });

    // Píldoras de filtro en el banco de estudio
    this.bankFilterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        this.bankFilterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.bankFilterTopic = pill.dataset.topic;
        this.filterStudyBank();
      });
    });

    if (this.bankSearchInput) {
      this.bankSearchInput.addEventListener('input', () => this.filterStudyBank());
    }
  }

  switchTab(viewId) {
    if (viewId === 'view-dashboard' && !window.cloudSyncManager?.currentUser) {
      window.cloudSyncManager?.openModal();
      return;
    }

    this.navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.target === viewId);
    });

    this.tabSections.forEach(sec => {
      sec.classList.toggle('active', sec.id === viewId);
    });

    if (viewId === 'view-quiz' && window.quizApp) {
      window.quizApp.updateQuestionPoolCount();
    }

    if (viewId === 'view-dashboard' && window.dashboardManager) {
      window.dashboardManager.render();
    }
  }

  selectTopic(topicId) {
    this.currentTopicId = topicId;
    this.currentFileIndex = 0;

    this.topicPills.forEach(pill => {
      pill.classList.toggle('active', parseInt(pill.dataset.topic, 10) === topicId);
    });

    this.renderTopicContent();
  }

  renderTopicContent() {
    if (!this.topicsMetadata) return;
    const meta = this.topicsMetadata[this.currentTopicId];
    if (!meta) return;

    if (this.topicTitleEl) this.topicTitleEl.textContent = meta.title;
    if (this.topicBadgeEl) {
      this.topicBadgeEl.textContent = meta.badge;
      this.topicBadgeEl.style.backgroundColor = `${meta.color}25`;
      this.topicBadgeEl.style.borderColor = meta.color;
      this.topicBadgeEl.style.color = meta.color;
    }
    if (this.topicDescEl) this.topicDescEl.textContent = meta.description;

    if (this.fileListContainer) {
      this.fileListContainer.innerHTML = '';

      meta.files.forEach((file, index) => {
        const isSelected = index === this.currentFileIndex;
        const card = document.createElement('div');
        card.className = `file-card ${isSelected ? 'active' : ''}`;
        card.innerHTML = `
          <div class="file-card-icon">
            <span class="file-type-badge">PDF</span>
            <svg viewBox="0 0 24 24" class="svg-inline card-doc-svg" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div class="file-card-details">
            <div class="file-card-name">${this.escapeHTML(file.displayName)}</div>
            <div class="file-card-meta">
              <span class="file-size-tag">${file.size}</span>
              <span class="file-exact-name">${this.escapeHTML(file.name)}</span>
            </div>
            <div class="file-card-desc">${this.escapeHTML(file.description)}</div>
          </div>
          <div class="file-card-action">
            <button type="button" class="btn-preview-file ${isSelected ? 'btn-current' : ''}">
              ${isSelected ? 'Documento activo' : 'Previsualizar'}
            </button>
          </div>
        `;

        card.addEventListener('click', () => {
          this.loadFilePreview(index);
        });

        this.fileListContainer.appendChild(card);
      });
    }

    if (this.pdfQuickSwitchContainer) {
      this.pdfQuickSwitchContainer.innerHTML = '';
      meta.files.forEach((file, index) => {
        const isCurrent = index === this.currentFileIndex;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `quick-file-btn ${isCurrent ? 'active' : ''}`;
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>${this.escapeHTML(file.displayName)}</span>
        `;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.loadFilePreview(index);
        });
        this.pdfQuickSwitchContainer.appendChild(btn);
      });
    }

    this.loadFilePreview(this.currentFileIndex);
    this.renderQuickStudyNotes(meta);
  }

  loadFilePreview(fileIndex) {
    if (!this.topicsMetadata) return;
    this.currentFileIndex = fileIndex;
    const meta = this.topicsMetadata[this.currentTopicId];
    const file = meta.files[fileIndex];
    if (!file) return;

    const cards = this.fileListContainer.querySelectorAll('.file-card');
    cards.forEach((card, idx) => {
      card.classList.toggle('active', idx === fileIndex);
      const btn = card.querySelector('.btn-preview-file');
      if (btn) {
        btn.classList.toggle('btn-current', idx === fileIndex);
        btn.textContent = idx === fileIndex ? 'Documento activo' : 'Previsualizar';
      }
    });

    if (this.pdfQuickSwitchContainer) {
      const qBtns = this.pdfQuickSwitchContainer.querySelectorAll('.quick-file-btn');
      qBtns.forEach((b, idx) => b.classList.toggle('active', idx === fileIndex));
    }

    if (this.pdfFileNameEl) this.pdfFileNameEl.textContent = `${meta.shortTitle}: ${file.displayName}`;
    if (this.pdfFileSizeEl) this.pdfFileSizeEl.textContent = `${file.size} • ${file.name}`;
    if (this.pdfDownloadLink) {
      const encodedPath = encodeURI(file.path);
      this.pdfDownloadLink.href = encodedPath;
      this.pdfDownloadLink.setAttribute('download', file.name);
    }

    if (this.pdfViewerFrame) {
      const encodedPath = encodeURI(file.path);
      this.pdfViewerFrame.src = `${encodedPath}#toolbar=1&navpanes=1&view=FitH`;
    }
  }

  toggleViewerFullscreen(forceState = null) {
    if (forceState !== null) {
      this.isViewerFullscreen = forceState;
    } else {
      this.isViewerFullscreen = !this.isViewerFullscreen;
    }

    if (this.pdfViewerContainer) {
      this.pdfViewerContainer.classList.toggle('is-fullscreen', this.isViewerFullscreen);
      document.body.classList.toggle('viewer-modal-open', this.isViewerFullscreen);
    }

    if (this.pdfFullscreenBtnText) {
      this.pdfFullscreenBtnText.textContent = this.isViewerFullscreen
        ? 'Salir de pantalla completa'
        : 'Pantalla completa';
    }
  }

  renderQuickStudyNotes(meta) {
    const notesContainer = document.getElementById('topic-quick-notes');
    if (!notesContainer) return;

    const notes = {
      1: [
        "<strong>LGE 1970 (Villar Palasí):</strong> Crea la EGB obligatoria y gratuita (6 a 14 años). Doble vía al finalizar: <em>Graduado Escolar</em> (acceso a BUP) vs <em>Certificado de Escolaridad</em> (FP1).",
        "<strong>Constitución de 1978 (Art. 27):</strong> Derecho universal a la educación, libertad de enseñanza, obligatoriedad y gratuidad básica, descentralización en CCAA.",
        "<strong>LODE 1985:</strong> Participación democrática de la comunidad escolar mediante el <em>Consejo Escolar</em> y regulación de centros concertados sostenidos con fondos públicos.",
        "<strong>LOGSE 1990:</strong> Escolarización obligatoria hasta los 16 años (Primaria 6-12, ESO 12-16). Enfoque constructivista, atención a la diversidad, FP en ciclos formativos.",
        "<strong>LOE 2006:</strong> Introduce las Competencias Básicas.",
        "<strong>LOMCE 2013:</strong> Asignaturas troncales/específicas, estándares de aprendizaje y reválidas.",
        "<strong>LOMLOE 2020:</strong> Enfoque competencial, Perfil de Salida, DUA (Diseño Universal de Aprendizaje), eliminación definitiva de estándares de aprendizaje y reválidas."
      ],
      2: [
        "<strong>Concepto de Currículo (LOMLOE):</strong> Objetivos, competencias, contenidos (saberes básicos), metodología y criterios de evaluación.",
        "<strong>Características:</strong> Abierto, flexible, orientador y prescriptivo en sus enseñanzas mínimas.",
        "<strong>Elementos LOMLOE:</strong> Perfil de Salida (núcleo vertebrador), 8 Competencias Clave, Competencias Específicas, Criterios de Evaluación, Saberes Básicos y Situaciones de Aprendizaje.",
        "<strong>Fuentes del Currículo:</strong> Sociológica (demandas sociales), Psicológica (procesos evolutivos y cognitivos del alumno), Pedagógica (práctica de aula) y Epistemológica (conocimiento científico de la disciplina).",
        "<strong>Niveles de Concreción:</strong> 1º Administración (Decretos), 2º Centro (PEC y Concreción Curricular), 3º Aula/Profesor (Programación didáctica), 4º Alumno individual (ACI / inclusión)."
      ],
      3: [
        "<strong>Comunidad Educativa:</strong> Alumnado, profesorado, familias, personal PAS y representantes municipales.",
        "<strong>Órganos Colegiados de Gobierno:</strong> Consejo Escolar (órgano representativo de toda la comunidad) y Claustro de Profesores (órgano de los docentes que aprueba la concreción curricular).",
        "<strong>Órganos Unipersonales (Equipo Directivo):</strong> Dirección, Vicedirección, Jefatura de Estudios (régimen académico y disciplina) y Secretaría (gestión económica, actas y archivo).",
        "<strong>Órganos de Coordinación Docente:</strong> COCOPE (Comisión de Coordinación Pedagógica), Departamentos Didácticos, Departamento de Orientación y Tutorías.",
        "<strong>Normativa en CV:</strong> Decreto 252/2019 de secundaria/bachillerato/FP y LOMLOE."
      ],
      4: [
        "<strong>Autonomía de Centros:</strong> Pedagógica, organizativa y de gestión económica.",
        "<strong>Documentos Atemporales (Medio/Largo Plazo):</strong> PEC (Proyecto Educativo de Centro: ideario, valores, Plan de Convivencia, PAM, PAT, PDC), RRI/ROF (convivencia, derechos y deberes) y Proyecto de Gestión.",
        "<strong>Documentos Temporales (Anuales):</strong> PGA (Programación General Anual, aprobada en octubre), Programaciones Didácticas de departamento, Memoria Anual / Final de Curso (balance y evaluación final) y PAM anual.",
        "<strong>Aprobación:</strong> El Consejo Escolar aprueba el PEC y la PGA, previo informe y evaluación de los aspectos educativos por el Claustro."
      ]
    };

    const list = notes[meta.id] || [];
    notesContainer.innerHTML = `
      <div class="notes-header">
        <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <h4>Puntos Clave para el Examen - Tema ${meta.id}</h4>
      </div>
      <ul class="notes-list">
        ${list.map(item => `<li>${item}</li>`).join('')}
      </ul>
    `;
  }

  // ==========================================
  // BANCO COMPLETO DE ESTUDIO
  // ==========================================
  renderStudyBank() {
    this.filterStudyBank();
  }

  filterStudyBank() {
    if (!this.bankQuestionsGrid || !this.questionsData) return;

    const topicFilterVal = this.bankFilterTopic || 'all';
    const query = this.bankSearchInput ? this.bankSearchInput.value.trim().toLowerCase() : '';

    let filtered = this.questionsData;

    if (topicFilterVal !== 'all') {
      const topicNum = parseInt(topicFilterVal, 10);
      filtered = filtered.filter(q => q.topic === topicNum);
    }

    if (query.length > 0) {
      filtered = filtered.filter(q => {
        const inQuestion = q.question.toLowerCase().includes(query);
        const inExplanation = q.explanation.toLowerCase().includes(query);
        const inOptions = q.options.some(opt => opt.toLowerCase().includes(query));
        return inQuestion || inExplanation || inOptions;
      });
    }

    if (this.bankCountBadge) {
      this.bankCountBadge.textContent = `${filtered.length} preguntas`;
    }

    this.bankQuestionsGrid.innerHTML = '';

    if (filtered.length === 0) {
      this.bankQuestionsGrid.innerHTML = `
        <div class="empty-bank-state">
          <p>No se encontraron preguntas con los filtros aplicados.</p>
        </div>
      `;
      return;
    }

    filtered.forEach((q, idx) => {
      const meta = this.topicsMetadata ? this.topicsMetadata[q.topic] : { badge: `Tema ${q.topic}`, color: '#6366f1' };
      const letters = ['A', 'B', 'C', 'D'];
      const card = document.createElement('div');
      card.className = 'bank-question-card';
      card.innerHTML = `
        <div class="bank-card-header">
          <span class="bank-card-tag" style="background-color: ${meta.color}20; color: ${meta.color}">
            Tema ${q.topic}: ${meta.badge}
          </span>
          <span class="bank-card-num">#${idx + 1}</span>
        </div>
        <div class="bank-card-question">${this.escapeHTML(q.question)}</div>
        <div class="bank-card-options">
          ${q.options.map((opt, oIdx) => `
            <div class="bank-opt ${oIdx === q.correct ? 'is-correct-opt' : ''}">
              <span class="opt-bullet">${letters[oIdx]})</span>
              <span class="opt-content">${this.escapeHTML(opt)}</span>
              ${oIdx === q.correct ? `
                <span class="correct-tag">
                  <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Correcta
                </span>
              ` : ''}
            </div>
          `).join('')}
        </div>
        <details class="bank-card-details">
          <summary>Ver Justificación Teórica y Legislación</summary>
          <div class="bank-card-explanation">
            <strong>Explicación:</strong> ${this.escapeHTML(q.explanation)}
          </div>
        </details>
      `;
      this.bankQuestionsGrid.appendChild(card);
    });
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
  window.masterDACApp = new MasterDACApp();
  window.dacApp = window.masterDACApp;
});
