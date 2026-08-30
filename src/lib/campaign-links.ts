export interface CampaignLink {
	label: string;
	url: string;
}

/** Reserved label carrying the campaign cover image URL inside `links`. */
export const IMAGE_LINK_LABEL = "image";

/**
 * Encode the links payload stored (hex-encoded) in the datum.
 * The contract treats this field as opaque bytes — the shape is a
 * frontend-only convention. Empty array encodes to "" so no placeholder
 * data is ever written on-chain.
 */
export function encodeLinks(links: CampaignLink[]): string {
	return links.length > 0 ? JSON.stringify(links) : "";
}

/** Best-effort parse of the on-chain links payload; never throws. */
export function parseLinks(raw: string | null | undefined): CampaignLink[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(l): l is CampaignLink =>
				!!l &&
				typeof l === "object" &&
				typeof (l as CampaignLink).label === "string" &&
				typeof (l as CampaignLink).url === "string",
		);
	} catch {
		return [];
	}
}

export function isImageLink(link: CampaignLink): boolean {
	return link.label.trim().toLowerCase() === IMAGE_LINK_LABEL;
}

/** The reserved cover-image URL, or null when absent/blank. */
export function coverImageUrl(raw: string | null | undefined): string | null {
	const image = parseLinks(raw).find(isImageLink);
	const url = image?.url?.trim();
	return url ? url : null;
}

export function isValidHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}
