// frontend/js/auth.js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function showLogin() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginTab').classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
    document.getElementById('registerTab').classList.remove('border-b-2', 'border-blue-600', 'text-blue-600');
}

function showRegister() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('registerTab').classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
    document.getElementById('loginTab').classList.remove('border-b-2', 'border-blue-600', 'text-blue-600');
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

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

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
        showMessage(error.message, 'error');
    } else {
        showMessage('Account created! Please check your email to confirm.', 'success');
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
