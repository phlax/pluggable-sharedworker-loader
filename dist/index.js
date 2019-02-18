'use strict';

Object.defineProperty(exports, "__esModule", {
			value: true
});
exports.default = loader;
exports.pitch = pitch;

var _options = require('./options.json');

var _options2 = _interopRequireDefault(_options);

var _loaderUtils = require('loader-utils');

var _loaderUtils2 = _interopRequireDefault(_loaderUtils);

var _schemaUtils = require('@webpack-contrib/schema-utils');

var _schemaUtils2 = _interopRequireDefault(_schemaUtils);

var _NodeTargetPlugin = require('webpack/lib/node/NodeTargetPlugin');

var _NodeTargetPlugin2 = _interopRequireDefault(_NodeTargetPlugin);

var _MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');

var _MultiEntryPlugin2 = _interopRequireDefault(_MultiEntryPlugin);

var _WebWorkerTemplatePlugin = require('webpack/lib/webworker/WebWorkerTemplatePlugin');

var _WebWorkerTemplatePlugin2 = _interopRequireDefault(_WebWorkerTemplatePlugin);

var _workers = require('./workers/');

var _workers2 = _interopRequireDefault(_workers);

var _Error = require('./Error');

var _Error2 = _interopRequireDefault(_Error);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable
  import/first,
  import/order,
  comma-dangle,
  linebreak-style,
  no-param-reassign,
  no-underscore-dangle,
  prefer-destructuring
*/
const fs = require('fs');
const tmpDir = __dirname + '/dist';
const tmpFile = tmpDir + '/tmpworker.js';
const otherTmpFile = tmpDir + '/mainworker.js';

function loader() {}

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
};

const writeToFile = function (tmpFile, contents) {
			if (!fs.existsSync(tmpDir)) {
						fs.mkdirSync(tmpDir);
			}
			console.log('writing tmp file');
			console.log(contents);
			fs.writeFile(tmpFile, contents, function (err) {
						if (err) {
									return console.error(err);
						}
			});
};

function pitch(request) {
			const options = _loaderUtils2.default.getOptions(this) || {};

			(0, _schemaUtils2.default)({ name: 'Worker Loader', schema: _options2.default, target: options });

			if (!this.webpack) {
						throw new _Error2.default({
									name: 'Worker Loader',
									message: 'This loader is only usable with webpack'
						});
			}

			this.cacheable(false);

			const cb = this.async();

			const filename = _loaderUtils2.default.interpolateName(this, options.name || '[hash].worker.js', {
						context: options.context || this.rootContext || this.options.context,
						regExp: options.regExp
			});

			const worker = {};

			worker.options = {
						filename,
						chunkFilename: `[id].${filename}`,
						namedChunkFilename: null
			};

			worker.compiler = this._compilation.createChildCompiler('worker', worker.options);

			writeToFile(tmpFile, generateWorkerFile(options.plugins));

			new _WebWorkerTemplatePlugin2.default(worker.options).apply(worker.compiler);

			if (this.target !== 'webworker' && this.target !== 'web') {
						new _NodeTargetPlugin2.default().apply(worker.compiler);
			}

			new _MultiEntryPlugin2.default(this.context, [tmpFile, `!!${request}`], 'main').apply(worker.compiler);

			const subCache = `subcache ${__dirname} ${request}`;

			worker.compilation = compilation => {
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

									console.log('got back worker file');
									console.log(worker.file);

									worker.factory = (0, _workers2.default)(worker.file, compilation.assets[worker.file].source(), options);

									if (options.fallback === false) {
												delete this._compilation.assets[worker.file];
									}
									console.log(worker.factory);
									return cb(null, `module.exports = function() {\n  return ${worker.factory};\n};`);
						}

						return cb(null, null);
			});
}