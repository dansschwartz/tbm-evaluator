/* ===== TBM Evaluator Admin Dashboard ===== */

// ---- CONFIG ----
const CONFIG = {
    apiBase: window.location.origin,
    get adminKey() {
        return localStorage.getItem('tbm_admin_key') || '';
    },
    set adminKey(val) {
        localStorage.setItem('tbm_admin_key', val);
    }
};

// Prompt for admin key on first visit


// Collapsible AI insight panel
function aiPanel(title, content, startOpen) {
    if (!content) return '';
    var id = 'ai-panel-' + Math.random().toString(36).substr(2, 9);
    var isOpen = startOpen !== false;
    return '<div class="ai-insight-panel" style="margin:12px 0;border:1px solid #d0e8e8;border-radius:10px;overflow:hidden;background:#fafffe;">' +
        '<div class="ai-insight-header" onclick="var b=document.getElementById(\'' + id + '\');var a=this.querySelector(\'i\');b.style.display=b.style.display===\'none\'?\'block\':\'none\';a.style.transform=b.style.display===\'none\'?\'rotate(-90deg)\':\'rotate(0deg)\';" style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:8px;background:#e8f2f2;border-bottom:1px solid #d0e8e8;user-select:none;">' +
            '<i data-lucide="chevron-down" style="width:16px;height:16px;color:#09A1A1;transition:transform 0.2s;' + (isOpen ? '' : 'transform:rotate(-90deg);') + '"></i>' +
            '<i data-lucide="sparkles" style="width:16px;height:16px;color:#09A1A1;"></i>' +
            '<span style="font-weight:600;font-size:14px;color:#333;">' + title + '</span>' +
            '<span style="margin-left:auto;font-size:11px;color:#09A1A1;font-weight:500;">AI Generated</span>' +
        '</div>' +
        '<div id="' + id + '" style="padding:16px;display:' + (isOpen ? 'block' : 'none') + ';">' + renderMd(content) + '</div>' +
    '</div>';
}

// Simple markdown-to-HTML renderer for AI output
function renderMd(text) {
    if (!text) return '';
    var s = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')  // escape HTML
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')  // bold italic
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')  // italic
        .replace(/^### (.*?)$/gm, '<h4 style="margin:12px 0 6px;font-size:14px;color:#333;">$1</h4>')  // h3
        .replace(/^## (.*?)$/gm, '<h3 style="margin:16px 0 8px;font-size:16px;color:#333;">$1</h3>')  // h2
        .replace(/^# (.*?)$/gm, '<h2 style="margin:20px 0 10px;font-size:18px;color:#333;">$1</h2>')  // h1
        .replace(/^- (.*?)$/gm, '<li style="margin:2px 0;margin-left:16px;">$1</li>')  // list items
        .replace(/^\d+\. (.*?)$/gm, '<li style="margin:2px 0;margin-left:16px;">$1</li>')  // numbered lists
        .replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul style="padding-left:4px;margin:8px 0;">$1</ul>')  // wrap lists
        .replace(/\n\n/g, '</p><p style="margin:8px 0;">')  // paragraphs
        .replace(/\n/g, '<br>');  // line breaks
    return '<div style="font-size:14px;line-height:1.6;color:#333;"><p style="margin:8px 0;">' + s + '</p></div>';
}

(function initKey() {
    if (!CONFIG.adminKey) {
        promptAdminKey();
    }
})();

function promptAdminKey() {
    const key = prompt('Enter your Admin API Key:');
    if (key && key.trim()) {
        CONFIG.adminKey = key.trim();
    }
}

// ---- API CACHE (Performance Optimization) ----
var apiCache = {};
function cachedApi(method, url, body, ttl) {
    var key = method + url + JSON.stringify(body || '');
    if (apiCache[key] && Date.now() - apiCache[key].time < (ttl || 30000)) return Promise.resolve(apiCache[key].data);
    return api(method, url, body).then(function(d) { apiCache[key] = {data: d, time: Date.now()}; return d; });
}

// ---- LAZY TAB LOADING ----
var _tabLoaded = {};
function markTabLoaded(section) { _tabLoaded[section] = true; }
function isTabLoaded(section) { return !!_tabLoaded[section]; }

// ---- API HELPER ----
async function api(method, path, body) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': CONFIG.adminKey
        }
    };
    if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
        opts.body = JSON.stringify(body);
    }
    if (method === 'DELETE' && body !== undefined) {
        opts.body = JSON.stringify(body);
    }

    const url = CONFIG.apiBase + path;
    const resp = await fetch(url, opts);

    if (resp.status === 401) {
        toast('Invalid admin key. Please update.', 'error');
        promptAdminKey();
        throw new Error('Unauthorized');
    }

    if (!resp.ok) {
        let detail = `HTTP ${resp.status}`;
        try {
            const err = await resp.json();
            detail = err.detail || JSON.stringify(err);
        } catch (_) {}
        throw new Error(detail);
    }

    return resp.json();
}

// ---- TOAST (Enhanced with icons, stacking, slide animation) ----
var _toastIcons = {
    success: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#09A1A1" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#FA6E82" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#5484A4" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    warning: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#e8b06e" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
};
function toast(message, type) {
    type = type || 'success';
    var container = document.getElementById('toast-container');
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    var iconHtml = _toastIcons[type] || _toastIcons.info;
    el.innerHTML = iconHtml + '<span style="flex:1;">' + (message || '').replace(/</g,'&lt;') + '</span><button class="toast-close">&times;</button>';
    container.appendChild(el);
    el.querySelector('.toast-close').onclick = function() {
        el.classList.add('toast-exit');
        setTimeout(function() { if (el.parentElement) el.remove(); }, 300);
    };
    setTimeout(function() {
        if (el.parentElement) {
            el.classList.add('toast-exit');
            setTimeout(function() { if (el.parentElement) el.remove(); }, 300);
        }
    }, 4000);
}

// ---- LOADING ----
function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

// ---- MODAL ----
function openModal(title, bodyHtml, footerHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml || '';
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

// ---- NAVIGATION ----
const navItems = document.querySelectorAll('.nav-item');
const sections = ['overview', 'organizations', 'templates', 'events', 'players', 'reports', 'draft', 'analytics',
    'ops-overview', 'ops-seasons', 'ops-teams', 'ops-fields', 'ops-schedule', 'ops-coaches', 'ops-comms', 'ops-attendance', 'ops-documents', 'ops-import', 'ops-ai',
    't2-programs', 't2-messages', 't2-videos', 't2-automations', 't2-bookings',
    'intel-health', 'intel-assessment', 'intel-development', 'intel-competition', 'intel-compliance'];

const SECTION_TITLES = {
    'overview': 'Overview', 'organizations': 'Organizations', 'templates': 'Templates',
    'events': 'Events', 'players': 'Players', 'reports': 'Reports', 'draft': 'Draft', 'analytics': 'Analytics',
    'ops-overview': 'Operations Dashboard', 'ops-seasons': 'Seasons & Programs', 'ops-teams': 'Teams',
    'ops-fields': 'Fields & Facilities', 'ops-schedule': 'Schedule', 'ops-coaches': 'Coaches & Staff',
    'ops-comms': 'Communications', 'ops-attendance': 'Attendance', 'ops-documents': 'Documents',
    'ops-import': 'PlayMetrics Import', 'ops-ai': 'AI Assistant',
    't2-programs': 'Training Programs', 't2-messages': 'Messages', 't2-videos': 'Videos',
    't2-automations': 'Automations', 't2-bookings': 'Bookings',
    'intel-health': 'Club Intelligence', 'intel-assessment': 'Best Practices',
    'intel-development': 'Player Development', 'intel-competition': 'Competition',
    'intel-compliance': 'Compliance',
};

function navigateTo(section) {
    sections.forEach(function(s) {
        var el = document.getElementById('section-' + s);
        if (el) el.classList.add('hidden');
    });
    var target = document.getElementById('section-' + section);
    if (target) target.classList.remove('hidden');

    navItems.forEach(function(item) {
        item.classList.toggle('active', item.getAttribute('data-section') === section);
    });

    document.getElementById('page-title').textContent = SECTION_TITLES[section] || section;

    var orgId = getSelectedOrg();

    if (section === 'overview') loadOverview(orgId);
    else if (section === 'organizations') loadOrganizations();
    else if (section === 'templates') loadTemplates(orgId);
    else if (section === 'events') loadEvents(orgId);
    else if (section === 'players') loadPlayers(orgId);
    else if (section === 'reports') loadReportsSection(orgId);
    else if (section === 'draft') loadDraftSection(orgId);
    else if (section === 'analytics') loadAnalyticsSection(orgId);
    // Operations sections
    else if (section === 'ops-overview') loadOpsDashboard(orgId);
    else if (section === 'ops-seasons') loadOpsSeasons(orgId);
    else if (section === 'ops-teams') loadOpsTeams(orgId);
    else if (section === 'ops-fields') loadOpsFields(orgId);
    else if (section === 'ops-schedule') loadOpsSchedule(orgId);
    else if (section === 'ops-coaches') loadOpsCoaches(orgId);
    else if (section === 'ops-comms') loadOpsComms(orgId);
    else if (section === 'ops-attendance') loadOpsAttendance(orgId);
    else if (section === 'ops-documents') loadOpsDocuments(orgId);
    else if (section === 'ops-import') loadOpsImport(orgId);
    else if (section === 'ops-ai') { /* AI assistant is static but needs org context */ }
    // Tier 2 feature sections
    else if (section === 't2-programs') loadPrograms(orgId);
    else if (section === 't2-messages') loadMessages(orgId);
    else if (section === 't2-videos') loadVideos(orgId);
    else if (section === 't2-automations') loadAutomations(orgId);
    else if (section === 't2-bookings') loadBookings(orgId);
    // Intelligence sections
    else if (section === 'intel-health') loadIntelHealth(orgId);
    else if (section === 'intel-assessment') loadIntelAssessment(orgId);
    else if (section === 'intel-development') loadIntelDevelopment(orgId);
    else if (section === 'intel-competition') loadIntelCompetition(orgId);
    else if (section === 'intel-compliance') loadIntelCompliance(orgId);
}

navItems.forEach(function(item) {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('Nav click:', this.getAttribute('data-section'));
        navigateTo(this.getAttribute('data-section'));
        // close mobile menu
        document.getElementById('sidebar').classList.remove('open');
    });
});

// Mobile menu toggle
try { document.getElementById('menu-toggle').addEventListener('click', function() {
    var sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    this.setAttribute('aria-expanded', sidebar.classList.contains('open') ? 'true' : 'false');
}); } catch(e) { console.warn('Menu toggle not found:', e); }

// Change API key button
document.getElementById('btn-change-key').addEventListener('click', function() {
    promptAdminKey();
});

// ---- SELECTED ORG ----
function getSelectedOrg() {
    return document.getElementById('global-org-select').value;
}

function requireOrg() {
    var orgId = getSelectedOrg();
    if (!orgId) {
        toast('Please select an organization first.', 'warning');
        return null;
    }
    return orgId;
}

// Org selector change
document.getElementById('global-org-select').addEventListener('change', function() {
    // Clear cache and tab-loaded state on org change
    apiCache = {};
    _tabLoaded = {};
    // Reload current section
    var active = document.querySelector('.nav-item.active');
    if (active) navigateTo(active.getAttribute('data-section'));
    refreshBadges();
});

// ---- LOAD ORG SELECTOR ----
async function loadOrgSelector() {
    try {
        var orgs = await api('GET', '/api/organizations');
        var select = document.getElementById('global-org-select');
        var current = select.value;
        select.innerHTML = '<option value="">-- Select Org --</option>';
        orgs.forEach(function(org) {
            var opt = document.createElement('option');
            opt.value = org.id;
            opt.textContent = org.name;
            if (org.id === current) opt.selected = true;
            select.appendChild(opt);
        });
    } catch (e) {
        // silent
    }
}

