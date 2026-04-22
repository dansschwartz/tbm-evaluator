/* ============================================
   TBM Evaluator - Mobile Scoring JS
   ============================================ */

(function () {
  'use strict';

  // ========== State ==========
  const state = {
    evaluator: null,       // { id, name, ... }
    evaluator_id: null,
    events: [],
    selectedEvent: null,   // { id, name, date, ... }
    event_id: null,
    players: [],
    skills: [],            // from template
    currentPlayerIndex: 0,
    scores: {},            // keyed by player_id -> { skill_name: { score_value, comment } }
    submittedPlayers: new Set()
  };

  // ========== DOM refs ==========
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const screens = {
    login: $('#screen-login'),
    events: $('#screen-events'),
    players: $('#screen-players'),
    scoring: $('#screen-scoring')
  };

  const els = {
    loginForm: $('#login-form'),
    accessCodeInput: $('#access-code-input'),
    loginBtn: $('#login-btn'),
    loginError: $('#login-error'),
    logoutBtn: $('#logout-btn'),
    evaluatorBadge: $('#evaluator-badge'),
    eventsList: $('#events-list'),
    eventsEmpty: $('#events-empty'),
    backToEventsBtn: $('#back-to-events-btn'),
    eventTitle: $('#event-title'),
    syncBtn: $('#sync-btn'),
    playerSearch: $('#player-search'),
    scoringProgress: $('#scoring-progress'),
    progressLabel: $('#progress-label'),
    playersList: $('#players-list'),
    backToPlayersBtn: $('#back-to-players-btn'),
    playerNameTitle: $('#player-name-title'),
    prevPlayerBtn: $('#prev-player-btn'),
    nextPlayerBtn: $('#next-player-btn'),
    playerCounter: $('#player-counter'),
    skillsForm: $('#skills-form'),
    submitScoresBtn: $('#submit-scores-btn'),
    toast: $('#toast'),
    loadingOverlay: $('#loading-overlay')
  };

  // ========== API helpers ==========
  const API_BASE = '/api';

  function showLoading() {
    els.loadingOverlay.classList.remove('hidden');
  }

  function hideLoading() {
    els.loadingOverlay.classList.add('hidden');
  }

  async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(err.message || err.detail || 'Request failed');
    }
    return res.json();
  }

  async function apiGet(path) {
    const res = await fetch(API_BASE + path);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(err.message || err.detail || 'Request failed');
    }
    return res.json();
  }

  // ========== Toast ==========
  let toastTimer = null;

  function showToast(message, type) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.className = 'toast visible';
    if (type === 'success') els.toast.classList.add('toast-success');
    if (type === 'error') els.toast.classList.add('toast-error');
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('visible');
    }, 3000);
  }

  // ========== Screen navigation ==========
  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
    window.scrollTo(0, 0);
  }

  // ========== localStorage cache ==========
  const CACHE_KEY_PREFIX = 'tbm_scores_';

  function getCacheKey() {
    return CACHE_KEY_PREFIX + state.evaluator_id + '_' + state.event_id;
  }

  function saveScoresToCache() {
    if (!state.evaluator_id || !state.event_id) return;
    const data = {
      scores: state.scores,
      submittedPlayers: Array.from(state.submittedPlayers),
      timestamp: Date.now()
    };
    try {
      localStorage.setItem(getCacheKey(), JSON.stringify(data));
    } catch (e) {
      // Storage full or unavailable
    }
  }

  function loadScoresFromCache() {
    if (!state.evaluator_id || !state.event_id) return;
    try {
      const raw = localStorage.getItem(getCacheKey());
      if (raw) {
        const data = JSON.parse(raw);
        state.scores = data.scores || {};
        state.submittedPlayers = new Set(data.submittedPlayers || []);
      }
    } catch (e) {
      // Corrupt data, ignore
    }
  }

  function clearCacheForEvent() {
    if (!state.evaluator_id || !state.event_id) return;
    try {
      localStorage.removeItem(getCacheKey());
    } catch (e) {
      // ignore
    }
  }

  function getCachedUnsyncedCount() {
    const scoredPlayerIds = Object.keys(state.scores);
    let unsynced = 0;
    for (const pid of scoredPlayerIds) {
      if (!state.submittedPlayers.has(pid)) {
        const playerScores = state.scores[pid];
        const hasAnyScore = Object.values(playerScores).some(
          (s) => s.score_value !== null && s.score_value !== undefined && s.score_value !== ''
        );
        if (hasAnyScore) unsynced++;
      }
    }
    return unsynced;
  }

  function updateSyncBadge() {
    const existing = els.syncBtn.querySelector('.sync-badge');
    if (existing) existing.remove();

    const count = getCachedUnsyncedCount();
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'sync-badge';
      badge.textContent = count;
      els.syncBtn.appendChild(badge);
    }
  }

  // ========== LOGIN ==========
  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = els.accessCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) {
      els.loginError.textContent = 'Please enter a 6-character code.';
      els.loginError.classList.remove('hidden');
      return;
    }

    els.loginError.classList.add('hidden');
    els.loginBtn.disabled = true;
    els.loginBtn.textContent = 'Signing in...';

    try {
      showLoading();
      const data = await apiPost('/evaluators/login', { access_code: code });
      state.evaluator = data.evaluator || data;
      state.evaluator_id = data.evaluator?.id || data.id || data.evaluator_id;
      state.events = data.events || data.active_events || [];
      renderEvents();
      showScreen('events');
    } catch (err) {
      els.loginError.textContent = err.message || 'Invalid access code.';
      els.loginError.classList.remove('hidden');
    } finally {
      hideLoading();
      els.loginBtn.disabled = false;
      els.loginBtn.textContent = 'Sign In';
    }
  });

  // ========== LOGOUT ==========
  els.logoutBtn.addEventListener('click', () => {
    state.evaluator = null;
    state.evaluator_id = null;
    state.events = [];
    state.selectedEvent = null;
    state.event_id = null;
    state.players = [];
    state.skills = [];
    state.scores = {};
    state.submittedPlayers = new Set();
    state.currentPlayerIndex = 0;
    els.accessCodeInput.value = '';
    showScreen('login');
  });

  // ========== EVENTS ==========
  function renderEvents() {
    const name = state.evaluator?.name || state.evaluator?.first_name || 'Evaluator';
    els.evaluatorBadge.innerHTML =
      '<strong>' + escapeHtml(name) + '</strong>Select an event to begin scoring.';

    if (!state.events.length) {
      els.eventsList.innerHTML = '';
      els.eventsEmpty.classList.remove('hidden');
      return;
    }

    els.eventsEmpty.classList.add('hidden');
    els.eventsList.innerHTML = state.events
      .map((ev) => {
        const dateStr = ev.date ? formatDate(ev.date) : '';
        const location = ev.location || '';
        const playerCount = ev.player_count || ev.players_count || '';
        return (
          '<div class="card card-event" data-event-id="' + ev.id + '">' +
          '<div class="card-title">' + escapeHtml(ev.name || ev.title || 'Event') + '</div>' +
          '<div class="card-meta">' +
          (dateStr ? '<span>' + escapeHtml(dateStr) + '</span>' : '') +
          (location ? '<span>' + escapeHtml(location) + '</span>' : '') +
          (playerCount ? '<span>' + playerCount + ' players</span>' : '') +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    els.eventsList.querySelectorAll('.card-event').forEach((card) => {
      card.addEventListener('click', () => selectEvent(card.dataset.eventId));
    });
  }

  async function selectEvent(eventId) {
    try {
      showLoading();
      const data = await apiGet('/scoring/event/' + eventId);
      state.selectedEvent = data.event || data;
      state.event_id = eventId;
      state.players = data.players || [];
      state.skills = data.skills || data.template_skills || data.template?.skills || [];
      state.currentPlayerIndex = 0;
      state.scores = {};
      state.submittedPlayers = new Set();

      // Load cached scores
      loadScoresFromCache();

      els.eventTitle.textContent = state.selectedEvent.name || state.selectedEvent.title || 'Players';
      renderPlayers();
      updateSyncBadge();
      showScreen('players');
    } catch (err) {
      showToast(err.message || 'Failed to load event.', 'error');
    } finally {
      hideLoading();
    }
  }

  // ========== PLAYERS ==========
  function renderPlayers(filter) {
    const filtered = filter
      ? state.players.filter((p) => {
          const name = (p.name || p.first_name + ' ' + p.last_name || '').toLowerCase();
          return name.includes(filter.toLowerCase());
        })
      : state.players;

    els.playersList.innerHTML = filtered
      .map((p, idx) => {
        const fullName = p.name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || 'Player';
        const initials = getInitials(fullName);
        const detail = [];
        if (p.position) detail.push(p.position);
        if (p.number !== undefined && p.number !== null) detail.push('#' + p.number);
        if (p.team) detail.push(p.team);
        if (p.age) detail.push('Age ' + p.age);

        const checkedIn = p.checked_in || p.status === 'checked_in';
        const playerId = String(p.id || p.player_id);
        const isScored = state.submittedPlayers.has(playerId);

        // Find actual index in full players array
        const realIdx = state.players.findIndex((pl) => String(pl.id || pl.player_id) === playerId);

        return (
          '<div class="card card-player" data-player-index="' + realIdx + '">' +
          '<div class="player-avatar">' + escapeHtml(initials) + '</div>' +
          '<div class="player-info">' +
          '<div class="player-name">' + escapeHtml(fullName) + '</div>' +
          '<div class="player-detail">' + escapeHtml(detail.join(' / ')) + '</div>' +
          '</div>' +
          '<div class="player-status">' +
          '<div class="status-dot' + (isScored ? ' scored' : checkedIn ? ' checked-in' : '') + '"></div>' +
          '<div class="status-label">' + (isScored ? 'Scored' : checkedIn ? 'Checked in' : 'Pending') + '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    els.playersList.querySelectorAll('.card-player').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.playerIndex, 10);
        openScoringForm(idx);
      });
    });

    updateProgress();
  }

  function updateProgress() {
    const total = state.players.length;
    const scored = state.submittedPlayers.size;
    const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
    els.scoringProgress.style.width = pct + '%';
    els.progressLabel.textContent = scored + ' / ' + total + ' scored';
  }

  els.playerSearch.addEventListener('input', (e) => {
    renderPlayers(e.target.value);
  });

  els.backToEventsBtn.addEventListener('click', () => {
    showScreen('events');
  });

  // ========== SCORING FORM ==========
  async function openScoringForm(playerIndex) {
    state.currentPlayerIndex = playerIndex;
    const player = state.players[playerIndex];
    if (!player) return;

    const playerId = String(player.id || player.player_id);
    const fullName = player.name || ((player.first_name || '') + ' ' + (player.last_name || '')).trim() || 'Player';
    els.playerNameTitle.textContent = fullName;
    updatePlayerNav();

    // Try to load existing scores from server
    if (!state.scores[playerId]) {
      try {
        showLoading();
        const data = await apiGet('/scoring/event/' + state.event_id + '/player/' + playerId);
        if (data && data.scores && data.scores.length > 0) {
          state.scores[playerId] = {};
          data.scores.forEach((s) => {
            state.scores[playerId][s.skill_name] = {
              score_value: s.score_value,
              comment: s.comment || ''
            };
          });
          state.submittedPlayers.add(playerId);
          saveScoresToCache();
        }
      } catch (e) {
        // No existing scores, that's fine
      } finally {
        hideLoading();
      }
    }

    // Initialize empty scores for this player if needed
    if (!state.scores[playerId]) {
      state.scores[playerId] = {};
    }

    renderSkillsForm(playerId);
    showScreen('scoring');
  }

  function renderSkillsForm(playerId) {
    const playerScores = state.scores[playerId] || {};
    let html = '';

    // Group skills by category
    const grouped = {};
    state.skills.forEach((skill) => {
      const cat = skill.category || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(skill);
    });

    const categories = Object.keys(grouped);

    categories.forEach((cat) => {
      html += '<div class="skill-category-header">' + escapeHtml(cat) + '</div>';

      grouped[cat].forEach((skill) => {
        const skillName = skill.name || skill.skill_name;
        const skillType = skill.type || skill.input_type || 'scale_1_5';
        const existing = playerScores[skillName] || {};
        const currentValue = existing.score_value;
        const currentComment = existing.comment || '';

        html += '<div class="skill-card" data-skill-name="' + escapeHtml(skillName) + '" data-skill-type="' + escapeHtml(skillType) + '">';
        html += '<div class="skill-card-header">';
        html += '<span class="skill-name">' + escapeHtml(skillName) + '</span>';
        html += '<span class="skill-type-badge">' + escapeHtml(formatSkillType(skillType)) + '</span>';
        html += '</div>';

        // Render appropriate input based on type
        if (skillType === 'scale_1_5') {
          html += renderSliderInput(skillName, 1, 5, currentValue, playerId);
        } else if (skillType === 'scale_1_10') {
          html += renderSliderInput(skillName, 1, 10, currentValue, playerId);
        } else if (skillType === 'timed_seconds') {
          html += renderNumberInput(skillName, currentValue, 'seconds', playerId);
        } else if (skillType === 'numeric') {
          html += renderNumberInput(skillName, currentValue, '', playerId);
        } else if (skillType === 'pass_fail') {
          html += renderToggleInput(skillName, currentValue, playerId);
        } else {
          // Default to scale 1-5
          html += renderSliderInput(skillName, 1, 5, currentValue, playerId);
        }

        // Comment section
        const hasComment = currentComment.length > 0;
        html += '<button class="comment-toggle' + (hasComment ? ' open' : '') + '" data-skill="' + escapeHtml(skillName) + '">';
        html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
        html += 'Add comment';
        html += '</button>';
        html += '<div class="comment-area' + (hasComment ? ' open' : '') + '" data-skill="' + escapeHtml(skillName) + '">';
        html += '<textarea placeholder="Optional comment..." data-player="' + playerId + '" data-skill="' + escapeHtml(skillName) + '">' + escapeHtml(currentComment) + '</textarea>';
        html += '</div>';

        html += '</div>'; // .skill-card
      });
    });

    els.skillsForm.innerHTML = html;
    bindSkillInputEvents(playerId);
  }

  function renderSliderInput(skillName, min, max, value, playerId) {
    const val = value !== null && value !== undefined && value !== '' ? value : Math.ceil((min + max) / 2);
    return (
      '<div class="slider-container">' +
      '<div class="slider-value-display" data-display="' + escapeHtml(skillName) + '">' + val + '</div>' +
      '<input type="range" min="' + min + '" max="' + max + '" step="1" value="' + val + '" ' +
      'data-player="' + playerId + '" data-skill="' + escapeHtml(skillName) + '" data-input-type="slider">' +
      '<div class="slider-labels"><span>' + min + '</span><span>' + max + '</span></div>' +
      '</div>'
    );
  }

  function renderNumberInput(skillName, value, suffix, playerId) {
    const val = value !== null && value !== undefined && value !== '' ? value : '';
    return (
      '<div class="number-input-container">' +
      '<input type="number" inputmode="decimal" step="any" min="0" value="' + val + '" placeholder="--" ' +
      'data-player="' + playerId + '" data-skill="' + escapeHtml(skillName) + '" data-input-type="number">' +
      (suffix ? '<span class="input-suffix">' + escapeHtml(suffix) + '</span>' : '') +
      '</div>'
    );
  }

  function renderToggleInput(skillName, value, playerId) {
    const isPass = value === 'pass' || value === 1 || value === true;
    const isFail = value === 'fail' || value === 0 || value === false;
    return (
      '<div class="toggle-container" data-player="' + playerId + '" data-skill="' + escapeHtml(skillName) + '" data-input-type="toggle">' +
      '<button class="toggle-option' + (isPass ? ' active-pass' : '') + '" data-value="pass">Pass</button>' +
      '<button class="toggle-option' + (isFail ? ' active-fail' : '') + '" data-value="fail">Fail</button>' +
      '</div>'
    );
  }

  function bindSkillInputEvents(playerId) {
    // Slider inputs
    els.skillsForm.querySelectorAll('input[data-input-type="slider"]').forEach((input) => {
      input.addEventListener('input', (e) => {
        const skill = e.target.dataset.skill;
        const val = parseInt(e.target.value, 10);
        const display = els.skillsForm.querySelector('[data-display="' + CSS.escape(skill) + '"]');
        if (display) display.textContent = val;
        setScore(playerId, skill, val);
      });
    });

    // Number inputs
    els.skillsForm.querySelectorAll('input[data-input-type="number"]').forEach((input) => {
      input.addEventListener('change', (e) => {
        const skill = e.target.dataset.skill;
        const val = e.target.value !== '' ? parseFloat(e.target.value) : null;
        setScore(playerId, skill, val);
      });
      input.addEventListener('input', (e) => {
        const skill = e.target.dataset.skill;
        const val = e.target.value !== '' ? parseFloat(e.target.value) : null;
        setScore(playerId, skill, val);
      });
    });

    // Toggle inputs
    els.skillsForm.querySelectorAll('[data-input-type="toggle"]').forEach((container) => {
      container.querySelectorAll('.toggle-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          const skill = container.dataset.skill;
          const val = btn.dataset.value;

          // Remove active classes from siblings
          container.querySelectorAll('.toggle-option').forEach((b) => {
            b.classList.remove('active-pass', 'active-fail');
          });

          // Set active
          if (val === 'pass') {
            btn.classList.add('active-pass');
          } else {
            btn.classList.add('active-fail');
          }

          setScore(playerId, skill, val);
        });
      });
    });

    // Comment toggles
    els.skillsForm.querySelectorAll('.comment-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('open');
        const skill = btn.dataset.skill;
        const area = els.skillsForm.querySelector('.comment-area[data-skill="' + CSS.escape(skill) + '"]');
        if (area) area.classList.toggle('open');
      });
    });

    // Comment textareas
    els.skillsForm.querySelectorAll('.comment-area textarea').forEach((textarea) => {
      textarea.addEventListener('change', (e) => {
        const skill = e.target.dataset.skill;
        const pid = e.target.dataset.player;
        if (!state.scores[pid]) state.scores[pid] = {};
        if (!state.scores[pid][skill]) state.scores[pid][skill] = { score_value: null, comment: '' };
        state.scores[pid][skill].comment = e.target.value;
        saveScoresToCache();
      });
    });
  }

  function setScore(playerId, skillName, value) {
    if (!state.scores[playerId]) state.scores[playerId] = {};
    if (!state.scores[playerId][skillName]) {
      state.scores[playerId][skillName] = { score_value: null, comment: '' };
    }
    state.scores[playerId][skillName].score_value = value;
    saveScoresToCache();
    updateSyncBadge();
  }

  function updatePlayerNav() {
    const total = state.players.length;
    const idx = state.currentPlayerIndex;
    els.playerCounter.textContent = (idx + 1) + ' / ' + total;
    els.prevPlayerBtn.disabled = idx <= 0;
    els.nextPlayerBtn.disabled = idx >= total - 1;
  }

  els.prevPlayerBtn.addEventListener('click', () => {
    if (state.currentPlayerIndex > 0) {
      openScoringForm(state.currentPlayerIndex - 1);
    }
  });

  els.nextPlayerBtn.addEventListener('click', () => {
    if (state.currentPlayerIndex < state.players.length - 1) {
      openScoringForm(state.currentPlayerIndex + 1);
    }
  });

  els.backToPlayersBtn.addEventListener('click', () => {
    els.playerSearch.value = '';
    renderPlayers();
    updateSyncBadge();
    showScreen('players');
  });

  // ========== SUBMIT SCORES ==========
  els.submitScoresBtn.addEventListener('click', async () => {
    const player = state.players[state.currentPlayerIndex];
    if (!player) return;

    const playerId = String(player.id || player.player_id);
    const playerScores = state.scores[playerId] || {};

    // Build scores array
    const scoresArray = [];
    state.skills.forEach((skill) => {
      const skillName = skill.name || skill.skill_name;
      const entry = playerScores[skillName];
      if (entry && entry.score_value !== null && entry.score_value !== undefined && entry.score_value !== '') {
        scoresArray.push({
          player_id: playerId,
          skill_name: skillName,
          score_value: entry.score_value,
          comment: entry.comment || ''
        });
      }
    });

    if (scoresArray.length === 0) {
      showToast('No scores to submit. Please score at least one skill.', 'error');
      return;
    }

    els.submitScoresBtn.disabled = true;
    els.submitScoresBtn.textContent = 'Submitting...';

    try {
      showLoading();
      await apiPost('/scoring/scores', {
        evaluator_id: state.evaluator_id,
        event_id: state.event_id,
        scores: scoresArray
      });
      state.submittedPlayers.add(playerId);
      saveScoresToCache();
      showToast('Scores submitted successfully!', 'success');

      // Auto-advance to next player after a short delay
      setTimeout(() => {
        if (state.currentPlayerIndex < state.players.length - 1) {
          openScoringForm(state.currentPlayerIndex + 1);
        } else {
          // All players done, go back to list
          els.playerSearch.value = '';
          renderPlayers();
          updateSyncBadge();
          showScreen('players');
        }
      }, 800);
    } catch (err) {
      showToast('Submit failed: ' + (err.message || 'Network error. Scores saved locally.'), 'error');
      // Scores remain in localStorage
    } finally {
      hideLoading();
      els.submitScoresBtn.disabled = false;
      els.submitScoresBtn.textContent = 'Submit Scores';
    }
  });

  // ========== SYNC CACHED SCORES ==========
  els.syncBtn.addEventListener('click', async () => {
    const unsyncedPlayerIds = [];
    for (const pid of Object.keys(state.scores)) {
      if (!state.submittedPlayers.has(pid)) {
        const playerScores = state.scores[pid];
        const hasAnyScore = Object.values(playerScores).some(
          (s) => s.score_value !== null && s.score_value !== undefined && s.score_value !== ''
        );
        if (hasAnyScore) unsyncedPlayerIds.push(pid);
      }
    }

    if (unsyncedPlayerIds.length === 0) {
      showToast('All scores are synced.', 'success');
      return;
    }

    showLoading();
    let successCount = 0;
    let failCount = 0;

    for (const pid of unsyncedPlayerIds) {
      const playerScores = state.scores[pid];
      const scoresArray = [];

      state.skills.forEach((skill) => {
        const skillName = skill.name || skill.skill_name;
        const entry = playerScores[skillName];
        if (entry && entry.score_value !== null && entry.score_value !== undefined && entry.score_value !== '') {
          scoresArray.push({
            player_id: pid,
            skill_name: skillName,
            score_value: entry.score_value,
            comment: entry.comment || ''
          });
        }
      });

      if (scoresArray.length === 0) continue;

      try {
        await apiPost('/scoring/scores', {
          evaluator_id: state.evaluator_id,
          event_id: state.event_id,
          scores: scoresArray
        });
        state.submittedPlayers.add(pid);
        successCount++;
      } catch (e) {
        failCount++;
      }
    }

    saveScoresToCache();
    updateSyncBadge();
    renderPlayers(els.playerSearch.value);
    hideLoading();

    if (failCount === 0) {
      showToast(successCount + ' player(s) synced successfully!', 'success');
    } else {
      showToast(successCount + ' synced, ' + failCount + ' failed. Try again.', 'error');
    }
  });

  // ========== Helpers ==========
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  function formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  function formatSkillType(type) {
    const map = {
      scale_1_5: '1-5',
      scale_1_10: '1-10',
      timed_seconds: 'Time',
      numeric: 'Number',
      pass_fail: 'P/F'
    };
    return map[type] || type;
  }

  // ========== Init ==========
  showScreen('login');
  els.accessCodeInput.focus();
})();
