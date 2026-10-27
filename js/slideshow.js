// Turns every <div class="slideshow"> on the page into a slideshow with arrows and dots.
// The HTML only needs the pictures: <div class="slides"> with one <figure class="slide"> each.
// Swiping on phones works on its own because the slides scroll sideways.

document.querySelectorAll(".slideshow").forEach(show => {
  const track = show.querySelector(".slides");
  const slides = [...track.children];
  if (slides.length < 2) return;   // one picture: no arrows or dots needed

  const prev = document.createElement("button");
  const next = document.createElement("button");
  prev.className = "slide-arrow prev";
  next.className = "slide-arrow next";
  prev.type = next.type = "button";
  prev.setAttribute("aria-label", "Previous picture");
  next.setAttribute("aria-label", "Next picture");
  prev.textContent = "‹";
  next.textContent = "›";

  const dots = document.createElement("div");
  dots.className = "slide-dots";
  slides.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", `Picture ${i + 1} of ${slides.length}`);
    dot.addEventListener("click", () => go(i));
    dots.appendChild(dot);
  });

  show.append(prev, next, dots);

  const current = () => Math.round(track.scrollLeft / track.clientWidth);
  function go(i) {
    track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
  }
  function update() {
    const i = current();
    prev.disabled = i === 0;
    next.disabled = i === slides.length - 1;
    [...dots.children].forEach((dot, j) => dot.setAttribute("aria-current", j === i));
  }

  prev.addEventListener("click", () => go(current() - 1));
  next.addEventListener("click", () => go(current() + 1));
  track.addEventListener("scroll", update, { passive: true });
  update();
});
