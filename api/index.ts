// Punto de entrada serverless para Vercel.
// Reutiliza la app Express completa de server/index.ts como handler de /api/*.
import app from '../server/index.js';

export default app;
