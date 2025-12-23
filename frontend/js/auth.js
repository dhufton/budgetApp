// frontend/js/auth.js
let supabase;

// Initialize Supabase from config endpoint
async function initSupabase() {
    const response = await fetch('/api/config');
    const config = await response.json();
    supabase = window.supabase.createClient(config.supabase_url, config.supabase_key);
}

// Initialize on page load
initSupabase();

function showLogin() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');

    document.getElementById('loginTab').classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
    document.getElementById('loginTab').classList.remove('text-gray-500');

    document.getElementById('registerTab').classList.remove('border-b-2', 'border-blue-600', 'text-blue-600');
    document.getElementById('registerTab').classList.add('text-gray-500');
}

function showRegister() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');

    document.getElementById('registerTab').classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
    document.getElementById('registerTab').classList.remove('text-gray-500');

    document.getElementById('loginTab').classList.remove('border-b-2', 'border-blue-600', 'text-blue-600');
    document.getElementById('loginTab').classList.add('text-gray-500');
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showMessage('Please enter email and password', 'error');
        return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        showMessage(error.message, 'error');
    } else {
        localStorage.setItem('token', data.session.access_token);
        localStorage.setItem('user_email', email);
        window.location.href = '/dashboard';
    }
}

async function register() {
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

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
        showMessage(error.message, 'error');
    } else {
        showMessage('Account created! Please check your email to confirm.', 'success');
        setTimeout(() => showLogin(), 2000);
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user_email');
    window.location.href = '/';
}

function showMessage(text, type) {
    const msg = document.getElementById('message');
    msg.textContent = text;
    msg.className = `mt-4 p-3 rounded-lg ${type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
    msg.classList.remove('hidden');
}

async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return null;
    }
    return token;
}
