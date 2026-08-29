import fs from "fs";
import path from "path";
import {homebrewImport} from "../homebrew-import.ts";

const HOMEBREW_DIR = path.join(import.meta.dirname, "..", "homebrew");
const STATE_PATH = path.join(import.meta.dirname, "..", "homebrew-import-state.json");
const IMPORT_TS_PATH = path.join(import.meta.dirname, "..", "homebrew-import.ts");

function toRawGitUrl (url) {
	return url
		.replace("github.com", "raw.githubusercontent.com")
		.replace("/blob/", "/");
}

function parseGitBlobUrl (url) {
	const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
	if (!m) throw new Error(`Unrecognized GitHub blob URL: "${url}"`);
	const [, owner, repo, branch, encodedPath] = m;
	return {owner, repo, branch, path: decodeURIComponent(encodedPath)};
}

// Unauthenticated GitHub API calls are capped at 60/hr. Set GITHUB_TOKEN to raise that to 5000/hr.
function ghFetch (url) {
	const headers = {"User-Agent": "5etools-homebrew-import"};
	if (process.env.GITHUB_TOKEN) headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
	return fetch(url, {headers});
}

async function fetchLatestCommitDate (url) {
	const {owner, repo, branch, path: filePath} = parseGitBlobUrl(url);
	const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(filePath)}&sha=${branch}&per_page=1`;
	const res = await ghFetch(apiUrl);
	if (!res.ok) throw new Error(`GitHub API error for "${filePath}": ${res.status} ${res.statusText}`);
	const commits = await res.json();
	if (!commits.length) throw new Error(`No commits found for "${filePath}"`);
	return commits[0].commit.committer.date;
}

// "Alternate X" -> "X (Alternate)" so it sorts under the official D&D class in the site UI.
function renameAlternateClass (jsonText) {
	const data = JSON.parse(jsonText);
	const oldName = data.class?.[0]?.name;
	const m = oldName?.match(/^Alternate (.+)$/);
	if (!m) return jsonText;
	return jsonText.split(oldName).join(`${m[1]} (Alternate)`);
}

async function downloadGit ({name, url}) {
	const rawUrl = toRawGitUrl(url);
	const res = await fetch(rawUrl);
	if (!res.ok) throw new Error(`Failed to download "${name}" from "${rawUrl}": ${res.status} ${res.statusText}`);

	const fileName = `${name}.json`;
	fs.writeFileSync(path.join(HOMEBREW_DIR, fileName), renameAlternateClass(await res.text()), "utf-8");
	return fileName;
}

async function processEntry (entry, state) {
	const {name, pdf, url} = entry;
	const fileName = `${name}.json`;
	const filePath = path.join(HOMEBREW_DIR, fileName);
	const remoteDate = await fetchLatestCommitDate(url);
	const localDate = state[name]?.lastUpdated;
	const isStale = !localDate || new Date(remoteDate) > new Date(localDate);

	// gm_binder-tracked homebrew is authored from a PDF, not the git JSON (which is reference-only
	// and often outdated) — never overwrite the file from git; just flag that the PDF needs a re-check.
	if (pdf) {
		if (!fs.existsSync(filePath)) {
			console.warn(`Skipping "${name}": "homebrew/${fileName}" doesn't exist yet. Convert "${pdf}" to JSON first.`);
			return null;
		}
		if (isStale) console.warn(`"${name}": reference upstream changed (${remoteDate}) — re-check "${pdf}" for updates and re-convert. (Not automated yet.)`);
		return fileName;
	}

	if (isStale) {
		await downloadGit({name, url});
		state[name] = {lastUpdated: remoteDate, source: "git"};
		console.log(`Updated "${name}" (upstream ${remoteDate})`);
	}
	return fileName;
}

// Scan what's already on disk: which source abbreviations are satisfied, and which
// "_meta.dependencies" abbreviations every file declares needing.
function scanHomebrewDir () {
	const known = new Set();
	const deps = new Map(); // abbreviation -> {category, requiredBy: [fileName, ...]}

	for (const fileName of fs.readdirSync(HOMEBREW_DIR)) {
		if (!fileName.endsWith(".json") || fileName === "index.json") continue;
		let data;
		try { data = JSON.parse(fs.readFileSync(path.join(HOMEBREW_DIR, fileName), "utf-8")); } catch { continue; }

		for (const src of data._meta?.sources || []) if (src.json) known.add(src.json);

		for (const [category, abbreviations] of Object.entries(data._meta?.dependencies || {})) {
			for (const abbreviation of abbreviations) {
				if (!deps.has(abbreviation)) deps.set(abbreviation, {category, requiredBy: []});
				deps.get(abbreviation).requiredBy.push(fileName);
			}
		}
	}

	return {known, deps};
}

