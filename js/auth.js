var Auth = {
  login: function(username, password) {
    return Store.login(username, password);
  },

  logout: function() {
    Store.logout();
    App.navigate('login');
  },

  getCurrentUser: function() {
    return Store.getCurrentUser();
  }
};
