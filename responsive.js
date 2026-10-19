/** SCRM presentation layer. Does not migrate, read or reset CRM record storage. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  const sidebar = $('#sidebar');
  const navigation = $('#navigation');
  const main = $('.main');
  const menu = $('#menuBtn');
  const backdrop = $('#navBackdrop');
  const overlay = $('#overlay');
  const mobile = matchMedia('(max-width: 767px)');
  const narrow = matchMedia('(max-width: 1099px)');
  const prefKey = 'scrm_ui_v1';
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(prefKey)) || {}; } catch { /* storage optional */ }
  if (typeof prefs !== 'object' || Array.isArray(prefs)) prefs = {};
  if (typeof prefs.groups !== 'object' || !prefs.groups) prefs.groups = {};
  const persist = () => { try { localStorage.setItem(prefKey, JSON.stringify(prefs)); } catch { /* private browsing */ } };
  let drawerOpen = false, modalOpen = false, returnFocus = null, lastPage = '', navScroll = 0;
  const paths = {
    home: '<path d="m3 11 9-8 9 8v10H3zM9 21v-7h6v7"/>',
    notifications: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3a2 2 0 0 0 4 0"/>',
    overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    mywork: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 6-6"/>',
    analytics: '<path d="M4 3v18h17M8 16v-5m5 5V6m5 10v-8"/>',
    leads: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/>',
    customers: '<path d="M4 21V5l10-2v18M14 9h6v12M2 21h20M8 8h2m-2 4h2m-2 4h2m7-3h1m-1 4h1"/>',
    contacts: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m0-16a3 3 0 0 1 0 6m3 3a5 5 0 0 1 3 5v2"/>',
    opportunities: '<path d="m12 3 9 9-9 9-9-9Z"/>',
    activities: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 3v4m10-4v4M7 14h3m4 0h3m-10 3h3"/>',
    quotes: '<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8m-8 4h6"/>',
    bookings: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 13h18m-9-2v4"/>',
    employees: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M5 17a4 4 0 0 1 8 0m2-8h3m-3 4h3"/>',
    branches: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    modules: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
    settings: '<path d="M4 7h5m5 0h6M4 17h10m5 0h1"/><circle cx="11" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
    audit: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    menu: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m4-10h4m-4 4h4"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3a2 2 0 0 0 4 0"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>', down: '<path d="m6 9 6 6 6-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    restore: '<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>', plus: '<path d="M12 4v16M4 12h16"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    phone: '<path d="m7 3 3 5-3 3c2 3 3 4 6 6l3-3 5 3-2 4C10 22 2 14 3 5Z"/>',
    ai: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>'
  };
  const icon = (name) => '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (paths[name] || paths.modules) + '</svg>';
  const glyphs = { '\u2667': 'contacts', '\u25c9': 'leads', '\u25c7': 'opportunities', '\u2611': 'mywork', '\u25a3': 'activities', '\u25a4': 'quotes', '\u25f7': 'audit', '\u260e': 'phone', '\u2713': 'mywork', '\u2699': 'settings', '\u2709': 'email', '\u25a6': 'modules', '\u2302': 'branches', '\u25a5': 'analytics', '\u2659': 'contacts', '\u2726': 'ai' };
  function setLock() {
    document.body.style.overflow = drawerOpen || modalOpen ? 'hidden' : '';
    main.inert = drawerOpen || modalOpen;
    sidebar.inert = modalOpen || (mobile.matches && !drawerOpen);
  }
  function syncLayout() {
    const collapsed = typeof prefs.collapsed === 'boolean' ? prefs.collapsed : narrow.matches;
    root.classList.toggle('nav-collapsed', !mobile.matches && collapsed);
    sidebar.classList.toggle('open', mobile.matches && drawerOpen);
    backdrop.hidden = !mobile.matches || !drawerOpen;
    menu.setAttribute('aria-expanded', String(mobile.matches ? drawerOpen : !collapsed));
    const label = mobile.matches ? 'Open navigation' : collapsed ? 'Expand navigation' : 'Collapse navigation';
    menu.setAttribute('aria-label', label); menu.title = label;
    if (mobile.matches && drawerOpen) { sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); }
    else { sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); }
    setLock();
  }
  function closeDrawer(restore = true) { drawerOpen = false; syncLayout(); if (restore && !modalOpen) menu.focus(); }
  menu.innerHTML = icon('menu');
  menu.onclick = () => {
    if (mobile.matches) { drawerOpen = !drawerOpen; syncLayout(); if (drawerOpen) $('#closeNav').focus(); }
    else { prefs.collapsed = !root.classList.contains('nav-collapsed'); persist(); syncLayout(); }
  };
  $('#closeNav').innerHTML = icon('close'); $('#closeNav').onclick = () => closeDrawer();
  $('#closeModal').innerHTML = icon('close'); backdrop.onclick = () => closeDrawer();
  $('#globalSearchBtn').innerHTML = icon('search') + '<span>Find a module...</span><kbd>Ctrl K</kbd>';
  $('#notifBtn').innerHTML = icon('bell') + '<i></i>';
  const focusMode = $('#focusModeBtn');
  const focusSupported = typeof root.requestFullscreen === 'function' && document.fullscreenEnabled !== false;
  function syncFocusMode() {
    const active = Boolean(document.fullscreenElement);
    const label = active ? 'Exit focus mode' : 'Enter focus mode';
    focusMode.setAttribute('aria-pressed', String(active));
    focusMode.setAttribute('aria-label', focusSupported ? label : 'Focus mode is not available in this browser');
    focusMode.title = focusMode.getAttribute('aria-label');
    focusMode.innerHTML = icon(active ? 'restore' : 'expand');
  }
  focusMode.disabled = !focusSupported;
  focusMode.onclick = async () => {
    focusMode.disabled = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch {
      const toast = $('#toast');
      toast.textContent = 'Focus mode is not available in this browser.';
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 3000);
    } finally {
      focusMode.disabled = !focusSupported;
      syncFocusMode();
    }
  };
  document.addEventListener('fullscreenchange', () => {
    syncFocusMode();
    if (!document.fullscreenElement && !$('#app').hidden) focusMode.focus({ preventScroll: true });
  });
  // Keep the header and dialogs available in fullscreen, and leave it on sign-out.
  new MutationObserver(() => {
    if ($('#app').hidden && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }).observe($('#app'), { attributes: true, attributeFilter: ['hidden'] });
  syncFocusMode();
  mobile.addEventListener('change', () => { drawerOpen = false; syncLayout(); }); narrow.addEventListener('change', syncLayout);
  navigation.addEventListener('scroll', () => { navScroll = navigation.scrollTop; }, { passive: true });
  const navObserver = new MutationObserver(enhanceNavigation);
  function enhanceNavigation() {
    if (!navigation.querySelector(':scope > .nav-section')) return;
    navObserver.disconnect();
    const activePage = navigation.querySelector('.nav-item.active')?.dataset.nav;
    const changingPage = activePage !== lastPage;
    let group = null, links = null, index = -1;
    [...navigation.children].forEach((node) => {
      if (node.classList.contains('nav-section')) {
        index++;
        const name = node.textContent.trim();
        group = document.createElement('section'); group.className = 'nav-group';
        const heading = document.createElement('button'); heading.type = 'button'; heading.className = 'nav-section';
        const text = document.createElement('span'); text.textContent = name;
        heading.append(text); heading.insertAdjacentHTML('beforeend', icon('chevron'));
        links = document.createElement('div'); links.className = 'nav-links'; links.id = 'nav-section-' + index;
        heading.setAttribute('aria-controls', links.id);
        const currentLinks = links;
        const setOpen = (open) => { currentLinks.hidden = !open; heading.setAttribute('aria-expanded', String(open)); };
        setOpen(typeof prefs.groups[name] === 'boolean' ? prefs.groups[name] : index < 2);
        heading.onclick = () => { const open = heading.getAttribute('aria-expanded') !== 'true'; prefs.groups[name] = open; persist(); setOpen(open); };
        group.append(heading, links); node.replaceWith(group);
      } else if (node.classList.contains('nav-item') && links) {
        const labelText = [...node.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
        const label = document.createElement('span'); label.className = 'nav-label'; label.textContent = labelText;
        [...node.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).forEach(n => n.remove());
        const glyph = node.querySelector('.nav-icon'); if (glyph) { glyph.innerHTML = icon(node.dataset.nav); glyph.after(label); }
        node.title = labelText; node.setAttribute('aria-label', labelText);
        if (node.classList.contains('active')) { node.setAttribute('aria-current', 'page'); if (changingPage) { links.hidden = false; group.querySelector('.nav-section').setAttribute('aria-expanded', 'true'); } }
        links.append(node);
      }
    });
    lastPage = activePage; navigation.scrollTop = navScroll;
    navObserver.observe(navigation, { childList: true });
  }
  function enhanceContent() {
    const content = $('#content'), crumb = $('#crumb').textContent;
    $('#crumb').title = crumb;
    if (crumb === 'Overview' && content.querySelector('h1')) content.querySelector('h1').textContent = 'Workspace overview';
    const oldNotice = content.querySelector('div.notice');
    if (oldNotice) {
      const details = document.createElement('details'); details.className = 'notice';
      details.innerHTML = '<summary>' + icon('info') + '<span><strong>Demo workspace.</strong> Sample data only - no login or shared database.</span><span class="notice-toggle">Details' + icon('down') + '</span></summary>';
      const info = document.createElement('p'); info.textContent = oldNotice.textContent.replace(/^\s*\S+\s*Prototype workspace\s*/, ''); details.append(info); oldNotice.replaceWith(details);
    }
    content.querySelectorAll('.stat-icon, .activity-bullet, .feature-icon').forEach(e => { if (!e.querySelector('svg')) e.innerHTML = icon(glyphs[e.textContent.trim()] || 'modules'); });
    content.querySelectorAll('[data-action]').forEach(button => {
      if (button.closest('.crm-module-workbar, .crm-settings-popover, .crm-inline-filters')) return;
      if (button.querySelector('svg')) return;
      const action = button.dataset.action;
      const key = action.startsWith('new') ? 'plus' : action.startsWith('export') ? 'download' : action === 'toggleView' ? 'modules' : 'audit';
      const label = document.createElement('span'); label.textContent = button.textContent.replace(/^[^a-zA-Z]+/, '');
      button.replaceChildren(label); button.insertAdjacentHTML('afterbegin', icon(key));
    });
    content.querySelectorAll('.table-wrap').forEach(wrap => {
      if (wrap.querySelector('[data-open]')) wrap.classList.add('record-table');
      wrap.setAttribute('tabindex', '0'); wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', crumb + ' records. Scroll horizontally for more columns on smaller laptops.');
      const headers = [...wrap.querySelectorAll('th')].map(th => th.textContent);
      wrap.querySelectorAll('tbody tr').forEach(row => {
        [...row.cells].forEach((cell, i) => { cell.dataset.label = headers[i] || ''; });
        const cell = row.querySelector('.name-cell');
        if (cell && !cell.querySelector('button')) { const button = document.createElement('button'); button.type = 'button'; button.className = 'record-name'; button.textContent = cell.textContent; button.title = cell.textContent; cell.replaceChildren(button); }
        const view = row.querySelector('.mini-link'); if (view) view.setAttribute('aria-label', 'View ' + row.cells[0].textContent);
      });
    });
    content.querySelectorAll('.kanban').forEach(el => { el.tabIndex = 0; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Pipeline board. Scroll horizontally to see all stages.'); });
    content.querySelectorAll('.kanban-card').forEach(el => { el.tabIndex = 0; el.setAttribute('role', 'button'); el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } }; });
    $('#tableSearch')?.setAttribute('aria-label', 'Search ' + crumb); $('#statusFilter')?.setAttribute('aria-label', 'Filter by status');
  }
  // Resolve overview/My Work shortcuts in the owning module, without touching record data.
  $('#content').addEventListener('click', (event) => {
    const record = event.target.closest('[data-open]');
    const module = { Overview: 'leads', 'My Work': 'activities' }[$('#crumb').textContent];
    if (!record || !module) return;
    event.preventDefault(); event.stopPropagation();
    const id = record.dataset.open;
    navigation.querySelector('[data-nav="' + module + '"]')?.click();
    [...$('#content').querySelectorAll('[data-open]')].find(el => el.dataset.open === id)?.click();
  }, true);
  document.addEventListener('click', event => { if (event.target.closest('[data-nav], [data-quick]') && drawerOpen) { closeDrawer(false); $('#content').focus({ preventScroll: true }); } });
  const visibleFocusable = (container) => [...container.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(e => !e.disabled && e.getClientRects().length && !e.closest('[hidden]'));
  document.addEventListener('keydown', event => {
    const dialog = !overlay.classList.contains('hidden');
    if (!dialog && !drawerOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (dialog) $('#closeModal').click(); else closeDrawer(); return; }
    if (event.key !== 'Tab') return;
    const target = dialog ? $('.modal') : sidebar;
    const items = visibleFocusable(target), first = items[0], last = items[items.length - 1];
    if (!first) { event.preventDefault(); target.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !target.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !target.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }, true);
  new MutationObserver(() => {
    const open = !overlay.classList.contains('hidden'); if (open === modalOpen) return;
    modalOpen = open;
    if (open) { returnFocus = document.activeElement; setLock(); if (!overlay.contains(document.activeElement)) (overlay.querySelector('input, select, textarea') || $('#closeModal')).focus({ preventScroll: true }); $('#quickSearch')?.setAttribute('aria-label', 'Find a module'); }
    else { setLock(); if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus({ preventScroll: true }); else menu.focus({ preventScroll: true }); }
  }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  enhanceNavigation(); enhanceContent(); syncLayout();
  new MutationObserver(enhanceContent).observe($('#content'), { childList: true });
})();
