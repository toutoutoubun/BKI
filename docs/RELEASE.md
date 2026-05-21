# Desktop Release Guide

BKI can be released as desktop installers for macOS, Windows, and Linux through GitHub Actions.

## What the workflows do

- `.github/workflows/ci.yml` validates every push and pull request to `main` on Ubuntu, macOS, and Windows.
- `.github/workflows/release-desktop.yml` builds draft GitHub Releases for tags that start with `v`, or from manual workflow dispatch.
- The Tauri bundle includes the `python/` sidecar directory as an application resource.
- The desktop app resolves `python/main.py` from the development tree first, then from the bundled app resources.

## Runtime note

The current release bundle includes BKI's Python analysis code, but it does not yet embed a full Python interpreter. Release users need either:

- `python3` on PATH for macOS and Linux,
- `python` on PATH for Windows,
- or `BKI_PYTHON` set to a specific interpreter path.

`BKI_PYTHON_MAIN` can still be used by developers to point the app at a custom sidecar entrypoint.

## Release steps

1. Update the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
2. Run local checks:

   ```bash
   npm ci
   npm run icons
   npm run check
   cd src-tauri
   cargo check --locked
   ```

3. Commit and push the version change.
4. Create and push a release tag:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

   You can also run the `release-desktop` workflow manually and provide the same tag.

5. Review the draft release assets:

   - macOS: DMG and app archive from the universal build
   - Windows: MSI/NSIS installer artifacts from Tauri
   - Linux: DEB/RPM/AppImage artifacts from Tauri, depending on the runner toolchain

6. Publish the draft release after smoke testing the generated installers.

## Optional signing secrets

macOS code signing and notarization are used automatically when these repository secrets are configured:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

Windows code signing is not configured yet. Add it before distributing trusted production installers at scale.
