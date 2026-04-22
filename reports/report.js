/* ============================================================
   TBM Evaluator - Public Report Card Viewer
   ============================================================ */

(function () {
  'use strict';

  // ---- DOM References ----
  const dom = {
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

  // ---- Utility Functions ----

  function getReportIdFromURL() {
    // Expected: /report/{report_id}
    const parts = window.location.pathname.split('/').filter(Boolean);
    // Find the part after "report"
    const reportIndex = parts.indexOf('report');
    if (reportIndex !== -1 && parts.length > reportIndex + 1) {
      return parts[reportIndex + 1];
    }
    return null;
  }

  function ordinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  function showToast(message) {
    dom.shareToast.textContent = message;
    dom.shareToast.classList.add('visible');
    setTimeout(function () {
      dom.shareToast.classList.remove('visible');
    }, 2500);
  }

  // ---- Show / Hide States ----

  function showLoading() {
    dom.loadingState.style.display = 'flex';
    dom.errorState.style.display = 'none';
    dom.reportContent.style.display = 'none';
  }

  function showError(message) {
    dom.loadingState.style.display = 'none';
    dom.errorState.style.display = 'flex';
    dom.reportContent.style.display = 'none';
    if (message) {
      dom.errorMessage.textContent = message;
    }
  }

  function showReport() {
    dom.loadingState.style.display = 'none';
    dom.errorState.style.display = 'none';
    dom.reportContent.style.display = 'block';
  }

  // ---- Apply Organization Branding ----

  function applyBranding(org) {
    var primaryColor = org.primary_color || '#09A1A1';

    // Set CSS custom property for primary color
    document.documentElement.style.setProperty('--color-primary', primaryColor);

    // Compute a lighter shade for backgrounds
    document.documentElement.style.setProperty(
      '--color-primary-light',
      hexToRgba(primaryColor, 0.08)
    );

    // Darker shade
    var r = parseInt(primaryColor.slice(1, 3), 16);
    var g = parseInt(primaryColor.slice(3, 5), 16);
    var b = parseInt(primaryColor.slice(5, 7), 16);
    var darkR = Math.max(0, Math.round(r * 0.78));
    var darkG = Math.max(0, Math.round(g * 0.78));
    var darkB = Math.max(0, Math.round(b * 0.78));
    var darkHex =
      '#' +
      darkR.toString(16).padStart(2, '0') +
      darkG.toString(16).padStart(2, '0') +
      darkB.toString(16).padStart(2, '0');
    document.documentElement.style.setProperty('--color-primary-dark', darkHex);
  }

  // ---- Render Functions ----

  function renderHeader(data) {
    var org = data.organization;
    dom.orgName.textContent = org.name;

    if (org.logo_url) {
      dom.orgLogo.src = org.logo_url;
      dom.orgLogo.alt = org.name + ' logo';
      dom.orgLogo.style.display = 'block';
    }

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
      var initials =
        (player.first_name.charAt(0) || '') +
        (player.last_name.charAt(0) || '');
      dom.playerInitials.textContent = initials.toUpperCase();
      dom.playerPhoto.style.display = 'none';
      dom.playerPhotoPlaceholder.style.display = 'flex';
    }

    // Set page title
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
      dom.rankDescription.textContent =
        'Ranked ' +
        ordinalSuffix(data.rank) +
        ' of ' +
        data.total_players +
        ' players';
      dom.rankBadgeCard.style.display = 'flex';
    } else {
      dom.rankBadgeCard.style.display = 'none';
    }
  }

  function renderSkillBars(data) {
    var skills = data.skill_scores;
    if (!skills || Object.keys(skills).length === 0) {
      dom.skillBarsContainer.innerHTML =
        '<p style="color: var(--color-text-muted); font-size: 0.9rem;">No skill scores available.</p>';
      return;
    }

    var primaryColor = (data.organization && data.organization.primary_color) || '#09A1A1';
    var entries = Object.entries(skills).sort(function (a, b) {
      return b[1] - a[1];
    });
    var html = '';

    entries.forEach(function (entry) {
      var name = entry[0];
      var score = entry[1];
      var pct = Math.min(100, (score / 5) * 100);
      html +=
        '<div class="skill-bar-row">' +
        '<span class="skill-label">' + escapeHtml(name) + '</span>' +
        '<div class="skill-bar-track">' +
        '<div class="skill-bar-fill" style="width: ' + pct + '%; background: ' + primaryColor + ';">' +
        '<span class="skill-bar-value">' + score.toFixed(1) + '</span>' +
        '</div>' +
        '</div>' +
        '</div>';
    });

    dom.skillBarsContainer.innerHTML = html;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

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
    var labels = Object.keys(skills);
    var values = Object.values(skills);
    var count = labels.length;
    var angleStep = (2 * Math.PI) / count;
    var startAngle = -Math.PI / 2;
    var primaryColor = (data.organization && data.organization.primary_color) || '#09A1A1';
    var maxScore = 5;
    var rings = 5;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Draw grid rings
    for (var ring = 1; ring <= rings; ring++) {
      var ringRadius = (radius / rings) * ring;
      ctx.beginPath();
      for (var j = 0; j < count; j++) {
        var angle = startAngle + j * angleStep;
        var x = centerX + ringRadius * Math.cos(angle);
        var y = centerY + ringRadius * Math.sin(angle);
        if (j === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
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
      ctx.lineTo(
        centerX + radius * Math.cos(angle),
        centerY + radius * Math.sin(angle)
      );
      ctx.strokeStyle = '#dde3ea';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw data polygon
    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var angle = startAngle + i * angleStep;
      var val = Math.min(values[i], maxScore) / maxScore;
      var x = centerX + radius * val * Math.cos(angle);
      var y = centerY + radius * val * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
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

      // Adjust alignment based on position
      if (Math.cos(angle) > 0.3) {
        ctx.textAlign = 'left';
        x -= 10;
      } else if (Math.cos(angle) < -0.3) {
        ctx.textAlign = 'right';
        x += 10;
      } else {
        ctx.textAlign = 'center';
      }

      ctx.fillStyle = '#5a6a7e';
      ctx.fillText(labels[i], x, y);
    }

    ctx.textAlign = 'center';
  }

  function renderAISummary(data) {
    if (data.ai_summary) {
      dom.aiSummary.textContent = data.ai_summary;
      dom.aiSummaryBlock.style.display = 'block';
    } else {
      dom.aiSummaryBlock.style.display = 'none';
    }
  }

  function renderStrengths(data) {
    if (!data.ai_strengths || data.ai_strengths.length === 0) {
      dom.strengthsList.parentElement.style.display = 'none';
      return;
    }

    var html = '';
    data.ai_strengths.forEach(function (strength) {
      html +=
        '<li>' +
        '<span class="insight-icon">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
        '</span>' +
        '<span>' + escapeHtml(strength) + '</span>' +
        '</li>';
    });
    dom.strengthsList.innerHTML = html;
  }

  function renderImprovements(data) {
    if (!data.ai_improvements || data.ai_improvements.length === 0) {
      dom.improvementsList.parentElement.style.display = 'none';
      return;
    }

    var html = '';
    data.ai_improvements.forEach(function (improvement) {
      html +=
        '<li>' +
        '<span class="insight-icon">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>' +
        '</span>' +
        '<span>' + escapeHtml(improvement) + '</span>' +
        '</li>';
    });
    dom.improvementsList.innerHTML = html;
  }

  function renderRecommendation(data) {
    if (data.ai_recommendation) {
      dom.aiRecommendation.textContent = data.ai_recommendation;
      dom.recommendationBlock.style.display = 'block';
    } else {
      dom.recommendationBlock.style.display = 'none';
    }
  }

  // ---- Render All Sections ----

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
    showReport();
  }

  // ---- Event Handlers ----

  function setupActions() {
    dom.btnPrint.addEventListener('click', function () {
      window.print();
    });

    dom.btnShare.addEventListener('click', function () {
      var shareData = {
        title: document.title,
        text: 'Check out this player evaluation report!',
        url: window.location.href,
      };

      if (navigator.share) {
        navigator.share(shareData).catch(function () {
          // User cancelled or share failed, fall back to clipboard
          copyToClipboard(window.location.href);
        });
      } else {
        copyToClipboard(window.location.href);
      }
    });
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('Link copied to clipboard');
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Link copied to clipboard');
    } catch (e) {
      showToast('Could not copy link');
    }
    document.body.removeChild(textarea);
  }

  // ---- Fetch and Initialize ----

  function init() {
    showLoading();

    var reportId = getReportIdFromURL();

    if (!reportId) {
      showError('Invalid report link. No report ID found in the URL.');
      return;
    }

    var apiUrl = '/api/reports/' + encodeURIComponent(reportId) + '/public';

    fetch(apiUrl)
      .then(function (response) {
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('This report could not be found. It may have been removed or the link may be incorrect.');
          }
          throw new Error('Something went wrong while loading this report. Please try again later.');
        }
        return response.json();
      })
      .then(function (data) {
        renderReport(data);
        setupActions();
      })
      .catch(function (err) {
        showError(err.message);
      });
  }

  // ---- Start ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
