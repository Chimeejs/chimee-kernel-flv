const path = require('path');

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
          }
        ]
      }
    ]
  }
}