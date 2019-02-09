const plugins = require('./package').plugins;

const packages = [];
for (const plugin of Object.values(plugins)) {
    const split = plugin.split(':');
    const package = split[0];
    const version = split[1] || null;

    packages.push(package + (version ? '@' + version : ''));
}

console.log('npm install ' + packages.join(' '));
