// Karma configuration
// Generated on Fri Jun 16 2017 16:14:44 GMT+0800 (CST)
const webpackconf = require('./config/webpack.config.js');

module.exports = function (config) {
  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',
    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['jasmine'],
    // list of files / patterns to load in the browser
    files: [
      'src/index.js',
      'test/*.js'
    ],
    // list of files to exclude
    exclude: [
      'node_modules'
    ],
    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
        'src/index.js': ['webpack', 'sourcemap', 'coverage'],
        'test/*.js': ['webpack']
    },
    plugins: [
      'karma-jasmine',
      'karma-mocha-reporter',
      'karma-sourcemap-loader',
      'karma-webpack',
      'karma-coverage',
      'karma-chrome-launcher'
    ],
    // babelPreprocessor: {
    //   options: {
    //     presets: ['es2015',"stage-0"],
    //     //plugins: ['transform-es2015-modules-umd'],
    //     sourceMap: 'inline'
    //   },
    //   filename: function (file) {
    //     return file.originalPath.replace(/\.js$/, '.es5.js');
    //   },
    //   sourceFileName: function (file) {
    //     return file.originalPath;
    //   }
    // },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['mocha', 'progress', 'coverage'],

    webpack: webpackconf,

    // web server port
    port: 9876,
    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // coverageReporter
    coverageReporter: {
      type: 'text',
      dir: 'coverage/'
    },
    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,
    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,
    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['Chrome'],
    useIframe: false,

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,

    // Concurrency level
    // how many browser should be started simultaneous
    concurrency: Infinity
  });
};
