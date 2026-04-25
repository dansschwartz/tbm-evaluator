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

// ---- TOAST ----
function toast(message, type) {
    type = type || 'success';
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function() {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s';
        setTimeout(function() { el.remove(); }, 300);
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
    'ops-overview', 'ops-seasons', 'ops-teams', 'ops-fields', 'ops-schedule', 'ops-coaches', 'ops-comms', 'ops-attendance', 'ops-documents', 'ops-import', 'ops-ai'];

const SECTION_TITLES = {
    'overview': 'Overview', 'organizations': 'Organizations', 'templates': 'Templates',
    'events': 'Events', 'players': 'Players', 'reports': 'Reports', 'draft': 'Draft', 'analytics': 'Analytics',
    'ops-overview': 'Operations Dashboard', 'ops-seasons': 'Seasons & Programs', 'ops-teams': 'Teams',
    'ops-fields': 'Fields & Facilities', 'ops-schedule': 'Schedule', 'ops-coaches': 'Coaches & Staff',
    'ops-comms': 'Communications', 'ops-attendance': 'Attendance', 'ops-documents': 'Documents',
    'ops-import': 'PlayMetrics Import', 'ops-ai': 'AI Assistant',
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
    else if (section === 'ops-ai') { /* static, no load needed */ }
}

navItems.forEach(function(item) {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        navigateTo(this.getAttribute('data-section'));
        // close mobile menu
        document.getElementById('sidebar').classList.remove('open');
    });
});

// Mobile menu toggle
document.getElementById('menu-toggle').addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('open');
});

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
    // Reload current section
    var active = document.querySelector('.nav-item.active');
    if (active) navigateTo(active.getAttribute('data-section'));
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

    if (!orgId) {
        statsEl.innerHTML = buildStatCards([
            { value: '--', label: 'Players', cls: '' },
            { value: '--', label: 'Events', cls: 'steel' },
            { value: '--', label: 'Evaluations', cls: 'coral' },
        ]);
        eventsBody.innerHTML = '<p class="text-muted">Select an organization to view data.</p>';
        return;
    }

    try {
        var data = await api('GET', '/api/organizations/' + orgId + '/analytics');
        statsEl.innerHTML = buildStatCards([
            { value: data.total_players, label: 'Active Players', cls: '' },
            { value: data.total_events, label: 'Total Events', cls: 'steel' },
            { value: data.total_evaluations, label: 'Evaluations', cls: 'coral' },
        ]);

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
    } catch (e) {
        statsEl.innerHTML = '';
        eventsBody.innerHTML = '<p class="text-muted">Error loading data: ' + esc(e.message) + '</p>';
    }
}

function buildStatCards(items) {
    return items.map(function(item) {
        return '<div class="stat-card ' + item.cls + '">' +
            '<div class="stat-value">' + item.value + '</div>' +
            '<div class="stat-label">' + item.label + '</div>' +
            '</div>';
    }).join('');
}

