var Store = {
  KEY: 'ticker_tok_data',
  DEFAULT_USERS: ['Lin', 'Qingli', 'Ke', 'Yifeng', 'Jimmy'],

  _getData: function() {
    var raw = localStorage.getItem(this.KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e) { return null; }
  },

  _saveData: function(data) {
    localStorage.setItem(this.KEY, JSON.stringify(data));
  },

  init: function() {
    var data = this._getData();
    var self = this;
    if (!data) {
      data = {};
    }

    if (!data.users) data.users = {};
    if (!data.records) data.records = {};
    if (!data.suggestions) data.suggestions = {};

    // Keep the login list canonical to the configured usernames.
    var nextUsers = {};
    self.DEFAULT_USERS.forEach(function(name) {
      nextUsers[name] = { password: '888888' };
      if (!data.records[name]) data.records[name] = [];
      if (!data.suggestions[name]) data.suggestions[name] = [];
    });
    data.users = nextUsers;

    if (data.currentUser && !data.users[data.currentUser]) {
      data.currentUser = null;
    }

    this._saveData(data);
    return data;
  },

  getUsers: function() {
    var data = this._getData();
    return data ? Object.keys(data.users) : [];
  },

  validateUser: function(name, password) {
    var data = this._getData();
    if (!data || !data.users[name]) return false;
    return data.users[name].password === password;
  },

  getCurrentUser: function() {
    var data = this._getData();
    return data ? data.currentUser : null;
  },

  setCurrentUser: function(name) {
    var data = this._getData();
    data.currentUser = name;
    this._saveData(data);
  },

  getRecords: function(userName, date) {
    var data = this._getData();
    if (!data || !data.records[userName]) return [];
    var records = data.records[userName];
    if (date) {
      records = records.filter(function(r) { return r.date === date; });
    }
    return records;
  },

  saveRecord: function(userName, record) {
    var data = this._getData();
    if (!data.records[userName]) data.records[userName] = [];
    data.records[userName].push(record);
    this._saveData(data);
  },

  updateRecord: function(userName, recordId, updates) {
    var data = this._getData();
    var records = data.records[userName] || [];
    for (var i = 0; i < records.length; i++) {
      if (records[i].id === recordId) {
        Object.assign(records[i], updates);
        break;
      }
    }
    this._saveData(data);
  },

  getSuggestions: function(userName) {
    var data = this._getData();
    return (data && data.suggestions[userName]) || [];
  },

  addSuggestion: function(userName, text) {
    if (!text || !text.trim()) return;
    var data = this._getData();
    if (!data.suggestions[userName]) data.suggestions[userName] = [];
    var list = data.suggestions[userName];
    // move to front if exists, otherwise prepend
    var idx = list.indexOf(text.trim());
    if (idx > -1) list.splice(idx, 1);
    list.unshift(text.trim());
    // keep max 50
    if (list.length > 50) list.length = 50;
    this._saveData(data);
  },

  getDatesWithRecords: function(userName) {
    var records = this.getRecords(userName);
    var dateSet = {};
    records.forEach(function(r) { dateSet[r.date] = true; });
    return Object.keys(dateSet).sort();
  }
};
