// Trading Journal Application with Supabase Integration
// Supabase credentials
const SUPABASE_URL = 'https://brjomrasrmbyxepjlfdq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyam9tcmFzcm1ieXhlcGpsZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTMwODgsImV4cCI6MjA2OTUyOTA4OH0.51UGb2AE75iE6bPF_mXl_vOBPRB9JiHwFG-7jXyqIrs';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

class TradingJournalApp {
  constructor() {
    this.currentUser = null;
    this.charts = {};
    this.trades = [];
    this.confidenceEntries = [];

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.bootstrap());
    } else {
      this.bootstrap();
    }
  }

  async bootstrap() {
    // Check for existing session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      this.currentUser = session.user;
      await this.fetchUserProfile();
      this.showMainApp();
    } else {
      this.setupAuthListeners();
      this.showAuthScreen();
    }
  }

  async fetchUserProfile() {
    if (!this.currentUser) return;
    
    const { data, error } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('user_id', this.currentUser.id)
      .single();
    
    if (data) {
      this.currentUser.username = data.username;
    }
  }

  async createUserProfile(username) {
    if (!this.currentUser) return;
    
    await supabase
      .from('user_profiles')
      .upsert({
        user_id: this.currentUser.id,
        username,
        created_at: new Date().toISOString()
      });
  }

  /* ------------------------------- AUTH ---------------------------------- */
  setupAuthListeners() {
    // Switch tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.tab));
    });

    // Login form
    document.getElementById('loginFormElement').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = fd.get('email').trim();
      const password = fd.get('password').trim();
      this.clearAuthErrors();
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        this.showAuthError('login-password-error', error.message);
        return;
      }
      
      this.currentUser = data.user;
      await this.fetchUserProfile();
      this.showToast('Login successful!', 'success');
      this.showMainApp();
    });

    // Signup form
    document.getElementById('signupFormElement').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const username = fd.get('username').trim();
      const email = fd.get('email').trim();
      const password = fd.get('password');
      const confirm = fd.get('confirmPassword');
      
      this.clearAuthErrors();
      
      if (password !== confirm) {
        this.showAuthError('signup-confirmPassword-error', 'Passwords do not match');
        return;
      }
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username }
        }
      });
      
      if (error) {
        this.showAuthError('signup-email-error', error.message);
        return;
      }
      
      this.currentUser = data.user;
      await this.createUserProfile(username);
      this.showToast('Account created! Please check your email to confirm', 'success');
      this.switchAuthTab('login');
    });

    // Demo logins
    document.querySelectorAll('.demo-login').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: btn.dataset.email,
          password: btn.dataset.password
        });
        
        if (error) {
          this.showToast('Demo login failed', 'error');
          return;
        }
        
        this.currentUser = data.user;
        await this.fetchUserProfile();
        this.showMainApp();
      });
    });
  }

  switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.toggle('active', f.id === tab + 'Form'));
    this.clearAuthErrors();
  }

  showAuthError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add('active');
  }

  clearAuthErrors() {
    document.querySelectorAll('.form-error').forEach(e => {
      e.textContent = '';
      e.classList.remove('active');
    });
  }

  logout() {
    supabase.auth.signOut();
    this.currentUser = null;
    Object.values(this.charts).forEach(chart => chart && chart.destroy && chart.destroy());
    this.charts = {};
    this.showAuthScreen();
    this.showToast('Logged out successfully', 'success');
  }

  /* ------------------------------ VIEW SWITCH --------------------------- */
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
    this.showSection('dashboard');
  }

  attachMainListeners() {
    document.querySelectorAll('.nav-link').forEach(btn => {
      btn.addEventListener('click', () => this.showSection(btn.dataset.section));
    });
    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('quickAddTrade').addEventListener('click', () => this.showSection('add-trade'));

    // Daily confidence slider
    const slider = document.getElementById('dailyConfidence');
    const out = document.getElementById('confidenceValue');
    slider.addEventListener('input', () => (out.textContent = slider.value));
    document.getElementById('saveConfidenceBtn').addEventListener('click', () => this.saveDailyConfidence());

    // Add trade form setup
    this.setupAddTradeForm();

    // Export
    document.getElementById('exportData').addEventListener('click', () => this.exportCSV());

    // Calendar nav
    document.getElementById('prevMonth').addEventListener('click', () => this.changeCalendarMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => this.changeCalendarMonth(1));

    // Custom event for confidence update
    document.addEventListener('confidence-updated', () => {
      if (document.getElementById('ai-suggestions').classList.contains('active')) {
        this.renderAISuggestions();
      }
      if (document.getElementById('reports').classList.contains('active')) {
        this.renderReports();
      }
    });
  }

  updateUserInfo() {
    document.getElementById('currentUserName').textContent = this.currentUser.username;
  }

  toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-color-scheme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-color-scheme', next);
    document.getElementById('themeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
  }

  showSection(id) {
    document.querySelectorAll('.nav-link').forEach(btn => btn.classList.toggle('active', btn.dataset.section === id));
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    switch (id) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'add-trade':
        this.renderAddTrade();
        break;
      case 'history':
        this.renderHistory();
        break;
      case 'analytics':
        this.renderAnalytics();
        break;
      case 'ai-suggestions':
        this.renderAISuggestions();
        break;
      case 'reports':
        this.renderReports();
        break;
    }
  }

  /* ------------------------------ HELPERS ------------------------------- */
  formatCurrency(val) {
    const sign = val < 0 ? '-' : '';
    return sign + '₹' + Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  }

  formatDate(str) {
    return new Date(str).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
  }

  showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const div = document.createElement('div');
    div.className = 'toast ' + type;
    div.textContent = msg;
    container.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }

  /* ---------------------- DASHBOARD RENDER ----------------------------- */
  async loadTrades() {
    if (!this.currentUser) return [];
    
    const { data, error } = await supabase
      .from('enhanced_trades')
      .select('*')
      .eq('user_id', this.currentUser.id)
      .order('entry_date', { ascending: false });
    
    return data || [];
  }

  async loadConfidenceEntries() {
    if (!this.currentUser) return [];
    
    const { data, error } = await supabase
      .from('confidence_entries')
      .select('*')
      .eq('user_id', this.currentUser.id)
      .order('date', { ascending: false });
    
    return data || [];
  }

  calculateStats(trades) {
    if (trades.length === 0) {
      return { totalPL: 0, winRate: 0, totalTrades: 0, avgRR: '1:0', bestTrade: 0, worstTrade: 0 };
    }
    const totalPL = trades.reduce((sum, t) => sum + (t.netPL || 0), 0);
    const wins = trades.filter(t => t.netPL > 0).length;
    const winRate = Math.round((wins / trades.length) * 100);
    const bestTrade = Math.max(...trades.map(t => t.netPL));
    const worstTrade = Math.min(...trades.map(t => t.netPL));
    const avgRRNum = (
      trades.filter(t => t.riskRewardRatio !== undefined).reduce((sum, t, _, arr) => sum + t.riskRewardRatio / arr.length, 0)
    ).toFixed(2);
    return { totalPL, winRate, totalTrades: trades.length, avgRR: '1:' + avgRRNum, bestTrade, worstTrade };
  }

  async renderDashboard() {
    this.trades = await this.loadTrades();
    this.confidenceEntries = await this.loadConfidenceEntries();
    
    const s = this.calculateStats(this.trades);
    const totalPLEl = document.getElementById('totalPL');
    totalPLEl.textContent = this.formatCurrency(s.totalPL);
    totalPLEl.className = 'stat-value ' + (s.totalPL >= 0 ? 'positive' : 'negative');
    document.getElementById('winRate').textContent = s.winRate + '%';
    document.getElementById('totalTrades').textContent = s.totalTrades;
    document.getElementById('avgRR').textContent = s.avgRR;

    // Recent trades list
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
        <div class="trade-pl ${t.netPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(t.netPL)}</div>
      </div>`).join('');
  }

  async saveDailyConfidence() {
    const level = parseInt(document.getElementById('dailyConfidence').value, 10);
    const today = new Date().toISOString().split('T')[0];
    
    const { error } = await supabase
      .from('confidence_entries')
      .upsert({
        user_id: this.currentUser.id,
        date: today,
        level
      });
    
    if (error) {
      this.showToast('Failed to save confidence: ' + error.message, 'error');
      return;
    }
    
    document.getElementById('confidenceMessage').innerHTML = "<div class='message success'>Daily confidence recorded successfully!</div>";
    this.showToast('Daily confidence recorded successfully!', 'success');
    document.dispatchEvent(new CustomEvent('confidence-updated', { detail: { date: today, level } }));
    
    // Reload confidence data
    this.confidenceEntries = await this.loadConfidenceEntries();
  }

  /* ----------------------- ADD TRADE FORM ------------------------------ */
  renderAddTrade() {
    const now = new Date();
    const entryDateEl = document.querySelector('input[name="entryDate"]');
    const exitDateEl = document.querySelector('input[name="exitDate"]');
    if (entryDateEl && !entryDateEl.value) entryDateEl.value = now.toISOString().slice(0, 16);
    if (exitDateEl && !exitDateEl.value) exitDateEl.value = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 16);
  }

  setupAddTradeForm() {
    const form = document.getElementById('addTradeForm');
    
    // Setup all range inputs with their corresponding value displays
    const rangeInputs = [
      { name: 'confidenceLevel', displayId: 'tradeConfidenceValue' },
      { name: 'sleepQuality', displayClass: 'range-value' },
      { name: 'physicalCondition', displayClass: 'range-value' },
      { name: 'fomoLevel', displayClass: 'range-value' },
      { name: 'preStress', displayClass: 'range-value' },
      { name: 'positionComfort', displayClass: 'range-value' },
      { name: 'stressDuring', displayClass: 'range-value' }
    ];

    rangeInputs.forEach(input => {
      const slider = form.querySelector(`[name="${input.name}"]`);
      if (slider) {
        const display = input.displayId ? 
          document.getElementById(input.displayId) : 
          slider.parentElement.querySelector('.range-value');
        
        if (display) {
          slider.addEventListener('input', () => (display.textContent = slider.value));
        }
      }
    });

    const calcFields = ['quantity', 'entryPrice', 'exitPrice', 'stopLoss', 'targetPrice', 'direction'];
    calcFields.forEach(name => {
      const field = form.querySelector(`[name="${name}"]`);
      if (field) {
        field.addEventListener('input', () => this.updateCalculations());
        field.addEventListener('change', () => this.updateCalculations());
      }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      await this.submitTrade();
    });

    document.getElementById('resetTradeForm').addEventListener('click', () => {
      form.reset();
      this.updateCalculations();
      this.renderAddTrade();
      // Reset all range value displays
      document.querySelectorAll('.range-value').forEach(el => el.textContent = '5');
      const tradeConfidenceValue = document.getElementById('tradeConfidenceValue');
      if (tradeConfidenceValue) tradeConfidenceValue.textContent = '5';
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

    let gross = 0;
    if (qty && entry && exit) {
      gross = dir === 'Long' ? (exit - entry) * qty : (entry - exit) * qty;
    }
    const net = gross - 40; // assume brokerage

    let riskReward = 0;
    if (qty && entry && sl) {
      const risk = Math.abs(entry - sl) * qty;
      const reward = target ? Math.abs((dir === 'Long' ? target - entry : entry - target)) * qty : Math.abs(gross);
      if (risk > 0) riskReward = reward / risk;
    }

    // Capital risk % (assume capital 100k for demo)
    const capitalRisk = ((Math.abs(entry - sl) * qty) / 100000) * 100 || 0;

    // Update UI
    const setVal = (id, val, pos) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = val;
        if (pos !== undefined) el.className = 'calc-value ' + (pos ? 'positive' : 'negative');
      }
    };
    setVal('calcGrossPL', this.formatCurrency(gross), gross >= 0);
    setVal('calcNetPL', this.formatCurrency(net), net >= 0);
    const rrEl = document.getElementById('calcRiskReward');
    if (rrEl) rrEl.textContent = '1:' + riskReward.toFixed(2);
    const crEl = document.getElementById('calcCapitalRisk');
    if (crEl) crEl.textContent = capitalRisk.toFixed(2) + '%';
  }

  // Helper function to get checkbox values
  getCheckboxValues(name) {
    const checkboxes = document.querySelectorAll(`input[name="${name}"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
  }

  // Helper function to get radio value
  getRadioValue(name) {
    const radio = document.querySelector(`input[name="${name}"]:checked`);
    return radio ? radio.value : '';
  }

  async submitTrade() {
    const form = document.getElementById('addTradeForm');
    const fd = new FormData(form);
    // Clear prev errors
    form.querySelectorAll('.form-error').forEach(e => {
      e.textContent = '';
      e.classList.remove('active');
    });

    // Validate required fields
    const required = ['symbol', 'direction', 'quantity', 'entryPrice', 'exitPrice', 'entryDate', 'exitDate'];
    let hasErr = false;
    required.forEach(field => {
      const val = fd.get(field);
      if (!val || val.toString().trim() === '') {
        const errEl = document.getElementById(field + '-error');
        if (errEl) {
          errEl.textContent = 'Required';
          errEl.classList.add('active');
        }
        hasErr = true;
      }
    });

    const qty = parseFloat(fd.get('quantity'));
    if (isNaN(qty) || qty <= 0) {
      const errEl = document.getElementById('quantity-error');
      if (errEl) {
        errEl.textContent = 'Must be positive';
        errEl.classList.add('active');
      }
      hasErr = true;
    }

    const entryDate = new Date(fd.get('entryDate'));
    const exitDate = new Date(fd.get('exitDate'));
    if (exitDate <= entryDate) {
      const errEl = document.getElementById('exitDate-error');
      if (errEl) {
        errEl.textContent = 'Exit after entry';
        errEl.classList.add('active');
      }
      hasErr = true;
    }

    if (hasErr) {
      this.showToast('Please fix errors', 'error');
      return;
    }

    // Build comprehensive trade object with all psychology fields
    const trade = {
      user_id: this.currentUser.id,
      // Basic trade details
      symbol: fd.get('symbol').toUpperCase(),
      direction: fd.get('direction'),
      quantity: qty,
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

      // Pre-Trade Psychology
      sleep_quality: parseInt(fd.get('sleepQuality')) || 5,
      physical_condition: parseInt(fd.get('physicalCondition')) || 5,
      market_sentiment: fd.get('marketSentiment') || '',
      news_awareness: fd.get('newsAwareness') || '',
      market_environment: fd.get('marketEnvironment') || '',
      fomo_level: parseInt(fd.get('fomoLevel')) || 1,
      pre_stress: parseInt(fd.get('preStress')) || 1,

      // Trade Setup Analysis
      multi_timeframes: this.getCheckboxValues('multiTimeframes').join(', '),
      volume_analysis: fd.get('volumeAnalysis') || '',
      technical_confluence: this.getCheckboxValues('technicalConfluence').join(', '),
      market_session: fd.get('marketSession') || '',
      trade_catalyst: fd.get('tradeCatalyst') || '',

      // During Trade Management
      waited_for_setup: this.getRadioValue('waitedForSetup'),
      position_comfort: parseInt(fd.get('positionComfort')) || 5,
      plan_deviation: fd.get('planDeviation') || '',
      stress_during: parseInt(fd.get('stressDuring')) || 1,

      // Exit Analysis
      primary_exit_reason: fd.get('primaryExitReason') || '',
      exit_emotion: fd.get('exitEmotion') || '',
      would_take_again: this.getRadioValue('wouldTakeAgain'),
      lesson: fd.get('lesson') || '',

      // Market Context
      volatility_today: fd.get('volatilityToday') || '',
      sector_performance: fd.get('sectorPerformance') || '',
      economic_events: this.getCheckboxValues('economicEvents').join(', '),
      personal_distractions: this.getCheckboxValues('personalDistractions').join(', ')
    };

    // Calculate P&L and RR
    trade.gross_pl = trade.direction === 'Long' ? 
      (trade.exit_price - trade.entry_price) * trade.quantity : 
      (trade.entry_price - trade.exit_price) * trade.quantity;
    
    trade.net_pl = trade.gross_pl - 40; // assume brokerage
    
    if (trade.stop_loss) {
      const risk = Math.abs(trade.entry_price - trade.stop_loss) * trade.quantity;
      const reward = trade.target_price ? 
        Math.abs((trade.direction === 'Long' ? trade.target_price - trade.entry_price : trade.entry_price - trade.target_price)) * trade.quantity : 
        Math.abs(trade.gross_pl);
      
      trade.risk_reward_ratio = risk ? reward / risk : 0;
    } else {
      trade.risk_reward_ratio = 0;
    }

    // Save to Supabase
    const { data, error } = await supabase
      .from('enhanced_trades')
      .insert([trade]);
    
    if (error) {
      this.showToast('Failed to save trade: ' + error.message, 'error');
      return;
    }

    this.showToast('Trade saved with enhanced psychology data!', 'success');
    form.reset();
    this.updateCalculations();
    this.renderAddTrade();
    // Reset all range value displays
    document.querySelectorAll('.range-value').forEach(el => el.textContent = '5');
    const tradeConfidenceValue = document.getElementById('tradeConfidenceValue');
    if (tradeConfidenceValue) tradeConfidenceValue.textContent = '5';
    
    // Reload trades
    this.trades = await this.loadTrades();
    this.showSection('dashboard');
  }

  /* ---------------------------- HISTORY ------------------------------- */
  async renderHistory() {
    const container = document.getElementById('historyContent');
    this.trades = await this.loadTrades();
    
    if (this.trades.length === 0) {
      container.innerHTML = '<div class="empty-state">No trades recorded yet.</div>';
      return;
    }

    // Populate filters
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
              <td data-label="Entry">₹${t.entry_price}</td>
              <td data-label="Exit">₹${t.exit_price}</td>
              <td data-label="P&L" class="${t.net_pl>=0?'positive':'negative'}">${this.formatCurrency(t.net_pl)}</td>
              <td data-label="Strategy">${t.strategy}</td>
            </tr>`).join('')}
        </tbody></table></div>`;
    };

    applyFilters();
  }

  /* -------------------------- ANALYTICS ------------------------------ */
  async renderAnalytics() {
    this.trades = await this.loadTrades();
    const s = this.calculateStats(this.trades);
    
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
    }, 30);
  }

  drawPLChart() {
    const ctx = document.getElementById('plChart');
    if (!ctx) return;
    this.charts.pl && this.charts.pl.destroy();
    if (this.trades.length === 0) { ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }

    const sorted = [...this.trades].sort((a,b) => new Date(a.entry_date) - new Date(b.entry_date));
    const labels = [];
    const cum = [];
    let run = 0;
    sorted.forEach(t => { run += t.net_pl; labels.push(this.formatDate(t.entry_date)); cum.push(run); });

    this.charts.pl = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets:[{ label:'Cumulative P&L', data:cum, borderColor:'#1FB8CD', backgroundColor:'rgba(31,184,205,0.15)', tension:0.4, fill:true }] },
      options: { responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true, ticks:{ callback:v=>'₹'+v.toLocaleString('en-IN') } } } }
    });
  }

  drawRRChart() {
    const ctx = document.getElementById('rrChart');
    if (!ctx) return;
    this.charts.rr && this.charts.rr.destroy();
    if (this.trades.length === 0) { ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }

    const buckets = { '<1:1':0, '1:1-1:2':0, '1:2-1:3':0, '>1:3':0 };
    this.trades.forEach(t => {
      const rr = t.risk_reward_ratio || 0;
      if (rr < 1) buckets['<1:1']++; else if (rr < 2) buckets['1:1-1:2']++; else if (rr < 3) buckets['1:2-1:3']++; else buckets['>1:3']++;
    });

    this.charts.rr = new Chart(ctx, {
      type: 'bar',
      data: { labels:Object.keys(buckets), datasets:[{ data:Object.values(buckets), backgroundColor:['#FFC185','#B4413C','#5D878F','#1FB8CD'] }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } }
    });
  }

  drawStrategyChart() {
    const ctx = document.getElementById('strategyChart');
    if (!ctx) return;
    this.charts.strategy && this.charts.strategy.destroy();
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
      data:{ labels, datasets:[{ data, backgroundColor:'#1FB8CD' }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, max:100, ticks:{ callback:v=>v+'%' }}}}
    });
  }

  renderTimeTables() {
    const container = document.getElementById('timeChart').parentElement;
    container.querySelectorAll('.time-table').forEach(n=>n.remove());
    if (this.trades.length===0) return;

    const monthMap = {};
    const dowNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dowMap = Object.fromEntries(dowNames.map(d=>[d,{total:0,wins:0,net:0}]));

    this.trades.forEach(t => {
      const d = new Date(t.entry_date);
      const mKey = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}`;
      if(!monthMap[mKey]) monthMap[mKey]={total:0,wins:0,net:0};
      monthMap[mKey].total++;
      if(t.net_pl>0) monthMap[mKey].wins++;
      monthMap[mKey].net+=t.net_pl;

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

    const monthRows = Object.keys(monthMap).sort().map(k => {
      const o=monthMap[k];
      const win=Math.round((o.wins/o.total)*100);
      return `<tr><td>${k}</td><td>${o.total}</td><td>${win}%</td><td class="${o.net>=0?'positive':'negative'}">${this.formatCurrency(o.net)}</td></tr>`;
    }).join('');
    makeTable('Monthly Performance', monthRows);

    const dowRows = dowNames.filter(d=>dowMap[d].total>0).map(d=>{
      const o=dowMap[d];
      const win=Math.round((o.wins/o.total)*100);
      return `<tr><td>${d}</td><td>${o.total}</td><td>${win}%</td><td class="${o.net>=0?'positive':'negative'}">${this.formatCurrency(o.net)}</td></tr>`;
    }).join('');
    makeTable('Day-of-Week Analysis', dowRows);
  }

  /* ----------------------- AI SUGGESTIONS ----------------------------- */
  async renderAISuggestions() {
    this.trades = await this.loadTrades();
    this.confidenceEntries = await this.loadConfidenceEntries();
    
    const s = this.calculateStats(this.trades);
    document.getElementById('smartInsight').textContent = s.totalPL>=0 ?
      `Great job! You're net positive ${this.formatCurrency(s.totalPL)} with a ${s.winRate}% win rate.` :
      `You're net negative ${this.formatCurrency(s.totalPL)}. Focus on risk management and psychology.`;

    // Enhanced AI feedback with psychology analysis
    const fb = document.getElementById('aiFeedback');
    let psychologyInsight = '';
    if (this.trades.length > 0) {
      const avgStress = this.trades.reduce((sum, t) => sum + (t.pre_stress || 0), 0) / this.trades.length;
      const avgFomo = this.trades.reduce((sum, t) => sum + (t.fomo_level || 0), 0) / this.trades.length;
      const avgSleep = this.trades.reduce((sum, t) => sum + (t.sleep_quality || 0), 0) / this.trades.length;
      
      if (avgStress > 6) psychologyInsight += ' High stress levels detected.';
      if (avgFomo > 6) psychologyInsight += ' FOMO affecting decisions.';
      if (avgSleep < 6) psychologyInsight += ' Poor sleep impacting performance.';
    }

    fb.innerHTML = `<div class="suggestion-item ${s.winRate>=60?'suggestion-success':s.winRate>=40?'suggestion-info':'suggestion-warning'}">
      <div class="suggestion-title">${s.winRate>=60?'Excellent Execution':s.winRate>=40?'Moderate Execution':'Poor Execution'}</div>
      <div class="suggestion-desc">Win rate ${s.winRate}% over ${s.totalTrades} trades.${psychologyInsight}</div></div>`;

    const bestStrat = this.bestStrategy();
    document.getElementById('edgeAnalyzer').innerHTML = `<div class="suggestion-item suggestion-info"><div class="suggestion-title">Best Strategy</div><div class="suggestion-desc">${bestStrat}</div></div>`;

    const confEl = document.getElementById('confidenceAnalysis');
    if (this.confidenceEntries.length===0) {
      confEl.innerHTML = '<div class="suggestion-item suggestion-info"><div class="suggestion-title">No Confidence Data</div><div class="suggestion-desc">Record daily confidence.</div></div>';
    } else {
      const avg = (this.confidenceEntries.reduce((sum,c)=>sum+c.level,0)/this.confidenceEntries.length).toFixed(1);
      confEl.innerHTML = `<div class="suggestion-item suggestion-info"><div class="suggestion-title">Avg Confidence</div><div class="suggestion-desc">${avg}/10 over ${this.confidenceEntries.length} days</div></div>`;
      this.drawConfidenceChart();
    }

    document.getElementById('repeatTrades').innerHTML = this.repeatTradeHTML();
    
    // Enhanced entry analysis with new psychology data
    const entryAnalysis = this.analyzeEntryPatterns();
    document.getElementById('entryAnalysis').innerHTML = entryAnalysis;
    
    // Enhanced emotional bias analysis
    const emotionalBias = this.analyzeEmotionalBias();
    document.getElementById('emotionalBias').innerHTML = emotionalBias;
    
    document.getElementById('setupQuality').innerHTML = '<div class="suggestion-item suggestion-info">Setup quality scoring coming soon.</div>';
    document.getElementById('timeConfidence').innerHTML = '<div class="suggestion-item suggestion-info">Time-based confidence insights coming soon.</div>';
  }

  analyzeEntryPatterns() {
    if (this.trades.length < 3) return '<div class="suggestion-item suggestion-info">Need more trades for entry pattern analysis.</div>';
    
    const waitedTrades = this.trades.filter(t => t.waited_for_setup === 'Yes, completely');
    const waitedWinRate = waitedTrades.length ? Math.round((waitedTrades.filter(t => t.net_pl > 0).length / waitedTrades.length) * 100) : 0;
    const rushed = this.trades.filter(t => t.waited_for_setup === 'No, entered early').length;
    
    return `<div class="suggestion-item ${waitedWinRate > 60 ? 'suggestion-success' : 'suggestion-warning'}">
      <div class="suggestion-title">Entry Discipline Analysis</div>
      <div class="suggestion-desc">When you wait for setup: ${waitedWinRate}% win rate. Rushed entries: ${rushed} trades.</div>
    </div>`;
  }

  analyzeEmotionalBias() {
    if (this.trades.length < 3) return '<div class="suggestion-item suggestion-info">Need more trades for emotional analysis.</div>';
    
    const highFomoTrades = this.trades.filter(t => (t.fomo_level || 0) > 6);
    const highStressTrades = this.trades.filter(t => (t.pre_stress || 0) > 6);
    
    let analysis = '';
    if (highFomoTrades.length > 0) {
      const fomoWinRate = Math.round((highFomoTrades.filter(t => t.net_pl > 0).length / highFomoTrades.length) * 100);
      analysis += `High FOMO trades: ${fomoWinRate}% win rate. `;
    }
    if (highStressTrades.length > 0) {
      const stressWinRate = Math.round((highStressTrades.filter(t => t.net_pl > 0).length / highStressTrades.length) * 100);
      analysis += `High stress trades: ${stressWinRate}% win rate.`;
    }
    
    if (!analysis) analysis = 'Good emotional control detected in your trades.';
    
    return `<div class="suggestion-item suggestion-info">
      <div class="suggestion-title">Emotional Impact</div>
      <div class="suggestion-desc">${analysis}</div>
    </div>`;
  }

  repeatTradeHTML() {
    if (this.trades.length<3) return '<div class="suggestion-item suggestion-info">Need more trades for pattern detection.</div>';
    const freq = {};
    this.trades.forEach(t=>freq[t.symbol]=(freq[t.symbol]||0)+1);
    const [sym,count] = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0];
    return `<div class="suggestion-item suggestion-info"><div class="suggestion-title">Most Traded Symbol</div><div class="suggestion-desc">${sym} (${count} trades)</div></div>`;
  }

  drawConfidenceChart() {
    const ctx = document.getElementById('confidenceChart');
    if (!ctx) return;
    this.charts.conf && this.charts.conf.destroy();

    const sorted = [...this.confidenceEntries].sort((a,b)=>new Date(a.date)-new Date(b.date));
    this.charts.conf = new Chart(ctx,{ type:'line', data:{ labels:sorted.map(c=>c.date), datasets:[{ data:sorted.map(c=>c.level), borderColor:'#1FB8CD', backgroundColor:'rgba(31,184,205,0.15)', tension:0.3, fill:true }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ min:1, max:10 } } } });
  }

  /* ------------------------ REPORTS & CALENDAR ------------------------ */
  async renderReports() {
    this.trades = await this.loadTrades();
    this.confidenceEntries = await this.loadConfidenceEntries();
    
    // Basic summaries
    const s = this.calculateStats(this.trades);
    document.getElementById('weeklyReport').innerHTML = `<div class="report-item"><span class="report-label">Total Trades</span><span class="report-value">${s.totalTrades}</span></div><div class="report-item"><span class="report-label">Win Rate</span><span class="report-value">${s.winRate}%</span></div>`;
    document.getElementById('monthlyReport').innerHTML = `<div class="report-item"><span class="report-label">Net P&L</span><span class="report-value ${s.totalPL>=0?'positive':'negative'}">${this.formatCurrency(s.totalPL)}</span></div>`;
    document.getElementById('strategyReport').innerHTML = `<div class="report-item"><span class="report-label">Best Strategy</span><span class="report-value">${this.bestStrategy()}</span></div>`;
    const avgConf = this.confidenceEntries.length ? (this.confidenceEntries.reduce((sum,c)=>sum+c.level,0)/this.confidenceEntries.length).toFixed(1) : 'N/A';
    document.getElementById('emotionalReport').innerHTML = `<div class="report-item"><span class="report-label">Avg Confidence</span><span class="report-value">${avgConf}/10</span></div>`;

    // Calendar
    this.currentCalendarDate = this.currentCalendarDate || new Date();
    this.buildCalendar();
  }

  changeCalendarMonth(offset) {
    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth()+offset);
    this.buildCalendar();
  }

  buildCalendar() {
    const date = this.currentCalendarDate;
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth()+1, 0);
    const daysInMonth = monthEnd.getDate();

    document.getElementById('currentMonth').textContent = monthStart.toLocaleDateString('en-IN', { month:'long', year:'numeric' });
    const cal = document.getElementById('plCalendar');
    cal.innerHTML='';

    const dowNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    dowNames.forEach(d=>{
      const div=document.createElement('div');
      div.className='calendar-day header';
      div.textContent=d;
      cal.appendChild(div);
    });

    // Empty days before start
    for(let i=0;i<monthStart.getDay();i++){
      const div=document.createElement('div');
      div.className='calendar-day no-trades';
      cal.appendChild(div);
    }

    for(let d=1;d<=daysInMonth;d++){
      const current = new Date(date.getFullYear(), date.getMonth(), d);
      const key = current.toISOString().split('T')[0];
      const trades = this.trades.filter(t => t.entry_date.startsWith(key));
      let cls = 'no-trades';
      let content = d;
      if (trades.length) {
        const pl = trades.reduce((sum,t)=>sum+t.net_pl,0);
        if (pl>1000) cls='profit-high'; else if (pl>0) cls='profit-low'; else if (pl<-1000) cls='loss-high'; else cls='loss-low';
        content = d;
      }
      const div=document.createElement('div');
      div.className='calendar-day '+cls;
      div.textContent=content;
      div.title = trades.length ? `${trades.length} trades, P&L: ${this.formatCurrency(trades.reduce((s,t)=>s+t.net_pl,0))}` : 'No trades';
      if(trades.length){ div.onclick=()=>alert('Trades for '+key+' will be detailed in future update.'); }
      cal.appendChild(div);
    }
  }

  /* ------------------------ UTIL ------------------------------------- */
  bestStrategy() {
    if (this.trades.length===0) return 'N/A';
    const map={};
    this.trades.forEach(t=>map[t.strategy]=(map[t.strategy]||0)+t.net_pl);
    return Object.entries(map).sort((a,b)=>b[1]-a[1])[0][0];
  }

  exportCSV() {
    if (this.trades.length===0) { this.showToast('No trades to export','warning'); return; }
    const header=['Date','Symbol','Direction','Qty','Entry','Exit','Stop','Target','Net P&L','Strategy','Sleep','Stress','FOMO','Notes'];
    const rows=this.trades.map(t=>[
      this.formatDate(t.entry_date),t.symbol,t.direction,t.quantity,t.entry_price,t.exit_price,t.stop_loss||'',t.target_price||'',t.net_pl,t.strategy,t.sleep_quality||'',t.pre_stress||'',t.fomo_level||'',t.notes.replace(/"/g,'""')
    ]);
    const csv=[header].concat(rows).map(r=>r.map(f=>typeof f==='string' && f.includes(',')?`"${f}"`:f).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='trading_data_enhanced.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  showTradeDetails(id) {
    const t = this.trades.find(tr=>tr.id===id);
    if(!t) return;
    const rrText = t.risk_reward_ratio? t.risk_reward_ratio.toFixed(2):'0.00';
    const body=document.getElementById('tradeModalBody');
    body.innerHTML=`<div class="trade-detail-grid">
      <div class="trade-detail-item"><div class="trade-detail-label">Symbol</div><div class="trade-detail-value">${t.symbol}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Direction</div><div class="trade-detail-value"><span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span></div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Quantity</div><div class="trade-detail-value">${t.quantity}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Entry Price</div><div class="trade-detail-value">₹${t.entry_price}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Exit Price</div><div class="trade-detail-value">₹${t.exit_price}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Gross P&L</div><div class="trade-detail-value ${t.gross_pl>=0?'positive':'negative'}">${this.formatCurrency(t.gross_pl)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Net P&L</div><div class="trade-detail-value ${t.net_pl>=0?'positive':'negative'}">${this.formatCurrency(t.net_pl)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Risk:Reward</div><div class="trade-detail-value">1:${rrText}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Strategy</div><div class="trade-detail-value">${t.strategy}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Sleep Quality</div><div class="trade-detail-value">${t.sleep_quality||'N/A'}/10</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Pre-Stress</div><div class="trade-detail-value">${t.pre_stress||'N/A'}/10</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">FOMO Level</div><div class="trade-detail-value">${t.fomo_level||'N/A'}/10</div></div>
    </div>
    ${t.notes?`<div style="margin-top:16px;">Notes:<br>${t.notes}</div>`:''}
    ${t.lesson?`<div style="margin-top:16px;">Lesson Learned:<br>${t.lesson}</div>`:''}`;
    document.getElementById('tradeModal').classList.remove('hidden');
  }

  hideTradeModal(){ document.getElementById('tradeModal').classList.add('hidden'); }
}

window.app = new TradingJournalApp();
