# Local Vendor Assets

Place the minified browser builds of the following libraries in this directory:

- `static/vendor/kuromoji/kuromoji.js`
- `static/vendor/kuroshiro/kuroshiro.min.js`
- `static/vendor/kuroshiro-analyzer-kuromoji/kuroshiro-analyzer-kuromoji.min.js`
- `static/vendor/wanakana/wanakana.min.js`

You can obtain them from the official NPM packages:

```bash
npm install kuromoji kuroshiro kuroshiro-analyzer-kuromoji wanakana
```

Then copy the browser bundles from `node_modules` into the corresponding folders above.
