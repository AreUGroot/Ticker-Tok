var Utils = {
  formatDuration: function(ms) {
    if (ms < 0) ms = 0;
    var totalSeconds = Math.floor(ms / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    if (hours > 0) {
      return hours + '小时' + minutes + '分' + seconds + '秒';
    } else if (minutes > 0) {
      return minutes + '分' + seconds + '秒';
    }
    return seconds + '秒';
  },

  formatTimer: function(ms) {
    if (ms < 0) ms = 0;
    var totalSeconds = Math.floor(ms / 1000);
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;
    return String(h).padStart(2, '0') + ':' +
           String(m).padStart(2, '0') + ':' +
           String(s).padStart(2, '0');
  },

  formatTime: function(ts) {
    var d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0');
  },

  formatDate: function(dateStr) {
    var parts = dateStr.split('-');
    return parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
  },

  generateId: function() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  debounce: function(fn, delay) {
    var timer = null;
    return function() {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
    };
  },

  todayStr: function() {
    var d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }
};
