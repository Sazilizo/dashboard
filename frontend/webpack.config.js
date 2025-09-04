const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const webpack = require("webpack");
require('dotenv').config();

// Read environment variables from Node process (Vercel / local)
const envKeys = Object.keys(process.env).reduce((prev, next) => {
  if (next.startsWith("REACT_APP_")) {
    prev[`process.env.${next}`] = JSON.stringify(process.env[next]);
  }
  return prev;
}, {});

const isProd = process.env.NODE_ENV === "production";

module.exports = {
  mode: isProd ? "production" : "development",
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "js/[name].[contenthash].js",
    assetModuleFilename: "images/[hash][ext][query]",
    publicPath: "/",
    clean: true,
  },
  resolve: {
    extensions: [".js", ".jsx"],
    alias: {
      "@components": path.resolve(__dirname, "src/components"),
      "@assets": path.resolve(__dirname, "src/assets"),
      "@styles": path.resolve(__dirname, "src/styles"),
    },
    fallback: {
      fs: false, // no fs in browser
      crypto: require.resolve("crypto-browserify"),
      util: require.resolve("util/"),
    },
  },
  module: {
    rules: [
      { test: /\.(js|jsx)$/, exclude: /node_modules/, use: "babel-loader" },
      { test: /\.css$/, use: ["style-loader", "css-loader", "postcss-loader"] },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: "asset",
        parser: { dataUrlCondition: { maxSize: 10 * 1024 } },
      },
      {
        test: /\.(woff2?|eot|ttf|otf)$/i,
        type: "asset/resource",
        generator: { filename: "fonts/[hash][ext]" },
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser.js",
    }),
    new HtmlWebpackPlugin({
      template: "./src/index.html",
      minify: isProd && { collapseWhitespace: true, removeComments: true },
    }),
    new webpack.DefinePlugin(envKeys),
    new MiniCssExtractPlugin({
      filename: isProd ? "css/[name].[contenthash].css" : "[name].css",
    }),
  ],
  devServer: {
    static: { directory: path.resolve(__dirname, "public"), publicPath: "/" },
    port: 3000,
    historyApiFallback: true,
    hot: true,
    open: true,
  },
  devtool: isProd ? "source-map" : "eval-source-map",
  performance: { hints: isProd ? "warning" : false },
};
