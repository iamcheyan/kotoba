# Kuromoji Dictionary Files

Copy the contents of `node_modules/kuromoji/dict/` into this directory so that files like
`base.dat.gz`, `check.dat.gz`, `tid.dat.gz`, etc. are available locally.

Example:

```bash
npm install kuromoji
cp -R node_modules/kuromoji/dict/* static/kuromoji-dict/
```

The front-end will read these files via `/static/kuromoji-dict/` so they must exist for
Kuroshiro to provide kanji readings and furigana without hitting a CDN.
