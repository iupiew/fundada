import { Plus, GalleryVerticalEnd, BanknoteArrowDown, Waypoints } from '@lucide/svelte';
import type { Component } from 'svelte';

export interface NavLink {
	href: string;
	label: string;
	icon?: Component;
}

export const navLinks: NavLink[] = [
	{ href: '/create', label: 'Create', icon: Plus },
	{ href: '/campaigns', label: 'Campaigns', icon: GalleryVerticalEnd },
	{ href: '/claim', label: 'Claim', icon: BanknoteArrowDown },
	{ href: '/roadmap', label: 'Roadmap', icon: Waypoints },
];

export function isActive(pathname: string, href: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname.startsWith(href);
}
