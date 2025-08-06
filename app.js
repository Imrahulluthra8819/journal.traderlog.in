// Enhanced Trading Dashboard Application with Comprehensive Trade Analysis
// Updated to handle new trade analysis segments and improved AI suggestions

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

    /* ======================== USER PROFILE & DATA ======================== */

    async loadUserProfile() {
        if (!this.currentUser) return;

        try {
            const { data, error } = await this.supabase
                .from('user_profiles')
                .select('username, full_name')
                .eq('user_id', this.currentUser.id)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                console.error('Error loading user profile:', error);
                return;
            }

            if (!data) {
                // Create default profile
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
                this.showToast('Error loading trades', 'error');
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error in loadTrades:', error);
            return [];
        }
    }

    async loadConfidenceEntries() {
        if (!this.currentUser) return [];

        try {
            const { data, error } = await this.supabase
                .from('confidence_entries')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('date', { ascending: false });

            if (error) {
                console.error('Error loading confidence entries:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error in loadConfidenceEntries:', error);
            return [];
        }
    }

    /* ======================== AUTHENTICATION ======================== */

    setupAuthListeners() {
        // Switch between login and signup tabs
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.tab));
        });

        // Login form handler
        const loginForm = document.getElementById('loginFormElement');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLogin(e);
            });
        }

        // Signup form handler
        const signupForm = document.getElementById('signupFormElement');
        if (signupForm) {
            signupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleSignup(e);
            });
        }

        // Demo login buttons
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
            // Check if identifier is email or username
            const isEmail = identifier.includes('@');
            let email = identifier;

            // If username provided, convert to email for demo users
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

            // Success is handled by auth state change listener
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
            // Check if username already exists
            const { data: existingUser } = await this.supabase
                .from('user_profiles')
                .select('username')
                .eq('username', username)
                .single();

            if (existingUser) {
                this.showAuthError('signup-username-error', 'Username already exists');
                return;
            }

            // Sign up user
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

            // Create user profile if user was created successfully
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

        // Daily confidence
        const slider = document.getElementById('dailyConfidence');
        const output = document.getElementById('confidenceValue');
        if (slider && output) {
            slider.addEventListener('input', () => (output.textContent = slider.value));
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

    /* ======================== HELPER FUNCTIONS ======================== */

    formatCurrency(value) {
        const sign = value < 0 ? '-' : '';
        return sign + '₹' + Math.abs(value).toLocaleString('en-IN', { 
            minimumFractionDigits: 2,
            maximumFractionDigits: 2 
        });
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: '2-digit'
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
            toast.remove();
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
            <div class="trade-item">
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
    }

    async saveDailyConfidence() {
        const slider = document.getElementById('dailyConfidence');
        if (!slider) return;
        
        const level = slider.value;
        const today = new Date().toISOString().split('T')[0];

        try {
            await this.saveConfidence(today, level);
            this.showToast('Confidence level saved!', 'success');
            
            // Show confidence message
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

    /* ======================== ENHANCED ADD TRADE FORM ======================== */

    setupAddTradeForm() {
        const form = document.getElementById('addTradeForm');
        if (!form) return;
        
        // Setup range input outputs for all sliders
        const ranges = ['setupQuality', 'setupConfidence', 'stressLevel', 'emotionsManaged', 
                       'planAdherence', 'sleepQuality', 'physicalCondition', 'mentalClarity', 
                       'fomoLevel', 'distractionLevel'];
        
        ranges.forEach(id => {
            const input = document.getElementById(id);
            const output = document.getElementById(id + 'Output');
            if (input && output) {
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
            await this.handleEnhancedTradeSubmission(e);
        });
    }

    setupLivePLCalculator() {
        // Get calculation elements
        const fields = ['quantity', 'entryPrice', 'exitPrice', 'direction', 'stopLoss'];
        
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
            return;
        }

        // Calculate P&L
        const priceDiff = direction === 'Long' ? 
            (exitPrice - entryPrice) : (entryPrice - exitPrice);
        
        const grossPL = priceDiff * quantity;
        const netPL = grossPL - (Math.abs(grossPL) * 0.01); // 1% fees estimate
        const returnPct = (netPL / (entryPrice * quantity)) * 100;

        // Calculate R:R ratio
        let rrRatio = 'N/A';
        if (stopLoss && stopLoss !== entryPrice) {
            const risk = Math.abs(entryPrice - stopLoss);
            const reward = Math.abs(exitPrice - entryPrice);
            if (risk > 0) {
                rrRatio = `1:${(reward / risk).toFixed(2)}`;
            }
        }

        // Update display
        this.updateElement('calcGrossPL', this.formatCurrency(grossPL));
        this.updateElement('calcNetPL', this.formatCurrency(netPL));
        this.updateElement('calcRR', rrRatio);
        this.updateElement('calcReturn', returnPct.toFixed(2) + '%');

        // Add color classes
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

        // Calculate initial P&L
        setTimeout(() => this.calculateLivePL(), 100);
    }

    async handleEnhancedTradeSubmission(event) {
        const submitButton = event.target.querySelector('button[type="submit"]');
        if (submitButton) {
            this.setButtonLoading(submitButton, true);
        }

        try {
            const formData = new FormData(event.target);
            const tradeData = this.extractEnhancedTradeData(formData);

            // Basic validation
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

            await this.saveEnhancedTrade(tradeData);
            this.showToast('Trade analysis saved successfully! 🎉', 'success');
            
            event.target.reset();
            this.showSection('dashboard');

        } catch (error) {
            console.error('Error saving enhanced trade:', error);
            this.showToast('Error saving trade. Please try again.', 'error');
        } finally {
            if (submitButton) {
                this.setButtonLoading(submitButton, false);
            }
        }
    }

    extractEnhancedTradeData(formData) {
        const data = Object.fromEntries(formData.entries());
        
        // Handle checkboxes and radio buttons
        const checkboxGroups = ['confluenceFactors', 'adjustmentsMade', 'lessonsLearned'];
        checkboxGroups.forEach(group => {
            const values = formData.getAll(group);
            data[group] = values.join(', ');
        });

        // Get radio button value
        const radioButtons = document.querySelectorAll('input[name="wouldRepeat"]:checked');
        if (radioButtons.length > 0) {
            data.wouldRepeat = radioButtons[0].value;
        }

        return data;
    }
    async saveEnhancedTrade(tradeData) {
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
                exit_reason: tradeData.exitReason,
                notes: tradeData.notes || '',

                // Enhanced analysis fields
                setup_quality: parseInt(tradeData.setupQuality) || 7,
                market_condition: tradeData.marketCondition,
                confluence_factors: tradeData.confluenceFactors || '',
                risk_reward_planned: tradeData.riskRewardPlanned,
                setup_confidence: parseInt(tradeData.setupConfidence) || 7,
                entry_trigger: tradeData.entryTrigger,
                
                position_sizing_method: tradeData.positionSizing,
                stress_level: parseInt(tradeData.stressLevel) || 3,
                monitoring_frequency: tradeData.monitoringFreq,
                adjustments_made: tradeData.adjustmentsMade || '',
                emotions_managed: parseInt(tradeData.emotionsManaged) || 7,
                plan_adherence: parseInt(tradeData.planAdherence) || 8,
                
                entry_timing_quality: tradeData.entryTiming,
                exit_timing_quality: tradeData.exitTiming,
                exit_emotion: tradeData.exitEmotion,
                lessons_learned: tradeData.lessonsLearned || '',
                would_repeat: tradeData.wouldRepeat || 'Maybe',
                
                // Psychology fields (cleaned up)
                sleep_quality: parseInt(tradeData.sleepQuality) || 7,
                physical_condition: parseInt(tradeData.physicalCondition) || 7,
                mental_clarity: parseInt(tradeData.mentalClarity) || 7,
                fomo_level: parseInt(tradeData.fomoLevel) || 3,
                overall_mood: tradeData.overallMood,
                distraction_level: parseInt(tradeData.distractionLevel) || 3,

                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Calculate P&L
            const priceDiff = tradeData.direction === 'Long' ? 
                (tradeToSave.exit_price - tradeToSave.entry_price) :
                (tradeToSave.entry_price - tradeToSave.exit_price);
            
            tradeToSave.gross_pl = priceDiff * tradeToSave.quantity;
            tradeToSave.net_pl = tradeToSave.gross_pl - (Math.abs(tradeToSave.gross_pl) * 0.01);

            // Calculate risk-reward ratio
            if (tradeToSave.stop_loss) {
                const risk = Math.abs(tradeToSave.entry_price - tradeToSave.stop_loss);
                const reward = Math.abs(tradeToSave.exit_price - tradeToSave.entry_price);
                tradeToSave.risk_reward_ratio = risk > 0 ? (reward / risk) : 0;
            } else {
                tradeToSave.risk_reward_ratio = 0;
            }

            const { data, error } = await this.supabase
                .from('enhanced_trades')
                .insert([tradeToSave])
                .select()
                .single();

            if (error) {
                console.error('Error saving enhanced trade:', error);
                // Fall back to regular trades table if enhanced doesn't exist
                const { data: fallbackData, error: fallbackError } = await this.supabase
                    .from('trades')
                    .insert([{
                        ...tradeToSave,
                        // Map some enhanced fields to existing fields
                        confidence_level: tradeToSave.setup_confidence,
                        market_sentiment: tradeToSave.market_condition,
                        pre_stress: tradeToSave.stress_level,
                        stress_during: tradeToSave.stress_level,
                        position_comfort: tradeToSave.emotions_managed,
                        primary_exit_reason: tradeToSave.exit_reason,
                        would_take_again: tradeToSave.would_repeat
                    }])
                    .select()
                    .single();

                if (fallbackError) {
                    throw fallbackError;
                }
                return fallbackData;
            }

            return data;
        } catch (error) {
            console.error('Error in saveEnhancedTrade:', error);
            throw error;
        }
    }

    setButtonLoading(button, loading) {
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

    /* ======================== TRADE HISTORY ======================== */

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
                        <p>Your comprehensive trade analysis will appear here once you start adding trades</p>
                        <button class="btn btn--primary" onclick="document.querySelector('[data-section=add-trade]').click()">
                            Add Your First Trade Analysis
                        </button>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
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
                            <th>Setup Quality</th>
                            <th>R:R</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${trades.map(trade => `
                            <tr>
                                <td data-label="Date">${this.formatDate(trade.entry_date)}</td>
                                <td data-label="Symbol"><strong>${trade.symbol}</strong></td>
                                <td data-label="Direction">
                                    <span class="trade-direction ${trade.direction.toLowerCase()}">${trade.direction}</span>
                                </td>
                                <td data-label="Quantity">${trade.quantity}</td>
                                <td data-label="Entry">₹${trade.entry_price}</td>
                                <td data-label="Exit">₹${trade.exit_price}</td>
                                <td data-label="P&L" class="${trade.net_pl >= 0 ? 'positive' : 'negative'}">
                                    <strong>${this.formatCurrency(trade.net_pl)}</strong>
                                </td>
                                <td data-label="Strategy">${trade.strategy}</td>
                                <td data-label="Setup Quality">${trade.setup_quality || trade.confidence_level || 'N/A'}/10</td>
                                <td data-label="R:R">${trade.risk_reward_ratio ? `1:${trade.risk_reward_ratio.toFixed(2)}` : 'N/A'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
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

            // Update analytics stats
            this.updateElement('analyticsTotalTrades', stats.totalTrades);
            this.updateElement('analyticsWinRate', stats.winRate + '%');
            this.updateElement('analyticsNetPL', this.formatCurrency(stats.totalPL));
            this.updateElement('analyticsBestTrade', this.formatCurrency(stats.bestTrade));
            this.updateElement('analyticsWorstTrade', this.formatCurrency(stats.worstTrade));
            this.updateElement('analyticsAvgRR', stats.avgRR);

            // Add color classes
            const netPLElement = document.getElementById('analyticsNetPL');
            if (netPLElement) {
                netPLElement.className = `value ${stats.totalPL >= 0 ? 'positive' : 'negative'}`;
            }

            // Render charts if we have data
            if (trades.length > 0) {
                this.renderCharts(trades);
            }
        } catch (error) {
            console.error('Error rendering analytics:', error);
        }
    }

    renderCharts(trades) {
        // Only render charts if we have trade data
        if (!trades || trades.length === 0) return;

        // Destroy existing charts
        this.destroyCharts();

        // Render new charts
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
                                callback: function(value) {
                                    return '₹' + value.toLocaleString('en-IN');
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
                                callback: function(value) {
                                    return '₹' + value.toLocaleString('en-IN');
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

    /* ======================== ENHANCED AI SUGGESTIONS ======================== */

    async renderAISuggestions() {
        try {
            const trades = await this.loadTrades();
            const confidenceEntries = await this.loadConfidenceEntries();
            
            // Generate enhanced AI suggestions
            this.generateEnhancedAISuggestions(trades, confidenceEntries);
        } catch (error) {
            console.error('Error rendering AI suggestions:', error);
        }
    }

    generateEnhancedAISuggestions(trades, confidenceEntries) {
        const aiContents = document.querySelectorAll('.ai-content');
        
        if (trades.length === 0) {
            aiContents.forEach(content => {
                content.innerHTML = "Start adding comprehensive trade analyses to unlock powerful AI insights based on your setup quality, trade management, and psychology patterns.";
            });
            return;
        }

        const suggestions = [
            this.getSetupQualityAnalysis(trades),
            this.getTradeManagementInsights(trades),
            this.getEntryExitAnalysis(trades),
            this.getPerformanceOptimization(trades),
            this.getPsychologyPatterns(trades, confidenceEntries),
            this.getRiskManagementAnalysis(trades),
            this.getStrategyEffectiveness(trades),
            this.getImprovementAreas(trades)
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
            return "Add more trades with setup quality ratings to get detailed setup analysis insights.";
        }

        const avgSetupQuality = setupQualityTrades.reduce((sum, t) => sum + (t.setup_quality || t.confidence_level), 0) / setupQualityTrades.length;
        const highQualityTrades = setupQualityTrades.filter(t => (t.setup_quality || t.confidence_level) >= 8);
        const lowQualityTrades = setupQualityTrades.filter(t => (t.setup_quality || t.confidence_level) <= 5);

        if (highQualityTrades.length > 0) {
            const highQualityWinRate = (highQualityTrades.filter(t => t.net_pl > 0).length / highQualityTrades.length) * 100;
            return `Your average setup quality is ${avgSetupQuality.toFixed(1)}/10. High-quality setups (8-10) have a ${highQualityWinRate.toFixed(0)}% win rate. ${highQualityWinRate > 70 ? 'Focus on only taking high-quality setups!' : 'Improve setup selection criteria.'} Look for more confluence factors before entering trades.`;
        }

        return `Your average setup quality is ${avgSetupQuality.toFixed(1)}/10. Focus on improving setup analysis by identifying more confluence factors and waiting for higher-probability entries.`;
    }

    getTradeManagementInsights(trades) {
        const managementTrades = trades.filter(t => t.emotions_managed || t.plan_adherence);
        
        if (managementTrades.length < 3) {
            return "Continue tracking your trade management metrics for personalized insights on position management and emotional control.";
        }

        const avgEmotionManagement = managementTrades.reduce((sum, t) => sum + (t.emotions_managed || 7), 0) / managementTrades.length;
        const avgPlanAdherence = managementTrades.reduce((sum, t) => sum + (t.plan_adherence || 8), 0) / managementTrades.length;

        let insight = `Your emotional management averages ${avgEmotionManagement.toFixed(1)}/10 and plan adherence ${avgPlanAdherence.toFixed(1)}/10. `;
        
        if (avgEmotionManagement < 6) {
            insight += "Work on emotional control techniques like meditation or position sizing to reduce stress during trades. ";
        }
        
        if (avgPlanAdherence < 7) {
            insight += "Focus on sticking to your predetermined exit strategy. Write down your plan before entering trades.";
        } else {
            insight += "Great discipline! Your consistent plan adherence is a key strength.";
        }

        return insight;
    }

    getEntryExitAnalysis(trades) {
        const timingTrades = trades.filter(t => t.entry_timing_quality || t.exit_timing_quality);
        
        if (timingTrades.length < 3) {
            return "Track your entry and exit timing quality to get insights on improving your trade execution precision.";
        }

        const entryQualities = timingTrades.map(t => t.entry_timing_quality).filter(Boolean);
        const exitQualities = timingTrades.map(t => t.exit_timing_quality).filter(Boolean);

        const perfectEntries = entryQualities.filter(q => q === 'Perfect').length;
        const perfectExits = exitQualities.filter(q => q === 'Perfect').length;
        
        const entryScore = (perfectEntries / entryQualities.length) * 100;
        const exitScore = (perfectExits / exitQualities.length) * 100;

        let analysis = `Entry timing: ${entryScore.toFixed(0)}% perfect entries. Exit timing: ${exitScore.toFixed(0)}% perfect exits. `;
        
        if (entryScore < 30) {
            analysis += "Work on entry timing by waiting for better confirmation signals. ";
        }
        
        if (exitScore < 30) {
            analysis += "Improve exit timing by setting clearer profit targets and stop losses in advance.";
        } else if (exitScore > 60) {
            analysis += "Excellent exit discipline! This is giving you a significant edge.";
        }

        return analysis;
    }

    getPerformanceOptimization(trades) {
        const stats = this.calculateStats(trades);
        
        if (trades.length < 10) {
            return "Build a larger sample of trades to unlock detailed performance optimization recommendations.";
        }

        const bestStrategy = this.getBestStrategy(trades);
        const worstStrategy = this.getWorstStrategy(trades);
        
        let optimization = `Your best performing strategy is "${bestStrategy.name}" with ${bestStrategy.winRate}% win rate. `;
        
        if (worstStrategy && worstStrategy.winRate < 40) {
            optimization += `Consider reducing or eliminating "${worstStrategy.name}" trades (${worstStrategy.winRate}% win rate). `;
        }
        
        if (stats.avgRR.includes(':') && parseFloat(stats.avgRR.split(':')[1]) < 1.5) {
            optimization += "Focus on trades with better risk-reward ratios (minimum 1:2) to improve profitability.";
        } else {
            optimization += "Your risk-reward management is solid. Focus on increasing position size on high-confidence setups.";
        }

        return optimization;
    }

    getPsychologyPatterns(trades, confidenceEntries) {
        const psychTrades = trades.filter(t => t.sleep_quality && t.mental_clarity);
        
        if (psychTrades.length < 5) {
            return "Continue tracking psychology metrics to identify patterns between your mental state and trading performance.";
        }

        const highClarityTrades = psychTrades.filter(t => t.mental_clarity >= 8);
        const lowClarityTrades = psychTrades.filter(t => t.mental_clarity <= 5);

        if (highClarityTrades.length > 0 && lowClarityTrades.length > 0) {
            const highClarityWR = (highClarityTrades.filter(t => t.net_pl > 0).length / highClarityTrades.length) * 100;
            const lowClarityWR = (lowClarityTrades.filter(t => t.net_pl > 0).length / lowClarityTrades.length) * 100;
            
            return `High mental clarity trades: ${highClarityWR.toFixed(0)}% win rate vs Low clarity: ${lowClarityWR.toFixed(0)}% win rate. ${highClarityWR > lowClarityWR + 15 ? 'Only trade when mentally sharp!' : 'Mental state has moderate impact on performance.'} Consider meditation or exercise before trading sessions.`;
        }

        return "Your psychology tracking shows the importance of mental preparation. Focus on consistency in sleep and physical condition for better trading results.";
    }

    getRiskManagementAnalysis(trades) {
        const stopLossTrades = trades.filter(t => t.stop_loss);
        const rrTrades = trades.filter(t => t.risk_reward_ratio && t.risk_reward_ratio > 0);
        
        if (stopLossTrades.length === 0) {
            return "Start using stop losses on every trade! This is critical for long-term success and capital preservation.";
        }

        const stopLossUsage = (stopLossTrades.length / trades.length) * 100;
        let analysis = `You use stop losses on ${stopLossUsage.toFixed(0)}% of trades. `;
        
        if (stopLossUsage < 80) {
            analysis += "Increase stop loss usage for better risk management. ";
        }

        if (rrTrades.length > 0) {
            const avgRR = rrTrades.reduce((sum, t) => sum + t.risk_reward_ratio, 0) / rrTrades.length;
            analysis += `Average R:R ratio is 1:${avgRR.toFixed(2)}. `;
            
            if (avgRR < 1.5) {
                analysis += "Aim for minimum 1:2 risk-reward ratios to improve profitability.";
            } else {
                analysis += "Good risk-reward discipline! This gives you a mathematical edge.";
            }
        }

        return analysis;
    }

    getStrategyEffectiveness(trades) {
        if (trades.length < 10) {
            return "Build more trading history to analyze strategy effectiveness and identify your strongest setups.";
        }

        const strategies = {};
        trades.forEach(trade => {
            if (!strategies[trade.strategy]) {
                strategies[trade.strategy] = { trades: [], wins: 0, totalPL: 0 };
            }
            strategies[trade.strategy].trades.push(trade);
            if (trade.net_pl > 0) strategies[trade.strategy].wins++;
            strategies[trade.strategy].totalPL += trade.net_pl;
        });

        const strategyStats = Object.entries(strategies)
            .map(([name, data]) => ({
                name,
                count: data.trades.length,
                winRate: (data.wins / data.trades.length) * 100,
                totalPL: data.totalPL,
                avgPL: data.totalPL / data.trades.length
            }))
            .sort((a, b) => b.avgPL - a.avgPL);

        const best = strategyStats[0];
        const worst = strategyStats[strategyStats.length - 1];

        return `Most effective: "${best.name}" (${best.winRate.toFixed(0)}% WR, ${this.formatCurrency(best.avgPL)} avg). ${worst.avgPL < 0 ? `Avoid "${worst.name}" trades (${worst.winRate.toFixed(0)}% WR, ${this.formatCurrency(worst.avgPL)} avg).` : ''} Focus on your proven strategies and reduce experimentation until consistency improves.`;
    }

    getImprovementAreas(trades) {
        const areas = [];
        
        // Check various improvement areas
        const lessonsData = trades.filter(t => t.lessons_learned).map(t => t.lessons_learned).join(', ');
        
        if (lessonsData.includes('Entry Timing')) {
            areas.push("⏰ Entry Timing: Wait for better confirmation signals");
        }
        if (lessonsData.includes('Exit Timing')) {
            areas.push("🎯 Exit Timing: Set clearer profit targets in advance");
        }
        if (lessonsData.includes('Position Size')) {
            areas.push("⚖️ Position Sizing: Adjust size based on setup quality");
        }
        if (lessonsData.includes('Emotional Control')) {
            areas.push("🧘‍♂️ Emotional Control: Work on stress management techniques");
        }

        // Check win rate
        const stats = this.calculateStats(trades);
        if (stats.winRate < 50) {
            areas.push("📈 Win Rate: Focus on higher-probability setups only");
        }

        // Check R:R
        if (stats.avgRR.includes(':') && parseFloat(stats.avgRR.split(':')[1]) < 1.5) {
            areas.push("⚖️ Risk-Reward: Target minimum 1:2 ratios");
        }

        if (areas.length === 0) {
            return "Excellent performance! Continue your current approach. Focus on consistency and gradually increasing position sizes on high-confidence setups.";
        }

        return `Key improvement areas: ${areas.slice(0, 3).join('. ')}. Start with one area at a time for sustainable progress.`;
    }

    getBestStrategy(trades) {
        const strategies = {};
        trades.forEach(trade => {
            if (!strategies[trade.strategy]) {
                strategies[trade.strategy] = { wins: 0, total: 0 };
            }
            strategies[trade.strategy].total++;
            if (trade.net_pl > 0) strategies[trade.strategy].wins++;
        });

        const best = Object.entries(strategies)
            .map(([name, data]) => ({ name, winRate: (data.wins / data.total) * 100, count: data.total }))
            .filter(s => s.count >= 3)
            .sort((a, b) => b.winRate - a.winRate)[0];

        return best || { name: 'N/A', winRate: 0 };
    }

    getWorstStrategy(trades) {
        const strategies = {};
        trades.forEach(trade => {
            if (!strategies[trade.strategy]) {
                strategies[trade.strategy] = { wins: 0, total: 0 };
            }
            strategies[trade.strategy].total++;
            if (trade.net_pl > 0) strategies[trade.strategy].wins++;
        });

        const worst = Object.entries(strategies)
            .map(([name, data]) => ({ name, winRate: (data.wins / data.total) * 100, count: data.total }))
            .filter(s => s.count >= 3)
            .sort((a, b) => a.winRate - b.winRate)[0];

        return worst || null;
    }

    /* ======================== REPORTS ======================== */

    async renderReports() {
        try {
            const trades = await this.loadTrades();
            
            this.renderCalendar(trades);
            this.generateReports(trades);
        } catch (error) {
            console.error('Error rendering reports:', error);
        }
    }

    renderCalendar(trades) {
        // Calendar rendering logic here
        const calendarTitle = document.getElementById('calendarTitle');
        if (calendarTitle) {
            const now = new Date();
            calendarTitle.textContent = `P&L Calendar - ${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
        }
    }

    changeCalendarMonth(delta) {
        console.log('Calendar month changed by', delta);
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

        const bestStrategy = this.getBestStrategy(trades);
        
        if (bestStrategy.name !== 'N/A') {
            container.innerHTML = `
                <div class="report-item">
                    <span class="report-label">Best Strategy:</span>
                    <span class="report-value">${bestStrategy.name}</span>
                </div>
                <div class="report-item">
                    <span class="report-label">Win Rate:</span>
                    <span class="report-value">${bestStrategy.winRate.toFixed(0)}%</span>
                </div>
                <div class="report-item">
                    <span class="report-label">Trades:</span>
                    <span class="report-value">${bestStrategy.count}</span>
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
            const confidenceEntries = await this.loadConfidenceEntries();
            
            if (trades.length === 0 && confidenceEntries.length === 0) {
                this.showToast('No data to export', 'warning');
                return;
            }

            let csv = 'data:text/csv;charset=utf-8,';
            
            // Export enhanced trades
            if (trades.length > 0) {
                csv += 'COMPREHENSIVE TRADE ANALYSIS\n';
                csv += 'Entry Date,Exit Date,Symbol,Direction,Quantity,Entry Price,Exit Price,Strategy,P&L,Setup Quality,Entry Timing,Exit Timing,Lessons Learned,Notes\n';
                
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
                        trade.setup_quality || trade.confidence_level || 'N/A',
                        trade.entry_timing_quality || 'N/A',
                        trade.exit_timing_quality || 'N/A',
                        `"${(trade.lessons_learned || '').replace(/"/g, '""')}"`,
                        `"${(trade.notes || '').replace(/"/g, '""')}"`
                    ].join(',') + '\n';
                });
            }

            // Download file
            const encodedUri = encodeURI(csv);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `comprehensive-trading-journal-${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showToast('Comprehensive trade analysis exported! 📊', 'success');
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

// Initialize the enhanced application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new TradingDashboardApp();
    });
} else {
    window.app = new TradingDashboardApp();
}
