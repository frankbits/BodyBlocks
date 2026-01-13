// ===== Train All Toggle =====

const toggle = document.getElementById("trainAllToggle") as HTMLInputElement | null;
const cards = document.querySelectorAll<HTMLButtonElement>(".trainSelect__box");

if (toggle) {
  toggle.addEventListener("change", () => {
    cards.forEach(card => {
      if (toggle.checked) {
        card.classList.add("active");
      } else {
        card.classList.remove("active");
      }
    });
  });
}

// ===== Optional: Einzelkarten klickbar machen =====
cards.forEach(card => {
  card.addEventListener("click", () => {
    card.classList.toggle("active");

    // Wenn eine Karte deaktiviert wird → Train All ausschalten
    if (toggle && !card.classList.contains("active")) {
      toggle.checked = false;
    }

    // Wenn alle Karten aktiv sind → Train All aktivieren
    if (toggle) {
      const allActive = Array.from(cards).every(c => c.classList.contains("active"));
      toggle.checked = allActive;
    }
  });
});
