/**
 * Removes unwanted content from `data/`, driven by `content-removal.config.js` at the repo root.
 *
 * Usage:
 *   node node/remove-content.js            Apply removals
 *   node node/remove-content.js --dry-run  Report what would be removed, write nothing
 *
 * See `content-removal.config.js` for the rule format.
 */

import fs from "fs";
import path from "path";
import {pathToFileURL} from "url";

import "../js/parser.js";
import "../js/utils.js";

const CONFIG_FILENAME = "content-removal.config.js";

// Files with `source` fields that are not content and must never be pruned
const FILES_SKIPPED = new Set([
	"data/blocklist-default.json",
	"data/changelog.json",
	"data/converter.json",
	"data/renderdemo.json",
]);
const DIRS_SKIPPED = new Set([
	"data/generated", // Rebuilt by `npm run gen`
]);

// Files that map keys to filenames in the same directory, e.g. `{"PHB": "spells-phb.json"}`
const INDEX_FILENAMES = new Set(["index.json", "fluff-index.json"]);

/* -------------------------------------------- */

const lc = str => typeof str === "string" ? str.toLowerCase() : str;
const toArr = val => val == null ? [] : (Array.isArray(val) ? val : [val]);
const getBaseKey = key => key.endsWith("Fluff") ? key.slice(0, -"Fluff".length) : key;

const isEntity = obj => obj != null && typeof obj === "object" && !Array.isArray(obj);

class Rule {
	constructor (raw, ix) {
		if (!isEntity(raw) || !Object.keys(raw).length) throw new Error(`Rule #${ix} must be a non-empty object: ${JSON.stringify(raw)}`);
		this.raw = raw;
		this.types = raw.type == null ? null : new Set(toArr(raw.type));
		this.fields = Object.entries(raw)
			.filter(([k]) => k !== "type")
			.map(([k, v]) => [k, new Set(toArr(v).map(lc))]);
		this.matchCount = 0;
	}

	isMatch (key, ent) {
		if (this.types && !this.types.has(key) && !this.types.has(getBaseKey(key))) return false;
		return this.fields.every(([k, vals]) => vals.has(lc(ent[k])));
	}

	toString () { return JSON.stringify(this.raw); }
}

export async function loadConfig (repoRoot) {
	const configPath = path.join(repoRoot, CONFIG_FILENAME);
	if (!fs.existsSync(configPath)) return null;
	const {default: config} = await import(`${pathToFileURL(configPath).href}?t=${Date.now()}`);
	return config;
}

function getRules (config) {
	const raws = [
		...toArr(config?.sources).map(source => ({source})),
		...toArr(config?.rules),
	];
	return raws.map((raw, i) => new Rule(raw, i));
}

function listJsonFiles (repoRoot) {
	const out = [];
	const walk = dirRel => {
		for (const dirent of fs.readdirSync(path.join(repoRoot, dirRel), {withFileTypes: true})) {
			const rel = `${dirRel}/${dirent.name}`;
			if (dirent.isDirectory()) {
				if (!DIRS_SKIPPED.has(rel)) walk(rel);
			} else if (dirent.name.endsWith(".json") && !FILES_SKIPPED.has(rel)) out.push(rel);
		}
	};
	walk("data");
	return out.sort();
}

const getEntityArrays = json => {
	if (!isEntity(json)) return [];
	return Object.entries(json)
		.filter(([key, val]) => key !== "_meta" && Array.isArray(val));
};

/* -------------------------------------------- */

/**
 * Builds the set of predicates for entities removed indirectly, from the entities matched by rules:
 * - class    -> its subclasses, class features, subclass features, (sub)class fluff
 * - subclass -> its subclass features and fluff
 * - race     -> its subraces
 * - anything -> its `<type>Fluff` counterpart
 */
