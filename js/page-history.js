var PageHistory = {
  _chart: null,
  _viewUser: null,
  _colors: {
    productive: '#52C41A',
    other: '#2196F3',
    interruption: '#8B1E1E',
    interruptionText: '#6E1A1A',
    pause: '#E0E0E0'
  },

  render: function(container) {
    var currentUser = Auth.getCurrentUser();
    var canViewAllUsers = currentUser === 'Lin';
    var userOptions = canViewAllUsers ? Store.getUsers() : [currentUser];
    if (!canViewAllUsers) {
      this._viewUser = currentUser;
    } else if (!this._viewUser || userOptions.indexOf(this._viewUser) === -1) {
      this._viewUser = currentUser;
    }
    var viewingUser = this._viewUser || currentUser;
    var dates = Store.getDatesWithRecords(viewingUser);
    var self = this;

    var userPickerHtml = '';
    if (canViewAllUsers) {
      userPickerHtml =
        '<div class="history-user-row">' +
          '<label for="pick-user">查看用户</label>' +
          '<select id="pick-user">' +
            userOptions.map(function(name) {
              return '<option value="' + name + '"' + (name === viewingUser ? ' selected' : '') + '>' + name + '</option>';
            }).join('') +
          '</select>' +
        '</div>';
    }

    container.innerHTML =
      '<div class="history-page">' +
        '<h2 class="history-title">历史记录</h2>' +
        userPickerHtml +
        '<div class="date-picker-row">' +
          '<select id="pick-year"></select><span>年</span>' +
          '<select id="pick-month"></select><span>月</span>' +
          '<select id="pick-day"></select><span>日</span>' +
        '</div>' +
        '<div class="chart-legend">' +
          '<div class="chart-legend-item"><div class="chart-legend-dot" style="background:' + this._colors.productive + '"></div>正事</div>' +
          '<div class="chart-legend-item"><div class="chart-legend-dot" style="background:' + this._colors.other + '"></div>其它</div>' +
          '<div class="chart-legend-item interruption"><div class="chart-legend-dot" style="background:' + this._colors.interruption + '"></div>中断</div>' +
          '<div class="chart-legend-item"><div class="chart-legend-dot" style="background:' + this._colors.pause + '"></div>暂停</div>' +
        '</div>' +
        '<div class="chart-container" id="chart-container">' +
          '<canvas id="timeline-canvas"></canvas>' +
        '</div>' +
        '<div class="history-stats" id="history-stats"></div>' +
        '<div class="records-section" id="records-section"></div>' +
      '</div>';

    if (canViewAllUsers) {
      document.getElementById('pick-user').addEventListener('change', function() {
        self._viewUser = this.value;
        self.render(container);
      });
    }

    // Determine default date
    var defaultDate = dates.length > 0 ? dates[dates.length - 1] : Utils.todayStr();

    this._initDatePickers(defaultDate, dates);
    this._loadDate(defaultDate);
  },

  _initDatePickers: function(defaultDate, availableDates) {
    var parts = defaultDate.split('-');
    var year = parseInt(parts[0]);
    var month = parseInt(parts[1]);
    var day = parseInt(parts[2]);

    var pickYear = document.getElementById('pick-year');
    var pickMonth = document.getElementById('pick-month');
    var pickDay = document.getElementById('pick-day');

    // Year: from 2024 to current+1
    var currentYear = new Date().getFullYear();
    for (var y = currentYear + 1; y >= 2024; y--) {
      var opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === year) opt.selected = true;
      pickYear.appendChild(opt);
    }

    // Month
    for (var m = 1; m <= 12; m++) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === month) opt.selected = true;
      pickMonth.appendChild(opt);
    }

    // Day
    this._updateDays(year, month, day);

    var self = this;
    var onChange = function() {
      var y = parseInt(pickYear.value);
      var m = parseInt(pickMonth.value);
      self._updateDays(y, m);
      var d = parseInt(pickDay.value);
      var dateStr = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      self._loadDate(dateStr);
    };

    pickYear.addEventListener('change', onChange);
    pickMonth.addEventListener('change', onChange);
    pickDay.addEventListener('change', function() {
      var y = parseInt(pickYear.value);
      var m = parseInt(pickMonth.value);
      var d = parseInt(pickDay.value);
      var dateStr = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      self._loadDate(dateStr);
    });
  },

  _updateDays: function(year, month, selectedDay) {
    var pickDay = document.getElementById('pick-day');
    var daysInMonth = new Date(year, month, 0).getDate();
    pickDay.innerHTML = '';
    for (var d = 1; d <= daysInMonth; d++) {
      var opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      if (d === selectedDay) opt.selected = true;
      pickDay.appendChild(opt);
    }
  },

  _loadDate: function(dateStr) {
    var user = this._viewUser || Auth.getCurrentUser();
    var records = Store.getRecords(user, dateStr);

    // Sort by start time
    records.sort(function(a, b) { return a.startTime - b.startTime; });

    this._renderStats(records);
    this._renderChart(records, dateStr);
    this._renderRecords(records, user, Auth.getCurrentUser() === user);
  },

  _renderStats: function(records) {
    var container = document.getElementById('history-stats');
    var productiveTotal = 0;
    var interruptTotal = 0;
    var otherTotal = 0;

    records.forEach(function(r) {
      if (r.type === 'productive') {
        productiveTotal += (r.productiveDuration || 0);
        interruptTotal += (r.interruptionDuration || 0);
      } else {
        otherTotal += (r.productiveDuration || 0);
      }
    });

    container.innerHTML =
      '<div class="stat-item">' +
        '<div class="stat-label">正事总时长</div>' +
        '<div class="stat-value productive">' + Utils.formatDuration(productiveTotal) + '</div>' +
      '</div>' +
      '<div class="stat-item">' +
        '<div class="stat-label">中断总时长</div>' +
        '<div class="stat-value interruption">' + Utils.formatDuration(interruptTotal) + '</div>' +
      '</div>' +
      '<div class="stat-item">' +
        '<div class="stat-label">其它总时长</div>' +
        '<div class="stat-value other">' + Utils.formatDuration(otherTotal) + '</div>' +
      '</div>';
  },

  _renderChart: function(records, dateStr) {
    var chartContainer = document.getElementById('chart-container');
    if (!chartContainer) return;

    if (records.length === 0) {
      if (this._chart) {
        this._chart.destroy();
        this._chart = null;
      }
      chartContainer.innerHTML = '<div class="no-records">该日期暂无记录</div>';
      chartContainer.style.height = '';
      return;
    }

    if (!document.getElementById('timeline-canvas')) {
      chartContainer.innerHTML = '<canvas id="timeline-canvas"></canvas>';
    }

    var canvas = document.getElementById('timeline-canvas');
    if (!canvas) return;

    // Destroy previous chart
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }

    var datasets = [];
    var labels = [];
    var barColors = [];

    records.forEach(function(record, idx) {
      var label = record.description || '未命名';
      labels.push(label);

      // Main productive/other bar segments
      // We need to build segments excluding pauses and interruptions
      var color = record.type === 'productive' ? PageHistory._colors.productive : PageHistory._colors.other;

      // Add main bar
      datasets.push({
        label: label,
        data: PageHistory._buildBarData(idx, records.length, record.startTime, record.endTime),
        backgroundColor: color,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.6,
        categoryPercentage: 0.8,
        order: 2
      });

      // Overlay interruptions
      if (record.interruptions) {
        record.interruptions.forEach(function(intr) {
          datasets.push({
            label: '中断: ' + (intr.reason || ''),
            data: PageHistory._buildBarData(idx, records.length, intr.start, intr.end),
            backgroundColor: PageHistory._colors.interruption,
            borderRadius: 2,
            borderSkipped: false,
            barPercentage: 0.6,
            categoryPercentage: 0.8,
            order: 1
          });
        });
      }

      // Overlay pauses
      if (record.pauses) {
        record.pauses.forEach(function(p) {
          if (p.start && p.end) {
            datasets.push({
              label: '暂停',
              data: PageHistory._buildBarData(idx, records.length, p.start, p.end),
              backgroundColor: PageHistory._colors.pause,
              borderRadius: 2,
              borderSkipped: false,
              barPercentage: 0.6,
              categoryPercentage: 0.8,
              order: 1
            });
          }
        });
      }
    });

    // Parse date for axis range
    var dayStart = new Date(dateStr + 'T00:00:00').getTime();
    var dayEnd = new Date(dateStr + 'T23:59:59').getTime();

    // Find actual min/max from records for better zoom
    var minTime = records[0].startTime;
    var maxTime = records[records.length - 1].endTime;
    // Add some padding (30 min)
    var pad = 30 * 60 * 1000;
    var xMin = Math.max(dayStart, minTime - pad);
    var xMax = Math.min(dayEnd, maxTime + pad);

    this._chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                var ds = ctx.dataset;
                var raw = ds.data[ctx.dataIndex];
                if (!raw || raw[0] === null) return '';
                var start = Utils.formatTime(raw[0]);
                var end = Utils.formatTime(raw[1]);
                var dur = Utils.formatDuration(raw[1] - raw[0]);
                return ds.label + ': ' + start + ' - ' + end + ' (' + dur + ')';
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            min: xMin,
            max: xMax,
            time: {
              unit: 'hour',
              displayFormats: { hour: 'HH:mm', minute: 'HH:mm' },
              tooltipFormat: 'HH:mm'
            },
            grid: {
              color: '#F0F0F0'
            },
            ticks: {
              font: { size: 12 }
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              font: { size: 13 },
              autoSkip: false
            }
          }
        }
      }
    });

    // Adjust canvas height based on record count
    var height = Math.max(200, records.length * 60 + 80);
    canvas.parentElement.style.height = height + 'px';
    canvas.style.height = height + 'px';
  },

  _buildBarData: function(idx, total, start, end) {
    // Build array with nulls for all positions except idx
    var arr = [];
    for (var i = 0; i < total; i++) {
      if (i === idx) {
        arr.push([start, end]);
      } else {
        arr.push(null);
      }
    }
    return arr;
  },

  _renderRecords: function(records, user, canEdit) {
    var container = document.getElementById('records-section');
    if (records.length === 0) {
      container.innerHTML = '';
      return;
    }

    var html = '<h3>记录详情</h3>';
    records.forEach(function(record) {
      var timeRange = Utils.formatTime(record.startTime) + ' - ' + Utils.formatTime(record.endTime);
      var typeBadgeClass = canEdit ? ' clickable' : '';
      var typeBadge = record.type === 'productive'
        ? '<span class="record-type-badge productive' + typeBadgeClass + '" data-id="' + record.id + '" data-type="' + record.type + '">正事</span>'
        : '<span class="record-type-badge other' + typeBadgeClass + '" data-id="' + record.id + '" data-type="' + record.type + '">其它</span>';
      var duration = Utils.formatDuration(record.productiveDuration || 0);

      html +=
        '<div class="record-item" data-id="' + record.id + '">' +
          typeBadge +
          '<span class="record-time">' + timeRange + '</span>' +
          '<span class="record-desc' + (canEdit ? '' : ' readonly') + '" data-id="' + record.id + '">' + (record.description || '') + '</span>' +
          '<span class="record-duration">' + duration + '</span>' +
        '</div>';
    });

    container.innerHTML = html;

    if (!canEdit) {
      return;
    }

    var attachDescEditor = function(el) {
      el.addEventListener('click', function onDescClick() {
        var id = el.getAttribute('data-id');
        var currentText = el.textContent;
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'record-desc-input';
        input.value = currentText;
        el.replaceWith(input);
        input.focus();
        input.select();

        var save = function() {
          var newText = input.value.trim() || currentText;
          if (!Store.updateRecord(user, id, { description: newText })) {
            Toast.show(Store.getLastErrorMessage() || '更新失败');
            input.focus();
            return;
          }
          if (newText !== currentText) {
            Store.addSuggestion(user, newText);
          }
          var span = document.createElement('span');
          span.className = 'record-desc';
          span.setAttribute('data-id', id);
          span.textContent = newText;
          input.replaceWith(span);
          attachDescEditor(span);
          Toast.show('已更新');
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            input.blur();
          } else if (e.key === 'Escape') {
            input.value = currentText;
            input.blur();
          }
        });
      });
    };

    // Inline edit description
    container.querySelectorAll('.record-desc').forEach(function(el) {
      attachDescEditor(el);
    });

    // Toggle type badge
    container.querySelectorAll('.record-type-badge.clickable').forEach(function(badge) {
      badge.addEventListener('click', function() {
        var id = badge.getAttribute('data-id');
        var currentType = badge.getAttribute('data-type');
        var newType = currentType === 'productive' ? 'other' : 'productive';
        if (!Store.updateRecord(user, id, { type: newType })) {
          Toast.show(Store.getLastErrorMessage() || '更新失败');
          return;
        }
        badge.setAttribute('data-type', newType);
        badge.className = 'record-type-badge ' + (newType === 'productive' ? 'productive' : 'other') + ' clickable';
        badge.textContent = newType === 'productive' ? '正事' : '其它';
        Toast.show('已更新');
      });
    });
  }
};
