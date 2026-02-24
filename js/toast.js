var Toast = {
  show: function(message, duration) {
    duration = duration || 2000;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(function() { el.classList.add('toast-fade-out'); }, duration - 300);
    setTimeout(function() { el.remove(); }, duration);
  }
};
