# tts-bookmarklet

Bookmarklet that adds a "listen" button to paragraphs/list items/blockquotes on any page, using [gopipertts](https://github.com/nbr23/gopipertts).

## Dependency

gopipertts must be reachable cross-origin: put it behind a reverse proxy that adds `Access-Control-Allow-Origin`, and serve it over HTTPS if used on HTTPS pages.

## CORS/CSP

- **Normal case**: `fetch`es `POST /api/tts`, plays the result inline via the button.
- **Blocked case**: if the page's CORS or CSP policy blocks that `fetch`, it falls back to opening a `GET /api/tts?...` URL in a new tab instead. The first click on a blocked page may get its popup silently blocked (browsers only allow `window.open` reliably from a direct click); just click "listen" again and it opens.

## Configure

```sh
cp config.sample.json config.json
```

Edit `config.json` (gitignored, per-user): a `defaults` object plus a `profiles` map, merged per profile.

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
		"fr": { "voice": "fr_FR-siwis-medium" }
	}
}
```

## Build

```sh
make build PROFILE=en    # copies the "en" bookmarklet to your clipboard
make dist                 # builds every profile into dist/<profile>.js
make clean               # removes dist/
```
