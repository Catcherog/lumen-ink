import app from '../src/server/index.ts';

export default (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
  app(req as any, res as any);
};
