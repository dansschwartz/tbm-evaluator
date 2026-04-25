/* ============================================================
   TBM Evaluator - Public Report Card Viewer
   Features: Radar chart, PDF download, Previous evaluations,
   Self-assessment comparison, White-label branding
   ============================================================ */

(function () {
  'use strict';

  var dom = {
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    reportContent: document.getElementById('report-content'),
    reportHeader: document.getElementById('report-header'),
    orgLogo: document.getElementById('org-logo'),
    orgName: document.getElementById('org-name'),
    playerPhoto: document.getElementById('player-photo'),
    playerPhotoPlaceholder: document.getElementById('player-photo-placeholder'),
    playerInitials: document.getElementById('player-initials'),
    playerName: document.getElementById('player-name'),
    playerPosition: document.getElementById('player-position'),
    playerAgeGroup: document.getElementById('player-age-group'),
    eventName: document.getElementById('event-name'),
    eventDate: document.getElementById('event-date'),
    eventType: document.getElementById('event-type'),
    overallScore: document.getElementById('overall-score'),
    scoreCircle: document.getElementById('score-circle'),
    rankBadgeCard: document.getElementById('rank-badge-card'),
    rankNumber: document.getElementById('rank-number'),
    rankDescription: document.getElementById('rank-description'),
    skillBarsContainer: document.getElementById('skill-bars-container'),
    radarChart: document.getElementById('radar-chart'),
    aiSummary: document.getElementById('ai-summary'),
    aiSummaryBlock: document.getElementById('ai-summary-block'),
    strengthsList: document.getElementById('strengths-list'),
    improvementsList: document.getElementById('improvements-list'),
    aiRecommendation: document.getElementById('ai-recommendation'),
    recommendationBlock: document.getElementById('recommendation-block'),
    btnPrint: document.getElementById('btn-print'),
    btnShare: document.getElementById('btn-share'),
    shareToast: document.getElementById('share-toast'),
  };

  function getReportIdFromURL() {
    var parts = window.location.pathname.split('/').filter(Boolean);
    var reportIndex = parts.indexOf('report');
    if (reportIndex !== -1 && parts.length > reportIndex + 1) return parts[reportIndex + 1];
    return null;
  }

  function ordinalSuffix(n) {
    var s = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  function showToast(message) {
    dom.shareToast.textContent = message;
    dom.shareToast.classList.add('visible');
    setTimeout(function () { dom.shareToast.classList.remove('visible'); }, 2500);
  }

  function showLoading() { dom.loadingState.style.display = 'flex'; dom.errorState.style.display = 'none'; dom.reportContent.style.display = 'none'; }
  function showError(message) { dom.loadingState.style.display = 'none'; dom.errorState.style.display = 'flex'; dom.reportContent.style.display = 'none'; if (message) dom.errorMessage.textContent = message; }
  function showReport() { dom.loadingState.style.display = 'none'; dom.errorState.style.display = 'none'; dom.reportContent.style.display = 'block'; }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function applyBranding(org) {
    var primaryColor = org.primary_color || '#09A1A1';
    document.documentElement.style.setProperty('--color-primary', primaryColor);
    document.documentElement.style.setProperty('--color-primary-light', hexToRgba(primaryColor, 0.08));
    var r = parseInt(primaryColor.slice(1, 3), 16);
    var g = parseInt(primaryColor.slice(3, 5), 16);
    var b = parseInt(primaryColor.slice(5, 7), 16);
    var darkHex = '#' + Math.max(0, Math.round(r * 0.78)).toString(16).padStart(2, '0') +
      Math.max(0, Math.round(g * 0.78)).toString(16).padStart(2, '0') +
      Math.max(0, Math.round(b * 0.78)).toString(16).padStart(2, '0');
    document.documentElement.style.setProperty('--color-primary-dark', darkHex);
  }

  function renderHeader(data) {
    var org = data.organization;
    dom.orgName.textContent = org.name;
    if (org.logo_url) { dom.orgLogo.src = org.logo_url; dom.orgLogo.alt = org.name + ' logo'; dom.orgLogo.style.display = 'block'; }
    applyBranding(org);
  }

  function renderPlayerInfo(data) {
    var player = data.player;
    var fullName = player.first_name + ' ' + player.last_name;
    dom.playerName.textContent = fullName;
    dom.playerPosition.textContent = player.position;
    dom.playerAgeGroup.textContent = player.age_group;
    if (player.photo_url) {
      dom.playerPhoto.src = player.photo_url;
      dom.playerPhoto.alt = fullName;
      dom.playerPhoto.style.display = 'block';
      dom.playerPhotoPlaceholder.style.display = 'none';
    } else {
      var initials = (player.first_name.charAt(0) || '') + (player.last_name.charAt(0) || '');
      dom.playerInitials.textContent = initials.toUpperCase();
      dom.playerPhoto.style.display = 'none';
      dom.playerPhotoPlaceholder.style.display = 'flex';
    }
    document.title = fullName + ' - Evaluation Report';
  }

  function renderEventInfo(data) {
    var event = data.event;
    dom.eventName.textContent = event.name;
    dom.eventDate.textContent = formatDate(event.event_date);
    dom.eventType.textContent = event.event_type;
  }

  function renderOverallScore(data) {
    dom.overallScore.textContent = data.overall_score.toFixed(2);
  }

  function renderRank(data) {
    if (data.rank != null && data.total_players != null) {
      dom.rankNumber.textContent = data.rank;
      dom.rankDescription.textContent = 'Ranked ' + ordinalSuffix(data.rank) + ' of ' + data.total_players + ' players';
      dom.rankBadgeCard.style.display = 'flex';
    } else {
      dom.rankBadgeCard.style.display = 'none';
    }
  }

  function renderSkillBars(data) {
    var skills = data.skill_scores;
    if (!skills || Object.keys(skills).length === 0) {
      dom.skillBarsContainer.innerHTML = '<p style="color: var(--color-text-muted); font-size: 0.9rem;">No skill scores available.</p>';
      return;
    }

    var primaryColor = (data.organization && data.organization.primary_color) || '#09A1A1';
    var entries = Object.entries(skills).sort(function (a, b) { return b[1] - a[1]; });
    var selfAssessment = data.self_assessment || {};
    var html = '';

    entries.forEach(function (entry) {
      var name = entry[0];
      var score = entry[1];
      var pct = Math.min(100, (score / 5) * 100);
      var selfScore = selfAssessment[name];

      html += '<div class="skill-bar-row">' +
        '<span class="skill-label">' + escapeHtml(name) + '</span>' +
        '<div class="skill-bar-track">' +
        '<div class="skill-bar-fill" style="width: ' + pct + '%; background: ' + primaryColor + ';">' +
        '<span class="skill-bar-value">' + score.toFixed(1) + '</span>' +
        '</div>' +
        '</div>';

      // Feature 12: Show self-assessment comparison
      if (selfScore !== undefined && selfScore !== null) {
        var selfPct = Math.min(100, (selfScore / 5) * 100);
        html += '<div class="skill-bar-track self-bar">' +
          '<div class="skill-bar-fill self-fill" style="width: ' + selfPct + '%;">' +
          '<span class="skill-bar-value">' + parseFloat(selfScore).toFixed(1) + ' (self)</span>' +
          '</div></div>';
      }

      html += '</div>';
    });

    dom.skillBarsContainer.innerHTML = html;
  }

  // Feature 4: Radar Chart with category grouping
  function renderRadarChart(data) {
    var skills = data.skill_scores;
    if (!skills || Object.keys(skills).length < 3) {
      dom.radarChart.style.display = 'none';
      return;
    }

    var canvas = dom.radarChart;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var size = 320;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    var centerX = size / 2;
    var centerY = size / 2;
    var radius = size / 2 - 50;
    var primaryColor = (data.organization && data.organization.primary_color) || '#09A1A1';
    var maxScore = 5;
    var rings = 5;

    // Group by category if template available
    var labels = Object.keys(skills);
    var values = Object.values(skills);
    var count = labels.length;
    var angleStep = (2 * Math.PI) / count;
    var startAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, size, size);

    // Draw grid rings
    for (var ring = 1; ring <= rings; ring++) {
      var ringRadius = (radius / rings) * ring;
      ctx.beginPath();
      for (var j = 0; j < count; j++) {
        var angle = startAngle + j * angleStep;
        var x = centerX + ringRadius * Math.cos(angle);
        var y = centerY + ringRadius * Math.sin(angle);
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = ring === rings ? '#cbd5e1' : '#e8ecf0';
      ctx.lineWidth = ring === rings ? 1.5 : 1;
      ctx.stroke();
    }

    // Draw axis lines
    for (var i = 0; i < count; i++) {
      var angle = startAngle + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
      ctx.strokeStyle = '#dde3ea';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Feature 12: Draw self-assessment polygon if available
    var selfAssessment = data.self_assessment;
    if (selfAssessment && Object.keys(selfAssessment).length >= 3) {
      ctx.beginPath();
      for (var i = 0; i < count; i++) {
        var angle = startAngle + i * angleStep;
        var selfVal = Math.min(selfAssessment[labels[i]] || 0, maxScore) / maxScore;
        var x = centerX + radius * selfVal * Math.cos(angle);
        var y = centerY + radius * selfVal * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(246, 201, 146, 0.15)';
      ctx.fill();
      ctx.strokeStyle = '#F6C992';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw data polygon
    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var angle = startAngle + i * angleStep;
      var val = Math.min(values[i], maxScore) / maxScore;
      var x = centerX + radius * val * Math.cos(angle);
      var y = centerY + radius * val * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = hexToRgba(primaryColor, 0.18);
    ctx.fill();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw data points
    for (var i = 0; i < count; i++) {
      var angle = startAngle + i * angleStep;
      var val = Math.min(values[i], maxScore) / maxScore;
      var x = centerX + radius * val * Math.cos(angle);
      var y = centerY + radius * val * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
      ctx.fillStyle = primaryColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw labels
    ctx.font = '600 11.5px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < count; i++) {
      var angle = startAngle + i * angleStep;
      var labelRadius = radius + 28;
      var x = centerX + labelRadius * Math.cos(angle);
      var y = centerY + labelRadius * Math.sin(angle);
      if (Math.cos(angle) > 0.3) { ctx.textAlign = 'left'; x -= 10; }
      else if (Math.cos(angle) < -0.3) { ctx.textAlign = 'right'; x += 10; }
      else ctx.textAlign = 'center';
      ctx.fillStyle = '#5a6a7e';
      ctx.fillText(labels[i], x, y);
    }
    ctx.textAlign = 'center';
  }

  function renderAISummary(data) {
    if (data.ai_summary) { dom.aiSummary.textContent = data.ai_summary; dom.aiSummaryBlock.style.display = 'block'; }
    else dom.aiSummaryBlock.style.display = 'none';
  }

  function renderStrengths(data) {
    if (!data.ai_strengths || data.ai_strengths.length === 0) { dom.strengthsList.parentElement.style.display = 'none'; return; }
    dom.strengthsList.innerHTML = data.ai_strengths.map(function (s) {
      return '<li><span class="insight-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span><span>' + escapeHtml(s) + '</span></li>';
    }).join('');
  }

  function renderImprovements(data) {
    if (!data.ai_improvements || data.ai_improvements.length === 0) { dom.improvementsList.parentElement.style.display = 'none'; return; }
    dom.improvementsList.innerHTML = data.ai_improvements.map(function (s) {
      return '<li><span class="insight-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></span><span>' + escapeHtml(s) + '</span></li>';
    }).join('');
  }

  function renderRecommendation(data) {
    if (data.ai_recommendation) { dom.aiRecommendation.textContent = data.ai_recommendation; dom.recommendationBlock.style.display = 'block'; }
    else dom.recommendationBlock.style.display = 'none';
  }

  // Feature 2: Previous evaluations
  function renderPreviousReports(data) {
    var container = document.getElementById('previous-reports-section');
    if (!container) return;
    var reports = data.previous_reports;
    if (!reports || reports.length === 0) { container.style.display = 'none'; return; }

    var html = '<h3 class="section-title">Previous Evaluations</h3>';
    html += '<div class="previous-reports-list">';
    reports.forEach(function(r) {
      html += '<a href="' + escapeHtml(r.report_url) + '" class="prev-report-card">' +
        '<div class="prev-report-info">' +
        '<strong>' + escapeHtml(r.event_name) + '</strong>' +
        '<span>' + (r.event_date ? formatDate(r.event_date) : '') + '</span>' +
        '</div>' +
        '<div class="prev-report-score">' +
        '<span class="prev-score-value">' + (r.overall_score ? r.overall_score.toFixed(1) : '--') + '</span>' +
        (r.rank ? '<span class="prev-rank">#' + r.rank + '/' + r.total_players + '</span>' : '') +
        '</div></a>';
    });
    html += '</div>';
    container.innerHTML = html;
    container.style.display = 'block';
  }

  // Feature 22: Progress narrative
  function renderProgressNarrative(data) {
    var container = document.getElementById('progress-narrative-section');
    if (!container) return;
    if (!data.ai_progress_narrative) { container.style.display = 'none'; return; }
    container.innerHTML = '<h3 class="section-title">Progress Update</h3>' +
      '<div class="progress-narrative-block"><p>' + escapeHtml(data.ai_progress_narrative) + '</p></div>';
    container.style.display = 'block';
  }

  function renderReport(data) {
    renderHeader(data);
    renderPlayerInfo(data);
    renderEventInfo(data);
    renderOverallScore(data);
    renderRank(data);
    renderSkillBars(data);
    renderRadarChart(data);
    renderAISummary(data);
    renderStrengths(data);
    renderImprovements(data);
    renderRecommendation(data);
    renderPreviousReports(data);
    renderProgressNarrative(data);
    showReport();
  }

  function setupActions() {
    dom.btnPrint.addEventListener('click', function () { window.print(); });

    dom.btnShare.addEventListener('click', function () {
      var shareData = { title: document.title, text: 'Check out this player evaluation report!', url: window.location.href };
      if (navigator.share) {
        navigator.share(shareData).catch(function () { copyToClipboard(window.location.href); });
      } else {
        copyToClipboard(window.location.href);
      }
    });

    // Feature 18: PDF download button
    var btnPdf = document.getElementById('btn-download-pdf');
    if (btnPdf) {
      btnPdf.addEventListener('click', function () {
        var reportId = getReportIdFromURL();
        if (reportId) {
          window.open('/api/reports/' + encodeURIComponent(reportId) + '/pdf', '_blank');
        }
      });
    }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showToast('Link copied to clipboard'); }).catch(function () { fallbackCopy(text); });
    } else { fallbackCopy(text); }
  }

  function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); showToast('Link copied to clipboard'); } catch (e) { showToast('Could not copy link'); }
    document.body.removeChild(textarea);
  }

  function init() {
    showLoading();
    var reportId = getReportIdFromURL();
    if (!reportId) { showError('Invalid report link.'); return; }

    fetch('/api/reports/' + encodeURIComponent(reportId) + '/public')
      .then(function (response) {
        if (!response.ok) {
          if (response.status === 404) throw new Error('Report not found.');
          throw new Error('Failed to load report.');
        }
        return response.json();
      })
      .then(function (data) { renderReport(data); setupActions(); })
      .catch(function (err) { showError(err.message); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ============================================================
// Voice Recordings on Report Card
// ============================================================
(function() {
  function renderVoiceRecordings(data) {
    if (!data.voice_recordings || data.voice_recordings.length === 0) return;
    
    var container = document.querySelector('.report-card') || document.querySelector('.report-content') || document.body;
    var section = document.createElement('section');
    section.className = 'report-section';
    section.style.cssText = 'margin-top:24px;padding:20px;background:#f8f9fb;border-radius:12px;';
    
    var html = '<h3 style="margin:0 0 12px;font-size:16px;color:#333;"><i data-lucide="mic" class="icon-inline"></i> Coach Voice Notes</h3>';
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    
    data.voice_recordings.forEach(function(r) {
      var mins = Math.floor(r.duration_seconds / 60);
      var secs = r.duration_seconds % 60;
      var timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;
      var dateStr = r.recorded_at ? new Date(r.recorded_at).toLocaleDateString() : '';
      
      html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#fff;border-radius:8px;border:1px solid #eee;">' +
        '<button onclick="playReportRecording(\'' + data.id + '\',\'' + 
        (data.event ? data.event.name : '') + '\',\'' + r.id + '\')" ' +
        'style="background:#09A1A1;color:#fff;border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:14px;flex-shrink:0;"><i data-lucide="play" class="icon-inline"></i></button>' +
        '<div style="flex:1;">' +
          '<div style="font-size:14px;font-weight:600;color:#333;">' + (r.label || 'Voice Note') + '</div>' +
          '<div style="font-size:12px;color:#888;">' + r.evaluator_name + ' · ' + timeStr + (dateStr ? ' · ' + dateStr : '') + '</div>' +
        '</div>' +
      '</div>';
    });
    
    html += '</div>';
    section.innerHTML = html;
    
    // Insert after AI summary or at the end
    var aiSection = document.getElementById('ai-summary-section') || document.querySelector('.ai-summary');
    if (aiSection && aiSection.parentNode) {
      aiSection.parentNode.insertBefore(section, aiSection.nextSibling);
    } else {
      container.appendChild(section);
    }
  }
  
  // Hook into the report render
  var origFetch = window.fetch;
  window.fetch = function() {
    return origFetch.apply(this, arguments).then(function(response) {
      var cloned = response.clone();
      cloned.json().then(function(data) {
        if (data && data.voice_recordings) {
          setTimeout(function() { renderVoiceRecordings(data); }, 500);
        }
      }).catch(function(){});
      return response;
    });
  };
})();

async function playReportRecording(reportId, eventName, recordingId) {
  // We need to get the audio data - construct the URL from report data
  // The public report includes event_id and player_id
  try {
    var reportResp = await fetch('/api/reports/' + reportId + '/public');
    var report = await reportResp.json();
    if (!report.event || !report.player) return;
    
    // Get the recording with audio data
    var eventId = report.event.event_id || '';
    // We need event_id - let's try to get it from the report
    var recResp = await fetch('/api/events/' + reportId + '/players/' + reportId + '/recordings/' + recordingId);
    if (recResp.ok) {
      var rec = await recResp.json();
      var audio = new Audio('data:audio/webm;base64,' + rec.audio_data);
      audio.play();
    }
  } catch(e) {
    console.error('Playback error:', e);
    alert('Unable to play recording');
  }
}

// ============================================================
// Development Plan on Report Card
// ============================================================
(function() {
  function renderDevelopmentPlan(data) {
    if (!data.development_plan) return;
    var plan = data.development_plan;
    
    var container = document.querySelector('.report-card') || document.querySelector('.report-content') || document.body;
    var section = document.createElement('section');
    section.className = 'report-section';
    section.style.cssText = 'margin-top:24px;padding:24px;background:linear-gradient(135deg,#e8f2f2,#fff);border-radius:12px;border:2px solid #09A1A1;';
    
    var html = '<h3 style="margin:0 0 4px;font-size:18px;color:#09A1A1;"><i data-lucide="target" style="width:20px;height:20px;vertical-align:middle;margin-right:6px;"></i>Custom Development Plan</h3>';
    html += '<p style="font-size:12px;color:#888;margin-bottom:16px;">' + (plan.plan_duration || '6 weeks') + ' · Position: ' + (plan.position || 'General') + '</p>';
    
    // AI Narrative
    if (plan.narrative) {
      html += '<div style="padding:14px;background:#fff;border-radius:8px;margin-bottom:16px;border:1px solid #e0e0e0;">';
      html += '<p style="font-size:14px;line-height:1.6;color:#333;margin:0;">' + plan.narrative + '</p>';
      html += '</div>';
    }
    
    // Focus Areas
    if (plan.focus_areas && plan.focus_areas.length) {
      html += '<h4 style="font-size:14px;color:#333;margin:12px 0 8px;"><i data-lucide="crosshair" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"></i>Focus Areas</h4>';
      html += '<ul style="font-size:13px;color:#555;padding-left:20px;margin-bottom:16px;">';
      plan.focus_areas.forEach(function(a) { html += '<li style="margin-bottom:4px;">' + a + '</li>'; });
      html += '</ul>';
    }
    
    // Drills
    if (plan.drills && plan.drills.length) {
      html += '<h4 style="font-size:14px;color:#333;margin:12px 0 8px;"><i data-lucide="dumbbell" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"></i>Recommended Drills</h4>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">';
      plan.drills.forEach(function(d) {
        var priorityColor = d.priority === "high" ? "#FA6E82" : "#F6C992";
        html += '<div style="padding:12px;background:#fff;border-radius:8px;border:1px solid #eee;border-left:4px solid ' + priorityColor + ';">';
        html += '<div style="font-size:13px;font-weight:700;color:#333;">' + d.name + '</div>';
        html += '<div style="font-size:12px;color:#888;margin:4px 0;">' + (d.skill_target || '') + ' · ' + (d.duration || '') + ' · ' + (d.frequency || '') + '</div>';
        html += '<div style="font-size:12px;color:#555;">' + d.description + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    
    // Weekly Schedule
    if (plan.weekly_schedule) {
      var sched = plan.weekly_schedule;
      var hasSched = (sched.monday && sched.monday.length) || (sched.wednesday && sched.wednesday.length) || (sched.friday && sched.friday.length);
      if (hasSched) {
        html += '<h4 style="font-size:14px;color:#333;margin:16px 0 8px;"><i data-lucide="calendar" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"></i>Weekly Schedule</h4>';
        html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">';
        ["monday","wednesday","friday"].forEach(function(day) {
          if (sched[day] && sched[day].length) {
            html += '<div style="flex:1;min-width:150px;padding:10px;background:#fff;border-radius:8px;border:1px solid #eee;">';
            html += '<div style="font-size:12px;font-weight:700;color:#09A1A1;text-transform:capitalize;margin-bottom:4px;">' + day + '</div>';
            sched[day].forEach(function(drill) { html += '<div style="font-size:12px;color:#555;">• ' + drill + '</div>'; });
            html += '</div>';
          }
        });
        if (sched.daily && sched.daily.length) {
          html += '<div style="flex:1;min-width:150px;padding:10px;background:#fff;border-radius:8px;border:1px solid #eee;">';
          html += '<div style="font-size:12px;font-weight:700;color:#F6C992;">Daily</div>';
          sched.daily.forEach(function(drill) { html += '<div style="font-size:12px;color:#555;">• ' + drill + '</div>'; });
          html += '</div>';
        }
        html += '</div>';
      }
    }
    
    section.innerHTML = html;
    
    // Insert after AI section
    var aiSection = document.getElementById('ai-summary-section') || document.querySelector('.ai-summary');
    if (aiSection && aiSection.parentNode) {
      aiSection.parentNode.insertBefore(section, aiSection.nextSibling);
    } else {
      container.appendChild(section);
    }
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  
  // Hook into report data
  var _origFetch2 = window.fetch;
  window.fetch = function() {
    return _origFetch2.apply(this, arguments).then(function(response) {
      var cloned = response.clone();
      cloned.json().then(function(data) {
        if (data && data.development_plan) {
          setTimeout(function() { renderDevelopmentPlan(data); }, 600);
        }
      }).catch(function(){});
      return response;
    });
  };
})();
