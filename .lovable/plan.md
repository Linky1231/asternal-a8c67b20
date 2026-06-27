## Objetivo

Cuatro cambios coordinados en el editor: detectar tablet y rediseñar el layout, añadir un sistema de capas al editor de dibujo, sustituir el Parallax por capas Z reales en escenas, y mejorar las transiciones entre secciones del editor.

---

### 1. Detección de tablet y layout adaptativo

- Nuevo hook `useFormFactor()` en `src/hooks/use-mobile.tsx` que distingue `mobile` (<768), `tablet` (768–1279) y `desktop` (≥1280) usando `matchMedia`.
- En `AsternalEditor.tsx`:
  - En tablet, el contenedor principal pasa de columna única estrecha a **dos columnas**: a la izquierda el canvas/preview de escena (toma ~65% del ancho, llenando casi toda la altura), a la derecha el panel de inspector / herramientas como sidebar fija (~35%).
  - La barra de pestañas (`build/inspect/ui/scenes/assets/settings`) se vuelve una columna vertical de iconos a la izquierda del todo en tablet, en vez de barra inferior.
  - Hojas (`bottom sheets`) tipo paleta y biblioteca se muestran como popovers laterales anclados a la derecha en tablet, no como sheets de pantalla completa.
- En `SceneEditor.tsx`/`UIEditor.tsx`: el canvas usa `flex-1` real en tablet para ocupar el espacio disponible (en lugar de `max-w-xl`).
- En `PaintEditor.tsx`: el canvas central pasa de `max-w-[460px]` a `max-w-[720px]` en tablet, y los paneles (herramientas, colores, capas) se colocan en una **columna lateral derecha** en lugar de apilados debajo.

### 2. Sistema de capas en el editor de dibujo

Refactor de `PaintEditor.tsx`:

- Nuevo estado `layers: Layer[]` donde cada `Layer = { id, name, visible, locked, opacity, canvas: HTMLCanvasElement }`.
- `activeLayerId` controla a qué capa van los trazos. `bctx()` ahora devuelve el contexto de la capa activa.
- El `blit()` final compone las capas de abajo a arriba en el canvas visible respetando `visible` y `opacity`.
- Panel de capas (nuevo componente interno):
  - Lista vertical con miniatura, nombre editable (doble-click o icono lápiz), toggles ojo/candado, slider de opacidad por capa.
  - Botones: ➕ Nueva, ⧉ Duplicar, ⤒/⤓ Mover arriba/abajo, ✕ Eliminar, ⊕ Combinar con la inferior, ⛶ Aplanar todo.
- Las capas bloqueadas no aceptan trazos (no-op en `onDown`).
- `undo/redo` ahora guarda snapshots por capa activa (clave: `layerId + dataURL`).
- Al guardar (`save()`), las capas se aplanan al `dataUrl` final (`SpriteAsset` no cambia de forma).

### 3. Capas Z reales en escenas (eliminar Parallax)

- En `core.ts`:
  - Añadir `interface SceneLayer { id: string; name: string; z: number; visible: boolean; locked: boolean }` y `scene.layers?: SceneLayer[]`.
  - Cada `Entity` añade `layerId?: string` (opcional para compatibilidad).
  - Mantener `parallax?` como deprecado pero retirarlo de toda lectura (sin migración: simplemente se ignora; los proyectos existentes lo pierden a propósito por petición del usuario).
- En `GameRuntime.tsx`: borrar el bloque "Parallax bands" (líneas 162–172). Render de entidades se ordena por `(layer.z, entity.z, y)`.
- En `SceneEditor.tsx`: mismo orden de render que el runtime para que coincida en preview.
- En `AsternalEditor.tsx`:
  - Sustituir la tarjeta `scene.parallax` por una tarjeta **Capas** con CRUD: añadir, renombrar, mover arriba/abajo, eliminar, toggles visible/locked, input numérico de Z.
  - En el inspector de entidad, nuevo selector "Capa" que asigna `layerId`. Los entes sin capa asignada usan una capa por defecto `default` con `z=0`.
  - Las herramientas de colocación insertan la nueva entidad con la `layerId` de la capa activa.
- En `i18n.ts`: cambiar `scene.parallax` por `scene.layers` ("CAPAS"), añadir labels (`layers.add`, `layers.merge`, `layers.zIndex`, `layers.opacity`, `layers.locked`, `layers.visible`).

### 4. Mejores animaciones entre secciones del editor

- En `src/styles.css` añadir keyframes:
  - `tab-enter` (fade + translateY 8px → 0, 220ms cubic-bezier(0.22, 1, 0.36, 1)).
  - `panel-slide-in-right` / `panel-slide-in-left` (translateX 24px + fade, 260ms).
  - Utility `@utility view-transition` que aplica la animación según data-attribute.
- En `AsternalEditor.tsx`: el contenedor que renderiza la pestaña activa usa `key={tab}` + `className="animate-[tab-enter_220ms_var(--ease-out-quart)]"` para reproducirse al cambiar.
- Hojas inferiores (`PaintEditor`, biblioteca de assets, inspector) ya usan transiciones; refinarlas con `cubic-bezier(0.22, 1, 0.36, 1)` y `transform-gpu`.
- Botones de pestaña: indicador inferior animado (barra que se desliza entre tabs) usando un `<motion.div>` o un `span` con `transition-[left,width]`.

---

## Detalles técnicos

- Archivos modificados:
  - `src/hooks/use-mobile.tsx` (ampliar a `useFormFactor`)
  - `src/components/engine/PaintEditor.tsx` (capas + layout tablet)
  - `src/components/engine/AsternalEditor.tsx` (layout tablet, capas de escena, animaciones tabs)
  - `src/components/engine/SceneEditor.tsx` (orden de render por capa, ocupar espacio en tablet)
  - `src/components/engine/UIEditor.tsx` (ocupar espacio en tablet)
  - `src/components/engine/GameRuntime.tsx` (quitar parallax, orden por capas)
  - `src/lib/engine/core.ts` (tipos SceneLayer, Entity.layerId)
  - `src/lib/i18n.ts` (cadenas de capas)
  - `src/styles.css` (keyframes y utilities de transición)

- Compatibilidad: los proyectos guardados sin `scene.layers` se inicializan al cargar con una capa `default` (z=0) y todas las entidades existentes quedan asignadas a ella. `scene.parallax` se descarta silenciosamente.

- Rendimiento del PaintEditor con capas: las capas son `HTMLCanvasElement` independientes en RAM; el `blit()` actual ya hace 1 draw por frame, ahora hará N draws (N ≈ ≤8 capas, despreciable a 512×512).

¿Apruebas el plan o quieres ajustar algo (por ejemplo: conservar Parallax como modo opcional, o limitar el número de capas)?