import { bundleID, companyName, productName, version } from './package.json'

/**
 * The `productName` of the app, which determines both the name of the app
 * bundle (and therefore the name shown in the Dock and the menu bar) and the
 * directory the app stores its data in.
 *
 * `DESKTOP_PRODUCT_NAME` allows a downstream build to pick a different name,
 * e.g. a privately built copy which needs to be installable alongside a
 * regular GitHub Desktop.
 */
export function getProductName() {
  const name = process.env.DESKTOP_PRODUCT_NAME || productName

  return process.env.NODE_ENV === 'development' ? `${name}-dev` : name
}

export function getCompanyName() {
  return companyName
}

export function getVersion() {
  return version
}

/**
 * The bundle identifier of the app. Two copies of the app with the same
 * identifier are considered the same application by macOS, so a privately
 * built copy which should coexist with a regular GitHub Desktop install
 * needs its own identifier (see `DESKTOP_BUNDLE_ID`).
 */
export function getBundleID() {
  const override = process.env.DESKTOP_BUNDLE_ID

  if (override !== undefined && override.length > 0) {
    return override
  }

  return process.env.NODE_ENV === 'development' ? `${bundleID}Dev` : bundleID
}
