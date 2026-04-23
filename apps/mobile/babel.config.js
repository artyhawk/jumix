module.exports = (api) => {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // react-native-reanimated/plugin должен быть последним в списке.
      'react-native-reanimated/plugin',
    ],
  }
}
