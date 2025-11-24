const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const webpack = require("webpack");
require("dotenv").config();

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
      // Resolve pdf-lib to its distributed ESM/UMD bundle to avoid cjs subpath import issues
      // Some pdf-lib installs include a minimal `cjs/index.js` that re-exports subpaths which
      // may not be present in all installs — alias to the built distribution instead.
      "pdf-lib$": path.resolve(__dirname, "node_modules/pdf-lib/dist/pdf-lib.esm.js"),
    },
    fallback: {
      fs: false,
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
  // copy public folder to the output directory (include models so local/public/models is available)
  new CopyWebpackPlugin({ patterns: [{ from: path.resolve(__dirname, "public"), to: path.resolve(__dirname, "dist") }] }),
  ],
  devServer: {
    // serve static files from public during development, then fall back to dist
    static: [
      { directory: path.resolve(__dirname, "public"), publicPath: "/" },
      { directory: path.resolve(__dirname, "dist"), publicPath: "/" },
    ],
    port: 3000,
    historyApiFallback: true,
    hot: true,
    open: true,
  },
  devtool: isProd ? "source-map" : "eval-source-map",
  performance: { hints: isProd ? "warning" : false },

  // 🔹 NEW: Optimization for Font Awesome chunk
  optimization: {
    splitChunks: {
      cacheGroups: {
        faIcons: {
          test: /[\\/]node_modules[\\/]@fortawesome[\\/]/,
          name: "fa-icons",
          chunks: "all",
          priority: 20,
        },
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: "vendors",
          chunks: "all",
          priority: 10,
        },
      },
    },
  },
};
