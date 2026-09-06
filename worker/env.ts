export interface Env {
  ARCADE_ROOMS: DurableObjectNamespace;
  ROOM_CREATION_RATE_LIMITER: RateLimit;
  ROOM_PASSWORD_PEPPER: string;
  ALLOWED_ORIGINS?: string;
}
