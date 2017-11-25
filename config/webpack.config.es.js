const path = require('path');
const {version} = require('../package.json');

module.exports = {
  entry: {
    app: ['./src/index.js']
  },

  output: {
    path: path.resolve(__dirname, '../lib'),
    filename: 'index.es.mjs',
    library: 'chimeeKernelFlv',
    libraryTarget: 'commonjs',
    libraryExport: 'default'
  },
  resolve: {
    alias: {
      $const: path.resolve(__dirname, '../src/const.js')
    }
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: [
          path.resolve(__dirname, '../node_modules/**')
        ],
        use: [
          {
            loader: 'babel-loader',
            options: {
              'babelrc': false,
              'presets': [
                [
                  'env',
                  {
                    'es2015': {
                      'modules': false
                    }
                  }
                ]
              ],
            }
          },
          {
            loader: 'string-replace-loader',
            query: {
              search: '__VERSION__',
              replace: JSON.stringify(version)
            }
          }
        ]
      }
    ]
  }
};
