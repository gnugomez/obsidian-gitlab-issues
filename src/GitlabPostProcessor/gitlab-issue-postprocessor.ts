import { MarkdownPostProcessorContext } from "obsidian";
import GitlabApi from "../GitlabLoader/gitlab-api";
import { Issue } from "../GitlabLoader/issue-types";
import { GitlabIssuesSettings } from "../SettingsTab/settings-types";
import { logger } from "../utils/utils";

export class GitlabIssuePostProcessor {
	private settings: GitlabIssuesSettings;

	constructor(settings: GitlabIssuesSettings) {
		this.settings = settings;
	}

	processElement(element: HTMLElement, context: MarkdownPostProcessorContext) {
		// Only process if we have a GitLab token configured
		if (!this.settings.gitlabToken) {
			return;
		}

		// Find all links in the element
		const links = Array.from(element.querySelectorAll('a[href]'));
		
		for (const link of links) {
			const href = link.getAttribute('href');
			if (href && this.isGitlabIssueUrl(href)) {
				// Process the link asynchronously
				this.processGitlabLink(link as HTMLAnchorElement, href);
			}
		}
	}

	private async processGitlabLink(linkElement: HTMLAnchorElement, href: string) {
		try {
			// Add loading indicator
			const originalText = linkElement.textContent;
			linkElement.textContent = `${originalText} (loading...)`;
			linkElement.style.opacity = '0.6';

			const issueInfo = this.parseGitlabIssueUrl(href);
			if (issueInfo) {
				const issue = await this.fetchGitlabIssue(issueInfo.projectId, issueInfo.issueIid);
				if (issue) {
					this.renderIssueCard(linkElement, issue);
				} else {
					// Reset link if fetch failed
					linkElement.textContent = originalText;
					linkElement.style.opacity = '1';
				}
			}
		} catch (error) {
			logger(`Error processing GitLab issue link: ${error}`);
			// Reset link on error
			const originalText = linkElement.textContent?.replace(' (loading...)', '') || href;
			linkElement.textContent = originalText;
			linkElement.style.opacity = '1';
		}
	}

	private isGitlabIssueUrl(url: string): boolean {
		try {
			const urlObj = new URL(url);
			// Check if it's a GitLab URL and has the issue pattern
			const gitlabHost = new URL(this.settings.gitlabUrl).host;
			return urlObj.host === gitlabHost && 
				   /\/.*\/-\/issues\/\d+/.test(urlObj.pathname);
		} catch (error) {
			return false;
		}
	}

	private parseGitlabIssueUrl(url: string): { projectId: string, issueIid: number } | null {
		try {
			const urlObj = new URL(url);
			// Extract project path and issue IID from URL
			// Format: https://gitlab.com/group/project/-/issues/123
			const pathMatch = urlObj.pathname.match(/^\/(.+)\/-\/issues\/(\d+)/);
			if (pathMatch) {
				const projectPath = pathMatch[1];
				const issueIid = parseInt(pathMatch[2]);
				// Encode the project path for the API
				const projectId = encodeURIComponent(projectPath);
				return { projectId, issueIid };
			}
		} catch (error) {
			logger(`Error parsing GitLab URL: ${error}`);
		}
		return null;
	}

	private async fetchGitlabIssue(projectId: string, issueIid: number): Promise<Issue | null> {
		try {
			const apiUrl = `${this.settings.gitlabApiUrl()}/projects/${projectId}/issues/${issueIid}`;
			const issue = await GitlabApi.load<Issue>(apiUrl, this.settings.gitlabToken);
			return issue;
		} catch (error) {
			logger(`Error fetching GitLab issue: ${error}`);
			return null;
		}
	}

	private renderIssueCard(linkElement: HTMLAnchorElement, issue: Issue) {
		// Create a container for the issue card
		const cardContainer = document.createElement('div');
		cardContainer.className = 'gitlab-issue-card';

		// Create the issue card content
		const cardContent = this.createIssueCardContent(issue);
		cardContainer.appendChild(cardContent);

		// Replace the link with the card
		linkElement.parentNode?.replaceChild(cardContainer, linkElement);
	}

	private createIssueCardContent(issue: Issue): HTMLElement {
		const content = document.createElement('div');
		
		// Issue header with title and state
		const header = document.createElement('div');
		header.className = 'issue-header';

		const stateLabel = document.createElement('span');
		stateLabel.textContent = issue.state.toUpperCase();
		stateLabel.className = `issue-state ${issue.state}`;

		const titleLink = document.createElement('a');
		titleLink.href = issue.web_url;
		titleLink.textContent = issue.title;
		titleLink.className = 'issue-title';

		header.appendChild(stateLabel);
		header.appendChild(titleLink);

		// Issue metadata
		const metadata = document.createElement('div');
		metadata.className = 'issue-metadata';

		const issueRef = typeof issue.references === 'string' ? issue.references : issue.references?.short || `#${issue.iid}`;
		metadata.innerHTML = `
			<span>${issueRef}</span> • 
			<span>Created ${this.formatDate(issue.created_at)}</span> • 
			<span>Updated ${this.formatDate(issue.updated_at)}</span>
		`;

		// Author and assignees
		const people = document.createElement('div');
		people.className = 'issue-metadata';

		let peopleText = `Author: ${issue.author?.name || 'Unknown'}`;
		if (issue.assignees && issue.assignees.length > 0) {
			const assigneeNames = issue.assignees.map(a => a.name).join(', ');
			peopleText += ` • Assigned to: ${assigneeNames}`;
		}
		people.textContent = peopleText;

		content.appendChild(header);
		content.appendChild(metadata);
		content.appendChild(people);

		// Labels
		if (issue.labels && issue.labels.length > 0) {
			const labelsContainer = document.createElement('div');
			labelsContainer.className = 'issue-labels';
			
			issue.labels.forEach(label => {
				const labelSpan = document.createElement('span');
				labelSpan.textContent = label;
				labelSpan.className = 'issue-label';
				labelsContainer.appendChild(labelSpan);
			});
			
			content.appendChild(labelsContainer);
		}

		// Description preview
		if (issue.description && issue.description.trim()) {
			const description = document.createElement('div');
			description.className = 'issue-description';
			
			// Truncate description
			const truncatedDesc = issue.description.length > 200 
				? issue.description.substring(0, 200) + '...'
				: issue.description;
			description.textContent = truncatedDesc;
			content.appendChild(description);
		}

		return content;
	}

	private formatDate(dateString: string): string {
		try {
			const date = new Date(dateString);
			const now = new Date();
			const diffTime = Math.abs(now.getTime() - date.getTime());
			const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

			if (diffDays === 1) {
				return '1 day ago';
			} else if (diffDays < 30) {
				return `${diffDays} days ago`;
			} else if (diffDays < 365) {
				const months = Math.floor(diffDays / 30);
				return `${months} month${months > 1 ? 's' : ''} ago`;
			} else {
				const years = Math.floor(diffDays / 365);
				return `${years} year${years > 1 ? 's' : ''} ago`;
			}
		} catch (error) {
			return 'Unknown date';
		}
	}
}
