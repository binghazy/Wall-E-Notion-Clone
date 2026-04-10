export default {
  providers: [
    {
      domain:
        process.env.CLERK_JWT_ISSUER_DOMAIN ||
        process.env.CLERK_FRONTEND_API_URL ||
        "https://faithful-teal-62.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
