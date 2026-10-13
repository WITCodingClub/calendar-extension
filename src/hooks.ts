import type { Reroute } from '@sveltejs/kit';

export const reroute: Reroute = ({ url }) => {
	if (url.pathname === '/index.html') return '/';
	return url.pathname.replace(/\.html$/, '');
};
