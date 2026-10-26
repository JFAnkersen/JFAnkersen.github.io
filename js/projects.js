// ------------------------------------------------------------
// All projects live here. To add a project, copy one block and
// change the fields. The site builds cards and filters from this.
//
//   category : must be one of the keys in CATEGORIES below
//   tags     : free text, shown as small labels on the card
//   image    : path to an image in the project's own img folder,
//              e.g. "img/flight-controller/pcb.jpg" (leave "" for none)
//   video    : YouTube link or video ID (optional). If there is no image,
//              the video's YouTube thumbnail is used on the card.
//   page     : link to a project page (projects/xxx.html) or ""
//   repo     : link to the GitHub repo or ""
//   featured : true = shown as the big project at the top of the page
//              (only the first featured project is used)
//   parts    : optional list of sub-parts, shown on the featured project
// ------------------------------------------------------------

const CATEGORIES = {
  embedded:  "Embedded & firmware",
  pcb:       "Electronics & PCB",
  control:   "Modelling & control",
  software:  "Automation & software",
  other:     "Other",
};

const PROJECTS = [
  {
    title: "Flight Controller",
    summary: "A complete drone system built from scratch: custom STM32 flight controller, a companion app and a 3D-printed frame designed around the electronics.",
    category: "embedded",
    tags: ["STM32", "C", "PID", "KiCad", "App", "3D print"],
    image: "",
    video: "",   // e.g. "https://www.youtube.com/watch?v=XXXXXXXXXXX"
    page: "projects/flight-controller.html",
    repo: "https://github.com/JFAnkersen",
    featured: true,
    parts: [
      { icon: "⚡", title: "Flight controller", text: "STM32 firmware with sensor fusion and cascaded PID control, on a PCB designed in KiCad." },
      { icon: "📱", title: "App", text: "Companion app for setup, tuning and live telemetry from the drone." },
      { icon: "🧩", title: "3D-printed concept", text: "Frame and enclosure modelled and printed to fit the board, motors and battery." },
    ],
  },
  {
    title: "Optimizer",
    summary: "Numerical optimization tool for tuning model parameters against measured data.",
    category: "control",
    tags: ["Python", "Optimization", "Modelling"],
    image: "",
    page: "",
    repo: "",
    featured: false,
  },
  {
    title: "Dynamic system model",
    summary: "Mathematical model and simulation of a dynamic system used for controller design.",
    category: "control",
    tags: ["MATLAB", "Simulation", "State space"],
    image: "",
    page: "",
    repo: "",
    featured: false,
  },
  {
    title: "Automation script",
    summary: "Tool that automates a repetitive workflow. Replace with your own project.",
    category: "software",
    tags: ["Python", "Automation"],
    image: "",
    page: "",
    repo: "",
    featured: false,
  },
];
