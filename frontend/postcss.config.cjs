// postcss.config.cjs
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {
      // Tailwind v4 resolves config/content relative to this base.
      // Without it, the monorepo root can be treated as the base and
      // core theme scales (spacing/radius/etc.) may not be generated.
      base: __dirname,
    },
    autoprefixer: {},
  },
};
