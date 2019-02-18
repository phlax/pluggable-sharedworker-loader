
import schema from './options.json';
import loaderUtils from 'loader-utils';
import validateOptions from '@webpack-contrib/schema-utils';

import NodeTargetPlugin from 'webpack/lib/node/NodeTargetPlugin';
import MultiEntryPlugin from 'webpack/lib/MultiEntryPlugin';
import WebWorkerTemplatePlugin from 'webpack/lib/webworker/WebWorkerTemplatePlugin';

import getWorker from './workers/';
import WorkerLoaderError from './Error';

const fs = require('fs');
const tmpDir = __dirname + '/dist';
const tmpFile = tmpDir + '/tmpworker.js';
const otherTmpFile = tmpDir + '/mainworker.js';

export default function loader() {}


const generateWorkerFile = function (plugins) {
    const lines = ['', "import PluggableWorker from '@pluggable/sharedworker/app';"];
    let i = 0;
    // lines.push('console.log("generating worker plugins")')
    for (let plugin of plugins) {
	// lines.push('import Plugin_' + i + ' from "' + plugin + '";');
	lines.push('import Plugin_' + i + ' from "' + plugin + '";');
	i = i + 1;
    }
    lines.push('self.plugins = [' + plugins.map((p, i) => 'Plugin_' + i).join(', ') + '];');
    lines.push('self.worker = new PluggableWorker(self.name, self.plugins);');
    return lines.join('\n');
}


const writeToFile = function (tmpFile, contents) {
    if (!fs.existsSync(tmpDir)){
	fs.mkdirSync(tmpDir);
    }
    fs.writeFile(
	tmpFile, contents,
	function(err) {
	    if(err) {
		return console.error(err);
	    }
	});
}


export function pitch(request) {
    const options = loaderUtils.getOptions(this) || {};

    validateOptions({ name: 'Worker Loader', schema, target: options });

    if (!this.webpack) {
	throw new WorkerLoaderError({
	    name: 'Worker Loader',
	    message: 'This loader is only usable with webpack',
	});
    }

    this.cacheable(false);

    const cb = this.async();

    const filename = loaderUtils.interpolateName(
	this,
	options.name || '[hash].worker.js',
	{
	    context: options.context || this.rootContext || this.options.context,
	    regExp: options.regExp,
	}
    );

    const worker = {};

    worker.options = {
	filename,
	chunkFilename: `[id].${filename}`,
	namedChunkFilename: null,
    };

    worker.compiler = this._compilation.createChildCompiler(
	'worker',
	worker.options
    );

    writeToFile(tmpFile, generateWorkerFile(options.plugins));

    new WebWorkerTemplatePlugin(worker.options).apply(worker.compiler);

    if (this.target !== 'webworker' && this.target !== 'web') {
	new NodeTargetPlugin().apply(worker.compiler);
    }

    new MultiEntryPlugin(this.context, [tmpFile, `!!${request}`], 'main').apply(
	worker.compiler
    );

    const subCache = `subcache ${__dirname} ${request}`;

    worker.compilation = (compilation) => {
	if (compilation.cache) {
	    if (!compilation.cache[subCache]) {
		compilation.cache[subCache] = {};
	    }

	    compilation.cache = compilation.cache[subCache];
	}
    };

    if (worker.compiler.hooks) {
	const plugin = { name: 'PluggableSharedWorkerLoader' };
	worker.compiler.hooks.compilation.tap(plugin, worker.compilation);
    } else {
	worker.compiler.plugin('compilation', worker.compilation);
    }

    worker.compiler.runAsChild((err, entries, compilation) => {
	if (err) return cb(err);

	if (entries[0]) {
	    worker.file = entries[0].files[0];

	    worker.factory = getWorker(
		worker.file,
		compilation.assets[worker.file].source(),
		options
	    );

	    if (options.fallback === false) {
		delete this._compilation.assets[worker.file];
	    }
	    return cb(
		null,
		`module.exports = function() {\n  return ${worker.factory};\n};`
	    );
	}

	return cb(null, null);
    });
}
