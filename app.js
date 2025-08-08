// Trading Journal Application - Integrated with Supabase
class TradingJournalApp {
  constructor() {
    // --- SUPABASE SETUP ---
    const supabaseUrl = 'https://brjomrasrmbyxepjlfdq.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyam9tcmFzcm1ieXhlcGpsZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTMwODgsImV4cCI6MjA2OTUyOTA4OH0.51UGb-AE75iE6bPF_mXl_vOBPRB9JiHwFG-7jXyqIrs';
    this.supabase = supabase.createClient(supabaseUrl, supabaseAnonKey);

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
   * Listens for Supabase auth events. This is now primarily for handling
   * the initial session on page load and for handling logouts.
   */
  handleAuthStateChange() {
    this.supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[AUTH] Event: ${event}`);
      // Handle initial session on page load
      if (event === 'INITIAL_SESSION' && session) {
        this.currentUser = session.user;
        console.log('[AUTH] Existing session found. Initializing app...');
        await this.loadUserData();
        this.showMainApp();
      } 
      // Handle logout
      else if (event === 'SIGNED_OUT') {
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

        // Await the sign-in process
        const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });

        if (error) {
          this.showAuthError('login-password-error', error.message);
        } else if (data.user) {
          // If sign-in is successful, WE now control the flow.
          console.log('[AUTH] signInWithPassword successful. Initializing app...');
          this.currentUser = data.user;
          await this.loadUserData();
          this.showMainApp();
        }
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
        
        const { error } = await this.supabase.auth.signUp({ email, password });

        if (error) {
          this.showAuthError('signup-email-error', error.message);
        } else {
          this.showToast('Signup successful! You can now log in.', 'success');
          signupForm.reset();
          this.switchAuthTab('login');
        }
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    });
  }

  /**
   * Logs the user out by calling Supabase signOut.
   */
  async logout() {
    const { error } = await this.supabase.auth.signOut();
    if (error) {
      this.showToast(`Logout failed: ${error.message}`, 'error');
    } else {
      this.showToast('Logged out successfully', 'info');
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
   * Fetches all trades and confidence data for the current user from Supabase.
   */
  async loadUserData() {
    if (!this.currentUser) return;
    
    console.log('[DATA] Loading user data...');
    this.showToast('Loading your data...', 'info');
    const [tradesResponse, confidenceResponse] = await Promise.all([
      this.supabase.from('trades').select('*').order('entry_date', { ascending: false }),
      this.supabase.from('confidence').select('*').order('date', { ascending: false })
    ]);

    if (tradesResponse.error) {
      this.showToast(`Error fetching trades: ${tradesResponse.error.message}`, 'error');
      console.error('[DATA] Error fetching trades:', tradesResponse.error);
      this.allTrades = [];
    } else {
      this.allTrades = tradesResponse.data;
      console.log(`[DATA] Loaded ${this.allTrades.length} trades.`);
    }

    if (confidenceResponse.error) {
      this.showToast(`Error fetching confidence data: ${confidenceResponse.error.message}`, 'error');
      console.error('[DATA] Error fetching confidence:', confidenceResponse.error);
      this.allConfidence = [];
    } else {
      this.allConfidence = confidenceResponse.data;
      console.log(`[DATA] Loaded ${this.allConfidence.length} confidence entries.`);
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
    const totalPL = this.trades.reduce((sum, t) => sum + (t.net_pl || 0), 0);
    const wins = this.trades.filter(t => t.net_pl > 0).length;
    const winRate = this.trades.length > 0 ? Math.round((wins / this.trades.length) * 100) : 0;
    const bestTrade = Math.max(0, ...this.trades.map(t => t.net_pl));
    const worstTrade = Math.min(0, ...this.trades.map(t => t.net_pl));
    const validRRTrades = this.trades.filter(t => t.risk_reward_ratio > 0);
    const avgRRNum = validRRTrades.length > 0 
      ? (validRRTrades.reduce((sum, t) => sum + t.risk_reward_ratio, 0) / validRRTrades.length).toFixed(2)
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
      <div class="trade-item" onclick="app.showTradeDetails(${t.id})">
        <div class="trade-info">
          <span class="trade-symbol">${t.symbol}</span>
          <span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span>
          <span class="trade-date">${this.formatDate(t.entry_date)}</span>
        </div>
        <div class="trade-pl ${t.net_pl >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(t.net_pl)}</div>
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

    const { data, error } = await this.supabase
      .from('confidence')
      .insert([{ date: today, level: level, user_id: this.currentUser.id }])
      .select();

    if (error) {
      this.showToast(`Error saving confidence: ${error.message}`, 'error');
    } else {
      this.allConfidence.unshift(data[0]);
      document.getElementById('confidenceMessage').innerHTML = "<div class='message success'>Daily confidence recorded successfully!</div>";
      this.showToast('Daily confidence recorded!', 'success');
      document.dispatchEvent(new CustomEvent('data-changed'));
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
      user_id: this.currentUser.id,
      symbol: fd.get('symbol').toUpperCase(),
      direction: fd.get('direction'),
      quantity: parseFloat(fd.get('quantity')),
      entry_price: parseFloat(fd.get('entryPrice')),
      exit_price: parseFloat(fd.get('exitPrice')),
      stop_loss: parseFloat(fd.get('stopLoss')) || null,
      target_price: parseFloat(fd.get('targetPrice')) || null,
      strategy: fd.get('strategy') || 'N/A',
      exit_reason: fd.get('exitReason') || 'N/A',
      confidence_level: parseInt(fd.get('confidenceLevel')),
      entry_date: fd.get('entryDate'),
      exit_date: fd.get('exitDate'),
      pre_emotion: fd.get('preEmotion') || '',
      post_emotion: fd.get('postEmotion') || '',
      notes: fd.get('notes') || '',
      sleep_quality: parseInt(fd.get('sleepQuality')) || 5,
      physical_condition: parseInt(fd.get('physicalCondition')) || 5,
      market_sentiment: fd.get('marketSentiment') || '',
      news_awareness: fd.get('newsAwareness') || '',
      market_environment: fd.get('marketEnvironment') || '',
      fomo_level: parseInt(fd.get('fomoLevel')) || 1,
      pre_stress: parseInt(fd.get('preStress')) || 1,
      multi_timeframes: this.getCheckboxValues(form, 'multiTimeframes'),
      volume_analysis: fd.get('volumeAnalysis') || '',
      technical_confluence: this.getCheckboxValues(form, 'technicalConfluence'),
      market_session: fd.get('marketSession') || '',
      trade_catalyst: fd.get('tradeCatalyst') || '',
      waited_for_setup: this.getRadioValue(form, 'waitedForSetup'),
      position_comfort: parseInt(fd.get('positionComfort')) || 5,
      plan_deviation: fd.get('planDeviation') || '',
      stress_during: parseInt(fd.get('stressDuring')) || 1,
      primary_exit_reason: fd.get('primaryExitReason') || '',
      exit_emotion: fd.get('exitEmotion') || '',
      would_take_again: this.getRadioValue(form, 'wouldTakeAgain'),
      lesson: fd.get('lesson') || '',
      volatility_today: fd.get('volatilityToday') || '',
      sector_performance: fd.get('sectorPerformance') || '',
      economic_events: this.getCheckboxValues(form, 'economicEvents'),
      personal_distractions: this.getCheckboxValues(form, 'personalDistractions')
    };

    trade.gross_pl = trade.direction === 'Long' ? (trade.exit_price - trade.entry_price) * trade.quantity : (trade.entry_price - trade.exit_price) * trade.quantity;
    trade.net_pl = trade.gross_pl - 40;
    if (trade.stop_loss && trade.target_price) {
      const risk = Math.abs(trade.entry_price - trade.stop_loss);
      const reward = Math.abs(trade.target_price - trade.entry_price);
      trade.risk_reward_ratio = risk ? reward / risk : 0;
    } else {
      trade.risk_reward_ratio = 0;
    }

    console.log('[DATA] Attempting to insert trade for user:', this.currentUser.id);
    const { data, error } = await this.supabase
      .from('trades')
      .insert([trade])
      .select();

    if (error) {
      console.error('[DATA] Supabase insert error:', error);
      this.showToast(`Error saving trade: ${error.message}`, 'error');
    } else {
      this.allTrades.unshift(data[0]);
      this.showToast('Trade saved successfully!', 'success');
      form.reset();
      this.updateCalculations();
      this.renderAddTrade();
      document.dispatchEvent(new CustomEvent('data-changed'));
      this.showSection('dashboard');
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
            <tr onclick="app.showTradeDetails(${t.id})">
              <td data-label="Date">${this.formatDate(t.entry_date)}</td>
              <td data-label="Symbol">${t.symbol}</td>
              <td data-label="Direction"><span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span></td>
              <td data-label="Qty">${t.quantity}</td>
              <td data-label="Entry">${this.formatCurrency(t.entry_price)}</td>
              <td data-label="Exit">${this.formatCurrency(t.exit_price)}</td>
              <td data-label="P&L" class="${t.net_pl>=0?'positive':'negative'}">${this.formatCurrency(t.net_pl)}</td>
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
    const rrText = t.risk_reward_ratio ? t.risk_reward_ratio.toFixed(2) : '0.00';
    const body = document.getElementById('tradeModalBody');
    body.innerHTML = `<div class="trade-detail-grid">
      <div class="trade-detail-item"><div class="trade-detail-label">Symbol</div><div class="trade-detail-value">${t.symbol}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Direction</div><div class="trade-detail-value"><span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span></div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Quantity</div><div class="trade-detail-value">${t.quantity}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Entry Price</div><div class="trade-detail-value">${this.formatCurrency(t.entry_price)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Exit Price</div><div class="trade-detail-value">${this.formatCurrency(t.exit_price)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Gross P&L</div><div class="trade-detail-value ${t.gross_pl>=0?'positive':'negative'}">${this.formatCurrency(t.gross_pl)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Net P&L</div><div class="trade-detail-value ${t.net_pl>=0?'positive':'negative'}">${this.formatCurrency(t.net_pl)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Risk:Reward</div><div class="trade-detail-value">1:${rrText}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Strategy</div><div class="trade-detail-value">${t.strategy}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Sleep Quality</div><div class="trade-detail-value">${t.sleep_quality||'N/A'}/10</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Pre-Stress</div><div class="trade-detail-value">${t.pre_stress||'N/A'}/10</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">FOMO Level</div><div class="trade-detail-value">${t.fomo_level||'N/A'}/10</div></div>
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

    const sorted = [...this.trades].sort((a,b) => new Date(a.entry_date) - new Date(b.entry_date));
    const labels = [];
    const cum = [];
    let run = 0;
    sorted.forEach(t => { run += t.net_pl; labels.push(this.formatDate(t.entry_date)); cum.push(run); });

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
      const rr = t.risk_reward_ratio || 0;
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
      if(t.net_pl>0) map[t.strategy].wins++;
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
      const d = new Date(t.entry_date);
      const dow = dowNames[d.getDay()];
      dowMap[dow].total++;
      if(t.net_pl>0) dowMap[dow].wins++;
      dowMap[dow].net+=t.net_pl;
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
            map[t.strategy]=(map[t.strategy]||0)+t.net_pl
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
