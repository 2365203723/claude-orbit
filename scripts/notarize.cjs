/**
 * Apple notarization script for electron-builder.
 *
 * Triggered by the `afterSign` hook in the build config.
 * Requires these env vars to be set:
 *   APPLE_ID            — your Apple Developer email
 *   APPLE_TEAM_ID       — 10-character team ID from developer.apple.com
 *   APPLE_APP_SPECIFIC_PASSWORD  — app-specific password generated at appleid.apple.com
 *
 * Leave all three unset to skip notarization (unsigned builds).
 */

const { notarize } = require('@electron/notarize');
const pkg = require('../package.json');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appId = pkg.build.appId;
  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const appleId = process.env.APPLE_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD;

  if (!appleId || !teamId || !password) {
    console.warn(
      '⚠️  Skipping notarization — APPLE_ID, APPLE_TEAM_ID, or APPLE_APP_SPECIFIC_PASSWORD not set.\n' +
      '    The DMG will be unsigned. macOS Gatekeeper will show "damaged" warning.\n' +
      '    Set these env vars (as GitHub Secrets or locally) to enable notarization.',
    );
    return;
  }

  console.log(`✍️  Notarizing ${appPath}…`);

  await notarize({
    appPath,
    appleId,
    appleIdPassword: password,
    teamId,
  });

  console.log('✅  Notarization complete.');
};
