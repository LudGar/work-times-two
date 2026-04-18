// ── CONSTANTS ────────────────────────────
const DATA_KEY = 'dp-data';
const FIL_KEY = 'dp-filiale';
const BL_KEY = 'dp-bl';
const WH_KEY = 'dp-wh';
const WH_MSG_KEY = 'dp-whmsg';
const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const TYPE_L = {
    vz: 'Vollzeit',
    tz: 'Teilzeit',
    gfb: 'Geringf.',
    rk: 'Reinigung'
};
const TYPE_B = {
    vz: 'badge-vz',
    tz: 'badge-tz',
    gfb: 'badge-gfb',
    rk: 'badge-rk'
};
const COL = {
    blue: '#58a6ff',
    green: '#2ea043',
    yellow: '#e8b800',
    red: '#dc3545',
    purple: '#a78bfa'
};

// ── STATE ────────────────────────────────
let filiale = localStorage.getItem(FIL_KEY) || '';
let state = {
    monday: getMondayOfWeek(new Date()),
    bundesland: localStorage.getItem(BL_KEY) || 'BY',
    employees: [],
    shifts: {}
};
let editCtx = null;
let mgmtTab = 'staff';
let waTab = 'week';
let autoWH = false;
let _whDebounce = null;
let pendingImport = null;

// ── INIT ─────────────────────────────────
function init() {
    if (!filiale) {
        document.getElementById('setup-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('setup-fil').focus(), 50);
    } else {
        loadData();
        startApp();
    }
}

function doSetup() {
    const v = document.getElementById('setup-fil').value.trim();
    if (!v) {
        document.getElementById('setup-err').style.display = 'block';
        return;
    }
    filiale = v;
    localStorage.setItem(FIL_KEY, filiale);
    document.getElementById('setup-modal').style.display = 'none';
    loadData();
    startApp();
}

function startApp() {
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('fil-display').textContent = filiale;
    document.getElementById('mgmt-fil').textContent = filiale;
    document.getElementById('wh-fil').textContent = filiale;
    document.getElementById('d-fil-ch').textContent = filiale;
    document.getElementById('bl-sel').value = state.bundesland;
    render();
    updateSyncBadge();
}

function loadData() {
    const raw = localStorage.getItem(DATA_KEY + '-' + filiale);
    if (raw) {
        const d = JSON.parse(raw);
        state.employees = d.employees || [];
        state.shifts = d.shifts || {};
    } else {
        state.employees = [];
        state.shifts = {};
    }
}

function saveData() {
    localStorage.setItem(DATA_KEY + '-' + filiale, JSON.stringify({
        employees: state.employees,
        shifts: state.shifts
    }));
    showSave('Gespeichert');
    debouncedWH();
}

function showSave(msg) {
    const el = document.getElementById('save-lbl');
    el.textContent = '✓ ' + msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.textContent = '', 3500);
}

// ── FILIALE EDIT ─────────────────────────
function openFilialEdit() {
    document.getElementById('fil-inp').value = filiale;
    document.getElementById('fil-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('fil-inp').focus(), 50);
}

function closeFil() {
    document.getElementById('fil-modal').style.display = 'none';
}

function saveFil() {
    const v = document.getElementById('fil-inp').value.trim();
    if (!v) return;
    filiale = v;
    localStorage.setItem(FIL_KEY, filiale);
    document.getElementById('fil-display').textContent = filiale;
    document.getElementById('mgmt-fil').textContent = filiale;
    document.getElementById('wh-fil').textContent = filiale;
    document.getElementById('d-fil-ch').textContent = filiale;
    loadData();
    closeFil();
    render();
    updateSyncBadge();
}

// ── DATE / HOLIDAYS ──────────────────────
function getMondayOfWeek(d) {
    const r = new Date(d);
    const dy = r.getDay();
    r.setDate(r.getDate() - (dy === 0 ? 6 : dy - 1));
    r.setHours(0, 0, 0, 0);
    return r;
}

function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getKW(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dn = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dn);
    const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - ys) / 86400000 + 1) / 7);
}

function getEaster(y) {
    const a = y % 19,
        b = Math.floor(y / 100),
        c = y % 100,
        d = Math.floor(b / 4),
        e = b % 4,
        f = Math.floor((b + 8) / 25),
        g = Math.floor((b - f + 1) / 3),
        h = (19 * a + b - d - g + 15) % 30,
        i = Math.floor(c / 4),
        k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7,
        m = Math.floor((a + 11 * h + 22 * l) / 451),
        mo = Math.floor((h + l - 7 * m + 114) / 31),
        dy = (h + l - 7 * m + 114) % 31 + 1;
    return new Date(y, mo - 1, dy);
}

function getHols(y, bl) {
    const ea = getEaster(y),
        a = (d, n) => addDays(d, n),
        f = d => fmtDate(d),
        H = {};
    const s = (d, n) => {
        H[f(d)] = n;
    };
    s(new Date(y, 0, 1), 'Neujahrstag');
    s(a(ea, -2), 'Karfreitag');
    s(a(ea, 1), 'Ostermontag');
    s(new Date(y, 4, 1), 'Tag der Arbeit');
    s(a(ea, 39), 'Christi Himmelfahrt');
    s(a(ea, 50), 'Pfingstmontag');
    s(new Date(y, 9, 3), 'Dt. Einheit');
    s(new Date(y, 11, 25), '1. Weihnachtstag');
    s(new Date(y, 11, 26), '2. Weihnachtstag');
    if (['BY', 'BW', 'ST'].includes(bl)) s(new Date(y, 0, 6), 'Heilige Drei Könige');
    if (['BY', 'BW', 'HE', 'NW', 'RP', 'SL', 'SN', 'TH'].includes(bl)) s(a(ea, 60), 'Fronleichnam');
    if (['BY', 'SL'].includes(bl)) s(new Date(y, 7, 15), 'Mariä Himmelfahrt');
    if (['BY', 'BW', 'NW', 'RP', 'SL'].includes(bl)) s(new Date(y, 10, 1), 'Allerheiligen');
    if (['BB', 'MV', 'SN', 'ST', 'TH', 'HB', 'HH', 'NI', 'SH'].includes(bl)) s(new Date(y, 9, 31), 'Reformationstag');
    return H;
}

function getAllHols(mon, bl) {
    let H = {};
    for (let i = 0; i < 7; i++) Object.assign(H, getHols(addDays(mon, i).getFullYear(), bl));
    return H;
}

// ── CALC ─────────────────────────────────
function calcH(s, e, p) {
    if (!s || !e) return 0;
    const [sh, sm] = s.split(':').map(Number), [eh, em] = e.split(':').map(Number);
    let m = eh * 60 + em - (sh * 60 + sm);
    if (m < 0) m += 1440;
    m -= (p || 0);
    return Math.max(0, m / 60);
}

function fmtH(h) {
    if (!h) return '';
    const v = Math.round(h * 100) / 100;
    return v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ' Std';
}

function vacHPD(emp) {
    // vacation hours per day: explicit override → weeklyTarget/6 → 0
    if (emp && emp.vacationHoursPerDay) return parseFloat(emp.vacationHoursPerDay);
    if (emp && emp.weeklyTarget) return Math.round(parseFloat(emp.weeklyTarget) / 6 * 100) / 100;
    return 0;
}

function wkH(id) {
    let t = 0;
    for (let i = 0; i < 6; i++) {
        const d = fmtDate(addDays(state.monday, i));
        const s = state.shifts[d]?.[id];
        if (s && s.type === 'work' && !s.goFil) t += calcH(s.start, s.end, s.pause);
    }
    return t;
}

