# Blender character production

The character is a **reference-informed artistic sculpt**, not a photogrammetry scan. It follows the supplied tan skin, lean muscular build, black cap/shorts, close beard, white socks and light trainers. Muscle definition is deliberately emphasized at the runner's request. Exact facial likeness and measured body-fat percentage are not claimed.

`build_legs.py` authors the editable Blender scene, detailed legs, clothing, shoes, studio and eight sponsor anchors. `add_upper_body.py` adapts CC0 anatomical topology for the connected torso, head, arms and hands, then adds reference-informed shape adjustments, facial details and the running cap. Original photos stay in ignored `assets/private/` and are not packed into the scene or web export.

## Rebuild

With Blender 4.5 LTS installed:

```sh
/path/to/Blender --background --python scripts/blender/build_legs.py
python3 scripts/blender/validate_model.py
```

For quick look-development renders, append `-- --quick`; for geometry/anchor changes without new renders, append `-- --export-only`. The local tool downloaded during production lives in ignored `output/blender-tool/Blender.app/Contents/MacOS/Blender`.

Outputs:

- `assets/model/chicken-legs.blend`: editable sculpt, materials, curves and lighting.
- `public/models/chicken-legs.glb`: optimized full-body browser model; textures embedded; grouped by material to reduce draw calls.
- `public/models/placements.json`: eight sponsor positions, outward normals and indicative decal dimensions.
- `public/images/legs-front.png`, `legs-back.png`, `legs-preview.png`: transparent full-body fallback / review renders.

Blender source coordinates: Z-up, facing −Y. Browser export: Y-up, facing +Z, anatomical left +X. Native leg anchors are named `left_quad`, `right_quad`, `left_hamstring`, `right_hamstring`, `left_calf`, `right_calf`, `left_ankle`, `right_ankle`. Their local +Z points outward from the skin. Quads and ankles face front; hamstrings and calves face back. Ankle patches sit on exposed skin just above the sock cuffs (browser Y = 0.506, height = 0.10, sock top Y = 0.431). The browser derivative shifts the sole down 0.009 units to floor height zero. Placement metadata uses browser coordinates.

The source scene retains its original editable topology; the web derivative applies modifiers, merges geometry by material and decimates. No live sponsor logos are baked into the model. Anchor dimensions are layout guidance, not final tattoo print measurements.

## Anatomical topology attribution

The upper body's foundational topology and two morph targets come from the [MakeHuman Community repository](https://github.com/makehumancommunity/makehuman). Their graphical assets are [CC0](https://static.makehumancommunity.org/about/license.html); the bundled license and source asset headers are under `vendor/`. The application code is not incorporated.

Source files:

- `makehuman/data/3dobjs/base.obj`
- `makehuman/data/targets/macrodetails/caucasian-male-young.target` (local filename `adult-male.target`; template naming is the upstream asset's, not an inference about the runner)
- `makehuman/data/targets/macrodetails/universal-male-young-maxmuscle-minweight.target` (local filename `lean-muscular.target`)

The legs, garments, cap, shoes, materials, texture generation, placement anchors and production scripts are authored for this project.
