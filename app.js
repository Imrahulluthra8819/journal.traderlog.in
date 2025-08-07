// Trading Dashboard Application - Fixed and Optimized
class TradingDashboardApp {
    constructor() {
        this.supabaseUrl = 'https://brjomrasrmbyxepjlfdq.supabase.co';
        this.supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyam9tcmFzcm1ieXhlcGpsZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTMwODgsImV4cCI6MjA2OTUyOTA4OH0.51UGb2AE75iE6bPF_mXl_vOBPRB9JiHwFG-7jXyqIrs';
        
        this.supabase = supabase.createClient(this.supabaseUrl, this.supabaseAnonKey);
        
        this.demoUsers = {
            'trader1': { username: 'trader1', email: 'trader1@demo.com', password: 'password123' },
            'trader2': { username: 'trader2', email: 'trader2@demo.com', password: 'password123' }
        };

        this.currentUser = null;
        this.charts = {};
        this.selectedCurrency = 'INR';
        this.tradeCurrency = 'INR';
        this.exchangeRates = { INR: 1, USD: 0.012 };
        this.currentCalendarDate = new Date();
        
        this.init();
    }

    async init() {
        try {
            console.log('Initializing app...');
            
            const { data: { session } } = await this.supabase.auth.getSession();
            
            if (session) {
                this.currentUser = session.user;
                await this.loadUserProfile();
                this.showMainApp();
            } else {
                this.showAuthScreen();
            }

            this.setupAuthListeners();
            
            this.supabase.auth.onAuthStateChange(async (event, session) => {
                if (event === 'SIGNED_IN') {
                    this.currentUser = session.user;
                    await this.loadUserProfile();
                    this.showMainApp();
                } else if (event === 'SIGNED_OUT') {
                    this.currentUser = null;
                    this.showAuthScreen();
                }
            });

        } catch (error) {
            console.error('Init error:', error);
            this.showToast('App initialization failed', 'error');
        }
    }

    /* ======================== CURRENCY ======================== */
    formatCurrency(value, currency = null) {
        const targetCurrency = currency || this.selectedCurrency;
        const convertedValue = this.convertCurrency(value, 'INR', targetCurrency);
        const symbol = targetCurrency === 'USD' ? '$' : '₹';
        
        return symbol + Math.abs(convertedValue).toLocaleString('en-IN', { 
            minimumFractionDigits: 2,
            maximumFractionDigits: 2 
        });
    }

    convertCurrency(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return amount;
        const inINR = fromCurrency === 'INR' ? amount : amount / this.exchangeRates[fromCurrency];
        return toCurrency === 'INR' ? inINR : inINR * this.exchangeRates[toCurrency];
    }

    setupCurrencySelector() {
        const currencySelector = document.getElementById('currencySelector');
        if (currencySelector) {
            currencySelector.value = this.selectedCurrency;
            currencySelector.addEventListener('change', (e) => {
                this.selectedCurrency = e.target.value;
                this.updateAllCurrencyDisplays();
                this.showToast(`Currency changed to ${this.selectedCurrency}`, 'success');
            });
        }

        const tradeCurrencySelector = document.getElementById('tradeCurrencySelector');
        if (tradeCurrencySelector) {
            tradeCurrencySelector.value = this.tradeCurrency;
            tradeCurrencySelector.addEventListener('change', (e) => {
                this.tradeCurrency = e.target.value;
                this.updateTradeCurrencyLabels();
                this.calculateLivePL();
                this.showToast(`Trade currency changed to ${this.tradeCurrency}`, 'success');
            });
        }
    }

