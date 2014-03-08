var player;
var currentUrl = '';

$(function() {
  player = new CastPlayer();
});

function launchApp() {
  player.launchApp();
}

function getContentType(url) {
  var ext = url.split('.').pop();
  var formats = [
    {ext: 'mkv', type: 'video'},
    {ext: 'webm', type: 'video'},
    {ext: 'mp4', type: 'video'},
    {ext: 'jpeg', type: 'image'},
    {ext: 'jpg', type: 'image'},
    {ext: 'gif', type: 'image'},
    {ext: 'png', type: 'image'},
    {ext: 'bmp', type: 'image'},
    {ext: 'webp', type: 'image'}
  ];
  for (var i = 0; i < formats.length; i++) {
    if (formats[i].ext == ext) {
      return formats[i].type + "/" + ext;
    }
  }
  // it doesn't matter now, as it's unsupported.
  return "";
}

function startPlayback() {
  if (player.session == null || $('#url').val().trim() == "") {
    return;
  }
  var url = decodeURIComponent($('#url').val());
  var contentType = getContentType(url);
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