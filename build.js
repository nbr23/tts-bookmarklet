const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const profileNames = Object.keys(config.profiles);
const profile = process.argv[2];
const providers = ['gopipertts', 'openai'];

function fail(message) {
	console.error(message);
	process.exit(1);
}

if (!profile || !config.profiles[profile]) {
	console.error(profile ? `Unknown profile "${profile}".` : 'Usage: node build.js <profile>');
	fail('Available profiles: ' + profileNames.join(', '));
}

function resolveProfile(name) {
	const merged = Object.assign({}, config.defaults, config.profiles[name]);

	if (!merged.apiUrl) {
		fail(`Profile "${name}" has no apiUrl set (in "defaults" or the profile itself).`);
	}
	if (merged.provider !== undefined && !providers.includes(merged.provider)) {
		fail(`Profile "${name}" has unknown provider "${merged.provider}" (expected one of: ${providers.join(', ')}).`);
	}
	return merged;
}

function resolveFallback(name, fallback) {
	if (!config.profiles[fallback]) {
		fail(`Profile "${name}" has unknown fallback "${fallback}" (available profiles: ${profileNames.join(', ')}).`);
	}
	if (fallback === name) {
		fail(`Profile "${name}" cannot fall back to itself.`);
	}
	const resolved = resolveProfile(fallback);
	if (resolved.fallback !== undefined) {
		fail(`Profile "${name}" falls back to "${fallback}", which has its own fallback (only one level is supported).`);
	}
	return resolved;
}

const merged = resolveProfile(profile);
if (merged.fallback !== undefined) {
	merged.fallback = resolveFallback(profile, merged.fallback);
}

const template = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');

// Strip comments/whitespace from the template BEFORE injecting the config
// literal - the config values (e.g. an apiUrl containing "//") would
// otherwise be mistaken for line comments by the regex below.
const minifiedTemplate = template
	.replace(/\/\/.*$/gm, '')
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.replace(/\s+/g, ' ')
	.trim();

const withConfig = minifiedTemplate.replace('__TTS_BOOKMARKLET_CONFIG__', JSON.stringify(merged));

console.log('javascript:' + encodeURIComponent(withConfig));