function wkD(id) {
    let c = 0;
    for (let i = 0; i < 6; i++) {
        const d = fmtDate(addDays(state.monday, i));
        const s = state.shifts[d]?.[id];
        if (s && s.type === 'work') c++;
    }
    return c;
}

const RK_CAP = 10; // max hours per week for Reinigungskraft

function teamTotalH() {
    // sum all non-RK home employees
    return state.employees
        .filter(e => !e.isGuest && e.type !== 'rk')
        .reduce((sum, e) => sum + wkH(e.id), 0);
}

function dayTotalH(ds) {
    // sum all non-RK, non-guest work shifts for one date
    return state.employees
        .filter(e => !e.isGuest && e.type !== 'rk')
        .reduce((sum, e) => {
            const s = state.shifts[ds]?.[e.id];
            return sum + (s && s.type === 'work' && !s.goFil ? calcH(s.start, s.end, s.pause) : 0);
        }, 0);
}

// ── RENDER ───────────────────────────────
function render() {
    const {
        monday,
        bundesland,
        employees,
        shifts
    } = state;
    const today = fmtDate(new Date());
    const hols = getAllHols(monday, bundesland);
    const end = addDays(monday, 5);
    document.getElementById('kw-lbl').textContent = `KW ${getKW(monday)}`;
    const sm = monday.getMonth() === end.getMonth();
    document.getElementById('dr-lbl').textContent = sm ? `${monday.getDate()}. – ${end.getDate()}. ${MONTHS[monday.getMonth()]} ${monday.getFullYear()}` : `${monday.getDate()}. ${MONTHS[monday.getMonth()]} – ${end.getDate()}. ${MONTHS[end.getMonth()]} ${monday.getFullYear()}`;
    let hc = 0;
    for (let i = 0; i < 6; i++)
        if (hols[fmtDate(addDays(monday, i))]) hc++;
    document.getElementById('hc-lbl').textContent = hc ? `🎉 ${hc} Feiertag${hc>1?'e':''}` : '';;

    const home = employees.filter(e => !e.isGuest);
    const guests = employees.filter(e => e.isGuest);
    const hasG = guests.length > 0;

    // HEAD
    let th = `<tr><th class="day-th day-col"><div class="day-cell" style="min-height:50px"><div style="font-size:9px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px">Tag</div></div></th>`;
    home.forEach(e => {
        th += `<th class="emp-th"><div class="emp-hdr"><div class="emp-name" style="color:${COL[e.col]||'var(--text)'}">${esc(e.name)}</div><div class="emp-role">${esc(e.role)}</div><div class="emp-badges"><span class="badge ${TYPE_B[e.type]||'badge-gfb'}">${TYPE_L[e.type]||e.type}</span></div></div></th>`;
    });
    if (hasG) {
        th += `<th class="div-col"></th>`;
        guests.forEach(e => {
            const u = e.guestUntil ? new Date(e.guestUntil) : null;
            th += `<th class="emp-th"><div class="emp-hdr"><div class="emp-name" style="color:var(--gi)">${esc(e.name)}</div><div class="emp-role">${esc(e.role)}</div><div style="font-size:9px;color:var(--gi);margin-top:2px;font-weight:700">← aus ${esc(e.guestFrom||'?')}</div>${u?`<div style="font-size:9px;color:var(--text3)">bis ${u.getDate()}.${u.getMonth()+1}.</div>`:''}</div></th>`;
        });
    }
    th += '</tr>';
    document.getElementById('t-head').innerHTML = th;

    // BODY
    let body = '';
    for (let i = 0; i < 6; i++) {
        const day = addDays(monday, i);
        const ds = fmtDate(day);
        const isTod = ds === today,
            ft = hols[ds];
        let rc = '';
        if (isTod) rc += ' is-today';
        if (ft) rc += ' is-hol';
        const dl = DAYS[day.getDay()];
        const dt = dayTotalH(ds);
        body += `<tr class="${rc}"><td class="day-col"><div class="day-cell"><div class="day-name">${dl}</div><div class="day-date">${day.getDate()}.${day.getMonth()+1}.</div>${ft?`<div class="ft-tag">🎉 ${esc(ft)}</div>`:''}${isTod&&!ft?'<div style="font-size:9px;color:var(--blue);margin-top:2px;font-weight:700">● HEUTE</div>':''}${dt>0?`<div style="font-size:9px;color:var(--text2);margin-top:3px;font-family:'JetBrains Mono',ui-monospace,monospace;">∑ ${fmtH(dt)}</div>`:''}</div></td>`;
        home.forEach(e => {
            const sh = (shifts[ds] || {})[e.id];
            const isGo = sh && sh.type === 'work' && sh.goFil;
            let cc = 'sc';
            if (isGo) cc += ' go-c';
            else if (sh && sh.type === 'bs') cc += ' bs-c';
            else if (!sh || sh.type === 'free') cc += ' frei-c';
            body += `<td><div class="${cc}" onclick="openShift('${ds}','${e.id}','${dl} ${day.getDate()}.${day.getMonth()+1}.','${esc(e.name)}')" title="Klicken zum Bearbeiten">`;
            if (ft && !sh) {
                body += `<div class="hol-ov">FEIERTAG</div><div class="se">+</div>`;
            } else if (!sh || sh.type === 'free') {
                body += `<div class="frei-line"><svg><line x1="0" y1="0" x2="100%" y2="100%" stroke="var(--text3)" stroke-width="1.5" opacity="0.25"/></svg></div><div class="se">+</div>`;
            } else if (sh.type === 'sick') {
                body += `<div style="color:var(--red);font-size:12px;font-weight:700;margin-top:5px">🤒 Krank</div>${sh.note?`<div class="sn">${esc(sh.note)}</div>`:''}`;
            } else if (sh.type === 'vacation') {
                body += `<div style="color:var(--blue);font-size:12px;font-weight:700;margin-top:5px">🏖 Urlaub</div>`;
                if (sh.note) body += `<div class="sn">${esc(sh.note)}</div>`;
            } else if (sh.type === 'bs') {
                body += `<div style="color:var(--blue);font-size:12px;font-weight:700;margin-top:5px">🏫 BS</div><div style="font-size:10px;color:var(--text3);margin-top:2px">nicht gewertet</div>${sh.note?`<div class="sn">${esc(sh.note)}</div>`:''}`;
            } else if (sh.type === 'absent') {
                body += `<div style="color:var(--text2);font-size:11px;margin-top:5px">◌ Abwesend</div>`;
            } else if (isGo) {
                body += `<div class="go-b">→ ${esc(sh.goFil)}</div>`;
                if (sh.goTimes === 'yes') {
                    const h = calcH(sh.start, sh.end, sh.pause);
                    body += `<div style="font-size:11px;font-family:'JetBrains Mono',ui-monospace,monospace;color:var(--text2)">${sh.start}–${sh.end}</div>`;
                    if (h > 0) body += `<div style="font-size:10px;color:var(--go)">${fmtH(h)}</div>`;
                }
                if (sh.note) body += `<div class="sn">${esc(sh.note)}</div>`;
            } else {
                const h = calcH(sh.start, sh.end, sh.pause);
                body += `<div class="st">${sh.start}<br><span style="color:var(--text3)">–</span>${sh.end}</div>`;
                if (h > 0) body += `<div class="sh">${fmtH(h)}</div>`;
                if (sh.pause > 0) body += `<div class="sp">P: ${sh.pause} Min.</div>`;
                if (sh.note) body += `<div class="sn">${esc(sh.note)}</div>`;
            }
            body += `</div></td>`;
        });
        if (hasG) {
            body += `<td class="div-col"></td>`;
            guests.forEach(e => {
                const sh = (shifts[ds] || {})[e.id];
                let cc = 'sc';
                if (sh && sh.type === 'work') cc += ' gi-c';
                else if (!sh || sh.type === 'free') cc += ' frei-c';
                body += `<td><div class="${cc}" onclick="openShift('${ds}','${e.id}','${dl} ${day.getDate()}.${day.getMonth()+1}.','${esc(e.name)} ← ${esc(e.guestFrom||'')}')">`;
                if (!sh || sh.type === 'free') {
                    body += `<div class="frei-line"><svg><line x1="0" y1="0" x2="100%" y2="100%" stroke="var(--text3)" stroke-width="1.5" opacity="0.2"/></svg></div><div class="se">+</div>`;
                } else if (sh.type === 'work') {
                    const h = calcH(sh.start, sh.end, sh.pause);
                    body += `<div class="gi-b">← ${esc(e.guestFrom||'?')}</div><div class="st" style="font-size:12px">${sh.start}–${sh.end}</div>`;
                    if (h > 0) body += `<div style="font-size:10px;color:var(--gi)">${fmtH(h)}</div>`;
                    if (sh.note) body += `<div class="sn">${esc(sh.note)}</div>`;
                } else {
                    body += `<div style="font-size:11px;color:var(--text2);margin-top:5px">${sh.type==='sick'?'🤒 Krank':sh.type==='vacation'?'🏖 Urlaub':sh.type==='bs'?'🏫 BS':'◌'}</div>`;
                }
                body += `</div></td>`;
            });
        }
        body += '</tr>';
    }
    document.getElementById('t-body').innerHTML = body;

    // FOOT
    const teamH = teamTotalH();
    const teamHFmt = fmtH(teamH);
    let foot = `<tr><td class="day-col"><div style="padding:5px 8px">
    <div class="tot-lbl">Wochenstunden</div>
    ${teamH>0?`<div style="margin-top:4px;padding:4px 6px;background:var(--accent-glow);border:1px solid var(--accent-dim);border-radius:4px;display:inline-block">
      <div style="font-size:8px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px">Team gesamt</div>
      <div style="font-size:12px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',ui-monospace,monospace;margin-top:1px">${teamHFmt}</div>
    </div>`:''}
  </div></td>`;
    home.forEach(e => {
        const h = wkH(e.id),
            d = wkD(e.id);
        const isRK = e.type === 'rk';
        const tgt = e.weeklyTarget ? parseFloat(e.weeklyTarget) : null;
        let diff = '';
        if (isRK) {
            const over = h > RK_CAP;
            const capCls = over ? 'over' : h >= RK_CAP * 0.9 ? 'near' : '';
            diff = `<div style="font-size:9px;margin-top:2px" class="${capCls}">${fmtH(h)||'0 Std'} / ${RK_CAP} Std${over?' <span style=\"color:var(--red)\">⚠</span>':''}</div><div style="font-size:8px;color:var(--text3);margin-top:1px">exkl. Team-Summe</div>`;
            foot += `<td><div style="padding:5px 8px"><div class="tot-h" style="color:${over?'var(--red)':h>0?'var(--text2)':'var(--text3)'}">${h>0?fmtH(h):'—'}</div>${diff}${d>0?`<div style="font-size:9px;color:var(--text2);margin-top:1px">${d}T</div>`:''}</div></td>`;
        } else {
            let cls = '';
            if (tgt) {
                const dv = Math.round((h - tgt) * 100) / 100;
                const sign = dv > 0.05 ? '+' : '';
                cls = dv > 0.05 ? 'over' : dv < -0.5 ? 'under' : 'near';
                diff = `<div style="font-size:9px;margin-top:1px" class="${cls}">${sign}${String(dv).replace('.',',')} / ${String(tgt).replace('.',',')} Std</div>`;
            }
            foot += `<td><div style="padding:5px 8px"><div class="tot-h" style="color:${h>0?'var(--accent)':'var(--text3)'}">${h>0?fmtH(h):'—'}</div>${diff}${d>0?`<div style="font-size:9px;color:var(--text2);margin-top:1px">${d}T</div>`:''}</div></td>`;
        }
    });
    if (hasG) {
        foot += `<td class="div-col"></td>`;
        guests.forEach(e => {
            const h = wkH(e.id);
            foot += `<td><div style="padding:5px 8px"><div class="tot-h" style="color:${h>0?'var(--gi)':'var(--text3)'}">${h>0?fmtH(h):'—'}</div></div></td>`;
        });
    }
    foot += '</tr>';
    document.getElementById('t-foot').innerHTML = foot;
}

