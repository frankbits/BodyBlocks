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

async function loadTemplate(route: string) {
    const url = `/src/pages/${route || 'start'}.html`
    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to load: ' + res.status)
        const text = await res.text()

        // parse into a document so we can extract head-data
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'text/html')

        const headElement = doc.head;

        // append head data (styles/scripts/other) excluding the removed scripts
        for (const el of Array.from(headElement.querySelectorAll('*'))) {
            if (el.tagName.toLowerCase() === 'title') {
                // update title
                let titleEl = head.querySelector('title');
                if (!titleEl) {
                    titleEl = document.createElement('title');
                    head.appendChild(titleEl);
                }
                titleEl.textContent = el.textContent;
                continue;
            }
            if (el.tagName.toLowerCase() === 'script') {
                const src = el.getAttribute('src') || '';
                // skip scripts that are already present
                if (head.querySelector(`script[src="${src}"]`)) {
                    continue;
                }
                const script = document.createElement('script');
                script.src = src;
                script.type = el.getAttribute('type') || 'text/javascript';
                head.appendChild(script);
                continue;
            }
            // import the node into the current document before appending so it's owned by this document
            head.appendChild(document.importNode(el, true));
        }

        // set app content to the parsed body
        app.innerHTML = doc.body.innerHTML;
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
