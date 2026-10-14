// ============================================================================
// Seed de CATÁLOGO y LANDING — SOLO DESARROLLO
// ============================================================================
// Complementa a `database/02_seed.sql`, que a propósito no trae productos: inserta
// catálogo de prueba y los slides del hero para poder ver el storefront con
// contenido. UUIDs fijos + upsert => re-ejecutable sin duplicar.
//
//   cd App && npx tsx scripts/seed-catalog.dev.mts --confirm
//
// El `--confirm` no es burocracia: este script escribe productos con
// `published: true`, o sea que lo que siembre aparece en la tienda. Apuntar sin
// querer al Supabase de producción llena el catálogo real de audífonos de
// prueba, y limpiarlos después es a mano. El script imprime a qué proyecto va a
// escribir ANTES de hacerlo, para que se pueda comparar con el que corresponde.
// ============================================================================
import '../server/core/load-env'; // Fuente única de variables de entorno. Debe ir primero.
import { createClient } from '@supabase/supabase-js';

const url = (process.env.SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!url || !serviceKey) {
  console.error(
    'Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Revisá el archivo al que apunta GYRO_ENV_FILE.',
  );
  process.exit(1);
}

// El nombre del proyecto va en el subdominio: https://<ref>.supabase.co
const projectRef = new URL(url).hostname.split('.')[0];

if (process.env.NODE_ENV === 'production') {
  console.error('NODE_ENV=production: este seed es solo para desarrollo. Abortado.');
  process.exit(1);
}

console.log(`Proyecto Supabase destino: ${projectRef}`);

if (!process.argv.includes('--confirm')) {
  console.error(
    '\nEste script publica productos de prueba en el catálogo de ESE proyecto.\n' +
      'Si es el correcto, volvé a correrlo con --confirm:\n\n' +
      '  npx tsx scripts/seed-catalog.dev.mts --confirm\n',
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Prefijo 1111… = templates de prueba; 2222… = catalog_items de prueba.
const templates = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    name: 'Audífonos KZ EDX Pro',
    axes: { color: ['negro', 'transparente'] },
    specs: { driver: '10 mm dinámico', tipo: 'in-ear', cable: 'desmontable 2 pin' },
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    name: 'Adaptador Bluetooth KZ AZ09',
    axes: { color: ['negro'] },
    specs: { bluetooth: '5.2', bateria: '6.5 h' },
  },
  {
    id: '11111111-1111-4111-8111-111111111103',
    name: 'Puntas memory foam (3 pares)',
    axes: {},
    specs: { tallas: 'S / M / L' },
  },
  {
    id: '11111111-1111-4111-8111-111111111104',
    name: 'Mousepad XL antideslizante',
    axes: {},
    specs: { medidas: '80×30 cm' },
  },
];

// Precios en córdobas (moneda local del /api/config).
const catalogItems = [
  {
    id: '22222222-2222-4222-8222-222222222201',
    template_id: '11111111-1111-4111-8111-111111111101',
    base_price: 550,
    price: 550,
    published: true,
    is_promo: false,
    sort_order: 0,
    images: [], // TODO: subir a Storage y referenciar la URL pública
  },
  {
    id: '22222222-2222-4222-8222-222222222202',
    template_id: '11111111-1111-4111-8111-111111111102',
    base_price: 950,
    price: 850,
    published: true,
    is_promo: true,
    sort_order: 1,
    images: [], // TODO: subir a Storage y referenciar la URL pública
  },
  {
    id: '22222222-2222-4222-8222-222222222203',
    template_id: '11111111-1111-4111-8111-111111111103',
    base_price: 180,
    price: 180,
    published: true,
    is_promo: false,
    sort_order: 2,
    images: [], // sin imagen a propósito: prueba el fallback de la card
  },
  {
    id: '22222222-2222-4222-8222-222222222204',
    template_id: '11111111-1111-4111-8111-111111111104',
    base_price: 320,
    price: 320,
    published: true,
    is_promo: false,
    sort_order: 3,
    images: [], // TODO: subir a Storage y referenciar la URL pública
  },
];

// Slides del hero. El primero es el de marca y va `locked`: no se puede mover
// ni borrar desde el panel, solo editar. Los demás son vitrina de producto.
const landingConfig = {
  headerCategories: [],
  heroSlides: [
    {
      id: 'slide-marca',
      eyebrow: 'GYRO STORE',
      title: 'Tecnología que suena por encima de su precio',
      description:
        'Audífonos, adaptadores y accesorios seleccionados. Pedí por WhatsApp y coordinamos la entrega en Managua.',
      mediaUrl: '/gyro-emblem.png',
      mediaType: 'image',
      buttonText: 'Ver catálogo',
      actionType: 'link',
      actionTarget: '/#catalogo',
      locked: true,
    },
    {
      id: 'slide-az09',
      eyebrow: 'AUDIO SIN CABLES',
      title: 'Adaptador Bluetooth KZ AZ09',
      description:
        'Convertí tus KZ favoritos en inalámbricos sin perder calidad. Bluetooth 5.2 y 6.5 horas de batería.',
      mediaUrl: '', // TODO: subir a Storage y referenciar la URL pública
      mediaType: 'image',
      buttonText: 'Ver oferta',
      actionType: 'link',
      actionTarget: '/#catalogo',
    },
    {
      id: 'slide-edx',
      eyebrow: 'SONIDO IN-EAR',
      title: 'Audífonos KZ EDX Pro',
      description:
        'Driver dinámico de 10 mm y cable desmontable de 2 pines. El punto de entrada al audio de verdad.',
      mediaUrl: '', // TODO: subir a Storage y referenciar la URL pública
      mediaType: 'image',
      buttonText: 'Ver producto',
      actionType: 'link',
      actionTarget: '/#catalogo',
    },
  ],
};

const t = await db.from('templates').upsert(templates);
if (t.error) throw new Error(`templates: ${t.error.message}`);

const c = await db.from('catalog_items').upsert(catalogItems);
if (c.error) throw new Error(`catalog_items: ${c.error.message}`);

const l = await db
  .from('app_config')
  .upsert({ key: 'landing_config', value: landingConfig }, { onConflict: 'key' });
if (l.error) throw new Error(`landing_config: ${l.error.message}`);

const { count } = await db
  .from('catalog_items')
  .select('id', { count: 'exact', head: true })
  .eq('published', true);

console.log(
  `Seed OK — catálogo publicado: ${count} ítems · hero: ${landingConfig.heroSlides.length} slides.`,
);
