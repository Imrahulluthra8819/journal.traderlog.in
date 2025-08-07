// ─────────────────────────────────────────────────────────────────────────────
//  trading_journal_supabase.js
// ─────────────────────────────────────────────────────────────────────────────

// 1️⃣ Supabase Initialization
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://brjomrasrmbyxepjlfdq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyam9tcmFzcm1ieXhlcGpsZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTMwODgsImV4cCI6MjA2OTUyOTA4OH0.51UGb2AE75iE6bPF_mXl_vOBPRB9JiHwFG-7jXyqIrs';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

class TradingJournalApp {
  constructor() {
    this.tradesList = [];
    this.confidenceList = [];
    this.currentUser = null;
    this.charts = {};
    this.mainListenersAttached = false;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.bootstrap());
    } else {
      this.bootstrap();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  BOOTSTRAP & AUTH
  // ───────────────────────────────────────────────────────────────────────────
  bootstrap() {
    supabase.auth.onAuthStateChange((_, session) => {
      if (session && session.user) {
        this.currentUser = session.user;
        this.fetchAllData().then(() => this.showMainApp());
      } else {
        this.currentUser = null;
        this.showAuthScreen();
      }
    });

    this.setupAuthListeners();
    supabase.auth.getSession();
  }

  setupAuthListeners() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.tab));
    });

    // Login
    document.getElementById('loginFormElement').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = fd.get('username').trim();
      const password = fd.get('password').trim();
      this.clearAuthErrors();
      if (!email || !password) {
        this.showAuthError('login-username-error', 'Please fill all fields');
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) this.showAuthError('login-password-error', error.message);
    });

    // Signup
    document.getElementById('signupFormElement').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const username = fd.get('username').trim();
      const email = fd.get('email').trim();
      const password = fd.get('password');
      const confirm  = fd.get('confirmPassword');
      this.clearAuthErrors();
      if (!username || !email || !password) {
        this.showAuthError('signup-username-error', 'Please fill all fields');
        return;
      }
      if (password !== confirm) {
        this.showAuthError('signup-confirmPassword-error', 'Passwords do not match');
        return;
      }
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) this.showAuthError('signup-username-error', error.message);
      else this.showToast('Signup successful! Check your email.', 'success');
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
    document.getElementById('currentUserName').textContent = this.currentUser.email;
    this.showSection('dashboard');
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  DATA FETCH
  // ───────────────────────────────────────────────────────────────────────────
  async fetchAllData() {
    await Promise.all([this.fetchTrades(), this.fetchConfidence()]);
    document.dispatchEvent(new CustomEvent('confidence-updated'));
  }

  async fetchTrades() {
    const { data, error } = await supabase
      .from('trades')
      .select('trade_data')
      .eq('user_id', this.currentUser.id)
      .order('created_at', { ascending: true });
    if (!error) this.tradesList = data.map(r => r.trade_data);
  }

  async fetchConfidence() {
    const { data, error } = await supabase
      .from('confidence')
      .select('date, level')
      .eq('user_id', this.currentUser.id)
      .order('date', { ascending: true });
    if (!error) this.confidenceList = data;
  }

  get trades() { return this.tradesList; }
  get confidenceEntries() { return this.confidenceList; }

  // ───────────────────────────────────────────────────────────────────────────
  //  MAIN APP LISTENERS & SAVE
  // ───────────────────────────────────────────────────────────────────────────
  attachMainListeners() {
    document.querySelectorAll('.nav-link').forEach(btn =>
      btn.addEventListener('click', () => this.showSection(btn.dataset.section))
    );
    document.getElementById('logoutBtn').addEventListener('click', () => supabase.auth.signOut());
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('quickAddTrade').addEventListener('click', () => this.showSection('add-trade'));

    const slider = document.getElementById('dailyConfidence');
    const out    = document.getElementById('confidenceValue');
    slider.addEventListener('input', () => out.textContent = slider.value);
    document.getElementById('saveConfidenceBtn').addEventListener('click', () => this.saveDailyConfidence());

    this.setupAddTradeForm();
    document.getElementById('exportData').addEventListener('click', () => this.exportCSV());
    document.getElementById('prevMonth').addEventListener('click', () => this.changeCalendarMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => this.changeCalendarMonth(1));

    document.addEventListener('confidence-updated', () => {
      if (document.getElementById('ai-suggestions').classList.contains('active')) this.renderAISuggestions();
      if (document.getElementById('reports').classList.contains('active')) this.renderReports();
    });
  }

  async saveDailyConfidence() {
    const level = parseInt(document.getElementById('dailyConfidence').value, 10);
    const today = new Date().toISOString().split('T')[0];
    if (this.confidenceList.some(c => c.date === today)) {
      this.showToast("You've already recorded confidence today!", 'warning');
      return;
    }
    const { error } = await supabase
      .from('confidence')
      .insert({ user_id: this.currentUser.id, date: today, level });
    if (!error) {
      this.confidenceList.push({ date: today, level });
      this.showToast('Daily confidence recorded successfully!', 'success');
      document.dispatchEvent(new CustomEvent('confidence-updated'));
    }
  }

  async submitTrade() {
    const form = document.getElementById('addTradeForm');
    const fd   = new FormData(form);

    // Validate required fields
    const required = ['symbol','direction','quantity','entryPrice','exitPrice','entryDate','exitDate'];
    let hasErr = false;
    required.forEach(fld => {
      if (!fd.get(fld)) {
        const el = document.getElementById(fld + '-error');
        el.textContent = 'Required';
        el.classList.add('active');
        hasErr = true;
      }
    });
    const qty = parseFloat(fd.get('quantity'));
    if (isNaN(qty) || qty <= 0) {
      const el = document.getElementById('quantity-error');
      el.textContent = 'Must be positive';
      el.classList.add('active');
      hasErr = true;
    }
    const entryDate = new Date(fd.get('entryDate'));
    const exitDate  = new Date(fd.get('exitDate'));
    if (exitDate <= entryDate) {
      const el = document.getElementById('exitDate-error');
      el.textContent = 'Exit after entry';
      el.classList.add('active');
      hasErr = true;
    }
    if (hasErr) {
      this.showToast('Please fix errors', 'error');
      return;
    }

    // Build trade object
    const trade = {
      id: Date.now(),
      symbol: fd.get('symbol').toUpperCase(),
      direction: fd.get('direction'),
      quantity: qty,
      entryPrice: parseFloat(fd.get('entryPrice')),
      exitPrice: parseFloat(fd.get('exitPrice')),
      stopLoss: parseFloat(fd.get('stopLoss')) || null,
      targetPrice: parseFloat(fd.get('targetPrice')) || null,
      strategy: fd.get('strategy') || 'N/A',
      exitReason: fd.get('exitReason') || 'N/A',
      confidenceLevel: parseInt(fd.get('confidenceLevel')) || 5,
      entryDate: fd.get('entryDate'),
      exitDate: fd.get('exitDate'),
      notes: fd.get('notes') || '',
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
      // add any other fields you had (multiTimeframes, volumeAnalysis, etc.)
    };

    // Calculate P/L & R:R
    trade.grossPL = trade.direction==='Long'
      ? (trade.exitPrice - trade.entryPrice)*trade.quantity
      : (trade.entryPrice - trade.exitPrice)*trade.quantity;
    trade.netPL = trade.grossPL - 40;
    if (trade.stopLoss) {
      const risk = Math.abs(trade.entryPrice - trade.stopLoss)*trade.quantity;
      const reward = trade.targetPrice
        ? Math.abs((trade.direction==='Long'? trade.targetPrice - trade.entryPrice : trade.entryPrice - trade.targetPrice))*trade.quantity
        : Math.abs(trade.grossPL);
      trade.riskRewardRatio = risk? reward/risk : 0;
    } else trade.riskRewardRatio = 0;

    // Persist to Supabase
    const { error } = await supabase
      .from('trades')
      .insert({ user_id: this.currentUser.id, trade_data: trade });
    if (error) {
      console.error(error);
      return this.showToast('Error saving trade', 'error');
    }

    // Update UI
    this.tradesList.push(trade);
    this.showToast('Trade saved with enhanced psychology data!', 'success');
    form.reset();
    this.updateCalculations();
    this.renderAddTrade();
    this.showSection('dashboard');
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  VIEW SWITCHERS & HELPERS
  // ───────────────────────────────────────────────────────────────────────────
  showSection(id) {
    document.querySelectorAll('.nav-link').forEach(btn => btn.classList.toggle('active', btn.dataset.section===id));
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    switch(id) {
      case 'dashboard':     this.renderDashboard();	break;
      case 'add-trade':     this.renderAddTrade();	break;
      case 'history':       this.renderHistory();   break;
      case 'analytics':     this.renderAnalytics(); break;
      case 'ai-suggestions':this.renderAISuggestions(); break;
      case 'reports':       this.renderReports();   break;
    }
  }

  toggleTheme() {
    const html = document.documentElement;
    const curr = html.getAttribute('data-color-scheme') 
      || (window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
    const next = curr==='dark'?'light':'dark';
    html.setAttribute('data-color-scheme', next);
    document.getElementById('themeToggle').textContent = next==='dark'?'☀️':'🌙';
  }

  updateCalculations() {
    const fd = new FormData(document.getElementById('addTradeForm'));
    const qty = parseFloat(fd.get('quantity'))||0;
    const entry = parseFloat(fd.get('entryPrice'))||0;
    const exit  = parseFloat(fd.get('exitPrice'))||0;
    const sl    = parseFloat(fd.get('stopLoss'))||0;
    const target= parseFloat(fd.get('targetPrice'))||0;
    const dir   = fd.get('direction');
    let gross = 0;
    if (qty && entry && exit) gross = dir==='Long' ? (exit-entry)*qty : (entry-exit)*qty;
    const net = gross - 40;
    let rr = 0;
    if (qty && entry && sl) {
      const risk = Math.abs(entry-sl)*qty;
      const reward = target ? Math.abs((dir==='Long'? target-entry : entry-target))*qty : Math.abs(gross);
      if (risk>0) rr = reward/risk;
    }
    const capRisk = ((Math.abs(entry-sl)*qty)/100000)*100||0;
    const setVal = (id,val,pos) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      el.className = pos!==undefined?`calc-value ${pos?'positive':'negative'}`:'calc-value';
    };
    setVal('calcGrossPL', this.formatCurrency(gross), gross>=0);
    setVal('calcNetPL', this.formatCurrency(net), net>=0);
    const rrEl = document.getElementById('calcRiskReward');
    if (rrEl) rrEl.textContent = '1:'+rr.toFixed(2);
    const crEl = document.getElementById('calcCapitalRisk');
    if (crEl) crEl.textContent = capRisk.toFixed(2)+'%';
  }

  setupAddTradeForm() {
    const form = document.getElementById('addTradeForm');
    const ranges = [
      {name:'confidenceLevel', displayId:'tradeConfidenceValue'},
      {name:'sleepQuality'}, {name:'physicalCondition'}, {name:'fomoLevel'},
      {name:'preStress'}, {name:'positionComfort'}, {name:'stressDuring'}
    ];
    ranges.forEach(r => {
      const slider = form.querySelector(`[name="${r.name}"]`);
      if (!slider) return;
      const disp = r.displayId? document.getElementById(r.displayId) : slider.parentElement.querySelector('.range-value');
      if (!disp) return;
      slider.addEventListener('input', ()=> disp.textContent = slider.value);
    });
    ['quantity','entryPrice','exitPrice','stopLoss','targetPrice','direction'].forEach(name=>{
      const el = form.querySelector(`[name="${name}"]`);
      if (!el) return;
      el.addEventListener('input', ()=> this.updateCalculations());
      el.addEventListener('change', ()=> this.updateCalculations());
    });
    form.addEventListener('submit', e=>{ e.preventDefault(); this.submitTrade(); });
    document.getElementById('resetTradeForm').addEventListener('click', ()=>{
      form.reset(); this.updateCalculations(); this.renderAddTrade();
      document.querySelectorAll('.range-value').forEach(el=>el.textContent='5');
      document.getElementById('tradeConfidenceValue').textContent='5';
    });
  }

  renderAddTrade() { 
    const now = new Date();
    ['entryDate','exitDate'].forEach(name=>{
      const el = document.querySelector(`input[name="${name}"]`);
      if (!el) return;
      if (!el.value) {
        const dt = name==='entryDate'? now : new Date(now.getTime()+4*60*60*1000);
        el.value = dt.toISOString().slice(0,16);
      }
    });
  }

  calculateStats() {
    if (this.trades.length===0) return { totalPL:0,winRate:0,totalTrades:0,avgRR:'1:0',bestTrade:0,worstTrade:0 };
    const totalPL = this.trades.reduce((s,t)=>s + (t.netPL||0),0);
    const wins    = this.trades.filter(t=>t.netPL>0).length;
    const winRate = Math.round((wins/this.trades.length)*100);
    const best    = Math.max(...this.trades.map(t=>t.netPL));
    const worst   = Math.min(...this.trades.map(t=>t.netPL));
    const avgRR   = this.trades.filter(t=>t.riskRewardRatio!==undefined)
                     .reduce((s,t,i,arr)=>s + t.riskRewardRatio/arr.length,0).toFixed(2);
    return { totalPL,winRate,totalTrades:this.trades.length,avgRR:'1:'+avgRR,bestTrade:best,worstTrade:worst };
  }

  renderDashboard() {
    const s = this.calculateStats();
    const tp = document.getElementById('totalPL');
    tp.textContent = this.formatCurrency(s.totalPL);
    tp.className = 'stat-value '+(s.totalPL>=0?'positive':'negative');
    document.getElementById('winRate').textContent = s.winRate+'%';
    document.getElementById('totalTrades').textContent = s.totalTrades;
    document.getElementById('avgRR').textContent = s.avgRR;

    const list = document.getElementById('recentTradesList');
    if (this.trades.length===0) {
      list.innerHTML = '<div class="empty-state">No trades yet. Click "Add New Trade"!</div>';
      return;
    }
    list.innerHTML = this.trades.slice(-5).reverse().map(t=>`
      <div class="trade-item" onclick="app.showTradeDetails(${t.id})">
        <div class="trade-info">
          <span class="trade-symbol">${t.symbol}</span>
          <span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span>
          <span class="trade-date">${this.formatDate(t.entryDate)}</span>
        </div>
        <div class="trade-pl ${t.netPL>=0?'positive':'negative'}">${this.formatCurrency(t.netPL)}</div>
      </div>
    `).join('');
  }

  renderHistory() {
    const container = document.getElementById('historyContent');
    if (this.trades.length===0) {
      container.innerHTML = '<div class="empty-state">No trades recorded yet.</div>';
      return;
    }
    const symbols = [...new Set(this.trades.map(t=>t.symbol))];
    const strategies = [...new Set(this.trades.map(t=>t.strategy))];
    document.getElementById('symbolFilter').innerHTML = '<option value="">All Symbols</option>' 
      + symbols.map(s=>`<option value="${s}">${s}</option>`).join('');
    document.getElementById('strategyFilter').innerHTML = '<option value="">All Strategies</option>' 
      + strategies.map(s=>`<option value="${s}">${s}</option>`).join('');
    const apply = ()=> {
      const sf = document.getElementById('symbolFilter').value;
      const stf = document.getElementById('strategyFilter').value;
      const rows = this.trades.filter(t=>(!sf||t.symbol===sf)&&(!stf||t.strategy===stf));
      if (rows.length===0) {
        container.innerHTML = '<div class="empty-state">No trades match filter.</div>';
        return;
      }
      container.innerHTML = `<div class="card"><table class="trade-table"><thead>
        <tr><th>Date</th><th>Symbol</th><th>Dir</th><th>Qty</th><th>Entry</th><th>Exit</th><th>P&L</th><th>Strategy</th></tr>
      </thead><tbody>` 
      + rows.sort((a,b)=>new Date(b.entryDate)-new Date(a.entryDate)).map(t=>`
        <tr onclick="app.showTradeDetails(${t.id})">
          <td data-label="Date">${this.formatDate(t.entryDate)}</td>
          <td data-label="Symbol">${t.symbol}</td>
          <td data-label="Direction"><span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span></td>
          <td data-label="Qty">${t.quantity}</td>
          <td data-label="Entry">₹${t.entryPrice}</td>
          <td data-label="Exit">₹${t.exitPrice}</td>
          <td data-label="P&L" class="${t.netPL>=0?'positive':'negative'}">${this.formatCurrency(t.netPL)}</td>
          <td data-label="Strategy">${t.strategy}</td>
        </tr>
      `).join('') + `</tbody></table></div>`;
    };
    document.getElementById('symbolFilter').onchange = apply;
    document.getElementById('strategyFilter').onchange = apply;
    apply();
  }

  renderAnalytics() {
    const s = this.calculateStats();
    document.getElementById('analyticsTotalTrades').textContent = s.totalTrades;
    document.getElementById('analyticsWinRate').textContent = s.winRate+'%';
    const net = document.getElementById('analyticsNetPL');
    net.textContent = this.formatCurrency(s.totalPL);
    net.className = 'value '+(s.totalPL>=0?'positive':'negative');
    document.getElementById('analyticsBestTrade').textContent = this.formatCurrency(s.bestTrade);
    document.getElementById('analyticsWorstTrade').textContent = this.formatCurrency(s.worstTrade);
    document.getElementById('analyticsAvgRR').textContent = s.avgRR;

    if (typeof Chart==='undefined') return;
    setTimeout(()=>{
      this.drawPLChart();
      this.drawRRChart();
      this.drawStrategyChart();
      this.renderTimeTables();
    },30);
  }

  drawPLChart() {
    const ctx = document.getElementById('plChart');
    if (!ctx) return;
    this.charts.pl&&this.charts.pl.destroy();
    if (!this.trades.length) { ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }
    const sorted = [...this.trades].sort((a,b)=>new Date(a.entryDate)-new Date(b.entryDate));
    let run=0, labels=[], cum=[];
    sorted.forEach(t=>{ run+=t.netPL; labels.push(this.formatDate(t.entryDate)); cum.push(run); });
    this.charts.pl = new Chart(ctx,{ type:'line',
      data:{ labels, datasets:[{ label:'Cumulative P&L', data:cum, tension:0.4, fill:true }] },
      options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true, ticks:{ callback:v=>'₹'+v.toLocaleString('en-IN') } } } }
    });
  }

  drawRRChart() {
    const ctx = document.getElementById('rrChart');
    if (!ctx) return;
    this.charts.rr&&this.charts.rr.destroy();
    if (!this.trades.length) { ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }
    const buckets = {'<1:1':0,'1:1-1:2':0,'1:2-1:3':0,'>1:3':0};
    this.trades.forEach(t=>{
      const rr = t.riskRewardRatio||0;
      if (rr<1) buckets['<1:1']++;
      else if (rr<2) buckets['1:1-1:2']++;
      else if (rr<3) buckets['1:2-1:3']++;
      else buckets['>1:3']++;
    });
    this.charts.rr = new Chart(ctx,{ type:'bar',
      data:{ labels:Object.keys(buckets), datasets:[{ data:Object.values(buckets) }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } }
    });
  }

  drawStrategyChart() {
    const ctx = document.getElementById('strategyChart');
    if (!ctx) return;
    this.charts.strategy&&this.charts.strategy.destroy();
    if (!this.trades.length) { ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }
    const map = {};
    this.trades.forEach(t=>{ map[t.strategy] = map[t.strategy]||{total:0,wins:0}; map[t.strategy].total++; if(t.netPL>0) map[t.strategy].wins++; });
    const labels = Object.keys(map);
    const data   = labels.map(l=>Math.round((map[l].wins/map[l].total)*100));
    this.charts.strategy = new Chart(ctx,{ type:'bar',
      data:{ labels, datasets:[{ data }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, max:100, ticks:{ callback:v=>v+'%' } } } }
    });
  }

  renderTimeTables() {
    const container = document.getElementById('timeChart').parentElement;
    container.querySelectorAll('.time-table').forEach(n=>n.remove());
    if (!this.trades.length) return;
    const monthMap = {}, dowNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], dowMap={};
    dowNames.forEach(d=>dowMap[d]={total:0,wins:0,net:0});
    this.trades.forEach(t=>{
      const d = new Date(t.entryDate);
      const mKey = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}`;
      monthMap[mKey] = monthMap[mKey]||{total:0,wins:0,net:0};
      monthMap[mKey].total++; if(t.netPL>0) monthMap[mKey].wins++; monthMap[mKey].net+=t.netPL;
      const dow = dowNames[d.getDay()];
      dowMap[dow].total++; if(t.netPL>0) dowMap[dow].wins++; dowMap[dow].net+=t.netPL;
    });
    const makeTable=(title, rows)=>{
      const div=document.createElement('div'); div.className='time-table';
      div.innerHTML=`<h4>${title}</h4><table class="trade-table"><thead><tr><th>Period</th><th>Trades</th><th>Win %</th><th>Net P&L</th></tr></thead><tbody>${rows}</tbody></table>`;
      container.appendChild(div);
    };
    const monthRows = Object.keys(monthMap).sort().map(k=>{
      const o=monthMap[k], win=Math.round((o.wins/o.total)*100);
      return `<tr><td>${k}</td><td>${o.total}</td><td>${win}%</td><td class="${o.net>=0?'positive':'negative'}">${this.formatCurrency(o.net)}</td></tr>`;
    }).join('');
    makeTable('Monthly Performance', monthRows);
    const dowRows = dowNames.filter(d=>dowMap[d].total>0).map(d=>{
      const o=dowMap[d], win=Math.round((o.wins/o.total)*100);
      return `<tr><td>${d}</td><td>${o.total}</td><td>${win}%</td><td class="${o.net>=0?'positive':'negative'}">${this.formatCurrency(o.net)}</td></tr>`;
    }).join('');
    makeTable('Day-of-Week Analysis', dowRows);
  }

  renderAISuggestions() {
    const s = this.calculateStats();
    document.getElementById('smartInsight').textContent = s.totalPL>=0
      ? `Great job! You're net positive ${this.formatCurrency(s.totalPL)} with a ${s.winRate}% win rate.`
      : `You're net negative ${this.formatCurrency(s.totalPL)}. Focus on risk management and psychology.`;
    const fb = document.getElementById('aiFeedback');
    let psych = '';
    if (this.trades.length) {
      const avgStress = this.trades.reduce((s,t)=>s+(t.preStress||0),0)/this.trades.length;
      const avgFomo   = this.trades.reduce((s,t)=>s+(t.fomoLevel||0),0)/this.trades.length;
      const avgSleep  = this.trades.reduce((s,t)=>s+(t.sleepQuality||0),0)/this.trades.length;
      if (avgStress>6) psych+=' High stress levels detected.';
      if (avgFomo>6) psych+=' FOMO affecting decisions.';
      if (avgSleep<6) psych+=' Poor sleep impacting performance.';
    }
    fb.innerHTML = `<div class="suggestion-item ${s.winRate>=60?'suggestion-success':s.winRate>=40?'suggestion-info':'suggestion-warning'}">
      <div class="suggestion-title">${s.winRate>=60?'Excellent Execution':s.winRate>=40?'Moderate Execution':'Poor Execution'}</div>
      <div class="suggestion-desc">Win rate ${s.winRate}% over ${s.totalTrades} trades.${psych}</div>
    </div>`;
    const bestStrat = this.bestStrategy();
    document.getElementById('edgeAnalyzer').innerHTML = `<div class="suggestion-item suggestion-info">
      <div class="suggestion-title">Best Strategy</div><div class="suggestion-desc">${bestStrat}</div>
    </div>`;
    const confEl = document.getElementById('confidenceAnalysis');
    if (!this.confidenceEntries.length) {
      confEl.innerHTML = `<div class="suggestion-item suggestion-info">
        <div class="suggestion-title">No Confidence Data</div>
        <div class="suggestion-desc">Record daily confidence.</div>
      </div>`;
    } else {
      const avg = (this.confidenceEntries.reduce((s,c)=>s+c.level,0)/this.confidenceEntries.length).toFixed(1);
      confEl.innerHTML = `<div class="suggestion-item suggestion-info">
        <div class="suggestion-title">Avg Confidence</div>
        <div class="suggestion-desc">${avg}/10 over ${this.confidenceEntries.length} days</div>
      </div>`;
      this.drawConfidenceChart();
    }
    document.getElementById('repeatTrades').innerHTML = this.repeatTradeHTML();
    document.getElementById('entryAnalysis').innerHTML = this.analyzeEntryPatterns();
    document.getElementById('emotionalBias').innerHTML = this.analyzeEmotionalBias();
    document.getElementById('setupQuality').innerHTML = '<div class="suggestion-item suggestion-info">Setup quality scoring coming soon.</div>';
    document.getElementById('timeConfidence').innerHTML = '<div class="suggestion-item suggestion-info">Time-based confidence insights coming soon.</div>';
  }

  analyzeEntryPatterns() {
    if (this.trades.length<3) return '<div class="suggestion-item suggestion-info">Need more trades for entry pattern analysis.</div>';
    const waited = this.trades.filter(t=>t.waitedForSetup==='Yes, completely');
    const winRate = waited.length?Math.round((waited.filter(t=>t.netPL>0).length/waited.length)*100):0;
    const rushed = this.trades.filter(t=>t.waitedForSetup==='No, entered early').length;
    return `<div class="suggestion-item ${winRate>60?'suggestion-success':'suggestion-warning'}">
      <div class="suggestion-title">Entry Discipline Analysis</div>
      <div class="suggestion-desc">When you wait for setup: ${winRate}% win rate. Rushed entries: ${rushed} trades.</div>
    </div>`;
  }

  analyzeEmotionalBias() {
    if (this.trades.length<3) return '<div class="suggestion-item suggestion-info">Need more trades for emotional analysis.</div>';
    const hiFomo = this.trades.filter(t=>t.fomoLevel>6);
    const hiStress = this.trades.filter(t=>t.preStress>6);
    let analysis = '';
    if (hiFomo.length) {
      const fr = Math.round((hiFomo.filter(t=>t.netPL>0).length/hiFomo.length)*100);
      analysis += `High FOMO trades: ${fr}% win rate. `;
    }
    if (hiStress.length) {
      const sr = Math.round((hiStress.filter(t=>t.netPL>0).length/hiStress.length)*100);
      analysis += `High stress trades: ${sr}% win rate.`;
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
    this.trades.forEach(t=>freq[t.symbol]= (freq[t.symbol]||0)+1);
    const [sym,count] = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0];
    return `<div class="suggestion-item suggestion-info">
      <div class="suggestion-title">Most Traded Symbol</div>
      <div class="suggestion-desc">${sym} (${count} trades)</div>
    </div>`;
  }

  drawConfidenceChart() {
    const ctx = document.getElementById('confidenceChart');
    if (!ctx) return;
    this.charts.conf&&this.charts.conf.destroy();
    const sorted = [...this.confidenceEntries].sort((a,b)=>new Date(a.date)-new Date(b.date));
    this.charts.conf = new Chart(ctx,{ type:'line',
      data:{ labels: sorted.map(c=>c.date), datasets:[{ data: sorted.map(c=>c.level), tension:0.3, fill:true }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ min:1, max:10 } } }
    });
  }

  renderReports() {
    const s = this.calculateStats();
    document.getElementById('weeklyReport').innerHTML = `
      <div class="report-item"><span class="report-label">Total Trades</span><span class="report-value">${s.totalTrades}</span></div>
      <div class="report-item"><span class="report-label">Win Rate</span><span class="report-value">${s.winRate}%</span></div>`;
    document.getElementById('monthlyReport').innerHTML = `
      <div class="report-item"><span class="report-label">Net P&L</span><span class="report-value ${s.totalPL>=0?'positive':'negative'}">${this.formatCurrency(s.totalPL)}</span></div>`;
    document.getElementById('strategyReport').innerHTML = `
      <div class="report-item"><span class="report-label">Best Strategy</span><span class="report-value">${this.bestStrategy()}</span></div>`;
    const avgC = this.confidenceEntries.length
      ? (this.confidenceEntries.reduce((s,c)=>s+c.level,0)/this.confidenceEntries.length).toFixed(1)
      : 'N/A';
    document.getElementById('emotionalReport').innerHTML = `
      <div class="report-item"><span class="report-label">Avg Confidence</span><span class="report-value">${avgC}/10</span></div>`;
    this.buildCalendar();
  }

  changeCalendarMonth(offset) {
    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth()+offset);
    this.buildCalendar();
  }

  buildCalendar() {
    this.currentCalendarDate = this.currentCalendarDate || new Date();
    const date = this.currentCalendarDate;
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd   = new Date(date.getFullYear(), date.getMonth()+1, 0);
    const daysInMonth= monthEnd.getDate();

    document.getElementById('currentMonth').textContent = monthStart.toLocaleDateString('en-IN', { month:'long', year:'numeric' });
    const cal = document.getElementById('plCalendar');
    cal.innerHTML = '';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d=>{
      const hd = document.createElement('div');
      hd.className = 'calendar-day header';
      hd.textContent = d;
      cal.appendChild(hd);
    });
    for (let i=0;i<monthStart.getDay();i++){
      const e = document.createElement('div');
      e.className = 'calendar-day no-trades';
      cal.appendChild(e);
    }
    for (let d=1; d<=daysInMonth; d++){
      const curr = new Date(date.getFullYear(), date.getMonth(), d);
      const key  = curr.toISOString().split('T')[0];
      const trades = this.trades.filter(t=>t.entryDate.startsWith(key));
      let cls = 'no-trades';
      if (trades.length){
        const pl = trades.reduce((s,t)=>s+t.netPL,0);
        if (pl>1000) cls='profit-high';
        else if (pl>0) cls='profit-low';
        else if (pl<-1000) cls='loss-high';
        else cls='loss-low';
      }
      const cell = document.createElement('div');
      cell.className = 'calendar-day '+cls;
      cell.textContent = d;
      cell.title = trades.length
        ? `${trades.length} trades, P&L: ${this.formatCurrency(trades.reduce((s,t)=>s+t.netPL,0))}`
        : 'No trades';
      if (trades.length) cell.onclick = ()=>alert(`Trades for ${key} will be detailed soon.`);
      cal.appendChild(cell);
    }
  }

  bestStrategy() {
    if (!this.trades.length) return 'N/A';
    const map = {};
    this.trades.forEach(t=>map[t.strategy]= (map[t.strategy]||0)+t.netPL);
    return Object.entries(map).sort((a,b)=>b[1]-a[1])[0][0];
  }

  exportCSV() {
    if (!this.trades.length) return this.showToast('No trades to export','warning');
    const header = ['Date','Symbol','Direction','Qty','Entry','Exit','Stop','Target','Net P&L','Strategy','Sleep','Stress','FOMO','Notes'];
    const rows = this.trades.map(t=>[
      this.formatDate(t.entryDate), t.symbol, t.direction, t.quantity,
      t.entryPrice, t.exitPrice, t.stopLoss||'', t.targetPrice||'',
      t.netPL, t.strategy, t.sleepQuality||'', t.preStress||'', t.fomoLevel||'', t.notes.replace(/"/g,'""')
    ]);
    const csv = [header, ...rows].map(r=>r.map(f=>
      typeof f==='string'&&f.includes(',')?`"${f}"`:f
    ).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'trading_data_enhanced.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  showTradeDetails(id) {
    const t = this.trades.find(x=>x.id===id);
    if (!t) return;
    const rr = t.riskRewardRatio? t.riskRewardRatio.toFixed(2):'0.00';
    const body = document.getElementById('tradeModalBody');
    body.innerHTML = `<div class="trade-detail-grid">
      <div class="trade-detail-item"><div class="trade-detail-label">Symbol</div><div class="trade-detail-value">${t.symbol}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Direction</div><div class="trade-detail-value"><span class="trade-direction ${t.direction.toLowerCase()}">${t.direction}</span></div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Quantity</div><div class="trade-detail-value">${t.quantity}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Entry Price</div><div class="trade-detail-value">₹${t.entryPrice}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Exit Price</div><div class="trade-detail-value">₹${t.exitPrice}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Gross P&L</div><div class="trade-detail-value ${t.grossPL>=0?'positive':'negative'}">${this.formatCurrency(t.grossPL)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Net P&L</div><div class="trade-detail-value ${t.netPL>=0?'positive':'negative'}">${this.formatCurrency(t.netPL)}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Risk:Reward</div><div class="trade-detail-value">1:${rr}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Strategy</div><div class="trade-detail-value">${t.strategy}</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Sleep Quality</div><div class="trade-detail-value">${t.sleepQuality||'N/A'}/10</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">Pre-Stress</div><div class="trade-detail-value">${t.preStress||'N/A'}/10</div></div>
      <div class="trade-detail-item"><div class="trade-detail-label">FOMO Level</div><div class="trade-detail-value">${t.fomoLevel||'N/A'}/10</div></div>
    </div>
    ${t.notes?`<div style="margin-top:16px;">Notes:<br>${t.notes}</div>`:''}`;
    document.getElementById('tradeModal').classList.remove('hidden');
  }

  hideTradeModal() {
    document.getElementById('tradeModal').classList.add('hidden');
  }

  formatCurrency(val) {
    const sign = val<0?'-':'';
    return sign+'₹'+Math.abs(val).toLocaleString('en-IN',{ minimumFractionDigits:2 });
  }

  formatDate(str) {
    return new Date(str).toLocaleDateString('en-IN',{ year:'numeric', month:'short', day:'2-digit' });
  }

  showToast(msg, type='info') {
    const con = document.getElementById('toastContainer');
    const d = document.createElement('div');
    d.className = 'toast '+type;
    d.textContent = msg;
    con.appendChild(d);
    setTimeout(()=>d.remove(),3000);
  }

  getCheckboxValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb=>cb.value);
  }

  getRadioValue(name) {
    const r = document.querySelector(`input[name="${name}"]:checked`);
    return r? r.value : '';
  }
}

window.app = new TradingJournalApp();
