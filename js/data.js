// ==========================================
// Seba FitPro — Datos base (mesociclo, alternativas biomecánicas y rutina 4 días)
// ==========================================
"use strict";

const MESOCYCLE_WEEKS = {
    1: {
        name: "Semana 1: Acumulación",
        short: "Acumulación",
        rir: "2-3",
        targetRirNum: 2.5,
        weightMult: 1.0,
        desc: "Semana 1 (Acumulación): Adaptación técnica, control excéntrico estricto y margen de 2-3 reps en reserva (RIR 2-3)."
    },
    2: {
        name: "Semana 2: Intensificación",
        short: "Intensificación",
        rir: "1-2",
        targetRirNum: 1.5,
        weightMult: 1.025,
        desc: "Semana 2 (Intensificación): Incremento progresivo de carga o repeticiones acercándose al fallo técnico (RIR 1-2)."
    },
    3: {
        name: "Semana 3: Pico de Rendimiento",
        short: "Pico",
        rir: "0-1",
        targetRirNum: 0.5,
        weightMult: 1.05,
        desc: "Semana 3 (Pico): Máxima intensidad del mesociclo. Busca superar tus marcas base manteniendo ejecución limpia (RIR 0-1)."
    },
    4: {
        name: "Semana 4: Descarga (Deload)",
        short: "Descarga",
        rir: "3-4",
        targetRirNum: 3.5,
        weightMult: 0.85,
        desc: "Semana 4 (Descarga): Disipación de fatiga acumulada (-15% carga y -1 serie efectiva) para supercompensar."
    }
};

