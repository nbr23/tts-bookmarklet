const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const profileNames = Object.keys(config.profiles);
const profile = process.argv[2];

if (!profile || !config.profiles[profile]) {
	console.error(profile ? `Unknown profile "${profile}".` : 'Usage: node build.js <profile>');
	console.error('Available profiles: ' + profileNames.join(', '));
	process.exit(1);
}

const merged = Object.assign({}, config.defaults, config.profiles[profile]);

if (!merged.apiUrl) {
	console.error(`Profile "${profile}" has no apiUrl set (in "defaults" or the profile itself).`);
	process.exit(1);
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
