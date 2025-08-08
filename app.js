// Trading Journal Application - Supabase Edition
// All data is now stored and retrieved from your Supabase backend.

class TradingJournalApp {
  constructor() {
    // --- SUPABASE SETUP ---
    // Replace with your actual Supabase URL and Anon Key
    const supabaseUrl = 'https://brjomrasrmbyxepjlfdq.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyam9tcmFzcm1ieXhlcGpsZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTMwODgsImV4cCI6MjA2OTUyOTA4OH0.51UGb2AE75iE6bPF_mXl_vOBPRB9JiHwFG-7jXyqIrs';
    this.supabase = supabase.createClient(supabaseUrl, supabaseKey);
    // --- END SUPABASE SETUP ---

    this.currentUser = null;
    this.trades = []; // Local cache of trades for the current user
    this.confidenceEntries = []; // Local cache of confidence entries
    this.charts = {};

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.bootstrap());
    } else {
      this.bootstrap();
    }
  }

  async bootstrap() {
    this.setupAuthListeners();
    this.handleAuthStateChange();
  }

  /* ------------------------------- AUTH ---------------------------------- */
  handleAuthStateChange() {
    this.supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session)) {
        this.currentUser = session.user;
        await this.loadUserData();
        this.showMainApp();
      } else if (event === 'SIGNED_OUT') {
        this.currentUser = null;
        this.trades = [];
        this.confidenceEntries = [];
        Object.values(this.charts).forEach(chart => chart && chart.destroy && chart.destroy());
        this.charts = {};
        this.showAuthScreen();
      }
    });
  }
  
  async loadUserData() {
      if (!this.currentUser) return;
      
      // Fetch trades
      const { data: tradesData, error: tradesError } = await this.supabase
          .from('trades')
          .select('*')
          .eq('user_id', this.currentUser.id)
          .order('entryDate', { ascending: false });

      if (tradesError) {
          console.error('Error fetching trades:', tradesError);
          this.showToast('Could not load trades.', 'error');
          this.trades = [];
      } else {
          this.trades = tradesData;
      }

      // Fetch confidence entries
      const { data: confidenceData, error: confidenceError } = await this.supabase
          .from('confidence')
          .select('*')
          .eq('user_id', this.currentUser.id)
          .order('date', { ascending: false });
      
      if (confidenceError) {
          console.error('Error fetching confidence entries:', confidenceError);
          this.showToast('Could not load confidence data.', 'error');
          this.confidenceEntries = [];
      } else {
          this.confidenceEntries = confidenceData;
      }
  }


  setupAuthListeners() {
    // Switch tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.tab));
    });

    // Login form
    document.getElementById('loginFormElement').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = fd.get('email').trim();
      const password = fd.get('password').trim();
      this.clearAuthErrors();
      if (!email || !password) {
        this.showAuthError('login-email-error', 'Please fill all fields');
        return;
      }

      const { error } = await this.supabase.auth.signInWithPassword({ email, password });

      if (error) {
        this.showAuthError('login-password-error', error.message);
      } else {
        this.showToast('Logged in successfully!', 'success');
      }
    });

    // Signup form
    document.getElementById('signupFormElement').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = fd.get('email').trim();
      const password = fd.get('password');
      const confirm = fd.get('confirmPassword');
      this.clearAuthErrors();

      if (!email || !password) {
        this.showAuthError('signup-email-error', 'Please fill all fields');
        return;
      }
       if (password.length < 8) {
        this.showAuthError('signup-password-error', 'Password must be at least 8 characters');
        return;
      }
      if (password !== confirm) {
        this.showAuthError('signup-confirmPassword-error', 'Passwords do not match');
        return;
      }

      const { error } = await this.supabase.auth.signUp({ email, password });

      if (error) {
        this.showAuthError('signup-email-error', error.message);
      } else {
        this.showToast('Account created! Please check your email to confirm.', 'success');
        this.switchAuthTab('login');
      }
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

  async logout() {
    const { error } = await this.supabase.auth.signOut();
    if (error) {
        this.showToast('Error logging out.', 'error');
        console.error('Logout error:', error);
    } else {
        this.showToast('Logged out successfully', 'info');
    }
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
    if (this.currentUser) {
        document.getElementById('currentUserName').textContent = this.currentUser.email.split('@')[0];
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
    setTimeout(() => div.remove(), 3000);
  }

  /* ---------------------- DASHBOARD RENDER ----------------------------- */

  calculateStats() {
    if (this.trades.length === 0) {
      return { totalPL: 0, winRate: 0, totalTrades: 0, avgRR: '1:0', bestTrade: 0, worstTrade: 0 };
    }
    const totalPL = this.trades.reduce((sum, t) => sum + (t.netPL || 0), 0);
    const wins = this.trades.filter(t => t.netPL > 0).length;
    const winRate = Math.round((wins / this.trades.length) * 100);
    const bestTrade = Math.max(0, ...this.trades.map(t => t.netPL));
    const worstTrade = Math.min(0, ...this.trades.map(t => t.netPL));
    const validRRTrades = this.trades.filter(t => t.riskRewardRatio !== undefined && t.riskRewardRatio > 0);
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
          <span class="trade-date">${this.formatDate(t.entryDate)}</span>
        </div>
        <div class="trade-pl ${t.netPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(t.netPL)}</div>
      </div>`).join('');
  }

  async saveDailyConfidence() {
    const level = parseInt(document.getElementById('dailyConfidence').value, 10);
    const today = new Date().toISOString().split('T')[0];

    // Check if already recorded
    const { data: existing, error: checkError } = await this.supabase
        .from('confidence')
        .select('id')
        .eq('user_id', this.currentUser.id)
        .eq('date', today)
        .single();
    
    if (checkError && checkError.code !== 'PGRST116') { // Ignore 'exact one row' error
        console.error('Error checking confidence:', checkError);
        this.showToast('Could not save confidence.', 'error');
        return;
    }

    if (existing) {
      this.showToast("You've already recorded confidence today!", 'warning');
      return;
    }

    const { data, error } = await this.supabase
        .from('confidence')
        .insert([{ user_id: this.currentUser.id, date: today, level: level }])
        .select();

    if (error) {
        console.error('Error saving confidence:', error);
        this.showToast('Could not save confidence.', 'error');
    } else {
        this.confidenceEntries.unshift(data[0]);
        document.getElementById('confidenceMessage').innerHTML = "<div class='message success'>Daily confidence recorded successfully!</div>";
        this.showToast('Daily confidence recorded successfully!', 'success');
        document.dispatchEvent(new CustomEvent('confidence-updated', { detail: { date: today, level } }));
    }
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
      'confidenceLevel', 'sleepQuality', 'physicalCondition', 'fomoLevel', 
      'preStress', 'positionComfort', 'stressDuring'
    ];

    rangeInputs.forEach(name => {
      const slider = form.querySelector(`[name="${name}"]`);
      if (slider) {
        const display = slider.parentElement.querySelector('.range-value');
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

    form.addEventListener('submit', e => {
      e.preventDefault();
      this.submitTrade();
    });

    document.getElementById('resetTradeForm').addEventListener('click', () => {
      form.reset();
      this.updateCalculations();
      this.renderAddTrade();
      document.querySelectorAll('.range-value').forEach(el => el.textContent = '5');
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

    const capitalRisk = ((Math.abs(entry - sl) * qty) / 100000) * 100 || 0;

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
    const fd = new FormData(form);
    form.querySelectorAll('.form-error').forEach(e => { e.textContent = ''; e.classList.remove('active'); });

    const required = ['symbol', 'direction', 'quantity', 'entryPrice', 'exitPrice', 'entryDate', 'exitDate'];
    let hasErr = false;
    required.forEach(field => {
      const val = fd.get(field);
      if (!val || val.toString().trim() === '') {
        const errEl = document.getElementById(field + '-error');
        if (errEl) { errEl.textContent = 'Required'; errEl.classList.add('active'); }
        hasErr = true;
      }
    });

    if (hasErr) { this.showToast('Please fix errors', 'error'); return; }

    const tradeData = {
      user_id: this.currentUser.id,
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
      notes: fd.get('notes') || '',
      // Psychology fields
      sleepQuality: parseInt(fd.get('sleepQuality')) || 5,
      physicalCondition: parseInt(fd.get('physicalCondition')) || 5,
      marketSentiment: fd.get('marketSentiment') || '',
      fomoLevel: parseInt(fd.get('fomoLevel')) || 1,
      preStress: parseInt(fd.get('preStress')) || 1,
      positionComfort: parseInt(fd.get('positionComfort')) || 5,
      stressDuring: parseInt(fd.get('stressDuring')) || 1,
      primaryExitReason: fd.get('primaryExitReason') || '',
      exitEmotion: fd.get('exitEmotion') || '',
      wouldTakeAgain: this.getRadioValue('wouldTakeAgain'),
      lesson: fd.get('lesson') || '',
    };
    
    tradeData.grossPL = tradeData.direction === 'Long' ? (tradeData.exitPrice - tradeData.entryPrice) * tradeData.quantity : (tradeData.entryPrice - tradeData.exitPrice) * tradeData.quantity;
    tradeData.netPL = tradeData.grossPL - 40;
    if (tradeData.stopLoss) {
      const risk = Math.abs(tradeData.entryPrice - tradeData.stopLoss) * tradeData.quantity;
      const reward = tradeData.targetPrice ? Math.abs((tradeData.direction === 'Long' ? tradeData.targetPrice - tradeData.entryPrice : tradeData.entryPrice - tradeData.targetPrice) * tradeData.quantity) : Math.abs(tradeData.grossPL);
      tradeData.riskRewardRatio = risk ? reward / risk : 0;
    } else tradeData.riskRewardRatio = 0;

    const { data, error } = await this.supabase.from('trades').insert([tradeData]).select();

    if (error) {
        console.error('Error saving trade:', error);
        this.showToast('Could not save trade.', 'error');
    } else {
        this.trades.unshift(data[0]);
        this.showToast('Trade saved successfully!', 'success');
        form.reset();
        this.updateCalculations();
        this.renderAddTrade();
        document.querySelectorAll('.range-value').forEach(el => el.textContent = '5');
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
              <td data-label="Date">${this.formatDate(t.entryDate)}</td>
              <td data-label="Symbol">${t.symbol}</td>
              <td data-label="Direction"><span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span></td>
              <td data-label="Qty">${t.quantity}</td>
              <td data-label="Entry">₹${t.entryPrice}</td>
              <td data-label="Exit">₹${t.exitPrice}</td>
              <td data-label="P&L" class="${t.netPL>=0?'positive':'negative'}">${this.formatCurrency(t.netPL)}</td>
              <td data-label="Strategy">${t.strategy}</td>
            </tr>`).join('')}
        </tbody></table></div>`;
    };

    applyFilters();
  }

  /* -------------------------- ANALYTICS ------------------------------ */
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
    }, 30);
  }

  drawPLChart() {
    const ctx = document.getElementById('plChart');
    if (!ctx) return;
    if(this.charts.pl) this.charts.pl.destroy();
    if (this.trades.length === 0) { ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }

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
    if(this.charts.rr) this.charts.rr.destroy();
    if (this.trades.length === 0) { ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }

    const buckets = { '<1:1':0, '1:1-1:2':0, '1:2-1:3':0, '>1:3':0 };
    this.trades.forEach(t => {
      const rr = t.riskRewardRatio || 0;
      if (rr < 1) buckets['<1:1']++; else if (rr < 2) buckets['1:1-1:2']++; else if (rr < 3) buckets['1:2-1:3']++; else buckets['>1:3']++;
    });

    this.charts.rr = new Chart(ctx, {
      type: 'bar',
      data: { labels:Object.keys(buckets), datasets:[{ label: '# of Trades', data:Object.values(buckets), backgroundColor:['#FFC185','#B4413C','#5D878F','#1FB8CD'] }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks: { stepSize: 1 } } } }
    });
  }

  drawStrategyChart() {
    const ctx = document.getElementById('strategyChart');
    if (!ctx) return;
    if(this.charts.strategy) this.charts.strategy.destroy();
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
      data:{ labels, datasets:[{ label: 'Win Rate', data, backgroundColor:'#1FB8CD' }] },
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
      const d = new Date(t.entryDate);
      const mKey = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}`;
      if(!monthMap[mKey]) monthMap[mKey]={total:0,wins:0,net:0};
      monthMap[mKey].total++;
      if(t.netPL>0) monthMap[mKey].wins++;
      monthMap[mKey].net+=t.netPL;

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
  renderAISuggestions() {
    const s = this.calculateStats();
    document.getElementById('smartInsight').textContent = s.totalPL>=0 ?
      `Great job! You're net positive ${this.formatCurrency(s.totalPL)} with a ${s.winRate}% win rate.` :
      `You're net negative ${this.formatCurrency(s.totalPL)}. Focus on risk management and psychology.`;

    const fb = document.getElementById('aiFeedback');
    let psychologyInsight = '';
    if (this.trades.length > 0) {
      const avgStress = this.trades.reduce((sum, t) => sum + (t.preStress || 0), 0) / this.trades.length;
      const avgFomo = this.trades.reduce((sum, t) => sum + (t.fomoLevel || 0), 0) / this.trades.length;
      const avgSleep = this.trades.reduce((sum, t) => sum + (t.sleepQuality || 0), 0) / this.trades.length;
      
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
    document.getElementById('entryAnalysis').innerHTML = this.analyzeEntryPatterns();
    document.getElementById('emotionalBias').innerHTML = this.analyzeEmotionalBias();
    document.getElementById('setupQuality').innerHTML = '<div class="suggestion-item suggestion-info">Setup quality scoring coming soon.</div>';
    document.getElementById('timeConfidence').innerHTML = '<div class="suggestion-item suggestion-info">Time-based confidence insights coming soon.</div>';
  }

  analyzeEntryPatterns() {
    if (this.trades.length < 3) return '<div class="suggestion-item suggestion-info">Need more trades for entry pattern analysis.</div>';
    
    const waitedTrades = this.trades.filter(t => t.waitedForSetup === 'Yes, completely');
    const waitedWinRate = waitedTrades.length ? Math.round((waitedTrades.filter(t => t.netPL > 0).length / waitedTrades.length) * 100) : 0;
    const rushed = this.trades.filter(t => t.waitedForSetup === 'No, entered early').length;
    
    return `<div class="suggestion-item ${waitedWinRate > 60 ? 'suggestion-success' : 'suggestion-warning'}">
      <div class="suggestion-title">Entry Discipline Analysis</div>
      <div class="suggestion-desc">When you wait for setup: ${waitedWinRate}% win rate. Rushed entries: ${rushed} trades.</div>
    </div>`;
  }

  analyzeEmotionalBias() {
    if (this.trades.length < 3) return '<div class="suggestion-item suggestion-info">Need more trades for emotional analysis.</div>';
    
    const highFomoTrades = this.trades.filter(t => (t.fomoLevel || 0) > 6);
    const highStressTrades = this.trades.filter(t => (t.preStress || 0) > 6);
    
    let analysis = '';
    if (highFomoTrades.length > 0) {
      const fomoWinRate = Math.round((highFomoTrades.filter(t => t.netPL > 0).length / highFomoTrades.length) * 100);
      analysis += `High FOMO trades: ${fomoWinRate}% win rate. `;
    }
    if (highStressTrades.length > 0) {
      const stressWinRate = Math.round((highStressTrades.filter(t => t.netPL > 0).length / highStressTrades.length) * 100);
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
    if(this.charts.conf) this.charts.conf.destroy();

    const sorted = [...this.confidenceEntries].sort((a,b)=>new Date(a.date)-new Date(b.date));
    this.charts.conf = new Chart(ctx,{ type:'line', data:{ labels:sorted.map(c=>c.date), datasets:[{ label: 'Confidence', data:sorted.map(c=>c.level), borderColor:'#1FB8CD', backgroundColor:'rgba(31,184,205,0.15)', tension:0.3, fill:true }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ min:1, max:10, ticks: { stepSize: 1 } } } } });
  }

  /* ------------------------ REPORTS & CALENDAR ------------------------ */
  renderReports() {
    const s = this.calculateStats();
    document.getElementById('weeklyReport').innerHTML = `<div class="report-item"><span class="report-label">Total Trades</span><span class="report-value">${s.totalTrades}</span></div><div class="report-item"><span class="report-label">Win Rate</span><span class="report-value">${s.winRate}%</span></div>`;
    document.getElementById('monthlyReport').innerHTML = `<div class="report-item"><span class="report-label">Net P&L</span><span class="report-value ${s.totalPL>=0?'positive':'negative'}">${this.formatCurrency(s.totalPL)}</span></div>`;
    document.getElementById('strategyReport').innerHTML = `<div class="report-item"><span class="report-label">Best Strategy</span><span class="report-value">${this.bestStrategy()}</span></div>`;
    const avgConf = this.confidenceEntries.length ? (this.confidenceEntries.reduce((sum,c)=>sum+c.level,0)/this.confidenceEntries.length).toFixed(1) : 'N/A';
    document.getElementById('emotionalReport').innerHTML = `<div class="report-item"><span class="report-label">Avg Confidence</span><span class="report-value">${avgConf}/10</span></div>`;

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

    for(let i=0;i<monthStart.getDay();i++){
      const div=document.createElement('div');
      div.className='calendar-day no-trades';
      cal.appendChild(div);
    }

    for(let d=1;d<=daysInMonth;d++){
      const current = new Date(date.getFullYear(), date.getMonth(), d);
      const key = current.toISOString().split('T')[0];
      const trades = this.trades.filter(t => t.entryDate.startsWith(key));
      let cls = 'no-trades';
      let content = d;
      let pl = 0;
      if (trades.length) {
        pl = trades.reduce((sum,t)=>sum+t.netPL,0);
        if (pl>1000) cls='profit-high'; else if (pl>0) cls='profit-low'; else if (pl<-1000) cls='loss-high'; else cls='loss-low';
        content = d;
      }
      const div=document.createElement('div');
      div.className='calendar-day '+cls;
      div.textContent=content;
      div.title = trades.length ? `${trades.length} trades, P&L: ${this.formatCurrency(pl)}` : 'No trades';
      cal.appendChild(div);
    }
  }

  /* ------------------------ UTIL ------------------------------------- */
  bestStrategy() {
    if (this.trades.length===0) return 'N/A';
    const map={};
    this.trades.forEach(t=>map[t.strategy]=(map[t.strategy]||0)+t.netPL);
    const best = Object.entries(map).sort((a,b)=>b[1]-a[1])[0];
    return best ? best[0] : 'N/A';
  }

  exportCSV() {
    if (this.trades.length===0) { this.showToast('No trades to export','warning'); return; }
    const header=['id','entryDate','exitDate','symbol','direction','quantity','entryPrice','exitPrice','stopLoss','targetPrice','netPL','strategy','notes','lesson'];
    const rows=this.trades.map(t=>[
      t.id, t.entryDate, t.exitDate, t.symbol, t.direction, t.quantity, t.entryPrice, t.exitPrice, t.stopLoss||'',t.targetPrice||'',t.netPL,t.strategy,t.notes.replace(/"/g,'""'), t.lesson.replace(/"/g,'""')
    ]);
    const csv=[header].concat(rows).map(r=>r.map(f=>typeof f==='string' && f.includes(',')?`"${f}"`:f).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='trading_journal_data.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  showTradeDetails(id) {
    const t = this.trades.find(tr=>tr.id===id);
    if(!t) return;
    const rrText = t.riskRewardRatio? t.riskRewardRatio.toFixed(2):'0.00';
    const body=document.getElementById('tradeModalBody');
    body.innerHTML=`<div class="trade-detail-grid">
      <div class="trade-detail-item"><div class="trade-detail-label">Symbol</div><div class="trade-detail-value">${t.symbol}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Direction</div><div class="trade-detail-value"><span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span></div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Quantity</div><div class="trade-detail-value">${t.quantity}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Entry Price</div><div class="trade-detail-value">₹${t.entryPrice}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Exit Price</div><div class="trade-detail-value">₹${t.exitPrice}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Gross P&L</div><div class="trade-detail-value ${t.grossPL>=0?'positive':'negative'}">${this.formatCurrency(t.grossPL)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Net P&L</div><div class="trade-detail-value ${t.netPL>=0?'positive':'negative'}">${this.formatCurrency(t.netPL)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Risk:Reward</div><div class="trade-detail-value">1:${rrText}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Strategy</div><div class="trade-detail-value">${t.strategy}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Sleep Quality</div><div class="trade-detail-value">${t.sleepQuality||'N/A'}/10</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Pre-Stress</div><div class="trade-detail-value">${t.preStress||'N/A'}/10</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">FOMO Level</div><div class="trade-detail-value">${t.fomoLevel||'N/A'}/10</div></div>
    </div>
    ${t.notes?`<div style="margin-top:16px;"><strong>Notes:</strong><br><p>${t.notes}</p></div>`:''}
    ${t.lesson?`<div style="margin-top:16px;"><strong>Lesson Learned:</strong><br><p>${t.lesson}</p></div>`:''}`;
    document.getElementById('tradeModal').classList.remove('hidden');
  }

  hideTradeModal(){ document.getElementById('tradeModal').classList.add('hidden'); }
}

window.app = new TradingJournalApp();
