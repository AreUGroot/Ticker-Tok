function TimerEngine(options) {
  this.type = options.type; // 'productive' or 'other'
  this.onTick = options.onTick || function() {};
  this.onStateChange = options.onStateChange || function() {};

  this.state = 'idle'; // idle | running | paused | stopped
  this.startTime = null;
  this.endTime = null;
  this.pauseStart = null;
  this.pauses = [];
  this.interruptions = [];
  this._interval = null;
}

TimerEngine.prototype.start = function() {
  if (this.state === 'running') {
    Toast.show('正在计时中');
    return;
  }
  if (this.state === 'paused') {
    // resume
    var lastPause = this.pauses[this.pauses.length - 1];
    if (lastPause && !lastPause.end) {
      lastPause.end = Date.now();
    }
    this.state = 'running';
    this._startTicking();
    this.onStateChange(this.state);
    Toast.show('继续计时');
    return;
  }
  if (this.state === 'stopped') {
    // already stopped, need to reset first
    Toast.show('请先保存当前记录');
    return;
  }
  // fresh start from idle
  this.startTime = Date.now();
  this.endTime = null;
  this.pauses = [];
  this.interruptions = [];
  this.state = 'running';
  this._startTicking();
  this.onStateChange(this.state);
};

TimerEngine.prototype.pause = function() {
  if (this.state === 'paused') {
    Toast.show('已经暂停了');
    return;
  }
  if (this.state !== 'running') {
    Toast.show('计时器未在运行');
    return;
  }
  this.pauses.push({ start: Date.now(), end: null });
  this.state = 'paused';
  this._stopTicking();
  this.onStateChange(this.state);
};

TimerEngine.prototype.stop = function() {
  if (this.state === 'idle') {
    Toast.show('计时器未启动');
    return;
  }
  if (this.state === 'stopped') {
    Toast.show('已经停止了');
    return;
  }
  // close open pause
  if (this.state === 'paused') {
    var lastPause = this.pauses[this.pauses.length - 1];
    if (lastPause && !lastPause.end) {
      lastPause.end = Date.now();
    }
  }
  this.endTime = Date.now();
  this.state = 'stopped';
  this._stopTicking();
  this.onStateChange(this.state);
};

TimerEngine.prototype.addInterruption = function(durationMinutes, reason) {
  var now = Date.now();
  var start = now - (durationMinutes * 60 * 1000);
  this.interruptions.push({
    start: start,
    end: now,
    duration: durationMinutes,
    reason: reason || ''
  });
};

TimerEngine.prototype.getElapsed = function() {
  var now;
  if (this.state === 'stopped' || this.state === 'idle') {
    now = this.endTime || Date.now();
  } else {
    now = Date.now();
  }

  if (!this.startTime) {
    return { total: 0, pauseDuration: 0, interruptionDuration: 0, productive: 0 };
  }

  var total = now - this.startTime;

  var pauseTotal = 0;
  for (var i = 0; i < this.pauses.length; i++) {
    var p = this.pauses[i];
    var pEnd = p.end || now;
    pauseTotal += (pEnd - p.start);
  }

  var intTotal = 0;
  for (var j = 0; j < this.interruptions.length; j++) {
    var intr = this.interruptions[j];
    intTotal += (intr.end - intr.start);
  }

  var productive = total - pauseTotal - intTotal;
  if (productive < 0) productive = 0;

  return {
    total: total,
    pauseDuration: pauseTotal,
    interruptionDuration: intTotal,
    productive: productive
  };
};

TimerEngine.prototype.buildRecord = function(description) {
  var elapsed = this.getElapsed();
  return {
    id: Utils.generateId(),
    type: this.type,
    date: new Date(this.startTime).getFullYear() + '-' +
          String(new Date(this.startTime).getMonth() + 1).padStart(2, '0') + '-' +
          String(new Date(this.startTime).getDate()).padStart(2, '0'),
    startTime: this.startTime,
    endTime: this.endTime,
    description: description,
    pauses: JSON.parse(JSON.stringify(this.pauses)),
    interruptions: JSON.parse(JSON.stringify(this.interruptions)),
    totalDuration: elapsed.total,
    productiveDuration: elapsed.productive,
    interruptionDuration: elapsed.interruptionDuration,
    pauseDuration: elapsed.pauseDuration
  };
};

TimerEngine.prototype.reset = function() {
  this.state = 'idle';
  this.startTime = null;
  this.endTime = null;
  this.pauses = [];
  this.interruptions = [];
  this._stopTicking();
  this.onStateChange(this.state);
};

TimerEngine.prototype._startTicking = function() {
  var self = this;
  this._stopTicking();
  this._interval = setInterval(function() {
    self.onTick(self.getElapsed());
  }, 200);
};

TimerEngine.prototype._stopTicking = function() {
  if (this._interval) {
    clearInterval(this._interval);
    this._interval = null;
  }
};
