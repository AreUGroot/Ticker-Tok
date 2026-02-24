var PageTimer = {
  // Keep engine instances alive across page switches
  _engines: {},

  _getEngine: function(type) {
    if (!this._engines[type]) {
      var engineType = type;
      this._engines[type] = new TimerEngine({
        type: type,
        onTick: function(elapsed) {
          PageTimer._updateDisplayFor(engineType, elapsed);
        },
        onStateChange: function(state) {
          PageTimer._updateStateFor(engineType, state);
        }
      });
    }
    return this._engines[type];
  },

  render: function(container) {
    var svgPlay = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
    var svgPause = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>';
    var svgStop = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';

    container.innerHTML =
      '<div class="timer-page">' +
        '<div class="timer-page-head">' +
          '<div>' +
            '<h2 class="timer-title">正事计时</h2>' +
            '<p class="timer-subtitle">正事计时在上方，其它计时在下方；两个计时器互不影响。</p>' +
          '</div>' +
          '<button class="btn btn-secondary supplement-btn" id="btn-supplement">补充时段</button>' +
        '</div>' +
        this._renderPanel('productive', '正事计时', true, svgPlay, svgPause, svgStop) +
        this._renderPanel('other', '其它计时', false, svgPlay, svgPause, svgStop) +
      '</div>';

    this._bindPanel('productive');
    this._bindPanel('other');
    document.getElementById('btn-supplement').addEventListener('click', function() {
      PageTimer._showSupplementDialog();
    });

    this._restorePanel('productive');
    this._restorePanel('other');
  },

  _renderPanel: function(type, title, showInterrupt, svgPlay, svgPause, svgStop) {
    var suffix = type;
    return (
      '<section class="timer-panel timer-panel-' + suffix + '">' +
        '<div class="timer-panel-head">' +
          '<h3 class="timer-panel-title">' + title + '</h3>' +
          '<span class="timer-panel-badge ' + suffix + '">' + (type === 'productive' ? '可中断汇报' : '普通计时') + '</span>' +
        '</div>' +
        '<div class="timer-display" id="timer-display-' + suffix + '">00:00:00</div>' +
        '<div class="timer-status" id="timer-status-' + suffix + '"></div>' +
        '<div class="timer-controls">' +
          '<button class="timer-btn start-btn" id="btn-start-' + suffix + '" title="开始">' + svgPlay + '</button>' +
          '<button class="timer-btn pause-btn" id="btn-pause-' + suffix + '" title="暂停">' + svgPause + '</button>' +
          '<button class="timer-btn stop-btn" id="btn-stop-' + suffix + '" title="停止">' + svgStop + '</button>' +
        '</div>' +
        (showInterrupt
          ? '<button class="interrupt-btn" id="btn-interrupt-' + suffix + '" disabled>中断汇报</button>'
          : '<div class="timer-panel-footnote">其它计时不记录中断汇报</div>') +
      '</section>'
    );
  },

  _bindPanel: function(type) {
    var engine = this._getEngine(type);
    var suffix = type;

    document.getElementById('btn-start-' + suffix).addEventListener('click', function() {
      engine.start();
    });
    document.getElementById('btn-pause-' + suffix).addEventListener('click', function() {
      engine.pause();
    });
    document.getElementById('btn-stop-' + suffix).addEventListener('click', function() {
      if (engine.state === 'idle') {
        Toast.show('计时器未启动');
        return;
      }
      if (engine.state === 'stopped') {
        Toast.show('已经停止了');
        return;
      }
      engine.stop();
      PageTimer._showStopDialog(engine);
    });

    if (type === 'productive') {
      document.getElementById('btn-interrupt-' + suffix).addEventListener('click', function() {
        PageTimer._showInterruptDialog(engine);
      });
    }
  },

  _restorePanel: function(type) {
    var engine = this._getEngine(type);
    this._updateStateFor(type, engine.state);

    if (engine.state === 'running' || engine.state === 'paused') {
      this._updateDisplayFor(type, engine.getElapsed());
      if (engine.state === 'running') {
        // Re-attach visible page ticker updates for this engine
        engine._startTicking();
      }
      return;
    }

    if (engine.state === 'stopped') {
      this._updateDisplayFor(type, engine.getElapsed());
    } else {
      this._updateDisplayFor(type, { productive: 0 });
    }
  },

  _updateDisplayFor: function(type, elapsed) {
    var el = document.getElementById('timer-display-' + type);
    if (el) {
      el.textContent = Utils.formatTimer((elapsed && elapsed.productive) || 0);
    }
  },

  _updateStateFor: function(type, state) {
    var display = document.getElementById('timer-display-' + type);
    var status = document.getElementById('timer-status-' + type);
    var interruptBtn = document.getElementById('btn-interrupt-' + type);

    if (!display) return;

    display.classList.remove('running', 'paused');
    var statusText = '';
    switch (state) {
      case 'running':
        display.classList.add('running');
        statusText = '计时中...';
        if (interruptBtn) interruptBtn.disabled = false;
        break;
      case 'paused':
        display.classList.add('paused');
        statusText = '已暂停';
        if (interruptBtn) interruptBtn.disabled = true;
        break;
      case 'idle':
        statusText = '准备开始';
        if (interruptBtn) interruptBtn.disabled = true;
        break;
      case 'stopped':
        statusText = '已停止';
        if (interruptBtn) interruptBtn.disabled = true;
        break;
    }
    if (status) status.textContent = statusText;
  },

  _showInterruptDialog: function(engine) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal">' +
        '<h3>中断汇报</h3>' +
        '<label>中断时长</label>' +
        '<div class="range-container">' +
          '<input type="range" id="interrupt-slider" min="1" max="60" value="5">' +
          '<span class="range-value" id="interrupt-value">5分钟</span>' +
        '</div>' +
        '<label>中断原因</label>' +
        '<input type="text" id="interrupt-reason" placeholder="请输入中断原因">' +
        '<div class="modal-actions">' +
          '<button class="btn btn-secondary" id="interrupt-cancel">取消</button>' +
          '<button class="btn btn-primary" id="interrupt-confirm">确认</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var slider = overlay.querySelector('#interrupt-slider');
    var valueLabel = overlay.querySelector('#interrupt-value');
    slider.addEventListener('input', function() {
      valueLabel.textContent = slider.value + '分钟';
    });

    overlay.querySelector('#interrupt-cancel').addEventListener('click', function() {
      overlay.remove();
    });

    overlay.querySelector('#interrupt-confirm').addEventListener('click', function() {
      var minutes = parseInt(slider.value, 10);
      var reason = overlay.querySelector('#interrupt-reason').value.trim();
      engine.addInterruption(minutes, reason);
      overlay.remove();
      Toast.show('已记录中断 ' + minutes + ' 分钟');
    });

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
  },

  _showStopDialog: function(engine) {
    var elapsed = engine.getElapsed();
    var user = Auth.getCurrentUser();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    var typeLabel = engine.type === 'productive' ? '正事' : '其它';

    var statsHtml =
      '<div class="stop-stats">' +
        '<div class="stop-stat">' +
          '<div class="stop-stat-label">' + typeLabel + '时长</div>' +
          '<div class="stop-stat-value productive">' + Utils.formatDuration(elapsed.productive) + '</div>' +
        '</div>';

    if (engine.type === 'productive') {
      statsHtml +=
        '<div class="stop-stat">' +
          '<div class="stop-stat-label">中断时长</div>' +
          '<div class="stop-stat-value interrupt">' + Utils.formatDuration(elapsed.interruptionDuration) + '</div>' +
        '</div>';
    }

    statsHtml += '</div>';

    overlay.innerHTML =
      '<div class="modal">' +
        '<h3>计时结束</h3>' +
        statsHtml +
        '<label>内容描述</label>' +
        '<div class="suggest-wrap">' +
          '<input type="text" id="stop-desc" placeholder="请输入内容描述" autocomplete="off">' +
          '<div class="suggest-list" id="suggest-list" style="display:none;"></div>' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="btn btn-secondary" id="stop-discard">放弃</button>' +
          '<button class="btn btn-primary" id="stop-save">保存</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var descInput = overlay.querySelector('#stop-desc');
    var suggestList = overlay.querySelector('#suggest-list');
    var suggestions = Store.getSuggestions(user);

    descInput.addEventListener('input', function() {
      var val = descInput.value.trim();
      if (!val) {
        suggestList.style.display = 'none';
        return;
      }
      var matches = suggestions.filter(function(s) {
        return s.toLowerCase().indexOf(val.toLowerCase()) > -1;
      });
      if (matches.length === 0) {
        suggestList.style.display = 'none';
        return;
      }
      suggestList.innerHTML = matches.map(function(m) {
        return '<div class="suggest-item">' + m + '</div>';
      }).join('');
      suggestList.style.display = 'block';
    });

    suggestList.addEventListener('click', function(e) {
      if (e.target.classList.contains('suggest-item')) {
        descInput.value = e.target.textContent;
        suggestList.style.display = 'none';
      }
    });

    overlay.querySelector('#stop-discard').addEventListener('click', function() {
      engine.reset();
      overlay.remove();
      PageTimer._updateDisplayFor(engine.type, { productive: 0 });
    });

    overlay.querySelector('#stop-save').addEventListener('click', function() {
      var desc = descInput.value.trim();
      if (!desc) {
        Toast.show('请输入内容描述');
        return;
      }
      var record = engine.buildRecord(desc);
      Store.saveRecord(user, record);
      Store.addSuggestion(user, desc);
      engine.reset();
      overlay.remove();
      PageTimer._updateDisplayFor(engine.type, { productive: 0 });
      Toast.show('已保存');
    });

    descInput.focus();
  },

  _showSupplementDialog: function() {
    var user = Auth.getCurrentUser();
    var now = Date.now();
    var windowStart = now - 8 * 60 * 60 * 1000;
    var maxMinutes = 8 * 60;
    var defaultEnd = maxMinutes;
    var defaultStart = Math.max(0, defaultEnd - 120);

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal modal-wide">' +
        '<h3>补充时段</h3>' +
        '<label>时段类型</label>' +
        '<div class="type-choice-row">' +
          '<label class="type-choice"><input type="radio" name="supp-type" value="productive" checked> 正事时段</label>' +
          '<label class="type-choice"><input type="radio" name="supp-type" value="other"> 其它时段</label>' +
        '</div>' +
        '<label>内容描述</label>' +
        '<input type="text" id="supp-desc" placeholder="请输入内容描述">' +
        '<label>时段范围（最近8小时内）</label>' +
        '<div class="supp-range-meta">' +
          '<div>起始：<span id="supp-start-label"></span></div>' +
          '<div>终止：<span id="supp-end-label"></span></div>' +
          '<div>时长：<span id="supp-duration-label"></span></div>' +
        '</div>' +
        '<div class="dual-range-wrap">' +
          '<div class="dual-range-track"><div class="dual-range-fill" id="supp-range-fill"></div></div>' +
          '<input type="range" id="supp-start-range" min="0" max="' + maxMinutes + '" value="' + defaultStart + '">' +
          '<input type="range" id="supp-end-range" min="0" max="' + maxMinutes + '" value="' + defaultEnd + '">' +
        '</div>' +
        '<div class="dual-range-labels"><span>8小时前</span><span>现在</span></div>' +
        '<div class="modal-actions">' +
          '<button class="btn btn-secondary" id="supp-cancel">取消</button>' +
          '<button class="btn btn-primary" id="supp-save">保存补充时段</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var startRange = overlay.querySelector('#supp-start-range');
    var endRange = overlay.querySelector('#supp-end-range');
    var fill = overlay.querySelector('#supp-range-fill');
    var startLabel = overlay.querySelector('#supp-start-label');
    var endLabel = overlay.querySelector('#supp-end-label');
    var durationLabel = overlay.querySelector('#supp-duration-label');

    var syncRangeUI = function(changed) {
      var startMin = parseInt(startRange.value, 10);
      var endMin = parseInt(endRange.value, 10);

      if (changed === 'start' && startMin >= endMin) {
        startMin = Math.max(0, endMin - 1);
        startRange.value = startMin;
      }
      if (changed === 'end' && endMin <= startMin) {
        endMin = Math.min(maxMinutes, startMin + 1);
        endRange.value = endMin;
      }
      if (startMin >= endMin) {
        endMin = Math.min(maxMinutes, startMin + 1);
        endRange.value = endMin;
      }

      var leftPct = (startMin / maxMinutes) * 100;
      var rightPct = (endMin / maxMinutes) * 100;
      fill.style.left = leftPct + '%';
      fill.style.width = (rightPct - leftPct) + '%';

      var startTs = windowStart + startMin * 60 * 1000;
      var endTs = windowStart + endMin * 60 * 1000;
      startLabel.textContent = PageTimer._formatDateTime(startTs);
      endLabel.textContent = PageTimer._formatDateTime(endTs);
      durationLabel.textContent = Utils.formatDuration(endTs - startTs);
    };

    startRange.addEventListener('input', function() { syncRangeUI('start'); });
    endRange.addEventListener('input', function() { syncRangeUI('end'); });
    syncRangeUI();

    overlay.querySelector('#supp-cancel').addEventListener('click', function() {
      overlay.remove();
    });

    overlay.querySelector('#supp-save').addEventListener('click', function() {
      var desc = overlay.querySelector('#supp-desc').value.trim();
      if (!desc) {
        Toast.show('请输入内容描述');
        return;
      }

      var typeEl = overlay.querySelector('input[name="supp-type"]:checked');
      var type = typeEl ? typeEl.value : 'productive';
      var startMin = parseInt(startRange.value, 10);
      var endMin = parseInt(endRange.value, 10);
      if (endMin <= startMin) {
        Toast.show('请选择有效时段');
        return;
      }

      var startTs = windowStart + startMin * 60 * 1000;
      var endTs = windowStart + endMin * 60 * 1000;
      var duration = endTs - startTs;
      var record = {
        id: Utils.generateId(),
        type: type,
        date: PageTimer._dateStrFromTs(startTs),
        startTime: startTs,
        endTime: endTs,
        description: desc,
        pauses: [],
        interruptions: [],
        totalDuration: duration,
        productiveDuration: duration,
        interruptionDuration: 0,
        pauseDuration: 0
      };

      Store.saveRecord(user, record);
      Store.addSuggestion(user, desc);
      overlay.remove();
      Toast.show('补充时段已保存');
    });

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#supp-desc').focus();
  },

  _dateStrFromTs: function(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  },

  _formatDateTime: function(ts) {
    var d = new Date(ts);
    return this._dateStrFromTs(ts) + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }
};
