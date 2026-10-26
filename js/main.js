// Builds the featured project, filter buttons and project cards from js/projects.js

const grid = document.getElementById("project-grid");
const filters = document.getElementById("filters");
const count = document.getElementById("project-count");
const empty = document.getElementById("empty-state");
const featured = document.getElementById("featured");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Accepts a YouTube video ID or any YouTube link and returns the video ID
function youtubeId(video) {
  if (!video) return "";
  const match = video.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);
  return match ? match[1] : video;
}

function tagsHtml(tags) {
  return `<ul class="tags">${tags.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;
}

function cardHtml(p) {
  const label = CATEGORIES[p.category] || p.category;
  const videoId = youtubeId(p.video);
  // Own image first, otherwise the YouTube thumbnail, otherwise a letter
  const thumb = p.image || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "");
  const image = thumb
    ? `<img src="${thumb}" alt="${escapeHtml(p.title)}" loading="lazy">`
    : `<div class="placeholder" aria-hidden="true">${escapeHtml(p.title.charAt(0))}</div>`;
  const links = [
    p.page ? `<a href="${p.page}">Read more →</a>` : "",
    videoId ? `<a href="https://www.youtube.com/watch?v=${videoId}">▶ Video</a>` : "",
    p.repo ? `<a href="${p.repo}">Code</a>` : "",
  ].join("");

  return `
    <article class="card" data-category="${p.category}">
      <div class="card-media">${image}</div>
      <div class="card-body">
        <p class="card-cat">${escapeHtml(label)}</p>
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.summary)}</p>
        ${tagsHtml(p.tags)}
        ${links ? `<div class="card-links">${links}</div>` : ""}
      </div>
    </article>`;
}

// The big project at the top: video if there is one, then image, then a blueprint panel
function renderFeatured() {
  const p = PROJECTS.find(p => p.featured);
  if (!p) { featured.hidden = true; return; }

  const videoId = youtubeId(p.video);
  const parts = p.parts || [];
  let media;
  if (videoId) {
    media = `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}"
      title="${escapeHtml(p.title)}" allowfullscreen
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"></iframe></div>`;
  } else if (p.image) {
    media = `<img src="${p.image}" alt="${escapeHtml(p.title)}">`;
  } else {
    media = `<div class="blueprint" aria-hidden="true">
      ${parts.map(part => `<span>${part.icon || "•"}</span>`).join("")}
    </div>`;
  }

  featured.innerHTML = `
    <div class="featured-media">${media}</div>
    <div class="featured-body">
      <p class="eyebrow">Featured project</p>
      <h2>${escapeHtml(p.title)}</h2>
      <p class="lead">${escapeHtml(p.summary)}</p>
      ${tagsHtml(p.tags)}
      <div class="hero-actions">
        ${p.page ? `<a href="${p.page}" class="btn btn-primary">Read the full story →</a>` : ""}
        ${videoId ? `<a href="https://www.youtube.com/watch?v=${videoId}" class="btn">▶ Watch on YouTube</a>` : ""}
        ${p.repo ? `<a href="${p.repo}" class="btn">Code</a>` : ""}
      </div>
    </div>
    ${parts.length ? `<div class="parts">${parts.map(part => `
      <div class="part">
        <span class="part-icon" aria-hidden="true">${part.icon || ""}</span>
        <h3>${escapeHtml(part.title)}</h3>
        <p>${escapeHtml(part.text)}</p>
      </div>`).join("")}</div>` : ""}`;
}

function render(category) {
  const list = PROJECTS
    .filter(p => category === "all" || p.category === category)
    .sort((a, b) => Number(b.featured) - Number(a.featured));

  grid.innerHTML = list.map(cardHtml).join("");
  count.textContent = list.length;
  empty.hidden = list.length > 0;

  filters.querySelectorAll("button").forEach(btn => {
    btn.setAttribute("aria-pressed", btn.dataset.category === category);
  });
}

function buildFilters() {
  const used = new Set(PROJECTS.map(p => p.category));
  const buttons = [["all", "All"], ...Object.entries(CATEGORIES).filter(([key]) => used.has(key))];

  filters.innerHTML = buttons
    .map(([key, label]) => `<button type="button" data-category="${key}">${label}</button>`)
    .join("");

  filters.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (btn) render(btn.dataset.category);
  });
}

renderFeatured();
buildFilters();
render("all");
document.getElementById("year").textContent = new Date().getFullYear();
