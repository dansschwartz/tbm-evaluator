/* ============================================
   TBM Evaluator - Mobile Scoring JS
   Features: Offline mode, Timer, Voice scoring,
   Check-in tab, Rubric tooltips, Notes, Photo
   ============================================ */

(function () {
  'use strict';

  // ========== State ==========
  const state = {
    evaluator: null,
    evaluator_id: null,
    events: [],
    selectedEvent: null,
    event_id: null,
    players: [],
    skills: [],
    currentPlayerIndex: 0,
    scores: {},
    submittedPlayers: new Set(),
    online: navigator.onLine,
    activeTab: 'players',
    timerRunning: {},  // skill_name -> { running, startTime, elapsed }
    recognition: null, // SpeechRecognition instance
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
    loadingOverlay: $('#loading-overlay'),
    offlineIndicator: $('#offline-indicator'),
    checkinList: $('#checkin-list'),
    generalNotesInput: $('#general-notes-input'),
    scoringPlayerHeader: $('#scoring-player-header'),
    voiceInput: $('#voice-input'),
    voiceRecordBtn: $('#voice-record-btn'),
    voiceParseBtn: $('#voice-parse-btn'),
    voiceResults: $('#voice-results'),
  };

  // ========== API helpers ==========
  const API_BASE = '/api';

  function showLoading() { els.loadingOverlay.classList.remove('hidden'); }
  function hideLoading() { els.loadingOverlay.classList.add('hidden'); }

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

  // ========== Feature 7: Offline Mode ==========
  function updateOnlineStatus() {
    state.online = navigator.onLine;
    var indicator = els.offlineIndicator;
    if (!indicator) return;
    var unsynced = getCachedUnsyncedCount();
    if (!state.online) {
      indicator.textContent = '\u26A0\uFE0F Offline \u2014 ' + unsynced + ' scores pending';
      indicator.className = 'offline-indicator offline';
      indicator.classList.remove('hidden');
    } else if (unsynced > 0) {
      indicator.textContent = '\u26A0\uFE0F Online \u2014 ' + unsynced + ' scores pending sync';
      indicator.className = 'offline-indicator pending';
      indicator.classList.remove('hidden');
    } else {
      indicator.textContent = '\u2705 Synced';
      indicator.className = 'offline-indicator synced';
      // Hide after 3 seconds
      setTimeout(function() { indicator.classList.add('hidden'); }, 3000);
    }
  }

  window.addEventListener('online', function() {
    state.online = true;
    updateOnlineStatus();
    // Auto-sync when back online
    autoSyncPendingScores();
  });
  window.addEventListener('offline', function() {
    state.online = false;
    updateOnlineStatus();
  });

  async function autoSyncPendingScores() {
    if (!state.online || !state.evaluator_id || !state.event_id) return;
    var count = getCachedUnsyncedCount();
    if (count === 0) return;
    try {
      await syncAllPendingScores();
      showToast(count + ' scores synced automatically!', 'success');
    } catch(e) {
      // Silent fail, user can manually sync
    }
    updateOnlineStatus();
  }

  // ========== Toast ==========
  var toastTimer = null;

  function showToast(message, type) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.className = 'toast visible';
    if (type === 'success') els.toast.classList.add('toast-success');
    if (type === 'error') els.toast.classList.add('toast-error');
    toastTimer = setTimeout(function() {
      els.toast.classList.remove('visible');
    }, 3000);
  }

  // ========== Screen navigation ==========
  function showScreen(name) {
    Object.values(screens).forEach(function(s) { s.classList.remove('active'); });
    screens[name].classList.add('active');
    window.scrollTo(0, 0);
  }

  // ========== Tab navigation ==========
  $$('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = this.dataset.tab;
      state.activeTab = tab;
      $$('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      $$('.tab-content').forEach(function(c) { c.classList.remove('active'); });
      var target = $('#tab-' + tab);
      if (target) target.classList.add('active');
      if (tab === 'checkin') renderCheckInList();
    });
  });

  // ========== localStorage cache ==========
  var CACHE_KEY_PREFIX = 'tbm_scores_';
  var NOTES_KEY_PREFIX = 'tbm_notes_';

  function getCacheKey() {
    return CACHE_KEY_PREFIX + state.evaluator_id + '_' + state.event_id;
  }

  function getNotesKey(playerId) {
    return NOTES_KEY_PREFIX + state.event_id + '_' + playerId;
  }

  function saveScoresToCache() {
    if (!state.evaluator_id || !state.event_id) return;
    var data = {
      scores: state.scores,
      submittedPlayers: Array.from(state.submittedPlayers),
      timestamp: Date.now()
    };
    try { localStorage.setItem(getCacheKey(), JSON.stringify(data)); } catch(e) {}
  }

  function loadScoresFromCache() {
    if (!state.evaluator_id || !state.event_id) return;
    try {
      var raw = localStorage.getItem(getCacheKey());
      if (raw) {
        var data = JSON.parse(raw);
        state.scores = data.scores || {};
        state.submittedPlayers = new Set(data.submittedPlayers || []);
      }
    } catch(e) {}
  }

  function getCachedUnsyncedCount() {
    var scoredPlayerIds = Object.keys(state.scores);
    var unsynced = 0;
    for (var i = 0; i < scoredPlayerIds.length; i++) {
      var pid = scoredPlayerIds[i];
      if (!state.submittedPlayers.has(pid)) {
        var playerScores = state.scores[pid];
        var hasAnyScore = Object.values(playerScores).some(function(s) {
          return s.score_value !== null && s.score_value !== undefined && s.score_value !== '';
        });
        if (hasAnyScore) unsynced++;
      }
    }
    return unsynced;
  }

  function updateSyncBadge() {
    var existing = els.syncBtn.querySelector('.sync-badge');
    if (existing) existing.remove();
    var count = getCachedUnsyncedCount();
    if (count > 0) {
      var badge = document.createElement('span');
      badge.className = 'sync-badge';
      badge.textContent = count;
      els.syncBtn.appendChild(badge);
    }
    updateOnlineStatus();
  }

  // ========== LOGIN ==========
  els.loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var code = els.accessCodeInput.value.trim().toUpperCase();
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
      var data = await apiPost('/evaluators/login', { access_code: code });
      state.evaluator = data.evaluator || data;
      state.evaluator_id = data.evaluator?.id || data.id || data.evaluator_id;
      state.events = data.events || data.active_events || [];
      renderEvents();
      showScreen('events');
    } catch(err) {
      els.loginError.textContent = err.message || 'Invalid access code.';
      els.loginError.classList.remove('hidden');
    } finally {
      hideLoading();
      els.loginBtn.disabled = false;
      els.loginBtn.textContent = 'Sign In';
    }
  });

  // ========== LOGOUT ==========
  els.logoutBtn.addEventListener('click', function() {
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
    var name = state.evaluator?.name || state.evaluator?.first_name || 'Evaluator';
    els.evaluatorBadge.innerHTML =
      '<strong>' + escapeHtml(name) + '</strong>Select an event to begin scoring.';

    if (!state.events.length) {
      els.eventsList.innerHTML = '';
      els.eventsEmpty.classList.remove('hidden');
      return;
    }

    els.eventsEmpty.classList.add('hidden');
    els.eventsList.innerHTML = state.events.map(function(ev) {
      var dateStr = ev.date ? formatDate(ev.date) : (ev.event_date ? formatDate(ev.event_date) : '');
      return '<div class="card card-event" data-event-id="' + ev.id + '">' +
        '<div class="card-title">' + escapeHtml(ev.name || 'Event') + '</div>' +
        '<div class="card-meta">' +
        (dateStr ? '<span>' + escapeHtml(dateStr) + '</span>' : '') +
        '</div></div>';
    }).join('');

    els.eventsList.querySelectorAll('.card-event').forEach(function(card) {
      card.addEventListener('click', function() { selectEvent(card.dataset.eventId); });
    });
  }

  async function selectEvent(eventId) {
    try {
      showLoading();
      var data = await apiGet('/scoring/event/' + eventId);
      state.selectedEvent = data.event || data;
      state.event_id = eventId;
      state.players = data.players || [];
      state.skills = data.skills || data.template_skills || data.template?.skills || [];
      state.currentPlayerIndex = 0;
      state.scores = {};
      state.submittedPlayers = new Set();
      loadScoresFromCache();
      els.eventTitle.textContent = state.selectedEvent.name || 'Players';
      renderPlayers();
      updateSyncBadge();
      showScreen('players');
      // Check for pending offline scores on load
      if (state.online && getCachedUnsyncedCount() > 0) {
        showToast(getCachedUnsyncedCount() + ' offline scores pending. Tap sync to upload.', 'success');
      }
    } catch(err) {
      showToast(err.message || 'Failed to load event.', 'error');
    } finally {
      hideLoading();
    }
  }

  // ========== PLAYERS ==========
  function renderPlayers(filter) {
    var filtered = filter
      ? state.players.filter(function(p) {
          var name = (p.name || p.first_name + ' ' + p.last_name || '').toLowerCase();
          return name.includes(filter.toLowerCase());
        })
      : state.players;

    els.playersList.innerHTML = filtered.map(function(p) {
      var fullName = p.name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || 'Player';
      var initials = getInitials(fullName);
      var detail = [];
      if (p.position) detail.push(p.position);
      if (p.jersey_number) detail.push('#' + p.jersey_number);
      if (p.age_group) detail.push(p.age_group);

      var playerId = String(p.id || p.player_id);
      var isScored = state.submittedPlayers.has(playerId);
      var checkedIn = p.checked_in;
      var realIdx = state.players.findIndex(function(pl) { return String(pl.id || pl.player_id) === playerId; });

      // Feature 8: Show photo
      var avatarHtml = p.photo_url
        ? '<img class="player-avatar-img" src="' + escapeHtml(p.photo_url) + '" alt="">'
        : '<div class="player-avatar">' + escapeHtml(initials) + '</div>';

      return '<div class="card card-player" data-player-index="' + realIdx + '">' +
        avatarHtml +
        '<div class="player-info">' +
        '<div class="player-name">' + escapeHtml(fullName) + '</div>' +
        '<div class="player-detail">' + escapeHtml(detail.join(' / ')) + '</div>' +
        '</div>' +
        '<div class="player-status">' +
        '<div class="status-dot' + (isScored ? ' scored' : checkedIn ? ' checked-in' : '') + '"></div>' +
        '<div class="status-label">' + (isScored ? 'Scored' : checkedIn ? 'Checked in' : 'Pending') + '</div>' +
        '</div></div>';
    }).join('');

    els.playersList.querySelectorAll('.card-player').forEach(function(card) {
      card.addEventListener('click', function() {
        openScoringForm(parseInt(card.dataset.playerIndex, 10));
      });
    });

    updateProgress();
  }

  // ========== Feature 1: Check-In Tab ==========
  function renderCheckInList() {
    var html = state.players.map(function(p) {
      var fullName = (p.first_name || '') + ' ' + (p.last_name || '');
      var playerId = String(p.id || p.player_id);
      var checkedIn = p.checked_in;
      return '<div class="card card-checkin">' +
        '<div class="player-info">' +
        '<div class="player-name">' + escapeHtml(fullName) + '</div>' +
        '<div class="player-detail">' + (p.bib_number ? 'Bib #' + p.bib_number : '') + '</div>' +
        '</div>' +
        '<div class="checkin-actions">' +
        (checkedIn
          ? '<span class="checkin-badge checked">\u2705 Checked In</span>'
          : '<button class="btn btn-primary btn-sm" onclick="window._checkInPlayer(\'' + playerId + '\')">Check In</button>') +
        '</div></div>';
    }).join('');
    els.checkinList.innerHTML = html || '<p style="color:#999;text-align:center;padding:20px">No players in this event.</p>';
  }

  window._checkInPlayer = async function(playerId) {
    try {
      await apiPost('/events/' + state.event_id + '/check-in', { player_id: playerId });
      // Update local state
      var p = state.players.find(function(pl) { return String(pl.id || pl.player_id) === playerId; });
      if (p) p.checked_in = true;
      renderCheckInList();
      renderPlayers(els.playerSearch.value);
      showToast('Player checked in!', 'success');
    } catch(e) {
      showToast('Check-in failed: ' + e.message, 'error');
    }
  };

  function updateProgress() {
    var total = state.players.length;
    var scored = state.submittedPlayers.size;
    var pct = total > 0 ? Math.round((scored / total) * 100) : 0;
    els.scoringProgress.style.width = pct + '%';
    els.progressLabel.textContent = scored + ' / ' + total + ' scored';
  }

  els.playerSearch.addEventListener('input', function(e) { renderPlayers(e.target.value); });
  els.backToEventsBtn.addEventListener('click', function() { showScreen('events'); });

  // ========== SCORING FORM ==========
  async function openScoringForm(playerIndex) {
    state.currentPlayerIndex = playerIndex;
    var player = state.players[playerIndex];
    if (!player) return;

    var playerId = String(player.id || player.player_id);
    var fullName = player.name || ((player.first_name || '') + ' ' + (player.last_name || '')).trim() || 'Player';
    els.playerNameTitle.textContent = fullName;
    updatePlayerNav();

    // Feature 8: Show player photo and info in scoring header
    var photoHtml = player.photo_url
      ? '<img class="scoring-player-photo" src="' + escapeHtml(player.photo_url) + '" alt="">'
      : '';
    els.scoringPlayerHeader.innerHTML = photoHtml +
      '<div class="scoring-player-info">' +
      '<strong>' + escapeHtml(fullName) + '</strong>' +
      '<span>' + escapeHtml([player.position, player.age_group].filter(Boolean).join(' / ')) + '</span>' +
      '</div>';

    // Try to load existing scores from server
    if (!state.scores[playerId]) {
      try {
        if (state.online) {
          showLoading();
          var data = await apiGet('/scoring/event/' + state.event_id + '/player/' + playerId);
          if (data && data.length > 0) {
            state.scores[playerId] = {};
            data.forEach(function(s) {
              state.scores[playerId][s.skill_name] = { score_value: s.score_value, comment: s.comment || '' };
            });
            state.submittedPlayers.add(playerId);
            saveScoresToCache();
          }
        }
      } catch(e) {
        // No existing scores
      } finally {
        hideLoading();
      }
    }

    if (!state.scores[playerId]) state.scores[playerId] = {};

    // Load general notes
    var savedNotes = '';
    try { savedNotes = localStorage.getItem(getNotesKey(playerId)) || ''; } catch(e) {}
    if (player.general_notes) savedNotes = player.general_notes;
    els.generalNotesInput.value = savedNotes;

    renderSkillsForm(playerId);
    showScreen('scoring');
  }

  function renderSkillsForm(playerId) {
    var playerScores = state.scores[playerId] || {};
    var player = state.players[state.currentPlayerIndex];
    var playerPosition = player ? player.position : null;
    var html = '';

    // Group skills by category
    var grouped = {};
    state.skills.forEach(function(skill) {
      var cat = skill.category || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(skill);
    });

    Object.keys(grouped).forEach(function(cat) {
      html += '<div class="skill-category-header">' + escapeHtml(cat) + '</div>';

      grouped[cat].forEach(function(skill) {
        var skillName = skill.name || skill.skill_name;
        var skillType = skill.scoring_type || skill.type || skill.input_type || 'scale_1_5';
        var existing = playerScores[skillName] || {};
        var currentValue = existing.score_value;
        var currentComment = existing.comment || '';

        // Feature 13: Rubric descriptions
        var rubricHtml = '';
        if (skill.rubric_descriptions) {
          var rubricItems = Object.entries(skill.rubric_descriptions).map(function(entry) {
            return '<span class="rubric-item"><strong>' + escapeHtml(entry[0]) + ':</strong> ' + escapeHtml(entry[1]) + '</span>';
          }).join('');
          rubricHtml = '<div class="rubric-tooltip">' + rubricItems + '</div>';
        } else if (skill.description) {
          rubricHtml = '<div class="rubric-tooltip"><span class="rubric-item">' + escapeHtml(skill.description) + '</span></div>';
        }

        html += '<div class="skill-card" data-skill-name="' + escapeHtml(skillName) + '">';
        html += '<div class="skill-card-header">';
        html += '<span class="skill-name">' + escapeHtml(skillName) + '</span>';
        html += '<span class="skill-type-badge">' + escapeHtml(formatSkillType(skillType)) + '</span>';
        html += '</div>';

        // Feature 13: Show rubric on tap
        if (rubricHtml) {
          html += '<button class="rubric-toggle" onclick="this.nextElementSibling.classList.toggle(\'open\')">Scoring Guide</button>';
          html += rubricHtml;
        }

        // Feature 14: Timer for timed_seconds
        if (skillType === 'timed_seconds') {
          html += renderTimerInput(skillName, currentValue, playerId);
        } else if (skillType === 'scale_1_5') {
          html += renderSliderInput(skillName, 1, 5, currentValue, playerId);
        } else if (skillType === 'scale_1_10') {
          html += renderSliderInput(skillName, 1, 10, currentValue, playerId);
        } else if (skillType === 'numeric') {
          html += renderNumberInput(skillName, currentValue, '', playerId);
        } else if (skillType === 'pass_fail') {
          html += renderToggleInput(skillName, currentValue, playerId);
        } else {
          html += renderSliderInput(skillName, 1, 5, currentValue, playerId);
        }

        // Comment section
        var hasComment = currentComment.length > 0;
        html += '<button class="comment-toggle' + (hasComment ? ' open' : '') + '" data-skill="' + escapeHtml(skillName) + '">';
        html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
        html += 'Add comment</button>';
        html += '<div class="comment-area' + (hasComment ? ' open' : '') + '" data-skill="' + escapeHtml(skillName) + '">';
        html += '<textarea placeholder="Optional comment..." data-player="' + playerId + '" data-skill="' + escapeHtml(skillName) + '">' + escapeHtml(currentComment) + '</textarea>';
        html += '</div>';
        html += '</div>';
      });
    });

    els.skillsForm.innerHTML = html;
    bindSkillInputEvents(playerId);
  }

  // Feature 14: Timer input for timed drills
  function renderTimerInput(skillName, value, playerId) {
    var val = value !== null && value !== undefined && value !== '' ? value : '';
    var timerState = state.timerRunning[skillName] || { running: false, startTime: 0, elapsed: 0 };
    var displayTime = val || timerState.elapsed || '0.0';

    return '<div class="timer-container" data-skill="' + escapeHtml(skillName) + '">' +
      '<div class="timer-display" id="timer-display-' + escapeHtml(skillName).replace(/\s/g, '_') + '">' + displayTime + 's</div>' +
      '<div class="timer-buttons">' +
      '<button class="btn btn-primary btn-timer-start" data-skill="' + escapeHtml(skillName) + '" data-player="' + playerId + '">' +
      (timerState.running ? 'Stop' : 'Start') + '</button>' +
      '<button class="btn btn-outline btn-timer-reset" data-skill="' + escapeHtml(skillName) + '" data-player="' + playerId + '">Reset</button>' +
      '</div>' +
      '<div class="timer-manual">' +
      '<input type="number" inputmode="decimal" step="0.1" min="0" value="' + val + '" placeholder="Manual entry (sec)" ' +
      'data-player="' + playerId + '" data-skill="' + escapeHtml(skillName) + '" data-input-type="number">' +
      '</div></div>';
  }

  function renderSliderInput(skillName, min, max, value, playerId) {
    var val = value !== null && value !== undefined && value !== '' ? value : Math.ceil((min + max) / 2);
    return '<div class="slider-container">' +
      '<div class="slider-value-display" data-display="' + escapeHtml(skillName) + '">' + val + '</div>' +
      '<input type="range" min="' + min + '" max="' + max + '" step="1" value="' + val + '" ' +
      'data-player="' + playerId + '" data-skill="' + escapeHtml(skillName) + '" data-input-type="slider">' +
      '<div class="slider-labels"><span>' + min + '</span><span>' + max + '</span></div></div>';
  }

  function renderNumberInput(skillName, value, suffix, playerId) {
    var val = value !== null && value !== undefined && value !== '' ? value : '';
    return '<div class="number-input-container">' +
      '<input type="number" inputmode="decimal" step="any" min="0" value="' + val + '" placeholder="--" ' +
      'data-player="' + playerId + '" data-skill="' + escapeHtml(skillName) + '" data-input-type="number">' +
      (suffix ? '<span class="input-suffix">' + escapeHtml(suffix) + '</span>' : '') + '</div>';
  }

  function renderToggleInput(skillName, value, playerId) {
    var isPass = value === 'pass' || value === 1 || value === true;
    var isFail = value === 'fail' || value === 0 || value === false;
    return '<div class="toggle-container" data-player="' + playerId + '" data-skill="' + escapeHtml(skillName) + '" data-input-type="toggle">' +
      '<button class="toggle-option' + (isPass ? ' active-pass' : '') + '" data-value="pass">Pass</button>' +
      '<button class="toggle-option' + (isFail ? ' active-fail' : '') + '" data-value="fail">Fail</button></div>';
  }

  function bindSkillInputEvents(playerId) {
    // Slider inputs
    els.skillsForm.querySelectorAll('input[data-input-type="slider"]').forEach(function(input) {
      input.addEventListener('input', function(e) {
        var skill = e.target.dataset.skill;
        var val = parseInt(e.target.value, 10);
        var display = els.skillsForm.querySelector('[data-display="' + CSS.escape(skill) + '"]');
        if (display) display.textContent = val;
        setScore(playerId, skill, val);
      });
    });

    // Number inputs
    els.skillsForm.querySelectorAll('input[data-input-type="number"]').forEach(function(input) {
      input.addEventListener('input', function(e) {
        var skill = e.target.dataset.skill;
        var val = e.target.value !== '' ? parseFloat(e.target.value) : null;
        setScore(playerId, skill, val);
      });
    });

    // Toggle inputs
    els.skillsForm.querySelectorAll('[data-input-type="toggle"]').forEach(function(container) {
      container.querySelectorAll('.toggle-option').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var skill = container.dataset.skill;
          var val = btn.dataset.value;
          container.querySelectorAll('.toggle-option').forEach(function(b) {
            b.classList.remove('active-pass', 'active-fail');
          });
          btn.classList.add(val === 'pass' ? 'active-pass' : 'active-fail');
          setScore(playerId, skill, val);
        });
      });
    });

    // Comment toggles
    els.skillsForm.querySelectorAll('.comment-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        btn.classList.toggle('open');
        var skill = btn.dataset.skill;
        var area = els.skillsForm.querySelector('.comment-area[data-skill="' + CSS.escape(skill) + '"]');
        if (area) area.classList.toggle('open');
      });
    });

    // Comment textareas
    els.skillsForm.querySelectorAll('.comment-area textarea').forEach(function(textarea) {
      textarea.addEventListener('change', function(e) {
        var skill = e.target.dataset.skill;
        if (!state.scores[playerId]) state.scores[playerId] = {};
        if (!state.scores[playerId][skill]) state.scores[playerId][skill] = { score_value: null, comment: '' };
        state.scores[playerId][skill].comment = e.target.value;
        saveScoresToCache();
      });
    });

    // Feature 14: Timer buttons
    els.skillsForm.querySelectorAll('.btn-timer-start').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var skill = btn.dataset.skill;
        toggleTimer(skill, playerId, btn);
      });
    });

    els.skillsForm.querySelectorAll('.btn-timer-reset').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var skill = btn.dataset.skill;
        resetTimer(skill, playerId);
      });
    });
  }

  // Feature 14: Timer functions
  function toggleTimer(skillName, playerId, btn) {
    if (!state.timerRunning[skillName]) {
      state.timerRunning[skillName] = { running: false, startTime: 0, elapsed: 0, interval: null };
    }
    var t = state.timerRunning[skillName];

    if (t.running) {
      // Stop
      t.running = false;
      clearInterval(t.interval);
      btn.textContent = 'Start';
      var elapsed = ((Date.now() - t.startTime) / 1000).toFixed(1);
      t.elapsed = parseFloat(elapsed);
      setScore(playerId, skillName, t.elapsed);
      // Update manual input
      var manualInput = els.skillsForm.querySelector('.timer-container[data-skill="' + CSS.escape(skillName) + '"] input[data-input-type="number"]');
      if (manualInput) manualInput.value = t.elapsed;
    } else {
      // Start
      t.running = true;
      t.startTime = Date.now() - (t.elapsed * 1000);
      btn.textContent = 'Stop';
      var displayId = 'timer-display-' + skillName.replace(/\s/g, '_');
      t.interval = setInterval(function() {
        var el = document.getElementById(displayId);
        if (el) {
          var secs = ((Date.now() - t.startTime) / 1000).toFixed(1);
          el.textContent = secs + 's';
        }
      }, 100);
    }
  }

  function resetTimer(skillName, playerId) {
    if (state.timerRunning[skillName]) {
      clearInterval(state.timerRunning[skillName].interval);
    }
    state.timerRunning[skillName] = { running: false, startTime: 0, elapsed: 0, interval: null };
    var displayId = 'timer-display-' + skillName.replace(/\s/g, '_');
    var el = document.getElementById(displayId);
    if (el) el.textContent = '0.0s';
    var btn = els.skillsForm.querySelector('.btn-timer-start[data-skill="' + CSS.escape(skillName) + '"]');
    if (btn) btn.textContent = 'Start';
    var manualInput = els.skillsForm.querySelector('.timer-container[data-skill="' + CSS.escape(skillName) + '"] input[data-input-type="number"]');
    if (manualInput) manualInput.value = '';
    setScore(playerId, skillName, null);
  }

  function setScore(playerId, skillName, value) {
    if (!state.scores[playerId]) state.scores[playerId] = {};
    if (!state.scores[playerId][skillName]) state.scores[playerId][skillName] = { score_value: null, comment: '' };
    state.scores[playerId][skillName].score_value = value;
    saveScoresToCache();
    updateSyncBadge();
  }

  function updatePlayerNav() {
    var total = state.players.length;
    var idx = state.currentPlayerIndex;
    els.playerCounter.textContent = (idx + 1) + ' / ' + total;
    els.prevPlayerBtn.disabled = idx <= 0;
    els.nextPlayerBtn.disabled = idx >= total - 1;
  }

  els.prevPlayerBtn.addEventListener('click', function() {
    if (state.currentPlayerIndex > 0) openScoringForm(state.currentPlayerIndex - 1);
  });
  els.nextPlayerBtn.addEventListener('click', function() {
    if (state.currentPlayerIndex < state.players.length - 1) openScoringForm(state.currentPlayerIndex + 1);
  });
  els.backToPlayersBtn.addEventListener('click', function() {
    els.playerSearch.value = '';
    renderPlayers();
    updateSyncBadge();
    showScreen('players');
  });

  // Feature 9: Save general notes on change
  els.generalNotesInput.addEventListener('change', function() {
    var player = state.players[state.currentPlayerIndex];
    if (!player) return;
    var playerId = String(player.id || player.player_id);
    try { localStorage.setItem(getNotesKey(playerId), els.generalNotesInput.value); } catch(e) {}
  });

  // ========== SUBMIT SCORES ==========
  els.submitScoresBtn.addEventListener('click', async function() {
    var player = state.players[state.currentPlayerIndex];
    if (!player) return;
    var playerId = String(player.id || player.player_id);
    var playerScores = state.scores[playerId] || {};
    var scoresArray = [];

    state.skills.forEach(function(skill) {
      var skillName = skill.name || skill.skill_name;
      var entry = playerScores[skillName];
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

    // Feature 9: Save general notes
    var notesText = els.generalNotesInput.value.trim();
    if (notesText) {
      try {
        await apiPost('/scoring/notes', { event_id: state.event_id, player_id: playerId, notes: notesText });
      } catch(e) {
        // Notes save failed, not critical
      }
    }

    try {
      if (state.online) {
        showLoading();
        await apiPost('/scoring/scores', {
          evaluator_id: state.evaluator_id,
          event_id: state.event_id,
          scores: scoresArray
        });
      }
      state.submittedPlayers.add(playerId);
      saveScoresToCache();
      showToast(state.online ? 'Scores submitted!' : 'Scores saved offline. Will sync when online.', 'success');

      setTimeout(function() {
        if (state.currentPlayerIndex < state.players.length - 1) {
          openScoringForm(state.currentPlayerIndex + 1);
        } else {
          els.playerSearch.value = '';
          renderPlayers();
          updateSyncBadge();
          showScreen('players');
        }
      }, 800);
    } catch(err) {
      // Feature 7: Save offline
      showToast('Saved offline. Will sync when connected.', 'error');
      saveScoresToCache();
    } finally {
      hideLoading();
      els.submitScoresBtn.disabled = false;
      els.submitScoresBtn.textContent = 'Submit Scores';
    }
  });

  // ========== SYNC CACHED SCORES ==========
  async function syncAllPendingScores() {
    var unsyncedPlayerIds = [];
    for (var pid in state.scores) {
      if (!state.submittedPlayers.has(pid)) {
        var playerScores = state.scores[pid];
        var hasAnyScore = Object.values(playerScores).some(function(s) {
          return s.score_value !== null && s.score_value !== undefined && s.score_value !== '';
        });
        if (hasAnyScore) unsyncedPlayerIds.push(pid);
      }
    }

    for (var i = 0; i < unsyncedPlayerIds.length; i++) {
      var pid = unsyncedPlayerIds[i];
      var playerScores = state.scores[pid];
      var scoresArray = [];
      state.skills.forEach(function(skill) {
        var skillName = skill.name || skill.skill_name;
        var entry = playerScores[skillName];
        if (entry && entry.score_value !== null && entry.score_value !== undefined && entry.score_value !== '') {
          scoresArray.push({ player_id: pid, skill_name: skillName, score_value: entry.score_value, comment: entry.comment || '' });
        }
      });
      if (scoresArray.length > 0) {
        await apiPost('/scoring/scores', { evaluator_id: state.evaluator_id, event_id: state.event_id, scores: scoresArray });
        state.submittedPlayers.add(pid);
      }
    }
    saveScoresToCache();
  }

  els.syncBtn.addEventListener('click', async function() {
    var count = getCachedUnsyncedCount();
    if (count === 0) {
      showToast('All scores are synced.', 'success');
      return;
    }
    if (!state.online) {
      showToast('No internet connection. Scores saved locally.', 'error');
      return;
    }

    showLoading();
    try {
      await syncAllPendingScores();
      showToast(count + ' player(s) synced!', 'success');
    } catch(e) {
      showToast('Sync failed. Try again.', 'error');
    } finally {
      hideLoading();
      updateSyncBadge();
      renderPlayers(els.playerSearch.value);
    }
  });

  // ========== Feature 23: Voice-to-Score ==========
  if (els.voiceRecordBtn) {
    els.voiceRecordBtn.addEventListener('click', function() {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('Voice recognition not supported. Type instead.', 'error');
        return;
      }
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (state.recognition) {
        state.recognition.stop();
        state.recognition = null;
        els.voiceRecordBtn.textContent = 'Start Voice';
        return;
      }
      state.recognition = new SpeechRecognition();
      state.recognition.continuous = true;
      state.recognition.interimResults = true;
      state.recognition.lang = 'en-US';
      els.voiceRecordBtn.textContent = 'Stop Voice';
      state.recognition.onresult = function(event) {
        var transcript = '';
        for (var i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        els.voiceInput.value = transcript;
      };
      state.recognition.onerror = function() {
        els.voiceRecordBtn.textContent = 'Start Voice';
        state.recognition = null;
      };
      state.recognition.onend = function() {
        els.voiceRecordBtn.textContent = 'Start Voice';
        state.recognition = null;
      };
      state.recognition.start();
    });
  }

  if (els.voiceParseBtn) {
    els.voiceParseBtn.addEventListener('click', async function() {
      var text = els.voiceInput.value.trim();
      if (!text) { showToast('Enter some text to parse.', 'error'); return; }

      showLoading();
      try {
        var result = await apiPost('/scoring/parse-natural', { text: text, event_id: state.event_id });
        var html = '<div class="voice-result-card">';
        if (result.player_name) html += '<p><strong>Player:</strong> ' + escapeHtml(result.player_name) + '</p>';
        if (result.scores && result.scores.length > 0) {
          html += '<ul>';
          result.scores.forEach(function(s) {
            html += '<li>' + escapeHtml(s.skill_name) + ': <strong>' + s.score_value + '</strong></li>';
          });
          html += '</ul>';
        }
        if (result.notes) html += '<p><em>' + escapeHtml(result.notes) + '</em></p>';
        html += '</div>';
        els.voiceResults.innerHTML = html;
        els.voiceResults.classList.remove('hidden');
      } catch(e) {
        showToast('Parse failed: ' + e.message, 'error');
      } finally {
        hideLoading();
      }
    });
  }

  // ========== Helpers ==========
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function getInitials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  function formatDate(dateStr) {
    try {
      var d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch(e) { return dateStr; }
  }

  function formatSkillType(type) {
    var map = { scale_1_5: '1-5', scale_1_10: '1-10', timed_seconds: 'Time', numeric: 'Number', pass_fail: 'P/F' };
    return map[type] || type;
  }

  // ========== Init ==========
  showScreen('login');
  els.accessCodeInput.focus();
  updateOnlineStatus();

  // On page load, check for unsynced scores
  window.addEventListener('load', function() {
    // Check all localStorage keys for pending scores
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        try {
          var data = JSON.parse(localStorage.getItem(key));
          var submitted = new Set(data.submittedPlayers || []);
          var scores = data.scores || {};
          var pending = Object.keys(scores).filter(function(pid) { return !submitted.has(pid); }).length;
          if (pending > 0) {
            showToast('You have ' + pending + ' unsynced scores from a previous session.', 'success');
            break;
          }
        } catch(e) {}
      }
    }
  });
})();

