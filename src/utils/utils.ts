import { Notice } from "obsidian";

export function sanitizeFileName(value: string) {
	return value.replace(/[:]/g, "").replace(/[*"/\\<>|?]/g, "-");
}

export function logger(message: string) {
	const pluginNamePrefix = "Gitlab Issues: ";

	console.log(pluginNamePrefix + message);
}

export const DEFAULT_TEMPLATE = `---
id: {{id}}
title: {{{title}}}
dueDate: {{due_date}}
webUrl: {{web_url}}
project: {{references.full}}
---

### {{{title}}}
##### Due on {{due_date}}

{{{description}}}

[View On Gitlab]({{web_url}})
`;

export function sendNotification(title: string, message: string, onClick?: () => void ) {
	if (window.Notification) {
		const notification = new Notification(title, { body: message });

		if (onClick) {
			notification.onclick = () => {
				onClick();
				notification.close();
			};
		}
	} else {
		console.warn(
			"Desktop notifications are not supported in this environment."
		);
		// Fallback to Obsidian's internal Notice if system notifications aren't available
		new Notice(`${title}\n${message}`);
	}
}

/**
 * Checks if the existing object needs to be updated with new values.
 * Only considers keys from the newObject - additional keys in existing are ignored.
 * Returns true if existing object doesn't contain all the key-values from newObject.
 */
export function needsUpdate(existing: any, newObject: any): boolean {
	// If newObject is null/undefined, no update needed
	if (newObject === null || newObject === undefined) {
		return false;
	}

	// If existing is null/undefined but newObject isn't, update needed
	if (existing === null || existing === undefined) {
		return true;
	}

	// Handle primitive types
	if (typeof newObject !== 'object') {
		return existing !== newObject;
	}

	// Handle arrays
	if (Array.isArray(newObject)) {
		if (!Array.isArray(existing)) return true;
		if (existing.length !== newObject.length) return true;
		
		for (let i = 0; i < newObject.length; i++) {
			if (needsUpdate(existing[i], newObject[i])) return true;
		}
		return false;
	}

	// Handle objects - only check keys that exist in newObject
	if (typeof existing !== 'object' || Array.isArray(existing)) {
		return true;
	}

	for (const key of Object.keys(newObject)) {
		if (needsUpdate(existing[key], newObject[key])) {
			return true;
		}
	}

	return false;
}
