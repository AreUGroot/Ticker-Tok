var Store = {
  // Legacy browser-only data key (used for migration import).
  KEY: 'ticker_tok_data',
  DEFAULT_USERS: ['Lin', 'Qingli', 'Ke', 'Yifeng', 'Jimmy'],
  MIGRATION_PROMPT_PREFIX: 'ticker_tok_migration_prompted_',

  _currentUser: undefined,
  _usersCache: null,
  _lastErrorMessage: '',

  _setError: function(message) {
    this._lastErrorMessage = message || '';
  },

  getLastErrorMessage: function() {
    return this._lastErrorMessage || '';
  },

  _api: function(method, path, body) {
    var xhr = new XMLHttpRequest();
    var response = null;
    this._setError('');

    try {
      xhr.open(method, path, false); // keep sync API to minimize front-end refactor
      xhr.setRequestHeader('Accept', 'application/json');
      if (body !== undefined && body !== null) {
        xhr.setRequestHeader('Content-Type', 'application/json');
      }
      xhr.send(body !== undefined && body !== null ? JSON.stringify(body) : null);
    } catch (e) {
      this._setError('无法连接服务器，请确认已使用 server.py 启动');
      return { ok: false, status: 0, message: this.getLastErrorMessage() };
    }

    if (xhr.responseText) {
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = null;
      }
    }

    if (xhr.status >= 200 && xhr.status < 300 && response && response.ok) {
      return { ok: true, status: xhr.status, data: response };
    }

    var message = (response && response.message) || ('请求失败（' + xhr.status + '）');
    this._setError(message);
    return {
      ok: false,
      status: xhr.status,
      message: message,
      code: response && response.code,
      data: response || null
    };
  },

  init: function() {
    this._loadCurrentUser(true);
    return {};
  },

  _loadCurrentUser: function(force) {
    if (!force && this._currentUser !== undefined) {
      return this._currentUser;
    }
    var res = this._api('GET', '/api/auth/me');
    if (res.ok) {
      this._currentUser = res.data.user ? res.data.user.username : null;
      return this._currentUser;
    }
    this._currentUser = null;
    return null;
  },

  getUsers: function() {
    var res = this._api('GET', '/api/users');
    if (res.ok && Array.isArray(res.data.users) && res.data.users.length) {
      this._usersCache = res.data.users.slice();
      return this._usersCache.slice();
    }
    if (this._usersCache && this._usersCache.length) {
      return this._usersCache.slice();
    }
    return this.DEFAULT_USERS.slice();
  },

  login: function(name, password) {
    var res = this._api('POST', '/api/auth/login', { username: name, password: password });
    if (!res.ok) {
      if (res.status === 401) {
        return { ok: false, message: '密码错误' };
      }
      return { ok: false, message: this.getLastErrorMessage() || '登录失败' };
    }
    this._currentUser = res.data.user ? res.data.user.username : name;
    return { ok: true };
  },

  logout: function() {
    this._api('POST', '/api/auth/logout', {});
    this._currentUser = null;
    return true;
  },

  getCurrentUser: function() {
    return this._loadCurrentUser(false);
  },

  validateUser: function(name, password) {
    var result = this.login(name, password);
    return !!(result && result.ok);
  },

  setCurrentUser: function(name) {
    // Kept only for backward compatibility with older callers.
    this._currentUser = name || null;
  },

  _buildQuery: function(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function(k) {
      if (params[k] === undefined || params[k] === null || params[k] === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])));
    });
    return parts.length ? ('?' + parts.join('&')) : '';
  },

  getRecords: function(userName, date) {
    var res = this._api('GET', '/api/records' + this._buildQuery({ user: userName, date: date }));
    if (!res.ok || !Array.isArray(res.data.records)) return [];
    return res.data.records;
  },

  saveRecord: function(userName, record) {
    var res = this._api('POST', '/api/records', {
      userName: userName,
      record: record
    });
    return !!res.ok;
  },

  updateRecord: function(userName, recordId, updates) {
    var res = this._api('PATCH', '/api/records/' + encodeURIComponent(recordId), {
      userName: userName,
      updates: updates
    });
    return !!res.ok;
  },

  getSuggestions: function(userName) {
    var res = this._api('GET', '/api/suggestions' + this._buildQuery({ user: userName }));
    if (!res.ok || !Array.isArray(res.data.suggestions)) return [];
    return res.data.suggestions;
  },

  addSuggestion: function(userName, text) {
    if (!text || !text.trim()) return true;
    var res = this._api('POST', '/api/suggestions', {
      userName: userName,
      text: text.trim()
    });
    return !!res.ok;
  },

  getDatesWithRecords: function(userName) {
    var res = this._api('GET', '/api/records/dates' + this._buildQuery({ user: userName }));
    if (!res.ok || !Array.isArray(res.data.dates)) return [];
    return res.data.dates;
  },

  _getLegacyLocalData: function() {
    var raw = localStorage.getItem(this.KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  getLegacyLocalSummaryForUser: function(userName) {
    var data = this._getLegacyLocalData();
    if (!data || !userName) {
      return { hasData: false, records: 0, suggestions: 0 };
    }
    var records = (((data.records || {})[userName]) || []);
    var suggestions = (((data.suggestions || {})[userName]) || []);
    var recordCount = Array.isArray(records) ? records.length : 0;
    var suggestionCount = Array.isArray(suggestions) ? suggestions.length : 0;
    return {
      hasData: recordCount > 0 || suggestionCount > 0,
      records: recordCount,
      suggestions: suggestionCount
    };
  },

  _migrationPromptKey: function(userName) {
    return this.MIGRATION_PROMPT_PREFIX + userName;
  },

  shouldPromptLegacyMigration: function(userName) {
    if (!userName) return false;
    var summary = this.getLegacyLocalSummaryForUser(userName);
    if (!summary.hasData) return false;
    return localStorage.getItem(this._migrationPromptKey(userName)) !== '1';
  },

  markLegacyMigrationPrompted: function(userName) {
    if (!userName) return;
    localStorage.setItem(this._migrationPromptKey(userName), '1');
  },

  clearLegacyMigrationPrompted: function(userName) {
    if (!userName) return;
    localStorage.removeItem(this._migrationPromptKey(userName));
  },

  migrateLegacyLocalDataForCurrentUser: function() {
    var user = this.getCurrentUser();
    if (!user) {
      return { ok: false, message: '请先登录' };
    }
    var data = this._getLegacyLocalData();
    if (!data) {
      return { ok: false, message: '本机没有可迁移的 localStorage 数据' };
    }

    var res = this._api('POST', '/api/migration/localstorage', { data: data });
    if (!res.ok) {
      return { ok: false, message: this.getLastErrorMessage() || '迁移失败' };
    }
    this.markLegacyMigrationPrompted(user);
    return { ok: true, summary: res.data.summary || null };
  }
};