// ============================================================
// AI Narrative Preview — generates AI summary after scoring a player
// ============================================================
(function() {
  // Add "Generate AI Summary" button after submit button
  function addAIButton() {
    var submitBtn = document.getElementById('submit-scores-btn');
    if (!submitBtn || document.getElementById('ai-preview-btn')) return;
    
    var aiBtn = document.createElement('button');
    aiBtn.id = 'ai-preview-btn';
    aiBtn.className = 'ai-preview-btn';
    aiBtn.innerHTML = '<i data-lucide="bot" class="icon-inline"></i> Generate AI Summary';
    aiBtn.style.cssText = 'display:block;width:100%;padding:14px;margin-top:12px;background:#09A1A1;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;';
    aiBtn.onclick = generateAIPreview;
    submitBtn.parentNode.insertBefore(aiBtn, submitBtn.nextSibling);
    
    // Add result container
    var resultDiv = document.createElement('div');
    resultDiv.id = 'ai-preview-result';
    resultDiv.style.cssText = 'display:none;margin-top:16px;padding:20px;background:#f0fafa;border-radius:12px;border:2px solid #09A1A1;';
    aiBtn.parentNode.insertBefore(resultDiv, aiBtn.nextSibling);
  }
  
  async function generateAIPreview() {
    var btn = document.getElementById('ai-preview-btn');
    var resultDiv = document.getElementById('ai-preview-result');
    if (!btn || !resultDiv) return;
    
    // Get current player and event from the page state
    var playerEl = document.querySelector('.player-card.active, .player-item.active, [data-player-id]');
    var eventId = window._currentEventId || document.querySelector('[data-event-id]')?.dataset?.eventId;
    var playerId = window._currentPlayerId || playerEl?.dataset?.playerId;
    
    // Try to get from URL or hidden fields
    if (!eventId) {
      var inputs = document.querySelectorAll('input[name="event_id"], [data-event]');
      inputs.forEach(function(i) { if (i.value || i.dataset.event) eventId = i.value || i.dataset.event; });
    }
    if (!playerId) {
      var inputs = document.querySelectorAll('input[name="player_id"], [data-player]');
      inputs.forEach(function(i) { if (i.value || i.dataset.player) playerId = i.value || i.dataset.player; });
    }
    
    // Fallback: try to extract from the global state object
    if (typeof state !== 'undefined') {
      eventId = eventId || state.currentEventId || state.eventId;
      playerId = playerId || state.currentPlayerId || state.playerId;
    }
    
    if (!eventId || !playerId) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<p style="color:#FA6E82;">Please select a player and score them first.</p>';
      return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="bot" class="icon-inline"></i> Generating...';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<p style="color:#888;">Generating AI narrative...</p>';
    
    try {
      var resp = await fetch('/api/scoring/ai-preview', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({event_id: eventId, player_id: playerId})
      });
      
      if (!resp.ok) {
        var err = await resp.json().catch(function() { return {detail: 'Error'}; });
        throw new Error(err.detail || 'Failed to generate');
      }
      
      var data = await resp.json();
      
      resultDiv.innerHTML = 
        '<h3 style="margin:0 0 8px;color:#09A1A1;font-size:16px;"><i data-lucide="bot" class="icon-inline"></i> AI Evaluation — ' + data.player_name + '</h3>' +
        '<p style="font-size:14px;line-height:1.6;color:#333;margin-bottom:12px;">' + data.narrative + '</p>' +
        '<div style="display:flex;gap:16px;flex-wrap:wrap;">' +
          '<div style="flex:1;min-width:200px;">' +
            '<h4 style="color:#09A1A1;font-size:13px;margin-bottom:6px;"><i data-lucide="zap" class="icon-inline"></i> Strengths</h4>' +
            '<ul style="font-size:13px;color:#555;padding-left:16px;margin:0;">' +
              data.strengths.map(function(s) { return '<li>' + s + '</li>'; }).join('') +
            '</ul>' +
          '</div>' +
          '<div style="flex:1;min-width:200px;">' +
            '<h4 style="color:#FA6E82;font-size:13px;margin-bottom:6px;"><i data-lucide="trending-up" class="icon-inline"></i> Areas to Develop</h4>' +
            '<ul style="font-size:13px;color:#555;padding-left:16px;margin:0;">' +
              data.improvements.map(function(s) { return '<li>' + s + '</li>'; }).join('') +
            '</ul>' +
          '</div>' +
        '</div>' +
        '<p style="margin-top:10px;font-size:12px;color:#888;">Overall Score: ' + data.overall_score + '/5</p>';
      
    } catch(e) {
      resultDiv.innerHTML = '<p style="color:#FA6E82;"><i data-lucide="alert-triangle" class="icon-inline" style="color:currentColor;"></i> ' + e.message + '</p>';
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="bot" class="icon-inline"></i> Generate AI Summary';
  }
  
  // Observe DOM changes to add button when scoring view appears
  var observer = new MutationObserver(function() { addAIButton(); });
  observer.observe(document.body, {childList: true, subtree: true});
  
  // Also try immediately and on load
  addAIButton();
  document.addEventListener('DOMContentLoaded', addAIButton);
  setTimeout(addAIButton, 2000);
})();

