# Santoyo's Concrete Work — PWA

Calculadora de concreto + generador de invoices. Funciona offline e instalable en el teléfono.

## Cómo abrirla

### Opción rápida (probar en la computadora)
Doble clic en `index.html`. Funciona todo **menos** la instalación como app y el modo offline
(eso requiere un servidor — ver abajo).

### Opción recomendada (instalar en el teléfono como app)
La PWA necesita servirse por HTTP/HTTPS. Tres formas fáciles:

1. **VS Code + Live Server** (lo más fácil aquí):
   - Instala la extensión *Live Server*.
   - Clic derecho en `index.html` → *Open with Live Server*.
   - En el teléfono (misma red Wi-Fi) abre la IP que muestra, p. ej. `http://192.168.1.20:5500`.
   - En el navegador del teléfono: menú → *Agregar a pantalla de inicio*.

2. **Hosting gratis** (para usarla en cualquier lado):
   - Sube la carpeta a [Netlify Drop](https://app.netlify.com/drop), GitHub Pages o Vercel.
   - Abre el enlace en el teléfono → *Agregar a pantalla de inicio*.

## Estructura

```
index.html          App shell (vistas: Cálculo / Invoice / Historial)
manifest.json       Configuración PWA (íconos, colores, nombre)
service-worker.js   Cache offline
css/styles.css      Estilos (tema claro/oscuro, responsive, estilo del invoice)
js/
  i18n.js           Textos español/inglés
  data.js           Materiales y precios por defecto + datos de la empresa
  storage.js        Guardado en el dispositivo (ajustes + historial)
  calc.js           Fórmulas (idénticas al Excel)
  materials.js      Cotización: estimados, materiales, totales, ganancia
  invoice.js        Invoice: formulario, vista previa, PDF/imprimir/imagen, historial
  accounting.js     Contabilidad: ingresos − costos = ganancia limpia por trabajo
  app.js            Navegación, ajustes, tema, idioma
assets/
  logo.svg          Logo PROVISIONAL (reemplazar con el real, ver abajo)
  icons/            Íconos de la app
  vendor/           Librerías para PDF e imagen (offline)
```

## Cómo cambiar cosas

- **Precios de materiales:** edita `js/data.js` (campo `price`). También se pueden ajustar dentro de la app.
- **Datos de la empresa (teléfono, email, dirección):** `js/data.js`, objeto `COMPANY`.
- **Notas del invoice (garantía, anticipo):** `js/data.js`, `INVOICE_NOTES`.
- **Logo:** es **`assets/logo.png`**, usado en el header, el invoice y la **marca de agua**.
  Para cambiarlo, reemplaza ese archivo.
- **Flujo del invoice (celular):** cada invoice nuevo empieza **en blanco** (cliente, descripción,
  TOTAL y AMOUNT PAID vacíos). Botón **Nuevo** en el formulario para reiniciar. Al tocar
  *Vista previa* aparece un diálogo para elegir **firma digital** (firmar en pantalla) o
  **imprimir para firma física** (el cliente firma en papel).
- **Firmas:** en modo digital hay **dos recuadros** para firmar con el dedo (cliente y CEO). La
  **firma del CEO se recuerda** en el dispositivo y aparece sola en cada invoice nuevo (botón
  *Borrar CEO* para cambiarla). En modo físico la firma del cliente queda como línea en blanco.
- **Botones de salida:** *Imagen* (descarga el PNG al dispositivo) e *Imprimir / PDF* (genera un
  PDF limpio y abre compartir/guardar; en el cel el menú incluye Imprimir).
- **Contabilidad (pestaña Cuentas):** ganancia limpia por trabajo. Pones lo que **recibiste**
  (ingresos) y los **costos**; abajo sale **Ganancia limpia = recibido − costos** (verde si ganas,
  rojo si pierdes). El botón **Importar del cálculo** trae el costo de materiales calculado como un
  renglón editable, y puedes **agregar costos extra** (imprevistos) a mano. Cada trabajo se guarda
  en *Trabajos guardados*.

## Fórmulas (verificadas contra el Excel)

| Cálculo | Fórmula |
|---|---|
| Concreto (yd³) | `Largo_ft × Ancho_ft × (Grosor_in ÷ 12) ÷ 27` |
| Footing (yd³) | `Largo_ft × (Ancho_in ÷ 12) × (Grosor_in ÷ 12) ÷ 27` |
| Área (Sq.Ft.) | `Largo × Ancho` |
| Varilla estimada | `Área ÷ espaciado (16)` |
| Precio Sq.Ft. | `Área × precio/sqft` |
| Materiales | `Σ (cantidad × precio unitario)` |
| Ganancia | `Precio Sq.Ft. − Materiales` |

Ejemplo del Excel (30×30×6): concreto **16.67**, footing **0.37**, área **900**, varilla **56.25**,
precio **$6,750**, ganancia **$6,699**. ✅
