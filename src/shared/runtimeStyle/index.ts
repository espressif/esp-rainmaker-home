/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runtime style: validates a style document (schema), fetches and saves it (store), picks the active
 * style at start-up (config), and turns it into colours and image references (resolve), image
 * sources (assets) and i18n nouns (glossary). keys lists the image names a style may set.
 */

export * from "./keys";
export * from "./schema";
export * from "./store";
export * from "./config";
export * from "./resolve";
export * from "./assets";
export * from "./glossary";
