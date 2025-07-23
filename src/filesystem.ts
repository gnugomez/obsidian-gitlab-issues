import {
	Vault,
	TFile,
	TAbstractFile,
	TFolder,
	App,
	getFrontMatterInfo,
	parseYaml,
} from "obsidian";
import { compile } from "handlebars";
import { ObsidianIssue } from "./GitlabLoader/issue-types";
import { GitlabIssuesSettings } from "./SettingsTab/settings-types";
import { DEFAULT_TEMPLATE, logger } from "./utils/utils";

export default class Filesystem {
	private vault: Vault;

	constructor(private app: App, private settings: GitlabIssuesSettings) {
		this.vault = app.vault;
	}

	public createOutputDirectory() {
		this.vault.createFolder(this.settings.outputDir).catch((error) => {
			if (error.message !== "Folder already exists.") {
				logger("Could not create output directory");
			}
		});
	}

	public purgeExistingIssues() {
		const outputDir: TAbstractFile | null =
			this.vault.getAbstractFileByPath(this.settings.outputDir);

		if (outputDir instanceof TFolder) {
			Vault.recurseChildren(outputDir, (existingFile: TAbstractFile) => {
				if (existingFile instanceof TFile) {
					this.vault
						.delete(existingFile)
						.catch((error) => logger(error.message));
				}
			});
		}
	}

	public processIssues(issues: Array<ObsidianIssue>) {
		this.vault.adapter
			.read(this.settings.templateFile)
			.then((rawTemplate: string) => compile(rawTemplate))
			.catch(() => {
				logger("Could not read template file, using default template");
				return compile(DEFAULT_TEMPLATE);
			})
			.then((template) => {
				issues.forEach((issue: ObsidianIssue) => {
					this.saveOrUpdateIssues(issue, template);
				});
			})
			.catch((error) => logger(error.message));
	}

	private getFrontmatterFromContentString(content: string) {
		const { frontmatter } = getFrontMatterInfo(content);
		return parseYaml(frontmatter);
	}

	private saveOrUpdateIssues(
		issue: ObsidianIssue,
		template: HandlebarsTemplateDelegate
	) {
		const content = template(issue);
		this.getFrontmatterFromContentString(content);

		const existingFile = this.vault.getAbstractFileByPath(
			this.buildFileName(issue)
		);

		if (existingFile instanceof TFile) {
			logger(`Updating existing file: ${issue.filename}`);

			const newFrontmatter =
				this.getFrontmatterFromContentString(content);

			this.app.fileManager.processFrontMatter(
				existingFile,
				(frontmatter) => {
					Object.assign(frontmatter, newFrontmatter);
				}
			);
		} else {
			logger(`Creating new file: ${issue.filename}`);
      
			this.vault
				.create(this.buildFileName(issue), content)
				.catch((error) => logger(error.message));
		}
	}

	private buildFileName(issue: ObsidianIssue): string {
		return this.settings.outputDir + "/" + issue.filename + ".md";
	}
}
