/**
 * NeuroSync Component Loader
 * 
 * Dynamically loads HTML component partials from the /components/ directory
 * and injects them into the main page before initializing the application.
 * 
 * Usage: Add <div data-component="name"></div> placeholders in index.html.
 * Each "name" maps to /components/name.html.
 */

const ComponentLoader = (() => {
    'use strict';

    /**
     * Load a single component's HTML from the server.
     * @param {string} name - Component file name (without .html)
     * @returns {Promise<string>} - The HTML content
     */
    async function fetchComponent(name) {
        const url = `components/${name}.html`;
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`[ComponentLoader] Failed to load component: ${name} (${response.status})`);
            return `<!-- Failed to load component: ${name} -->`;
        }
        return response.text();
    }

    /**
     * Find all elements with [data-component] and inject the corresponding HTML.
     * Components are loaded in parallel for performance.
     * @returns {Promise<void>}
     */
    async function loadAll() {
        const slots = document.querySelectorAll('[data-component]');
        if (slots.length === 0) return;

        const entries = Array.from(slots).map(el => ({
            el,
            name: el.getAttribute('data-component')
        }));

        // Fetch all components in parallel
        const results = await Promise.all(
            entries.map(entry => fetchComponent(entry.name))
        );

        // Inject HTML into each slot
        entries.forEach((entry, i) => {
            entry.el.innerHTML = results[i];
        });
    }

    return { loadAll, fetchComponent };
})();
