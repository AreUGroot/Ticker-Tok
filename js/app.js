var App = {
  currentPage: null,
  confirmOnClose: true,

  init: function() {
    Store.init();

    var otherTab = document.querySelector('.nav-tab[data-page="other"]');
    if (otherTab) {
      otherTab.style.display = 'none';
    }

    // Nav tab clicks
    var tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        var page = tab.getAttribute('data-page');
        App.navigate(page);
      });
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', function() {
      Auth.logout();
    });
    document.getElementById('btn-migrate-local').addEventListener('click', function() {
      App._runLegacyMigration(true);
    });

    // Check login state
    if (Store.getCurrentUser()) {
      this.navigate('productive');
    } else {
      this.navigate('login');
    }
  },

  shouldConfirmBeforeUnload: function() {
    if (!this.confirmOnClose) return false;
    return this.currentPage && this.currentPage !== 'login';
  },

  navigate: function(page) {
    if (page === 'other') {
      page = 'productive';
    }

    var nav = document.getElementById('app-nav');
    var root = document.getElementById('app-root');

    // Show/hide nav
    nav.style.display = (page === 'login') ? 'none' : 'block';

    // Update active tab
    var tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(function(tab) {
      tab.classList.toggle('active', tab.getAttribute('data-page') === page);
    });

    // Clear root
    root.innerHTML = '';

    // Render page
    this.currentPage = page;
    switch (page) {
      case 'login':
        PageLogin.render(root);
        break;
      case 'productive':
        PageTimer.render(root);
        break;
      case 'history':
        PageHistory.render(root);
        break;
      case 'todo':
        PageTodo.render(root);
        break;
    }

    this._refreshMigrationButton();
    this._maybePromptLegacyMigration(page);
  },

  _refreshMigrationButton: function() {
    var btn = document.getElementById('btn-migrate-local');
    if (!btn) return;

    var user = Store.getCurrentUser();
    if (!user) {
      btn.style.display = 'none';
      return;
    }

    var summary = Store.getLegacyLocalSummaryForUser(user);
    if (!summary.hasData) {
      btn.style.display = 'none';
      return;
    }

    btn.style.display = '';
    btn.textContent = '迁移本机数据 (' + summary.records + '条记录)';
  },

  _maybePromptLegacyMigration: function(page) {
    if (page === 'login') return;
    var user = Store.getCurrentUser();
    if (!Store.shouldPromptLegacyMigration(user)) return;

    var summary = Store.getLegacyLocalSummaryForUser(user);
    var msg = '发现本机旧数据（' + summary.records + ' 条记录';
    if (summary.suggestions > 0) {
      msg += '，' + summary.suggestions + ' 条常用描述';
    }
    msg += '），是否现在迁移到服务器？';

    if (window.confirm(msg)) {
      this._runLegacyMigration(false);
    } else {
      Store.markLegacyMigrationPrompted(user);
    }
  },

  _runLegacyMigration: function(fromManualClick) {
    var user = Store.getCurrentUser();
    if (!user) {
      Toast.show('请先登录');
      return;
    }

    if (fromManualClick) {
      var summaryBefore = Store.getLegacyLocalSummaryForUser(user);
      if (!summaryBefore.hasData) {
        Toast.show('本机没有可迁移的旧数据');
        return;
      }
      if (!window.confirm('将本机 localStorage 中的旧数据合并到服务器（可重复执行，不会按记录ID重复新增）。继续吗？')) {
        return;
      }
    }

    var result = Store.migrateLegacyLocalDataForCurrentUser();
    if (!result.ok) {
      Toast.show(result.message || '迁移失败');
      return;
    }

    var s = result.summary || {};
    Toast.show(
      '迁移完成：新增' + (s.recordsInserted || 0) +
      '，更新' + (s.recordsUpdated || 0) +
      '，错误' + (s.recordErrors || 0),
      3500
    );
    this._refreshMigrationButton();

    if (this.currentPage === 'history') {
      this.navigate('history');
    }
  }
};

window.addEventListener('DOMContentLoaded', function() {
  App.init();
});

window.addEventListener('beforeunload', function(e) {
  if (!App.shouldConfirmBeforeUnload()) return;
  e.preventDefault();
  e.returnValue = '';
  return '';
});
