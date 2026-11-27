const header = document.querySelector("[data-header]");

function updateHeader() {
  header?.classList.toggle("scrolled", window.scrollY > 24);
}

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

document.querySelectorAll(".faq-list details").forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) return;
    document.querySelectorAll(".faq-list details[open]").forEach((other) => {
      if (other !== item) other.open = false;
    });
  });
});

const showcase = document.querySelector("[data-showcase]");

if (showcase) {
  const track = showcase.querySelector(".showcase-track");
  const slides = [...showcase.querySelectorAll("[data-slide]")];
  const dots = [...showcase.querySelectorAll("[data-showcase-dot]")];
  let activeSlide = 0;
  let pointerStart = null;
  let autoplayTimer = null;
  let userInteracted = false;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function updateAutoplay() {
    window.clearInterval(autoplayTimer);
    autoplayTimer = null;
    if (userInteracted || document.hidden || reducedMotion.matches || slides.length < 2) return;
    autoplayTimer = window.setInterval(() => showSlide(activeSlide + 1), 3000);
  }

  function stopAutoplay() {
    userInteracted = true;
    window.clearInterval(autoplayTimer);
    autoplayTimer = null;
  }

  function showSlide(index) {
    activeSlide = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${activeSlide * 100}%)`;
    slides.forEach((slide, slideIndex) => {
      slide.setAttribute("aria-hidden", String(slideIndex !== activeSlide));
    });
    dots.forEach((dot, dotIndex) => {
      const selected = dotIndex === activeSlide;
      dot.classList.toggle("active", selected);
      dot.setAttribute("aria-selected", String(selected));
      dot.tabIndex = selected ? 0 : -1;
    });
  }

  showcase.querySelector("[data-showcase-previous]")?.addEventListener("click", () => showSlide(activeSlide - 1));
  showcase.querySelector("[data-showcase-next]")?.addEventListener("click", () => showSlide(activeSlide + 1));
  dots.forEach((dot, index) => dot.addEventListener("click", () => showSlide(index)));
  showcase.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    showSlide(activeSlide + (event.key === "ArrowLeft" ? -1 : 1));
    if (dots.includes(event.target)) dots[activeSlide].focus();
  });
  showcase.addEventListener("pointerdown", (event) => { pointerStart = event.clientX; });
  showcase.addEventListener("pointerup", (event) => {
    if (pointerStart === null) return;
    const distance = event.clientX - pointerStart;
    pointerStart = null;
    if (Math.abs(distance) < 45) return;
    showSlide(activeSlide + (distance < 0 ? 1 : -1));
  });
  showcase.addEventListener("pointercancel", () => { pointerStart = null; });

  // Once someone starts exploring, leave the carousel under their control.
  ["pointerenter", "pointerdown", "focusin", "click", "keydown"].forEach((eventName) => {
    showcase.addEventListener(eventName, stopAutoplay);
  });
  document.addEventListener("visibilitychange", updateAutoplay);
  reducedMotion.addEventListener("change", updateAutoplay);
  updateAutoplay();
}
