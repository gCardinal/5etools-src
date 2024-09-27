#!/usr/bin/env node
"use strict";

import util from "util";
import fs from "fs";
import path from "path";
import url from "url";
import https from "https";

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const homebrewRoot = path.join(__dirname, "..", "homebrew");
const homebrewConfigPath = path.join(homebrewRoot, "index.json");

const fetch = async (url) => new Promise((resolve, reject) => {
	https.get(url, res => {
		let data = [];

		res.on("data", chunk => {
			data.push(chunk);
		});

		res.on("end", () => {
			resolve(JSON.parse(Buffer.concat(data).toString()));
		});
	}).on("error", err => {
		reject(err.message);
	});
});

const updateHomebrew = async () => {
	const homebrewConfigBuffer = await readFile(homebrewConfigPath);
	const homebrewConfig = JSON.parse(homebrewConfigBuffer.toString());

	for (const key in homebrewConfig.sources) {
		const source = homebrewConfig.sources[key];

		let json = await fetch(source.json);

		if (source.renames) {
			let stringifiedJson = JSON.stringify(json);

			for (const rename in source.renames) {
				const { from, to } = source.renames[rename];
				stringifiedJson = stringifiedJson.replaceAll(from, to);
			}

			json = JSON.parse(stringifiedJson);
		}

		const destination = path.join(homebrewRoot, source.target);

		await writeFile(path.join(destination, `${key}.json`), JSON.stringify(json, null, 2), { flags: "wx" });

		console.log(`Updated ${key}`);
	}
};

void updateHomebrew();