// Diccionario de alternativas biomecánicas
const EXERCISE_ALTERNATIVES = {
    "press_banca": {
        pattern: "Empuje Horizontal (Pectoral / Tríceps / Deltoides Ant.)",
        options: [
            { name: "Press de Banca Plano con Mancuernas", eff: "96%", factor: 0.42, note: "Mayor rango de recorrido y estabilización unilateral (peso por mancuerna)." },
            { name: "Press Pecho en Máquina Convergente", eff: "94%", factor: 1.05, note: "Excelente perfil de resistencia y seguridad sin requerir spotter." },
            { name: "Press Plano en Multipower (Smith)", eff: "92%", factor: 0.95, note: "Trayectoria guiada ideal para aplicar pausa de 1 seg sin fatiga estabilizadora." }
        ]
    },
    "dominadas": {
        pattern: "Tracción Vertical (Dorsal Ancho / Redondo Mayor / Bíceps)",
        options: [
            { name: "Jalón al Pecho en Polea Alta (Agarre Prono)", eff: "96%", factor: 0.85, note: "Mismo plano frontal; permite ajustar la carga con precisión." },
            { name: "Jalón en Polea Agarre Neutro / Mag Grip", eff: "94%", factor: 0.90, note: "Mayor comodidad en hombro y gran reclutamiento de dorsal inferior." },
            { name: "Dominadas Asistidas en Máquina", eff: "95%", factor: 0.80, note: "Permite mantener el patrón exacto controlando el RIR." }
        ]
    },
    "press_militar": {
        pattern: "Empuje Vertical (Deltoides Anterior y Medio / Tríceps)",
        options: [
            { name: "Press Hombros con Mancuernas Sentado", eff: "95%", factor: 0.40, note: "Permite rotación natural de escápula (peso por mancuerna)." },
            { name: "Press de Hombros en Máquina", eff: "93%", factor: 1.0, note: "Máxima estabilidad para sobrecargar deltoides sin limitar por core." },
            { name: "Press Militar en Multipower", eff: "92%", factor: 0.95, note: "Control total de la fase excéntrica de 3 segundos." }
        ]
    },
    "remo": {
        pattern: "Tracción Horizontal (Espalda Media / Dorsal / Deltoides Post.)",
        options: [
            { name: "Remo en Polea Baja (Gironda)", eff: "96%", factor: 0.95, note: "Tensión constante en todo el recorrido; pausa 1 seg atrás." },
            { name: "Remo con Mancuerna a Una Mano", eff: "94%", factor: 0.48, note: "Excelente estiramiento dorsal y cero estrés lumbar." },
            { name: "Remo en Máquina con Apoyo al Pecho", eff: "97%", factor: 1.0, note: "Elimina impulso lumbar y aísla la retracción escapular." }
        ]
    },
    "pec_deck": {
        pattern: "Aducción Horizontal (Aislamiento Pectoral)",
        options: [
            { name: "Cruce de Poleas a Altura Media", eff: "96%", factor: 0.35, note: "Mantiene tensión máxima en el pico de contracción (peso por lado)." },
            { name: "Aperturas con Mancuernas en Banco Plano", eff: "88%", factor: 0.30, note: "Mayor énfasis en estiramiento; no bajar más allá de la línea del torso." },
            { name: "Flexiones con Déficit / Anillas", eff: "85%", factor: 0.0, note: "Excelente alternativa con peso corporal y alto estiramiento." }
        ]
    },
    "elevacion_lateral": {
        pattern: "Abducción de Hombro (Deltoides Lateral)",
        options: [
            { name: "Elevaciones Laterales en Polea Baja", eff: "98%", factor: 0.85, note: "Perfil de resistencia superior en el inicio del movimiento." },
            { name: "Elevaciones Laterales en Máquina", eff: "95%", factor: 1.2, note: "Evita trampeo con trapecio y mantiene tensión continua." },
            { name: "Elevaciones Laterales Sentado con Mancuernas", eff: "94%", factor: 0.90, note: "Elimina el impulso de cadera." }
        ]
    },
    "curl_femoral": {
        pattern: "Flexión de Rodilla (Isquiosurales)",
        options: [
            { name: "Curl Femoral Sentado en Máquina", eff: "98%", factor: 1.05, note: "Trabaja el isquio en mayor estiramiento (cadera flexionada)." },
            { name: "Curl Femoral Tumbado en Máquina", eff: "96%", factor: 0.95, note: "Mantener cadera pegada al banco sin arquear lumbar." },
            { name: "Curl Femoral con Mancuerna entre Pies", eff: "86%", factor: 0.45, note: "Alternativa efectiva si no hay máquinas disponibles." }
        ]
    },
    "bisagra_cadera": {
        pattern: "Bisagra de Cadera (Isquiosurales / Glúteo / Erectores)",
        options: [
            { name: "Peso Muerto Rumano con Mancuernas", eff: "95%", factor: 0.40, note: "Mismo patrón con menor carga axial (peso por mancuerna)." },
            { name: "Peso Muerto Rumano en Multipower", eff: "93%", factor: 0.90, note: "Trayectoria guiada; foco total en la bisagra." },
            { name: "Hiperextensiones 45° con Disco", eff: "88%", factor: 0.25, note: "Columna neutra y movimiento desde la cadera." }
        ]
    },
    "hack_squat": {
        pattern: "Dominante de Rodilla (Cuádriceps / Glúteo)",
        options: [
            { name: "Prensa de Piernas 45° (Pies bajos)", eff: "95%", factor: 1.45, note: "Coloca pies en zona baja de la plataforma para maximizar flexión de rodilla." },
            { name: "Sentadilla en Multipower (Talones elevados)", eff: "96%", factor: 0.85, note: "Simula el soporte dorsal de la Hack Squat con gran estímulo de cuádriceps." },
            { name: "Sentadilla Búlgara con Mancuernas", eff: "90%", factor: 0.35, note: "Gran estímulo unilateral sin carga axial pesada." }
        ]
    },
    "ext_cuadriceps": {
        pattern: "Extensión de Rodilla (Recto Femoral / Vastos)",
        options: [
            { name: "Sentadilla Sissy / Español en Polea", eff: "88%", factor: 0.4, note: "Único movimiento que carga el recto femoral en estiramiento sin máquina." },
            { name: "Extensión de Cuádriceps Unilateral", eff: "98%", factor: 0.5, note: "Corrige asimetrías con pausa de 1 seg arriba." }
        ]
    },
    "aductores": {
        pattern: "Aducción de Cadera (Aductores)",
        options: [
            { name: "Aducción en Polea Baja (Tobillera)", eff: "92%", factor: 0.30, note: "Unilateral, rango completo y tensión constante." },
            { name: "Sentadilla Sumo con Mancuerna", eff: "85%", factor: 0.50, note: "Postura amplia, gran estiramiento de aductores." },
            { name: "Plancha Copenhague", eff: "84%", factor: 0.0, note: "Isométrico de alta exigencia con peso corporal." }
        ]
    },
    "abductores": {
        pattern: "Abducción de Cadera (Glúteo Medio / Menor)",
        options: [
            { name: "Abducción en Polea Baja (Tobillera)", eff: "93%", factor: 0.30, note: "Unilateral, ligera inclinación del torso adelante." },
            { name: "Caminata Lateral con Banda", eff: "85%", factor: 0.0, note: "Mantener tensión de la banda en todo momento." },
            { name: "Abducción Tumbado de Lado con Tobillera", eff: "86%", factor: 0.15, note: "Pierna ligeramente hacia atrás para enfatizar glúteo medio." }
        ]
    },
    "hip_thrust": {
        pattern: "Extensión de Cadera (Glúteo Mayor)",
        options: [
            { name: "Puente de Glúteo en Máquina (Glute Drive)", eff: "98%", factor: 1.0, note: "Mismo patrón con configuración rápida y cinturón acolchado." },
            { name: "Peso Muerto Rumano con Barra/Mancuernas", eff: "88%", factor: 0.80, note: "Enfatiza glúteo e isquios en estiramiento." },
            { name: "Hiperextensiones 45° enfocadas a Glúteo", eff: "87%", factor: 0.25, note: "Espalda alta redondeada y pies ligeramente hacia afuera." }
        ]
    },
    "triceps_nuca": {
        pattern: "Extensión de Codo en Estiramiento (Cabeza Larga Tríceps)",
        options: [
            { name: "Extensión Tríceps Tras Nuca con Mancuerna", eff: "95%", factor: 0.85, note: "Excelente estiramiento; mantener codos apuntando arriba." },
            { name: "Press Francés en Banco Inclinado (Barra Z)", eff: "93%", factor: 0.90, note: "Llevar barra detrás de la cabeza para mantener tensión." },
            { name: "Katana Extensions en Polea Doble", eff: "97%", factor: 0.80, note: "Alineación articular óptima para los codos." }
        ]
    },
    "curl_biceps": {
        pattern: "Flexión de Codo (Bíceps Braquial / Braquial)",
        options: [
            { name: "Curl Bíceps en Banco Inclinado con Mancuernas", eff: "96%", factor: 0.42, note: "Máximo estímulo en estiramiento con hombro en extensión." },
            { name: "Curl con Barra Z de Pie", eff: "94%", factor: 0.95, note: "Permite sobrecarga progresiva cómoda para muñecas." },
            { name: "Curl Bayesian en Polea Baja", eff: "98%", factor: 0.85, note: "Codo ligeramente detrás del torso para tensión máxima." }
        ]
    },
    "core": {
        pattern: "Estabilidad / Flexión de Tronco (Core)",
        options: [
            { name: "Crunch en Polea Alta de Rodillas", eff: "96%", factor: 1.0, note: "Flexionar columna llevando costillas hacia pelvis sin tirar con brazos." },
            { name: "Elevaciones de Piernas Colgado", eff: "94%", factor: 0.0, note: "Realizar retroversión pélvica al subir." },
            { name: "Plancha Abdominal RKC (Máxima Tensión)", eff: "90%", factor: 0.0, note: "Contraer glúteos y abdomen al máximo durante 30-45 seg." }
        ]
    }
};

