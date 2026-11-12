const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    {
        ignores: [
            "**/node_modules/**",
            "frontend/assets/**",
            "frontend/css/**",
            "backend/uploads/**",
            "coverage/**"
        ]
    },

    js.configs.recommended,

    {
        files: ["backend/**/*.js", "eslint.config.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.node
            }
        },
        rules: {
            "no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    caughtErrors: "none"
                }
            ],
            // Boot logs and script reports are intentional server-side output.
            "no-console": "off"
        }
    },

    {
        files: ["frontend/js/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                ...globals.browser,
                EDTSP: "writable"
            }
        },
        rules: {
            "no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    caughtErrors: "none"
                }
            ],
            "no-console": "off"
        }
    }
];
