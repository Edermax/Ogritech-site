import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../home.js", import.meta.url), "utf8");

function carousel(t, { reducedMotion = false, visible = true } = {}) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  function element() {
    const listeners = new Map();
    const attributes = new Map();
    return {
      style: {},
      classList: { toggle() {} },
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name); },
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
      },
      emit(type, properties = {}) {
        const event = { target: this, clientX: 100, clientY: 100, pointerType: "mouse", preventDefault() {}, ...properties };
        for (const listener of listeners.get(type) || []) listener(event);
      },
      focus() { showcase.emit("focusin", { target: this }); }
    };
  }
  const showcase = element(), track = element(), previous = element(), next = element();
  const slides = Array.from({ length: 3 }, element);
  const dots = Array.from({ length: 3 }, element);
  dots.forEach((dot, i) => dot.setAttribute("aria-selected", String(i === 0)));
  showcase.querySelector = (selector) => ({
    ".showcase-track": track,
    "[data-showcase-previous]": previous,
    "[data-showcase-next]": next
  })[selector];
  showcase.querySelectorAll = (selector) => selector === "[data-slide]" ? slides : dots;
  const document = element(), motion = element();
  document.hidden = false;
  document.querySelector = (selector) => selector === "[data-showcase]" ? showcase : null;
  document.querySelectorAll = () => [];
  motion.matches = reducedMotion;
  let notifyVisibility;
  vm.runInNewContext(source, {
    document,
    window: {
      scrollY: 0, addEventListener() {}, matchMedia: () => motion,
      IntersectionObserver: class {
        constructor(callback) { notifyVisibility = callback; }
        observe() { notifyVisibility([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]); }
      },
      setInterval: (...args) => setInterval(...args),
      clearInterval: (timer) => clearInterval(timer)
    }
  });
  return {
    showcase, track, dots, slides, document, motion, previous, next,
    active: () => dots.findIndex((dot) => dot.getAttribute("aria-selected") === "true"),
    click(target) { target.emit("click"); showcase.emit("click", { target }); },
    setVisible(value) { notifyVisibility([{ isIntersecting: value, intersectionRatio: value ? 1 : 0 }]); },
    tick: (duration) => t.mock.timers.tick(duration)
  };
}

test("home carousel advances every three seconds and loops through all examples", (t) => {
  const c = carousel(t);
  assert.equal(c.active(), 0);
  c.tick(2999);
  assert.equal(c.active(), 0);
  c.tick(1);
  assert.equal(c.active(), 1);
  assert.equal(c.track.style.transform, "translateX(-100%)");
  c.tick(3000);
  assert.equal(c.active(), 2);
  c.tick(3000);
  assert.equal(c.active(), 0);
});

for (const interaction of ["pointerenter", "focusin", "click", "keydown"]) {
  test(`home carousel stops autoplay permanently after ${interaction}`, (t) => {
    const c = carousel(t);
    c.tick(3000);
    c.showcase.emit(interaction, { clientX: 100, key: "Tab" });
    c.tick(60000);
    assert.equal(c.active(), 1);
    c.document.hidden = true;
    c.document.emit("visibilitychange");
    c.document.hidden = false;
    c.document.emit("visibilitychange");
    c.motion.emit("change");
    c.setVisible(false);
    c.setVisible(true);
    c.tick(60000);
    assert.equal(c.active(), 1);
  });
}

test("autoplay starts only after the carousel enters the viewport", (t) => {
  const c = carousel(t, { visible: false });
  c.tick(60000);
  assert.equal(c.active(), 0);
  c.setVisible(true);
  c.tick(2999);
  assert.equal(c.active(), 0);
  c.tick(1);
  assert.equal(c.active(), 1);
  c.setVisible(false);
  c.tick(9000);
  assert.equal(c.active(), 1);
  c.setVisible(true);
  c.tick(3000);
  assert.equal(c.active(), 2);
});

test("touch entry and a cancelled vertical scroll do not disable autoplay", (t) => {
  const c = carousel(t, { visible: false });
  c.showcase.emit("pointerenter", { pointerType: "touch" });
  c.showcase.emit("pointerdown", { pointerType: "touch", clientY: 300 });
  c.showcase.emit("focusin");
  c.showcase.emit("pointercancel", { pointerType: "touch" });
  c.tick(9000);
  assert.equal(c.active(), 0);
  c.setVisible(true);
  c.tick(3000);
  assert.equal(c.active(), 1);
  c.showcase.emit("pointerdown", { pointerType: "touch", clientY: 300 });
  c.showcase.emit("focusin");
  c.tick(9000);
  assert.equal(c.active(), 1);
  c.showcase.emit("pointercancel", { pointerType: "touch" });
  c.tick(2999);
  assert.equal(c.active(), 1);
  c.tick(1);
  assert.equal(c.active(), 2);
});

test("a predominantly vertical gesture neither changes slides nor disables autoplay", (t) => {
  const c = carousel(t);
  c.showcase.emit("pointerdown", { pointerType: "touch", clientX: 100, clientY: 300 });
  c.showcase.emit("pointerup", { pointerType: "touch", clientX: 30, clientY: 50 });
  assert.equal(c.active(), 0);
  c.tick(3000);
  assert.equal(c.active(), 1);
});

for (const gesture of ["tap", "horizontal swipe"]) {
  test(`a deliberate touch ${gesture} keeps the chosen slide indefinitely`, (t) => {
    const c = carousel(t);
    c.showcase.emit("pointerdown", { pointerType: "touch", clientX: 200 });
    c.showcase.emit("pointerup", { pointerType: "touch", clientX: gesture === "tap" ? 200 : 50 });
    const selected = gesture === "tap" ? 0 : 1;
    assert.equal(c.active(), selected);
    c.tick(60000);
    assert.equal(c.active(), selected);
  });
}

test("manual tabs, arrows, keyboard and swipes remain usable without a time limit", (t) => {
  const c = carousel(t);
  c.click(c.dots[1]);
  c.tick(60000);
  assert.equal(c.active(), 1);
  c.click(c.next);
  assert.equal(c.active(), 2);
  c.showcase.emit("keydown", { key: "ArrowRight" });
  assert.equal(c.active(), 0);
  c.showcase.emit("pointerdown", { clientX: 100 });
  c.showcase.emit("pointerup", { clientX: 20 });
  assert.equal(c.active(), 1);
  c.click(c.previous);
  assert.equal(c.active(), 0);
  c.tick(60000);
  assert.equal(c.active(), 0);
  c.slides.forEach((slide, i) => assert.equal(slide.getAttribute("aria-hidden"), String(i !== 0)));
});

test("autoplay respects reduced motion and suspends in a hidden tab", (t) => {
  const c = carousel(t, { reducedMotion: true });
  c.tick(9000);
  assert.equal(c.active(), 0);
  c.motion.matches = false;
  c.motion.emit("change");
  c.tick(3000);
  assert.equal(c.active(), 1);
  c.document.hidden = true;
  c.document.emit("visibilitychange");
  c.tick(9000);
  assert.equal(c.active(), 1);
  c.document.hidden = false;
  c.document.emit("visibilitychange");
  c.tick(2999);
  assert.equal(c.active(), 1);
  c.tick(1);
  assert.equal(c.active(), 2);
  c.motion.matches = true;
  c.motion.emit("change");
  c.tick(9000);
  assert.equal(c.active(), 2);
});
