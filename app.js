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
  }

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

    const slider = document.getElementById('dailyConfidence');
    const out = document.getElementById('confidenceValue');
    slider.addEventListener('input', () => (out.textContent = slider.value));
    document.getElementById('saveConfidenceBtn').addEventListener('click', () => this.saveDailyConfidence());

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

    const list = document.getElementById('recentTradesList');
    if (this.trades.length === 0) {
      list.innerHTML = '<div class="empty-state">No trades yet. Click "Add New Trade" to get started!</div>';
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
    const s = this.calculateStats();
    document.getElementById('smartInsight').textContent = s.totalPL>=0 ?
      `Great job! You're net positive ${this.formatCurrency(s.totalPL)} with a ${s.winRate}% win rate.` :
      `You're net negative ${this.formatCurrency(s.totalPL)}. Focus on risk management and psychology.`;

    document.getElementById('aiFeedback').innerHTML = `<div class="suggestion-item suggestion-info"><div class="suggestion-title">Win Rate</div><div class="suggestion-desc">${s.winRate}% over ${s.totalTrades} trades.</div></div>`;
    document.getElementById('edgeAnalyzer').innerHTML = `<div class="suggestion-item suggestion-info"><div class="suggestion-title">Best Strategy</div><div class="suggestion-desc">${this.bestStrategy()}</div></div>`;
    
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
  renderReports() {
    this.buildCalendar();
    // Other report logic can go here
  }

  changeCalendarMonth(offset) {
    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth()+offset);
    this.buildCalendar();
  }

  buildCalendar() {
    const date = this.currentCalendarDate;
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth()+1, 0);
    
    document.getElementById('currentMonth').textContent = monthStart.toLocaleDateString('en-IN', { month:'long', year:'numeric' });
    const cal = document.getElementById('plCalendar');
    cal.innerHTML='';

    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d=> cal.innerHTML += `<div class="calendar-day header">${d}</div>`);
    for(let i=0;i<monthStart.getDay();i++) cal.innerHTML += `<div class="calendar-day no-trades"></div>`;

    for(let d=1; d<=monthEnd.getDate(); d++){
      const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const trades = this.trades.filter(t => t.entry_date && t.entry_date.startsWith(key));
      let cls = 'no-trades';
      if (trades.length) {
        const pl = trades.reduce((sum,t)=>sum+t.net_pl,0);
        if (pl>1000) cls='profit-high'; else if (pl>0) cls='profit-low'; else if (pl<-1000) cls='loss-high'; else if (pl < 0) cls='loss-low';
      }
      cal.innerHTML += `<div class="calendar-day ${cls}">${d}</div>`;
    }
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
