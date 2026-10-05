const USERS_KEY = 'smolenskPoker.testUsers';
const SESSION_KEY = 'smolenskPoker.currentUser';
const TEST_PHONE = '79990000000';
const TEST_PASSWORD = 'test123';
const TEST_USER_ID = 'smolensk-poker-test-user';
const TEST_SERGEY_PHONE = '79990000001';
const TEST_SERGEY_PASSWORD = 'test123';
const TEST_SERGEY_ID = 'smolensk-poker-test-sergey';

function users() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
    catch { return []; }
}

function saveUsers(value) {
    localStorage.setItem(USERS_KEY, JSON.stringify(value));
}

export function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('8')) return '7' + digits.slice(1);
    if (digits.length === 10) return '7' + digits;
    return digits;
}

async function passwordHash(password) {
    const bytes = new TextEncoder().encode('smolensk-poker-test:' + password);
    if (!globalThis.crypto?.subtle) {
        let hash = 2166136261;
        for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
        return 'mobile-' + (hash >>> 0).toString(16);
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function register(phone, password) {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 11 || !normalized.startsWith('7')) throw new Error('Введите корректный номер телефона.');
    if (password.length < 6) throw new Error('Пароль должен содержать не менее 6 символов.');

    const list = users();
    if (list.some(user => user.phone === normalized)) throw new Error('Такой номер уже зарегистрирован.');

    const id = globalThis.crypto?.randomUUID?.() || `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = { id, phone: normalized, passwordHash: await passwordHash(password), nickname: '', avatar: 'images/avatars/01-fortress-tower.png', chips: 10000, createdAt: new Date().toISOString() };
    list.push(user);
    saveUsers(list);
    localStorage.setItem(SESSION_KEY, user.id);
    return user;
}

export async function login(phone, password) {
    const normalized = normalizePhone(phone);

    if (normalized === TEST_SERGEY_PHONE && password === TEST_SERGEY_PASSWORD) {
        const list = users();
        let user = list.find(item => item.id === TEST_SERGEY_ID);
        if (!user) {
            user = { id: TEST_SERGEY_ID, phone: TEST_SERGEY_PHONE, passwordHash: 'built-in-test-account', nickname: 'Сергей', avatar: 'images/avatars/07-warrior.png', chips: 10000, createdAt: new Date().toISOString() };
            list.push(user);
            saveUsers(list);
        }
        localStorage.setItem(SESSION_KEY, user.id);
        return user;
    }

    // Постоянный демонстрационный аккаунт должен работать в любом браузере и
    // на любом устройстве, даже если его localStorage пока совершенно пуст.
    if (normalized === TEST_PHONE && password === TEST_PASSWORD) {
        const list = users();
        let user = list.find(item => item.id === TEST_USER_ID);
        if (!user) {
            user = {
                id: TEST_USER_ID,
                phone: TEST_PHONE,
                passwordHash: 'built-in-test-account',
                nickname: 'Михалыч',
                avatar: 'images/avatars/10-river-cathedral.png',
                chips: 10000,
                createdAt: new Date().toISOString()
            };
            list.push(user);
            saveUsers(list);
        }
        localStorage.setItem(SESSION_KEY, user.id);
        return user;
    }

    const hash = await passwordHash(password);
    const user = users().find(item => item.phone === normalized && item.passwordHash === hash);
    if (!user) throw new Error('Неверный телефон или пароль.');
    localStorage.setItem(SESSION_KEY, user.id);
    return user;
}

export function currentUser() {
    const id = localStorage.getItem(SESSION_KEY);
    return users().find(user => user.id === id) || null;
}

export function setNickname(nickname) {
    const clean = String(nickname || '').trim();
    if (!/^[a-zA-Zа-яА-ЯёЁ0-9_-]{3,20}$/.test(clean)) throw new Error('Никнейм: 3–20 символов, буквы, цифры, _ или -.');
    const list = users();
    const id = localStorage.getItem(SESSION_KEY);
    const index = list.findIndex(user => user.id === id);
    if (index < 0) throw new Error('Сессия не найдена. Войдите ещё раз.');
    if (list.some((user, i) => i !== index && user.nickname.toLowerCase() === clean.toLowerCase())) throw new Error('Этот никнейм уже занят.');
    list[index].nickname = clean;
    saveUsers(list);
    return list[index];
}

export function logout() {
    localStorage.removeItem(SESSION_KEY);
}

export function setAvatar(avatar) {
    const allowed = [
        'images/avatars/01-fortress-tower.png', 'images/avatars/02-cathedral.png',
        'images/avatars/03-monument.png', 'images/avatars/04-coat-of-arms.png',
        'images/avatars/05-bridge.png', 'images/avatars/06-eagle.png',
        'images/avatars/07-warrior.png', 'images/avatars/08-fortress-wall.png',
        'images/avatars/09-chapel.png', 'images/avatars/10-river-cathedral.png'
    ];
    if (!allowed.includes(avatar)) throw new Error('Неизвестная аватарка.');
    const list = users();
    const id = localStorage.getItem(SESSION_KEY);
    const index = list.findIndex(user => user.id === id);
    if (index < 0) throw new Error('Сессия не найдена.');
    list[index].avatar = avatar;
    saveUsers(list);
    return list[index];
}
