import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : isDev ? 'debug' : 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.otp'],
  ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});
