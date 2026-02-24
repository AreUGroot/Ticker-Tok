var Auth = {
  login: function(username, password) {
    if (Store.validateUser(username, password)) {
      Store.setCurrentUser(username);
      return true;
    }
    return false;
  },

  logout: function() {
    Store.setCurrentUser(null);
    App.navigate('login');
  },

  getCurrentUser: function() {
    return Store.getCurrentUser();
  }
};