// ── SHIFT ────────────────────────────────
function openShift(ds, empId, dayLabel, empName) {
    editCtx = {
        ds,
        empId
    };
    document.getElementById('modal-lbl').textContent = `${dayLabel} · ${empName}`;
    const ex = (state.shifts[ds] || {})[empId];
    document.getElementById('s-start').value = ex?.start || '08:00';
    document.getElementById('s-end').value = ex?.end || '16:00';
    document.getElementById('s-pause').value = ex?.pause ?? 30;
    document.getElementById('s-type').value = ex?.type || 'work';
    document.getElementById('s-note').value = ex?.note || '';
    const goOn = !!(ex?.goFil);
    document.getElementById('go-on').checked = goOn;
    document.getElementById('go-fil').value = ex?.goFil || '';
    document.getElementById('go-times').value = ex?.goTimes || 'yes';
    document.getElementById('go-fields').style.display = goOn ? 'block' : 'none';
    const emp = state.employees.find(e => e.id === empId);
    document.getElementById('go-box').style.display = (emp && emp.isGuest) ? 'none' : 'block';
    document.getElementById('shift-modal').style.display = 'flex';
}

function toggleGo() {
    document.getElementById('go-fields').style.display = document.getElementById('go-on').checked ? 'block' : 'none';
}

function closeShift() {
    document.getElementById('shift-modal').style.display = 'none';
    editCtx = null;
}

function saveShift() {
    if (!editCtx) return;
    const {
        ds,
        empId
    } = editCtx;
    if (!state.shifts[ds]) state.shifts[ds] = {};
    const goOn = document.getElementById('go-on').checked;
    state.shifts[ds][empId] = {
        start: document.getElementById('s-start').value,
        end: document.getElementById('s-end').value,
        pause: parseInt(document.getElementById('s-pause').value) || 0,
        type: document.getElementById('s-type').value,
        note: document.getElementById('s-note').value.trim(),
        goFil: goOn ? document.getElementById('go-fil').value.trim() : '',
        goTimes: document.getElementById('go-times').value,
    };
    closeShift();
    saveData();
    render();
}

function clearShift() {
    if (!editCtx) return;
    const {
        ds,
        empId
    } = editCtx;
    if (state.shifts[ds]) delete state.shifts[ds][empId];
    closeShift();
    saveData();
    render();
}

// ── MGMT ─────────────────────────────────
function showMgmt(tab) {
    mgmtTab = tab || 'staff';
    switchMTab(mgmtTab);
    renderEmpList();
    renderGuestList();
    document.getElementById('mgmt-ov').style.display = 'flex';
}

