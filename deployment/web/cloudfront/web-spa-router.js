// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
//
// SPDX-License-Identifier: Apache-2.0
//
// CloudFront Function (viewer-request) for APP_ASSETS web SPA hosting.
//
// Uploaded site lives under:
//   /web/<env>/<region>/<version>/index.html
//   e.g. /web/prod/global/6.1.0/
//
// S3 + CloudFront have no `_redirects`-style rewrite rules, and Default Root Object
// only covers `/` — not versioned prefixes. This function rewrites SPA routes
// under a version folder to that folder's index.html so deep links and
// trailing-slash directory URLs resolve to the uploaded assets.
//
// Pass-through (unchanged):
//   - any URI with a file extension (js/css/png/json/…)
//   - non-/web/* paths
//   - other pointer keys under latest/ (except the bounce routes below)
//
// latest bounce (client redirect via latest/index.html):
//   /web/<env>/<region>/latest
//   /web/<env>/<region>/latest/
//   /web/<env>/<region>/latest/embed
//
// Apply with: ./deployment/web/scripts/apply-web-spa-cloudfront-function.sh

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Real static files under the version tree (and elsewhere) — do not rewrite.
  if (uri.match(/\.[0-9a-zA-Z]+$/)) {
    return request;
  }

  // Match /web/<env>/<region>/<version> or /web/<env>/<region>/<version>/<spa-route>
  var match = uri.match(/^\/web\/([^/]+)\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
  if (!match) {
    return request;
  }

  var environment = match[1];
  var region = match[2];
  var version = match[3];
  var rest = match[4] || "";

  // Mutable latest/ tree: serve the bounce HTML for directory + embed URLs.
  // manifest.json keeps the extension pass-through above.
  if (version === "latest") {
    if (rest === "" || rest === "embed") {
      request.uri =
        "/web/" + environment + "/" + region + "/latest/index.html";
    }
    return request;
  }

  // Require a semver-like version segment (e.g. 6.1.0 or 6.1.0-rc.1).
  if (!/^[0-9]+\.[0-9]+\.[0-9]+/.test(version)) {
    return request;
  }

  request.uri =
    "/web/" + environment + "/" + region + "/" + version + "/index.html";
  return request;
}
