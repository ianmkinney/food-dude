(function () {
    var RESULT_KEY = 'amplifood.auth.google.result';
    var PENDING_KEY = 'amplifood.auth.google.pending';
    var MODE_KEY = 'amplifood.auth.google.mode';
    var RETURN_KEY = 'amplifood.auth.google.return';
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
        if (window.opener) {
            window.opener.postMessage({ type: 'google-result', result: result }, location.origin);
        }
    } catch (e) {}
    try {
        localStorage.setItem(RESULT_KEY, JSON.stringify(result));
    } catch (e) {}
    history.replaceState(null, '', location.pathname);

    var mode = null;
    var returnTo = '/';
    try {
        mode = sessionStorage.getItem(MODE_KEY);
    } catch (e) {}
    try {
        var storedReturn = sessionStorage.getItem(RETURN_KEY);
        if (storedReturn) returnTo = storedReturn;
    } catch (e) {}

    var pending = null;
    try {
        pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    } catch (e) {}
    if (pending && pending.state && pending.state === result.state) {
        if (pending.mode === 'redirect') mode = 'redirect';
        if (pending.returnTo) returnTo = pending.returnTo;
    }

    if (mode === 'redirect') {
        location.replace(safeReturnPath(returnTo));
        return;
    }

    window.close();
    setTimeout(function () {
        status.innerHTML = result.error
            ? 'Sign-in was cancelled. You can close this window.'
            : 'Signed in. You can close this window and go back to <a href="/">AmpliFood</a>.';
    }, 400);

    function safeReturnPath(value) {
        if (typeof value !== 'string') return '/';
        if (value.charAt(0) !== '/' || value.charAt(1) === '/' || value.charAt(1) === '\\') return '/';
        if (value.indexOf('\\') !== -1 || value.indexOf('://') !== -1) return '/';
        if (value.indexOf('/auth/') === 0) return '/';
        if (value.length > 512) return '/';
        return value;
    }
})();
