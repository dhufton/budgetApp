// frontend/js/auth.js
(function() {
    let supabase = null;
    let isInitialized = false;

    // Expose functions globally
    window.showLogin = function() {
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('registerForm').classList.add('hidden');

        const loginTab = document.getElementById('loginTab');
        const registerTab = document.getElementById('registerTab');

        loginTab.classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
        loginTab.classList.remove('text-gray-500');

        registerTab.classList.remove('border-b-2', 'border-blue-600', 'text-blue-600');
        registerTab.classList.add('text-gray-500');
    };

    window.showRegister = function() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');

        const loginTab = document.getElementById('loginTab');
        const registerTab = document.getElementById('registerTab');

        registerTab.classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
        registerTab.classList.remove('text-gray-500');

        loginTab.classList.remove('border-b-2', 'border-blue-600', 'text-blue-600');
        loginTab.classList.add('text-gray-500');
    };

    window.login = async function() {
        if (!isInitialized || !supabase) {
            showMessage('Still loading... please wait', 'error');
            return;
        }

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            showMessage('Please enter email and password', 'error');
            return;
        }

        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
                showMessage(error.message, 'error');
            } else {
                localStorage.setItem('token', data.session.access_token);
                localStorage.setItem('user_email', email);
                window.location.href = '/dashboard';
            }
        } catch (err) {
            showMessage('Login failed: ' + err.message, 'error');
        }
    };

    window.register = async function() {
        if (!isInitialized || !supabase) {
            showMessage('Still loading... please wait', 'error');
            return;
        }

        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;

        if (!email || !password) {
            showMessage('Please enter email and password', 'error');
            return;
        }

        if (password.length < 6) {
            showMessage('Password must be at least 6 characters', 'error');
            return;
        }

        try {
            const { data, error } = await supabase.auth.signUp({ email, password });

            if (error) {
                showMessage(error.message, 'error');
            } else {
                showMessage('Account created! Please check your email to confirm.', 'success');
                setTimeout(() => window.showLogin(), 2000);
            }
        } catch (err) {
            showMessage('Registration failed: ' + err.message, 'error');
        }
    };

    window.logout = function() {
        localStorage.removeItem('token');
        localStorage.removeItem('user_email');
        window.location.href = '/';
    };

    window.checkAuth = async function() {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/';
            return null;
        }
        return token;
    };

    function showMessage(text, type) {
        const msg = document.getElementById('message');
        if (!msg) {
            console.error('Message element not found');
            return;
        }
        msg.textContent = text;
        msg.className = `mt-4 p-3 rounded-lg ${type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
        msg.classList.remove('hidden');
    }

    async function initSupabase() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();

            if (!config.supabase_url || !config.supabase_key) {
                console.error('Missing Supabase configuration');
                showMessage('Configuration error. Please contact support.', 'error');
                return;
            }

            supabase = window.supabase.createClient(config.supabase_url, config.supabase_key);
            isInitialized = true;
            console.log('Supabase initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Supabase:', error);
            showMessage('Failed to connect. Please refresh the page.', 'error');
        }
    }

    // Initialize when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSupabase);
    } else {
        initSupabase();
    }
})();