// ===================================================================
// ORGANIZATIONS
// ===================================================================
async function loadOrganizations() {
    var tbody = document.getElementById('orgs-table-body');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Loading...</td></tr>';

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

    if (!data.name || !data.slug) {
        toast('Name and slug are required.', 'error');
        return;
    }

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

    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Loading...</td></tr>';

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

    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Loading...</td></tr>';

    try {
        cachedEvents = await api('GET', '/api/organizations/' + orgId + '/events');
        if (cachedEvents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No events yet.</td></tr>';
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

    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Loading...</td></tr>';

    try {
        var params = '';
        var activeFilter = document.getElementById('player-active-filter').value;
        var ageFilter = document.getElementById('player-age-filter').value;
        var query = [];
        if (activeFilter) query.push('active=' + activeFilter);
        if (ageFilter) query.push('age_group=' + encodeURIComponent(ageFilter));
        if (query.length) params = '?' + query.join('&');

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
        return '<tr>' +
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

    if (!data.first_name || !data.last_name) { toast('First and last name are required.', 'error'); return; }

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
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Loading...</td></tr>';

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
            (r.ai_summary ? '<div style="margin-bottom:12px"><strong>AI Summary:</strong><p style="margin-top:4px">' + esc(r.ai_summary) + '</p></div>' : '') +
            (r.ai_strengths && r.ai_strengths.length > 0 ? '<div style="margin-bottom:12px"><strong>Strengths:</strong><ul>' + r.ai_strengths.map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>' : '') +
            (r.ai_improvements && r.ai_improvements.length > 0 ? '<div style="margin-bottom:12px"><strong>Areas for Improvement:</strong><ul>' + r.ai_improvements.map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>' : '') +
            (r.ai_recommendation ? '<div style="margin-bottom:12px"><strong>Recommendation:</strong><p style="margin-top:4px">' + esc(r.ai_recommendation) + '</p></div>' : '') +
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
        document.getElementById('draft-available-body').innerHTML = '<p class="text-muted">Error: ' + esc(e.message) + '</p>';
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

            return '<h4 style="margin-top:16px">' + (t.team_color ? '<span class="team-color-dot" style="background:' + esc(t.team_color) + '"></span>' : '') + esc(t.team_name) + '</h4>' +
                '<table class="data-table"><thead><tr><th>#</th><th>Player</th><th>Position</th><th>Age Group</th><th>Score</th></tr></thead><tbody>' + rows + '</tbody></table>';
        }).join('');

        openModal('Draft Export',
            html + '<div style="margin-top:16px"><button class="btn btn-sm btn-outline" onclick="copyDraftExport()">Copy as Text</button></div>' +
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
        distEl.innerHTML = '<p class="text-muted">Error: ' + esc(e.message) + '</p>';
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
        distEl.innerHTML = '<p class="text-muted">Error: ' + esc(e.message) + '</p>';
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
                alertsHtml += '<div style="padding:8px 12px;margin-bottom:6px;border-left:4px solid ' + color + ';background:#f8f9fa;border-radius:4px;font-size:13px;">' +
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

        var tbody = document.getElementById('seasons-table-body');
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
        var tbody = document.getElementById('ops-teams-table-body');
        tbody.innerHTML = teams.map(function(t) {
            return '<tr><td>' + esc(t.name) + '</td><td>' + esc(t.team_level || '-') + '</td>' +
                '<td>' + esc(t.program_id ? 'Assigned' : '-') + '</td>' +
                '<td>' + esc(t.head_coach_id ? 'Assigned' : 'None') + '</td>' +
                '<td><button class="btn btn-sm btn-outline" onclick="viewRoster(\'' + t.id + '\')">View</button></td>' +
                '<td><button class="btn btn-sm btn-outline" onclick="deleteOpsItem(\'teams\',\'' + t.id + '\')">Delete</button></td></tr>';
        }).join('');
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    }
}

// --- Fields ---
var fieldCalendarWeekOffset = 0;

async function loadOpsFields(orgId) {
    if (!orgId) return;
    try {
        var fields = await api('GET', '/api/organizations/' + orgId + '/fields');
        var tbody = document.getElementById('fields-table-body');
        tbody.innerHTML = fields.map(function(f) {
            return '<tr><td>' + esc(f.name) + '</td><td>' + esc(f.location_address || '-') + '</td>' +
                '<td>' + esc(f.surface_type || '-') + '</td><td>' + esc(f.size || '-') + '</td>' +
                '<td>' + (f.has_lights ? 'Yes' : 'No') + '</td>' +
                '<td class="btn-group">' +
                    '<button class="btn btn-xs btn-outline" onclick="editFieldItem(\'' + f.id + '\')">Edit</button>' +
                    '<button class="btn btn-xs btn-danger" onclick="deleteOpsFieldItem(\'' + f.id + '\')">Delete</button>' +
                '</td></tr>';
        }).join('');

        loadFieldCalendar(orgId);
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    }
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
            '<label>Permitted Hours</label><input type="text" id="field-edit-hours" class="form-input" placeholder="e.g. 8:00-21:00" value="' + esc(f.permitted_hours || '') + '">',
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
        calBody.innerHTML = '<p class="text-muted">Error loading calendar: ' + esc(e.message) + '</p>';
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

        var tbody = document.getElementById('schedule-table-body');
        tbody.innerHTML = entries.map(function(e) {
            var dt = new Date(e.start_time);
            var typeColor = e.entry_type === 'game' ? 'badge-active' : e.entry_type === 'practice' ? 'badge-scoring' : 'badge-draft';
            return '<tr><td>' + dt.toLocaleDateString() + '</td><td>' + dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</td>' +
                '<td><span class="badge ' + typeColor + '">' + esc(e.entry_type) + '</span></td><td>' + esc(e.title || '-') + '</td>' +
                '<td>' + esc(e.field_name || '-') + '</td>' +
                '<td><span class="badge badge-' + (e.status === 'scheduled' ? 'active' : e.status === 'cancelled' ? 'no' : 'draft') + '">' + esc(e.status) + '</span></td>' +
                '<td><button class="btn btn-xs btn-danger" onclick="deleteOpsScheduleItem(\'' + e.id + '\')">Delete</button></td></tr>';
        }).join('');
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No schedule entries in the next 90 days.</td></tr>';
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
        var tbody = document.getElementById('coaches-table-body');
        tbody.innerHTML = coaches.map(function(c) {
            var certs = (c.certifications || []).map(function(cert) { return cert.name; }).join(', ') || 'None';
            var teams = (c.team_assignments || []).map(function(t) { return t.team_name; }).join(', ') || 'None';
            return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.email || '-') + '</td>' +
                '<td>' + esc(c.phone || '-') + '</td><td>' + esc(certs) + '</td>' +
                '<td>' + esc(c.background_check_status || '-') + '</td>' +
                '<td>' + esc(teams) + '</td>' +
                '<td><button class="btn btn-sm btn-outline" onclick="editCoachCerts(\'' + c.id + '\')">Edit Certs</button></td></tr>';
        }).join('');
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    }
}

// --- Communications ---
async function loadOpsComms(orgId) {
    if (!orgId) return;
    try {
        var msgs = await api('GET', '/api/organizations/' + orgId + '/messages');
        var tbody = document.getElementById('messages-table-body');
        // Show SMTP warning at top of table
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
    } catch (e) { toast('Error: ' + e.message, 'error'); }
}

document.getElementById('attendance-team-select').addEventListener('change', async function() {
    var teamId = this.value;
    var entrySelect = document.getElementById('attendance-entry-select');
    var orgId = getSelectedOrg();
    if (!teamId || !orgId) {
        entrySelect.innerHTML = '<option value="">-- Select Schedule Entry --</option>';
        return;
    }
    try {
        var entries = await api('GET', '/api/organizations/' + orgId + '/schedules?team_id=' + teamId);
        entrySelect.innerHTML = '<option value="">-- Select Schedule Entry --</option>' +
            entries.map(function(e) {
                var dt = e.start_time ? new Date(e.start_time).toLocaleDateString() : '';
                return '<option value="' + e.id + '">' + esc(e.title || e.entry_type) + ' — ' + dt + '</option>';
            }).join('');

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
        try {
            var missing = await api('GET', '/api/organizations/' + orgId + '/documents/missing');
            var missingBody = document.getElementById('docs-missing-body');
            if (missing.players && missing.players.length > 0) {
                var html = '<div style="max-height:300px;overflow-y:auto;">';
                missing.players.forEach(function(p) {
                    html += '<div style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;">' +
                        '<strong>' + esc(p.player_name) + '</strong>: missing ' +
                        '<span style="color:#e74c3c;">' + esc((p.missing_types || []).join(', ')) + '</span></div>';
                });
                html += '</div>';
                missingBody.innerHTML = html;
            } else {
                missingBody.innerHTML = '<p class="text-muted" style="color:#27ae60;">All players have required documents.</p>';
            }
        } catch (_) {
            document.getElementById('docs-missing-body').innerHTML = '<p class="text-muted">Could not check missing documents.</p>';
        }
    } catch (e) { toast('Error: ' + e.message, 'error'); }
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
        var seasons = await api('GET', '/api/organizations/' + orgId + '/seasons');
        var opts = seasons.map(function(s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
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
            '<label><input type="checkbox" id="field-lights"> Has Lights</label>',
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
                available_field_ids: fieldIds.length > 0 ? fieldIds : null,
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
            var templates = await api('GET', '/api/organizations/' + orgId + '/messages/templates');
            var html = '<p>Click a template to use it:</p>';
            templates.forEach(function(t) {
                html += '<div style="padding:10px;margin:8px 0;border:1px solid #ddd;border-radius:6px;cursor:pointer;" onclick="useMsgTemplate(\'' + btoa(unescape(encodeURIComponent(JSON.stringify(t)))) + '\')">' +
                    '<strong>' + esc(t.name) + '</strong><br><small style="color:#888;">' + esc(t.description || '') + '</small></div>';
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
            '<button class="btn btn-primary" onclick="aiDraftMessage()">Generate Draft</button>'
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
        var html = '<div style="padding:12px;background:#e8f5e9;border-radius:6px;margin-bottom:12px;">' +
            '<strong>Preview:</strong> ' + result.imported + ' new, ' + result.updated + ' updates, ' + result.skipped + ' skipped';
        if (result.errors && result.errors.length > 0) {
            html += '<br><strong style="color:#c62828;">Errors:</strong><ul>';
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
    body.innerHTML = '<p style="color:#999;">Thinking...</p>';
    try {
        var result = await api('POST', '/api/organizations/' + orgId + '/ai/ask', { question: q });
        var html = '<p><strong>Answer:</strong></p><p>' + esc(result.answer) + '</p>';
        if (result.suggestions && result.suggestions.length > 0) {
            html += '<p style="margin-top:8px;"><strong>Suggestions:</strong></p><ul>';
            result.suggestions.forEach(function(s) { html += '<li>' + esc(s) + '</li>'; });
            html += '</ul>';
        }
        body.innerHTML = html;
    } catch (e) { body.innerHTML = '<p style="color:red;">Error: ' + esc(e.message) + '</p>'; }
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
            '<div style="white-space:pre-wrap;">' + esc(result.body) + '</div></div>' +
            '<button class="btn btn-primary" style="margin-top:8px;" onclick="useEmailDraft(\'' +
            btoa(unescape(encodeURIComponent(JSON.stringify(result)))) + '\')">Use as Message Draft</button>';
    } catch (e) { resultDiv.innerHTML = '<p style="color:red;">Error: ' + esc(e.message) + '</p>'; }
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
// INIT
// ===================================================================
(async function init() {
    await loadOrgSelector();
    navigateTo('overview');
})();


// Refresh Lucide icons after DOM updates
var _origSetInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set;
setInterval(function() { if (typeof lucide !== 'undefined') try { lucide.createIcons(); } catch(e){} }, 1000);
