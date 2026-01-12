import './style.css'

const head = document.querySelector<HTMLHeadElement>('head')!
const app = document.querySelector<HTMLDivElement>('#app')!

function parseLocation(path: string, search: string): { route: string; params?: any } {
    const route = (path.replaceAll(/^\/|\/$/g, '') || '')
    const params: any = {}
    if (search && search.length > 1) {
        const sp = new URLSearchParams(search)
        for (const [k, v] of sp.entries()) params[k] = v
    }
    return {route: route, params}
}

// Use Vite's import.meta.glob to bundle HTML templates into the build
const pages = import.meta.glob('./pages/*.html', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
// Also bundle any page-specific TS modules and CSS so we can execute/inject them without runtime /src fetches
const pageScripts = import.meta.glob('./pages/*.ts') as Record<string, () => Promise<any>>;
const pageStyles = import.meta.glob('./pages/*.css', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

async function loadTemplate(route: string) {
    // Use the bundled loader instead of fetching /src/pages/...
    const key = `./pages/${route || 'start'}.html`;
    const loader = pages[key];
    if (!loader) {
        console.warn('Template not found:', key);
        app.innerHTML = `<div class="page"><h2>Page not found</h2><p>Could not load ${route}</p></div>`
        return false;
    }

    try {
        const text = await loader();
        // parse into a document so we can extract head-data
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'text/html')

        // set app content to the parsed body
        app.innerHTML = doc.body.innerHTML;

        const headElement = doc.head;

        // append head data (styles/scripts/other) handling /src/pages references specially
        for (const el of Array.from(headElement.querySelectorAll('*'))) {
            const tag = el.tagName.toLowerCase();
            if (tag === 'title') {
                // update title
                let titleEl = head.querySelector('title');
                if (!titleEl) {
                    titleEl = document.createElement('title');
                    head.appendChild(titleEl);
                }
                titleEl.textContent = el.textContent;
                continue;
            }

            if (tag === 'link' && (el.getAttribute('rel') || '').toLowerCase() === 'stylesheet') {
                const href = el.getAttribute('href') || '';
                // If the stylesheet points into src/pages, inject the bundled CSS instead of referencing /src
                if (href.includes('/src/pages/')) {
                    const name = href.split('/').pop();
                    const cssKey = `./pages/${name}`;
                    const cssLoader = pageStyles[cssKey];
                    if (cssLoader) {
                        const cssText = await cssLoader();
                        const style = document.createElement('style');
                        style.setAttribute('data-origin', href);
                        style.textContent = cssText;
                        head.appendChild(style);
                        continue;
                    }
                }
                // fallback: import node normally (may 404 in prod)
                head.appendChild(document.importNode(el, true));
                continue;
            }

            if (tag === 'script') {
                const src = el.getAttribute('src') || '';
                const type = el.getAttribute('type') || 'text/javascript';
                if (src) {
                    // If the script points into src/pages, run the bundled module instead of adding a <script src=>
                    if (src.includes('/src/pages/')) {
                        const name = src.split('/').pop();
                        const scriptKey = `./pages/${name}`;
                        const moduleLoader = pageScripts[scriptKey];
                        if (moduleLoader) {
                            // dynamic import executes the module's top-level code
                            await moduleLoader();
                            continue;
                        }
                    }

                    // skip scripts that are already present
                    if (head.querySelector(`script[src="${src}"]`)) {
                        continue;
                    }

                    const script = document.createElement('script');
                    script.src = src;
                    script.type = type;
                    script.defer = true;
                    head.appendChild(script);
                    continue;
                }

                // inline script: import as a script element
                const inline = document.createElement('script');
                inline.type = type;
                inline.textContent = el.textContent || '';
                head.appendChild(inline);
                continue;
            }
            // import the node into the current document before appending so it's owned by this document
            head.appendChild(document.importNode(el, true));
        }

        return true;
    } catch (e) {
        console.error('loadTemplate error', e)
        app.innerHTML = `<div class="page"><h2>Page not found</h2><p>Could not load ${route}</p></div>`
        return false;
    }
}

async function handleRouting() {
    const {pathname, search} = window.location
    const {route} = parseLocation(pathname, search)
    console.log(`route`, route);
    await loadTemplate(route);
}

handleRouting()