// ============================================================
// Voice Recording — coach can record audio notes per player
// ============================================================
(function() {
  var mediaRecorder = null;
  var audioChunks = [];
  var recordingStartTime = null;
  var isRecording = false;
  var timerInterval = null;
  
  function addRecordingUI() {
    var submitBtn = document.getElementById('submit-scores-btn');
    if (!submitBtn || document.getElementById('voice-rec-section')) return;
    
    var section = document.createElement('div');
    section.id = 'voice-rec-section';
    section.style.cssText = 'margin-top:20px;padding:16px;background:#fff;border-radius:12px;border:2px solid #e0e0e0;';
    section.innerHTML = 
      '<h3 style="margin:0 0 12px;font-size:15px;color:#333;"><i data-lucide="mic" class="icon-inline"></i> Voice Notes</h3>' +
      '<p style="font-size:12px;color:#888;margin-bottom:12px;">Record audio feedback for this player. Each recording is saved separately to their report.</p>' +
      '<div id="rec-controls" style="display:flex;gap:10px;align-items:center;margin-bottom:12px;">' +
        '<button id="rec-start-btn" onclick="window._startRecording()" style="padding:12px 20px;background:#c41e3a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;"><i data-lucide="circle" class="icon-inline" style="color:currentColor;"></i> Record</button>' +
        '<span id="rec-timer" style="font-size:18px;font-weight:700;color:#333;display:none;">0:00</span>' +
        '<button id="rec-stop-btn" onclick="window._stopRecording()" style="padding:12px 20px;background:#555;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:none;"><i data-lucide="square" class="icon-inline"></i> Stop & Save</button>' +
      '</div>' +
      '<div id="rec-status" style="font-size:13px;color:#888;margin-bottom:8px;"></div>' +
      '<input type="text" id="rec-label" placeholder="Label (e.g., Dribbling feedback, General notes)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:13px;margin-bottom:12px;font-family:inherit;">' +
      '<div id="rec-list" style="margin-top:8px;"></div>';
    
    submitBtn.parentNode.insertBefore(section, submitBtn);
    
    // Load existing recordings
    loadRecordings();
  }
  
  window._startRecording = async function() {
    try {
      var stream = await navigator.mediaDevices.getUserMedia({audio: true});
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = function(e) {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      
      mediaRecorder.onstop = async function() {
        stream.getTracks().forEach(function(t) { t.stop(); });
        var blob = new Blob(audioChunks, {type: 'audio/webm'});
        var duration = (Date.now() - recordingStartTime) / 1000;
        await saveRecording(blob, duration);
      };
      
      mediaRecorder.start();
      isRecording = true;
      recordingStartTime = Date.now();
      
      document.getElementById('rec-start-btn').style.display = 'none';
      document.getElementById('rec-stop-btn').style.display = 'inline-block';
      document.getElementById('rec-timer').style.display = 'inline';
      document.getElementById('rec-status').textContent = '<i data-lucide="circle" class="icon-inline" style="color:currentColor;"></i> Recording...';
      document.getElementById('rec-status').style.color = '#c41e3a';
      
      // Update timer
      timerInterval = setInterval(function() {
        var elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        var mins = Math.floor(elapsed / 60);
        var secs = elapsed % 60;
        document.getElementById('rec-timer').textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
      }, 1000);
      
    } catch(e) {
      document.getElementById('rec-status').textContent = '<i data-lucide="x-circle" class="icon-inline" style="color:currentColor;"></i> Microphone access denied. Please allow microphone in your browser settings.';
      document.getElementById('rec-status').style.color = '#c41e3a';
    }
  };
  
  window._stopRecording = function() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      clearInterval(timerInterval);
      
      document.getElementById('rec-start-btn').style.display = 'inline-block';
      document.getElementById('rec-stop-btn').style.display = 'none';
      document.getElementById('rec-timer').style.display = 'none';
      document.getElementById('rec-status').textContent = '<i data-lucide="save" class="icon-inline"></i> Saving...';
      document.getElementById('rec-status').style.color = '#09A1A1';
    }
  };
  
  async function saveRecording(blob, durationSec) {
    var reader = new FileReader();
    reader.onloadend = async function() {
      var base64 = reader.result.split(',')[1];
      var label = document.getElementById('rec-label').value.trim() || ('Recording ' + new Date().toLocaleTimeString());
      
      var eventId = window._currentEventId || (typeof state !== 'undefined' ? state.currentEventId : null);
      var playerId = window._currentPlayerId || (typeof state !== 'undefined' ? state.currentPlayerId : null);
      var evalName = (typeof state !== 'undefined' && state.evaluator) ? state.evaluator.name : 'Coach';
      
      if (!eventId || !playerId) {
        document.getElementById('rec-status').textContent = '<i data-lucide="x-circle" class="icon-inline" style="color:currentColor;"></i> Please select a player first';
        return;
      }
      
      try {
        var resp = await fetch('/api/events/' + eventId + '/players/' + playerId + '/recordings', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            audio_data: base64,
            duration_seconds: Math.round(durationSec),
            label: label,
            evaluator_name: evalName
          })
        });
        
        if (resp.ok) {
          var data = await resp.json();
          document.getElementById('rec-status').textContent = '<i data-lucide="check-circle-2" class="icon-inline" style="color:currentColor;"></i> Saved! (' + data.total_recordings + ' recording' + (data.total_recordings > 1 ? 's' : '') + ' total)';
          document.getElementById('rec-status').style.color = '#09A1A1';
          document.getElementById('rec-label').value = '';
          loadRecordings();
        } else {
          document.getElementById('rec-status').textContent = '<i data-lucide="x-circle" class="icon-inline" style="color:currentColor;"></i> Failed to save';
          document.getElementById('rec-status').style.color = '#c41e3a';
        }
      } catch(e) {
        document.getElementById('rec-status').textContent = '<i data-lucide="x-circle" class="icon-inline" style="color:currentColor;"></i> Error: ' + e.message;
      }
    };
    reader.readAsDataURL(blob);
  }
  
  async function loadRecordings() {
    var eventId = window._currentEventId || (typeof state !== 'undefined' ? state.currentEventId : null);
    var playerId = window._currentPlayerId || (typeof state !== 'undefined' ? state.currentPlayerId : null);
    var listEl = document.getElementById('rec-list');
    if (!listEl || !eventId || !playerId) return;
    
    try {
      var resp = await fetch('/api/events/' + eventId + '/players/' + playerId + '/recordings');
      if (!resp.ok) return;
      var data = await resp.json();
      
      if (data.recordings.length === 0) {
        listEl.innerHTML = '<p style="font-size:12px;color:#aaa;">No recordings yet</p>';
        return;
      }
      
      listEl.innerHTML = data.recordings.map(function(r) {
        var mins = Math.floor(r.duration_seconds / 60);
        var secs = r.duration_seconds % 60;
        var timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px;background:#f8f9fa;border-radius:8px;margin-bottom:6px;">' +
          '<button onclick="window._playRecording(\'' + r.id + '\')" style="background:#09A1A1;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px;"><i data-lucide="play" class="icon-inline"></i></button>' +
          '<div style="flex:1;">' +
            '<div style="font-size:13px;font-weight:600;">' + (r.label || 'Recording') + '</div>' +
            '<div style="font-size:11px;color:#888;">' + r.evaluator_name + ' · ' + timeStr + ' · ' + new Date(r.recorded_at).toLocaleDateString() + '</div>' +
          '</div>' +
          '<button onclick="window._deleteRecording(\'' + r.id + '\')" style="background:none;border:none;color:#ccc;cursor:pointer;font-size:16px;"><i data-lucide="trash-2" class="icon-inline"></i></button>' +
        '</div>';
      }).join('');
    } catch(e) { /* ignore */ }
  }
  
  window._playRecording = async function(recordingId) {
    var eventId = window._currentEventId || (typeof state !== 'undefined' ? state.currentEventId : null);
    var playerId = window._currentPlayerId || (typeof state !== 'undefined' ? state.currentPlayerId : null);
    if (!eventId || !playerId) return;
    
    try {
      var resp = await fetch('/api/events/' + eventId + '/players/' + playerId + '/recordings/' + recordingId);
      if (!resp.ok) return;
      var data = await resp.json();
      var audio = new Audio('data:audio/webm;base64,' + data.audio_data);
      audio.play();
    } catch(e) { console.error('Playback error:', e); }
  };
  
  window._deleteRecording = async function(recordingId) {
    if (!confirm('Delete this recording?')) return;
    var eventId = window._currentEventId || (typeof state !== 'undefined' ? state.currentEventId : null);
    var playerId = window._currentPlayerId || (typeof state !== 'undefined' ? state.currentPlayerId : null);
    if (!eventId || !playerId) return;
    
    await fetch('/api/events/' + eventId + '/players/' + playerId + '/recordings/' + recordingId, {method: 'DELETE'});
    loadRecordings();
  };
  
  // Watch for player changes and re-add UI
  var recObserver = new MutationObserver(function() { addRecordingUI(); });
  recObserver.observe(document.body, {childList: true, subtree: true});
  addRecordingUI();
  document.addEventListener('DOMContentLoaded', addRecordingUI);
  setTimeout(addRecordingUI, 2000);
})();
