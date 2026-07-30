.PHONY: build dist dist-all clean

build:
	@test -n "$(PROFILE)" || (echo "Usage: make build PROFILE=<name>" && exit 1)
	@node build.js $(PROFILE) > /tmp/tts-bookmarklet-$(PROFILE).js
	@cat /tmp/tts-bookmarklet-$(PROFILE).js
	@echo
	@if command -v pbcopy > /dev/null 2>&1; then \
		cat /tmp/tts-bookmarklet-$(PROFILE).js | pbcopy; \
		echo "Copied to clipboard (pbcopy)"; \
	elif command -v xclip > /dev/null 2>&1; then \
		cat /tmp/tts-bookmarklet-$(PROFILE).js | xclip -selection clipboard; \
		echo "Copied to clipboard (xclip)"; \
	else \
		echo "No clipboard tool found (pbcopy/xclip) - copy the output above manually"; \
	fi

dist:
	@test -n "$(PROFILE)" || (echo "Usage: make dist PROFILE=<name>" && exit 1)
	@mkdir -p dist
	node build.js $(PROFILE) > dist/$(PROFILE).js

dist-all:
	@mkdir -p dist
	@for p in $$(node -e "console.log(Object.keys(require('./config.json').profiles).join('\n'))"); do \
		echo "Building $$p..."; \
		node build.js $$p > dist/$$p.js || exit 1; \
	done

clean:
	rm -rf dist
