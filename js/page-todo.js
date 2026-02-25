var PageTodo = {
  todos: [],
  sortBy: 'priority',

  WEEKDAY_NAMES: ['日', '一', '二', '三', '四', '五', '六'],

  _getWeekday: function(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return '周' + this.WEEKDAY_NAMES[d.getDay()];
  },

  _formatDate: function(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
  },

  _formatDateFull: function(dateStr) {
    if (!dateStr) return '';
    return this._formatDate(dateStr) + ' ' + this._getWeekday(dateStr);
  },

  _renderStars: function(count, max) {
    max = max || 5;
    var html = '';
    for (var i = 1; i <= max; i++) {
      html += '<span class="todo-star' + (i <= count ? ' filled' : '') + '">&#9733;</span>';
    }
    return html;
  },

  _formatDuration: function(h, m) {
    if (!h && !m) return '';
    var parts = [];
    if (h) parts.push(h + '小时');
    if (m) parts.push(m + '分钟');
    return parts.join('');
  },

  _durationToMinutes: function(h, m) {
    return (h || 0) * 60 + (m || 0);
  },

  _minutesToDuration: function(mins) {
    if (mins === 0) return '0分钟';
    var sign = mins < 0 ? '-' : '+';
    var abs = Math.abs(mins);
    var h = Math.floor(abs / 60);
    var m = abs % 60;
    var parts = [];
    if (h) parts.push(h + '小时');
    if (m) parts.push(m + '分钟');
    return sign + parts.join('');
  },

  render: function(root) {
    root.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'todo-container';

    var header = document.createElement('div');
    header.className = 'todo-header';
    header.innerHTML =
      '<div class="todo-title-row">' +
        '<h2 class="todo-title">待办事项</h2>' +
        '<button class="btn btn-primary todo-add-btn" id="btn-add-todo">' +
          '<span class="todo-add-icon">+</span> 添加待办' +
        '</button>' +
      '</div>';
    container.appendChild(header);

    var sortBar = document.createElement('div');
    sortBar.className = 'todo-sort-bar';
    sortBar.innerHTML =
      '<span class="todo-sort-label">排序方式：</span>' +
      '<button class="todo-sort-btn' + (this.sortBy === 'priority' ? ' active' : '') + '" data-sort="priority">按优先级</button>' +
      '<button class="todo-sort-btn' + (this.sortBy === 'planned' ? ' active' : '') + '" data-sort="planned">按计划时间</button>' +
      '<button class="todo-sort-btn' + (this.sortBy === 'deadline' ? ' active' : '') + '" data-sort="deadline">按截止日期</button>';
    container.appendChild(sortBar);

    var listArea = document.createElement('div');
    listArea.id = 'todo-list';
    listArea.className = 'todo-list';
    container.appendChild(listArea);

    root.appendChild(container);

    var self = this;
    document.getElementById('btn-add-todo').addEventListener('click', function() {
      self._showAddModal();
    });

    sortBar.querySelectorAll('.todo-sort-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self.sortBy = btn.getAttribute('data-sort');
        sortBar.querySelectorAll('.todo-sort-btn').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
        self._renderList();
      });
    });

    this._loadTodos();
  },

  _loadTodos: function() {
    var self = this;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/todos', true);
    xhr.onload = function() {
      if (xhr.status === 200) {
        var res = JSON.parse(xhr.responseText);
        if (res.ok) {
          self.todos = res.todos || [];
          self._renderList();
        }
      }
    };
    xhr.send();
  },

  _renderList: function() {
    var listEl = document.getElementById('todo-list');
    if (!listEl) return;

    var sorted = this._sortTodos(this.todos.slice());
    var incomplete = sorted.filter(function(t) { return !t.completed; });
    var completed = sorted.filter(function(t) { return t.completed; });

    if (incomplete.length === 0 && completed.length === 0) {
      listEl.innerHTML =
        '<div class="todo-empty">' +
          '<div class="todo-empty-icon">&#128203;</div>' +
          '<p>暂无待办事项</p>' +
          '<p class="todo-empty-sub">点击上方"添加待办"按钮创建新的待办事项</p>' +
        '</div>';
      return;
    }

    var html = '';
    incomplete.forEach(function(todo) {
      html += PageTodo._renderTodoCard(todo);
    });

    if (completed.length > 0) {
      html += '<div class="todo-section-divider">' +
        '<span class="todo-section-label">已完成 (' + completed.length + ')</span>' +
      '</div>';
      completed.forEach(function(todo) {
        html += PageTodo._renderTodoCard(todo);
      });
    }

    listEl.innerHTML = html;
    this._bindListEvents(listEl);
  },

  _renderTodoCard: function(todo) {
    var completedClass = todo.completed ? ' todo-card-completed' : '';
    var priority = todo.priority || 3;

    var metaHtml = '';

    // Stars
    metaHtml += '<span class="todo-stars-display">' + this._renderStars(priority) + '</span>';

    // Planned date
    if (todo.plannedDate) {
      var plannedText = this._formatDateFull(todo.plannedDate);
      if (todo.plannedTime) plannedText += ' ' + todo.plannedTime;
      metaHtml += '<span class="todo-meta-item todo-meta-planned">' +
        '<span class="todo-meta-icon">&#128197;</span> 计划: ' + this._escHtml(plannedText) +
      '</span>';
    }

    // Deadline date
    if (todo.deadlineDate) {
      var deadlineText = this._formatDateFull(todo.deadlineDate);
      if (todo.deadlineTime) deadlineText += ' ' + todo.deadlineTime;
      metaHtml += '<span class="todo-meta-item todo-meta-deadline">' +
        '<span class="todo-meta-icon">&#9200;</span> 截止: ' + this._escHtml(deadlineText) +
      '</span>';
    }

    // Estimated duration
    var estText = this._formatDuration(todo.estimatedHours, todo.estimatedMinutes);
    if (estText) {
      metaHtml += '<span class="todo-meta-item todo-meta-duration">' +
        '<span class="todo-meta-icon">&#9202;</span> 预计: ' + this._escHtml(estText) +
      '</span>';
    }

    var hasActualTime = (todo.actualHours || 0) > 0 || (todo.actualMinutes || 0) > 0;

    if (!todo.completed) {
      // Show accumulated time and "添加时长" button for incomplete items
      if (hasActualTime) {
        var accText = this._formatDuration(todo.actualHours, todo.actualMinutes);
        metaHtml += '<span class="todo-meta-item todo-meta-accumulated">' +
          '<span class="todo-meta-icon">&#9201;</span> 已计: ' + this._escHtml(accText) +
        '</span>';
      }
      metaHtml += '<button class="todo-add-time-btn" data-id="' + todo.id + '">+ 添加时长</button>';
    } else {
      // Show actual duration for completed items
      if (hasActualTime) {
        var actText = this._formatDuration(todo.actualHours, todo.actualMinutes);
        metaHtml += '<span class="todo-meta-item todo-meta-actual">' +
          '<span class="todo-meta-icon">&#9989;</span> 实际: ' + this._escHtml(actText) +
        '</span>';
      }
      // Show diff (actual - estimated)
      var estMins = this._durationToMinutes(todo.estimatedHours, todo.estimatedMinutes);
      var actMins = this._durationToMinutes(todo.actualHours, todo.actualMinutes);
      if (estMins > 0 && hasActualTime) {
        var diffMins = actMins - estMins;
        var diffText = this._minutesToDuration(diffMins);
        var diffClass = diffMins > 0 ? 'todo-meta-diff-positive' : (diffMins < 0 ? 'todo-meta-diff-negative' : 'todo-meta-diff-zero');
        metaHtml += '<span class="todo-meta-item ' + diffClass + '">' +
          '<span class="todo-meta-icon">&#128200;</span> 差值: ' + this._escHtml(diffText) +
        '</span>';
      }
      if (todo.actualCompletedAt) {
        metaHtml += '<span class="todo-meta-item todo-meta-actual">' +
          '<span class="todo-meta-icon">&#128336;</span> 完成于: ' + this._escHtml(todo.actualCompletedAt) +
        '</span>';
      }
    }

    return '<div class="todo-card' + completedClass + '" data-id="' + todo.id + '">' +
      '<div class="todo-card-left">' +
        '<label class="todo-checkbox-wrap">' +
          '<input type="checkbox" class="todo-checkbox" data-id="' + todo.id + '"' +
            (todo.completed ? ' checked' : '') + '>' +
          '<span class="todo-checkmark"></span>' +
        '</label>' +
      '</div>' +
      '<div class="todo-card-body">' +
        '<div class="todo-card-content">' + this._escHtml(todo.content) + '</div>' +
        '<div class="todo-card-meta">' + metaHtml + '</div>' +
      '</div>' +
      '<div class="todo-card-actions">' +
        '<button class="todo-action-btn todo-edit-btn" data-id="' + todo.id + '" title="编辑">&#9998;</button>' +
        '<button class="todo-action-btn todo-delete-btn" data-id="' + todo.id + '" title="删除">&#128465;</button>' +
      '</div>' +
    '</div>';
  },

  _bindListEvents: function(listEl) {
    var self = this;

    listEl.querySelectorAll('.todo-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function(e) {
        var id = parseInt(cb.getAttribute('data-id'));
        if (cb.checked) {
          e.preventDefault();
          cb.checked = false;
          self._showCompleteModal(id);
        } else {
          self._uncomplete(id);
        }
      });
    });

    listEl.querySelectorAll('.todo-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(btn.getAttribute('data-id'));
        self._deleteTodo(id);
      });
    });

    listEl.querySelectorAll('.todo-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(btn.getAttribute('data-id'));
        var todo = self.todos.find(function(t) { return t.id === id; });
        if (todo) self._showAddModal(todo);
      });
    });

    listEl.querySelectorAll('.todo-add-time-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = parseInt(btn.getAttribute('data-id'));
        self._showAddTimeModal(id);
      });
    });
  },

  _sortTodos: function(arr) {
    var self = this;
    switch (this.sortBy) {
      case 'priority':
        arr.sort(function(a, b) {
          return (b.priority || 3) - (a.priority || 3);
        });
        break;
      case 'planned':
        arr.sort(function(a, b) {
          var da = a.plannedDate || '9999-99-99';
          var db = b.plannedDate || '9999-99-99';
          if (da !== db) return da.localeCompare(db);
          return (a.plannedTime || '').localeCompare(b.plannedTime || '');
        });
        break;
      case 'deadline':
        arr.sort(function(a, b) {
          var da = a.deadlineDate || '9999-99-99';
          var db = b.deadlineDate || '9999-99-99';
          if (da !== db) return da.localeCompare(db);
          return (a.deadlineTime || '').localeCompare(b.deadlineTime || '');
        });
        break;
    }
    return arr;
  },

  _showAddModal: function(editTodo) {
    var isEdit = !!editTodo;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    var currentPriority = isEdit ? (editTodo.priority || 3) : 3;

    overlay.innerHTML =
      '<div class="modal todo-modal">' +
        '<h3>' + (isEdit ? '编辑待办事项' : '添加待办事项') + '</h3>' +

        '<label>待办事项内容 <span class="todo-required">*</span></label>' +
        '<textarea id="todo-content" rows="3" placeholder="请输入待办事项内容...">' +
          (isEdit ? this._escHtml(editTodo.content) : '') +
        '</textarea>' +

        '<label>优先级 <span class="todo-required">*</span></label>' +
        '<div class="todo-star-picker" id="todo-star-picker">' +
          this._renderStarPicker(currentPriority) +
        '</div>' +
        '<input type="hidden" id="todo-priority-val" value="' + currentPriority + '">' +

        '<div class="todo-time-row">' +
          '<div class="todo-time-col">' +
            '<label>计划完成日期</label>' +
            '<input type="date" id="todo-planned-date" class="todo-date-input" value="' +
              (isEdit ? (editTodo.plannedDate || '') : '') + '">' +
            '<div class="todo-weekday-hint" id="todo-planned-weekday">' +
              (isEdit && editTodo.plannedDate ? this._getWeekday(editTodo.plannedDate) : '') +
            '</div>' +
          '</div>' +
          '<div class="todo-time-col">' +
            '<label>计划完成时刻</label>' +
            '<input type="time" id="todo-planned-time" class="todo-time-input" value="' +
              (isEdit ? (editTodo.plannedTime || '') : '') + '">' +
          '</div>' +
        '</div>' +

        '<div class="todo-time-row">' +
          '<div class="todo-time-col">' +
            '<label>截止日期</label>' +
            '<input type="date" id="todo-deadline-date" class="todo-date-input" value="' +
              (isEdit ? (editTodo.deadlineDate || '') : '') + '">' +
            '<div class="todo-weekday-hint" id="todo-deadline-weekday">' +
              (isEdit && editTodo.deadlineDate ? this._getWeekday(editTodo.deadlineDate) : '') +
            '</div>' +
          '</div>' +
          '<div class="todo-time-col">' +
            '<label>截止时刻</label>' +
            '<input type="time" id="todo-deadline-time" class="todo-time-input" value="' +
              (isEdit ? (editTodo.deadlineTime || '') : '') + '">' +
          '</div>' +
        '</div>' +

        '<label>预计完成时长</label>' +
        '<div class="todo-duration-row">' +
          '<input type="number" id="todo-est-hours" class="todo-duration-input" min="0" max="999" placeholder="0" value="' +
            (isEdit && editTodo.estimatedHours ? editTodo.estimatedHours : '') + '">' +
          '<span class="todo-duration-unit">小时</span>' +
          '<input type="number" id="todo-est-minutes" class="todo-duration-input" min="0" max="59" placeholder="0" value="' +
            (isEdit && editTodo.estimatedMinutes ? editTodo.estimatedMinutes : '') + '">' +
          '<span class="todo-duration-unit">分钟</span>' +
        '</div>' +

        '<div class="modal-actions">' +
          '<button class="btn btn-secondary" id="todo-cancel">取消</button>' +
          '<button class="btn btn-primary" id="todo-save">' + (isEdit ? '保存修改' : '添加') + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Star picker events
    var self = this;
    var starPicker = document.getElementById('todo-star-picker');
    starPicker.querySelectorAll('.todo-star-pick').forEach(function(star) {
      star.addEventListener('click', function() {
        var val = parseInt(star.getAttribute('data-val'));
        document.getElementById('todo-priority-val').value = val;
        starPicker.innerHTML = self._renderStarPicker(val);
        // Re-bind
        starPicker.querySelectorAll('.todo-star-pick').forEach(function(s) {
          s.addEventListener('click', arguments.callee);
        });
        // Need to re-bind using a recursive approach - let's use a helper
        self._bindStarPicker(starPicker);
      });
    });
    this._bindStarPicker(starPicker);

    // Weekday hints on date change
    document.getElementById('todo-planned-date').addEventListener('change', function() {
      document.getElementById('todo-planned-weekday').textContent = self._getWeekday(this.value);
    });
    document.getElementById('todo-deadline-date').addEventListener('change', function() {
      document.getElementById('todo-deadline-weekday').textContent = self._getWeekday(this.value);
    });

    // Focus content
    var contentEl = document.getElementById('todo-content');
    setTimeout(function() { contentEl.focus(); }, 100);

    // Close
    document.getElementById('todo-cancel').addEventListener('click', function() {
      document.body.removeChild(overlay);
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });

    // Save
    document.getElementById('todo-save').addEventListener('click', function() {
      var content = document.getElementById('todo-content').value.trim();
      if (!content) {
        Toast.show('请输入待办事项内容');
        return;
      }

      var priority = parseInt(document.getElementById('todo-priority-val').value) || 3;

      var data = {
        content: content,
        priority: priority,
        plannedDate: document.getElementById('todo-planned-date').value,
        plannedTime: document.getElementById('todo-planned-time').value,
        deadlineDate: document.getElementById('todo-deadline-date').value,
        deadlineTime: document.getElementById('todo-deadline-time').value,
        estimatedHours: parseInt(document.getElementById('todo-est-hours').value) || 0,
        estimatedMinutes: parseInt(document.getElementById('todo-est-minutes').value) || 0,
      };

      if (isEdit) {
        self._updateTodo(editTodo.id, data, overlay);
      } else {
        self._createTodo(data, overlay);
      }
    });
  },

  _renderStarPicker: function(selected) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += '<span class="todo-star-pick' + (i <= selected ? ' filled' : '') + '" data-val="' + i + '">&#9733;</span>';
    }
    return html;
  },

  _bindStarPicker: function(container) {
    var self = this;
    container.querySelectorAll('.todo-star-pick').forEach(function(star) {
      star.onclick = function() {
        var val = parseInt(star.getAttribute('data-val'));
        document.getElementById('todo-priority-val').value = val;
        container.innerHTML = self._renderStarPicker(val);
        self._bindStarPicker(container);
      };
    });
  },

  _showAddTimeModal: function(todoId) {
    var todo = this.todos.find(function(t) { return t.id === todoId; });
    if (!todo) return;

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    var currentH = todo.actualHours || 0;
    var currentM = todo.actualMinutes || 0;
    var currentText = this._formatDuration(currentH, currentM);

    overlay.innerHTML =
      '<div class="modal todo-modal">' +
        '<h3>添加时长</h3>' +
        '<p class="todo-complete-desc">' + this._escHtml(todo.content) + '</p>' +
        (currentText ? '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">当前已累计: ' + this._escHtml(currentText) + '</p>' : '') +
        '<label>本次新增时长</label>' +
        '<div class="todo-duration-row">' +
          '<input type="number" id="addtime-hours" class="todo-duration-input" min="0" max="999" placeholder="0">' +
          '<span class="todo-duration-unit">小时</span>' +
          '<input type="number" id="addtime-minutes" class="todo-duration-input" min="0" max="59" placeholder="0">' +
          '<span class="todo-duration-unit">分钟</span>' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="btn btn-secondary" id="addtime-cancel">取消</button>' +
          '<button class="btn btn-primary" id="addtime-save">添加</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var self = this;

    document.getElementById('addtime-cancel').addEventListener('click', function() {
      document.body.removeChild(overlay);
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });

    document.getElementById('addtime-save').addEventListener('click', function() {
      var addH = parseInt(document.getElementById('addtime-hours').value) || 0;
      var addM = parseInt(document.getElementById('addtime-minutes').value) || 0;
      if (addH === 0 && addM === 0) {
        Toast.show('请输入时长');
        return;
      }

      var totalM = currentH * 60 + currentM + addH * 60 + addM;
      var newH = Math.floor(totalM / 60);
      var newM = totalM % 60;

      var xhr = new XMLHttpRequest();
      xhr.open('PATCH', '/api/todos/' + todoId, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function() {
        if (xhr.status === 200) {
          Toast.show('已添加 ' + self._formatDuration(addH, addM));
          document.body.removeChild(overlay);
          self._loadTodos();
        }
      };
      xhr.send(JSON.stringify({ actualHours: newH, actualMinutes: newM }));
    });
  },

  _showCompleteModal: function(todoId) {
    var todo = this.todos.find(function(t) { return t.id === todoId; });
    if (!todo) return;

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    // Default to now
    var now = new Date();
    var nowDate = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    var nowTime = String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0');

    var accH = todo.actualHours || 0;
    var accM = todo.actualMinutes || 0;

    overlay.innerHTML =
      '<div class="modal todo-modal">' +
        '<h3>完成待办事项</h3>' +
        '<p class="todo-complete-desc">' + this._escHtml(todo.content) + '</p>' +

        '<label>实际完成时长' + (accH || accM ? ' <span style="font-size:12px;color:var(--text-secondary);">(已累计)</span>' : '') + '</label>' +
        '<div class="todo-duration-row">' +
          '<input type="number" id="complete-hours" class="todo-duration-input" min="0" max="999" placeholder="0" value="' + (accH || '') + '">' +
          '<span class="todo-duration-unit">小时</span>' +
          '<input type="number" id="complete-minutes" class="todo-duration-input" min="0" max="59" placeholder="0" value="' + (accM || '') + '">' +
          '<span class="todo-duration-unit">分钟</span>' +
        '</div>' +

        '<label>实际完成时间</label>' +
        '<div class="todo-time-row">' +
          '<div class="todo-time-col">' +
            '<input type="date" id="complete-date" class="todo-date-input" value="' + nowDate + '">' +
          '</div>' +
          '<div class="todo-time-col">' +
            '<input type="time" id="complete-time" class="todo-time-input" value="' + nowTime + '">' +
          '</div>' +
        '</div>' +

        '<div class="modal-actions">' +
          '<button class="btn btn-secondary" id="complete-cancel">取消</button>' +
          '<button class="btn btn-primary" id="complete-save">确认完成</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var self = this;

    document.getElementById('complete-cancel').addEventListener('click', function() {
      document.body.removeChild(overlay);
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });

    document.getElementById('complete-save').addEventListener('click', function() {
      var actualHours = parseInt(document.getElementById('complete-hours').value) || 0;
      var actualMinutes = parseInt(document.getElementById('complete-minutes').value) || 0;
      var completedDate = document.getElementById('complete-date').value;
      var completedTime = document.getElementById('complete-time').value;
      var completedAt = '';
      if (completedDate) {
        completedAt = PageTodo._formatDateFull(completedDate);
        if (completedTime) completedAt += ' ' + completedTime;
      }

      var data = {
        completed: true,
        actualHours: actualHours,
        actualMinutes: actualMinutes,
        actualCompletedAt: completedAt,
      };

      var xhr = new XMLHttpRequest();
      xhr.open('PATCH', '/api/todos/' + todoId, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function() {
        if (xhr.status === 200) {
          Toast.show('已完成');
          document.body.removeChild(overlay);
          self._loadTodos();
        }
      };
      xhr.send(JSON.stringify(data));
    });
  },

  _uncomplete: function(id) {
    var self = this;
    var xhr = new XMLHttpRequest();
    xhr.open('PATCH', '/api/todos/' + id, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
      if (xhr.status === 200) {
        self._loadTodos();
      }
    };
    xhr.send(JSON.stringify({ completed: false, actualHours: 0, actualMinutes: 0, actualCompletedAt: '' }));
  },

  _createTodo: function(data, overlay) {
    var self = this;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/todos', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
      if (xhr.status === 200) {
        var res = JSON.parse(xhr.responseText);
        if (res.ok) {
          Toast.show('添加成功');
          document.body.removeChild(overlay);
          self._loadTodos();
        } else {
          Toast.show(res.message || '添加失败');
        }
      }
    };
    xhr.send(JSON.stringify(data));
  },

  _updateTodo: function(id, data, overlay) {
    var self = this;
    var xhr = new XMLHttpRequest();
    xhr.open('PATCH', '/api/todos/' + id, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
      if (xhr.status === 200) {
        var res = JSON.parse(xhr.responseText);
        if (res.ok) {
          Toast.show('修改成功');
          document.body.removeChild(overlay);
          self._loadTodos();
        } else {
          Toast.show(res.message || '修改失败');
        }
      }
    };
    xhr.send(JSON.stringify(data));
  },

  _deleteTodo: function(id) {
    if (!window.confirm('确定要删除这个待办事项吗？')) return;
    var self = this;
    var xhr = new XMLHttpRequest();
    xhr.open('DELETE', '/api/todos/' + id, true);
    xhr.onload = function() {
      if (xhr.status === 200) {
        Toast.show('已删除');
        self._loadTodos();
      }
    };
    xhr.send();
  },

  _escHtml: function(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
