const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require("webpack");
const dotenv = require("dotenv");

const env = dotenv.config().parsed;

const envKeys = Object.keys(env).reduce((prev, next) => {
  prev[`process.env.${next}`] = JSON.stringify(env[next]);
  return prev;
}, {});

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name].[contenthash].js',
    assetModuleFilename: 'images/[hash][ext][query]',
    publicPath: '/',
    clean: true,
  },
  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      '@components': path.resolve(__dirname, 'src/components'),
      '@assets': path.resolve(__dirname, 'src/assets'),
      '@styles': path.resolve(__dirname, 'src/styles'),
    },
  },
  module: {
    rules: [
      // JSX/JS transpilation
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
      // CSS & SCSS
      {
        test: /\.css$/,
        use: [
          'style-loader',          
          'css-loader',            
          'postcss-loader'        
        ],
      },
      // Image assets (png, jpg, svg, gif)
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: 10 * 1024, // inline files < 10kb
          },
        },
      },
      // Fonts (optional)
      {
        test: /\.(woff2?|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[hash][ext]',
        },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      minify: isProd && {
        collapseWhitespace: true,
        removeComments: true,
      },
    }),
    new webpack.DefinePlugin({
      "process.env": JSON.stringify(process.env)
    }),
    new MiniCssExtractPlugin({
      filename: isProd ? 'css/[name].[contenthash].css' : '[name].css',
    }),
  ],
  devServer: {
    static: {
      directory: path.resolve(__dirname, 'dist'),
      publicPath: '/',
    },
    port: 3000,
    historyApiFallback: true,
    hot: true,
    open: true,
  },
  devtool: isProd ? 'source-map' : 'eval-source-map',
  performance: {
    hints: isProd ? 'warning' : false,
  },
};
