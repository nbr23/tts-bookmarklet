# tts-bookmarklet

Bookmarklet that adds a "listen" button to paragraphs/list items/blockquotes on any page, using [gopipertts](https://github.com/nbr23/gopipertts) or any OpenAI-compatible speech server, such as Phonon's [ptts-openai-server](https://github.com/gradium-ai/xn-ptts).

## Dependency

The TTS server must be reachable cross-origin: put it behind a reverse proxy that adds `Access-Control-Allow-Origin`, and serve it over HTTPS if used on HTTPS pages.

## Providers

Set `provider` in `defaults` or per profile; `apiUrl` is always the server's base URL.

| `provider`             | Request                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `gopipertts` (default) | `POST /api/tts` with `text`, `voice`, `speed`, `outputFormat`      |
| `openai`               | `POST /v1/audio/speech` with `input`, `response_format` (from `outputFormat`), and `voice`/`speed` when set |

## CORS/CSP

- **Normal case**: `fetch`es the provider's endpoint, plays the result inline via the button.
- **Blocked case** (gopipertts only): if the page's CORS or CSP policy blocks that `fetch`, it falls back to opening a `GET /api/tts?...` URL in a new tab instead. The first click on a blocked page may get its popup silently blocked (browsers only allow `window.open` reliably from a direct click); just click "listen" again and it opens. The `openai` provider has no GET endpoint, so on such pages the button shows an error instead.

## Configure

```sh
cp config.sample.json config.json
```

Edit `config.json` (gitignored, per-user): a `defaults` object plus a `profiles` map, merged per profile.

`timeoutSeconds` (default 20) caps each speech request. Raise it for servers that scale to zero and hold the first request while starting up.

```json
{
	"defaults": {
		"apiUrl": "https://tts.example.com",
		"speed": 1.0,
		"outputFormat": "mp3",
		"selector": "p, li, blockquote",
		"minChars": 20
	},
	"profiles": {
		"en": { "voice": "en_US-amy-low" },
		"fr": { "voice": "fr_FR-siwis-medium" },
		"phonon": { "provider": "openai", "apiUrl": "https://<your-phonon-host>", "timeoutSeconds": 330 }
	}
}
```

## Build

```sh
make build PROFILE=en    # copies the "en" bookmarklet to your clipboard
make dist                 # builds every profile into dist/<profile>.js
make clean               # removes dist/
```
