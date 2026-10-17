# Vigía

Tengo una watchlist de cryptos, acciones y ETFs, y una mala costumbre: abrir la app del
broker "solo para mirar" varias veces al día. Vigía existe para invertir esa relación.
Yo defino umbrales concretos ("avísame si el RSI semanal de BTC baja de 30", "si IBE.MC
supera los 16 €") y un proceso que corre solo cada dos horas los comprueba y me manda
un Telegram cuando alguno se cumple. Mientras tanto, yo no miro nada.

Vigía no opina, no recomienda y no predice. No se conecta a ningún broker ni exchange
con claves de trading: solo lee precios públicos y compara números con los umbrales que
yo le puse. Es una herramienta de monitorización personal, no un asesor.

Es la pareja de [Bóveda](https://github.com/seakerop): la bóveda guarda, el vigía avisa.
Y son proyectos separados a propósito: Bóveda promete que nada sale de tu dispositivo,
y Vigía necesita justo lo contrario, algo despierto 24/7 aunque mi móvil esté apagado.

## Dos modos

Por defecto Vigía funciona sola en el dispositivo: los activos, las reglas y el
histórico se guardan en el navegador, y la propia app baja los precios cada 15 minutos
mientras está abierta, comprueba las reglas y avisa en pantalla (y con una notificación
del sistema si le das permiso). No hace falta ninguna cuenta. La pega es que con la app
cerrada no vigila nada, y que los datos viven en ese navegador: en Ajustes hay una copia
de seguridad para descargar y volver a importar.

El modo servidor es el que describe el resto de este README: las reglas en Upstash, un
cron cada dos horas y avisos por Telegram aunque el móvil esté apagado. Se activa desde
Ajustes cuando están configuradas esas cuentas.

## Cómo funciona el modo servidor

Tres piezas, todas en capa gratuita:

- **La PWA** (React + Vite, desplegada en Vercel): el panel donde gestiono la watchlist
  y las reglas, con la gráfica de velas, la serie del RSI y el histórico de avisos. Los
  datos de mercado los pinta con los mismos módulos que usa el cron: lo que ves en
  pantalla es exactamente lo que el vigía evalúa.
- **El estado** vive en un Upstash Redis gratuito, porque el cron necesita leer mi
  watchlist sin que yo tenga la app abierta. Tres claves con un reparto deliberado:
  `config` (activos y reglas) solo la escribe la PWA; `state` (el runtime de cada
  regla) y `alerts` (el histórico, con tope) solo los escribe el cron. Así nadie pisa
  a nadie sin necesidad de transacciones.
- **El cron** es un workflow de GitHub Actions con `schedule` cada dos horas que
  ejecuta `scripts/check.mjs`: lee la config del KV, baja velas de Binance y Yahoo
  Finance, calcula el RSI, evalúa las reglas y envía los avisos por un bot de Telegram.
  Sin dependencias, sin `npm install`: la pasada tarda segundos.

¿Por qué GitHub Actions y no un cron de Vercel? Porque el plan Hobby de Vercel limita
los crons a una ejecución al día y sin hora garantizada. Actions es gratis en repos
públicos y baja hasta cada 5 minutos, a cambio de dos peajes que asumo: el schedule se
retrasa unos minutos en horas punta (irrelevante para RSI diario) y GitHub lo desactiva
tras 60 días sin actividad en el repo — avisan por email y cualquier commit lo reactiva.

Otro peaje menos conocido: los runners de Actions viven en EE. UU. y `api.binance.com`
devuelve 451 a IPs estadounidenses, así que el fetcher tiene `data-api.binance.vision`
como host de respaldo. Con Yahoo pasa parecido a veces, y el respaldo ahí es mi propio
proxy desplegado en Vercel.

## El RSI, a mano

El RSI está implementado desde cero ([src/core/rsi.js](src/core/rsi.js)), sin librería
de indicadores: suavizado de Wilder, 14 periodos por defecto, un módulo puro que corre
igual en el navegador que en Node. La primera media de ganancias y pérdidas es una
media simple; a partir de ahí cada valor se suaviza con
`media = (mediaAnterior × 13 + cambio) / 14`, que es la definición original de 1978 y
la razón de que el RSI necesite mucho más historial que 14 velas para converger (los
fetchers piden ~300).

Los tests ([src/core/rsi.test.js](src/core/rsi.test.js)) validan contra el dataset
clásico del ejemplo de StockCharts, cross-checkeado además contra una librería de
referencia, y contra propiedades que no admiten discusión: una serie que solo sube da
100, una que solo baja da 0, una plana no divide por cero.

## Reglas que no se repiten

Una regla dispara una vez y se desarma. Se rearma sola cuando el valor cruza de vuelta
el umbral con un margen (2 puntos de RSI, 1% en precio): sin esa histéresis, un RSI
bailando entre 29,8 y 30,2 me llenaría el móvil con la misma noticia cada dos horas.
Cada disparo guarda un snapshot (fecha, valor, umbral) que alimenta el histórico de la
app. La lógica está en [src/core/rules.js](src/core/rules.js), con el ciclo completo
testeado: dispara, calla, rearma, vuelve a disparar.

## Avisos con contexto

Un aviso de "RSI por debajo de 30" no sirve de mucho si no sé qué suele pasar después. Al
hacer el [Termómetro](https://github.com/seakerop) descubrí que muchas de estas reglas no
significan lo que se cree: en Bitcoin, un RSI alto ha venido seguido de más subidas, no
de caídas, y comprar la sobreventa ha ido peor que comprar cualquier día en los últimos
años.

Así que cada regla se prueba contra la historia del activo ([src/core/history.js](src/core/history.js)).
Repasa los datos vela a vela con la misma lógica de disparo y rearme que el cron, así que
cuenta exactamente las veces que me habría llegado el aviso, y mira qué hizo el precio
5, 10 y 30 días después frente a lo normal en ese activo. La prueba es una binomial
exacta solo con disparos que no se solapan, y hay una segunda mirada a los últimos tres
años, porque una señal puede haber funcionado en 2018 y no ahora. Al crear la regla
veo el resultado mientras ajusto el umbral, y el Telegram del aviso lleva una frase
con ese contexto.

Además de RSI y precio, las reglas pueden vigilar las bandas de Bollinger, la distancia
a una media y la caída desde el máximo de un año. Y en Bitcoin hay una tarjeta con la
fase del ciclo del halving y lo que pasó en esa fase en los ciclos anteriores.

## Correr en local

```
npm install
npm run dev      # PWA en http://localhost:5176
npm test         # indicadores, reglas, probador y ciclo
npm run check    # una pasada del cron (DRY_RUN=1 para no enviar Telegram)
```

Sin credenciales configuradas, el almacén es un fichero local (`.data/dev-store.json`)
y puedes probar el ciclo completo sin darte de alta en nada. Para el sistema real hacen
falta las variables de `.env.example`: el token personal de la API, las credenciales
REST de Upstash y el token y chat del bot de Telegram — en `.env` en local, en Vercel
para la API y en GitHub Secrets para el cron. Nada de eso toca el repo.

## Aviso

Vigía vigila los umbrales que tú defines. No es asesoramiento financiero y no ejecuta
ninguna orden en ningún sitio.
