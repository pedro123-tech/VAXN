const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = 3000;
const upload = multer({ dest: 'uploads/' });
app.use(express.json());
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));



// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function calcularPeso(posicion, totalUnicas) {
  const ratio = posicion / totalUnicas;
  if (ratio <= 0.25) return 3;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 1;
  return 0.5;
}

function calcularPonderado(jugador, metricasOrdenadas) {
  let total = 0;
  let pesoTotal = 0;

  const metricasUnicas = [];
  const setUnicas = new Set();
  for (const m of metricasOrdenadas) {
    const base = m.replace(/ con (la )?(diestra|zurda)/gi, '').trim();
    if (!setUnicas.has(base)) {
      setUnicas.add(base);
      metricasUnicas.push(base);
    }
  }

  metricasOrdenadas.forEach((m) => {
    const valor = jugador.metrics[m];
    const base = m.replace(/ con (la )?(diestra|zurda)/gi, '').trim();
    const posicionBase = metricasUnicas.indexOf(base);
    const peso = calcularPeso(posicionBase, metricasUnicas.length);

    if (valor !== undefined) {
      total += valor * peso;
      pesoTotal += peso;
    }
  });

  return pesoTotal > 0 ? total / pesoTotal : 0;
}

app.post('/preguntar', upload.single('archivo'), async (req, res) => {
  const pregunta = req.body.texto?.toLowerCase();
  const archivo = req.file;

  if (!pregunta || !archivo) {
    return res.status(400).json({ error: 'Falta la pregunta o el archivo Excel' });
  }

  const workbook = XLSX.readFile(archivo.path);
  const sheetName = workbook.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const jugadores = data.map(row => {
    const { nombre, dorsal, posicion, ...metricas } = row;
    return {
      nombre,
      dorsal,
      posicion,
      metrics: metricas
    };
  });

  const criterios=[
    {
      nombre: 'jugador físico',
      palabrasClave: ['físico', 'fuerte', 'aéreo'],
      metricas: ['Goles', 'Asistencias', 'Goles esperados (xG)', 'Asistencias esperadas (xA)', 'Impacto en goles del equipo', 'Tiros totales', 'Tiros a puerta', 'Porcentaje de acierto en tiros a puerta', 'Pases clave', 'Acciones que terminan en tiro', 'Disputas aéreas ganadas', 'Balones divididos ganados', 'Balones despejados', 'Duelos defensivos disputados y ganados', 'Kilómetros recorridos por partido', 'Número de sprints por partido', 'Velocidad punta alcanzada', 'Aceleraciones con balón', 'Presiones exitosas', 'Recuperaciones de balón en campo rival'],
      mensaje: (j) => `${j.nombre};${j.dorsal};${j.posicion} es un jugador fuerte, con gran fondo físico, es bueno en el juego aéreo y muchas veces los goles pasan por él.`
    },
    {
      nombre: 'jugador rápido y defensivo',
      palabrasClave: ['rápido', 'ambas piernas', 'defiende'],
      metricas: ['Acciones que terminan en tiro con la diestra', 'Acciones que terminan en tiro con la zurda', 'Aceleraciones con balón', 'Asistencias con la diestra', 'Asistencias con la zurda', 'Duelos defensivos disputados y ganados', 'Entradas exitosas', 'Pases en el último tercio con la diestra', 'Pases en el último tercio con la zurda', 'Pases hacia adelante exitosos con la diestra', 'Pases hacia adelante exitosos con la zurda', 'Pases progresivos con la diestra', 'Pases progresivos con la zurda', 'Porcentaje de acierto en pases con la diestra', 'Porcentaje de acierto en pases con la zurda', 'Presiones exitosas', 'Recuperaciones en campo propio', 'Recuperaciones en campo rival', 'Regates exitosos', 'Tiros a puerta con la diestra', 'Tiros a puerta con la zurda', 'Velocidad punta alcanzada', 'Número de sprints por partido', 'Balones divididos ganados', 'Intercepciones'],
      mensaje: (j) => `${j.nombre};${j.dorsal};${j.posicion} es un jugador rápido, bueno con ambas piernas y bueno defendiendo.`
    },
    {
      nombre: 'jugador creativo y regateador',
      palabrasClave: ['regateador', 'encare', 'no pierda balones'],
      metricas: ['Goles con la diestra', 'Goles con la zurda', 'Goles esperados (xG)', 'Tiros totales con la diestra', 'Tiros totales con la zurda', 'Tiros a puerta con la diestra', 'Tiros a puerta con la zurda', 'Porcentaje de acierto en tiros con la diestra', 'Porcentaje de acierto en tiros con la zurda', 'Acciones que terminan en tiro con la diestra', 'Acciones que terminan en tiro con la zurda', 'Regates intentados', 'Regates exitosos', 'Faltas recibidas en el último tercio', 'Entradas al área', 'Conducciones progresivas', 'Aceleraciones', 'Metros en conducción', 'Tiempo en conducción', 'Toques en el área rival', 'Preasistencias con la diestra', 'Preasistencias con la zurda', 'Pases clave con la diestra', 'Pases clave con la zurda', 'Pases filtrados completados con la diestra', 'Pases filtrados completados con la zurda', 'Paredes exitosas', 'Asistencias esperadas (xA)', 'Tiempo de posesión del balón por acción', 'Posesiones perdidas', 'Porcentaje de acierto en pases con la diestra', 'Porcentaje de acierto en pases con la zurda', 'Número de sprints por partido', 'Velocidad punta alcanzada', 'Kilómetros recorridos por partido', 'Impacto en goles del equipo'],
      mensaje: (j) => `${j.nombre};${j.dorsal};${j.posicion} es un jugador rápido, regateador, que encare mucho y tire mucho pero que no pierde muchos balones.`
    },
    {
      nombre: 'centrocampista organizador',
      palabrasClave: ['pivote', 'organizador'],
      metricas: ['Número de pases totales con la diestra', 'Número de pases totales con la zurda', 'Porcentaje de acierto en pases con la diestra', 'Porcentaje de acierto en pases con la zurda', 'Pases progresivos', 'Pases entre líneas', 'Cambios de juego exitosos', 'Pases hacia adelante exitosos', 'Pases en el último tercio con la diestra', 'Pases en el último tercio con la zurda', 'Tiempo medio de posesión del balón por acción', 'Porcentaje de posesión individual', 'Toques por partido', 'Recuperaciones en campo propio', 'Recuperaciones en campo rival', 'Intercepciones', 'Balones divididos ganados', 'Presiones exitosas', 'Entradas exitosas', 'Impacto en goles del equipo'],
      mensaje: (j) => `${j.nombre};${j.dorsal};${j.posicion} es un jugador ideal como pivote controlador del ritmo del juego.`
    },
    {
      nombre: 'delantero con ambas piernas',
      palabrasClave: ['delantero físico', 'ambas piernas', 'por arriba'],
      metricas: ['Goles con la diestra', 'Goles con la zurda', 'Tiros a puerta con la diestra', 'Tiros a puerta con la zurda', 'Impacto en goles del equipo', 'Tiros totales con la diestra', 'Tiros totales con la zurda', 'Acciones que terminan en tiro con la diestra', 'Acciones que terminan en tiro con la zurda', 'Disputas aéreas ganadas', 'Preasistencias con la diestra', 'Preasistencias con la zurda', 'Pases clave con la diestra', 'Pases clave con la zurda', 'Entradas al área con el balón controlado', 'Regates exitosos', 'Posesiones perdidas'],
      mensaje: (j) => `${j.nombre};${j.dorsal};${j.posicion} es un Delantero físico, bueno con ambas piernas y por arriba.`
    },
    {
      nombre: 'mvp',
      palabrasClave: ['mvp'],
      metricas: ['Goles con la diestra', 'Goles con la zurda', 'Asistencias con la diestra', 'Asistencias con la zurda', 'Goles esperados (xG)', 'Asistencias esperadas (xA)', 'Preasistencias con la diestra', 'Preasistencias con la zurda', 'Acciones que terminan en tiro con la diestra', 'Acciones que terminan en tiro con la zurda', 'Tiros a puerta con la diestra', 'Tiros a puerta con la zurda', 'Porcentaje de acierto en tiros a puerta con la diestra', 'Porcentaje de acierto en tiros a puerta con la zurda', 'Tiros totales con la diestra', 'Tiros totales con la zurda', 'Toques en el área rival', 'Pases clave con la diestra', 'Pases clave con la zurda', 'Pases filtrados completados con la diestra', 'Pases filtrados completados con la zurda', 'Regates exitosos', 'Regates intentados', 'Conducciones progresivas', 'Cantidad de metros conduciendo el balón por partido', 'Entradas al área con el balón controlado', 'Tiempo medio en conducción con el balón', 'Aceleraciones con balón', 'Tiempo medio de posesión del balón por acción', 'Número de paredes exitosas', 'Número de pases progresivos con la diestra', 'Número de pases progresivos con la zurda', 'Porcentaje de posesión de balón individual sobre el total del equipo', 'Posesiones perdidas', 'Impacto en goles del equipo'],
      mensaje: (j) => `${j.nombre};${j.dorsal};${j.posicion} es un jugador MVP, completo y más técnico.`
    },
    {
      nombre: 'mediocampista con garra que recupere balones',
      palabrasClave: ['mediocampista con garra', 'recupere balones'],
      metricas: ['Recuperaciones de balón en campo propio', 'Recuperaciones de balón en campo rival', 'Duelos defensivos disputados', 'Duelos defensivos ganados', 'Entradas exitosas', 'Intercepciones', 'Presiones exitosas', 'Balones divididos ganados', 'Kilómetros recorridos por partido', 'Número de sprints por partido', 'Faltas cometidas', 'Tarjetas amarillas', 'Posesiones perdidas', 'Número de disputas aéreas ganadas', 'Tiempo medio de posesión del balón por acción', 'Porcentaje de acierto en pases con la diestra', 'Porcentaje de acierto en pases con la zurda', 'Número de pases hacia adelante exitosos con la diestra', 'Número de pases hacia adelante exitosos con la zurda', 'Goles con la diestra', 'Goles con la zurda', 'Asistencias con la diestra', 'Asistencias con la zurda'],
      mensaje: (j) => `${j.nombre};${j.dorsal};${j.posicion} es un mediocampista con mucha garra que roba balones, gana duelos y corre para el equipo.`
    },
    {
      nombre: 'defensa con salida de balón',
      palabrasClave: ['defensa salida balón', 'central salida balón', 'inicia jugada desde atrás'],
      metricas: ['Porcentaje de acierto en pases con la diestra', 'Porcentaje de acierto en pases con la zurda', 'Pases progresivos con la diestra', 'Pases progresivos con la zurda', 'Pases hacia adelante exitosos con la diestra', 'Pases hacia adelante exitosos con la zurda', 'Cambios de juego exitosos', 'Veces regateado', 'Pases exitosos entre líneas con la diestra', 'Pases exitosos entre líneas con la zurda', 'Tiempo medio de posesión del balón por acción', 'Posesiones perdidas', 'Pases totales con la diestra', 'Pases totales con la zurda', 'Pases en el último tercio con la diestra', 'Pases en el último tercio con la zurda', 'Porcentaje de posesión de balón individual sobre el total del equipo', 'Disputas aéreas ganadas', 'Duelos defensivos disputados', 'Duelos defensivos ganados', 'Intercepciones', 'Balones divididos ganados', 'Entradas exitosas', 'Presiones exitosas', 'Balones despejados', 'Faltas cometidas', 'Tarjetas amarillas', 'Tarjetas rojas'],
      mensaje: (j) => `${j.nombre};${j.dorsal};${j.posicion} es un defensa con buena salida de balón que pierde pocos balones y es sólido en defensa.`
    },
    {
      nombre: 'lateral ofensivo',
      palabrasClave: ['lateral ofensivo', 'desbordar banda', 'asistencias banda'],
      metricas: ['Regates exitosos', 'Regates intentados', 'Centros completados', 'Asistencias con la diestra', 'Asistencias con la zurda', 'Tiempo medio en conducción con el balón', 'Preasistencias con la diestra', 'Preasistencias con la zurda', 'Asistencias esperadas (xA)', 'Entradas al área con el balón controlado', 'Conducciones progresivas', 'Cantidad de metros conduciendo el balón por partido', 'Aceleraciones con balón', 'Número de veces que rompe líneas conduciendo', 'Posesiones perdidas', 'Veces regateado', 'Duelos defensivos disputados', 'Duelos defensivos ganados', 'Intercepciones', 'Recuperaciones de balón en campo propio', 'Recuperaciones de balón en campo rival', 'Faltas cometidas', 'Número de sprints por partido', 'Kilómetros recorridos por partido', 'Tiros totales con la diestra', 'Tiros totales con la zurda', 'Toques por partido', 'Tiempo medio de posesión del balón por acción'],
      mensaje: (j) => `${j.nombre};${j.dorsal};${j.posicion} es un lateral o defensa más ofensivo que desborda, apunta a línea de fondo y es propenso a asistir.`
    }
    
  ]

  for (const criterio of criterios) {
    if (criterio.palabrasClave.some(p => pregunta.includes(p))) {
      let mejorJugador = null;
      let mejorPuntaje = 0;

      jugadores.forEach(j => {
        const puntaje = calcularPonderado(j, criterio.metricas);
        if (puntaje > mejorPuntaje) {
          mejorJugador = j;
          mejorPuntaje = puntaje;
        }
      });

      return res.json({ respuesta: criterio.mensaje(mejorJugador) });
    }
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: "system",
          content: `Eres un sistema técnico de scouting. Estas son las únicas etiquetas disponibles:
    
    - Jugador físico
    - Defensa con salida de balón
    - Lateral ofensivo
    - MVP
    - Delantero con ambas piernas
    - Jugador rápido y defensivo
    - Jugador creativo y regateador
    - Mediocampista con garra que recupere balones
    - Defensa sólido por arriba
    - Centrocampista organizador
    
    Tu única tarea es, al recibir una pregunta abierta de un usuario, devolver SOLO el nombre exacto de la etiqueta correspondiente. 
    No debes mencionar jugadores.
    No debes explicar nada.
    No debes inventar contenido.
    Responde solamente con una de las etiquetas exactamente como están escritas aquí.`
        },
        { role: 'user', content: pregunta }
      ],
    });
    
  
    const etiqueta = completion.choices[0].message.content.trim().toLowerCase();
  
    const criterioDetectado = criterios.find(c => c.nombre?.toLowerCase() === etiqueta);
  
    if (!criterioDetectado) {
      return res.json({ respuesta: "No se encontró un perfil que encaje con esa pregunta." });
    }
  
    let mejorJugador = null;
    let mejorPuntaje = 0;
  
    jugadores.forEach(j => {
      const puntaje = calcularPonderado(j, criterioDetectado.metricas);
      if (puntaje > mejorPuntaje) {
        mejorJugador = j;
        mejorPuntaje = puntaje;
      }
    });
  
    return res.json({ respuesta: criterioDetectado.mensaje(mejorJugador) });
  
  } catch (error) {
    console.error('Error al consultar la IA:', error);
    res.status(500).json({ error: 'Ocurrió un error al consultar la IA.' });
  }
  
});

app.listen(port, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${port}`);
});
