export async function registerHealthzRoute(app) {
    app.get('/healthz', async (req, reply) => {
        return { status: 'ok', timestamp: new Date().toISOString() };
    });
}
