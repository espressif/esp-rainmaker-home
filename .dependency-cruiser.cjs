/** @type {import("dependency-cruiser").IConfiguration} */
/**
 * Automated architecture checks vs `.cursor/rules/code-standards.mdc`.
 *
 * | §   | Topic                         | Enforced here |
 * |-----|-------------------------------|---------------|
 * | §1  | Espressif SDK only in adaptor/bootstrap/config/tasks | `no-espressif-outside-sdk-layer` |
 * | §1  | Product UI via `@store`, not sdk-adaptors | `no-sdk-adaptors-in-product-layer` |
 * | §2B | `src/shared` → no `src/features` | `no-shared-to-features` |
 * | §1–2 | Store/adaptors/integrations/tasks/config/context → no features | `no-features-from-lower-layers` |
 *
 * **Not enforceable by dependency-cruiser** (use ESLint, review, or tests):
 * - JSDoc, magic strings, `getFeatures()` vs raw env (§3–4).
 * - Folder layout inside `features/<domain>/` (screens/hooks/utils).
 * - **Native adaptors** (`@native-adaptors/*`) from features/shared/app: common today for RN bridges;
 *   not forbidden here to avoid blocking the tree; tighten when abstracted behind store/shared.
 */
module.exports = {
  forbidden: [
    {
      name: "no-espressif-outside-sdk-layer",
      severity: "error",
      comment:
        "Espressif npm packages (`@espressif/*`) only under sdk-adaptors, native-adaptors, integrations, config, tasks — code-standards §1.",
      from: {
        path: "^(src|app|config)/",
        pathNot:
          "^(src/sdk-adaptors|src/native-adaptors|src/tasks|src/integrations|config)/",
      },
      to: { path: "^node_modules/@espressif/(?!rainmaker-base-cdf(?:/|$))" },
    },
    {
      name: "no-sdk-adaptors-in-product-layer",
      severity: "error",
      comment:
        "Features, shared UI, and app routes use `@store` / `@config` — not `src/sdk-adaptors` — code-standards §1.",
      from: {
        path: "^(src/features|src/shared|app)/",
      },
      to: { path: "^src/sdk-adaptors/" },
    },
    {
      name: "no-shared-to-features",
      severity: "error",
      comment:
        "`src/shared` must stay domain-neutral — no imports from `src/features` — code-standards §2B.",
      from: { path: "^src/shared/" },
      to: { path: "^src/features/" },
    },
    {
      name: "no-features-from-lower-layers",
      severity: "error",
      comment:
        "Infrastructure (store, adaptors, integrations, tasks, config, context) must not depend on `src/features` — code-standards §1–2.",
      from: {
        path: "^(src/sdk-adaptors|src/native-adaptors|src/integrations|src/tasks|src/store|src/context|config)/",
      },
      to: { path: "^src/features/" },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
