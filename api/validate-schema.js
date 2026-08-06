/**
 * api/validate-schema.js
 *
 * JSON Schema валидация для API ответов
 * Используется для проверки /api/artist-dashboard и других endpoints
 *
 * POST /api/validate-schema
 * Body: { data: object, schemaName: string }
 * Returns: { valid: boolean, errors?: array }
 */

// Простая JSON Schema валидация (без внешних зависимостей)
const SCHEMAS = {
  'artist-dashboard': {
    type: 'object',
    properties: {
      artist: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['name']
      },
      summary: {
        type: 'object',
        properties: {
          streams: { type: ['number', 'null'] },
          views: { type: ['number', 'null'] },
          audience: { type: ['number', 'null'] },
          streamsSource: { type: 'string' },
          viewsSource: { type: 'string' },
          audienceSource: { type: 'string' }
        }
      },
      tracks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            platform: { type: 'string' },
            streams: { type: ['number', 'null'] },
            source: { type: 'string' },
            audioUrl: { type: 'string' },
            coverUrl: { type: 'string' },
            updatedAt: { type: 'string' }
          },
          required: ['title']
        }
      },
      platforms: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'number' }
          }
        }
      },
      geo: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'number' }
          }
        }
      },
      socials: {
        type: 'object',
        additionalProperties: { type: 'string' }
      },
      lastSync: { type: ['string', 'null'] }
    },
    required: ['artist', 'summary']
  }
};

// Простой валидатор типов
function validateType(value, type) {
  if (type === 'null') return value === null;
  if (Array.isArray(type)) return type.some(t => validateType(value, t));
  if (typeof value === type) return true;
  return false;
}

// Рекурсивная валидация объекта
function validateObject(data, schema, path = '') {
  const errors = [];

  if (schema.type && !validateType(data, schema.type)) {
    errors.push(`${path} should be of type ${schema.type}, got ${typeof data}`);
    return errors;
  }

  if (schema.type === 'object' && typeof data === 'object' && data !== null) {
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`${path}.${field} is required`);
        }
      }
    }

    if (schema.properties) {
      for (const key in data) {
        if (key in schema.properties) {
          const childErrors = validateObject(
            data[key],
            schema.properties[key],
            `${path}.${key}`
          );
          errors.push(...childErrors);
        }
      }
    }
  } else if (schema.type === 'array' && Array.isArray(data)) {
    if (schema.items) {
      data.forEach((item, idx) => {
        const itemErrors = validateObject(item, schema.items, `${path}[${idx}]`);
        errors.push(...itemErrors);
      });
    }
  }

  return errors;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data, schemaName } = req.body;

  if (!schemaName || !SCHEMAS[schemaName]) {
    return res.status(400).json({
      error: `Unknown schema: ${schemaName}`,
      availableSchemas: Object.keys(SCHEMAS)
    });
  }

  try {
    const schema = SCHEMAS[schemaName];
    const errors = validateObject(data, schema, schemaName);

    return res.status(200).json({
      valid: errors.length === 0,
      schemaName,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      valid: false
    });
  }
}
