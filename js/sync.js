// =============================================================================
// SINCRONIZACIÓN PROFESIONAL CON GOOGLE FIREBASE - MASTER DAC
// Proyecto: master-profesorado
// Integra Firebase Authentication (Email/Password) y Cloud Firestore en tiempo real.
// Las preguntas y las estadísticas se almacenan en Cloud Firestore.
// =============================================================================

class FirebaseSyncManager {
  constructor() {
    this.QUESTION_BANK_VERSION = '2026-10-difficult-v3';
    this.QUESTION_BANK_ADMIN_UID = '23mqJfdzDtTgNxdhm7GkFfcp3Wu2';
    this.STORAGE_SESSION_KEY = 'dac_firebase_session_v1';
    this.STORAGE_CONFIG_KEY = 'dac_firebase_custom_config_v1';

    this.app = null;
    this.auth = null;
    this.db = null;
    this.currentUser = null;
    this.unsubscribeSnapshot = null;
    this.isSyncing = false;
    // Inicialización al cargar el DOM
    this.ready = new Promise((resolve) => {
      const start = () => this.init().then(resolve);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
      } else {
        start();
      }
    });
  }

  async init() {
    this.injectModalMarkup();
    this.bindHeaderButton();
    this.bindModalEvents();
    await this.initFirebase();
  }

  // ==========================================
  // INICIALIZACIÓN DE FIREBASE
  // ==========================================
  getFirebaseConfig() {
    // 1. Prioridad: Configuración guardada en LocalStorage
    try {
      const stored = localStorage.getItem(this.STORAGE_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.apiKey && parsed.apiKey !== 'TU_API_KEY_AQUI') return parsed;
      }
    } catch (e) {}

    // 2. Configuración definida en js/firebase-config.js
    if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.apiKey !== 'TU_API_KEY_AQUI') {
      return window.FIREBASE_CONFIG;
    }

    return null;
  }

  async initFirebase() {
    if (typeof firebase === 'undefined') {
      console.error('Firebase SDK no detectado. No se pueden cargar los datos.');
      this.updateUI();
      return;
    }

    const config = this.getFirebaseConfig();
    if (!config) {
      console.info('Firebase pendiente de configuración (faltan credenciales de master-profesorado).');
      this.updateUI();
      return;
    }

    try {
      if (!firebase.apps.length) {
        this.app = firebase.initializeApp(config);
      } else {
        this.app = firebase.app();
      }

      this.auth = firebase.auth();
      this.db = firebase.firestore();

      // Escuchar cambios de estado de autenticación (Login/Logout/Recarga)
      this.auth.onAuthStateChanged(async (user) => {
        await this.handleAuthStateChanged(user);
      });
    } catch (err) {
      console.error('Error inicializando Firebase:', err);
      this.showToast('Error al inicializar Firebase: ' + err.message, 'error');
      this.updateUI();
    }
  }

  async handleAuthStateChanged(user) {
    this.currentUser = user;

    if (user) {
      console.log('Firebase Auth: Sesión iniciada como', user.email);
      this.setupRealtimeListener(user.uid);
      this.updateUI();
      this.showToast(`Conectado a Firebase: ${user.email}`, 'success');
      await this.ensureQuestionBank();
      if (window.dacApp) window.dacApp.switchTab('view-dashboard');
      this.closeModal();
      // Al loguearse, sincronizar automáticamente
      this.syncWithFirestore(false);
    } else {
      console.log('Firebase Auth: No hay sesión activa.');
      if (this.unsubscribeSnapshot) {
        this.unsubscribeSnapshot();
        this.unsubscribeSnapshot = null;
      }
      if (window.dacApp) window.dacApp.switchTab('view-content');
      this.updateUI();
    }
  }

  // Escuchar cambios remotos en tiempo real (si respondes un test en la tablet, el PC se actualiza solo)
  setupRealtimeListener(userId) {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
    }

    try {
      const docRef = this.db.collection('users').doc(userId);
      this.unsubscribeSnapshot = docRef.onSnapshot((doc) => {
        if (doc.exists) {
          const remoteData = doc.data();
          if (remoteData && remoteData.stats) {
            console.log('Firestore: Nuevos datos recibidos en tiempo real.');
            this.mergeStats(remoteData.stats);
          }
        }
      }, (error) => {
        console.warn('Error en listener en tiempo real de Firestore:', error);
      });
    } catch (e) {
      console.warn('Error configurando onSnapshot:', e);
    }
  }

  // ==========================================
  // OPERACIONES DE AUTENTICACIÓN
  // ==========================================
  async loginWithEmail(email, password) {
    if (!this.auth) {
      this.showToast('Firebase no está configurado aún. Introduce tu configuración primero.', 'error');
      return;
    }

    this.showToast('Iniciando sesión en Firebase...', 'info');
    try {
      await this.auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      console.error('Error login Firebase:', error);
      let msg = error.message;
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        msg = 'Usuario no encontrado o contraseña incorrecta.';
      } else if (error.code === 'auth/wrong-password') {
        msg = 'Contraseña incorrecta.';
      } else if (error.code === 'auth/invalid-email') {
        msg = 'El formato de correo no es válido.';
      }
      this.showToast(msg, 'error');
    }
  }

  async registerWithEmail(email, password) {
    if (!this.auth) {
      this.showToast('Firebase no está configurado aún.', 'error');
      return;
    }

    if (password.length < 6) {
      this.showToast('La contraseña debe tener al menos 6 caracteres.', 'error');
      return;
    }

    this.showToast('Creando tu cuenta en Firebase...', 'info');
    try {
      const cred = await this.auth.createUserWithEmailAndPassword(email, password);
      // Subir datos locales iniciales
      const currentStats = window.quizStats ? window.quizStats.stats : null;
      if (currentStats && cred.user) {
        await this.db.collection('users').doc(cred.user.uid).set({
          email: email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          stats: currentStats
        });
      }
      this.showToast('¡Cuenta creada y sincronizada con éxito!', 'success');
    } catch (error) {
      console.error('Error registro Firebase:', error);
      let msg = error.message;
      if (error.code === 'auth/email-already-in-use') {
        msg = 'Ese correo ya está registrado. Pulsa "Iniciar Sesión".';
      }
      this.showToast(msg, 'error');
    }
  }

  async logout() {
    if (!this.auth) return;
    if (confirm('¿Cerrar sesión en este dispositivo? Tus datos locales se conservarán intactos.')) {
      try {
        await this.auth.signOut();
        this.showToast('Sesión de Firebase cerrada.', 'info');
      } catch (e) {
        console.error('Error cerrando sesión:', e);
      }
    }
  }

  // ==========================================
  // SINCRONIZACIÓN BIDIRECCIONAL CON FIRESTORE
  // ==========================================
  async syncWithFirestore(showToasts = true) {
    if (!this.currentUser || !this.db) {
      if (showToasts) this.openModal();
      return;
    }

    if (this.isSyncing) return;
    this.isSyncing = true;

    if (showToasts) this.showToast('Sincronizando con Firestore...', 'info');

    try {
      const docRef = this.db.collection('users').doc(this.currentUser.uid);
      const docSnap = await docRef.get();

      let localStats = window.quizStats ? window.quizStats.stats : null;
      let merged = localStats;

      if (docSnap.exists) {
        const remoteData = docSnap.data();
        if (remoteData && remoteData.stats) {
          merged = this.mergeStats(remoteData.stats);
        }
      }

      // Guardar el estado consolidado de vuelta en Firestore
      await docRef.set({
        email: this.currentUser.email,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        stats: merged
      }, { merge: true });

      if (showToasts) {
        const count = merged && merged.exams ? merged.exams.length : 0;
        this.showToast(`¡Sincronizado! ${count} exámenes al día en Firestore.`, 'success');
      }

    } catch (e) {
      console.error('Error al sincronizar con Firestore:', e);
      if (showToasts) this.showToast('Error de conexión con Firebase: ' + e.message, 'error');
    } finally {
      this.isSyncing = false;
    }
  }

  async loadQuestionsFromFirestore() {
    if (!this.db) {
      throw new Error('Firebase no está inicializado.');
    }

    const snapshot = await this.db.collection('questions').orderBy('id').get();
    if (snapshot.empty) {
      throw new Error('El banco de preguntas todavía no está publicado en Firestore.');
    }

    return snapshot.docs.map((doc) => doc.data());
  }

  async ensureQuestionBank() {
    if (!this.currentUser
      || this.currentUser.uid !== this.QUESTION_BANK_ADMIN_UID
      || !this.db
      || !window.DAC_DATA?.questions?.length) return;

    try {
      const questionsRef = this.db.collection('questions');
      const metadataRef = this.db.collection('metadata').doc('questionBank');
      const metadata = await metadataRef.get();
      const currentVersion = metadata.exists ? metadata.data().version : null;
      if (currentVersion === this.QUESTION_BANK_VERSION) return;

      const existing = await questionsRef.get();
      let batch = this.db.batch();
      let operations = 0;

      existing.docs.forEach((doc) => {
        batch.delete(doc.ref);
        operations++;
      });

      for (const question of window.DAC_DATA.questions) {
        if (operations === 450) {
          await batch.commit();
          batch = this.db.batch();
          operations = 0;
        }
        batch.set(questionsRef.doc(String(question.id)), question);
        operations++;
      }

      batch.set(metadataRef, {
        version: this.QUESTION_BANK_VERSION,
        count: window.DAC_DATA.questions.length,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();

      if (window.quizStats) {
        window.quizStats.resetStats();
        await this.resetRemoteStats();
      }
      document.dispatchEvent(new CustomEvent('dac-questions-ready'));
      this.showToast('Nuevo banco publicado. Se han reiniciado las estadísticas.', 'success');
    } catch (error) {
      console.error('Error publicando el banco de preguntas:', error);
      if (error.code === 'permission-denied') {
        this.showToast('Firebase ha rechazado la publicación. Publica firestore.rules y vuelve a iniciar sesión.', 'error');
      } else {
        this.showToast('No se pudo publicar el banco de preguntas: ' + error.message, 'error');
      }
    }
  }

  async resetRemoteStats() {
    if (!this.currentUser || !this.db) return;

    try {
      await this.db.collection('users').doc(this.currentUser.uid).set({
        stats: window.quizStats.stats,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error reiniciando estadísticas remotas:', error);
      this.showToast('No se pudieron reiniciar las estadísticas en Firebase.', 'error');
    }
  }

  // Hook automático llamado al terminar un examen
  onExamRecorded() {
    if (this.currentUser && this.db) {
      this.syncWithFirestore(false);
    }
  }

  // ==========================================
  // FUSIÓN INTELIGENTE DE ESTADÍSTICAS
  // ==========================================
  mergeStats(remoteStats) {
    if (!window.quizStats) return remoteStats;
    const localStats = window.quizStats.stats;
    if (!remoteStats) return localStats;

    // 1. Fusionar historial de exámenes (sin duplicar, ordenado por fecha)
    const examMap = new Map();
    (localStats.exams || []).forEach(ex => {
      const key = ex.id || ex.timestamp || ex.date;
      if (key) examMap.set(key, ex);
    });

    (remoteStats.exams || []).forEach(ex => {
      const key = ex.id || ex.timestamp || ex.date;
      if (key && !examMap.has(key)) {
        examMap.set(key, ex);
      }
    });

    const mergedExams = Array.from(examMap.values());
    mergedExams.sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp));

    // 2. Fusionar questionStats
    const mergedQuestions = Object.assign({}, localStats.questionStats || {});
    const remoteQuestions = remoteStats.questionStats || {};

    Object.keys(remoteQuestions).forEach(qId => {
      const rem = remoteQuestions[qId];
      if (!mergedQuestions[qId]) {
        mergedQuestions[qId] = rem;
      } else {
        const loc = mergedQuestions[qId];
        loc.timesAnswered = Math.max(loc.timesAnswered || 0, rem.timesAnswered || 0);
        loc.timesCorrect = Math.max(loc.timesCorrect || 0, rem.timesCorrect || 0);
        loc.timesIncorrect = Math.max(loc.timesIncorrect || 0, rem.timesIncorrect || 0);
      }
    });

    // 3. Recalcular topicStats
    const topicStats = {
      1: { id: 1, answered: 0, correct: 0, incorrect: 0 },
      2: { id: 2, answered: 0, correct: 0, incorrect: 0 },
      3: { id: 3, answered: 0, correct: 0, incorrect: 0 },
      4: { id: 4, answered: 0, correct: 0, incorrect: 0 }
    };

    Object.values(mergedQuestions).forEach(q => {
      const t = q.topic;
      if (topicStats[t]) {
        topicStats[t].answered += (q.timesAnswered || 0);
        topicStats[t].correct += (q.timesCorrect || 0);
        topicStats[t].incorrect += (q.timesIncorrect || 0);
      }
    });

    const result = {
      version: 2,
      createdAt: localStats.createdAt || remoteStats.createdAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      exams: mergedExams.slice(0, 50),
      topicStats: topicStats,
      questionStats: mergedQuestions
    };

    window.quizStats.stats = result;
    window.quizStats.saveStats();

    if (window.dashboardManager && typeof window.dashboardManager.render === 'function') {
      window.dashboardManager.render();
    }

    return result;
  }

  // ==========================================
  // INTERFAZ DE USUARIO Y MODAL
  // ==========================================
  injectModalMarkup() {
    if (document.getElementById('sync-modal-container')) return;

    const modalWrapper = document.createElement('div');
    modalWrapper.id = 'sync-modal-container';
    modalWrapper.innerHTML = `
      <div class="sync-modal-backdrop" id="sync-modal-backdrop" style="display:none;" aria-hidden="true">
        <div class="sync-modal-card" role="dialog" aria-modal="true" aria-labelledby="sync-modal-title">
          <button type="button" class="sync-modal-close-btn" id="sync-modal-close-btn" aria-label="Cerrar modal">
            <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div class="sync-modal-header">
            <div class="sync-modal-icon-badge" style="background:rgba(245, 158, 11, 0.15);color:#f59e0b;">
              <!-- Icono Firebase Flame -->
              <svg viewBox="0 0 24 24" style="width:28px;height:28px;" fill="currentColor">
                <path d="M4.6 17.5L7.4 2.8c.1-.5.7-.7 1-.3l3.6 6.8L14.7 5c.3-.5 1-.4 1.2.1l3.5 12.4H4.6zm14.8.9L16 1.8c-.3-.5-1-.5-1.2 0l-3.2 5.9-2.8-5.3c-.3-.5-1-.4-1.2.1L3.5 18.4c-.4.9.3 1.9 1.3 1.9h13.4c1 0 1.7-1 1.2-1.9z"/>
              </svg>
            </div>
            <h3 id="sync-modal-title">Sincronización Segura con Firebase</h3>
            <p>Proyecto: <strong style="color:var(--color-primary);">master-profesorado</strong> • Base de datos Firestore en tiempo real</p>
          </div>

          <!-- Pestañas del Modal -->
          <div class="sync-modal-tabs">
            <button type="button" class="sync-tab-btn active" data-sync-tab="tab-firebase-auth">
              <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>Mi Cuenta Firebase</span>
            </button>
            <button type="button" class="sync-tab-btn" data-sync-tab="tab-firebase-config">
              <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>Credenciales Firebase</span>
            </button>
            <button type="button" class="sync-tab-btn" data-sync-tab="tab-backup">
              <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Copia Backup JSON</span>
            </button>
          </div>

          <!-- PESTAÑA 1: AUTENTICACIÓN FIREBASE -->
          <div class="sync-tab-content active" id="sync-tab-firebase-auth">
            <!-- VISTA USUARIO LOGUEADO -->
            <div id="firebase-logged-in-view" style="display:none;">
              <div class="sync-connected-banner" style="border-color:#10b981;background:rgba(16,185,129,0.1);">
                <div class="sync-connected-info">
                  <div class="sync-avatar" id="firebase-user-avatar" style="background:#10b981;">J</div>
                  <div>
                    <div class="sync-user-email" id="firebase-user-email-label">jorge.mompe@gmail.com</div>
                    <div class="sync-last-time" id="firebase-status-label" style="color:#10b981;font-weight:700;">🟢 Conectado a Firestore en tiempo real</div>
                  </div>
                </div>
                <button type="button" class="btn-sync-logout" id="btn-firebase-logout">Cerrar Sesión</button>
              </div>

              <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.9rem;margin:1rem 0;font-size:0.82rem;color:var(--text-muted);line-height:1.45;">
                <strong style="color:var(--text-main);display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;">
                  <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2" style="color:#10b981;">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  Seguridad y Privacidad Garantizada
                </strong>
                Tus datos están protegidos en tu base de datos de Google Cloud Firestore. Solo tú con tus credenciales puedes ver y actualizar tus exámenes. Al practicar con tu tablet o móvil, tus cambios se actualizan solos en tiempo real.
              </div>

              <div class="sync-actions">
                <button type="button" class="btn-sync-primary" id="btn-firebase-sync-now">
                  <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                  <span>Sincronizar Manualmente Ahora</span>
                </button>
              </div>
            </div>

            <!-- VISTA FORMULARIO LOGIN / REGISTRO -->
            <div id="firebase-login-form-view">
              <div class="sync-form-group">
                <label for="fb-input-email">Correo Electrónico</label>
                <div class="sync-input-wrapper">
                  <svg viewBox="0 0 24 24" class="sync-input-icon svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                  <input type="email" id="fb-input-email" class="sync-input" value="jorge.mompe@gmail.com" placeholder="jorge.mompe@gmail.com">
                </div>
              </div>

              <div class="sync-form-group" style="margin-top:0.75rem;">
                <label for="fb-input-password">Contraseña de Acceso</label>
                <div class="sync-input-wrapper">
                  <svg viewBox="0 0 24 24" class="sync-input-icon svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <input type="password" id="fb-input-password" class="sync-input" placeholder="Introduce tu contraseña">
                </div>
                <span class="sync-help-text">Introduce tu usuario y contraseña para acceder a tu dashboard.</span>
              </div>

              <div class="sync-actions" style="margin-top:1.25rem;">
                <button type="button" class="btn-sync-primary" id="btn-firebase-login">
                  <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                    <polyline points="10 17 15 12 10 7"></polyline>
                    <line x1="15" y1="12" x2="3" y2="12"></line>
                  </svg>
                  <span>Iniciar Sesión</span>
                </button>
              </div>
            </div>
          </div>

          <!-- PESTAÑA 2: CONFIGURACIÓN FIREBASE (API KEY / CREDENCIALES) -->
          <div class="sync-tab-content" id="sync-tab-firebase-config">
            <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1rem;margin-bottom:1rem;font-size:0.82rem;line-height:1.45;">
              <strong style="color:var(--text-main);display:block;margin-bottom:0.35rem;">Configuración del Proyecto: master-profesorado</strong>
              <p style="color:var(--text-muted);margin-bottom:0.5rem;">
                Puedes pegar aquí el objeto <code>firebaseConfig</code> obtenido en la consola de Firebase, o editar el archivo <code>js/firebase-config.js</code>.
              </p>
              <div id="firebase-config-status-badge" style="display:inline-block;padding:0.25rem 0.65rem;border-radius:var(--radius-sm);background:rgba(245,158,11,0.15);color:#f59e0b;font-weight:700;font-size:0.75rem;">
                Esperando credenciales
              </div>
            </div>

            <div class="sync-form-group">
              <label for="fb-config-textarea">Pegar configuración (JSON o snippet de Firebase):</label>
              <textarea id="fb-config-textarea" class="sync-input" rows="6" style="font-family:var(--font-mono);font-size:0.78rem;padding:0.75rem;" placeholder='const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "master-profesorado.firebaseapp.com",
  projectId: "master-profesorado",
  storageBucket: "master-profesorado.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};'></textarea>
            </div>

            <div class="sync-actions" style="margin-top:1rem;">
              <button type="button" class="btn-sync-primary" id="btn-save-firebase-config">
                <span>Guardar y Conectar Firebase</span>
              </button>
            </div>
          </div>

          <!-- PESTAÑA 3: COPIA DE SEGURIDAD (EXPORTAR/IMPORTAR) -->
          <div class="sync-tab-content" id="sync-tab-backup">
            <div class="sync-backup-grid">
              <div class="sync-backup-card">
                <div class="sync-backup-icon">
                  <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </div>
                <h4>Descargar Copia</h4>
                <p>Guarda todos tus exámenes, estadísticas por tema y fallos en un archivo <code>.json</code> en tu equipo.</p>
                <button type="button" class="btn-backup-action" id="btn-backup-download">Descargar Backup</button>
              </div>

              <div class="sync-backup-card">
                <div class="sync-backup-icon" style="background:rgba(16, 185, 129, 0.12);color:#10b981;">
                  <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <h4>Cargar Copia</h4>
                <p>Restaura o fusiona un archivo de respaldo descargado previamente de tu tablet u ordenador.</p>
                <input type="file" id="sync-file-input" accept=".json,application/json" style="display:none;">
                <button type="button" class="btn-backup-action" id="btn-backup-upload-trigger">Seleccionar Archivo</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    modalWrapper.querySelector('.sync-modal-tabs')?.remove();
    modalWrapper.querySelector('#sync-tab-firebase-config')?.remove();
    modalWrapper.querySelector('#sync-tab-backup')?.remove();
    document.body.appendChild(modalWrapper);
  }

  bindHeaderButton() {
    const btn = document.getElementById('sync-header-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (this.currentUser) {
          this.logout();
        } else {
          this.openModal();
        }
      });
    }
  }

  bindModalEvents() {
    const backdrop = document.getElementById('sync-modal-backdrop');
    const closeBtn = document.getElementById('sync-modal-close-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeModal();
      });
    }

    // Inicio de sesión
    const loginBtn = document.getElementById('btn-firebase-login');
    const emailInput = document.getElementById('fb-input-email');
    const passInput = document.getElementById('fb-input-password');

    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        const email = emailInput ? emailInput.value.trim() : '';
        const pass = passInput ? passInput.value : '';
        if (!email || !pass) {
          this.showToast('Introduce tu correo y contraseña.', 'error');
          return;
        }
        this.loginWithEmail(email, pass);
      });
    }

    // Logout
    const logoutBtn = document.getElementById('btn-firebase-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }

    // Sincronizar ahora
    const syncNowBtn = document.getElementById('btn-firebase-sync-now');
    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', () => this.syncWithFirestore(true));
    }

  }

  handleSavePastedConfig(rawText) {
    if (!rawText.trim()) {
      this.showToast('Pega el objeto de configuración de Firebase.', 'error');
      return;
    }

    try {
      let configObj = null;
      // Intentar extraer JSON o propiedades
      if (rawText.includes('{')) {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          // Evaluar o formatear a JSON
          const cleanStr = jsonMatch[0]
            .replace(/([a-zA-Z0-9_]+):/g, '"$1":')
            .replace(/'/g, '"')
            .replace(/,(\s*[\}\]])/g, '$1');
          try {
            configObj = JSON.parse(cleanStr);
          } catch (e) {
            // Extracción manual por regex
            configObj = {
              apiKey: (rawText.match(/apiKey:\s*["']([^"']+)["']/) || [])[1],
              authDomain: (rawText.match(/authDomain:\s*["']([^"']+)["']/) || [])[1],
              projectId: (rawText.match(/projectId:\s*["']([^"']+)["']/) || [])[1] || 'master-profesorado',
              storageBucket: (rawText.match(/storageBucket:\s*["']([^"']+)["']/) || [])[1],
              messagingSenderId: (rawText.match(/messagingSenderId:\s*["']([^"']+)["']/) || [])[1],
              appId: (rawText.match(/appId:\s*["']([^"']+)["']/) || [])[1]
            };
          }
        }
      }

      if (!configObj || !configObj.apiKey) {
        throw new Error('No se pudo encontrar una apiKey válida en el texto.');
      }

      localStorage.setItem(this.STORAGE_CONFIG_KEY, JSON.stringify(configObj));
      this.showToast('¡Configuración de Firebase guardada con éxito!', 'success');
      this.initFirebase();
      this.switchTab('tab-firebase-auth');
    } catch (err) {
      console.error('Error parseando configuración Firebase:', err);
      this.showToast('Formato no reconocido: ' + err.message, 'error');
    }
  }

  openModal() {
    this.updateUI();
    const backdrop = document.getElementById('sync-modal-backdrop');
    if (backdrop) {
      backdrop.style.display = 'flex';
      backdrop.setAttribute('aria-hidden', 'false');
    }
  }

  closeModal() {
    const backdrop = document.getElementById('sync-modal-backdrop');
    if (backdrop) {
      backdrop.style.display = 'none';
      backdrop.setAttribute('aria-hidden', 'true');
    }
  }

  switchTab(tabId) {
    document.querySelectorAll('.sync-tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-sync-tab') === tabId);
    });

    document.querySelectorAll('.sync-tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `sync-${tabId}`);
    });
  }

  updateUI() {
    const isConfigured = !!this.getFirebaseConfig();
    const isLoggedIn = !!this.currentUser;

    // Actualizar indicador en cabecera
    const headerBtn = document.getElementById('sync-header-btn');
    if (headerBtn) {
      const dot = headerBtn.querySelector('.sync-indicator-dot');

      if (isLoggedIn) {
        if (dot) dot.classList.add('synced');
        headerBtn.innerHTML = `
          <span class="sync-indicator-dot synced"></span>
          <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M9 10l-5 2 5 2"/>
            <path d="M4 12h11"/>
            <path d="M13 5l6 7-6 7"/>
          </svg>`;
        headerBtn.title = 'Cerrar sesión';
        headerBtn.setAttribute('aria-label', 'Cerrar sesión');
      } else if (isConfigured) {
        if (dot) dot.classList.remove('synced');
        headerBtn.innerHTML = `
          <span class="sync-indicator-dot"></span>
          <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 21a8 8 0 0 1 16 0"/>
          </svg>`;
        headerBtn.title = 'Iniciar sesión para ver el dashboard';
        headerBtn.setAttribute('aria-label', 'Iniciar sesión');
      } else {
        if (dot) dot.classList.remove('synced');
        headerBtn.title = 'Firebase no está disponible';
      }
    }

    // Modal: Vistas
    const loggedInView = document.getElementById('firebase-logged-in-view');
    const loginFormView = document.getElementById('firebase-login-form-view');
    const configBadge = document.getElementById('firebase-config-status-badge');

    if (isLoggedIn) {
      if (loggedInView) loggedInView.style.display = 'block';
      if (loginFormView) loginFormView.style.display = 'none';

      const emailLabel = document.getElementById('firebase-user-email-label');
      const avatar = document.getElementById('firebase-user-avatar');
      if (emailLabel) emailLabel.textContent = this.currentUser.email;
      if (avatar) avatar.textContent = (this.currentUser.email || 'J')[0].toUpperCase();
    } else {
      if (loggedInView) loggedInView.style.display = 'none';
      if (loginFormView) loginFormView.style.display = 'block';
    }

    if (configBadge) {
      if (isConfigured) {
        configBadge.style.background = 'rgba(16,185,129,0.15)';
        configBadge.style.color = '#10b981';
        configBadge.textContent = '✓ Credenciales Activas (master-profesorado)';
      } else {
        configBadge.style.background = 'rgba(245,158,11,0.15)';
        configBadge.style.color = '#f59e0b';
        configBadge.textContent = 'Esperando credenciales de Firebase';
      }
    }
  }

  // ==========================================
  // BACKUP JSON
  // ==========================================
  downloadBackupFile() {
    const backupData = {
      app: 'Master-DAC-Profesorado',
      firebaseProject: 'master-profesorado',
      exportedAt: new Date().toISOString(),
      userEmail: this.currentUser ? this.currentUser.email : null,
      stats: window.quizStats ? window.quizStats.stats : null,
      theme: localStorage.getItem('dac_theme') || 'dark'
    };

    const str = JSON.stringify(backupData, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];

    a.href = url;
    a.download = `dac-profesorado-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast('¡Copia de seguridad descargada!', 'success');
  }

  handleFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed.stats) {
          throw new Error('El archivo no contiene estadísticas válidas.');
        }

        this.mergeStats(parsed.stats);
        if (this.currentUser && this.db) {
          this.syncWithFirestore(false);
        }
        this.showToast('¡Copia restaurada y fusionada con éxito!', 'success');
      } catch (err) {
        this.showToast('Error al leer el archivo: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  // ==========================================
  // TOASTS DE NOTIFICACIÓN
  // ==========================================
  showToast(message, type = 'info') {
    const existing = document.querySelector('.sync-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `sync-toast toast-${type}`;

    let icon = `
      <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;

    if (type === 'success') {
      icon = `
        <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="#10b981" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      `;
    } else if (type === 'error') {
      icon = `
        <svg viewBox="0 0 24 24" class="svg-inline" fill="none" stroke="#ef4444" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      `;
    }

    toast.innerHTML = `${icon}<span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 320);
    }, 3800);
  }
}

// Inicializar instancia global
window.cloudSyncManager = new FirebaseSyncManager();