function getCascade (directRemovals) {
	const classes = new Set();
	const subclasses = new Set();
	const races = new Set();
	const fluff = new Set();

	for (const {key, ent} of directRemovals) {
		fluff.add([key, lc(ent.name), lc(ent.source), lc(ent.className), lc(ent.classSource)].join("|"));
		if (key === "class") classes.add([lc(ent.name), lc(ent.source)].join("|"));
		if (key === "subclass") subclasses.add([lc(ent.className), lc(ent.classSource), lc(ent.shortName), lc(ent.source)].join("|"));
		if (key === "race") races.add([lc(ent.name), lc(ent.source)].join("|"));
	}

	return (key, ent) => {
		if (key.endsWith("Fluff") && fluff.has([getBaseKey(key), lc(ent.name), lc(ent.source), lc(ent.className), lc(ent.classSource)].join("|"))) return true;
		if (["subclass", "classFeature", "subclassFeature", "subclassFluff"].includes(key) && classes.has([lc(ent.className), lc(ent.classSource)].join("|"))) return true;
		if (key === "subclassFeature" && subclasses.has([lc(ent.className), lc(ent.classSource), lc(ent.subclassShortName), lc(ent.subclassSource)].join("|"))) return true;
		if (key === "subclassFluff" && subclasses.has([lc(ent.className), lc(ent.classSource), lc(ent.shortName), lc(ent.source)].join("|"))) return true;
		if (key === "subrace" && races.has([lc(ent.raceName), lc(ent.raceSource)].join("|"))) return true;
		return false;
	};
}

/**
 * @param {object} opts
 * @param {string} opts.repoRoot Directory containing `data/`.
 * @param {object} opts.config The removal config.
 * @param {boolean} [opts.isDryRun]
 * @param {boolean} [opts.isQuiet]
 * @return {{changed: string[], deleted: string[], warnings: string[]}} Repo-relative paths.
 */
