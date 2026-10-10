(function () {
    var STORAGE_KEY = 'amplifood.auth.google.result';
    var status = document.getElementById('status');
    var params = new URLSearchParams((location.hash || '').replace(/^#/, '') || location.search.slice(1));
    var result = {
        idToken: params.get('id_token'),
        state: params.get('state'),
        error: params.get('error'),
        at: Date.now(),
    };

    try {
        var channel = new BroadcastChannel('amplifood-auth');
        channel.postMessage({ type: 'google-result', result: result });
        channel.close();
    } catch (e) {}
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch (e) {}
    history.replaceState(null, '', location.pathname);

    var mode = null;
    try {
        mode = sessionStorage.getItem('amplifood.auth.google.mode');
    } catch (e) {}

    if (mode === 'redirect') {
        location.replace('/account');
        return;
    }

    window.close();
    setTimeout(function () {
        status.innerHTML = result.error
            ? 'Sign-in was cancelled. You can close this window.'
            : 'Signed in. You can close this window and go back to <a href="/account">AmpliFood</a>.';
    }, 400);
})();
