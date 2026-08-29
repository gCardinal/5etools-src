type HomebrewImport = { name: string; pdf?: string, url: string };

export const homebrewImport: HomebrewImport[] = [
	{
		name: "witch",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/Worlds%20Beyond%20Number%3B%20Witch.json",
	},
	{
		// Fighting Styles + Exploits: several LaserLlama classes (Alternate Fighter/Rogue/Warlord etc.)
		// reference these as optionalfeature dependencies (LLStyles/LLExploits) — needed or their
		// class features fail to resolve.
		name: "laserllama_exploit_compendium",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/optionalfeature/LaserLlama%3B%20Laserllama%27s%20Exploit%20Compendium.json",
	},
	{
		name: "alternate_barbarian",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Barbarian.json",
		pdf: "homebrew-pdf/Alternate Barbarian _ GM Binder.pdf",
	},
	{
		name: "shifter",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Shifter.json",
		pdf: "homebrew-pdf/Shifter Class _ GM Binder.pdf",
	},
	{
		name: "psion",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Psion.json",
		pdf: "homebrew-pdf/The Psion Class _ GM Binder.pdf",
	},
	{
		name: "alternate_artificer",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Artificer.json",
	},
	{
		name: "alternate_bard",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Bard.json",
	},
	{
		name: "alternate_blood_hunter",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Blood%20Hunter.json",
	},
	{
		name: "alternate_cleric",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Cleric.json",
	},
	{
		name: "alternate_druid",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Druid.json",
	},
	{
		name: "alternate_fighter",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Fighter.json",
	},
	{
		name: "alternate_monk",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Monk.json",
	},
	{
		name: "alternate_paladin",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Paladin.json",
	},
	{
		name: "alternate_ranger",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Ranger.json",
	},
	{
		name: "alternate_rogue",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Rogue.json",
	},
	{
		name: "alternate_sorcerer",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Sorcerer.json",
	},
	{
		name: "alternate_warlock",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Warlock.json",
	},
	{
		name: "alternate_wizard",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Alternate%20Wizard.json",
	},
	{
		name: "magus",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Magus.json",
	},
	{
		name: "savant",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Savant.json",
	},
	{
		name: "shaman",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Shaman.json",
	},
	{
		name: "vessel",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Vessel.json",
	},
	{
		name: "warlord",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/class/LaserLlama%3B%20Warlord.json",
	},
	{
		// Auto-added: satisfies a "_meta.dependencies" requirement of another entry.
		name: "laserllama_laserllama_s_compendium_of_spells",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/spell/LaserLlama%3B%20LaserLlama%27s%20Compendium%20of%20Spells.json",
	},
	{
		// Auto-added: satisfies a "_meta.dependencies" requirement of another entry.
		name: "laserllama_compendium_of_beasts",
		url: "https://github.com/TheGiddyLimit/homebrew/blob/master/creature/LaserLlama%3B%20Compendium%20of%20Beasts.json",
	},
];
