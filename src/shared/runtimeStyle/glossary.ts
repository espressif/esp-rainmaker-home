/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Default nouns for terms the active style's glossary does not set. */
export const GLOSSARY_DEFAULTS = {
  device: "Device",
  devices: "Devices",
  room: "Room",
  rooms: "Rooms",
  group: "Group",
  groups: "Groups",
  automation: "Automation",
  automations: "Automations",
  schedule: "Schedule",
  schedules: "Schedules",
  scene: "Scene",
  scenes: "Scenes",
} as const;

type GlossaryTerm = keyof typeof GLOSSARY_DEFAULTS;

const LOWER_SUFFIX = "Lower";

const TERM_PAIRS: [GlossaryTerm, GlossaryTerm][] = [
  ["device", "devices"],
  ["room", "rooms"],
  ["group", "groups"],
  ["automation", "automations"],
  ["schedule", "schedules"],
  ["scene", "scenes"],
];

/**
 * Regular English plural of a noun.
 * @param word - The singular noun
 * @returns Its plural, e.g. `Utility` to `Utilities`, `Box` to `Boxes`
 */
function pluralise(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + "es";
  return word + "s";
}

/**
 * Builds i18n variables for each term (singular, plural and lower-case forms) from the style glossary.
 * A missing plural is made from a custom singular; a missing term uses the default.
 * @param overrides - Style `config.glossary`, if any
 * @returns Default interpolation variables for `i18next`, e.g. `device`, `devices`, `deviceLower`
 */
export function glossaryVariables(overrides?: Partial<Record<string, string>>): Record<string, string> {
  const read = (key: string): string | undefined => {
    const value = overrides?.[key]?.trim();
    return value || undefined;
  };

  const variables: Record<string, string> = {};
  for (const [singular, plural] of TERM_PAIRS) {
    const custom = read(singular);
    const one = custom ?? GLOSSARY_DEFAULTS[singular];
    const many = read(plural) ?? (custom ? pluralise(custom) : GLOSSARY_DEFAULTS[plural]);

    variables[singular] = one;
    variables[plural] = many;
    variables[`${singular}${LOWER_SUFFIX}`] = one.toLocaleLowerCase();
    variables[`${plural}${LOWER_SUFFIX}`] = many.toLocaleLowerCase();
  }
  return variables;
}
