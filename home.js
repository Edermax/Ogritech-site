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
  let showcaseVisible = !("IntersectionObserver" in window);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function updateAutoplay() {
    window.clearInterval(autoplayTimer);
    autoplayTimer = null;
    if (userInteracted || pointerStart || !showcaseVisible || document.hidden || reducedMotion.matches || slides.length < 2) return;
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
  showcase.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    updateAutoplay();
  });
  showcase.addEventListener("pointerup", (event) => {
    if (pointerStart === null) return;
    const distanceX = event.clientX - pointerStart.x;
    const distanceY = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(distanceX) >= 45 && Math.abs(distanceX) > Math.abs(distanceY)) {
      stopAutoplay();
      showSlide(activeSlide + (distanceX < 0 ? 1 : -1));
    } else if (Math.max(Math.abs(distanceX), Math.abs(distanceY)) <= 10) {
      stopAutoplay();
    } else {
      updateAutoplay();
    }
  });
  showcase.addEventListener("pointercancel", () => {
    pointerStart = null;
    updateAutoplay();
  });

  // Touch entry and vertical scrolling are not a choice to take manual control.
  showcase.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") stopAutoplay();
  });
  showcase.addEventListener("focusin", () => {
    if (!pointerStart) stopAutoplay();
  });
  ["click", "keydown"].forEach((eventName) => {
    showcase.addEventListener(eventName, stopAutoplay);
  });
  if ("IntersectionObserver" in window) {
    const observer = new window.IntersectionObserver(([entry]) => {
      const visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
      if (visible === showcaseVisible) return;
      showcaseVisible = visible;
      updateAutoplay();
    }, { threshold: 0.2 });
    observer.observe(showcase);
  }
  document.addEventListener("visibilitychange", updateAutoplay);
  reducedMotion.addEventListener("change", updateAutoplay);
  updateAutoplay();
}
