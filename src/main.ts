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

function renderError(kind: 'TemplateLoadError' | 'StyleLoadError' | 'ScriptLoadError' | 'ScriptExecuteError', details?: { message?: string; origin?: string; error?: unknown }) {
    console.error(kind, details)
    const titleMap: Record<string, string> = {
        TemplateLoadError: 'Fehler beim Laden der Seite',
        StyleLoadError: 'Fehler beim Laden der Styles',
        ScriptLoadError: 'Fehler beim Laden eines Skripts',
        ScriptExecuteError: 'Fehler beim Ausführen eines Skripts'
    }
    const msgMap: Record<string, string> = {
        TemplateLoadError: `Die gewünschte Seite konnte nicht geladen werden.`,
        StyleLoadError: `Ein Stylesheet konnte nicht geladen werden.`,
        ScriptLoadError: `Ein benötigtes Skript konnte nicht geladen werden.`,
        ScriptExecuteError: `Ein Fehler trat beim Ausführen eines Skripts auf.`
    }

    const origin = details?.origin ? `<p><strong>Quelle:</strong> ${details.origin}</p>` : ''
    const detail = details?.message ? `<pre class="error-details">${String(details.message)}</pre>` : ''

    app.innerHTML = `
        <div class="page error">
            <h2>${titleMap[kind]}</h2>
            <p>${msgMap[kind]}</p>
            ${origin}
            ${detail}
        </div>
    `
}

async function loadTemplate(route: string) {
    // Use the bundled loader instead of fetching /src/pages/...
    const key = `./pages/${route || 'start'}.html`;
    const loader = pages[key];
    if (!loader) {
        renderError('TemplateLoadError', { message: `No template found for route: ${route}` });
        return false;
    }

    try {
        // Load template text and parse
        let text: string;
        try {
            text = await loader();
        } catch (e) {
            // Template couldn't be loaded (bundle issue / missing file)
            renderError('TemplateLoadError', { message: (e as Error)?.message || String(e), origin: key, error: e });
            return false;
        }

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
                        try {
                            const cssText = await cssLoader();
                            const style = document.createElement('style');
                            style.setAttribute('data-origin', href);
                            style.textContent = cssText;
                            head.appendChild(style);
                            continue;
                        } catch (e) {
                            // CSS failed to load from bundle
                            renderError('StyleLoadError', { message: (e as Error)?.message || String(e), origin: href, error: e });
                            return false;
                        }
                    }
                }
                // fallback: import node normally (may 404 in prod)
                head.appendChild(document.importNode(el, true));
                continue;
            }

            if (tag === 'script') {
                const src = el.getAttribute('src') || '';
                const type = el.getAttribute('type') || 'text/javascript';
                const defer = el.hasAttribute('defer') || false;
                if (src) {
                    // If the script points into src/pages, run the bundled module instead of adding a <script src=>
                    if (src.includes('/src/pages/')) {
                        const name = src.split('/').pop();
                        const scriptKey = `./pages/${name}`;
                        const moduleLoader = pageScripts[scriptKey];
                        if (moduleLoader) {
                            try {
                                // dynamic import executes the module's top-level code
                                await moduleLoader();
                                continue;
                            } catch (e) {
                                // Error while executing the bundled module
                                renderError('ScriptExecuteError', { message: (e as Error)?.message || String(e), origin: src, error: e });
                                return false;
                            }
                        }
                    }

                    // skip scripts that are already present
                    if (head.querySelector(`script[src="${src}"]`)) {
                        continue;
                    }

                    // External script: add load/error handlers so we can report load failures
                    const script = document.createElement('script');
                    script.src = src;
                    script.type = type;

                    let handled = false;
                    const onError = (_ev: Event | string) => {
                        if (handled) return;
                        handled = true;
                        renderError('ScriptLoadError', { message: `Could not load script: ${src}`, origin: src });
                    };
                    const onLoad = () => {
                        handled = true;
                        // successful load; nothing extra to do
                    };

                    if (defer) {
                        script.defer = defer;
                        // Emulate 'defer' intention: don't block further processing; preserve execution order
                        // For dynamically-inserted scripts, `defer` is not consistently honored across browsers,
                        // so set async=false to make scripts execute in insertion order once loaded.
                        script.async = false;
                        script.addEventListener('error', onError);
                        script.addEventListener('load', onLoad);
                        head.appendChild(script);
                    } else {
                        // Emulate parser-blocking behavior: insert and wait for load/error before continuing
                        await new Promise<void>((resolve) => {
                            const onceError = (ev: Event) => {
                                onError(ev);
                                resolve();
                            };
                            const onceLoad = () => {
                                onLoad();
                                resolve();
                            };
                            script.addEventListener('error', onceError, { once: true });
                            script.addEventListener('load', onceLoad, { once: true });
                            head.appendChild(script);
                        });
                    }

                    continue;
                }

                // inline script: inject while capturing runtime exceptions
                try {
                    // Wrap inline script in a try/catch so runtime errors are captureable here
                    const original = el.textContent || '';
                    const wrapper = `
                        try {
                            ${original}
                        } catch (e) {
                            // re-dispatch a custom event so we can detect execution errors
                            const ev = new CustomEvent('__injectedScriptError', { detail: { message: (e && e.message) ? e.message : String(e) } });
                            window.dispatchEvent(ev);
                            throw e;
                        }
                    `;
                    const inline = document.createElement('script');
                    inline.type = type;
                    inline.textContent = wrapper;

                    const onInlineError = (ev: Event) => {
                        // show friendly error
                        const msg = (ev as CustomEvent).detail?.message || 'Inline script error';
                        renderError('ScriptExecuteError', { message: msg, origin: 'inline script' });
                    };

                    // Listen once for our custom dispatched execution error from the wrapper
                    window.addEventListener('__injectedScriptError', onInlineError as EventListener, { once: true });

                    head.appendChild(inline);
                    continue;
                } catch (e) {
                    renderError('ScriptExecuteError', { message: (e as Error)?.message || String(e), origin: 'inline script', error: e });
                    return false;
                }
            }
            // import the node into the current document before appending so it's owned by this document
            head.appendChild(document.importNode(el, true));
        }

        return true;
    } catch (e) {
        console.error('loadTemplate error', e)
        renderError('TemplateLoadError', { message: (e as Error)?.message || String(e), origin: route, error: e });
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
