# Design

## Visual System

El Rancho usa una interfaz de producto restringida, clara y tactil. La escena principal es un trabajador usando un celular en ambiente de granja, con luz variable y necesidad de registrar datos sin perder tiempo. Por eso la UI prioriza lectura, botones grandes, jerarquia simple y acciones evidentes.

Sistema aplicado con `ui-ux-pro-max`: `Flat Design Mobile (Touch-First)`. La UI evita decoracion pesada, usa bloques solidos, bordes visibles, estados tactiles y navegacion adaptativa. En movil la navegacion primaria vive abajo; en escritorio pasa a sidebar.

## Color

Base de marca: `frosted-mint`.

```json
{
  "50": "#eff9ec",
  "100": "#e0f2d9",
  "200": "#c0e6b3",
  "300": "#a1d98c",
  "400": "#81cc66",
  "500": "#62bf40",
  "600": "#4e9933",
  "700": "#3b7326",
  "800": "#274d19",
  "900": "#14260d",
  "950": "#0e1b09"
}
```

Uso recomendado:
- Fondo general: verde muy claro o blanco tintado.
- Texto principal: `950`.
- Texto secundario: `800`.
- Accion primaria: `600` o `700` con texto blanco.
- Accion comercial/acento: naranja accesible `#ea580c` cuando se necesite diferenciar una accion de negocio.
- Estados positivos: mint profundo.
- Errores: rojo accesible independiente de la paleta.
- Alertas: ambar accesible.

## Typography

Usar `Fira Sans` para interfaz y `Fira Code` para numeros operativos, con fallback a fuentes del sistema. Mantener escala compacta, clara y sin headings fluidos exagerados. Los numeros de produccion, dinero e inventario usan cifras tabulares para evitar saltos visuales.

## Layout

Mobile-first. La navegacion inferior usa maximo cinco destinos con icono y etiqueta. En pantallas grandes se convierte en sidebar sticky. Los formularios agrupan categorias en controles grandes, con labels visibles, ayuda persistente y mensajes de exito/error cercanos a la accion.

Pestanas PWA primarias para Claude Design:
- `Hoy`: resumen diario de produccion, ventas, gastos, ganancia y sincronizacion. Solo admin.
- `Registrar`: hub rapido para trabajo de campo. Admin y trabajador.
- `Inventario`: existencia de huevos por categoria y ultima actualizacion. Solo admin.
- `Reportes`: filtros por fecha, tendencias, exportes y revision de ganancia. Solo admin.
- `Ajustes`: usuarios, perfil de granja, precios, offline/sync y cuenta. Admin completo; trabajador limitado.

Dentro de `Registrar`, usar control segmentado con `Recoleccion`, `Venta` y `Gasto`. No crear mas tabs inferiores para estas acciones; deben vivir dentro de la pantalla `Registrar` para mantener navegacion simple.

## Components

- Botones primarios grandes con estados hover, focus, disabled y loading.
- Inputs numericos con controles claros.
- Toggle visible para mostrar/ocultar contrasena.
- Tarjetas de resumen solo donde ayuden a comparar datos.
- Paneles planos con bordes de alto contraste en vez de sombras decorativas.
- Banners de sincronizacion offline/online.
- Estados vacios que expliquen la siguiente accion.

## Motion

Transiciones breves de 150-250 ms para feedback de estado, cambios de pantalla y confirmaciones. Los botones tienen feedback tactil inmediato con escala leve. Respetar `prefers-reduced-motion`.

## Accessibility

- Contraste objetivo WCAG AA.
- Touch targets minimos de 44px.
- `aria-live` en mensajes de formulario y sincronizacion.
- `aria-current` en navegacion activa.
- Link de salto al contenido para teclado.
- Iconos SVG consistentes de Lucide, sin emojis estructurales.