export function removeContent ({repoRoot, config, isDryRun = false, isQuiet = false}) {
	const log = isQuiet ? () => {} : console.log;
	const rules = getRules(config);
	const out = {changed: [], deleted: [], warnings: []};
	if (!rules.length) return out;

	const files = listJsonFiles(repoRoot)
		.map(rel => ({rel, json: JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf-8"))}));

	// Validate rule types against what exists, to catch typos
	const knownKeys = new Set(files.flatMap(({json}) => getEntityArrays(json).map(([key]) => key)));
	const knownBaseKeys = new Set([...knownKeys].map(getBaseKey));
	for (const rule of rules) {
		const unknown = [...(rule.types || [])].filter(t => !knownKeys.has(t) && !knownBaseKeys.has(t));
		if (unknown.length) throw new Error(`Rule ${rule} has unknown type(s): ${unknown.join(", ")}.\nKnown types: ${[...knownBaseKeys].sort().join(", ")}`);
	}

	// Pass 1: direct matches
	const directRemovals = [];
	for (const {json} of files) {
		for (const [key, arr] of getEntityArrays(json)) {
			for (const ent of arr) {
				if (!isEntity(ent)) continue;
				const matching = rules.filter(rule => rule.isMatch(key, ent));
				if (!matching.length) continue;
				matching.forEach(rule => rule.matchCount++);
				directRemovals.push({key, ent});
			}
		}
	}
	const directSet = new Set(directRemovals.map(({ent}) => ent));
	const isCascadeMatch = getCascade(directRemovals);

	// Pass 2: filter
	const removedIds = new Set();
	const filesEmptied = new Set();
	const removedBooks = [];
	for (const file of files) {
		let numRemoved = 0;
		const removedByKey = {};
		for (const [key, arr] of getEntityArrays(file.json)) {
			const kept = arr.filter(ent => {
				if (!isEntity(ent)) return true;
				if (!directSet.has(ent) && !isCascadeMatch(key, ent)) return true;
				removedIds.add([key, lc(ent.name), lc(ent.source)].join("|"));
				if ((key === "book" || key === "adventure") && ent.id) removedBooks.push({key, id: ent.id});
				(removedByKey[key] ||= []).push(ent);
				return false;
			});
			if (kept.length === arr.length) continue;
			numRemoved += arr.length - kept.length;
			file.json[key] = kept;
		}
		if (!numRemoved) continue;

		Object.entries(removedByKey).forEach(([key, ents]) => {
			const names = ents.map(ent => `${ent.name ?? ent.id ?? "?"} (${ent.source})`);
			log(`  ${file.rel} ${key}: ${names.length > 8 ? `${names.slice(0, 8).join(", ")}, ... +${names.length - 8} more` : names.join(", ")}`);
		});

		file.isChanged = true;
	}

	// Fluff which `_copy`s removed content (e.g. subrace fluff copying its race's fluff) is orphaned; drop it too
	for (let isChanged = true; isChanged;) {
		isChanged = false;
		for (const file of files) {
			for (const [key, arr] of getEntityArrays(file.json)) {
				if (!key.endsWith("Fluff")) continue;
				const kept = arr.filter(ent => {
					if (!isEntity(ent?._copy) || !removedIds.has([key, lc(ent._copy.name), lc(ent._copy.source)].join("|"))) return true;
					removedIds.add([key, lc(ent.name), lc(ent.source)].join("|"));
					log(`  ${file.rel} ${key}: ${ent.name} (${ent.source}) [orphaned fluff]`);
					return false;
				});
				if (kept.length === arr.length) continue;
				file.json[key] = kept;
				file.isChanged = isChanged = true;
			}
		}
	}

	// Data files in subdirectories (spells, bestiary, class, ...) left without content are deleted
	for (const file of files) {
		if (!file.isChanged || path.dirname(file.rel) === "data") continue;
		if (getEntityArrays(file.json).every(([, arr]) => !arr.length)) filesEmptied.add(file.rel);
	}

	// Book/adventure contents files: `book-<id>.json`, `adventure-<id>.json`
	for (const {key, id} of removedBooks) {
		const rel = `data/${key}/${key}-${id.toLowerCase()}.json`;
		if (fs.existsSync(path.join(repoRoot, rel))) filesEmptied.add(rel);
	}

	// Drop index entries pointing at deleted files
	for (const file of files) {
		if (!INDEX_FILENAMES.has(path.basename(file.rel)) || !isEntity(file.json)) continue;
		const dir = path.dirname(file.rel);
		for (const [k, v] of Object.entries(file.json)) {
			if (typeof v === "string" && filesEmptied.has(`${dir}/${v}`)) {
				delete file.json[k];
				file.isChanged = true;
			}
		}
	}

	// Warn about kept entities which `_copy` from removed ones; these will fail to render
	for (const {rel, json} of files) {
		if (filesEmptied.has(rel)) continue;
		for (const [key, arr] of getEntityArrays(json)) {
			for (const ent of arr) {
				if (!isEntity(ent?._copy)) continue;
				const id = [key, lc(ent._copy.name), lc(ent._copy.source)].join("|");
				if (removedIds.has(id)) out.warnings.push(`${rel}: ${key} "${ent.name}" (${ent.source}) copies removed "${ent._copy.name}" (${ent._copy.source})`);
			}
		}
	}

	// Rules legitimately match nothing once content is removed, so only flag source IDs that don't exist at all (typos)
	const knownSources = new Set([
		...Object.keys(Parser.SOURCE_JSON_TO_FULL),
		...files.flatMap(({json}) => getEntityArrays(json).flatMap(([, arr]) => arr.map(ent => ent?.source))),
	].filter(Boolean).map(lc));
	for (const rule of rules) {
		if (rule.matchCount) continue;
		const unknown = [...(rule.fields.find(([k]) => k === "source")?.[1] || [])].filter(src => !knownSources.has(src));
		if (unknown.length) out.warnings.push(`Rule ${rule} has unknown source(s): ${unknown.join(", ")}`);
	}

	// Write
	for (const file of files) {
		if (filesEmptied.has(file.rel) || !file.isChanged) continue;
		out.changed.push(file.rel);
		if (!isDryRun) fs.writeFileSync(path.join(repoRoot, file.rel), CleanUtil.getCleanJson(file.json), "utf-8");
	}
	for (const rel of [...filesEmptied].sort()) {
		out.deleted.push(rel);
		log(`  ${rel}: deleted`);
		if (!isDryRun) fs.rmSync(path.join(repoRoot, rel));
	}

	return out;
}

/* -------------------------------------------- */

async function main () {
	const isDryRun = process.argv.includes("--dry-run");
	const repoRoot = process.cwd();
	const config = await loadConfig(repoRoot);
	if (!config) {
		console.log(`No ${CONFIG_FILENAME} found; nothing to remove.`);
		return;
	}

	console.log(isDryRun ? "Content removal (dry run):" : "Removing content:");
	const {changed, deleted, warnings} = removeContent({repoRoot, config, isDryRun});
	warnings.forEach(w => console.warn(`WARNING: ${w}`));
	console.log(`${isDryRun ? "Would change" : "Changed"} ${changed.length} file(s), ${isDryRun ? "would delete" : "deleted"} ${deleted.length} file(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