// ===================================================================
// OVERVIEW
// ===================================================================
async function loadOverview(orgId) {
    var statsEl = document.getElementById('overview-stats');
    var eventsBody = document.getElementById('overview-events-body');
    var activityBody = document.getElementById('overview-activity-body');
    var upcomingBody = document.getElementById('overview-upcoming-body');
    var alertsBody = document.getElementById('overview-alerts-body');
    var trendBody = document.getElementById('overview-trend-body');
    var gaugeArc = document.getElementById('health-gauge-arc');
    var gaugeValue = document.getElementById('health-gauge-value');
    var gaugeLabel = document.getElementById('health-gauge-label');

    if (!orgId) {
        statsEl.innerHTML = buildStatCards([
            { value: '--', label: 'Total Players', cls: '', icon: 'users' },
            { value: '--', label: 'Active Teams', cls: 'steel', icon: 'shield' },
            { value: '--', label: 'Events This Season', cls: 'coral', icon: 'calendar-days' },
            { value: '--', label: 'Coach / Player Ratio', cls: 'gold', icon: 'user-check' },
        ]);
        eventsBody.innerHTML = '<p class="text-muted">Select an organization to view data.</p>';
        activityBody.innerHTML = '<p class="text-muted">Select an organization to view activity.</p>';
        upcomingBody.innerHTML = '<p class="text-muted">Select an organization to view schedule.</p>';
        alertsBody.innerHTML = '<p class="text-muted">No alerts at this time.</p>';
        trendBody.innerHTML = '<p class="text-muted" style="width:100%;text-align:center;">Select an organization to view trends.</p>';
        gaugeArc.setAttribute('stroke-dasharray', '0 377');
        gaugeValue.textContent = '--';
        gaugeLabel.textContent = 'Organization health';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    try {
        var data = await api('GET', '/api/organizations/' + orgId + '/analytics');

        // Parallel fetch of supplementary data — each wrapped in try/catch
        var healthData = null;
        var teamsData = null;
        var scheduleData = null;
        var coachesData = null;
        var complianceData = null;

        var results = await Promise.allSettled([
            api('GET', '/api/organizations/' + orgId + '/health-score').catch(function() { return null; }),
            api('GET', '/api/organizations/' + orgId + '/teams').catch(function() { return null; }),
            api('GET', '/api/schedules?org_id=' + orgId + '&upcoming=true&limit=5').catch(function() { return null; }),
            api('GET', '/api/organizations/' + orgId + '/coaches').catch(function() { return null; }),
            api('GET', '/api/documents/' + orgId + '/compliance-check').catch(function() { return null; })
        ]);

        healthData = results[0].status === 'fulfilled' ? results[0].value : null;
        teamsData = results[1].status === 'fulfilled' ? results[1].value : null;
        scheduleData = results[2].status === 'fulfilled' ? results[2].value : null;
        coachesData = results[3].status === 'fulfilled' ? results[3].value : null;
        complianceData = results[4].status === 'fulfilled' ? results[4].value : null;

        // --- Health Score Gauge ---
        var score = (healthData && typeof healthData.score === 'number') ? healthData.score : null;
        if (score !== null) {
            var circumference = 2 * Math.PI * 60; // ~377
            var dashLen = (score / 100) * circumference;
            gaugeArc.setAttribute('stroke-dasharray', dashLen + ' ' + circumference);
            var color = score >= 75 ? '#0a7a6e' : score >= 50 ? 'var(--gold-dark)' : 'var(--coral)';
            gaugeArc.setAttribute('stroke', color);
            gaugeValue.textContent = score;
            gaugeValue.setAttribute('fill', color);
            gaugeLabel.textContent = (healthData.details && healthData.details.summary) ? healthData.details.summary : 'Organization health';
        } else {
            gaugeArc.setAttribute('stroke-dasharray', '0 377');
            gaugeValue.textContent = 'N/A';
            gaugeLabel.textContent = 'Health score unavailable';
        }

        // --- Stat Cards ---
        var totalPlayers = data.total_players || 0;
        var totalTeams = Array.isArray(teamsData) ? teamsData.length : (data.total_teams || '--');
        var totalEvents = data.total_events || 0;
        var totalCoaches = Array.isArray(coachesData) ? coachesData.length : 0;
        var ratio = (totalCoaches > 0 && typeof totalPlayers === 'number' && totalPlayers > 0)
            ? '1 : ' + Math.round(totalPlayers / totalCoaches)
            : '--';

        statsEl.innerHTML = buildStatCards([
            { value: totalPlayers, label: 'Total Players', cls: '', icon: 'users' },
            { value: totalTeams, label: 'Active Teams', cls: 'steel', icon: 'shield' },
            { value: totalEvents, label: 'Events This Season', cls: 'coral', icon: 'calendar-days' },
            { value: ratio, label: 'Coach / Player Ratio', cls: 'gold', icon: 'user-check' },
        ]);

        // --- Activity Feed (from /activity endpoint) ---
        try {
            var activityData = await cachedApi('GET', '/api/organizations/' + orgId + '/activity');
            if (activityData && activityData.length > 0) {
                var activityHtml = '<ul style="list-style:none;padding:0;margin:0;">';
                activityData.slice(0, 10).forEach(function(a) {
                    var iconName = a.icon || 'circle-dot';
                    var iconColors = {player:'#09A1A1', score:'var(--steel)', report:'var(--gold-dark)', match:'var(--coral)', message:'#5484A4', attendance:'#0a7a6e', document:'#6c757d'};
                    var iconColor = iconColors[a.type] || 'var(--steel)';
                    var timeAgo = a.timestamp ? formatTimeAgo(a.timestamp) : '';
                    activityHtml += '<li style="padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:10px;">' +
                        '<i data-lucide="' + iconName + '" style="width:14px;height:14px;color:' + iconColor + ';flex-shrink:0;"></i>' +
                        '<div style="flex:1;min-width:0;">' +
                        '<span style="font-size:13px;">' + esc(a.description) + '</span>' +
                        '<div style="font-size:11px;color:#adb5bd;">' + timeAgo + '</div>' +
                        '</div></li>';
                });
                activityHtml += '</ul>';
                activityBody.innerHTML = activityHtml;
            } else {
                activityBody.innerHTML = '<p class="text-muted">No recent activity.</p>';
            }
        } catch (_) {
            activityBody.innerHTML = '<p class="text-muted">No recent activity.</p>';
        }

        // --- Recent Events Table (kept from original) ---
        if (data.recent_events && data.recent_events.length > 0) {
            var rows = data.recent_events.map(function(ev) {
                return '<tr>' +
                    '<td>' + esc(ev.name) + '</td>' +
                    '<td>' + esc(ev.event_type) + '</td>' +
                    '<td>' + (ev.event_date || '--') + '</td>' +
                    '<td><span class="badge badge-' + ev.status + '">' + esc(ev.status) + '</span></td>' +
                    '</tr>';
            }).join('');
            eventsBody.innerHTML = '<table class="data-table"><thead><tr><th>Name</th><th>Type</th><th>Date</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>';
        } else {
            eventsBody.innerHTML = '<p class="text-muted">No events yet.</p>';
        }

        // --- Upcoming Schedule ---
        if (Array.isArray(scheduleData) && scheduleData.length > 0) {
            var schedHtml = '<ul style="list-style:none;padding:0;margin:0;">';
            scheduleData.forEach(function(item) {
                schedHtml += '<li style="padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:10px;">' +
                    '<i data-lucide="clock" style="width:14px;height:14px;color:var(--coral);flex-shrink:0;"></i>' +
                    '<div style="flex:1;min-width:0;">' +
                    '<strong style="font-size:13px;">' + esc(item.title || item.name || 'Scheduled Event') + '</strong>' +
                    '<div style="font-size:12px;color:#6c757d;">' + esc(item.date || item.start_date || '--') +
                    (item.location ? ' &middot; ' + esc(item.location) : '') + '</div>' +
                    '</div></li>';
            });
            schedHtml += '</ul>';
            upcomingBody.innerHTML = schedHtml;
        } else {
            upcomingBody.innerHTML = '<p class="text-muted">No upcoming events scheduled.</p>';
        }

        // --- Alerts Panel ---
        var alerts = (complianceData && Array.isArray(complianceData.alerts)) ? complianceData.alerts : [];
        if (alerts.length > 0) {
            var alertsHtml = '<ul style="list-style:none;padding:0;margin:0;">';
            alerts.forEach(function(alert) {
                var severity = alert.severity || 'warning';
                var iconName = severity === 'error' ? 'alert-circle' : 'alert-triangle';
                var iconColor = severity === 'error' ? 'var(--coral)' : 'var(--gold-dark)';
                alertsHtml += '<li style="padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:10px;">' +
                    '<i data-lucide="' + iconName + '" style="width:14px;height:14px;color:' + iconColor + ';flex-shrink:0;"></i>' +
                    '<span style="font-size:13px;">' + esc(alert.message || alert.title || String(alert)) + '</span>' +
                    '</li>';
            });
            alertsHtml += '</ul>';
            alertsBody.innerHTML = alertsHtml;
        } else {
            alertsBody.innerHTML = '<p class="text-muted" style="display:flex;align-items:center;gap:6px;"><i data-lucide="check-circle" style="width:16px;height:16px;color:#0a7a6e;"></i> All clear — no compliance alerts.</p>';
        }

        // --- Registration Trend Mini Bar Chart ---
        var trendData = (data.registration_trend && Array.isArray(data.registration_trend))
            ? data.registration_trend
            : [12, 18, 25, 22, 30, 28, 35, 40, 38, 45, 42, 48]; // fallback sample data
        var maxVal = Math.max.apply(null, trendData);
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var barHtml = '';
        trendData.forEach(function(val, i) {
            var pct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
            barHtml += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">' +
                '<div style="font-size:10px;color:#6c757d;margin-bottom:2px;">' + val + '</div>' +
                '<div style="width:100%;max-width:28px;background:var(--steel);border-radius:3px 3px 0 0;height:' + pct + '%;min-height:4px;transition:height 0.3s;"></div>' +
                '<div style="font-size:9px;color:#adb5bd;margin-top:2px;">' + (months[i] || '') + '</div>' +
                '</div>';
        });
        trendBody.innerHTML = barHtml;

        // Render Lucide icons for dynamically-inserted markup
        if (typeof lucide !== 'undefined') lucide.createIcons();

    } catch (e) {
        statsEl.innerHTML = '';
        eventsBody.innerHTML = '<p class="text-muted">Error loading data: ' + esc(e && e.message ? e.message : String(e)) + '</p>';
    }
}

function buildStatCards(items) {
    return items.map(function(item) {
        var iconHtml = item.icon
            ? '<i data-lucide="' + item.icon + '" style="width:22px;height:22px;color:var(--steel);margin-bottom:6px;"></i>'
            : '';
        return '<div class="stat-card ' + item.cls + '">' +
            iconHtml +
            '<div class="stat-value">' + item.value + '</div>' +
            '<div class="stat-label">' + item.label + '</div>' +
            '</div>';
    }).join('');
}

// ---- CSV EXPORT ----
function downloadCSV(data, filename) {
    if (!data || data.length === 0) { toast('No data to export', 'warning'); return; }
    var keys = Object.keys(data[0]);
    var csv = keys.join(',') + '\n';
    data.forEach(function(row) {
        csv += keys.map(function(k) {
            var val = row[k] == null ? '' : String(row[k]);
            if (val.indexOf(',') !== -1 || val.indexOf('"') !== -1 || val.indexOf('\n') !== -1) {
                val = '"' + val.replace(/"/g, '""') + '"';
            }
            return val;
        }).join(',') + '\n';
    });
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || 'export.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    toast('CSV exported: ' + filename, 'success');
}

function exportPlayers() {
    if (!cachedPlayers || cachedPlayers.length === 0) { toast('No players to export', 'warning'); return; }
    downloadCSV(cachedPlayers.map(function(p) {
        return { Name: p.first_name + ' ' + p.last_name, Age_Group: p.age_group || '', Position: p.position || '', Jersey: p.jersey_number || '', Parent_Email: p.parent_email || '', Active: p.active ? 'Yes' : 'No' };
    }), 'players_export.csv');
}

function exportSchedule() {
    var rows = document.querySelectorAll('#schedule-table-body tr');
    if (rows.length === 0 || rows[0].cells.length < 5) { toast('No schedule data to export', 'warning'); return; }
    var data = [];
    rows.forEach(function(tr) {
        if (tr.cells.length >= 6) {
            data.push({ Date: tr.cells[0].textContent, Time: tr.cells[1].textContent, Type: tr.cells[2].textContent.trim(), Title: tr.cells[3].textContent, Field: tr.cells[4].textContent, Status: tr.cells[5].textContent.trim() });
        }
    });
    downloadCSV(data, 'schedule_export.csv');
}

function exportCompetition() {
    var rows = document.querySelectorAll('#standings-table-body tr');
    if (rows.length === 0 || rows[0].cells.length < 10) { toast('No standings data to export', 'warning'); return; }
    var data = [];
    rows.forEach(function(tr) {
        if (tr.cells.length >= 10) {
            data.push({ Team: tr.cells[0].textContent, League: tr.cells[1].textContent, P: tr.cells[2].textContent, W: tr.cells[3].textContent, D: tr.cells[4].textContent, L: tr.cells[5].textContent, GF: tr.cells[6].textContent, GA: tr.cells[7].textContent, GD: tr.cells[8].textContent, Pts: tr.cells[9].textContent });
        }
    });
    downloadCSV(data, 'competition_export.csv');
}

// ---- NOTIFICATION BADGES ----
var _badgeCounts = { coaches: 0, documents: 0, compliance: 0 };

async function refreshBadges() {
    var orgId = getSelectedOrg();
    if (!orgId) {
        _badgeCounts = { coaches: 0, documents: 0, compliance: 0 };
        renderBadges();
        return;
    }
    try {
        var coaches = await api('GET', '/api/organizations/' + orgId + '/coaches');
        var expiring = 0;
        var now = new Date();
        var thirtyDays = new Date(now.getTime() + 30 * 86400000);
        coaches.forEach(function(c) {
            (c.certifications || []).forEach(function(cert) {
                if (cert.expiry && new Date(cert.expiry) <= thirtyDays) expiring++;
            });
        });
        _badgeCounts.coaches = expiring;
    } catch (_) {}
    try {
        var missing = await api('GET', '/api/organizations/' + orgId + '/documents/missing');
        _badgeCounts.documents = (missing.players || []).length;
    } catch (_) {}
    try {
        var comp = await api('GET', '/api/organizations/' + orgId + '/compliance');
        _badgeCounts.compliance = (comp.expiring_count || 0) + (comp.missing_count || 0);
    } catch (_) {}
    renderBadges();
}

function renderBadges() {
    var mapping = { 'ops-coaches': _badgeCounts.coaches, 'ops-documents': _badgeCounts.documents, 'intel-compliance': _badgeCounts.compliance };
    for (var section in mapping) {
        var navEl = document.querySelector('.nav-item[data-section="' + section + '"]');
        if (!navEl) continue;
        var existing = navEl.querySelector('.nav-badge');
        if (existing) existing.remove();
        if (mapping[section] > 0) {
            var badge = document.createElement('span');
            badge.className = 'nav-badge';
            badge.textContent = mapping[section];
            badge.style.cssText = 'position:absolute;top:50%;right:8px;transform:translateY(-50%);background:#FA6E82;color:#fff;font-size:10px;font-weight:700;min-width:18px;height:18px;line-height:18px;text-align:center;border-radius:9px;padding:0 4px;';
            navEl.style.position = 'relative';
            navEl.appendChild(badge);
        }
    }
}

// ---- GLOBAL SEARCH ----
var _searchTimeout = null;

function globalSearch(query) {
    var dropdown = document.getElementById('global-search-dropdown');
    if (!query || query.length < 2) { dropdown.classList.add('hidden'); return; }
    var orgId = getSelectedOrg();
    if (!orgId) { dropdown.innerHTML = '<div style="padding:12px;color:#888;">Select an organization first</div>'; dropdown.classList.remove('hidden'); return; }

    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(async function() {
        dropdown.innerHTML = '<div style="padding:12px;color:#888;">Searching...</div>';
        dropdown.classList.remove('hidden');
        var results = [];
        try {
            var players = await api('GET', '/api/organizations/' + orgId + '/players');
            var q = query.toLowerCase();
            players.forEach(function(p) {
                var name = p.first_name + ' ' + p.last_name;
                if (name.toLowerCase().indexOf(q) !== -1) results.push({ type: 'Player', icon: 'users', name: name, section: 'players' });
            });
        } catch (_) {}
        try {
            var teams = await api('GET', '/api/organizations/' + orgId + '/teams');
            teams.forEach(function(t) {
                if ((t.name || '').toLowerCase().indexOf(query.toLowerCase()) !== -1) results.push({ type: 'Team', icon: 'shirt', name: t.name, section: 'ops-teams' });
            });
        } catch (_) {}
        try {
            var events = await api('GET', '/api/organizations/' + orgId + '/events');
            events.forEach(function(e) {
                if ((e.name || '').toLowerCase().indexOf(query.toLowerCase()) !== -1) results.push({ type: 'Event', icon: 'calendar-days', name: e.name, section: 'events' });
            });
        } catch (_) {}
        try {
            var coaches = await api('GET', '/api/organizations/' + orgId + '/coaches');
            coaches.forEach(function(c) {
                if ((c.name || '').toLowerCase().indexOf(query.toLowerCase()) !== -1) results.push({ type: 'Coach', icon: 'graduation-cap', name: c.name, section: 'ops-coaches' });
            });
        } catch (_) {}

        if (results.length === 0) {
            dropdown.innerHTML = '<div style="padding:12px;color:#888;">No results found</div>';
        } else {
            dropdown.innerHTML = results.slice(0, 12).map(function(r) {
                return '<div class="search-result-item" onclick="navigateTo(\'' + r.section + '\');document.getElementById(\'global-search-dropdown\').classList.add(\'hidden\');document.getElementById(\'global-search-input\').value=\'\';" style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f0f0f0;">' +
                    '<i data-lucide="' + r.icon + '" style="width:16px;height:16px;color:#09A1A1;"></i>' +
                    '<div><div style="font-weight:600;font-size:13px;">' + esc(r.name) + '</div><div style="font-size:11px;color:#888;">' + r.type + '</div></div></div>';
            }).join('');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }, 300);
}

document.addEventListener('click', function(e) {
    var dropdown = document.getElementById('global-search-dropdown');
    var input = document.getElementById('global-search-input');
    if (dropdown && input && !dropdown.contains(e.target) && e.target !== input) {
        dropdown.classList.add('hidden');
    }
});

// ===================================================================
// ORGANIZATIONS
// ===================================================================
async function loadOrganizations() {
    var tbody = document.getElementById('orgs-table-body');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted"><div class="skeleton-row" style="width:60%;margin:0 auto;"></div><div class="skeleton-row" style="width:80%;margin:4px auto 0;"></div><div class="skeleton-row" style="width:50%;margin:4px auto 0;"></div></td></tr>';

    try {
        var orgs = await api('GET', '/api/organizations');
        if (orgs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No organizations yet.</td></tr>';
            return;
        }

        tbody.innerHTML = orgs.map(function(org) {
            return '<tr>' +
                '<td><strong>' + esc(org.name) + '</strong></td>' +
                '<td>' + esc(org.slug) + '</td>' +
                '<td>' + esc(org.sport) + '</td>' +
                '<td>' + esc(org.contact_email || '--') + '</td>' +
                '<td><span class="api-key-display" title="Click to copy" onclick="copyText(\'' + esc(org.api_key || '') + '\')">' + esc(org.api_key || '--') + '</span></td>' +
                '<td><span class="badge badge-' + (org.active ? 'yes' : 'no') + '">' + (org.active ? 'Yes' : 'No') + '</span></td>' +
                '<td class="btn-group">' +
                    '<button class="btn btn-xs btn-outline" onclick="editOrganization(\'' + org.id + '\')">Edit</button>' +
                    '<button class="btn btn-xs btn-danger" onclick="deleteOrganization(\'' + org.id + '\', \'' + esc(org.name) + '\')">Delete</button>' +
                '</td>' +
                '</tr>';
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Error: ' + esc(e.message) + '</td></tr>';
    }
}

document.getElementById('btn-create-org').addEventListener('click', function() {
    openModal('Create Organization', orgFormHtml(), '<button class="btn btn-primary" onclick="submitCreateOrg()">Create</button><button class="btn btn-outline" onclick="closeModal()">Cancel</button>');
});

function orgFormHtml(org) {
    org = org || {};
    return '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Name</label><input class="form-input" id="f-org-name" value="' + esc(org.name || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">Slug</label><input class="form-input" id="f-org-slug" value="' + esc(org.slug || '') + '" ' + (org.id ? 'disabled' : '') + '></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Sport</label>' +
            '<select class="form-select" id="f-org-sport">' +
            '<option value="soccer"' + (org.sport === 'soccer' ? ' selected' : '') + '>Soccer</option>' +
            '<option value="basketball"' + (org.sport === 'basketball' ? ' selected' : '') + '>Basketball</option>' +
            '<option value="baseball"' + (org.sport === 'baseball' ? ' selected' : '') + '>Baseball</option>' +
            '<option value="football"' + (org.sport === 'football' ? ' selected' : '') + '>Football</option>' +
            '<option value="hockey"' + (org.sport === 'hockey' ? ' selected' : '') + '>Hockey</option>' +
            '<option value="lacrosse"' + (org.sport === 'lacrosse' ? ' selected' : '') + '>Lacrosse</option>' +
            '</select></div>' +
        '<div class="form-group"><label class="form-label">Contact Email</label><input class="form-input" id="f-org-email" value="' + esc(org.contact_email || '') + '"></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Primary Color</label><input type="color" class="form-input" id="f-org-color1" value="' + esc(org.primary_color || '#09A1A1') + '"></div>' +
        '<div class="form-group"><label class="form-label">Secondary Color</label><input type="color" class="form-input" id="f-org-color2" value="' + esc(org.secondary_color || '#5484A4') + '"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Logo URL</label><input class="form-input" id="f-org-logo" value="' + esc(org.logo_url || '') + '"></div>';
}

async function submitCreateOrg() {
    // Client-side validation
    markRequiredFields(['f-org-name', 'f-org-slug']);
    if (!validateForm([
        { id: 'f-org-name', required: true, label: 'Name', minLength: 2 },
        { id: 'f-org-slug', required: true, label: 'Slug', pattern: /^[a-z0-9-]+$/, patternMsg: 'Slug must be lowercase letters, numbers, and hyphens only' },
        { id: 'f-org-email', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMsg: 'Enter a valid email address' }
    ])) return;

    var data = {
        name: document.getElementById('f-org-name').value.trim(),
        slug: document.getElementById('f-org-slug').value.trim(),
        sport: document.getElementById('f-org-sport').value,
        contact_email: document.getElementById('f-org-email').value.trim() || null,
        primary_color: document.getElementById('f-org-color1').value,
        secondary_color: document.getElementById('f-org-color2').value,
        logo_url: document.getElementById('f-org-logo').value.trim() || null,
        settings: {}
    };

    try {
        showLoading();
        await api('POST', '/api/organizations', data);
        closeModal();
        toast('Organization created!');
        loadOrganizations();
        loadOrgSelector();
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function editOrganization(id) {
    try {
        showLoading();
        var org = await api('GET', '/api/organizations/' + id);
        hideLoading();

        openModal('Edit Organization', orgFormHtml(org),
            '<button class="btn btn-primary" onclick="submitEditOrg(\'' + id + '\')">Save</button><button class="btn btn-outline" onclick="closeModal()">Cancel</button>');
    } catch (e) {
        hideLoading();
        toast('Error: ' + e.message, 'error');
    }
}

async function submitEditOrg(id) {
    var data = {
        name: document.getElementById('f-org-name').value.trim(),
        sport: document.getElementById('f-org-sport').value,
        contact_email: document.getElementById('f-org-email').value.trim() || null,
        primary_color: document.getElementById('f-org-color1').value,
        secondary_color: document.getElementById('f-org-color2').value,
        logo_url: document.getElementById('f-org-logo').value.trim() || null
    };

    try {
        showLoading();
        await api('PATCH', '/api/organizations/' + id, data);
        closeModal();
        toast('Organization updated!');
        loadOrganizations();
        loadOrgSelector();
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteOrganization(id, name) {
    if (!confirm('Delete organization "' + name + '"? This will delete all related data.')) return;

    try {
        showLoading();
        await api('DELETE', '/api/organizations/' + id);
        toast('Organization deleted.');
        loadOrganizations();
        loadOrgSelector();
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

function copyText(text) {
    if (!text || text === '--') return;
    navigator.clipboard.writeText(text).then(function() {
        toast('Copied to clipboard!');
    });
}

// ===================================================================
// TEMPLATES
// ===================================================================
async function loadTemplates(orgId) {
    var tbody = document.getElementById('templates-table-body');

    if (!orgId) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Select an organization to view templates.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted"><div class="skeleton-row" style="width:60%;margin:0 auto;"></div><div class="skeleton-row" style="width:80%;margin:4px auto 0;"></div><div class="skeleton-row" style="width:50%;margin:4px auto 0;"></div></td></tr>';

    try {
        var templates = await api('GET', '/api/organizations/' + orgId + '/templates');
        if (templates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No templates yet. Create one or load from a preset.</td></tr>';
            return;
        }

        tbody.innerHTML = templates.map(function(t) {
            return '<tr>' +
                '<td><strong>' + esc(t.name) + '</strong></td>' +
                '<td>' + esc(t.sport) + '</td>' +
                '<td>' + (t.skills ? t.skills.length : 0) + '</td>' +
                '<td>' + (t.categories ? t.categories.join(', ') : '--') + '</td>' +
                '<td><span class="badge badge-' + (t.is_default ? 'yes' : 'no') + '">' + (t.is_default ? 'Yes' : 'No') + '</span></td>' +
                '<td class="btn-group">' +
                    '<button class="btn btn-xs btn-outline" onclick="viewTemplate(\'' + t.id + '\')">View</button>' +
                    '<button class="btn btn-xs btn-outline" onclick="editTemplate(\'' + t.id + '\')">Edit</button>' +
                    '<button class="btn btn-xs btn-danger" onclick="deleteTemplate(\'' + t.id + '\', \'' + esc(t.name) + '\')">Delete</button>' +
                '</td>' +
                '</tr>';
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Error: ' + esc(e.message) + '</td></tr>';
    }
}

document.getElementById('btn-create-template').addEventListener('click', function() {
    if (!requireOrg()) return;
    showTemplateForm();
});

function showTemplateForm(template) {
    template = template || {};
    var skills = template.skills || [];

    var html = '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Name</label><input class="form-input" id="f-tpl-name" value="' + esc(template.name || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">Sport</label>' +
            '<select class="form-select" id="f-tpl-sport" onchange="loadPresetSkills()">' +
            '<option value="soccer"' + (template.sport === 'soccer' || !template.sport ? ' selected' : '') + '>Soccer</option>' +
            '<option value="basketball"' + (template.sport === 'basketball' ? ' selected' : '') + '>Basketball</option>' +
            '<option value="baseball"' + (template.sport === 'baseball' ? ' selected' : '') + '>Baseball</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Categories (comma-separated)</label><input class="form-input" id="f-tpl-categories" value="' + esc((template.categories || []).join(', ')) + '"></div>' +
        '<div class="form-group"><div class="form-check"><input type="checkbox" id="f-tpl-default" ' + (template.is_default ? 'checked' : '') + '><label class="form-label" style="margin:0">Default Template</label></div></div>' +
        '<div class="form-group">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
                '<label class="form-label" style="margin:0">Skills</label>' +
                '<div class="btn-group">' +
                    '<button class="btn btn-xs btn-outline" onclick="loadPresetSkills()">Load Preset</button>' +
                    '<button class="btn btn-xs btn-primary" onclick="addSkillRow()">+ Add Skill</button>' +
                '</div>' +
            '</div>' +
            '<div class="skill-list" id="skill-editor">' +
                '<div class="skill-item" style="font-weight:600;background:#f8fafc">' +
                    '<span>Name</span><span>Category</span><span>Type</span><span>Weight</span><span></span>' +
                '</div>' +
            '</div>' +
        '</div>';

    var isEdit = !!template.id;
    var footer = '<button class="btn btn-primary" onclick="submitTemplate(' + (isEdit ? '\'' + template.id + '\'' : 'null') + ')">' + (isEdit ? 'Save' : 'Create') + '</button>' +
        '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>';

    openModal((isEdit ? 'Edit' : 'Create') + ' Template', html, footer);

    // Populate existing skills
    skills.forEach(function(sk) {
        addSkillRow(sk);
    });
}

function addSkillRow(skill) {
    skill = skill || {};
    var editor = document.getElementById('skill-editor');
    var row = document.createElement('div');
    row.className = 'skill-item';
    row.innerHTML =
        '<input class="sk-name" placeholder="Skill name" value="' + esc(skill.name || '') + '">' +
        '<input class="sk-category" placeholder="Category" value="' + esc(skill.category || '') + '">' +
        '<select class="sk-type"><option value="scale_1_5"' + (skill.scoring_type === 'scale_1_5' || !skill.scoring_type ? ' selected' : '') + '>1-5</option><option value="scale_1_10"' + (skill.scoring_type === 'scale_1_10' ? ' selected' : '') + '>1-10</option><option value="yes_no"' + (skill.scoring_type === 'yes_no' ? ' selected' : '') + '>Yes/No</option></select>' +
        '<input class="sk-weight" type="number" step="0.1" min="0" max="5" value="' + (skill.weight !== undefined ? skill.weight : 1.0) + '">' +
        '<button class="btn-remove-skill" onclick="this.parentElement.remove()">&times;</button>';
    editor.appendChild(row);
}

async function loadPresetSkills() {
    var sport = document.getElementById('f-tpl-sport').value;
    try {
        var preset = await api('GET', '/api/templates/presets/' + sport);
        // Clear existing skills
        var editor = document.getElementById('skill-editor');
        var headerRow = editor.querySelector('.skill-item');
        editor.innerHTML = '';
        editor.appendChild(headerRow);

        // Set categories
        document.getElementById('f-tpl-categories').value = (preset.categories || []).join(', ');

        // Add skills
        (preset.skills || []).forEach(function(sk) {
            addSkillRow(sk);
        });

        // Update name if empty
        var nameEl = document.getElementById('f-tpl-name');
        if (!nameEl.value) nameEl.value = preset.name || '';

        toast('Loaded ' + sport + ' preset!');
    } catch (e) {
        toast('Error loading preset: ' + e.message, 'error');
    }
}

function gatherSkills() {
    var rows = document.querySelectorAll('#skill-editor .skill-item');
    var skills = [];
    rows.forEach(function(row, idx) {
        if (idx === 0) return; // header
        var name = row.querySelector('.sk-name').value.trim();
        if (!name) return;
        skills.push({
            name: name,
            category: row.querySelector('.sk-category').value.trim(),
            scoring_type: row.querySelector('.sk-type').value,
            weight: parseFloat(row.querySelector('.sk-weight').value) || 1.0,
            description: ''
        });
    });
    return skills;
}

async function submitTemplate(editId) {
    var orgId = getSelectedOrg();
    if (!orgId) { toast('Select an organization.', 'error'); return; }

    var categories = document.getElementById('f-tpl-categories').value
        .split(',').map(function(c) { return c.trim(); }).filter(Boolean);

    var data = {
        name: document.getElementById('f-tpl-name').value.trim(),
        sport: document.getElementById('f-tpl-sport').value,
        categories: categories,
        skills: gatherSkills(),
        is_default: document.getElementById('f-tpl-default').checked
    };

    if (!data.name) { toast('Name is required.', 'error'); return; }

    try {
        showLoading();
        if (editId) {
            await api('PATCH', '/api/templates/' + editId, data);
            toast('Template updated!');
        } else {
            await api('POST', '/api/organizations/' + orgId + '/templates', data);
            toast('Template created!');
        }
        closeModal();
        loadTemplates(orgId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function viewTemplate(id) {
    try {
        showLoading();
        var t = await api('GET', '/api/templates/' + id);
        hideLoading();

        var skillsHtml = (t.skills || []).map(function(s) {
            return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.category) + '</td><td>' + esc(s.scoring_type) + '</td><td>' + s.weight + '</td><td>' + esc(s.description || '') + '</td></tr>';
        }).join('');

        openModal('Template: ' + t.name,
            '<p><strong>Sport:</strong> ' + esc(t.sport) + '</p>' +
            '<p><strong>Categories:</strong> ' + esc((t.categories || []).join(', ')) + '</p>' +
            '<p><strong>Default:</strong> ' + (t.is_default ? 'Yes' : 'No') + '</p>' +
            '<hr style="margin:12px 0;border:none;border-top:1px solid var(--border)">' +
            '<table class="data-table"><thead><tr><th>Skill</th><th>Category</th><th>Type</th><th>Weight</th><th>Description</th></tr></thead><tbody>' + skillsHtml + '</tbody></table>',
            '<button class="btn btn-outline" onclick="closeModal()">Close</button>'
        );
    } catch (e) {
        hideLoading();
        toast('Error: ' + e.message, 'error');
    }
}

async function editTemplate(id) {
    try {
        showLoading();
        var t = await api('GET', '/api/templates/' + id);
        hideLoading();
        showTemplateForm(t);
    } catch (e) {
        hideLoading();
        toast('Error: ' + e.message, 'error');
    }
}

async function deleteTemplate(id, name) {
    if (!confirm('Delete template "' + name + '"?')) return;
    try {
        showLoading();
        await api('DELETE', '/api/templates/' + id);
        toast('Template deleted.');
        loadTemplates(getSelectedOrg());
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

// ===================================================================
// EVENTS
// ===================================================================
var cachedEvents = [];

async function loadEvents(orgId) {
    var tbody = document.getElementById('events-table-body');

    if (!orgId) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Select an organization to view events.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted"><div class="skeleton-row" style="width:60%;margin:0 auto;"></div><div class="skeleton-row" style="width:80%;margin:4px auto 0;"></div><div class="skeleton-row" style="width:50%;margin:4px auto 0;"></div></td></tr>';

    try {
        cachedEvents = await api('GET', '/api/organizations/' + orgId + '/events');
        if (cachedEvents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:32px;"><div style="color:#888;margin-bottom:12px;"><i data-lucide="calendar-plus" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i>No evaluation events yet</div><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'btn-create-event\')&&document.getElementById(\'btn-create-event\').click()">Create First Event</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Events are used for tryouts, evaluations, and player assessments</p></div></td></tr>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        tbody.innerHTML = cachedEvents.map(function(ev) {
            return '<tr>' +
                '<td><strong>' + esc(ev.name) + '</strong></td>' +
                '<td>' + esc(ev.event_type) + '</td>' +
                '<td>' + (ev.event_date || '--') + '</td>' +
                '<td>' + esc(ev.location || '--') + '</td>' +
                '<td><span class="badge badge-' + ev.status + '">' + esc(ev.status) + '</span></td>' +
                '<td class="btn-group">' +
                    '<button class="btn btn-xs btn-outline" onclick="viewEvent(\'' + ev.id + '\')">Manage</button>' +
                    '<button class="btn btn-xs btn-outline" onclick="editEvent(\'' + ev.id + '\')">Edit</button>' +
                    '<button class="btn btn-xs btn-danger" onclick="deleteEvent(\'' + ev.id + '\', \'' + esc(ev.name) + '\')">Delete</button>' +
                '</td>' +
                '</tr>';
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Error: ' + esc(e.message) + '</td></tr>';
    }
}

document.getElementById('btn-create-event').addEventListener('click', function() {
    var orgId = requireOrg();
    if (!orgId) return;
    showEventForm(orgId);
});

async function showEventForm(orgId, event) {
    event = event || {};

    // Load templates for dropdown
    var templates = [];
    try {
        templates = await api('GET', '/api/organizations/' + orgId + '/templates');
    } catch (_) {}

    var tplOpts = '<option value="">-- No Template --</option>' +
        templates.map(function(t) {
            return '<option value="' + t.id + '"' + (event.template_id === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
        }).join('');

    var html = '<div class="form-group"><label class="form-label">Event Name</label><input class="form-input" id="f-ev-name" value="' + esc(event.name || '') + '"></div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Type</label>' +
            '<select class="form-select" id="f-ev-type">' +
            '<option value="tryout"' + (event.event_type === 'tryout' || !event.event_type ? ' selected' : '') + '>Tryout</option>' +
            '<option value="camp"' + (event.event_type === 'camp' ? ' selected' : '') + '>Camp</option>' +
            '<option value="practice"' + (event.event_type === 'practice' ? ' selected' : '') + '>Practice</option>' +
            '<option value="combine"' + (event.event_type === 'combine' ? ' selected' : '') + '>Combine</option>' +
            '</select></div>' +
        '<div class="form-group"><label class="form-label">Template</label><select class="form-select" id="f-ev-template">' + tplOpts + '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Date</label><input type="date" class="form-input" id="f-ev-date" value="' + esc(event.event_date || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">Location</label><input class="form-input" id="f-ev-location" value="' + esc(event.location || '') + '"></div>' +
        '</div>' +
        (event.id ? '<div class="form-group"><label class="form-label">Status</label>' +
            '<select class="form-select" id="f-ev-status">' +
            '<option value="draft"' + (event.status === 'draft' ? ' selected' : '') + '>Draft</option>' +
            '<option value="active"' + (event.status === 'active' ? ' selected' : '') + '>Active</option>' +
            '<option value="scoring"' + (event.status === 'scoring' ? ' selected' : '') + '>Scoring</option>' +
            '<option value="completed"' + (event.status === 'completed' ? ' selected' : '') + '>Completed</option>' +
            '</select></div>' : '');

    var isEdit = !!event.id;
    openModal((isEdit ? 'Edit' : 'Create') + ' Event', html,
        '<button class="btn btn-primary" onclick="submitEvent(\'' + orgId + '\', ' + (isEdit ? '\'' + event.id + '\'' : 'null') + ')">' + (isEdit ? 'Save' : 'Create') + '</button>' +
        '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>'
    );
}

async function submitEvent(orgId, editId) {
    var data = {
        name: document.getElementById('f-ev-name').value.trim(),
        event_type: document.getElementById('f-ev-type').value,
        template_id: document.getElementById('f-ev-template').value || null,
        event_date: document.getElementById('f-ev-date').value || null,
        location: document.getElementById('f-ev-location').value.trim() || null,
        settings: {}
    };

    if (editId) {
        var statusEl = document.getElementById('f-ev-status');
        if (statusEl) data.status = statusEl.value;
    }

    if (!data.name) { toast('Name is required.', 'error'); return; }

    try {
        showLoading();
        if (editId) {
            await api('PATCH', '/api/events/' + editId, data);
            toast('Event updated!');
        } else {
            data.status = 'draft';
            await api('POST', '/api/organizations/' + orgId + '/events', data);
            toast('Event created!');
        }
        closeModal();
        loadEvents(orgId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function editEvent(id) {
    try {
        showLoading();
        var ev = await api('GET', '/api/events/' + id);
        hideLoading();
        showEventForm(ev.organization_id, ev);
    } catch (e) {
        hideLoading();
        toast('Error: ' + e.message, 'error');
    }
}

async function viewEvent(id) {
    try {
        showLoading();
        var ev = await api('GET', '/api/events/' + id);
        hideLoading();

        var players = ev.players || [];
        var playerRows = players.length > 0
            ? players.map(function(p) {
                return '<tr>' +
                    '<td>' + esc(p.first_name + ' ' + p.last_name) + '</td>' +
                    '<td>' + esc(p.age_group || '--') + '</td>' +
                    '<td>' + esc(p.position || '--') + '</td>' +
                    '<td>' + (p.bib_number || '--') + '</td>' +
                    '<td><span class="badge badge-' + (p.checked_in ? 'yes' : 'no') + '">' + (p.checked_in ? 'Yes' : 'No') + '</span></td>' +
                    '<td class="btn-group">' +
                        (p.checked_in ? '' : '<button class="btn btn-xs btn-primary" onclick="checkInPlayer(\'' + id + '\', \'' + p.player_id + '\')">Check In</button>') +
                        '<button class="btn btn-xs btn-danger" onclick="removePlayerFromEvent(\'' + id + '\', \'' + p.player_id + '\')">Remove</button>' +
                    '</td>' +
                    '</tr>';
            }).join('')
            : '<tr><td colspan="6" class="text-center text-muted">No players added yet.</td></tr>';

        openModal('Event: ' + ev.name,
            '<p><strong>Type:</strong> ' + esc(ev.event_type) + ' | <strong>Status:</strong> ' + esc(ev.status) + ' | <strong>Date:</strong> ' + (ev.event_date || '--') + '</p>' +
            '<hr style="margin:12px 0;border:none;border-top:1px solid var(--border)">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
                '<h4>Players (' + players.length + ')</h4>' +
                '<button class="btn btn-xs btn-primary" onclick="showAddPlayersToEvent(\'' + id + '\', \'' + ev.organization_id + '\')">+ Add Players</button>' +
            '</div>' +
            '<table class="data-table"><thead><tr><th>Name</th><th>Age Group</th><th>Position</th><th>Bib</th><th>Checked In</th><th>Actions</th></tr></thead><tbody>' + playerRows + '</tbody></table>',
            '<button class="btn btn-outline" onclick="closeModal()">Close</button>'
        );
    } catch (e) {
        hideLoading();
        toast('Error: ' + e.message, 'error');
    }
}

async function showAddPlayersToEvent(eventId, orgId) {
    try {
        showLoading();
        var players = await api('GET', '/api/organizations/' + orgId + '/players?active=true');
        hideLoading();

        var rows = players.map(function(p) {
            return '<tr>' +
                '<td><input type="checkbox" class="add-player-check" value="' + p.id + '"></td>' +
                '<td>' + esc(p.first_name + ' ' + p.last_name) + '</td>' +
                '<td>' + esc(p.age_group || '--') + '</td>' +
                '<td>' + esc(p.position || '--') + '</td>' +
                '</tr>';
        }).join('');

        openModal('Add Players to Event',
            '<p>Select players to add:</p>' +
            '<table class="data-table"><thead><tr><th><input type="checkbox" onclick="toggleAllChecks(this)"></th><th>Name</th><th>Age Group</th><th>Position</th></tr></thead><tbody>' + rows + '</tbody></table>',
            '<button class="btn btn-primary" onclick="submitAddPlayers(\'' + eventId + '\')">Add Selected</button><button class="btn btn-outline" onclick="viewEvent(\'' + eventId + '\')">Back</button>'
        );
    } catch (e) {
        hideLoading();
        toast('Error: ' + e.message, 'error');
    }
}

function toggleAllChecks(el) {
    var checks = document.querySelectorAll('.add-player-check');
    checks.forEach(function(cb) { cb.checked = el.checked; });
}

async function submitAddPlayers(eventId) {
    var checks = document.querySelectorAll('.add-player-check:checked');
    var ids = [];
    checks.forEach(function(cb) { ids.push(cb.value); });

    if (ids.length === 0) { toast('Select at least one player.', 'warning'); return; }

    try {
        showLoading();
        await api('POST', '/api/events/' + eventId + '/players', { player_ids: ids });
        toast(ids.length + ' player(s) added!');
        viewEvent(eventId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function removePlayerFromEvent(eventId, playerId) {
    if (!confirm('Remove this player from the event?')) return;
    try {
        showLoading();
        await api('DELETE', '/api/events/' + eventId + '/players/' + playerId);
        toast('Player removed.');
        viewEvent(eventId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function checkInPlayer(eventId, playerId) {
    try {
        showLoading();
        await api('POST', '/api/events/' + eventId + '/check-in/' + playerId);
        toast('Player checked in!');
        viewEvent(eventId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteEvent(id, name) {
    if (!confirm('Delete event "' + name + '"?')) return;
    try {
        showLoading();
        await api('DELETE', '/api/events/' + id);
        toast('Event deleted.');
        loadEvents(getSelectedOrg());
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

// ===================================================================
// PLAYERS
// ===================================================================
var cachedPlayers = [];

async function loadPlayers(orgId) {
    var tbody = document.getElementById('players-table-body');

    if (!orgId) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Select an organization to view players.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted"><div class="skeleton-row" style="width:60%;margin:0 auto;"></div><div class="skeleton-row" style="width:80%;margin:4px auto 0;"></div><div class="skeleton-row" style="width:50%;margin:4px auto 0;"></div></td></tr>';

    try {
        var params = '';
        var activeFilter = document.getElementById('player-active-filter').value;
        var ageFilter = document.getElementById('player-age-filter').value;
        var query = [];
        if (activeFilter) query.push('active=' + activeFilter);
        if (ageFilter) query.push('age_group=' + encodeURIComponent(ageFilter));
        if (query.length) params = '' + query.join('&');

        cachedPlayers = await api('GET', '/api/organizations/' + orgId + '/players' + params);
        renderPlayers(cachedPlayers);

        // Populate age groups
        var ageGroups = {};
        cachedPlayers.forEach(function(p) { if (p.age_group) ageGroups[p.age_group] = true; });
        var ageSelect = document.getElementById('player-age-filter');
        var currentAge = ageSelect.value;
        ageSelect.innerHTML = '<option value="">All Age Groups</option>';
        Object.keys(ageGroups).sort().forEach(function(ag) {
            var opt = document.createElement('option');
            opt.value = ag;
            opt.textContent = ag;
            if (ag === currentAge) opt.selected = true;
            ageSelect.appendChild(opt);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Error: ' + esc(e.message) + '</td></tr>';
    }
}

function renderPlayers(players) {
    var tbody = document.getElementById('players-table-body');
    var search = (document.getElementById('player-search').value || '').toLowerCase();

    var filtered = players.filter(function(p) {
        if (!search) return true;
        var full = (p.first_name + ' ' + p.last_name + ' ' + (p.age_group || '') + ' ' + (p.position || '')).toLowerCase();
        return full.indexOf(search) !== -1;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No players found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(function(p) {
        return '<tr data-id="' + (p.id || '') + '" style="cursor:pointer;" onclick="if(!event.target.closest(\'button\')){showPlayerDetail(\'' + p.id + '\');}">' +
            '<td>' + (p.jersey_number || '--') + '</td>' +
            '<td><strong>' + esc(p.first_name + ' ' + p.last_name) + '</strong></td>' +
            '<td>' + esc(p.age_group || '--') + '</td>' +
            '<td>' + esc(p.position || '--') + '</td>' +
            '<td>' + esc(p.parent_email || '--') + '</td>' +
            '<td><span class="badge badge-' + (p.active ? 'yes' : 'no') + '">' + (p.active ? 'Yes' : 'No') + '</span></td>' +
            '<td class="btn-group">' +
                '<button class="btn btn-xs btn-outline" onclick="editPlayer(\'' + p.id + '\')">Edit</button>' +
                '<button class="btn btn-xs btn-danger" onclick="deletePlayer(\'' + p.id + '\', \'' + esc(p.first_name + ' ' + p.last_name) + '\')">Delete</button>' +
            '</td>' +
            '</tr>';
    }).join('');
}

document.getElementById('player-search').addEventListener('input', function() {
    renderPlayers(cachedPlayers);
});

document.getElementById('player-active-filter').addEventListener('change', function() {
    loadPlayers(getSelectedOrg());
});

document.getElementById('player-age-filter').addEventListener('change', function() {
    loadPlayers(getSelectedOrg());
});

document.getElementById('btn-create-player').addEventListener('click', function() {
    if (!requireOrg()) return;
    showPlayerForm();
});

function showPlayerForm(player) {
    player = player || {};
    var html = '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">First Name</label><input class="form-input" id="f-pl-fname" value="' + esc(player.first_name || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">Last Name</label><input class="form-input" id="f-pl-lname" value="' + esc(player.last_name || '') + '"></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Date of Birth</label><input type="date" class="form-input" id="f-pl-dob" value="' + esc(player.date_of_birth || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">Age Group</label><input class="form-input" id="f-pl-age" placeholder="e.g., U12, U14" value="' + esc(player.age_group || '') + '"></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Position</label><input class="form-input" id="f-pl-position" value="' + esc(player.position || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">Jersey Number</label><input type="number" class="form-input" id="f-pl-jersey" value="' + (player.jersey_number || '') + '"></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Parent Name</label><input class="form-input" id="f-pl-pname" value="' + esc(player.parent_name || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">Parent Email</label><input class="form-input" id="f-pl-pemail" value="' + esc(player.parent_email || '') + '"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Parent Phone</label><input class="form-input" id="f-pl-pphone" value="' + esc(player.parent_phone || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">Photo URL</label><input class="form-input" id="f-pl-photo" value="' + esc(player.photo_url || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="f-pl-notes">' + esc(player.notes || '') + '</textarea></div>';

    var isEdit = !!player.id;
    if (isEdit) {
        html += '<div class="form-group"><div class="form-check"><input type="checkbox" id="f-pl-active" ' + (player.active !== false ? 'checked' : '') + '><label class="form-label" style="margin:0">Active</label></div></div>';
    }

    openModal((isEdit ? 'Edit' : 'Create') + ' Player', html,
        '<button class="btn btn-primary" onclick="submitPlayer(' + (isEdit ? '\'' + player.id + '\'' : 'null') + ')">' + (isEdit ? 'Save' : 'Create') + '</button>' +
        '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>'
    );
}

async function submitPlayer(editId) {
    var orgId = getSelectedOrg();
    if (!orgId) { toast('Select an organization.', 'error'); return; }

    var data = {
        first_name: document.getElementById('f-pl-fname').value.trim(),
        last_name: document.getElementById('f-pl-lname').value.trim(),
        date_of_birth: document.getElementById('f-pl-dob').value || null,
        age_group: document.getElementById('f-pl-age').value.trim() || null,
        position: document.getElementById('f-pl-position').value.trim() || null,
        jersey_number: parseInt(document.getElementById('f-pl-jersey').value) || null,
        parent_name: document.getElementById('f-pl-pname').value.trim() || null,
        parent_email: document.getElementById('f-pl-pemail').value.trim() || null,
        parent_phone: document.getElementById('f-pl-pphone').value.trim() || null,
        photo_url: document.getElementById('f-pl-photo').value.trim() || null,
        notes: document.getElementById('f-pl-notes').value.trim() || null,
        metadata: {}
    };

    markRequiredFields(['f-pl-fname', 'f-pl-lname']);
    if (!validateForm([
        { id: 'f-pl-fname', required: true, label: 'First name' },
        { id: 'f-pl-lname', required: true, label: 'Last name' },
        { id: 'f-pl-pemail', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMsg: 'Enter a valid email address' }
    ])) return;

    if (editId) {
        var activeEl = document.getElementById('f-pl-active');
        if (activeEl) data.active = activeEl.checked;
    }

    try {
        showLoading();
        if (editId) {
            await api('PATCH', '/api/players/' + editId, data);
            toast('Player updated!');
        } else {
            await api('POST', '/api/organizations/' + orgId + '/players', data);
            toast('Player created!');
        }
        closeModal();
        loadPlayers(orgId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

async function editPlayer(id) {
    try {
        showLoading();
        var p = await api('GET', '/api/players/' + id);
        hideLoading();
        showPlayerForm(p);
    } catch (e) {
        hideLoading();
        toast('Error: ' + e.message, 'error');
    }
}

async function deletePlayer(id, name) {
    if (!confirm('Delete player "' + name + '"?')) return;
    try {
        showLoading();
        await api('DELETE', '/api/players/' + id);
        toast('Player deleted.');
        loadPlayers(getSelectedOrg());
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

// Bulk Import
document.getElementById('btn-bulk-import').addEventListener('click', function() {
    if (!requireOrg()) return;
    showBulkImportForm();
});

function showBulkImportForm() {
    var html = '<p style="margin-bottom:12px">Paste JSON array of players or use CSV format (one per line).</p>' +
        '<div class="form-group"><label class="form-label">Format</label>' +
            '<select class="form-select" id="f-import-format">' +
            '<option value="json">JSON</option>' +
            '<option value="csv">CSV (first_name,last_name,age_group,position,jersey_number,parent_email)</option>' +
            '</select></div>' +
        '<div class="form-group"><label class="form-label">Data</label>' +
            '<textarea class="form-textarea" id="f-import-data" style="min-height:200px;font-family:monospace;font-size:12px" placeholder=\'[{"first_name":"John","last_name":"Doe","age_group":"U12"}]\'></textarea></div>';

    openModal('Bulk Import Players', html,
        '<button class="btn btn-primary" onclick="submitBulkImport()">Import</button><button class="btn btn-outline" onclick="closeModal()">Cancel</button>'
    );
}

async function submitBulkImport() {
    var orgId = getSelectedOrg();
    if (!orgId) { toast('Select an organization.', 'error'); return; }

    var format = document.getElementById('f-import-format').value;
    var raw = document.getElementById('f-import-data').value.trim();

    if (!raw) { toast('Paste player data.', 'error'); return; }

    var players;
    if (format === 'json') {
        try {
            players = JSON.parse(raw);
            if (!Array.isArray(players)) { toast('Must be a JSON array.', 'error'); return; }
        } catch (e) {
            toast('Invalid JSON: ' + e.message, 'error');
            return;
        }
    } else {
        var lines = raw.split('\n').filter(Boolean);
        players = lines.map(function(line) {
            var parts = line.split(',').map(function(s) { return s.trim(); });
            return {
                first_name: parts[0] || '',
                last_name: parts[1] || '',
                age_group: parts[2] || null,
                position: parts[3] || null,
                jersey_number: parts[4] ? parseInt(parts[4]) : null,
                parent_email: parts[5] || null
            };
        }).filter(function(p) { return p.first_name && p.last_name; });
    }

    if (players.length === 0) { toast('No valid players found.', 'error'); return; }

    try {
        showLoading();
        var result = await api('POST', '/api/organizations/' + orgId + '/players/bulk', players);
        toast(result.length + ' players imported!');
        closeModal();
        loadPlayers(orgId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

// ===================================================================
// REPORTS
// ===================================================================
async function loadReportsSection(orgId) {
    var select = document.getElementById('reports-event-select');
    var tbody = document.getElementById('reports-table-body');

    if (!orgId) {
        select.innerHTML = '<option value="">-- Select Org First --</option>';
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Select an organization first.</td></tr>';
        return;
    }

    try {
        var events = await api('GET', '/api/organizations/' + orgId + '/events');
        select.innerHTML = '<option value="">-- Select Event --</option>' +
            events.map(function(ev) {
                return '<option value="' + ev.id + '">' + esc(ev.name) + ' (' + ev.status + ')</option>';
            }).join('');
    } catch (e) {
        select.innerHTML = '<option value="">Error loading events</option>';
    }

    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Select an event to view reports.</td></tr>';
}

document.getElementById('reports-event-select').addEventListener('change', function() {
    var eventId = this.value;
    if (eventId) loadReports(eventId);
    else {
        document.getElementById('reports-table-body').innerHTML = '<tr><td colspan="5" class="text-center text-muted">Select an event to view reports.</td></tr>';
    }
});

async function loadReports(eventId) {
    var tbody = document.getElementById('reports-table-body');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted"><div class="skeleton-row" style="width:60%;margin:0 auto;"></div><div class="skeleton-row" style="width:80%;margin:4px auto 0;"></div><div class="skeleton-row" style="width:50%;margin:4px auto 0;"></div></td></tr>';

    try {
        var reports = await api('GET', '/api/events/' + eventId + '/reports');
        if (reports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No reports generated yet. Click "Generate Reports" to create them.</td></tr>';
            return;
        }

        tbody.innerHTML = reports.map(function(r) {
            var playerName = r.player ? (r.player.first_name + ' ' + r.player.last_name) : 'Unknown';
            return '<tr>' +
                '<td>' + (r.rank || '--') + '</td>' +
                '<td><strong>' + esc(playerName) + '</strong></td>' +
                '<td>' + (r.overall_score !== null ? r.overall_score.toFixed(2) : '--') + ' / 5.0</td>' +
                '<td><span class="badge badge-' + (r.sent_to_parent ? 'yes' : 'no') + '">' + (r.sent_to_parent ? 'Sent' : 'Not sent') + '</span></td>' +
                '<td class="btn-group">' +
                    '<button class="btn btn-xs btn-outline" onclick="viewReport(\'' + r.id + '\')">View</button>' +
                    (r.report_url ? '<a class="btn btn-xs btn-outline" href="' + esc(r.report_url) + '" target="_blank">Open</a>' : '') +
                '</td>' +
                '</tr>';
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Error: ' + esc(e.message) + '</td></tr>';
    }
}

async function viewReport(reportId) {
    try {
        showLoading();
        var r = await api('GET', '/api/reports/' + reportId);
        hideLoading();

        var skillRows = '';
        if (r.skill_scores) {
            var skills = Object.keys(r.skill_scores);
            skillRows = skills.map(function(sk) {
                return '<tr><td>' + esc(sk) + '</td><td>' + r.skill_scores[sk].toFixed(2) + '</td></tr>';
            }).join('');
        }

        var playerName = r.player ? (r.player.first_name + ' ' + r.player.last_name) : 'Unknown';

        openModal('Report: ' + playerName,
            '<div class="stats-grid" style="margin-bottom:16px">' +
                '<div class="stat-card"><div class="stat-value">' + (r.overall_score !== null ? r.overall_score.toFixed(2) : '--') + '</div><div class="stat-label">Overall Score</div></div>' +
                '<div class="stat-card steel"><div class="stat-value">' + (r.rank || '--') + ' / ' + (r.total_players || '--') + '</div><div class="stat-label">Rank</div></div>' +
            '</div>' +
            (r.ai_summary ? '<div style="margin-bottom:12px"><strong>AI Summary:</strong>' + renderMd(r.ai_summary) + '</div>' : '') +
            (r.ai_strengths && r.ai_strengths.length > 0 ? '<div style="margin-bottom:12px"><strong>Strengths:</strong><ul>' + r.ai_strengths.map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>' : '') +
            (r.ai_improvements && r.ai_improvements.length > 0 ? '<div style="margin-bottom:12px"><strong>Areas for Improvement:</strong><ul>' + r.ai_improvements.map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>' : '') +
            (r.ai_recommendation ? '<div style="margin-bottom:12px"><strong>Recommendation:</strong>' + renderMd(r.ai_recommendation) + '</div>' : '') +
            (skillRows ? '<h4 style="margin-top:12px">Skill Scores</h4><table class="data-table"><thead><tr><th>Skill</th><th>Score</th></tr></thead><tbody>' + skillRows + '</tbody></table>' : ''),
            '<button class="btn btn-outline" onclick="closeModal()">Close</button>'
        );
    } catch (e) {
        hideLoading();
        toast('Error: ' + e.message, 'error');
    }
}

document.getElementById('btn-generate-reports').addEventListener('click', async function() {
    var eventId = document.getElementById('reports-event-select').value;
    if (!eventId) { toast('Select an event first.', 'warning'); return; }
    if (!confirm('Generate reports for this event? This will use AI to create player summaries.')) return;

    try {
        showLoading();
        var result = await api('POST', '/api/events/' + eventId + '/generate-reports');
        toast('Generated ' + result.reports_generated + ' reports for ' + result.total_players + ' players!');
        loadReports(eventId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
});

document.getElementById('btn-send-reports').addEventListener('click', async function() {
    var eventId = document.getElementById('reports-event-select').value;
    if (!eventId) { toast('Select an event first.', 'warning'); return; }
    if (!confirm('Send report cards to all parents with email addresses?')) return;

    try {
        showLoading();
        var result = await api('POST', '/api/events/' + eventId + '/send-reports');
        toast('Sent: ' + result.sent + ', Failed: ' + result.failed + ', Total: ' + result.total);
        loadReports(eventId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
});

// ===================================================================
// DRAFT
// ===================================================================
async function loadDraftSection(orgId) {
    var select = document.getElementById('draft-event-select');
    var availBody = document.getElementById('draft-available-body');
    var teamsContainer = document.getElementById('draft-teams-container');

    if (!orgId) {
        select.innerHTML = '<option value="">-- Select Org First --</option>';
        availBody.innerHTML = '<p class="text-muted">Select an organization first.</p>';
        teamsContainer.innerHTML = '';
        return;
    }

    try {
        var events = await api('GET', '/api/organizations/' + orgId + '/events');
        select.innerHTML = '<option value="">-- Select Event --</option>' +
            events.map(function(ev) {
                return '<option value="' + ev.id + '">' + esc(ev.name) + '</option>';
            }).join('');
    } catch (e) {
        select.innerHTML = '<option value="">Error loading events</option>';
    }

    availBody.innerHTML = '<p class="text-muted">Select an event to begin drafting.</p>';
    teamsContainer.innerHTML = '';
}

document.getElementById('draft-event-select').addEventListener('change', function() {
    var eventId = this.value;
    if (eventId) loadDraftState(eventId);
    else {
        document.getElementById('draft-available-body').innerHTML = '<p class="text-muted">Select an event to begin drafting.</p>';
        document.getElementById('draft-teams-container').innerHTML = '';
    }
});

async function loadDraftState(eventId) {
    try {
        showLoading();
        var state = await api('GET', '/api/events/' + eventId + '/draft');
        hideLoading();
        renderDraftState(eventId, state);
    } catch (e) {
        hideLoading();
        document.getElementById('draft-available-body').innerHTML = '<p class="text-muted">Error: ' + esc(e && e.message ? e.message : String(e)) + '</p>';
        document.getElementById('draft-teams-container').innerHTML = '';
    }
}

function renderDraftState(eventId, state) {
    var availBody = document.getElementById('draft-available-body');
    var teamsContainer = document.getElementById('draft-teams-container');

    // Available players
    var available = state.available_players || [];
    if (available.length === 0) {
        availBody.innerHTML = '<p class="text-muted">No available players (all drafted or none in event).</p>';
    } else {
        availBody.innerHTML = available.map(function(p) {
            var teamBtns = (state.teams || []).map(function(t) {
                return '<button class="btn btn-xs btn-primary" onclick="makePick(\'' + eventId + '\', \'' + t.id + '\', \'' + p.id + '\')" title="Draft to ' + esc(t.team_name) + '" style="' + (t.team_color ? 'background:' + t.team_color : '') + '">' + esc(t.team_name.substring(0, 3)) + '</button>';
            }).join(' ');

            return '<div class="draft-player-item">' +
                '<div class="draft-player-info">' +
                    '<span class="draft-player-name">' + esc(p.first_name + ' ' + p.last_name) + '</span>' +
                    '<span class="draft-player-meta">' + esc(p.position || '--') + ' | ' + esc(p.age_group || '--') + '</span>' +
                '</div>' +
                '<div class="draft-player-score">' + (p.overall_score !== null ? p.overall_score.toFixed(1) : '--') + '</div>' +
                '<div class="btn-group">' + teamBtns + '</div>' +
                '</div>';
        }).join('');
    }

    // Teams
    var teams = state.teams || [];
    if (teams.length === 0) {
        teamsContainer.innerHTML = '<div class="card"><div class="card-body text-center text-muted">No teams created. Click "Setup Teams" to create them.</div></div>';
    } else {
        teamsContainer.innerHTML = teams.map(function(t) {
            var picks = (t.picks || []).map(function(p, i) {
                return '<div class="team-pick-item">' +
                    '<span>' + (i + 1) + '. ' + esc((p.first_name || '') + ' ' + (p.last_name || '')) + '</span>' +
                    '<span>' + (p.overall_score !== null && p.overall_score !== undefined ? p.overall_score.toFixed(1) : '--') + '</span>' +
                    '</div>';
            }).join('');

            return '<div class="team-card">' +
                '<div class="team-card-header">' +
                    '<span>' + (t.team_color ? '<span class="team-color-dot" style="background:' + esc(t.team_color) + '"></span>' : '') + '<strong>' + esc(t.team_name) + '</strong></span>' +
                    '<span class="team-avg">Avg: ' + (t.avg_score ? t.avg_score.toFixed(2) : '0.00') + ' | ' + (t.picks ? t.picks.length : 0) + ' players</span>' +
                '</div>' +
                '<div class="team-card-body">' + (picks || '<div class="team-pick-item text-muted">No picks yet</div>') + '</div>' +
                '</div>';
        }).join('');
    }
}

async function makePick(eventId, teamId, playerId) {
    try {
        showLoading();
        await api('POST', '/api/events/' + eventId + '/draft/pick', { team_id: teamId, player_id: playerId });
        toast('Player drafted!');
        loadDraftState(eventId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

document.getElementById('btn-setup-teams').addEventListener('click', function() {
    var eventId = document.getElementById('draft-event-select').value;
    if (!eventId) { toast('Select an event first.', 'warning'); return; }

    openModal('Setup Draft Teams',
        '<div class="form-group"><label class="form-label">Number of Teams</label><input type="number" class="form-input" id="f-draft-count" value="4" min="2" max="20"></div>' +
        '<div class="form-group"><label class="form-label">Team Names (one per line)</label><textarea class="form-textarea" id="f-draft-names" placeholder="Team Red\nTeam Blue\nTeam Green\nTeam Gold">Team Red\nTeam Blue\nTeam Green\nTeam Gold</textarea></div>' +
        '<div class="form-group"><label class="form-label">Team Colors (one hex per line, optional)</label><textarea class="form-textarea" id="f-draft-colors" placeholder="#e74c3c\n#3498db\n#27ae60\n#f39c12">#e74c3c\n#3498db\n#27ae60\n#f39c12</textarea></div>',
        '<button class="btn btn-primary" onclick="submitSetupTeams(\'' + eventId + '\')">Create Teams</button><button class="btn btn-outline" onclick="closeModal()">Cancel</button>'
    );
});

async function submitSetupTeams(eventId) {
    var names = document.getElementById('f-draft-names').value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
    var colors = document.getElementById('f-draft-colors').value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);

    if (names.length < 2) { toast('Enter at least 2 team names.', 'error'); return; }

    try {
        showLoading();
        await api('POST', '/api/events/' + eventId + '/draft/teams', { team_names: names, team_colors: colors.length > 0 ? colors : null });
        toast('Teams created!');
        closeModal();
        loadDraftState(eventId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

document.getElementById('btn-auto-balance').addEventListener('click', async function() {
    var eventId = document.getElementById('draft-event-select').value;
    if (!eventId) { toast('Select an event first.', 'warning'); return; }
    if (!confirm('Auto-balance will clear existing picks and redistribute all players evenly. Continue?')) return;

    try {
        showLoading();
        var result = await api('POST', '/api/events/' + eventId + '/draft/auto-balance');
        var summary = result.teams.map(function(t) { return t.team_name + ': ' + t.player_count + ' players (avg ' + t.avg_score + ')'; }).join(', ');
        toast('Teams balanced! ' + summary);
        loadDraftState(eventId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
});

document.getElementById('btn-export-draft').addEventListener('click', async function() {
    var eventId = document.getElementById('draft-event-select').value;
    if (!eventId) { toast('Select an event first.', 'warning'); return; }

    try {
        showLoading();
        var data = await api('GET', '/api/events/' + eventId + '/draft/export');
        hideLoading();

        var html = (data.teams || []).map(function(t) {
            var rows = (t.players || []).map(function(p, i) {
                return '<tr><td>' + (i + 1) + '</td><td>' + esc(p.first_name + ' ' + p.last_name) + '</td><td>' + esc(p.position || '--') + '</td><td>' + esc(p.age_group || '--') + '</td><td>' + (p.overall_score !== null && p.overall_score !== undefined ? p.overall_score.toFixed(2) : '--') + '</td></tr>';
            }).join('');

            return '<h4 style="margin-top:60px">' + (t.team_color ? '<span class="team-color-dot" style="background:' + esc(t.team_color) + '"></span>' : '') + esc(t.team_name) + '</h4>' +
                '<table class="data-table"><thead><tr><th>#</th><th>Player</th><th>Position</th><th>Age Group</th><th>Score</th></tr></thead><tbody>' + rows + '</tbody></table>';
        }).join('');

        openModal('Draft Export',
            html + '<div style="margin-top:60px"><button class="btn btn-sm btn-outline" onclick="copyDraftExport()">Copy as Text</button></div>' +
            '<textarea id="draft-export-text" style="display:none">' + esc(JSON.stringify(data, null, 2)) + '</textarea>',
            '<button class="btn btn-outline" onclick="closeModal()">Close</button>'
        );
    } catch (e) {
        hideLoading();
        toast('Error: ' + e.message, 'error');
    }
});

function copyDraftExport() {
    var text = document.getElementById('draft-export-text').value;
    navigator.clipboard.writeText(text).then(function() {
        toast('Draft data copied to clipboard!');
    });
}

// ===================================================================
// ANALYTICS
// ===================================================================
async function loadAnalyticsSection(orgId) {
    var statsEl = document.getElementById('analytics-stats');
    var distEl = document.getElementById('analytics-distribution');
    var skillsEl = document.getElementById('analytics-skills');
    var topEl = document.getElementById('analytics-top');
    var eventSelect = document.getElementById('analytics-event-select');

    if (!orgId) {
        statsEl.innerHTML = '';
        distEl.innerHTML = '<p class="text-muted">Select an organization first.</p>';
        skillsEl.innerHTML = '';
        topEl.innerHTML = '';
        eventSelect.innerHTML = '<option value="">-- Select Org First --</option>';
        return;
    }

    // Load events for dropdown
    try {
        var events = await api('GET', '/api/organizations/' + orgId + '/events');
        eventSelect.innerHTML = '<option value="">-- Org-level Analytics --</option>' +
            events.map(function(ev) {
                return '<option value="' + ev.id + '">' + esc(ev.name) + '</option>';
            }).join('');
    } catch (_) {}

    loadOrgAnalytics(orgId);

    // Populate season comparison dropdowns
    try {
        var seasons = await cachedApi('GET', '/api/organizations/' + orgId + '/seasons');
        var s1 = document.getElementById('season-compare-1');
        var s2 = document.getElementById('season-compare-2');
        if (s1 && s2 && Array.isArray(seasons)) {
            var opts = '<option value="">-- Select Season --</option>' +
                seasons.map(function(s) { return '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>'; }).join('');
            s1.innerHTML = opts;
            s2.innerHTML = opts;
        }
    } catch (_) {}
}

document.getElementById('analytics-event-select').addEventListener('change', function() {
    var eventId = this.value;
    if (eventId) {
        loadEventAnalytics(eventId);
    } else {
        var orgId = getSelectedOrg();
        if (orgId) loadOrgAnalytics(orgId);
    }
});

async function loadOrgAnalytics(orgId) {
    var statsEl = document.getElementById('analytics-stats');
    var distEl = document.getElementById('analytics-distribution');
    var skillsEl = document.getElementById('analytics-skills');
    var topEl = document.getElementById('analytics-top');

    try {
        var data = await api('GET', '/api/organizations/' + orgId + '/analytics');

        statsEl.innerHTML = buildStatCards([
            { value: data.total_players, label: 'Active Players', cls: '' },
            { value: data.total_events, label: 'Total Events', cls: 'steel' },
            { value: data.total_evaluations, label: 'Total Evaluations', cls: 'coral' },
        ]);

        if (data.recent_events && data.recent_events.length > 0) {
            var rows = data.recent_events.map(function(ev) {
                return '<tr><td>' + esc(ev.name) + '</td><td>' + esc(ev.event_type) + '</td><td><span class="badge badge-' + ev.status + '">' + esc(ev.status) + '</span></td></tr>';
            }).join('');
            distEl.innerHTML = '<p style="margin-bottom:8px">Select a specific event for detailed score distribution.</p>' +
                '<table class="data-table"><thead><tr><th>Event</th><th>Type</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>';
        } else {
            distEl.innerHTML = '<p class="text-muted">No events yet.</p>';
        }

        skillsEl.innerHTML = '<p class="text-muted">Select a specific event for skill averages.</p>';
        topEl.innerHTML = '<p class="text-muted">Select a specific event for top performers.</p>';
    } catch (e) {
        statsEl.innerHTML = '';
        distEl.innerHTML = '<p class="text-muted">Error: ' + esc(e && e.message ? e.message : String(e)) + '</p>';
    }
}

async function loadEventAnalytics(eventId) {
    var statsEl = document.getElementById('analytics-stats');
    var distEl = document.getElementById('analytics-distribution');
    var skillsEl = document.getElementById('analytics-skills');
    var topEl = document.getElementById('analytics-top');

    try {
        showLoading();
        var data = await api('GET', '/api/events/' + eventId + '/analytics');
        hideLoading();

        statsEl.innerHTML = buildStatCards([
            { value: data.total_players, label: 'Players', cls: '' },
            { value: data.total_scores, label: 'Scores Submitted', cls: 'steel' },
            { value: data.total_evaluators, label: 'Evaluators', cls: 'coral' },
            { value: data.avg_overall_score !== null ? data.avg_overall_score.toFixed(2) : '--', label: 'Avg Score', cls: 'gold' },
        ]);

        // Score distribution bar chart
        if (data.score_distribution) {
            var maxCount = Math.max.apply(null, Object.values(data.score_distribution).concat([1]));
            var bars = Object.keys(data.score_distribution).map(function(bucket) {
                var count = data.score_distribution[bucket];
                var pct = (count / maxCount) * 100;
                return '<div class="bar-row">' +
                    '<span class="bar-label">' + bucket + '</span>' +
                    '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%">' + (count > 0 ? count : '') + '</div></div>' +
                    '</div>';
            }).join('');
            distEl.innerHTML = '<div class="bar-chart">' + bars + '</div>';
        } else {
            distEl.innerHTML = '<p class="text-muted">No distribution data.</p>';
        }

        // Skill averages
        if (data.skill_averages && Object.keys(data.skill_averages).length > 0) {
            var maxSkill = Math.max.apply(null, Object.values(data.skill_averages).concat([5]));
            var skillBars = Object.keys(data.skill_averages).map(function(skill, idx) {
                var val = data.skill_averages[skill];
                var pct = (val / 5) * 100;
                var cls = ['', 'steel', 'coral', 'gold'][idx % 4];
                return '<div class="bar-row">' +
                    '<span class="bar-label" style="width:140px">' + esc(skill) + '</span>' +
                    '<div class="bar-track"><div class="bar-fill ' + cls + '" style="width:' + pct + '%">' + val.toFixed(2) + '</div></div>' +
                    '</div>';
            }).join('');
            skillsEl.innerHTML = '<div class="bar-chart">' + skillBars + '</div>';
        } else {
            skillsEl.innerHTML = '<p class="text-muted">No skill data available.</p>';
        }

        // Top performers
        if (data.top_performers && data.top_performers.length > 0) {
            var topRows = data.top_performers.map(function(tp) {
                return '<tr><td>' + tp.rank + '</td><td><strong>' + (tp.player_name || 'Unknown') + '</strong><br><small style="color:#888">' + (tp.position || '') + ' · ' + (tp.age_group || '') + '</small></td><td>' + (tp.overall_score !== null ? tp.overall_score.toFixed(2) : '--') + '</td></tr>';
            }).join('');
            topEl.innerHTML = '<table class="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Position</th><th>Score</th></tr></thead><tbody>' + topRows + '</tbody></table>';
        } else {
            topEl.innerHTML = '<p class="text-muted">No performer data.</p>';
        }
    } catch (e) {
        hideLoading();
        statsEl.innerHTML = '';
        distEl.innerHTML = '<p class="text-muted">Error: ' + esc(e && e.message ? e.message : String(e)) + '</p>';
    }
}

// ===================================================================
// TBM OPERATIONS — JS FUNCTIONS
// ===================================================================

// --- Ops Dashboard ---
async function loadOpsDashboard(orgId) {
    if (!orgId) { document.getElementById('ops-dashboard-stats').innerHTML = '<p class="text-muted">Select an organization.</p>'; return; }
    try {
        showLoading();
        var [dashboard, alerts] = await Promise.all([
            api('GET', '/api/organizations/' + orgId + '/dashboard'),
            api('GET', '/api/organizations/' + orgId + '/ai/alerts'),
        ]);
        hideLoading();

        document.getElementById('ops-dashboard-stats').innerHTML =
            '<div class="stat-card"><div class="stat-value">' + dashboard.total_players + '</div><div class="stat-label">Players</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + dashboard.active_teams + '</div><div class="stat-label">Teams</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + dashboard.total_fields + '</div><div class="stat-label">Fields</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + dashboard.total_coaches + '</div><div class="stat-label">Coaches</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + dashboard.upcoming_events_this_week + '</div><div class="stat-label">Events This Week</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + dashboard.active_seasons + '</div><div class="stat-label">Active Seasons</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + dashboard.messages_sent + '</div><div class="stat-label">Messages Sent</div></div>';

        var alertsHtml = '';
        if (alerts.alerts && alerts.alerts.length > 0) {
            alerts.alerts.forEach(function(a) {
                var color = a.severity === 'critical' ? '#dc3545' : a.severity === 'warning' ? '#ffc107' : '#17a2b8';
                alertsHtml += '<div style="padding:8px 12px;margin-bottom:6px;border-left:4px solid ' + color + ';background:#f2f5f8;border-radius:4px;font-size:13px;">' +
                    '<strong style="text-transform:uppercase;font-size:11px;color:' + color + ';">' + esc(a.severity) + '</strong> — ' +
                    '<span style="color:#666;">[' + esc(a.category) + ']</span> ' + esc(a.message) + '</div>';
            });
        } else {
            alertsHtml = '<p class="text-muted">No alerts. Everything looks good!</p>';
        }
        document.getElementById('ops-alerts-body').innerHTML = alertsHtml;

        var upHtml = '';
        if (dashboard.upcoming_events && dashboard.upcoming_events.length > 0) {
            dashboard.upcoming_events.forEach(function(e) {
                upHtml += '<div style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;">' +
                    '<strong>' + esc(e.title) + '</strong> — ' + esc(e.type) + ' — ' + esc(e.start) + '</div>';
            });
        } else {
            upHtml = '<p class="text-muted">No upcoming events.</p>';
        }
        document.getElementById('ops-upcoming-body').innerHTML = upHtml;
    } catch (e) {
        hideLoading();
        toast('Error loading dashboard: ' + e.message, 'error');
    }
}

// --- Seasons ---
async function loadOpsSeasons(orgId) {
    if (!orgId) return;
    try {
        var [seasons, programs] = await Promise.all([
            api('GET', '/api/organizations/' + orgId + '/seasons'),
            api('GET', '/api/organizations/' + orgId + '/programs'),
        ]);

        var activeSeasons = seasons.filter(function(s) { return s.status === 'active'; }).length;
        document.getElementById('seasons-stats-bar').innerHTML = buildStatCards([
            { value: seasons.length, label: 'Seasons', cls: '' },
            { value: activeSeasons, label: 'Active', cls: 'steel' },
            { value: programs.length, label: 'Programs', cls: 'coral' },
        ]);

        var tbody = document.getElementById('seasons-table-body');
        if (seasons.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:32px;"><div style="color:#888;margin-bottom:12px;"><i data-lucide="calendar" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i>No seasons yet</div><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'btn-add-season\')&&document.getElementById(\'btn-add-season\').click()">Create Your First Season</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Seasons organize your programs, teams, and schedules</p></div></td></tr>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        tbody.innerHTML = seasons.map(function(s) {
            return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.start_date) + '</td><td>' + esc(s.end_date) + '</td>' +
                '<td><span class="badge badge-' + (s.status === 'active' ? 'success' : 'default') + '">' + esc(s.status) + '</span></td>' +
                '<td><button class="btn btn-sm btn-outline" onclick="viewSeasonDashboard(\'' + s.id + '\')">Dashboard</button> ' +
                '<button class="btn btn-sm btn-outline" onclick="deleteOpsItem(\'seasons\',\'' + s.id + '\')">Delete</button></td></tr>';
        }).join('');

        var ptbody = document.getElementById('programs-table-body');
        ptbody.innerHTML = programs.map(function(p) {
            var seasonName = seasons.find(function(s) { return s.id === p.season_id; });
            return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.program_type) + '</td>' +
                '<td>' + esc(seasonName ? seasonName.name : '') + '</td>' +
                '<td>' + esc((p.age_groups || []).join(', ')) + '</td>' +
                '<td>$' + (p.registration_fee || 0) + '</td>' +
                '<td><button class="btn btn-sm btn-outline" onclick="deleteOpsItem(\'programs\',\'' + p.id + '\')">Delete</button></td></tr>';
        }).join('');
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    }
}

// --- Teams ---
async function loadOpsTeams(orgId) {
    if (!orgId) return;
    try {
        var teams = await api('GET', '/api/organizations/' + orgId + '/teams');
        // Fetch evaluators for coach assignment dropdown
        var evaluators = [];
        try { evaluators = await api('GET', '/api/organizations/' + orgId + '/evaluators'); } catch (ee) {}

        var withCoach = teams.filter(function(t) { return t.head_coach_id; }).length;
        document.getElementById('teams-stats-bar').innerHTML = buildStatCards([
            { value: teams.length, label: 'Total Teams', cls: '' },
            { value: withCoach, label: 'With Coach', cls: 'steel' },
            { value: teams.length - withCoach, label: 'Need Coach', cls: 'coral' },
        ]);

        var tbody = document.getElementById('ops-teams-table-body');
        if (teams.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:32px;"><div style="color:#888;margin-bottom:12px;"><i data-lucide="users" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i>No teams yet</div><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'btn-add-team\')&&document.getElementById(\'btn-add-team\').click()">Create Your First Team</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Or use AI Form Teams to auto-generate balanced teams</p></div></td></tr>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            var coachOpts = '<option value="">-- Select --</option>' + evaluators.map(function(ev) {
                return '<option value="' + ev.id + '">' + esc(ev.name) + '</option>';
            }).join('');
            tbody.innerHTML = teams.map(function(t) {
                var selectedCoachOpts = coachOpts.replace('value="' + (t.head_coach_id || '') + '"', 'value="' + (t.head_coach_id || '') + '" selected');
                return '<tr data-id="' + (t.id || '') + '"><td>' + esc(t.name) + '</td><td>' + esc(t.team_level || '-') + '</td>' +
                    '<td>' + esc(t.program_id ? 'Assigned' : '-') + '</td>' +
                    '<td>' + (t.head_coach_id ? '<span class="badge badge-yes">Assigned</span>' : '<span class="badge badge-no">None</span>') + '</td>' +
                    '<td><select class="form-select form-select-sm" onchange="assignCoachToTeam(\'' + t.id + '\', this.value)" style="min-width:140px;font-size:12px;">' + selectedCoachOpts + '</select></td>' +
                    '<td><button class="btn btn-sm btn-outline" onclick="viewRoster(\'' + t.id + '\')">Roster</button></td>' +
                    '<td><button class="btn btn-sm btn-outline" onclick="deleteOpsItem(\'teams\',\'' + t.id + '\')">Delete</button></td></tr>';
            }).join('');
        }
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    }
}

async function assignCoachToTeam(teamId, coachId) {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        await api('PATCH', '/api/organizations/' + orgId + '/teams/' + teamId, { head_coach_id: coachId || null });
        toast(coachId ? 'Coach assigned!' : 'Coach removed', 'success');
        loadOpsTeams(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

// --- Fields ---
var fieldCalendarWeekOffset = 0;

async function loadOpsFields(orgId) {
    if (!orgId) return;
    try {
        var fields = await api('GET', '/api/organizations/' + orgId + '/fields');

        // Stats bar
        var withLights = fields.filter(function(f) { return f.has_lights; }).length;
        var turfCount = fields.filter(function(f) { return f.surface_type === 'turf'; }).length;
        var avgRating = 0;
        var ratedFields = fields.filter(function(f) { return f.field_rating; });
        if (ratedFields.length > 0) avgRating = (ratedFields.reduce(function(s, f) { return s + f.field_rating; }, 0) / ratedFields.length).toFixed(1);
        document.getElementById('fields-stats-bar').innerHTML = buildStatCards([
            { value: fields.length, label: 'Total Fields', cls: '' },
            { value: turfCount, label: 'Turf Fields', cls: 'steel' },
            { value: withLights, label: 'With Lights', cls: 'coral' },
            { value: avgRating || '-', label: 'Avg Rating', cls: '' },
        ]);

        // --- FIELD MAP ---
        renderFieldMap(fields);

        // --- FIELD LIST with ratings, cost, weather ---
        var tbody = document.getElementById('fields-table-body');
        if (fields.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:32px;"><div style="color:#888;margin-bottom:12px;"><i data-lucide="map-pin" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i>No fields yet</div><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'btn-add-field\')&&document.getElementById(\'btn-add-field\').click()">Add Your First Field</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Or use the AI Assistant to import from your permit list</p></div></td></tr>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            tbody.innerHTML = fields.map(function(f) {
                // Star rating display
                var starsHtml = '';
                if (f.field_rating) {
                    var full = Math.floor(f.field_rating);
                    for (var s = 0; s < 5; s++) {
                        starsHtml += '<span style="color:' + (s < full ? '#F6C992' : '#dce3eb') + ';font-size:14px;">&#9733;</span>';
                    }
                    starsHtml += '<span style="font-size:11px;color:#5a6a7e;margin-left:2px;">' + f.field_rating.toFixed(1) + ' (' + (f.rating_count || 0) + ')</span>';
                } else {
                    starsHtml = '<span style="color:#aaa;font-size:11px;">No ratings</span>';
                }
                // Weather cancellations
                var weatherHtml = '';
                if (f.weather_cancellations > 0) {
                    weatherHtml = '<span style="color:#5484A4;font-size:12px;" title="' + f.weather_cancellations + ' weather cancellations"><i data-lucide="cloud-rain" style="width:13px;height:13px;display:inline;vertical-align:middle;"></i> ' + f.weather_cancellations + '</span>';
                } else {
                    weatherHtml = '<span style="color:#ccc;font-size:11px;">-</span>';
                }
                // Shared permit indicator
                var nameExtra = '';
                if (f.permit_shared_with) nameExtra = ' <span style="font-size:10px;color:#5484A4;" title="Shared with: ' + esc(f.permit_shared_with) + '">[shared]</span>';

                return '<tr id="field-row-' + f.id + '"><td>' + esc(f.name) + nameExtra + '</td>' +
                    '<td>' + starsHtml + ' <button class="btn btn-xs btn-outline" onclick="openRateField(\'' + f.id + '\',\'' + esc(f.name) + '\')">Rate</button></td>' +
                    '<td><span class="badge ' + (f.surface_type === 'turf' ? 'badge-active' : f.surface_type === 'grass' ? 'badge-draft' : 'badge-scoring') + '">' + esc(f.surface_type || '-') + '</span></td>' +
                    '<td>' + esc(f.size || '-') + '</td>' +
                    '<td>' + (f.permit_cost_per_hour ? '$' + f.permit_cost_per_hour.toFixed(0) + '/hr' : '-') + '</td>' +
                    '<td>' + (f.has_lights ? 'Yes' : 'No') + '</td>' +
                    '<td>' + weatherHtml + '</td>' +
                    '<td class="btn-group">' +
                        '<button class="btn btn-xs btn-outline" onclick="editFieldItem(\'' + f.id + '\')">Edit</button>' +
                        '<button class="btn btn-xs btn-danger" onclick="deleteOpsFieldItem(\'' + f.id + '\')">Delete</button>' +
                    '</td></tr>';
            }).join('');
        }

        loadFieldCalendar(orgId);
        loadFieldUtilization(orgId);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    }
}

// --- Field Map Rendering ---
function renderFieldMap(fields) {
    var dotsDiv = document.getElementById('field-map-dots');
    if (!dotsDiv) return;
    var minLat = 38.79, maxLat = 39.04, minLng = -77.12, maxLng = -76.91;
    var html = '';
    fields.forEach(function(f) {
        if (!f.latitude || !f.longitude) return;
        var left = ((f.longitude - minLng) / (maxLng - minLng) * 100).toFixed(2);
        var top = ((1 - (f.latitude - minLat) / (maxLat - minLat)) * 100).toFixed(2);
        var color = f.surface_type === 'turf' ? '#09A1A1' : f.surface_type === 'grass' ? '#27ae60' : '#8c99a9';
        html += '<div class="field-map-dot" onclick="scrollToField(\'' + f.id + '\')" ' +
            'style="position:absolute;left:' + left + '%;top:' + top + '%;width:12px;height:12px;border-radius:50%;background:' + color + ';border:2px solid #fff;cursor:pointer;z-index:3;transform:translate(-50%,-50%);box-shadow:0 1px 3px rgba(0,0,0,0.3);" ' +
            'title="' + esc(f.name) + (f.field_rating ? ' (' + f.field_rating.toFixed(1) + '★)' : '') + '">' +
            '</div>';
    });
    dotsDiv.innerHTML = html;
}

function scrollToField(fieldId) {
    var row = document.getElementById('field-row-' + fieldId);
    if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.background = '#e8f2f2';
        setTimeout(function() { row.style.background = ''; }, 2000);
    }
}

// --- Field Rating ---
function openRateField(fieldId, fieldName) {
    var starsHtml = '';
    for (var i = 1; i <= 5; i++) {
        starsHtml += '<span onclick="submitFieldRating(\'' + fieldId + '\',' + i + ')" style="cursor:pointer;font-size:28px;color:#F6C992;margin:0 2px;">&#9733;</span>';
    }
    openModal('Rate ' + fieldName,
        '<div style="text-align:center;padding:12px 0;">' +
        '<p style="margin-bottom:12px;">Select a rating:</p>' +
        '<div>' + starsHtml + '</div>' +
        '<label style="margin-top:12px;display:block;">Comment (optional)</label>' +
        '<input type="text" id="field-rate-comment" class="form-input" placeholder="Any notes...">' +
        '</div>',
        '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>'
    );
}

async function submitFieldRating(fieldId, rating) {
    try {
        await api('POST', '/api/fields/' + fieldId + '/rate', {
            rating: rating,
            comment: document.getElementById('field-rate-comment') ? document.getElementById('field-rate-comment').value : '',
        });
        closeModal();
        toast('Rated ' + rating + ' star' + (rating > 1 ? 's' : ''), 'success');
        loadOpsFields(requireOrg());
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function editFieldItem(fieldId) {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        showLoading();
        var fields = await api('GET', '/api/organizations/' + orgId + '/fields');
        hideLoading();
        var f = fields.find(function(x) { return x.id === fieldId; });
        if (!f) { toast('Field not found', 'error'); return; }
        openModal('Edit Field',
            '<label>Name</label><input type="text" id="field-edit-name" class="form-input" value="' + esc(f.name) + '">' +
            '<label>Address</label><input type="text" id="field-edit-address" class="form-input" value="' + esc(f.location_address || '') + '">' +
            '<label>Surface</label><select id="field-edit-surface" class="form-select"><option value="grass"' + (f.surface_type === 'grass' ? ' selected' : '') + '>Grass</option><option value="turf"' + (f.surface_type === 'turf' ? ' selected' : '') + '>Turf</option><option value="indoor"' + (f.surface_type === 'indoor' ? ' selected' : '') + '>Indoor</option></select>' +
            '<label>Size</label><select id="field-edit-size" class="form-select"><option value="full"' + (f.size === 'full' ? ' selected' : '') + '>Full</option><option value="3_4"' + (f.size === '3_4' ? ' selected' : '') + '>3/4</option><option value="half"' + (f.size === 'half' ? ' selected' : '') + '>Half</option><option value="small"' + (f.size === 'small' ? ' selected' : '') + '>Small</option></select>' +
            '<label><input type="checkbox" id="field-edit-lights"' + (f.has_lights ? ' checked' : '') + '> Has Lights</label>' +
            '<label>Permitted Hours</label><input type="text" id="field-edit-hours" class="form-input" placeholder="e.g. 8:00-21:00" value="' + esc(f.permitted_hours || '') + '">' +
            '<label>Permit Cost ($/hr)</label><input type="number" id="field-edit-cost" class="form-input" placeholder="e.g. 75" step="0.01" value="' + (f.permit_cost_per_hour || '') + '">' +
            '<label>Shared Permit With</label><input type="text" id="field-edit-shared" class="form-input" placeholder="e.g. Soccer league, DCPR" value="' + esc(f.permit_shared_with || '') + '">' +
            '<label>Permit Notes</label><textarea id="field-edit-permit-notes" class="form-input" style="height:60px;">' + esc(f.permit_notes || '') + '</textarea>',
            '<button class="btn btn-primary" onclick="submitEditField(\'' + fieldId + '\')">Save</button><button class="btn btn-outline" onclick="closeModal()">Cancel</button>'
        );
    } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
}

async function submitEditField(fieldId) {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        await api('PATCH', '/api/organizations/' + orgId + '/fields/' + fieldId, {
            name: document.getElementById('field-edit-name').value,
            location_address: document.getElementById('field-edit-address').value || null,
            surface_type: document.getElementById('field-edit-surface').value,
            size: document.getElementById('field-edit-size').value,
            has_lights: document.getElementById('field-edit-lights').checked,
            permitted_hours: document.getElementById('field-edit-hours').value || null,
            permit_cost_per_hour: parseFloat(document.getElementById('field-edit-cost').value) || null,
            permit_shared_with: document.getElementById('field-edit-shared').value || null,
            permit_notes: document.getElementById('field-edit-permit-notes').value || null,
        });
        closeModal();
        toast('Field updated', 'success');
        loadOpsFields(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function loadFieldCalendar(orgId) {
    var calBody = document.getElementById('field-calendar-body');
    if (!orgId) { calBody.innerHTML = '<p class="text-muted">Select an organization.</p>'; return; }

    var today = new Date();
    var monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1 + (fieldCalendarWeekOffset * 7));
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    var startStr = monday.toISOString().split('T')[0];
    var endStr = sunday.toISOString().split('T')[0];

    try {
        var [fields, entries] = await Promise.all([
            api('GET', '/api/organizations/' + orgId + '/fields'),
            api('GET', '/api/organizations/' + orgId + '/schedules/calendar?start=' + startStr + '&end=' + endStr),
        ]);

        var dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        var dayDates = [];
        for (var d = 0; d < 7; d++) {
            var dd = new Date(monday);
            dd.setDate(monday.getDate() + d);
            dayDates.push(dd.toISOString().split('T')[0]);
        }

        var nav = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">' +
            '<button class="btn btn-sm btn-outline" onclick="fieldCalendarWeekOffset--;loadFieldCalendar(\'' + orgId + '\')">&larr; Prev</button>' +
            '<strong>' + startStr + ' to ' + endStr + '</strong>' +
            '<button class="btn btn-sm btn-outline" onclick="fieldCalendarWeekOffset++;loadFieldCalendar(\'' + orgId + '\')">&rarr; Next</button>' +
            '</div>';

        var thead = '<thead><tr><th>Field</th>' + dayNames.map(function(dn, i) {
            return '<th>' + dn + '<br><small>' + dayDates[i].substring(5) + '</small></th>';
        }).join('') + '</tr></thead>';

        var tbody = '<tbody>';
        fields.forEach(function(field) {
            tbody += '<tr><td><strong>' + esc(field.name) + '</strong></td>';
            dayDates.forEach(function(dateStr) {
                var dayEntries = entries.filter(function(e) {
                    return e.field_id === field.id && e.start_time && e.start_time.substring(0, 10) === dateStr;
                });
                var cellHtml = '';
                dayEntries.forEach(function(e) {
                    var colorMap = { practice: '#3498db', game: '#27ae60', tournament: '#e67e22', cancelled: '#e74c3c' };
                    var color = colorMap[e.entry_type] || '#6c757d';
                    if (e.status === 'cancelled') color = '#e74c3c';
                    var time = new Date(e.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    cellHtml += '<div class="cal-slot" style="background:' + color + ';color:#fff;padding:2px 4px;border-radius:3px;margin-bottom:2px;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
                        time + ' ' + esc(e.team_name || e.title || e.entry_type) + '</div>';
                });
                tbody += '<td style="vertical-align:top;min-width:100px;">' + (cellHtml || '<span style="color:#ccc;font-size:11px;">-</span>') + '</td>';
            });
            tbody += '</tr>';
        });
        tbody += '</tbody>';

        if (fields.length === 0) {
            calBody.innerHTML = nav + '<p class="text-muted">No fields created yet.</p>';
        } else {
            calBody.innerHTML = nav + '<div style="overflow-x:auto;"><table class="data-table field-calendar">' + thead + tbody + '</table></div>';
        }
    } catch (e) {
        calBody.innerHTML = '<p class="text-muted">No field calendar data available. Add fields and bookings to see the calendar.</p>';
    }
}

// --- Smart Field Optimizer ---
async function runFieldOptimizer() {
    var orgId = requireOrg();
    if (!orgId) return;
    var strategy = document.getElementById('opt-strategy').value;
    var wDist = parseInt(document.getElementById('opt-w-dist').value) || 40;
    var wQual = parseInt(document.getElementById('opt-w-qual').value) || 30;
    var wUtil = parseInt(document.getElementById('opt-w-util').value) || 30;
    var maxTeams = parseInt(document.getElementById('opt-max-teams').value) || 3;
    var requireLights = document.getElementById('opt-lights').checked;
    var preferTurf = document.getElementById('opt-turf-rain').checked;

    try {
        showLoading();
        var result = await api('POST', '/api/organizations/' + orgId + '/fields/optimize', {
            optimize_for: strategy,
            weights: { distance: wDist, field_quality: wQual, utilization: wUtil },
            constraints: {
                require_lights_after: requireLights ? '18:00' : null,
                prefer_turf_in_rain: preferTurf,
                max_teams_per_field: maxTeams,
            },
            teams: null,
        });
        hideLoading();

        var resultsDiv = document.getElementById('optimizer-results');
        resultsDiv.style.display = 'block';

        // Ward distribution badges
        var wardDiv = document.getElementById('optimizer-ward-dist');
        var wardHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><strong style="font-size:13px;margin-right:4px;">Ward Distribution:</strong>';
        var wardColors = { NW: '#09A1A1', NE: '#5484A4', SW: '#FA6E82', SE: '#F6C992', Unknown: '#8c99a9' };
        var wd = result.ward_distribution || {};
        Object.keys(wd).forEach(function(w) {
            wardHtml += '<span style="display:inline-block;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;color:#fff;background:' + (wardColors[w] || '#8c99a9') + ';">' + w + ': ' + wd[w] + '</span>';
        });
        wardHtml += '<span style="font-size:12px;color:#5a6a7e;margin-left:8px;">' + (result.total_teams || 0) + ' teams across ' + (result.total_fields_used || 0) + ' fields</span></div>';
        wardDiv.innerHTML = wardHtml;

        // Results table
        var tbody = document.getElementById('optimizer-results-body');
        if (result.assignments && result.assignments.length > 0) {
            tbody.innerHTML = result.assignments.map(function(a) {
                var surfaceBadge = a.surface === 'turf' ? 'badge-active' : a.surface === 'grass' ? 'badge-draft' : 'badge-scoring';
                var scoreColor = a.score >= 0.7 ? '#09A1A1' : a.score >= 0.4 ? '#F6C992' : '#FA6E82';
                return '<tr><td>' + esc(a.team_name) + '</td>' +
                    '<td>' + esc(a.field_name) + '</td>' +
                    '<td><span class="badge ' + surfaceBadge + '">' + esc(a.surface) + '</span></td>' +
                    '<td>' + (a.distance_km != null ? a.distance_km + ' km' : '-') + '</td>' +
                    '<td><strong style="color:' + scoreColor + ';">' + (a.score * 100).toFixed(0) + '%</strong></td>' +
                    '<td style="font-size:12px;color:#5a6a7e;">' + (a.reasons || []).join(', ') + '</td></tr>';
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:20px;color:#888;">No assignments generated. Add teams first.</td></tr>';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Load drive analysis
        loadDriveAnalysis(orgId);
    } catch (e) {
        hideLoading();
        toast('Optimizer error: ' + e.message, 'error');
    }
}

async function loadDriveAnalysis(orgId) {
    try {
        var data = await api('GET', '/api/organizations/' + orgId + '/fields/drive-analysis');
        var container = document.getElementById('optimizer-drive-analysis');
        var tbody = document.getElementById('drive-analysis-body');
        if (data.teams && data.teams.length > 0) {
            container.style.display = 'block';
            tbody.innerHTML = data.teams.map(function(t) {
                var statusColor = t.flag ? '#FA6E82' : '#09A1A1';
                var statusText = t.flag ? '<strong style="color:#FA6E82;">Long Drive</strong>' : '<span style="color:#09A1A1;">OK</span>';
                return '<tr><td>' + esc(t.team_name) + '</td>' +
                    '<td>' + esc(t.field_name || '-') + '</td>' +
                    '<td>' + t.player_count + (t.players_with_ward ? ' (' + t.players_with_ward + ' with ward)' : '') + '</td>' +
                    '<td>' + (t.avg_distance_km != null ? t.avg_distance_km + ' km' : '-') + '</td>' +
                    '<td>' + (t.est_drive_min != null ? t.est_drive_min + ' min' : '-') + '</td>' +
                    '<td>' + statusText + '</td></tr>';
            }).join('');
            if (data.total_flagged > 0) {
                toast(data.total_flagged + ' team(s) have long average drives', 'warning');
            }
        } else {
            container.style.display = 'none';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        // silently fail — drive analysis is supplemental
    }
}

// --- Utilization Dashboard ---
async function loadFieldUtilization(orgId) {
    if (!orgId) return;
    try {
        var data = await api('GET', '/api/organizations/' + orgId + '/fields/utilization');

        var costCards = [];
        if (data.total_permit_cost > 0) {
            costCards = [
                { value: '$' + data.total_permit_cost.toLocaleString(), label: 'Total Permit Cost', cls: '' },
                { value: '$' + data.cost_per_team, label: 'Cost/Team', cls: '' },
                { value: '$' + data.cost_efficiency + '/hr', label: 'Cost Efficiency', cls: '' },
            ];
        }

        document.getElementById('utilization-stats-bar').innerHTML = buildStatCards([
            { value: data.total_fields, label: 'Total Fields', cls: '' },
            { value: data.total_bookings, label: 'Active Bookings', cls: 'steel' },
            { value: data.average_utilization + '%', label: 'Avg Utilization', cls: data.average_utilization > 85 ? 'coral' : '' },
            { value: data.total_hours + 'h', label: 'Hours Booked', cls: '' },
        ].concat(costCards));

        var barsDiv = document.getElementById('utilization-bars');
        if (data.fields && data.fields.length > 0) {
            var html = '';
            data.fields.forEach(function(f) {
                var pct = Math.min(f.percent_utilized, 100);
                var barColor = f.status === 'overutilized' ? '#FA6E82' : f.status === 'underutilized' ? '#F6C992' : '#09A1A1';
                var statusLabel = f.status === 'overutilized' ? ' (Overutilized)' : f.status === 'underutilized' ? ' (Underutilized)' : '';
                var costLabel = f.permit_cost > 0 ? ' — $' + f.permit_cost : '';
                html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                    '<div style="width:200px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + esc(f.field_name) + '">' + esc(f.field_name) + '</div>' +
                    '<div style="flex:1;height:18px;background:#eef1f5;border-radius:3px;overflow:hidden;">' +
                    '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:3px;"></div></div>' +
                    '<div style="width:120px;font-size:12px;text-align:right;color:' + barColor + ';font-weight:600;">' + f.percent_utilized + '%' + statusLabel + costLabel + '</div>' +
                    '</div>';
            });
            barsDiv.innerHTML = html;
        } else {
            barsDiv.innerHTML = '<p class="text-muted" style="padding:12px;">No field data available.</p>';
        }

        // Season Comparison
        var scDiv = document.getElementById('season-comparison');
        var scBody = document.getElementById('season-comparison-body');
        if (data.season_comparison && data.season_comparison.length > 1) {
            scDiv.style.display = 'block';
            scBody.innerHTML = data.season_comparison.map(function(s) {
                return '<tr><td><strong>' + esc(s.season) + '</strong></td><td>' + s.fields_used + '</td><td>' + s.total_hours + 'h</td><td>' + s.bookings + '</td></tr>';
            }).join('');
        } else {
            scDiv.style.display = 'none';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        document.getElementById('utilization-stats-bar').innerHTML = '';
        document.getElementById('utilization-bars').innerHTML = '<p class="text-muted">Utilization data unavailable.</p>';
    }
}

// --- Weather Reassignment ---
var _weatherReassignData = null;

async function runWeatherReassign() {
    var orgId = requireOrg();
    if (!orgId) return;
    var date = document.getElementById('weather-date').value;
    if (!date) { toast('Select a date first', 'warning'); return; }

    try {
        showLoading();
        var result = await api('POST', '/api/organizations/' + orgId + '/fields/weather-reassign', {
            date: date,
            affected_fields: [],
            reason: 'rain',
        });
        hideLoading();
        _weatherReassignData = result;

        var resultsDiv = document.getElementById('weather-reassign-results');
        resultsDiv.style.display = 'block';

        var tbody = document.getElementById('weather-reassign-body');
        if (result.reassignments && result.reassignments.length > 0) {
            tbody.innerHTML = result.reassignments.map(function(r) {
                var hasAlt = r.suggested_field_id != null;
                return '<tr>' +
                    '<td>' + esc(r.booking_title) + '</td>' +
                    '<td>' + (r.booking_time ? new Date(r.booking_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '-') + '</td>' +
                    '<td>' + esc(r.original_field_name) + '</td>' +
                    '<td>' + (hasAlt ? esc(r.suggested_field_name) : '<span style="color:#FA6E82;">No alternative</span>') + '</td>' +
                    '<td>' + (r.distance_change_km != null ? '+' + r.distance_change_km + ' km' : '-') + '</td>' +
                    '</tr>';
            }).join('');
            document.getElementById('btn-apply-reassign').style.display = 'inline-flex';
            toast(result.total_affected + ' booking(s) can be reassigned', 'success');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:20px;color:#888;">No grass-field bookings found on this date.</td></tr>';
            document.getElementById('btn-apply-reassign').style.display = 'none';
        }
    } catch (e) {
        hideLoading();
        toast('Error: ' + e.message, 'error');
    }
}

async function applyWeatherReassignments() {
    var orgId = requireOrg();
    if (!orgId || !_weatherReassignData) return;
    if (!confirm('Apply all ' + _weatherReassignData.total_affected + ' reassignments?')) return;

    var validReassignments = _weatherReassignData.reassignments.filter(function(r) { return r.suggested_field_id; });
    try {
        showLoading();
        var result = await api('POST', '/api/organizations/' + orgId + '/fields/weather-reassign/apply', {
            reassignments: validReassignments,
        });
        hideLoading();
        toast('Applied ' + result.applied + ' reassignment(s)', 'success');
        document.getElementById('btn-apply-reassign').style.display = 'none';
        _weatherReassignData = null;
        loadOpsFields(orgId);
    } catch (e) {
        hideLoading();
        toast('Error: ' + e.message, 'error');
    }
}

// --- Schedule ---
async function loadOpsSchedule(orgId) {
    if (!orgId) return;
    try {
        var now = new Date();
        var start = now.toISOString().split('T')[0];
        var end = new Date(now.getTime() + 90 * 86400000).toISOString().split('T')[0];
        var entries = await api('GET', '/api/organizations/' + orgId + '/schedules/calendar?start=' + start + '&end=' + end);

        var games = entries.filter(function(e) { return e.entry_type === 'game'; }).length;
        var practices = entries.filter(function(e) { return e.entry_type === 'practice'; }).length;
        var cancelled = entries.filter(function(e) { return e.status === 'cancelled'; }).length;
        document.getElementById('schedule-stats-bar').innerHTML = buildStatCards([
            { value: entries.length, label: 'Total Entries', cls: '' },
            { value: games, label: 'Games', cls: 'steel' },
            { value: practices, label: 'Practices', cls: '' },
            { value: cancelled, label: 'Cancelled', cls: 'coral' },
        ]);

        var tbody = document.getElementById('schedule-table-body');
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:32px;"><div style="color:#888;margin-bottom:12px;"><i data-lucide="calendar-clock" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i>No schedule entries in the next 90 days</div><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'btn-gen-practices\')&&document.getElementById(\'btn-gen-practices\').click()">Generate Practices</button> <button class="btn btn-outline btn-sm" onclick="document.getElementById(\'btn-gen-games\')&&document.getElementById(\'btn-gen-games\').click()" style="margin-left:8px;">Generate Games</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Auto-generate a full practice and game schedule for the season</p></div></td></tr>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            tbody.innerHTML = entries.map(function(e) {
                var dt = new Date(e.start_time);
                var typeColor = e.entry_type === 'game' ? 'badge-active' : e.entry_type === 'practice' ? 'badge-scoring' : 'badge-draft';
                return '<tr><td>' + dt.toLocaleDateString() + '</td><td>' + dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</td>' +
                    '<td><span class="badge ' + typeColor + '">' + esc(e.entry_type) + '</span></td><td>' + esc(e.title || '-') + '</td>' +
                    '<td>' + esc(e.field_name || '-') + '</td>' +
                    '<td><span class="badge badge-' + (e.status === 'scheduled' ? 'active' : e.status === 'cancelled' ? 'no' : 'draft') + '">' + esc(e.status) + '</span></td>' +
                    '<td><button class="btn btn-xs btn-danger" onclick="deleteOpsScheduleItem(\'' + e.id + '\')">Delete</button></td></tr>';
            }).join('');
        }
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    }
}

// --- Coaches ---
async function loadOpsCoaches(orgId) {
    if (!orgId) return;
    try {
        var coaches = await api('GET', '/api/organizations/' + orgId + '/coaches');

        var totalCerts = 0;
        var expiringCerts = 0;
        var now = new Date();
        var thirtyDays = new Date(now.getTime() + 30 * 86400000);
        coaches.forEach(function(c) {
            (c.certifications || []).forEach(function(cert) {
                totalCerts++;
                if (cert.expiry && new Date(cert.expiry) <= thirtyDays) expiringCerts++;
            });
        });

        document.getElementById('coaches-stats-bar').innerHTML = buildStatCards([
            { value: coaches.length, label: 'Coaches', cls: '' },
            { value: totalCerts, label: 'Certifications', cls: 'steel' },
            { value: expiringCerts, label: 'Expiring (30d)', cls: expiringCerts > 0 ? 'coral' : '' },
        ]);

        // Show cert expiry alerts prominently
        var certAlertDiv = document.getElementById('coaches-cert-alerts');
        if (expiringCerts > 0) {
            var alertHtml = '<strong style="color:#856404;">Certification Expiry Alerts</strong><br>';
            coaches.forEach(function(c) {
                (c.certifications || []).forEach(function(cert) {
                    if (cert.expiry && new Date(cert.expiry) <= thirtyDays) {
                        var daysLeft = Math.ceil((new Date(cert.expiry) - now) / 86400000);
                        var urgency = daysLeft <= 0 ? 'EXPIRED' : daysLeft + ' days left';
                        alertHtml += '<div style="padding:4px 0;font-size:13px;"><strong>' + esc(c.name) + '</strong>: ' + esc(cert.name) + ' — <span style="color:' + (daysLeft <= 7 ? '#dc3545' : '#e67e22') + ';font-weight:600;">' + urgency + '</span></div>';
                    }
                });
            });
            certAlertDiv.querySelector('.card-body').innerHTML = alertHtml;
            certAlertDiv.style.display = 'block';
        } else {
            certAlertDiv.style.display = 'none';
        }

        var tbody = document.getElementById('coaches-table-body');
        if (coaches.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:32px;"><div style="color:#888;margin-bottom:12px;"><i data-lucide="clipboard-check" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i>No coaches yet</div><button class="btn btn-primary btn-sm" onclick="navigateTo(\'events\')">Add Evaluators First</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Coaches appear here once added as evaluators in the Events section</p></div></td></tr>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            tbody.innerHTML = coaches.map(function(c) {
                var certs = (c.certifications || []).map(function(cert) {
                    var expDate = cert.expiry ? new Date(cert.expiry) : null;
                    var isExpiring = expDate && expDate <= thirtyDays;
                    return '<span style="' + (isExpiring ? 'color:#dc3545;font-weight:600;' : '') + '">' + esc(cert.name) + (isExpiring ? ' !!!' : '') + '</span>';
                }).join(', ') || 'None';
                var teams = (c.team_assignments || []).map(function(t) { return t.team_name; }).join(', ') || 'None';
                return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.email || '-') + '</td>' +
                    '<td>' + esc(c.phone || '-') + '</td><td>' + certs + '</td>' +
                    '<td><span class="badge badge-' + (c.background_check_status === 'cleared' ? 'yes' : 'no') + '">' + esc(c.background_check_status || '-') + '</span></td>' +
                    '<td>' + esc(teams) + '</td>' +
                    '<td><button class="btn btn-sm btn-outline" onclick="editCoachCerts(\'' + c.id + '\')">Edit Certs</button></td></tr>';
            }).join('');
        }
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    }
}

// --- Communications ---
async function loadOpsComms(orgId) {
    if (!orgId) return;
    try {
        var msgs = await api('GET', '/api/organizations/' + orgId + '/messages');

        var sent = msgs.filter(function(m) { return m.status === 'sent'; }).length;
        var drafts = msgs.filter(function(m) { return m.status === 'draft'; }).length;
        var totalRecipients = msgs.reduce(function(sum, m) { return sum + (m.recipient_count || 0); }, 0);
        document.getElementById('comms-stats-bar').innerHTML = buildStatCards([
            { value: msgs.length, label: 'Total Messages', cls: '' },
            { value: sent, label: 'Sent', cls: 'steel' },
            { value: drafts, label: 'Drafts', cls: '' },
            { value: totalRecipients, label: 'Recipients', cls: 'coral' },
        ]);

        var tbody = document.getElementById('messages-table-body');
        if (msgs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:32px;"><div style="color:#888;margin-bottom:12px;"><i data-lucide="mail" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i>No messages yet</div><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'btn-compose-msg\')&&document.getElementById(\'btn-compose-msg\').click()">Compose Your First Message</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Or use AI Draft to auto-generate a message</p></div></td></tr>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        var smtpNote = '<tr><td colspan="7" style="background:#fff3cd;color:#856404;font-size:12px;padding:8px 12px;border-left:3px solid #ffc107;">Note: SMTP not configured — emails are logged in dry-run mode. Configure SMTP_HOST env var to enable real sending.</td></tr>';
        tbody.innerHTML = smtpNote + msgs.map(function(m) {
            return '<tr><td>' + esc(m.subject || '(no subject)') + '</td><td>' + esc(m.audience_type) + '</td>' +
                '<td>' + esc(m.channel) + '</td>' +
                '<td><span class="badge badge-' + (m.status === 'sent' ? 'success' : m.status === 'draft' ? 'default' : 'warning') + '">' + esc(m.status) + '</span></td>' +
                '<td>' + m.recipient_count + '</td>' +
                '<td>' + esc(m.sent_at || '-') + '</td>' +
                '<td>' + (m.status === 'draft' ? '<button class="btn btn-sm btn-primary" onclick="sendOpsMessage(\'' + m.id + '\')">Send</button> ' : '') +
                '</td></tr>';
        }).join('');
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    }
}

// --- Import ---
async function loadOpsImport(orgId) {
    if (!orgId) return;
    try {
        var imports = await api('GET', '/api/organizations/' + orgId + '/imports');
        var tbody = document.getElementById('imports-table-body');
        tbody.innerHTML = imports.map(function(i) {
            return '<tr><td>' + esc(i.created_at) + '</td><td>' + esc(i.import_type) + '</td>' +
                '<td>' + i.row_count + '</td><td>' + i.imported_count + '</td>' +
                '<td><span class="badge badge-' + (i.status === 'completed' ? 'success' : 'default') + '">' + esc(i.status) + '</span></td></tr>';
        }).join('');
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    }
}

// --- Ops Helper Functions ---
async function deleteOpsItem(type, id) {
    if (!confirm('Delete this item?')) return;
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        await api('DELETE', '/api/organizations/' + orgId + '/' + type + '/' + id);
        toast('Deleted', 'success');
        var active = document.querySelector('.nav-item.active');
        if (active) navigateTo(active.getAttribute('data-section'));
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function deleteOpsFieldItem(fieldId) {
    if (!confirm('Delete this field?')) return;
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        await api('DELETE', '/api/organizations/' + orgId + '/fields/' + fieldId);
        toast('Deleted', 'success');
        loadOpsFields(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function deleteOpsScheduleItem(entryId) {
    if (!confirm('Delete this schedule entry?')) return;
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        await api('DELETE', '/api/organizations/' + orgId + '/schedules/' + entryId);
        toast('Deleted', 'success');
        loadOpsSchedule(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function viewSeasonDashboard(seasonId) {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        showLoading();
        var data = await api('GET', '/api/organizations/' + orgId + '/seasons/' + seasonId + '/dashboard');
        hideLoading();
        openModal('Season Dashboard: ' + data.season.name,
            '<div class="stats-grid">' +
            '<div class="stat-card"><div class="stat-value">' + data.programs + '</div><div class="stat-label">Programs</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + data.teams + '</div><div class="stat-label">Teams</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + data.players_rostered + '</div><div class="stat-label">Players Rostered</div></div>' +
            '</div>'
        );
    } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
}

async function viewRoster(teamId) {
    try {
        showLoading();
        var roster = await api('GET', '/api/teams/' + teamId + '/roster');
        hideLoading();
        var html = '<table class="data-table"><thead><tr><th>#</th><th>Name</th><th>Position</th><th>Role</th><th>Status</th></tr></thead><tbody>';
        roster.forEach(function(r) {
            html += '<tr><td>' + (r.jersey_number || '-') + '</td><td>' + esc(r.player_name) + '</td>' +
                '<td>' + esc(r.position || '-') + '</td><td>' + esc(r.role) + '</td><td>' + esc(r.status) + '</td></tr>';
        });
        html += '</tbody></table>';
        if (roster.length === 0) html = '<p class="text-muted">No players on roster.</p>';
        openModal('Team Roster', html);
    } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
}

async function sendOpsMessage(msgId) {
    if (!confirm('Send this message now?')) return;
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        showLoading();
        var result = await api('POST', '/api/organizations/' + orgId + '/messages/' + msgId + '/send');
        hideLoading();
        toast('Sent to ' + result.recipient_count + ' recipients', 'success');
        loadOpsComms(orgId);
    } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
}

function editCoachCerts(coachId) {
    openModal('Update Certifications',
        '<p style="margin-bottom:8px;">Enter certifications as JSON array:</p>' +
        '<textarea id="cert-json" class="form-input" style="width:100%;height:120px;font-family:monospace;" placeholder=\'[{"name":"SafeSport","expiry":"2026-12-01","status":"active"}]\'></textarea>',
        '<button class="btn btn-primary" onclick="saveCerts(\'' + coachId + '\')">Save</button>'
    );
}

async function saveCerts(coachId) {
    var json = document.getElementById('cert-json').value;
    try {
        var certs = JSON.parse(json);
        await api('PATCH', '/api/evaluators/' + coachId + '/certifications', { certifications: certs });
        closeModal();
        toast('Certifications updated', 'success');
        var orgId = requireOrg();
        if (orgId) loadOpsCoaches(orgId);
    } catch (e) { toast('Invalid JSON or error: ' + e.message, 'error'); }
}

// --- Attendance ---
async function loadOpsAttendance(orgId) {
    if (!orgId) return;
    try {
        var teams = await api('GET', '/api/organizations/' + orgId + '/teams');
        var teamSelect = document.getElementById('attendance-team-select');
        teamSelect.innerHTML = '<option value="">-- Select Team --</option>' +
            teams.map(function(t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');

        // Try to load at-risk players
        try {
            var atRisk = await api('GET', '/api/organizations/' + orgId + '/attendance/at-risk');
            if (atRisk && atRisk.length > 0) {
                document.getElementById('attendance-stats-bar').innerHTML = buildStatCards([
                    { value: teams.length, label: 'Teams', cls: '' },
                    { value: atRisk.length, label: 'At-Risk Players', cls: 'coral' },
                ]);
            } else {
                document.getElementById('attendance-stats-bar').innerHTML = buildStatCards([
                    { value: teams.length, label: 'Teams', cls: '' },
                    { value: 0, label: 'At-Risk Players', cls: '' },
                ]);
            }
        } catch (_) {
            document.getElementById('attendance-stats-bar').innerHTML = buildStatCards([
                { value: teams.length, label: 'Teams', cls: '' },
            ]);
        }
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

document.getElementById('attendance-team-select').addEventListener('change', async function() {
    var teamId = this.value;
    var entrySelect = document.getElementById('attendance-entry-select');
    var orgId = getSelectedOrg();
    if (!teamId || !orgId) {
        entrySelect.innerHTML = '<option value="">-- Select Schedule Entry --</option>';
        document.getElementById('attendance-stats-bar').innerHTML = '';
        return;
    }
    try {
        var entries = await api('GET', '/api/organizations/' + orgId + '/schedules?team_id=' + teamId);
        entrySelect.innerHTML = '<option value="">-- Select Schedule Entry --</option>' +
            entries.map(function(e) {
                var dt = e.start_time ? new Date(e.start_time).toLocaleDateString() : '';
                return '<option value="' + e.id + '">' + esc(e.title || e.entry_type) + ' — ' + dt + '</option>';
            }).join('');

        // Stats bar for team
        var totalEntries = entries.length;
        var completed = entries.filter(function(e) { return e.status === 'completed'; }).length;
        document.getElementById('attendance-stats-bar').innerHTML = buildStatCards([
            { value: totalEntries, label: 'Total Sessions', cls: '' },
            { value: completed, label: 'Completed', cls: 'steel' },
            { value: totalEntries - completed, label: 'Upcoming', cls: '' },
        ]);

        // Load team attendance stats
        try {
            var stats = await api('GET', '/api/organizations/' + orgId + '/teams/' + teamId + '/attendance-stats');
            var statsBody = document.getElementById('attendance-stats-body');
            if (stats.players && stats.players.length > 0) {
                var rows = stats.players.map(function(p) {
                    var pct = p.total > 0 ? Math.round((p.present / p.total) * 100) : 0;
                    var color = pct >= 80 ? '#27ae60' : pct >= 50 ? '#f39c12' : '#e74c3c';
                    return '<tr><td>' + esc(p.player_name) + '</td>' +
                        '<td>' + p.present + '/' + p.total + '</td>' +
                        '<td><div style="display:flex;align-items:center;gap:8px;"><div style="width:60px;height:8px;background:#eee;border-radius:4px;"><div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:4px;"></div></div><span style="font-size:12px;font-weight:600;color:' + color + ';">' + pct + '%</span></div></td></tr>';
                }).join('');
                statsBody.innerHTML = '<table class="data-table"><thead><tr><th>Player</th><th>Present/Total</th><th>Rate</th></tr></thead><tbody>' + rows + '</tbody></table>';
            } else {
                statsBody.innerHTML = '<p class="text-muted">No attendance data yet.</p>';
            }
        } catch (_) {
            document.getElementById('attendance-stats-body').innerHTML = '<p class="text-muted">Could not load stats.</p>';
        }
    } catch (e) { toast('Error: ' + e.message, 'error'); }
});

document.getElementById('attendance-entry-select').addEventListener('change', async function() {
    var entryId = this.value;
    var teamId = document.getElementById('attendance-team-select').value;
    var rosterBody = document.getElementById('attendance-roster-body');
    var orgId = getSelectedOrg();
    if (!entryId || !teamId) {
        rosterBody.innerHTML = '<p class="text-muted">Select a schedule entry to mark attendance.</p>';
        return;
    }
    try {
        showLoading();
        var [roster, existing] = await Promise.all([
            api('GET', '/api/teams/' + teamId + '/roster'),
            api('GET', '/api/schedules/' + entryId + '/attendance').catch(function() { return []; }),
        ]);
        hideLoading();

        var existingMap = {};
        (existing || []).forEach(function(a) { existingMap[a.player_id] = a.status; });

        if (roster.length === 0) {
            rosterBody.innerHTML = '<p class="text-muted">No players on this team roster.</p>';
            return;
        }

        var rows = roster.map(function(r) {
            var isPresent = existingMap[r.player_id] === 'present';
            var isAbsent = existingMap[r.player_id] === 'absent';
            return '<tr>' +
                '<td>' + esc(r.player_name) + '</td>' +
                '<td>' + esc(r.position || '-') + '</td>' +
                '<td>' +
                    '<label style="cursor:pointer;margin-right:12px;"><input type="radio" name="att-' + r.player_id + '" value="present" ' + (isPresent || !existingMap[r.player_id] ? '' : '') + (isPresent ? 'checked' : '') + '> Present</label>' +
                    '<label style="cursor:pointer;"><input type="radio" name="att-' + r.player_id + '" value="absent" ' + (isAbsent ? 'checked' : '') + '> Absent</label>' +
                '</td></tr>';
        }).join('');

        rosterBody.innerHTML = '<table class="data-table"><thead><tr><th>Player</th><th>Position</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '<button class="btn btn-primary" style="margin-top:12px;" onclick="submitAttendance(\'' + entryId + '\')">Submit Attendance</button>';
    } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
});

async function submitAttendance(entryId) {
    var radios = document.querySelectorAll('input[name^="att-"]:checked');
    var records = [];
    radios.forEach(function(r) {
        var playerId = r.name.replace('att-', '');
        records.push({ player_id: playerId, status: r.value });
    });
    if (records.length === 0) { toast('Mark at least one player', 'warning'); return; }
    try {
        showLoading();
        await api('POST', '/api/schedules/' + entryId + '/attendance', { records: records });
        hideLoading();
        toast('Attendance submitted for ' + records.length + ' players', 'success');
    } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
}

// --- Documents ---
async function loadOpsDocuments(orgId) {
    if (!orgId) return;
    try {
        var players = await api('GET', '/api/organizations/' + orgId + '/players?active=true');
        var playerSelect = document.getElementById('docs-player-select');
        playerSelect.innerHTML = '<option value="">-- Select Player --</option>' +
            players.map(function(p) { return '<option value="' + p.id + '">' + esc(p.first_name + ' ' + p.last_name) + '</option>'; }).join('');

        // Load missing documents alert
        var missingCount = 0;
        try {
            var missing = await api('GET', '/api/organizations/' + orgId + '/documents/missing');
            var missingBody = document.getElementById('docs-missing-body');
            if (missing.players && missing.players.length > 0) {
                missingCount = missing.players.length;
                var html = '<div style="padding:8px 12px;background:#fae8ec;border-radius:6px;margin-bottom:12px;font-weight:600;color:#FA6E82;font-size:14px;">' +
                    missingCount + ' of ' + players.length + ' players are missing required documents</div>';
                html += '<div style="max-height:300px;overflow-y:auto;">';
                missing.players.forEach(function(p) {
                    html += '<div style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px;display:flex;justify-content:space-between;align-items:center;">' +
                        '<div><strong>' + esc(p.player_name) + '</strong>: missing ' +
                        '<span style="color:#e74c3c;font-weight:600;">' + esc((p.missing_types || []).join(', ')) + '</span></div>' +
                        '<button class="btn btn-xs btn-outline" onclick="sendDocReminder(\'' + esc(p.player_name) + '\')">Send Reminder</button>' +
                        '</div>';
                });
                html += '</div>';
                missingBody.innerHTML = html;
            } else {
                missingBody.innerHTML = '<p class="text-muted" style="color:#27ae60;">All players have required documents.</p>';
            }
        } catch (_) {
            document.getElementById('docs-missing-body').innerHTML = '<p class="text-muted">Could not check missing documents.</p>';
        }

        document.getElementById('docs-stats-bar').innerHTML = buildStatCards([
            { value: players.length, label: 'Active Players', cls: '' },
            { value: players.length - missingCount, label: 'Docs Complete', cls: 'steel' },
            { value: missingCount, label: 'Missing Docs', cls: missingCount > 0 ? 'coral' : '' },
        ]);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

function sendDocReminder(playerName) {
    toast('Reminder would be sent to ' + playerName + "'s parent (SMTP not configured)", 'warning');
}

document.getElementById('docs-player-select').addEventListener('change', async function() {
    var playerId = this.value;
    var tbody = document.getElementById('docs-table-body');
    if (!playerId) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Select a player to view documents.</td></tr>';
        return;
    }
    try {
        var docs = await api('GET', '/api/players/' + playerId + '/documents');
        if (docs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No documents uploaded.</td></tr>';
            return;
        }
        tbody.innerHTML = docs.map(function(d) {
            return '<tr><td>' + esc(d.player_name || '-') + '</td><td>' + esc(d.document_type) + '</td>' +
                '<td>' + esc(d.file_name || '-') + '</td>' +
                '<td><span class="badge badge-' + (d.verified ? 'yes' : 'no') + '">' + (d.verified ? 'Verified' : 'Unverified') + '</span></td>' +
                '<td>' + esc(d.expiry_date || 'N/A') + '</td>' +
                '<td class="btn-group">' +
                    '<button class="btn btn-xs btn-outline" onclick="verifyDoc(\'' + d.id + '\',\'' + playerId + '\')">Verify</button>' +
                    '<button class="btn btn-xs btn-danger" onclick="deleteDoc(\'' + d.id + '\',\'' + playerId + '\')">Delete</button>' +
                '</td></tr>';
        }).join('');
    } catch (e) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Error: ' + esc(e.message) + '</td></tr>'; }
});

document.getElementById('btn-upload-doc').addEventListener('click', function() {
    var playerId = document.getElementById('docs-player-select').value;
    if (!playerId) { toast('Select a player first', 'warning'); return; }
    openModal('Upload Document',
        '<label>Document Type</label><select id="doc-type" class="form-select"><option value="waiver">Waiver</option><option value="medical">Medical Form</option><option value="birth_cert">Birth Certificate</option><option value="photo_id">Photo ID</option><option value="other">Other</option></select>' +
        '<label>File Name</label><input type="text" id="doc-filename" class="form-input" placeholder="e.g. medical_form.pdf">' +
        '<label>Expiry Date (optional)</label><input type="date" id="doc-expiry" class="form-input">' +
        '<label>File</label><input type="file" id="doc-file" class="form-input">',
        '<button class="btn btn-primary" onclick="submitUploadDoc(\'' + playerId + '\')">Upload</button><button class="btn btn-outline" onclick="closeModal()">Cancel</button>'
    );
});

async function submitUploadDoc(playerId) {
    var fileInput = document.getElementById('doc-file');
    var file = fileInput.files[0];
    var fileName = document.getElementById('doc-filename').value || (file ? file.name : 'document');

    var fileData = '';
    if (file) {
        fileData = await new Promise(function(resolve) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result.split(',')[1]); };
            reader.readAsDataURL(file);
        });
    }

    try {
        showLoading();
        await api('POST', '/api/players/' + playerId + '/documents', {
            document_type: document.getElementById('doc-type').value,
            file_name: fileName,
            file_data: fileData,
            expiry_date: document.getElementById('doc-expiry').value || null,
        });
        hideLoading();
        closeModal();
        toast('Document uploaded', 'success');
        // Trigger reload
        document.getElementById('docs-player-select').dispatchEvent(new Event('change'));
    } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
}

async function verifyDoc(docId, playerId) {
    try {
        await api('PATCH', '/api/documents/' + docId, { verified: true });
        toast('Document verified', 'success');
        document.getElementById('docs-player-select').dispatchEvent(new Event('change'));
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function deleteDoc(docId, playerId) {
    if (!confirm('Delete this document?')) return;
    try {
        await api('DELETE', '/api/documents/' + docId);
        toast('Document deleted', 'success');
        document.getElementById('docs-player-select').dispatchEvent(new Event('change'));
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

// --- Create Modals ---
function setupOpsButtons() {
    // Season create
    var btnSeason = document.getElementById('btn-create-season');
    if (btnSeason) btnSeason.addEventListener('click', function() {
        openModal('Create Season',
            '<label>Name</label><input type="text" id="season-name" class="form-input" placeholder="Spring 2026">' +
            '<label>Start Date</label><input type="date" id="season-start" class="form-input">' +
            '<label>End Date</label><input type="date" id="season-end" class="form-input">' +
            '<label>Status</label><select id="season-status" class="form-select"><option>planning</option><option>registration</option><option>active</option><option>completed</option></select>',
            '<button class="btn btn-primary" onclick="createSeason()">Create</button>'
        );
    });

    // Program create
    var btnProg = document.getElementById('btn-create-program');
    if (btnProg) btnProg.addEventListener('click', async function() {
        var orgId = requireOrg();
        if (!orgId) return;
        var _seasonsResp = await api('GET', '/api/organizations/' + orgId + '/seasons');
        var seasons = _seasonsResp.seasons || _seasonsResp || [];
        if (!Array.isArray(seasons)) seasons = [];
        var opts = (Array.isArray(seasons) ? seasons : []).map(function(s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
        openModal('Create Program',
            '<label>Season</label><select id="prog-season" class="form-select">' + opts + '</select>' +
            '<label>Name</label><input type="text" id="prog-name" class="form-input" placeholder="Rec League U10">' +
            '<label>Type</label><select id="prog-type" class="form-select"><option>recreational</option><option>travel</option><option>academy</option><option>camp</option><option>clinic</option><option>tournament</option></select>' +
            '<label>Gender</label><select id="prog-gender" class="form-select"><option>coed</option><option>boys</option><option>girls</option></select>' +
            '<label>Registration Fee ($)</label><input type="number" id="prog-fee" class="form-input" placeholder="150">',
            '<button class="btn btn-primary" onclick="createProgram()">Create</button>'
        );
    });

    // Team create
    var btnTeam = document.getElementById('btn-create-team');
    if (btnTeam) btnTeam.addEventListener('click', function() {
        openModal('Create Team',
            '<label>Name</label><input type="text" id="team-name" class="form-input" placeholder="Blue Thunder">' +
            '<label>Level</label><input type="text" id="team-level" class="form-input" placeholder="Select / Blue / Red">' +
            '<label>Max Roster Size</label><input type="number" id="team-max" class="form-input" placeholder="18">' +
            '<label>Practice Day</label><input type="text" id="team-pday" class="form-input" placeholder="Tuesday">' +
            '<label>Practice Time</label><input type="text" id="team-ptime" class="form-input" placeholder="17:00-18:30">',
            '<button class="btn btn-primary" onclick="createTeam()">Create</button>'
        );
    });

    // Field create
    var btnField = document.getElementById('btn-create-field');
    if (btnField) btnField.addEventListener('click', function() {
        openModal('Create Field',
            '<label>Name</label><input type="text" id="field-name" class="form-input" placeholder="Main Field A">' +
            '<label>Address</label><input type="text" id="field-address" class="form-input" placeholder="123 Sports Ave">' +
            '<label>Surface</label><select id="field-surface" class="form-select"><option value="grass">Grass</option><option value="turf">Turf</option><option value="indoor">Indoor</option></select>' +
            '<label>Size</label><select id="field-size" class="form-select"><option value="full">Full</option><option value="3_4">3/4</option><option value="half">Half</option><option value="small">Small</option></select>' +
            '<label><input type="checkbox" id="field-lights"> Has Lights</label>' +
            '<label>Permit Cost ($/hr)</label><input type="number" id="field-cost" class="form-input" placeholder="e.g. 75" step="0.01">' +
            '<label>Shared Permit With</label><input type="text" id="field-shared" class="form-input" placeholder="e.g. Soccer league, DCPR">' +
            '<label>Permit Notes</label><textarea id="field-permit-notes" class="form-input" style="height:60px;" placeholder="Any permit details..."></textarea>',
            '<button class="btn btn-primary" onclick="createField()">Create</button>'
        );
    });

    // Schedule entry create
    var btnSchedule = document.getElementById('btn-create-schedule');
    if (btnSchedule) btnSchedule.addEventListener('click', async function() {
        var orgId = requireOrg();
        if (!orgId) return;
        var [teams, fieldsData] = await Promise.all([
            api('GET', '/api/organizations/' + orgId + '/teams').catch(function() { return []; }),
            api('GET', '/api/organizations/' + orgId + '/fields').catch(function() { return []; }),
        ]);
        var teamOpts = '<option value="">-- None --</option>' + teams.map(function(t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');
        var fieldOpts = '<option value="">-- None --</option>' + fieldsData.map(function(f) { return '<option value="' + f.id + '">' + esc(f.name) + '</option>'; }).join('');
        openModal('Create Schedule Entry',
            '<label>Type</label><select id="sched-type" class="form-select"><option value="game">Game</option><option value="practice">Practice</option><option value="tournament">Tournament</option><option value="meeting">Meeting</option></select>' +
            '<label>Title</label><input type="text" id="sched-title" class="form-input" placeholder="e.g. U12 Blue vs Red">' +
            '<label>Team</label><select id="sched-team" class="form-select">' + teamOpts + '</select>' +
            '<label>Opponent Team</label><select id="sched-opponent" class="form-select">' + teamOpts + '</select>' +
            '<label>Field</label><select id="sched-field" class="form-select">' + fieldOpts + '</select>' +
            '<div class="form-row"><div class="form-group"><label>Start</label><input type="datetime-local" id="sched-start" class="form-input"></div>' +
            '<div class="form-group"><label>End</label><input type="datetime-local" id="sched-end" class="form-input"></div></div>',
            '<button class="btn btn-primary" onclick="createScheduleEntry()">Create</button><button class="btn btn-outline" onclick="closeModal()">Cancel</button>'
        );
    });

    // Compose message
    var btnCompose = document.getElementById('btn-compose-message');
    if (btnCompose) btnCompose.addEventListener('click', function() {
        openModal('Compose Message',
            '<label>Subject</label><input type="text" id="msg-subject" class="form-input">' +
            '<label>Body</label><textarea id="msg-body" class="form-input" style="height:120px;width:100%;"></textarea>' +
            '<label>Audience</label><select id="msg-audience" class="form-select"><option value="all">All Players</option><option value="team">Team</option><option value="age_group">Age Group</option></select>' +
            '<label>Channel</label><select id="msg-channel" class="form-select"><option value="email">Email</option><option value="sms">SMS</option></select>',
            '<button class="btn btn-primary" onclick="createMessage()">Save Draft</button>'
        );
    });

    // Import buttons
    var btnPreview = document.getElementById('btn-preview-import');
    if (btnPreview) btnPreview.addEventListener('click', previewImport);
    var btnImport = document.getElementById('btn-run-import');
    if (btnImport) btnImport.addEventListener('click', runImport);

    // AI Assistant buttons
    var btnAiAsk = document.getElementById('btn-ai-ask');
    if (btnAiAsk) btnAiAsk.addEventListener('click', askAiOps);
    var btnDraftEmail = document.getElementById('btn-draft-email');
    if (btnDraftEmail) btnDraftEmail.addEventListener('click', draftAiEmail);

    // AI quick action buttons
    document.querySelectorAll('.ai-quick').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.getElementById('ai-question-input').value = this.getAttribute('data-q');
            askAiOps();
        });
    });

    // Expiring certs
    var btnExpCerts = document.getElementById('btn-expiring-certs');
    if (btnExpCerts) btnExpCerts.addEventListener('click', async function() {
        var orgId = requireOrg();
        if (!orgId) return;
        try {
            showLoading();
            var result = await api('GET', '/api/organizations/' + orgId + '/coaches/expiring-certifications?days=60');
            hideLoading();
            if (result.length === 0) {
                toast('No certifications expiring in the next 60 days', 'success');
                return;
            }
            var html = '<p><strong>' + result.length + ' expiring certification(s):</strong></p>';
            result.forEach(function(c) {
                html += '<div style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;">' +
                    '<strong>' + esc(c.coach_name) + '</strong>: ' + esc(c.certification_name) + ' expires ' +
                    '<span style="color:#e74c3c;">' + esc(c.expiry_date) + '</span></div>';
            });
            openModal('Expiring Certifications', html);
        } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
    });

    // AI assign coaches
    var btnAiAssign = document.getElementById('btn-ai-assign-coaches');
    if (btnAiAssign) btnAiAssign.addEventListener('click', async function() {
        var orgId = requireOrg();
        if (!orgId) return;
        try {
            showLoading();
            var result = await api('POST', '/api/organizations/' + orgId + '/coaches/ai-assign');
            hideLoading();
            var html = '<p><strong>AI Coach Assignments:</strong></p>';
            if (result.assignments && result.assignments.length > 0) {
                result.assignments.forEach(function(a) {
                    html += '<div style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;">' +
                        esc(a.coach_name) + ' &rarr; ' + esc(a.team_name) + ' <small style="color:#888;">(' + esc(a.reason || '') + ')</small></div>';
                });
            } else {
                html += '<p class="text-muted">No assignments suggested.</p>';
            }
            openModal('AI Coach Assignments', html);
        } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
    });

    // AI form teams
    var btnAiFormTeams = document.getElementById('btn-ai-form-teams');
    if (btnAiFormTeams) btnAiFormTeams.addEventListener('click', async function() {
        var orgId = requireOrg();
        if (!orgId) return;
        try {
            showLoading();
            var result = await api('POST', '/api/organizations/' + orgId + '/teams/ai-form');
                if (result && result.detail) { alert('Error: ' + (typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail))); return; }
            hideLoading();
            toast('AI formed ' + (result.teams_created || 0) + ' teams', 'success');
            loadOpsTeams(orgId);
        } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
    });

    // Generate games
    var btnGenGames = document.getElementById('btn-generate-games');
    if (btnGenGames) btnGenGames.addEventListener('click', async function() {
        var orgId = requireOrg();
        if (!orgId) return;
        try {
            var teams = await api('GET', '/api/organizations/' + orgId + '/teams');
            if (teams.length < 2) { toast('Need at least 2 teams', 'warning'); return; }
            var fields = await api('GET', '/api/organizations/' + orgId + '/fields');
            var teamIds = teams.map(function(t) { return t.id; });
            var fieldIds = fields.map(function(f) { return f.id; });
            showLoading();
            var result = await api('POST', '/api/organizations/' + orgId + '/schedules/generate-games', {
                team_ids: teamIds,
                available_field_ids: fieldIds.length > 0 ? fieldIds : [],
                games_per_team: 6,
                game_duration_minutes: 90,
            });
            hideLoading();
            toast('Generated ' + result.games_scheduled + ' games!', 'success');
            loadOpsSchedule(orgId);
        } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
    });

    // Generate practices
    var btnGenPractices = document.getElementById('btn-generate-practices');
    if (btnGenPractices) btnGenPractices.addEventListener('click', async function() {
        var orgId = requireOrg();
        if (!orgId) return;
        try {
            var teams = await api('GET', '/api/organizations/' + orgId + '/teams');
            if (teams.length === 0) { toast('No teams found', 'warning'); return; }
            var fields = await api('GET', '/api/organizations/' + orgId + '/fields');
            var today = new Date();
            var endDate = new Date(today.getTime() + 60 * 86400000);
            showLoading();
            var result = await api('POST', '/api/organizations/' + orgId + '/schedules/generate-practices', {
                team_ids: teams.map(function(t) { return t.id; }),
                field_ids: fields.map(function(f) { return f.id; }),
                start_date: today.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                practices_per_week: 2,
                duration_minutes: 90,
            });
            hideLoading();
            toast('Generated ' + result.practices_scheduled + ' practices!', 'success');
            loadOpsSchedule(orgId);
        } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
    });

    // Message templates
    var btnMsgTemplates = document.getElementById('btn-msg-templates');
    if (btnMsgTemplates) btnMsgTemplates.addEventListener('click', async function() {
        var orgId = requireOrg();
        if (!orgId) return;
        try {
            var templatesData = await api('GET', '/api/organizations/' + orgId + '/messages/templates');
            var templatesList = Array.isArray(templatesData) ? templatesData : Object.values(templatesData);
            var html = '<p>Click a template to use it:</p>';
            templatesList.forEach(function(t) {
                html += '<div style="padding:10px;margin:8px 0;border:1px solid #ddd;border-radius:6px;cursor:pointer;" onclick="useMsgTemplate(\'' + btoa(unescape(encodeURIComponent(JSON.stringify(t)))) + '\')">' +
                    '<strong>' + esc(t.name) + '</strong><br><small style="color:#888;">' + esc(t.subject || t.description || '') + '</small></div>';
            });
            openModal('Message Templates', html);
        } catch (e) { toast('Error: ' + e.message, 'error'); }
    });

    // AI draft message
    var btnAiDraft = document.getElementById('btn-ai-draft-msg');
    if (btnAiDraft) btnAiDraft.addEventListener('click', async function() {
        var orgId = requireOrg();
        if (!orgId) return;
        openModal('AI Draft Message',
            '<label>Audience</label><input type="text" id="ai-msg-audience" class="form-input" placeholder="e.g. All parents">' +
            '<label>Purpose</label><input type="text" id="ai-msg-purpose" class="form-input" placeholder="e.g. Weather cancellation">' +
            '<label>Tone</label><select id="ai-msg-tone" class="form-select"><option>professional</option><option>friendly</option><option>urgent</option></select>' +
            '<label>Context</label><textarea id="ai-msg-context" class="form-input" style="height:80px;width:100%;"></textarea>',
            '<button class="btn btn-primary" onclick="aiDraftMessage()"><i data-lucide="sparkles" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:2px;"></i> Generate Draft</button>'
        );
    });

    // Weather cancel
    var btnWeather = document.getElementById('btn-weather-cancel');
    if (btnWeather) btnWeather.addEventListener('click', function() {
        var date = prompt('Enter date to cancel outdoor bookings (YYYY-MM-DD):');
        if (!date) return;
        var orgId = requireOrg();
        if (!orgId) return;
        api('POST', '/api/organizations/' + orgId + '/fields/weather-cancel', { date: date })
            .then(function(r) { toast('Cancelled ' + r.cancelled + ' bookings', 'success'); })
            .catch(function(e) { toast('Error: ' + e.message, 'error'); });
    });

    // AI Field Allocation
    var btnAiField = document.getElementById('btn-ai-field-allocation');
    if (btnAiField) btnAiField.addEventListener('click', aiFieldAllocation);

    // Smart Field Optimizer
    var btnRunOpt = document.getElementById('btn-run-optimizer');
    if (btnRunOpt) btnRunOpt.addEventListener('click', runFieldOptimizer);

    // Weather Reassignment — default date to tomorrow
    var weatherDateInput = document.getElementById('weather-date');
    if (weatherDateInput) {
        var tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        weatherDateInput.value = tomorrow.toISOString().split('T')[0];
    }
    var btnWeatherReassign = document.getElementById('btn-weather-reassign');
    if (btnWeatherReassign) btnWeatherReassign.addEventListener('click', runWeatherReassign);
    var btnApplyReassign = document.getElementById('btn-apply-reassign');
    if (btnApplyReassign) btnApplyReassign.addEventListener('click', applyWeatherReassignments);

    // AI Season Plan
    var btnAiSeason = document.getElementById('btn-ai-season-plan');
    if (btnAiSeason) btnAiSeason.addEventListener('click', aiPlanSeason);

    // AI Roster Suggest
    var btnAiRoster = document.getElementById('btn-ai-roster-suggest');
    if (btnAiRoster) btnAiRoster.addEventListener('click', aiRosterSuggest);

    // AI Attendance Insights
    var btnAiAtt = document.getElementById('btn-ai-attendance');
    if (btnAiAtt) btnAiAtt.addEventListener('click', aiAttendanceInsights);

    // AI Analytics Insights
    var btnAiIns = document.getElementById('btn-ai-insights');
    if (btnAiIns) btnAiIns.addEventListener('click', aiAnalyticsInsights);

    // AI Clean Data
    var btnAiClean = document.getElementById('btn-ai-clean-data');
    if (btnAiClean) btnAiClean.addEventListener('click', aiCleanData);

    // Conflict check
    var btnConflicts = document.getElementById('btn-check-conflicts');
    if (btnConflicts) btnConflicts.addEventListener('click', async function() {
        var orgId = requireOrg();
        if (!orgId) return;
        try {
            showLoading();
            var result = await api('GET', '/api/organizations/' + orgId + '/schedules/conflicts');
            hideLoading();
            if (result.total === 0) {
                toast('No scheduling conflicts found!', 'success');
            } else {
                var html = '<p><strong>' + result.total + ' conflicts found:</strong></p>';
                result.conflicts.forEach(function(c) {
                    html += '<div style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;">' +
                        '<strong>' + esc(c.type) + '</strong>: ' + esc(c.title_a) + ' vs ' + esc(c.title_b) + ' at ' + esc(c.time) + '</div>';
                });
                openModal('Schedule Conflicts', html);
            }
        } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
    });
}

// --- Create Ops Items ---
async function createSeason() {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        await api('POST', '/api/organizations/' + orgId + '/seasons', {
            name: document.getElementById('season-name').value,
            start_date: document.getElementById('season-start').value || null,
            end_date: document.getElementById('season-end').value || null,
            status: document.getElementById('season-status').value,
        });
        closeModal();
        toast('Season created', 'success');
        loadOpsSeasons(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function createProgram() {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        await api('POST', '/api/organizations/' + orgId + '/programs', {
            season_id: document.getElementById('prog-season').value,
            name: document.getElementById('prog-name').value,
            program_type: document.getElementById('prog-type').value,
            gender: document.getElementById('prog-gender').value,
            registration_fee: parseFloat(document.getElementById('prog-fee').value) || null,
        });
        closeModal();
        toast('Program created', 'success');
        loadOpsSeasons(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function createTeam() {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        await api('POST', '/api/organizations/' + orgId + '/teams', {
            name: document.getElementById('team-name').value,
            team_level: document.getElementById('team-level').value || null,
            max_roster_size: parseInt(document.getElementById('team-max').value) || null,
            practice_day: document.getElementById('team-pday').value || null,
            practice_time: document.getElementById('team-ptime').value || null,
        });
        closeModal();
        toast('Team created', 'success');
        loadOpsTeams(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function createField() {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        await api('POST', '/api/organizations/' + orgId + '/fields', {
            name: document.getElementById('field-name').value,
            location_address: document.getElementById('field-address').value || null,
            surface_type: document.getElementById('field-surface').value,
            size: document.getElementById('field-size').value,
            has_lights: document.getElementById('field-lights').checked,
            permit_cost_per_hour: parseFloat(document.getElementById('field-cost').value) || null,
            permit_shared_with: document.getElementById('field-shared').value || null,
            permit_notes: document.getElementById('field-permit-notes').value || null,
        });
        closeModal();
        toast('Field created', 'success');
        loadOpsFields(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function createMessage() {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        await api('POST', '/api/organizations/' + orgId + '/messages', {
            subject: document.getElementById('msg-subject').value,
            body: document.getElementById('msg-body').value,
            audience_type: document.getElementById('msg-audience').value,
            channel: document.getElementById('msg-channel').value,
        });
        closeModal();
        toast('Message draft saved', 'success');
        loadOpsComms(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

function useMsgTemplate(b64) {
    try {
        var t = JSON.parse(decodeURIComponent(escape(atob(b64))));
        closeModal();
        openModal('Compose Message',
            '<label>Subject</label><input type="text" id="msg-subject" class="form-input" value="' + esc(t.subject || '') + '">' +
            '<label>Body</label><textarea id="msg-body" class="form-input" style="height:120px;width:100%;">' + esc(t.body || '') + '</textarea>' +
            '<label>Audience</label><select id="msg-audience" class="form-select"><option value="all">All Players</option><option value="team">Team</option><option value="age_group">Age Group</option></select>' +
            '<label>Channel</label><select id="msg-channel" class="form-select"><option value="email">Email</option><option value="sms">SMS</option></select>',
            '<button class="btn btn-primary" onclick="createMessage()">Save Draft</button>'
        );
    } catch (_) { toast('Error loading template', 'error'); }
}

async function aiDraftMessage() {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        showLoading();
        var result = await api('POST', '/api/organizations/' + orgId + '/messages/ai-draft', {
            audience: document.getElementById('ai-msg-audience').value,
            purpose: document.getElementById('ai-msg-purpose').value,
            tone: document.getElementById('ai-msg-tone').value,
            context: document.getElementById('ai-msg-context').value,
        });
        hideLoading();
        closeModal();
        openModal('Compose Message',
            '<label>Subject</label><input type="text" id="msg-subject" class="form-input" value="' + esc(result.subject || '') + '">' +
            '<label>Body</label><textarea id="msg-body" class="form-input" style="height:120px;width:100%;">' + esc(result.body || '') + '</textarea>' +
            '<label>Audience</label><select id="msg-audience" class="form-select"><option value="all">All Players</option><option value="team">Team</option><option value="age_group">Age Group</option></select>' +
            '<label>Channel</label><select id="msg-channel" class="form-select"><option value="email">Email</option><option value="sms">SMS</option></select>',
            '<button class="btn btn-primary" onclick="createMessage()">Save Draft</button>'
        );
    } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
}

async function createScheduleEntry() {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        await api('POST', '/api/organizations/' + orgId + '/schedules', {
            entry_type: document.getElementById('sched-type').value,
            title: document.getElementById('sched-title').value,
            team_id: document.getElementById('sched-team').value || null,
            opponent_team_id: document.getElementById('sched-opponent').value || null,
            field_id: document.getElementById('sched-field').value || null,
            start_time: document.getElementById('sched-start').value ? new Date(document.getElementById('sched-start').value).toISOString() : null,
            end_time: document.getElementById('sched-end').value ? new Date(document.getElementById('sched-end').value).toISOString() : null,
            status: 'scheduled',
        });
        closeModal();
        toast('Schedule entry created', 'success');
        loadOpsSchedule(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

// --- Import Functions ---
async function previewImport() {
    var orgId = requireOrg();
    if (!orgId) return;
    var csv = document.getElementById('import-csv-data').value;
    if (!csv.trim()) { toast('Paste CSV data first', 'warning'); return; }
    try {
        showLoading();
        var result = await api('POST', '/api/organizations/' + orgId + '/imports/preview', { csv_data: csv });
        hideLoading();
        var html = '<div style="padding:12px;background:#e0f5f5;border-radius:6px;margin-bottom:12px;">' +
            '<strong>Preview:</strong> ' + result.imported + ' new, ' + result.updated + ' updates, ' + result.skipped + ' skipped';
        if (result.errors && result.errors.length > 0) {
            html += '<br><strong style="color:#FA6E82;">Errors:</strong><ul>';
            result.errors.slice(0, 10).forEach(function(e) { html += '<li>' + esc(e) + '</li>'; });
            html += '</ul>';
        }
        html += '</div>';
        // Show parsed rows table
        if (result.players && result.players.length > 0) {
            html += '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>#</th><th>First Name</th><th>Last Name</th><th>DOB</th><th>Email</th><th>Age Group</th><th>Status</th></tr></thead><tbody>';
            result.players.forEach(function(p, i) {
                var statusBadge = p.status === 'new' ? 'badge-active' : p.status === 'update' ? 'badge-scoring' : 'badge-draft';
                html += '<tr><td>' + (i + 1) + '</td><td>' + esc(p.first_name || '') + '</td><td>' + esc(p.last_name || '') + '</td>' +
                    '<td>' + esc(p.date_of_birth || '-') + '</td><td>' + esc(p.email || p.parent_email || '-') + '</td>' +
                    '<td>' + esc(p.age_group || '-') + '</td>' +
                    '<td><span class="badge ' + statusBadge + '">' + esc(p.status || 'new') + '</span></td></tr>';
            });
            html += '</tbody></table></div>';
        }
        document.getElementById('import-results').innerHTML = html;
    } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
}

async function runImport() {
    var orgId = requireOrg();
    if (!orgId) return;
    var csv = document.getElementById('import-csv-data').value;
    if (!csv.trim()) { toast('Paste CSV data first', 'warning'); return; }
    if (!confirm('Import these players?')) return;
    try {
        showLoading();
        var result = await api('POST', '/api/organizations/' + orgId + '/imports/playmetrics', { csv_data: csv });
        hideLoading();
        toast('Imported ' + result.imported + ' new, ' + result.updated + ' updated', 'success');
        document.getElementById('import-csv-data').value = '';
        document.getElementById('import-results').innerHTML = '';
        loadOpsImport(orgId);
    } catch (e) { hideLoading(); toast('Error: ' + e.message, 'error'); }
}

// --- AI Functions ---
async function askAiOps() {
    var orgId = requireOrg();
    if (!orgId) return;
    var q = document.getElementById('ai-question-input').value;
    if (!q.trim()) return;
    var body = document.getElementById('ai-answer-body');
    body.style.display = 'block';
    showAIThinking(body);
    var btn = document.getElementById('btn-ai-ask');
    btnLoading(btn, true);
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/ai/ask', { question: q });
        var html = '<p><strong>Answer:</strong></p><p>' + esc(result.answer) + '</p>';
        if (result.suggestions && result.suggestions.length > 0) {
            html += '<p style="margin-top:8px;"><strong>Suggestions:</strong></p><ul>';
            result.suggestions.forEach(function(s) { html += '<li>' + esc(s) + '</li>'; });
            html += '</ul>';
        }
        body.innerHTML = html;
        var copyBtn = document.getElementById('btn-ai-copy-all');
        var dlBtn = document.getElementById('btn-ai-download');
        if (copyBtn) copyBtn.style.display = '';
        if (dlBtn) dlBtn.style.display = '';
    } catch (e) { body.innerHTML = '<p style="color:#FA6E82;">Error: ' + esc(e && e.message ? e.message : String(e)) + '</p>'; }
    btnLoading(document.getElementById('btn-ai-ask'), false);
}

function copyAiChat() {
    var body = document.getElementById('ai-answer-body');
    if (!body) return;
    var text = body.innerText || body.textContent;
    navigator.clipboard.writeText(text).then(function() {
        toast('Copied to clipboard!', 'success');
    }).catch(function() {
        toast('Copy failed', 'error');
    });
}

function downloadAiChat() {
    var body = document.getElementById('ai-answer-body');
    if (!body) return;
    var text = body.innerText || body.textContent;
    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ai-assistant-conversation.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Downloaded!', 'success');
}

async function draftAiEmail() {
    var orgId = requireOrg();
    if (!orgId) return;
    var audience = document.getElementById('email-audience').value;
    var purpose = document.getElementById('email-purpose').value;
    var context = document.getElementById('email-context').value;
    if (!audience || !purpose) { toast('Fill in audience and purpose', 'warning'); return; }

    var resultDiv = document.getElementById('email-draft-result');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<p style="color:#999;">Drafting...</p>';
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/ai/email-draft', {
            audience: audience, purpose: purpose, context: context,
        });
        resultDiv.innerHTML = '<div style="background:white;padding:16px;border-radius:8px;border:1px solid #ddd;">' +
            '<p><strong>Subject:</strong> ' + esc(result.subject) + '</p><hr style="margin:8px 0;">' +
            '<div style=";">' + esc(result.body) + '</div></div>' +
            '<button class="btn btn-primary" style="margin-top:8px;" onclick="useEmailDraft(\'' +
            btoa(unescape(encodeURIComponent(JSON.stringify(result)))) + '\')">Use as Message Draft</button>';
    } catch (e) { resultDiv.innerHTML = '<p style="color:#FA6E82;">Error: ' + esc(e && e.message ? e.message : String(e)) + '</p>'; }
}

async function useEmailDraft(b64) {
    var orgId = requireOrg();
    if (!orgId) return;
    try {
        var data = JSON.parse(decodeURIComponent(escape(atob(b64))));
        await api('POST', '/api/organizations/' + orgId + '/messages', {
            subject: data.subject,
            body: data.body,
            body_html: data.body_html,
            audience_type: 'all',
            channel: 'email',
        });
        toast('Email draft saved to messages', 'success');
        navigateTo('ops-comms');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

// ===================================================================
// AI BUTTON HANDLERS FOR ALL TABS
// ===================================================================

// --- AI Suggest Field Allocation ---
async function aiFieldAllocation() {
    var orgId = requireOrg();
    if (!orgId) return;
    var resultDiv = document.getElementById('ai-field-result');
    resultDiv.style.display = 'block';
    resultDiv.querySelector('.card-body').innerHTML = '<p style="color:#999;">AI is analyzing field allocation...</p>';
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/ai/ask', {
            question: 'Analyze our fields and teams. Recommend optimal field assignments for each team based on practice schedules, field size, lighting availability, and team level. Show a table of recommended assignments.'
        });
        resultDiv.querySelector('.card-body').innerHTML =
            '<strong style="color:#09A1A1;">AI Field Allocation Recommendation</strong><br><br>' +
            '<div style=";">' + esc(result.answer || 'No recommendation available.') + '</div>';
    } catch (e) {
        resultDiv.querySelector('.card-body').innerHTML = '<p style="color:#FA6E82;">Error: ' + esc(e.message) + '</p>';
    }
}

// --- AI Plan Season ---
async function aiPlanSeason() {
    var orgId = requireOrg();
    if (!orgId) return;
    openModal('AI Season Planner',
        '<label>Season Name</label><input type="text" id="ai-sp-name" class="form-input" value="Fall 2026">' +
        '<label>Age Groups (comma-separated)</label><input type="text" id="ai-sp-ages" class="form-input" value="U8, U10, U12, U14">' +
        '<label>Estimated Players</label><input type="number" id="ai-sp-players" class="form-input" value="200">' +
        '<label>Available Fields</label><input type="number" id="ai-sp-fields" class="form-input" value="6">' +
        '<label>Season Length (weeks)</label><input type="number" id="ai-sp-weeks" class="form-input" value="10">',
        '<button class="btn btn-primary" onclick="runAiSeasonPlan()"><i data-lucide="sparkles" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:2px;"></i> Generate Plan</button><button class="btn btn-outline" onclick="closeModal()">Cancel</button>'
    );
}

async function runAiSeasonPlan() {
    var orgId = requireOrg();
    if (!orgId) return;
    var ages = document.getElementById('ai-sp-ages').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    closeModal();
    var resultDiv = document.getElementById('ai-season-result');
    resultDiv.style.display = 'block';
    resultDiv.querySelector('.card-body').innerHTML = '<p style="color:#999;">AI is generating season plan...</p>';
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/ai/season-plan', {
            season_name: document.getElementById('ai-sp-name').value,
            age_groups: ages,
            estimated_players: parseInt(document.getElementById('ai-sp-players').value) || 200,
            available_fields: parseInt(document.getElementById('ai-sp-fields').value) || 6,
            weeks: parseInt(document.getElementById('ai-sp-weeks').value) || 10,
        });
        var html = '<strong style="color:#09A1A1;">AI Season Plan</strong><br><br>';
        html += '<p><strong>Overview:</strong> ' + esc(result.overview || '') + '</p>';
        if (result.teams_plan && result.teams_plan.length > 0) {
            html += '<h4 style="margin:12px 0 4px;">Teams Plan</h4><table class="data-table"><thead><tr><th>Age Group</th><th>Teams</th><th>Players/Team</th></tr></thead><tbody>';
            result.teams_plan.forEach(function(t) { html += '<tr><td>' + esc(t.age_group) + '</td><td>' + t.num_teams + '</td><td>' + t.players_per + '</td></tr>'; });
            html += '</tbody></table>';
        }
        if (result.schedule_plan) {
            html += '<h4 style="margin:12px 0 4px;">Schedule</h4><p>Games/team: ' + (result.schedule_plan.games_per_team || '-') + ' | Practices/week: ' + (result.schedule_plan.practices_per_week || '-') + '</p>';
        }
        if (result.staffing_plan) {
            html += '<h4 style="margin:12px 0 4px;">Staffing</h4><p>Coaches needed: ' + (result.staffing_plan.coaches_needed || '-') + ' | Refs: ' + (result.staffing_plan.refs_needed || '-') + '</p>';
        }
        resultDiv.querySelector('.card-body').innerHTML = html;
    } catch (e) {
        resultDiv.querySelector('.card-body').innerHTML = '<p style="color:#FA6E82;">Error: ' + esc(e.message) + '</p>';
    }
}

// --- AI Suggest Roster Changes ---
async function aiRosterSuggest() {
    var orgId = requireOrg();
    if (!orgId) return;
    var resultDiv = document.getElementById('ai-teams-result');
    resultDiv.style.display = 'block';
    resultDiv.querySelector('.card-body').innerHTML = '<p style="color:#999;">AI is analyzing team rosters...</p>';
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/ai/ask', {
            question: 'Analyze all team rosters and player evaluations. Suggest specific roster changes — which players should move between teams for better balance? Consider skill levels, positions, and team competitiveness.'
        });
        resultDiv.querySelector('.card-body').innerHTML =
            '<strong style="color:#09A1A1;">AI Roster Suggestions</strong><br><br>' +
            '<div style=";">' + esc(result.answer || 'No suggestions available.') + '</div>';
    } catch (e) {
        resultDiv.querySelector('.card-body').innerHTML = '<p style="color:#FA6E82;">Error: ' + esc(e.message) + '</p>';
    }
}

// --- AI Attendance Insights ---
async function aiAttendanceInsights() {
    var orgId = requireOrg();
    if (!orgId) return;
    var resultDiv = document.getElementById('ai-attendance-result');
    resultDiv.style.display = 'block';
    resultDiv.querySelector('.card-body').innerHTML = '<p style="color:#999;">AI is analyzing attendance patterns...</p>';
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/ai/ask', {
            question: 'Analyze attendance patterns across all teams. Flag any at-risk players with low attendance. Identify trends — are certain days/times getting lower turnout? Suggest ways to improve attendance.'
        });
        resultDiv.querySelector('.card-body').innerHTML =
            '<strong style="color:#09A1A1;">AI Attendance Insights</strong><br><br>' +
            '<div style=";">' + esc(result.answer || 'No insights available.') + '</div>';
    } catch (e) {
        resultDiv.querySelector('.card-body').innerHTML = '<p style="color:#FA6E82;">Error: ' + esc(e.message) + '</p>';
    }
}

// --- AI Analytics Insights ---
async function aiAnalyticsInsights() {
    var orgId = requireOrg();
    if (!orgId) return;
    var resultDiv = document.getElementById('ai-analytics-result');
    resultDiv.style.display = 'block';
    resultDiv.querySelector('.card-body').innerHTML = '<p style="color:#999;">AI is generating insights...</p>';
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/ai/ask', {
            question: 'Give me a comprehensive analytics overview: registration fill rates, player retention, team balance, coach-to-player ratios, field utilization, and any data-driven recommendations for improvement.'
        });
        resultDiv.querySelector('.card-body').innerHTML =
            '<strong style="color:#09A1A1;">AI Analytics Insights</strong><br><br>' +
            '<div style=";">' + esc(result.answer || 'No insights available.') + '</div>';
    } catch (e) {
        resultDiv.querySelector('.card-body').innerHTML = '<p style="color:#FA6E82;">Error: ' + esc(e.message) + '</p>';
    }
}

// --- AI Clean Import Data ---
async function aiCleanData() {
    var csv = document.getElementById('import-csv-data').value;
    if (!csv.trim()) { toast('Paste CSV data first', 'warning'); return; }
    var orgId = requireOrg();
    if (!orgId) return;
    var resultDiv = document.getElementById('import-results');
    resultDiv.innerHTML = '<p style="color:#999;">AI is analyzing data quality...</p>';
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/ai/ask', {
            question: 'Analyze this CSV data for a player import and identify formatting issues, duplicates, missing fields, or data quality problems. Here is the data:\n\n' + csv.substring(0, 2000)
        });
        resultDiv.innerHTML = '<div style="padding:12px;background:#e8f2f2;border-left:4px solid #09A1A1;border-radius:6px;">' +
            '<strong style="color:#09A1A1;">AI Data Quality Report</strong><br><br>' +
            '<div style=";">' + esc(result.answer || 'No issues found.') + '</div></div>';
    } catch (e) {
        resultDiv.innerHTML = '<p style="color:#FA6E82;">Error: ' + esc(e.message) + '</p>';
    }
}

// Initialize ops buttons
setupOpsButtons();


// ===================================================================
// UTILITY
// ===================================================================
function esc(str) {
    if (str === null || str === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

// ===================================================================
// INTELLIGENCE — Club Health Score
// ===================================================================

async function loadIntelHealth(orgId) {
    if (!orgId) return;
    // Load existing health score
    try {
        var hs = await api('GET', '/api/organizations/' + orgId + '/health-score');
        renderHealthScore(hs);
    } catch (e) {
        document.getElementById('health-score-stats').innerHTML = '<div class="stat-card"><div class="stat-value">--</div><div class="stat-label">Health Score</div></div>';
        document.getElementById('health-breakdown-body').innerHTML = '<div style="text-align:center;padding:24px;"><i data-lucide="heart-pulse" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i><p style="color:#888;margin-bottom:12px;">No health score generated yet</p><button class="btn btn-primary btn-sm" onclick="generateHealthScore()">Generate Health Score</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Analyzes retention, coaching ratios, equity, and more</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    // Load lifecycle
    try {
        var lc = await api('GET', '/api/organizations/' + orgId + '/lifecycle');
        var phaseNames = {1:'Startup',2:'Growth',3:'Established',4:'Mature',5:'Model Club'};
        var phaseName = lc.phase_name || phaseNames[lc.overall_phase] || 'Unknown';
        var dots = '';
        for (var i = 1; i <= 5; i++) {
            dots += '<span style="display:inline-block;width:32px;height:32px;border-radius:50%;margin:0 4px;line-height:32px;text-align:center;font-weight:700;color:#fff;background:' + (i <= lc.overall_phase ? '#09A1A1' : '#ddd') + ';">' + i + '</span>';
        }
        document.getElementById('lifecycle-body').innerHTML = '<div style="text-align:center;margin-bottom:12px;">' + dots + '</div><div style="text-align:center;font-size:20px;font-weight:700;">Phase ' + lc.overall_phase + ': ' + phaseName + '</div><p style="margin-top:12px;">' + aiPanel('Lifecycle Analysis', lc.ai_analysis, false);
    } catch (e) {
        document.getElementById('lifecycle-body').innerHTML = '<p class="text-muted">Could not load lifecycle data.</p>';
    }
    // Load financial dashboard
    try {
        var fin = await api('GET', '/api/organizations/' + orgId + '/financial-dashboard');
        var finHtml = '<div class="stats-grid" style="margin-bottom:16px;">';
        finHtml += '<div class="stat-card"><div class="stat-value">$' + (fin.total_revenue||0).toLocaleString() + '</div><div class="stat-label">Total Revenue</div></div>';
        finHtml += '<div class="stat-card"><div class="stat-value">' + (fin.total_players||0) + '</div><div class="stat-label">Players in Programs</div></div>';
        finHtml += '<div class="stat-card"><div class="stat-value">$' + (fin.cost_per_player||0) + '</div><div class="stat-label">Avg Cost/Player</div></div>';
        finHtml += '<div class="stat-card"><div class="stat-value">' + (fin.financial_aid?.pct_of_total||0) + '%</div><div class="stat-label">Financial Aid %</div></div>';
        finHtml += '</div>';
        finHtml += '<table class="data-table"><thead><tr><th>Program</th><th>Players</th><th>Fee</th><th>Revenue</th><th>Aid Eligible</th></tr></thead><tbody>';
        for (var pname in fin.revenue_by_program) {
            var p = fin.revenue_by_program[pname];
            finHtml += '<tr><td>' + pname + '</td><td>' + p.player_count + '</td><td>$' + (p.fee||0) + '</td><td>$' + (p.revenue||0).toLocaleString() + '</td><td>' + (p.financial_aid_eligible ? 'Yes' : 'No') + '</td></tr>';
        }
        finHtml += '</tbody></table>';
        document.getElementById('financial-dashboard-body').innerHTML = finHtml;
    } catch (e) {
        document.getElementById('financial-dashboard-body').innerHTML = '<p class="text-muted">No financial data available.</p>';
    }
    // Load forecast
    try {
        var forecasts = await api('GET', '/api/organizations/' + orgId + '/forecasts');
        if (forecasts.length > 0) {
            var f = forecasts[0];
            var fHtml = '<p style="margin-bottom:12px;"><strong>' + f.season + '</strong></p>';
            fHtml += '<table class="data-table"><thead><tr><th>Program</th><th>Current</th><th>Predicted</th><th>Capacity</th><th>Fill %</th><th>Trend</th></tr></thead><tbody>';
            for (var prog in f.forecast_data) {
                var fd = f.forecast_data[prog];
                var trendBadge = fd.trend === 'growing' ? '<span style="color:#09A1A1;">Growing</span>' : fd.trend === 'declining' ? '<span style="color:#FA6E82;">Declining</span>' : '<span style="color:#6b7280;">Stable</span>';
                fHtml += '<tr><td>' + prog + '</td><td>' + fd.current_count + '</td><td>' + fd.predicted_count + '</td><td>' + fd.capacity + '</td><td>' + fd.fill_rate + '%</td><td>' + trendBadge + '</td></tr>';
            }
            fHtml += '</tbody></table>';
            if (f.ai_narrative) fHtml += aiPanel('Forecast Analysis', f.ai_narrative, false);
            document.getElementById('forecast-body').innerHTML = fHtml;
        } else {
            document.getElementById('forecast-body').innerHTML = '<p class="text-muted">No forecasts yet.</p><button class="btn btn-secondary btn-sm" onclick="generateForecast()">Generate Forecast</button>';
        }
    } catch (e) {
        document.getElementById('forecast-body').innerHTML = '<p class="text-muted">No forecast data.</p>';
    }
    // Load reports
    try {
        var reports = await api('GET', '/api/organizations/' + orgId + '/reports');
        var rHtml = '';
        if (reports.length === 0) {
            rHtml = '<p class="text-muted">No reports generated yet.</p>';
        } else {
            rHtml = '<table class="data-table"><thead><tr><th>Season</th><th>Type</th><th>Date</th><th>Summary</th></tr></thead><tbody>';
            for (var ri = 0; ri < reports.length; ri++) {
                var rr = reports[ri];
                rHtml += '<tr><td>' + rr.season + '</td><td>' + rr.report_type + '</td><td>' + new Date(rr.generated_at).toLocaleDateString() + '</td><td style="max-width:400px;white-space:normal;">' + (rr.ai_executive_summary || '').substring(0, 200) + '...</td></tr>';
            }
            rHtml += '</tbody></table>';
        }
        document.getElementById('reports-list-body').innerHTML = rHtml;
    } catch (e) {}
    // Load parent engagement
    try {
        var eng = await api('GET', '/api/organizations/' + orgId + '/parent-engagement');
        if (eng.length > 0) {
            var healthy = eng.filter(function(e){return e.risk_level==='healthy'}).length;
            var watch = eng.filter(function(e){return e.risk_level==='watch'}).length;
            var atRisk = eng.filter(function(e){return e.risk_level==='at_risk'}).length;
            document.getElementById('engagement-results').innerHTML = '<div class="stats-grid"><div class="stat-card"><div class="stat-value" style="color:#09A1A1;">' + healthy + '</div><div class="stat-label">Healthy</div></div><div class="stat-card"><div class="stat-value" style="color:#F6C992;">' + watch + '</div><div class="stat-label">Watch</div></div><div class="stat-card"><div class="stat-value" style="color:#FA6E82;">' + atRisk + '</div><div class="stat-label">At Risk</div></div></div>';
        }
    } catch (e) {}
}

function renderHealthScore(hs) {
    var score = hs.score || 0;
    var color = score >= 70 ? '#09A1A1' : score >= 50 ? '#F6C992' : '#FA6E82';
    document.getElementById('health-score-stats').innerHTML =
        '<div class="stat-card" style="grid-column:span 2;text-align:center;"><div style="font-size:64px;font-weight:800;color:' + color + ';">' + score.toFixed(1) + '</div><div class="stat-label" style="font-size:16px;">Club Health Score / 100</div></div>';

    // Breakdown bars
    var bd = hs.breakdown || {};
    var labels = {retention_rate:'Retention Rate',coach_ratio:'Coach Ratio',financial_aid_pct:'Financial Aid',gender_equity:'Gender Equity',fill_rate:'Fill Rate',development_progression:'Development',parent_satisfaction:'Parent Satisfaction'};
    var weights = {retention_rate:20,coach_ratio:15,financial_aid_pct:10,gender_equity:15,fill_rate:15,development_progression:15,parent_satisfaction:10};
    var bdHtml = '';
    for (var key in labels) {
        var val = bd[key] || 0;
        var barColor = val >= 70 ? '#09A1A1' : val >= 50 ? '#F6C992' : '#FA6E82';
        bdHtml += '<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span style="font-weight:600;font-size:13px;">' + labels[key] + ' (w:' + weights[key] + '%)</span><span style="font-weight:700;">' + val.toFixed(1) + '</span></div><div style="background:#e5e7eb;border-radius:4px;height:16px;overflow:hidden;"><div style="width:' + val + '%;height:100%;background:' + barColor + ';border-radius:4px;transition:width 0.5s;"></div></div></div>';
    }
    document.getElementById('health-breakdown-body').innerHTML = bdHtml;

    // Benchmarks comparison
    var benchmarks = hs.benchmarks || {};
    var allAvg = benchmarks.all_clubs_avg || {};
    var top10 = benchmarks.top_10_pct || {};
    var bmHtml = '<table class="data-table"><thead><tr><th>Factor</th><th>You</th><th>All Clubs</th><th>Top 10%</th></tr></thead><tbody>';
    var factorMap = {retention_rate:'overall',coach_ratio:'overall',financial_aid_pct:'overall',gender_equity:'overall',fill_rate:'overall',development_progression:'overall',parent_satisfaction:'overall'};
    for (var k in labels) {
        bmHtml += '<tr><td>' + labels[k] + '</td><td style="font-weight:700;">' + (bd[k]||0).toFixed(1) + '</td><td>' + (allAvg.overall||50) + '</td><td>' + (top10.overall||81) + '</td></tr>';
    }
    bmHtml += '<tr style="font-weight:700;background:#e8f2f2;"><td>Overall</td><td>' + score.toFixed(1) + '</td><td>' + (allAvg.overall||50) + '</td><td>' + (top10.overall||81) + '</td></tr>';
    bmHtml += '</tbody></table>';
    document.getElementById('health-benchmarks-body').innerHTML = bmHtml;

    // AI narrative
    if (hs.ai_narrative) {
        document.getElementById('health-ai-narrative').innerHTML = aiPanel('Club Health Analysis', hs.ai_narrative, true);
if(typeof lucide!=='undefined')lucide.createIcons();
    }
}

async function generateHealthScore() {
    var orgId = requireOrg(); if (!orgId) return;
    var btn = document.getElementById('btn-generate-health');
    if (btn) btnLoading(btn, true);
    showAIThinking('health-ai-narrative');
    showSkeleton('health-breakdown-body', 6);
    showSkeleton('health-benchmarks-body', 6);
    try {
        var hs = await api('POST', '/api/organizations/' + orgId + '/health-score/generate');
        renderHealthScore(hs);
        toast('Health score generated!');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    if (btn) btnLoading(btn, false);
}

document.getElementById('btn-generate-health').addEventListener('click', generateHealthScore);

document.getElementById('btn-generate-report').addEventListener('click', async function() {
    var orgId = requireOrg(); if (!orgId) return;
    var reportType = document.getElementById('report-type-select').value;
    var season = document.getElementById('report-season-input').value;
    if (!season) { toast('Enter a season name', 'warning'); return; }
    showLoading();
    try {
        var r = await api('POST', '/api/organizations/' + orgId + '/reports/generate', {report_type: reportType, season: season});
        toast('Report generated!');
        loadIntelHealth(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    hideLoading();
});

document.getElementById('btn-calc-engagement').addEventListener('click', async function() {
    var orgId = requireOrg(); if (!orgId) return;
    showLoading();
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/parent-engagement/calculate');
        toast('Engagement calculated for ' + result.total_families + ' families');
        loadIntelHealth(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    hideLoading();
});

async function generateForecast() {
    var orgId = requireOrg(); if (!orgId) return;
    showLoading();
    try {
        await api('POST', '/api/organizations/' + orgId + '/forecasts/registration');
        toast('Forecast generated!');
        loadIntelHealth(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    hideLoading();
}


// ===================================================================
// INTELLIGENCE — Best Practice Assessment
// ===================================================================

async function loadIntelAssessment(orgId) {
    if (!orgId) return;
    try {
        var assessments = await api('GET', '/api/organizations/' + orgId + '/assessments');
        var tbody = document.getElementById('assessments-table-body');
        if (assessments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="padding:32px;"><div style="color:#888;margin-bottom:12px;"><i data-lucide="file-check" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i>No assessments yet</div><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'btn-new-assessment\')&&document.getElementById(\'btn-new-assessment\').click()">Start Your First Assessment</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Benchmark your club against 2,500+ clubs with the IYSL Best Practice Assessment</p></div></td></tr>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            tbody.innerHTML = assessments.map(function(a) {
                return '<tr><td>' + a.respondent_name + '</td><td><span class="badge">' + a.respondent_role + '</span></td><td>' + (a.completed_at ? new Date(a.completed_at).toLocaleDateString() : '') + '</td></tr>';
            }).join('');
        }
    } catch (e) {}
    document.getElementById('assessment-report-area').style.display = 'none';
}

document.getElementById('btn-new-assessment').addEventListener('click', async function() {
    // Fetch IYSL statement texts from the API
    var statementsData = {};
    try {
        var iyslData = await api('GET', '/api/iysl/statements');
        statementsData = iyslData.statements || {};
    } catch (e) {}

    var questions = '';
    for (var i = 1; i <= 60; i++) {
        var qKey = 'Q' + i;
        var qText = statementsData[qKey] || ('Best practice statement ' + i);
        questions += '<div style="margin-bottom:12px;padding:10px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;"><div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;"><span style="font-weight:700;color:#5484A4;font-size:13px;white-space:nowrap;">' + qKey + '</span><span style="font-size:13px;color:#333;line-height:1.4;">' + esc(qText) + '</span></div><div style="display:flex;align-items:center;gap:8px;"><input type="range" min="0" max="100" value="50" class="assess-slider" data-q="' + qKey + '" style="flex:1;"><span class="assess-val" style="min-width:30px;text-align:right;font-weight:600;">50</span></div></div>';
    }
    var formHtml = '<div style="margin-bottom:12px;"><label style="font-weight:600;">Respondent Name</label><input type="text" id="assess-name" class="form-input" placeholder="Your name"></div>' +
        '<div style="margin-bottom:12px;"><label style="font-weight:600;">Role</label><select id="assess-role" class="form-select"><option value="leader">Leader</option><option value="staff">Staff</option><option value="coach">Coach</option><option value="customer">Customer (Parent)</option></select></div>' +
        '<div style="max-height:400px;overflow-y:auto;padding:8px;border:1px solid #e5e7eb;border-radius:8px;">' + questions + '</div>';

    openModal('IYSL Best Practice Assessment (60 Questions)', formHtml,
        '<button class="btn btn-primary" id="btn-submit-assessment">Submit Assessment</button>');

    // Wire up sliders
    document.querySelectorAll('.assess-slider').forEach(function(slider) {
        slider.addEventListener('input', function() {
            this.nextElementSibling.textContent = this.value;
        });
    });

    document.getElementById('btn-submit-assessment').addEventListener('click', async function() {
        var name = document.getElementById('assess-name').value;
        var role = document.getElementById('assess-role').value;
        if (!name) { toast('Enter your name', 'warning'); return; }
        var responses = {};
        document.querySelectorAll('.assess-slider').forEach(function(s) {
            responses[s.getAttribute('data-q')] = parseInt(s.value);
        });
        var orgId = requireOrg(); if (!orgId) return;
        showLoading();
        try {
            await api('POST', '/api/organizations/' + orgId + '/assessments', {respondent_name: name, respondent_role: role, responses: responses});
            toast('Assessment submitted!');
            closeModal();
            loadIntelAssessment(orgId);
        } catch (e) { toast('Error: ' + e.message, 'error'); }
        hideLoading();
    });
});

document.getElementById('btn-view-assessment-report').addEventListener('click', async function() {
    var orgId = requireOrg(); if (!orgId) return;
    showLoading();
    try {
        var report = await api('GET', '/api/organizations/' + orgId + '/assessments/report');
        document.getElementById('assessment-report-area').style.display = 'block';

        // Department scores with radar-like bars
        var deptHtml = '<div style="text-align:center;font-size:24px;font-weight:700;margin-bottom:16px;">' + report.overall_score + '<span style="font-size:14px;color:#6b7280;">/100 Overall</span></div>';
        var depts = report.department_scores;
        var benchAll = report.benchmarks.all_clubs_avg;
        var benchTop = report.benchmarks.top_10_pct;
        for (var dept in depts) {
            var val = depts[dept];
            var barColor = val >= 70 ? '#09A1A1' : val >= 50 ? '#F6C992' : '#FA6E82';
            deptHtml += '<div style="margin-bottom:8px;"><div style="display:flex;justify-content:space-between;font-size:13px;"><span style="font-weight:600;">' + dept + '</span><span>' + val + '</span></div>';
            deptHtml += '<div style="position:relative;background:#e5e7eb;border-radius:4px;height:20px;overflow:visible;">';
            deptHtml += '<div style="width:' + val + '%;height:100%;background:' + barColor + ';border-radius:4px;"></div>';
            deptHtml += '<div style="position:absolute;left:' + (benchAll[dept]||50) + '%;top:0;height:100%;border-left:2px dashed #6b7280;" title="All Clubs: ' + (benchAll[dept]||50) + '"></div>';
            deptHtml += '<div style="position:absolute;left:' + (benchTop[dept]||80) + '%;top:0;height:100%;border-left:2px solid #09A1A1;" title="Top 10%: ' + (benchTop[dept]||80) + '"></div>';
            deptHtml += '</div></div>';
        }
        deptHtml += '<div style="margin-top:8px;font-size:11px;color:#6b7280;"><span style="border-left:2px dashed #6b7280;padding-left:4px;margin-right:12px;">All Clubs Avg</span><span style="border-left:2px solid #09A1A1;padding-left:4px;">Top 10%</span></div>';
        document.getElementById('dept-scores-body').innerHTML = deptHtml;

        // Gap analysis
        var gap = report.gap_analysis;
        var gapHtml = '<table class="data-table"><thead><tr><th>Department</th><th>Current</th><th>Gap to 100%</th><th>vs All Clubs</th><th>vs Top 10%</th></tr></thead><tbody>';
        for (var gd in gap) {
            var g = gap[gd];
            var vsAll = g.vs_all_clubs >= 0 ? '<span style="color:#09A1A1;">+' + g.vs_all_clubs + '</span>' : '<span style="color:#FA6E82;">' + g.vs_all_clubs + '</span>';
            var vsTop = g.vs_top_10 >= 0 ? '<span style="color:#09A1A1;">+' + g.vs_top_10 + '</span>' : '<span style="color:#FA6E82;">' + g.vs_top_10 + '</span>';
            gapHtml += '<tr><td>' + gd + '</td><td style="font-weight:700;">' + g.current + '</td><td>' + g.gap + '</td><td>' + vsAll + '</td><td>' + vsTop + '</td></tr>';
        }
        gapHtml += '</tbody></table>';
        document.getElementById('gap-analysis-body').innerHTML = gapHtml;

        // Role scores
        var roles = report.role_scores;
        var roleAvg = report.benchmarks.all_clubs_role_avg || {};
        var roleTop = report.benchmarks.top_10_role_avg || {};
        var roleHtml = '<table class="data-table"><thead><tr><th>Role</th><th>Score</th><th>All Clubs</th><th>Top 10%</th></tr></thead><tbody>';
        for (var rl in roles) {
            roleHtml += '<tr><td>' + rl + '</td><td style="font-weight:700;">' + roles[rl] + '</td><td>' + (roleAvg[rl]||'--') + '</td><td>' + (roleTop[rl]||'--') + '</td></tr>';
        }
        roleHtml += '</tbody></table>';
        document.getElementById('role-scores-body').innerHTML = roleHtml;

        // Stakeholder
        var stakeholders = report.stakeholder_perceptions;
        var sHtml = '';
        for (var sk in stakeholders) {
            var sv = stakeholders[sk];
            var sColor = sv >= 70 ? '#09A1A1' : sv >= 50 ? '#F6C992' : '#FA6E82';
            sHtml += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="min-width:100px;font-weight:600;font-size:13px;">' + sk + '</span><div style="flex:1;background:#e5e7eb;border-radius:4px;height:14px;"><div style="width:' + sv + '%;height:100%;background:' + sColor + ';border-radius:4px;"></div></div><span style="font-weight:700;min-width:30px;">' + sv + '</span></div>';
        }
        document.getElementById('stakeholder-body').innerHTML = sHtml || '<p class="text-muted">No stakeholder data.</p>';

        // AI recommendations
        document.getElementById('assessment-ai-body').innerHTML = aiPanel('AI Improvement Recommendations', report.ai_recommendations, true);
if(typeof lucide!=='undefined')lucide.createIcons();

    } catch (e) { toast('Error: ' + e.message, 'error'); }
    hideLoading();
});


// ===================================================================
// INTELLIGENCE — Player Development
// ===================================================================

async function loadIntelDevelopment(orgId) {
    if (!orgId) return;
    try {
        var summary = await api('GET', '/api/organizations/' + orgId + '/development-paths/summary');
        var levels = summary.development_levels || ['Tots','Rec','Pre-Travel','Select','Travel','Academy'];
        var counts = summary.by_level || {};

        // Also try to get prediction data for player mini-cards
        var predictions = [];
        try {
            var predResult = await api('POST', '/api/organizations/' + orgId + '/development-paths/ai-predict');
            predictions = predResult.predictions || [];
        } catch (pe) {}

        // Build 6-column layout
        var colors = ['#ACC0D3','#09A1A1','#09A1A1','#09A1A1','#5484A4','#5484A4'];
        var pathHtml = '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:12px 0;">';
        for (var li = 0; li < levels.length; li++) {
            var lvl = levels[li];
            var cnt = counts[lvl] || 0;
            var lvlPlayers = predictions.filter(function(p) { return (p.current_level || 'Rec').toLowerCase() === lvl.toLowerCase(); });
            // If no predictions loaded, use count from summary
            if (predictions.length === 0 && cnt > 0) {
                // show placeholder cards
            }
            pathHtml += '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:0;overflow:hidden;min-height:200px;">';
            pathHtml += '<div style="background:' + colors[li] + ';color:#fff;padding:10px 12px;text-align:center;font-weight:700;font-size:14px;">' + esc(lvl) + ' <span style="background:rgba(255,255,255,0.25);padding:2px 8px;border-radius:10px;font-size:12px;margin-left:4px;">' + (lvlPlayers.length || cnt) + '</span></div>';
            pathHtml += '<div style="padding:8px;max-height:400px;overflow-y:auto;">';
            if (lvlPlayers.length > 0) {
                for (var pi = 0; pi < lvlPlayers.length; pi++) {
                    var p = lvlPlayers[pi];
                    var scoreText = p.latest_score ? p.latest_score.toFixed(1) : '--';
                    var likColor = p.advancement_likelihood === 'likely' ? '#09A1A1' : p.advancement_likelihood === 'developing' ? '#F6C992' : '#FA6E82';
                    pathHtml += '<div style="background:#fff;border:1px solid #e5e7eb;border-left:3px solid ' + likColor + ';border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:12px;">';
                    pathHtml += '<div style="font-weight:600;font-size:13px;">' + esc(p.player_name) + '</div>';
                    pathHtml += '<div style="display:flex;justify-content:space-between;margin-top:2px;color:#6b7280;"><span>' + esc(p.age_group || '') + '</span><span style="font-weight:700;color:' + likColor + ';">' + scoreText + '</span></div>';
                    pathHtml += '</div>';
                }
            } else if (cnt > 0) {
                pathHtml += '<p style="text-align:center;color:#aaa;font-size:12px;margin-top:60px;">' + cnt + ' player' + (cnt !== 1 ? 's' : '') + '</p>';
            } else {
                pathHtml += '<p style="text-align:center;color:#ccc;font-size:12px;margin-top:60px;">No players</p>';
            }
            pathHtml += '</div></div>';
        }
        pathHtml += '</div>';
        pathHtml += '<div style="text-align:center;color:#6b7280;font-size:13px;margin-top:8px;">Total tracked: ' + summary.total_tracked + ' players</div>';
        document.getElementById('dev-pathway-visual').innerHTML = pathHtml;
    } catch (e) {
        document.getElementById('dev-pathway-visual').innerHTML = '<div style="text-align:center;padding:24px;"><i data-lucide="trending-up" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i><p style="color:#888;margin-bottom:12px;">No development data yet</p><button class="btn btn-primary btn-sm" onclick="runDevPredictions()"><i data-lucide="sparkles" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:2px;"></i> Run AI Predictions</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Predict player readiness for advancement across Rec, Select, Travel, and Academy levels</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

document.getElementById('btn-ai-predict-dev').addEventListener('click', async function() {
    var orgId = requireOrg(); if (!orgId) return;
    showLoading();
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/development-paths/ai-predict');
        var predictions = result.predictions || [];
        var cardsHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">';
        for (var pi = 0; pi < predictions.length; pi++) {
            var p = predictions[pi];
            var likColor = p.advancement_likelihood === 'likely' ? '#09A1A1' : p.advancement_likelihood === 'developing' ? '#F6C992' : '#FA6E82';
            var likLabel = p.advancement_likelihood === 'likely' ? 'Likely to Advance' : p.advancement_likelihood === 'developing' ? 'Developing' : 'Needs Support';
            cardsHtml += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;"><div style="font-weight:700;">' + p.player_name + '</div><div style="font-size:12px;color:#6b7280;">' + (p.age_group||'') + '</div>';
            cardsHtml += '<div style="margin:8px 0;"><span style="background:#e0f2fe;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">' + p.current_level + '</span> &rarr; <span style="background:#f0fdf4;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">' + p.predicted_next_level + '</span></div>';
            cardsHtml += '<div style="color:' + likColor + ';font-weight:600;font-size:13px;">' + likLabel + '</div>';
            if (p.latest_score) cardsHtml += '<div style="font-size:12px;color:#6b7280;">Score: ' + p.latest_score.toFixed(2) + '</div>';
            cardsHtml += '</div>';
        }
        cardsHtml += '</div>';
        document.getElementById('dev-cards-body').innerHTML = cardsHtml;
        toast('Predictions generated for ' + predictions.length + ' players');
        loadIntelDevelopment(orgId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    hideLoading();
});


// ===================================================================
// INTELLIGENCE — Competition & League Intelligence
// ===================================================================

var _competitionLeagues = {};

async function loadIntelCompetition(orgId) {
    if (!orgId) return;

    // Load leagues for filter dropdown
    try {
        var leagueData = await api('GET', '/api/organizations/' + orgId + '/competition/leagues');
        _competitionLeagues = leagueData.leagues || {};
        var filterEl = document.getElementById('competition-league-filter');
        var opts = '<option value="">All Leagues</option>';
        for (var key in _competitionLeagues) {
            var lg = _competitionLeagues[key];
            opts += '<option value="' + lg.name + '">' + lg.name + '</option>';
        }
        // Also add specific division options
        opts += '<option value="NCSL Division 1">NCSL Division 1</option>';
        opts += '<option value="NCSL Division 2">NCSL Division 2</option>';
        opts += '<option value="NCSL Division 3">NCSL Division 3</option>';
        opts += '<option value="NCSL Premier">NCSL Premier</option>';
        opts += '<option value="MDSL">MDSL</option>';
        filterEl.innerHTML = opts;
    } catch (e) {}

    // Load standings
    try {
        var standings = await api('GET', '/api/organizations/' + orgId + '/competition/standings');
        var tbody = document.getElementById('standings-table-body');
        if (standings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center" style="padding:32px;"><div style="color:#888;margin-bottom:12px;"><i data-lucide="trophy" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i>No match results yet</div><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'btn-add-result\')&&document.getElementById(\'btn-add-result\').click()">Add First Match Result</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Track wins, losses, draws, scorers, and league standings</p></div></td></tr>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            tbody.innerHTML = standings.map(function(s) {
                var ptsStyle = 'font-weight:800;color:#5484A4;';
                var gdStyle = s.goal_difference > 0 ? 'color:#09A1A1;font-weight:600;' : s.goal_difference < 0 ? 'color:#FA6E82;font-weight:600;' : '';
                var gdPrefix = s.goal_difference > 0 ? '+' : '';
                return '<tr><td style="font-weight:600;">' + s.team_name + '</td><td style="font-size:12px;color:#6b7280;">' + (s.league || '--') + '</td><td>' + s.matches + '</td><td style="color:#09A1A1;font-weight:600;">' + s.wins + '</td><td>' + s.draws + '</td><td style="color:#FA6E82;">' + s.losses + '</td><td>' + s.goals_for + '</td><td>' + s.goals_against + '</td><td style="' + gdStyle + '">' + gdPrefix + s.goal_difference + '</td><td style="' + ptsStyle + '">' + s.points + '</td></tr>';
            }).join('');

            // Build season summary cards from standings
            var totalW = 0, totalD = 0, totalL = 0, totalGF = 0, totalGA = 0, totalMatches = 0;
            standings.forEach(function(s) {
                totalW += s.wins; totalD += s.draws; totalL += s.losses;
                totalGF += s.goals_for; totalGA += s.goals_against; totalMatches += s.matches;
            });
            document.getElementById('competition-stats-bar').innerHTML =
                '<div class="stat-card"><div class="stat-value">' + standings.length + '</div><div class="stat-label"><i data-lucide="users" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> Teams</div></div>' +
                '<div class="stat-card"><div class="stat-value">' + totalMatches + '</div><div class="stat-label"><i data-lucide="calendar" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> Matches</div></div>' +
                '<div class="stat-card"><div class="stat-value" style="color:#09A1A1;">' + totalW + '</div><div class="stat-label">Wins</div></div>' +
                '<div class="stat-card"><div class="stat-value">' + totalD + '</div><div class="stat-label">Draws</div></div>' +
                '<div class="stat-card"><div class="stat-value" style="color:#FA6E82;">' + totalL + '</div><div class="stat-label">Losses</div></div>' +
                '<div class="stat-card"><div class="stat-value">' + totalGF + '<span style="font-size:14px;color:#6b7280;">-</span>' + totalGA + '</div><div class="stat-label"><i data-lucide="target" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> Goals (F-A)</div></div>';
        }
    } catch (e) {
        document.getElementById('standings-table-body').innerHTML = '<tr><td colspan="10" class="text-center text-muted">Error loading standings.</td></tr>';
    }

    // Load stats — scorers and assists
    try {
        var stats = await api('GET', '/api/organizations/' + orgId + '/competition/stats');
        var gsHtml = '';
        if (stats.top_scorers && stats.top_scorers.length > 0) {
            gsHtml += '<h4 style="margin-bottom:8px;font-size:14px;"><i data-lucide="flame" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px;color:#F6C992;"></i> Top Scorers</h4>';
            gsHtml += '<table class="data-table"><thead><tr><th>#</th><th>Player</th><th>Goals</th></tr></thead><tbody>';
            stats.top_scorers.forEach(function(ts, idx) {
                var medal = idx === 0 ? ' style="color:#F6C992;font-weight:800;"' : idx === 1 ? ' style="color:#9ca3af;font-weight:700;"' : idx === 2 ? ' style="color:#b45309;font-weight:700;"' : '';
                gsHtml += '<tr><td' + medal + '>' + (idx+1) + '</td><td style="font-weight:600;">' + ts.name + '</td><td style="font-weight:800;color:#5484A4;">' + ts.goals + '</td></tr>';
            });
            gsHtml += '</tbody></table>';
        }
        if (stats.top_assists && stats.top_assists.length > 0) {
            gsHtml += '<h4 style="margin:16px 0 8px;font-size:14px;"><i data-lucide="handshake" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px;color:#09A1A1;"></i> Top Assists</h4>';
            gsHtml += '<table class="data-table"><thead><tr><th>#</th><th>Player</th><th>Assists</th></tr></thead><tbody>';
            stats.top_assists.forEach(function(ta, idx) {
                gsHtml += '<tr><td>' + (idx+1) + '</td><td style="font-weight:600;">' + ta.name + '</td><td style="font-weight:700;color:#09A1A1;">' + ta.assists + '</td></tr>';
            });
            gsHtml += '</tbody></table>';
        }
        document.getElementById('goal-stats-body').innerHTML = gsHtml || '<p class="text-muted">No stats yet.</p>';
    } catch (e) {}

    // Load recent results
    try {
        var results = await api('GET', '/api/organizations/' + orgId + '/competition/results');
        var rrBody = document.getElementById('recent-results-body');
        if (!results || results.length === 0) {
            rrBody.innerHTML = '<p class="text-muted">No results yet. Add match results to track team performance.</p>';
        } else {
            var rrHtml = '<table class="data-table"><thead><tr><th>Date</th><th>Team</th><th>Result</th><th>Score</th><th>Opponent</th><th>League</th><th>Scorers</th></tr></thead><tbody>';
            results.slice(0, 20).forEach(function(r) {
                var resultColor = r.result === 'win' ? '#09A1A1' : r.result === 'loss' ? '#FA6E82' : '#F6C992';
                var resultLabel = r.result === 'win' ? 'W' : r.result === 'loss' ? 'L' : 'D';
                var scorerNames = (r.goal_scorers || []).map(function(gs) {
                    return gs.player_name + (gs.count > 1 ? ' (' + gs.count + ')' : '');
                }).join(', ');
                rrHtml += '<tr>' +
                    '<td style="font-size:12px;white-space:nowrap;">' + (r.match_date || '') + '</td>' +
                    '<td style="font-weight:600;">' + r.team_name + '</td>' +
                    '<td><span style="background:' + resultColor + ';color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;font-size:12px;">' + resultLabel + '</span></td>' +
                    '<td style="font-weight:700;">' + r.score_for + ' - ' + r.score_against + '</td>' +
                    '<td>' + r.opponent_name + '</td>' +
                    '<td style="font-size:12px;color:#6b7280;">' + (r.league || '--') + '</td>' +
                    '<td style="font-size:12px;">' + (scorerNames || '--') + '</td>' +
                    '</tr>';
            });
            rrHtml += '</tbody></table>';
            rrBody.innerHTML = rrHtml;
        }
    } catch (e) {}
}

// League filter change
document.getElementById('competition-league-filter').addEventListener('change', function() {
    var orgId = getSelectedOrg(); if (!orgId) return;
    loadIntelCompetition(orgId);
});

// View league info modal
document.getElementById('btn-view-leagues').addEventListener('click', async function() {
    var orgId = requireOrg(); if (!orgId) return;
    try {
        var data = await api('GET', '/api/organizations/' + orgId + '/competition/leagues');
        var leagues = data.leagues || {};
        var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
        for (var key in leagues) {
            var lg = leagues[key];
            var levelColor = lg.level === 'Elite' ? '#7c3aed' : lg.level === 'Competitive' ? '#09A1A1' : '#09A1A1';
            html += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                '<span style="font-weight:700;font-size:14px;">' + lg.name + '</span>' +
                '<span style="background:' + levelColor + ';color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">' + lg.level + '</span>' +
                '</div>' +
                '<div style="font-size:12px;color:#6b7280;margin-bottom:4px;"><i data-lucide="map-pin" style="width:11px;height:11px;display:inline;vertical-align:middle;margin-right:2px;"></i> ' + lg.region + '</div>' +
                '<div style="font-size:12px;color:#6b7280;margin-bottom:4px;"><i data-lucide="calendar" style="width:11px;height:11px;display:inline;vertical-align:middle;margin-right:2px;"></i> ' + (lg.season || 'TBD') + '</div>' +
                '<div style="font-size:11px;color:#9ca3af;">Age Groups: ' + (lg.age_groups || []).join(', ') + '</div>';
            if (lg.competitors && lg.competitors.length > 0) {
                html += '<div style="font-size:11px;color:#9ca3af;margin-top:4px;">Competitors: ' + lg.competitors.join(', ') + '</div>';
            }
            if (lg.member_clubs) {
                html += '<div style="font-size:11px;color:#9ca3af;margin-top:4px;">' + lg.member_clubs + ' member clubs</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        openModal('DMV League Directory (' + Object.keys(leagues).length + ' Leagues)', html, '');
    } catch (e) { toast('Error loading leagues: ' + e.message, 'error'); }
});

document.getElementById('btn-add-match').addEventListener('click', async function() {
    var orgId = requireOrg(); if (!orgId) return;
    var teams = [];
    try { teams = await api('GET', '/api/organizations/' + orgId + '/teams'); } catch(e){}
    var teamOpts = teams.map(function(t){ return '<option value="' + t.id + '">' + t.name + '</option>'; }).join('');

    // Build league options from DMV_LEAGUES
    var leagueOpts = '<option value="">Select League</option>';
    leagueOpts += '<option value="NCSL Division 1">NCSL Division 1</option>';
    leagueOpts += '<option value="NCSL Division 2">NCSL Division 2</option>';
    leagueOpts += '<option value="NCSL Division 3">NCSL Division 3</option>';
    leagueOpts += '<option value="NCSL Premier">NCSL Premier</option>';
    leagueOpts += '<option value="MDSL">MDSL</option>';
    leagueOpts += '<option value="CPSL">CPSL</option>';
    leagueOpts += '<option value="EDP">EDP</option>';
    leagueOpts += '<option value="MLS NEXT">MLS NEXT</option>';
    leagueOpts += '<option value="GA ASPIRE">GA ASPIRE</option>';

    // DMV opponent suggestions
    var opponentOpts = '<option value="">Type or select...</option>';
    var dmvClubs = ['Bethesda SC','Arlington SA','McLean Youth Soccer','Loudoun Soccer','Virginia Rush','FC Richmond','Potomac Soccer','Burke Athletic Club','Springfield SYC','Vienna Youth Soccer'];
    dmvClubs.forEach(function(c) { opponentOpts += '<option value="' + c + '">' + c + '</option>'; });

    var formHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-weight:600;font-size:13px;"><i data-lucide="users" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> Team</label><select id="match-team" class="form-select">' + teamOpts + '</select></div>' +
        '<div><label style="font-weight:600;font-size:13px;"><i data-lucide="shield" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> Opponent</label><select id="match-opponent-select" class="form-select">' + opponentOpts + '</select><input type="text" id="match-opponent" class="form-input" placeholder="Or type opponent name" style="margin-top:4px;"></div>' +
        '<div><label style="font-weight:600;font-size:13px;"><i data-lucide="calendar" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> Date</label><input type="date" id="match-date" class="form-input"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Result</label><select id="match-result" class="form-select"><option value="win">Win</option><option value="loss">Loss</option><option value="draw">Draw</option></select></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Score For</label><input type="number" id="match-score-for" class="form-input" value="0" min="0"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Score Against</label><input type="number" id="match-score-against" class="form-input" value="0" min="0"></div>' +
        '<div><label style="font-weight:600;font-size:13px;"><i data-lucide="trophy" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i> League</label><select id="match-league" class="form-select">' + leagueOpts + '</select></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Notes</label><input type="text" id="match-notes" class="form-input" placeholder="Optional notes"></div>' +
        '</div>';

    openModal('<i data-lucide="plus-circle" style="width:18px;height:18px;display:inline;vertical-align:middle;margin-right:4px;"></i> Add Match Result', formHtml, '<button class="btn btn-primary" id="btn-save-match"><i data-lucide="check" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:2px;"></i> Save Result</button>');

    // Sync opponent dropdown to text input
    document.getElementById('match-opponent-select').addEventListener('change', function() {
        document.getElementById('match-opponent').value = this.value;
    });

    document.getElementById('btn-save-match').addEventListener('click', async function() {
        var opponent = document.getElementById('match-opponent').value || document.getElementById('match-opponent-select').value;
        if (!opponent) { toast('Please enter an opponent name', 'error'); return; }
        showLoading();
        try {
            await api('POST', '/api/organizations/' + orgId + '/competition/results', {
                team_id: document.getElementById('match-team').value,
                opponent_name: opponent,
                match_date: document.getElementById('match-date').value,
                result: document.getElementById('match-result').value,
                score_for: parseInt(document.getElementById('match-score-for').value) || 0,
                score_against: parseInt(document.getElementById('match-score-against').value) || 0,
                league: document.getElementById('match-league').value,
                notes: document.getElementById('match-notes').value,
                goal_scorers: [], assists: []
            });
            toast('Match result saved!');
            closeModal();
            loadIntelCompetition(orgId);
        } catch (e) { toast('Error: ' + e.message, 'error'); }
        hideLoading();
    });
});


// ===================================================================
// INTELLIGENCE — Compliance
// ===================================================================

async function loadIntelCompliance(orgId) {
    if (!orgId) return;
    try {
        var data = await api('GET', '/api/organizations/' + orgId + '/compliance');
        var pct = data.compliance_pct || 0;
        var pctColor = pct >= 80 ? '#09A1A1' : pct >= 60 ? '#F6C992' : '#FA6E82';

        document.getElementById('compliance-stats-bar').innerHTML =
            '<div class="stat-card"><div class="stat-value" style="color:' + pctColor + ';">' + pct + '%</div><div class="stat-label">Overall Compliance</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + data.total_people + '</div><div class="stat-label">Total Items</div></div>' +
            '<div class="stat-card"><div class="stat-value" style="color:#09A1A1;">' + data.compliant_count + '</div><div class="stat-label">Compliant</div></div>' +
            '<div class="stat-card"><div class="stat-value" style="color:#F6C992;">' + data.expiring_count + '</div><div class="stat-label">Expiring</div></div>' +
            '<div class="stat-card"><div class="stat-value" style="color:#FA6E82;">' + data.expired_count + '</div><div class="stat-label">Expired</div></div>' +
            '<div class="stat-card"><div class="stat-value" style="color:#FA6E82;">' + data.missing_count + '</div><div class="stat-label">Missing</div></div>';

        var items = data.items || [];
        var tbody = document.getElementById('compliance-table-body');
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:32px;"><div style="color:#888;margin-bottom:12px;"><i data-lucide="shield-check" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#ACC0D3;"></i>No compliance items tracked</div><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'btn-add-compliance\')&&document.getElementById(\'btn-add-compliance\').click()">Add Compliance Item</button><p style="font-size:12px;color:#aaa;margin-top:8px;">Track SafeSport, background checks, coaching licenses, and waivers</p></div></td></tr>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            tbody.innerHTML = items.map(function(i) {
                var statusColor = i.status === 'compliant' ? '#09A1A1' : i.status === 'expiring' ? '#F6C992' : '#FA6E82';
                return '<tr><td style="font-weight:600;">' + i.person_name + '</td><td>' + i.person_role + '</td><td>' + i.item_type.replace(/_/g,' ') + '</td><td><span style="color:' + statusColor + ';font-weight:600;">' + i.status.toUpperCase() + '</span></td><td>' + (i.expiry_date || '--') + '</td><td>' + (i.notes || '') + '</td></tr>';
            }).join('');
        }
    } catch (e) {
        document.getElementById('compliance-stats-bar').innerHTML = '';
        document.getElementById('compliance-table-body').innerHTML = '<tr><td colspan="6" class="text-center text-muted">No compliance data.</td></tr>';
    }
}

document.getElementById('btn-add-compliance').addEventListener('click', function() {
    var formHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-weight:600;">Person Name</label><input type="text" id="comp-person" class="form-input" placeholder="Name"></div>' +
        '<div><label style="font-weight:600;">Role</label><input type="text" id="comp-role" class="form-input" placeholder="e.g., coach, volunteer"></div>' +
        '<div><label style="font-weight:600;">Type</label><select id="comp-type" class="form-select"><option value="background_check">Background Check</option><option value="safesport">SafeSport</option><option value="insurance">Insurance</option><option value="concussion_training">Concussion Training</option><option value="first_aid">First Aid</option></select></div>' +
        '<div><label style="font-weight:600;">Status</label><select id="comp-status" class="form-select"><option value="compliant">Compliant</option><option value="expiring">Expiring</option><option value="expired">Expired</option><option value="missing">Missing</option></select></div>' +
        '<div><label style="font-weight:600;">Expiry Date</label><input type="date" id="comp-expiry" class="form-input"></div>' +
        '<div><label style="font-weight:600;">Notes</label><input type="text" id="comp-notes" class="form-input" placeholder="Optional notes"></div>' +
        '</div>';

    openModal('Add Compliance Item', formHtml, '<button class="btn btn-primary" id="btn-save-compliance">Save</button>');

    document.getElementById('btn-save-compliance').addEventListener('click', async function() {
        var orgId = requireOrg(); if (!orgId) return;
        showLoading();
        try {
            await api('POST', '/api/organizations/' + orgId + '/compliance/items', {
                person_name: document.getElementById('comp-person').value,
                person_role: document.getElementById('comp-role').value,
                item_type: document.getElementById('comp-type').value,
                status: document.getElementById('comp-status').value,
                expiry_date: document.getElementById('comp-expiry').value || null,
                notes: document.getElementById('comp-notes').value || null
            });
            toast('Compliance item added!');
            closeModal();
            loadIntelCompliance(orgId);
        } catch (e) { toast('Error: ' + e.message, 'error'); }
        hideLoading();
    });
});

document.getElementById('btn-expiring-compliance').addEventListener('click', async function() {
    var orgId = requireOrg(); if (!orgId) return;
    showLoading();
    try {
        var items = await api('GET', '/api/organizations/' + orgId + '/compliance/expiring');
        if (items.length === 0) {
            toast('No items expiring within 30 days!');
        } else {
            var html = '<table class="data-table"><thead><tr><th>Person</th><th>Type</th><th>Expires</th><th>Days Left</th></tr></thead><tbody>';
            items.forEach(function(i) {
                var urgency = i.days_until_expiry <= 7 ? 'color:#FA6E82;font-weight:700;' : i.days_until_expiry <= 14 ? 'color:#F6C992;font-weight:600;' : '';
                html += '<tr><td>' + i.person_name + '</td><td>' + i.item_type.replace(/_/g,' ') + '</td><td>' + i.expiry_date + '</td><td style="' + urgency + '">' + i.days_until_expiry + ' days</td></tr>';
            });
            html += '</tbody></table>';
            openModal('Expiring Compliance Items (Next 30 Days)', html, '');
        }
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    hideLoading();
});


// ===================================================================
// FEATURE: SKELETON LOADER
// ===================================================================
function showSkeleton(el, rows) {
    rows = rows || 5;
    var html = '';
    for (var i = 0; i < rows; i++) {
        var w = 40 + Math.random() * 55;
        html += '<div class="skeleton-row" style="width:' + w + '%;height:' + (i === 0 ? '18' : '14') + 'px;"></div>';
    }
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.innerHTML = html;
}

function showAIThinking(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.innerHTML = '<div class="ai-thinking-indicator"><i data-lucide="sparkles" style="width:18px;height:18px;color:var(--teal);"></i> AI is thinking...<div class="ai-dots"><span></span><span></span><span></span></div></div>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function btnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn._origText = btn.innerHTML;
        btn.classList.add('btn-loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
        if (btn._origText) btn.innerHTML = btn._origText;
    }
}

// ===================================================================
// FEATURE: TABLE SORTING
// ===================================================================
function sortTable(table, colIndex, forceDir) {
    if (typeof table === 'string') table = document.getElementById(table);
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length === 0) return;

    var th = table.querySelectorAll('thead th')[colIndex];
    var currentDir = th && th.classList.contains('sort-asc') ? 'asc' : (th && th.classList.contains('sort-desc') ? 'desc' : null);
    var dir = forceDir || (currentDir === 'asc' ? 'desc' : 'asc');

    // Clear sort indicators on all headers
    table.querySelectorAll('thead th').forEach(function(h) { h.classList.remove('sort-asc', 'sort-desc'); });
    if (th) th.classList.add('sort-' + dir);

    rows.sort(function(a, b) {
        var aVal = (a.cells[colIndex] && a.cells[colIndex].textContent.trim()) || '';
        var bVal = (b.cells[colIndex] && b.cells[colIndex].textContent.trim()) || '';
        var aNum = parseFloat(aVal);
        var bNum = parseFloat(bVal);
        if (!isNaN(aNum) && !isNaN(bNum)) {
            return dir === 'asc' ? aNum - bNum : bNum - aNum;
        }
        var aDate = Date.parse(aVal);
        var bDate = Date.parse(bVal);
        if (!isNaN(aDate) && !isNaN(bDate)) {
            return dir === 'asc' ? aDate - bDate : bDate - aDate;
        }
        return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    rows.forEach(function(r) { tbody.appendChild(r); });
}

function enableTableSorting(tableId, excludeCols) {
    var table = document.getElementById(tableId);
    if (!table) return;
    excludeCols = excludeCols || [];
    var headers = table.querySelectorAll('thead th');
    headers.forEach(function(th, i) {
        if (excludeCols.indexOf(i) !== -1) return;
        if (th.textContent.trim() === 'Actions') return;
        th.classList.add('sortable');
        th.addEventListener('click', function() { sortTable(table, i); });
    });
}

// ===================================================================
// FEATURE: INLINE EDITING
// ===================================================================
function enableInlineEdit(tableBodyId, columns, patchFn) {
    var tbody = document.getElementById(tableBodyId);
    if (!tbody) return;
    tbody.addEventListener('dblclick', function(e) {
        var td = e.target.closest('td');
        if (!td || td.querySelector('.inline-edit-input')) return;
        var tr = td.closest('tr');
        if (!tr) return;
        var cellIndex = Array.from(tr.cells).indexOf(td);
        var colDef = columns.find(function(c) { return c.index === cellIndex; });
        if (!colDef) return;

        var originalValue = td.textContent.trim();
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit-input';
        input.value = originalValue;
        td.textContent = '';
        td.appendChild(input);
        input.focus();
        input.select();

        function save() {
            var newVal = input.value.trim();
            td.textContent = newVal || originalValue;
            td.classList.remove('inline-editable');
            if (newVal && newVal !== originalValue && patchFn) {
                patchFn(tr, colDef.field, newVal);
            }
        }
        function cancel() {
            td.textContent = originalValue;
        }
        input.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); save(); }
            if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
        });
        input.addEventListener('blur', save);
    });

    // Mark editable cells
    var observer = new MutationObserver(function() {
        Array.from(tbody.querySelectorAll('tr')).forEach(function(tr) {
            columns.forEach(function(col) {
                if (tr.cells[col.index] && !tr.cells[col.index].classList.contains('inline-editable')) {
                    tr.cells[col.index].classList.add('inline-editable');
                }
            });
        });
    });
    observer.observe(tbody, { childList: true, subtree: true });
    // Initial mark
    Array.from(tbody.querySelectorAll('tr')).forEach(function(tr) {
        columns.forEach(function(col) {
            if (tr.cells[col.index]) tr.cells[col.index].classList.add('inline-editable');
        });
    });
}

// ===================================================================
// FEATURE: FORM VALIDATION
// ===================================================================
function validateForm(fields) {
    var valid = true;
    // Clear previous errors
    document.querySelectorAll('.field-error').forEach(function(e) { e.remove(); });
    document.querySelectorAll('.input-error').forEach(function(e) { e.classList.remove('input-error'); });

    fields.forEach(function(f) {
        var el = document.getElementById(f.id);
        if (!el) return;
        var val = el.value.trim();
        var errorMsg = null;

        if (f.required && !val) {
            errorMsg = (f.label || 'This field') + ' is required';
        } else if (f.minLength && val.length < f.minLength) {
            errorMsg = (f.label || 'This field') + ' must be at least ' + f.minLength + ' characters';
        } else if (f.pattern && val && !f.pattern.test(val)) {
            errorMsg = f.patternMsg || 'Invalid format';
        } else if (f.validate && val) {
            errorMsg = f.validate(val);
        }

        if (errorMsg) {
            valid = false;
            el.classList.add('input-error');
            var errEl = document.createElement('span');
            errEl.className = 'field-error';
            errEl.textContent = errorMsg;
            el.parentElement.appendChild(errEl);
        } else if (val) {
            el.classList.add('input-success');
        }
    });
    return valid;
}

// Mark required fields in modals
function markRequiredFields(fieldIds) {
    fieldIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        var label = el.parentElement.querySelector('.form-label');
        if (label && !label.classList.contains('required')) {
            label.classList.add('required');
        }
    });
}

// ===================================================================
// FEATURE: HELP TOOLTIPS
// ===================================================================
function helpTooltip(text) {
    return '<span class="help-tooltip-trigger">?<span class="help-tooltip-content">' + text + '</span></span>';
}

var _helpTexts = {
    'health-score': 'Health Score is calculated from 7 weighted factors: registration numbers, coach-to-player ratio, field utilization, volunteer engagement, document compliance, financial sustainability, and program diversity.',
    'iysl-benchmarks': 'IYSL benchmarks compare your club against data from 2,500+ youth soccer clubs nationwide. Top 10% represents elite-performing organizations.',
    'competition': 'Competition intelligence tracks match results, league standings, goal statistics, and team performance across all registered leagues.',
    'compliance': 'Compliance tracks background checks, certifications, medical clearances, and insurance documents for all coaches, volunteers, and staff.',
    'attendance': 'Attendance tracking monitors player participation rates across practices and games. Low attendance may indicate scheduling conflicts or engagement issues.',
    'ai-assistant': 'The AI assistant analyzes your club data to provide actionable insights. It can draft emails, identify trends, suggest roster changes, and more.',
    'development': 'Development pathways map player progression from recreational to competitive levels: Tots \u2192 Rec \u2192 Pre-Travel \u2192 Select \u2192 Travel \u2192 Academy.',
    'draft': 'The draft tool helps balance teams by distributing players based on skill evaluations, positions, and age groups for fair competition.'
};

// ===================================================================
// FEATURE: PRINT DASHBOARD
// ===================================================================
function printDashboard() {
    // Ensure overview section is visible
    var currentActive = document.querySelector('.nav-item.active');
    var wasOverview = currentActive && currentActive.getAttribute('data-section') === 'overview';
    if (!wasOverview) navigateTo('overview');
    setTimeout(function() {
        window.print();
        if (!wasOverview && currentActive) {
            navigateTo(currentActive.getAttribute('data-section'));
        }
    }, 300);
}

// ===================================================================
// FEATURE: KEYBOARD SHORTCUTS
// ===================================================================
var _shortcutsVisible = false;

function showShortcutsModal() {
    var body = '<div class="shortcuts-grid">' +
        shortcutRow('Focus search', 'Ctrl', 'K') +
        shortcutRow('Focus search', '/') +
        shortcutRow('Overview', 'Ctrl', '1') +
        shortcutRow('Organizations', 'Ctrl', '2') +
        shortcutRow('Templates', 'Ctrl', '3') +
        shortcutRow('Events', 'Ctrl', '4') +
        shortcutRow('Players', 'Ctrl', '5') +
        shortcutRow('Reports', 'Ctrl', '6') +
        shortcutRow('Draft', 'Ctrl', '7') +
        shortcutRow('Analytics', 'Ctrl', '8') +
        shortcutRow('Ops Dashboard', 'Ctrl', '9') +
        shortcutRow('Close modal', 'Esc') +
        shortcutRow('Print dashboard', 'Ctrl', 'P') +
        shortcutRow('Show shortcuts', '') +
    '</div>';
    openModal('Keyboard Shortcuts', body, '<button class="btn btn-primary" onclick="closeModal()">Got it</button>');
    _shortcutsVisible = true;
}

function shortcutRow(label, key1, key2) {
    var keys = '<kbd class="kbd">' + key1 + '</kbd>';
    if (key2) keys += ' + <kbd class="kbd">' + key2 + '</kbd>';
    return '<div class="shortcut-item"><span class="shortcut-label">' + label + '</span><span class="shortcut-keys">' + keys + '</span></div>';
}

var _shortcutSections = ['overview', 'organizations', 'templates', 'events', 'players', 'reports', 'draft', 'analytics', 'ops-overview'];

document.addEventListener('keydown', function(e) {
    // Don't trigger if typing in an input/textarea
    var tag = (e.target.tagName || '').toLowerCase();
    var isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

    // Escape — close modal
    if (e.key === 'Escape') {
        var overlay = document.getElementById('modal-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            closeModal();
            _shortcutsVisible = false;
            e.preventDefault();
            return;
        }
    }

    // Ctrl+K — focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        var searchInput = document.getElementById('global-search-input');
        if (searchInput) searchInput.focus();
        return;
    }

    // Ctrl+1 through Ctrl+9 — navigate tabs
    if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        var idx = parseInt(e.key) - 1;
        if (idx < _shortcutSections.length) {
            e.preventDefault();
            navigateTo(_shortcutSections[idx]);
        }
        return;
    }

    // Only non-input shortcuts below
    if (isInput) return;

    // / — focus search
    if (e.key === '/') {
        e.preventDefault();
        var si = document.getElementById('global-search-input');
        if (si) si.focus();
        return;
    }

    // ? — show shortcuts
    if (e.key === '' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        showShortcutsModal();
        return;
    }
});

// ===================================================================
// FEATURE: INJECT HELP TOOLTIPS & SORT/INLINE-EDIT ON SECTION LOAD
// ===================================================================
var _origNavigateTo = navigateTo;
navigateTo = function(section) {
    _origNavigateTo(section);
    // Inject help tooltips
    setTimeout(function() {
        injectHelpTooltips(section);
        injectSortingAndEditing(section);
    }, 200);
};

function injectHelpTooltips(section) {
    var mappings = {
        'intel-health': [
            { selector: '#section-intel-health .card-header h3', text: _helpTexts['health-score'], match: 'Health Score' },
            { selector: '#section-intel-health .card-header h3', text: _helpTexts['iysl-benchmarks'], match: 'Benchmarks' }
        ],
        'intel-competition': [
            { selector: '#section-intel-competition .section-toolbar h2', text: _helpTexts['competition'] }
        ],
        'intel-compliance': [
            { selector: '#section-intel-compliance .section-toolbar h2', text: _helpTexts['compliance'] }
        ],
        'ops-attendance': [
            { selector: '#section-ops-attendance .section-toolbar h2', text: _helpTexts['attendance'] }
        ],
        'ops-ai': [
            { selector: '#section-ops-ai .section-toolbar h2', text: _helpTexts['ai-assistant'] }
        ],
        'intel-development': [
            { selector: '#section-intel-development .section-toolbar h2', text: _helpTexts['development'] }
        ],
        'draft': [
            { selector: '#section-draft .section-toolbar h2', text: _helpTexts['draft'] }
        ]
    };

    var defs = mappings[section];
    if (!defs) return;
    defs.forEach(function(def) {
        var els = document.querySelectorAll(def.selector);
        els.forEach(function(el) {
            if (el.querySelector('.help-tooltip-trigger')) return; // already added
            if (def.match && el.textContent.indexOf(def.match) === -1) return;
            el.insertAdjacentHTML('beforeend', ' ' + helpTooltip(def.text));
        });
    });
}

function injectSortingAndEditing(section) {
    // Enable sorting on key tables
    if (section === 'players') {
        enableTableSorting('players-table', [0, 6]); // exclude # and Actions
        enableInlineEdit('players-table-body',
            [{ index: 1, field: 'name' }, { index: 2, field: 'age_group' }, { index: 3, field: 'position' }],
            function(tr, field, newVal) {
                var playerId = tr.getAttribute('data-id');
                if (!playerId) { toast('Cannot update: missing player ID', 'error'); return; }
                var orgId = getSelectedOrg();
                if (!orgId) return;
                var body = {};
                if (field === 'name') {
                    var parts = newVal.split(' ');
                    body.first_name = parts[0] || '';
                    body.last_name = parts.slice(1).join(' ') || '';
                } else {
                    body[field] = newVal;
                }
                api('PATCH', '/api/organizations/' + orgId + '/players/' + playerId, body)
                    .then(function() { toast('Player updated'); })
                    .catch(function(e) { toast('Update failed: ' + e.message, 'error'); });
            }
        );
    }
    if (section === 'ops-teams') {
        enableTableSorting('ops-teams-table', [5]); // exclude Actions
        enableInlineEdit('ops-teams-table-body',
            [{ index: 0, field: 'name' }],
            function(tr, field, newVal) {
                var teamId = tr.getAttribute('data-id');
                if (!teamId) { toast('Cannot update: missing team ID', 'error'); return; }
                var orgId = getSelectedOrg();
                if (!orgId) return;
                api('PATCH', '/api/organizations/' + orgId + '/teams/' + teamId, { name: newVal })
                    .then(function() { toast('Team updated'); })
                    .catch(function(e) { toast('Update failed: ' + e.message, 'error'); });
            }
        );
    }
    if (section === 'ops-schedule') enableTableSorting('schedule-table', [6]);
    if (section === 'intel-competition') enableTableSorting('standings-table');
    if (section === 'ops-attendance') enableTableSorting('attendance-table');
    if (section === 'events') enableTableSorting('events-table', [5]);
    if (section === 'organizations') enableTableSorting('orgs-table', [6]);
    if (section === 'templates') enableTableSorting('templates-table', [5]);
}

// ===================================================================
// TIME AGO HELPER
// ===================================================================
function formatTimeAgo(isoStr) {
    if (!isoStr) return '';
    var then = new Date(isoStr);
    var now = new Date();
    var diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return then.toLocaleDateString();
}

// ===================================================================
// PLAYER DETAIL MODAL
// ===================================================================
async function showPlayerDetail(playerId) {
    var orgId = getSelectedOrg();
    if (!orgId || !playerId) return;

    openModal('Player Details', '<div style="text-align:center;padding:24px;"><div class="spinner" style="width:32px;height:32px;margin:0 auto;"></div><p class="text-muted">Loading player data...</p></div>', '');

    try {
        var results = await Promise.allSettled([
            api('GET', '/api/players/' + playerId),
            api('GET', '/api/players/' + playerId + '/development-path').catch(function() { return null; }),
            api('GET', '/api/players/' + playerId + '/documents').catch(function() { return []; }),
            api('GET', '/api/organizations/' + orgId + '/teams').catch(function() { return []; }),
        ]);

        var player = results[0].status === 'fulfilled' ? results[0].value : null;
        var devPath = results[1].status === 'fulfilled' ? results[1].value : null;
        var docs = results[2].status === 'fulfilled' ? results[2].value : [];
        var allTeams = results[3].status === 'fulfilled' ? results[3].value : [];

        if (!player) { toast('Player not found', 'error'); closeModal(); return; }

        // Find team assignment
        var teamName = '--';
        if (Array.isArray(allTeams)) {
            allTeams.forEach(function(t) {
                if (t.roster && Array.isArray(t.roster)) {
                    t.roster.forEach(function(r) {
                        if (r.player_id === playerId) teamName = t.name;
                    });
                }
            });
        }

        // Player initials or photo
        var initials = ((player.first_name || '')[0] || '') + ((player.last_name || '')[0] || '');
        var avatarHtml = player.photo_url
            ? '<img src="' + esc(player.photo_url) + '" style="width:72px;height:72px;border-radius:50%;object-fit:cover;" alt="' + esc(player.first_name) + '">'
            : '<div style="width:72px;height:72px;border-radius:50%;background:#09A1A1;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;">' + esc(initials) + '</div>';

        // Height display
        var heightStr = '--';
        if (player.height_inches) {
            var ft = Math.floor(player.height_inches / 12);
            var inches = player.height_inches % 12;
            heightStr = ft + "'" + inches + '"';
        }

        // Evaluation history from reports
        var evalHtml = '<p class="text-muted">No evaluation history.</p>';
        try {
            var reports = await api('GET', '/api/players/' + playerId + '/progress').catch(function() { return []; });
            if (Array.isArray(reports) && reports.length > 0) {
                evalHtml = '<table class="data-table" style="min-width:auto;"><thead><tr><th>Event</th><th>Score</th><th>Rank</th></tr></thead><tbody>';
                reports.forEach(function(r) {
                    evalHtml += '<tr><td style="font-size:12px;">' + (r.event_name || '--') + '</td><td>' + (r.overall_score != null ? r.overall_score.toFixed(2) : '--') + '</td><td>' + (r.rank || '--') + '</td></tr>';
                });
                evalHtml += '</tbody></table>';
            }
        } catch (_) {}

        // Development path
        var devHtml = '<p class="text-muted">No development path.</p>';
        if (devPath && devPath.current_level) {
            devHtml = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
                '<span style="font-weight:600;">Current Level:</span> <span class="badge badge-active">' + esc(devPath.current_level) + '</span>';
            if (devPath.predicted_next_level) {
                devHtml += ' <i data-lucide="arrow-right" style="width:14px;height:14px;"></i> <span class="badge badge-draft">' + esc(devPath.predicted_next_level) + '</span>';
            }
            devHtml += '</div>';
            if (devPath.ai_prediction) {
                devHtml += '<p style="font-size:12px;color:#666;">' + esc(devPath.ai_prediction).substring(0, 200) + '</p>';
            }
        }

        // Documents status
        var docHtml = '<p class="text-muted">No documents.</p>';
        var docTypes = ['waiver', 'medical', 'birth_cert', 'photo_id'];
        if (Array.isArray(docs) && docs.length > 0) {
            docHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
            docTypes.forEach(function(dt) {
                var found = docs.find(function(d) { return d.document_type === dt; });
                var color = found ? (found.verified ? '#0a7a6e' : '#e8b06e') : '#dc3545';
                var icon = found ? (found.verified ? 'check-circle' : 'clock') : 'x-circle';
                var label = dt.replace(/_/g, ' ');
                docHtml += '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:4px;font-size:11px;background:#f8f9fa;border:1px solid #e0e0e0;">' +
                    '<i data-lucide="' + icon + '" style="width:12px;height:12px;color:' + color + ';"></i> ' + label + '</span>';
            });
            docHtml += '</div>';
        }

        var html = '<div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;">' +
            // Left column: avatar + bio
            '<div style="text-align:center;min-width:120px;">' +
                avatarHtml +
                '<h3 style="margin:12px 0 4px;font-size:18px;">' + esc(player.first_name + ' ' + player.last_name) + '</h3>' +
                '<div style="color:#6c757d;font-size:13px;">' + esc(player.position || 'No position') + ' &middot; ' + esc(player.age_group || '--') + '</div>' +
                '<div style="margin-top:6px;"><span class="badge badge-' + (player.active ? 'yes' : 'no') + '">' + (player.active ? 'Active' : 'Inactive') + '</span></div>' +
            '</div>' +
            // Right column: details
            '<div style="flex:1;min-width:260px;">' +
                // Bio details
                '<div class="card" style="margin-bottom:12px;"><div class="card-body" style="padding:12px;">' +
                '<h4 style="margin:0 0 8px;font-size:14px;"><i data-lucide="info" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px;"></i> Bio</h4>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:13px;">' +
                    '<div><span style="color:#888;">Height:</span> ' + heightStr + '</div>' +
                    '<div><span style="color:#888;">Weight:</span> ' + (player.weight_lbs ? player.weight_lbs + ' lbs' : '--') + '</div>' +
                    '<div><span style="color:#888;">Foot:</span> ' + esc(player.dominant_foot || '--') + '</div>' +
                    '<div><span style="color:#888;">DOB:</span> ' + esc(player.date_of_birth || '--') + '</div>' +
                    '<div><span style="color:#888;">Jersey:</span> #' + (player.jersey_number || '--') + '</div>' +
                    '<div><span style="color:#888;">Team:</span> ' + esc(teamName) + '</div>' +
                '</div></div></div>' +
                // Parent contact
                '<div class="card" style="margin-bottom:12px;"><div class="card-body" style="padding:12px;">' +
                '<h4 style="margin:0 0 8px;font-size:14px;"><i data-lucide="phone" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px;"></i> Parent Contact</h4>' +
                '<div style="font-size:13px;">' +
                    '<div>' + esc(player.parent_name || '--') + '</div>' +
                    '<div style="color:#09A1A1;">' + esc(player.parent_email || '--') + '</div>' +
                    '<div>' + esc(player.parent_phone || '--') + '</div>' +
                '</div></div></div>' +
                // Evaluation history
                '<div class="card" style="margin-bottom:12px;"><div class="card-body" style="padding:12px;">' +
                '<h4 style="margin:0 0 8px;font-size:14px;"><i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px;"></i> Evaluation History</h4>' +
                evalHtml + '</div></div>' +
                // Development path
                '<div class="card" style="margin-bottom:12px;"><div class="card-body" style="padding:12px;">' +
                '<h4 style="margin:0 0 8px;font-size:14px;"><i data-lucide="trending-up" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px;"></i> Development Path</h4>' +
                devHtml + '</div></div>' +
                // Documents
                '<div class="card" style="margin-bottom:0;"><div class="card-body" style="padding:12px;">' +
                '<h4 style="margin:0 0 8px;font-size:14px;"><i data-lucide="folder-open" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px;"></i> Documents</h4>' +
                docHtml + '</div></div>' +
            '</div>' +
        '</div>';

        document.getElementById('modal-body').innerHTML = html;
        document.getElementById('modal-title').textContent = 'Player Card';
        document.getElementById('modal-footer').innerHTML = '<button class="btn btn-outline" onclick="closeModal()">Close</button>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        toast('Error loading player details: ' + (e.message || e), 'error');
        closeModal();
    }
}

// ===================================================================
// SEASON COMPARISON ANALYTICS
// ===================================================================
async function loadSeasonComparison(orgId) {
    var el = document.getElementById('season-comparison-body');
    if (!el) return;
    var s1 = document.getElementById('season-compare-1');
    var s2 = document.getElementById('season-compare-2');
    if (!s1 || !s2 || !s1.value || !s2.value) {
        el.innerHTML = '<p class="text-muted">Select two seasons to compare.</p>';
        return;
    }

    el.innerHTML = '<div style="text-align:center;padding:16px;"><div class="spinner" style="width:24px;height:24px;margin:0 auto;"></div></div>';

    try {
        var data = await api('GET', '/api/organizations/' + orgId + '/analytics/season-comparison?season1=' + encodeURIComponent(s1.value) + '&season2=' + encodeURIComponent(s2.value));

        function changeColor(val) {
            if (!val) return '#666';
            return val.startsWith('+') && val !== '+0' && val !== '+0%' && val !== '+0.0%' ? '#0a7a6e' : (val.startsWith('-') ? '#dc3545' : '#666');
        }

        function changeBadge(val) {
            var color = changeColor(val);
            var bg = color === '#0a7a6e' ? '#e6f7f5' : (color === '#dc3545' ? '#fef2f2' : '#f0f0f0');
            return '<span style="font-weight:700;color:' + color + ';background:' + bg + ';padding:2px 8px;border-radius:12px;font-size:12px;">' + esc(val) + '</span>';
        }

        var metrics = [
            {label: 'Players', k: 'total_players', change: data.changes.players},
            {label: 'Teams', k: 'total_teams', change: data.changes.teams},
            {label: 'Avg Score', k: 'avg_score', change: data.changes.avg_score},
            {label: 'Retention', k: 'retention_rate', change: data.changes.retention, suffix: '%'},
        ];

        var html = '<table class="data-table" style="min-width:auto;">' +
            '<thead><tr><th>Metric</th><th>' + esc(data.season1.name) + '</th><th>' + esc(data.season2.name) + '</th><th>Change</th></tr></thead><tbody>';
        metrics.forEach(function(m) {
            var v1 = data.season1[m.k];
            var v2 = data.season2[m.k];
            var suffix = m.suffix || '';
            html += '<tr><td style="font-weight:600;">' + m.label + '</td><td>' + v1 + suffix + '</td><td>' + v2 + suffix + '</td><td>' + changeBadge(m.change) + '</td></tr>';
        });
        // Match record row
        var mr1 = data.season1.match_record;
        var mr2 = data.season2.match_record;
        html += '<tr><td style="font-weight:600;">Match Record</td><td>' + mr1.wins + 'W-' + mr1.draws + 'D-' + mr1.losses + 'L</td><td>' + mr2.wins + 'W-' + mr2.draws + 'D-' + mr2.losses + 'L</td><td>--</td></tr>';
        html += '</tbody></table>';

        el.innerHTML = html;
    } catch (e) {
        el.innerHTML = '<p class="text-muted">Error: ' + esc(e.message || String(e)) + '</p>';
    }
}

// ===================================================================
// MOBILE SIDEBAR OVERLAY CLOSE
// ===================================================================
document.addEventListener('click', function(e) {
    var sidebar = document.getElementById('sidebar');
    var menuBtn = document.getElementById('menu-toggle');
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
        sidebar.classList.remove('open');
    }
});

// ===================================================================
// FOCUS TRAP FOR MODALS (Accessibility)
// ===================================================================
document.getElementById('modal-overlay').addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;
    var modal = document.getElementById('modal');
    var focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
});

// ===================================================================
// TIER 2: TRAINING PROGRAMS
// ===================================================================
async function loadPrograms(orgId) {
    if (!orgId) { document.getElementById('programs-table-body').innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">Select an organization</td></tr>'; return; }
    try {
        var programs = await api('GET', '/api/organizations/' + orgId + '/programs');
        var stats = document.getElementById('programs-stats');
        var total = programs.length;
        var active = programs.filter(function(p) { return p.status === 'active'; }).length;
        var aiGen = programs.filter(function(p) { return p.ai_generated; }).length;
        var drafts = programs.filter(function(p) { return p.status === 'draft'; }).length;
        stats.innerHTML =
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#09A1A1;">' + total + '</div><div style="font-size:12px;color:#888;">Total Programs</div></div>' +
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#2d8a5e;">' + active + '</div><div style="font-size:12px;color:#888;">Active</div></div>' +
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#5484A4;">' + aiGen + '</div><div style="font-size:12px;color:#888;">AI Generated</div></div>' +
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#e8b06e;">' + drafts + '</div><div style="font-size:12px;color:#888;">Drafts</div></div>';
        var tbody = document.getElementById('programs-table-body');
        if (!programs.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">No programs yet</td></tr>'; return; }
        tbody.innerHTML = programs.map(function(p) {
            var statusColor = p.status === 'active' ? '#2d8a5e' : p.status === 'completed' ? '#5484A4' : '#e8b06e';
            return '<tr>' +
                '<td><strong>' + (p.template_name || 'Untitled') + '</strong></td>' +
                '<td>' + (p.sport || '-') + '</td>' +
                '<td>' + (p.phase_name || '-') + '</td>' +
                '<td>' + (p.duration_weeks || '-') + '</td>' +
                '<td>' + (p.player_id ? '<span style="color:#09A1A1;">Assigned</span>' : '<span style="color:#888;">Template</span>') + '</td>' +
                '<td><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:' + statusColor + '22;color:' + statusColor + ';">' + (p.status || 'draft') + '</span></td>' +
                '<td>' + (p.ai_generated ? '<i data-lucide="sparkles" style="width:14px;height:14px;color:#09A1A1;"></i>' : '-') + '</td>' +
                '<td><button class="btn btn-sm btn-outline" onclick="viewProgram(\'' + p.id + '\')">View</button> <button class="btn btn-sm btn-outline" style="color:#FA6E82;border-color:#FA6E82;" onclick="deleteProgram(\'' + p.id + '\')">Delete</button></td>' +
                '</tr>';
        }).join('');
    } catch(e) { console.error('Load programs error:', e); }
}

function showCreateProgramModal() {
    var orgId = getSelectedOrg();
    if (!orgId) { toast('Select an organization first', 'warning'); return; }
    openModal('Create Training Program',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-weight:600;font-size:13px;">Program Name</label><input type="text" id="prog-name" class="form-input" placeholder="e.g. Pre-Season Strength"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Sport</label><input type="text" id="prog-sport" class="form-input" value="soccer"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Phase</label><select id="prog-phase" class="form-select"><option>Off-Season</option><option>Pre-Season</option><option>In-Season</option><option>Post-Season</option></select></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Duration (weeks)</label><input type="number" id="prog-weeks" class="form-input" value="4"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Created By</label><input type="text" id="prog-creator" class="form-input" placeholder="Coach name"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Status</label><select id="prog-status" class="form-select"><option value="draft">Draft</option><option value="active">Active</option></select></div>' +
        '</div>' +
        '<div style="margin-top:12px;"><label style="font-weight:600;font-size:13px;">Notes</label><textarea id="prog-notes" class="form-input" style="width:100%;height:60px;" placeholder="Optional notes"></textarea></div>',
        '<button class="btn btn-primary" onclick="createProgram()">Create Program</button>'
    );
}

async function createProgram() {
    var orgId = getSelectedOrg();
    try {
        await api('POST', '/api/organizations/' + orgId + '/programs', {
            template_name: document.getElementById('prog-name').value,
            sport: document.getElementById('prog-sport').value,
            phase_name: document.getElementById('prog-phase').value,
            duration_weeks: parseInt(document.getElementById('prog-weeks').value) || 4,
            created_by: document.getElementById('prog-creator').value,
            status: document.getElementById('prog-status').value,
            notes: document.getElementById('prog-notes').value,
        });
        closeModal(); toast('Program created!'); loadPrograms(orgId);
    } catch(e) { toast('Error: ' + e.message, 'error'); }
}

function showAIGenerateProgramModal() {
    var orgId = getSelectedOrg();
    if (!orgId) { toast('Select an organization first', 'warning'); return; }
    openModal('AI Generate Program',
        '<p style="margin-bottom:12px;color:#666;">Create a program first, then use AI to generate the weekly plan. Optionally assign a player so AI can tailor exercises to their evaluation data.</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-weight:600;font-size:13px;">Program Name</label><input type="text" id="aiprog-name" class="form-input" value="AI Training Plan"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Sport</label><input type="text" id="aiprog-sport" class="form-input" value="soccer"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Phase</label><select id="aiprog-phase" class="form-select"><option>Pre-Season</option><option>Off-Season</option><option>In-Season</option></select></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Weeks</label><input type="number" id="aiprog-weeks" class="form-input" value="4"></div>' +
        '</div>',
        '<button class="btn btn-primary" onclick="aiGenerateProgram()"><i data-lucide="sparkles" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px;"></i> Generate with AI</button>'
    );
}

async function aiGenerateProgram() {
    var orgId = getSelectedOrg();
    showLoading();
    try {
        var prog = await api('POST', '/api/organizations/' + orgId + '/programs', {
            template_name: document.getElementById('aiprog-name').value,
            sport: document.getElementById('aiprog-sport').value,
            phase_name: document.getElementById('aiprog-phase').value,
            duration_weeks: parseInt(document.getElementById('aiprog-weeks').value) || 4,
            status: 'draft',
        });
        var result = await api('POST', '/api/programs/' + prog.id + '/ai-generate');
        closeModal(); hideLoading(); toast('AI program generated with ' + (result.weeks ? result.weeks.length : 0) + ' weeks!');
        loadPrograms(orgId);
    } catch(e) { hideLoading(); toast('AI generation error: ' + e.message, 'error'); }
}

async function viewProgram(progId) {
    try {
        var p = await api('GET', '/api/programs/' + progId);
        var html = '<div class="card" style="margin-bottom:12px;"><div class="card-header"><h3>' + (p.template_name || 'Program') + ' — ' + (p.phase_name || '') + ' (' + (p.duration_weeks || 0) + ' weeks)</h3></div><div class="card-body">';
        if (p.weeks && p.weeks.length) {
            p.weeks.forEach(function(w) {
                html += '<div style="margin-bottom:16px;padding:12px;background:#f8f9fa;border-radius:8px;border-left:4px solid #09A1A1;">';
                html += '<h4 style="margin:0 0 8px;color:#333;">Week ' + w.week_number + ': ' + (w.focus || 'General') + '</h4>';
                if (w.notes) html += '<p style="color:#666;font-size:13px;margin:0 0 8px;">' + w.notes + '</p>';
                if (w.sessions && w.sessions.length) {
                    w.sessions.forEach(function(s) {
                        html += '<div style="margin:8px 0;padding:8px 12px;background:#fff;border-radius:6px;border:1px solid #e8ecf0;">';
                        html += '<strong style="color:#5484A4;">' + (s.day_of_week || 'TBD') + '</strong> — <span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#09A1A122;color:#09A1A1;">' + (s.session_type || 'general') + '</span>';
                        if (s.exercises && s.exercises.length) {
                            html += '<ul style="margin:4px 0 0 16px;font-size:13px;">';
                            s.exercises.forEach(function(ex) {
                                html += '<li><strong>' + (ex.name || 'Exercise') + '</strong>';
                                if (ex.sets) html += ' — ' + ex.sets + ' x ' + (ex.reps || '');
                                if (ex.intensity) html += ' @ ' + ex.intensity;
                                if (ex.notes) html += ' <span style="color:#888;">(' + ex.notes + ')</span>';
                                html += '</li>';
                            });
                            html += '</ul>';
                        }
                        html += '</div>';
                    });
                }
                html += '</div>';
            });
        } else {
            html += '<p style="color:#888;">No weeks defined. Use AI Generate to create a training plan.</p>';
        }
        html += '</div></div>';
        document.getElementById('program-detail-panel').innerHTML = html;
        document.getElementById('program-detail-panel').style.display = 'block';
    } catch(e) { toast('Error loading program: ' + e.message, 'error'); }
}

async function deleteProgram(progId) {
    if (!confirm('Delete this program?')) return;
    try { await api('DELETE', '/api/programs/' + progId); toast('Deleted'); loadPrograms(getSelectedOrg()); } catch(e) { toast(e.message, 'error'); }
}

// ===================================================================
// TIER 2: MESSAGES
// ===================================================================
var _currentThreadId = null;

async function loadMessages(orgId) {
    if (!orgId) { document.getElementById('threads-list').innerHTML = '<p style="text-align:center;color:#888;padding:20px;">Select an organization</p>'; return; }
    try {
        var filterType = document.getElementById('msg-filter-type') ? document.getElementById('msg-filter-type').value : '';
        var url = '/api/organizations/' + orgId + '/threads';
        if (filterType) url += '?thread_type=' + filterType;
        var threads = await api('GET', url);
        var list = document.getElementById('threads-list');
        if (!threads.length) { list.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">No threads yet</p>'; return; }
        list.innerHTML = threads.map(function(t) {
            var typeColors = {direct:'#09A1A1',team:'#5484A4',announcement:'#FA6E82'};
            var color = typeColors[t.thread_type] || '#888';
            var active = _currentThreadId === t.id ? 'background:#e6f7f7;' : '';
            return '<div onclick="openThread(\'' + t.id + '\',\'' + (t.title||'Thread').replace(/'/g,'\\\'') + '\')" style="padding:12px;border-bottom:1px solid #f0f0f0;cursor:pointer;' + active + '">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<strong style="font-size:14px;">' + (t.title || 'Untitled') + '</strong>' +
                '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:' + color + '22;color:' + color + ';font-weight:600;">' + (t.thread_type || 'direct') + '</span>' +
                '</div>' +
                '<div style="font-size:12px;color:#888;margin-top:4px;">' + (t.participants ? t.participants.length : 0) + ' participants' +
                (t.last_message_at ? ' · ' + new Date(t.last_message_at).toLocaleDateString() : '') + '</div>' +
                '</div>';
        }).join('');
    } catch(e) { console.error('Load threads error:', e); }
}

async function openThread(threadId, title) {
    _currentThreadId = threadId;
    document.getElementById('msg-thread-title').textContent = title;
    document.getElementById('msg-compose').style.display = 'block';
    try {
        var msgs = await api('GET', '/api/threads/' + threadId + '/messages');
        var list = document.getElementById('messages-list');
        if (!msgs.length) { list.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">No messages yet. Start the conversation!</p>'; return; }
        list.innerHTML = msgs.map(function(m) {
            var roleColors = {admin:'#09A1A1',coach:'#5484A4',parent:'#FA6E82'};
            var color = roleColors[m.sender_role] || '#888';
            return '<div style="margin:8px 0;padding:10px 14px;background:#f8f9fa;border-radius:10px;border-left:3px solid ' + color + ';">' +
                '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
                '<strong style="color:' + color + ';">' + (m.sender_name || 'Unknown') + '</strong>' +
                '<span style="font-size:11px;color:#aaa;">' + (m.created_at ? new Date(m.created_at).toLocaleString() : '') + '</span>' +
                '</div>' +
                '<div style="font-size:14px;color:#333;">' + (m.content || '').replace(/</g,'&lt;') + '</div>' +
                '</div>';
        }).join('');
        list.scrollTop = list.scrollHeight;
    } catch(e) { toast('Error loading messages: ' + e.message, 'error'); }
    loadMessages(getSelectedOrg());
}

async function sendMessage() {
    if (!_currentThreadId) return;
    var content = document.getElementById('msg-content').value.trim();
    if (!content) return;
    try {
        await api('POST', '/api/threads/' + _currentThreadId + '/messages', {
            sender_name: document.getElementById('msg-sender-name').value || 'Admin',
            sender_role: 'admin',
            content: content,
        });
        document.getElementById('msg-content').value = '';
        openThread(_currentThreadId, document.getElementById('msg-thread-title').textContent);
    } catch(e) { toast(e.message, 'error'); }
}

function showCreateThreadModal() {
    var orgId = getSelectedOrg();
    if (!orgId) { toast('Select an organization first', 'warning'); return; }
    openModal('Create Thread',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-weight:600;font-size:13px;">Title</label><input type="text" id="thread-title" class="form-input" placeholder="Thread title"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Type</label><select id="thread-type" class="form-select"><option value="direct">Direct</option><option value="team">Team</option><option value="announcement">Announcement</option></select></div>' +
        '</div>',
        '<button class="btn btn-primary" onclick="createThread()">Create Thread</button>'
    );
}

async function createThread() {
    var orgId = getSelectedOrg();
    try {
        await api('POST', '/api/organizations/' + orgId + '/threads', {
            title: document.getElementById('thread-title').value,
            thread_type: document.getElementById('thread-type').value,
            participants: [],
        });
        closeModal(); toast('Thread created!'); loadMessages(orgId);
    } catch(e) { toast(e.message, 'error'); }
}

// ===================================================================
// TIER 2: VIDEOS
// ===================================================================
async function loadVideos(orgId) {
    if (!orgId) return;
    try {
        var players = await cachedApi('GET', '/api/organizations/' + orgId + '/players', null, 60000);
        var sel = document.getElementById('video-player-select');
        sel.innerHTML = '<option value="">-- Select Player --</option>';
        players.forEach(function(p) {
            sel.innerHTML += '<option value="' + p.id + '">' + p.first_name + ' ' + p.last_name + '</option>';
        });
    } catch(e) { console.error('Load video players:', e); }
}

async function loadVideosForPlayer(playerId) {
    var grid = document.getElementById('videos-grid');
    var empty = document.getElementById('video-empty');
    if (!playerId) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    try {
        var videos = await api('GET', '/api/players/' + playerId + '/videos');
        if (!videos.length) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#888;">No videos uploaded yet</div>'; return; }
        grid.innerHTML = videos.map(function(v) {
            return '<div class="card" style="overflow:hidden;">' +
                '<div style="height:160px;background:#09A1A1;display:flex;align-items:center;justify-content:center;">' +
                (v.thumbnail_data ? '<img src="data:image/jpeg;base64,' + v.thumbnail_data + '" style="width:100%;height:100%;object-fit:cover;">' : '<i data-lucide="video" style="width:48px;height:48px;color:white;"></i>') +
                '</div>' +
                '<div style="padding:12px;">' +
                '<h4 style="margin:0 0 4px;font-size:14px;">' + (v.title || 'Untitled') + '</h4>' +
                '<div style="font-size:12px;color:#888;margin-bottom:8px;">' +
                (v.duration_seconds ? Math.round(v.duration_seconds) + 's' : '') +
                (v.tags && v.tags.length ? ' · ' + v.tags.join(', ') : '') +
                ' · ' + (v.created_at ? new Date(v.created_at).toLocaleDateString() : '') +
                '</div>' +
                (v.ai_analysis ? '<div style="padding:8px;background:#e6f7f7;border-radius:6px;font-size:12px;color:#333;max-height:80px;overflow:hidden;">' + v.ai_analysis.substring(0,150) + '...</div>' : '') +
                '<div style="margin-top:8px;display:flex;gap:6px;">' +
                '<button class="btn btn-sm btn-outline" onclick="analyzeVideo(\'' + v.id + '\')"><i data-lucide="sparkles" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:2px;"></i>AI Analyze</button>' +
                '<button class="btn btn-sm btn-outline" style="color:#FA6E82;border-color:#FA6E82;" onclick="deleteVideo(\'' + v.id + '\',\'' + (document.getElementById('video-player-select').value) + '\')">Delete</button>' +
                '</div></div></div>';
        }).join('');
    } catch(e) { toast('Error: ' + e.message, 'error'); }
}

function showUploadVideoModal() {
    var playerId = document.getElementById('video-player-select').value;
    if (!playerId) { toast('Select a player first', 'warning'); return; }
    openModal('Upload Video',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-weight:600;font-size:13px;">Title</label><input type="text" id="vid-title" class="form-input" placeholder="Video title"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Duration (seconds)</label><input type="number" id="vid-duration" class="form-input" placeholder="120"></div>' +
        '</div>' +
        '<div style="margin-top:12px;"><label style="font-weight:600;font-size:13px;">Description</label><textarea id="vid-desc" class="form-input" style="width:100%;height:60px;" placeholder="What does this video show?"></textarea></div>' +
        '<div style="margin-top:12px;"><label style="font-weight:600;font-size:13px;">Tags (comma separated)</label><input type="text" id="vid-tags" class="form-input" placeholder="e.g. shooting, dribbling, match"></div>' +
        '<div style="margin-top:12px;"><label style="font-weight:600;font-size:13px;">Video File (base64)</label><input type="file" id="vid-file" accept="video/*" class="form-input" onchange="handleVideoFile(this)"></div>' +
        '<input type="hidden" id="vid-data">',
        '<button class="btn btn-primary" onclick="uploadVideo()">Upload</button>'
    );
}

function handleVideoFile(input) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function(e) { document.getElementById('vid-data').value = e.target.result.split(',')[1]; };
        reader.readAsDataURL(input.files[0]);
    }
}

async function uploadVideo() {
    var playerId = document.getElementById('video-player-select').value;
    var tags = document.getElementById('vid-tags').value.split(',').map(function(t){return t.trim();}).filter(Boolean);
    try {
        await api('POST', '/api/players/' + playerId + '/videos', {
            title: document.getElementById('vid-title').value,
            description: document.getElementById('vid-desc').value,
            duration_seconds: parseFloat(document.getElementById('vid-duration').value) || null,
            tags: tags,
            video_data: document.getElementById('vid-data').value || null,
        });
        closeModal(); toast('Video uploaded!'); loadVideosForPlayer(playerId);
    } catch(e) { toast(e.message, 'error'); }
}

async function analyzeVideo(videoId) {
    showLoading();
    try {
        await api('POST', '/api/videos/' + videoId + '/ai-analyze');
        hideLoading(); toast('AI analysis complete!');
        loadVideosForPlayer(document.getElementById('video-player-select').value);
    } catch(e) { hideLoading(); toast(e.message, 'error'); }
}

async function deleteVideo(videoId, playerId) {
    if (!confirm('Delete this video?')) return;
    try { await api('DELETE', '/api/videos/' + videoId); toast('Deleted'); loadVideosForPlayer(playerId); } catch(e) { toast(e.message, 'error'); }
}

// ===================================================================
// TIER 2: AUTOMATIONS
// ===================================================================
async function loadAutomations(orgId) {
    if (!orgId) { document.getElementById('automations-table-body').innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">Select an organization</td></tr>'; return; }
    try {
        var rules = await api('GET', '/api/organizations/' + orgId + '/automations');
        var stats = document.getElementById('automations-stats');
        var total = rules.length;
        var enabled = rules.filter(function(r){return r.enabled;}).length;
        var totalRuns = rules.reduce(function(s,r){return s+(r.run_count||0);},0);
        stats.innerHTML =
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#09A1A1;">' + total + '</div><div style="font-size:12px;color:#888;">Total Rules</div></div>' +
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#2d8a5e;">' + enabled + '</div><div style="font-size:12px;color:#888;">Enabled</div></div>' +
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#5484A4;">' + totalRuns + '</div><div style="font-size:12px;color:#888;">Total Runs</div></div>' +
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#e8b06e;">' + (total-enabled) + '</div><div style="font-size:12px;color:#888;">Disabled</div></div>';
        var tbody = document.getElementById('automations-table-body');
        if (!rules.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">No automation rules</td></tr>'; return; }
        tbody.innerHTML = rules.map(function(r) {
            var triggerColors = {evaluation_complete:'#09A1A1',report_generated:'#5484A4',attendance_low:'#FA6E82',cert_expiring:'#e8b06e',payment_received:'#2d8a5e'};
            var tc = triggerColors[r.trigger_event] || '#888';
            return '<tr>' +
                '<td><strong>' + (r.name || 'Untitled') + '</strong></td>' +
                '<td><span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:' + tc + '22;color:' + tc + ';">' + (r.trigger_event || '-') + '</span></td>' +
                '<td>' + (r.actions ? r.actions.length : 0) + ' action(s)</td>' +
                '<td>' + (r.enabled ? '<span style="color:#2d8a5e;font-weight:600;">Yes</span>' : '<span style="color:#888;">No</span>') + '</td>' +
                '<td>' + (r.run_count || 0) + '</td>' +
                '<td>' + (r.last_run_at ? new Date(r.last_run_at).toLocaleDateString() : 'Never') + '</td>' +
                '<td><button class="btn btn-sm btn-outline" onclick="testAutomation(\'' + r.id + '\')">Test</button> <button class="btn btn-sm btn-outline" style="color:#FA6E82;border-color:#FA6E82;" onclick="deleteAutomation(\'' + r.id + '\')">Delete</button></td>' +
                '</tr>';
        }).join('');
    } catch(e) { console.error('Load automations error:', e); }
}

function showCreateAutomationModal() {
    var orgId = getSelectedOrg();
    if (!orgId) { toast('Select an organization first', 'warning'); return; }
    openModal('Create Automation Rule',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-weight:600;font-size:13px;">Rule Name</label><input type="text" id="auto-name" class="form-input" placeholder="e.g. Post-Eval Report Sender"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Trigger Event</label><select id="auto-trigger" class="form-select">' +
        '<option value="evaluation_complete">Evaluation Complete</option>' +
        '<option value="report_generated">Report Generated</option>' +
        '<option value="attendance_low">Attendance Low</option>' +
        '<option value="cert_expiring">Certification Expiring</option>' +
        '<option value="payment_received">Payment Received</option>' +
        '</select></div>' +
        '</div>' +
        '<div style="margin-top:12px;"><label style="font-weight:600;font-size:13px;">Action Type</label><select id="auto-action-type" class="form-select">' +
        '<option value="generate_reports">Generate Reports</option>' +
        '<option value="email_parents">Email Parents</option>' +
        '<option value="assign_program">Assign Program</option>' +
        '<option value="create_alert">Create Alert</option>' +
        '<option value="update_status">Update Status</option>' +
        '</select></div>' +
        '<div style="margin-top:12px;"><label style="font-weight:600;font-size:13px;">Action Message/Param</label><input type="text" id="auto-action-msg" class="form-input" placeholder="e.g. Reports ready for review"></div>',
        '<button class="btn btn-primary" onclick="createAutomation()">Create Rule</button>'
    );
}

async function createAutomation() {
    var orgId = getSelectedOrg();
    try {
        await api('POST', '/api/organizations/' + orgId + '/automations', {
            name: document.getElementById('auto-name').value,
            trigger_event: document.getElementById('auto-trigger').value,
            actions: [{type: document.getElementById('auto-action-type').value, params: {message: document.getElementById('auto-action-msg').value}}],
            enabled: true,
        });
        closeModal(); toast('Automation created!'); loadAutomations(orgId);
    } catch(e) { toast(e.message, 'error'); }
}

async function testAutomation(ruleId) {
    try {
        var result = await api('POST', '/api/automations/' + ruleId + '/test');
        openModal('Test Results — ' + result.rule_name,
            '<div style="padding:8px;"><p><strong>Trigger:</strong> ' + result.trigger_event + '</p><p><strong>Dry Run:</strong> Yes</p>' +
            '<h4 style="margin-top:12px;">Actions:</h4>' +
            (result.action_results || []).map(function(a) {
                return '<div style="padding:8px 12px;margin:4px 0;background:#f8f9fa;border-radius:6px;border-left:3px solid #09A1A1;"><strong>' + a.action_type + '</strong>: ' + a.message + '</div>';
            }).join('') +
            '</div>', '');
    } catch(e) { toast(e.message, 'error'); }
}

function showTriggerEventModal() {
    var orgId = getSelectedOrg();
    if (!orgId) { toast('Select an organization first', 'warning'); return; }
    openModal('Trigger Event',
        '<p style="color:#666;margin-bottom:12px;">Manually fire an event to test matching automation rules.</p>' +
        '<label style="font-weight:600;font-size:13px;">Event Name</label>' +
        '<select id="trigger-event" class="form-select">' +
        '<option value="evaluation_complete">evaluation_complete</option>' +
        '<option value="report_generated">report_generated</option>' +
        '<option value="attendance_low">attendance_low</option>' +
        '<option value="cert_expiring">cert_expiring</option>' +
        '<option value="payment_received">payment_received</option>' +
        '</select>',
        '<button class="btn btn-primary" onclick="triggerEvent()"><i data-lucide="zap" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px;"></i> Fire Event</button>'
    );
}

async function triggerEvent() {
    var orgId = getSelectedOrg();
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/automations/trigger', {
            event: document.getElementById('trigger-event').value,
        });
        closeModal();
        toast(result.rules_matched + ' rule(s) triggered!');
        loadAutomations(orgId);
    } catch(e) { toast(e.message, 'error'); }
}

async function deleteAutomation(ruleId) {
    if (!confirm('Delete this automation rule?')) return;
    try { await api('DELETE', '/api/automations/' + ruleId); toast('Deleted'); loadAutomations(getSelectedOrg()); } catch(e) { toast(e.message, 'error'); }
}

// ===================================================================
// TIER 2: BOOKINGS
// ===================================================================
async function loadBookings(orgId) {
    if (!orgId) return;
    try {
        var slots = await api('GET', '/api/organizations/' + orgId + '/bookings/available');
        var bookings = await api('GET', '/api/organizations/' + orgId + '/bookings');

        // Stats
        var stats = document.getElementById('bookings-stats');
        var totalSlots = slots.length;
        var totalBooked = bookings.length;
        var confirmed = bookings.filter(function(b){return b.status==='confirmed';}).length;
        var totalCapacity = slots.reduce(function(s,sl){return s+(sl.capacity||0);},0);
        stats.innerHTML =
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#09A1A1;">' + totalSlots + '</div><div style="font-size:12px;color:#888;">Active Slots</div></div>' +
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#2d8a5e;">' + totalBooked + '</div><div style="font-size:12px;color:#888;">Total Bookings</div></div>' +
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#5484A4;">' + confirmed + '</div><div style="font-size:12px;color:#888;">Confirmed</div></div>' +
            '<div class="stat-card" style="background:#fff;padding:16px;border-radius:10px;border:1px solid #e8ecf0;"><div style="font-size:24px;font-weight:700;color:#e8b06e;">' + totalCapacity + '</div><div style="font-size:12px;color:#888;">Total Capacity</div></div>';

        // Slots list
        var slotsList = document.getElementById('slots-list');
        if (!slots.length) { slotsList.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">No slots created yet</p>'; }
        else {
            slotsList.innerHTML = slots.map(function(s) {
                var pct = s.capacity ? Math.round((s.booked_count||0)/s.capacity*100) : 0;
                var barColor = pct > 80 ? '#FA6E82' : pct > 50 ? '#e8b06e' : '#09A1A1';
                return '<div style="padding:12px;border-bottom:1px solid #f0f0f0;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                    '<div><strong>' + s.title + '</strong><br><span style="font-size:12px;color:#888;">' + (s.slot_type||'') + ' · ' + (s.location||'') + (s.price ? ' · $' + s.price : '') + '</span></div>' +
                    '<div style="text-align:right;"><span style="font-size:18px;font-weight:700;color:' + barColor + ';">' + (s.booked_count||0) + '/' + (s.capacity||0) + '</span><br><span style="font-size:11px;color:#888;">' + (s.start_time ? new Date(s.start_time).toLocaleDateString() : '') + '</span></div>' +
                    '</div>' +
                    '<div style="margin-top:6px;height:4px;background:#f0f0f0;border-radius:2px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:2px;"></div></div>' +
                    '<div style="margin-top:6px;display:flex;gap:6px;">' +
                    '<button class="btn btn-sm btn-outline" style="color:#FA6E82;border-color:#FA6E82;" onclick="deleteSlot(\'' + s.id + '\')">Delete</button>' +
                    '</div></div>';
            }).join('');
        }

        // Bookings table
        var tbody = document.getElementById('bookings-table-body');
        if (!bookings.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;">No bookings yet</td></tr>'; }
        else {
            tbody.innerHTML = bookings.map(function(b) {
                var sc = b.status === 'confirmed' ? '#2d8a5e' : b.status === 'waitlisted' ? '#e8b06e' : '#FA6E82';
                return '<tr>' +
                    '<td>' + (b.parent_name || '-') + '</td>' +
                    '<td>' + (b.parent_email || '-') + '</td>' +
                    '<td><span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:' + sc + '22;color:' + sc + ';">' + b.status + '</span></td>' +
                    '<td>' + (b.booked_at ? new Date(b.booked_at).toLocaleDateString() : '-') + '</td>' +
                    '<td>' + (b.status !== 'cancelled' ? '<button class="btn btn-sm btn-outline" style="color:#FA6E82;border-color:#FA6E82;" onclick="cancelBooking(\'' + b.id + '\')">Cancel</button>' : '-') + '</td>' +
                    '</tr>';
            }).join('');
        }
    } catch(e) { console.error('Load bookings error:', e); }
}

function showCreateSlotModal() {
    var orgId = getSelectedOrg();
    if (!orgId) { toast('Select an organization first', 'warning'); return; }
    openModal('Create Bookable Slot',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-weight:600;font-size:13px;">Title</label><input type="text" id="slot-title" class="form-input" placeholder="e.g. Summer Camp Week 1"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Type</label><select id="slot-type" class="form-select"><option value="camp">Camp</option><option value="clinic">Clinic</option><option value="training">Training</option><option value="assessment">Assessment</option></select></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Capacity</label><input type="number" id="slot-capacity" class="form-input" value="20"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Price ($)</label><input type="number" id="slot-price" class="form-input" placeholder="0" step="0.01"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Start Time</label><input type="datetime-local" id="slot-start" class="form-input"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">End Time</label><input type="datetime-local" id="slot-end" class="form-input"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Location</label><input type="text" id="slot-location" class="form-input" placeholder="Field name"></div>' +
        '<div><label style="font-weight:600;font-size:13px;">Coach</label><input type="text" id="slot-coach" class="form-input" placeholder="Coach name"></div>' +
        '</div>' +
        '<div style="margin-top:12px;"><label style="font-weight:600;font-size:13px;">Description</label><textarea id="slot-desc" class="form-input" style="width:100%;height:60px;" placeholder="Slot description"></textarea></div>',
        '<button class="btn btn-primary" onclick="createSlot()">Create Slot</button>'
    );
}

async function createSlot() {
    var orgId = getSelectedOrg();
    try {
        await api('POST', '/api/organizations/' + orgId + '/bookings/slots', {
            title: document.getElementById('slot-title').value,
            slot_type: document.getElementById('slot-type').value,
            capacity: parseInt(document.getElementById('slot-capacity').value) || 20,
            price: parseFloat(document.getElementById('slot-price').value) || null,
            start_time: document.getElementById('slot-start').value || null,
            end_time: document.getElementById('slot-end').value || null,
            location: document.getElementById('slot-location').value,
            coach_name: document.getElementById('slot-coach').value,
            description: document.getElementById('slot-desc').value,
        });
        closeModal(); toast('Slot created!'); loadBookings(orgId);
    } catch(e) { toast(e.message, 'error'); }
}

async function deleteSlot(slotId) {
    if (!confirm('Delete this slot and all its bookings?')) return;
    try { await api('DELETE', '/api/bookings/slots/' + slotId); toast('Deleted'); loadBookings(getSelectedOrg()); } catch(e) { toast(e.message, 'error'); }
}

async function cancelBooking(bookingId) {
    if (!confirm('Cancel this booking?')) return;
    try { await api('POST', '/api/bookings/' + bookingId + '/cancel'); toast('Booking cancelled'); loadBookings(getSelectedOrg()); } catch(e) { toast(e.message, 'error'); }
}


// ===================================================================
// INIT
// ===================================================================
(async function init() {
    try {
        console.log('TBM Admin: Initializing...');
        await loadOrgSelector();
        console.log('TBM Admin: Org selector loaded');
        navigateTo('overview');
        console.log('TBM Admin: Navigated to overview');
        refreshBadges();
        console.log('TBM Admin: Init complete');
    } catch(e) {
        console.error('TBM Admin init error:', e);
        // Try basic init without badges
        try { navigateTo('overview'); } catch(e2) { console.error('Nav error:', e2); }
    }
})();


// Refresh Lucide icons after DOM updates
var _origSetInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set;
setInterval(function() { if (typeof lucide !== 'undefined') try { lucide.createIcons(); } catch(e){} }, 1000);


// Make stat cards clickable
document.addEventListener('click', function(e) {
    var card = e.target.closest('.stat-card');
    if (!card) return;
    var label = card.querySelector('.stat-label');
    if (!label) return;
    var text = label.textContent.trim();
    var navMap = {
        'Players': 'players', 'Teams': 'ops-teams', 'Fields': 'ops-fields',
        'Coaches': 'ops-coaches', 'Events This Week': 'ops-schedule',
        'Active Seasons': 'ops-seasons', 'Messages Sent': 'ops-comms',
        'Total Teams': 'ops-teams', 'With Coach': 'ops-coaches',
        'Need Coach': 'ops-coaches'
    };
    var section = navMap[text];
    if (section && typeof navigateTo === 'function') {
        navigateTo(section);
    }
});

// Add pointer cursor to all stat cards
setInterval(function() {
    document.querySelectorAll('.stat-card').forEach(function(c) {
        c.style.cursor = 'pointer';
    });
}, 2000);
