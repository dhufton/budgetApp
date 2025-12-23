// frontend/js/auth.js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const { data, error } = await supabase.auth.signInWithPassword({
        email, password
    });

    if (error) {
        document.getElementById('error').textContent = error.message;
        document.getElementById('error').classList.remove('hidden');
    } else {
        localStorage.setItem('token', data.session.access_token);
        window.location.href = '/dashboard';
    }
}

async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return null;
    }

    const { data } = await supabase.auth.getUser(token);
    if (!data.user) {
        localStorage.removeItem('token');
        window.location.href = '/';
        return null;
    }

    return token;
}
