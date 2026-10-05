(() => {
  'use strict';

  // ---------- Config & seed data ----------
  const STORE_KEY = 'potluck.state.v1';
  const SESSION_KEY = 'potluck.session.v1';
  const DEFAULT_LIMIT = 10;
  const EMOJIS = ['🍲', '🥗', '🍞', '🍰', '🥤', '🧀', '🍝', '🍗', '🌮', '🍣', '🥟', '🍕', '🍪', '🍉', '🥘', '🍛', '🍜', '🥧'];

  function seed() {
    return {
      event: { title: 'Building Potluck', date: '2026-10-24', time: '18:00', location: 'Rooftop terrace' },
      users: [
        { username: 'admin', name: 'Building Admin', password: 'admin123', role: 'admin' },
        { username: 'maria', name: 'Maria', password: 'demo', role: 'user' },
        { username: 'tom', name: 'Tom', password: 'demo', role: 'user' },
        { username: 'lena', name: 'Lena', password: 'demo', role: 'user' },
      ],
      foods: [
        { id: 'mains', name: 'Mains', emoji: '🍲', limit: 6, bringers: ['tom'] },
        { id: 'salads', name: 'Salads', emoji: '🥗', limit: 3, bringers: ['maria', 'lena'] },
        { id: 'sides', name: 'Sides & Bread', emoji: '🍞', limit: 4, bringers: [] },
        { id: 'appetizers', name: 'Appetizers', emoji: '🧀', limit: 4, bringers: [] },
        { id: 'desserts', name: 'Desserts', emoji: '🍰', limit: 4, bringers: [] },
        { id: 'drinks', name: 'Drinks', emoji: '🥤', limit: 5, bringers: [] },
      ],
    };
  }

  // ---------- Storage (fails soft if localStorage is blocked) ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through to seed */ }
    return seed();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* in-memory only */ }
  }
  function loadSession() {
    try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; }
  }
  function saveSession(username) {
    try {
      if (username) localStorage.setItem(SESSION_KEY, username);
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
  }

  let state = load();
  let session = loadSession();
  const ui = { authTab: 'signup', pendingFoodId: null, editingEvent: false };

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "Salad", "salads", " SALADS!" all count as the same dish
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(es|s)$/, '');

  const me = () => state.users.find((u) => u.username === session) || null;
  const isAdmin = () => me()?.role === 'admin';
  const userBy = (username) => state.users.find((u) => u.username === username);
  const foodBy = (id) => state.foods.find((f) => f.id === id);
  const isFull = (f) => f.bringers.length >= f.limit;
  const myFood = () => (me() ? state.foods.find((f) => f.bringers.includes(session)) : null);

  let toastTimer;
  function toast(msg, isError = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  function flashCard(id) {
    const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  }

  function eventDate() {
    const { date, time } = state.event;
    const d = new Date(`${date}T${time || '00:00'}`);
    return isNaN(d) ? null : d;
  }

  // ---------- Rendering ----------
  function render() {
    renderUserArea();
    renderHero();
    renderStatus();
    renderGrid();
    renderAddFood();
    renderAuth();
  }

  function renderUserArea() {
    const u = me();
    $('#userArea').innerHTML = u
      ? `<span class="hello">👋 <span class="name">${esc(u.name)}</span></span>
         ${u.role === 'admin' ? '<span class="badge">ADMIN</span>' : ''}
         <button class="btn small" data-action="logout">Log out</button>`
      : `<button class="btn small ghost" data-action="goto-auth" data-tab="login">Log in</button>
         <button class="btn small primary" data-action="goto-auth" data-tab="signup">Sign up</button>`;
  }

  function renderHero() {
    const ev = state.event;
    const d = eventDate();
    const dateStr = d ? d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date to be announced';
    const timeStr = d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';

    let countdown = '';
    if (d) {
      const days = Math.ceil((d - Date.now()) / 86400000);
      countdown = days > 1 ? `${days} days to go` : days === 1 ? 'Tomorrow!' : days === 0 ? 'Today!' : 'This potluck has already happened';
    }

    let html = `
      <h1>${esc(ev.title)}</h1>
      <div class="hero-meta">
        <span>📅 ${esc(dateStr)}</span>
        ${timeStr ? `<span>🕕 ${esc(timeStr)}</span>` : ''}
        ${ev.location ? `<span>📍 ${esc(ev.location)}</span>` : ''}
      </div>
      ${countdown ? `<div class="countdown">${countdown}</div>` : ''}`;

    if (isAdmin()) {
      html += ui.editingEvent
        ? `<form data-form="event">
             <div class="field"><label for="evTitle">Event name</label><input id="evTitle" name="title" required maxlength="60" value="${esc(ev.title)}"></div>
             <div class="row">
               <div class="field"><label for="evDate">Date</label><input id="evDate" type="date" name="date" required value="${esc(ev.date)}"></div>
               <div class="field"><label for="evTime">Time</label><input id="evTime" type="time" name="time" required value="${esc(ev.time)}"></div>
             </div>
             <div class="field"><label for="evLoc">Location</label><input id="evLoc" name="location" maxlength="60" value="${esc(ev.location)}"></div>
             <div class="form-actions">
               <button class="btn primary" type="submit">Save event</button>
               <button class="btn ghost" type="button" data-action="cancel-event">Cancel</button>
             </div>
           </form>`
        : `<div class="hero-actions"><button class="btn small" data-action="edit-event">✏️ Edit date, time &amp; place</button></div>`;
    }
    $('#hero').innerHTML = html;
  }

  function renderStatus() {
    const total = state.foods.reduce((n, f) => n + f.bringers.length, 0);
    const open = state.foods.filter((f) => !isFull(f));
    // Lowest fill ratio = what the table needs most
    const needed = open.slice().sort((a, b) => a.bringers.length / a.limit - b.bringers.length / b.limit)[0];
    const mine = myFood();

    const parts = [`<span>🙋 <strong>${total}</strong> neighbour${total === 1 ? '' : 's'} signed up</span>`];
    if (needed) parts.push(`<span>Most needed: <strong>${esc(needed.emoji)} ${esc(needed.name)}</strong> (${needed.bringers.length}/${needed.limit})</span>`);
    if (me()) {
      parts.push(mine
        ? `<span>You're bringing: <strong>${esc(mine.emoji)} ${esc(mine.name)}</strong></span>`
        : `<span>You haven't picked a dish yet</span>`);
    }
    $('#status').innerHTML = parts.join('');

    $('#menuHint').textContent = me()
      ? 'Pick one dish to bring. You can switch any time while there is room.'
      : 'Tap a dish to sign up and claim it.';
  }

  function renderGrid() {
    const u = me();
    const mine = myFood();
    $('#foodGrid').innerHTML = state.foods.map((f) => foodCard(f, u, mine)).join('')
      || '<p class="muted">No dishes yet.</p>';
  }

  function foodCard(f, u, mine) {
    const n = f.bringers.length;
    const full = isFull(f);
    const isMine = mine?.id === f.id;
    const pct = Math.min(100, Math.round((n / f.limit) * 100));
    const left = Math.max(0, f.limit - n);

    let tag = '';
    if (isMine) tag = '<span class="tag mine">You</span>';
    else if (full) tag = '<span class="tag full">Full</span>';
    else if (n / f.limit < 0.5) tag = '<span class="tag needed">Needed</span>';

    const names = f.bringers.map((name) => {
      const b = userBy(name);
      return `<li>${esc(b ? b.name : name)}</li>`;
    }).join('') || '<li class="empty">Nobody yet — be the first!</li>';

    let actions;
    if (!u) {
      actions = `<span class="cta">${full ? 'Full — see other dishes' : 'Sign up to bring this →'}</span>`;
    } else {
      let btn;
      if (isMine) btn = `<button class="btn block" data-action="unvote" data-id="${esc(f.id)}">Cancel — I won't bring this</button>`;
      else if (full) btn = `<button class="btn block" disabled>Full (${n}/${f.limit})</button>`;
      else if (mine) btn = `<button class="btn block" data-action="vote" data-id="${esc(f.id)}">Switch to this</button>`;
      else btn = `<button class="btn primary block" data-action="vote" data-id="${esc(f.id)}">I'll bring this</button>`;

      const admin = u.role === 'admin'
        ? `<div class="admin-row">
             <span class="lbl">Max people</span>
             <button class="btn small" data-action="limit-dec" data-id="${esc(f.id)}" aria-label="Decrease limit">−</button>
             <input type="number" min="${Math.max(1, n)}" max="99" value="${f.limit}" data-input="limit" data-id="${esc(f.id)}" aria-label="Limit for ${esc(f.name)}">
             <button class="btn small" data-action="limit-inc" data-id="${esc(f.id)}" aria-label="Increase limit">+</button>
             <button class="btn small danger" data-action="delete" data-id="${esc(f.id)}" aria-label="Delete ${esc(f.name)}">🗑</button>
           </div>`
        : '';
      actions = `<div class="card-actions">${btn}${admin}</div>`;
    }

    const classes = ['card', full && 'full', isMine && 'mine', !u && 'clickable'].filter(Boolean).join(' ');
    const guestAttrs = !u ? `role="button" tabindex="0" data-action="guest-pick" aria-label="Sign up to bring ${esc(f.name)}"` : '';

    return `
      <article class="${classes}" data-id="${esc(f.id)}" ${guestAttrs}>
        <div class="card-top">
          <span class="emoji" aria-hidden="true">${esc(f.emoji)}</span>
          <h3>${esc(f.name)}</h3>
          ${tag}
        </div>
        <div class="count"><span><b>${n}</b> / ${f.limit} bringing</span><span class="muted">${full ? 'no spots left' : `${left} spot${left === 1 ? '' : 's'} left`}</span></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${f.limit}" aria-valuenow="${n}"><i style="width:${pct}%"></i></div>
        <ul class="bringers">${names}</ul>
        ${actions}
      </article>`;
  }

  function renderAddFood() {
    const el = $('#addFood');
    if (!me()) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const admin = isAdmin();
    el.innerHTML = `
      <h2>Bringing something different?</h2>
      <p class="muted">Add a new dish category. Duplicates aren't allowed — and you can't add a dish that is already full.</p>
      <form class="add-form${admin ? ' admin' : ''}" data-form="add-food">
        <div class="field grow"><label for="foodName">Dish name</label><input id="foodName" name="name" required maxlength="40" placeholder="e.g. Soup, Vegan mains, Snacks"></div>
        <div class="field"><label for="foodEmoji">Icon</label>
          <select id="foodEmoji" name="emoji">${EMOJIS.map((e) => `<option>${e}</option>`).join('')}</select>
        </div>
        ${admin ? `<div class="field"><label for="foodLimit">Max people</label><input id="foodLimit" type="number" name="limit" min="1" max="99" value="${DEFAULT_LIMIT}"></div>` : ''}
        <button class="btn primary" type="submit">+ Add dish</button>
      </form>`;
  }

  function renderAuth() {
    const el = $('#auth');
    if (me()) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const pending = ui.pendingFoodId && foodBy(ui.pendingFoodId);
    const isSignup = ui.authTab === 'signup';

    el.innerHTML = `
      <h2>${isSignup ? 'Join the potluck' : 'Welcome back'}</h2>
      <p class="muted">${isSignup ? 'Create an account to claim a dish.' : 'Log in to pick or change your dish.'}</p>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="${isSignup}" data-action="tab" data-tab="signup">Sign up</button>
        <button role="tab" aria-selected="${!isSignup}" data-action="tab" data-tab="login">Log in</button>
      </div>
      ${pending ? `<div class="pending">${esc(pending.emoji)} You picked <strong>${esc(pending.name)}</strong> — we'll save your spot as soon as you ${isSignup ? 'sign up' : 'log in'}.</div>` : ''}
      ${isSignup ? `
        <form data-form="signup" autocomplete="on">
          <div class="field"><label for="suName">Your name</label><input id="suName" name="name" required maxlength="30" autocomplete="given-name"></div>
          <div class="field"><label for="suUser">Username</label><input id="suUser" name="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" title="Letters, numbers and _ only" autocomplete="username"></div>
          <div class="field"><label for="suPass">Password</label><input id="suPass" type="password" name="password" required minlength="4" autocomplete="new-password"></div>
          <button class="btn primary block" type="submit">Create account${pending ? ' & claim dish' : ''}</button>
        </form>` : `
        <form data-form="login" autocomplete="on">
          <div class="field"><label for="liUser">Username</label><input id="liUser" name="username" required autocomplete="username"></div>
          <div class="field"><label for="liPass">Password</label><input id="liPass" type="password" name="password" required autocomplete="current-password"></div>
          <button class="btn primary block" type="submit">Log in${pending ? ' & claim dish' : ''}</button>
          <p class="hint muted">Demo admin: <code>admin</code> / <code>admin123</code> · Demo user: <code>maria</code> / <code>demo</code></p>
        </form>`}`;
  }

  // ---------- Actions ----------
  function goToAuth(tab, foodId = null) {
    ui.authTab = tab;
    if (foodId !== null) ui.pendingFoodId = foodId;
    renderAuth();
    const el = $('#auth');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => el.querySelector('input')?.focus({ preventScroll: true }), 350);
  }

  function vote(id) {
    const f = foodBy(id);
    if (!f || !me()) return;
    if (f.bringers.includes(session)) return;
    if (isFull(f)) { toast(`${f.name} is full (${f.bringers.length}/${f.limit}). Pick another dish.`, true); return; }
    // One dish per person: drop any previous pick first
    state.foods.forEach((x) => { x.bringers = x.bringers.filter((b) => b !== session); });
    f.bringers.push(session);
    save(); render();
    toast(`Thanks! You're bringing ${f.emoji} ${f.name}.`);
    flashCard(id);
  }

  function unvote(id) {
    const f = foodBy(id);
    if (!f) return;
    f.bringers = f.bringers.filter((b) => b !== session);
    save(); render();
    toast(`You're no longer bringing ${f.name}.`);
  }

  function claimPending() {
    const id = ui.pendingFoodId;
    ui.pendingFoodId = null;
    if (!id) return;
    const f = foodBy(id);
    if (!f) return;
    if (myFood()) { toast(`Welcome back! You're already bringing ${myFood().name}.`); return; }
    if (isFull(f)) { toast(`Sorry, ${f.name} filled up. Please pick another dish.`, true); return; }
    vote(id);
  }

  function addFood(form) {
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim().replace(/\s+/g, ' ');
    if (!name) return;
    const existing = state.foods.find((f) => norm(f.name) === norm(name));
    if (existing) {
      if (isFull(existing)) toast(`${existing.name} is already full (${existing.bringers.length}/${existing.limit}) — you can't add it again.`, true);
      else toast(`${existing.name} already exists — join it instead!`, true);
      flashCard(existing.id);
      return;
    }
    let limit = DEFAULT_LIMIT;
    if (isAdmin()) limit = Math.min(99, Math.max(1, parseInt(fd.get('limit'), 10) || DEFAULT_LIMIT));
    const id = `${norm(name) || 'dish'}-${Date.now().toString(36)}`;
    state.foods.push({ id, name, emoji: String(fd.get('emoji') || '🍽️'), limit, bringers: [] });
    save(); render();
    toast(`Added ${name}. Want to bring it? Tap "I'll bring this".`);
    flashCard(id);
  }

  function setLimit(id, value) {
    if (!isAdmin()) return;
    const f = foodBy(id);
    if (!f) return;
    const min = Math.max(1, f.bringers.length);
    let n = parseInt(value, 10);
    if (isNaN(n)) n = f.limit;
    if (n < min) toast(`Can't go below ${min} — ${f.bringers.length} people already signed up.`, true);
    f.limit = Math.min(99, Math.max(min, n));
    save(); render();
  }

  function deleteFood(id) {
    if (!isAdmin()) return;
    const f = foodBy(id);
    if (!f) return;
    const who = f.bringers.length ? ` ${f.bringers.length} people signed up for it will be un-assigned.` : '';
    if (!confirm(`Delete "${f.name}"?${who}`)) return;
    state.foods = state.foods.filter((x) => x.id !== id);
    save(); render();
    toast(`Deleted ${f.name}.`);
  }

  function signup(form) {
    const fd = new FormData(form);
    const username = String(fd.get('username')).trim().toLowerCase();
    if (state.users.some((u) => u.username === username)) { toast('That username is taken.', true); return; }
    state.users.push({
      username,
      name: String(fd.get('name')).trim(),
      password: String(fd.get('password')),
      role: 'user',
    });
    session = username;
    saveSession(session);
    save(); render();
    toast(`Welcome, ${me().name}!`);
    if (ui.pendingFoodId) claimPending();
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function login(form) {
    const fd = new FormData(form);
    const username = String(fd.get('username')).trim().toLowerCase();
    const u = state.users.find((x) => x.username === username && x.password === fd.get('password'));
    if (!u) { toast('Wrong username or password.', true); return; }
    session = u.username;
    saveSession(session);
    render();
    toast(`Hi ${u.name}!`);
    if (ui.pendingFoodId) claimPending();
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function logout() {
    session = null;
    ui.editingEvent = false;
    saveSession(null);
    render();
    toast('Logged out.');
  }

  function saveEvent(form) {
    if (!isAdmin()) return;
    const fd = new FormData(form);
    state.event = {
      title: String(fd.get('title')).trim() || 'Building Potluck',
      date: String(fd.get('date')),
      time: String(fd.get('time')),
      location: String(fd.get('location')).trim(),
    };
    ui.editingEvent = false;
    save(); render();
    toast('Event details updated.');
  }

  // ---------- Event wiring (delegated) ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const { action, id, tab } = t.dataset;
    switch (action) {
      case 'guest-pick': {
        const f = foodBy(id);
        goToAuth('signup', f && !isFull(f) ? id : null);
        if (f && isFull(f)) toast(`${f.name} is full — sign up and pick another dish.`);
        break;
      }
      case 'goto-auth': goToAuth(tab); break;
      case 'tab': ui.authTab = tab; renderAuth(); break;
      case 'vote': vote(id); break;
      case 'unvote': unvote(id); break;
      case 'limit-inc': setLimit(id, foodBy(id).limit + 1); break;
      case 'limit-dec': setLimit(id, foodBy(id).limit - 1); break;
      case 'delete': deleteFood(id); break;
      case 'edit-event': ui.editingEvent = true; renderHero(); $('#evTitle')?.focus(); break;
      case 'cancel-event': ui.editingEvent = false; renderHero(); break;
      case 'logout': logout(); break;
      case 'reset':
        if (confirm('Reset all demo data (users, dishes, event)?')) {
          state = seed(); session = null; saveSession(null); save(); render(); toast('Demo data reset.');
        }
        break;
    }
  });

  // Guest cards are role="button": make them keyboard-activatable
  document.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('[data-action="guest-pick"]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); card.click(); }
  });

  document.addEventListener('change', (e) => {
    if (e.target.dataset.input === 'limit') setLimit(e.target.dataset.id, e.target.value);
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    ({ signup, login, 'add-food': addFood, event: saveEvent })[form.dataset.form]?.(form);
  });

  // Keep the board fresh if another tab changes it
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY) { state = load(); render(); }
    if (e.key === SESSION_KEY) { session = loadSession(); render(); }
  });

  // If the stored session points to a deleted user, drop it
  if (session && !me()) { session = null; saveSession(null); }
  render();
})();