// The "_meta.dependencies" key is a content-type (e.g. "monster"), which doesn't always match
// the repo's top-level directory name for that type.
const CATEGORY_TO_DIR = {monster: "creature"};

// Find which file in the upstream repo declares a given source abbreviation. Uses the GitHub API
// directory listing (cheap) rather than cloning, since some dirs (e.g. "creature") are huge.
// Scoped to LaserLlama since that's who all our current dependencies come from.
async function findDependencyFile (category, abbreviation) {
	const dir = CATEGORY_TO_DIR[category] || category;
	const res = await ghFetch(`https://api.github.com/repos/TheGiddyLimit/homebrew/contents/${dir}`);
	if (!res.ok) return null;
	const entries = await res.json();
	if (!Array.isArray(entries)) return null;

	for (const {name: fileName, download_url} of entries) {
		if (!fileName.startsWith("LaserLlama;") || !fileName.endsWith(".json")) continue;
		const fileRes = await fetch(download_url);
		if (!fileRes.ok) continue;
		let data;
		try { data = await fileRes.json(); } catch { continue; }
		if ((data._meta?.sources || []).some(src => src.json === abbreviation)) return {dir, fileName};
	}
	return null;
}

function slugify (fileName) {
	return fileName
		.replace(/\.json$/i, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function toGitBlobUrl (dir, fileName) {
	return `https://github.com/TheGiddyLimit/homebrew/blob/master/${dir}/${encodeURIComponent(fileName).replace(/'/g, "%27")}`;
}

function appendImportEntry ({name, url}) {
	const content = fs.readFileSync(IMPORT_TS_PATH, "utf-8");
	const entry = `\t{\n\t\t// Auto-added: satisfies a "_meta.dependencies" requirement of another entry.\n\t\tname: "${name}",\n\t\turl: "${url}",\n\t},\n`;
	fs.writeFileSync(IMPORT_TS_PATH, content.replace(/\n\];\s*$/, `\n${entry}];\n`), "utf-8");
}

// Official WotC sourcebooks are always available as core site data — never a homebrew dependency.
const OFFICIAL_SOURCES = new Set(["PHB", "DMG", "MM", "XGE", "TCE", "VGM", "MTF", "EGW", "SCAG", "FTD", "SATO", "BGG", "BMT"]);

// After the normal sync, check every file on disk declares its dependencies are met; auto-fetch
// and register (in both index.json and homebrew-import.ts) whichever aren't.
async function resolveDependencies (index, state) {
	const {known, deps} = scanHomebrewDir();
	const existingUrls = new Set(homebrewImport.map(e => e.url));

	for (const [abbreviation, {category, requiredBy}] of deps) {
		if (known.has(abbreviation) || OFFICIAL_SOURCES.has(abbreviation)) continue;

		const found = await findDependencyFile(category, abbreviation);
		if (!found) {
			console.warn(`Unresolved dependency "${abbreviation}" (needed by ${requiredBy.join(", ")}) — add it to homebrew-import.ts manually.`);
			continue;
		}

		const url = toGitBlobUrl(found.dir, found.fileName);
		if (existingUrls.has(url)) continue; // Already tracked; will settle once its own entry runs.

		const name = slugify(found.fileName);
		console.log(`Resolved dependency "${abbreviation}" -> "${found.fileName}" (needed by ${requiredBy.join(", ")}); adding "${name}" to homebrew-import.ts`);
		appendImportEntry({name, url});
		existingUrls.add(url);

		// Import it now too, so this run doesn't leave the site broken until the next one.
		const remoteDate = await fetchLatestCommitDate(url);
		const outFileName = await downloadGit({name, url});
		state[name] = {lastUpdated: remoteDate, source: "git"};
		if (!index.toImport.includes(outFileName)) index.toImport.push(outFileName);
	}
}

async function main () {
	const indexPath = path.join(HOMEBREW_DIR, "index.json");
	const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
	const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) : {};

	index.toImport = index.toImport.filter(fileName => fs.existsSync(path.join(HOMEBREW_DIR, fileName)));

	for (const entry of homebrewImport) {
		try {
			const fileName = await processEntry(entry, state);
			if (fileName && !index.toImport.includes(fileName)) index.toImport.push(fileName);
		} catch (e) {
			console.error(`Failed to process "${entry.name}": ${e.message}`);
		}
	}

	try {
		await resolveDependencies(index, state);
	} catch (e) {
		console.error(`Failed to resolve dependencies: ${e.message}`);
	}

	fs.writeFileSync(indexPath, JSON.stringify(index, null, "\t") + "\n", "utf-8");
	fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, "\t") + "\n", "utf-8");
	console.log(`Updated "homebrew/index.json" and "homebrew-import-state.json"`);
}

main();