function closeMgmt() {
    document.getElementById('mgmt-ov').style.display = 'none';
}

function switchMTab(tab) {
    mgmtTab = tab;
    document.getElementById('mt-staff-body').style.display = tab === 'staff' ? 'block' : 'none';
    document.getElementById('mt-guest-body').style.display = tab === 'guest' ? 'block' : 'none';
    document.getElementById('mt-staff').style.background = tab === 'staff' ? 'var(--card2)' : 'var(--card)';
    document.getElementById('mt-guest').style.background = tab === 'guest' ? 'rgba(249,115,22,.18)' : 'var(--card)';
}

function renderEmpList() {
    const home = state.employees.filter(e => !e.isGuest);
    const el = document.getElementById('emp-list');
    if (!home.length) {
        el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:7px">Keine Mitarbeiter. Füge unten welche hinzu.</div>';
        return;
    }
    el.innerHTML = home.map(e => {
        const h = wkH(e.id);
        const tgt = e.weeklyTarget ? parseFloat(e.weeklyTarget) : null;
        let tgtLine = '';
        if (tgt) {
            const dv = Math.round((h - tgt) * 100) / 100;
            const sign = dv > 0 ? '+' : '';
            const cls = dv > 0.05 ? 'over' : dv < -0.5 ? 'under' : 'near';
            tgtLine = `<div class="ei-tgt">Soll <b>${String(tgt).replace('.',',')} Std</b> · Ist <b>${fmtH(h)||'0 Std'}</b> <span class="${cls}">${sign}${String(dv).replace('.',',')} Std</span></div>`;
        }
        return `<div class="ei">
      <div style="width:8px;height:8px;border-radius:50%;background:${COL[e.col]||'#888'};flex-shrink:0"></div>
      <div class="ei-info"><div class="ei-name">${esc(e.name)}</div><div class="ei-meta">${esc(e.role)} · ${TYPE_L[e.type]||e.type}${e.phone?` · 📱`:''}</div>${tgtLine}</div>
      <button class="btn-ic edit" onclick="openEditEmp('${e.id}')" title="Bearbeiten">✏</button>
      <button class="btn-ic" onclick="moveEmp('${e.id}',-1)">▲</button>
      <button class="btn-ic" onclick="moveEmp('${e.id}',1)">▼</button>
      <button class="btn-ic" onclick="removeEmp('${e.id}')">✕</button>
    </div>`;
    }).join('');
}

function renderGuestList() {
    const gs = state.employees.filter(e => e.isGuest);
    const el = document.getElementById('guest-list');
    if (!gs.length) {
        el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:7px">Keine Gäste aktuell.</div>';
        return;
    }
    el.innerHTML = gs.map(e => {
        const u = e.guestUntil ? new Date(e.guestUntil) : null;
        return `<div class="ei gi-item"><div style="width:8px;height:8px;border-radius:50%;background:var(--gi);flex-shrink:0"></div><div class="ei-info"><div class="ei-name" style="color:var(--gi)">${esc(e.name)}</div><div class="ei-meta">← aus Filiale ${esc(e.guestFrom||'?')} · ${esc(e.role)}${u?' · bis '+u.getDate()+'.'+(u.getMonth()+1)+'.':''}</div></div><button class="btn-ic" onclick="removeEmp('${e.id}')">✕</button></div>`;
    }).join('');
}

function addEmp() {
    const name = document.getElementById('n-name').value.trim();
    const role = document.getElementById('n-role').value.trim();
    if (!name) return;
    state.employees.push({
        id: 'e' + Date.now(),
        name,
        role: role || 'Mitarbeiter/-in',
        type: document.getElementById('n-type').value,
        col: document.getElementById('n-col').value,
        isGuest: false
    });
    document.getElementById('n-name').value = '';
    document.getElementById('n-role').value = '';
    saveData();
    renderEmpList();
    render();
}

function addGuest() {
    const name = document.getElementById('gn-name').value.trim();
    const from = document.getElementById('gn-from').value.trim();
    if (!name || !from) return;
    state.employees.push({
        id: 'eg' + Date.now(),
        name,
        role: document.getElementById('gn-role').value.trim() || 'Mitarbeiter/-in',
        type: 'gfb',
        col: document.getElementById('gn-col').value,
        isGuest: true,
        guestFrom: from,
        guestUntil: document.getElementById('gn-until').value || ''
    });
    document.getElementById('gn-name').value = '';
    document.getElementById('gn-from').value = '';
    document.getElementById('gn-role').value = '';
    document.getElementById('gn-until').value = '';
    saveData();
    renderGuestList();
    render();
}

function removeEmp(id) {
    state.employees = state.employees.filter(e => e.id !== id);
    Object.keys(state.shifts).forEach(d => {
        delete state.shifts[d][id];
    });
    saveData();
    renderEmpList();
    renderGuestList();
    render();
}

