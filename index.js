(function () {
	var CONFIG = __TTS_BOOKMARKLET_CONFIG__;

	if (!CONFIG.apiUrl) {
		alert('tts-bookmarklet: set CONFIG.apiUrl in index.js before building.');
		return;
	}

	var ICONS = { idle: '▶', loading: '⏳', playing: '⏸', error: '⚠' };

	var audioCache = new WeakMap();
	var textCache = new WeakMap();
	var currentAudio = null;
	var currentButton = null;

	// Remove widgets from a previous run so re-clicking the bookmarklet doesn't double-inject
	Array.prototype.forEach.call(document.querySelectorAll('.tts-bookmarklet-widget'), function (el) {
		el.remove();
	});

	function setButtonState(button, state, title) {
		button.dataset.state = state;
		button.textContent = ICONS[state];
		button.title = title || '';
	}

	function stopCurrent() {
		if (currentAudio) {
			currentAudio.pause();
			currentAudio = null;
		}
		if (currentButton) {
			setButtonState(currentButton, 'idle');
			currentButton = null;
		}
	}

	function playAudio(url, button) {
		var audio = new Audio(url);
		currentAudio = audio;
		currentButton = button;
		setButtonState(button, 'playing');

		audio.addEventListener('ended', function () {
			setButtonState(button, 'idle');
			if (currentAudio === audio) {
				currentAudio = null;
				currentButton = null;
			}
		});

		audio.play().catch(function (err) {
			setButtonState(button, 'error', 'Playback failed: ' + err.message);
		});
	}

	var REQUEST_TIMEOUT_MS = 20000;

	// Once a fetch to CONFIG.apiUrl fails with a client-side network error (CORS
	// or CSP connect-src - fetch's TypeError doesn't distinguish them), remember
	// it so later clicks skip straight to the new-tab fallback below instead of
	// retrying a request that's guaranteed to fail again.
	var apiUnreachable = false;

	// A blocked fetch means this page's browser-side policy won't allow the
	// request at all - not fixable from here. A freshly opened tab is a separate
	// document with its own (usually unrestricted) policy, so a direct GET
	// request there lets audio play anyway. window.open() only survives popup
	// blockers when called synchronously from the click handler, which is why
	// this same function is called directly from onWidgetClick once apiUnreachable
	// is known, rather than from an async fetch callback.
	function openInNewTab(text) {
		var params = new URLSearchParams({
			text: text,
			voice: CONFIG.voice,
			speed: CONFIG.speed,
			outputFormat: CONFIG.outputFormat
		});
		return window.open(CONFIG.apiUrl + '/api/tts?' + params.toString(), '_blank');
	}

	function requestAudio(el, button) {
		var text = textCache.get(el);

		if (apiUnreachable) {
			var opened = openInNewTab(text);
			setButtonState(button, 'idle', opened
				? 'Opened in a new tab (blocked by CORS/CSP on this page)'
				: 'Blocked by CORS/CSP on this page - allow popups to hear it in a new tab');
			return;
		}

		setButtonState(button, 'loading');

		var controller = new AbortController();
		var timedOut = false;
		var timer = setTimeout(function () {
			timedOut = true;
			controller.abort();
		}, REQUEST_TIMEOUT_MS);

		fetch(CONFIG.apiUrl + '/api/tts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal: controller.signal,
			body: JSON.stringify({
				text: text,
				voice: CONFIG.voice,
				speed: CONFIG.speed,
				outputFormat: CONFIG.outputFormat
			})
		})
			.then(function (res) {
				if (!res.ok) throw new Error('HTTP ' + res.status);
				return res.arrayBuffer();
			})
			.then(function (buf) {
				var mime = CONFIG.outputFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav';
				var url = URL.createObjectURL(new Blob([buf], { type: mime }));
				audioCache.set(el, url);
				playAudio(url, button);
			})
			.catch(function (err) {
				if (timedOut) {
					setButtonState(button, 'error', 'Request timed out after ' + (REQUEST_TIMEOUT_MS / 1000) + 's - check your TTS server');
					return;
				}
				if (err instanceof TypeError) {
					apiUnreachable = true;
					var opened = openInNewTab(text);
					setButtonState(button, 'idle', opened
						? 'Opened in a new tab (blocked by CORS/CSP on this page)'
						: 'Blocked by CORS/CSP on this page - click "listen" again to open in a new tab');
					return;
				}
				setButtonState(button, 'error', 'TTS request failed: ' + err.message);
			})
			.finally(function () {
				clearTimeout(timer);
			});
	}

	function onWidgetClick(e, el, button) {
		e.preventDefault();
		e.stopPropagation();

		if (button.dataset.state === 'playing') {
			stopCurrent();
			return;
		}
		if (button.dataset.state === 'loading') {
			return;
		}

		stopCurrent();

		var cachedUrl = audioCache.get(el);
		if (cachedUrl) {
			playAudio(cachedUrl, button);
		} else {
			requestAudio(el, button);
		}
	}

	function isVisible(el) {
		return el.offsetParent !== null;
	}

	function isEligible(el) {
		if (el.textContent.trim().length < CONFIG.minChars) return false;
		if (!isVisible(el)) return false;
		if (el.closest('nav, header, footer, script, style, button, a')) return false;
		if (el.querySelector(CONFIG.selector)) return false; // only tag the innermost block
		return true;
	}

	function addWidget(el) {
		textCache.set(el, el.textContent.trim());

		var button = document.createElement('button');
		button.className = 'tts-bookmarklet-widget';
		button.style.cssText =
			'display:inline-block;margin-right:6px;padding:0 4px;' +
			'font-size:12px;line-height:1.4;cursor:pointer;user-select:none;' +
			'border:1px solid #ccc;border-radius:3px;background:#f5f5f5;color:#333;';
		setButtonState(button, 'idle', 'Listen');

		button.addEventListener('click', function (e) {
			onWidgetClick(e, el, button);
		});

		el.insertBefore(button, el.firstChild);
	}

	Array.prototype.forEach.call(document.querySelectorAll(CONFIG.selector), function (el) {
		if (isEligible(el)) addWidget(el);
	});
})();
