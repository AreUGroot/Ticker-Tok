var PageLogin = {
  render: function(container) {
    var users = Store.getUsers();
    var optionsHtml = users.map(function(u) {
      return '<option value="' + u + '">' + u + '</option>';
    }).join('');

    container.innerHTML =
      '<div class="login-wrapper">' +
        '<div class="login-card">' +
          '<div class="login-icon">&#9201;</div>' +
          '<h1 class="login-title">正事计时器</h1>' +
          '<p class="login-subtitle">记录每一段专注时光</p>' +
          '<div class="login-field">' +
            '<label for="login-user">用户</label>' +
            '<select id="login-user" class="login-input">' + optionsHtml + '</select>' +
          '</div>' +
          '<div class="login-field">' +
            '<label for="login-pass">密码</label>' +
            '<input type="password" id="login-pass" class="login-input" placeholder="请输入密码">' +
          '</div>' +
          '<button id="btn-login" class="btn btn-primary login-btn">登 录</button>' +
        '</div>' +
      '</div>';

    document.getElementById('btn-login').addEventListener('click', this._handleLogin);
    document.getElementById('login-pass').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') PageLogin._handleLogin();
    });
  },

  _handleLogin: function() {
    var user = document.getElementById('login-user').value;
    var pass = document.getElementById('login-pass').value;
    if (!pass) {
      Toast.show('请输入密码');
      return;
    }
    if (Auth.login(user, pass)) {
      App.navigate('productive');
    } else {
      Toast.show('密码错误');
    }
  }
};
