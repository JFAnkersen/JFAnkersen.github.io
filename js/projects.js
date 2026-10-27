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
//   videoLoop: true = on the featured project, play the video silently on
//              repeat with no YouTube buttons, like a moving picture.
//              The image is shown until the video starts.
//   page     : link to a project page (projects/xxx.html) or ""
//   repo     : link to the GitHub repo or ""
//   featured : true = shown as the big project at the top of the page
//              (only the first featured project is used)
//   imageAlt : optional description of the image (for screen readers)
//   parts    : optional list of sub-parts, shown on the featured project.
//              Each part has an image (or an icon), a title and a text
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
    summary: "A complete quadcopter system built from scratch: a custom STM32 flight controller, a matching power distribution board and a bench app for setup and live telemetry.",
    category: "embedded",
    tags: ["STM32", "C", "PID", "KiCad", "DroneCAN", "GPS", "Telemetry"],
    image: "img/flight-controller/fc-photo.jpg",
    imageAlt: "The assembled Universal Quad Controller Rev1 board",
    video: "https://www.youtube.com/watch?v=UeO1raALnfA",
    videoLoop: true,
    page: "projects/flight-controller.html",
    repo: "https://github.com/JFAnkersen",
    featured: true,
    parts: [
      { image: "img/flight-controller/fc-render-3d.png", title: "Flight controller", text: "STM32 board designed in KiCad: 3S–4S LiPo input, four ESC outputs, GPS, DroneCAN, UART and I²C." },
      { image: "img/flight-controller/frame-base.png", title: "3D-printed frame", text: "Quad frame designed to be fully 3D-printed, with the electronics mounted in the centre." },
      { image: "img/flight-controller/wiring-gps-telemetry.png", title: "Setup & telemetry", text: "From a minimal receiver-only setup to GPS and a wireless link to the bench app." },
    ],
  },
  {
    title: "Blade Fatigue Test Simulator",
    summary: "Interactive simulator of a resonant fatigue test of a wind turbine blade: natural modes, deflection, bending moments and exciter power, running live in the browser.",
    category: "control",
    tags: ["Structural dynamics", "FEM", "Modal analysis", "JavaScript", "MATLAB"],
    image: "",
    page: "projects/blade-simulator.html",
    repo: "",
    featured: false,
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
