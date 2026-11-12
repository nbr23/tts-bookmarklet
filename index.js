(function () {
	var CONFIG = __TTS_BOOKMARKLET_CONFIG__;

	if (!CONFIG.apiUrl) {
		alert('tts-bookmarklet: set CONFIG.apiUrl in index.js before building.');
		return;
	}

	var ICONS = { idle: '▶', loading: '⏳', playing: '⏸', error: '⚠' };

	var audioCache = new WeakMap();
	var textCache = new WeakMap();
	var audioContext = null;
	var currentSource = null;
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

	// Must be called from a click handler: browsers only let an AudioContext
	// start (or resume) inside a user gesture.
	function getAudioContext() {
		if (!audioContext) {
			audioContext = new (window.AudioContext || window.webkitAudioContext)();
		}
		if (audioContext.state === 'suspended') audioContext.resume();
		return audioContext;
	}

	function stopCurrent() {
		if (currentSource) {
			var source = currentSource;
			currentSource = null;
			source.onended = null;
			source.stop();
		}
		if (currentButton) {
			setButtonState(currentButton, 'idle', 'Listen');
			currentButton = null;
		}
	}

	// Playback goes through the Web Audio API rather than an <audio> element:
	// a blob: URL is a media load, so a strict media-src CSP (claude.ai, among
	// others) blocks it. Decoded audio buffers aren't subject to media-src.
	function playAudio(buffer, button) {
		var source = getAudioContext().createBufferSource();
		source.buffer = buffer;
		source.connect(audioContext.destination);
		source.onended = function () {
			if (currentSource === source) {
				currentSource = null;
				currentButton = null;
			}
			setButtonState(button, 'idle', 'Listen');
		};

		currentSource = source;
		currentButton = button;
		setButtonState(button, 'playing');
		source.start();
	}

	var servers = CONFIG.fallback ? [CONFIG, CONFIG.fallback] : [CONFIG];

	// Once a fetch to a server fails with a client-side network error (CORS
	// or CSP connect-src - fetch's TypeError doesn't distinguish them), mark it
	// unreachable so later clicks skip it - moving on to the fallback server, or
	// straight to the new-tab fallback below once none are left - instead of
	// retrying a request that's guaranteed to fail again.
	function firstReachableIndex() {
		return servers.findIndex(function (server) {
			return !server.unreachable;
		});
	}

	// A blocked fetch means this page's browser-side policy won't allow the
	// request at all - not fixable from here. A freshly opened tab is a separate
	// document with its own (usually unrestricted) policy, so a direct GET
	// request there lets audio play anyway. window.open() only survives popup
	// blockers when called synchronously from the click handler, which is why
	// this same function is called directly from onWidgetClick once every server
	// is known to be unreachable, rather than from an async fetch callback.
	function openInNewTab(server, text) {
		var params = new URLSearchParams({
			text: text,
			voice: server.voice,
			speed: server.speed,
			outputFormat: server.outputFormat
		});
		return window.open(server.apiUrl + '/api/tts?' + params.toString(), '_blank');
	}

	// OpenAI-compatible speech endpoints only accept a JSON POST, so there is no
	// URL a new tab could open.
	function canOpenInNewTab(server) {
		return server.provider !== 'openai';
	}

	function handleBlocked(text, button, popupBlockedTitle) {
		var server = servers[servers.length - 1];
		if (!canOpenInNewTab(server)) {
			setButtonState(button, 'error', 'Blocked by CORS/CSP on this page');
			return;
		}
		var opened = openInNewTab(server, text);
		setButtonState(button, 'idle', opened
			? 'Opened in a new tab (blocked by CORS/CSP on this page)'
			: popupBlockedTitle);
	}

	function buildRequest(server, text) {
		if (server.provider === 'openai') {
			var body = { input: text, response_format: server.outputFormat };
			if (server.voice) body.voice = server.voice;
			if (server.speed) body.speed = server.speed;
			return { url: server.apiUrl + '/v1/audio/speech', body: body };
		}
		return {
			url: server.apiUrl + '/api/tts',
			body: {
				text: text,
				voice: server.voice,
				speed: server.speed,
				outputFormat: server.outputFormat
			}
		};
	}

	function requestAudio(el, button) {
		var text = textCache.get(el);
		var index = firstReachableIndex();

		if (index === -1) {
			handleBlocked(text, button, 'Blocked by CORS/CSP on this page - allow popups to hear it in a new tab');
			return;
		}

		setButtonState(button, 'loading');
		fetchFrom(index, el, button, text);
	}

	function fetchFrom(index, el, button, text) {
		var server = servers[index];
		var timeoutMs = (server.timeoutSeconds || 20) * 1000;
		var controller = new AbortController();
		var timedOut = false;
		var timer = setTimeout(function () {
			timedOut = true;
			controller.abort();
		}, timeoutMs);

		var request = buildRequest(server, text);

		fetch(request.url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal: controller.signal,
			body: JSON.stringify(request.body)
		})
			.then(function (res) {
				if (!res.ok) throw new Error('HTTP ' + res.status);
				return res.arrayBuffer();
			})
			.then(function (buf) {
				return getAudioContext().decodeAudioData(buf);
			})
			.then(function (buffer) {
				audioCache.set(el, buffer);
				playAudio(buffer, button);
			})
			.catch(function (err) {
				if (timedOut) {
					setButtonState(button, 'error', 'Request timed out after ' + (timeoutMs / 1000) + 's - check your TTS server');
					return;
				}
				if (err instanceof TypeError) {
					server.unreachable = true;
					if (index + 1 < servers.length) {
						fetchFrom(index + 1, el, button, text);
						return;
					}
					handleBlocked(text, button, 'Blocked by CORS/CSP on this page - click "listen" again to open in a new tab');
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
		getAudioContext();

		var cachedBuffer = audioCache.get(el);
		if (cachedBuffer) {
			playAudio(cachedBuffer, button);
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
