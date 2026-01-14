type InputType = 'movement' | 'rotation' | 'drop';

// ===== Keyboard Toggle =====

const toggle = document.getElementById("keyboardToggle") as HTMLInputElement | null;
const cards = document.querySelectorAll<HTMLButtonElement>(".trainSelect__box");
const selectedController = window.localStorage.getItem("activeController");
const storedInputs: { 'movement': string, 'rotation': string, 'drop': string } = window.localStorage.getItem("selected_inputs")
    ? JSON.parse(window.localStorage.getItem("selected_inputs") as string)
    : { 'movement': 'step', 'rotation': 'raise-hand', 'drop': 'raise-both-hands' };

// Initiale Einstellung des Toggles basierend auf localStorage
if (toggle) {
    if (selectedController === "keyboard") {
        toggle.checked = true;
        // Alle Karten deaktivieren
        cards.forEach(card => {
            card.classList.remove("active");
        });
    } else {
        toggle.checked = false;
        // Karten basierend auf gespeicherten Eingaben aktivieren
        cards.forEach(card => {
            const cardParent = card.parentElement as HTMLElement;
            const input: InputType = cardParent.getAttribute("data-input") as InputType;
            const interaction = card.getAttribute("data-interaction");
            if (input && interaction && storedInputs[input] === interaction) {
                card.classList.add("active");
            }
        });
        window.localStorage.setItem("selected_inputs", JSON.stringify(storedInputs));
    }
}


if (toggle) {
    toggle.addEventListener("change", () => {
        window.localStorage.setItem("activeController", toggle.checked ? "keyboard" : "mediapipe");
        cards.forEach(card => {
            if (toggle.checked) {
                card.classList.remove("active");
            } else {
                const cardParent = card.parentElement as HTMLElement;
                const input: InputType = cardParent.getAttribute("data-input") as InputType;
                const interaction = card.getAttribute("data-interaction");
                if (input && interaction && storedInputs[input] === interaction) {
                    card.classList.add("active");
                }
            }
        });
    });
}

// ===== Optional: Einzelkarten klickbar machen =====
cards.forEach(card => {
    card.addEventListener("click", () => {
        activateCard(card);

        // Wenn eine Karte aktiviert wird → Keyboard ausschalten
        if (toggle && card.classList.contains("active")) {
            toggle.checked = false;
            window.localStorage.setItem("activeController", "mediapipe");
        }
    });
});

function activateCard(card: HTMLButtonElement) {
    const cardParent = card.parentElement as HTMLElement;
    const input: InputType = cardParent.getAttribute("data-input") as InputType;

    // Karten basierend auf gespeicherten Eingaben aktivieren
    cards.forEach(card => {
        const cardParent = card.parentElement as HTMLElement;
        const input: InputType = cardParent.getAttribute("data-input") as InputType;
        const interaction = card.getAttribute("data-interaction");
        if (input && interaction && storedInputs[input] === interaction) {
            card.classList.add("active");
        }
    });

    cardParent.querySelectorAll(".trainSelect__box").forEach(siblingCard => {
        siblingCard.classList.remove("active");
    });

    card.classList.add("active");

    const interaction = card.getAttribute("data-interaction");
    if (input && interaction && card.classList.contains("active")) {
        storedInputs[input] = interaction;
        window.localStorage.setItem("selected_inputs", JSON.stringify(storedInputs));
    }
}
