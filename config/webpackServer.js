var config = require("./webpack.config.js");
var webpack = require('webpack');
var WebpackDevServer = require('webpack-dev-server');
var path = require('path');

config.entry.app.unshift("webpack-dev-server/client?http://localhost:8080/");

var compiler = webpack(config);

var server = new WebpackDevServer(compiler, {
    contentBase: path.resolve(__dirname, '../'),
    publicPath: "/assets/"
});
server.listen(8080);