function moveEmp(id, dir) {
    const arr = state.employees;
    const idx = arr.findIndex(e => e.id === id);
    const ni = idx + dir;
    if (ni < 0 || ni >= arr.length || arr[ni].isGuest) return;
    [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
    saveData();
    renderEmpList();
    render();
}

// ── EDIT EMP ─────────────────────────────
function openEditEmp(id) {
    const e = state.employees.find(x => x.id === id);
    if (!e) return;
    document.getElementById('ee-id').value = id;
    document.getElementById('ee-name').value = e.name;
    document.getElementById('ee-role').value = e.role;
    document.getElementById('ee-type').value = e.type;
    document.getElementById('ee-col').value = e.col || 'blue';
    document.getElementById('ee-target').value = e.weeklyTarget || '';
    document.getElementById('ee-vac').value = e.vacationHoursPerDay || '';
    document.getElementById('ee-phone').value = e.phone || '';
    document.getElementById('edit-emp-modal').style.display = 'flex';
}

function closeEditEmp() {
    document.getElementById('edit-emp-modal').style.display = 'none';
}

function saveEditEmp() {
    const id = document.getElementById('ee-id').value;
    const e = state.employees.find(x => x.id === id);
    if (!e) return;
    e.name = document.getElementById('ee-name').value.trim() || e.name;
    e.role = document.getElementById('ee-role').value.trim() || e.role;
    e.type = document.getElementById('ee-type').value;
    e.col = document.getElementById('ee-col').value;
    const tv = document.getElementById('ee-target').value.trim();
    e.weeklyTarget = tv ? parseFloat(tv) : null;
    const vv = document.getElementById('ee-vac').value.trim();
    e.vacationHoursPerDay = vv ? parseFloat(vv) : null;
    e.phone = document.getElementById('ee-phone').value.trim();
    closeEditEmp();
    saveData();
    renderEmpList();
    render();
}

// ── JSON SAVE / LOAD ─────────────────────
function exportJSON() {
    const data = {
        filiale,
        exportedAt: new Date().toISOString(),
        employees: state.employees.map(e => ({
            name: e.name,
            role: e.role,
            type: e.type,
            col: e.col,
            weeklyTarget: e.weeklyTarget || null,
            vacationHoursPerDay: e.vacationHoursPerDay || null,
            phone: e.phone || '',
            isGuest: e.isGuest || false,
            guestFrom: e.guestFrom || '',
            guestUntil: e.guestUntil || ''
        }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mitarbeiter-${filiale}-${fmtDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSave('Exportiert');
}

function importJSON(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        try {
            const data = JSON.parse(ev.target.result);
            if (!data.employees || !Array.isArray(data.employees)) {
                showImportErr('Keine employees-Liste gefunden.');
                return;
            }
            const imported = data.employees.map(emp => ({
                id: 'e' + Date.now() + Math.random().toString(36).slice(2, 6),
                name: String(emp.name || '').trim(),
                role: String(emp.role || 'Mitarbeiter/-in').trim(),
                type: ['vz', 'tz', 'gfb', 'rk'].includes(emp.type) ? emp.type : 'gfb',
                col: ['blue', 'green', 'yellow', 'red', 'purple'].includes(emp.col) ? emp.col : 'blue',
                weeklyTarget: emp.weeklyTarget ? parseFloat(emp.weeklyTarget) : null,
                vacationHoursPerDay: emp.vacationHoursPerDay ? parseFloat(emp.vacationHoursPerDay) : null,
                phone: String(emp.phone || '').trim(),
                isGuest: !!emp.isGuest,
                guestFrom: String(emp.guestFrom || '').trim(),
                guestUntil: String(emp.guestUntil || '').trim()
            })).filter(e => e.name);
            if (!imported.length) {
                showImportErr('Keine gültigen Mitarbeiter in der Datei.');
                return;
            }
            pendingImport = imported;
            document.getElementById('ic-msg').textContent = `${imported.length} Mitarbeiter${data.filiale?' aus Filiale '+data.filiale:''} gefunden.`;
            document.getElementById('ic-replace').style.display = state.employees.length ? '' : 'none';
            document.getElementById('ic-box').style.display = 'flex';
        } catch (err) {
            showImportErr('Datei konnte nicht gelesen werden.');
        }
        input.value = '';
    };
    reader.readAsText(file);
}

function doImport(mode) {
    document.getElementById('ic-box').style.display = 'none';
    if (!pendingImport) return;
    state.employees = mode === 'replace' ? pendingImport : [...state.employees, ...pendingImport];
    pendingImport = null;
    saveData();
    renderEmpList();
    renderGuestList();
    render();
    showSave('Importiert');
}

function showImportErr(msg) {
    const el = document.getElementById('import-err');
    el.textContent = '⚠ ' + msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 5000);
}

// ── NAV ──────────────────────────────────
function changeWeek(dir) {
    state.monday = addDays(state.monday, dir * 7);
    render();
    updateSyncBadge();
}

function goToday() {
    state.monday = getMondayOfWeek(new Date());
    render();
    updateSyncBadge();
}

function setBL(bl) {
    state.bundesland = bl;
    localStorage.setItem(BL_KEY, bl);
    render();
}

// ── WEBHOOK ──────────────────────────────
const getWH = () => localStorage.getItem(WH_KEY + '-' + filiale) || '';
const setWH = url => localStorage.setItem(WH_KEY + '-' + filiale, url);
const getWHMsgIds = wk => {
    try {
        return JSON.parse(localStorage.getItem(WH_MSG_KEY + '-' + filiale + '-' + wk)) || [];
    } catch {
        return [];
    }
};
const setWHMsgIds = (wk, ids) => localStorage.setItem(WH_MSG_KEY + '-' + filiale + '-' + wk, JSON.stringify(ids));

function updateSyncBadge() {
    const b = document.getElementById('sync-b');
    if (!b) return;
    const hasUrl = !!getWH();
    const hasMsgIds = !!getWHMsgIds(fmtDate(state.monday)).length;
    if (!hasUrl) {
        b.className = 'sync-b sync-none';
        b.textContent = '⬡ Discord';
        return;
    }
    if (!hasMsgIds) {
        b.className = 'sync-b sync-off';
        b.textContent = '⬡ Noch nicht gepostet';
        return;
    }
    if (autoWH) {
        b.className = 'sync-b sync-on';
        b.textContent = '⬡ Auto-Sync aktiv';
    } else {
        b.className = 'sync-b sync-off';
        b.textContent = '⬡ Discord nicht synchron';
    }
}

function toggleAutoWH(on) {
    autoWH = on;
    updateSyncBadge();
    const st = document.getElementById('wh-st');
    if (on && !getWHMsgIds(fmtDate(state.monday)).length && getWH()) {
        st.textContent = '⚠ Erst Jetzt senden klicken';
        autoWH = false;
        document.getElementById('wh-auto').checked = false;
        updateSyncBadge();
        return;
    }
    st.textContent = on ? '✓ Auto-Sync aktiv' : 'Auto-Sync deaktiviert';
    setTimeout(() => st.textContent = '', 3500);
}

function debouncedWH() {
    if (!autoWH || !getWHMsgIds(fmtDate(state.monday)).length) return;
    clearTimeout(_whDebounce);
    _whDebounce = setTimeout(() => postWH(), 2500);
}
async function postWH() {
    const url = getWH();
    if (!url) return;
    const wk = fmtDate(state.monday);
    const chunks = buildDiscordChunks();
    const st = document.getElementById('wh-st');
    if (st) st.textContent = `⏳ Sende ${chunks.length} Nachrichten…`;
    const existingIds = getWHMsgIds(wk);
    const newIds = [];
    let allOk = true;
    try {
        for (let i = 0; i < chunks.length; i++) {
            const text = chunks[i];
            const msgId = existingIds[i] || '';
            let resp;
            if (msgId) {
                resp = await fetch(`${url}/messages/${msgId}?wait=true`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: text
                    })
                });
                if (!resp.ok) resp = null;
            }
            if (!resp || !resp.ok) {
                resp = await fetch(`${url}?wait=true`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: text
                    })
                });
            }
            if (resp && resp.ok) {
                const d = await resp.json();
                newIds.push(d.id);
            } else {
                allOk = false;
                if (st) st.textContent = `✕ Fehler bei Nachricht ${i+1} — URL prüfen`;
                break;
            }
            if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 600));
        }
        if (allOk) {
            setWHMsgIds(wk, newIds);
            document.getElementById('wh-first-notice').style.display = 'none';
            updateSyncBadge();
            showSave(`Gespeichert · Discord ✓ (${chunks.length} Nachrichten)`);
            if (st) st.textContent = `✓ ${chunks.length} Nachrichten gesendet`;
            setTimeout(() => {
                if (st) st.textContent = '';
            }, 4000);
        }
    } catch (e) {
        if (st) st.textContent = '✕ Netzwerkfehler';
        console.error(e);
    }
}

function saveWH() {
    const url = document.getElementById('wh-url').value.trim();
    setWH(url);
    const hasMsgIds = !!getWHMsgIds(fmtDate(state.monday)).length;
    document.getElementById('wh-first-notice').style.display = (url && !hasMsgIds) ? 'block' : 'none';
    if (!url) {
        autoWH = false;
        document.getElementById('wh-auto').checked = false;
    }
    updateSyncBadge();
    const st = document.getElementById('wh-st');
    st.textContent = url ? '✓ URL gespeichert' : '✓ Deaktiviert';
    setTimeout(() => st.textContent = '', 3000);
}

function testWH() {
    postWH();
}

// ── DISCORD TEXT ─────────────────────────
// ── DISCORD TEXT ─────────────────────────
let dcFmt = 'list'; // 'list' | 'table'
let dcChunks = [];
let dcIdx = 0;

function setDcFmt(f) {
    dcFmt = f;
    document.getElementById('dc-fmt-list').style.background = f === 'list' ? 'var(--card2)' : 'var(--card)';
    document.getElementById('dc-fmt-table').style.background = f === 'table' ? 'var(--card2)' : 'var(--card)';
    genDiscord();
}

