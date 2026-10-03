# Coast reference material rework — 2026-10-03

This replaces the rejected smooth-pebble art-v4 direction. Generated with the built-in imagegen tool, using the user's supplied bay reference and original coast-sand layout. No entire reference photograph is used as the runtime scene.

- terrain-clean-master.png → terrain-clean.webp: natural dark reef and clean dry sand, no baked waterline, foam or animals.
- terrain-master.png → terrain.webp: registered seabed detail, shown only below the current runtime water mask.
- water-master.png → water.webp: independent fine ocean surface, composited with current tidal depth and slight motion.
- foam-master.png → foam.webp: transparent natural foam, native 2172×724 and runtime 1536×512. Shore and rock patches are cached separately; rock patches align their visible alpha leading edge to the actual stone edge. Full provenance is in foam-source.txt.
- Native generated raster dimensions: 1672×941. Runtime uses proportional normalized 1600×900 scene coordinates; this is not a native 4K source.
- Original coast assets remain available for recovery. Rejected art-v4 trials are retained in the local development archive, not bundled as the current runtime art.

## Terrain prompt

Use case: precise-object-edit / game terrain extraction.
Input 1 is the exact target artwork. Input 2 is only the registration guide showing the established rock footprints of the running game.
Make a DRY TERRAIN / SEABED render layer from Input 1 for a layered tidal bay game. Preserve its camera, framing, boulder positions and silhouettes as closely as possible. Keep the intricate natural dark navy-slate irregular coastal rock forms and lush green corner plants from Input 1, including their rich volume, subtle fissures, wet dark undersides, small lichen patches, soft sun highlights. DO NOT smooth them into rounded featureless pebbles or cartoon domes. The style must remain the polished 3D natural game environment of Input 1, recognizable as the same artwork.
Remove ALL water, waves, water reflections, foam, caustics and shoreline. In their place reveal a pale warm sand seabed with subtle varied stone/sand substrate and the same pre-existing submerged rock shelves, using Input 2 for the original registered terrain layout. Keep every existing prominent rock in precisely its original position/size; no extra big rocks; no displacement. Beach and former water areas must form one dry substrate without a painted waterline. Sand clean fine pale beige, not orange, not blank plastic, no tessellated noise.
Remove every fish, crab, shell, animal, collectible, bottle, coral/sea-fan branch. Leave no baked creatures. Plants only at the established corners/outer edges, quiet moss on rock. No UI text border. Preserve the full 16:9 composition. Output high-detail 3200x1800 if possible. This is a production terrain-only layer; animated transparent ocean and changing shore foam are composited later, so ABSOLUTELY NO visible water or foam. Most importantly retain reference's dark irregular natural reefs and depth of sculpted detail; NOT the over-smoothed stone style of a toy game.

## Dry sand cleanup prompt

Use case: precise-object-edit. Edit this dry terrain game layer with only two localized cleanups:
1. Remove all white/pale pink twig-like branching CORAL or sea fans sitting on the exposed foreground reefs in the lower-left/lower-middle. Replace them with subtle low moss / short simple green tufts or bare rock consistent with adjacent surfaces. Keep the healthy existing corner foliage and grass.
2. In large open SAND areas only, reduce excess scattered pebble/shell-chip speckles by about half, yielding clean finely grained pale neutral beige sand like a polished natural coastal game environment. Keep the small stones directly attached to the major rock bases for natural contact. Do not blur the whole image.
Critical: all main rocks, silhouettes, silhouettes of tiny stones at their edges, positions, camera, composition, shapes, lighting and colors of all reef surfaces MUST remain exactly registered and unchanged. This is not a restyling pass. No water, no foam, no animals, no new objects, no UI. Preserve the dark blue-grey naturally rugged rocks, not smooth domes. Keep full original frame and exact dimensions.

## Water prompt

Use case: precise-object-edit, production water texture extraction. Input is a visual reference for the surface of the water ONLY.
Produce an entire 16:9 frame of the clear mid-depth blue ocean surface matching this reference's actual small organic wavelets and sculpted gentle water normals. Continue the natural pattern from the central upper sea across the ENTIRE frame. No coast, no land, no rock, no plant, no foam, no white mesh, no fish, no coral, no shells, no horizon, no UI. An overhead oblique camera from the same angle as the reference. Tiny softly highlighted curved ripples (approximately 8-20px long at 1672px width), rich but quiet wavelet structure throughout, darker cobalt-marine troughs and restrained turquoise highlights, coherent natural low-amplitude wind ripples. Surface needs to feel finely resolved natural 3D water as in the reference, NOT a blurry broad streak/swirling fluid texture, NOT smooth flat turquoise, NOT repeated geometric caustic white mesh, NOT storm waves. Uniform mid marine blue #17667d base averaged across the entire image; no dramatic brightness gradient, since optical depth and transparency are added dynamically by the game. No specular overexposure. This is a separate moving water material for layered runtime rendering; include NOTHING except water-surface microgeometry. Preserve the fine natural short-wave scale in the reference.