    updateTradeCurrencyLabels() {
        const symbol = this.tradeCurrency === 'USD' ? '($)' : '(₹)';
        const elements = ['entryCurrencySymbol', 'exitCurrencySymbol', 'slCurrencySymbol', 'targetCurrencySymbol'];
        
        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = symbol;
        });
    }

    async updateAllCurrencyDisplays() {
        const activeSection = document.querySelector('.section.active');
        if (activeSection) {
            await this.showSection(activeSection.id);
        }
    }

    /* ======================== USER DATA ======================== */
    async loadUserProfile() {
        if (!this.currentUser) return;
        try {
            const { data, error } = await this.supabase
                .from('user_profiles')
                .select('username, full_name')
                .eq('user_id', this.currentUser.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error loading user profile:', error);
                return;
            }

            if (!data) {
                const username = this.currentUser.email.split('@')[0];
                await this.supabase
                    .from('user_profiles')
                    .insert([{
                        user_id: this.currentUser.id,
                        username: username,
                        full_name: username
                    }]);
                this.currentUser.username = username;
            } else {
                this.currentUser.username = data.username;
                this.currentUser.full_name = data.full_name;
            }
        } catch (error) {
            console.error('Error in loadUserProfile:', error);
        }
    }

    async loadTrades() {
        if (!this.currentUser) return [];

        try {
            const { data, error } = await this.supabase
                .from('trades')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('entry_date', { ascending: false });

            if (error) {
                console.error('Error loading trades:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error in loadTrades:', error);
            return [];
        }
    }

    /* ======================== AUTH ======================== */
    setupAuthListeners() {
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.tab));
        });

        const loginForm = document.getElementById('loginFormElement');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin(e);
            });
        }

        const signupForm = document.getElementById('signupFormElement');
        if (signupForm) {
            signupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSignup(e);
            });
        }

        document.querySelectorAll('.demo-login').forEach(btn => {
            btn.addEventListener('click', () => {
                const username = btn.dataset.username;
                const demoUser = this.demoUsers[username];
                if (demoUser) {
                    this.loginWithCredentials(demoUser.email, demoUser.password);
                }
            });
        });
    }

    async handleLogin(event) {
        const formData = new FormData(event.target);
        const identifier = formData.get('username').trim();
        const password = formData.get('password').trim();
        
        this.clearAuthErrors();
        
        if (!identifier || !password) {
            this.showAuthError('login-username-error', 'Please fill all fields');
            return;
        }

        this.setLoadingState('loginBtn', true);

        try {
            const isEmail = identifier.includes('@');
            let email = identifier;

            if (!isEmail) {
                const demoUser = Object.values(this.demoUsers).find(u => u.username === identifier);
                if (demoUser) {
                    email = demoUser.email;
                } else {
                    this.showAuthError('login-username-error', 'Username not found');
                    return;
                }
            }

            await this.loginWithCredentials(email, password);
            
        } catch (error) {
            console.error('Login error:', error);
            this.showAuthError('login-password-error', 'Login failed');
        } finally {
            this.setLoadingState('loginBtn', false);
        }
    }

    async loginWithCredentials(email, password) {
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                if (error.message.includes('Invalid login credentials')) {
                    this.showAuthError('login-password-error', 'Invalid credentials');
                } else {
                    this.showAuthError('login-password-error', error.message);
                }
                return;
            }

            this.showToast('Welcome back!', 'success');
            
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async handleSignup(event) {
        const formData = new FormData(event.target);
        const username = formData.get('username').trim();
        const email = formData.get('email').trim();
        const password = formData.get('password');
        const confirmPassword = formData.get('confirmPassword');

        this.clearAuthErrors();

        if (!username || !email || !password) {
            this.showAuthError('signup-username-error', 'Please fill all fields');
            return;
        }

        if (password !== confirmPassword) {
            this.showAuthError('signup-confirmPassword-error', 'Passwords do not match');
            return;
        }

        if (password.length < 6) {
            this.showAuthError('signup-password-error', 'Password must be at least 6 characters');
            return;
        }

        this.setLoadingState('signupBtn', true);

        try {
            const { data, error } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { username: username }
                }
            });

            if (error) {
                this.showAuthError('signup-email-error', error.message);
                return;
            }

            if (data.user && !data.session) {
                this.showToast('Check your email to confirm account', 'info');
                this.switchAuthTab('login');
                return;
            }

            if (data.user) {
                await this.supabase
                    .from('user_profiles')
                    .insert([{
                        user_id: data.user.id,
                        username: username,
                        full_name: username
                    }]);
            }

            this.showToast('Account created successfully!', 'success');

        } catch (error) {
            console.error('Signup error:', error);
            this.showAuthError('signup-email-error', 'Signup failed');
        } finally {
            this.setLoadingState('signupBtn', false);
        }
    }

    switchAuthTab(tab) {
        document.querySelectorAll('.auth-tab').forEach(t => 
            t.classList.toggle('active', t.dataset.tab === tab));
        document.querySelectorAll('.auth-form').forEach(f => 
            f.classList.toggle('active', f.id === tab + 'Form'));
        this.clearAuthErrors();
    }

    showAuthError(id, message) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = message;
            element.classList.add('active');
        }
    }

    clearAuthErrors() {
        document.querySelectorAll('.form-error').forEach(e => {
            e.textContent = '';
            e.classList.remove('active');
        });
    }

    async logout() {
        try {
            await this.supabase.auth.signOut();
            this.currentUser = null;
            this.destroyCharts();
            this.showToast('Logged out successfully', 'success');
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('Error logging out', 'error');
        }
    }

    /* ======================== UI ======================== */
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
        this.setupCurrencySelector();
        this.showSection('dashboard');
    }

    attachMainListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(btn => {
            btn.addEventListener('click', () => this.showSection(btn.dataset.section));
        });

        // Header actions
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
        document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());
        document.getElementById('quickAddTrade')?.addEventListener('click', () => this.showSection('add-trade'));
        document.getElementById('exportData')?.addEventListener('click', () => this.exportCSV());

        // Confidence slider
        const slider = document.getElementById('dailyConfidence');
        const output = document.getElementById('confidenceValue');
        if (slider && output) {
            output.textContent = slider.value;
            slider.addEventListener('input', () => {
                output.textContent = slider.value;
            });
        }

        document.getElementById('saveConfidenceBtn')?.addEventListener('click', () => this.saveDailyConfidence());

        // Forms
        this.setupAddTradeForm();

        // Calendar
        document.getElementById('prevMonth')?.addEventListener('click', () => this.changeCalendarMonth(-1));
        document.getElementById('nextMonth')?.addEventListener('click', () => this.changeCalendarMonth(1));

        // Mobile menu
        this.setupMobileMenu();
    }

    setupMobileMenu() {
        const toggle = document.querySelector('.mobile-menu-toggle');
        const menu = document.querySelector('.nav-menu');

        if (toggle && menu) {
            toggle.addEventListener('click', () => {
                const isActive = menu.classList.contains('mobile-active');
                menu.classList.toggle('mobile-active');
                toggle.innerHTML = isActive ? '☰' : '✕';
            });

            document.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', () => {
                    menu.classList.remove('mobile-active');
                    toggle.innerHTML = '☰';
                });
            });
        }
    }

    updateUserInfo() {
        const username = this.currentUser?.username || this.currentUser?.email?.split('@')[0] || 'User';
        const nameElement = document.getElementById('currentUserName');
        if (nameElement) nameElement.textContent = username;
    }

    toggleTheme() {
        const html = document.documentElement;
        const current = html.getAttribute('data-color-scheme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-color-scheme', next);
        
        const toggle = document.getElementById('themeToggle');
        if (toggle) toggle.textContent = next === 'dark' ? '☀️' : '🌙';
    }

    async showSection(sectionId) {
        document.querySelectorAll('.nav-link').forEach(btn => 
            btn.classList.toggle('active', btn.dataset.section === sectionId));
        document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
        
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('active');

        switch (sectionId) {
            case 'dashboard': await this.renderDashboard(); break;
            case 'add-trade': this.renderAddTrade(); break;
            case 'history': await this.renderHistory(); break;
            case 'analytics': await this.renderAnalytics(); break;
            case 'ai-suggestions': await this.renderAISuggestions(); break;
            case 'reports': await this.renderReports(); break;
        }
    }

    /* ======================== HELPERS ======================== */
    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 3000);
    }

    setLoadingState(buttonId, loading) {
        const button = document.getElementById(buttonId);
        if (!button) return;

        const textSpan = button.querySelector('.btn-text');
        const spinner = button.querySelector('.loading-spinner');
        
        if (loading) {
            button.disabled = true;
            if (textSpan) textSpan.style.display = 'none';
            if (spinner) spinner.style.display = 'inline';
        } else {
            button.disabled = false;
            if (textSpan) textSpan.style.display = 'inline';
            if (spinner) spinner.style.display = 'none';
        }
    }

    updateElement(id, content) {
        const element = document.getElementById(id);
        if (element) element.textContent = content;
    }

    /* ======================== DASHBOARD ======================== */
    async renderDashboard() {
        try {
            const trades = await this.loadTrades();
            const stats = this.calculateStats(trades);
            
            this.updateElement('totalPL', this.formatCurrency(stats.totalPL));
            this.updateElement('winRate', stats.winRate + '%');
            this.updateElement('totalTrades', stats.totalTrades);
            this.updateElement('avgRR', stats.avgRR);

            const totalPLElement = document.getElementById('totalPL');
            if (totalPLElement) {
                totalPLElement.className = stats.totalPL >= 0 ? 'positive' : 'negative';
            }

            this.renderRecentTrades(trades.slice(0, 5));
            
        } catch (error) {
            console.error('Error rendering dashboard:', error);
        }
    }

    calculateStats(trades) {
        if (!trades || trades.length === 0) {
            return { totalPL: 0, winRate: 0, totalTrades: 0, avgRR: '1:0', bestTrade: 0, worstTrade: 0 };
        }

        const totalPL = trades.reduce((sum, trade) => sum + (trade.net_pl || 0), 0);
        const wins = trades.filter(trade => trade.net_pl > 0).length;
        const winRate = Math.round((wins / trades.length) * 100);
        const bestTrade = Math.max(...trades.map(trade => trade.net_pl));
        const worstTrade = Math.min(...trades.map(trade => trade.net_pl));
        
        const validRR = trades.filter(trade => trade.risk_reward_ratio && trade.risk_reward_ratio > 0);
        const avgRRNum = validRR.length > 0 ? 
            validRR.reduce((sum, trade) => sum + trade.risk_reward_ratio, 0) / validRR.length : 0;

        return { totalPL, winRate, totalTrades: trades.length, avgRR: `1:${avgRRNum.toFixed(2)}`, bestTrade, worstTrade };
    }

    renderRecentTrades(trades) {
        const container = document.getElementById('recentTradesList');
        if (!container) return;
        
        if (!trades || trades.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No trades yet. Add your first trade to get started!</p>
                    <button class="btn btn--primary btn--sm" onclick="document.querySelector('[data-section=add-trade]').click()">
                        Add First Trade
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = trades.map(trade => `
            <div class="trade-item" style="cursor: pointer; padding: 1rem; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 600;">${trade.symbol}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">${trade.direction} • ${this.formatDate(trade.entry_date)}</div>
                </div>
                <div class="${trade.net_pl >= 0 ? 'positive' : 'negative'}" style="font-weight: 600;">
                    ${this.formatCurrency(trade.net_pl)}
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.trade-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                this.showTradeDetailsPopup(trades[index]);
            });
        });
    }

    async saveDailyConfidence() {
        const slider = document.getElementById('dailyConfidence');
        if (!slider) return;
        
        const level = slider.value;
        const today = new Date().toISOString().split('T')[0];

        try {
            await this.saveConfidence(today, level);
            this.showToast('Confidence saved!', 'success');
            
            const messageContainer = document.getElementById('confidenceMessage');
            if (messageContainer) {
                let messageText = '';
                if (level >= 8) messageText = 'High confidence! Great day for trading. 🚀';
                else if (level >= 6) messageText = 'Good confidence level. Trade wisely. ✅';
                else if (level >= 4) messageText = 'Moderate confidence. Consider smaller positions. ⚠️';
                else messageText = 'Low confidence. Maybe take a break today. 🛑';
                
                messageContainer.innerHTML = `<div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px; border: 1px solid var(--border-color);">${messageText}</div>`;
            }
            
        } catch (error) {
            console.error('Error saving confidence:', error);
            this.showToast('Error saving confidence', 'error');
        }
    }

    async saveConfidence(date, level) {
        if (!this.currentUser) return;

        try {
            const { data, error } = await this.supabase
                .from('confidence_entries')
                .upsert([{
                    user_id: this.currentUser.id,
                    date: date,
                    level: parseInt(level),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }], { onConflict: 'user_id,date' });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error in saveConfidence:', error);
            throw error;
        }
    }

    /* ======================== ADD TRADE ======================== */
    setupAddTradeForm() {
        const form = document.getElementById('addTradeForm');
        if (!form) return;
        
        // Range inputs
        const ranges = ['setupQuality', 'confidence'];
        ranges.forEach(id => {
            const input = document.getElementById(id);
            const output = document.getElementById(id + 'Output');
            if (input && output) {
                output.textContent = input.value;
                input.addEventListener('input', () => {
                    output.textContent = input.value;
                });
            }
        });

        // Live calculator
        this.setupLivePLCalculator();

        // Form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleTradeSubmission(e);
        });
    }

    setupLivePLCalculator() {
        const fields = ['quantity', 'entryPrice', 'exitPrice', 'direction', 'stopLoss', 'tradeCurrencySelector'];
        
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', () => this.calculateLivePL());
                field.addEventListener('change', () => this.calculateLivePL());
            }
        });
    }

    calculateLivePL() {
        const quantity = parseFloat(document.getElementById('quantity')?.value) || 0;
        const entryPrice = parseFloat(document.getElementById('entryPrice')?.value) || 0;
        const exitPrice = parseFloat(document.getElementById('exitPrice')?.value) || 0;
        const direction = document.getElementById('direction')?.value;
        const stopLoss = parseFloat(document.getElementById('stopLoss')?.value) || 0;

        if (!quantity || !entryPrice || !exitPrice || !direction) {
            this.updateElement('calcGrossPL', this.formatCurrency(0, this.tradeCurrency));
            this.updateElement('calcNetPL', this.formatCurrency(0, this.tradeCurrency));
            this.updateElement('calcRR', 'N/A');
            this.updateElement('calcReturn', '0.00%');
            return;
        }

        const priceDiff = direction === 'Long' ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
        const grossPL = priceDiff * quantity;
        const netPL = grossPL - (Math.abs(grossPL) * 0.01); // 1% fees
        const returnPct = (netPL / (entryPrice * quantity)) * 100;

        let rrRatio = 'N/A';
        if (stopLoss && stopLoss !== entryPrice) {
            const risk = Math.abs(entryPrice - stopLoss);
            const reward = Math.abs(exitPrice - entryPrice);
            if (risk > 0) rrRatio = `1:${(reward / risk).toFixed(2)}`;
        }

        this.updateElement('calcGrossPL', this.formatCurrency(grossPL, this.tradeCurrency));
        this.updateElement('calcNetPL', this.formatCurrency(netPL, this.tradeCurrency));
        this.updateElement('calcRR', rrRatio);
        this.updateElement('calcReturn', returnPct.toFixed(2) + '%');

        const netPLElement = document.getElementById('calcNetPL');
        if (netPLElement) {
            netPLElement.className = `calc-value ${netPL >= 0 ? 'positive' : 'negative'}`;
        }
    }

    renderAddTrade() {
        const now = new Date();
        const entryDate = document.getElementById('entryDate');
        const exitDate = document.getElementById('exitDate');
        
        if (entryDate && !entryDate.value) {
            entryDate.value = now.toISOString().slice(0, 16);
        }
        if (exitDate && !exitDate.value) {
            const exit = new Date(now.getTime() + 2 * 60 * 60 * 1000);
            exitDate.value = exit.toISOString().slice(0, 16);
        }

        this.updateTradeCurrencyLabels();
        setTimeout(() => this.calculateLivePL(), 100);
    }

    async handleTradeSubmission(event) {
        const submitButton = event.target.querySelector('button[type="submit"]');
        if (submitButton) this.setLoadingState(submitButton, true);

        try {
            const formData = new FormData(event.target);
            const tradeData = Object.fromEntries(formData.entries());

            // Validation
            const requiredFields = ['entryDate', 'exitDate', 'symbol', 'direction', 'quantity', 'entryPrice', 'exitPrice', 'strategy'];
            for (const field of requiredFields) {
                if (!tradeData[field]) {
                    this.showToast(`Please fill: ${field}`, 'error');
                    return;
                }
            }

            if (new Date(tradeData.entryDate) >= new Date(tradeData.exitDate)) {
                this.showToast('Exit date must be after entry date', 'error');
                return;
            }

            await this.saveTrade(tradeData);
            this.showToast('Trade saved successfully! 🎉', 'success');
            
            event.target.reset();
            setTimeout(() => this.showSection('dashboard'), 500);

        } catch (error) {
            console.error('Error saving trade:', error);
            this.showToast('Error saving trade', 'error');
        } finally {
            if (submitButton) this.setLoadingState(submitButton, false);
        }
    }

    async saveTrade(tradeData) {
        if (!this.currentUser) return null;

        try {
            const tradeToSave = {
                user_id: this.currentUser.id,
                entry_date: tradeData.entryDate,
                exit_date: tradeData.exitDate,
                symbol: tradeData.symbol.toUpperCase(),
                direction: tradeData.direction,
                quantity: parseInt(tradeData.quantity),
                entry_price: parseFloat(tradeData.entryPrice),
                exit_price: parseFloat(tradeData.exitPrice),
                stop_loss: tradeData.stopLoss ? parseFloat(tradeData.stopLoss) : null,
                target_price: tradeData.targetPrice ? parseFloat(tradeData.targetPrice) : null,
                strategy: tradeData.strategy,
                notes: tradeData.notes || '',
                setup_quality: parseInt(tradeData.setupQuality) || 7,
                confidence_level: parseInt(tradeData.confidence) || 7,
                exit_reason: tradeData.exitReason || 'Manual Exit',
                exit_emotion: tradeData.exitEmotion || 'Neutral',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Calculate P&L
            const priceDiff = tradeData.direction === 'Long' ? 
                (tradeToSave.exit_price - tradeToSave.entry_price) :
                (tradeToSave.entry_price - tradeToSave.exit_price);
            
            let grossPL = priceDiff * tradeToSave.quantity;
            let netPL = grossPL - (Math.abs(grossPL) * 0.01);

            // Convert to INR if needed
            if (this.tradeCurrency === 'USD') {
                grossPL = this.convertCurrency(grossPL, 'USD', 'INR');
                netPL = this.convertCurrency(netPL, 'USD', 'INR');
            }

            tradeToSave.gross_pl = grossPL;
            tradeToSave.net_pl = netPL;

            // Risk-reward ratio
            if (tradeToSave.stop_loss) {
                const risk = Math.abs(tradeToSave.entry_price - tradeToSave.stop_loss);
                const reward = Math.abs(tradeToSave.exit_price - tradeToSave.entry_price);
                tradeToSave.risk_reward_ratio = risk > 0 ? (reward / risk) : 0;
            } else {
                tradeToSave.risk_reward_ratio = 0;
            }

            const { data, error } = await this.supabase
                .from('trades')
                .insert([tradeToSave])
                .select()
                .single();

            if (error) throw error;
            return data;

        } catch (error) {
            console.error('Error saving trade:', error);
            throw error;
        }
    }

    /* ======================== TRADE DETAILS POPUP ======================== */
    showTradeDetailsPopup(trade) {
        const modal = document.createElement('div');
        modal.className = 'trade-modal-overlay';
        modal.innerHTML = `
            <div class="trade-modal">
                <div class="trade-modal-header">
                    <h3>📊 Trade Details</h3>
                    <button class="trade-modal-close">&times;</button>
                </div>
                <div class="trade-detail-grid">
                    <div class="trade-detail-item">
                        <label>Symbol:</label>
                        <span>${trade.symbol}</span>
                    </div>
                    <div class="trade-detail-item">
                        <label>Direction:</label>
                        <span>${trade.direction}</span>
                    </div>
                    <div class="trade-detail-item">
                        <label>Quantity:</label>
                        <span>${trade.quantity}</span>
                    </div>
                    <div class="trade-detail-item">
                        <label>Entry Price:</label>
                        <span>${this.formatCurrency(trade.entry_price)}</span>
                    </div>
                    <div class="trade-detail-item">
                        <label>Exit Price:</label>
                        <span>${this.formatCurrency(trade.exit_price)}</span>
                    </div>
                    <div class="trade-detail-item">
                        <label>P&L:</label>
                        <span class="${trade.net_pl >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(trade.net_pl)}</span>
                    </div>
                    <div class="trade-detail-item">
                        <label>Strategy:</label>
                        <span>${trade.strategy}</span>
                    </div>
                    <div class="trade-detail-item">
                        <label>Entry Date:</label>
                        <span>${this.formatDate(trade.entry_date)}</span>
                    </div>
                    ${trade.notes ? `
                    <div class="trade-detail-item full-width">
                        <label>Notes:</label>
                        <span>${trade.notes}</span>
                    </div>` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('.trade-modal-close');
        closeBtn.addEventListener('click', () => document.body.removeChild(modal));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) document.body.removeChild(modal);
        });
    }

    /* ======================== HISTORY ======================== */
    async renderHistory() {
        const container = document.getElementById('historyContainer');
        if (!container) return;
        
        container.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const trades = await this.loadTrades();
            
            if (!trades || trades.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p>No trades yet</p>
                        <button class="btn btn--primary" onclick="document.querySelector('[data-section=add-trade]').click()">
                            Add Your First Trade
                        </button>
                    </div>
                `;
                return;
            }

            const stats = this.calculateStats(trades);

            container.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 2rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                    <span>Total: <strong>${trades.length}</strong></span>
                    <span>Win Rate: <strong>${stats.winRate}%</strong></span>
                    <span>P&L: <strong class="${stats.totalPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(stats.totalPL)}</strong></span>
                </div>
                <div style="overflow-x: auto;">
                    <table class="trade-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--bg-secondary);">
                                <th style="padding: 1rem; text-align: left; border: 1px solid var(--border-color);">Date</th>
                                <th style="padding: 1rem; text-align: left; border: 1px solid var(--border-color);">Symbol</th>
                                <th style="padding: 1rem; text-align: left; border: 1px solid var(--border-color);">Direction</th>
                                <th style="padding: 1rem; text-align: left; border: 1px solid var(--border-color);">P&L</th>
                                <th style="padding: 1rem; text-align: left; border: 1px solid var(--border-color);">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${trades.map((trade, index) => `
                                <tr>
                                    <td style="padding: 1rem; border: 1px solid var(--border-color);">${this.formatDate(trade.entry_date)}</td>
                                    <td style="padding: 1rem; border: 1px solid var(--border-color);"><strong>${trade.symbol}</strong></td>
                                    <td style="padding: 1rem; border: 1px solid var(--border-color);">${trade.direction}</td>
                                    <td style="padding: 1rem; border: 1px solid var(--border-color); font-weight: 600;" class="${trade.net_pl >= 0 ? 'positive' : 'negative'}">
                                        ${this.formatCurrency(trade.net_pl)}
                                    </td>
                                    <td style="padding: 1rem; border: 1px solid var(--border-color);">
                                        <button class="btn btn--sm btn--outline view-details-btn" data-trade-index="${index}">
                                            View
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            container.querySelectorAll('.view-details-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.tradeIndex);
                    this.showTradeDetailsPopup(trades[index]);
                });
            });

        } catch (error) {
            console.error('Error rendering history:', error);
            container.innerHTML = '<div class="loading">Error loading history</div>';
        }
    }

    /* ======================== ANALYTICS ======================== */
    async renderAnalytics() {
        try {
            const trades = await this.loadTrades();
            const stats = this.calculateStats(trades);

            this.updateElement('analyticsTotalTrades', stats.totalTrades);
            this.updateElement('analyticsWinRate', stats.winRate + '%');
            this.updateElement('analyticsNetPL', this.formatCurrency(stats.totalPL));

            const netPLElement = document.getElementById('analyticsNetPL');
            if (netPLElement) {
                netPLElement.className = `value ${stats.totalPL >= 0 ? 'positive' : 'negative'}`;
            }

            if (trades.length > 0) {
                this.renderCharts(trades);
            }
        } catch (error) {
            console.error('Error rendering analytics:', error);
        }
    }

    renderCharts(trades) {
        if (!trades || trades.length === 0) return;
        this.destroyCharts();
        setTimeout(() => {
            this.renderPLChart(trades);
            this.renderStrategyChart(trades);
        }, 100);
    }

    renderPLChart(trades) {
        const ctx = document.getElementById('plChart');
        if (!ctx) return;

        try {
            let cumulative = 0;
            const sortedTrades = [...trades].sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));
            
            const data = sortedTrades.map((trade, index) => {
                cumulative += trade.net_pl;
                return { x: index + 1, y: cumulative };
            });

            this.charts.plChart = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Cumulative P&L',
                        data: data,
                        borderColor: '#21808d',
                        backgroundColor: 'rgba(33, 128, 141, 0.1)',
                        fill: true,
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { title: { display: true, text: 'Trades' } },
                        y: { 
                            beginAtZero: true,
                            ticks: { callback: (value) => this.formatCurrency(value) }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error rendering P&L chart:', error);
        }
    }

    renderStrategyChart(trades) {
        const ctx = document.getElementById('strategyChart');
        if (!ctx) return;

        try {
            const strategies = {};
            trades.forEach(trade => {
                const strategy = trade.strategy;
                if (!strategies[strategy]) strategies[strategy] = { total: 0, count: 0 };
                strategies[strategy].total += trade.net_pl;
                strategies[strategy].count++;
            });

            const labels = Object.keys(strategies);
            const data = Object.values(strategies).map(s => s.total);

            this.charts.strategyChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Net P&L',
                        data: data,
                        backgroundColor: data.map(value => value >= 0 ? '#21808d' : '#c0152f')
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: (value) => this.formatCurrency(value) }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error rendering strategy chart:', error);
        }
    }

    destroyCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') chart.destroy();
        });
        this.charts = {};
    }

    /* ======================== AI SUGGESTIONS ======================== */
    async renderAISuggestions() {
        try {
            const trades = await this.loadTrades();
            const aiContents = document.querySelectorAll('.ai-content');
            
            if (trades.length === 0) {
                aiContents.forEach(content => {
                    content.innerHTML = "Start adding trades to unlock AI insights...";
                });
                return;
            }

            const stats = this.calculateStats(trades);
            const suggestions = [
                `Your win rate is ${stats.winRate}%. ${stats.winRate < 50 ? 'Focus on higher-probability setups.' : 'Good performance! Maintain consistency.'}`,
                `Total P&L: ${this.formatCurrency(stats.totalPL)}. ${stats.totalPL > 0 ? 'Keep up the good work!' : 'Review your risk management strategy.'}`
            ];

            aiContents.forEach((content, index) => {
                if (suggestions[index]) content.innerHTML = suggestions[index];
            });
        } catch (error) {
            console.error('Error rendering AI suggestions:', error);
        }
    }

    /* ======================== REPORTS ======================== */
    async renderReports() {
        try {
            const trades = await this.loadTrades();
            
            this.renderCalendar(trades);
            this.renderMonthlyChart(trades);
            
        } catch (error) {
            console.error('Error rendering reports:', error);
        }
    }

    renderCalendar(trades) {
        const calendarContainer = document.getElementById('calendar');
        if (!calendarContainer) return;

        const year = this.currentCalendarDate.getFullYear();
        const month = this.currentCalendarDate.getMonth();
        
        document.getElementById('calendarTitle').textContent = 
            this.currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const dailyPL = {};
        trades.forEach(trade => {
            const tradeDate = new Date(trade.entry_date).toDateString();
            if (!dailyPL[tradeDate]) dailyPL[tradeDate] = 0;
            dailyPL[tradeDate] += trade.net_pl;
        });

        let calendarHTML = `
            <div class="calendar-grid">
                <div class="calendar-header">
                    ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => 
                        `<div class="day-name">${day}</div>`).join('')}
                </div>
                <div class="calendar-body">
        `;

        // Empty cells
        for (let i = 0; i < startingDayOfWeek; i++) {
            calendarHTML += '<div class="calendar-day empty"></div>';
        }

        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateString = date.toDateString();
            const pl = dailyPL[dateString] || 0;
            
            let dayClass = 'calendar-day';
            if (pl > 1000) dayClass += ' profit-high';
            else if (pl > 0) dayClass += ' profit-low';
            else if (pl < -1000) dayClass += ' loss-high';
            else if (pl < 0) dayClass += ' loss-low';
            else dayClass += ' no-trades';
            
            if (date.toDateString() === new Date().toDateString()) {
                dayClass += ' today';
            }

            calendarHTML += `
                <div class="${dayClass}">
                    <div class="day-number">${day}</div>
                    ${pl !== 0 ? `<div class="day-pl">${this.formatCurrency(pl)}</div>` : ''}
                </div>
            `;
        }

        calendarHTML += '</div></div>';
        calendarContainer.innerHTML = calendarHTML;
    }

    renderMonthlyChart(trades) {
        const ctx = document.getElementById('monthlyPLChart');
        if (!ctx) return;

        try {
            const monthlyData = {};
            trades.forEach(trade => {
                const date = new Date(trade.entry_date);
                const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                if (!monthlyData[monthKey]) monthlyData[monthKey] = 0;
                monthlyData[monthKey] += trade.net_pl;
            });

            const sortedMonths = Object.keys(monthlyData).sort();
            const labels = sortedMonths.map(month => {
                const [year, monthNum] = month.split('-');
                return new Date(year, monthNum - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            });
            const data = sortedMonths.map(month => monthlyData[month]);

            this.charts.monthlyChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Monthly P&L',
                        data: data,
                        backgroundColor: data.map(value => value >= 0 ? '#21808d' : '#c0152f')
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: (value) => this.formatCurrency(value) }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error rendering monthly chart:', error);
        }
    }

    changeCalendarMonth(delta) {
        this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + delta);
        this.loadTrades().then(trades => this.renderCalendar(trades));
    }

    /* ======================== EXPORT ======================== */
    async exportCSV() {
        try {
            const trades = await this.loadTrades();
            
            if (trades.length === 0) {
                this.showToast('No data to export', 'warning');
                return;
            }

            let csv = 'data:text/csv;charset=utf-8,';
            csv += 'Entry Date,Exit Date,Symbol,Direction,Quantity,Entry Price,Exit Price,Strategy,P&L,Notes\n';
            
            trades.forEach(trade => {
                csv += [
                    trade.entry_date,
                    trade.exit_date,
                    trade.symbol,
                    trade.direction,
                    trade.quantity,
                    trade.entry_price,
                    trade.exit_price,
                    trade.strategy,
                    trade.net_pl,
                    `"${(trade.notes || '').replace(/"/g, '""')}"`
                ].join(',') + '\n';
            });

            const encodedUri = encodeURI(csv);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `trading-journal-${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showToast('Data exported successfully! 📊', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Error exporting data', 'error');
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new TradingDashboardApp();
    });
} else {
    window.app = new TradingDashboardApp();
}
