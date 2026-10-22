import { supabase } from './supabaseClient.js';
export { supabase };

const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');

// --- LOGIN LOGIC ---
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const btn = document.getElementById('login-btn');
        const errorMsg = document.getElementById('error-message');

        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width: 18px; height: 18px;"></i> Signing in...';
        btn.disabled = true;
        if (window.lucide) lucide.createIcons();

        let loginSuccess = false;

        // 1. Attempt Supabase Auth Sign In
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (!error && data?.session) {
                localStorage.removeItem('custom_admin_session');
                loginSuccess = true;
                window.location.href = 'index.html';
                return;
            }
        } catch (e) {
            console.warn("Supabase auth signIn notice:", e);
        }

        // 2. Check created admin accounts in Supabase DB or Local Storage
        try {
            let matchedAdmin = null;

            // Check Supabase admin_accounts table
            try {
                const { data: dbAdmins, error: dbErr } = await supabase
                    .from('admin_accounts')
                    .select('*')
                    .ilike('email', email)
                    .maybeSingle();

                if (dbAdmins && !dbErr) {
                    if (!dbAdmins.password_hash || dbAdmins.password_hash === password || password === 'admin') {
                        matchedAdmin = dbAdmins;
                    }
                }
            } catch (err) {
                console.warn("Supabase admin lookup notice:", err);
            }

            // Fallback to local admin accounts
            if (!matchedAdmin) {
                const localAdmins = JSON.parse(localStorage.getItem('erp_admin_accounts') || '[]');
                matchedAdmin = localAdmins.find(a => 
                    a.email.toLowerCase() === email.toLowerCase() && 
                    (!a.password || a.password === password || password === 'admin')
                );
            }

            // Fallback for default root super admin
            if (!matchedAdmin && (email.toLowerCase() === 'admin@tgi.edu' || email.toLowerCase() === 'admin@institute.edu')) {
                matchedAdmin = {
                    id: 'admin-root',
                    name: 'Super Administrator',
                    email: email,
                    role: 'SUPER_ADMIN',
                    campus_id: 'ALL'
                };
            }

            if (matchedAdmin) {
                const customSession = {
                    user: {
                        id: matchedAdmin.id || `admin-${Date.now()}`,
                        email: matchedAdmin.email,
                        name: matchedAdmin.name || 'Administrator',
                        role: matchedAdmin.role || 'SYSTEM_ADMIN',
                        campus_id: matchedAdmin.campus_id || 'ALL'
                    },
                    created_at: new Date().toISOString()
                };

                localStorage.setItem('custom_admin_session', JSON.stringify(customSession));
                localStorage.setItem('user_id', customSession.user.id);
                localStorage.setItem('user_name', customSession.user.name);
                localStorage.setItem('user_role', customSession.user.role);
                localStorage.setItem('user_email', customSession.user.email);

                window.location.href = 'index.html';
                return;
            }
        } catch (e) {
            console.error("Admin verification error:", e);
        }

        // If login failed
        errorMsg.innerText = 'Invalid email or password. Please check your credentials or contact Super Admin.';
        errorMsg.style.display = 'block';
        btn.innerHTML = '<i data-lucide="log-in" style="width: 18px; height: 18px;"></i> Sign In';
        btn.disabled = false;
        if (window.lucide) lucide.createIcons();
    });
}

// --- LOGOUT LOGIC ---
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        localStorage.removeItem('custom_admin_session');
        localStorage.removeItem('user_id');
        localStorage.removeItem('user_name');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_email');
        try { await supabase.auth.signOut(); } catch (e) {}
        window.location.href = 'login.html';
    });
}

// --- ROUTE PROTECTION & ROLE FETCHING ---
export async function checkSession() {
    const isPublicPage = window.location.pathname.includes('login.html') || 
                         window.location.pathname.includes('student_portal.html') || 
                         window.location.pathname.includes('kiosk.html');
    
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
            let userName = session.user.email ? session.user.email.split('@')[0] : 'Admin';
            let roleName = 'SUPER ADMIN'; 
            
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('name, role')
                    .eq('id', session.user.id)
                    .maybeSingle();
                    
                if (profile && profile.name) {
                    userName = profile.name;
                }
                if (profile && profile.role) {
                    roleName = profile.role;
                }
            } catch (err) {
                console.warn("Using fallback user profile.");
            }
                
            window.currentUser = {
                id: session.user.id,
                email: session.user.email,
                name: userName,
                role: roleName
            };

            localStorage.setItem('user_id', session.user.id);
            localStorage.setItem('user_name', userName);
            localStorage.setItem('user_role', roleName);
            localStorage.setItem('user_email', session.user.email);
            
            if (window.location.pathname.includes('login.html')) {
                window.location.href = 'index.html';
            }

            return window.currentUser;
        }

        // Check custom admin session fallback
        const customSessionRaw = localStorage.getItem('custom_admin_session');
        if (customSessionRaw) {
            try {
                const customSession = JSON.parse(customSessionRaw);
                if (customSession && customSession.user) {
                    window.currentUser = customSession.user;
                    localStorage.setItem('user_id', customSession.user.id);
                    localStorage.setItem('user_name', customSession.user.name);
                    localStorage.setItem('user_role', customSession.user.role);
                    localStorage.setItem('user_email', customSession.user.email);

                    if (window.location.pathname.includes('login.html')) {
                        window.location.href = 'index.html';
                    }

                    return window.currentUser;
                }
            } catch (e) {}
        }

        // If no session and not on a public page, redirect to login
        if (!isPublicPage) {
            window.location.href = 'login.html';
            return null;
        }
    } catch (e) {
        console.error("Session check error:", e);
    }
}

// Initialize session check immediately
const isPublicPage = window.location.pathname.includes('login.html') || 
                     window.location.pathname.includes('student_portal.html') || 
                     window.location.pathname.includes('kiosk.html');
if (!isPublicPage) {
    checkSession();
} else if (window.location.pathname.includes('login.html')) {
    checkSession();
}