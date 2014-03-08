var player;
var currentUrl = '';

$(function() {
  player = new CastPlayer();
});

function launchApp() {
  player.launchApp();
}

function startPlayback() {
  if (player.session == null || $('#url').val().trim() == "") {
    return;
  }
  var url = decodeURIComponent($('#url').val());
  var contentType = "video/" + url.split('.').pop();
  player.loadMedia(url, contentType);
  $('#player_now_playing').html(url.split(/[\\/]/).pop());
  $('#controls').show();
}

function pause() {
  player.pauseMedia();
}

function resume() {
  player.playMedia();
}

function seek(is_forward) {
  player.seekMedia(parseInt($("#player_seek").val()), is_forward);
}

function stop() {
  var reply = confirm("This will stop playback on the TV. Are you sure?");
  if (reply == true) {
    player.stopApp();
    $('#controls').hide();
  }
}