// Runs the optimizer in the background, so the page stays responsive while it works.
import { optimize } from "./optimizer.js";

self.onmessage = async ({ data: { input, settings } }) => {
  try {
    const out = await optimize(input, settings, (done, total) => self.postMessage({ type: "progress", done, total }));
    // The model object holds functions, which can't be sent back: keep only what the page uses
    const { model, ...base } = out.base;
    base.L = model.L;
    base.mass = model.mass;
    self.postMessage({ type: "done", base, results: out.results, front: out.front });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message });
  }
};
