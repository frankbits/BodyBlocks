type InputType = 'movement' | 'rotation' | 'drop';

const playButton = document.querySelector('.trainSelect__play') as HTMLAnchorElement | null;
const toggle = document.getElementById("trainAllToggle") as HTMLInputElement | null;
const cards = document.querySelectorAll<HTMLButtonElement>(".trainSelect__box");
const storedInteractions: {
    'movement': string[],
    'rotation': string[],
    'drop': string[]
} = window.localStorage.getItem("selected_interactions")
    ? JSON.parse(window.localStorage.getItem("selected_interactions") as string)
    : {};

// Initiale Einstellung basierend auf localStorage
if (toggle) {
    // Karten basierend auf gespeicherten Interaktionen aktivieren/deaktivieren
    cards.forEach(card => {
        const cardParent = card.parentElement as HTMLElement;
        const input: InputType = cardParent.getAttribute("data-input") as InputType;
        const interaction = card.getAttribute("data-interaction");
        if (input && interaction) {
            const isActive = storedInteractions[input] && storedInteractions[input].includes(interaction);
            console.log(`interaction`, interaction);
            console.log(`isActive`, isActive);
            toggleCard(card, isActive);
        }
    });

    // Überprüfen, ob alle Karten aktiv sind, um den Toggle-Status zu setzen
    toggle.checked = Array.from(cards).every(card => card.classList.contains("active"));

    // Play-Button basierend auf aktiven Karten setzen
    const anyActive = Array.from(cards).some(card => card.classList.contains("active"));
    if (playButton) {
        playButton.classList.toggle("disabled", !anyActive);
    }
}

// ===== Train All Toggle =====
if (toggle) {
    toggle.addEventListener("change", () => {
        cards.forEach(card => {
            toggleCard(card, toggle.checked);
        });
        if (playButton) {
            playButton.classList.toggle("disabled", !toggle.checked);
        }
    });
}

// ===== Einzelkarten klickbar machen =====
cards.forEach(card => {
    card.addEventListener("click", () => {
        toggleCard(card);

        // Wenn eine Karte deaktiviert wird → Train All ausschalten
        if (toggle && !card.classList.contains("active")) {
            toggle.checked = false;
        }

        // Wenn alle Karten aktiv sind → Train All aktivieren
        if (toggle) {
            toggle.checked = Array.from(cards).every(c => c.classList.contains("active"));
        }

        // Wenn keine Karte mehr aktiv ist → Play button deaktivieren
        if (playButton) {
            const anyActive = Array.from(cards).some(c => c.classList.contains("active"));
            playButton.classList.toggle("disabled", !anyActive);
        }
    });
});

function toggleCard(card: HTMLButtonElement, force?: boolean) {
    card.classList.toggle("active", force);
    const cardParent = card.parentElement as HTMLElement;
    const input: InputType = cardParent.getAttribute("data-input") as InputType;
    const interaction = card.getAttribute("data-interaction");
    if (input && interaction) {
        if (card.classList.contains("active")) {
            // Karte ist aktiv, Interaktion speichern
            if (storedInteractions[input] && !storedInteractions[input].includes(interaction)) {
                storedInteractions[input].push(interaction);
            } else if (!storedInteractions[input]) {
                // Noch kein Eintrag für diese Eingabe -> Array mit jeweils erster Interaktion initialisieren
                storedInteractions[input] = [interaction];
            }
        } else {
            // Karte ist nicht aktiv, Interaktion entfernen
            if (storedInteractions[input]) {
                storedInteractions[input] = storedInteractions[input].filter(i => i !== interaction);
            }
        }
        window.localStorage.setItem("selected_interactions", JSON.stringify(storedInteractions));
    }
}