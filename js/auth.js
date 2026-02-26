var Auth = {
  login: function(username, password) {
    return Store.login(username, password);
  },

  logout: function() {
    Store.logout();
    App.navigate('login');
  },

  changePassword: function(oldPassword, newPassword) {
    return Store.changePassword(oldPassword, newPassword);
  },

  getCurrentUser: function() {
    return Store.getCurrentUser();
  }
};
