// Emoji catalogue with Spanish names and search words. Glyphs are drawn by the
// system emoji font at render time; no emoji artwork is bundled.
export const EMOJI_GROUPS = {
	caras: "Caras y reacciones",
	gestos: "Gestos y personas",
	corazones: "Corazones y amor",
	animales: "Animales",
	naturaleza: "Naturaleza y clima",
	comida: "Comida y bebida",
	actividades: "Deporte, juegos y fiesta",
	viajes: "Viajes y lugares",
	objetos: "Objetos y tecnología",
	simbolos: "Símbolos y señales",
} as const;
export type EmojiGroup = keyof typeof EMOJI_GROUPS;

type Row = [emoji: string, name: string, tags?: string];
const rows: Record<EmojiGroup, Row[]> = {
	caras: [
		["😀", "Sonrisa", "feliz contento alegre"], ["😃", "Sonrisa grande", "feliz alegre"], ["😄", "Risa con ojos", "feliz alegre"],
		["😁", "Sonrisa radiante", "dientes feliz"], ["😆", "Carcajada", "risa jaja"], ["😅", "Risa nerviosa", "sudor uf"],
		["🤣", "Revolcándose de risa", "jajaja lol risa"], ["😂", "Llorando de risa", "jajaja lol risa xd"], ["🙂", "Sonrisa leve", "bien"],
		["🙃", "Al revés", "ironía sarcasmo"], ["😉", "Guiño", "pícaro"], ["😊", "Sonrojado", "tímido feliz"],
		["😇", "Angelito", "inocente bueno"], ["🥰", "Enamorado", "amor corazones"], ["😍", "Ojos de corazón", "amor me encanta"],
		["🤩", "Deslumbrado", "estrellas wow increíble"], ["😘", "Beso", "amor"], ["😋", "Delicioso", "rico comida"],
		["😛", "Lengua fuera", "broma"], ["😜", "Guiño con lengua", "loco broma"], ["🤪", "Loco", "locura chiflado"],
		["🤑", "Dinero", "rico pasta"], ["🤗", "Abrazo", "cariño"], ["🤭", "Tapándose la boca", "risita ups"],
		["🤫", "Silencio", "secreto shh"], ["🤔", "Pensando", "duda hmm"], ["🫡", "Saludo militar", "respeto entendido"],
		["🤐", "Boca cerrada", "secreto callado"], ["🤨", "Ceja levantada", "sospecha sus duda"], ["😐", "Neutral", "sin expresión"],
		["😑", "Inexpresivo", "meh"], ["😶", "Sin boca", "sin palabras"], ["😏", "Sonrisa pícara", "chulo"],
		["😒", "Disgustado", "meh aburrido"], ["🙄", "Ojos en blanco", "aburrido paciencia"], ["😬", "Mueca", "incómodo cringe"],
		["😮‍💨", "Resoplido", "alivio cansado"], ["🤥", "Mentiroso", "mentira pinocho"], ["😌", "Aliviado", "tranquilo paz"],
		["😔", "Pensativo triste", "triste"], ["😪", "Somnoliento", "sueño"], ["🤤", "Babeando", "antojo"],
		["😴", "Durmiendo", "sueño zzz"], ["😷", "Mascarilla", "enfermo"], ["🤒", "Fiebre", "enfermo"],
		["🤢", "Náuseas", "asco"], ["🤮", "Vomitando", "asco"], ["🥵", "Calor", "caliente sudor"],
		["🥶", "Frío", "helado congelado"], ["🥴", "Mareado", "borracho"], ["😵", "Aturdido", "mareo"],
		["😵‍💫", "Espiral", "mareado confundido"], ["🤯", "Cabeza explotando", "mente volada increíble wow"], ["🤠", "Vaquero", "yeehaw"],
		["🥳", "Fiesta", "celebración cumpleaños"], ["🥸", "Disfrazado", "incógnito"], ["😎", "Gafas de sol", "cool chulo guay"],
		["🤓", "Empollón", "nerd listo"], ["🧐", "Monóculo", "analizando investigando"], ["😕", "Confundido", "duda"],
		["😟", "Preocupado", "miedo"], ["🙁", "Triste", "pena"], ["😮", "Boca abierta", "sorpresa wow"],
		["😯", "Asombrado", "sorpresa"], ["😲", "Atónito", "sorpresa shock"], ["😳", "Sonrojado sorprendido", "vergüenza ups"],
		["🥺", "Ojos suplicantes", "porfa por favor tierno"], ["🥹", "Conteniendo lágrimas", "emocionado"], ["😦", "Ceño fruncido boca abierta", "shock"],
		["😨", "Asustado", "miedo"], ["😰", "Ansioso", "sudor miedo"], ["😢", "Llorando", "triste lágrima"],
		["😭", "Llorando a mares", "triste llanto"], ["😱", "Gritando de miedo", "terror shock omg"], ["😖", "Frustrado", "agobio"],
		["😣", "Perseverante", "esfuerzo"], ["😞", "Decepcionado", "triste"], ["😓", "Sudor frío", "agotado"],
		["😩", "Agotado", "cansado harto"], ["😫", "Cansado", "harto"], ["🥱", "Bostezo", "aburrido sueño"],
		["😤", "Resoplando", "enfadado orgulloso"], ["😡", "Furioso", "enfadado rabia"], ["😠", "Enfadado", "enojo"],
		["🤬", "Insultando", "rabia palabrotas"], ["😈", "Diablillo", "malvado travieso"], ["💀", "Calavera", "muerto me muero xd"],
		["☠️", "Calavera y huesos", "peligro muerte"], ["💩", "Caca", "broma"], ["🤡", "Payaso", "ridículo"],
		["👹", "Ogro", "monstruo"], ["👻", "Fantasma", "susto halloween"], ["👽", "Alienígena", "extraterrestre ovni"],
		["🤖", "Robot", "ia máquina"], ["🎃", "Calabaza", "halloween"], ["😺", "Gato sonriente", "gatito"],
		["🙈", "Mono no veo", "vergüenza"], ["🙉", "Mono no oigo", "no escucho"], ["🙊", "Mono no hablo", "ups secreto"],
	],
	gestos: [
		["👍", "Pulgar arriba", "me gusta like bien ok"], ["👎", "Pulgar abajo", "no me gusta dislike mal"], ["👏", "Aplausos", "bravo bien hecho"],
		["🙌", "Manos arriba", "celebración hurra"], ["👐", "Manos abiertas", "abrazo"], ["🤝", "Apretón de manos", "trato acuerdo"],
		["🙏", "Manos juntas", "gracias por favor rezar"], ["✌️", "Victoria", "paz"], ["🤞", "Dedos cruzados", "suerte ojalá"],
		["🤟", "Te quiero", "amor rock"], ["🤘", "Cuernos", "rock metal"], ["👌", "OK", "perfecto bien"],
		["🤌", "Dedos juntos", "italiano qué dices"], ["🤏", "Pellizco", "poquito"], ["👈", "Señala izquierda", "aquí"],
		["👉", "Señala derecha", "aquí mira"], ["👆", "Señala arriba", "arriba"], ["👇", "Señala abajo", "abajo aquí"],
		["☝️", "Índice arriba", "uno atención"], ["✋", "Mano alzada", "alto stop"], ["👋", "Saludo", "hola adiós"],
		["🤙", "Llámame", "surf relax"], ["💪", "Bíceps", "fuerza gym músculo"], ["🦾", "Brazo mecánico", "fuerza robot"],
		["✍️", "Escribiendo", "escribir nota"], ["👀", "Ojos", "mirando ver"], ["👁️", "Ojo", "ver"],
		["🧠", "Cerebro", "mente idea listo"], ["🫶", "Corazón con manos", "amor gracias"], ["🤷", "Encogerse de hombros", "ni idea no sé"],
		["🤦", "Mano en la cara", "facepalm vergüenza"], ["🙋", "Levantando la mano", "yo pregunta"], ["🙅", "Gesto de no", "no prohibido"],
		["🙆", "Gesto de OK", "vale"], ["💁", "Información", "tip"], ["🙇", "Reverencia", "perdón respeto"],
		["🏃", "Corriendo", "correr prisa"], ["💃", "Bailarina", "bailar fiesta"], ["🕺", "Bailarín", "bailar fiesta"],
		["🧑‍💻", "Programador", "ordenador trabajo código"], ["🧑‍🎤", "Cantante", "música rock"], ["🧑‍🍳", "Cocinero", "cocina chef"],
		["🧑‍🚀", "Astronauta", "espacio"], ["🦸", "Superhéroe", "héroe poder"], ["🥷", "Ninja", "sigilo"],
		["👑", "Corona", "rey reina mejor top"], ["🗣️", "Hablando", "voz habla grito"], ["👤", "Silueta", "persona usuario"],
	],
	corazones: [
		["❤️", "Corazón rojo", "amor love"], ["🧡", "Corazón naranja", "amor"], ["💛", "Corazón amarillo", "amistad"],
		["💚", "Corazón verde", "amor naturaleza"], ["💙", "Corazón azul", "amor"], ["💜", "Corazón morado", "amor"],
		["🖤", "Corazón negro", "luto"], ["🤍", "Corazón blanco", "puro"], ["🤎", "Corazón marrón", "amor"],
		["💔", "Corazón roto", "desamor triste"], ["❤️‍🔥", "Corazón en llamas", "pasión"], ["❤️‍🩹", "Corazón vendado", "recuperación"],
		["💕", "Dos corazones", "amor"], ["💞", "Corazones girando", "amor"], ["💓", "Corazón latiendo", "amor"],
		["💗", "Corazón creciendo", "amor"], ["💖", "Corazón brillante", "amor"], ["💘", "Corazón flechado", "cupido"],
		["💝", "Corazón con lazo", "regalo"], ["💌", "Carta de amor", "mensaje"], ["💋", "Marca de beso", "beso labios"],
		["💯", "Cien", "perfecto 100 total"], ["💢", "Enfado", "ira"], ["💥", "Colisión", "boom explosión"],
		["💫", "Mareo", "estrellas"], ["💦", "Gotas", "sudor agua"], ["💨", "Ráfaga", "rápido viento"],
		["💬", "Bocadillo", "comentario chat mensaje"], ["💭", "Pensamiento", "idea pensar"], ["💤", "Dormir", "zzz sueño"],
	],
	animales: [
		["🐶", "Perro", "perrito mascota"], ["🐱", "Gato", "gatito mascota"], ["🐭", "Ratón", "roedor"], ["🐹", "Hámster", "mascota"],
		["🐰", "Conejo", "pascua"], ["🦊", "Zorro", "astuto"], ["🐻", "Oso", "osito"], ["🐼", "Panda", "oso"],
		["🐨", "Koala", "australia"], ["🐯", "Tigre", "felino"], ["🦁", "León", "rey felino"], ["🐮", "Vaca", "granja"],
		["🐷", "Cerdo", "granja"], ["🐸", "Rana", "sapo"], ["🐵", "Mono", "simio"], ["🐔", "Gallina", "pollo"],
		["🐧", "Pingüino", "frío"], ["🐦", "Pájaro", "ave"], ["🦄", "Unicornio", "mágico fantasía"], ["🐝", "Abeja", "miel"],
		["🦋", "Mariposa", "transformación"], ["🐢", "Tortuga", "lento"], ["🐍", "Serpiente", "traición"], ["🐙", "Pulpo", "mar"],
		["🦈", "Tiburón", "mar peligro"], ["🐬", "Delfín", "mar"], ["🐳", "Ballena", "mar"], ["🦖", "Dinosaurio", "t-rex"],
		["🐉", "Dragón", "fantasía"], ["🦅", "Águila", "libertad"], ["🦉", "Búho", "sabio noche"], ["🐌", "Caracol", "lento"],
		["🦀", "Cangrejo", "playa"], ["🐊", "Cocodrilo", "peligro"], ["🦒", "Jirafa", "alto"], ["🐘", "Elefante", "grande"],
		["🦍", "Gorila", "fuerte"], ["🐺", "Lobo", "aullido"], ["🐐", "Cabra", "goat el mejor"], ["🦥", "Perezoso", "vago lento"],
	],
	naturaleza: [
		["🔥", "Fuego", "en llamas brutal viral hot"], ["⚡", "Rayo", "energía rápido"], ["🌈", "Arcoíris", "orgullo color"],
		["☀️", "Sol", "verano calor"], ["🌙", "Luna", "noche"], ["⭐", "Estrella", "favorito"], ["🌟", "Estrella brillante", "destacado"],
		["✨", "Destellos", "magia brillo nuevo"], ["☁️", "Nube", "nublado"], ["🌧️", "Lluvia", "tiempo"], ["⛈️", "Tormenta", "rayos"],
		["❄️", "Copo de nieve", "frío invierno"], ["🌊", "Ola", "mar playa"], ["🌪️", "Tornado", "caos"], ["🌍", "Planeta Tierra", "mundo global"],
		["🌸", "Flor de cerezo", "primavera"], ["🌹", "Rosa", "amor flor"], ["🌻", "Girasol", "verano"], ["🌵", "Cactus", "desierto"],
		["🌴", "Palmera", "playa vacaciones"], ["🍀", "Trébol", "suerte"], ["🍁", "Hoja de arce", "otoño"], ["🌱", "Brote", "crecer nuevo"],
		["🪐", "Planeta con anillos", "espacio saturno"], ["☄️", "Cometa", "espacio"], ["🌋", "Volcán", "erupción"],
	],
	comida: [
		["🍕", "Pizza", "comida italiana"], ["🍔", "Hamburguesa", "comida rápida"], ["🍟", "Patatas fritas", "comida"], ["🌭", "Perrito caliente", "comida"],
		["🌮", "Taco", "mexicano"], ["🌯", "Burrito", "mexicano"], ["🍣", "Sushi", "japonés"], ["🍜", "Ramen", "fideos sopa"],
		["🍝", "Espaguetis", "pasta"], ["🥘", "Paella", "arroz españa"], ["🍳", "Huevo frito", "desayuno"], ["🥐", "Cruasán", "desayuno"],
		["🍩", "Dónut", "dulce"], ["🍪", "Galleta", "dulce"], ["🎂", "Tarta de cumpleaños", "cumpleaños fiesta"], ["🍰", "Pastel", "dulce"],
		["🍫", "Chocolate", "dulce"], ["🍿", "Palomitas", "cine película drama"], ["🍦", "Helado", "verano"], ["🍓", "Fresa", "fruta"],
		["🍉", "Sandía", "fruta verano"], ["🍌", "Plátano", "fruta"], ["🍎", "Manzana", "fruta"], ["🥑", "Aguacate", "fruta"],
		["🌶️", "Guindilla", "picante"], ["🧀", "Queso", "comida"], ["☕", "Café", "mañana"], ["🧋", "Té de burbujas", "bebida"],
		["🍺", "Cerveza", "bebida"], ["🍷", "Vino", "bebida"], ["🥂", "Brindis", "celebración"], ["🍾", "Champán", "celebración"],
		["🧃", "Zumo", "bebida"], ["🥤", "Refresco", "bebida"], ["🧂", "Sal", "salado"], ["🍯", "Miel", "dulce"],
	],
	actividades: [
		["⚽", "Balón de fútbol", "fútbol gol"], ["🏀", "Baloncesto", "canasta"], ["🏈", "Fútbol americano", "deporte"], ["🎾", "Tenis", "deporte"],
		["🏐", "Voleibol", "deporte"], ["🏓", "Ping pong", "deporte"], ["🥊", "Boxeo", "pelea"], ["🏋️", "Pesas", "gym fuerza"],
		["🚴", "Ciclismo", "bici"], ["🏆", "Trofeo", "ganador campeón premio"], ["🥇", "Medalla de oro", "primero ganador"], ["🥈", "Medalla de plata", "segundo"],
		["🥉", "Medalla de bronce", "tercero"], ["🎯", "Diana", "objetivo foco"], ["🎮", "Mando de videojuego", "gaming gamer jugar"], ["🕹️", "Joystick", "retro gaming"],
		["🎲", "Dado", "azar suerte"], ["♟️", "Ajedrez", "estrategia"], ["🧩", "Puzle", "pieza solución"], ["🎨", "Paleta de pintor", "arte creatividad"],
		["🎬", "Claqueta", "cine vídeo acción"], ["🎤", "Micrófono", "cantar podcast voz"], ["🎧", "Auriculares", "música escuchar"], ["🎸", "Guitarra", "música rock"],
		["🥁", "Batería", "tambor redoble"], ["🎹", "Teclado musical", "piano"], ["🎵", "Nota musical", "música canción"], ["🎶", "Notas musicales", "música"],
		["🎉", "Confeti", "fiesta celebración"], ["🎊", "Bola de confeti", "fiesta"], ["🎈", "Globo", "cumpleaños"], ["🎁", "Regalo", "sorteo sorpresa"],
		["🎟️", "Entrada", "evento ticket"], ["🎭", "Teatro", "drama"], ["🎪", "Circo", "espectáculo"], ["🪄", "Varita mágica", "magia truco"],
	],
	viajes: [
		["🚀", "Cohete", "lanzamiento rápido despegue"], ["✈️", "Avión", "viaje vuelo"], ["🚗", "Coche", "conducir"], ["🏎️", "Coche de carreras", "rápido"],
		["🏍️", "Moto", "velocidad"], ["🚲", "Bicicleta", "bici"], ["🚂", "Tren", "viaje"], ["🚢", "Barco", "viaje"],
		["🛸", "Ovni", "alienígena"], ["🏠", "Casa", "hogar"], ["🏢", "Oficina", "edificio trabajo"], ["🏝️", "Isla", "vacaciones playa"],
		["🗺️", "Mapa", "viaje ruta"], ["🧭", "Brújula", "dirección"], ["📍", "Chincheta", "ubicación lugar aquí"], ["🗼", "Torre", "viaje"],
		["🏔️", "Montaña nevada", "naturaleza"], ["🏖️", "Playa", "vacaciones verano"], ["🌆", "Ciudad al atardecer", "urbano"], ["🎡", "Noria", "feria"],
	],
	objetos: [
		["📱", "Móvil", "teléfono smartphone"], ["💻", "Portátil", "ordenador trabajo"], ["🖥️", "Ordenador", "pantalla"], ["⌨️", "Teclado", "escribir"],
		["🖱️", "Ratón de ordenador", "clic"], ["📷", "Cámara de fotos", "foto"], ["📸", "Cámara con flash", "foto selfie"], ["🎥", "Cámara de cine", "vídeo grabar"],
		["📹", "Videocámara", "grabar vídeo"], ["📺", "Televisión", "tele"], ["🔋", "Batería", "energía carga"], ["🔌", "Enchufe", "electricidad"],
		["💡", "Bombilla", "idea consejo tip"], ["🔦", "Linterna", "luz"], ["📚", "Libros", "estudiar aprender"], ["📖", "Libro abierto", "leer"],
		["📝", "Nota", "apuntes escribir"], ["✏️", "Lápiz", "editar"], ["📌", "Chincheta", "importante fijado"], ["📎", "Clip", "adjunto"],
		["✂️", "Tijeras", "cortar recortar"], ["🔒", "Candado cerrado", "seguro privado"], ["🔓", "Candado abierto", "desbloquear"], ["🔑", "Llave", "clave acceso"],
		["🔨", "Martillo", "construir"], ["🛠️", "Herramientas", "configuración arreglar"], ["⚙️", "Engranaje", "ajustes configuración"], ["🧲", "Imán", "atracción"],
		["💰", "Bolsa de dinero", "dinero rico"], ["💸", "Dinero volando", "gastar"], ["💳", "Tarjeta", "pago"], ["💎", "Diamante", "valioso premium"],
		["⏰", "Despertador", "tiempo alarma"], ["⏳", "Reloj de arena", "esperar tiempo"], ["📅", "Calendario", "fecha"], ["📈", "Gráfico al alza", "crecer subir éxito"],
		["📉", "Gráfico a la baja", "bajar caída"], ["📊", "Gráfico de barras", "datos estadística"], ["📣", "Megáfono", "anuncio"], ["📢", "Altavoz", "anuncio atención"],
		["🔔", "Campana", "notificación suscríbete"], ["🔕", "Campana silenciada", "silencio"], ["📩", "Correo", "mensaje email"], ["🗑️", "Papelera", "borrar basura"],
		["🧪", "Tubo de ensayo", "experimento ciencia"], ["🔬", "Microscopio", "ciencia"], ["🔭", "Telescopio", "espacio"], ["💊", "Pastilla", "medicina"],
		["🎙️", "Micrófono de estudio", "podcast"], ["🕶️", "Gafas de sol", "cool"], ["🧢", "Gorra", "ropa"], ["👟", "Zapatilla", "deporte"],
	],
	simbolos: [
		["✅", "Hecho", "correcto check sí"], ["❌", "Cruz", "error no mal"], ["❗", "Exclamación", "importante atención"], ["❓", "Interrogación", "pregunta duda"],
		["⚠️", "Advertencia", "cuidado peligro"], ["🚫", "Prohibido", "no"], ["⛔", "Sin entrada", "stop"], ["🛑", "Señal de stop", "alto"],
		["🔴", "Círculo rojo", "grabando directo"], ["🟢", "Círculo verde", "activo"], ["🟡", "Círculo amarillo", "aviso"], ["🔵", "Círculo azul", "info"],
		["⬆️", "Flecha arriba", "subir"], ["⬇️", "Flecha abajo", "bajar"], ["⬅️", "Flecha izquierda", "atrás"], ["➡️", "Flecha derecha", "siguiente"],
		["↗️", "Flecha diagonal", "crecer"], ["🔄", "Repetir", "actualizar bucle"], ["🔁", "Bucle", "repetir"], ["▶️", "Reproducir", "play"],
		["⏸️", "Pausa", "parar"], ["⏩", "Avance rápido", "acelerar"], ["⏪", "Rebobinar", "atrás"], ["🔊", "Volumen alto", "sonido"],
		["🔇", "Silenciado", "mute"], ["🆕", "Nuevo", "novedad"], ["🆗", "OK", "vale"], ["🆒", "Cool", "guay"],
		["🆓", "Gratis", "free"], ["🔝", "Top", "arriba mejor"], ["🔥", "En llamas", "viral"], ["♻️", "Reciclar", "ecología"],
		["➕", "Más", "sumar añadir"], ["➖", "Menos", "restar"], ["✖️", "Multiplicar", "por"], ["➗", "Dividir", "entre"],
		["♾️", "Infinito", "siempre"], ["💲", "Dólar", "dinero"], ["©️", "Copyright", "derechos"], ["™️", "Marca", "registrada"],
		["#️⃣", "Almohadilla", "hashtag"], ["1️⃣", "Uno", "número primero"], ["2️⃣", "Dos", "número segundo"], ["3️⃣", "Tres", "número tercero"],
		["4️⃣", "Cuatro", "número"], ["5️⃣", "Cinco", "número"], ["🔟", "Diez", "número top"], ["🏁", "Bandera de meta", "final carrera"],
	],
};

export type EmojiEntry = { emoji: string; name: string; group: EmojiGroup; search: string };
export const toCode = (emoji: string) =>
	[...emoji].map((ch) => ch.codePointAt(0)!.toString(16)).join("-");
export const fromCode = (code: string) =>
	String.fromCodePoint(...code.split("-").map((hex) => Number.parseInt(hex, 16)).filter(Number.isFinite));
const plain = (value: string) =>
	value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

let catalogue: EmojiEntry[] | null = null;
export function emojiCatalogue(): EmojiEntry[] {
	if (catalogue) return catalogue;
	const seen = new Set<string>();
	catalogue = [];
	for (const [group, list] of Object.entries(rows) as [EmojiGroup, Row[]][])
		for (const [emoji, name, tags = ""] of list) {
			if (seen.has(emoji)) continue;
			seen.add(emoji);
			catalogue.push({ emoji, name, group, search: plain(`${name} ${tags} ${EMOJI_GROUPS[group]}`) });
		}
	return catalogue;
}
export const normalizeQuery = plain;
