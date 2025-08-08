// Trading Journal Application - Integrated with Firebase
class TradingJournalApp {
  constructor() {
    // --- FIREBASE SETUP ---
    // PASTE YOUR FIREBASE CONFIG OBJECT HERE
    const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_AUTH_DOMAIN",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_STORAGE_BUCKET",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID"
    };

    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    this.auth = firebase.auth();
    this.db = firebase.firestore();

    // --- APP STATE ---
    this.currentUser = null;
    this.allTrades = [];
    this.allConfidence = [];
    this.allPlaybooks = []; // NEW: To store user's playbooks
    this.charts = {};
    this.mainListenersAttached = false;
    this.currentCalendarDate = new Date();
  }

  /**
   * Main entry point.
   */
  bootstrap() {
    this.setupAuthListeners();
    this.handleAuthStateChange();
  }

  /* ------------------------------- AUTH ---------------------------------- */

  handleAuthStateChange() {
    this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        if (!this.currentUser || this.currentUser.uid !== user.uid) {
          console.log('[AUTH] User is signed in:', user.uid);
          this.currentUser = user;
          await this.loadUserData();
          this.showMainApp();
        }
      } else {
        console.log('[AUTH] User is signed out.');
        this.currentUser = null;
        this.allTrades = [];
        this.allConfidence = [];
        this.allPlaybooks = [];
        Object.values(this.charts).forEach(chart => chart?.destroy());
        this.charts = {};
        this.showAuthScreen();
      }
    });
  }

  setupAuthListeners() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.tab));
    });

    const loginForm = document.getElementById('loginFormElement');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearAuthErrors();
      const submitButton = loginForm.querySelector('button[type="submit"]');
      try {
        submitButton.disabled = true;
        submitButton.textContent = 'Logging in...';
        await this.auth.signInWithEmailAndPassword(loginForm.email.value, loginForm.password.value);
      } catch (error) {
        this.showAuthError('login-password-error', error.message);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Login';
      }
    });

    const signupForm = document.getElementById('signupFormElement');
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearAuthErrors();
      const submitButton = signupForm.querySelector('button[type="submit"]');
      try {
        submitButton.disabled = true;
        submitButton.textContent = 'Signing up...';
        const { email, password, confirmPassword } = signupForm;
        if (password.value !== confirmPassword.value) {
          this.showAuthError('signup-confirmPassword-error', 'Passwords do not match');
          return;
        }
        await this.auth.createUserWithEmailAndPassword(email.value, password.value);
        this.showToast('Signup successful! You can now log in.', 'success');
        signupForm.reset();
        this.switchAuthTab('login');
      } catch (error) {
        this.showAuthError('signup-email-error', error.message);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Create Account';
      }
    });
  }

  async logout() {
    try {
      await this.auth.signOut();
      this.showToast('Logged out successfully', 'info');
    } catch (error) {
      this.showToast(`Logout failed: ${error.message}`, 'error');
    }
  }

  /* ------------------------------ DATA --------------------------------- */

  async loadUserData() {
    if (!this.currentUser) return;
    
    console.log('[DATA] Loading all user data...');
    this.showToast('Loading your data...', 'info');
    
    const tradesQuery = this.db.collection('users').doc(this.currentUser.uid).collection('trades').orderBy('entryDate', 'desc').get();
    const confidenceQuery = this.db.collection('users').doc(this.currentUser.uid).collection('confidence').orderBy('date', 'desc').get();
    const playbooksQuery = this.db.collection('users').doc(this.currentUser.uid).collection('playbooks').orderBy('name').get();

    try {
        const [tradesSnapshot, confidenceSnapshot, playbooksSnapshot] = await Promise.all([tradesQuery, confidenceQuery, playbooksQuery]);
        
        this.allTrades = tradesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`[DATA] Loaded ${this.allTrades.length} trades.`);

        this.allConfidence = confidenceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`[DATA] Loaded ${this.allConfidence.length} confidence entries.`);

        this.allPlaybooks = playbooksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`[DATA] Loaded ${this.allPlaybooks.length} playbooks.`);

    } catch (error) {
        console.error("[DATA] Error loading user data:", error);
        this.showToast(`Error loading data: ${error.message}`, 'error');
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
    this.showSection('dashboard');
  }

  attachMainListeners() {
    document.querySelectorAll('.nav-link, .view-all-link').forEach(btn => {
      btn.addEventListener('click', () => this.showSection(btn.dataset.section));
    });
    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('quickAddTrade').addEventListener('click', () => this.showSection('add-trade'));

    document.getElementById('saveConfidenceBtn').addEventListener('click', () => this.saveDailyConfidence());

    this.setupAddTradeForm();
    this.setupPlaybookModal();

    document.getElementById('exportData').addEventListener('click', () => this.exportCSV());
    document.getElementById('prevMonth').addEventListener('click', () => this.changeCalendarMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => this.changeCalendarMonth(1));
  }

  showSection(id) {
    if (!id) return;
    document.querySelectorAll('.nav-link').forEach(btn => btn.classList.toggle('active', btn.dataset.section === id));
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    // Destroy old charts to prevent memory leaks
    Object.values(this.charts).forEach(chart => chart?.destroy());
    this.charts = {};

    switch (id) {
      case 'dashboard': this.renderDashboard(); break;
      case 'add-trade': this.renderAddTrade(); break;
      case 'history': this.renderHistory(); break;
      case 'playbooks': this.renderPlaybooks(); break;
      case 'analytics': this.renderAnalytics(); break;
      case 'psychology': this.renderPsychology(); break;
      case 'reports': this.renderReports(); break;
    }
  }
  
  /* -------------------------- PLAYBOOK FEATURE ------------------------- */

  setupPlaybookModal() {
    const modal = document.getElementById('playbookModal');
    const form = document.getElementById('playbookForm');
    document.getElementById('addPlaybookBtn').addEventListener('click', () => modal.classList.remove('hidden'));
    modal.querySelectorAll('.modal-close').forEach(el => el.addEventListener('click', () => modal.classList.add('hidden')));
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = form.name.value.trim();
        const description = form.description.value.trim();
        if (!name) {
            this.showToast('Playbook name is required.', 'error');
            return;
        }
        
        try {
            const playbookData = { name, description, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
            const docRef = await this.db.collection('users').doc(this.currentUser.uid).collection('playbooks').add(playbookData);
            this.allPlaybooks.push({ id: docRef.id, ...playbookData });
            this.allPlaybooks.sort((a, b) => a.name.localeCompare(b.name));
            this.renderPlaybooks();
            this.showToast('Playbook saved!', 'success');
            form.reset();
            modal.classList.add('hidden');
        } catch (error) {
            this.showToast(`Error saving playbook: ${error.message}`, 'error');
        }
    });
  }

  renderPlaybooks() {
    const container = document.getElementById('playbooksList');
    if (this.allPlaybooks.length === 0) {
        container.innerHTML = '<div class="empty-state">You haven\'t created any playbooks yet. Click "New Playbook" to define your A+ setups.</div>';
        return;
    }
    container.innerHTML = this.allPlaybooks.map(p => `
        <div class="card" style="margin-bottom: 16px;">
            <div class="card__header"><h3>${p.name}</h3></div>
            <div class="card__body"><p>${p.description || 'No description provided.'}</p></div>
        </div>
    `).join('');
  }

  populatePlaybookDropdown() {
    const select = document.getElementById('playbookSelect');
    if (!select) return;
    if (this.allPlaybooks.length === 0) {
        select.innerHTML = '<option value="">Please create a playbook first</option>';
        return;
    }
    select.innerHTML = '<option value="">Select a Playbook</option>' + this.allPlaybooks.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }

  /* -------------------------- PSYCHOLOGY FEATURE ------------------------- */
  
  renderPsychology() {
    // This function just calls the individual chart renderers
    setTimeout(() => {
        this.drawSleepChart();
        this.drawEmotionChart();
        this.drawConfidenceCorrelationChart();
        this.drawFomoChart();
    }, 50);
  }

  drawSleepChart() {
    const ctx = document.getElementById('sleepChart');
    if (!ctx) return;
    
    const groupedBySleep = this.trades.reduce((acc, trade) => {
        const quality = trade.sleepQuality || 'N/A';
        if (!acc[quality]) {
            acc[quality] = { totalPL: 0, count: 0 };
        }
        acc[quality].totalPL += trade.netPL;
        acc[quality].count++;
        return acc;
    }, {});

    const labels = Object.keys(groupedBySleep).sort();
    const data = labels.map(label => groupedBySleep[label].totalPL / groupedBySleep[label].count);

    this.charts.sleep = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Average P&L',
                data,
                backgroundColor: data.map(d => d >= 0 ? 'rgba(50, 184, 198, 0.6)' : 'rgba(255, 84, 89, 0.6)'),
                borderColor: data.map(d => d >= 0 ? 'rgba(50, 184, 198, 1)' : 'rgba(255, 84, 89, 1)'),
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  drawEmotionChart() {
    const ctx = document.getElementById('emotionChart');
    if (!ctx) return;

    const groupedByEmotion = this.trades.reduce((acc, trade) => {
        const emotion = trade.preEmotion || 'N/A';
        if (!acc[emotion]) {
            acc[emotion] = { totalPL: 0, count: 0 };
        }
        acc[emotion].totalPL += trade.netPL;
        acc[emotion].count++;
        return acc;
    }, {});

    const labels = Object.keys(groupedByEmotion);
    const data = labels.map(label => groupedByEmotion[label].totalPL / groupedByEmotion[label].count);

    this.charts.emotion = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Average P&L',
                data,
                backgroundColor: data.map(d => d >= 0 ? 'rgba(50, 184, 198, 0.6)' : 'rgba(255, 84, 89, 0.6)'),
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  drawConfidenceCorrelationChart() {
    const ctx = document.getElementById('confidenceCorrelationChart');
    if (!ctx) return;

    const groupedByConfidence = this.trades.reduce((acc, trade) => {
        const level = trade.confidenceLevel || 'N/A';
        if (!acc[level]) {
            acc[level] = { wins: 0, count: 0 };
        }
        if (trade.netPL > 0) {
            acc[level].wins++;
        }
        acc[level].count++;
        return acc;
    }, {});

    const labels = Object.keys(groupedByConfidence).sort((a,b) => a - b);
    const data = labels.map(label => (groupedByConfidence[label].wins / groupedByConfidence[label].count) * 100);

    this.charts.confidenceCorrelation = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Win Rate %',
                data,
                borderColor: '#1FB8CD',
                tension: 0.1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }
    });
  }

  drawFomoChart() {
    const ctx = document.getElementById('fomoChart');
    if (!ctx) return;

    const data = this.trades.map(trade => ({
        x: trade.fomoLevel || 1,
        y: trade.netPL,
        r: Math.sqrt(Math.abs(trade.quantity)) * 2 // Bubble size based on quantity
    }));

    this.charts.fomo = new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Trades',
                data,
                backgroundColor: data.map(d => d.y >= 0 ? 'rgba(50, 184, 198, 0.6)' : 'rgba(255, 84, 89, 0.6)')
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: 'FOMO Level (1-10)' } }, y: { title: { display: true, text: 'Net P&L' } } } }
    });
  }


  /* ---------------------- EXISTING CODE (with minor updates) ----------------------------- */
  
  // ... (The rest of the code is largely the same, with minor updates to use playbookId)
  
  // Minor update to renderAddTrade
  renderAddTrade() {
    this.populatePlaybookDropdown();
    const now = new Date();
    const entryDateEl = document.querySelector('input[name="entryDate"]');
    const exitDateEl = document.querySelector('input[name="exitDate"]');
    if (entryDateEl) entryDateEl.value = now.toISOString().slice(0, 16);
    if (exitDateEl) exitDateEl.value = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 16);
  }

  // Minor update to submitTrade
  async submitTrade() {
    const form = document.getElementById('addTradeForm');
    const fd = new FormData(form);
    if (!this.currentUser) { this.showToast('You must be logged in.', 'error'); return; }

    const playbookId = fd.get('playbookId');
    const playbook = this.allPlaybooks.find(p => p.id === playbookId);

    const trade = {
      symbol: fd.get('symbol').toUpperCase(),
      direction: fd.get('direction'),
      quantity: parseFloat(fd.get('quantity')),
      entryPrice: parseFloat(fd.get('entryPrice')),
      exitPrice: parseFloat(fd.get('exitPrice')),
      stopLoss: parseFloat(fd.get('stopLoss')) || null,
      targetPrice: parseFloat(fd.get('targetPrice')) || null,
      playbookId: playbookId || null,
      playbookName: playbook ? playbook.name : 'N/A', // Denormalize for easier display
      exitReason: fd.get('exitReason') || 'N/A',
      confidenceLevel: parseInt(fd.get('confidenceLevel')),
      entryDate: fd.get('entryDate'),
      exitDate: fd.get('exitDate'),
      preEmotion: fd.get('preEmotion') || '',
      postEmotion: fd.get('postEmotion') || '',
      notes: fd.get('notes') || '',
      sleepQuality: parseInt(fd.get('sleepQuality')) || 5,
      physicalCondition: parseInt(fd.get('physicalCondition')) || 5,
      fomoLevel: parseInt(fd.get('fomoLevel')) || 1,
      preStress: parseInt(fd.get('preStress')) || 1,
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
        this.showSection('dashboard');
    } catch (error) {
        console.error('[DATA] Firestore insert error:', error);
        this.showToast(`Error saving trade: ${error.message}`, 'error');
    }
  }

  // Minor update to renderHistory
  renderHistory() {
    const container = document.getElementById('historyContent');
    if (this.trades.length === 0) {
      container.innerHTML = '<div class="empty-state">No trades recorded yet.</div>';
      return;
    }

    const symbols = [...new Set(this.trades.map(t => t.symbol))];
    const symbolFilter = document.getElementById('symbolFilter');
    symbolFilter.innerHTML = '<option value="">All Symbols</option>' + symbols.map(s => `<option value="${s}">${s}</option>`).join('');

    const playbookFilter = document.getElementById('playbookFilter');
    playbookFilter.innerHTML = '<option value="">All Playbooks</option>' + this.allPlaybooks.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    const applyFilters = () => {
      const symVal = symbolFilter.value;
      const playbookId = playbookFilter.value;
      const filtered = this.trades.filter(t => (!symVal || t.symbol === symVal) && (!playbookId || t.playbookId === playbookId));
      renderTable(filtered);
    };

    symbolFilter.onchange = playbookFilter.onchange = applyFilters;

    const renderTable = rows => {
      if (rows.length === 0) {
        container.innerHTML = '<div class="empty-state">No trades match filter.</div>';
        return;
      }
      container.innerHTML = `
        <div class="card"><table class="trade-table"><thead>
          <tr><th>Date</th><th>Symbol</th><th>Dir</th><th>Playbook</th><th>P&L</th></tr>
        </thead><tbody>
          ${rows.map(t => `
            <tr onclick="app.showTradeDetails('${t.id}')">
              <td data-label="Date">${this.formatDate(t.entryDate)}</td>
              <td data-label="Symbol">${t.symbol}</td>
              <td data-label="Direction"><span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span></td>
              <td data-label="Playbook">${t.playbookName || 'N/A'}</td>
              <td data-label="P&L" class="${t.netPL>=0?'positive':'negative'}">${this.formatCurrency(t.netPL)}</td>
            </tr>`).join('')}
        </tbody></table></div>`;
    };
    applyFilters();
  }
  
  // Minor update to renderAnalytics
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
        this.drawPlaybookChart();
    }, 50);
  }

  drawPlaybookChart() {
    const ctx = document.getElementById('playbookChart');
    if (!ctx) return;

    const groupedByPlaybook = this.trades.reduce((acc, trade) => {
        const id = trade.playbookId || 'N/A';
        const name = trade.playbookName || 'Uncategorized';
        if (!acc[id]) {
            acc[id] = { name, wins: 0, count: 0 };
        }
        if (trade.netPL > 0) {
            acc[id].wins++;
        }
        acc[id].count++;
        return acc;
    }, {});

    const labels = Object.values(groupedByPlaybook).map(p => p.name);
    const data = Object.values(groupedByPlaybook).map(p => (p.wins / p.count) * 100);

    this.charts.playbook = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Win Rate %',
                data,
                backgroundColor: 'rgba(50, 184, 198, 0.6)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } }
    });
  }

  // The rest of the functions (charts, helpers, etc.) are included below for completeness
  // but are largely unchanged from the previous version.
  
  // ... Paste the remaining functions from the previous app.js version here ...
  // (This includes: updateUserInfo, toggleTheme, formatCurrency, formatDate, showToast, 
  // calculateStats, renderDashboard, saveDailyConfidence, setupAddTradeForm, updateCalculations,
  // getCheckboxValues, getRadioValue, showTradeDetails, hideTradeModal, drawPLChart,
  // renderReports, changeCalendarMonth, buildCalendar, exportCSV)
  
  // For brevity, I'll just include the ones that have minor changes or are essential to have
  
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

  showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const div = document.createElement('div');
    div.className = 'toast ' + type;
    div.textContent = msg;
    container.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  showTradeDetails(id) {
    const t = this.trades.find(tr => tr.id === id);
    if (!t) return;
    const rrText = t.riskRewardRatio ? t.riskRewardRatio.toFixed(2) : '0.00';
    const body = document.getElementById('tradeModalBody');
    body.innerHTML = `<div class="trade-detail-grid">
      <div class="trade-detail-item"><div class="trade-detail-label">Symbol</div><div class="trade-detail-value">${t.symbol}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Playbook</div><div class="trade-detail-value">${t.playbookName || 'N/A'}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Net P&L</div><div class="trade-detail-value ${t.netPL>=0?'positive':'negative'}">${this.formatCurrency(t.netPL)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Risk:Reward</div><div class="trade-detail-value">1:${rrText}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Sleep Quality</div><div class="trade-detail-value">${t.sleepQuality||'N/A'}/10</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">FOMO Level</div><div class="trade-detail-value">${t.fomoLevel||'N/A'}/10</div></div>
    </div>
    ${t.notes?`<div style="margin-top:16px;"><strong>Notes:</strong><p>${t.notes}</p></div>`:''}`;
    document.getElementById('tradeModal').classList.remove('hidden');
    document.getElementById('tradeModal').querySelectorAll('.modal-close').forEach(el => el.addEventListener('click', () => document.getElementById('tradeModal').classList.add('hidden')));
  }

  hideTradeModal() { document.getElementById('tradeModal').classList.add('hidden'); }

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

  renderReports() {
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
    
    document.getElementById('currentMonth').textContent = monthStart.toLocaleDateString('en-IN', { month:'long', year:'numeric' });
    const cal = document.getElementById('plCalendar');
    cal.innerHTML='';

    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d=> cal.innerHTML += `<div class="calendar-day header">${d}</div>`);
    for(let i=0;i<monthStart.getDay();i++) cal.innerHTML += `<div class="calendar-day no-trades"></div>`;

    for(let d=1; d<=monthEnd.getDate(); d++){
      const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const trades = this.trades.filter(t => t.entryDate && t.entryDate.startsWith(key));
      let cls = 'no-trades';
      if (trades.length) {
        const pl = trades.reduce((sum,t)=>sum+t.netPL,0);
        if (pl>1000) cls='profit-high'; else if (pl>0) cls='profit-low'; else if (pl<-1000) cls='loss-high'; else if (pl < 0) cls='loss-low';
      }
      cal.innerHTML += `<div class="calendar-day ${cls}">${d}</div>`;
    }
  }

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
