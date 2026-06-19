import app from '../src/server/dist/index.js';

export default (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
  app(req as any, res as any);
};