function buildDayListBlock(ds, day, ft, employees, shifts, hols) {
    const dl = DAYS[day.getDay()];
    const dd = `${day.getDate()}.${day.getMonth()+1}.`;
    let out = '';
    if (ft) {
        out += `🎉 **${dl} ${dd} — ${ft}**\n`;
        return out;
    }
    out += `**${dl} ${dd}**\n`;
    let any = false;
    employees.forEach(emp => {
        const s = (shifts[ds] || {})[emp.id];
        if (!s || s.type === 'free') return;
        any = true;
        const pfx = emp.isGuest ? `← ${emp.guestFrom} ` : '';
        let str = '';
        if (s.type === 'work') {
            if (s.goFil) {
                str = `→ Filiale ${s.goFil}`;
                if (s.goTimes === 'yes') str += ` · ${s.start}–${s.end}`;
            } else {
                const h = calcH(s.start, s.end, s.pause);
                str = `${s.start}–${s.end}${h>0?' ('+fmtH(h)+')':''}`;
            }
        } else if (s.type === 'vacation') {
            str = '🏖 Urlaub';
        } else if (s.type === 'bs') {
            str = '🏫 BS';
        } else str = {
            sick: '🤒 Krank',
            absent: '◌ Abwesend'
        } [s.type] || s.type;
        if (s.note) str += ` · _${s.note}_`;
        out += `  •${pfx}**${emp.name}**: ${str}\n`;
    });
    if (!any) out += `  _– keine Dienste –_\n`;
    const dtD = dayTotalH(ds);
    if (dtD > 0) out += `  _∑ ${fmtH(dtD)} Teamstunden_\n`;
    return out;
}

function buildDayTableBlock(ds, day, ft, employees, shifts) {
    const dl = DAYS[day.getDay()];
    const dd = `${day.getDate()}.${day.getMonth()+1}.`;
    if (ft) return `🎉 **${dl} ${dd} — ${ft}**\n`;
    const workers = employees.filter(e => {
        const s = (shifts[ds] || {})[e.id];
        return s && s.type !== 'free';
    });
    if (!workers.length) return `**${dl} ${dd}**\n_– keine Dienste –_\n`;
    // Discord markdown table
    let out = `**${dl} ${dd}**\n`;
    out += `| Mitarbeiter | Zeit | Std |\n`;
    out += `|:---|:---:|---:|\n`;
    workers.forEach(e => {
        const s = (shifts[ds] || {})[e.id];
        const name = e.name.length > 14 ? e.name.slice(0, 13) + '…' : e.name;
        let zeit = '—',
            std = '';
        if (s.type === 'work' && !s.goFil) {
            zeit = `${s.start}–${s.end}`;
            const h = calcH(s.start, s.end, s.pause);
            if (h > 0) std = fmtH(h);
        } else if (s.type === 'work' && s.goFil) {
            zeit = `→ ${s.goFil}`;
        } else if (s.type === 'vacation') {
            zeit = '🏖 Urlaub';
        } else if (s.type === 'bs') {
            zeit = '🏫 BS';
        } else if (s.type === 'sick') {
            zeit = '🤒 Krank';
        } else if (s.type === 'absent') {
            zeit = '◌ Abw.';
        }
        out += `| ${name} | ${zeit} | ${std} |\n`;
    });
    const dtD = dayTotalH(ds);
    if (dtD > 0) out += `| | **∑ Team** | **${fmtH(dtD)}** |\n`;
    return out;
}

function buildDiscordChunks() {
    const {
        monday,
        employees,
        shifts,
        bundesland
    } = state;
    const hols = getAllHols(monday, bundesland);
    const kw = getKW(monday);
    const end = addDays(monday, 5);
    const dr = `${monday.getDate()}.${monday.getMonth()+1}. – ${end.getDate()}.${end.getMonth()+1}.${monday.getFullYear()}`;
    const header = `📋 **DIENSTPLAN – KW ${kw} | ${dr}**\n**Filiale ${filiale}**\n${'━'.repeat(32)}`;

    // Build day blocks
    const dayBlocks = [];
    for (let i = 0; i < 6; i++) {
        const day = addDays(monday, i);
        const ds = fmtDate(day);
        const ft = hols[ds];
        dayBlocks.push(dcFmt === 'table' ?
            buildDayTableBlock(ds, day, ft, employees, shifts) :
            buildDayListBlock(ds, day, ft, employees, shifts, hols));
    }

    // Build totals block
    let totals = `${'━'.repeat(32)}\n**Gesamtstunden:**\n`;
    const rkEmps = employees.filter(e => !e.isGuest && e.type === 'rk');
    employees.filter(e => !e.isGuest && e.type !== 'rk').forEach(e => {
        const h = wkH(e.id);
        const tgt = e.weeklyTarget ? parseFloat(e.weeklyTarget) : null;
        if (!h) return;
        let line = `  ${e.name}: **${fmtH(h)}**`;
        if (tgt) {
            const dv = Math.round((h - tgt) * 100) / 100;
            const sign = dv > 0 ? '+' : '';
            line += ` (Soll ${String(tgt).replace('.',',')} Std, ${sign}${String(dv).replace('.',',')} Std)`;
        }
        totals += line + '\n';
    });
    totals += `  **Team gesamt: ${fmtH(teamTotalH())||'0 Std'}**\n`;
    if (rkEmps.length) {
        totals += `**Reinigung (exkl.):**\n`;
        rkEmps.forEach(e => {
            const h = wkH(e.id);
            if (h > 0) totals += `  ${e.name}: ${fmtH(h)} / ${RK_CAP} Std${h>RK_CAP?' ⚠':''}\n`;
        });
    }
    const gs = employees.filter(e => e.isGuest);
    if (gs.length) {
        totals += `**Gäste:**\n`;
        gs.forEach(e => {
            const h = wkH(e.id);
            if (h > 0) totals += `  ${e.name} ← ${e.guestFrom}: **${fmtH(h)}**\n`;
        });
    }
    totals += `\n_Stand: ${new Date().toLocaleString('de-DE')}_`;

    // Pack into messages ≤1900 chars: header + greedy-merge days + totals
    const MAX = 1900;
    const chunks = [];
    let cur = header;
    dayBlocks.forEach(block => {
        const candidate = cur + '\n\n' + block;
        if (candidate.length > MAX) {
            if (cur !== header) chunks.push(cur.trim());
            cur = block;
        } else cur = candidate;
    });
    if (cur.trim()) chunks.push(cur.trim());
    // totals always gets its own message
    chunks.push(totals.trim());
    return chunks;
}

function buildDiscordText() {
    return buildDiscordChunks().join('\n\n━━━━━━━━━━━━━━━━\n\n');
}

let _dcChunkIdx = 0;
let _dcChunksCache = [];

function genDiscord() {
    _dcChunksCache = buildDiscordChunks();
    _dcChunkIdx = 0;
    renderDcChunk();
}

function renderDcChunk() {
    const total = _dcChunksCache.length;
    document.getElementById('discord-ta').value = _dcChunksCache[_dcChunkIdx] || '';
    document.getElementById('dc-msg-idx').textContent = _dcChunkIdx + 1;
    document.getElementById('dc-msg-total').textContent = total;
    const labels = ['Kopfzeile + Mo–Mi', 'Do–Sa', 'Gesamt'];
    const auto = ['Kopfzeile', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'Gesamt'];
    document.getElementById('dc-msg-label').textContent = _dcChunkIdx < total - 1 ? `Nachricht ${_dcChunkIdx+1}` : 'Gesamtstunden';
    document.getElementById('dc-prev').disabled = _dcChunkIdx === 0;
    document.getElementById('dc-next').disabled = _dcChunkIdx === total - 1;
    document.getElementById('dc-msg-count').textContent = `${total} Nachrichten`;
}

