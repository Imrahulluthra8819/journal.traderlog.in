// Trading Journal Application - Integrated with Firebase
class TradingJournalApp {
  constructor() {
    // --- FIREBASE SETUP ---
    // PASTE YOUR FIREBASE CONFIG OBJECT HERE
    const firebaseConfig = {
      apiKey: "AIzaSyCcbykkhvTw671DG1EaAj7Tw9neQcXJjS0",
      authDomain: "trad-77851.firebaseapp.com",
      projectId: "trad-77851",
      storageBucket: "trad-77851.appspot.com",
      messagingSenderId: "1099300399869",
      appId: "1:1099300399869:web:d201028b9168d24feb2c94",
      measurementId: "G-9TV0H4BWN6"
    };

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    this.auth = firebase.auth();
    this.db = firebase.firestore();

    // --- APP STATE ---
    this.currentUser = null;
    this.allTrades = [];
    this.allConfidence = [];
    this.charts = {};
    this.mainListenersAttached = false;
    this.currentCalendarDate = new Date();

    // --- BOOTSTRAP ---
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.bootstrap());
    } else {
      this.bootstrap();
    }
  }

  /**
   * Main entry point. Sets up authentication listener.
   */
  bootstrap() {
    this.setupAuthListeners();
    this.handleAuthStateChange();
  }

  /* ------------------------------- AUTH ---------------------------------- */

  /**
   * Listens for Firebase auth events. This is the single source of truth for auth state.
   */
  handleAuthStateChange() {
    this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        console.log('[AUTH] User is signed in:', user.uid);
        this.currentUser = user;
        await this.loadUserData();
        this.showMainApp();
      } else {
        console.log('[AUTH] User is signed out.');
        this.currentUser = null;
        this.allTrades = [];
        this.allConfidence = [];
        Object.values(this.charts).forEach(chart => chart?.destroy());
        this.charts = {};
        this.showAuthScreen();
      }
    });
  }

  /**
   * Sets up listeners for login and signup forms.
   */
  setupAuthListeners() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.tab));
    });

    const loginForm = document.getElementById('loginFormElement');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearAuthErrors();
      const submitButton = loginForm.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.textContent;
      
      try {
        submitButton.disabled = true;
        submitButton.textContent = 'Logging in...';
        
        const email = loginForm.email.value;
        const password = loginForm.password.value;

        await this.auth.signInWithEmailAndPassword(email, password);
        // On success, onAuthStateChanged will handle the rest.
      } catch (error) {
        this.showAuthError('login-password-error', error.message);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    });

    const signupForm = document.getElementById('signupFormElement');
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearAuthErrors();
      const submitButton = signupForm.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.textContent;

      try {
        submitButton.disabled = true;
        submitButton.textContent = 'Signing up...';

        const email = signupForm.email.value;
        const password = signupForm.password.value;
        const confirm = signupForm.confirmPassword.value;

        if (password !== confirm) {
          this.showAuthError('signup-confirmPassword-error', 'Passwords do not match');
          return;
        }
        
        await this.auth.createUserWithEmailAndPassword(email, password);
        this.showToast('Signup successful! You can now log in.', 'success');
        signupForm.reset();
        this.switchAuthTab('login');
      } catch (error) {
        this.showAuthError('signup-email-error', error.message);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    });

    // --- START: ADDED FOR GOOGLE AUTH ---
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', () => this.signInWithGoogle());
    }
    // --- END: ADDED FOR GOOGLE AUTH ---
  }

  // --- START: ADDED FOR GOOGLE AUTH ---
  /**
   * Handles the Google Sign-In process via a popup.
   */
  async signInWithGoogle() {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
          this.clearAuthErrors();
          await this.auth.signInWithPopup(provider);
          // On success, onAuthStateChanged will handle the rest.
          this.showToast('Successfully signed in with Google!', 'success');
      } catch (error) {
          console.error('[AUTH] Google Sign-In Error:', error);
          // Display the error message in a relevant part of the UI
          this.showAuthError('login-password-error', `Google Sign-In Failed: ${error.message}`);
      }
  }
  // --- END: ADDED FOR GOOGLE AUTH ---

  /**
   * Logs the user out by calling Firebase signOut.
   */
  async logout() {
    try {
      await this.auth.signOut();
      this.showToast('Logged out successfully', 'info');
    } catch (error) {
      this.showToast(`Logout failed: ${error.message}`, 'error');
    }
  }

  switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.toggle('active', f.id === tab + 'Form'));
    this.clearAuthErrors();
  }

  showAuthError(id, msg) {
    const el = document.getElementById(id);
    if(el) {
        el.textContent = msg;
        el.classList.add('active');
    }
  }

  clearAuthErrors() {
    document.querySelectorAll('.form-error').forEach(e => {
      e.textContent = '';
      e.classList.remove('active');
    });
  }

  /* ------------------------------ DATA --------------------------------- */

  /**
   * Fetches all trades and confidence data for the current user from Firestore.
   */
  async loadUserData() {
    if (!this.currentUser) return;
    
    console.log('[DATA] Loading user data...');
    this.showToast('Loading your data...', 'info');
    
    const tradesQuery = this.db.collection('users').doc(this.currentUser.uid).collection('trades').orderBy('entryDate', 'desc').get();
    const confidenceQuery = this.db.collection('users').doc(this.currentUser.uid).collection('confidence').orderBy('date', 'desc').get();

    try {
        const [tradesSnapshot, confidenceSnapshot] = await Promise.all([tradesQuery, confidenceQuery]);
        
        this.allTrades = tradesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`[DATA] Loaded ${this.allTrades.length} trades.`);

        this.allConfidence = confidenceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`[DATA] Loaded ${this.allConfidence.length} confidence entries.`);
    } catch (error) {
        console.error("[DATA] Error loading user data:", error);
        this.showToast(`Error loading data: ${error.message}`, 'error');
        this.allTrades = [];
        this.allConfidence = [];
    }
  }

  /* ------------------------------ VIEW --------------------------------- */
  showAuthScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('mainApp').classList.add('hidden');
  }

  showMainApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainApp').classList.remove('hidden');

    if (!this.mainListenersAttached) {
      this.attachMainListeners();
      this.mainListenersAttached = true;
    }

    this.updateUserInfo();
    this.showSection('dashboard'); // Start on dashboard after login
  }

  attachMainListeners() {
    document.querySelectorAll('.nav-link, .view-all-link').forEach(btn => {
      btn.addEventListener('click', () => this.showSection(btn.dataset.section));
    });
    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('quickAddTrade').addEventListener('click', () => this.showSection('add-trade'));

    this.setupAddTradeForm();
    document.getElementById('exportData').addEventListener('click', () => this.exportCSV());
    document.getElementById('prevMonth').addEventListener('click', () => this.changeCalendarMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => this.changeCalendarMonth(1));

    document.addEventListener('data-changed', () => {
        const activeSection = document.querySelector('.section.active');
        if (activeSection) {
            this.showSection(activeSection.id);
        }
    });
  }

  updateUserInfo() {
    if (this.currentUser) {
      document.getElementById('currentUserEmail').textContent = this.currentUser.email;
    }
  }

  toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-color-scheme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-color-scheme', next);
    document.getElementById('themeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
  }

  showSection(id) {
    if (!id) return;
    document.querySelectorAll('.nav-link').forEach(btn => btn.classList.toggle('active', btn.dataset.section === id));
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    switch (id) {
      case 'dashboard': this.renderDashboard(); break;
      case 'add-trade': this.renderAddTrade(); break;
      case 'history': this.renderHistory(); break;
      case 'analytics': this.renderAnalytics(); break;
      case 'ai-suggestions': this.renderAISuggestions(); break;
      case 'reports': this.renderReports(); break;
    }
  }

  /* ------------------------------ HELPERS ------------------------------- */
  formatCurrency(val) {
    if (val === null || val === undefined) return '₹0.00';
    const sign = val < 0 ? '-' : '';
    return sign + '₹' + Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatDate(str) {
    if (!str) return 'N/A';
    return new Date(str).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
  }

  showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const div = document.createElement('div');
    div.className = 'toast ' + type;
    div.textContent = msg;
    container.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  /* ---------------------- DASHBOARD & STATS ----------------------------- */
  get trades() { return this.allTrades || []; }
  get confidenceEntries() { return this.allConfidence || []; }

  calculateStats() {
    if (this.trades.length === 0) {
      return { totalPL: 0, winRate: 0, totalTrades: 0, avgRR: '1:0', bestTrade: 0, worstTrade: 0 };
    }
    const totalPL = this.trades.reduce((sum, t) => sum + (t.netPL || 0), 0);
    const wins = this.trades.filter(t => t.netPL > 0).length;
    const winRate = this.trades.length > 0 ? Math.round((wins / this.trades.length) * 100) : 0;
    const bestTrade = Math.max(0, ...this.trades.map(t => t.netPL));
    const worstTrade = Math.min(0, ...this.trades.map(t => t.netPL));
    const validRRTrades = this.trades.filter(t => t.riskRewardRatio > 0);
    const avgRRNum = validRRTrades.length > 0 
      ? (validRRTrades.reduce((sum, t) => sum + t.riskRewardRatio, 0) / validRRTrades.length).toFixed(2)
      : '0.00';

    return { totalPL, winRate, totalTrades: this.trades.length, avgRR: '1:' + avgRRNum, bestTrade, worstTrade };
  }

  renderDashboard() {
    const s = this.calculateStats();
    const totalPLEl = document.getElementById('totalPL');
    totalPLEl.textContent = this.formatCurrency(s.totalPL);
    totalPLEl.className = 'stat-value ' + (s.totalPL >= 0 ? 'positive' : 'negative');
    document.getElementById('winRate').textContent = s.winRate + '%';
    document.getElementById('totalTrades').textContent = s.totalTrades;
    document.getElementById('avgRR').textContent = s.avgRR;

    // --- START: Correctly Scoped Confidence Listeners ---
    const slider = document.getElementById('dailyConfidence');
    const out = document.getElementById('confidenceValue');
    const saveBtn = document.getElementById('saveConfidenceBtn');

    if (slider && out) {
        const updateConfidenceValue = () => (out.textContent = slider.value);
        slider.addEventListener('input', updateConfidenceValue);
        updateConfidenceValue(); 
    }
    if (saveBtn) {
        // To prevent adding multiple listeners, we replace the button with a clone
        // This is a robust way to ensure only one listener is ever attached.
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.addEventListener('click', () => this.saveDailyConfidence());
    }
    // --- END: Correctly Scoped Confidence Listeners ---

    const list = document.getElementById('recentTradesList');
    if (this.trades.length === 0) {
      list.innerHTML = '<div class="empty-state">No trades yet. Click "Add New Trade" to get started!</div>';
      const miniChartCtx = document.getElementById('miniPlChart')?.getContext('2d');
      if(miniChartCtx) miniChartCtx.clearRect(0,0,miniChartCtx.canvas.width,miniChartCtx.canvas.height);

      const aiGlimpseEl = document.getElementById('aiGlimpse');
      if(aiGlimpseEl) aiGlimpseEl.innerHTML = '<div class="empty-state">No data for insights.</div>';
      return;
    }
    
    list.innerHTML = this.trades.slice(0, 5).map(t => `
      <div class="trade-item" onclick="app.showTradeDetails('${t.id}')">
        <div class="trade-info">
          <span class="trade-symbol">${t.symbol}</span>
          <span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span>
          <span class="trade-date">${this.formatDate(t.entryDate)}</span>
        </div>
        <div class="trade-pl ${t.netPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(t.netPL)}</div>
      </div>`).join('');

    this.renderMiniPLChart();
    this.renderAIGlimpse();
  }
    list.innerHTML = this.trades.slice(0, 5).map(t => `
      <div class="trade-item" onclick="app.showTradeDetails('${t.id}')">
        <div class="trade-info">
          <span class="trade-symbol">${t.symbol}</span>
          <span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span>
          <span class="trade-date">${this.formatDate(t.entryDate)}</span>
        </div>
        <div class="trade-pl ${t.netPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(t.netPL)}</div>
      </div>`).join('');

    // Render the new glimpse cards
    this.renderMiniPLChart();
    this.renderAIGlimpse();
  }
    // Render the new glimpse cards
    this.renderMiniPLChart();
    this.renderAIGlimpse();
  }
  renderMiniPLChart() {
    const ctx = document.getElementById('miniPlChart');
    if (!ctx) return;
    this.charts.miniPl?.destroy();
    if (this.trades.length < 2) { 
        ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); 
        return; 
    }

    const sorted = [...this.trades].sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
    const labels = sorted.map(t => this.formatDate(t.entryDate));
    let cumulativePL = 0;
    const data = sorted.map(t => {
        cumulativePL += t.netPL;
        return cumulativePL;
    });

    this.charts.miniPl = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'Cumulative P&L', 
                data: data, 
                borderColor: '#1FB8CD', 
                backgroundColor: 'rgba(31,184,205,0.1)', 
                tension: 0.4, 
                fill: true,
                pointRadius: 0 // Hide points on the mini chart
            }] 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { display: false }, // Hide Y-axis labels
                x: { display: false }  // Hide X-axis labels
            }
        }
    });
  }

  renderAIGlimpse() {
      const insightEl = document.getElementById('aiGlimpse');
      if (this.trades.length < 3) {
          insightEl.innerHTML = '<div class="empty-state">Add more trades for an insight.</div>';
          return;
      }
      
      const best = this.bestStrategy();
      if (best !== 'N/A') {
          insightEl.innerHTML = `<div class="suggestion-item suggestion-good">Your most profitable strategy is currently <strong>${best}</strong>. Focus on finding more of these setups.</div>`;
      } else {
          insightEl.innerHTML = '<div class="suggestion-item suggestion-info">Keep trading to discover your most profitable patterns.</div>';
      }
  }
  async saveDailyConfidence() {
    const level = parseInt(document.getElementById('dailyConfidence').value, 10);
    const today = new Date().toISOString().split('T')[0];
    
    const existing = this.confidenceEntries.find(c => c.date === today);
    if (existing) {
      this.showToast("You've already recorded confidence today!", 'warning');
      return;
    }

    try {
        const docRef = await this.db.collection('users').doc(this.currentUser.uid).collection('confidence').add({
            date: today,
            level: level,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        this.allConfidence.unshift({ id: docRef.id, date: today, level });
        document.getElementById('confidenceMessage').innerHTML = "<div class='message success'>Daily confidence recorded successfully!</div>";
        this.showToast('Daily confidence recorded!', 'success');
        document.dispatchEvent(new CustomEvent('data-changed'));
    } catch (error) {
        this.showToast(`Error saving confidence: ${error.message}`, 'error');
    }
  }

  /* ----------------------- ADD TRADE FORM ------------------------------ */
  renderAddTrade() {
    const now = new Date();
    const entryDateEl = document.querySelector('input[name="entryDate"]');
    const exitDateEl = document.querySelector('input[name="exitDate"]');
    if (entryDateEl) entryDateEl.value = now.toISOString().slice(0, 16);
    if (exitDateEl) exitDateEl.value = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 16);
  }

  setupAddTradeForm() {
    const form = document.getElementById('addTradeForm');
    
    form.querySelectorAll('.range-input').forEach(slider => {
        const display = slider.parentElement.querySelector('.range-value');
        if (display) {
          slider.addEventListener('input', () => (display.textContent = slider.value));
        }
    });

    const calcFields = ['quantity', 'entryPrice', 'exitPrice', 'stopLoss', 'targetPrice', 'direction'];
    calcFields.forEach(name => {
      form.querySelector(`[name="${name}"]`)?.addEventListener('input', () => this.updateCalculations());
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      this.submitTrade();
    });

    document.getElementById('resetTradeForm').addEventListener('click', () => {
      form.reset();
      this.updateCalculations();
      this.renderAddTrade();
      form.querySelectorAll('.range-value').forEach(el => el.textContent = '5');
    });
  }

  updateCalculations() {
    const fd = new FormData(document.getElementById('addTradeForm'));
    const qty = parseFloat(fd.get('quantity')) || 0;
    const entry = parseFloat(fd.get('entryPrice')) || 0;
    const exit = parseFloat(fd.get('exitPrice')) || 0;
    const sl = parseFloat(fd.get('stopLoss')) || 0;
    const target = parseFloat(fd.get('targetPrice')) || 0;
    const dir = fd.get('direction');

    let gross = (qty && entry && exit) ? (dir === 'Long' ? (exit - entry) * qty : (entry - exit) * qty) : 0;
    const net = gross - 40; // Assume fixed brokerage

    let riskReward = 0;
    if (qty && entry && sl && target && dir) {
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(target - entry);
      if (risk > 0) riskReward = reward / risk;
    }
    
    document.getElementById('calcGrossPL').textContent = this.formatCurrency(gross);
    document.getElementById('calcNetPL').textContent = this.formatCurrency(net);
    document.getElementById('calcRiskReward').textContent = '1:' + riskReward.toFixed(2);
  }

  getCheckboxValues(form, name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value);
  }
  
  getRadioValue(form, name) {
    const radio = form.querySelector(`input[name="${name}"]:checked`);
    return radio ? radio.value : '';
  }

  async submitTrade() {
    const form = document.getElementById('addTradeForm');
    const fd = new FormData(form);
    form.querySelectorAll('.form-error').forEach(e => e.classList.remove('active'));

    if (!this.currentUser) {
        this.showToast('You must be logged in to add a trade.', 'error');
        return;
    }

    const trade = {
      symbol: fd.get('symbol').toUpperCase(),
      direction: fd.get('direction'),
      quantity: parseFloat(fd.get('quantity')),
      entryPrice: parseFloat(fd.get('entryPrice')),
      exitPrice: parseFloat(fd.get('exitPrice')),
      stopLoss: parseFloat(fd.get('stopLoss')) || null,
      targetPrice: parseFloat(fd.get('targetPrice')) || null,
      strategy: fd.get('strategy') || 'N/A',
      exitReason: fd.get('exitReason') || 'N/A',
      confidenceLevel: parseInt(fd.get('confidenceLevel')),
      entryDate: fd.get('entryDate'),
      exitDate: fd.get('exitDate'),
      preEmotion: fd.get('preEmotion') || '',
      postEmotion: fd.get('postEmotion') || '',
      notes: fd.get('notes') || '',
      sleepQuality: parseInt(fd.get('sleepQuality')) || 5,
      physicalCondition: parseInt(fd.get('physicalCondition')) || 5,
      marketSentiment: fd.get('marketSentiment') || '',
      newsAwareness: fd.get('newsAwareness') || '',
      marketEnvironment: fd.get('marketEnvironment') || '',
      fomoLevel: parseInt(fd.get('fomoLevel')) || 1,
      preStress: parseInt(fd.get('preStress')) || 1,
      multiTimeframes: this.getCheckboxValues(form, 'multiTimeframes'),
      volumeAnalysis: fd.get('volumeAnalysis') || '',
      technicalConfluence: this.getCheckboxValues(form, 'technicalConfluence'),
      marketSession: fd.get('marketSession') || '',
      tradeCatalyst: fd.get('tradeCatalyst') || '',
      waitedForSetup: this.getRadioValue(form, 'waitedForSetup'),
      positionComfort: parseInt(fd.get('positionComfort')) || 5,
      planDeviation: fd.get('planDeviation') || '',
      stressDuring: parseInt(fd.get('stressDuring')) || 1,
      primaryExitReason: fd.get('primaryExitReason') || '',
      exitEmotion: fd.get('exitEmotion') || '',
      wouldTakeAgain: this.getRadioValue(form, 'wouldTakeAgain'),
      lesson: fd.get('lesson') || '',
      volatilityToday: fd.get('volatilityToday') || '',
      sectorPerformance: fd.get('sectorPerformance') || '',
      economicEvents: this.getCheckboxValues(form, 'economicEvents'),
      personalDistractions: this.getCheckboxValues(form, 'personalDistractions'),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    trade.grossPL = trade.direction === 'Long' ? (trade.exitPrice - trade.entryPrice) * trade.quantity : (trade.entryPrice - trade.exitPrice) * trade.quantity;
    trade.netPL = trade.grossPL - 40;
    if (trade.stopLoss && trade.targetPrice) {
      const risk = Math.abs(trade.entryPrice - trade.stopLoss);
      const reward = Math.abs(trade.targetPrice - trade.entryPrice);
      trade.riskRewardRatio = risk ? reward / risk : 0;
    } else {
      trade.riskRewardRatio = 0;
    }

    try {
        const docRef = await this.db.collection('users').doc(this.currentUser.uid).collection('trades').add(trade);
        this.allTrades.unshift({ id: docRef.id, ...trade });
        this.showToast('Trade saved successfully!', 'success');
        form.reset();
        this.updateCalculations();
        this.renderAddTrade();
        document.dispatchEvent(new CustomEvent('data-changed'));
        this.showSection('dashboard');
    } catch (error) {
        console.error('[DATA] Firestore insert error:', error);
        this.showToast(`Error saving trade: ${error.message}`, 'error');
    }
  }

  /* ---------------------------- HISTORY ------------------------------- */
  renderHistory() {
    const container = document.getElementById('historyContent');
    if (this.trades.length === 0) {
      container.innerHTML = '<div class="empty-state">No trades recorded yet.</div>';
      return;
    }

    const symbols = [...new Set(this.trades.map(t => t.symbol))];
    const symbolFilter = document.getElementById('symbolFilter');
    symbolFilter.innerHTML = '<option value="">All Symbols</option>' + symbols.map(s => `<option value="${s}">${s}</option>`).join('');

    const strategies = [...new Set(this.trades.map(t => t.strategy))];
    const strategyFilter = document.getElementById('strategyFilter');
    strategyFilter.innerHTML = '<option value="">All Strategies</option>' + strategies.map(s => `<option value="${s}">${s}</option>`).join('');

    const applyFilters = () => {
      const symVal = symbolFilter.value;
      const stratVal = strategyFilter.value;
      const filtered = this.trades.filter(t => (!symVal || t.symbol === symVal) && (!stratVal || t.strategy === stratVal));
      renderTable(filtered);
    };

    symbolFilter.onchange = strategyFilter.onchange = applyFilters;

    const renderTable = rows => {
      if (rows.length === 0) {
        container.innerHTML = '<div class="empty-state">No trades match filter.</div>';
        return;
      }
      container.innerHTML = `
        <div class="card"><table class="trade-table"><thead>
          <tr><th>Date</th><th>Symbol</th><th>Dir</th><th>Qty</th><th>Entry</th><th>Exit</th><th>P&L</th><th>Strategy</th></tr>
        </thead><tbody>
          ${rows.map(t => `
            <tr onclick="app.showTradeDetails('${t.id}')">
              <td data-label="Date">${this.formatDate(t.entryDate)}</td>
              <td data-label="Symbol">${t.symbol}</td>
              <td data-label="Direction"><span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span></td>
              <td data-label="Qty">${t.quantity}</td>
              <td data-label="Entry">${this.formatCurrency(t.entryPrice)}</td>
              <td data-label="Exit">${this.formatCurrency(t.exitPrice)}</td>
              <td data-label="P&L" class="${t.netPL>=0?'positive':'negative'}">${this.formatCurrency(t.netPL)}</td>
              <td data-label="Strategy">${t.strategy}</td>
            </tr>`).join('')}
        </tbody></table></div>`;
    };

    applyFilters();
  }

  /* -------------------------- MODAL & DETAILS ------------------------------ */
  showTradeDetails(id) {
    const t = this.trades.find(tr => tr.id === id);
    if (!t) return;
    const rrText = t.riskRewardRatio ? t.riskRewardRatio.toFixed(2) : '0.00';
    const body = document.getElementById('tradeModalBody');
    body.innerHTML = `<div class="trade-detail-grid">
      <div class="trade-detail-item"><div class="trade-detail-label">Symbol</div><div class="trade-detail-value">${t.symbol}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Direction</div><div class="trade-detail-value"><span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span></div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Quantity</div><div class="trade-detail-value">${t.quantity}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Entry Price</div><div class="trade-detail-value">${this.formatCurrency(t.entryPrice)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Exit Price</div><div class="trade-detail-value">${this.formatCurrency(t.exitPrice)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Gross P&L</div><div class="trade-detail-value ${t.grossPL>=0?'positive':'negative'}">${this.formatCurrency(t.grossPL)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Net P&L</div><div class="trade-detail-value ${t.netPL>=0?'positive':'negative'}">${this.formatCurrency(t.netPL)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Risk:Reward</div><div class="trade-detail-value">1:${rrText}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Strategy</div><div class="trade-detail-value">${t.strategy}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Sleep Quality</div><div class="trade-detail-value">${t.sleepQuality||'N/A'}/10</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Pre-Stress</div><div class="trade-detail-value">${t.preStress||'N/A'}/10</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">FOMO Level</div><div class="trade-detail-value">${t.fomoLevel||'N/A'}/10</div></div>
    </div>
    ${t.notes?`<div style="margin-top:16px;"><strong>Notes:</strong><p>${t.notes}</p></div>`:''}
    ${t.lesson?`<div style="margin-top:16px;"><strong>Lesson Learned:</strong><p>${t.lesson}</p></div>`:''}`;
    document.getElementById('tradeModal').classList.remove('hidden');
  }

  hideTradeModal() { document.getElementById('tradeModal').classList.add('hidden'); }

  /* -------------------------- ANALYTICS & CHARTS ------------------------------ */
  renderAnalytics() {
    const s = this.calculateStats();
    document.getElementById('analyticsTotalTrades').textContent = s.totalTrades;
    document.getElementById('analyticsWinRate').textContent = s.winRate + '%';
    const netEl = document.getElementById('analyticsNetPL');
    netEl.textContent = this.formatCurrency(s.totalPL);
    netEl.className = 'value ' + (s.totalPL >= 0 ? 'positive' : 'negative');
    document.getElementById('analyticsBestTrade').textContent = this.formatCurrency(s.bestTrade);
    document.getElementById('analyticsWorstTrade').textContent = this.formatCurrency(s.worstTrade);
    document.getElementById('analyticsAvgRR').textContent = s.avgRR;

    if (typeof Chart === 'undefined') return;
    
    setTimeout(() => {
        this.drawPLChart();
        this.drawRRChart();
        this.drawStrategyChart();
        this.renderTimeTables();
    }, 50);
  }

  drawPLChart() {
    const ctx = document.getElementById('plChart');
    if (!ctx) return;
    this.charts.pl?.destroy();
    if (this.trades.length < 2) { ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }

    const sorted = [...this.trades].sort((a,b) => new Date(a.entryDate) - new Date(b.entryDate));
    const labels = [];
    const cum = [];
    let run = 0;
    sorted.forEach(t => { run += t.netPL; labels.push(this.formatDate(t.entryDate)); cum.push(run); });

    this.charts.pl = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets:[{ label:'Cumulative P&L', data:cum, borderColor:'#1FB8CD', backgroundColor:'rgba(31,184,205,0.15)', tension:0.4, fill:true }] },
      options: { responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:false, ticks:{ callback:v=>'₹'+v.toLocaleString('en-IN') } } } }
    });
  }

  drawRRChart() {
    const ctx = document.getElementById('rrChart');
    if (!ctx) return;
    this.charts.rr?.destroy();
    if (this.trades.length === 0) { ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }

    const buckets = { '<1:1':0, '1:1-1:2':0, '1:2-1:3':0, '>1:3':0 };
    this.trades.forEach(t => {
      const rr = t.riskRewardRatio || 0;
      if (rr < 1) buckets['<1:1']++; else if (rr < 2) buckets['1:1-1:2']++; else if (rr < 3) buckets['1:2-1:3']++; else buckets['>1:3']++;
    });

    this.charts.rr = new Chart(ctx, {
      type: 'bar',
      data: { labels:Object.keys(buckets), datasets:[{ label: '# of Trades', data:Object.values(buckets), backgroundColor:['#FF6384','#36A2EB','#FFCE56','#4BC0C0'] }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks: { stepSize: 1 } } } }
    });
  }
  
  drawStrategyChart() {
    const ctx = document.getElementById('strategyChart');
    if (!ctx) return;
    this.charts.strategy?.destroy();
    if (this.trades.length===0){ ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }

    const map = {};
    this.trades.forEach(t => {
      if(!map[t.strategy]) map[t.strategy]={ total:0, wins:0 };
      map[t.strategy].total++;
      if(t.netPL>0) map[t.strategy].wins++;
    });
    const labels = Object.keys(map);
    const data = labels.map(l => Math.round((map[l].wins / map[l].total) * 100));

    this.charts.strategy = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[{ label: 'Win Rate %', data, backgroundColor:'#4BC0C0' }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, max:100, ticks:{ callback:v=>v+'%' }}}}
    });
  }

  renderTimeTables() {
    const container = document.getElementById('timeChart').parentElement;
    container.querySelectorAll('.time-table').forEach(n=>n.remove());
    if (this.trades.length===0) return;

    const dowNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dowMap = Object.fromEntries(dowNames.map(d=>[d,{total:0,wins:0,net:0}]));

    this.trades.forEach(t => {
      const d = new Date(t.entryDate);
      const dow = dowNames[d.getDay()];
      dowMap[dow].total++;
      if(t.netPL>0) dowMap[dow].wins++;
      dowMap[dow].net+=t.netPL;
    });

    const makeTable = (title, rows) => {
      const div = document.createElement('div');
      div.className='time-table';
      div.innerHTML=`<h4>${title}</h4><table class="trade-table"><thead><tr><th>Period</th><th>Trades</th><th>Win %</th><th>Net P&L</th></tr></thead><tbody>${rows}</tbody></table>`;
      container.appendChild(div);
    };

    const dowRows = dowNames.filter(d=>dowMap[d].total>0).map(d=>{
      const o=dowMap[d];
      const win= o.total > 0 ? Math.round((o.wins/o.total)*100) : 0;
      return `<tr><td>${d}</td><td>${o.total}</td><td>${win}%</td><td class="${o.net>=0?'positive':'negative'}">${this.formatCurrency(o.net)}</td></tr>`;
    }).join('');
    makeTable('Day-of-Week Analysis', dowRows);
  }

  /* ----------------------- AI SUGGESTIONS ----------------------------- */
 renderAISuggestions() {
    if (this.trades.length < 3) {
        document.getElementById('smartInsight').textContent = "Add at least 3 trades to start receiving AI-powered suggestions and insights.";
        document.querySelectorAll('.suggestion-content').forEach(el => el.innerHTML = '<div class="empty-state">Not enough data.</div>');
        return;
    }

    const s = this.calculateStats();
    document.getElementById('smartInsight').textContent = s.totalPL >= 0 ?
      `Great job! You're net positive ${this.formatCurrency(s.totalPL)} with a ${s.winRate}% win rate.` :
      `You're net negative ${this.formatCurrency(s.totalPL)}. Focus on improving risk management and strategy selection.`;

    document.getElementById('aiFeedback').innerHTML = this.generateAIFeedback();
    document.getElementById('edgeAnalyzer').innerHTML = this.analyzeTradingEdge();
    document.getElementById('repeatTrades').innerHTML = this.findRepeatLosingTrades();
    document.getElementById('entryAnalysis').innerHTML = this.analyzeEntries();
    document.getElementById('emotionalBias').innerHTML = this.analyzeEmotionalBias();
    document.getElementById('setupQuality').innerHTML = this.calculateSetupQuality();
    document.getElementById('timeConfidence').innerHTML = this.analyzeTimeBasedConfidence();

    this.drawConfidenceChart();
  }

  drawConfidenceChart() {
    const ctx = document.getElementById('confidenceChart');
    if (!ctx) return;
    this.charts.conf?.destroy();
    if (this.confidenceEntries.length < 2) { 
      ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); 
      document.getElementById('confidenceAnalysis').innerHTML = '<div class="suggestion-item suggestion-info"><div class="suggestion-title">Not Enough Data</div><div class="suggestion-desc">Record daily confidence to see chart.</div></div>';
      return; 
    }

    const avg = (this.confidenceEntries.reduce((sum,c)=>sum+c.level,0)/this.confidenceEntries.length).toFixed(1);
    document.getElementById('confidenceAnalysis').innerHTML = `<div class="suggestion-item suggestion-info"><div class="suggestion-title">Avg Confidence</div><div class="suggestion-desc">${avg}/10 over ${this.confidenceEntries.length} days</div></div>`;

    const sorted = [...this.confidenceEntries].sort((a,b)=>new Date(a.date)-new Date(b.date));
    this.charts.conf = new Chart(ctx,{ type:'line', data:{ labels:sorted.map(c=>this.formatDate(c.date)), datasets:[{ label: 'Confidence', data:sorted.map(c=>c.level), borderColor:'#1FB8CD', tension:0.3 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ min:1, max:10, ticks: { stepSize: 1 } } } } });
  }

  bestStrategy() {
    if (this.trades.length===0) return 'N/A';
    const map={};
    this.trades.forEach(t=>{
        if(t.strategy && t.strategy !== 'N/A') {
            map[t.strategy]=(map[t.strategy]||0)+t.netPL
        }
    });
    const sortedStrategies = Object.entries(map).sort((a,b)=>b[1]-a[1]);
    return sortedStrategies.length > 0 ? sortedStrategies[0][0] : 'N/A';
  }

  /* ------------------------ REPORTS & CALENDAR ------------------------ */
  /* ------------------------ REPORTS & CALENDAR ------------------------ */
  renderReports() {
    this.buildCalendar();
    // Generate and render the content for each report card
    document.getElementById('weeklyReport').innerHTML = this.generateWeeklyReport();
    document.getElementById('monthlyReport').innerHTML = this.generateMonthlyReport();
    document.getElementById('strategyReport').innerHTML = this.generateStrategyReport();
    document.getElementById('emotionalReport').innerHTML = this.generateEmotionalReport();
  }

  changeCalendarMonth(offset) {
    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth()+offset);
    this.buildCalendar();
  }

  // Replace the old buildCalendar function with this one
  buildCalendar() {
    const date = this.currentCalendarDate;
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    document.getElementById('currentMonth').textContent = monthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const cal = document.getElementById('plCalendar');
    cal.innerHTML = ''; // Clear previous calendar

    // Add day headers
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => {
        const headerEl = document.createElement('div');
        headerEl.className = 'calendar-day header';
        headerEl.textContent = d;
        cal.appendChild(headerEl);
    });

    // Add empty spacer days
    for (let i = 0; i < monthStart.getDay(); i++) {
        const spacerEl = document.createElement('div');
        spacerEl.className = 'calendar-day no-trades';
        cal.appendChild(spacerEl);
    }

    // Add days of the month
    for (let d = 1; d <= monthEnd.getDate(); d++) {
        const dayEl = document.createElement('div');
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const tradesOnDay = this.trades.filter(t => t.entryDate && t.entryDate.startsWith(key));
        
        let cls = 'no-trades';
        if (tradesOnDay.length > 0) {
            const pl = tradesOnDay.reduce((sum, t) => sum + t.netPL, 0);
            if (pl > 1000) cls = 'profit-high';
            else if (pl > 0) cls = 'profit-low';
            else if (pl < -1000) cls = 'loss-high';
            else if (pl < 0) cls = 'loss-low';
            else cls = 'profit-low'; // Breakeven

            // Add event listeners if there are trades
            dayEl.addEventListener('mouseenter', (e) => this.showCalendarTooltip(e, tradesOnDay, key));
            dayEl.addEventListener('mousemove', (e) => this.updateTooltipPosition(e));
            dayEl.addEventListener('mouseleave', () => this.hideCalendarTooltip());
        }
        
        dayEl.className = `calendar-day ${cls}`;
        dayEl.textContent = d;
        cal.appendChild(dayEl);
    }
  }
