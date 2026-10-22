import * as THREE from "three";
import { beijingTime } from "./sun.js";
import { floorAt } from "./slice.js";

const RAD = Math.PI / 180;

// Photo viewpoints: thumbnail strip, jump-to-pose, and photo/render comparison overlay.
export class Viewpoints {
  constructor({ meta, camera, controls, terrain, onTime, container }) {
    this.vps = meta.viewpoints;
    this.camera = camera;
    this.controls = controls;
    this.terrain = terrain;
    this.onTime = onTime;
    this.active = null;
    this.mode = "wipe";
    this.amount = 0.5;
    this.defaultFov = camera.fov;

    this.strip = container.querySelector("#vp-strip");
    this.frame = container.querySelector("#vp-frame");
    this.img = container.querySelector("#vp-photo");
    this.divider = container.querySelector("#vp-divider");
    this.panel = container.querySelector("#vp-panel");
    this.slider = container.querySelector("#vp-amount");
    this.caption = container.querySelector("#vp-caption");

    for (const vp of this.vps) {
      const b = document.createElement("button");
      b.className = "vp-thumb";
      b.innerHTML = `<img src="./photos/${vp.id}_thumb.jpg" alt=""><span>${vp.id}</span>`;
      b.title = `照片 ${vp.id} · ${vp.time.slice(5, 16)}`;
      b.addEventListener("click", () => this.enter(vp));
      vp.button = b;
      this.strip.appendChild(b);
    }
    container.querySelectorAll("[data-mode]").forEach((el) =>
      el.addEventListener("click", () => this.setMode(el.dataset.mode))
    );
    this.slider.addEventListener("input", () => { this.amount = +this.slider.value; this.layout(); });
    container.querySelector("#vp-exit").addEventListener("click", () => this.exit());
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") this.exit();
      const n = +e.key;
      if (n >= 1 && n <= this.vps.length && e.target.tagName !== "INPUT") this.enter(this.vps[n - 1]);
    });
    window.addEventListener("resize", () => this.layout());
    controls.onUserMove = () => { if (this.active) this.exit(true); };
  }

  enter(vp) {
    this.active = vp;
    const y = Math.max(this.terrain.heightAt(vp.x, vp.z), floorAt(vp.x, vp.z));
    this.controls.setPose(new THREE.Vector3(vp.x, y + vp.eye, vp.z), vp.yaw, vp.pitch, vp.roll);
    this.onTime(beijingTime(vp.time));
    this.img.src = `./photos/${vp.id}.jpg`;
    this.caption.textContent = `照片 ${vp.id} · ${vp.time.slice(0, 16)} · 朝向 ${vp.yaw.toFixed(1)}° · 等效焦距 ${vp.f35}mm`;
    this.vps.forEach((v) => v.button.classList.toggle("active", v === vp));
    this.panel.hidden = false;
    this.frame.hidden = false;
    this.setMode(this.mode);
  }

  exit(keepPose = false) {
    if (!this.active) return;
    this.active = null;
    this.frame.hidden = true;
    this.panel.hidden = true;
    this.vps.forEach((v) => v.button.classList.remove("active"));
    this.camera.fov = this.defaultFov;
    this.camera.updateProjectionMatrix();
    if (!keepPose) this.controls.roll = 0;
  }

  setMode(mode) {
    this.mode = mode;
    this.panel.querySelectorAll("[data-mode]").forEach((el) => el.classList.toggle("on", el.dataset.mode === mode));
    this.layout();
  }

  // fit the photo frame into the viewport and match the camera FOV to it
  layout() {
    const vp = this.active;
    if (!vp) return;
    const W = window.innerWidth, H = window.innerHeight;
    const a = vp.aspect;
    const t = Math.tan((vp.hfov / 2) * RAD);
    let fw, fh;
    if (W / H > a) { fh = H; fw = H * a; this.camera.fov = (2 * Math.atan(t / a)) / RAD; }
    else { fw = W; fh = W / a; this.camera.fov = (2 * Math.atan(t / (W / H))) / RAD; }
    this.camera.updateProjectionMatrix();
    Object.assign(this.frame.style, { left: `${(W - fw) / 2}px`, top: `${(H - fh) / 2}px`, width: `${fw}px`, height: `${fh}px` });
    if (this.mode === "wipe") {
      this.img.style.opacity = 1;
      this.img.style.clipPath = `inset(0 0 0 ${this.amount * 100}%)`;
      this.divider.hidden = false;
      this.divider.style.left = `${this.amount * 100}%`;
    } else {
      this.img.style.opacity = this.amount;
      this.img.style.clipPath = "none";
      this.divider.hidden = true;
    }
  }
}
