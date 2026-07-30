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

	function requestAudio(el, button) {
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
				text: textCache.get(el),
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
				var msg;
				if (timedOut) {
					msg = 'Request timed out after ' + (REQUEST_TIMEOUT_MS / 1000) + 's - check your TTS server';
				} else if (err instanceof TypeError) {
					msg = 'Request failed - check CORS headers and HTTPS/mixed-content on ' + CONFIG.apiUrl;
				} else {
					msg = 'TTS request failed: ' + err.message;
				}
				setButtonState(button, 'error', msg);
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
