// Trading Journal Application with Supabase Integration
const SUPABASE_URL = 'https://brjomrasrmbyxepjlfdq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyam9tcmFzcm1ieXhlcGpsZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTMwODgsImV4cCI6MjA2OTUyOTA4OH0.51UGb2AE75iE6bPF_mXl_vOBPRB9JiHwFG-7jXyqIrs';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

class TradingJournalApp {
  constructor() {
    this.currentUser = null;
    this.charts = {};
    this.trades = [];
    this.confidenceEntries = [];
    this.mainListenersAttached = false;

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
    // Navigation
    document.querySelectorAll('.nav-link').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showSection(btn.dataset.section);
      });
    });
    
    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('quickAddTrade').addEventListener('click', () => this.showSection('add-trade'));

    // Dashboard elements
    const slider = document.getElementById('dailyConfidence');
    if (slider) {
      const out = document.getElementById('confidenceValue');
      slider.addEventListener('input', () => (out.textContent = slider.value));
      document.getElementById('saveConfidenceBtn').addEventListener('click', () => this.saveDailyConfidence());
    }

    // Add trade form
    this.setupAddTradeForm();

    // Reports section
    document.getElementById('exportData')?.addEventListener('click', () => this.exportCSV());
    document.getElementById('prevMonth')?.addEventListener('click', () => this.changeCalendarMonth(-1));
    document.getElementById('nextMonth')?.addEventListener('click', () => this.changeCalendarMonth(1));

    // View all trades button
    document.querySelector('.view-all-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showSection('history');
    });
  }

  updateUserInfo() {
    if (this.currentUser) {
      document.getElementById('currentUserName').textContent = this.currentUser.username;
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
    document.querySelectorAll('.nav-link').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === id);
    });
    
    document.querySelectorAll('.section').forEach(sec => {
      sec.classList.remove('active');
    });
    
    const section = document.getElementById(id);
    if (section) {
      section.classList.add('active');
    }

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
      .极from('confidence_entries')
      .select('*')
      .eq('user_id', this.currentUser.id)
      .order('date', { ascending: false });
    
    return data || [];
  }

  calculateStats(trades) {
    if (!trades || trades.length === 0) {
      return { totalPL: 0, winRate: 0, totalTrades: 0, avgRR: '1:0', bestTrade: 0, worstTrade: 0 };
    }
    const totalPL = trades.reduce((sum, t) => sum + (t.net_pl || 0), 0);
    const wins = trades.filter(t => t.net_pl > 0).length;
    const winRate = Math.round((wins / trades.length) * 100);
    const bestTrade = Math.max(...trades.map(t => t.net_pl));
    const worstTrade = Math.min(...trades.map(t => t.net_pl));
    
    // Calculate average risk:reward
    const validRR = trades.filter(t => t.risk_reward_ratio && !isNaN(t.risk_reward_ratio));
    const avgRR = validRR.length ? 
      (validRR.reduce((sum, t) => sum + t.risk_reward_ratio, 0) / validRR.length).toFixed(2) : 
      0;
    
    return { 
      totalPL, 
      winRate, 
      totalTrades: trades.length, 
      avgRR: '1:' + avgRR, 
      bestTrade, 
      worstTrade 
    };
  }

  async renderDashboard() {
    this.trades = await this.loadTrades();
    this.confidenceEntries = await this.loadConfidenceEntries();
    
    const s = this.calculateStats(this.trades);
    const totalPLEl = document.getElementById('totalPL');
    if (totalPLEl) {
      totalPLEl.textContent = this.formatCurrency(s.totalPL);
      totalPLEl.className = 'stat-value ' + (s.totalPL >= 0 ? 'positive' : 'negative');
    }
    
    document.getElementById('winRate').textContent = s.winRate + '%';
    document.getElementById('totalTrades').textContent = s.totalTrades;
    document.getElementById('avgRR').textContent = s.avgRR;

    // Recent trades list
    const list = document.getElementById('recentTradesList');
    if (!list) return;
    
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
    
    const messageEl = document.getElementById('confidenceMessage');
    if (messageEl) {
      messageEl.innerHTML = "<div class='message success'>Daily confidence recorded successfully!</div>";
    }
    this.showToast('Daily confidence recorded successfully!', 'success');
    
    // Reload confidence data
    this.confidenceEntries = await this.loadConfidenceEntries();
  }

  /* ----------------------- ADD TRADE FORM ------------------------------ */
  renderAddTrade() {
    const now = new Date();
    const entryDateEl = document.querySelector('input[name="entryDate"]');
    const exitDateEl = document.querySelector('input[name="exitDate"]');
    
    if (entryDateEl && !entryDateEl.value) {
      entryDateEl.value = now.toISOString().slice(0, 16);
    }
    
    if (exitDateEl && !exitDateEl.value) {
      exitDateEl.value = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 16);
    }
  }

  setupAddTradeForm() {
    const form = document.getElementById('addTradeForm');
    if (!form) return;
    
    // Setup range inputs
    const setupRange = (name) => {
      const slider = form.querySelector(`[name="${name}"]`);
      if (slider) {
        const display = slider.parentElement.querySelector('.range-value');
        if (display) {
          slider.addEventListener('input', () => {
            display.textContent = slider.value;
          });
        }
      }
    };
    
    // Setup all range inputs
    [
      'confidenceLevel', 
      'sleepQuality', 
      'physicalCondition', 
      'fomoLevel', 
      'preStress', 
      'positionComfort', 
      'stressDuring'
    ].forEach(setupRange);

    // Setup calculation fields
    const calcFields = ['quantity', 'entryPrice', 'exitPrice', 'stopLoss', 'targetPrice', 'direction'];
    calcFields.forEach(name => {
      const field = form.querySelector(`[name="${name}"]`);
      if (field) {
        field.addEventListener('input', () => this.updateCalculations());
      }
    });

    // Form submission
    form.addEventListener('submit', async e => {
      e.preventDefault();
      await this.submitTrade();
    });

    // Reset button
    const resetBtn = document.getElementById('resetTradeForm');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        form.reset();
        this.updateCalculations();
        this.renderAddTrade();
        document.querySelectorAll('.range-value').forEach(el => {
          if (el.textContent !== '5') el.textContent = '5';
        });
      });
    }
  }

  updateCalculations() {
    const form = document.getElementById('addTradeForm');
    if (!form) return;
    
    const fd = new FormData(form);
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
      const reward = target ? 
        Math.abs((dir === 'Long' ? target - entry : entry - target)) * qty : 
        Math.abs(gross);
      if (risk > 0) riskReward = reward / risk;
    }

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
    if (crEl) {
      const capitalRisk = ((Math.abs(entry - sl) * qty) / 100000) * 100 || 0;
      crEl.textContent = capitalRisk.toFixed(2) + '%';
    }
  }

  getCheckboxValues(name) {
    const checkboxes = document.querySelectorAll(`input[name="${name}"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
  }

  getRadioValue(name) {
    const radio = document.querySelector(`input[name="${name}"]:checked`);
    return radio ? radio.value : '';
  }

  async submitTrade() {
    const form = document.getElementById('addTradeForm');
    if (!form) return;
    
    const fd = new FormData(form);
    // Clear previous errors
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
        const errEl = document.getElementById(`${field}-error`);
        if (errEl) {
          errEl.textContent = 'Required';
          errEl.classList.add('active');
          hasErr = true;
        }
      }
    });

    if (hasErr) {
      this.showToast('Please fix errors', 'error');
      return;
    }

    // Build trade object
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
      multi_timeframes: this.getCheckboxValues('multiTimeframes').join(', '),
      volume_analysis: fd.get('volumeAnalysis') || '',
      technical_confluence: this.getCheckboxValues('technicalConfluence').join(', '),
      market_session: fd.get('marketSession') || '',
      trade_catalyst: fd.get('tradeCatalyst') || '',
      waited_for_setup: this.getRadioValue('waitedForSetup'),
      position_comfort: parseInt(fd.get('positionComfort')) || 5,
      plan_deviation: fd.get('planDeviation') || '',
      stress_during: parseInt(fd.get('stressDuring')) || 1,
      primary_exit_reason: fd.get('primaryExitReason') || '',
      exit_emotion: fd.get('exitEmotion') || '',
      would_take_again: this.getRadioValue('wouldTakeAgain'),
      lesson: fd.get('lesson') || '',
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
      
      trade.risk_reward_ratio = risk ? (reward / risk) : 0;
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

    this.showToast('Trade saved successfully!', 'success');
    form.reset();
    this.updateCalculations();
    this.renderAddTrade();
    
    // Reload trades
    this.trades = await this.loadTrades();
    this.showSection('dashboard');
  }

  /* ---------------------------- HISTORY ------------------------------- */
  async renderHistory() {
    const container = document.getElementById('historyContent');
    if (!container) return;
    
    this.trades = await this.loadTrades();
    
    if (this.trades.length === 0) {
      container.innerHTML = '<div class="empty-state">No trades recorded yet.</div>';
      return;
    }

    // Populate filters
    const symbols = [...new Set(this.trades.map(t => t.symbol))];
    const symbolFilter = document.getElementById('symbolFilter');
    if (symbolFilter) {
      symbolFilter.innerHTML = '<option value="">All Symbols</option>' + 
        symbols.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    const strategies = [...new Set(this.trades.map(t => t.strategy))];
    const strategyFilter = document.getElementById('strategyFilter');
    if (strategyFilter) {
      strategyFilter.innerHTML = '<option value="">All Strategies</option>' + 
        strategies.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    const applyFilters = () => {
      const symVal = symbolFilter?.value || '';
      const stratVal = strategyFilter?.value || '';
      const filtered = this.trades.filter(t => 
        (!symVal || t.symbol === symVal) && 
        (!stratVal || t.strategy === stratVal)
      );
      this.renderTradeTable(filtered, container);
    };

    if (symbolFilter) symbolFilter.onchange = applyFilters;
    if (strategyFilter) strategyFilter.onchange = applyFilters;

    applyFilters();
  }

  renderTradeTable(trades, container) {
    if (!container) return;
    
    if (trades.length === 0) {
      container.innerHTML = '<div class="empty-state">No trades match filter.</div>';
      return;
    }
    
    container.innerHTML = `
      <div class="card">
        <table class="trade-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Symbol</th>
              <th>Dir</th>
              <th>Qty</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>P&L</th>
              <th>Strategy</th>
            </tr>
          </thead>
          <tbody>
            ${trades.map(t => `
              <tr onclick="app.showTradeDetails(${t.id})">
                <td data-label="Date">${this.formatDate(t.entry_date)}</td>
                <td data-label="Symbol">${t.symbol}</td>
                <td data-label="Direction"><span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span></td>
                <td data-label="Qty">${t.quantity}</td>
                <td data-label="Entry">₹${t.entry_price}</td>
                <td data-label="Exit">₹${t.exit_price}</td>
                <td data-label="P&L" class="${t.net_pl >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(t.net_pl)}</td>
                <td data-label="Strategy">${t.strategy}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
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
    }, 30);
  }

  drawPLChart() {
    const ctx = document.getElementById('plChart');
    if (!ctx) return;
    
    if (this.charts.pl) {
      this.charts.pl.destroy();
    }
    
    if (this.trades.length === 0) {
      return;
    }

    const sorted = [...this.trades].sort((a, b) => 
      new Date(a.entry_date) - new Date(b.entry_date)
    );
    
    const labels = [];
    const cum = [];
    let run = 0;
    
    sorted.forEach(t => {
      run += t.net_pl;
      labels.push(this.formatDate(t.entry_date));
      cum.push(run);
    });

    this.charts.pl = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Cumulative P&L',
          data: cum,
          borderColor: '#1FB8CD',
          backgroundColor: 'rgba(31, 184, 205, 0.15)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value => '₹' + value.toLocaleString('en-IN')
            }
          }
        }
      }
    });
  }

  drawRRChart() {
    const ctx = document.getElementById('rrChart');
    if (!ctx) return;
    
    if (this.charts.rr) {
      this.charts.rr.destroy();
    }
    
    if (this.trades.length === 0) {
      return;
    }

    const buckets = { 
      '<1:1': 0, 
      '1:1-1:2': 0, 
      '1:2-1:3': 0, 
      '>1:3': 0 
    };
    
    this.trades.forEach(t => {
      const rr = t.risk_reward_ratio || 0;
      if (rr < 1) buckets['<1:1']++;
      else if (rr < 2) buckets['1:1-1:2']++;
      else if (rr < 3) buckets['1:2-1:3']++;
      else buckets['>1:3']++;
    });

    this.charts.rr = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(buckets),
        datasets: [{
          data: Object.values(buckets),
          backgroundColor: ['#FFC185', '#B4413C', '#5D878F', '#1FB8CD']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  drawStrategyChart() {
    const ctx = document.getElementById('strategyChart');
    if (!ctx) return;
    
    if (this.charts.strategy) {
      this.charts.strategy.destroy();
    }
    
    if (this.trades.length === 0) {
      return;
    }

    const map = {};
    this.trades.forEach(t => {
      if (!map[t.strategy]) {
        map[t.strategy] = { total: 0, wins: 0 };
      }
      map[t.strategy].total++;
      if (t.net_pl > 0) map[t.strategy].wins++;
    });
    
    const labels = Object.keys(map);
    const data = labels.map(l => 
      Math.round((map[l].wins / map[l].total) * 100)
    );

    this.charts.strategy = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: '#1FB8CD'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: value => value + '%'
            }
          }
        }
      }
    });
  }

  /* ----------------------- AI SUGGESTIONS ----------------------------- */
  async renderAISuggestions() {
    this.trades = await this.loadTrades();
    this.confidenceEntries = await this.loadConfidenceEntries();
    
    const s = this.calculateStats(this.trades);
    
    const insightEl = document.getElementById('smartInsight');
    if (insightEl) {
      insightEl.textContent = s.totalPL >= 0 ?
        `Great job! You're net positive ${this.formatCurrency(s.totalPL)} with a ${s.winRate}% win rate.` :
        `You're net negative ${this.formatCurrency(s.totalPL)}. Focus on risk management and psychology.`;
    }

    // AI feedback
    const fb = document.getElementById('aiFeedback');
    if (fb) {
      fb.innerHTML = `<div class="suggestion-item ${s.winRate >= 60 ? 'suggestion-success' : s.winRate >= 40 ? 'suggestion-info' : 'suggestion-warning'}">
        <div class="suggestion-title">${s.winRate >= 60 ? 'Excellent Execution' : s.winRate >= 40 ? 'Moderate Execution' : 'Poor Execution'}</div>
        <div class="suggestion-desc">Win rate ${s.winRate}% over ${s.totalTrades} trades.</div>
      </div>`;
    }

    // Confidence analysis
    const confEl = document.getElementById('confidenceAnalysis');
    if (confEl) {
      if (this.confidenceEntries.length === 0) {
        confEl.innerHTML = '<div class="suggestion-item suggestion-info"><div class="suggestion-title">No Confidence Data</div><div class="suggestion-desc">Record daily confidence.</div></div>';
      } else {
        const avg = (this.confidenceEntries.reduce((sum, c) => sum + c.level, 0) / this.confidenceEntries.length).toFixed(1);
        confEl.innerHTML = `<div class="suggestion-item suggestion-info"><div class="suggestion-title">Avg Confidence</div><div class="suggestion-desc">${avg}/10 over ${this.confidenceEntries.length} days</div></div>`;
        this.drawConfidenceChart();
      }
    }
  }

  drawConfidenceChart() {
    const ctx = document.getElementById('confidenceChart');
    if (!ctx) return;
    
    if (this.charts.conf) {
      this.charts.conf.destroy();
    }
    
    if (this.confidenceEntries.length === 0) {
      return;
    }

    const sorted = [...this.confidenceEntries].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    this.charts.conf = new Chart(ctx, {
      type: 'line',
      data: {
        labels: sorted.map(c => c.date),
        datasets: [{
          data: sorted.map(c => c.level),
          borderColor: '#1FB8CD',
          backgroundColor: 'rgba(31, 184, 205, 0.15)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            min: 1,
            max: 10
          }
        }
      }
    });
  }

  /* ------------------------ REPORTS & CALENDAR ------------------------ */
  async renderReports() {
    this.trades = await this.loadTrades();
    this.confidenceEntries = await this.loadConfidenceEntries();
    
    const s = this.calculateStats(this.trades);
    
    // Weekly report
    const weeklyEl = document.getElementById('weeklyReport');
    if (weeklyEl) {
      weeklyEl.innerHTML = `
        <div class="report-item">
          <span class="report-label">Total Trades</span>
          <span class="report-value">${s.totalTrades}</span>
        </div>
        <div class="report-item">
          <span class="report-label">Win Rate</span>
          <span class="report-value">${s.winRate}%</span>
        </div>`;
    }
    
    // Monthly report
    const monthlyEl = document.getElementById('monthlyReport');
    if (monthlyEl) {
      monthlyEl.innerHTML = `
        <div class="report-item">
          <span class="report-label">Net P&L</span>
          <span class="report-value ${s.totalPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(s.totalPL)}</span>
        </div>`;
    }
    
    // Calendar
    this.currentCalendarDate = this.currentCalendarDate || new Date();
    this.buildCalendar();
  }

  changeCalendarMonth(offset) {
    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + offset);
    this.buildCalendar();
  }

  buildCalendar() {
    const date = this.currentCalendarDate;
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const daysInMonth = monthEnd.getDate();

    const monthEl = document.getElementById('currentMonth');
    if (monthEl) {
      monthEl.textContent = monthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }
    
    const cal = document.getElementById('plCalendar');
    if (!cal) return;
    
    cal.innerHTML = '';

    // Add day headers
    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dowNames.forEach(d => {
      const div = document.createElement('div');
      div.className = 'calendar-day header';
      div.textContent = d;
      cal.appendChild(div);
    });

    // Empty days before start
    for (let i = 0; i < monthStart.getDay(); i++) {
      const div = document.createElement('div');
      div.className = 'calendar-day no-trades';
      cal.appendChild(div);
    }

    // Add days
    for (let d = 1; d <= daysInMonth; d++) {
      const current = new Date(date.getFullYear(), date.getMonth(), d);
      const key = current.toISOString().split('T')[0];
      const trades = this.trades.filter(t => t.entry_date.startsWith(key));
      
      let cls = 'no-trades';
      if (trades.length) {
        const pl = trades.reduce((sum, t) => sum + t.net_pl, 0);
        if (pl > 1000) cls = 'profit-high';
        else if (pl > 0) cls = 'profit-low';
        else if (pl < -1000) cls = 'loss-high';
        else cls = 'loss-low';
      }
      
      const div = document.createElement('div');
      div.className = 'calendar-day ' + cls;
      div.textContent = d;
      
      if (trades.length) {
        div.title = `${trades.length} trades, P&L: ${this.formatCurrency(trades.reduce((s, t) => s + t.net_pl, 0))}`;
        div.onclick = () => alert(`Trades for ${key} will be detailed in future update.`);
      }
      
      cal.appendChild(div);
    }
  }

  /* ------------------------ UTIL ------------------------------------- */
  bestStrategy() {
    if (this.trades.length === 0) return 'N/A';
    const map = {};
    this.trades.forEach(t => {
      map[t.strategy] = (map[t.strategy] || 0) + t.net_pl;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0][0];
  }

  exportCSV() {
    if (this.trades.length === 0) {
      this.showToast('No trades to export', 'warning');
      return;
    }
    
    const header = ['Date', 'Symbol', 'Direction', 'Qty', 'Entry', 'Exit', 'Stop', 'Target', 'Net P&L', 'Strategy', 'Sleep', 'Stress', 'FOMO', 'Notes'];
    const rows = this.trades.map(t => [
      this.formatDate(t.entry_date),
      t.symbol,
      t.direction,
      t.quantity,
      t.entry_price,
      t.exit_price,
      t.stop_loss || '',
      t.target_price || '',
      t.net_pl,
      t.strategy,
      t.sleep_quality || '',
      t.pre_stress || '',
      t.fomo_level || '',
      t.notes.replace(/"/g, '""')
    ]);
    
    const csv = [header, ...rows]
      .map(row => row.map(field => 
        typeof field === 'string' && field.includes(',') ? `"${field}"` : field
      ).join(','))
      .join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trading_data_enhanced.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  showTradeDetails(id) {
    const trade = this.trades.find(t => t.id === id);
    if (!trade) return;
    
    const body = document.getElementById('tradeModalBody');
    if (!body) return;
    
    const rrText = trade.risk_reward_ratio ? trade.risk_reward_ratio.toFixed(2) : '0.00';
    
    body.innerHTML = `
      <div class="trade-detail-grid">
        <div class="trade-detail-item">
          <div class="trade-detail-label">Symbol</div>
          <div class="trade-detail-value">${trade.symbol}</div>
        </div>
        <div class="trade-detail-item">
          <div class="trade-detail-label">Direction</div>
          <div class="trade-detail-value">
            <span class="trade-direction ${trade.direction.toLowerCase()}">${trade.direction}</span>
          </div>
        </div>
        <div class="trade-detail-item">
          <div class="trade-detail-label">Quantity</div>
          <div class="trade-detail-value">${trade.quantity}</div>
        </div>
        <div class="trade-detail-item">
          <div class="trade-detail-label">Entry Price</div>
          <div class="trade-detail-value">₹${trade.entry_price}</div>
        </div>
        <div class="trade-detail-item">
          <div class="trade-detail-label">Exit Price</div>
          <div class="trade-detail-value">₹${trade.exit_price}</div>
        </div>
        <div class="trade-detail-item">
          <div class="trade-detail-label">Gross P&L</div>
          <div class="trade-detail-value ${trade.gross_pl >= 0 ? 'positive' : 'negative'}">
            ${this.formatCurrency(trade.gross_pl)}
          </div>
        </div>
        <div class="trade-detail-item">
          <div class="trade-detail-label">Net P&L</div>
          <div class="trade-detail-value ${trade.net_pl >= 0 ? 'positive' : 'negative'}">
            ${this.formatCurrency(trade.net_pl)}
          </div>
        </div>
        <div class="trade-detail-item">
          <div class="trade-detail-label">Risk:Reward</div>
          <div class="trade-detail-value">1:${rrText}</div>
        </div>
        <div class="trade-detail-item">
          <div class="trade-detail-label">Strategy</div>
          <div class="trade-detail-value">${trade.strategy}</div>
        </div>
        <div class="trade-detail-item">
          <div class="trade-detail-label">Sleep Quality</div>
          <div class="trade-detail-value">${trade.sleep_quality || 'N/A'}/10</div>
        </div>
        <div class="trade-detail-item">
          <div class="trade-detail-label">Pre-Stress</div>
          <div class="trade-detail-value">${trade.pre_stress || 'N/A'}/10</div>
        </div>
        <div class="trade-detail-item">
          <div class="trade-detail-label">FOMO Level</div>
          <div class="trade-detail-value">${trade.fomo_level || 'N/A'}/10</div>
        </div>
      </div>
      ${trade.notes ? `<div style="margin-top:16px;"><strong>Notes:</strong><br>${trade.notes}</div>` : ''}
      ${trade.lesson ? `<div style="margin-top:16px;"><strong>Lesson Learned:</strong><br>${trade.lesson}</div>` : ''}`;

    document.getElementById('tradeModal').classList.remove('hidden');
  }

  hideTradeModal() {
    document.getElementById('tradeModal').classList.add('hidden');
  }
}

window.app = new TradingJournalApp();
