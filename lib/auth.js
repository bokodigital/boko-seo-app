// Optional lightweight gate. If APP_PASSWORD is set, every API request must
// include header `x-app-password` matching it. If unset, the app is open.

export function passwordRequired() {
  return Boolean(process.env.APP_PASSWORD);
}

export function checkAuth(request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  const got = request.headers.get("x-app-password");
  return got === expected;
}