// --- Add these three new functions ---
  showCalendarTooltip(event, trades, dateKey) {
    const tooltip = document.getElementById('calendarTooltip');
    const formattedDate = new Date(dateKey).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    let content = `<h4>Trades for ${formattedDate}</h4>`;
    trades.forEach(trade => {
        content += `
            <div class="calendar-tooltip-trade">
                <span class="symbol">${trade.symbol}</span>
                <span class="pl ${trade.netPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(trade.netPL)}</span>
            </div>
        `;
    });

    tooltip.innerHTML = content;
    tooltip.style.display = 'block';
    this.updateTooltipPosition(event);
  }

  hideCalendarTooltip() {
      const tooltip = document.getElementById('calendarTooltip');
      tooltip.style.display = 'none';
  }

  updateTooltipPosition(event) {
      const tooltip = document.getElementById('calendarTooltip');
      // Position tooltip slightly to the right and below the cursor
      tooltip.style.left = (event.pageX + 15) + 'px';
      tooltip.style.top = (event.pageY + 15) + 'px';
  }
  // --- End of new functions ---
  /* ------------------------ NEW REPORT & AI HELPERS ------------------------ */

  generateWeeklyReport() {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weeklyTrades = this.trades.filter(t => new Date(t.entryDate) >= oneWeekAgo);

    if (weeklyTrades.length === 0) return '<div class="empty-state">No trades in the last 7 days.</div>';

    const stats = this.calculateStatsForTrades(weeklyTrades);
    return `
      <div class="report-item"><span>Trades:</span><span>${stats.totalTrades}</span></div>
      <div class="report-item"><span>Win Rate:</span><span>${stats.winRate}%</span></div>
      <div class="report-item"><span>Net P&L:</span><span class="${stats.totalPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(stats.totalPL)}</span></div>
    `;
  }

  generateMonthlyReport() {
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthlyTrades = this.trades.filter(t => {
        const tradeDate = new Date(t.entryDate);
        return tradeDate.getMonth() === thisMonth && tradeDate.getFullYear() === thisYear;
    });

    if (monthlyTrades.length === 0) return '<div class="empty-state">No trades this month.</div>';

    const stats = this.calculateStatsForTrades(monthlyTrades);
    return `
      <div class="report-item"><span>Trades:</span><span>${stats.totalTrades}</span></div>
      <div class="report-item"><span>Win Rate:</span><span>${stats.winRate}%</span></div>
      <div class="report-item"><span>Net P&L:</span><span class="${stats.totalPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(stats.totalPL)}</span></div>
      <div class="report-item"><span>Best Trade:</span><span class="positive">${this.formatCurrency(stats.bestTrade)}</span></div>
      <div class="report-item"><span>Worst Trade:</span><span class="negative">${this.formatCurrency(stats.worstTrade)}</span></div>
    `;
  }

  generateStrategyReport() {
      const byStrategy = {};
      this.trades.forEach(t => {
          if (!t.strategy) return;
          if (!byStrategy[t.strategy]) byStrategy[t.strategy] = [];
          byStrategy[t.strategy].push(t);
      });

      if (Object.keys(byStrategy).length === 0) return '<div class="empty-state">No strategies defined.</div>';

      let table = '<table class="report-table"><thead><tr><th>Strategy</th><th>Trades</th><th>Win %</th><th>Net P&L</th></tr></thead><tbody>';
      for (const strategy in byStrategy) {
          const stats = this.calculateStatsForTrades(byStrategy[strategy]);
          table += `
        <tr>
          <td>${strategy}</td>
          <td>${stats.totalTrades}</td>
          <td>${stats.winRate}%</td>
          <td class="${stats.totalPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(stats.totalPL)}</td>
        </tr>`;
      }
      table += '</tbody></table>';
      return table;
  }

  generateEmotionalReport() {
      const preEmotions = {};
      this.trades.forEach(t => {
          if (!t.preEmotion) return;
          if (!preEmotions[t.preEmotion]) preEmotions[t.preEmotion] = { total: 0, pl: 0 };
          preEmotions[t.preEmotion].total++;
          preEmotions[t.preEmotion].pl += t.netPL;
      });

      if (Object.keys(preEmotions).length === 0) return '<div class="empty-state">No emotional data recorded.</div>';

      let mostProfitable = { emotion: 'N/A', avg: -Infinity };
      let leastProfitable = { emotion: 'N/A', avg: Infinity };

      for (const emotion in preEmotions) {
          const avg = preEmotions[emotion].pl / preEmotions[emotion].total;
          if (avg > mostProfitable.avg) mostProfitable = { emotion, avg };
          if (avg < leastProfitable.avg) leastProfitable = { emotion, avg };
      }

      return `
      <div class="report-item"><span>Most Profitable Emotion:</span><span>${mostProfitable.emotion} (${this.formatCurrency(mostProfitable.avg)}/trade)</span></div>
      <div class="report-item"><span>Least Profitable Emotion:</span><span>${leastProfitable.emotion} (${this.formatCurrency(leastProfitable.avg)}/trade)</span></div>
    `;
  }

  generateAIFeedback() {
      const stats = this.calculateStats();
      let feedback = '';
      if (stats.winRate < 50) {
          feedback += `<div class="suggestion-item suggestion-warning">Your win rate is ${stats.winRate}%. Consider reviewing your entry criteria and risk management.</div>`;
      } else {
          feedback += `<div class="suggestion-item suggestion-good">Your win rate of ${stats.winRate}% is solid. Keep refining what works!</div>`;
      }
      const avgRR = parseFloat(stats.avgRR.split(':')[1]);
      if (avgRR < 1.5) {
          feedback += `<div class="suggestion-item suggestion-warning">Your average Risk:Reward is low (${stats.avgRR}). Aim for setups with a higher potential reward.</div>`;
      }
      return feedback;
  }

  analyzeTradingEdge() {
      const best = this.bestStrategy();
      const worstStrategies = Object.entries(this.trades.reduce((acc, t) => {
          if (t.strategy) acc[t.strategy] = (acc[t.strategy] || 0) + t.netPL;
          return acc;
      }, {})).sort((a, b) => a[1] - b[1]);

      let result = `<div class="suggestion-item suggestion-good">Your most profitable strategy is <strong>${best}</strong>. Focus on mastering it.</div>`;
      if (worstStrategies.length > 0 && worstStrategies[0][1] < 0) {
          result += `<div class="suggestion-item suggestion-warning">Your least profitable strategy is <strong>${worstStrategies[0][0]}</strong>. Consider avoiding or re-evaluating it.</div>`;
      }
      return result;
  }

  findRepeatLosingTrades() {
      const losingTrades = this.trades.filter(t => t.netPL < 0);
      const patternCount = {};
      losingTrades.forEach(t => {
          const pattern = `${t.symbol} on ${t.strategy}`;
          if (t.strategy) {
              patternCount[pattern] = (patternCount[pattern] || 0) + 1;
          }
      });

      const recurringLosses = Object.entries(patternCount).filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]);

      if (recurringLosses.length > 0) {
          return `<div class="suggestion-item suggestion-warning">You have recurring losses with: <strong>${recurringLosses[0][0]}</strong> (${recurringLosses[0][1]} times). Analyze these trades to find the issue.</div>`;
      }
      return '<div class="suggestion-item suggestion-info">No significant recurring losing patterns detected. Good job diversifying your approach.</div>';
  }

  analyzeEntries() {
      const fomoTrades = this.trades.filter(t => t.fomoLevel > 5 && t.netPL < 0);
      if (fomoTrades.length > 2) {
          return `<div class="suggestion-item suggestion-warning">You've made ${fomoTrades.length} losing trades with high FOMO. Ensure you wait for your setup and avoid chasing the market.</div>`;
      }
      const earlyEntries = this.trades.filter(t => t.waitedForSetup === 'No, entered early' && t.netPL < 0);
      if (earlyEntries.length > 2) {
          return `<div class="suggestion-item suggestion-warning">You have ${earlyEntries.length} losing trades where you entered early. Practice patience and wait for confirmation.</div>`;
      }
      return '<div class="suggestion-item suggestion-good">Your entries appear disciplined. Keep waiting for your A+ setups.</div>';
  }

  analyzeEmotionalBias() {
      const frustrationExits = this.trades.filter(t => t.exitEmotion === 'Frustrated' && t.netPL < 0);
      if (frustrationExits.length > 2) {
          return `<div class="suggestion-item suggestion-warning">You've exited ${frustrationExits.length} losing trades feeling frustrated. This can lead to revenge trading. Take a break after a loss.</div>`;
      }
      const fearExits = this.trades.filter(t => t.primaryExitReason === 'Fear-based exit');
      if (fearExits.length > 2) {
          const profitLeft = fearExits.reduce((sum, t) => {
              if (t.netPL > 0 && t.targetPrice > t.exitPrice) return sum + (t.targetPrice - t.exitPrice) * t.quantity;
              return sum;
          }, 0);
          return `<div class="suggestion-item suggestion-warning">You've exited ${fearExits.length} trades due to fear, potentially leaving ${this.formatCurrency(profitLeft)} on the table. Trust your plan.</div>`;
      }
      return '<div class="suggestion-item suggestion-info">Your emotional responses to trades seem balanced. Keep maintaining a neutral mindset.</div>';
  }

  calculateSetupQuality() {
      const highQualityTrades = this.trades.filter(t => t.technicalConfluence && t.technicalConfluence.length >= 3);
      if (highQualityTrades.length === 0) return '<div class="empty-state">Not enough data on setup quality.</div>';

      const stats = this.calculateStatsForTrades(highQualityTrades);
      return `<div class="suggestion-item suggestion-info">For trades with 3+ confluence factors, your win rate is <strong>${stats.winRate}%</strong> with a P&L of <strong>${this.formatCurrency(stats.totalPL)}</strong>. Prioritize these high-quality setups.</div>`;
  }

  analyzeTimeBasedConfidence() {
      const morningTrades = this.trades.filter(t => t.marketSession === 'Market Open (9:30-10:30)');
      if (morningTrades.length < 3) return '<div class="empty-state">Not enough trades during market open to analyze.</div>';

      const stats = this.calculateStatsForTrades(morningTrades);
      let suggestion = '';
      if (stats.totalPL > 0) {
          suggestion = `<div class="suggestion-item suggestion-good">You perform well during the market open, with a P&L of <strong>${this.formatCurrency(stats.totalPL)}</strong>. This might be your golden hour.</div>`;
      } else {
          suggestion = `<div class="suggestion-item suggestion-warning">You seem to struggle during the market open, with a P&L of <strong>${this.formatCurrency(stats.totalPL)}</strong>. This period is volatile; consider trading smaller or waiting for the market to settle.</div>`;
      }
      return suggestion;
  }

  calculateStatsForTrades(trades) {
      if (trades.length === 0) {
          return { totalPL: 0, winRate: 0, totalTrades: 0, bestTrade: 0, worstTrade: 0 };
      }
      const totalPL = trades.reduce((sum, t) => sum + (t.netPL || 0), 0);
      const wins = trades.filter(t => t.netPL > 0).length;
      const winRate = trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0;
      const bestTrade = Math.max(0, ...trades.map(t => t.netPL));
      const worstTrade = Math.min(0, ...trades.map(t => t.netPL));
      return { totalPL, winRate, totalTrades: trades.length, bestTrade, worstTrade };
  }
  /* ------------------------ EXPORT ------------------------------------- */
  exportCSV() {
    if (this.trades.length===0) { this.showToast('No trades to export','warning'); return; }
    const header = Object.keys(this.trades[0]).join(',');
    const rows = this.trades.map(t => Object.values(t).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'trading_journal_data.csv'; a.click();
    URL.revokeObjectURL(url);
  }
}

// Initialize the app
window.app = new TradingJournalApp();





