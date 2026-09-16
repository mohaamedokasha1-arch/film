(function () {
  var params = new URLSearchParams(location.search);
  if (params.get('t')) sessionStorage.setItem('akavox_t', params.get('t'));
})();
