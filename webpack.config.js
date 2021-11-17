/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

//console.log({TerserPlugin})
module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'worker.js',
    path: path.join(__dirname, 'dist'),
  },
  devtool: 'inline-cheap-module-source-map',
  mode: 'development',
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },

  plugins: [
    {
      // anonymous plugin
      apply(compiler) {
        compiler.hooks.beforeRun.tapAsync('MyCustomBeforeRunPlugin', function (compiler, callback) {
          // console.log(JSON.stringify(compiler.options, undefined, 2))
          callback();
        });
      },
    },
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        options: {
          // transpileOnly is useful to skip typescript checks occasionally:
          // transpileOnly: true,
        },
      },
    ],
  },
};
