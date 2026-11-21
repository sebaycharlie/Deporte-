# 🏋️ Seba FitPro

App web (PWA) de entrenamiento con **periodización ondulante** (mesociclo de 4 semanas) y **autoregulación por RIR / Readiness**. Funciona en el navegador del celular o del computador, se puede **instalar como app** y funciona **sin internet**.

## Qué hace

- Rutina de 4 días (Torso A/B, Pierna-Brazos A/B) con 4 semanas: Acumulación → Intensificación → Pico → Descarga.
- Check-in diario (ánimo, energía, frescura, velocidad) que ajusta cargas (+2,5 % / base / −8 % y +1 RIR).
- Registro de series (peso, reps, RIR), temporizador de descanso con sonido, vibración y pantalla siempre encendida.
- Muestra "Última vez" por ejercicio, detecta récords personales (PR) y estima el 1RM (Epley).
- Reemplazo biomecánico de ejercicios (solo hoy o permanente).
- Historial con notas y feedback del entrenador (Modo Entrenador).
- Nuevo mesociclo: recalcula los pesos base con tu rendimiento real.
- Exporta: reporte para IA (Markdown), CSV para Excel/Sheets, código JSON y **respaldo completo**.
- Varios atletas por dispositivo, kg ↔ lb con conversión automática.

## 💾 ¿Dónde se guarda el progreso?

En el **propio dispositivo** de cada persona (almacenamiento del navegador). Cada amigo tiene sus datos privados en su teléfono; nadie más los ve.
⚠️ Si borras los datos del navegador o cambias de teléfono se pierden → usa **Sync / Respaldo → Descargar respaldo** de vez en cuando y guarda el archivo en Drive o el correo. Para recuperarlo: **Restaurar archivo**.

## 🚀 Publicar gratis con GitHub Pages

1. En GitHub abre el repositorio → **Settings → Pages**.
2. En **Source** elige **Deploy from a branch**.
3. Elige la rama (`main`, o la rama donde esté este código) y la carpeta **`/ (root)`** → **Save**.
4. En 1–2 minutos aparece el enlace: `https://<tu-usuario>.github.io/<repositorio>/`.
5. Comparte ese enlace con tus amigos.

> GitHub Pages gratuito requiere que el repositorio sea **público** (el código queda visible, pero los datos de cada usuario NO, porque viven en su teléfono).

### Instalar en el teléfono
- **Android (Chrome):** menú ⋮ → *Instalar app* / *Agregar a pantalla principal*.
- **iPhone (Safari):** botón Compartir → *Añadir a pantalla de inicio*.

## 🛠️ Desarrollo

```bash
npm install      # instala Tailwind y Chart.js (solo para compilar)
npm run build    # genera css/app.css y vendor/chart.umd.min.js
npm start        # servidor local en http://localhost:8080
npm test         # 25 pruebas end-to-end con Playwright
```

Los archivos compilados (`css/`, `vendor/`) se suben al repositorio para que GitHub Pages funcione sin paso de build. Al publicar una versión nueva, cambia `CACHE_VERSION` en `sw.js` para que los teléfonos reciban la actualización.

### Estructura
```
index.html            Interfaz
js/data.js            Rutina, mesociclo y alternativas biomecánicas
js/app.js             Lógica (estado, cálculos, render, exportación)
src/input.css         Estilos fuente (Tailwind)
sw.js, manifest.webmanifest, icons/   PWA (offline + instalable)
tests/                Servidor local y pruebas
```

## ⚠️ Aviso
Herramienta de apoyo, no reemplaza a un profesional. Ante dolor articular, detén el ejercicio y consulta.
