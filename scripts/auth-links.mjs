const frontendURL = normalizeURL(process.env.SLOTBOARD_PUBLIC_APP_URL || process.env.SLOTBOARD_WEB_ORIGIN || "http://127.0.0.1:5174");
const apiURL = normalizeURL(process.env.SLOTBOARD_AUTH_BASE_URL || process.env.SLOTBOARD_API_URL || "http://127.0.0.1:3014");

const links = {
  frontend: {
    signUp: `${frontendURL}/signup`,
    signIn: `${frontendURL}/signin`,
    account: `${frontendURL}/account`,
    recoverAdminLinks: `${frontendURL}/recover`,
    createBoard: `${frontendURL}/new`,
  },
  api: {
    signUpEmail: `${apiURL}/api/auth/sign-up/email`,
    signInEmail: `${apiURL}/api/auth/sign-in/email`,
    signOut: `${apiURL}/api/auth/sign-out`,
    session: `${apiURL}/api/auth/get-session`,
    accountEvents: `${apiURL}/api/slotboard/account/events`,
  },
  railway: {
    note: "Set SLOTBOARD_PUBLIC_APP_URL and SLOTBOARD_AUTH_BASE_URL to the public app origin when the frontend proxies /api, then rerun this command.",
  },
};

console.log(JSON.stringify(links, null, 2));

function normalizeURL(value) {
  return value.replace(/\/+$/, "");
}
