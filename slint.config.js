import react from "eslint-plugin-react";

export default [
  {
    files: ["**/*.{js,jsx}"],
    plugins: {
      react,
    },
    rules: {
      "react/jsx-no-undef": "error",
    },
  },
];
