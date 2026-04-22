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
const sections = ['overview', 'organizations', 'templates', 'events', 'players', 'reports', 'draft', 'analytics'];

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

    document.getElementById('page-title').textContent =
        section.charAt(0).toUpperCase() + section.slice(1);

    var orgId = getSelectedOrg();

    if (section === 'overview') loadOverview(orgId);
    else if (section === 'organizations') loadOrganizations();
    else if (section === 'templates') loadTemplates(orgId);
    else if (section === 'events') loadEvents(orgId);
    else if (section === 'players') loadPlayers(orgId);
    else if (section === 'reports') loadReportsSection(orgId);
    else if (section === 'draft') loadDraftSection(orgId);
    else if (section === 'analytics') loadAnalyticsSection(orgId);
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
                return '<tr><td>' + tp.rank + '</td><td>' + tp.player_id + '</td><td>' + (tp.overall_score !== null ? tp.overall_score.toFixed(2) : '--') + '</td></tr>';
            }).join('');
            topEl.innerHTML = '<table class="data-table"><thead><tr><th>Rank</th><th>Player ID</th><th>Score</th></tr></thead><tbody>' + topRows + '</tbody></table>';
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
