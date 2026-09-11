import vinextHandler from 'vinext/server/fetch-handler';

interface FrontendEnv {
  REALTIME: Fetcher;
}

export default {
  async fetch(
    request: Request,
    env: FrontendEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return env.REALTIME.fetch(request);
    }
    return vinextHandler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<FrontendEnv>;
