/**
 * Merges `upstream/main`, then re-applies `content-removal.config.js`.
 *
 * Conflicts happen when upstream edits content we removed. A conflicted `data/` file is resolved automatically when our
 * version of it is exactly "merge-base version with removals applied", i.e. the only local change was the removal. In
 * that case we take upstream's version and re-apply removals. Anything else is left for manual resolution.
 */

import {execFileSync, spawnSync} from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import {loadConfig, removeContent} from "./remove-content.js";

const UPSTREAM_REMOTE = "upstream";
const UPSTREAM_BRANCH = "main";
const COMMIT_MSG_REMOVAL = "chore: remove excluded content";

const repoRoot = process.cwd();

const git = (args, opts = {}) => execFileSync("git", args, {encoding: "utf-8", maxBuffer: 1024 * 1024 * 1024, ...opts});
const gitOk = args => spawnSync("git", args, {stdio: "ignore"}).status === 0;

/** Contents of `path` at `rev` (a commit, or `:2` etc. for index stages), or null if absent. */
const gitShow = (rev, filePath) => {
	const res = spawnSync("git", ["show", `${rev}:${filePath}`], {encoding: "utf-8", maxBuffer: 1024 * 1024 * 1024});
	return res.status === 0 ? res.stdout : null;
};

const isMergeInProgress = () => gitOk(["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
const getConflicted = () => git(["diff", "--name-only", "--diff-filter=U"]).split("\n").filter(Boolean);

function fail (msg) {
	console.error(`\n${msg}`);
	process.exit(1);
}

/** Apply removals to the merge-base tree in a temp dir, so we can see what "removal only" looks like for each file. */
function getExpectedFromBase (mergeBase, config) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "5et-base-"));
	try {
		const tar = spawnSync("git", ["archive", mergeBase, "data"], {maxBuffer: 2 * 1024 * 1024 * 1024});
		if (tar.status !== 0) throw new Error(`git archive failed: ${tar.stderr}`);
		execFileSync("tar", ["-x", "-C", tmp], {input: tar.stdout, maxBuffer: 2 * 1024 * 1024 * 1024});
		removeContent({repoRoot: tmp, config, isQuiet: true});
		return filePath => {
			const p = path.join(tmp, filePath);
			return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
		};
	} finally {
		process.on("exit", () => fs.rmSync(tmp, {recursive: true, force: true}));
	}
}

function autoResolve (mergeBase, config) {
	const conflicted = getConflicted();
	const candidates = conflicted.filter(f => f.startsWith("data/") && f.endsWith(".json"));
	if (!candidates.length) return conflicted;

	console.log(`\nAttempting to auto-resolve ${candidates.length} conflicted data file(s)...`);
	const getExpected = getExpectedFromBase(mergeBase, config);

	for (const f of candidates) {
		const ours = gitShow("HEAD", f);
		if (ours !== getExpected(f)) {
			console.log(`  ${f}: has local changes beyond content removal, leaving for manual resolution`);
			continue;
		}
		const theirs = gitShow(":3", f);
		if (theirs == null) git(["rm", "--quiet", "--", f]);
		else {
			fs.writeFileSync(path.join(repoRoot, f), theirs, "utf-8");
			git(["add", "--", f]);
		}
		console.log(`  ${f}: resolved (took upstream, removals will be re-applied)`);
	}

	return getConflicted();
}

function applyRemovals (config) {
	if (!config) return [];
	console.log("\nApplying content removal...");
	const {changed, deleted, warnings} = removeContent({repoRoot, config});
	warnings.forEach(w => console.warn(`WARNING: ${w}`));
	if (changed.length) git(["add", "--", ...changed]);
	if (deleted.length) git(["rm", "--quiet", "--cached", "--ignore-unmatch", "--", ...deleted]);
	return [...changed, ...deleted];
}

async function main () {
	if (isMergeInProgress()) fail("A merge is already in progress. Finish or abort it first.");
	if (!gitOk(["diff", "--quiet", "HEAD"])) fail("You have uncommitted changes to tracked files. Commit or stash them first.");

	const config = await loadConfig(repoRoot);

	console.log(`Fetching ${UPSTREAM_REMOTE}...`);
	git(["fetch", UPSTREAM_REMOTE], {stdio: "inherit"});

	const upstreamRef = `${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`;
	const mergeBase = git(["merge-base", "HEAD", upstreamRef]).trim();

	const merge = spawnSync("git", ["merge", "--no-edit", upstreamRef], {stdio: "inherit"});
	const isMerging = isMergeInProgress();

	if (merge.status !== 0) {
		if (!isMerging) fail("Merge failed.");
		if (!config) fail("Merge has conflicts. Resolve them manually.");

		const remaining = autoResolve(mergeBase, config);
		if (remaining.length) {
			fail([
				"Merge still has conflicts that need manual resolution:",
				...remaining.map(f => `  ${f}`),
				"",
				"Resolve them, then run `npm run content:remove`, stage, and `git commit` to conclude the merge.",
			].join("\n"));
		}
	}

	applyRemovals(config);

	if (isMerging) {
		git(["commit", "--no-edit"], {stdio: "inherit"});
	} else if (!gitOk(["diff", "--cached", "--quiet"])) {
		git(["commit", "-m", COMMIT_MSG_REMOVAL], {stdio: "inherit"});
	} else {
		console.log("No content to remove.");
	}

	console.log("\nDone. Run `npm run gen` to rebuild generated data (search index, subclass/spell lookups).");
}

await main();
