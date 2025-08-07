// Enhanced Trading Dashboard Application - Complete Fixed Version
class TradingDashboardApp {
    constructor() {
        // Initialize Supabase client with your credentials
        this.supabaseUrl = 'https://brjomrasrmbyxepjlfdq.supabase.co';
        this.supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyam9tcmFzcm1ieXhlcGpsZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTMwODgsImV4cCI6MjA2OTUyOTA4OH0.51UGb2AE75iE6bPF_mXl_vOBPRB9JiHwFG-7jXyqIrs';
        
        // Initialize Supabase client
        this.supabase = supabase.createClient(this.supabaseUrl, this.supabaseAnonKey);
        
        // Demo users for testing
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
        
        // Initialize the app
        this.init();
    }

    async init() {
        try {
            // Check if user is already logged in
            const { data: { session } } = await this.supabase.auth.getSession();
            
            if (session) {
                this.currentUser = session.user;
                await this.loadUserProfile();
                this.showMainApp();
            } else {
                this.showAuthScreen();
            }

            // Setup auth listeners
            this.setupAuthListeners();
            
            // Listen for auth state changes
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
            console.error('Initialization error:', error);
            this.showToast('Failed to initialize app. Please refresh.', 'error');
        }
    }

    /* ======================== CURRENCY FUNCTIONS ======================== */
    formatCurrency(value, currency = null) {
        const targetCurrency = currency || this.selectedCurrency;
        const convertedValue = this.convertCurrency(value, 'INR', targetCurrency);
        const sign = convertedValue < 0 ? '-' : '';
        const symbol = targetCurrency === 'USD' ? '$' : '₹';
        
        return sign + symbol + Math.abs(convertedValue).toLocaleString(
            targetCurrency === 'USD' ? 'en-US' : 'en-IN', 
            { 
                minimumFractionDigits: 2,
                maximumFractionDigits: 2 
            }
        );
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
                this.showToast(`Display currency changed to ${this.selectedCurrency}`, 'success');
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
            if (element) {
                element.textContent = symbol;
            }
        });
    }

    async updateAllCurrencyDisplays() {
        const activeSection = document.querySelector('.section.active');
        if (activeSection) {
            const sectionId = activeSection.id;
            await this.showSection(sectionId);
        }
    }

    /* ======================== USER PROFILE & DATA ======================== */
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
            console.log('Loading trades for user:', this.currentUser.id);
            
            const enhancedResult = await this.supabase
                .from('enhanced_trades')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('entry_date', { ascending: false });

            if (enhancedResult.data && enhancedResult.data.length > 0) {
                console.log('Found', enhancedResult.data.length, 'enhanced trades');
                return enhancedResult.data;
            }

            const tradesResult = await this.supabase
                .from('trades')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('entry_date', { ascending: false });

            if (tradesResult.error) {
                console.error('Error loading trades:', tradesResult.error);
                return [];
            }

            console.log('Found', tradesResult.data?.length || 0, 'regular trades');
            return tradesResult.data || [];
        } catch (error) {
            console.error('Error in loadTrades:', error);
            return [];
        }
    }

    /* ======================== AUTHENTICATION ======================== */
    setupAuthListeners() {
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.tab));
        });

        const loginForm = document.getElementById('loginFormElement');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLogin(e);
            });
        }

        const signupForm = document.getElementById('signupFormElement');
        if (signupForm) {
            signupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleSignup(e);
            });
        }

        document.querySelectorAll('.demo-login').forEach(btn => {
            btn.addEventListener('click', async () => {
                const username = btn.dataset.username;
                const demoUser = this.demoUsers[username];
                if (demoUser) {
                    await this.loginWithCredentials(demoUser.email, demoUser.password);
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
                    this.showAuthError('login-username-error', 'Username not found. Use email or demo accounts.');
                    return;
                }
            }

            await this.loginWithCredentials(email, password);
            
        } catch (error) {
            console.error('Login error:', error);
            this.showAuthError('login-password-error', 'Login failed. Please try again.');
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
                console.error('Supabase login error:', error);
                if (error.message.includes('Invalid login credentials')) {
                    this.showAuthError('login-password-error', 'Invalid email or password');
                } else {
                    this.showAuthError('login-password-error', error.message);
                }
                return;
            }

            this.showToast('Welcome back!', 'success');
            
        } catch (error) {
            console.error('Login with credentials error:', error);
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
            const { data: existingUser } = await this.supabase
                .from('user_profiles')
                .select('username')
                .eq('username', username)
                .single();

            if (existingUser) {
                this.showAuthError('signup-username-error', 'Username already exists');
                return;
            }

            const { data, error } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        username: username
                    }
                }
            });

            if (error) {
                console.error('Signup error:', error);
                this.showAuthError('signup-email-error', error.message);
                return;
            }

            if (data.user && !data.session) {
                this.showToast('Please check your email to confirm your account', 'info');
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
            this.showAuthError('signup-email-error', 'Signup failed. Please try again.');
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

    /* ======================== UI MANAGEMENT ======================== */
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
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        const quickAddTrade = document.getElementById('quickAddTrade');
        if (quickAddTrade) {
            quickAddTrade.addEventListener('click', () => this.showSection('add-trade'));
        }

        // Daily confidence - Fixed
        const slider = document.getElementById('dailyConfidence');
        const output = document.getElementById('confidenceValue');
        if (slider && output) {
            // Set initial value
            output.textContent = slider.value;
            slider.addEventListener('input', () => {
                output.textContent = slider.value;
            });
        }

        const saveConfidenceBtn = document.getElementById('saveConfidenceBtn');
        if (saveConfidenceBtn) {
            saveConfidenceBtn.addEventListener('click', () => this.saveDailyConfidence());
        }

        // Setup forms
        this.setupAddTradeForm();

        // Export
        const exportBtn = document.getElementById('exportData');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportCSV());
        }

        // Calendar navigation
        const prevMonth = document.getElementById('prevMonth');
        const nextMonth = document.getElementById('nextMonth');
        if (prevMonth) prevMonth.addEventListener('click', () => this.changeCalendarMonth(-1));
        if (nextMonth) nextMonth.addEventListener('click', () => this.changeCalendarMonth(1));

        // Mobile menu
        this.setupMobileMenu();
    }

    setupMobileMenu() {
        const mobileToggle = document.querySelector('.mobile-menu-toggle');
        const navMenu = document.querySelector('.nav-menu');

        if (mobileToggle && navMenu) {
            mobileToggle.addEventListener('click', () => {
                const isActive = navMenu.classList.contains('mobile-active');
                
                if (isActive) {
                    navMenu.classList.remove('mobile-active');
                    mobileToggle.innerHTML = '☰';
                } else {
                    navMenu.classList.add('mobile-active');
                    mobileToggle.innerHTML = '✕';
                }
            });

            document.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', () => {
                    navMenu.classList.remove('mobile-active');
                    mobileToggle.innerHTML = '☰';
                });
            });
        }
    }

    updateUserInfo() {
        const username = this.currentUser?.username || this.currentUser?.email?.split('@')[0] || 'User';
        const nameElement = document.getElementById('currentUserName');
        if (nameElement) {
            nameElement.textContent = username;
        }
    }

    toggleTheme() {
        const html = document.documentElement;
        const current = html.getAttribute('data-color-scheme') || 
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        const next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-color-scheme', next);
        
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
        }
    }

    async showSection(sectionId) {
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(btn => 
            btn.classList.toggle('active', btn.dataset.section === sectionId));
        document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
        
        const section = document.getElementById(sectionId);
        if (section) {
            section.classList.add('active');
        }

        // Load section-specific content
        switch (sectionId) {
            case 'dashboard':
                await this.renderDashboard();
                break;
            case 'add-trade':
                this.renderAddTrade();
                break;
            case 'history':
                await this.renderHistory();
                break;
            case 'analytics':
                await this.renderAnalytics();
                break;
            case 'ai-suggestions':
                await this.renderAISuggestions();
                break;
            case 'reports':
                await this.renderReports();
                break;
        }
    }

    /* ======================== TRADE DETAILS POPUP ======================== */
    showTradeDetailsPopup(trade) {
        const modal = document.createElement('div');
        modal.className = 'trade-modal-overlay';
        modal.innerHTML = `
            <div class="trade-modal">
                <div class="trade-modal-header">
                    <h3>📊 Trade Analysis Details</h3>
                    <button class="trade-modal-close">&times;</button>
                </div>
                <div class="trade-modal-body">
                    <div class="trade-detail-grid">
                        <div class="trade-detail-item">
                            <label>Symbol:</label>
                            <span class="trade-symbol">${trade.symbol}</span>
                        </div>
                        <div class="trade-detail-item">
                            <label>Direction:</label>
                            <span class="trade-direction ${trade.direction.toLowerCase()}">${trade.direction}</span>
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
                        <div class="trade-detail-item">
                            <label>Exit Date:</label>
                            <span>${this.formatDate(trade.exit_date)}</span>
                        </div>
                        ${trade.setup_quality ? `
                        <div class="trade-detail-item">
                            <label>Setup Quality:</label>
                            <span>${trade.setup_quality}/10</span>
                        </div>` : ''}
                        ${trade.exit_reason ? `
                        <div class="trade-detail-item">
                            <label>Exit Reason:</label>
                            <span>${trade.exit_reason}</span>
                        </div>` : ''}
                        ${trade.notes ? `
                        <div class="trade-detail-item full-width">
                            <label>Notes:</label>
                            <span>${trade.notes}</span>
                        </div>` : ''}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('.trade-modal-close');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    /* ======================== HELPER FUNCTIONS ======================== */
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
            if (toast.parentNode) {
                toast.remove();
            }
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

    /* ======================== DASHBOARD ======================== */
    async renderDashboard() {
        try {
            const trades = await this.loadTrades();
            const stats = this.calculateStats(trades);
            
            // Update stats display
            const totalPLElement = document.getElementById('totalPL');
            if (totalPLElement) {
                totalPLElement.textContent = this.formatCurrency(stats.totalPL);
                totalPLElement.className = stats.totalPL >= 0 ? 'positive' : 'negative';
            }
            
            const winRateElement = document.getElementById('winRate');
            if (winRateElement) {
                winRateElement.textContent = stats.winRate + '%';
            }
            
            const totalTradesElement = document.getElementById('totalTrades');
            if (totalTradesElement) {
                totalTradesElement.textContent = stats.totalTrades;
            }
            
            const avgRRElement = document.getElementById('avgRR');
            if (avgRRElement) {
                avgRRElement.textContent = stats.avgRR;
            }

            // Render recent trades
            this.renderRecentTrades(trades.slice(0, 5));
            
        } catch (error) {
            console.error('Error rendering dashboard:', error);
            this.showToast('Error loading dashboard data', 'error');
        }
    }

    calculateStats(trades) {
        if (!trades || trades.length === 0) {
            return {
                totalPL: 0,
                winRate: 0,
                totalTrades: 0,
                avgRR: '1:0',
                bestTrade: 0,
                worstTrade: 0
            };
        }

        const totalPL = trades.reduce((sum, trade) => sum + (trade.net_pl || 0), 0);
        const wins = trades.filter(trade => trade.net_pl > 0).length;
        const winRate = Math.round((wins / trades.length) * 100);
        const bestTrade = Math.max(...trades.map(trade => trade.net_pl));
        const worstTrade = Math.min(...trades.map(trade => trade.net_pl));
        
        const validRR = trades.filter(trade => trade.risk_reward_ratio && trade.risk_reward_ratio > 0);
        const avgRRNum = validRR.length > 0 ? 
            validRR.reduce((sum, trade) => sum + trade.risk_reward_ratio, 0) / validRR.length : 0;

        return {
            totalPL,
            winRate,
            totalTrades: trades.length,
            avgRR: `1:${avgRRNum.toFixed(2)}`,
            bestTrade,
            worstTrade
        };
    }

    renderRecentTrades(trades) {
        const container = document.getElementById('recentTradesList');
        if (!container) return;
        
        if (!trades || trades.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No trades yet. Start by adding your first trade to see it here.</p>
                    <button class="btn btn--primary btn--sm" onclick="document.querySelector('[data-section=add-trade]').click()">
                        Add First Trade
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = trades.map(trade => `
            <div class="trade-item" data-trade-id="${trade.id}" style="cursor: pointer;">
                <div class="trade-info">
                    <div class="trade-symbol">${trade.symbol}</div>
                    <div class="trade-direction ${trade.direction.toLowerCase()}">${trade.direction}</div>
                    <div class="trade-date">${this.formatDate(trade.entry_date)}</div>
                </div>
                <div class="trade-pl ${trade.net_pl >= 0 ? 'positive' : 'negative'}">
                    ${this.formatCurrency(trade.net_pl)}
                </div>
            </div>
        `).join('');

        // Add click listeners for trade details popup
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
            this.showToast('Confidence level saved!', 'success');
            
            const messageContainer = document.getElementById('confidenceMessage');
            if (messageContainer) {
                let messageClass = 'message ';
                let messageText = '';
                
                if (level >= 8) {
                    messageClass += 'success';
                    messageText = 'High confidence! Great day for trading. 🚀';
                } else if (level >= 6) {
                    messageClass += 'success';
                    messageText = 'Good confidence level. Trade with your tested strategies. ✅';
                } else if (level >= 4) {
                    messageClass += 'warning';
                    messageText = 'Moderate confidence. Consider smaller position sizes. ⚠️';
                } else {
                    messageClass += 'warning';
                    messageText = 'Low confidence detected. Maybe take a break or paper trade today. 🛑';
                }
                
                messageContainer.innerHTML = `<div class="${messageClass}">${messageText}</div>`;
            }
            
        } catch (error) {
            console.error('Error saving confidence:', error);
            this.showToast('Error saving confidence level', 'error');
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
                }], {
                    onConflict: 'user_id,date'
                });

            if (error) {
                console.error('Error saving confidence:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Error in saveConfidence:', error);
            throw error;
        }
    }

    /* ======================== ADD TRADE FORM ======================== */
    setupAddTradeForm() {
        const form = document.getElementById('addTradeForm');
        if (!form) return;
        
        // Setup range input outputs for all sliders
        const ranges = ['setupQuality', 'setupConfidence', 'stressLevel', 'sleepQuality', 'physicalCondition', 'mentalClarity'];
        
        ranges.forEach(id => {
            const input = document.getElementById(id);
            const output = document.getElementById(id + 'Output');
            if (input && output) {
                // Set initial value
                output.textContent = input.value;
                input.addEventListener('input', () => {
                    output.textContent = input.value;
                });
            }
        });

        // Live P&L calculator
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

        const priceDiff = direction === 'Long' ? 
            (exitPrice - entryPrice) : (entryPrice - exitPrice);
        
        const grossPL = priceDiff * quantity;
        const netPL = grossPL - (Math.abs(grossPL) * 0.01);
        const returnPct = (netPL / (entryPrice * quantity)) * 100;

        let rrRatio = 'N/A';
        if (stopLoss && stopLoss !== entryPrice) {
            const risk = Math.abs(entryPrice - stopLoss);
            const reward = Math.abs(exitPrice - entryPrice);
            if (risk > 0) {
                rrRatio = `1:${(reward / risk).toFixed(2)}`;
            }
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
        // Set default dates
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
        if (submitButton) {
            this.setLoadingState(submitButton, true);
        }

        try {
            const formData = new FormData(event.target);
            const tradeData = this.extractTradeData(formData);

            console.log('Extracted trade data:', tradeData);

            const requiredFields = ['entryDate', 'exitDate', 'symbol', 'direction', 'quantity', 
                                  'entryPrice', 'exitPrice', 'strategy'];
            
            for (const field of requiredFields) {
                if (!tradeData[field]) {
                    this.showToast(`Please fill in ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`, 'error');
                    return;
                }
            }

            if (new Date(tradeData.entryDate) >= new Date(tradeData.exitDate)) {
                this.showToast('Exit date must be after entry date', 'error');
                return;
            }

            if (parseFloat(tradeData.entryPrice) <= 0 || parseFloat(tradeData.exitPrice) <= 0) {
                this.showToast('Entry and exit prices must be positive', 'error');
                return;
            }

            const savedTrade = await this.saveTrade(tradeData);
            console.log('Trade saved successfully:', savedTrade);

            this.showToast('Trade saved successfully! 🎉', 'success');
            
            event.target.reset();
            
            setTimeout(() => {
                this.showSection('dashboard');
            }, 500);

        } catch (error) {
            console.error('Error saving trade:', error);
            this.showToast(`Error saving trade: ${error.message}`, 'error');
        } finally {
            if (submitButton) {
                this.setLoadingState(submitButton, false);
            }
        }
    }

    extractTradeData(formData) {
        return Object.fromEntries(formData.entries());
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
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Calculate P&L
            const priceDiff = tradeData.direction === 'Long' ? 
                (tradeToSave.exit_price - tradeToSave.entry_price) :
                (tradeToSave.entry_price - tradeToSave.exit_price);
            
            let grossPL = priceDiff * tradeToSave.quantity;
            let netPL = grossPL - (Math.abs(grossPL) * 0.01);

            // Convert to INR if trade currency is USD
            if (this.tradeCurrency === 'USD') {
                grossPL = this.convertCurrency(grossPL, 'USD', 'INR');
                netPL = this.convertCurrency(netPL, 'USD', 'INR');
            }

            tradeToSave.gross_pl = grossPL;
            tradeToSave.net_pl = netPL;

            // Calculate risk-reward ratio
            if (tradeToSave.stop_loss) {
                const risk = Math.abs(tradeToSave.entry_price - tradeToSave.stop_loss);
                const reward = Math.abs(tradeToSave.exit_price - tradeToSave.entry_price);
                tradeToSave.risk_reward_ratio = risk > 0 ? (reward / risk) : 0;
            } else {
                tradeToSave.risk_reward_ratio = 0;
            }

            // Enhanced fields
            const enhancedData = {
                ...tradeToSave,
                setup_quality: parseInt(tradeData.setupQuality) || 7,
                market_condition: tradeData.marketCondition || null,
                setup_confidence: parseInt(tradeData.setupConfidence) || 7,
                entry_trigger: tradeData.entryTrigger || null,
                stress_level: parseInt(tradeData.stressLevel) || 3,
                exit_reason: tradeData.exitReason || null,
                exit_emotion: tradeData.exitEmotion || null,
                sleep_quality: parseInt(tradeData.sleepQuality) || 7,
                physical_condition: parseInt(tradeData.physicalCondition) || 7,
                mental_clarity: parseInt(tradeData.mentalClarity) || 7
            };

            console.log('Attempting to save enhanced trade:', enhancedData);

            const { data: enhancedResult, error: enhancedError } = await this.supabase
                .from('enhanced_trades')
                .insert([enhancedData])
                .select()
                .single();

            if (!enhancedError && enhancedResult) {
                console.log('Successfully saved to enhanced_trades:', enhancedResult);
                return enhancedResult;
            }

            console.log('Enhanced trades failed, trying regular trades table:', enhancedError);

            // Fallback to regular trades table
            const regularData = {
                ...tradeToSave,
                confidence_level: parseInt(tradeData.setupConfidence) || 7,
                market_sentiment: tradeData.marketCondition || 'Neutral',
                exit_emotion: tradeData.exitEmotion || 'Neutral',
                setup_quality: parseInt(tradeData.setupQuality) || 7,
                sleep_quality: parseInt(tradeData.sleepQuality) || 7,
                physical_condition: parseInt(tradeData.physicalCondition) || 7,
                mental_clarity: parseInt(tradeData.mentalClarity) || 7,
                exit_reason: tradeData.exitReason || 'Manual Exit'
            };

            const { data: regularResult, error: regularError } = await this.supabase
                .from('trades')
                .insert([regularData])
                .select()
                .single();

            if (regularError) {
                console.error('Error saving to trades table:', regularError);
                throw regularError;
            }

            console.log('Successfully saved to trades table:', regularResult);
            return regularResult;

        } catch (error) {
            console.error('Error in saveTrade:', error);
            throw error;
        }
    }

    /* ======================== HISTORY ======================== */
    async renderHistory() {
        const container = document.getElementById('historyContainer');
        if (!container) return;
        
        container.innerHTML = '<div class="loading">Loading trade history...</div>';

        try {
            const trades = await this.loadTrades();
            
            if (!trades || trades.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p>No trade history available</p>
                        <p>Your trades will appear here once you start adding them</p>
                        <button class="btn btn--primary" onclick="document.querySelector('[data-section=add-trade]').click()">
                            Add Your First Trade
                        </button>
                    </div>
                `;
                return;
            }

            const stats = this.calculateStats(trades);

            container.innerHTML = `
                <div class="history-controls">
                    <div class="history-stats">
                        <span>Total Trades: <strong>${trades.length}</strong></span>
                        <span>Win Rate: <strong>${stats.winRate}%</strong></span>
                        <span>Total P&L: <strong class="${stats.totalPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(stats.totalPL)}</strong></span>
                    </div>
                </div>
                <div class="history-table-container">
                    <table class="trade-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Symbol</th>
                                <th>Direction</th>
                                <th>Quantity</th>
                                <th>Entry</th>
                                <th>Exit</th>
                                <th>P&L</th>
                                <th>Strategy</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${trades.map((trade, index) => `
                                <tr>
                                    <td data-label="Date">${this.formatDate(trade.entry_date)}</td>
                                    <td data-label="Symbol"><strong>${trade.symbol}</strong></td>
                                    <td data-label="Direction">
                                        <span class="trade-direction ${trade.direction.toLowerCase()}">${trade.direction}</span>
                                    </td>
                                    <td data-label="Quantity">${trade.quantity}</td>
                                    <td data-label="Entry">${this.formatCurrency(trade.entry_price)}</td>
                                    <td data-label="Exit">${this.formatCurrency(trade.exit_price)}</td>
                                    <td data-label="P&L" class="${trade.net_pl >= 0 ? 'positive' : 'negative'}">
                                        <strong>${this.formatCurrency(trade.net_pl)}</strong>
                                    </td>
                                    <td data-label="Strategy">${trade.strategy}</td>
                                    <td data-label="Actions">
                                        <button class="btn btn--sm btn--outline view-details-btn" data-trade-index="${index}">
                                            👁️ View
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            container.querySelectorAll('.view-details-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(btn.dataset.tradeIndex);
                    this.showTradeDetailsPopup(trades[index]);
                });
            });

        } catch (error) {
            console.error('Error rendering history:', error);
            container.innerHTML = '<div class="loading">Error loading trade history</div>';
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
            this.updateElement('analyticsBestTrade', this.formatCurrency(stats.bestTrade));
            this.updateElement('analyticsWorstTrade', this.formatCurrency(stats.worstTrade));
            this.updateElement('analyticsAvgRR', stats.avgRR);

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
            
            const data = sortedTrades.map(trade => {
                cumulative += trade.net_pl;
                return {
                    x: new Date(trade.entry_date),
                    y: cumulative
                };
            });

            this.charts.plChart = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Cumulative P&L',
                        data: data,
                        borderColor: 'rgba(33, 128, 141, 1)',
                        backgroundColor: 'rgba(33, 128, 141, 0.1)',
                        fill: true,
                        tension: 0.1
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
                        x: {
                            type: 'time',
                            time: {
                                displayFormats: {
                                    day: 'MMM dd'
                                }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: (value) => {
                                    return this.formatCurrency(value);
                                }
                            }
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
                if (!strategies[strategy]) {
                    strategies[strategy] = { total: 0, count: 0 };
                }
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
                        label: 'Net P&L by Strategy',
                        data: data,
                        backgroundColor: data.map(value => 
                            value >= 0 ? 'rgba(33, 128, 141, 0.8)' : 'rgba(192, 21, 47, 0.8)')
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
                            ticks: {
                                callback: (value) => {
                                    return this.formatCurrency(value);
                                }
                            }
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
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        this.charts = {};
    }

    /* ======================== AI SUGGESTIONS ======================== */
    async renderAISuggestions() {
        try {
            const trades = await this.loadTrades();
            this.generateAISuggestions(trades);
        } catch (error) {
            console.error('Error rendering AI suggestions:', error);
        }
    }

    generateAISuggestions(trades) {
        const aiContents = document.querySelectorAll('.ai-content');
        
        if (trades.length === 0) {
            aiContents.forEach(content => {
                content.innerHTML = "Start adding trades to unlock AI insights based on your trading patterns and performance.";
            });
            return;
        }

        const suggestions = [
            this.getSetupQualityAnalysis(trades),
            this.getTradeManagementInsights(trades),
            this.getEntryExitAnalysis(trades),
            this.getPerformanceOptimization(trades)
        ];

        aiContents.forEach((content, index) => {
            if (suggestions[index]) {
                content.innerHTML = suggestions[index];
            }
        });
    }

    getSetupQualityAnalysis(trades) {
        const setupQualityTrades = trades.filter(t => t.setup_quality || t.confidence_level);
        
        if (setupQualityTrades.length < 3) {
            return "Add more trades with setup quality ratings to get detailed analysis.";
        }

        const avgSetupQuality = setupQualityTrades.reduce((sum, t) => sum + (t.setup_quality || t.confidence_level), 0) / setupQualityTrades.length;
        const highQualityTrades = setupQualityTrades.filter(t => (t.setup_quality || t.confidence_level) >= 8);
        
        if (highQualityTrades.length > 0) {
            const highQualityWinRate = (highQualityTrades.filter(t => t.net_pl > 0).length / highQualityTrades.length) * 100;
            return `Your average setup quality is ${avgSetupQuality.toFixed(1)}/10. High-quality setups (8+) have a ${highQualityWinRate.toFixed(0)}% win rate. ${highQualityWinRate > 70 ? 'Focus on high-quality setups!' : 'Improve setup selection.'}`;
        }

        return `Your average setup quality is ${avgSetupQuality.toFixed(1)}/10. Focus on improving setup analysis and waiting for higher-probability entries.`;
    }

    getTradeManagementInsights(trades) {
        return "Continue tracking trades to get insights on your trade management and emotional control patterns.";
    }

    getEntryExitAnalysis(trades) {
        return "Build more trading history to analyze your entry and exit timing effectiveness.";
    }

    getPerformanceOptimization(trades) {
        if (trades.length < 5) {
            return "Add more trades to unlock performance optimization recommendations.";
        }

        const stats = this.calculateStats(trades);
        let optimization = `Current win rate: ${stats.winRate}%. `;
        
        if (stats.winRate < 50) {
            optimization += "Focus on higher-probability setups to improve your win rate.";
        } else {
            optimization += "Good win rate! Focus on maintaining consistency.";
        }

        return optimization;
    }

    /* ======================== REPORTS ======================== */
    async renderReports() {
        try {
            const trades = await this.loadTrades();
            
            this.renderCalendar(trades);
            this.generateReports(trades);
            this.renderReportsCharts(trades);
            
        } catch (error) {
            console.error('Error rendering reports:', error);
        }
    }

    renderCalendar(trades) {
        const calendarTitle = document.getElementById('calendarTitle');
        const calendarContainer = document.getElementById('calendar');
        
        if (!calendarContainer) return;

        const year = this.currentCalendarDate.getFullYear();
        const month = this.currentCalendarDate.getMonth();
        
        if (calendarTitle) {
            calendarTitle.textContent = `P&L Calendar - ${this.currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
        }

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const dailyPL = {};
        trades.forEach(trade => {
            const tradeDate = new Date(trade.entry_date).toDateString();
            if (!dailyPL[tradeDate]) {
                dailyPL[tradeDate] = 0;
            }
            dailyPL[tradeDate] += trade.net_pl;
        });

        let calendarHTML = `
            <div class="calendar-grid">
                <div class="calendar-header">
                    <div class="day-name">Sun</div>
                    <div class="day-name">Mon</div>
                    <div class="day-name">Tue</div>
                    <div class="day-name">Wed</div>
                    <div class="day-name">Thu</div>
                    <div class="day-name">Fri</div>
                    <div class="day-name">Sat</div>
                </div>
                <div class="calendar-body">
        `;

        // Empty cells for days before the first day of the month
        for (let i = 0; i < startingDayOfWeek; i++) {
            calendarHTML += '<div class="calendar-day empty"></div>';
        }

        // Days of the month
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
                <div class="${dayClass}" title="${pl !== 0 ? this.formatCurrency(pl) : 'No trades'}">
                    <div class="day-number">${day}</div>
                    ${pl !== 0 ? `<div class="day-pl">${this.formatCurrency(pl)}</div>` : ''}
                </div>
            `;
        }

        calendarHTML += `
                </div>
            </div>
        `;

        calendarContainer.innerHTML = calendarHTML;
    }

    renderReportsCharts(trades) {
        if (!trades || trades.length === 0) return;

        Object.keys(this.charts).forEach(key => {
            if (key.includes('report') && this.charts[key] && typeof this.charts[key].destroy === 'function') {
                this.charts[key].destroy();
                delete this.charts[key];
            }
        });

        setTimeout(() => {
            this.renderMonthlyPLChart(trades);
            this.renderWinLossChart(trades);
        }, 100);
    }

    renderMonthlyPLChart(trades) {
        const ctx = document.getElementById('monthlyPLChart');
        if (!ctx) return;

        try {
            const monthlyData = {};
            trades.forEach(trade => {
                const date = new Date(trade.entry_date);
                const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = 0;
                }
                monthlyData[monthKey] += trade.net_pl;
            });

            const sortedMonths = Object.keys(monthlyData).sort();
            const labels = sortedMonths.map(month => {
                const [year, monthNum] = month.split('-');
                return new Date(year, monthNum - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            });
            const data = sortedMonths.map(month => monthlyData[month]);

            this.charts.reportMonthlyPL = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Monthly P&L',
                        data: data,
                        backgroundColor: data.map(value => 
                            value >= 0 ? 'rgba(33, 128, 141, 0.8)' : 'rgba(192, 21, 47, 0.8)')
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
                            ticks: {
                                callback: (value) => this.formatCurrency(value)
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error rendering monthly P&L chart:', error);
        }
    }

    renderWinLossChart(trades) {
        const ctx = document.getElementById('winLossChart');
        if (!ctx) return;

        try {
            const wins = trades.filter(t => t.net_pl > 0).length;
            const losses = trades.filter(t => t.net_pl < 0).length;
            const breakeven = trades.filter(t => t.net_pl === 0).length;

            this.charts.reportWinLoss = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Wins', 'Losses', 'Breakeven'],
                    datasets: [{
                        data: [wins, losses, breakeven],
                        backgroundColor: [
                            'rgba(33, 128, 141, 0.8)',
                            'rgba(192, 21, 47, 0.8)',
                            'rgba(128, 128, 128, 0.8)'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error rendering win/loss chart:', error);
        }
    }

    changeCalendarMonth(delta) {
        this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + delta);
        
        this.loadTrades().then(trades => {
            this.renderCalendar(trades);
        });
    }

    generateReports(trades) {
        this.generateWeeklyReport(trades);
        this.generateMonthlyReport(trades);
        this.generateStrategyReport(trades);
        this.generateEmotionalReport(trades);
    }

    generateWeeklyReport(trades) {
        const container = document.getElementById('weeklyReport');
        if (!container) return;

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const weeklyTrades = trades.filter(trade => 
            new Date(trade.entry_date) >= oneWeekAgo
        );

        if (weeklyTrades.length === 0) {
            container.innerHTML = `
                <div class="report-item">
                    <span class="report-label">Status:</span>
                    <span class="report-value">No trades in the past week</span>
                </div>
            `;
            return;
        }

        const stats = this.calculateStats(weeklyTrades);
        container.innerHTML = `
            <div class="report-item">
                <span class="report-label">Trades:</span>
                <span class="report-value">${stats.totalTrades}</span>
            </div>
            <div class="report-item">
                <span class="report-label">P&L:</span>
                <span class="report-value ${stats.totalPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(stats.totalPL)}</span>
            </div>
            <div class="report-item">
                <span class="report-label">Win Rate:</span>
                <span class="report-value">${stats.winRate}%</span>
            </div>
        `;
    }

    generateMonthlyReport(trades) {
        const container = document.getElementById('monthlyReport');
        if (!container) return;

        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const monthlyTrades = trades.filter(trade => 
            new Date(trade.entry_date) >= oneMonthAgo
        );

        if (monthlyTrades.length === 0) {
            container.innerHTML = `
                <div class="report-item">
                    <span class="report-label">Status:</span>
                    <span class="report-value">No trades in the past month</span>
                </div>
            `;
            return;
        }

        const stats = this.calculateStats(monthlyTrades);
        container.innerHTML = `
            <div class="report-item">
                <span class="report-label">Trades:</span>
                <span class="report-value">${stats.totalTrades}</span>
            </div>
            <div class="report-item">
                <span class="report-label">P&L:</span>
                <span class="report-value ${stats.totalPL >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(stats.totalPL)}</span>
            </div>
            <div class="report-item">
                <span class="report-label">Win Rate:</span>
                <span class="report-value">${stats.winRate}%</span>
            </div>
        `;
    }

    generateStrategyReport(trades) {
        const container = document.getElementById('strategyReport');
        if (!container) return;

        if (trades.length === 0) {
            container.innerHTML = `
                <div class="report-item">
                    <span class="report-label">Status:</span>
                    <span class="report-value">No strategy data available</span>
                </div>
            `;
            return;
        }

        // Find most used strategy
        const strategies = {};
        trades.forEach(trade => {
            if (!strategies[trade.strategy]) {
                strategies[trade.strategy] = { count: 0, profit: 0 };
            }
            strategies[trade.strategy].count++;
            strategies[trade.strategy].profit += trade.net_pl;
        });

        const topStrategy = Object.entries(strategies)
            .sort(([,a], [,b]) => b.count - a.count)[0];

        if (topStrategy) {
            const [strategy, data] = topStrategy;
            container.innerHTML = `
                <div class="report-item">
                    <span class="report-label">Most Used:</span>
                    <span class="report-value">${strategy}</span>
                </div>
                <div class="report-item">
                    <span class="report-label">Times Used:</span>
                    <span class="report-value">${data.count}</span>
                </div>
                <div class="report-item">
                    <span class="report-label">Total P&L:</span>
                    <span class="report-value ${data.profit >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(data.profit)}</span>
                </div>
            `;
        }
    }

    generateEmotionalReport(trades) {
        const container = document.getElementById('emotionalReport');
        if (!container) return;

        const emotionalTrades = trades.filter(t => t.exit_emotion);
        
        if (emotionalTrades.length === 0) {
            container.innerHTML = `
                <div class="report-item">
                    <span class="report-label">Status:</span>
                    <span class="report-value">No emotional data available</span>
                </div>
            `;
            return;
        }

        const emotions = {};
        emotionalTrades.forEach(trade => {
            if (!emotions[trade.exit_emotion]) {
                emotions[trade.exit_emotion] = { count: 0, profit: 0 };
            }
            emotions[trade.exit_emotion].count++;
            emotions[trade.exit_emotion].profit += trade.net_pl;
        });

        const topEmotion = Object.entries(emotions)
            .sort(([,a], [,b]) => b.count - a.count)[0];

        if (topEmotion) {
            const [emotion, data] = topEmotion;
            container.innerHTML = `
                <div class="report-item">
                    <span class="report-label">Most Common:</span>
                    <span class="report-value">${emotion}</span>
                </div>
                <div class="report-item">
                    <span class="report-label">Frequency:</span>
                    <span class="report-value">${data.count} trades</span>
                </div>
                <div class="report-item">
                    <span class="report-label">Avg P&L:</span>
                    <span class="report-value ${data.profit >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(data.profit / data.count)}</span>
                </div>
            `;
        }
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
            
            csv += 'TRADE ANALYSIS DATA\n';
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
            
            this.showToast('Trade data exported successfully! 📊', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Error exporting data', 'error');
        }
    }

    /* ======================== UTILITY METHODS ======================== */
    updateElement(id, content) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = content;
        }
    }
}

// Initialize the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new TradingDashboardApp();
    });
} else {
    window.app = new TradingDashboardApp();
}
