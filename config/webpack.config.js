const path = require('path');
const {version, name, author, license, dependencies} = require('../package.json');

module.exports = {
  entry: {
    app:['./src/index.js']
  },

  output: {
    path: path.resolve(__dirname, '../lib'),
    filename: 'index.js',
    library: 'chimeeKernelFlv',
    libraryTarget: 'umd',
    libraryExport: 'default'

  },

  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: [
          path.resolve(__dirname, '../node_modules')
        ],
        use: [
          {
            loader: 'babel-loader',
            options: {
              'presets': ['latest'],
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
}