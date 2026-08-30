// Production environment. Dev traffic is routed through proxy.conf.json
// instead, so apiUrl stays empty (same-origin) until a real cross-origin
// prod deploy needs it.
export const environment = {
  production: true,
  apiUrl: '',
};