function dcNavMsg(dir) {
    _dcChunkIdx = Math.max(0, Math.min(_dcChunksCache.length - 1, _dcChunkIdx + dir));
    renderDcChunk();
}

function copyAllDc() {
    const all = _dcChunksCache.join('\n\n');
    navigator.clipboard?.writeText(all).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = all;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    });
    const ok = document.getElementById('dc-ok');
    ok.textContent = '✓ Alle kopiert!';
    ok.style.display = 'inline';
    setTimeout(() => {
        ok.style.display = 'none';
        ok.textContent = '✓ Kopiert!';
    }, 2500);
}

function showDiscord() {
    genDiscord();
    document.getElementById('discord-ov').style.display = 'flex';
    document.getElementById('wh-fil').textContent = filiale || '–';
    document.getElementById('d-fil-ch').textContent = filiale || 'XXXX';
    document.getElementById('wh-url').value = getWH();
    document.getElementById('wh-auto').checked = autoWH;
    document.getElementById('wh-st').textContent = '';
    const hasMsgIds = !!getWHMsgIds(fmtDate(state.monday)).length;
    document.getElementById('wh-first-notice').style.display = (getWH() && !hasMsgIds) ? 'block' : 'none';
    setDcFmt(dcFmt);
    updateSyncBadge();
}

function closeDiscord() {
    document.getElementById('discord-ov').style.display = 'none';
}

// ── WHATSAPP ─────────────────────────────
let waFmt = 'list'; // 'list' | 'table'

function setWAFmt(f) {
    waFmt = f;
    document.getElementById('wa-fmt-list').style.background = f === 'list' ? 'var(--card2)' : 'var(--card)';
    document.getElementById('wa-fmt-table').style.background = f === 'table' ? 'var(--card2)' : 'var(--card)';
    genWA();
}

function padR(s, n) {
    const str = String(s || '');
    return str.length >= n ? str.slice(0, n) : str + ' '.repeat(n - str.length);
}

function padL(s, n) {
    const str = String(s || '');
    return str.length >= n ? str.slice(0, n) : ' '.repeat(n - str.length) + str;
}

function buildWADayTable(ds, day, ft, employees, shifts) {
    const dl = DAYS[day.getDay()];
    const dd = `${day.getDate()}.${day.getMonth()+1}.`;
    if (ft) return `🎉 *${dl} ${dd} — ${ft}*\n`;
    const workers = employees.filter(e => {
        const s = (shifts[ds] || {})[e.id];
        return s && s.type !== 'free';
    });
    if (!workers.length) return `*${dl} ${dd}*\n_– keine Dienste –_\n`;
    let out = `*${dl} ${dd}*\n\`\`\`\n`;
    const NW = 13,
        ZW = 11,
        SW = 8;
    out += padR('Name', NW) + ' ' + padR('Zeit', ZW) + ' ' + padL('Std', SW) + '\n';
    out += '-'.repeat(NW + ZW + SW + 2) + '\n';
    workers.forEach(e => {
        const s = (shifts[ds] || {})[e.id];
        const nm = padR(e.name.split(' ').pop(), NW);
        let zeit = '—',
            std = '';
        if (s.type === 'work' && !s.goFil) {
            zeit = `${s.start}–${s.end}`;
            const h = calcH(s.start, s.end, s.pause);
            if (h > 0) std = fmtH(h);
        } else if (s.type === 'work' && s.goFil) {
            zeit = `→ ${s.goFil}`;
        } else if (s.type === 'vacation') {
            zeit = 'Urlaub';
        } else if (s.type === 'bs') {
            zeit = 'BS';
        } else if (s.type === 'sick') {
            zeit = 'Krank';
        } else if (s.type === 'absent') {
            zeit = 'Abw.';
        }
        out += nm + ' ' + padR(zeit, ZW) + ' ' + padL(std, SW) + '\n';
    });
    const dtD = dayTotalH(ds);
    if (dtD > 0) {
        out += '-'.repeat(NW + ZW + SW + 2) + '\n';
        out += padR('∑ Team', NW) + ' ' + padR('', ZW) + ' ' + padL(fmtH(dtD), SW) + '\n';
    }
    out += '```\n';
    return out;
}

function empTag(e) {
    const first = e.name.split(' ').pop();
    return e.phone ? `@${first}` : e.name;
}

function fmtWAShift(sh, e) {
    if (!sh || sh.type === 'free') return null;
    const tag = empTag(e);
    if (sh.type === 'sick') return `${tag}: 🤒 _krank_`;
    if (sh.type === 'vacation') return `${tag}: 🏖 _Urlaub_`;
    if (sh.type === 'bs') return `${tag}: 🏫 _Berufsschule_`;
    if (sh.type === 'absent') return `${tag}: abwesend`;
    if (sh.type === 'work') {
        if (sh.goFil) {
            const t = sh.goTimes === 'yes' ? ` ${sh.start}–${sh.end}` : '';
            return `${tag}: → Filiale ${sh.goFil}${t}`;
        }
        const h = calcH(sh.start, sh.end, sh.pause);
        let l = `${tag}: ${sh.start}–${sh.end}`;
        if (h > 0) l += ` (${fmtH(h)})`;
        if (sh.note) l += ` – _${sh.note}_`;
        return l;
    }
    return null;
}

function buildWAWeek() {
    const {
        monday,
        employees,
        shifts,
        bundesland
    } = state;
    const hols = getAllHols(monday, bundesland);
    const kw = getKW(monday);
    const end = addDays(monday, 5);
    const dr = `${monday.getDate()}.${monday.getMonth()+1}. – ${end.getDate()}.${end.getMonth()+1}.${monday.getFullYear()}`;
    let out = `*📋 Dienstplan KW ${kw}*\n*Filiale ${filiale} · ${dr}*\n${'─'.repeat(26)}\n\n`;
    for (let i = 0; i < 6; i++) {
        const day = addDays(monday, i);
        const ds = fmtDate(day);
        const ft = hols[ds];
        if (waFmt === 'table') {
            out += buildWADayTable(ds, day, ft, employees, shifts) + '\n';
        } else {
            const dl = DAYS[day.getDay()];
            const dd = `${day.getDate()}.${day.getMonth()+1}.`;
            if (ft) {
                out += `*${dl} ${dd} — 🎉 ${ft}*\n\n`;
                continue;
            }
            out += `*${dl} ${dd}*\n`;
            let any = false;
            employees.forEach(e => {
                const sh = (shifts[ds] || {})[e.id];
                const l = fmtWAShift(sh, e);
                if (l) {
                    out += `  ${l}\n`;
                    any = true;
                }
            });
            const dtD = dayTotalH(ds);
            if (dtD > 0) out += `  _∑ ${fmtH(dtD)} Teamstunden_\n`;
            if (!any) out += `  _– keine Dienste –_\n`;
            out += '\n';
        }
    }
    out += `${'─'.repeat(26)}\n*Gesamtstunden:*\n`;
    const rkListWA = employees.filter(e => !e.isGuest && e.type === 'rk');
    employees.filter(e => !e.isGuest && e.type !== 'rk').forEach(e => {
        const h = wkH(e.id);
        const tgt = e.weeklyTarget ? parseFloat(e.weeklyTarget) : null;
        if (!h) return;
        let l = `  ${e.name}: *${fmtH(h)}*`;
        if (tgt) {
            const dv = Math.round((h - tgt) * 100) / 100;
            const sign = dv > 0 ? '+' : '';
            l += ` (Soll ${String(tgt).replace('.',',')} Std, ${sign}${String(dv).replace('.',',')} Std)`;
        }
        out += l + '\n';
    });
    const tHW = teamTotalH();
    out += `  *Team gesamt: ${fmtH(tHW)||'0 Std'}*\n`;
    if (rkListWA.length) {
        out += `_Reinigung (exkl.):_\n`;
        rkListWA.forEach(e => {
            const h = wkH(e.id);
            if (h > 0) out += `  ${e.name}: ${fmtH(h)} / ${RK_CAP} Std${h>RK_CAP?' ⚠':''}\n`;
        });
    }
    out += `\n_Stand: ${new Date().toLocaleString('de-DE')}_`;
    return out;
}

