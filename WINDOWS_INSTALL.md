# Installing on Windows

If `npm install` fails with Python / node-gyp errors, it is caused by the `sharp` package (used for image dimension reading). Sharp has prebuilt binaries for Linux but requires compilation on Windows.

## Fix — two commands, that's it

```bash
# Step 1: Install everything except native packages
cd backend
npm install --ignore-scripts

# Step 2: Install the Linux-compiled sharp binary for local use
npm install --platform=win32 --arch=x64 sharp
```

Then run normally:
```bash
npm run start:dev
```

## Why this happens

`sharp` is a fast image processing library. On Linux (Railway, VPS) it downloads a prebuilt binary automatically. On Windows it tries to compile from source, which requires Python 3.6+ and Visual Studio Build Tools.

The `--ignore-scripts` flag skips the compilation step and the second command installs the correct Windows prebuilt binary instead.

## Alternative: skip image validation locally

If you don't need image dimension validation during local development, you can temporarily remove `sharp` from `package.json` and use `npm install` normally. The app will still work — just without width/height checks on uploaded images.
