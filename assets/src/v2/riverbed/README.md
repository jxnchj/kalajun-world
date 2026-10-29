# River Small Rocks — licensed source

Source: https://polyhaven.com/a/river_small_rocks
Authors: Rob Tuytel (photography/processing), Rico Cilliers (minor adjustment).
License: CC0-1.0. Source dimensions: 2.9 m square, 1024×1024.
Official file list retained in `polyhaven-files.json`; original downloads and derived-file SHA-256/byte counts in `source.json`.

The runtime diffuse image is an unchanged copy. `river_small_rocks_normal_rough_1k.png` contains the original OpenGL normal RGB and original roughness map in alpha. No painted illumination, invented shadow, resizing or resolution reduction. All source images remain editable here.

The candidate terrain loader adds one layer to each existing colour/normal texture array only when the full forest reach material candidate is enabled. The scan is sampled at its original real-world scale, with silt/organic transitions driven by the authored physical reach. It creates no rows of rock instances and does not alter global lighting.

Powered by Poly Haven — source metadata obtained through the official public API.
