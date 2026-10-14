const API = window.EVENTORA_API;
async function request(path, body) { const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const raw = await r.text(); let j; try {
    j = JSON.parse(raw);
}
catch {
    throw Error('The API returned HTML or invalid JSON. Check the backend URL and Apache rewrite rules.');
} if (!r.ok || !j.success)
    throw Error(j.message || 'Request failed'); return j.data; }
const login = document.getElementById('loginForm');
if (login) {
    login.addEventListener('submit', async (e) => { e.preventDefault(); const notice = document.getElementById('loginNotice'); notice.textContent = 'Signing in...'; try {
        const data = await request('/auth/login', Object.fromEntries(new FormData(login)));
        if (!data.token || !['admin', 'organiser', 'customer'].includes(data.user?.role))
            throw Error('Unexpected login response');
        sessionStorage.setItem('eventora_auth', JSON.stringify(data));
        location.href = data.user.role + '.html';
    }
    catch (err) {
        notice.textContent = err.message;
    } });
}
const register = document.getElementById('registerForm');
if (register) {
    const role = register.elements.role;
    role.addEventListener('change', () => { document.getElementById('adminKeyWrap').hidden = role.value !== 'admin'; });
    register.addEventListener('submit', async (e) => { e.preventDefault(); const n = document.getElementById('registerNotice'); const data = Object.fromEntries(new FormData(register)); if (data.password !== data.confirm_password) {
        n.textContent = 'Passwords do not match.';
        return;
    } delete data.confirm_password; if (data.role !== 'admin')
        delete data.reference_key; n.textContent = 'Creating account...'; try {
        await request('/auth/register', data);
        n.className = 'success';
        n.innerHTML = 'Account created successfully. <a href="index.html">Log in here</a>.';
        register.reset();
        document.getElementById('adminKeyWrap').hidden = true;
    }
    catch (err) {
        n.className = 'notice error';
        n.textContent = err.message;
    } });
}
