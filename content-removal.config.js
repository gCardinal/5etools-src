/**
 * Content removed from `data/` by `npm run content:remove` (and automatically by `npm run update:upstream`).
 * Preview with `npm run content:remove -- --dry-run`.
 *
 * `sources`: source IDs to remove entirely (every entity, book/adventure, and data file for that source).
 *
 * `rules`: each rule removes every entity matching ALL of its fields (case-insensitive). Any value may be an array.
 *   - `type`: the JSON key, e.g. spell, feat, race, subrace, class, subclass, classFeature, subclassFeature, item,
 *     baseitem, itemGroup, magicvariant, background, optionalfeature, monster, deity, vehicle, book, adventure, ...
 *     A type also matches its fluff (`spell` matches `spellFluff`). Unknown types are rejected with the list of valid ones.
 *   - any other field is compared to the entity's field of the same name: `source`, `name`, `className`, `shortName`, ...
 *
 * Cascades: removing a class also removes its subclasses and (sub)class features, removing a subclass removes its
 * features, removing a race removes its subraces, and removing anything removes its fluff.
 *
 * Examples:
 *   sources: ["XGE", "AI"],
 *   rules: [
 *     {source: "XPHB", type: ["feat", "background"]},           // part of a source
 *     {type: "class", name: "Artificer"},                        // a class from every source, with its subclasses
 *     {type: "subclass", className: "Fighter", shortName: "Echo Knight"},
 *     {type: "spell", name: ["Wish", "Simulacrum"], source: "PHB"},
 *     {type: "race", source: ["MPMM", "VGM"]},
 *   ],
 */
export default {
	sources: [
		"AI", "AATM", "AWM", "AZfyT", "AitFR-AVT", "AitFR-DN", "AitFR-FCD", "AitFR-ISF", "AitFR-THP", "BQGT", "CoA", "DoD",
		"GotSF", "HAT-LMI", "HAT-TG", "HBTD", "HFStCM", "IMR", "LK", "LLK", "LR", "MCV3MC", "MCV4EC", "MFF", "MGELFT",
		"MaBJoV", "MisMV1", "NRH-ASS", "NRH-AT", "NRH-AVitW", "NRH-AWoL", "NRH-CoI", "NRH-TCMC", "NRH-TLT", "OGA", "PiP",
		"RtG", "SADS", "ScoEE", "SjA", "TLK", "TTP", "UtHftLH", "VD", "XMtS",
	],
	rules: [{type: "race", source: "WOW"}],
};