function buildWADay(idx) {
    const {
        monday,
        employees,
        shifts,
        bundesland
    } = state;
    const hols = getAllHols(monday, bundesland);
    const day = addDays(monday, idx);
    const ds = fmtDate(day);
    const ft = hols[ds];
    const dl = DAYS[day.getDay()];
    const dd = `${day.getDate()}.${day.getMonth()+1}.${day.getFullYear()}`;
    let out = `*📋 Dienst ${dl} ${dd}*\n*Filiale ${filiale}*\n${'─'.repeat(22)}\n\n`;
    if (ft) {
        out += `🎉 *${ft}*\n_Feiertag_\n\n_Stand: ${new Date().toLocaleString('de-DE')}_`;
        return out;
    }
    const sorted = [...employees].sort((a, b) => {
        const sa = (shifts[ds] || {})[a.id];
        const sb = (shifts[ds] || {})[b.id];
        if (!sa || sa.type !== 'work') return 1;
        if (!sb || sb.type !== 'work') return -1;
        return (sa.start || '').localeCompare(sb.start || '');
    });
    let any = false;
    sorted.forEach(e => {
        const sh = (shifts[ds] || {})[e.id];
        const l = fmtWAShift(sh, e);
        if (l) {
            out += `${l}\n`;
            any = true;
        }
    });
    if (!any) out += `_– keine Dienste –_\n`;
    out += `\n_Stand: ${new Date().toLocaleString('de-DE')}_`;
    return out;
}

function buildWAPersonal(empId) {
    const {
        monday,
        employees,
        shifts,
        bundesland
    } = state;
    const hols = getAllHols(monday, bundesland);
    const e = employees.find(x => x.id === empId);
    if (!e) return '';
    const kw = getKW(monday);
    let tot = 0;
    let out = `*📋 Deine Schichten – KW ${kw}*\n*${e.name} · Filiale ${filiale}*\n${'─'.repeat(22)}\n\n`;
    for (let i = 0; i < 6; i++) {
        const day = addDays(monday, i);
        const ds = fmtDate(day);
        const ft = hols[ds];
        const dl = DAYS[day.getDay()];
        const dd = `${day.getDate()}.${day.getMonth()+1}.`;
        const sh = (shifts[ds] || {})[empId];
        if (ft && !sh) {
            out += `${dl} ${dd}: 🎉 _${ft}_\n`;
            continue;
        }
        if (!sh || sh.type === 'free') {
            out += `${dl} ${dd}: frei\n`;
            continue;
        }
        if (sh.type === 'sick') {
            out += `${dl} ${dd}: 🤒 _krank_\n`;
            continue;
        }
        if (sh.type === 'vacation') {
            out += `${dl} ${dd}: 🏖 _Urlaub_\n`;
            continue;
        }
        if (sh.type === 'bs') {
            out += `${dl} ${dd}: 🏫 _Berufsschule_\n`;
            continue;
        }
        if (sh.type === 'work') {
            if (sh.goFil) {
                const t = sh.goTimes === 'yes' ? ` ${sh.start}–${sh.end}` : '';
                out += `${dl} ${dd}: → Filiale ${sh.goFil}${t}\n`;
            } else {
                const h = calcH(sh.start, sh.end, sh.pause);
                tot += h;
                let l = `*${dl} ${dd}: ${sh.start}–${sh.end}*`;
                if (h > 0) l += ` (${fmtH(h)})`;
                if (sh.pause > 0) l += ` P:${sh.pause}Min.`;
                if (sh.note) l += ` – _${sh.note}_`;
                out += l + '\n';
            }
        }
    }
    out += `\n${'─'.repeat(22)}\n*Gesamt: ${fmtH(tot)||'0 Std'}*`;
    if (e.weeklyTarget) {
        const tgt = parseFloat(e.weeklyTarget);
        const dv = Math.round((tot - tgt) * 100) / 100;
        const sign = dv > 0 ? '+' : '';
        out += ` (Soll ${String(tgt).replace('.',',')} Std, ${sign}${String(dv).replace('.',',')} Std)`;
    }
    out += `\n\n_Stand: ${new Date().toLocaleString('de-DE')}_`;
    return out;
}

function showWA() {
    waFmt = 'list';
    waTab = 'week';
    populateWASelects();
    genWA();
    switchWATab('week');
    setWAFmt('list');
    document.getElementById('wa-ov').style.display = 'flex';
}

function closeWA() {
    document.getElementById('wa-ov').style.display = 'none';
}

function populateWASelects() {
    const dsel = document.getElementById('wa-day-sel');
    dsel.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const day = addDays(state.monday, i);
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${DAYS[day.getDay()]} ${day.getDate()}.${day.getMonth()+1}.`;
        if (fmtDate(day) === fmtDate(new Date())) opt.selected = true;
        dsel.appendChild(opt);
    }
    const esel = document.getElementById('wa-emp-sel');
    esel.innerHTML = '';
    state.employees.filter(e => !e.isGuest).forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.name + (e.phone ? ' 📱' : '');
        esel.appendChild(opt);
    });
}

function switchWATab(tab) {
    waTab = tab;
    ['week', 'day', 'personal'].forEach(t => {
        const b = document.getElementById('wa-t-' + t);
        b.style.background = t === tab ? 'var(--card2)' : 'var(--card)';
    });
    document.getElementById('wa-day-pick').style.display = tab === 'day' ? 'block' : 'none';
    document.getElementById('wa-emp-pick').style.display = tab === 'personal' ? 'block' : 'none';
    genWA();
}

function genWA() {
    let t = '';
    if (waTab === 'week') t = buildWAWeek();
    else if (waTab === 'day') t = buildWADay(parseInt(document.getElementById('wa-day-sel').value) || 0);
    else {
        const id = document.getElementById('wa-emp-sel').value;
        t = id ? buildWAPersonal(id) : '';
    }
    document.getElementById('wa-ta').value = t;
}

// ── UTILS ────────────────────────────────
function copyEl(id, okId) {
    const ta = document.getElementById(id);
    ta.select();
    document.execCommand('copy');
    const ok = document.getElementById(okId);
    ok.style.display = 'inline';
    setTimeout(() => ok.style.display = 'none', 2500);
}

function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// backdrop close
['shift-modal', 'edit-emp-modal', 'fil-modal'].forEach(id => document.getElementById(id).addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
}));
['mgmt-ov', 'discord-ov', 'wa-ov'].forEach(id => document.getElementById(id).addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
}));

init();
