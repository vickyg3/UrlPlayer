(function() {
'use strict';

var DEVICE_STATE = {
  'IDLE' : 0,
  'ACTIVE' : 1,
  'WARNING' : 2,
  'ERROR' : 3,
};

var PLAYER_STATE = {
  'IDLE' : 'IDLE',
  'LOADING' : 'LOADING',
  'LOADED' : 'LOADED',
  'PLAYING' : 'PLAYING',
  'PAUSED' : 'PAUSED',
  'STOPPED' : 'STOPPED',
  'SEEKING' : 'SEEKING',
  'ERROR' : 'ERROR'
};

/**
 * Cast player object
 * main variables:
 *  - deviceState for Cast mode:
 *    IDLE: Default state indicating that Cast extension is installed, but showing no current activity
 *    ACTIVE: Shown when Chrome has one or more local activities running on a receiver
 *    WARNING: Shown when the device is actively being used, but when one or more issues have occurred
 *    ERROR: Should not normally occur, but shown when there is a failure
 *  - Cast player variables for controlling Cast mode media playback
 *  - Current media variables for transition between Cast and local modes
 */
var CastPlayer = function() {
  /* device variables */
  // @type {DEVICE_STATE} A state for device
  this.deviceState = DEVICE_STATE.IDLE;

  this.tries = 0;

  /* Cast player variables */
  // @type {Object} a chrome.cast.media.Media object
  this.currentMediaSession = null;
  // @type {Number} volume
  this.currentVolume = 0.5;
  // @type {Boolean} ismuted
  this.isMuted = false;
  // @type {Boolean} A flag for autoplay after load
  this.autoplay = true;
  // @type {string} a chrome.cast.Session object
  this.session = null;
  // @type {PLAYER_STATE} A state for Cast media player
  this.castPlayerState = PLAYER_STATE.IDLE;

  /* Current media variables */
  // @type {Boolean} Audio on and off
  this.audio = true;
  // @type {string} Current media url
  this.currentMediaUrl = '';
  // @type {Number} A number for current media time
  this.currentMediaTime = 0;
  // @type {Number} A number for current media duration
  this.currentMediaDuration = -1;
  // @type {Timer} A timer for tracking progress of media
  this.timer = null;
  // @type {Boolean} A boolean to stop timer update of progress when triggered by media status event
  this.progressFlag = true;
  // @type {Number} A number in milliseconds for minimal progress update
  this.timerStep = 1000;

  /* media contents from JSON */
  this.mediaContents = null;

  this.initializeCastPlayer();
};

/**
 * Initialize Cast media player
 * Initializes the API. Note that either successCallback and errorCallback will be
 * invoked once the API has finished initialization. The sessionListener and
 * receiverListener may be invoked at any time afterwards, and possibly more than once.
 */
CastPlayer.prototype.initializeCastPlayer = function() {

  if (!chrome.cast || !chrome.cast.isAvailable) {
    if (this.tries++ > 10) {
      $('#extension').html("Looks like you don't have the Chromecast Extension. <a target=\"_blank\" href=\"https://chrome.google.com/webstore/detail/google-cast/boadgeojelhgndaghljhdicfkmllpafd\">Click here to Install it</a> and then reload the page");
      return;
    }
    setTimeout(this.initializeCastPlayer.bind(this), 1000);
    return;
  }

  $('#extension').html("Chromecast Extension is already installed");
  // default set to the default media receiver app ID
  // optional: you may change it to point to your own
  var applicationID = chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID;

  // request session
  var sessionRequest = new chrome.cast.SessionRequest(applicationID);
  var apiConfig = new chrome.cast.ApiConfig(sessionRequest,
    this.sessionListener.bind(this),
    this.receiverListener.bind(this));

  chrome.cast.initialize(apiConfig, this.onInitSuccess.bind(this), this.onError.bind(this));

};

CastPlayer.prototype.onInitSuccess = function() {
  console.log("init success");
};

CastPlayer.prototype.onError = function() {
  console.log("error");
};

/**
 * @param {!Object} A new session
 * This handles auto-join when a page is reloaded
 * When active session is detected, playback will automatically
 * join existing session and occur in Cast mode and media
 * status gets synced up with current media of the session
 */
CastPlayer.prototype.sessionListener = function(e) {
  this.session = e;
  if( this.session ) {
    $('#chromecast').html("Connected to <b>" + this.session.receiver.friendlyName + "</b>");
    $('#modal_play_text').html("Play on Chromecast");
    this.deviceState = DEVICE_STATE.ACTIVE;
    if( this.session.media[0] ) {
      this.onMediaDiscovered('activeSession', this.session.media[0]);
    }
    this.session.addUpdateListener(this.sessionUpdateListener.bind(this));
  }
}

/**
 * @param {string} e Receiver availability
 * This indicates availability of receivers but
 * does not provide a list of device IDs
 */
CastPlayer.prototype.receiverListener = function(e) {
  if( e === 'available' ) {
    console.log("receiver found");
  }
  else {
    console.log("receiver list empty");
  }
};

/**
 * session update listener
 */
CastPlayer.prototype.sessionUpdateListener = function(isAlive) {
  if (!isAlive) {
    this.session = null;
    this.deviceState = DEVICE_STATE.IDLE;
    this.castPlayerState = PLAYER_STATE.IDLE;
    this.currentMediaSession = null;
    clearInterval(this.timer);
  }
};

/**
 * Requests that a receiver application session be created or joined. By default, the SessionRequest
 * passed to the API at initialization time is used; this may be overridden by passing a different
 * session request in opt_sessionRequest.
 */
CastPlayer.prototype.launchApp = function() {
  console.log("launching app...");
  chrome.cast.requestSession(this.onRequestSessionSuccess.bind(this), this.onLaunchError.bind(this));
  if( this.timer ) {
    clearInterval(this.timer);
  }
};

/**
 * Callback function for request session success
 * @param {Object} e A chrome.cast.Session object
 */
CastPlayer.prototype.onRequestSessionSuccess = function(e) {
  console.log("session success: " + e.sessionId);
  this.session = e;
  $('#chromecast').html("Connected to <b>" + this.session.receiver.friendlyName + "</b>");
  $('#modal_play_text').html("Play on Chromecast");
  this.deviceState = DEVICE_STATE.ACTIVE;
  this.session.addUpdateListener(this.sessionUpdateListener.bind(this));
};

CastPlayer.prototype.onLaunchError = function() {
  console.log("launch error");
  this.deviceState = DEVICE_STATE.ERROR;
};

/**
 * Stops the running receiver application associated with the session.
 */
CastPlayer.prototype.stopApp = function() {
  $('#chromecast').html("Click to connect to your Chromecast");
  $('#modal_play_text').html("Connect to Chromecast to Start Playback");
  this.session.stop(this.onStopAppSuccess.bind(this, 'Session stopped'),
  this.onError.bind(this));
};

/**
 * Callback function for stop app success
 */
CastPlayer.prototype.onStopAppSuccess = function(message) {
  console.log(message);
  this.deviceState = DEVICE_STATE.IDLE;
  this.castPlayerState = PLAYER_STATE.IDLE;
  this.currentMediaSession = null;
  $('#chromecast').html("Click to connect to your Chromecast");
  clearInterval(this.timer);
};

/**
 * Loads media into a running receiver application
 * @param {Number} mediaIndex An index number to indicate current media content
 */
CastPlayer.prototype.loadMedia = function(mediaUrl, contentType) {
  if (!this.session) {
    console.log("no session");
    return;
  }
  this.currentMediaUrl = mediaUrl;
  console.log("loading..." + mediaUrl);
  var mediaInfo = new chrome.cast.media.MediaInfo(mediaUrl);
  mediaInfo.contentType = contentType;
  mediaInfo.metadata = new chrome.cast.media.MovieMediaMetadata();
  mediaInfo.metadata.metadataType = 2;
  mediaInfo.metadata.title = 'Video from URL Player';
  var item = new chrome.cast.media.QueueItem(mediaInfo);
  item.autoplay = this.autoplay;
  item.startTime = 0;
  var request = new chrome.cast.media.QueueLoadRequest([item]);
  request.repeatMode = $('#repeat').hasClass('active') ? chrome.cast.media.RepeatMode.ALL : chrome.cast.media.RepeatMode.OFF;

  this.castPlayerState = PLAYER_STATE.LOADING;
  this.session.queueLoad(
    request,
    this.onMediaDiscovered.bind(this, 'loadMedia'),
    this.onLoadMediaError.bind(this));
};

CastPlayer.prototype.formatTime = function(duration) {
  var hr = parseInt(duration/3600);
  duration -= hr * 3600;
  var min = parseInt(duration/60);
  var sec = parseInt(duration % 60);
  if ( hr > 0 ) {
    duration = (hr <= 9 ? "0" : "") + hr + ":" + (min <= 9 ? "0" : "") + min + ":" + (sec <= 9 ? "0" : "") + sec;
  }
  else {
    if( min > 0 ) {
      duration = "00:" + (min <= 9 ? "0" : "") + min + ":" + (sec <= 9 ? "0" : "") + sec;
    }
    else {
      duration = "00:00:" + (sec <= 9 ? "0" : "") + sec;
    }
  }
  return duration;
};

/**
 * Callback function when media queueSetRepeatMode returns error
 */
CastPlayer.prototype.onQueueSetRepeatModeSuccess = function() {
  console.log("queueSetRepeatMode success");
};

/**
 * Callback function when media queueSetRepeatMode returns error
 */
CastPlayer.prototype.onQueueSetRepeatModeError = function(e) {
  console.log("queueSetRepeatMode failed");
};

/**
 * Callback function for loadMedia success
 * @param {Object} mediaSession A new media object.
 */
CastPlayer.prototype.onMediaDiscovered = function(how, mediaSession) {
  console.log("new media session ID:" + mediaSession.mediaSessionId + ' (' + how + ')');
  this.currentMediaSession = mediaSession;
  if( how == 'loadMedia' ) {
    if( this.autoplay ) {
      this.castPlayerState = PLAYER_STATE.PLAYING;
    }
    else {
      this.castPlayerState = PLAYER_STATE.LOADED;
    }
  }

  if( how == 'activeSession' ) {
    this.castPlayerState = this.session.media[0].playerState;
    this.currentMediaTime = this.session.media[0].currentTime;
    this.currentMediaUrl = this.session.media[0].media.contentId;
    if ($('#url').val() == "") {
      $('#url').val(this.currentMediaUrl);
    }
    $('#player_now_playing').html(this.currentMediaUrl.split(/[\\/]/).pop());
    $('#controls').show();
  }

  if( this.castPlayerState == PLAYER_STATE.PLAYING ) {
    // start progress timer
    this.startProgressTimer(this.incrementMediaTime);
  }

  this.currentMediaSession.addUpdateListener(this.onMediaStatusUpdate.bind(this));

  this.currentMediaDuration = this.currentMediaSession.media.duration;
  var duration = this.currentMediaDuration;
  $("#player_duration").html(this.formatTime(duration));
};

CastPlayer.prototype.startProgressTimer = function(callback) {
  if( this.timer ) {
    clearInterval(this.timer);
    this.timer = null;
  }

  // start progress timer
  this.timer = setInterval(callback.bind(this), this.timerStep);
};

/**
 * Callback function when media load returns error
 */
CastPlayer.prototype.onLoadMediaError = function(e) {
  console.log("media error");
  this.castPlayerState = PLAYER_STATE.IDLE;
};

/**
 * Callback function for media status update from receiver
 * @param {!Boolean} e true/false
 */
CastPlayer.prototype.onMediaStatusUpdate = function(e) {
  if( e == false ) {
    this.currentMediaTime = 0;
    this.castPlayerState = PLAYER_STATE.IDLE;
  } else if ( this.currentMediaSession.playerState === chrome.cast.media.PlayerState.PLAYING && this.castPlayerState === PLAYER_STATE.PAUSED ) {
    console.log("resumed by another client");
    this.castPlayerState = PLAYER_STATE.PLAYING;
    this.startProgressTimer(this.incrementMediaTime);
  } else if ( this.currentMediaSession.playerState === chrome.cast.media.PlayerState.PAUSED && this.castPlayerState !== PLAYER_STATE.PAUSED ) {
    console.log("paused by another client");
    this.castPlayerState = PLAYER_STATE.PAUSED;
    clearInterval(this.timer);
    this.timer = null;
  }
  if ( e == true ) {
    // this is necessary to reset the time in repeat mode
    this.currentMediaTime = this.currentMediaSession.currentTime;
  }
  console.log("updating media");
};

/**
 * Helper function
 * Increment media current position by 1 second
 */
CastPlayer.prototype.incrementMediaTime = function() {
  $('#player_current_time').html(this.formatTime(this.currentMediaTime));
  if (this.currentMediaSession.playerState == PLAYER_STATE.PLAYING){
    if( this.currentMediaTime < this.currentMediaDuration ) {
      this.currentMediaTime += 1;
      $('#player_current_time').html(this.formatTime(this.currentMediaTime));
      $('#player_seek_range').attr('max', this.currentMediaSession.media.duration);
	    $('#player_seek_range').val(this.currentMediaTime);
    } else {
      this.currentMediaTime = 0;
      clearInterval(this.timer);
    }
  }

};

/**
 * Play media
 */
CastPlayer.prototype.playMedia = function() {
  if( !this.currentMediaSession ) {
    return;
  }

  switch( this.castPlayerState )
  {
    case PLAYER_STATE.LOADED:
    case PLAYER_STATE.PAUSED:
      this.currentMediaSession.play(null,
        this.mediaCommandSuccessCallback.bind(this,"playing started for " + this.currentMediaSession.sessionId),
        this.onError.bind(this));
      this.currentMediaSession.addUpdateListener(this.onMediaStatusUpdate.bind(this));
      this.castPlayerState = PLAYER_STATE.PLAYING;
      // start progress timer
      this.startProgressTimer(this.incrementMediaTime);
      break;
    case PLAYER_STATE.IDLE:
    case PLAYER_STATE.LOADING:
    case PLAYER_STATE.STOPPED:
      this.loadMedia(this.currentMediaIndex);
      this.currentMediaSession.addUpdateListener(this.onMediaStatusUpdate.bind(this));
      this.castPlayerState = PLAYER_STATE.PLAYING;
      break;
    default:
      break;
  }
};

/**
 * Pause media playback
 */
CastPlayer.prototype.pauseMedia = function() {
  if( !this.currentMediaSession ) {
    return;
  }

  if( this.castPlayerState == PLAYER_STATE.PLAYING ) {
    this.castPlayerState = PLAYER_STATE.PAUSED;
    this.currentMediaSession.pause(null,
      this.mediaCommandSuccessCallback.bind(this,"paused " + this.currentMediaSession.sessionId),
      this.onError.bind(this));
    clearInterval(this.timer);
  }
};

/**
 * Repeat media playback
 */
CastPlayer.prototype.repeatMedia = function(repeat) {
  if( !this.currentMediaSession ) {
    return;
  }

  this.currentMediaSession.queueSetRepeatMode(
    repeat? chrome.cast.media.RepeatMode.ALL : chrome.cast.media.RepeatMode.OFF,
    this.onQueueSetRepeatModeSuccess.bind(this),
    this.onQueueSetRepeatModeError.bind(this));
};

/**
 * Stop meia playback
 */
CastPlayer.prototype.stopMedia = function() {
  if( !this.currentMediaSession ) {
    return;
  }

  this.currentMediaSession.stop(null,
    this.mediaCommandSuccessCallback.bind(this,"stopped " + this.currentMediaSession.sessionId),
    this.onError.bind(this));
  this.castPlayerState = PLAYER_STATE.STOPPED;
  clearInterval(this.timer);
};

/**
 * Callback function for media command success
 */
CastPlayer.prototype.mediaCommandSuccessCallback = function(info, e) {
  console.log(info);
};

/**
 * Control Volume
 */
CastPlayer.prototype.volumeControl = function(increase, mute) {
  if( !this.currentMediaSession ) {
    return;
  }

  if (!mute) {
    if (increase) {
      this.currentVolume += 0.1;
    } else {
      this.currentVolume -= 0.1;
    }

    if (this.currentVolume < 0) {
      this.currentVolume = 0;
    } else if (this.currentVolume > 1.0) {
      this.currentVolume = 1.0;
    }

    this.session.setReceiverVolumeLevel(this.currentVolume,
      this.mediaCommandSuccessCallback.bind(this),
      this.onError.bind(this));
  } else {
    this.isMuted = !this.isMuted;
    this.session.setReceiverMuted(this.isMuted,
      this.mediaCommandSuccessCallback.bind(this),
      this.onError.bind(this));
  }
};

/**
 * media seek function
 * @param {Event} e An event object from seek
 */
CastPlayer.prototype.seekMedia = function(minutes, is_forward) {
  var pos = this.currentMediaTime;
  if (is_forward)
    pos += minutes * 60;
  else
    pos -= minutes * 60;
  console.log('Seeking ' + this.currentMediaSession.sessionId + ':' +
    this.currentMediaSession.mediaSessionId + ' to ' + pos + "%");
  this.seekTo(pos);
};

CastPlayer.prototype.seekTo = function(position) {
  if( this.castPlayerState != PLAYER_STATE.PLAYING && this.castPlayerState != PLAYER_STATE.PAUSED ) {
    return;
  }
  this.currentMediaTime = position;
  var request = new chrome.cast.media.SeekRequest();
  request.currentTime = this.currentMediaTime;
  this.currentMediaSession.seek(request,
    this.onSeekSuccess.bind(this, 'media seek done'),
    this.onError.bind(this));
  this.castPlayerState = PLAYER_STATE.SEEKING;
};

/**
 * Callback function for seek success
 * @param {String} info A string that describe seek event
 */
CastPlayer.prototype.onSeekSuccess = function(info) {
  console.log(info);
  this.castPlayerState = PLAYER_STATE.PLAYING;
};

/**
 * Set progressFlag with a timeout of 1 second to avoid UI update
 * until a media status update from receiver
 */
CastPlayer.prototype.setProgressFlag = function() {
  this.progressFlag = true;
};

window.CastPlayer = CastPlayer;

})();