// Rutina exacta de 4 días de Seba
const DEFAULT_ROUTINE = {
    1: {
        title: "Día 1: Torso A (Fuerza & Empuje/Tracción)",
        short: "Torso A",
        focus: "Pectoral, Dorsal, Hombro y Core",
        exercises: [
            { id: "d1_e1", order: 1, name: "Press de Banca Plano con Barra", category: "heavy", altKey: "press_banca", sets: 4, repsTarget: "4-6", baseWeight: 80, restSec: 180,
              cue: "Pausa obligatoria de 1 seg en el pecho, retracción escapular y empuje explosivo.",
              steps: "1. Retrae y deprime escápulas contra el banco.\n2. Baja la barra controlada (2-3s) hacia la línea media del pectoral.\n3. Pausa 1 segundo sin rebotar y empuja fuerte.",
              commonError: "Rebotar la barra en el esternón o despegar los glúteos del banco." },
            { id: "d1_e2", order: 2, name: "Dominadas Lastradas / Pronas", category: "heavy", altKey: "dominadas", sets: 4, repsTarget: "6-8", baseWeight: 10, restSec: 150, addsBodyweight: true,
              cue: "Iniciar tirando codos hacia abajo y atrás, pecho a la barra, sin balanceo. (El peso es el lastre añadido)",
              steps: "1. Agarre ligeramente mayor al ancho de hombros.\n2. Deprime hombros antes de flexionar codos.\n3. Sube hasta pasar barbilla y baja en 2-3 segundos.",
              commonError: "Acortar el recorrido abajo o usar impulso de piernas (kipping)." },
            { id: "d1_e3", order: 3, name: "Press Militar con Barra de Pie", category: "heavy", altKey: "press_militar", sets: 3, repsTarget: "6-8", baseWeight: 47.5, restSec: 150,
              cue: "Glúteos y abdomen apretados para evitar hiperextensión lumbar; cabeza pasa al frente arriba.",
              steps: "1. Agarre justo por fuera de hombros, codos ligeramente adelantados.\n2. Empuja verticalmente y mete la cabeza al pasar la frente.\n3. Baja controlado hasta clavículas.",
              commonError: "Arquear excesivamente la espalda baja convirtiéndolo en un press inclinado." },
            { id: "d1_e4", order: 4, name: "Remo con Barra Pendlay / Pecho Apoyado", category: "moderate", altKey: "remo", sets: 3, repsTarget: "8-10", baseWeight: 65, restSec: 120,
              cue: "Torso estable, tirar hacia la boca del estómago/ombligo apretando escápulas 1 seg.",
              steps: "1. Mantén columna neutra.\n2. Tracciona llevando codos pegados al costado.\n3. Sostén 1 segundo arriba y extiende completo.",
              commonError: "Dar tirones con la zona lumbar para subir el peso." },
            { id: "d1_e5", order: 5, name: "Pec Deck (Mariposa en Máquina)", category: "isolation", altKey: "pec_deck", sets: 3, repsTarget: "10-12", baseWeight: 55, restSec: 90,
              cue: "Codos semiflexionados fijos, juntar bíceps (no manos) y pausa de 1 seg al centro.",
              steps: "1. Ajusta asiento para que agarres queden a altura media del pecho.\n2. Abre hasta sentir estiramiento controlado sin dolor en hombro.\n3. Cierra y aprieta 1 segundo.",
              commonError: "Dejar que los hombros se adelanten (protracción) al cerrar." },
            { id: "d1_e6", order: 6, name: "Elevaciones Laterales con Mancuernas", category: "isolation", altKey: "elevacion_lateral", sets: 4, repsTarget: "12-15", baseWeight: 12, restSec: 75,
              cue: "Subir en plano escapular (30° adelante), guiar con los codos y excéntrica de 3 seg.",
              steps: "1. Inclina ligeramente el torso adelante.\n2. Eleva hasta paralelo al suelo sin encoger trapecios.\n3. Baja frenando el peso durante 3 segundos.",
              commonError: "Balancear el torso o subir las muñecas por encima de los codos." },
            { id: "d1_e7", order: 7, name: "Crunches en Polea Alta", category: "isolation", altKey: "core", sets: 3, repsTarget: "12-15", baseWeight: 35, restSec: 60,
              cue: "Cadera fija; enrollar la columna llevando costillas hacia el pubis.",
              steps: "1. Arrodíllate con cuerda junto a la frente/sienes.\n2. Exhala fuerte mientras flexionas la columna dorsal.\n3. Pausa 1 seg abajo y sube lento.",
              commonError: "Sentarse hacia atrás flexionando la cadera en lugar de curvar el abdomen." }
        ]
    },
    2: {
        title: "Día 2: Pierna / Brazos A (Cadena Anterior & Brazos)",
        short: "Pierna/Brazos A",
        focus: "Cuádriceps, Isquios, Bíceps, Tríceps y Core",
        exercises: [
            { id: "d2_e1", order: 1, name: "Hack Squat (Sentadilla Hack)", category: "heavy", altKey: "hack_squat", sets: 4, repsTarget: "6-8", baseWeight: 100, restSec: 180,
              cue: "Pies ancho de hombros, bajar profundo con excéntrica de 3 seg sin despegar lumbar.",
              steps: "1. Apoya espalda y pelvis firmemente en el respaldo.\n2. Desciende controlando 3 segundos hasta romper paralelo.\n3. Empuja fuerte sin bloquear agresivamente rodillas arriba.",
              commonError: "Levantar talones o despegar el sacro al final de la bajada." },
            { id: "d2_e2", order: 2, name: "Curl Femoral Sentado / Tumbado", category: "moderate", altKey: "curl_femoral", sets: 3, repsTarget: "8-10", baseWeight: 45, restSec: 120,
              cue: "Puntas de los pies en dorsiflexión (hacia ti), pausa 1 seg en contracción y 3s bajada.",
              steps: "1. Alinea el eje de la máquina con tu rodilla.\n2. Flexiona explosivo manteniendo pelvis fija.\n3. Retiene el retorno durante 3 segundos.",
              commonError: "Levantar la cadera del asiento para ayudarse." },
            { id: "d2_e3", order: 3, name: "Extensión de Cuádriceps en Máquina", category: "isolation", altKey: "ext_cuadriceps", sets: 3, repsTarget: "10-12", baseWeight: 60, restSec: 90,
              cue: "Bloqueo isométrico de 2 seg arriba en cada repetición, bajada controlada.",
              steps: "1. Agárrate firme de las asas laterales para fijar cadera.\n2. Extiende completo y sostén 2 segundos arriba.\n3. Baja sin que las placas choquen.",
              commonError: "Patear con inercia y dejar caer el peso." },
            { id: "d2_e4", order: 4, name: "Aductores en Máquina", category: "isolation", altKey: "aductores", sets: 3, repsTarget: "12-15", baseWeight: 50, restSec: 75,
              cue: "Control total en la apertura, cierre explosivo y pausa 1 seg.",
              steps: "1. Ajusta amplitud cómoda sin tirón inguinal.\n2. Cierra con control y mantén 1 segundo.\n3. Abre despacio.",
              commonError: "Usar rebote en la máxima apertura." },
            { id: "d2_e5", order: 5, name: "Extensión Tríceps Tras Nuca en Polea", category: "isolation", altKey: "triceps_nuca", sets: 3, repsTarget: "10-12", baseWeight: 25, restSec: 90,
              cue: "Codos fijos apuntando arriba/adelante, máximo estiramiento detrás de la cabeza.",
              steps: "1. Da un paso adelante inclinando torso 30°.\n2. Deja que los antebrazos bajen detrás de la cabeza estirando tríceps.\n3. Extiende completo sin abrir codos.",
              commonError: "Mover los hombros hacia adelante y atrás en cada rep." },
            { id: "d2_e6", order: 6, name: "Curl de Bíceps en Polea Baja", category: "isolation", altKey: "curl_biceps", sets: 3, repsTarget: "10-12", baseWeight: 25, restSec: 90,
              cue: "Codos pegados a los costados, supinación completa arriba y 3s de bajada.",
              steps: "1. Mantén pecho erguido y hombros atrás.\n2. Flexiona el codo llevando meñique hacia el hombro.\n3. Extiende totalmente el brazo abajo.",
              commonError: "Adelantar el codo o balancear la espalda baja." },
            { id: "d2_e7", order: 7, name: "Rueda Abdominal (Ab Wheel)", category: "isolation", altKey: "core", sets: 3, repsTarget: "10-12", baseWeight: 0, restSec: 75,
              cue: "Pelvis en retroversión (glúteos apretados) antes de rodar; no hundir lumbar.",
              steps: "1. Inicia con espalda ligeramente redondeada (hollow body).\n2. Rueda adelante hasta donde mantengas tensión abdominal.\n3. Regresa tirando desde el abdomen.",
              commonError: "Arquear la espalda baja al extenderse." }
        ]
    },
    3: {
        title: "Día 3: Torso B (Hipertrofia & Ángulos)",
        short: "Torso B",
        focus: "Pectoral Superior, Espalda, Hombros y Core",
        exercises: [
            { id: "d3_e1", order: 1, name: "Press Inclinado con Mancuernas (30°)", category: "heavy", altKey: "press_banca", sets: 4, repsTarget: "8-10", baseWeight: 30, restSec: 150,
              cue: "Banco a 30°, codos a 45° del torso, estiramiento profundo abajo y empuje convergente.",
              steps: "1. Ajusta banco a 30 grados (no 45° para no sobreactivar deltoides).\n2. Baja mancuernas hasta la altura del pecho alto.\n3. Empuja sin chocar mancuernas arriba.",
              commonError: "Abrir codos a 90° generando estrés en el manguito rotador." },
            { id: "d3_e2", order: 2, name: "Jalón al Pecho Agarre Neutro / Estrecho", category: "moderate", altKey: "dominadas", sets: 4, repsTarget: "8-10", baseWeight: 65, restSec: 120,
              cue: "Sacar pecho hacia el agarre, bajar codos hacia la cadera y controlar retorno.",
              steps: "1. Fija muslos bajo los rodillos.\n2. Tira llevando el agarre hacia la parte superior del esternón.\n3. Estira dorsales arriba dejando subir escápulas.",
              commonError: "Inclinarse 45° hacia atrás usando el peso del cuerpo." },
            { id: "d3_e3", order: 3, name: "Remo en Polea Baja (Agarre Gironda)", category: "moderate", altKey: "remo", sets: 3, repsTarget: "10-12", baseWeight: 60, restSec: 120,
              cue: "Torso vertical, pausa 1 seg con manos en abdomen, estiramiento controlado adelante.",
              steps: "1. Rodillas semiflexionadas y espalda recta.\n2. Retrae escápulas y lleva el triángulo al ombligo.\n3. Mantén 1 segundo y suelta controlado.",
              commonError: "Encorvar la espalda alta al estirar." },
            { id: "d3_e4", order: 4, name: "Press de Hombros en Máquina / Mancuernas", category: "moderate", altKey: "press_militar", sets: 3, repsTarget: "8-10", baseWeight: 22, restSec: 120,
              cue: "Codos ligeramente por delante del plano del torso, recorrido completo.",
              steps: "1. Espalda bien apoyada en el respaldo.\n2. Baja hasta que mancuernas rocen hombros.\n3. Empuja sin bloquear codos de golpe.",
              commonError: "Acortar la bajada a la mitad." },
            { id: "d3_e5", order: 5, name: "Cruce de Poleas (Enfoque Pectoral Inferior)", category: "isolation", altKey: "pec_deck", sets: 3, repsTarget: "12-15", baseWeight: 17.5, restSec: 90,
              cue: "Poleas altas, cruzar manos ligeramente abajo y apretar 1 seg.",
              steps: "1. Da un paso adelante para estabilidad.\n2. Lleva manos hacia abajo y al centro.\n3. Abre despacio hasta alinear codos con torso.",
              commonError: "Flexionar y extender codos como si fuera press." },
            { id: "d3_e6", order: 6, name: "Elevaciones Laterales en Polea Baja", category: "isolation", altKey: "elevacion_lateral", sets: 4, repsTarget: "12-15", baseWeight: 7.5, restSec: 75,
              cue: "Cable pasando por detrás o delante, tensión constante desde el inicio.",
              steps: "1. Sujeta el estribo con la mano contraria a la polea.\n2. Eleva el brazo hasta la horizontal sin elevar hombro.\n3. Controla el descenso.",
              commonError: "Tirar con impulso desde la cadera." },
            { id: "d3_e7", order: 7, name: "Crunch Declinado Controlado", category: "isolation", altKey: "core", sets: 3, repsTarget: "12-15", baseWeight: 5, restSec: 60,
              cue: "Subir enrollando vértebra por vértebra, bajar sin apoyar hombros del todo.",
              steps: "1. Manos en pecho o detrás de orejas sin tirar del cuello.\n2. Flexiona el tronco exhalando.\n3. Baja en 3 segundos manteniendo tensión.",
              commonError: "Subir con espalda totalmente recta tirando del psoas." }
        ]
    },
    4: {
        title: "Día 4: Pierna / Brazos B (Cadena Posterior & Brazos)",
        short: "Pierna/Brazos B",
        focus: "Glúteo, Isquios, Abductores, Brazos y Anti-rotación",
        exercises: [
            { id: "d4_e1", order: 1, name: "Hip Thrust con Barra / Máquina", category: "heavy", altKey: "hip_thrust", sets: 4, repsTarget: "6-8", baseWeight: 110, restSec: 150,
              cue: "Mirada al frente (mentón al pecho), bloqueo de 2 seg arriba con retroversión pélvica.",
              steps: "1. Apoya borde inferior de escápulas en el banco.\n2. Empuja con talones hasta alinear torso y muslos.\n3. Sostén 2 segundos arriba apretando glúteos al máximo.",
              commonError: "Hiperextender la zona lumbar mirando hacia el techo." },
            { id: "d4_e2", order: 2, name: "Peso Muerto Rumano (RDL) con Barra", category: "heavy", altKey: "bisagra_cadera", sets: 3, repsTarget: "8-10", baseWeight: 85, restSec: 150,
              cue: "Bisagra de cadera llevando glúteos atrás, barra pegada a muslos, parar al límite de flexión de cadera.",
              steps: "1. Rodillas semiflexionadas fijas (aprox 15°).\n2. Empuja cadera hacia atrás manteniendo espalda neutra.\n3. Sube empujando cadera adelante apenas sientas máximo estiramiento isquio.",
              commonError: "Bajar más doblando la espalda baja cuando la cadera ya dejó de ir atrás." },
            { id: "d4_e3", order: 3, name: "Prensa de Piernas 45°", category: "moderate", altKey: "hack_squat", sets: 3, repsTarget: "10-12", baseWeight: 150, restSec: 120,
              cue: "Rango completo sin despegar glúteos, excéntrica de 3 seg.",
              steps: "1. Pies al ancho de hombros en centro de plataforma.\n2. Baja rodillas hacia el pecho controladamente.\n3. Empuja sin bloquear rodillas al final.",
              commonError: "Dejar que la pelvis se enrolle al final de la bajada." },
            { id: "d4_e4", order: 4, name: "Abductores en Máquina", category: "isolation", altKey: "abductores", sets: 3, repsTarget: "15-20", baseWeight: 55, restSec: 75,
              cue: "Torso ligeramente inclinado adelante, apertura explosiva y pausa 1 seg.",
              steps: "1. Abre las piernas empujando con la cara externa de rodillas.\n2. Mantén 1 segundo en máxima apertura.\n3. Regresa controlado.",
              commonError: "Rebotar las placas entre repeticiones." },
            { id: "d4_e5", order: 5, name: "Press Francés / Fondos en Máquina Tríceps", category: "isolation", altKey: "triceps_nuca", sets: 3, repsTarget: "10-12", baseWeight: 30, restSec: 90,
              cue: "Codos cerrados y estables, extensión completa abajo.",
              steps: "1. Fija los brazos junto al torso.\n2. Extiende completamente los codos.\n3. Sube controlado hasta 90° de flexión.",
              commonError: "Encoger hombros hacia las orejas." },
            { id: "d4_e6", order: 6, name: "Curl Martillo con Mancuernas", category: "isolation", altKey: "curl_biceps", sets: 3, repsTarget: "10-12", baseWeight: 16, restSec: 90,
              cue: "Agarre neutro (pulgar arriba), enfoque en braquial y braquiorradial, cero balanceo.",
              steps: "1. Brazos a los lados con palmas mirándose.\n2. Sube sin adelantar el codo.\n3. Baja en 2-3 segundos.",
              commonError: "Usar impulso de hombro." },
            { id: "d4_e7", order: 7, name: "Elevaciones de Piernas Colgado / Pallof Press", category: "isolation", altKey: "core", sets: 3, repsTarget: "12-15", baseWeight: 0, restSec: 60,
              cue: "Retroversión pélvica controlada al subir; evitar balanceo del cuerpo.",
              steps: "1. Cuélgate con agarre firme y escápulas activas.\n2. Sube rodillas/piernas enrollando la pelvis hacia el pecho.\n3. Baja lento.",
              commonError: "Subir solo hasta 90° trabajando únicamente flexores de cadera." }
        ]
    }
};
