var App = {
  currentPage: null,

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

    // Check login state
    if (Store.getCurrentUser()) {
      this.navigate('productive');
    } else {
      this.navigate('login');
    }
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
    }
  }
};

window.addEventListener('DOMContentLoaded', function() {
  App.init();
});
